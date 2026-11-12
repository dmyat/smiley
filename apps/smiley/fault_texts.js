'use strict';
// What a fault code means, from the fault text database of the upstream Fault Scanner
// (dtc_db.pack, read with kit/pack: a lookup inflates only the few KB that hold its code).
// The lookup order is the Fault Scanner's own: a hand-written text, the text for exactly this
// unit type (its SGBD index, read with 22 F1 50), the text every unit type at this address agrees
// on, a code-only text; and where several texts are possible and the unit type is unknown, it
// says so rather than guess.
const path = require('path');
const { hex } = require('./kit/diag');
const { ECU } = require('./kit/ecus');
const known = require('./known_texts');

let DB = null, SGBD = {}, UNIT_NAMES = {};
try {
    DB = require('./kit/pack').open(path.join(__dirname, 'dtc_db'));
    SGBD = DB.json('sgbd_index.json') || {}; UNIT_NAMES = DB.json('unit_names.json') || {};
} catch (e) { DB = null; }
const HAS_DB = !!DB && Object.keys(SGBD).length > 0;
const get = (file, key) => { try { return DB ? DB.get(file, key) : null; } catch (e) { return null; } };
// The app's fonts are Latin: German letters are spelled out, anything else outside ASCII is dropped.
const ascii = (s) => String(s).replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae')
    .replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss').replace(/[^\x20-\x7e]/g, '');
const FAMILY = {
    '23:D1C604': 'Assist sensors: Unexpected Ethernet communication/link',
    '61:03178A': 'Telematics: Mobile network connection limited',
};
const NONE = 'No description. Look up this BMW code.';

/** ids: { "<address hex>": "<SGBD index hex>" } for the units that have been identified. */
function variant(addr, ids) {
    const id = ids && ids[hex(addr)], v = id ? SGBD[hex(addr) + ' ' + id] : null;
    return v && /^[A-Za-z0-9_]+$/.test(v) ? v : null;
}
function describe(addr, rawCode, ids) {
    const code = String(rawCode).trim().toUpperCase().replace(/^0X/, '').padStart(6, '0');
    const key = hex(addr) + ':' + code;
    const text = (k) => known[k] || get('dtc_texts.json', k);
    const own = text(key);
    if (own) return ascii(own);
    const v = variant(addr, ids);
    const iv = (v && get('tables/variant/' + v.toLowerCase() + '.json', code)) || get('tables/addr/' + hex(addr) + '.json', code);
    if (iv) return ascii(iv);
    const t = (v && get('texts/' + v + '.json', code)) || text('*:' + code);
    if (t) return ascii(t);
    const c = get('code_texts.json', code);
    const ct = (typeof c === 'string' ? c : c && c[hex(addr)]) || get('tables/codes.json', code) || FAMILY[key];
    if (ct) return ascii(ct);
    const n = get('tables/ambiguous.json', code);
    return n > 0 ? n + ' possible meanings (depends on the module type)' : NONE;
}
function unitName(addr, ids) {
    const v = variant(addr, ids);
    return (v && UNIT_NAMES[v] && ascii(UNIT_NAMES[v])) || ECU[addr] || v || 'ECU 0x' + hex(addr);
}
module.exports = { describe, unitName, HAS_DB, NONE };
