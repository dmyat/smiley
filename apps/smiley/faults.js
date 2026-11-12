'use strict';
const fs = require('fs');
const path = require('path');
const { parseDtcReply, statusInfo, NRC, hex } = require('./kit/diag');
const texts = require('./fault_texts');

const unitName = (addr, ids) => texts.unitName(addr, ids);
const row = (addr, d, ids) => ({ ecu: hex(addr), unit: unitName(addr, ids), code: d.code, status: statusInfo(d.status).label, text: texts.describe(addr, d.code, ids) });

/**
 * Fault memory, in one of two scopes:
 *   'dme'  the engine unit (0x12) only, the default: stored and pending faults (status mask 0C).
 *          Mask FF listed every code the engine knows, tested or not: 430 rows on a G20 M340i
 *   'car'  every control unit at once, the way the upstream Fault Scanner asks (functional 19 02)
 * Clearing follows the scope: 14 FF FF FF to the engine unit, or to all units and then to each unit
 * with faults that did not confirm. Either way it needs a fresh read, Park and a second press.
 */
class Faults {
    constructor(link, telemetry, dataDir) {
        this.link = link; this.telemetry = telemetry; this.file = path.join(dataDir, 'last-dme-scan.json'); this.idsFile = path.join(dataDir, 'ecu-ids.json');
        this.ids = {};                // "12" -> "0F26E8": each unit's type, so its faults get the right description
        try { const j = JSON.parse(fs.readFileSync(this.idsFile, 'utf8')); if (j && typeof j === 'object') Object.keys(j).forEach((k) => { if (typeof j[k] === 'string' && /^[0-9A-F]{0,6}$/.test(j[k])) this.ids[k] = j[k]; }); } catch (e) { /* none yet */ }
        this.scope = 'dme'; this.rows = []; this.units = []; this.at = null; this.savedAt = null; this.confirmUntil = 0;
        this.note = this.idleNote(); this.load();
    }
    idleNote() { return this.scope === 'car' ? 'Press Scan car to check the whole car. It takes some time.' : 'Press Read faults to check the engine'; }
    /** The last scan, shown again after a restart. It never counts as a fresh read: clearing still needs one. */
    load() {
        try {
            const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
            if (!saved || !Array.isArray(saved.rows) || !(saved.at > 0)) return;
            const scope = saved.scope === 'car' ? 'car' : saved.ecu === '12' ? 'dme' : null;
            if (!scope) return;
            this.scope = scope;
            this.rows = saved.rows.filter((r) => r && typeof r.code === 'string' && typeof r.status === 'string' && typeof r.text === 'string')
                .map((r) => ({ ecu: typeof r.ecu === 'string' ? r.ecu : '12', unit: typeof r.unit === 'string' ? r.unit : unitName(0x12, this.ids), code: r.code, status: r.status, text: r.text })).slice(0, 400);
            this.savedAt = saved.at;
            this.note = 'Last scan: ' + new Date(saved.at).toISOString().slice(0, 16).replace('T', ' ') + ' UTC. Read again for a fresh one.';
        } catch (e) { /* no saved scan, or not readable: start empty */ }
    }
    forget() { this.rows = []; this.units = []; this.at = null; this.savedAt = null; this.confirmUntil = 0; this.note = this.idleNote(); }
    setScope(scope) { if (scope !== 'dme' && scope !== 'car' || scope === this.scope) return; this.scope = scope; this.forget(); }
    save() {
        const tmp = this.file + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify({ at: this.at, scope: this.scope, ecu: this.scope === 'dme' ? '12' : 'all', rows: this.rows }, null, 2)); fs.renameSync(tmp, this.file);
    }
    /**
     * Ask each unit with faults what type it is, once (22 F1 50, read-only, the Fault Scanner's way):
     * many codes mean different things in different units. A unit that refuses is not asked again;
     * one that stays silent is asked on the next scan. A failure here never fails the scan.
     */
    async identify(addrs) {
        if (!texts.HAS_DB) return;
        const todo = addrs.filter((a) => this.ids[hex(a)] === undefined);
        if (!todo.length) return;
        for (const a of todo) {
            try {
                const r = await this.link.diag.physical(a, 0x22, [0xF1, 0x50], 3000,
                    (u) => (u[0] === 0x62 && u[1] === 0xF1 && u[2] === 0x50) || (u[0] === 0x7F && u[1] === 0x22));
                if (!r) continue;
                this.ids[hex(a)] = r[0] === 0x62 && r.length >= 6 ? hex(((r[3] << 16) | (r[4] << 8) | r[5]) >>> 0, 6) : '';
            } catch (e) { /* described without the unit type */ }
        }
        try { const tmp = this.idsFile + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(this.ids)); fs.renameSync(tmp, this.idsFile); } catch (e) { /* asked again next time */ }
    }
    async read() {
        this.confirmUntil = 0;
        if (!this.link.available) throw new Error('Not connected to the car');
        return this.scope === 'car' ? this.readCar() : this.readDme();
    }
    async readDme() {
        const u = await this.link.diag.physical(0x12, 0x19, [0x02, 0x0C], 5000,
            (r) => (r[0] === 0x59 && r[1] === 0x02) || (r[0] === 0x7F && r[1] === 0x19));
        if (!u || u.length < 3) throw new Error('The engine did not answer in time. Try again.');
        if (u[0] === 0x7F) throw new Error('The engine refused the scan' + (NRC[u[2]] ? ': ' + NRC[u[2]] : ''));
        if ((u.length - 3) % 4 !== 0) throw new Error('Incomplete answer from the engine. Try again.');
        const p = parseDtcReply(u, [0x02, 0x0C]);
        if (!p.ok) throw new Error('The engine did not accept the scan');
        if (p.dtcs.length) await this.identify([0x12]);
        this.rows = p.dtcs.map((d) => row(0x12, d, this.ids)); this.units = [0x12];
        this.at = Date.now(); this.savedAt = null;
        this.note = this.rows.length ? this.rows.length + ' engine fault(s) found' : 'No engine faults found';
        this.save();
        return this.rows;
    }
    /** Every unit at once: stored and pending faults (status mask 0C, the Fault Scanner's default). */
    async readCar() {
        const params = [0x02, 0x0C];
        const replies = await this.link.diag.functional(0x19, params);
        if (!replies || !replies.size) throw new Error('The car did not answer. Is the ignition on?');
        const units = [], refused = [];
        replies.forEach((uds, addr) => {
            const p = parseDtcReply(uds, params);
            if (!p.ok) { refused.push(addr); return; }
            units.push({ addr, dtcs: p.dtcs });
        });
        if (!units.length) throw new Error('No module accepted the scan');
        units.sort((a, b) => b.dtcs.length - a.dtcs.length || a.addr - b.addr);
        await this.identify(units.filter((u) => u.dtcs.length).map((u) => u.addr));
        this.rows = []; units.forEach((u) => u.dtcs.forEach((d) => this.rows.push(row(u.addr, d, this.ids))));
        this.units = units.map((u) => u.addr);
        this.at = Date.now(); this.savedAt = null;
        const withFaults = units.filter((u) => u.dtcs.length).length;
        this.note = 'Checked ' + units.length + ' modules: ' + (this.rows.length ? this.rows.length + ' fault(s) in ' + withFaults + ' module(s)' : 'no faults found')
            + (refused.length ? ' - ' + refused.length + ' would not be scanned' : '');
        this.save();
        return this.rows;
    }
    /** The units a clear would reach: the engine unit, or every unit that has faults. */
    targets() { return this.scope === 'car' ? Array.from(new Set(this.rows.map((r) => parseInt(r.ecu, 16)))) : [0x12]; }
    confirm(now) {
        if (!this.at || Date.now() - this.at > 60000) throw new Error(this.scope === 'car' ? 'Scan again first, then clear' : 'Read the faults again first, then clear');
        if (!this.telemetry.parked()) throw new Error('Put the car in Park and stop before clearing');
        if (this.scope === 'car' && !this.rows.length) throw new Error('Nothing to clear');
        if (now < this.confirmUntil) { this.confirmUntil = 0; return true; }
        this.confirmUntil = now + 5000;
        this.note = this.scope === 'car' ? 'Clear faults in ' + this.targets().length + ' module(s)? Press Clear again within 5 seconds.' : 'Clear engine faults? Press Clear again within 5 seconds.';
        return false;
    }
    cancelConfirm() { this.confirmUntil = 0; }
    async clear() {
        // Recheck immediately before the write, after any in-flight read has drained.
        if (!this.telemetry.parked()) throw new Error('Not cleared: the car is no longer in Park and stopped');
        return this.scope === 'car' ? this.clearCar() : this.clearDme();
    }
    async clearDme() {
        const r = await this.link.sendToDme(0x14, [0xFF, 0xFF, 0xFF], 5000);
        if (!r.ok || r.sid !== 0x54) throw new Error('The engine did not confirm the clear' + (r.reason ? ': ' + r.reason : ''));
        this.note = 'Cleared. Reading again...';
        await this.readDme();
        this.note = this.rows.length ? this.rows.length + ' fault(s) are still there or came back' : 'Cleared. No engine faults now.';
    }
    /**
     * First to every unit at once, as a workshop tester clears; then each unit with faults that did not
     * confirm is asked itself, twice at most. No diagnostic session is changed: a unit that refuses in
     * the default session (some do with the engine running) is named and left as it is.
     */
    async clearCar() {
        const targets = this.targets(), failed = [];
        let all = new Map();
        try { all = await this.link.diag.functional(0x14, [0xFF, 0xFF, 0xFF], { idleMs: 5000 }); } catch (e) { /* the per-unit pass below still runs */ }
        const accept = (u) => u[0] === 0x54 || (u[0] === 0x7F && u[1] === 0x14);
        for (const addr of targets) {
            const first = all.get(addr);
            if (first && first[0] === 0x54) continue;
            let r = await this.link.diag.physical(addr, 0x14, [0xFF, 0xFF, 0xFF], 8000, accept);
            if (!r) r = await this.link.diag.physical(addr, 0x14, [0xFF, 0xFF, 0xFF], 8000, accept);
            if (!r || r[0] !== 0x54) failed.push(unitName(addr, this.ids) + ': ' + (!r ? 'no answer' : NRC[r[2]] || 'NRC ' + hex(r[2])));
        }
        await this.readCar();
        this.note = 'Cleared ' + (targets.length - failed.length) + ' of ' + targets.length + ' module(s)'
            + (failed.length ? ' - not cleared: ' + failed.slice(0, 3).join('; ') + (failed.length > 3 ? ' ...' : '') : '')
            + (this.rows.length ? ' - ' + this.rows.length + ' fault(s) still there' : '');
    }
}
module.exports = { Faults, unitName };
