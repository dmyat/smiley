'use strict';
const G = require('./kit/gauges');
const { withAlpha } = require('./kit/canvas');
const QR = require('./qrcodegen');
const W = 1600, H = 520;
const { DEFAULT: GAUGE_IDS, PER_PAGE } = require('./layout');
// Live Stats: three gauges across, two down. The names are what the pick list shows.
const COLS = 3, TILE_W = 508, TILE_H = 186, PITCH_X = 522, PITCH_Y = 196;
// where the red zone of a dial starts (f: Fahrenheit shown); gauges not listed have none
const ZONES = { rpm: () => 6500, oil: (f) => (f ? 266 : 130), coolant: (f) => (f ? 239 : 115) };
const GAUGE_NAMES = { rpm: 'RPM', boost: 'Boost', oil: 'Oil temp', coolant: 'Coolant', iat: 'Intake temp', stft1: 'Fuel trim 1', stft2: 'Fuel trim 2',
    hpfp: 'High fuel press', timing: 'Timing', lambda: 'Lambda', lpfp: 'Low fuel press', oilp: 'Oil pressure', boostTarget: 'Boost target',
    load: 'Engine load', torque: 'Torque', misfire: 'Misfires' };
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
// Christmas: a night-green background, holly red and gold, with snow falling over every page.
// snow: true is what turns the snowfall on (drawSnow, called at the end of draw()).
PALETTES.xmas = Object.assign(look('CHRISTMAS', { bg: '#07130f', bg2: '#0a1a14', panel: '#11261d', card: '#0d1f18', edge: '#27503c',
    text: '#f4f7f2', dim: '#9db3a6', track: '#1b3529', tick: '#6f8f7e', a: '#d8434a', b: '#e6c877', cold: '#bcd9ee',
    ramp: ['#2f8f5a', '#e6c877', '#d8434a'], hot: ['#e6c877', '#eda35a', '#e2675c', '#ff3b47'],
    ink: '#1a0709', off: '#587264', notice: '#2a1418' }), { snow: true });
// A second Christmas look: deep cranberry red with gold and snow white (the first is night green).
PALETTES.xmas_red = Object.assign(look('CHRISTMAS RED', { bg: '#160607', bg2: '#1f090b', panel: '#2c0d10', card: '#24090c', edge: '#5e2227',
    text: '#fbf4ee', dim: '#c9a9a4', track: '#3c1418', tick: '#9a6b68', a: '#e6c877', b: '#f4f1ea', cold: '#bcd9ee',
    ramp: ['#f4f1ea', '#e6c877', '#3fae6f'], hot: ['#e6c877', '#f0a04c', '#ff7a5c', '#ffffff'],
    ink: '#2a0a0c', off: '#7c5553', notice: '#3a1216', crit: '#ff8f7a', warn: '#ffd27a' }), { snow: true });
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
    // Snow and surprises move every frame, so they are drawn only on the GPU renderer (cv.place is set
    // there), which is built for that. On the Basic renderer every changed frame is redrawn in software
    // and sent as a picture, so the theme keeps its colours and stays still. (SMILEY_ANIMATE=1: previews.)
    if(THEME.snow&&(cv.place||process.env.SMILEY_ANIMATE==='1')){
        const now=Date.now(); drawSnow(cv,now);
        // surprises play only in the empty strip at the bottom middle of the pages that have one, so they
        // never cover a gauge, a button or a line of text; not while a message or the gauge editor is up
        if(v.surprises!=='off'&&!v.notice&&!v.edit&&(v.page===PAGE.stats||v.page===PAGE.perf||v.page===PAGE.info)) drawSurprise(cv,surpriseAt(now));
    }
}
// Christmas surprises: now and then something festive plays for a few seconds in the empty strip at
// the bottom middle of the page (LANE) - Santa's sleigh behind two reindeer rises into it, flies along
// and dips away, a shooting star crosses it, or a snowman peeks up over the bottom edge and waves.
// Nothing is ever drawn over a gauge, a button or text. Like the snow it is
// worked out from the clock alone: time is cut into 75 s slots, about three in five hold a surprise,
// and the slot's number picks which one, when and where. It can be switched off in Settings.
const SURPRISES={sleigh:7000,star:1800,snowman:5200};
const SURPRISE_KINDS=['sleigh','sleigh','star','snowman','sleigh'];      // the sleigh comes round most often
const SURPRISE_SLOT=75000;
function surpriseAt(now){
    const slot=Math.floor(now/SURPRISE_SLOT), r=(n)=>{const x=Math.sin(slot*12.9898+n*78.233)*43758.5453;return x-Math.floor(x);};
    if(r(1)>0.6)return null;
    const kind=SURPRISE_KINDS[Math.floor(r(3)*SURPRISE_KINDS.length)%SURPRISE_KINDS.length], dur=SURPRISES[kind];
    const t=now-(slot*SURPRISE_SLOT+r(2)*(SURPRISE_SLOT-dur));
    if(t<0||t>dur)return null;
    return {kind,t,dur,p:t/dur,a:r(4),b:r(5)};
}
// the free strip: between the hint text on the left and the buttons on the right, under the cards
const LANE={x0:600,x1:970,top:448,ground:505};
// the drawing calls of cv, moved to (ox, oy) and scaled by k, so a figure drawn around 0,0 fits the strip
const placed=(cv,ox,oy,k)=>({
    circle:(x,y,r,c)=>cv.circle(ox+x*k,oy+y*k,r*k,c), roundRect:(x,y,w,h,r,c)=>cv.roundRect(ox+x*k,oy+y*k,w*k,h*k,r*k,c),
    fillRect:(x,y,w,h,c)=>cv.fillRect(ox+x*k,oy+y*k,w*k,h*k,c), line:(a,b,c2,d,w,c)=>cv.line(ox+a*k,oy+b*k,ox+c2*k,oy+d*k,Math.max(1,w*k),c),
    arc:(x,y,r0,r1,a0,a1,c)=>cv.arc(ox+x*k,oy+y*k,r0*k,r1*k,a0,a1,c) });
