'use strict';
const G = require('./kit/gauges');
const { withAlpha } = require('./kit/canvas');
const QR = require('./qrcodegen');
const W = 1600, H = 520;
// Tabs switched off in this build. Their code stays in place; the tests turn them back on
// with SMILEY_ALL_TABS=1. A hidden page has the index -1, which no tab or button can select.
const HIDDEN = process.env.SMILEY_ALL_TABS === '1' ? [] : ['Phone', 'Connect', 'Flash'];
const ALL_TABS = [['stats', 'Live Stats'], ['xdrive', 'AWD / 2WD'], ['perf', 'Perf'], ['controls', 'Tune'], ['phone', 'Phone'],
    ['faults', 'Faults'], ['connect', 'Connect'], ['flash', 'Flash'], ['info', 'Info']];
const TABS = [], PAGE = {};
ALL_TABS.forEach((t) => { if (HIDDEN.indexOf(t[1]) >= 0) PAGE[t[0]] = -1; else { PAGE[t[0]] = TABS.length; TABS.push(t[1]); } });
// Two colour themes. THEME is the one in use: setTheme() copies a palette into it, so every page
// reads the same object and a change in Settings shows on the next frame.
const PALETTES = {
    smiley: { name: 'SMILEY', bg: '#0a0908', panelTop: '#1a1711', panelBottom: '#12100c', panelEdge: '#3b3222',
        text: '#f5f0e6', dim: '#a59c89', track: '#2a261c', tick: '#7f755f', tab: '#f5f0e6', accent: '#c9a55c', accent2: '#ead9a8',
        sel: '#c9a55c', selText: '#f5f0e6', crit: '#e2675c', warn: '#e3ad55', ok: '#86c3a0', cold: '#a9bfd0',
        stripes: ['#8c6b2e','#c9a55c','#f1e2b6'], ramp: ['#8c6b2e','#c9a55c','#f1e2b6'], hotRamp: ['#f1e2b6','#c9a55c','#e89a3c','#e2574c'],
        card: '#15130f', ink: '#15110a', off: '#6f6756', noticeBg: '#2a2314' },
    // soft red on deep navy, with a soft blue for the second colour
    spider: { name: 'SPIDER', bg: '#090c15', panelTop: '#171c2c', panelBottom: '#0f1320', panelEdge: '#2b3452',
        text: '#f1f3f8', dim: '#98a2b8', track: '#222a40', tick: '#6b7691', tab: '#f1f3f8', accent: '#e0646b', accent2: '#a9c2ee',
        sel: '#e0646b', selText: '#f1f3f8', crit: '#ff4d57', warn: '#f0b660', ok: '#86c3a0', cold: '#8fb2e6',
        stripes: ['#3f6fc0','#8fb2e6','#e0646b'], ramp: ['#3f6fc0','#8fb2e6','#e0646b'], hotRamp: ['#8fb2e6','#b9a0d0','#e0646b','#ff3b47'],
        card: '#111626', ink: '#1a090b', off: '#5d6680', noticeBg: '#2a1a22' },
};
// More looks, each built from a background, two colours and a gauge ramp, so they stay consistent.
function look(name, o) {
    return { name, bg: o.bg, panelTop: o.panel, panelBottom: o.bg2, panelEdge: o.edge, text: o.text || '#f2f4f7', dim: o.dim, track: o.track, tick: o.tick,
        tab: o.text || '#f2f4f7', accent: o.a, accent2: o.b, sel: o.a, selText: o.text || '#f2f4f7', crit: o.crit || '#ff5a55', warn: o.warn || '#f0b660', ok: '#86c3a0', cold: o.cold || o.b,
        stripes: o.ramp, ramp: o.ramp, hotRamp: o.hot, card: o.card, ink: o.ink, off: o.off, noticeBg: o.notice };
}
Object.assign(PALETTES, {
    // light blue, dark blue and red on black
    s_m: look('MOTORSPORT', { bg: '#07090d', bg2: '#0c1017', panel: '#151b26', card: '#0f141d', edge: '#27344a', dim: '#93a0b5', track: '#1f2838', tick: '#63718a',
        a: '#6fb8f5', b: '#c9d6e6', cold: '#6fb8f5', crit: '#ff4a52', ramp: ['#6fb8f5','#2a6fb5','#e8353f'], hot: ['#6fb8f5','#3f86d0','#2a6fb5','#e8353f'], ink: '#06121f', off: '#566277', notice: '#2a1820' }),
    // a dark green with a warm gold
    s_green: look('RACING GREEN', { bg: '#060a08', bg2: '#0a100c', panel: '#121c16', card: '#0d1410', edge: '#26392e', text: '#eef3ea', dim: '#93a596', track: '#1b2920', tick: '#617565',
        a: '#3fae7a', b: '#d9c58c', cold: '#a6d3bb', ramp: ['#1c6b47','#3fae7a','#d9c58c'], hot: ['#3fae7a','#a9c57c','#e8a13c','#e2574c'], ink: '#04130b', off: '#56675a', notice: '#2a2414' }),
});
// Luxury looks: one metal or leather tone on a deep, slightly warm or cool black, with soft contrast.
Object.assign(PALETTES, {
    l_midnight: look('MIDNIGHT', { bg: '#05070d', bg2: '#090c16', panel: '#111727', card: '#0c111d', edge: '#27314d', text: '#f0f2f7', dim: '#8f99b3', track: '#1a2238', tick: '#5e6a8a',
        a: '#d4b26a', b: '#b9c6e6', cold: '#8fa8dc', ramp: ['#33477f','#8fa8dc','#d4b26a'], hot: ['#8fa8dc','#c9c0a0','#d4b26a','#e2675c'], ink: '#14100a', off: '#535d7a', notice: '#2a2314' }),
    l_burgundy: look('BURGUNDY', { bg: '#0a0607', bg2: '#100a0b', panel: '#1c1014', card: '#140b0e', edge: '#40222b', text: '#f6eeea', dim: '#ac989a', track: '#2b171c', tick: '#7d5d64',
        a: '#a8324a', b: '#e6d0a8', cold: '#e6d0a8', warn: '#e3ad55', crit: '#ff7a4a', ramp: ['#5e1a2a','#a8324a','#e6d0a8'], hot: ['#e6d0a8','#c9a55c','#c0506a','#a8324a'], ink: '#f6eeea', off: '#6b5257', notice: '#2e1c12' }),
});
// Jewel and gold: the Burgundy & Gold recipe in other colours. A deep jewel tone for what is
// selected, champagne gold for the second colour, and gauge bars that run from gold up into the jewel.
function jewel(name, o) {
    return look(name, { bg: o.bg, bg2: o.bg2, panel: o.panel, card: o.card, edge: o.edge, text: '#f6eeea', dim: o.dim, track: o.track, tick: o.tick,
        a: o.j, b: '#e6d0a8', cold: '#e6d0a8', warn: '#e3ad55', crit: '#ff7a4a', ramp: [o.deep, o.j, '#e6d0a8'], hot: ['#e6d0a8', '#c9a55c', o.lite, o.j],
        ink: '#f6eeea', off: o.off, notice: '#2e1c12' });
}
Object.assign(PALETTES, {
    j_amethyst: jewel('AMETHYST', { bg: '#08060b', bg2: '#0d0a12', panel: '#181224', card: '#110c19', edge: '#38275a', dim: '#a399b5', track: '#251a3c', tick: '#74619a', j: '#7a45c2', deep: '#46257a', lite: '#a077dc', off: '#5f557a' }),
});
// Custom: the owner picks a main colour, a second colour and a background in Settings, and the
// rest of the palette is worked out from those three, the way the jewel themes are built.
const CUSTOM_COLOURS = { gold: '#c9a55c', red: '#d8343f', burgundy: '#a8324a', orange: '#ff8a2a', green: '#1f9d6f', teal: '#1e96a0',
    blue: '#2f5fd0', sky: '#6fb8f5', purple: '#7a45c2', pink: '#e0649a', silver: '#c7ced8', white: '#f2f2f2' };
