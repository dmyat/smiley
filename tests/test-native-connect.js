'use strict';
process.env.SMILEY_ALL_TABS='1'; // Connect, Flash and Phone are hidden in the shipped build; these tests still cover them

// Native integration with an injected DoIP transport and synthetic TASU.
// Exercises the real-mode traffic hand-off WITHOUT opening any network sockets.
const assert=require('assert'),path=require('path'),fs=require('fs'),os=require('os');
const stage=path.join(__dirname,'../dist/smiley'),app=path.join(stage,'source/javascript');
const {DiagLink}=require(path.join(app,'diaglink'));
const {DoipTransport}=require(path.join(app,'flash-transport'));
const {demoBundle,DemoTransport}=require(path.join(app,'flash-demo'));
const {FlashWorkspace}=require(path.join(app,'flash-workspace'));
const {PAGE:P}=require(path.join(app,'ui'));
let flash;const view=FlashWorkspace.prototype.view;FlashWorkspace.prototype.view=function(){flash=this;return view.call(this);};
let concurrent=0,max=0,connections=0;const calls=[];
DiagLink.prototype.init=async function(){this.available=true;this.diag={available:true,physical:async(target,sid,data)=>{
 concurrent++;max=Math.max(max,concurrent);calls.push({sid,data});await new Promise(r=>setTimeout(r,2));concurrent--;
 if(sid===0x22)return [0x62].concat(data,[0,0]);if(sid===0x01)return [0x41,data[0],128,0,0,0,0,0];
 if(sid===0x2f)return [0x6f].concat(data);if(sid===0x19)return [0x59,2,255];throw Error('Unexpected request');
}};return this;};
DoipTransport.prototype.connect=async function(){assert.equal(concurrent,0,'all TASU requests must finish before DoIP connect');connections++;this.mock=new DemoTransport(demoBundle(),{delay:0});await this.mock.connect();this.active=true;};
DoipTransport.prototype.request=async function(b){return this.mock.request(b);};
DoipTransport.prototype.close=function(){this.active=false;if(this.mock)this.mock.close();};
const recovery=process.argv.includes('--recovery'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'smiley-native-connect-'));
fs.mkdirSync(path.join(dir,'flash'));
fs.writeFileSync(path.join(dir,'flash/connect.json'),JSON.stringify({protocol:'doip',host:'192.0.2.1',port:13400,testerAddress:0x0e00,ecuAddress:0x1234,activationType:0}));
if(recovery)fs.writeFileSync(path.join(dir,'flash/last-run.json'),JSON.stringify({schema:1,incomplete:true,phase:'Erasing'}));
const {headUnit}=require('../kit/tools/hu-stub');
const hu=headUnit(stage,{dataDir:dir,fresh:true,sets:{demo:'off',tuner:'mhd',arm:'on'},image:async()=>{}});
hu.ctx.signals.watch=async(i,instance,h)=>{
 if(h.statusEngineSpeed2)h.statusEngineSpeed2({actualValueRPMEngineCrankshaft:3200});
 if(h.statusCarSpeed2)h.statusCarSpeed2({speedVehicleCentreOfGravity:0});
 if(h.statusGearboxDrive)h.statusGearboxDrive({statusActualStageDrive:'P'});return {available:true};
};
hu.start();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const targets=()=>{const r=Array.from(hu.display.recorders.values())[0];return r?r.targets:[];};
const tap=async(key)=>{await hu.loopFn();const t=targets().find(t=>t.key===key);assert(t,'Missing '+key);await t.run();await hu.loopFn();};
setTimeout(async()=>{
 try{
  assert.equal(connections,0,'never auto-connect');
  if(recovery){
   assert.equal(calls.length,0,'unfinished flash suppresses startup diagnostics');
   await hu.display.onTab(P.connect);await tap('betaContinue');assert(flash.recovery);assert(!targets().some(t=>t.key==='flashConnect'||t.key==='flashResume'));
   await hu.display.onTab(P.controls);await tap('pause');await sleep(100);assert.equal(calls.length,0);assert.equal(connections,0);
   console.log('PASS native recovery guard: no startup diagnostics, connection or resume after an unfinished flash');process.exit(0);
  }
  await hu.display.onTab(P.controls);await hu.handlers.BTN_EXHAUST();assert(calls.some(c=>c.sid===0x2f&&c.data[2]===3));
  await hu.display.onTab(P.connect);await tap('betaContinue');await tap('flashConnect');assert(flash.connected);assert.equal(connections,1);
  assert(calls.some(c=>c.sid===0x2f&&c.data[0]===0x60&&c.data[2]===0),'OEM hand-back before connection');
  const count=calls.length;await sleep(200);assert.equal(calls.length,count,'no background traffic while connected');
  await hu.display.onTab(P.controls);await hu.handlers.BTN_ACTION();await hu.handlers.BTN_EXHAUST();
  await hu.display.onTab(P.faults);await hu.handlers.BTN_ACTION();assert.equal(calls.length,count,'normal controls are blocked');
  await hu.display.onTab(P.connect);await tap('betaContinue');assert(!targets().some(t=>t.key==='flashResume'));await tap('flashConnect');assert(!flash.connected);
  await sleep(100);assert.equal(calls.length,count,'disconnect does not auto-resume');await tap('flashResume');await sleep(200);assert(calls.length>count,'explicit resume restarts reads');assert.equal(max,1);
  console.log('PASS native real-mode connection hand-off with fake transports: OEM return, serialized pause, normal controls blocked, explicit resume, no auto-connect');process.exit(0);
 }catch(e){console.error(e.stack);process.exit(1);}
},700);