function drawSurprise(cv,s){
    if(!s)return;
    const hide=1-Math.sin(s.p*Math.PI);                 // 1 at the start and end (below the screen), 0 in the middle
    if(s.kind==='sleigh'){const k=0.72;drawSleigh(placed(cv,LANE.x0+s.p*(LANE.x1-LANE.x0-242*k),LANE.ground+Math.pow(hide,3)*75,k),0,0,s.t);}
    else if(s.kind==='star')drawShootingStar(cv,s);
    else drawSnowman(placed(cv,LANE.x0+50+s.a*(LANE.x1-LANE.x0-100),LANE.top+54+(1-Math.min(1,s.t/500,(s.dur-s.t)/500))*72,0.6),0,0,s);
}
const XMAS={red:'#c5282f',white:'#ffffff',skin:'#f3d2b8',brown:'#7a4a25',dark:'#4a2c14',gold:'#e6c877',coal:'#16181a',green:'#2f8f5a'};
// one reindeer, facing right, with its feet at ground line y; step: the gallop (ms)
function drawReindeer(cv,x,y,step,red){
    const c=XMAS, sw=Math.sin(step/90)*7;
    [[6,sw],[12,-sw],[30,-sw],[36,sw]].forEach((q)=>cv.line(x+q[0],y-16,x+q[0]+q[1],y,3,c.dark));
    cv.roundRect(x,y-30,42,16,8,c.brown);                                  // body
    cv.circle(x-1,y-25,3.5,c.white);                                       // tail
    cv.line(x+38,y-26,x+48,y-38,6,c.brown);                                // neck
    cv.circle(x+50,y-41,7,c.brown); cv.circle(x+56,y-39,4.5,c.brown);     // head and muzzle
    cv.circle(x+59,y-40,red?3.2:2,red?'#ff3b47':c.coal);                   // nose
    cv.circle(x+51,y-43,1.3,c.coal);
    cv.line(x+47,y-47,x+43,y-58,2,c.dark); cv.line(x+45,y-53,x+39,y-55,2,c.dark);      // antlers
    cv.line(x+51,y-47,x+54,y-59,2,c.dark); cv.line(x+53,y-54,x+59,y-57,2,c.dark);
}
// the sleigh at x (its back), ground line y, flying right
function drawSleigh(cv,x,y,step){
    const c=XMAS, bob=Math.sin(step/260)*3;
    for(let k=0;k<7;k++){const q=((step/180+k*1.7)%7);cv.circle(x-10-q*13,y-22+Math.sin(k*2.1)*12+q,Math.max(0.6,3-q*0.38),k%2?c.white:c.gold);}   // sparkles behind
    cv.line(x+78,y-24+bob,x+116,y-28,1.6,c.gold); cv.line(x+116,y-28,x+186,y-28,1.6,c.gold);     // reins
    drawReindeer(cv,x+110,y,step,false); drawReindeer(cv,x+178,y,step+140,true);
    const sy=y+bob;
    cv.circle(x+14,sy-34,15,c.brown); cv.circle(x+10,sy-44,4,c.dark);       // the sack
    cv.circle(x+44,sy-36,13,c.red);                                         // Santa
    cv.fillRect(x+33,sy-33,22,4,c.coal); cv.fillRect(x+41,sy-34,6,6,c.gold);
    cv.circle(x+47,sy-55,8,c.skin); cv.circle(x+49,sy-50,7,c.white);       // face and beard
    cv.circle(x+52,sy-56,1.2,c.coal);
    cv.roundRect(x+37,sy-68,20,10,5,c.red); cv.fillRect(x+37,sy-61,21,4,c.white); cv.circle(x+36,sy-66,4,c.white);   // hat
    cv.line(x+52,sy-38,x+78,sy-24,5,c.red); cv.circle(x+79,sy-24,3.5,c.coal);                     // arm on the reins
    cv.roundRect(x,sy-28,84,24,9,c.red); cv.fillRect(x+4,sy-28,76,4,c.gold);                      // the sleigh
    cv.line(x+12,sy-4,x+12,sy+4,3,c.gold); cv.line(x+66,sy-4,x+66,sy+4,3,c.gold);
    cv.line(x-8,sy+5,x+86,sy+5,3.5,c.gold); cv.arc(x+86,sy-4,7.5,10.5,-90,90,c.gold);             // runner with its curl
}
function drawShootingStar(cv,s){
    const c=XMAS, x=LANE.x0+70+s.p*(LANE.x1-LANE.x0-90), y=LANE.top+12+s.p*34, fade=Math.sin(s.p*Math.PI);
    for(let k=1;k<=5;k++)cv.circle(x-k*12,y-k*1.3,Math.max(0.5,(4.4-k*0.7)*fade),k%2?c.gold:c.white);
    for(let k=0;k<4;k++){const a=k*Math.PI/4, r=11*fade;cv.line(x-Math.cos(a)*r,y-Math.sin(a)*r,x+Math.cos(a)*r,y+Math.sin(a)*r,2.5,c.gold);}
    cv.circle(x,y,5*fade,c.white);
}
// the snowman around x, y (the middle of his chest); in the strip only his top half shows over the edge
function drawSnowman(cv,x,y,s){
    const c=XMAS, wave=Math.sin(s.t/170)*10;
    cv.circle(x,y+34,34,c.white); cv.circle(x,y-10,24,c.white);            // body
    cv.line(x-22,y-4,x-52,y-18,3.5,c.dark); cv.line(x+22,y-6,x+50,y-30+wave,3.5,c.dark);          // arms, the right one waving
    cv.line(x+50,y-30+wave,x+58,y-40+wave,2.5,c.dark); cv.line(x+50,y-30+wave,x+60,y-30+wave,2.5,c.dark);
    cv.circle(x,y-46,17,c.white);                                           // head
    cv.fillRect(x-20,y-62,40,5,c.coal); cv.fillRect(x-12,y-84,24,23,c.coal); cv.fillRect(x-12,y-68,24,5,c.red);   // hat
    cv.circle(x-6,y-50,2.2,c.coal); cv.circle(x+6,y-50,2.2,c.coal);
    cv.line(x,y-45,x+15,y-42,4,'#f08a2c');                                  // carrot nose
    for(let k=0;k<5;k++)cv.circle(x-8+k*4,y-37+Math.abs(k-2)*-1.5+3,1.3,c.coal);                  // smile
    cv.roundRect(x-20,y-31,40,8,4,c.red); cv.roundRect(x+8,y-28,8,20,4,c.red);                    // scarf
    [0,14,28].forEach((d)=>cv.circle(x,y-8+d,2.6,c.coal));                  // buttons
}
// Snowfall for the Christmas theme: a fixed set of small flakes, each with its own place, speed, size
// and sway, positioned from the clock alone (nothing to store, the same cost every frame). They are
// kept small and few so the readings under them stay easy to read.
const FLAKES=[];
for(let i=0;i<34;i++){const r=(n)=>{const x=Math.sin((i+1)*12.9898+n*78.233)*43758.5453;return x-Math.floor(x);};
    FLAKES.push({x:r(1)*W,y:r(2)*H,speed:16+r(3)*30,size:1.2+r(4)*2.2,sway:6+r(5)*14,phase:r(6)*6.283,far:r(7)<0.45});}
