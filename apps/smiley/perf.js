'use strict';
/**
 * perf.js - SMILEY's performance tools, on one stream of car samples (telemetry.js's drive feed):
 *
 *   drag   acceleration timer: kit/run_timer.js, the upstream Drag Timer's own (launch, splits,
 *          one-foot rollout, quarter mile)
 *   g      friction circle with a trail and the peaks in each direction (upstream G-Force)
 *   dyno   power and torque from a full-throttle pull in one gear (upstream Virtual Dyno's maths:
 *          m*a*v + air drag + rolling resistance, over the drivetrain loss)
 *   brake  stopping distance from 60 / 100 mph or 100 / 200 km/h (upstream Brake Test's
 *          measurement, with the crossing placed between speed samples by the deceleration)
 *
 * All four listen all the time, whichever is on screen: a launch, a pull or a stop is caught
 * when it happens. Everything here only reads. Results are kept in data/perf.json; demo runs are
 * shown and never saved.
 */
const fs = require('fs');
const path = require('path');
const { RunTimer } = require('./kit/run_timer');

const MPH = 1.609344, G0 = 9.80665;
const isNum = (x) => typeof x === 'number' && isFinite(x);
const MODES = ['drag', 'g', 'dyno', 'brake'];

const DRAG_SPLITS = {
    kmh: [{ key: '0-100', label: '0-100 km/h', from: 0, to: 100 }, { key: '100-200', label: '100-200 km/h', from: 100, to: 200 }],
    mph: [{ key: '0-60mph', label: '0-60 mph', from: 0, to: 60 * MPH }, { key: '60-130mph', label: '60-130 mph', from: 60 * MPH, to: 130 * MPH }],
};
const QUARTER = { key: 'qm', label: '1/4 mile', dist: 402.336 };
const BRAKE_TESTS = {
    kmh: [{ key: '200-0', label: '200-0 km/h', v: 200 }, { key: '100-0', label: '100-0 km/h', v: 100 }],
    mph: [{ key: '100-0mph', label: '100-0 mph', v: 100 * MPH }, { key: '60-0mph', label: '60-0 mph', v: 60 * MPH }],
};
const BIN = 100, MIN_SPAN = 1500, RHO = 1.2, CRR = 0.013;
const CDA = { sedan: 0.62, wagon: 0.72, suv: 0.95 };
const ENV_HOLD_MS = 1500;           // the outline holds its shape this long after the dot was last out there...
const ENV_FADE_MS = 1800;           // ...then shrinks back towards the middle (to about a third every this long)
const SECTORS = 24;                // directions of the G-meter's envelope (15 degrees each, 0 = straight ahead)
const BRAKE_TRIGGER_G = 0.4;        // counts as hard braking (the Brake Test's default)

