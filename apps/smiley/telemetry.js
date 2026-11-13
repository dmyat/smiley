'use strict';
// Scaling and DID candidates derived from upstream car.js, M Vitals and Live Data.
const { DidReader } = require('./kit/dids');
const { split } = require('./kit/sgbd');
const Car = require('./kit/car');
const Sim = require('./kit/sim');
const fs = require('fs');
const path = require('path');
// Every dial's scale follows the car: the lowest and highest value each channel has reached on
// this car is remembered (data/ranges.json), so each engine gets dials that fit what it does.
const LEARN_KEYS = ['rpm', 'boost', 'oil', 'coolant', 'iat', 'hpfp', 'stft1', 'stft2', 'timing', 'lambda', 'lpfp', 'oilp', 'boostTarget', 'load', 'torque'];
const num = (x) => typeof x === 'number' && isFinite(x);
// gear field of statusGearboxDrive, names or wire numbers (G1 = 3 ... G10 = 12, R = 1, N_OR_P = 2), as kit/car.js reads it
const GEARS = { G1: 1, G2: 2, G3: 3, G4: 4, G5: 5, G6: 6, G7: 7, G8: 8, G9: 9, G10: 10, R: -1, N_OR_P: 0 };
// VehicleCondition.statusConditionVehicle, names or wire numbers (kit/car.js): 5 living, 7 ignition on, 8 / 10 drive-ready
const CONDITIONS = { PARKEN_BN_NIO: 1, PARKEN_BN_IO: 2, STANDFUNKTIONEN_KUNDE_NICHT_IM_FZG: 3, WOHNEN: 5,
    PRUEFEN_ANALYSE_DIAGNOSE: 7, FAHRBEREITSCHAFT_HERSTELLEN: 8, FAHREN: 10, FAHRBEREITSCHAFT_BEENDEN: 12 };