function drawSnow(cv,now){
    const t=now/1000;
    for(const f of FLAKES){
        const y=(f.y+t*f.speed)%(H+8)-4, x=(f.x+Math.sin(t*0.6+f.phase)*f.sway+W)%W;
        cv.circle(x,y,f.size,f.far?'#8fa3b3':'#eef4f8');
    }
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
    clipped(cv,f.connectionError||(f.recovery?'An unfinished flash needs recovery review.':f.connected&&!f.demo?'The rest of this app stays paused while connected.':f.demo?'Demo uses the same checks and progress workflow.':'Place your connection setup in flash/connect.json before connecting.'),44,500,19,f.connectionError||f.recovery?THEME.warn:THEME.dim,1500);
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
    const ids=v.gauges, items=ids.map((id)=>DEF[id]), pk=d.peaks||{}, base=(v.statsPage?1:0)*PER_PAGE, ed=v.edit;
    // the pick list covers one column: the right one, or the left when the picked gauge is on the right
    const onPage=ed&&ed.picked!=null&&ed.picked>=base&&ed.picked<base+PER_PAGE, listCol=ed&&ed.picked!=null?(onPage&&(ed.picked-base)%COLS===COLS-1?0:COLS-1):-1;
    // The six cards and their names change only when the layout does: drawn once into a layer the
    // renderer keeps, so each frame sends only the needles and numbers.
    cv.blit(G.layer('smiley-tiles|'+THEME.id+'|'+ids.join(','),1552,382,(c)=>items.forEach((q,i)=>{
        const x=(i%COLS)*PITCH_X, y=Math.floor(i/COLS)*PITCH_Y;
        card(c,x,y,TILE_W,TILE_H,14);
        text(c,q?q[0]:'MISFIRES',x+TILE_W/2,y+164,18,THEME.accent2,{font:'bold',align:'center'});
    }),cv.textScale),24,58);
    items.forEach((q,i)=>{
        const x=24+(i%COLS)*PITCH_X, y=58+Math.floor(i/COLS)*PITCH_Y;
        if(i%COLS===listCol)return;                      // under the pick list
        if(ed){
            // editing: every card is a button; the picked one wears a gold frame
            if(ed.picked===base+i){cv.strokeRoundRect(x-2,y-2,TILE_W+4,TILE_H+4,15,4,THEME.accent);}
            if(cv.target)cv.target(x,y,TILE_W,TILE_H,()=>a.editTap(base+i),'slot'+i);
        }
        if(!q){misfires(cv,d,x,y,TILE_W);return;}
        // the fast readings as signal bars and the rest as dials, unless Settings asks for all of one kind;
        // the temperatures run blue (cold) to red (hot) in either shape
        const isTemp=TEMPS.indexOf(q[6])>=0, asBar=v.gaugeStyle==='bar'||(v.gaugeStyle!=='dial'&&BARS.indexOf(q[6])>=0);
        const p=pk[q[6]], lo=p&&isFinite(p.min)?q[7](p.min):null, hi=p&&isFinite(p.max)?q[7](p.max):null;
        if(asBar){
            barGauge(cv,x,y,q,isTemp?TEMP_RAMP:SIGNAL,ZONES[q[6]]?ZONES[q[6]](f):null);
            if(lo!=null){text(cv,'MIN',x+34,y+34,12,THEME.dim,{font:'bold',spacing:1.5});text(cv,G.fmt(lo,q[5]),x+34,y+60,22,THEME.text,{font:'num'});}
            if(hi!=null){text(cv,'MAX',x+TILE_W-34,y+34,12,THEME.dim,{font:'bold',spacing:1.5,align:'right'});text(cv,G.fmt(hi,q[5]),x+TILE_W-34,y+60,22,THEME.accent,{font:'num',align:'right'});}
            if(q[1]==null)text(cv,'NO DATA',x+TILE_W/2,y+100,12,THEME.dim,{font:'bold',spacing:1.5,align:'center'});
            return;
        }
        // the dial: a thick band with a red zone where the reading has one, the highest value marked on
        // the band, and the lowest and highest so far written either side
        G.radial(cv,isTemp?tempTheme():THEME,x+TILE_W/2,y+80,70,{id:q[6],value:q[1],unit:q[2],min:q[3],max:q[4],decimals:q[5],thick:15,ticks:10,tickColor:'#ffffff',tickLong:9,tickShort:5,
            zones:ZONES[q[6]]?[{from:ZONES[q[6]](f),to:q[4],color:'crit'}]:[],peak:hi,showPeak:false});
        if(lo!=null){text(cv,'MIN',x+34,y+66,12,THEME.dim,{font:'bold',spacing:1.5});text(cv,G.fmt(lo,q[5]),x+34,y+94,24,THEME.text,{font:'num'});}
        if(hi!=null){text(cv,'MAX',x+TILE_W-34,y+66,12,THEME.dim,{font:'bold',spacing:1.5,align:'right'});text(cv,G.fmt(hi,q[5]),x+TILE_W-34,y+94,24,THEME.accent,{font:'num',align:'right'});}
        if(q[1]==null)text(cv,q[6]==='stft2'?'IF FITTED':'NO DATA',x+TILE_W-16,y+24,12,THEME.dim,{align:'right'});
    });
    if(listCol>=0)pickList(cv,v,a,24+listCol*PITCH_X,58);
    if(ed){
        text(cv,ed.picked==null?'Tap a gauge to change what it shows':'Pick from the list what this gauge shows',44,490,18,THEME.accent2);
        button(cv,852,456,220,v.statsPage?'Page 1':'Page 2',a.statsPage,'statsPage',false,false);
        button(cv,1084,456,240,'Default layout',a.editReset,'editReset',false,false);
        button(cv,1336,456,240,'Done',a.editDone,'editDone',true,false);
        return;
    }
    text(cv,d.boostMissingBaro?'Boost uses standard air pressure until the car reports its own':v.demo?'Demo data  ·  Nothing is sent to the car':'Hold a gauge to change what it shows',44,490,18,THEME.dim);
    button(cv,986,456,190,'Reset min/max',a.resetPeaks,'resetPeaks',false,false);
    button(cv,1186,456,190,'Edit gauges',a.editStart,'editStart',false,false);
    button(cv,1386,456,190,v.statsPage?'Main gauges':'More gauges',a.statsPage,'statsPage',false,false);
}
/** Which gauge card (0-5) is at a point of the Live Stats page, or -1. */
function slotAt(x,y) {
    const col=Math.floor((x-24)/PITCH_X), row=Math.floor((y-58)/PITCH_Y);
    if(col<0||col>=COLS||row<0||row>1||x-24-col*PITCH_X>TILE_W||y-58-row*PITCH_Y>TILE_H)return -1;
    return row*COLS+col;
}
/**
 * The drop-down of the gauge editor: all sixteen gauges, two columns of eight, over one column of
 * cards. The one in the picked slot is filled; each other says where it is now (page 1, page 2, or
 * not on show). A tap puts that gauge in the picked slot.
 */
