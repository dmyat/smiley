'use strict';
/**
 * looks.js - the ten themes. Each is a palette for every page, a tab bar of its own, a Live Stats
 * screen of its own, and its own cell for the More readings page.
 *
 * A screen draws from S, worked out once in ui.js:
 *   S.rpm, S.power, S.boost, S.torque, S.oil, S.coolant   { k, lab, s (shown), u (unit), fr (0-1 on its scale) }
 *   S.gear (text), S.rev (0-1 of 7000 rpm), S.split (rear %, or null), S.more [ { k, lab, s, u, fr } ], S.big(key)
 * The bottom right corner (x 1340-1576, y 456-512) is kept free for the More readings button.
 */
const { withAlpha } = require('./kit/canvas');

const base = (o) => Object.assign({ light: false, panelTop: o.card, panelBottom: o.bg, tab: o.text, sel: o.accent, selText: o.ink, crit: '#ff453a', warn: '#ffb020', ok: '#5fd38a', cold: '#8fb2e6',
    track: o.panelEdge, tick: o.dim, off: o.dim, noticeBg: o.card, stripes: [o.accent, o.accent, o.accent2], ramp: [o.accent, o.accent, o.accent2], hotRamp: [o.accent2, o.warn || '#ffb020', '#ff6a00', '#ff453a'] }, o);
const sin = (a) => Math.sin(a * Math.PI / 180), cos = (a) => Math.cos(a * Math.PI / 180);
const T = (cv, s, x, y, size, c, o) => cv.text(String(s), x, y, size, c, Object.assign({ font: 'label', literal: true }, o));
const tw = (cv, s, size, o) => cv.textWidth(String(s), size, Object.assign({ font: 'label', literal: true }, o));
const tap = (cv, S, k, x, y, w, h) => cv.target(x, y, w, h, () => S.big(k), 'big-' + k);
const gearFont = (g) => (/^\d$/.test(String(g)) ? 'gear' : 'bold');
/** value with its unit small after it; returns nothing. */
function valUnit(cv, r, x, y, size, c, uc, font, align) {
    const w = tw(cv, r.s, size, { font }), uw = r.u ? tw(cv, r.u, size * 0.3, { font: 'bold' }) + size * 0.12 : 0;
    const x0 = align === 'right' ? x - w - uw : align === 'center' ? x - (w + uw) / 2 : x;
    T(cv, r.s, x0, y, size, c, { font }); if (r.u) T(cv, r.u, x0 + w + size * 0.12, y, size * 0.3, uc, { font: 'bold' });
}
function hex(cv, cx, cy, r, c) {
    const p = [0, 60, 120, 180, 240, 300].map((a) => [cx + r * cos(a), cy + r * sin(a)]);
    cv.quad([p[0], p[1], p[2], p[3]], c); cv.quad([p[3], p[4], p[5], p[0]], c);
}
function plaque(cv, x, y, w, h, c) { cv.quad([[x + 12, y], [x + w - 12, y], [x + w, y + h / 2], [x, y + h / 2]], c); cv.quad([[x, y + h / 2], [x + w, y + h / 2], [x + w - 12, y + h], [x + 12, y + h]], c); }
function frame(cv, x, y, w, h, lw, c) { cv.fillRect(x, y, w, lw, c); cv.fillRect(x, y + h - lw, w, lw, c); cv.fillRect(x, y, lw, h, c); cv.fillRect(x + w - lw, y, lw, h, c); }

/* seven-segment and block lettering, drawn from rectangles */
const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g', P: 'abefg', R: 'eg', N: 'ceg', D: 'bcdeg', ' ': '' };
function seg7(cv, str, x, y, h, c, ghost) {
    const w = h * 0.52, t = Math.max(3, h * 0.12), gap = h * 0.16; let px = x;
    String(str).split('').forEach((ch) => {
        if (ch === '.') { cv.fillRect(px - gap * 0.5, y + h - t, t, t, c); px += t; return; }
        const on = SEG[ch.toUpperCase()] === undefined ? 'g' : SEG[ch.toUpperCase()], m = h / 2;
        const R = { a: [px + t, y, w - 2 * t, t], g: [px + t, y + m - t / 2, w - 2 * t, t], d: [px + t, y + h - t, w - 2 * t, t],
            f: [px, y + t * 0.5, t, m - t * 0.75], b: [px + w - t, y + t * 0.5, t, m - t * 0.75], e: [px, y + m + t * 0.25, t, m - t * 0.75], c: [px + w - t, y + m + t * 0.25, t, m - t * 0.75] };
        Object.keys(R).forEach((k) => { const q = R[k], lit = on.indexOf(k) >= 0; if (lit || ghost) cv.fillRect(q[0], q[1], q[2], q[3], lit ? c : ghost); });
        px += w + gap;
    });
    return px - x;
}
const seg7w = (str, h) => String(str).split('').reduce((a, ch) => a + (ch === '.' ? Math.max(3, h * 0.12) : h * 0.52 + h * 0.16), 0);
const PX = { 0: '75557', 1: '26227', 2: '71747', 3: '71717', 4: '55711', 5: '74717', 6: '74757', 7: '71122', 8: '75757', 9: '75717', '.': '00002', '-': '00700', P: '75744', R: '75765', N: '57775', D: '65556', ' ': '00000' };
function pix(cv, str, x, y, u, c) {       // 3 x 5 block digits, u = block size
    let px = x;
    String(str).split('').forEach((ch) => {
        const g = PX[ch.toUpperCase()] || PX['-'], narrow = ch === '.';
        g.split('').forEach((row, r) => {
            const bits = parseInt(row, 10);
            if (narrow) { if (bits) cv.fillRect(px, y + r * u, u, u + 0.6, c); return; }
            for (let b = 0; b < 3; b++) { if (!(bits & (4 >> b))) continue; let e = b; while (e < 2 && (bits & (4 >> (e + 1)))) e++; cv.fillRect(px + b * u, y + r * u, (e - b + 1) * u, u + 0.6, c); b = e; }
        });
        px += (narrow ? 2 : 4) * u;
    });
    return px - x;
}
const pixw = (str, u) => String(str).split('').reduce((a, ch) => a + (ch === '.' ? 2 : 4) * u, 0) - u;