const CUSTOM_BACKS = { black: '#070707', warm: '#0a0807', navy: '#070a12', graphite: '#101114' };
const rgbOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (h1, h2, t) => { const a = rgbOf(h1), b = rgbOf(h2); return '#' + a.map((v, i) => ('0' + Math.round(v + (b[i] - v) * t).toString(16)).slice(-2)).join(''); };
function customPalette(c) {
    const A = CUSTOM_COLOURS[c && c.a] || CUSTOM_COLOURS.gold, B = CUSTOM_COLOURS[c && c.b] || CUSTOM_COLOURS.silver, BG = CUSTOM_BACKS[c && c.bg] || CUSTOM_BACKS.black;
    const r = rgbOf(A), bright = (r[0] * 299 + r[1] * 587 + r[2] * 114) / 1000 > 140;
    return look('CUSTOM ' + [c && c.a, c && c.b, c && c.bg].join(' '), { bg: BG, bg2: mix(BG, '#ffffff', 0.03), panel: mix(BG, A, 0.10), card: mix(BG, A, 0.05), edge: mix(BG, A, 0.30),
        text: '#f5f2ee', dim: mix(BG, '#ffffff', 0.60), track: mix(BG, A, 0.17), tick: mix(BG, '#ffffff', 0.42), a: A, b: mix(B, '#ffffff', 0.25), cold: mix(B, '#ffffff', 0.25),
        ramp: [mix(A, BG, 0.5), A, B], hot: [B, mix(A, B, 0.5), mix(A, '#ffffff', 0.25), A], ink: bright ? '#12100c' : '#f5f2ee', off: mix(BG, '#ffffff', 0.36), notice: mix(BG, '#e3ad55', 0.16) });
}
PALETTES.custom = customPalette(null);
// the car's own header and frame are drawn by the kit from its theme table: give it the same colours
try { const KT = require('./kit/themes'); Object.keys(PALETTES).forEach((id) => { KT.THEMES[id] = PALETTES[id]; }); } catch (e) { /* previews without the kit */ }
const THEME = Object.assign({ id: 'smiley' }, PALETTES.smiley);
function setTheme(id, custom) {
    if (!PALETTES[id]) id = 'smiley';
    if (id === 'custom') {
        // the three choices are part of the id, so a change in Settings repaints everything, cached layers too
        const key = 'custom|' + [custom && custom.a, custom && custom.b, custom && custom.bg].join('|');
        if (THEME.id !== key) { Object.assign(PALETTES.custom, customPalette(custom)); Object.assign(THEME, PALETTES.custom, { id: key }); }
        return;
    }
    if (THEME.id !== id) Object.assign(THEME, PALETTES[id], { id });
}
function text(cv, s, x, y, size, color, opts) { cv.text(s, x, y, size, color || THEME.text, Object.assign({ font: 'label' }, opts)); }
/** A card: a dark panel with a hairline champagne edge. */
function card(cv,x,y,w,h,r) { cv.roundRect(x,y,w,h,r,THEME.card); cv.strokeRoundRect(x,y,w,h,r,1,withAlpha(THEME.accent,0.16)); }
/**
 * A button: a rectangle with rounded corners. Selected = filled champagne with dark lettering;
 * otherwise a dark face with a fine gold outline; unavailable = dimmed, nothing to press.
 * Kept visible in the software preview too. HMI fallback actions live in main.js.
 */
function button(cv,x,y,w,label,run,key,on,disabled) {
    const h=50, r=9, t=String(label).toUpperCase();
    if(on){
        cv.roundRect(x,y,w,h,r,withAlpha(THEME.accent,disabled?0.45:1));
        cv.roundRect(x+1.5,y+1.5,w-3,h/2-1.5,r-1.5,withAlpha('#ffffff',disabled?0.04:0.14));      // a soft sheen on the upper half
    } else {
        cv.roundRect(x,y,w,h,r,withAlpha('#ffffff',disabled?0.025:0.055));
        cv.strokeRoundRect(x,y,w,h,r,1.5,withAlpha(THEME.accent,disabled?0.14:0.5));
    }
    cv.text(t,x+w/2,y+h/2+7.5,20,on?THEME.ink:disabled?THEME.off:THEME.text,{align:'center',font:'bold',spacing:1.5});
    if(!disabled&&run&&cv.target)cv.target(x,y,w,h,run,key||label);
}
/*
 * Pixel icons: 11 x 11 bitmaps drawn as small squares, one per page title.
 */