function pickList(cv,v,a,x,y) {
    const h=2*PITCH_Y-10, slots=v.slots||[], picked=v.edit.picked;
    cv.roundRect(x,y,TILE_W,h,14,THEME.panelTop); cv.strokeRoundRect(x,y,TILE_W,h,14,2,THEME.accent);
    text(cv,'SHOW IN THIS PLACE',x+18,y+30,17,THEME.accent2,{font:'bold',spacing:1});
    GAUGE_IDS.forEach((id,i)=>{
        const bx=x+12+Math.floor(i/8)*244, by=y+46+(i%8)*41, bw=240, bh=36, at=slots.indexOf(id), here=at===picked;
        cv.roundRect(bx,by,bw,bh,8,here?THEME.accent:THEME.card);
        if(!here)cv.strokeRoundRect(bx,by,bw,bh,8,1,withAlpha(THEME.accent,0.3));
        text(cv,GAUGE_NAMES[id]||id,bx+12,by+24,18,here?THEME.ink:THEME.text,{font:here?'bold':'label'});
        text(cv,here?'HERE':at<PER_PAGE?'PAGE 1':at<2*PER_PAGE?'PAGE 2':'OFF',bx+bw-10,by+23,12,here?THEME.ink:at<2*PER_PAGE?THEME.dim:THEME.off,{align:'right',font:'bold',spacing:1});
        if(cv.target)cv.target(bx,by,bw,bh,()=>a.editSet(id),'pick-'+id);
    });
}
/**
 * A gauge as a signal meter (the fast readings by default; Settings > Live Stats gauges): the number large above
 * and, under it, fourteen bars that rise like a phone's signal and light up from the left as the
 * reading climbs its scale - green first, then yellow, orange and red at the top.
 * q = [label, value, unit, min, max, decimals] as for the dial.
 */