const LOOKS = {};

/* ---------------------------------------------------------------- SLASH */
LOOKS.slash = {
    name: 'Slash', tab: 'slant',
    pal: base({ bg: '#0c0c0d', text: '#ffffff', dim: '#9a9a9a', accent: '#e10600', accent2: '#ffffff', ink: '#ffffff', card: '#161617', panelEdge: '#2c2c2e' }),
    stats(cv, S, P) {
        cv.quad([[0, 48], [720, 48], [470, 520], [0, 520]], P.accent);
        T(cv, 'GEAR', 56, 92, 20, '#ffffff', { font: 'bold', spacing: 4 });
        T(cv, S.gear, 250, 470, 400, '#ffffff', { font: gearFont(S.gear), align: 'center' });
        if (S.split != null) T(cv, 'AWD  ·  ' + (100 - S.split) + ' / ' + S.split, 508, 498, 22, '#ffffff', { font: 'bold', spacing: 2 });
        [S.rpm, S.power, S.boost, S.torque, S.oil, S.coolant].forEach((r, i) => {
            const x = 790 + (i % 2) * 400, y = 176 + Math.floor(i / 2) * 112, w = tw(cv, r.s, 84, { font: 'num' });
            T(cv, r.s, x, y, 84, '#ffffff', { font: 'num' }); T(cv, (r.k === 'power' ? 'HP' : ((r.u || '') + ' ' + r.lab).trim()).toUpperCase(), x + w + 14, y, 18, P.dim, { font: 'bold', spacing: 2 });
            tap(cv, S, r.k, x - 12, y - 84, 384, 104);
        });
        const bx = 790, bw = 520, by = 478, bh = 16, K = 7;
        cv.quad([[bx + K, by], [bx + bw + K, by], [bx + bw, by + bh], [bx, by + bh]], withAlpha('#ffffff', 0.12));
        if (S.rev > 0) cv.quad([[bx + K, by], [bx + bw * S.rev + K, by], [bx + bw * S.rev, by + bh], [bx, by + bh]], S.rev > 0.93 ? P.warn : P.accent);
    },
    cell(cv, x, y, w, h, r, P) {
        cv.quad([[x + 14, y], [x + w + 14, y], [x + w, y + h], [x, y + h]], P.card); cv.quad([[x + 14, y], [x + 22, y], [x + 8, y + h], [x, y + h]], P.accent);
        T(cv, r.lab, x + 34, y + 34, 16, P.dim, { font: 'bold', spacing: 2 }); valUnit(cv, r, x + 34, y + h - 22, 50, '#ffffff', P.dim, 'num');
    },
};

/* ---------------------------------------------------------------- MIDNIGHT */
LOOKS.midnight = {
    name: 'Midnight', tab: 'line',
    pal: base({ bg: '#000000', text: '#ffffff', dim: '#8d939b', accent: '#ffffff', accent2: '#c7ccd3', ink: '#000000', card: '#0b0b0c', panelEdge: '#2a2a2c' }),
    stats(cv, S, P) {
        const l = withAlpha('#ffffff', 0.16);
        T(cv, 'ENGINE SPEED', 110, 150, 16, P.dim, { spacing: 6 });
        T(cv, S.rpm.s, 100, 380, 230, '#ffffff', { font: 'light' }); tap(cv, S, 'rpm', 90, 160, 700, 240);
        cv.fillRect(110, 420, 720, 2, l); cv.fillRect(110, 420, 720 * S.rev, 2, '#ffffff');
        T(cv, '0', 110, 448, 14, P.dim); T(cv, '7000 rpm', 830, 448, 14, P.dim, { align: 'right' });
        [S.boost, S.power, S.oil, { k: 'rpm', lab: 'GEAR', s: S.gear, u: '' }].forEach((r, i) => {
            const y = 150 + i * 84;
            T(cv, r.lab, 980, y, 15, P.dim, { spacing: 5 }); valUnit(cv, r, 1500, y + 4, 50, '#ffffff', P.dim, 'light', 'right');
            cv.fillRect(980, y + 26, 520, 1, l); if (r.lab !== 'GEAR') tap(cv, S, r.k, 970, y - 50, 540, 80);
        });
    },
    cell(cv, x, y, w, h, r, P) {
        cv.fillRect(x, y + h - 1, w, 1, withAlpha('#ffffff', 0.16));
        T(cv, r.lab, x + 6, y + 30, 14, P.dim, { spacing: 4 }); valUnit(cv, r, x + w - 6, y + h - 22, 50, '#ffffff', P.dim, 'light', 'right');
    },
};

