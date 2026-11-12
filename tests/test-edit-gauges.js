'use strict';
// Press and hold a gauge on the real app (through the upstream head-unit stub): the editor opens with
// that gauge picked, a tap on another swaps them, and a quick tap or a moving finger does not open it.
const assert=require('assert'),path=require('path'),fs=require('fs'),os=require('os');
const stage=path.join(__dirname,'../dist/smiley'),app=path.join(stage,'source/javascript');
const {DiagLink}=require(path.join(app,'diaglink'));
DiagLink.prototype.init=async function(){this.available=false;this.diag={available:false,physical:async()=>null};return this;};
const {headUnit}=require('../kit/tools/hu-stub');
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'smiley-edit-'));
let last=null;const out=process.argv[2];
const hu=headUnit(stage,{dataDir,fresh:true,sets:{demo:'on'},image:async(name,cv)=>{last=cv;}});
hu.start();
const sleep=(ms)=>new Promise((r)=>setTimeout(r,ms));
const slots=()=>{try{return JSON.parse(fs.readFileSync(path.join(dataDir,'gauges.json'),'utf8')).slots;}catch(e){return null;}};
// what the page offers to press: the targets of the frame just drawn (the kit's reused drawing surface)
const targets=()=>{const r=Array.from(hu.display.recorders.values())[0];return (r&&r.targets)||[];};
const tap=async(key)=>{await hu.loopFn();const t=targets().find((x)=>x.key===key);assert(t,'no button '+key+' among '+targets().map((x)=>x.key).join(','));await t.run();await hu.loopFn();};
setTimeout(async()=>{
 try{
  const d=hu.display;assert(d&&typeof d._touch==='function','the kit display takes touches');
  await hu.loopFn();assert(!targets().some((t)=>/^slot/.test(t.key)),'not editing at the start');
  d._touch(1,100,150);await sleep(150);d._touch(3,100,150);await sleep(700);await hu.loopFn();assert(!targets().some((t)=>/^slot/.test(t.key)),'a quick tap does not open the editor');
  d._touch(1,100,150);await sleep(200);d._touch(2,100,220);await sleep(700);d._touch(3,100,220);await hu.loopFn();assert(!targets().some((t)=>/^slot/.test(t.key)),'a moving finger does not open the editor');
  d._touch(1,100,150);await sleep(800);d._touch(3,100,150);await hu.loopFn();
  assert(targets().some((t)=>t.key==='slot0')&&targets().some((t)=>t.key==='editDone'),'holding a gauge opens the editor');
  if(out)fs.writeFileSync(out,last.png());
  await tap('slot5');                                   // slot 0 was picked by the hold: tap slot 5 to swap
  let s=slots();assert(s,'the layout is saved');assert.equal(s[0],'stft1');assert.equal(s[5],'rpm');
  await tap('slot2');await tap('editChange');s=slots();assert.equal(s[2],'coolant','Change brings in the next gauge');assert.equal(new Set(s).size,16);
  await tap('editDone');assert(!targets().some((t)=>/^slot/.test(t.key)),'Done closes the editor');
  await tap('editStart');assert(targets().some((t)=>t.key==='slot0'),'the Edit gauges button opens it too');
  await tap('editReset');assert.equal(slots()[0],'rpm');await tap('editDone');
  console.log('PASS hold-to-edit: quick taps and drags ignored, hold opens the editor, swap, change, default layout and done');process.exit(0);
 }catch(e){console.error(e.stack);process.exit(1);}
},700);
