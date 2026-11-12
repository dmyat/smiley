'use strict';
// Generic UDS workflow, only reachable with an in-source programming adapter.
// This is not an ECU unlocker, calibration editor, checksum fixer or MHD client.
const fs = require('fs'), path = require('path');
const { positive, integer } = require('./flash-transport');
const { hash, matchIdentity } = require('./flash-files');
function bytes(v, name) {
    if (!Array.isArray(v) || !v.length || v.length > 4096 || v.some((b) => !Number.isInteger(b) || b < 0 || b > 255)) throw Error('Invalid ' + name);
    return Buffer.from(v);
}
function conditions(v, now) {
    if (!v || !Number.isFinite(v.at) || now < v.at || now - v.at > 3000) throw Error('Fresh vehicle conditions are required');
    if (v.speed !== 0 || v.rpm !== 0 || v.gear !== 'P' || v.ignition !== true) throw Error('Park, engine off and ignition on are required');
    if (!Number.isFinite(v.voltage) || !Number.isFinite(v.minVoltage) || !Number.isFinite(v.maxVoltage) ||
        v.minVoltage < 12 || v.maxVoltage > 16 || v.minVoltage >= v.maxVoltage || v.voltage < v.minVoltage || v.voltage > v.maxVoltage)
        throw Error('Supply voltage is outside the validated programming range');
}
function validatePlan(p, length) {
    if (!p) throw Error('No programming plan');
    integer(p.address, 0, 0xffffffff, 'calibration address');
    integer(p.length, 1, 16 * 1024 * 1024, 'calibration length');
    if (p.length !== length || p.address + p.length > 0x100000000) throw Error('Calibration region does not match the file');
    integer(p.blockSize, 1, 65533, 'block size'); integer(p.session, 1, 0x7f, 'programming session');
    for (const name of ['erase', 'verify', 'reset']) {
        const step = p[name] || {}, req = bytes(step.request, name + ' request'), expected = bytes(step.response, name + ' response');
        if (name === 'reset') {
            if (req.length !== 2 || req[0] !== 0x11 || req[1] > 0x7f || expected[0] !== 0x51 || expected[1] !== req[1]) throw Error('Invalid reset plan');
        } else if (req.length < 4 || req[0] !== 0x31 || req[1] !== 1 || expected.length < 5 || expected[0] !== 0x71 ||
            !expected.slice(1, 4).equals(req.slice(1, 4))) throw Error('Invalid ' + name + ' routine plan');
    }
    return p;
}
class Journal {
    constructor(dir) { this.dir = path.join(dir, 'flash'); this.file = path.join(this.dir, 'last-run.json'); }
    read() {
        try { const r=JSON.parse(fs.readFileSync(this.file, 'utf8'));return r&&r.schema===1&&typeof r.incomplete==='boolean'?r:{incomplete:true,phase:'Unrecognized flash record'}; }
        catch (e) { if (e.code === 'ENOENT') return null; return { incomplete: true, phase: 'Unreadable flash record' }; }
    }
    write(value) {
        if(!fs.existsSync(this.dir))fs.mkdirSync(this.dir);
        const tmp = this.file + '.tmp', fd = fs.openSync(tmp, 'w', 0o600);
        try { fs.writeSync(fd, JSON.stringify(value, null, 2) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
        fs.renameSync(tmp, this.file);
        const dir = fs.openSync(this.dir, 'r'); try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
    }
}
async function runFlash(o) {
    const b = o.bundle, a = b && b.adapter, t = o.transport;
    if (!b || !a || !t || !t.active) throw Error('Connect and load a supported calibration first');
    for(const method of ['validateImage','plan','readConditions','authorize','afterReset'])if(typeof a[method]!=='function')throw Error('Programming adapter is incomplete: '+method);
    if (b.simulation !== (t.simulation === true)) throw Error('Simulation cannot use a real connection');
    if (!b.simulation && a.liveValidated !== true) throw Error('This programming adapter has not been validated on hardware');
    if (!o.powerConfirmed) throw Error('Confirm the programming power supply first');
    if (!matchIdentity(b.profile.expected, o.identity)) throw Error('Calibration does not match this ECU');
    if (t.config.ecuAddress !== b.profile.ecuAddress) throw Error('Connected ECU address does not match the profile');
    if (hash(b.data) !== b.hash) throw Error('Calibration changed after loading');
    if (!b.simulation && (!o.journal || (o.journal.read() || {}).incomplete)) throw Error('Previous programming attempt needs recovery review');
    const send = (r) => t.request(r);
    if (await a.validateImage(b.data, b.profile) !== true) throw Error('ECU-specific checksum/signature validation failed');
    const p = validatePlan(await a.plan(b.data, b.profile), b.data.length);
    const before = await o.identify();
    if (!matchIdentity(b.profile.expected, before)) throw Error('ECU identity changed before programming');
    conditions(await a.readConditions(send), Date.now());
    if (o.isStillAuthorized && !o.isStillAuthorized()) throw Error('Programming confirmation expired');
    let record = { schema: 1, incomplete: true, phase: 'Starting', at: new Date().toISOString(), sha256: b.hash, ecuAddress: t.config.ecuAddress };
    const note = (phase, percent) => { record.phase = phase; if (!b.simulation) o.journal.write(record); o.progress({ phase, percent }); };
    const exact = async (step) => {
        const r = await send(step.request); positive(r, step.request[0]);
        if (!Buffer.from(r).equals(Buffer.from(step.response))) throw Error('ECU did not confirm the expected routine result');
    };
    try {
        note('Programming session', 2);
        const response = positive(await send([0x10, p.session]), 0x10, [p.session]);
        if (response.length !== 6) throw Error('Invalid programming-session timing response');
        // Session timing is honored within bounded request and total deadlines.
        const p2 = response.readUInt16BE(2), p2star = response.readUInt16BE(4) * 10;
        if (p2 < 1 || p2star < p2 || p2star > 120000) throw Error('Invalid ECU session timings');
        if ('timeout' in t) { t.timeout = Math.max(t.timeout, p2); t.pendingTimeout = Math.max(t.pendingTimeout, p2star); }
        note('Security access', 5);
        if (await a.authorize(send, b.profile) !== true) throw Error('ECU programming access was not confirmed');
        // Precondition queries are adapter-specific; never use stale dashboard values.
        conditions(await a.readConditions(send), Date.now());
        note('Erasing calibration', 8); await exact(p.erase);
        note('Opening download', 10);
        const dl = Buffer.alloc(11); dl[0] = 0x34; dl[1] = 0; dl[2] = 0x44; dl.writeUInt32BE(p.address, 3); dl.writeUInt32BE(p.length, 7);
        const reply = positive(await send(dl), 0x34), n = reply[1] >> 4;
        if (n < 1 || n > 4 || (reply[1] & 15) !== 0 || reply.length !== n + 2) throw Error('Malformed download block limit');
        let limit = 0; for (let i = 2; i < reply.length; i++) limit = limit * 256 + reply[i];
        if (limit < 3 || limit > 65535) throw Error('Invalid download block size');
        const size = Math.min(limit - 2, p.blockSize); let seq = 1;
        for (let offset = 0; offset < b.data.length; offset += size) {
            const chunk = b.data.slice(offset, offset + size);
            positive(await send(Buffer.concat([Buffer.from([0x36, seq]), chunk])), 0x36, [seq], 2);
            seq = (seq + 1) & 255;
            // Progress is acknowledged bytes, not a timer or sent bytes.
            o.progress({ phase: 'Writing calibration', percent: 10 + Math.floor(75 * Math.min(offset + chunk.length, b.data.length) / b.data.length) });
        }
        note('Closing transfer', 86); positive(await send([0x37]), 0x37, [], 1);
        note('Verifying calibration', 90); await exact(p.verify);
        note('Restarting ECU', 95); await exact(p.reset);
        note('Checking ECU after restart', 98);
        if (await a.afterReset(o, b) !== true) throw Error('ECU restart/read-back was not confirmed');
        record.incomplete = false; note('Complete', 100);
        return { ok: true, simulated: b.simulation };
    } catch (e) {
        record.incomplete = true; record.error = String(e.message || e);
        if (!b.simulation) { try { o.journal.write(record); } catch (_) { /* the pre-write journal remains incomplete */ } }
        throw e; // Never reset, retry or resume background traffic after a failed write.
    }
}
module.exports = { runFlash, Journal, conditions, validatePlan };