class Perf {
    /** car: { onSample(fn, reset), data() } - the telemetry's drive feed; get(key): the app's settings. */
    constructor(car, get, dataDir, log) {
        this.car = car; this.get = get; this.log = log || { info() {}, warn() {} };
        this.file = path.join(dataDir, 'perf.json');
        this.saved = { drag: { best: {}, runs: [] }, brake: { best: {}, runs: [] }, dyno: { runs: [] } };
        try {
            const s = JSON.parse(fs.readFileSync(this.file, 'utf8'));
            ['drag', 'brake', 'dyno'].forEach((k) => { if (s && s[k] && Array.isArray(s[k].runs)) this.saved[k] = Object.assign(this.saved[k], s[k]); });
        } catch (e) { /* first start */ }
        this.demoStore = { drag: { best: {}, runs: [] }, brake: { best: {}, runs: [] }, dyno: { runs: [] } };
        this.demo = false; this.mode = 'drag';
        this.resetG();
        this.newTimer();
        this.brake = { state: 'arm', prev: null, run: null, last: null, msg: null, msgUntil: 0, curve: [] };
        this.dyno = { pull: null, power: null, state: 'idle', until: 0, last: null, lastT: 0 };
        if (car) car.onSample((d, t) => this.sample(d, t), () => this.sourceChanged());
    }
    store() { return this.demo ? this.demoStore : this.saved; }
    save() { if (this.demo) return; try { const tmp = this.file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(this.saved)); fs.renameSync(tmp, this.file); } catch (e) { this.log.warn('perf save: ' + e); } }
    unit() { return this.get('speedUnit') === 'kmh' ? 'kmh' : 'mph'; }
    setMode(m) { if (MODES.indexOf(m) >= 0) this.mode = m; }
    nextMode() { this.mode = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length]; }

    /** live <-> demo, or the speed unit changed: nothing half-measured is carried over. */
    sourceChanged() {
        this.newTimer(); this.resetG();
        this.brake = { state: 'arm', prev: null, run: null, last: null, msg: null, msgUntil: 0, curve: [] };
        this.dyno.pull = null; this.dyno.power = null; this.dyno.state = 'idle';
    }

    /* ---------------- drag timer ---------------- */
    splits() { return DRAG_SPLITS[this.unit()].concat([QUARTER]); }
    newTimer() {
        this.newBest = {}; this.peakLaunchG = 0;
        this.timer = new RunTimer(this.splits(), {
            rollout: this.get('rollout') === 'on',
            onLaunch: () => { this.peakLaunchG = 0; this.newBest = {}; },
            onDone: (run) => {
                const st = this.store().drag, ro = run.rollout ? '@ro' : '';
                this.newBest = {};
                Object.keys(run.result).forEach((k) => {
                    const b = st.best[k + ro];
                    if (!b || run.result[k] < b.s) { st.best[k + ro] = { s: run.result[k], at: run.at, trap: run.trap[k] }; this.newBest[k] = true; }
                });
                st.runs.unshift(Object.assign({ unit: this.unit(), peakG: this.peakLaunchG }, run)); st.runs = st.runs.slice(0, 30);
                this.save();
                this.log.info('drag run ' + JSON.stringify(run.result));
            },
        });
    }
    /** Call a few times a second: a stopped car sends no new speed, so the timer arms by the clock. */
    idle(now) { this.fadeEnv(now); if (!this.demo) this.timer.idle(now); }

    /* ---------------- g meter ---------------- */
    resetG() { this.trail = []; this.gPeak = { accel: 0, brake: 0, left: 0, right: 0, total: 0 }; this.gT = 0; this.env = new Array(SECTORS).fill(0); this.envAt = new Array(SECTORS).fill(0); this.envT = null; }
    /** The outline follows the dot out, then lets go: a direction the dot has left shrinks back by itself. */
    fadeEnv(t) {
        if (this.envT === null || t < this.envT) { this.envT = t; return; }
        const dt = t - this.envT; if (dt < 50) return;
        this.envT = t;
        const k = Math.exp(-dt / ENV_FADE_MS);
        for (let i = 0; i < SECTORS; i++) if (this.env[i] > 0 && t - this.envAt[i] > ENV_HOLD_MS) { this.env[i] *= k; if (this.env[i] < 0.01) this.env[i] = 0; }
    }

    /* ---------------- one sample ---------------- */
    sample(d, t) {
        if (!!d.demo !== this.demo) { this.demo = !!d.demo; }
        if (isNum(d.speed)) this.timer.feed(t, d.speed);
        if (isNum(d.gLong)) {
            if (this.timer.state === 'run') this.peakLaunchG = Math.max(this.peakLaunchG, d.gLong);
            const lat = isNum(d.gLat) ? d.gLat : 0, p = this.gPeak;
            p.accel = Math.max(p.accel, d.gLong); p.brake = Math.max(p.brake, -d.gLong);
            p.right = Math.max(p.right, lat); p.left = Math.max(p.left, -lat);
            const tot = Math.sqrt(lat * lat + d.gLong * d.gLong);
            p.total = Math.max(p.total, tot);
            // the outline: how far the dot has just been in each direction (24 directions round the circle)
            this.fadeEnv(t);
            if (tot > 0.03) { const s = ((Math.round(Math.atan2(lat, d.gLong) / (2 * Math.PI) * SECTORS) % SECTORS) + SECTORS) % SECTORS; if (tot >= this.env[s]) { this.env[s] = tot; this.envAt[s] = t; } }
            if (t - this.gT >= 100) { this.gT = t; this.trail.push([lat, d.gLong]); if (this.trail.length > 50) this.trail.shift(); }
        }
        this.dynoSample(d, t);
        this.brakeSample(d, t);
    }

    /* ---------------- virtual dyno ---------------- */
    dynoSample(d, t) {
        const y = this.dyno;
        if (t - y.lastT < 40) return;
        y.lastT = t;
        if (!isNum(d.rpm) || !isNum(d.speed) || !isNum(d.gLong)) return;
        const v = d.speed / 3.6, a = d.gLong * G0;
        const m = Number(this.get('weight')) || 1850, cda = CDA[this.get('body')] || CDA.sedan, loss = Number(this.get('loss')) || 15;
        const wheel = m * a * v + 0.5 * RHO * cda * v * v * v + CRR * m * G0 * v;
        const crank = wheel / (1 - loss / 100);
        const hard = d.gLong > 0.12 && d.speed > 15 && d.rpm > 1200;
        y.power = hard ? crank : null;
        if (hard) {
            if (!y.pull) { y.pull = { segs: [], start: Date.now() }; y.state = 'pull'; }
            const k = d.rpm / d.speed;
            let seg = y.pull.segs[y.pull.segs.length - 1];
            if (!seg || Math.abs(k - seg.k) / seg.k > 0.04) { seg = { k, pts: [] }; y.pull.segs.push(seg); }
            seg.k += (k - seg.k) * 0.1;
            seg.pts.push({ rpm: d.rpm, p: crank, v: d.speed, ecu: d.torque });
            y.pull.lastHard = t;
        } else if (y.pull && t - y.pull.lastHard > 500) this.finishPull(m, loss);
    }
    finishPull(weight, loss) {
        const y = this.dyno, p = y.pull; y.pull = null;
        if (!p) return;
        // the tallest gear with a long enough pull: least wheelspin
        const best = p.segs.map((s) => {
            const r = s.pts.map((x) => x.rpm);
            return { s, span: r.length ? Math.max.apply(null, r) - Math.min.apply(null, r) : 0 };
        }).filter((x) => x.span >= MIN_SPAN && x.s.pts.length > 15).sort((a, b) => a.s.k - b.s.k)[0];
        if (!best) { y.state = 'short'; y.until = Date.now() + 4000; return; }
        const run = Perf.analyse(best.s.pts, p.start, weight, loss);
        const st = this.store().dyno;
        st.runs.unshift(run); st.runs = st.runs.slice(0, 10);
        this.save();
        y.last = run; y.state = 'done'; y.until = Date.now() + 6000;
        this.log.info('dyno run ' + Math.round(run.peakP / 745.7) + ' hp @' + run.peakPrpm + ', ' + Math.round(run.peakT) + ' Nm @' + run.peakTrpm);
    }
    /** Samples binned by rpm and smoothed; torque from power. Watts and Nm. */
    static analyse(pts, start, weight, loss) {
        const bins = {};
        pts.forEach((x) => { const b = Math.round(x.rpm / BIN) * BIN; (bins[b] = bins[b] || []).push(x); });
        const keys = Object.keys(bins).map(Number).sort((a, b) => a - b);
        const raw = keys.map((k) => {
            const ecu = bins[k].filter((x) => isNum(x.ecu));
            return { rpm: k, p: bins[k].reduce((a, x) => a + x.p, 0) / bins[k].length, ecu: ecu.length ? ecu.reduce((a, x) => a + x.ecu, 0) / ecu.length : null };
        });
        const curve = raw.map((c, i) => {
            const win = raw.slice(Math.max(0, i - 2), i + 3);
            const p = win.reduce((a, x) => a + x.p, 0) / win.length;
            return { rpm: c.rpm, p: Math.max(0, p), t: Math.max(0, p / (c.rpm * Math.PI / 30)), ecu: c.ecu };
        });
        const pk = curve.reduce((a, c) => (c.p > a.p ? c : a), curve[0]);
        const tk = curve.reduce((a, c) => (c.t > a.t ? c : a), curve[0]);
        return { at: start, curve, peakP: pk.p, peakPrpm: pk.rpm, peakT: tk.t, peakTrpm: tk.rpm, weight, loss, v0: pts[0].v, v1: pts[pts.length - 1].v };
    }

    /* ---------------- brake test ---------------- */
    brakeTests() { return BRAKE_TESTS[this.unit()]; }
    /** When the speed had dropped by `need`: on the deceleration curve scaled to the measured drop. */
    crossAt(need, lost, t) {
        const b = this.brake, curve = b.curve;
        const t1 = curve.length ? curve[0][0] : b.prev.t, end = curve.length ? curve[curve.length - 1][1] : 0;
        if (!(end > 0)) return t1 + need / lost * (t - t1);
        const k = lost / end;
        for (let i = 1; i < curve.length; i++) {
            const ta = curve[i - 1][0], a = curve[i - 1][1], tb = curve[i][0], bb = curve[i][1];
            if (k * bb >= need) return ta + (need - k * a) / (k * (bb - a)) * (tb - ta);
        }
        return t;
    }
    brakeFinish(t) {
        const b = this.brake, run = b.run, res = {}, st = this.store().brake;
        this.brakeTests().forEach((x) => { const c = run.cross[x.key]; if (c) res[x.key] = { m: run.dist - c.d, s: (t - c.t) / 1000 }; });
        const r = { at: Date.now(), unit: this.unit(), result: res, peakG: run.peakG, vStart: run.vStart, newBest: {} };
        Object.keys(res).forEach((k) => { const best = st.best[k]; if (!best || res[k].m < best.m) { st.best[k] = { m: res[k].m, s: res[k].s, at: r.at }; r.newBest[k] = true; } });
        st.runs.unshift(r); st.runs = st.runs.slice(0, 30);
        this.save();
        b.last = r; b.run = null; b.state = 'done';
        this.log.info('stop ' + JSON.stringify(res));
    }
    brakeSample(d, t) {
        const b = this.brake, v = d.speed, g = d.gLong;
        if (!isNum(v)) return;
        const tests = this.brakeTests(), top = tests[0], low = tests[1], KMH_PER_G = G0 * 3.6;
        // accel samples come in between with the last speed held (speed is sent on change): prev is the
        // last speed sample, distance and crossings go from speed sample to speed sample only
        const fresh = !b.prev || v !== b.prev.v, braking = isNum(g) && -g >= 0.1;
        const c = b.curve[b.curve.length - 1];
        if (c && t > c[0]) b.curve.push([t, c[1] + (braking ? -g * KMH_PER_G * (t - c[0]) / 1000 : 0)]);
        if (b.state === 'braking') {
            const run = b.run, dt = (t - b.prev.t) / 1000;
            if (dt <= 0) return;
            if (isNum(g)) run.peakG = Math.max(run.peakG, -g);
            if (fresh) {
                run.dist += (b.prev.v + v) / 2 / 3.6 * dt;
                tests.forEach((x) => {
                    if (!run.cross[x.key] && b.prev.v >= x.v && v < x.v) {
                        const f = (b.prev.v - x.v) / (b.prev.v - v);
                        run.cross[x.key] = { t: b.prev.t + f * (t - b.prev.t), d: run.dist - (1 - f) * (b.prev.v + v) / 2 / 3.6 * dt };
                    }
                });
            }
            if (isNum(g) && -g < 0.1) { run.released = run.released || t; } else run.released = 0;
            if (v < 0.5) this.brakeFinish(t);
            else if (run.released && t - run.released > 1200) { b.state = 'arm'; b.run = null; b.msg = 'Brake released - stop not counted'; b.msgUntil = Date.now() + 4000; }
        } else {
            if (v > low.v + 3) b.state = 'ready';
            else if (b.state === 'ready' && v < low.v - 3) b.state = 'arm';
            if (b.state === 'ready' && b.prev && isNum(g) && -g >= BRAKE_TRIGGER_G) {
                const hit = [top, low].find((x) => b.prev.v >= x.v && v < x.v);
                if (hit) {
                    const t0 = this.crossAt(b.prev.v - hit.v, b.prev.v - v, t), d0 = (hit.v + v) / 2 / 3.6 * (t - t0) / 1000;
                    b.run = { dist: d0, cross: { [hit.key]: { t: t0, d: 0 } }, peakG: -g, vStart: hit.v, released: 0 };
                    b.state = 'braking'; b.last = null;
                }
            }
            if (b.state === 'done' && v > 5) b.state = v > low.v + 3 ? 'ready' : 'arm';
        }
        if (fresh || !braking) b.curve = [[t, 0]];
        if (fresh) b.prev = { t, v };
    }

    /** The newest pull and the one before it (drawn behind, to compare), and how many are kept. */
    dynoView(y, runs) {
        const last = y.last || runs[0] || null, i = last ? runs.indexOf(last) : -1;
        return { state: y.state, power: y.power, last, prev: last ? runs[(i < 0 ? 0 : i) + 1] || null : null, count: runs.length,
            weight: Number(this.get('weight')) || 1850, loss: Number(this.get('loss')) || 15 };
    }
    /** Everything the screen draws. */
    view(now) {
        const d = this.car ? this.car.data() : {}, st = this.store(), mph = this.unit() === 'mph', b = this.brake, y = this.dyno;
        if (y.until && now > y.until && y.state !== 'pull') { y.state = 'idle'; y.until = 0; }
        if (b.msg && now > b.msgUntil) b.msg = null;
        const ro = this.timer.rollout ? '@ro' : '';
        return {
            mode: this.mode, demo: !!d.demo, mph, speed: isNum(d.speed) ? (mph ? d.speed / MPH : d.speed) : null, speedUnit: mph ? 'mph' : 'km/h',
            rpm: d.rpm, gLong: d.gLong, gLat: d.gLat, haveG: isNum(d.gLong),
            drag: { state: this.timer.state, elapsed: this.timer.elapsed(now), rollout: this.timer.rollout, peakG: this.peakLaunchG,
                splits: this.splits().map((s) => ({ key: s.key, label: s.label, s: this.timer.result[s.key], trap: this.timer.trapSpeed[s.key],
                    best: (st.drag.best[s.key + ro] || {}).s, isNew: !!this.newBest[s.key] })),
                runs: st.drag.runs.slice(0, 4) },
            g: { trail: this.trail, peak: this.gPeak, env: this.env },
            dyno: this.dynoView(y, st.dyno.runs),
            brake: { state: b.state, msg: b.msg, last: b.last || st.brake.runs[0] || null, live: b.run ? { dist: b.run.dist, peakG: b.run.peakG } : null,
                tests: this.brakeTests().map((x) => ({ key: x.key, label: x.label, best: st.brake.best[x.key] })) },
        };
    }
}
module.exports = { Perf, MODES, MPH };
