'use strict';
process.env.SMILEY_ALL_TABS='1'; // Connect, Flash and Phone are hidden in the shipped build; these tests still cover them

// The actual native entry point, actual button targets and actual themes; fictional ECU only.
const assert=require('assert'),path=require('path'),fs=require('fs'),os=require('os');
const stage=path.join(__dirname,'../dist/smiley'),app=path.join(stage,'source/javascript');
const {DiagLink}=require(path.join(app,'diaglink'));
let physical=0;
DiagLink.prototype.init=async function(){this.available=false;this.diag={available:false,physical:async()=>{physical++;throw Error('No vehicle access permitted in this test');}};return this;};
const {headUnit}=require('../kit/tools/hu-stub');
const {PAGE:P}=require(path.join(app,'ui'));
const {FlashWorkspace}=require(path.join(app,'flash-workspace'));
let flash;const view=FlashWorkspace.prototype.view;FlashWorkspace.prototype.view=function(){flash=this;return view.call(this);};
let last;const out=process.argv[2];if(out)fs.mkdirSync(out,{recursive:true});
const hu=headUnit(stage,{dataDir:fs.mkdtempSync(path.join(os.tmpdir(),'smiley-flash-ui-')),fresh:true,sets:{demo:'on'},image:async(name,cv)=>{last=cv;}});
const callbacks=[];hu.ctx.settings.onChange=fn=>callbacks.push(fn);
hu.start();
const targets=()=>{const r=Array.from(hu.display.recorders.values())[0];return r?r.targets:[];};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const tap=async(key)=>{await hu.loopFn();const t=targets().find(t=>t.key===key);assert(t,'Missing target '+key);await t.run();await hu.loopFn();};
const snap=async(name)=>{await hu.loopFn();if(out)fs.writeFileSync(path.join(out,name+'.png'),last.png());};
const setting=(key,value)=>{hu.ctx.settings.values[key]=value;callbacks.forEach(fn=>fn(key));};
setTimeout(async()=>{
 try{
  for(const theme of ['smiley','spider']){
   setting('theme',theme);
   await hu.display.onTab(P.connect);await hu.loopFn();assert(targets().some(t=>t.key==='betaContinue'));assert(!targets().some(t=>t.key==='flashConnect'));
   assert(!flash.connected,'warning does not connect');await snap(theme+'-connect-warning');
   await tap('betaContinue');await tap('flashConnect');assert(flash.connected);await snap(theme+'-connect');
   await tap('openFlash');await hu.loopFn();assert(targets().some(t=>t.key==='betaContinue'));assert(!targets().some(t=>t.key==='flashStart'));await snap(theme+'-flash-warning');
   await tap('betaContinue');assert(!targets().some(t=>t.key==='flashStart'),'cannot flash before load and power');
   await tap('flashLoad');await tap('flashPower');await snap(theme+'-flash-ready');
   await tap('flashStart');assert(flash.view().confirmation);await snap(theme+'-flash-confirm');
   await hu.display.onTab(P.connect);await tap('betaContinue');await tap('openFlash');await tap('betaContinue');assert(!flash.view().confirmation,'navigation cancels confirmation');
   await tap('flashStart');const run=tap('flashStart');await sleep(100);assert(flash.programming);await hu.loopFn();assert(!targets().some(t=>t.key==='flashPower'));
   setting('demo','off');assert.equal(hu.ctx.settings.get('demo'),'on','cannot change the vehicle source mid-flash');
   await hu.display.onTab(P.controls);await hu.loopFn();assert(flash.programming);assert(!targets().some(t=>t.key==='map1'),'navigation remains on Flash during programming');
   await sleep(500);await snap(theme+'-flash-progress');await run;
   assert.equal(flash.phase,'Simulation complete');assert.equal(flash.percent,100);await snap(theme+'-flash-complete');
   await hu.display.onTab(P.connect);await hu.loopFn();assert(targets().some(t=>t.key==='betaContinue'),'warning appears again on re-entry');
  }
  // Normal mode has no implicit connection, no calibration and no live write adapter.
  setting('demo','off');await hu.display.onTab(P.flash);await tap('betaContinue');await tap('flashLoad');assert(!flash.view().ready);assert(!targets().some(t=>t.key==='flashStart'));await snap('smiley-flash-locked');
  assert.equal(physical,0);console.log('PASS native Connect / Flash: both themes, entry warnings, load/power/confirmation, navigation and settings locks, simulated progress and completion, no real vehicle commands');process.exit(0);
 }catch(e){console.error(e.stack);process.exit(1);}
},700);