/* ---------------------------------------------------------------- DECO */
LOOKS.deco = {
    name: 'Deco', tab: 'plaque',
    pal: base({ bg: '#0b0906', text: '#f6ecd2', dim: '#b89a5a', accent: '#d9b35a', accent2: '#f0d48a', ink: '#0b0906', card: '#14110b', panelEdge: '#4a3d1e' }),
    stats(cv, S, P) {
        const g = P.accent;
        for (let a = -84; a <= 84; a += 6) cv.line(800, 520, 800 + 900 * sin(a), 520 - 900 * cos(a), a % 12 === 0 ? 2 : 1, withAlpha(g, (a % 12 === 0 ? 0.16 : 0.07) + S.rev * 0.2));
        cv.arc(800, 520, 300, 303, -90, 90, withAlpha(g, 0.55)); cv.arc(800, 520, 318, 319, -90, 90, withAlpha(g, 0.25)); cv.arc(800, 520, 336, 337, -90, 90, withAlpha(g, 0.25));
        T(cv, 'ENGINE SPEED', 800, 318, 15, g, { align: 'center', spacing: 8 });
        T(cv, S.rpm.s, 800, 498, 190, P.text, { font: 'light', align: 'center', spacing: 4 }); tap(cv, S, 'rpm', 560, 300, 480, 210);
        const wing = (r, i, right) => {
            const y = 130 + i * 106, x = right ? 1530 : 70;
            T(cv, r.lab, x, y, 14, g, { spacing: 5, align: right ? 'right' : 'left' }); valUnit(cv, r, x, y + 56, 58, P.text, g, 'light', right ? 'right' : 'left');
            for (let k = 0; k < 8; k++) cv.fillRect(right ? x - 330 + k * 41 : x + k * 41, y + 70, 42, 1, withAlpha(g, right ? (k + 1) / 8 : 1 - k / 8));
            tap(cv, S, r.k, right ? x - 340 : x - 10, y - 24, 350, 100);
        };
        [S.boost, S.power, S.torque].forEach((r, i) => wing(r, i, false));
        [S.oil, S.coolant].forEach((r, i) => wing(r, i, true));
        T(cv, 'GEAR', 1530, 342, 14, g, { spacing: 5, align: 'right' }); T(cv, S.gear, 1530, 398, 58, P.text, { font: 'light', align: 'right' });
    },
    cell(cv, x, y, w, h, r, P) {
        frame(cv, x, y, w, h, 1, P.accent); frame(cv, x + 5, y + 5, w - 10, h - 10, 1, withAlpha(P.accent, 0.35));
        T(cv, r.lab, x + w / 2, y + 36, 14, P.accent, { align: 'center', spacing: 5 }); valUnit(cv, r, x + w / 2, y + h - 24, 48, P.text, P.accent, 'light', 'center');
    },
};

/* ---------------------------------------------------------------- BIG TACH */
LOOKS.bigtach = {
    name: 'Big Tach', tab: 'box',
    pal: base({ bg: '#0d0d0d', text: '#ffffff', dim: '#8a8a8a', accent: '#ff6a00', accent2: '#ffb27a', ink: '#101010', card: '#1a1a1a', panelEdge: '#333333' }),
    stats(cv, S, P) {
        const cx = 420, cy = 330, ink = '#101010';
        cv.circle(cx, cy, 284, '#1d1d1d'); cv.circle(cx, cy, 270, '#f2f0ea');
        for (let i = 0; i <= 70; i++) { const a = -120 + i * 240 / 70, r0 = i % 10 === 0 ? 226 : i % 5 === 0 ? 240 : 248; cv.line(cx + r0 * sin(a), cy - r0 * cos(a), cx + 262 * sin(a), cy - 262 * cos(a), i % 10 === 0 ? 5 : 2, i >= 65 ? '#d81e05' : ink); }
        for (let i = 0; i <= 7; i++) { const a = -120 + i * 240 / 7; T(cv, i, cx + 192 * sin(a), cy - 192 * cos(a) + 16, 46, i === 7 ? '#d81e05' : ink, { font: 'bold', align: 'center' }); }
        T(cv, 'RPM x 1000', cx, cy - 128, 17, ink, { font: 'bold', align: 'center', spacing: 4 });
        cv.roundRect(cx - 80, cy + 76, 160, 66, 8, ink); T(cv, S.rpm.s, cx, cy + 127, 50, P.accent, { font: 'num', align: 'center' });
        const a = -120 + S.rev * 240; cv.line(cx - 44 * sin(a), cy + 44 * cos(a), cx + 232 * sin(a), cy - 232 * cos(a), 10, P.accent); cv.circle(cx, cy, 25, ink);
        tap(cv, S, 'rpm', cx - 270, 60, 540, 460);
        [S.boost, S.power, S.oil, S.coolant, { k: 'rpm', lab: 'GEAR', s: S.gear, u: '' }, S.torque].forEach((r, i) => {
            const x = 800 + (i % 2) * 380, y = 110 + Math.floor(i / 2) * 126;
            T(cv, r.lab, x, y, 17, P.accent, { font: 'bold', spacing: 3 }); valUnit(cv, r, x, y + 70, 70, '#ffffff', P.dim, 'num');
            if (r.lab !== 'GEAR') tap(cv, S, r.k, x - 10, y - 24, 360, 110);
        });
    },
    cell(cv, x, y, w, h, r, P) {
        cv.roundRect(x, y, w, h, 18, '#f2f0ea'); T(cv, r.lab, x + 22, y + 34, 16, '#d85a00', { font: 'bold', spacing: 3 }); valUnit(cv, r, x + 22, y + h - 20, 52, '#101010', '#6b6860', 'num');
    },
};

