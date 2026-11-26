'use strict';
/**
 * warm.js - when the engine is ready to be used, and when the turbo has cooled. Reads only.
 *
 *   - minutes until the oil is warm, from how fast it has been warming over the last three
 *     minutes (a typical rate until enough has been measured)
 *   - a safe rev limit that climbs from the cold limit to the redline as the oil warms
 *   - turbo cool-down: hard driving (high revs or high power) builds up a cool-down time of
 *     30 s to 3 min that counts down while driving gently or idling
 *
 * The method and its numbers follow the Warm-Up app of the idrive7-apps kit
 * (cauliflowermossgrape/idrive7-apps, MIT; see NOTICE).
 */
const num = (v) => typeof v === 'number' && isFinite(v);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const HARD_RPM = 3800, HARD_KW = 90;       // above either: hard use, which heats the turbo
const GENTLE_RPM = 2800, GENTLE_KW = 40;   // below both: cooling down
const COOL_MIN = 30, COOL_MAX = 180;       // seconds of cool-down, growing with the hard-use time
const TYPICAL = { drive: 4, idle: 1.5 };   // oil, deg C per minute, until the car's own rate is measured
const DONE_MS = 20000;                     // "cooled" stays this long

class Warm {
    /** o: { warmC (oil counts as warm), coldLimit, redline (rpm) } */
    constructor(o) {
        this.o = Object.assign({ warmC: 85, coldLimit: 3500, redline: 7000 }, o || {});
        this.reset();
    }
    reset() { this.hist = []; this.lastHist = -1e9; this.lastT = null; this.hardS = 0; this.needS = 0; this.cool = 0; this.doneAt = 0; this.d = {}; }
    /** d: { rpm, torque (Nm), oil (deg C), speed (km/h) }, any of them missing; t: a steady clock, ms. */
    sample(d, t) {
        const dt = this.lastT !== null ? clamp(t - this.lastT, 0, 2000) / 1000 : 0; this.lastT = t; this.d = d || {}; d = this.d;
        if (num(d.rpm)) {
            const kw = num(d.torque) ? d.torque * d.rpm / 9549 : 0;
            if (d.rpm > HARD_RPM || kw > HARD_KW) {
                this.hardS += dt; this.cool = 0; this.doneAt = 0;
                if (this.hardS > 8) this.needS = clamp(COOL_MIN + this.hardS * 3, COOL_MIN, COOL_MAX);
            } else if (this.needS > 0 && d.rpm < GENTLE_RPM && kw < GENTLE_KW) {
                this.cool += dt;
                if (this.cool >= this.needS && !this.doneAt) this.doneAt = t;
            } else if (!this.needS) this.hardS = Math.max(0, this.hardS - dt * 0.2);       // short bursts fade away
            if (this.doneAt && t - this.doneAt > DONE_MS) { this.hardS = 0; this.needS = 0; this.cool = 0; this.doneAt = 0; }
        }
        if (t - this.lastHist > 5000 && num(d.oil)) {
            this.lastHist = t; this.hist.push([t, d.oil]);
            while (this.hist.length > 240) this.hist.shift();
        }
    }
    /** Oil warming rate, deg C per minute over the last three minutes (least squares), and the time it covers. */
    measured() {
        const last = this.hist.length ? this.hist[this.hist.length - 1][0] : 0;
        const pts = this.hist.filter((h) => last - h[0] < 180000);
        if (pts.length < 4) return { rate: null, span: 0 };
        const n = pts.length, mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
        let top = 0, den = 0;
        pts.forEach((p) => { top += (p[0] - mx) * (p[1] - my); den += (p[0] - mx) * (p[0] - mx); });
        return { rate: den ? top / den * 60000 : null, span: pts[n - 1][0] - pts[0][0] };
    }
    /** Minutes until the oil is warm, or null (warm already, engine off, not warming, or no reading). */
    minutes() {
        const d = this.d;
        if (!num(d.oil) || d.oil >= this.o.warmC || (num(d.rpm) && d.rpm < 300)) return null;
        const m = this.measured(), typ = TYPICAL[num(d.speed) && d.speed > 10 ? 'drive' : 'idle'];
        const w = clamp(m.span / 120000, 0, 1), rate = num(m.rate) ? w * m.rate + (1 - w) * typ : typ;
        if (w > 0.8 && rate < 0.15) return null;
        return (this.o.warmC - d.oil) / Math.max(0.15, rate);
    }
    /** The rev limit to keep under at this oil temperature, to the nearest 100; the redline once warm; null without a reading. */
    limit() {
        const oil = this.d.oil, red = this.o.redline, cold = Math.min(this.o.coldLimit, red);
        if (!num(oil)) return null;
        if (oil >= this.o.warmC) return red;
        return Math.round((cold + (red - cold) * clamp((oil - 30) / (this.o.warmC - 30), 0, 1)) / 100) * 100;
    }
    /** { minutes, limit, redline, cool: null | { state: 'cooling', left (s) } | { state: 'done' } } */
    view() {
        const cool = this.doneAt ? { state: 'done' } : this.needS > 0 ? { state: 'cooling', left: Math.max(0, Math.ceil(this.needS - this.cool)) } : null;
        return { minutes: this.minutes(), limit: this.limit(), redline: this.o.redline, cool };
    }
}
module.exports = { Warm };