const SIGNAL=['#35c46a','#b7d443','#f2c043','#f2823a','#ec3440'], SEGMENTS=14;
// temperatures: blue when cold, through amber, to red when hot
const TEMP_RAMP=['#2f7df0','#56b6f0','#f0b85a','#f0703c','#ec3440'];
// Bars for what sweeps quickly through its range and is read as "how much of it am I using"; dials for
// what settles around a normal value (temperatures, pressures) or swings either side of a centre.
const BARS=['rpm','boost','boostTarget','load','torque'], TEMPS=['oil','coolant','iat'];
// the palette in use with the temperature colours on its dial band (made once per theme)
let tempThemeFor=null, tempThemeIs=null;
function tempTheme(){
    if(tempThemeFor!==THEME.id||!tempThemeIs){tempThemeFor=THEME.id;tempThemeIs=Object.assign({},THEME,{name:THEME.name+' temp',hotRamp:TEMP_RAMP,ramp:TEMP_RAMP});}
    return tempThemeIs;
}
function barGauge(cv,x,y,q,colors,redFrom) {
    const val=q[1], min=q[3], max=q[4], has=typeof val==='number'&&isFinite(val), cx=x+TILE_W/2;
    const s=has?G.fmt(val,q[5]):'--', tw=cv.textWidth(s,54,{font:'num'}), uw=q[2]?cv.textWidth(q[2],20,{font:'label'})+10:0;
    text(cv,s,cx-uw/2,y+64,54,has?THEME.text:THEME.dim,{font:'num',align:'center'});
    if(q[2])text(cv,q[2],cx-uw/2+tw/2+10,y+64,20,THEME.dim);
    // the bars follow an eased value, so they step up and down smoothly; past the red line (rpm) the lit
    // bars flash red and white like a shift light
    const eased=has?G.smooth('signal|'+q[6],val,16):null, f=has?G.clamp((eased-min)/(max-min),0,1):0, lit=has?Math.max(f>0.005?1:0,Math.round(f*SEGMENTS)):0;
    const over=has&&redFrom!=null&&val>=redFrom, flash=over?(Math.floor(Date.now()/110)%2?'#ffffff':'#ec3440'):null;
    const sw=22, gap=6, x0=cx-(SEGMENTS*(sw+gap)-gap)/2, base=y+142;
    for(let i=0;i<SEGMENTS;i++){
        const h=12+i*(34/(SEGMENTS-1)), on=i<lit;
        cv.roundRect(x0+i*(sw+gap),base-h,sw,h,4,on?flash||G.ramp(colors||SIGNAL,i/(SEGMENTS-1)):THEME.track);
    }
}
function misfires(cv,d,x,y,w) {
    const m=d.misfires;
    text(cv,d.misfire==null?'--':String(d.misfire),x+w/2,y+92,64,d.misfire?THEME.crit:d.misfire===0?THEME.ok:THEME.dim,{font:'num',align:'center'});
    text(cv,m&&m.length?m.map((n,i)=>(i+1)+':'+(n==null?'-':n)).join('  '):'this drive',x+w/2,y+128,16,THEME.dim,{align:'center'});
    if(d.misfire==null)text(cv,'NO DATA',x+w-16,y+24,12,THEME.dim,{align:'right'});
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
    text(cv,'pause this app so it stays out of the way.',1066,326,18,THEME.dim);
    button(cv,1066,376,460,v.paused?'Resume this app':'Pause this app',a.pause,'pause',v.paused,v.busy||v.demo);
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
    text(cv,'Needs the Phone Access helper, installed once from the Store.',880,392,18,THEME.dim);
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
    heading(cv,'INFO','Read from the car when the app started. Nothing is sent from this page.');
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
/** The maker's mark, bottom left on every page: SMILEY (dot) by David. v.0.1.16 */
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
    text(cv,p.demo?'Demo drive - results are not saved':'Works while the app is open. Closed roads only.',44,130,19,p.demo?THEME.warn:THEME.dim);
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
module.exports={draw,W,H,TABS,THEME,PAGE,slotAt,setTheme,PALETTES,surpriseAt,SURPRISES};