/* ---------------------------------------------------------------- NEON */
LOOKS.neon = {
    name: 'Neon', tab: 'slantline',
    pal: base({ bg: '#1a0c3d', text: '#ffffff', dim: '#b9a7e6', accent: '#ff3ea5', accent2: '#3ef0ff', ink: '#ffffff', card: '#24104f', panelEdge: '#5a2a8a' }),
    stats(cv, S, P) {
        const pk = P.accent, aq = P.accent2, cx = 800, cy = 292;
        for (let i = 0; i < 6; i++) cv.fillRect(0, 430 + i * i * 3.4, 1600, 1, withAlpha(pk, 0.1 + i * 0.05));
        for (let i = -8; i <= 8; i++) cv.line(800 + i * 60, 430, 800 + i * 240, 520, 1, withAlpha(pk, 0.16));
        for (let a = -130; a < 130; a += 5) cv.arc(cx, cy, 170, 190, a, a + 3, a < -130 + 260 * S.rev ? pk : withAlpha(pk, 0.2));
        cv.arc(cx, cy, 150, 154, -130, 130, withAlpha(aq, 0.2)); cv.arc(cx, cy, 150, 154, -130, -130 + 260 * Math.max(0.01, S.power.fr), aq, { round: true });
        T(cv, 'RPM', cx, cy - 56, 15, aq, { font: 'bold', align: 'center', spacing: 6 });
        T(cv, S.rpm.s, cx + 2, cy + 38, 100, withAlpha(pk, 0.5), { font: 'num', align: 'center' }); T(cv, S.rpm.s, cx, cy + 36, 100, '#ffffff', { font: 'num', align: 'center' });
        T(cv, S.power.s + ' HP', cx, cy + 82, 22, pk, { font: 'bold', align: 'center', spacing: 4 }); tap(cv, S, 'rpm', cx - 190, 100, 380, 300);
        const side = (r, x, y) => { T(cv, r.lab + (r.u ? ' ' + r.u.toUpperCase() : ''), x, y, 14, pk, { font: 'bold', align: 'center', spacing: 3 }); T(cv, r.s, x, y + 48, 46, '#ffffff', { font: 'num', align: 'center' });
            frame(cv, x - 130, y - 34, 260, 100, 2, withAlpha(aq, 0.35)); if (r.lab !== 'GEAR') tap(cv, S, r.k, x - 130, y - 34, 260, 100); };
        side(S.boost, 330, 170); side(S.oil, 330, 310); side(S.torque, 1270, 170); side(S.coolant, 1270, 310);
        T(cv, 'GEAR ' + S.gear, 60, 110, 26, aq, { font: 'bold', spacing: 3 }); if (S.split != null) T(cv, 'AWD ' + (100 - S.split) + '/' + S.split, 1540, 110, 18, P.dim, { font: 'bold', spacing: 2, align: 'right' });
    },
    cell(cv, x, y, w, h, r, P) {
        cv.fillRect(x, y, w, h, withAlpha('#160a33', 0.7)); frame(cv, x, y, w, h, 2, P.accent); frame(cv, x - 2, y - 2, w + 4, h + 4, 2, withAlpha(P.accent, 0.25));
        T(cv, r.lab, x + 20, y + 34, 14, P.accent2, { font: 'bold', spacing: 4 }); valUnit(cv, r, x + 20, y + h - 22, 50, '#ffffff', P.dim, 'num');
    },
};

