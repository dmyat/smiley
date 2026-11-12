'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os');
const APP=path.join(__dirname,'../dist/smiley/source/javascript');
const {Session}=require(path.join(APP,'session'));
const {Telemetry}=require(path.join(APP,'telemetry'));
const {Faults}=require(path.join(APP,'faults'));
const {XDriveControl}=require(path.join(APP,'xdrive'));
const {PhoneServer,wifiAddress}=require(path.join(APP,'phone'));
const {TuneControl}=require(path.join(APP,'tune'));
const {AutoFlap}=require(path.join(APP,'auto'));
const {Perf}=require(path.join(APP,'perf'));
const {GaugeLayout,DEFAULT}=require(path.join(APP,'layout'));
const UI=require(path.join(APP,'ui'));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'smiley-tests-'));
const quiet={info(){},warn(){},error(){}};
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
async function reject(fn,pattern){await assert.rejects(fn,pattern);}
function ctx(tuner){return {settings:{get:(k)=>k==='tuner'?tuner:undefined},spec:{config:{dme:{},bm3MarkerAddress:'807FFE50'}},log:quiet};}
function marker(s){const b=Buffer.alloc(255);b.write(s);return [0x62,0xF3,1].concat(Array.from(b));}
async function run(){
 await test('Commands wait for telemetry; competing commands never overlap',async()=>{
  const s=new Session(),seen=[];let release;const p=s.poll(()=>new Promise(r=>{release=r;seen.push('read');}));await Promise.resolve();
  const a=s.action(async()=>seen.push('command'));await reject(()=>s.action(()=>{}),/Another/);assert.deepStrictEqual(seen,['read']);release();await p;await a;assert.deepStrictEqual(seen,['read','command']);
 });
 await test('Demo and paused sessions reject all vehicle actions',async()=>{
  const s=new Session();let writes=0;s.demo=true;await reject(()=>s.action(()=>writes++),/Demo/);s.demo=false;s.paused=true;await reject(()=>s.action(()=>writes++),/paused/);assert.equal(writes,0);
 });
 await test('Failed commands release the session lock',async()=>{const s=new Session();await reject(()=>s.action(()=>{throw Error('failed');}),/failed/);assert.equal(s.busy,false);await s.action(()=>{});});
 await test('Each telemetry field expires independently; boost uses standard pressure until the car reports its own',async()=>{
  let time=1000;const t=new Telemetry(ctx(),new Session(),()=>time);t.put('rpm',800);t.put('boost',201.3);
  let s0=t.snapshot(false);assert(Math.abs(s0.boost-1)<1e-8);assert.equal(s0.boostMissingBaro,true);t.put('baro',91.3);s0=t.snapshot(false);assert(Math.abs(s0.boost-1.1)<1e-8);assert.equal(s0.boostMissingBaro,false);
  time+=4000;t.put('coolant',95);assert.equal(t.snapshot(false).rpm,null);assert.equal(t.snapshot(false).coolant,95);
  time+=16000;assert.equal(t.snapshot(false).coolant,null);
 });
 await test('Invalid sensor values invalidate the last live value',async()=>{const t=new Telemetry(ctx(),new Session());t.scaled('rpm',3200,.25,0,65535);assert.equal(t.fresh('rpm'),800);t.scaled('rpm',65535,.25,0,65535);assert.equal(t.fresh('rpm'),null);});
 await test('Park check fails closed for missing or stale speed and an unknown selector',async()=>{
  let now=1000;const t=new Telemetry(ctx(),new Session(),()=>now);assert(!t.parked());
  t.put('speed',0);assert(!t.parked(),'no selector position yet');t.stages.gearbox='P';assert(t.parked());
  now+=5001;assert(!t.parked(),'speed is stale');t.put('speed',0);assert(t.parked());t.put('speed',2);assert(!t.parked());
 });
 await test('A parked car whose selector has been quiet for minutes still counts as parked',async()=>{
  let now=1000;const t=new Telemetry(ctx(),new Session(),()=>now);t.stages.gearbox='P';
  now+=10*60*1000;t.put('speed',0);assert(t.parked());
 });
 await test('Selector: R, N or D from either source wins; a source that cannot tell does not overrule P',async()=>{
  const t=new Telemetry(ctx(),new Session(),()=>1000);t.put('speed',0);
  t.stages.gearbox='P';t.stages.powertrain=null;assert.equal(t.stage,'P');assert(t.parked());
  t.stages.powertrain='D';assert.equal(t.stage,'D');assert(!t.parked());
  t.stages={powertrain:null};assert.equal(t.stage,null);assert(!t.parked());
  t.stages={powertrain:'P'};assert(t.parked());t.stages.gearbox='R';assert(!t.parked());
 });
 await test('Speed and temperatures are re-read, so steady values stay live',async()=>{
  const polls={};const c=ctx();c.signals={watch:async(iface,inst,h,log,opts)=>{polls[iface]=opts&&opts.pollMs;return {available:true};}};
  const t=new Telemetry(c,new Session());await t.start({diag:{}});
  assert(polls['de.bmw.infotainment.vehicle.Vehicle2']>0&&polls['de.bmw.infotainment.vehicle.Vehicle2']<5000);
  assert(polls['de.bmw.infotainment.vehicle.CDS']>0&&polls['de.bmw.infotainment.vehicle.CDS']<3000);
 });
 await test('Flap commands queue behind a running request instead of being dropped',async()=>{
  const s=new Session(),seen=[];let release;const scan=s.action(()=>new Promise(r=>{release=()=>{seen.push('scan');r();};}));
  const oem=s.queued(async()=>seen.push('OEM'));await reject(()=>s.action(()=>{}),/Another/);assert.deepStrictEqual(seen,[]);assert.equal(s.busy,true);
  release();await scan;await oem;assert.deepStrictEqual(seen,['scan','OEM']);assert.equal(s.busy,false);
  s.paused=true;await reject(()=>s.queued(()=>seen.push('x')),/paused/);s.paused=false;s.demo=true;await reject(()=>s.queued(()=>seen.push('x')),/Demo/);assert.equal(seen.length,2);
 });
 await test('A failed queued command does not block the ones behind it',async()=>{
  const s=new Session();const bad=s.queued(()=>{throw Error('nope');}),good=s.queued(async()=>'ok');await reject(()=>bad,/nope/);assert.equal(await good,'ok');assert.equal(s.busy,false);
 });
 await test('A saved fault scan is shown after a restart but never allows clearing',async()=>{
  const dir=fs.mkdtempSync(path.join(tmp,'saved-'));fs.writeFileSync(path.join(dir,'last-dme-scan.json'),JSON.stringify({at:Date.now()-1000,ecu:'12',rows:[{code:'123456',status:'Active',text:'x'},{bad:1}]}));
  const f=new Faults({available:true},{parked:()=>true},dir);assert.equal(f.rows.length,1);assert.equal(f.at,null);assert(/Last scan/.test(f.note));
  assert.throws(()=>f.confirm(Date.now()),/Read the faults again/);
  fs.writeFileSync(path.join(dir,'last-dme-scan.json'),'{broken');const g=new Faults({available:true},{parked:()=>true},dir);assert.equal(g.rows.length,0);
 });
 await test('MHD needs the exact echo and never claims active-map readback',async()=>{
  let bad=true,writes=0;const link={available:true,diag:{},sendToDme:async(sid,data)=>{writes++;return {ok:true,sid:0x6F,data:bad?[1,3]:data};}};
  const t=new TuneControl(ctx('mhd'));await t.start(link);await t.setMap(2);assert.equal(t.map,null);assert.equal(t.noteType,'warn');bad=false;await t.setMap(2);assert.equal(t.map,2);assert.equal(t.mapConfirmed,false);assert.equal(writes,2);
 });
 await test('Off and absent links send no map commands',async()=>{
  let calls=0;const link={available:true,diag:{},sendToDme:async()=>calls++};let t=new TuneControl(ctx('off'));await t.start(link);await t.setMap(1);assert.equal(calls,0);
  t=new TuneControl(ctx('mhd'));link.available=false;await t.start(link);await t.setMap(1);assert.equal(calls,0);
 });
 await test('Unknown bootmod3 ROM blocks map writes',async()=>{
  const calls=[];const link={available:true,diag:{available:true,physical:async(target,sid,data)=>{calls.push(sid);if(sid===0x2C)return [0x6C,data[0],0xF3,1];if(sid===0x22)return marker('BM3_R#NOT_SUPPORTED#');throw Error('unexpected write');}}};
  const t=new TuneControl(ctx('bm3'));await t.start(link);await t.setMap(2);assert.equal(t.verified,false);assert(!calls.includes(0x3D));assert(!calls.includes(0x3E));assert.equal(t.map,null);
 });
 await test('Supported bootmod3 map writes are confirmed from memory',async()=>{
  const memory={D001D006:[0,1],D001D099:[0],D001D116:Array(24).fill(0)};
  const link={available:true,diag:{available:true,physical:async(target,sid,data)=>{
   assert.equal(target,0x12);const addr=Buffer.from(data.slice(1,5)).toString('hex').toUpperCase();
   if(sid===0x2C)return [0x6C,data[0],0xF3,1];if(sid===0x22)return marker('BM3_R#011000#');
   if(sid===0x23)return [0x63].concat(memory[addr].slice(0,data[5]));
   if(sid===0x3D){memory[addr]=data.slice(6);return [0x7D];}throw Error('unexpected service');}}};
  const t=new TuneControl(ctx('bm3'));await t.start(link);assert(t.verified);await t.setMap(4);assert.equal(t.map,4);assert.equal(t.mapConfirmed,true);
 });
 await test('DME scan reports refusal and malformed records as errors, not zero faults',async()=>{
  let reply=null;const f=new Faults({available:true,diag:{physical:async()=>reply}},{parked:()=>true},tmp);
  await reject(()=>f.read(),/did not answer/);reply=[0x7F,0x19,0x22];await reject(()=>f.read(),/conditions/);reply=[0x59,2,255,1];await reject(()=>f.read(),/Incomplete/);assert.equal(f.at,null);
 });
 await test('Clearing targets only DME and rechecks faults after positive response',async()=>{
  let cleared=false;const calls=[];const link={available:true,diag:{available:true,physical:async(target,sid,data)=>{assert.equal(target,0x12);calls.push(sid);return cleared?[0x59,2,255]:[0x59,2,255,0x12,0x34,0x56,9];}},sendToDme:async(sid,data)=>{assert.equal(sid,0x14);assert.deepStrictEqual(data,[255,255,255]);cleared=true;return {ok:true,sid:0x54};}};
  const f=new Faults(link,{parked:()=>true},tmp);await f.read();assert.equal(f.rows[0].code,'123456');assert.equal(f.confirm(Date.now()),false);assert.equal(f.confirm(Date.now()),true);await f.clear();assert.equal(f.rows.length,0);assert.equal(calls.filter((c)=>c===0x19).length,2);assert.equal(calls.filter((c)=>c===0x22).length,1,'the engine unit is asked for its type once, for the fault descriptions');assert(/No engine faults now/.test(f.note));
 });
 await test('Clear rechecks Park immediately before sending',async()=>{let writes=0;const f=new Faults({sendToDme:async()=>writes++},{parked:()=>false},tmp);f.at=Date.now();assert.throws(()=>f.confirm(Date.now()),/Park/);await reject(()=>f.clear(),/no longer in Park/);assert.equal(writes,0);});
 await test('Fault-clear rejection does not show success',async()=>{const f=new Faults({sendToDme:async()=>({ok:false,reason:'conditions not correct'})},{parked:()=>true},tmp);await reject(()=>f.clear(),/conditions/);assert(!f.note.includes('Cleared'));});
 await test('Exhaust Close without live RPM requests OEM',async()=>{
  const modes=[],c={armedSetting:true,setMode:async(m)=>modes.push(m)};const a=new AutoFlap({controller:c,get:(k)=>({closeLimit:'4000',hold:'off'})[k],rpm:()=>null,log:quiet});await a.press('CLOSED');assert.deepStrictEqual(modes,['OEM']);a._stop();
 });
 await test('Phone binds only an actual private Wi-Fi interface',async()=>{
  assert.equal(wifiAddress({eth0:[{family:'IPv4',address:'172.16.222.97'}]}),null);
  assert.equal(wifiAddress({wlan_bridge:[{family:'IPv4',address:'172.16.222.97',internal:false}]}),'172.16.222.97');
  assert.equal(wifiAddress({wlan0:[{family:'IPv4',address:'8.8.8.8',internal:false}]}),null);
 });
 await test('Phone API requires pairing, refuses writes, expires tokens on Stop',async()=>{
  const p=new PhoneServer(()=>({rpm:900}));p.token='test-token';
  function req(url,authorization,method){let result;const res={writeHead:(s,h)=>{result={status:s,headers:h};},end:(d)=>{result.body=d;}};p.handle({url,method:method||'GET',headers:{authorization}},res);return result;}
  assert.equal(req('/api/stats').status,401);assert.equal(req('/api/stats','Bearer test-token').status,200);assert.equal(req('/api/stats','Bearer test-token','POST').status,405);assert.equal(req('/api/logs','Bearer test-token').status,404);assert.equal(req('/api/logs/x.csv','Bearer test-token').status,404);
  p.stop();assert.equal(req('/api/stats','Bearer test-token').status,401);assert.equal(p.view().connected,false);
 });
 await test('Peaks keep each channel\'s lowest and highest until Reset peaks',async()=>{
  let now=1000;const t=new Telemetry(ctx(),new Session(),()=>now);t.put('rpm',900);t.snapshot(false);t.put('rpm',5200);t.snapshot(false);t.put('rpm',2000);
  const s=t.snapshot(false);assert.deepStrictEqual(s.peaks.rpm,{min:900,max:5200});assert.equal(s.peaks.boost,undefined);t.resetPeaks();assert.deepStrictEqual(t.snapshot(false).peaks.rpm,{min:2000,max:2000});
 });
 await test('Oil pressure and boost target are shown over ambient and need barometric pressure',async()=>{
  const t=new Telemetry(ctx(),new Session(),()=>1000);t.put('oilp',4.5);t.put('boostTarget',221.3);assert.equal(t.snapshot(false).oilp,null);assert.equal(t.snapshot(false).boostTarget,null);
  t.put('baro',101.3);const s=t.snapshot(false);assert(Math.abs(s.oilp-3.487)<1e-6);assert(Math.abs(s.boostTarget-1.2)<1e-6);
 });
 await test('Misfire counts are summed per driving cycle; an engine without them is left alone',async()=>{
  const t=new Telemetry(ctx(),new Session(),()=>1000);let asked=0;
  t.reader={monitor:async(ecu,mid,did)=>{asked++;assert.equal(ecu,0x12);return did?null:[{tid:0x0C,value:mid===0xA4?3:0},{tid:0x0B,value:99}];}};
  await t.readMisfire();assert.equal(t.fresh('misfire'),3);assert.deepStrictEqual(t.misfires,[0,0,3,0,0,0]);
  const n=new Telemetry(ctx(),new Session(),()=>1000);n.reader={monitor:async()=>null};await n.readMisfire();assert.equal(n.fresh('misfire'),null);assert(n.next.misfire>1000+60000);
 });
 await test('Whole-car scan lists every unit\'s faults by name and reports units that refuse',async()=>{
  const dir=fs.mkdtempSync(path.join(tmp,'car-'));
  const link={available:true,diag:{functional:async(sid,params)=>{assert.equal(sid,0x19);assert.deepStrictEqual(params,[0x02,0x0C]);
   return new Map([[0x12,[0x59,2,0xFF,0x12,0x34,0x56,0x09]],[0x29,[0x59,2,0xFF,0x48,0x07,0x24,0x08,0x48,0x07,0x25,0x08]],[0x60,[0x59,2,0xFF]],[0x18,[0x7F,0x19,0x11]]]);}}};
  const f=new Faults(link,{parked:()=>true},dir);f.setScope('car');await f.read();
  assert.equal(f.rows.length,3);assert.equal(f.rows[0].unit,'DSC brakes');assert.equal(f.rows[2].unit,'DME engine');assert.deepStrictEqual(f.targets().sort(),[0x12,0x29]);assert(/Checked 3 modules/.test(f.note)&&/1 would not be scanned/.test(f.note));
  const g=new Faults(link,{parked:()=>true},dir);assert.equal(g.scope,'car');assert.equal(g.rows.length,3);assert.equal(g.at,null);
  const none=new Faults({available:true,diag:{functional:async()=>new Map()}},{parked:()=>true},fs.mkdtempSync(path.join(tmp,'car-')));none.setScope('car');await reject(()=>none.read(),/did not answer/);
 });
 await test('Whole-car clear needs a fresh scan, Park and two presses, asks unconfirmed units once more and names refusals',async()=>{
  const sent=[];let faults=true;
  const link={available:true,diag:{
   functional:async(sid)=>{sent.push('F'+sid.toString(16));if(sid===0x14)return new Map([[0x12,[0x54]]]);return new Map([[0x12,faults?[0x59,2,0xFF,1,2,3,9]:[0x59,2,0xFF]],[0x29,faults?[0x59,2,0xFF,4,5,6,8]:[0x59,2,0xFF]],[0x60,[0x59,2,0xFF,7,8,9,8]]]);},
   physical:async(addr,sid)=>{sent.push(addr.toString(16)+':'+sid.toString(16));if(sid===0x22)return [0x7F,0x22,0x31];faults=false;return addr===0x60?[0x7F,0x14,0x22]:[0x54];}}};
  let parked=false;const f=new Faults(link,{parked:()=>parked},fs.mkdtempSync(path.join(tmp,'car-')));f.setScope('car');
  assert.throws(()=>f.confirm(Date.now()),/Scan again first/);await f.read();assert.throws(()=>f.confirm(Date.now()),/Park/);parked=true;
  const now=Date.now();assert.equal(f.confirm(now),false);assert(/3 module/.test(f.note));assert(!sent.includes('F14'));assert.equal(f.confirm(now+1000),true);
  parked=false;await reject(()=>f.clear(),/no longer in Park/);assert(!sent.includes('F14'));parked=true;await f.clear();
  assert.deepStrictEqual(sent,['F19','12:22','29:22','60:22','F14','29:14','60:14','F19'],'each unit with faults is asked for its type once (read-only), then the clear');assert(/Cleared 2 of 3 module/.test(f.note));assert(/KOMBI cluster: conditions not correct/.test(f.note));assert(!sent.some((x)=>/:10$/.test(x)),'no session change');
 });
 await test('Engine scope still reads and clears the DME only',async()=>{
  const calls=[];const link={available:true,diag:{physical:async(a,sid)=>{calls.push([a,sid]);return [0x59,2,0xFF];},functional:async()=>{throw Error('must not ask every unit');}},sendToDme:async(sid)=>{calls.push([0x12,sid]);return {ok:true,sid:0x54};}};
  const f=new Faults(link,{parked:()=>true},fs.mkdtempSync(path.join(tmp,'dme-')));assert.equal(f.scope,'dme');await f.read();const now=Date.now();f.confirm(now);f.confirm(now+1);await f.clear();assert(calls.every((c)=>c[0]===0x12));
 });
 await test('Each vehicle interface is opened once, and its samples drive the performance tools',async()=>{
  const opened=[],h={};const c=ctx();c.signals={watch:async(iface,inst,handlers)=>{opened.push(iface);Object.assign(h,handlers);return {available:true};}};
  const t=new Telemetry(c,new Session());await t.start({diag:{}});assert.equal(new Set(opened).size,opened.length,'no interface twice: '+opened.join(', '));
  const seen=[];let resets=0;t.onSample((d)=>seen.push(d),()=>resets++);
  h.statusCarSpeed2({speedVehicleCentreOfGravity:6400});h.statusEngineSpeed2({actualValueRPMEngineCrankshaft:12000});h.statusLongitudinalAccelerationMassCenter({longitudinalAccelerationCentreOfGravity:32500+2452});
  h.statusGearboxDrive({statusActualStageDrive:'D',statusActualGearDrive:'G3'});
  const last=seen[seen.length-1];assert.equal(last.speed,100);assert.equal(last.rpm,3000);assert(Math.abs(last.gLong-0.5)<0.01);assert.equal(last.demo,false);assert.equal(t.data().gear,3);assert.equal(t.data().stage,'D');
  h.statusCarSpeed2({speedVehicleCentreOfGravity:65535});assert.equal(t.data().speed,undefined);
  const n=seen.length;t.setDemo(true);assert.equal(resets,1);h.statusEngineSpeed2({actualValueRPMEngineCrankshaft:8000});assert.equal(seen.length,n,'the car is not fed while the demo drive runs');assert.equal(t.data().demo,true);
  t.setDemo(false);assert.equal(resets,2);clearInterval(t.simTimer);
 });
 await test('Dial scales are learned from the car (lowest and highest), kept between drives, and never from demo data',async()=>{
  const dir=fs.mkdtempSync(path.join(tmp,'ranges-'));const c=Object.assign(ctx(),{dataDir:dir});
  let now=100000;const t=new Telemetry(c,new Session(),()=>now);t.put('baro',101.3);t.put('boost',101.3+140);t.put('coolant',20);const s=t.snapshot(false);
  assert(Math.abs(s.learned.boost.max-1.4)<1e-9);assert.deepStrictEqual(s.learned.coolant,{min:20,max:20});
  t.snapshot(true);assert(Math.abs(t.learned.boost.max-1.4)<1e-9&&t.learned.rpm===undefined,'the demo drive teaches nothing');
  t.put('boost',101.3-60);t.put('coolant',96);t.snapshot(false);assert(Math.abs(t.learned.boost.min+0.6)<1e-9&&Math.abs(t.learned.boost.max-1.4)<1e-9);assert.deepStrictEqual(t.learned.coolant,{min:20,max:96});
  now+=31000;t.put('boost',101.3+210);t.put('baro',101.3);t.snapshot(false);assert(fs.existsSync(path.join(dir,'ranges.json')));
  const again=new Telemetry(c,new Session(),()=>now);assert(Math.abs(again.learned.boost.max-2.1)<1e-9,'remembered after a restart');assert.equal(again.learned.coolant.min,20);
  again.resetPeaks();assert.deepStrictEqual(again.learned,{});assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(dir,'ranges.json'),'utf8')),{});
  fs.writeFileSync(path.join(dir,'ranges.json'),'{"boost":"x","hpfp":{"min":9,"max":2},"torque":{"min":0,"max":520},"other":{"min":1,"max":2}}');
  const bad=new Telemetry(c,new Session(),()=>now);assert.deepStrictEqual(bad.learned,{torque:{min:0,max:520}});
 });
 await test('Gauge layout: swapping and changing never loses or repeats a gauge, and is remembered',async()=>{
  const dir=fs.mkdtempSync(path.join(tmp,'layout-'));const g=new GaugeLayout(dir,quiet);assert.deepStrictEqual(g.slots,DEFAULT);assert.deepStrictEqual(g.page(1)[0],'timing');
  assert(g.swap(0,9));assert.equal(g.slots[0],'lambda');assert.equal(g.slots[9],'rpm');assert.equal(g.swap(3,3),false);assert.equal(g.swap(3,99),false);
  const was=g.slots[1],next=g.change(1,1);assert.equal(g.slots[1],next);assert(g.slots.indexOf(was)>=0&&g.slots.indexOf(was)!==1,'the old gauge moved, it was not dropped');
  for(let i=0;i<40;i++){g.change(i%16,1);g.swap(i%16,(i*7)%16);assert(GaugeLayout.valid(g.slots));assert.equal(new Set(g.slots).size,16);}
  const again=new GaugeLayout(dir,quiet);assert.deepStrictEqual(again.slots,g.slots);again.reset();assert.deepStrictEqual(new GaugeLayout(dir,quiet).slots,DEFAULT);
  fs.writeFileSync(path.join(dir,'gauges.json'),JSON.stringify({slots:['rpm','rpm']}));assert.deepStrictEqual(new GaugeLayout(dir,quiet).slots,DEFAULT);
  fs.writeFileSync(path.join(dir,'gauges.json'),'{oops');assert.deepStrictEqual(new GaugeLayout(dir,quiet).slots,DEFAULT);
 });
 await test('A press is matched to the gauge card under the finger',async()=>{
  assert.equal(UI.slotAt(30,60),0);assert.equal(UI.slotAt(24+390*3+100,58+100),3);assert.equal(UI.slotAt(24+390+10,58+196+10),5);assert.equal(UI.slotAt(24+380,100),-1,'the gap between cards');assert.equal(UI.slotAt(800,470),-1,'the buttons below');assert.equal(UI.slotAt(5,5),-1);
 });
 await test('Only the fast-moving gauges on screen are read every turn',async()=>{
  const t=new Telemetry(ctx(),new Session());t.setFocus(['rpm','boost','oil','misfire','lambda']);assert.deepStrictEqual(t.focus,['boost','lambda']);t.setFocus(null);assert.equal(t.focus,null);
 });
 await test('Engine requests are paced: one at a time, with a gap between them',async()=>{
  let now=1000,asked=0;const c=ctx();c.spec={config:{dme:{boost:[{did:'F470',bytes:2}]}}};const t=new Telemetry(c,new Session(),()=>now);
  t.link={available:true};t.reader={value:async()=>{asked++;return 150;}};t.setFocus(['boost']);
  await t.poll();assert.equal(asked,1);await t.poll();assert.equal(asked,1,'not again straight away');now+=10;await t.poll();assert.equal(asked,1);now+=20;await t.poll();assert.equal(asked,2,'again after the gap');
 });
 const xdCtx=(on)=>({settings:{get:(k)=>k==='xdrive'?(on?'on':'off'):undefined},log:quiet});
 const xdCar=(over)=>({data:()=>Object.assign({demo:false,rpm:0,speed:0,stage:'P',condition:7},over)});
 const xdLink=(sent,opts)=>({available:true,diag:{physical:async(ecu,sid,data)=>{sent.push(ecu.toString(16)+':'+[sid].concat(data).map((b)=>b.toString(16).padStart(2,'0')).join(''));
  if(sid===0x22&&data[0]===0xF1&&data[1]===0x50)return ecu===0x29?[0x62,0xF1,0x50,0x0F,0x25,0x10]:[0x7F,0x22,0x31];
  if(sid===0x22&&ecu===0x29&&data[0]===0xDB&&data[1]===0xE1)return [0x62,0xDB,0xE1,0x01];
  if(sid===0x22)return [0x7F,0x22,0x31];
  if(sid===0x2E)return (opts&&opts.refuse)?[0x7F,0x2E,0x22]:[0x6E,data[0],data[1]];
  throw Error('unexpected service '+sid);}}});
 await test('AWD / 2WD: disabled sends nothing at all',async()=>{
  const sent=[];const x=new XDriveControl(xdCtx(false),xdCar());await x.start(xdLink(sent));await x.requestOff();await x.requestOff();assert.deepStrictEqual(sent,[]);assert.equal(x.view().enabled,false);
 });
 await test('AWD / 2WD: 2WD is one write to the DSC after the checks and a second press',async()=>{
  const sent=[];const x=new XDriveControl(xdCtx(true),xdCar());await x.start(xdLink(sent));
  assert.equal(x.view().unit,'DSC_G20');assert(x.view().tested);assert(!sent.some((s)=>/:2e/.test(s)),'identifying only reads');
  await x.requestOff();assert(!sent.some((s)=>/:2e/.test(s)),'the first press only asks');assert.equal(x.view().confirmWhat,'off');
  await x.requestOff();assert.deepStrictEqual(sent.filter((s)=>/:2e/.test(s)),['29:2edbe100']);assert.equal(x.view().mode,'REQUESTED');assert(!sent.some((s)=>/:10/.test(s)),'no session change when the DSC accepts');
  await x.requestOn();assert.equal(sent.filter((s)=>/:2e/.test(s)).length,1,'AWD is not offered on this DSC variant: nothing sent');
 });
 await test('AWD / 2WD: moving, out of P, engine running or demo data block the switch',async()=>{
  for(const over of [{speed:12},{stage:'D'},{rpm:800,condition:10},{demo:true}]){
   const sent=[];const x=new XDriveControl(xdCtx(true),xdCar(over));await x.start(xdLink(sent));await x.requestOff();await x.requestOff();
   assert(!sent.some((s)=>/:2e/.test(s)),'blocked: '+JSON.stringify(over));assert(x.view().blocker,'a reason is shown');
  }
 });
 await test('AWD / 2WD: a refusal from the DSC is shown, not reported as done',async()=>{
  const sent=[];const x=new XDriveControl(xdCtx(true),xdCar());await x.start(xdLink(sent,{refuse:true}));await x.requestOff();await x.requestOff();
  assert.equal(x.requested,false);assert.equal(x.view().mode,'UNKNOWN');assert(/refused/.test(x.view().note));
 });
 const perfSettings=(over)=>(k)=>Object.assign({speedUnit:'mph',rollout:'off',weight:'1850',loss:'15',body:'sedan'},over)[k];
 await test('Drag timer times a launch from standstill and keeps the best; demo runs are never saved',async()=>{
  const dir=fs.mkdtempSync(path.join(tmp,'perf-'));const p=new Perf(null,perfSettings(),dir,quiet);
  let t=0;const feed=(v,g,demo)=>{p.sample({speed:v,gLong:g,rpm:3000,demo:!!demo},t);t+=50;};
  for(let i=0;i<30;i++)feed(0,0);                                  // standing: armed after 1 s
  assert.equal(p.timer.state,'ready');
  for(let v=0;v<=200;v+=1.2)feed(v,0.68);                          // 1.2 km/h per 50 ms = 24 km/h per second
  for(let i=0;i<10;i++)feed(150,-0.3);                             // lift: the run ends
  const v=p.view(t);const s=v.drag.splits.find((x)=>x.key==='0-60mph');assert(Math.abs(s.s-96.56/24)<0.08,'0-60 '+s.s);assert.equal(s.best,s.s);assert(s.isNew);
  assert(fs.existsSync(path.join(dir,'perf.json')));const q=new Perf(null,perfSettings(),dir,quiet);assert.equal(q.view(0).drag.splits.find((x)=>x.key==='0-60mph').best,s.s);
  const d2=fs.mkdtempSync(path.join(tmp,'perf-'));const demo=new Perf(null,perfSettings(),d2,quiet);t=0;const df=(v)=>{demo.sample({speed:v,gLong:0.6,rpm:3000,demo:true},t);t+=50;};
  for(let i=0;i<30;i++)df(0);for(let v=0;v<=120;v+=1.2)df(v);for(let i=0;i<10;i++)df(80);assert(demo.view(t).drag.splits[0].best>0);assert(!fs.existsSync(path.join(d2,'perf.json')));
 });
 await test('Brake test measures the stopping distance from 60 mph',async()=>{
  const p=new Perf(null,perfSettings(),fs.mkdtempSync(path.join(tmp,'perf-')),quiet);let t=0;
  for(let i=0;i<20;i++){p.sample({speed:110,gLong:0,rpm:2000},t);t+=50;}assert.equal(p.brake.state,'ready');
  const a=1.0*9.80665*3.6;                                          // 1 g, in km/h per second
  for(let v=110;v>0;v-=a*0.05){p.sample({speed:Math.max(0,v),gLong:-1,rpm:1500},t);t+=50;}p.sample({speed:0,gLong:-1,rpm:800},t);
  const r=p.brake.last;assert(r&&r.result['60-0mph'],'a stop was counted');const v0=60*1.609344/3.6,ideal=v0*v0/(2*9.80665);
  assert(Math.abs(r.result['60-0mph'].m-ideal)<1.5,r.result['60-0mph'].m+' vs '+ideal);assert(Math.abs(r.peakG-1)<1e-9);
 });
 await test('A brake that is released mid-stop is not counted',async()=>{
  const p=new Perf(null,perfSettings(),fs.mkdtempSync(path.join(tmp,'perf-')),quiet);let t=0;
  for(let i=0;i<20;i++){p.sample({speed:110,gLong:0},t);t+=50;}for(let v=110;v>70;v-=1.8){p.sample({speed:v,gLong:-1},t);t+=50;}
  for(let i=0;i<40;i++){p.sample({speed:70,gLong:0},t);t+=50;}assert.equal(p.brake.last,null);assert.equal(p.brake.run,null);
 });
 await test('Virtual dyno turns a steady pull into the power that produced it',async()=>{
  const p=new Perf(null,perfSettings(),fs.mkdtempSync(path.join(tmp,'perf-')),quiet);let t=0;
  // a constant 0.4 g in one gear (rpm = 40 x km/h) from 50 to 160 km/h
  for(let v=50;v<=160;v+=0.4*9.80665*3.6*0.05){p.sample({speed:v,gLong:0.4,rpm:v*40,torque:400},t);t+=50;}
  for(let i=0;i<20;i++){p.sample({speed:160,gLong:0,rpm:6400},t);t+=50;}
  const r=p.dyno.last;assert(r,'a run was saved');const v=r.curve[r.curve.length-1].rpm/40/3.6;
  const expect=(1850*0.4*9.80665*v+0.5*1.2*0.62*v*v*v+0.013*1850*9.80665*v)/(1-0.15);   // at the wheels, over the 15 % lossassert(Math.abs(r.peakP-expect)/expect<0.06,r.peakP+' vs '+expect);assert(r.peakPrpm>5500);
  const one=p.view(t).dyno;assert.equal(one.last,r);assert.equal(one.prev,null);assert.equal(one.count,1);
  for(let v=50;v<=160;v+=0.5*9.80665*3.6*0.05){p.sample({speed:v,gLong:0.5,rpm:v*40,torque:450},t);t+=50;}for(let i=0;i<20;i++){p.sample({speed:160,gLong:0,rpm:6400},t);t+=50;}
  const two=p.view(t).dyno;assert.equal(two.count,2);assert.equal(two.prev,r,'the pull before is kept to compare');assert(two.last.peakP>r.peakP,'the harder pull made more');
  const s=new Perf(null,perfSettings(),fs.mkdtempSync(path.join(tmp,'perf-')),quiet);t=0;for(let v=50;v<=60;v+=0.7){s.sample({speed:v,gLong:0.4,rpm:v*40},t);t+=50;}for(let i=0;i<20;i++){s.sample({speed:60,gLong:0,rpm:2400},t);t+=50;}assert.equal(s.dyno.last,null);assert.equal(s.dyno.state,'short');
 });
 await test('G-meter keeps the peak in each direction',async()=>{
  const p=new Perf(null,perfSettings(),fs.mkdtempSync(path.join(tmp,'perf-')),quiet);p.sample({speed:50,gLong:0.5,gLat:-0.8},0);p.sample({speed:50,gLong:-1.1,gLat:0.3},200);
  assert.deepStrictEqual([p.gPeak.accel,p.gPeak.brake,p.gPeak.left,p.gPeak.right],[0.5,1.1,0.8,0.3]);assert.equal(p.env.length,24);p.sample({speed:50,gLong:0.9,gLat:0},400);assert.equal(p.env[0],0.9,'straight ahead');p.sample({speed:50,gLong:0,gLat:0.7},600);assert.equal(p.env[6],0.7,'to the right');p.sample({speed:50,gLong:-1.2,gLat:0},800);assert.equal(p.env[12],1.2,'braking');p.sample({speed:50,gLong:0.4,gLat:0},1000);assert.equal(p.env[0],0.9,'held while the dot was just there');p.sample({speed:50,gLong:0.05,gLat:0},1800);assert.equal(p.env[0],0.9,'still held inside 1.5 s');for(let t=2200;t<=9000;t+=100)p.sample({speed:50,gLong:0.05,gLat:0},t);assert(p.env[0]<0.1&&p.env[0]>=0.05,'the outline shrank back to the dot: '+p.env[0]);assert(p.env[12]<0.05&&p.env[6]<0.05,'every direction let go');assert.equal(p.gPeak.accel,0.9,'the max numbers stay');assert.equal(p.gPeak.brake,1.2);p.sample({speed:50,gLong:0.8,gLat:0},9100);assert.equal(p.env[0],0.8,'and it follows the dot out again');p.resetG();assert.equal(p.gPeak.total,0);assert(p.env.every((e)=>e===0));
 });
 console.log(passed+' SMILEY integration checks passed. No vehicle connected.');
}
run().catch((e)=>{console.error(e.stack);process.exitCode=1;});
