'use strict';
/**
 * layout.js - which gauge sits where on the two Live Stats pages.
 *
 * Sixteen slots, each holding one gauge, each gauge exactly once. Slots 0-5 are the main page and
 * 6-11 the second (three across, two down); slots 12-15 are the gauges not on show. The owner picks
 * what a slot shows from the list of all sixteen: the chosen gauge trades places with the one that
 * was there, so nothing is ever lost or shown twice. Kept in data/gauges.json; a file that is not a
 * full set of the known gauges is ignored.
 */
const fs = require('fs');
const path = require('path');

const DEFAULT = ['rpm', 'boost', 'oil', 'coolant', 'iat', 'oilp',
    'hpfp', 'timing', 'lambda', 'boostTarget', 'load', 'torque',
    'stft1', 'stft2', 'lpfp', 'misfire'];
const PER_PAGE = 6, PAGES = 2;

class GaugeLayout {
    constructor(dataDir, log) {
        this.file = dataDir ? path.join(dataDir, 'gauges.json') : null; this.log = log || { warn() {} };
        this.slots = DEFAULT.slice();
        try {
            const saved = this.file ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : null;
            if (saved && GaugeLayout.valid(saved.slots)) this.slots = saved.slots.slice();
        } catch (e) { /* first start, or not readable: the default layout */ }
    }
    static valid(slots) { return Array.isArray(slots) && slots.length === DEFAULT.length && DEFAULT.every((id) => slots.indexOf(id) >= 0); }
    /** The gauges of one page (0 | 1), in order. */
    page(n) { return this.slots.slice(n * PER_PAGE, n * PER_PAGE + PER_PAGE); }
    save() {
        if (!this.file) return;
        try { const tmp = this.file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify({ slots: this.slots })); fs.renameSync(tmp, this.file); } catch (e) { this.log.warn('gauge layout: ' + e); }
    }
    /** Two slots trade places. */
    swap(a, b) {
        if (!(a >= 0 && a < this.slots.length && b >= 0 && b < this.slots.length) || a === b) return false;
        const t = this.slots[a]; this.slots[a] = this.slots[b]; this.slots[b] = t; this.save(); return true;
    }
    /** The slot shows the next gauge in the list; the one it had moves to where that gauge was. */
    change(slot, step) {
        if (!(slot >= 0 && slot < this.slots.length)) return null;
        const i = DEFAULT.indexOf(this.slots[slot]), next = DEFAULT[(i + (step || 1) + DEFAULT.length) % DEFAULT.length];
        this.swap(slot, this.slots.indexOf(next));
        return next;
    }
    /** The slot shows this gauge; the one it had goes to where that gauge was (a page or the spares). */
    set(slot, id) {
        const from = this.slots.indexOf(id);
        if (from < 0 || !(slot >= 0 && slot < this.slots.length)) return false;
        return from === slot ? true : this.swap(slot, from);
    }
    reset() { this.slots = DEFAULT.slice(); this.save(); }
}
module.exports = { GaugeLayout, DEFAULT, PER_PAGE, PAGES };