/* ---------------------------------------------------------------- HIVE */
LOOKS.hive = {
    name: 'Hive', tab: 'plaque',
    pal: base({ bg: '#111417', text: '#ffffff', dim: '#8b939b', accent: '#d7ff3a', accent2: '#d7ff3a', ink: '#11140a', card: '#1c2024', panelEdge: '#3a4a1a' }),
    stats(cv, S, P) {
        const lm = P.accent, dy = 78;
        hex(cv, 330, 284, 196, lm); T(cv, 'ENGINE SPEED', 330, 206, 17, P.ink, { font: 'bold', align: 'center', spacing: 3 });
        T(cv, S.rpm.s, 330, 322, 116, P.ink, { font: 'num', align: 'center' }); T(cv, 'rpm', 330, 366, 18, P.ink, { align: 'center' }); tap(cv, S, 'rpm', 150, 110, 360, 350);
        [[S.boost, 700, 284 - dy], [S.power, 700, 284 + dy], [S.oil, 834, 284 - 2 * dy], [{ k: 'rpm', lab: 'GEAR', s: S.gear, u: '' }, 834, 284], [S.coolant, 834, 284 + 2 * dy], [S.torque, 968, 284 - dy],
            [{ k: 'rpm', lab: 'AWD F/R', s: S.split == null ? '--' : (100 - S.split) + '/' + S.split, u: '' }, 968, 284 + dy]].forEach((q) => {
            const r = q[0], hot = r.fr > 0.85;
            hex(cv, q[1], q[2], 86, hot ? lm : withAlpha(lm, 0.4)); if (!hot) hex(cv, q[1], q[2], 83, P.card);
            T(cv, r.lab, q[1], q[2] - 30, 13, hot ? P.ink : lm, { font: 'bold', align: 'center', spacing: 2 });
            T(cv, r.s, q[1], q[2] + 18, r.s.length > 4 ? 36 : 48, hot ? P.ink : '#ffffff', { font: 'num', align: 'center' });
            if (r.u) T(cv, r.u, q[1], q[2] + 42, 14, hot ? P.ink : P.dim, { align: 'center' });
            if (r.lab !== 'GEAR' && r.lab !== 'AWD F/R') tap(cv, S, r.k, q[1] - 70, q[2] - 70, 140, 140);
        });
    },
    cell(cv, x, y, w, h, r, P) {
        const k = 26, hot = r.fr > 0.85, c = hot ? P.accent : P.card;
        cv.quad([[x + k, y], [x + w - k, y], [x + w, y + h / 2], [x, y + h / 2]], c); cv.quad([[x, y + h / 2], [x + w, y + h / 2], [x + w - k, y + h], [x + k, y + h]], c);
        T(cv, r.lab, x + w / 2, y + 34, 14, hot ? P.ink : P.accent, { font: 'bold', align: 'center', spacing: 3 }); valUnit(cv, r, x + w / 2, y + h - 22, 48, hot ? P.ink : '#ffffff', hot ? P.ink : P.dim, 'num', 'center');
    },
};

/* ---------------------------------------------------------------- COMIC */
LOOKS.comic = {
    name: 'Comic', tab: 'sticker',
    kit: { bg: '#141414', text: '#ffffff', dim: '#b0b0b0', tab: '#ffffff', selText: '#ffffff', card: '#222222', panelTop: '#222222', panelBottom: '#141414', panelEdge: '#444444', track: '#333333', ink: '#ffffff' },
    pal: base({ light: true, bg: '#ffd60a', text: '#111111', dim: '#4a4a4a', accent: '#e8202a', accent2: '#b3121a', ink: '#ffffff', card: '#ffffff', panelEdge: '#111111', warn: '#b34700', ok: '#1c7a3c', cold: '#1b5fa8', crit: '#b3121a' }),
    stats(cv, S, P) {
        const ink = '#111111', star = (cx, cy, k, c) => { const p = []; for (let i = 0; i < 24; i++) { const r = (i % 2 ? 0.7 : 1) * k; p.push([cx + r * 1.12 * cos(i * 15), cy + r * sin(i * 15)]); }
            // each point is one piece reaching into the middle; a disc over the middle hides where the pieces meet
            for (let i = 0; i < 24; i += 2) cv.quad([[cx, cy], p[(i + 23) % 24], p[i], p[(i + 1) % 24]], c);
            for (let a = 0; a < 360; a += 30) cv.quad([[cx, cy], [cx + 0.69 * k * 1.12 * cos(a - 16), cy + 0.69 * k * sin(a - 16)], [cx + 0.72 * k * 1.12 * cos(a), cy + 0.72 * k * sin(a)], [cx + 0.69 * k * 1.12 * cos(a + 16), cy + 0.69 * k * sin(a + 16)]], c);
            cv.circle(cx, cy, 0.62 * k, c); };
        for (let yy = 70; yy < 520; yy += 34) for (let xx = 20 + (yy % 68 ? 17 : 0); xx < 1600; xx += 34) cv.fillRect(xx, yy, 5, 5, withAlpha('#000000', 0.13));
        star(300, 276, 176 + S.power.fr * 20, ink); star(300, 276, 164 + S.power.fr * 20, P.accent);
        T(cv, S.power.s, 300, 300, 118, '#ffffff', { font: 'gear', align: 'center' });
        T(cv, 'HP!', 300, 346, 38, '#ffffff', { font: 'bold', align: 'center', spacing: 2 }); tap(cv, S, 'power', 120, 110, 360, 330);
        const panel = (r, x, y, w, h, bg) => { cv.fillRect(x + 9, y + 9, w, h, ink); cv.fillRect(x, y, w, h, bg); frame(cv, x, y, w, h, 5, ink);
            T(cv, r.lab, x + 22, y + 40, 21, bg === '#ffffff' ? P.accent : ink, { font: 'bold', spacing: 2 }); valUnit(cv, r, x + 22, y + h - 24, h > 150 ? 92 : 76, ink, ink, 'num'); if (r.lab !== 'GEAR') tap(cv, S, r.k, x, y, w, h); };
        panel(S.rpm, 600, 84, 470, 172, '#ffffff'); panel(S.boost, 1100, 84, 450, 172, '#37c8f5');
        panel(S.oil, 600, 286, 300, 150, '#ffffff'); panel({ k: 'rpm', lab: 'GEAR', s: S.gear, u: '' }, 930, 286, 240, 150, '#ffffff'); panel(S.coolant, 1200, 286, 350, 150, '#ffffff');
    },
    cell(cv, x, y, w, h, r, P, i) {
        const ink = '#111111', bg = i % 5 === 1 ? '#37c8f5' : '#ffffff';
        cv.fillRect(x + 7, y + 7, w, h, ink); cv.fillRect(x, y, w, h, bg); frame(cv, x, y, w, h, 4, ink);
        T(cv, r.lab, x + 18, y + 34, 16, bg === '#ffffff' ? P.accent : ink, { font: 'bold', spacing: 2 }); valUnit(cv, r, x + 18, y + h - 20, 50, ink, ink, 'num');
    },
};

