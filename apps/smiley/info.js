'use strict';
// The Info page: what SMILEY already knows about the car and itself. Nothing is asked of the car
// here: the engine computer's details are the ones read once at start-up (diaglink identifyDme).
const texts = require('./fault_texts');

const spaced = (h) => (h ? String(h).toUpperCase() : null);
function infoRows(o) {
    const id = o.ident || {}, rows = [];
    const sg = id.sgbdIndex ? String(id.sgbdIndex).replace(/\s+/g, '').toUpperCase() : null;
    const unit = sg ? texts.unitName(0x12, { '12': sg }) : null;
    rows.push(['VIN', id.vin || null]);
    rows.push(['Engine computer', id.present ? (unit && unit !== 'DME engine' ? unit + '  (' + sg + ')' : sg ? 'Type ' + sg : 'Found') : null]);
    rows.push(['Hardware number', spaced(id.hw)]);
    rows.push(['Software number', spaced(id.sw)]);
    rows.push(['Tune found', !id.present ? null : id.mhd && id.mhd.flashed ? 'MHD' : id.bm3 && id.bm3.flashed ? 'bootmod3' : 'None found']);
    rows.push(['Car connection', o.demo ? 'Demo mode' : o.linked ? 'Connected' : 'Not connected']);
    rows.push(['Car Wi-Fi address', o.wifi || 'Hotspot is off']);
    rows.push(['SMILEY version', o.version]);
    return rows.map((r) => ({ label: r[0], value: r[1] == null || r[1] === '' ? '--' : String(r[1]) }));
}
module.exports = { infoRows };