const ICONS = {
    tune: ['.....#.....','.....#.....','.#...#...#.','.#...#...#.','.#..###..#.','###.###.###','###..#...#.','.#...#...#.','.#...#...#.','.#...#...#.','.#.........'],
    fault: ['.....#.....','....###....','....#.#....','...##.##...','...#.#.#...','..##.#.##..','..#..#..#..','.##.....##.','.#...#...#.','###########','...........'],
    awd: ['##.......##','##.......##','##.......##','.#########.','.....#.....','.....#.....','.....#.....','.#########.','##.......##','##.......##','##.......##'],
    perf: ['##.##.##.#.','##.##.##.#.','#.##.##.##.','#.##.##.##.','##.##.##.#.','##.##.##.#.','#..........','#..........','#..........','#..........','#..........'],
    phone: ['..#######..','..#.....#..','..#.....#..','..#.....#..','..#.....#..','..#.....#..','..#.....#..','..#.....#..','..#######..','..#..#..#..','..#######..'],
    light: ['...#####...','..#.....#..','.#.......#.','.#.......#.','.#.......#.','..#.....#..','...#...#...','...#####...','...#####...','....###....','...........'],
};
function pix(cv, name, x, y, cell, color) {
    const rows = ICONS[name]; if (!rows) return 0;
    for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        for (let c = 0; c < row.length; c++) {
            if (row[c] !== '#') continue;
            let n = 1; while (c + n < row.length && row[c + n] === '#') n++;      // one bar per run of squares
            cv.fillRect(x + c * cell, y + r * cell, n * cell, cell, color);
            c += n - 1;
        }
    }
    return rows[0].length * cell;
}
/** A page title with its pixel icon. */
function titled(cv, label, icon) { pix(cv, icon, 44, 71, 3, THEME.accent); text(cv, label, 90, 100, 30, THEME.text, { font: 'bold', spacing: 1 }); }
function heading(cv, label, sub, icon) {
    if (icon) titled(cv, label, icon); else text(cv,label,44,100,30,THEME.text,{font:'bold',spacing:1});
    text(cv,sub,44,130,19,THEME.dim);
}
function draw(cv, v, act) {
    setTheme(v.theme,v.custom);
    cv.clear(THEME.bg);
    const badges=[{text:v.demo?'DEMO':v.paused?'PAUSED':'SMILEY',color:v.demo?THEME.warn:THEME.accent}];
    if(cv.chrome)G.frame(cv,THEME,TABS,v.page,badges);
    else{G.header(cv,THEME,190,0,1410,48,'',TABS,v.page,badges,true,false);text(cv,'SMILEY',25,35,28,THEME.text,{font:'bold',spacing:3});}
    if(v.page===PAGE.stats) stats(cv,v,act);
    if(v.page===PAGE.xdrive) xdrivePage(cv,v,act);
    if(v.page===PAGE.perf) perf(cv,v,act);
    if(v.page===PAGE.controls) maps(cv,v,act);
    if(v.page===PAGE.phone) phone(cv,v,act);
    if(v.page===PAGE.faults) faults(cv,v,act);
    if(v.page===PAGE.info) info(cv,v);
    if(v.page===PAGE.connect||v.page===PAGE.flash){
        if(v.betaGate) betaPage(cv,v,act);
        else if(v.page===PAGE.connect)connectPage(cv,v,act);
        else flashPage(cv,v,act);
    }
    if(v.notice) { cv.fillRect(24,475,1552,39,THEME.noticeBg); text(cv,v.notice.slice(0,135),44,501,19,THEME.warn); }
    else watermark(cv,v);
}
// Uses the current palette, fonts, card and button helpers, just like the original pages.
function clipped(cv,s,x,y,size,color,width,opts) {
    let t=String(s||'--');
    while(t.length>2&&cv.textWidth(t,size,Object.assign({font:'label'},opts))>width)t=t.slice(0,-2)+'…';
    text(cv,t,x,y,size,color,opts);
}
function betaPage(cv,v,a) {
    const name=v.page===PAGE.connect?'CONNECT':'FLASH';
    heading(cv,name+'  /  BETA','Read this before using the new feature.','fault');
    card(cv,44,158,1512,236,16);
    text(cv,'NOT TESTED ON A CAR',76,207,28,THEME.warn,{font:'bold',spacing:1});
    text(cv,'This new '+name.toLowerCase()+' feature has only been tested in computer simulations.',76,251,23,THEME.text);
    text(cv,'It is based on experimental BeeM-style functionality. Compatibility with your ECU is not verified.',76,292,21,THEME.dim);
    text(cv,name==='FLASH'?'An interrupted or incorrect ECU flash can leave the car unable to start.':'A diagnostic connection can interfere with other tuning and diagnostic tools.',76,332,21,THEME.dim);
    text(cv,'No verified BMW programming adapter is included. Live ECU flashing stays locked in this build.',76,371,20,THEME.accent2);
    button(cv,44,418,260,'Back',a.betaBack,'betaBack',false,false);
    button(cv,1000,418,556,'I understand - continue',a.betaContinue,'betaContinue',true,false);
    text(cv,'BETA  ·  This warning appears each time you enter Connect or Flash.',44,500,18,THEME.warn);
}
function connectPage(cv,v,a) {
    const f=v.flash, id=f.identity||{};
    heading(cv,'CONNECT  /  BETA',f.demo?'Simulation · no network connection or vehicle commands':'Not vehicle-tested · a dedicated diagnostic connection.','phone');
    card(cv,44,158,648,240,16); card(cv,716,158,840,240,16);
    cv.roundRect(72,187,12,12,6,f.connected?THEME.ok:THEME.dim);
    text(cv,f.busy?'CONNECTING':f.connected?'ECU IDENTIFIED':'DISCONNECTED',100,201,21,f.connected?THEME.ok:THEME.accent2,{font:'bold',spacing:1});
    clipped(cv,f.endpoint,72,254,29,THEME.text,590,{font:'bold'});
    text(cv,f.target,72,294,20,THEME.dim);
    text(cv,f.demo?'A fictional ECU for testing the complete flow.':'Gateway and ECU addresses come from your setup file.',72,345,18,THEME.dim);
    text(cv,f.demo?'Your car is never contacted in Demo mode.':'Uses DoIP. It is not an MHD phone connection.',72,375,18,THEME.dim);
    text(cv,'VEHICLE IDENTITY',744,201,20,THEME.accent2,{font:'bold',spacing:1});
    clipped(cv,id.vin||'Waiting for ECU identification',744,253,29,THEME.text,780,{font:'bold'});
    text(cv,'HARDWARE',744,301,16,THEME.dim,{font:'bold'});clipped(cv,id.hardware,924,301,20,THEME.text,600);
    text(cv,'SOFTWARE',744,343,16,THEME.dim,{font:'bold'});clipped(cv,id.software,924,343,20,THEME.text,600);
    button(cv,44,418,260,f.connected?'Disconnect':f.demo?'Connect demo':'Connect ECU',a.flashConnect,'flashConnect',!f.connected,f.busy||f.recovery);
    button(cv,320,418,260,'Open Flash',a.openFlash,'openFlash',false,f.busy);
    button(cv,596,418,322,'Resume diagnostics',a.flashResume,'flashResume',false,f.busy||f.connected||!v.paused||f.recovery);
    clipped(cv,f.connectionError||(f.recovery?'An unfinished flash needs recovery review.':f.connected&&!f.demo?'Other SMILEY diagnostics stay paused while connected.':f.demo?'Demo uses the same checks and progress workflow.':'Place your connection setup in flash/connect.json before connecting.'),44,500,19,f.connectionError||f.recovery?THEME.warn:THEME.dim,1500);
}
function flashPage(cv,v,a) {
    const f=v.flash;
    heading(cv,'FLASH  /  BETA',f.demo?'Simulation · a fictional calibration, kept entirely in memory':'Not vehicle-tested · a verified ECU adapter and matching calibration are required.','tune');
    card(cv,44,158,648,235,16); card(cv,716,158,840,235,16);
    text(cv,'CALIBRATION',72,195,18,THEME.accent2,{font:'bold',spacing:1});
    clipped(cv,f.file,72,240,29,THEME.text,590,{font:'bold'});
    clipped(cv,f.label,72,274,19,THEME.dim,590);
    text(cv,f.size==null?'File size and SHA-256 checked on load':(f.size/1024).toFixed(1)+' KB  ·  SHA-256 matched',72,309,18,f.fileChecked?THEME.ok:THEME.dim);
    text(cv,f.hash?f.hash.slice(0,32):'No file selected',72,343,17,THEME.dim);
    if(f.hash)text(cv,f.hash.slice(32),72,368,17,THEME.dim);
    clipped(cv,f.phase,744,200,23,THEME.text,660,{font:'bold'});
    text(cv,f.percent+'%',1526,200,26,THEME.accent2,{font:'num',align:'right'});
    cv.roundRect(744,220,782,9,4,THEME.track);
    if(f.percent)cv.roundRect(744,220,782*f.percent/100,9,4,THEME.accent);
    [['ECU identified',f.connected],['File matches ECU',f.matched],['Programming adapter',f.supported]].forEach((r,i)=>{
        const x=744+i*262;
        cv.roundRect(x,259,9,9,4,r[1]?THEME.ok:THEME.off);
        text(cv,r[0],x+19,269,17,r[1]?THEME.text:THEME.dim);
    });
    clipped(cv,f.error||(f.programming?'Programming in progress. Do not disconnect.':f.percent===100?'Completed and disconnected.':f.reasons[0]||(f.confirmation?'Press Confirm flash within 15 seconds.':'Ready for ECU preflight checks.')),744,321,19,f.error?THEME.crit:f.ready||f.percent===100?THEME.ok:THEME.warn,780);
    text(cv,f.programming?'Keep power and connection stable.':'Park  ·  Engine off  ·  Ignition on  ·  Stable power',744,366,18,THEME.dim);
    button(cv,44,418,260,f.demo?'Load demo file':'Load calibration',a.flashLoad,'flashLoad',false,f.busy||f.recovery);
    button(cv,320,418,380,f.demo?'Simulated power':f.power?'Power confirmed':'Confirm power supply',a.flashPower,'flashPower',f.power,f.busy);
    button(cv,716,418,260,'Connection',a.openConnect,'openConnect',false,f.busy);
    button(cv,992,418,564,f.busy?'Programming...':f.confirmation?'Confirm flash':f.demo?'Simulate flash':'Review flash',a.flashStart,'flashStart',true,!f.ready);
    text(cv,f.demo?'SIMULATION ONLY  ·  Nothing is written to your car.':f.recovery?'Programming stopped. Keep diagnostics paused and follow the ECU recovery procedure.':'This build includes no verified BMW programming adapter. Live flashing stays locked.',44,500,18,f.demo?THEME.accent2:THEME.warn);
}
function stats(cv,v,a) {
    const d=v.stats, f=v.tempUnit==='f', temp=(n)=>n==null?null:f?n*1.8+32:n, psi=v.pressUnit==='psi', pf=psi?14.5038:1, tU=f?'°F':'°C', pU=psi?'psi':'bar';
    const press=(n)=>n==null?null:n*pf, lbft=v.torqueUnit==='lbft', tq=(n)=>n==null?null:lbft?n*0.73756:n;
    // [label, value, unit, min, max, decimals, peak key, value -> shown]
    // One scale per dial, the same on every car: wide enough for a stock or a tuned engine, so a
    // needle's position always means the same thing. (Scales learned from the car moved about.)
    const R={
        rpm:[0,8000], boost:psi?[-15,35]:[-1,2.5],
        oil:f?[100,300]:[40,150], coolant:f?[100,260]:[40,130], iat:f?[0,200]:[-20,100], trim:[-25,25],
        hpfp:psi?[0,6000]:[0,400], timing:[-30,60], lambda:[0.5,2],
        lpfp:psi?[0,120]:[0,8], oilp:psi?[0,120]:[0,8], load:[0,200], torque:lbft?[0,600]:[0,800],
    };
    // every gauge the app has, by id; the owner chooses which sit on which page (layout.js)
    const DEF={
        rpm:['RPM',d.rpm,'rpm',R.rpm[0],R.rpm[1],0,'rpm',(n)=>n], boost:['BOOST',press(d.boost),pU,R.boost[0],R.boost[1],1,'boost',press],
        oil:['OIL TEMP',temp(d.oil),tU,R.oil[0],R.oil[1],0,'oil',temp], coolant:['COOLANT',temp(d.coolant),tU,R.coolant[0],R.coolant[1],0,'coolant',temp],
        iat:['INTAKE TEMP',temp(d.iat),tU,R.iat[0],R.iat[1],0,'iat',temp], stft1:['FUEL TRIM 1',d.stft1,'%',R.trim[0],R.trim[1],1,'stft1',(n)=>n],
        stft2:['FUEL TRIM 2',d.stft2,'%',R.trim[0],R.trim[1],1,'stft2',(n)=>n], hpfp:['HIGH FUEL PRESS',press(d.hpfp),pU,R.hpfp[0],R.hpfp[1],0,'hpfp',press],
        timing:['TIMING',d.timing,'deg',R.timing[0],R.timing[1],1,'timing',(n)=>n], lambda:['LAMBDA',d.lambda,'',R.lambda[0],R.lambda[1],2,'lambda',(n)=>n],
        lpfp:['LOW FUEL PRESS',press(d.lpfp),pU,R.lpfp[0],R.lpfp[1],psi?0:1,'lpfp',press], oilp:['OIL PRESSURE',press(d.oilp),pU,R.oilp[0],R.oilp[1],psi?0:1,'oilp',press],
        boostTarget:['BOOST TARGET',press(d.boostTarget),pU,R.boost[0],R.boost[1],1,'boostTarget',press], load:['ENGINE LOAD',d.load,'%',R.load[0],R.load[1],0,'load',(n)=>n],
        torque:['TORQUE',tq(d.torque),lbft?'lb-ft':'Nm',R.torque[0],R.torque[1],0,'torque',tq], misfire:null,
    };
    const ids=v.gauges, items=ids.map((id)=>DEF[id]), pk=d.peaks||{}, base=(v.statsPage?1:0)*8, ed=v.edit;
    // The eight cards and their names change only when the layout does: drawn once into a layer the
    // renderer keeps, so each frame sends only the needles and numbers.
    cv.blit(G.layer('smiley-tiles|'+THEME.id+'|'+ids.join(','),1552,382,(c)=>items.forEach((q,i)=>{
        const x=(i%4)*390, y=Math.floor(i/4)*196;
        card(c,x,y,376,186,14);
        text(c,q?q[0]:'MISFIRES',x+188,y+164,18,THEME.accent2,{font:'bold',align:'center'});
    }),cv.textScale),24,58);
    items.forEach((q,i)=>{
        const x=24+(i%4)*390, y=58+Math.floor(i/4)*196;
        if(ed){
            // editing: every card is a button; the picked one wears a gold frame
            if(ed.picked===base+i){cv.strokeRoundRect(x-2,y-2,380,190,15,4,THEME.accent);}
            if(cv.target)cv.target(x,y,376,186,()=>a.editTap(base+i),'slot'+i);
        }
        if(!q){misfires(cv,d,x,y);return;}
        G.radial(cv,THEME,x+188,y+76,64,{value:q[1],unit:q[2],min:q[3],max:q[4],decimals:q[5],ticks:10,tickColor:'#ffffff',tickLong:10,tickShort:6});
        if(q[1]==null)text(cv,q[6]==='stft2'?'IF FITTED':'NO DATA',x+360,y+24,12,THEME.dim,{align:'right'});
    });
    if(ed){
        text(cv,ed.picked==null?'Tap a gauge to pick it':'Tap another gauge to swap, or change this one',44,490,18,THEME.accent2);
        button(cv,620,456,220,'Change',a.editChange,'editChange',false,ed.picked==null);
        button(cv,852,456,220,v.statsPage?'Page 1':'Page 2',a.statsPage,'statsPage',false,false);
        button(cv,1084,456,240,'Default layout',a.editReset,'editReset',false,false);
        button(cv,1336,456,240,'Done',a.editDone,'editDone',true,false);
        return;
    }
    text(cv,d.boostMissingBaro?'Boost shows once the outside air pressure is read':v.demo?'Demo data  ·  Nothing is sent to the car':'Hold a gauge to move or change it',44,490,18,THEME.dim);
    button(cv,994,456,285,'Edit gauges',a.editStart,'editStart',false,false);
    button(cv,1291,456,285,v.statsPage?'Main gauges':'More gauges',a.statsPage,'statsPage',false,false);
}
/** Which gauge card (0-7) is at a point of the Live Stats page, or -1. */
function slotAt(x,y) {
    const col=Math.floor((x-24)/390), row=Math.floor((y-58)/196);
    if(col<0||col>3||row<0||row>1||x-24-col*390>376||y-58-row*196>186)return -1;
    return row*4+col;
}
function misfires(cv,d,x,y) {
    const m=d.misfires;
    text(cv,d.misfire==null?'--':String(d.misfire),x+188,y+92,64,d.misfire?THEME.crit:d.misfire===0?THEME.ok:THEME.dim,{font:'num',align:'center'});
    text(cv,m&&m.length?m.map((n,i)=>(i+1)+':'+(n==null?'-':n)).join('  '):'this drive',x+188,y+128,16,THEME.dim,{align:'center'});
    if(d.misfire==null)text(cv,'NO DATA',x+360,y+24,12,THEME.dim,{align:'right'});
}
function maps(cv,v,a) {
    heading(cv,'TUNE','Pick the tune your car already has.','tune');
    [['mhd','MHD'],['bm3','bootmod3']].forEach((q,i)=>button(cv,560+i*220,72,210,q[1],()=>a.tuner(q[0]),'tuner'+q[0],v.tune.tuner===q[0],v.busy||v.paused));
    const n=v.tune.map, accepted=n!=null?(v.tune.mapConfirmed?'Active: Map ':'Car accepted: Map ')+n:'Active map: unknown';
    text(cv,accepted,44,184,23,THEME.accent2);
    for(let i=1;i<=4;i++)button(cv,44+(i-1)*225,211,205,'Map '+i,()=>a.map(i),'map'+i,n===i,v.mapBlocked);
    text(cv,v.demo?'Demo mode: these buttons do nothing':v.tune.tuner==='off'?'Pick MHD or bootmod3 to switch maps':v.tune.tuner==='bm3'&&!v.bm3Verified?'Map switching is off: this bootmod3 tune was not recognised':v.tune.note||'Switches between maps already on the car. It does not install a tune.',44,302,19,THEME.dim);
    cv.fillRect(44,324,956,1,THEME.panelEdge);
    text(cv,'EXHAUST',44,361,24,THEME.text,{font:'bold'});
    const f=v.flap;
    const state=f.simulated?'Off':f.confirmed!=='UNKNOWN'?'Now: '+flapWord(f.confirmed):f.accepted?'Sent: '+flapWord(f.requested):'Position unknown';
    text(cv,state,245,361,21,THEME.dim);
    [['OPEN','Open'],['CLOSED','Closed'],['OEM','Stock']].forEach((q,i)=>button(cv,44+i*225,388,205,q[1],()=>a.exhaust(q[0]),'flap'+q[0],!f.simulated&&f.requested===q[0]&&f.accepted,v.busy||v.paused||v.demo||!v.exhaustEnabled));
    text(cv,v.flapNote||(v.exhaustEnabled?'Stock lets the car decide.':'Turn on Exhaust control in Settings.'),44,466,19,THEME.dim);
    button(cv,719,388,281,'Refresh',a.refresh,'refresh',false,v.busy||v.paused||v.demo);
    // flashing, with the rest of the tune: SMILEY does not flash, and steps aside for the app that does
    card(cv,1036,64,520,396,16);
    text(cv,'FLASHING A TUNE',1066,108,22,THEME.accent2,{font:'bold'});
    text(cv,'MHD / bootmod3',1066,152,28,THEME.text);
    text(cv,'Flashing from this app is not supported',1066,196,19,THEME.warn);
    text(cv,'Use your MHD or bootmod3 app to flash.',1066,230,19,THEME.dim);
    text(cv,'Before you flash or log with another app,',1066,300,18,THEME.dim);
    text(cv,'pause SMILEY so it stays out of the way.',1066,326,18,THEME.dim);
    button(cv,1066,376,460,v.paused?'Resume SMILEY':'Pause SMILEY',a.pause,'pause',v.paused,v.busy||v.demo);
}
function faults(cv,v,a) {
    const car=v.faultScope==='car';
    titled(cv,car?'CAR FAULTS':'ENGINE FAULTS','fault');
    text(cv,String(v.faultNote).slice(0,car?74:60),44,130,19,THEME.dim);
    button(cv,676,73,170,'Engine',()=>a.faultScope('dme'),'scopeDme',!car,v.busy);
    button(cv,856,73,180,'Whole car',()=>a.faultScope('car'),'scopeCar',car,v.busy);
    button(cv,1056,73,230,car?'Scan car':'Read faults',a.read,'read',false,v.busy||v.paused||v.demo);
    button(cv,1306,73,250,v.clearPending?'Press again':car?'Clear all':'Clear faults',a.clear,'clear',v.clearPending,v.busy||v.paused||v.demo);
    const rows=v.faultRows.slice(v.faultPage*4,v.faultPage*4+4);
    if(!rows.length)text(cv,v.scanned?(car?'No faults found':'No engine faults found'):(car?'Press Scan car to check the whole car. It takes some time.':'Press Read faults to check the engine'),800,282,30,THEME.dim,{align:'center'});
    rows.forEach((r,i)=>{
        const y=166+i*66;card(cv,44,y,1512,58,8);
        text(cv,r.code,66,y+38,27,THEME.accent2,{font:'num'});
        if(car){text(cv,String(r.unit).slice(0,20),215,y+37,19,THEME.cold);text(cv,r.status,470,y+37,19,THEME.warn);text(cv,r.text.slice(0,72),650,y+37,20,THEME.text);}
        else{text(cv,r.status,225,y+37,19,THEME.warn);text(cv,r.text.slice(0,92),405,y+37,20,THEME.text);}
    });
    const pages=Math.max(1,Math.ceil(v.faultRows.length/4));
    text(cv,(car?'Whole car':'Engine only')+'  ·  To clear: park the car, then press Clear twice'+(pages>1?'  ·  Page '+(v.faultPage+1)+' of '+pages:''),44,474,19,THEME.dim);
    if(v.faultRows.length>4)button(cv,1336,442,220,'Next page',a.nextFault,'nextFault',false,false);
}
let qrCache={text:null,code:null};
function drawQr(cv,url,x,y,size){
    if(qrCache.text!==url){qrCache={text:url,code:QR.QrCode.encodeText(url,QR.QrCode.Ecc.MEDIUM)};}
    const code=qrCache.code,cell=Math.floor(size/(code.size+8)),side=cell*(code.size+8);
    // about a thousand squares: drawn once per code into a layer, then shown from memory
    cv.blit(G.layer('smiley-qr|'+url,side,side,(c)=>{
        c.fillRect(0,0,side,side,'#ffffff');
        for(let row=0;row<code.size;row++)for(let col=0;col<code.size;col++){
            if(!code.getModule(col,row))continue;
            let n=1;while(col+n<code.size&&code.getModule(col+n,row))n++;               // one bar per run of dark squares
            c.fillRect((col+4)*cell,(row+4)*cell,n*cell,cell,'#000000');col+=n-1;
        }
    },cv.textScale),x,y);
}
function phone(cv,v,a) {
    heading(cv,'LIVE GAUGES ON YOUR PHONE','Connect your phone to the car Wi-Fi, press Start, then scan the code.','phone');
    card(cv,44,163,1512,282,16);
    if(v.phone.url)drawQr(cv,v.phone.url,69,185,235);
    else {cv.strokeRoundRect(69,185,230,230,14,1,THEME.panelEdge);text(cv,'PHONE ACCESS',184,287,20,THEME.dim,{align:'center'});text(cv,'OFF',184,330,34,THEME.accent2,{align:'center'});}
    text(cv,v.phone.connected?'Phone connected':v.phone.running?'Ready to pair':'Live gauges',335,218,26,THEME.accent2,{font:'bold'});
    text(cv,'Opens in your phone browser. No app needed.',335,258,20,THEME.text);
    text(cv,'Turns itself off after 30 minutes.',335,293,19,THEME.dim);
    text(cv,'View only. The phone cannot control the car.',335,325,19,THEME.dim);
    button(cv,335,365,390,v.phone.running?'Stop phone access':'Start phone access',a.phone,'phone',v.phone.running,false);
    text(cv,'HOW TO CONNECT',880,218,18,THEME.accent2,{font:'bold',spacing:1});
    ['1.  Join the car Wi-Fi on your phone.','2.  Press Start phone access.','3.  Scan the code with your phone camera.'].forEach((line,i)=>text(cv,line,880,262+i*36,20,THEME.text));
    text(cv,'Needs SMILEY Phone Access, installed once from the Store.',880,392,18,THEME.dim);
}
const GO='#86c3a0';
const secs=(n)=>typeof n==='number'&&isFinite(n)?n.toFixed(2):'--.--';
const flapWord=(m)=>({OPEN:'Open',CLOSED:'Closed',OEM:'Stock'})[m]||m;
// the upstream xDrive module's own wording, said plainly on this screen (xdrive.js stays as it is)
const CHECKS={'Live car data':'Car data is live','Stationary':'Car is stopped','Selector in P':'In Park','Engine running or READY':'Engine running'};
const NOTES=[['Waiting for the diagnostic link','Connecting to the car...'],['No live car data','No live data from the car'],['Needs: stationary','Stop the car first'],
    ['Needs: selector in p','Put the car in Park first'],['Needs: engine off','Turn the engine off, ignition on'],['Needs: ignition on','Turn the ignition on'],
    ['DSC not answering yet','Waiting for the car to answer'],['Press again to switch xDrive off until the ignition is switched off','Press again to switch to 2WD'],
    ['Press again to switch xDrive off','Press again to switch to 2WD'],['Press again to switch xDrive back on','Press again to switch to AWD'],
    ['Accepted by the DSC','The car accepted it'],['start the engine without switching the ignition off','Start the engine. Do not turn the car off first'],
    ['drive without switching the ignition off','Drive without turning the car off'],['xDrive off','2WD is on'],['the transfer case reports it','confirmed by the car']];