/* ---------------------------------------------------------------- LCD WATCH */
LOOKS.lcd = {
    name: 'LCD Watch', tab: 'key',
    kit: { bg: '#1b1d20', text: '#e8eaec', dim: '#9aa0a6', tab: '#e8eaec', selText: '#ffffff', sel: '#b8c4a8', accent: '#b8c4a8', accent2: '#b8c4a8', card: '#2b2f33', panelTop: '#2b2f33', panelBottom: '#1b1d20', panelEdge: '#4a4f55', track: '#3a3f44', ink: '#1d241a' },
    pal: base({ light: true, bg: '#b8c4a8', text: '#1d241a', dim: '#4a5644', accent: '#1d241a', accent2: '#1d241a', ink: '#b8c4a8', card: '#aab69a', panelEdge: '#6f7b66', warn: '#5c3a00', ok: '#1d4a24', cold: '#1d3a5c', crit: '#6b1410' }),
    stats(cv, S, P) {
        const sg = P.accent, gh = withAlpha(sg, 0.07);
        cv.roundRect(34, 62, 1532, 386, 16, '#2b2f33'); cv.roundRect(42, 70, 1516, 370, 10, '#c2cdb3');
        T(cv, 'ENGINE SPEED · RPM', 70, 104, 15, sg, { font: 'bold', spacing: 3 });
        seg7(cv, ('    ' + S.rpm.s).slice(-4), 70, 118, 190, sg, gh); tap(cv, S, 'rpm', 60, 80, 560, 240);
        for (let i = 0; i < 18; i++) { const bh = 40 + i * 7; cv.fillRect(640 + i * 34, 308 - bh, 27, bh, i < Math.round(S.rev * 18) ? sg : withAlpha(sg, 0.13)); }
        T(cv, 'GEAR', 1530, 104, 15, sg, { font: 'bold', spacing: 3, align: 'right' }); seg7(cv, S.gear, 1530 - seg7w(S.gear, 170), 122, 170, sg, gh);
        cv.fillRect(60, 326, 1480, 2, withAlpha(sg, 0.35));
        [S.boost, S.power, S.oil, S.coolant, S.torque].forEach((r, i) => {
            const x = 70 + i * 298; if (i) cv.fillRect(x - 16, 340, 2, 88, withAlpha(sg, 0.35));
            T(cv, r.lab + (r.u ? '  ' + r.u.toUpperCase() : ''), x, 356, 14, sg, { font: 'bold', spacing: 3 }); seg7(cv, r.s, x, 368, 58, sg, gh); tap(cv, S, r.k, x - 10, 336, 290, 100);
        });
    },
    cell(cv, x, y, w, h, r, P) {
        cv.roundRect(x, y, w, h, 8, P.card); frame(cv, x, y, w, h, 2, withAlpha(P.accent, 0.4));
        T(cv, r.lab + (r.u ? '  ' + r.u.toUpperCase() : ''), x + 18, y + 30, 13, P.accent, { font: 'bold', spacing: 3 }); seg7(cv, r.s, x + 18, y + 46, h - 66, P.accent, withAlpha(P.accent, 0.07));
    },
};

