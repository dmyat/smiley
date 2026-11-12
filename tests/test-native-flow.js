'use strict';
// Boots the actual app through the upstream head-unit stub with a synthetic DME.
// This checks native button wiring and transport serialization; it is not a car test.
const assert=require('assert'),path=require('path'),fs=require('fs'),os=require('os');
const stage=path.join(__dirname,'../dist/smiley'),app=path.join(stage,'source/javascript');
const {DiagLink}=require(path.join(app,'diaglink'));
const calls=[];let concurrent=0,maxConcurrent=0,cleared=false;
DiagLink.prototype.init=async function(){
 this.available=true;
 this.diag={available:true,physical:async(target,sid,data,timeout,accept)=>{
  calls.push({target,sid,data:data.slice()});maxConcurrent=Math.max(maxConcurrent,++concurrent);
  await new Promise(r=>setTimeout(r,2));let reply;
  if(sid===0x22)reply=[0x62].concat(data,[0,0]);
  else if(sid===0x01)reply=[0x41,data[0],128,0,0,0,0,0];
  else if(sid===0x2F)reply=[0x6F].concat(data);
  else if(sid===0x19)reply=cleared?[0x59,2,255]:[0x59,2,255,0x12,0x34,0x56,9];
  else if(sid===0x14){cleared=true;reply=[0x54];}
  else throw Error('Unexpected service '+sid);
  concurrent--;if(accept)assert(accept(reply));return reply;
 }};return this;
};
const {headUnit}=require('../kit/tools/hu-stub');
let frames=0;const hu=headUnit(stage,{dataDir:fs.mkdtempSync(path.join(os.tmpdir(),'smiley-native-')),fresh:true,
 sets:{demo:'off',tuner:'mhd',arm:'on'},image:async()=>{frames++;}});
const changes=[];hu.ctx.settings.onChange=fn=>changes.push(fn);
hu.ctx.signals.watch=async(iface,instance,h)=>{
 if(h.statusEngineSpeed2)h.statusEngineSpeed2({actualValueRPMEngineCrankshaft:3200});
 if(h.statusEngineTemperature)h.statusEngineTemperature({temperatureEngineDrive:140,temperatureEngineOilDrive:148});
 if(h.statusCarSpeed2)h.statusCarSpeed2({speedVehicleCentreOfGravity:0});
 if(h.statusGearboxDrive)h.statusGearboxDrive({statusActualStageDrive:'P'});
 return {available:true};
};
hu.start();
setTimeout(async()=>{
 try{
  assert(frames>0);assert(!calls.some(c=>[0x2F,0x14,0x3D].includes(c.sid)),'startup must not actuate');
  const P=require(path.join(app,'ui')).PAGE;
  await hu.display.onTab(P.controls); // Tune
  await hu.handlers.BTN_ACTION(); // Map 1
  assert(calls.some(c=>c.sid===0x2F&&c.data[0]===1&&c.data[1]===0));
  await hu.handlers.BTN_EXHAUST();assert(calls.some(c=>c.sid===0x2F&&c.data[0]===0x60));
  await hu.display.onTab(P.faults); // Faults
  await hu.handlers.BTN_ACTION();const before=calls.filter(c=>c.sid===0x14).length;
  await hu.handlers.BTN_CLEAR();assert.equal(calls.filter(c=>c.sid===0x14).length,before);
  await hu.handlers.BTN_CLEAR();assert.equal(calls.filter(c=>c.sid===0x14).length,before+1);assert(cleared);
  // Demo switched on while the flap is held open: it goes back to the car first, then nothing is sent.
  assert(!calls.some(c=>c.sid===0x2F&&c.data[0]===0x60&&c.data[2]===0),'no OEM hand-back yet');
  hu.ctx.settings.values.demo='on';changes.forEach(fn=>fn('demo'));await new Promise(r=>setTimeout(r,100));
  if(!calls.some(c=>c.sid===0x2F&&c.data[0]===0x60&&c.data[1]===0xFD&&c.data[2]===0))throw Error('flap not handed back to OEM before demo; last calls: '+JSON.stringify(calls.slice(-3)));
  const count=calls.length;await hu.display.onTab(P.controls);await hu.handlers.BTN_ACTION();await hu.handlers.BTN_EXHAUST();await new Promise(r=>setTimeout(r,400));assert.equal(calls.length,count);
  assert.equal(maxConcurrent,1);assert(calls.every(c=>c.target===0x12));
  console.log('PASS native app startup, tabs, MHD selection, exhaust, two-step DME clear, OEM hand-back before demo, demo lock and serialized transport');process.exit(0);
 }catch(e){console.error(e.stack);process.exit(1);}
},600);