/** Info: what the app knows about the car and itself. Read once at start-up; nothing is sent from here. */
function info(cv,v) {
    heading(cv,'INFO','Read from the car when SMILEY started. Nothing is sent from this page.');
    const rows=v.info||[];
    rows.forEach((r,i)=>{
        const col=i%2, row=Math.floor(i/2), x=44+col*766, y=160+row*76;
        card(cv,x,y,746,66,10);
        text(cv,r.label.toUpperCase(),x+22,y+27,14,THEME.accent2,{font:'bold',spacing:1.5});
        text(cv,String(r.value).slice(0,52),x+22,y+54,22,r.value==='--'?THEME.dim:THEME.text);
    });
}
function plainNote(s) { s=String(s); NOTES.forEach((p)=>{ s=s.split(p[0]).join(p[1]); }); return s; }
function xdrivePage(cv,v,a) {
    const x=v.xdrive, word={AWD:'AWD',RWD:'2WD',REQUESTED:'2WD',UNKNOWN:'--'}[x.mode], col={AWD:THEME.ok,RWD:THEME.warn,REQUESTED:THEME.accent2,UNKNOWN:THEME.dim}[x.mode];
    const from=x.mode==='UNKNOWN'?'Not known yet':x.modeFrom?'Confirmed by the car':'Sent - waiting for the car to confirm';
    heading(cv,'AWD / 2WD',!x.enabled?'Turn on "AWD / 2WD switch" in Settings to use this.':x.supported===false?'Not available on this car.'
        :x.index?'Your car: '+(x.unit||x.index)+(x.tested?' - tested on this type':' - not tested on this type yet'):'Checking your car...','awd');
    card(cv,44,160,430,300,16);
    text(cv,'DRIVE MODE',76,204,20,THEME.accent2,{font:'bold',spacing:1});
    text(cv,x.enabled?word:'--',76,330,120,x.enabled?col:THEME.dim,{font:'bold'});
    text(cv,x.enabled?from:'Off',76,372,19,THEME.dim);
    text(cv,x.torque&&typeof x.torque.actual==='number'?'Front wheels: '+x.torque.actual.toFixed(0)+' Nm':'Front wheel torque: engine running only',76,424,19,THEME.dim);
    card(cv,500,160,470,300,16);
    text(cv,'BEFORE YOU SWITCH',530,204,20,THEME.accent2,{font:'bold',spacing:1});
    x.checks.forEach((c,i)=>{
        const y=246+i*36, k=c.ok===true?THEME.ok:c.ok===false?THEME.crit:THEME.dim;
        cv.roundRect(530,y-16,18,18,5,k);
        text(cv,(CHECKS[c.label]||c.label)+(c.ok===null?'  (check yourself)':''),562,y,21,c.ok===false?THEME.text:THEME.dim);
    });
    card(cv,996,160,560,300,16);
    const off=x.confirmWhat==='off', on=x.confirmWhat==='on', blocked=!!x.blocker||x.busy||v.demo||v.paused;
    button(cv,1026,190,500,off?'Press again for 2WD':'Switch to 2WD',a.xdriveOff,'xdOff',off,blocked);
    if(x.onAvailable)button(cv,1026,256,500,on?'Press again for AWD':'Switch to AWD',a.xdriveOn,'xdOn',on,blocked);
    else{text(cv,'To go back to AWD, turn the car',1026,286,20,THEME.dim);text(cv,'off and on again.',1026,312,20,THEME.dim);}
    const note=plainNote(x.note||x.blocker||'');
    String(note).split(' · ').slice(0,3).forEach((line,i)=>text(cv,line.slice(0,52),1026,362+i*28,19,x.noteType==='go'?THEME.ok:x.noteType==='warn'?THEME.warn:THEME.dim));
    text(cv,'Experimental  ·  Try it in an empty lot first  ·  Traction control may act differently in 2WD  ·  The car stores a fault code while in 2WD',44,490,18,THEME.dim);
}
/** The maker's mark, bottom left on every page: SMILEY (dot) by David. v.0.1.3 */
function watermark(cv,v) {
    const y=514, size=14, o={font:'bold',spacing:1.5}, W='#ffffff';
    cv.text('SMILEY',24,y,size,W,o);
    const w=cv.textWidth('SMILEY',size,o);
    cv.circle(24+w+10,y-5,2.5,W);
    cv.text('by David. v.'+v.version,24+w+20,y,size,W,{font:'label'});
}
function perf(cv,v,a) {
    const p=v.perf, names={drag:'Drag timer',g:'G-meter',dyno:'Dyno',brake:'Brake test'};
    titled(cv,'PERFORMANCE','perf');
    text(cv,p.demo?'Demo drive - results are not saved':'Works while SMILEY is open. Closed roads only.',44,130,19,p.demo?THEME.warn:THEME.dim);
    Object.keys(names).forEach((k,i)=>button(cv,760+i*202,73,192,names[k],()=>a.perfMode(k),'perf'+k,p.mode===k,false));
    if(p.mode==='drag')dragPage(cv,p);
    if(p.mode==='g')gPage(cv,p,a);
    if(p.mode==='dyno')dynoPage(cv,p,v);
    if(p.mode==='brake')brakePage(cv,p);
}
function speedBox(cv,p,x,y) {
    text(cv,p.speed==null?'--':p.speed.toFixed(0),x,y,56,THEME.text,{font:'num'});
    text(cv,p.speedUnit,x,y+26,18,THEME.dim);
}
function dragPage(cv,p) {
    const d=p.drag, st={wait:['STOP THE CAR TO START',THEME.dim],ready:['READY - GO',GO],run:['TIMING',THEME.accent],done:['FINISHED',THEME.text]}[d.state]||['',THEME.dim];
    card(cv,44,160,520,300,16);
    text(cv,st[0],76,206,24,st[1],{font:'bold',spacing:1});
    text(cv,secs(d.elapsed),76,318,104,THEME.text,{font:'num'});
    text(cv,(d.state!=='run'&&d.elapsed>0?'seconds, last run':'seconds')+(d.rollout?'  ·  one-foot rollout':''),76,352,19,THEME.dim);
    speedBox(cv,p,76,420);
    text(cv,'PEAK '+(d.peakG?d.peakG.toFixed(2):'-.--')+' g',300,420,24,THEME.accent2,{font:'num'});
    card(cv,590,160,966,300,16);
    text(cv,'SPLIT',620,200,17,THEME.dim,{font:'bold',spacing:1});text(cv,'THIS RUN',1010,200,17,THEME.dim,{font:'bold',spacing:1,align:'right'});
    text(cv,'TRAP',1200,200,17,THEME.dim,{font:'bold',spacing:1,align:'right'});text(cv,'BEST',1420,200,17,THEME.dim,{font:'bold',spacing:1,align:'right'});
    d.splits.forEach((s,i)=>{
        const y=258+i*70;
        cv.fillRect(620,y-46,906,1,THEME.panelEdge);
        text(cv,s.label,620,y,28,THEME.text);
        text(cv,secs(s.s),1010,y,36,s.s==null?THEME.dim:THEME.text,{font:'num',align:'right'});
        text(cv,s.trap==null?'':(p.mph?s.trap/1.609344:s.trap).toFixed(0)+' '+p.speedUnit,1200,y,22,THEME.dim,{align:'right'});
        text(cv,secs(s.best),1420,y,30,THEME.accent2,{font:'num',align:'right'});
        if(s.isNew)text(cv,'NEW',1436,y,18,GO,{font:'bold'});
    });
}
/*
 * G-meter: a web of fine lines with a soft glow, the car's dot in the middle, and a white outline
 * that follows the dot out and shrinks back once the dot has moved away. The dot moves the way you are pushed, as on BMW's own meter: back (down) when
 * you accelerate, forward (up) when you brake. The four numbers are braking (top), accelerating (bottom).
 */