/* ---------------------------------------------------------------- RALLY */
LOOKS.rally = {
    name: 'Rally', tab: 'box',
    kit: { bg: '#23281b', text: '#e3d7b5', dim: '#b3aa8a', tab: '#e3d7b5', selText: '#ffffff', accent2: '#e3d7b5', card: '#2f3524', panelTop: '#2f3524', panelBottom: '#23281b', panelEdge: '#5f654f', track: '#3a4130', ink: '#23281b' },
    pal: base({ light: true, bg: '#e3d7b5', text: '#2f3524', dim: '#5f654f', accent: '#ff6a1a', accent2: '#2f3524', ink: '#2f3524', card: '#d6c9a3', panelEdge: '#2f3524', warn: '#a33d00', ok: '#2c6b2f', cold: '#28507a', crit: '#a31a10' }),
    stats(cv, S, P) {
        const ol = P.text, sd = P.bg, og = P.accent;
        [S.rpm, S.boost, S.power, S.torque].forEach((r, i) => {
            const y = 96 + i * 88; T(cv, i ? r.lab : 'ENGINE SPEED', 60, y, 17, ol, { font: 'bold', spacing: 3 }); valUnit(cv, r, 720, y + 4, 44, ol, ol, 'num', 'right');
            frame(cv, 60, y + 16, 660, 24, 2, ol); cv.fillRect(60, y + 16, 660 * (i ? r.fr : S.rev), 24, ol);
            for (let k = 1; k < 20; k++) cv.fillRect(60 + k * 33, y + 16, 2, k % 5 ? 10 : 24, withAlpha(k * 33 < 660 * (i ? r.fr : S.rev) ? sd : ol, 0.5));
            tap(cv, S, r.k, 50, y - 30, 680, 76);
        });
        cv.fillRect(770, 48, 12, 472, ol);
        frame(cv, 830, 84, 330, 330, 4, ol); T(cv, 'GEAR', 995, 122, 17, ol, { font: 'bold', align: 'center', spacing: 3 }); T(cv, S.gear, 995, 372, 250, ol, { font: gearFont(S.gear), align: 'center' });
        [S.oil, S.coolant].forEach((r, i) => { const y = 84 + i * 172; cv.fillRect(1190, y, 350, 158, ol); T(cv, r.lab === 'WATER' ? 'COOLANT' : r.lab, 1210, y + 36, 16, sd, { font: 'bold', spacing: 3 }); valUnit(cv, r, 1210, y + 122, 78, sd, sd, 'num'); tap(cv, S, r.k, 1190, y, 350, 158); });
        for (let k = 0; k < 11; k++) cv.quad([[830 + k * 44 + 14, 432], [830 + k * 44 + 36, 432], [830 + k * 44 + 22, 452], [830 + k * 44, 452]], k % 2 ? ol : og);
    },
    cell(cv, x, y, w, h, r, P) {
        frame(cv, x, y, w, h, 3, P.text); cv.fillRect(x, y, 46, h, P.text); T(cv, r.n || '', x + 23, y + h / 2 + 9, 24, P.bg, { font: 'bold', align: 'center' });
        T(cv, r.lab, x + 62, y + 34, 15, P.text, { font: 'bold', spacing: 3 }); valUnit(cv, r, x + 62, y + h - 20, 50, P.text, P.dim, 'num');
    },
};

/* ---------------------------------------------------------------- 8-BIT */
LOOKS.pixel = {
    name: '8-Bit', tab: 'slot',
    pal: base({ bg: '#05082e', text: '#ffffff', dim: '#9aa3e0', accent: '#ffd23f', accent2: '#7fd4ff', ink: '#05082e', card: '#10196b', panelEdge: '#ffffff' }),
    stats(cv, S, P) {
        const win = (x, y, w, h) => { cv.fillRect(x, y, w, h, P.card); frame(cv, x, y, w, h, 4, '#ffffff'); };
        win(40, 76, 640, 362); T(cv, 'ENGINE SPEED', 66, 116, 18, P.accent, { font: 'bold', spacing: 3 });
        pix(cv, S.rpm.s, 66, 150, 26, '#ffffff'); tap(cv, S, 'rpm', 40, 76, 640, 362);
        for (let i = 0; i < 20; i++) cv.fillRect(66 + i * 29.6, 340, 24, 34, i < Math.round(S.rev * 20) ? (i >= 17 ? '#ff4d4d' : '#3ddc55') : '#27307f');
        T(cv, '0', 66, 404, 14, P.dim, { font: 'bold' }); T(cv, '7000 RPM', 654, 404, 14, P.dim, { font: 'bold', align: 'right' });
        win(710, 76, 250, 362); T(cv, 'GEAR', 835, 116, 18, P.accent, { font: 'bold', align: 'center', spacing: 3 }); pix(cv, S.gear, 835 - pixw(S.gear, 44) / 2, 150, 44, '#ffffff');
        if (S.split != null) T(cv, 'AWD ' + (100 - S.split) + '/' + S.split, 835, 412, 15, P.dim, { font: 'bold', align: 'center', spacing: 1 });
        win(990, 76, 570, 362); T(cv, 'STATUS', 1016, 116, 18, P.accent, { font: 'bold', spacing: 3 });
        [S.boost, S.power, S.torque, S.oil, S.coolant].forEach((r, i) => {
            const y = 140 + i * 58; T(cv, r.lab, 1016, y + 32, 20, P.accent2, { font: 'bold', spacing: 2 });
            const u = (r.u || '').toUpperCase(), uw = tw(cv, u, 14, { font: 'bold' }); T(cv, u, 1534, y + 32, 14, P.dim, { font: 'bold', align: 'right' });
            pix(cv, r.s, 1534 - uw - 14 - pixw(r.s, 8), y, 8, '#ffffff'); tap(cv, S, r.k, 1000, y - 10, 550, 56);
        });
    },
    cell(cv, x, y, w, h, r, P) {
        cv.fillRect(x, y, w, h, P.card); frame(cv, x, y, w, h, 4, '#ffffff');
        T(cv, r.lab, x + 20, y + 34, 15, P.accent, { font: 'bold', spacing: 2 }); pix(cv, r.s, x + 20, y + 52, 9, '#ffffff'); if (r.u) T(cv, r.u.toUpperCase(), x + w - 18, y + h - 18, 13, P.dim, { font: 'bold', align: 'right' });
    },
};

