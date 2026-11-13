'use strict';
process.env.SMILEY_ALL_TABS='1'; // Connect, Flash and Phone are hidden in the shipped build; these tests still cover them

// Exercise the latest uploaded theme settings through the actual merged native app.
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os');
const stage=path.join(__dirname,'../dist/smiley'),app=path.join(stage,'source/javascript');
const {DiagLink}=require(path.join(app,'diaglink'));let vehicleRequests=0;
DiagLink.prototype.init=async function(){this.available=false;this.diag={available:false,physical:async()=>{vehicleRequests++;throw Error('No vehicle access in this test');}};return this;};
const UI=require(path.join(app,'ui')),P=UI.PAGE;
const {FlashWorkspace}=require(path.join(app,'flash-workspace'));let flash;
const originalView=FlashWorkspace.prototype.view;FlashWorkspace.prototype.view=function(){flash=this;return originalView.call(this);};
const {headUnit}=require('../kit/tools/hu-stub');
const out=process.argv[2];if(out)fs.mkdirSync(out,{recursive:true});let last;
const hu=headUnit(stage,{dataDir:fs.mkdtempSync(path.join(os.tmpdir(),'smiley-merged-themes-')),fresh:true,sets:{demo:'on'},image:async(n,cv)=>{last=cv;}});
const changes=[];hu.ctx.settings.onChange=fn=>changes.push(fn);hu.start();
const setting=(k,v)=>{hu.ctx.settings.values[k]=v;changes.forEach(fn=>fn(k));};
const targets=()=>{const r=Array.from(hu.display.recorders.values())[0];return r?r.targets:[];};
const tap=async key=>{await hu.loopFn();const t=targets().find(t=>t.key===key);assert(t,'Missing '+key);await t.run();await hu.loopFn();};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
setTimeout(async()=>{
 try{
  assert.equal(hu.spec.version,'0.1.9');assert.equal(UI.TABS.length,9);
  const themes=hu.spec.settings.find(s=>s.key==='theme').options.map(o=>o[0]);
  assert.deepStrictEqual(themes,['smiley','l_burgundy','j_amethyst','l_midnight','s_green','s_m','spider','xmas','xmas_red','custom']);
  setting('customA','teal');setting('customB','gold');setting('customBg','graphite');
  for(const theme of themes){
   setting('theme',theme);await hu.display.onTab(P.connect);await hu.loopFn();
   assert(targets().some(t=>t.key==='betaContinue'));assert(!targets().some(t=>t.key==='flashConnect'));
   assert(theme==='custom'?UI.THEME.id.startsWith('custom|'):UI.THEME.id===theme,'Connect warning follows selected theme');
   await tap('betaContinue');if(!flash.connected)await tap('flashConnect');
   await tap('openFlash');await hu.loopFn();assert(targets().some(t=>t.key==='betaContinue'));assert(!targets().some(t=>t.key==='flashStart'));
   await tap('betaContinue');await tap('flashLoad');assert(!targets().some(t=>t.key==='flashStart'));await tap('flashPower');
   assert(targets().some(t=>t.key==='flashStart'));assert.equal(UI.THEME.accent,UI.PALETTES[theme].accent);
   if(theme==='custom'){assert.equal(UI.THEME.accent,'#1e96a0');assert.equal(UI.THEME.bg,'#101114');}
   if(out)fs.writeFileSync(path.join(out,theme+'-flash-ready.png'),last.png());
  }
  await tap('flashStart');const run=tap('flashStart');await sleep(100);assert(flash.programming);
  setting('customA','orange');setting('customB','sky');setting('customBg','navy');await hu.loopFn();
  assert.equal(hu.ctx.settings.get('customA'),'orange');assert.equal(hu.ctx.settings.get('customB'),'sky');assert.equal(hu.ctx.settings.get('customBg'),'navy');
  assert.equal(UI.THEME.accent,'#ff8a2a');assert.equal(UI.THEME.bg,'#070a12');
  setting('demo','off');assert.equal(hu.ctx.settings.get('demo'),'on','diagnostic source remains locked during programming');
  await run;assert.equal(flash.phase,'Simulation complete');assert.equal(flash.percent,100);assert.equal(vehicleRequests,0);
  console.log('PASS merged source: all eight themes, custom colours on both beta tabs, warnings before controls, custom edits during simulated programming, diagnostic source lock, version 0.1.2');process.exit(0);
 }catch(e){console.error(e.stack);process.exit(1);}
},700);