function gPage(cv,p,a) {
    card(cv,44,160,700,300,16);
    const cx=394, cy=300, R=100, pk=p.g.peak, env=p.g.env||[], n=env.length;
    const scale=Math.max(1.5,Math.ceil(Math.max(pk.total,0.01)/0.5)*0.5);                  // 1.5 g, the upstream G-Force default; 2.0 and up only if the car gets there
    if(p.haveG){
        const RED='#ff8078';                                                             // the meter's own colour: a light red
        [[1,0.07],[0.72,0.09],[0.45,0.13],[0.22,0.18]].forEach((q)=>cv.circle(cx,cy,R*q[0],withAlpha(RED,q[1])));
        // the web: three sets of parallel lines, 60 degrees apart, inside the circle
        for(let s=0;s<3;s++){
            const ang=s*Math.PI/3, dx=Math.cos(ang), dy=Math.sin(ang);
            for(let k=-3;k<=3;k++){
                const off=k*R/3.2, half=Math.sqrt(Math.max(0,R*R-off*off)), ox=cx-dy*off, oy=cy+dx*off;
                cv.line(ox-dx*half,oy-dy*half,ox+dx*half,oy+dy*half,1.5,withAlpha(RED,k===0?0.7:0.4));
            }
        }
        // the outline of the most g reached in each direction
        if(n&&env.some((e)=>e>0.05)){
            // a direction not reached yet borrows from its neighbours, so the outline is one closed shape
            const at=(i)=>env[((i%n)+n)%n], soft=(i)=>Math.max(at(i),0.75*Math.max(at(i-1),at(i+1)),0.5*Math.max(at(i-2),at(i+2)),0.3*Math.max(at(i-3),at(i+3)),0.06*scale);
            const pts=env.map((e,i)=>{const t=i/n*2*Math.PI, r=Math.min(1.05,soft(i)/scale)*R;return [cx+Math.sin(t)*r,cy+Math.cos(t)*r];});
            pts.push(pts[0]);
            cv.polyline(pts,2.5,'#ffffff');
        }
        const lat=p.gLat||0, lon=p.gLong||0, k=R/scale, px=cx+Math.max(-1.05,Math.min(1.05,lat/scale))*R, py=cy+Math.max(-1.05,Math.min(1.05,lon/scale))*R;
        cv.circle(px,py,13,withAlpha('#ffffff',0.22));cv.circle(px,py,7,'#ffffff');
        const num=(val,x,y,al)=>text(cv,val.toFixed(2),x,y,26,THEME.text,{font:'num',align:al});
        num(pk.brake,cx,cy-R-12,'center');num(pk.accel,cx,cy+R+30,'center');
        num(pk.left,cx-R-24,cy+9,'right');num(pk.right,cx+R+24,cy+9,'left');
        cv.fillRect(cx-R-176,cy-1,70,2,withAlpha('#ffffff',0.7));cv.fillRect(cx+R+106,cy-1,70,2,withAlpha('#ffffff',0.7));
        text(cv,'MAX G',cx,cy+R+50,13,THEME.cold,{font:'bold',align:'center',spacing:2});
        // corner marks
        [[-1,-1],[1,-1],[-1,1],[1,1]].forEach((q)=>{
            const x0=cx+q[0]*(R+60), y0=cy+q[1]*(R-22);
            cv.line(x0,y0,x0+q[0]*150,y0,2,withAlpha('#ffffff',0.45));cv.line(x0,y0,x0-q[0]*14,y0+q[1]*-14,3,'#ffffff');
        });
    } else text(cv,'This car is not sending g-force data',394,310,24,THEME.dim,{align:'center'});
    card(cv,770,160,786,300,16);
    const now=p.haveG?Math.sqrt((p.gLat||0)*(p.gLat||0)+p.gLong*p.gLong):null;
    text(cv,'RIGHT NOW',800,204,18,THEME.accent2,{font:'bold',spacing:1});
    const w=cv.text(now==null?'-.--':now.toFixed(2),800,300,96,THEME.text,{font:'num'});text(cv,'g',800+(w||190)+12,300,30,THEME.dim);
    text(cv,'MOST SO FAR',800,364,16,THEME.dim,{font:'bold',spacing:1});
    const w2=cv.text(pk.total.toFixed(2),800,418,48,THEME.accent2,{font:'num'});text(cv,'g',800+(w2||100)+8,418,22,THEME.dim);
    button(cv,1300,388,226,'Reset',a.resetG,'resetG',false,false);
}
/*
 * Dyno: after every pull, a graph of power and torque against engine speed with the peak of each
 * marked and named, and the pull before it drawn faintly behind to compare.
 */