const ORDER = ['slash', 'midnight', 'deco', 'bigtach', 'neon', 'hive', 'comic', 'lcd', 'rally', 'pixel'];

/** The tab bar along the top, drawn in the look's own shape. Leaves cv.tabRects for touch. */
function header(cv, id, tabs, sel, badges, W) {
    const L = LOOKS[id], P = L.pal, kind = L.tab, names = tabs.map((n) => n.toUpperCase()), opt = { font: 'bold', spacing: 1 };
    const ws = names.map((n) => tw(cv, n, 18, opt) + (kind === 'key' || kind === 'slot' ? 36 : 40)), gap = kind === 'line' ? 4 : 6;
    cv.fillRect(0, 0, W, 48, kind === 'key' ? '#2b2f33' : P.bg);
    if (kind === 'slant') cv.quad([[0, 0], [214, 0], [190, 48], [0, 48]], P.accent);
    T(cv, 'SMILEY', 25, 35, 28, kind === 'key' ? '#e8eaec' : kind === 'slant' ? '#ffffff' : P.text, { font: 'bold', spacing: 3 });
    let x = W - 22 - ws.reduce((p, c) => p + c + gap, 0), bx = x - 18;
    (badges || []).slice().reverse().forEach((b) => { const w = tw(cv, b.text, 16, opt); bx -= w; if (bx > 230) T(cv, b.text, bx, 31, 16, kind === 'key' ? '#c9ced3' : id === 'comic' || id === 'rally' || id === 'lcd' ? P.text : b.color || P.dim, opt); bx -= 26; });
    cv.tabRects = [];
    names.forEach((n, i) => {
        const w = ws[i], on = i === sel; let fg = on ? P.ink : P.text, K = 0;
        if (kind === 'slant') { K = 14; cv.quad([[x + K, 8], [x + w + K, 8], [x + w, 40], [x, 40]], on ? '#ffffff' : withAlpha('#ffffff', 0.1)); fg = on ? P.accent : '#ffffff'; }
        else if (kind === 'slantline') { K = 12; cv.quad([[x + K, 8], [x + w + K, 8], [x + w, 40], [x, 40]], on ? P.accent2 : withAlpha(P.accent2, 0.3)); cv.quad([[x + K + 2, 10], [x + w + K - 3, 10], [x + w - 2, 38], [x + 3, 38]], P.bg); fg = on ? P.accent2 : P.dim; }
        else if (kind === 'plaque') { plaque(cv, x, 8, w, 32, on ? P.accent : withAlpha(P.accent, 0.45)); if (!on) plaque(cv, x + 2, 9.5, w - 4, 29, P.bg); fg = on ? P.ink : P.accent; }
        else if (kind === 'line') { if (on) cv.fillRect(x + 8, 42, w - 16, 3, '#ffffff'); fg = on ? '#ffffff' : P.dim; }
        else if (kind === 'sticker') { cv.fillRect(x + 4, 12, w, 32, '#111111'); cv.fillRect(x, 8, w, 32, on ? P.accent : '#ffffff'); frame(cv, x, 8, w, 32, 3, '#111111'); fg = on ? '#ffffff' : '#111111'; }
        else if (kind === 'key') { cv.roundRect(x, 11, w, 32, 7, '#0b0c0d'); cv.roundRect(x, 8, w, 32, 7, on ? '#e8eaec' : '#454a50'); fg = on ? '#111315' : '#c9ced3'; }
        else if (kind === 'slot') { cv.fillRect(x, 8, w, 32, on ? P.accent : P.card); frame(cv, x, 8, w, 32, 3, on ? P.accent : '#ffffff'); fg = on ? P.ink : '#ffffff'; }
        else { cv.fillRect(x, 8, w, 32, on ? P.accent : P.card); fg = on ? P.ink : id === 'rally' ? P.text : P.dim; }
        T(cv, n, x + w / 2 + K / 2, 31, 18, fg, Object.assign({ align: 'center' }, opt));
        cv.tabRects.push({ i, x, y: 0, w: w + K, h: 48 }); x += w + gap;
    });
}
/** More readings: every other reading, four across, each in the look's own cell. */
function more(cv, id, S) {
    const L = LOOKS[id], P = L.pal;
    if (id === 'lcd') cv.fillRect(0, 48, 1600, 472, P.bg);
    S.more.slice(0, 12).forEach((r, i) => {
        const x = 40 + (i % 4) * 385, y = 70 + Math.floor(i / 4) * 128, w = 365, h = 112;
        L.cell(cv, x, y, w, h, Object.assign({ n: String(i + 1) }, r), P, i); if (r.k) tap(cv, S, r.k, x, y, w, h);
    });
}
module.exports = { LOOKS, ORDER, header, more, seg7, pix };
