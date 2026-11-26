'use strict';
/**
 * tyres.js - each tyre's pressure, target pressure and temperature, from the car's own tyre
 * pressure monitor. Read only: these are signals the car publishes; nothing is asked of a
 * control unit and nothing is sent.
 *
 * The signal names, scaling and unit handling follow the M Vitals app of the idrive7-apps kit
 * (cauliflowermossgrape/idrive7-apps, MIT; see NOTICE), which worked them out on owners' cars:
 *
 *   de.bmw.infotainment.vehicle.TPMS
 *     statusTyrePressure        actualValuePressureTyre{FLH,FRH,RLH,RRH}     0.1 x raw, >= 65532 invalid
 *     statusTargetTyrePressure  targetPressureTyre{FLH,FRH,RLH,RRH}          the same
 *     statusTyreTemperature     actualValueTemperatureTyre{FLH,FRH,RLH,RRH}  raw - 40, 65535 invalid
 *   de.bmw.infotainment.vehicle.Vehicle
 *     statusNewCurrentUnitsStatusExt  unitOfMeasurementAirPressure (1 bar, 2 kPa, 3 psi),
 *                                     unitOfMeasurementTemperature (1 deg C, 2 deg F)
 *
 * The pressures arrive in the car's own display unit and the temperatures in its degrees. Until
 * the unit signal has been seen the unit is told from the value itself: plausible tyre pressures
 * in bar (0.5-6), psi (7-60) and kPa (60-600) do not overlap, and a car in psi is in deg F.
 * Everything is kept in bar and deg C; the page shows it in the driver's units.
 */
const CORNERS = { fl: 'FLH', fr: 'FRH', rl: 'RLH', rr: 'RRH' };
const PRESS_UNITS = { 1: 'BAR', 2: 'KPA', 3: 'PSI' }, TEMP_UNITS = { 1: 'C', 2: 'F' };
const TO_BAR = { BAR: 1, KPA: 0.01, PSI: 1 / 14.5038 };
const FRESH_MS = 120000;                 // the car is asked every 10 s; older than two minutes is not shown
const P_OK = [0.5, 6], T_OK = [-40, 150];     // bar, deg C: outside these a value is "no data"
const num = (v) => typeof v === 'number' && isFinite(v);
const unitName = (map, v) => map[v] || (Object.keys(map).some((k) => map[k] === v) ? v : null);

class Tyres {
    constructor(clock) {
        this.clock = clock || (() => Date.now());
        this.units = { press: null, temp: null, psiSeen: false };
        this.p = {}; this.target = {}; this.t = {}; this.at = { p: 0, target: 0, t: 0 };
    }
    onUnits(v) {
        this.units.press = unitName(PRESS_UNITS, v && v.unitOfMeasurementAirPressure);
        this.units.temp = unitName(TEMP_UNITS, v && v.unitOfMeasurementTemperature);
    }
    /** A raw pressure as bar, or null. */
    bar(raw) {
        if (!num(raw) || raw >= 65532) return null;
        const v = raw * 0.1, k = TO_BAR[this.units.press];
        let out;
        if (k) out = v * k;
        else if (v >= P_OK[0] && v <= P_OK[1]) out = v;
        else if (v >= 7 && v < 60) { this.units.psiSeen = true; out = v / 14.5038; }
        else if (v >= 60 && v <= 600) out = v / 100;
        else return null;
        return out >= P_OK[0] && out <= P_OK[1] ? out : null;
    }
    /** A raw temperature as deg C, or null. */
    celsius(raw) {
        if (!num(raw) || raw >= 65535) return null;
        const v = raw - 40, f = this.units.temp ? this.units.temp === 'F' : this.units.psiSeen;
        const c = f ? (v - 32) * 5 / 9 : v;
        return c >= T_OK[0] && c <= T_OK[1] ? c : null;
    }
    take(into, stamp, v, prefix, convert) {
        if (!v) return;
        let any = false;
        Object.keys(CORNERS).forEach((k) => { const x = convert(v[prefix + CORNERS[k]]); into[k] = x; if (x !== null) any = true; });
        if (any) this.at[stamp] = this.clock();
    }
    onPressure(v) { this.take(this.p, 'p', v, 'actualValuePressureTyre', (r) => this.bar(r)); }
    onTarget(v) { this.take(this.target, 'target', v, 'targetPressureTyre', (r) => this.bar(r)); }
    onTemperature(v) { this.take(this.t, 't', v, 'actualValueTemperatureTyre', (r) => this.celsius(r)); }
    /**
     * { fl, fr, rl, rr } each { p (bar), target (bar), t (deg C) }, a missing value null; or null
     * when the car has sent no tyre pressure lately.
     */
    view() {
        const now = this.clock(), fresh = (s) => this.at[s] && now - this.at[s] < FRESH_MS;
        if (!fresh('p')) return null;
        const out = {};
        Object.keys(CORNERS).forEach((k) => {
            out[k] = { p: num(this.p[k]) ? this.p[k] : null, target: fresh('target') && num(this.target[k]) ? this.target[k] : null, t: fresh('t') && num(this.t[k]) ? this.t[k] : null };
        });
        return out;
    }
}
/** How a pressure stands against the car's target: 'low' (under 85 %), 'off' (under 93 % or over 115 %), 'ok'; null without both. */
function pressureState(p, target) {
    if (!num(p) || !num(target) || !(target > 0)) return null;
    const r = p / target;
    return r < 0.85 ? 'low' : r < 0.93 || r > 1.15 ? 'off' : 'ok';
}
module.exports = { Tyres, pressureState, FRESH_MS };