function dynoPage(cv,p,v) {
    const d=p.dyno, r=d.last, b=d.prev, hp=(w)=>w/745.7, lbft=v.torqueUnit==='lbft', tq=(nm)=>lbft?nm*0.73756:nm, tU=lbft?'lb-ft':'Nm';
    const st={idle:[r?'LAST PULL':'READY - FLOOR IT IN ONE GEAR',THEME.dim],pull:['RECORDING',GO],short:['TOO SHORT - REV 1500+ RPM',THEME.warn],done:['NEW PULL SAVED',GO]}[d.state];
    card(cv,44,160,372,300,16);
    text(cv,st[0],70,198,16,st[1],{font:'bold',spacing:1});
    text(cv,'PEAK POWER',70,236,13,THEME.dim,{font:'bold',spacing:1.5});
    const w1=cv.text(r?hp(r.peakP).toFixed(0):'---',70,292,60,THEME.accent,{font:'num'});text(cv,'hp',70+(w1||110)+10,292,22,THEME.dim);
    text(cv,r?'at '+r.peakPrpm+' rpm':'',70,316,17,THEME.dim);
    text(cv,'PEAK TORQUE',70,350,13,THEME.dim,{font:'bold',spacing:1.5});
    const w2=cv.text(r?tq(r.peakT).toFixed(0):'---',70,400,52,THEME.cold,{font:'num'});text(cv,tU,70+(w2||100)+10,400,22,THEME.dim);
    text(cv,r?'at '+r.peakTrpm+' rpm':'',70,424,17,THEME.dim);
    if(r&&b){
        // against the pull before
        const dp=hp(r.peakP)-hp(b.peakP), dt=tq(r.peakT)-tq(b.peakT), sg=(n)=>(n>=0?'+':'')+n.toFixed(0);
        text(cv,sg(dp)+' hp',396,292,18,dp>=0?GO:THEME.crit,{align:'right',font:'num'});text(cv,sg(dt)+' '+tU,396,400,18,dt>=0?GO:THEME.crit,{align:'right',font:'num'});
    }
    text(cv,d.power==null?'':'now '+Math.max(0,hp(d.power)).toFixed(0)+' hp',70,448,16,THEME.text,{font:'num'});
    card(cv,440,160,1116,300,16);
    if(!r){text(cv,'Floor it in one gear to draw your power curve',998,318,24,THEME.dim,{align:'center'});return;}
    // the scales fit the pulls shown
    const runs=[b,r].filter(Boolean), all=runs.reduce((a,x)=>a.concat(x.curve),[]);
    const x0=Math.floor(Math.min(...all.map((c)=>c.rpm))/500)*500, x1=Math.max(x0+1500,Math.ceil(Math.max(...all.map((c)=>c.rpm))/500)*500);
    const yMax=Math.ceil(Math.max(100,...all.map((c)=>Math.max(hp(c.p),tq(c.t))))*1.18/50)*50;
    const X=460, Y=200, Wd=1076, Hd=228, padL=44, padB=26, padR=8, padT=8;      // the legend sits above the graph
    const line=(run,f,color,width)=>({pts:run.curve.map((c)=>[c.rpm,f(c)]),color,width});
    const series=[];
    if(b){series.push(line(b,(c)=>hp(c.p),withAlpha(THEME.accent,0.3),2));series.push(line(b,(c)=>tq(c.t),withAlpha(THEME.cold,0.3),2));}
    series.push(line(r,(c)=>hp(c.p),THEME.accent,4));series.push(line(r,(c)=>tq(c.t),THEME.cold,3));
    G.chart(cv,THEME,X,Y,Wd,Hd,{xMin:x0,xMax:x1,yMin:0,yMax,xStep:500,yStep:yMax/5,xFmt:(n)=>String(n),yFmt:(n)=>String(Math.round(n)),series});
    // the peaks, marked on the curves and named
    const px=(rpm)=>X+padL+(rpm-x0)/(x1-x0)*(Wd-padL-padR), py=(val)=>Y+padT+(Hd-padT-padB)*(1-val/yMax);
    const mark=(rpm,val,color,label,up)=>{
        const mx=px(rpm), my=py(val), right=mx<X+Wd-240;
        cv.circle(mx,my,9,withAlpha(color,0.3));cv.circle(mx,my,5,color);
        text(cv,label,mx+(right?12:-12),my+(up?-12:26),17,color,{font:'bold',align:right?'left':'right'});
    };
    // a label goes on the side of its curve away from the other curve
    const near=(rpm)=>r.curve.reduce((m,c)=>(Math.abs(c.rpm-rpm)<Math.abs(m.rpm-rpm)?c:m),r.curve[0]);
    mark(r.peakPrpm,hp(r.peakP),THEME.accent,hp(r.peakP).toFixed(0)+' hp @ '+r.peakPrpm,hp(r.peakP)>=tq(near(r.peakPrpm).t));
    mark(r.peakTrpm,tq(r.peakT),THEME.cold,tq(r.peakT).toFixed(0)+' '+tU+' @ '+r.peakTrpm,tq(r.peakT)>hp(near(r.peakTrpm).p));
    cv.fillRect(X+padL,182,22,4,THEME.accent);text(cv,'POWER hp',X+padL+30,189,14,THEME.accent,{font:'bold',spacing:1});
    cv.fillRect(X+padL+150,182,22,4,THEME.cold);text(cv,'TORQUE '+tU,X+padL+180,189,14,THEME.cold,{font:'bold',spacing:1});
    if(b)text(cv,'faint lines: the pull before',X+padL+330,189,14,THEME.dim);
    text(cv,'rpm  ·  '+d.weight+' kg, '+d.loss+'% drivetrain loss  ·  an estimate, not a dyno sheet',1536,452,14,THEME.dim,{align:'right'});
}
function brakePage(cv,p) {
    const b=p.brake, ft=p.mph, D=(m)=>m==null?'--':(ft?m*3.28084:m).toFixed(1), dU=ft?'ft':'m', r=b.last;
    const st={arm:['GET ABOVE '+b.tests[1].label.split('-')[0]+' '+p.speedUnit.toUpperCase(),THEME.dim],ready:['BRAKE HARD',GO],braking:['STOPPING',THEME.accent],done:['STOPPED',THEME.text]}[b.state];
    card(cv,44,160,520,300,16);
    text(cv,b.msg||st[0],76,206,22,b.msg?THEME.warn:st[1],{font:'bold',spacing:1});
    speedBox(cv,p,76,300);
    text(cv,b.live?D(b.live.dist)+' '+dU:'',300,300,44,THEME.accent2,{font:'num'});
    text(cv,'Get above the speed, then brake hard to a full stop.',76,392,18,THEME.dim);
    text(cv,'Measuring starts as you pass the speed.',76,420,18,THEME.dim);
    card(cv,590,160,966,300,16);
    text(cv,'TEST',620,200,17,THEME.dim,{font:'bold',spacing:1});text(cv,'LAST STOP',1060,200,17,THEME.dim,{font:'bold',spacing:1,align:'right'});
    text(cv,'TIME',1230,200,17,THEME.dim,{font:'bold',spacing:1,align:'right'});text(cv,'BEST',1470,200,17,THEME.dim,{font:'bold',spacing:1,align:'right'});
    b.tests.forEach((x,i)=>{
        const y=270+i*84, res=r&&r.result&&r.result[x.key];
        cv.fillRect(620,y-52,906,1,THEME.panelEdge);
        text(cv,x.label,620,y,28,THEME.text);
        text(cv,res?D(res.m)+' '+dU:'--',1060,y,34,res?THEME.text:THEME.dim,{font:'num',align:'right'});
        text(cv,res?res.s.toFixed(2)+' s':'',1230,y,22,THEME.dim,{align:'right'});
        text(cv,x.best?D(x.best.m)+' '+dU:'--',1470,y,28,THEME.accent2,{font:'num',align:'right'});
        if(res&&r.newBest&&r.newBest[x.key])text(cv,'NEW',1484,y,18,GO,{font:'bold'});
    });
    text(cv,r?'Peak '+r.peakG.toFixed(2)+' g':'',620,438,20,THEME.dim);
}
module.exports={draw,W,H,TABS,THEME,PAGE,slotAt,setTheme,PALETTES};
