'use strict';
// The Info page: what SMILEY already knows about the car and itself. Nothing is asked of the car
// when the page is opened: the engine computer's details are the ones read once at start-up
// (diaglink identifyDme), plus BMW's own parts list (readParts below), read at the same time.
const texts = require('./fault_texts');

const spaced = (h) => (h ? String(h).toUpperCase() : null);
/*
 * BMW units list what they are made of under 22 F1 01 (the "SVK"): a short header, then one 8-byte
 * entry per part - a class (01 the hardware, 06 the bootloader, 08 the program, 05 the coding data),
 * a 4-byte number and a 3-byte version. Many engine units answer only this and not the generic
 * F1 91 / F1 95, which is why those two rows stayed empty. The count of entries is in bytes 2-3
 * and the entries are the last count x 8 bytes; a reply that does not fit that shape is ignored.
 */
const SVK_CLASS = { 1: 'HWEL', 2: 'HWAP', 3: 'HWFR', 5: 'CAFD', 6: 'BTLD', 7: 'FLSL', 8: 'SWFL', 9: 'SWFF', 10: 'SWPF', 11: 'ONPS', 13: 'SWFK' };
function parseSvk(data) {
    if (!data || data.length < 12) return null;
    const n = (data[2] << 8) | data[3], start = data.length - n * 8;
    if (!n || n > 60 || start < 4) return null;
    const h2 = (b) => (b < 16 ? '0' : '') + b.toString(16).toUpperCase(), d3 = (b) => ('00' + b).slice(-3), parts = [];
    for (let i = start; i + 8 <= data.length; i += 8) {
        const cls = SVK_CLASS[data[i]];
        if (!cls) return null;                          // not the layout we know: show nothing rather than a guess
        parts.push({ cls, text: cls + ' ' + h2(data[i + 1]) + h2(data[i + 2]) + h2(data[i + 3]) + h2(data[i + 4]) + '  ' + d3(data[i + 5]) + '.' + d3(data[i + 6]) + '.' + d3(data[i + 7]) });
    }
    const of = (c) => parts.filter((p) => p.cls === c).map((p) => p.text);
    return { hw: of('HWEL')[0] || null, sw: of('SWFL').slice(0, 2).join('   ') || null, parts: parts.map((p) => p.text) };
}
/** Read the parts list once (read-only). null when the unit does not answer it. The raw reply goes to the log. */
async function readParts(link) {
    if (!link || !link.available || typeof link.readDid !== 'function') return null;
    const r = await link.readDid([0xF1, 0x01]);
    if (!r.ok) { if (link.log) link.log.info('parts list (22 F1 01): ' + r.reason); return null; }
    const p = parseSvk(r.data);
    if (link.log) link.log.info('parts list (22 F1 01): ' + r.data.map((b) => (b < 16 ? '0' : '') + b.toString(16)).join(' ') + (p ? '' : '  (layout not recognised)'));
    return p;
}
function infoRows(o) {
    const id = o.ident || {}, rows = [];
    const sg = id.sgbdIndex ? String(id.sgbdIndex).replace(/\s+/g, '').toUpperCase() : null;
    const unit = sg ? texts.unitName(0x12, { '12': sg }) : null;
    rows.push(['VIN', id.vin || null]);
    rows.push(['Engine computer', id.present ? (unit && unit !== 'DME engine' ? unit + '  (' + sg + ')' : sg ? 'Type ' + sg : 'Found') : null]);
    const parts = o.parts || {};
    rows.push(['Hardware number', spaced(id.hw) || parts.hw || null]);
    rows.push(['Software number', spaced(id.sw) || parts.sw || null]);
    // An MHD tune cannot be read from the car, so that row says what the owner chose; bootmod3 is
    // recognised from its own data once the Tune tab has read it.
    const tuner = o.tuner, tune = id.mhd && id.mhd.flashed ? 'MHD' : (id.bm3 && id.bm3.flashed) || o.bm3Verified ? 'bootmod3 (recognised)'
        : tuner === 'mhd' ? 'MHD (your choice on the Tune tab)' : tuner === 'bm3' ? 'bootmod3 (chosen, not recognised yet)' : 'None chosen on the Tune tab';
    rows.push(['Tune', o.demo ? null : tune]);
    rows.push(['Car connection', o.demo ? 'Demo mode' : o.linked ? 'Connected' : 'Not connected']);
    rows.push(['Car Wi-Fi address', o.wifi || 'Hotspot is off']);
    rows.push(['App version', o.version]);
    return rows.map((r) => ({ label: r[0], value: r[1] == null || r[1] === '' ? '--' : String(r[1]) }));
}
module.exports = { infoRows, readParts, parseSvk };