const conditionOf = (x) => { const n = typeof x === 'number' ? x : CONDITIONS[x]; return n >= 1 && n <= 12 ? n : undefined; };
const gearOf = (x) => (typeof x === 'number' ? (x >= 3 && x <= 12 ? x - 2 : x === 1 ? -1 : x === 2 ? 0 : undefined) : GEARS[x]);
const PEAK_KEYS = ['rpm', 'boost', 'oil', 'coolant', 'iat', 'hpfp', 'stft1', 'stft2', 'timing', 'lambda', 'lpfp', 'oilp', 'boostTarget', 'load', 'torque'];
// Read as fast as the engine unit answers: the gauges of the page on screen every turn, the rest about once a second.
const QUICK = ['boost', 'hpfp', 'timing', 'lambda', 'boostTarget', 'load', 'lpfp', 'oilp'];      // the ones that move fast enough to be worth it
const SLOW_MS = 1000;
const STANDARD_BARO = 101.3;      // kPa, used for boost until the car reports its outside air pressure
const RETRY_MS = 2000;           // a reading that has worked before is asked again this soon after it fails
const GAP_MS = 25;
const BATCH_MAX = 8;                 // identifiers in one request, as the kit's own link allows
const BATCH_GIVE_UP = 3;             // batches that do not add up before the session goes back to one at a time
/** A value out of a one-identifier reply (62 hi lo data...), scaled as kit/dids.js read() does; null when it does not fit. */
function decodeDid(c, uds) {
    const at = 3 + (c.at || 0), n = c.bytes || 1;
    if (uds.length < at + n) return null;
    let raw = 0;
    for (let i = 0; i < n; i++) raw = raw * 256 + uds[at + i];
    if (c.signed && raw >= Math.pow(2, 8 * n - 1)) raw -= Math.pow(2, 8 * n);
    if (c.bit != null) raw = (raw >> c.bit) & 1;
    const v = raw * (c.factor == null ? 1 : c.factor) + (c.offset || 0);
    return (c.min != null && v < c.min) || (c.max != null && v > c.max) ? null : v;
}
class Telemetry {
    constructor(ctx, session, clock) {
        this.ctx = ctx; this.session = session; this.clock = clock || Date.now;
        this.values = {}; this.times = {}; this.fail = {}; this.next = {}; this.answered = {};
        this.reader = null; this.link = null; this.index = 0; this.quickTurn = 0;
        this.batch = {}; this.batchFails = 0; this.batchOff = false; this.batched = 0;          // see pollBatch()
        this.focus = null;           // the gauges on screen (ids), read fastest: setFocus()
        // selector position per source: 'P' | 'R' | 'N' | 'D', or null when that source cannot tell
        this.stages = {};
        this.keys = ['boost', 'iat', 'hpfp', 'stft1', 'stft2', 'baro', 'oil', 'timing', 'lambda', 'lpfp', 'oilp', 'boostTarget', 'load', 'misfire'];
        this.peaks = {};             // channel -> { min, max } since Reset peaks
        this.learned = {}; this.learnedDirty = false; this.learnedSaved = 0;
        this.rangeFile = ctx.dataDir ? path.join(ctx.dataDir, 'ranges.json') : null;
        try {
            const saved = this.rangeFile ? JSON.parse(fs.readFileSync(this.rangeFile, 'utf8')) : {};
            LEARN_KEYS.forEach((k) => { const r = saved && saved[k]; if (r && num(r.min) && num(r.max) && r.min <= r.max) this.learned[k] = { min: r.min, max: r.max }; });
        } catch (e) { /* nothing learned yet */ }
        // The drive feed for the performance tools and the shift lights: every speed, engine speed
        // and acceleration sample as it arrives. SMILEY opens each vehicle interface once (here), the
        // way the upstream apps merge their handlers into one subscription per interface.
        this.live = {}; this.listeners = []; this.demoFeed = false; this.sim = new Sim(); this.simData = this.sim.sample(); this.simTimer = null;
        this.misMode = null;         // misfire counters: false = OBD service 06, true = UDS F6xx, null = not found yet
        this.misfires = null;        // counts per cylinder, this driving cycle
        this.cfg = ctx.spec.config.dme;
    }
    put(k, v) { if (typeof v === 'number' && isFinite(v)) { this.values[k] = v; this.times[k] = this.clock(); } }
    /** fn(sample, tMs) for every drive sample; reset() when the source switches between the car and the demo drive. */
    onSample(fn, reset) { this.listeners.push({ fn, reset }); }
    drive(k, v) {
        if (typeof v !== 'number' || !isFinite(v)) { delete this.live[k]; return; }
        this.live[k] = v;
        if (!this.demoFeed && (k === 'rpm' || k === 'speed' || k === 'gLong')) this.emit(Object.assign({}, this.live, { demo: false }), Date.now());
    }
    emit(d, t) { this.listeners.forEach((l) => { try { l.fn(d, t); } catch (e) { this.ctx.log.warn('sample: ' + e); } }); }
    /** Demo data on: the kit's simulated drive (20 samples a second) instead of the car. */
    setDemo(on) {
        on = !!on;
        if (on !== this.demoFeed) { this.demoFeed = on; this.listeners.forEach((l) => l.reset && l.reset()); }
        if (on && !this.simTimer) {
            this.simTimer = setInterval(() => { if (!this.demoFeed) return; const now = Date.now(); this.simData = this.sim.sample(now); this.emit(Object.assign({}, this.simData, { demo: true }), now); }, 50);
            if (this.simTimer.unref) this.simTimer.unref();
        }
    }
    /** The newest drive values: { rpm, speed (km/h), gLong, gLat (g), gear, stage, torque, condition, demo }. */
    data() { return this.demoFeed ? Object.assign({}, this.simData, { demo: true }) : Object.assign({}, this.live, { stage: this.stage, demo: false }); }
    fresh(k, age) { return this.times[k] != null && this.clock() - this.times[k] <= (age || 5000) ? this.values[k] : null; }
    scaled(k, raw, factor, offset, invalid) {
        if (typeof raw !== 'number' || !isFinite(raw) || raw < 0 || raw >= invalid) { delete this.times[k]; return; }
        this.put(k, raw * factor + offset);
    }
    accel(k, raw) { this.drive(k, typeof raw === 'number' && isFinite(raw) && raw >= 0 && raw < 65535 ? (raw * 0.002 - 65) / 9.80665 : null); }
    async start(link) {
        this.link = link; this.reader = new DidReader(link.diag, { ecu: 0x12 });
        // A car standing still does not notify values that do not change (kit/parked.js), so the
        // fields with a getter are also re-read: a steady oil temperature or a speed of 0 stays live.
        const watch = (iface, handlers, pollMs) => this.ctx.signals.watch(iface, '1', handlers, this.ctx.log, pollMs ? { pollMs } : undefined);
        const stage = (source, s) => { this.stages[source] = s || null; };
        await Promise.all([
            watch('de.bmw.infotainment.vehicle.CDS', {
                statusEngineSpeed2: (s) => { this.scaled('rpm', s && s.actualValueRPMEngineCrankshaft, 0.25, 0, 65535); this.drive('rpm', this.fresh('rpm', 3000)); },
                statusEngineTemperature: (s) => {
                    this.scaled('coolant', s && s.temperatureEngineDrive, 1, -48, 255);
                    this.scaled('oil', s && s.temperatureEngineOilDrive, 1, -48, 255);
                },
            }, 1000),
            watch('de.bmw.infotainment.vehicle.Vehicle2', {
                statusCarSpeed2: (s) => { this.scaled('speed', s && s.speedVehicleCentreOfGravity, 0.015625, 0, 65535); this.drive('speed', this.fresh('speed')); },
            }, 2000),
            // crankshaft torque, as kit/car.js scales it (negative = engine braking, shown as 0)
            watch('de.bmw.infotainment.drivingexcitement.FES', {
                statusActualValueTorque2: (s) => {
                    const raw = s && s.actualValueTorqueCrankshaft;
                    if (typeof raw !== 'number' || !isFinite(raw) || raw < 0 || raw >= 4095) { delete this.times.torque; delete this.live.torque; return; }
                    this.put('torque', Math.max(0, raw * 0.5 - 1023.5)); this.live.torque = this.values.torque;
                },
            }, 1000),
            watch('de.bmw.infrastructure.VehicleCondition', {
                VehicleCondition: (s) => { const n = conditionOf(s && s.statusConditionVehicle); if (n !== undefined) this.live.condition = n; },
            }),
            // longitudinal / lateral acceleration at the centre of gravity, in g (kit/car.js scaling)
            watch('de.bmw.infotainment.vehicle.CDS2', {
                statusLongitudinalAccelerationMassCenter: (s) => this.accel('gLong', s && s.longitudinalAccelerationCentreOfGravity),
                statusLateralAccelerationMassCenter: (s) => this.accel('gLat', s && s.lateralAccelerationCentreOfGravity),
            }),
            watch('de.bmw.infrastructure.VehicleInformation', {
                statusGearboxDrive: (s) => {
                    stage('gearbox', ({ P: 'P', R: 'R', N: 'N', D: 'D', 1: 'P', 2: 'R', 3: 'N', 4: 'D' })[(s || {}).statusActualStageDrive]);
                    const g = gearOf((s || {}).statusActualGearDrive); if (g !== undefined) this.live.gear = g;
                },
                DataPowerTrain2: (s) => { const v = Car.selectionOf((s || {}).statusGearSelectionDrive); stage('powertrain', v && v.stage); if (v) this.live.gear = v.gear; },
            }),
        ]);
    }
    /**
     * The selector position. The two sources arrive in different event groups and some cars send
     * only one; the powertrain one also has a value that does not tell N from P. So: any source
     * that says R, N or D wins, 'P' needs a source that says P, and a source that cannot tell
     * neither confirms nor overrules. The selector is only notified when it moves, so the last
     * position counts however old it is; the speed below is what proves the data is live.
     */
    get stage() {
        const known = Object.keys(this.stages).map((k) => this.stages[k]).filter(Boolean);
        const moving = known.find((s) => s !== 'P');
        return moving || (known.length ? 'P' : null);
    }
    /** Fails closed: a live speed under 1 km/h (re-read every 2 s) and the selector in P. */
    parked() { const speed = this.fresh('speed'); return speed !== null && speed < 1 && this.stage === 'P'; }
    async poll() {
        if (!this.reader || !this.link.available) return;
        const now = this.clock(), fast = this.focus || [];
        // never back to back: at least 25 ms between two requests, as the kit's own read-only link paces them
        if (now - (this.lastAsk || 0) < GAP_MS) return;
        const due = (k) => (this.next[k] || 0) <= now && !(k === 'oil' && this.fresh('oil') !== null);
        const slow = this.keys.filter((k) => fast.indexOf(k) < 0 && due(k)).sort((a, b) => (this.next[a] || 0) - (this.next[b] || 0))[0];
        const quick = fast.filter(due);
        this.index++;
        // two fast reads, then one of the others that is due
        // The fast gauges take turns on a counter of their own. Sharing the counter that hands every
        // third turn to the others left one fast gauge without a turn whenever three were on screen
        // (on the default first page that was the boost).
        const slowTurn = slow && (this.index % 3 === 0 || !quick.length);
        const done = () => { this.lastAsk = this.clock(); };
        // the gauges on screen that have each answered on their own go out together in one request
        const together = slowTurn || this.batchOff ? [] : this.batchable(quick);
        // (a gauge that has not answered alone yet, or cannot go in a batch, still gets every other turn)
        const alone = together.length >= 2 ? quick.filter((q) => together.indexOf(q) < 0) : quick;
        if (together.length >= 2 && !(alone.length && this.index % 2 === 0)) return this.session.poll(() => this.pollBatch(together).then(done, done));
        const k = slowTurn ? slow : alone.length ? alone[this.quickTurn++ % alone.length] : null;
        if (!k) return;
        if (k === 'misfire') return this.session.poll(() => this.readMisfire().then(done, done));
        return this.session.poll(async () => {
            let candidates = (this.cfg[k] || []).map((c) => Object.assign({}, c, { timeoutMs: 900 }));
            // A reading that has answered on this car is asked the way that worked, not through every
            // alternative again: one slow reply under load must not hold up the other gauges for seconds.
            const picks = this.reader.pick, at = picks && this.answered[k] && (this.fail[k] || 0) < 5 ? picks[k] || 0 : -1;
            if (at >= 0 && candidates[at]) candidates = [candidates[at]];
            const v = await this.reader.value(k, candidates);
            if (at >= 0 && picks) picks[k] = at;       // value() counted within the short list: keep the place in the full one
            if (v !== null) { this.learnBatch(k); this.put(k, v); this.fail[k] = 0; this.answered[k] = true; this.next[k] = k === 'baro' ? this.clock() + 60000 : fast.indexOf(k) >= 0 ? 0 : this.clock() + SLOW_MS; }
            else {
                this.fail[k] = (this.fail[k] || 0) + 1;
                // Only a reading this car has never answered is left alone for 30 s. One that has answered
                // (or the outside air pressure, which the boost gauge waits for) is asked again soon.
                if (this.fail[k] >= 2) this.next[k] = this.clock() + (this.answered[k] || k === 'baro' ? RETRY_MS : 30000);
            }
            done();
        });
    }
    /*
     * Smoother gauges: several identifiers in one request. Asked one at a time, six gauges on screen
     * take six round trips for one update of each; asked together they take one, so each gauge is
     * refreshed several times as often. A gauge joins only after it has answered on its own (that
     * shows which identifier works on this car and how long its data is), and the engine computer's
     * reply is taken apart by those lengths. A reply that does not add up counts against batching;
     * after three in a row the session goes back to one at a time, exactly as before.
     */
    learnBatch(k) {
        const list = this.cfg && this.cfg[k], picks = this.reader && this.reader.pick, c = list && picks && list[picks[k] || 0];
        if (!c || c.obd || !c.did || (c.ecu != null && c.ecu !== 0x12) || !this.reader.raws || !this.reader.key) return;
        const raw = this.reader.raws[this.reader.key(c)];
        if (!raw || !raw.ok || !raw.bytes) return;
        const len = raw.bytes.split(' ').length - 3;
        if (len > 0) this.batch[k] = { c, did: parseInt(c.did, 16), len };
    }
    batchable(keys) {
        const diag = this.link && this.link.diag, seen = {}, out = [];
        if (!diag || typeof diag.physical !== 'function') return out;
        keys.forEach((k) => { const b = this.batch[k]; if (b && !seen[b.did] && out.length < BATCH_MAX) { seen[b.did] = 1; out.push(k); } });
        return out;
    }
    async pollBatch(keys) {
        const dids = keys.map((k) => this.batch[k].did), data = [], lens = {};
        keys.forEach((k) => { const b = this.batch[k]; data.push(b.did >> 8, b.did & 0xFF); lens[b.did] = b.len; });
        let reply = null;
        try { reply = await this.link.diag.physical(0x12, 0x22, data, 900, (u) => (u[0] === 0x62 && dids.indexOf((u[1] << 8) | u[2]) >= 0) || (u[0] === 0x7F && u[1] === 0x22)); } catch (e) { reply = null; }
        const parts = reply && reply[0] === 0x62 ? split(reply, lens) : null;
        if (!parts) {
            if (++this.batchFails >= BATCH_GIVE_UP) { this.batchOff = true; this.ctx.log.info('gauges: reading several at once is not answered on this car - back to one at a time'); }
            return;
        }
        this.batchFails = 0; this.batched++;
        keys.forEach((k) => {
            const b = this.batch[k], u = parts[b.did];
            if (!u) { delete this.batch[k]; return; }                 // left out of the reply: on its own from now on
            const v = decodeDid(b.c, u);
            if (v !== null) { this.put(k, v); this.fail[k] = 0; this.next[k] = 0; }
        });
    }
    /**
     * Misfires per cylinder in this driving cycle: OBD service 06 monitor results, monitor A2 =
     * cylinder 1 (test 0C), or the same over UDS 22 F6xx on engine units that only speak UDS. As
     * kit/dids.js and M Vitals read them. Asked every 10 s; a unit that has neither is asked again
     * after 5 minutes.
     */
    async readMisfire() {
        const rd = this.reader, later = (ms) => { this.next.misfire = this.clock() + ms; };
        if (this.misMode === null) {
            if (await rd.monitor(0x12, 0xA2, false)) this.misMode = false;
            else if (await rd.monitor(0x12, 0xA2, true)) this.misMode = true;
            else { later(300000); return; }
        }
        const counts = [];
        for (let c = 0; c < 6; c++) {
            const res = await rd.monitor(0x12, 0xA2 + c, this.misMode);
            if (!res) { if (!c) { later(30000); return; } break; }
            const tr = res.find((x) => x.tid === 0x0C) || res[0];
            counts.push(tr.value >= 65535 ? null : tr.value);
        }
        this.misfires = counts;
        if (counts.every((n) => n !== null)) this.put('misfire', counts.reduce((a, n) => a + n, 0));
        later(10000);
    }
    /** Reset min / max: the session's lowest and highest, and the dial scales learned from this car. */
    /** The gauges now on screen (or null): the fast-moving ones among them are read every turn. */
    setFocus(ids) { this.focus = ids ? ids.filter((k) => QUICK.indexOf(k) >= 0) : null; }
    resetPeaks() { this.peaks = {}; this.learned = {}; this.learnedDirty = true; this.saveLearned(true); }
    /** Real readings only: the lowest and highest each channel has reached on this car. */
    learn(v) {
        LEARN_KEYS.forEach((k) => {
            const n = v[k]; if (!num(n)) return;
            const r = this.learned[k];
            if (!r) { this.learned[k] = { min: n, max: n }; this.learnedDirty = true; return; }
            if (n < r.min) { r.min = n; this.learnedDirty = true; }
            if (n > r.max) { r.max = n; this.learnedDirty = true; }
        });
        v.learned = this.learned;
        this.saveLearned(false);
    }
    /** Written at most every 30 seconds, and only when something grew. */
    saveLearned(now) {
        if (!this.rangeFile || !this.learnedDirty || (!now && this.clock() - this.learnedSaved < 30000)) return;
        this.learnedDirty = false; this.learnedSaved = this.clock();
        try { const tmp = this.rangeFile + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(this.learned)); fs.renameSync(tmp, this.rangeFile); } catch (e) { this.ctx.log.warn('ranges: ' + e); }
    }
    track(v) {
        PEAK_KEYS.forEach((k) => {
            const n = v[k]; if (typeof n !== 'number' || !isFinite(n)) return;
            const p = this.peaks[k] || (this.peaks[k] = { min: n, max: n });
            if (n < p.min) p.min = n; if (n > p.max) p.max = n;
        });
        v.peaks = this.peaks;
        return v;
    }
    snapshot(demo) {
        if (demo) {
            const x = this.clock() / 1000, s = Math.sin(x);
            return this.track({ demo: true, rpm: 2500 + s * 1400, boost: 0.8 + s * 0.7,
                oil: 101, coolant: 94, iat: 33, hpfp: 180 + s * 40, stft1: s * 2.5, stft2: null,
                timing: 8 - s * 6, lambda: 0.92 - s * 0.08, lpfp: 5.4 + s * 0.3, oilp: 3.6 + s * 1.2,
                boostTarget: 0.85 + s * 0.7, load: 95 + s * 60, torque: 300 + s * 180, misfire: 0, misfires: [0, 0, 0, 0, 0, 0] });
        }
        const v = { demo: false };
        ['rpm', 'oil', 'coolant', 'iat', 'hpfp', 'stft1', 'stft2'].forEach((k) => { v[k] = this.fresh(k, k === 'rpm' ? 3000 : 15000); });
        // The outside air pressure hardly moves during a drive: once read, the last value is kept for
        // the session, so one missed re-read does not blank the boost, boost target and oil pressure.
        // Until the car has answered it, the standard sea-level pressure stands in (as the kit's HUD
        // does), so the gauges show at once; up high they read a little high until the real value arrives.
        const abs = this.fresh('boost', 5000), baroRead = num(this.values.baro), baro = baroRead ? this.values.baro : STANDARD_BARO;
        v.boost = abs !== null && baro !== null ? (abs - baro) / 100 : null;
        v.boostMissingBaro = abs !== null && !baroRead;      // shown, but against the standard pressure
        ['timing', 'lambda', 'lpfp', 'load'].forEach((k) => { v[k] = this.fresh(k, 15000); });
        v.torque = this.fresh('torque', 3000);
        // the oil pressure and the boost setpoint are read absolute, like the boost: shown over ambient
        const oilAbs = this.fresh('oilp', 15000), targetAbs = this.fresh('boostTarget', 15000);
        v.oilp = oilAbs !== null && baro !== null ? Math.max(0, oilAbs - baro / 100) : null;
        v.boostTarget = targetAbs !== null && baro !== null ? (targetAbs - baro) / 100 : null;
        v.misfire = this.fresh('misfire', 60000); v.misfires = v.misfire === null ? null : this.misfires;
        this.learn(v);
        return this.track(v);
    }
}
module.exports = { Telemetry };
