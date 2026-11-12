'use strict';
// In-memory ECU + injected socket. This suite never opens a network connection.
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os'),{EventEmitter}=require('events');
const APP=path.join(__dirname,'../apps/smiley');
const {DoipTransport,packet,positive,readIdentity}=require(APP+'/flash-transport');
const {demoBundle,DemoTransport}=require(APP+'/flash-demo');
const {runFlash,Journal,conditions}=require(APP+'/flash-engine');
const {loadCalibration,loadConnection}=require(APP+'/flash-files');
const {FlashWorkspace}=require(APP+'/flash-workspace');
const config={protocol:'doip',host:'192.0.2.1',port:13400,testerAddress:0x0e00,ecuAddress:0x1234,activationType:0};
const tests=[],test=(name,fn)=>tests.push([name,fn]);
const sleep=(n)=>new Promise(r=>setTimeout(r,n));
class Socket extends EventEmitter{
 constructor(handler){super();this.handler=handler;this.writes=[];this.dead=false;}
 connect(){setImmediate(()=>this.emit('connect'));}
 write(b){this.writes.push(Buffer.from(b));this.handler(this,b);}
 destroy(){this.dead=true;}
 reply(type,p){this.emit('data',packet(type,p));}
}
const routing=(s,b)=>{if(b.readUInt16BE(2)===5){s.reply(6,[0x0e,0,0x10,0,0x10,0,0,0,0]);return true;}return false;};
const diagnostic=(s,r)=>s.reply(0x8001,[0x12,0x34,0x0e,0].concat(Array.from(r)));
function client(handler,options){let socket;const t=new DoipTransport(config,Object.assign({socketFactory:()=>socket=new Socket(handler),timeout:60,pendingTimeout:60,totalTimeout:200},options));return {t,s:()=>socket};}
async function fixture(){const b=demoBundle(),t=new DemoTransport(b,{delay:0});await t.connect();const id=await readIdentity(t);return {b,t,o:{bundle:b,transport:t,identity:id,powerConfirmed:true,identify:()=>readIdentity(t),progress:()=>{}}};}
test('full simulation transfers exact bytes, verifies and resets',async()=>{
 const {b,t,o}=await fixture(),seen=[];o.progress=p=>seen.push(p);const result=await runFlash(o);
 assert(result.ok&&result.simulated);assert(Buffer.concat(t.received).equals(b.data));assert.equal(seen.pop().percent,100);
 assert(t.calls.some(b=>b[0]===0x11));
});
test('response-pending waits without retransmitting a write',async()=>{
 let sends=0;const {t}=client((s,b)=>{if(routing(s,b))return;sends++;diagnostic(s,[0x7f,0x36,0x78]);setTimeout(()=>diagnostic(s,[0x76,1]),15);});
 await t.connect();assert.deepStrictEqual(Array.from(await t.request([0x36,1,42])),[0x76,1]);assert.equal(sends,1);t.close();
});
test('TCP fragmentation, wrong ECU frames and alive checks',async()=>{
 const {t,s}=client((sock,b)=>{if(routing(sock,b))return;if(b.readUInt16BE(2)===8)return;
  sock.reply(7,[]);sock.reply(0x8001,[0x99,0,0x0e,0,0x62,0xf1,0x90,0]);
  const p=packet(0x8001,[0x12,0x34,0x0e,0,0x62,0xf1,0x90,65]);sock.emit('data',p.slice(0,5));sock.emit('data',p.slice(5));});
 await t.connect();assert.equal((await t.request([0x22,0xf1,0x90]))[3],65);assert(s().writes.some(b=>b.readUInt16BE(2)===8));t.close();
});
test('concurrent requests are serialized',async()=>{
 let inFlight=0,max=0;const {t}=client((s,b)=>{if(routing(s,b))return;max=Math.max(max,++inFlight);setTimeout(()=>{inFlight--;diagnostic(s,[0x62,b[13],b[14],65]);},5);});
 await t.connect();await Promise.all([t.request([0x22,0xf1,0x90]),t.request([0x22,0xf1,0x91]),t.request([0x22,0xf1,0x94])]);assert.equal(max,1);t.close();
});
test('a timed-out request closes and rejects queued traffic',async()=>{
 const {t,s}=client((sock,b)=>routing(sock,b));await t.connect();const results=await Promise.allSettled([t.request([0x22,1,2]),t.request([0x22,1,3])]);
 assert(results.every(r=>r.status==='rejected'));assert(!t.active&&s().dead);assert.equal(s().writes.length,2);
});
test('unending pending responses have a bounded deadline',async()=>{
 let timer;const {t}=client((s,b)=>{if(routing(s,b))return;timer=setInterval(()=>diagnostic(s,[0x7f,0x22,0x78]),5);},{totalTimeout:35});
 await t.connect();try{await assert.rejects(t.request([0x22,1,2]),/timed out/);}finally{clearInterval(timer);t.close();}
});
test('routing activation denied and routing timeout are errors',async()=>{
 const a=client(s=>s.reply(6,[0x0e,0,0x10,0,0x03,0,0,0,0]));await assert.rejects(a.t.connect(),/denied/);assert(!a.t.active);
 const b=client(()=>{});await assert.rejects(b.t.connect(),/timed out/);assert(!b.t.active);
});
test('bad protocol inverse and oversized frames close connection',async()=>{
 for(const mutate of [b=>b[1]=0,b=>b.writeUInt32BE(2000000,4)]){
  const {t}=client((s,b)=>{if(routing(s,b))return;const p=packet(0x8001,[0x12,0x34,0x0e,0,0x62,1,2,3]);mutate(p);s.emit('data',p);});
  await t.connect();await assert.rejects(t.request([0x22,1,2]));assert(!t.active);
 }
});
test('wrong service and malformed NRC are rejected',async()=>{
 for(const r of [[0x63,1,2],[0x7f,0x36,0x78],[0x7f,0x22]]){
  const {t}=client((s,b)=>{if(!routing(s,b))diagnostic(s,r);});await t.connect();await assert.rejects(t.request([0x22,1,2]));assert(!t.active);
 }
});
test('negative acknowledgement closes connection',async()=>{
 const {t}=client((s,b)=>{if(!routing(s,b))s.reply(0x8003,[0x12,0x34,0x0e,0,3]);});await t.connect();await assert.rejects(t.request([0x22,1,2]),/rejected/);assert(!t.active);
});
test('exact DID echoes and a real 17-byte VIN are required',async()=>{
 assert.throws(()=>positive([0x62,0xf1,0x91],0x22,[0xf1,0x90]),/Invalid/);
 const t={request:async r=>Buffer.from([0x62,r[1],r[2],65])};await assert.rejects(readIdentity(t),/VIN/);
});
test('simulation is barred from a real transport',async()=>{
 const {t,o}=await fixture();t.simulation=false;await assert.rejects(runFlash(o),/Simulation/);assert(!t.calls.some(b=>b[0]===0x10));
});
test('a live adapter must be hardware validated',async()=>{
 const {b,t,o}=await fixture();b.simulation=false;t.simulation=false;await assert.rejects(runFlash(o),/validated on hardware/);
});
test('power, identity, ECU address and file mismatch block before writes',async()=>{
 for(const change of [f=>f.o.powerConfirmed=false,f=>f.o.identity.vinHex='00',f=>f.t.config.ecuAddress=2,f=>f.b.data[0]^=255]){
  const f=await fixture();change(f);await assert.rejects(runFlash(f.o));assert(!f.t.calls.some(b=>b[0]===0x10));
 }
});
test('identity is re-read immediately before programming',async()=>{
 const f=await fixture();f.o.identify=async()=>({});await assert.rejects(runFlash(f.o),/identity changed/);assert(!f.t.calls.some(b=>b[0]===0x10));
});
test('voltage, engine, Park, ignition and fresh-data guards',async()=>{
 const valid={at:Date.now(),speed:0,rpm:0,gear:'P',ignition:true,voltage:13.8,minVoltage:13,maxVoltage:14.8};
 conditions(valid,Date.now());for(const change of [{speed:1},{rpm:1},{gear:'N'},{ignition:false},{voltage:11},{voltage:17},{at:Date.now()-4000},{at:Date.now()+4000},{minVoltage:NaN}])assert.throws(()=>conditions(Object.assign({},valid,change),Date.now()));
});
test('ECU-specific validation failure sends no programming request',async()=>{
 const f=await fixture();f.b.adapter.validateImage=async()=>false;await assert.rejects(runFlash(f.o),/checksum/);assert(!f.t.calls.some(b=>b[0]===0x10));
});
test('size, address overflow and wrong routine plan fail before programming',async()=>{
 for(const mutate of [p=>p.length--,p=>p.address=-1,p=>p.address=0xffffffff,p=>p.erase.response[2]=0,p=>p.verify.response.pop()]){
  const f=await fixture(),p=await f.b.adapter.plan();mutate(p);f.b.adapter.plan=async()=>p;await assert.rejects(runFlash(f.o));assert(!f.t.calls.some(b=>b[0]===0x10));
 }
});
test('a wrong block counter prevents verification and reset',async()=>{
 const f=await fixture(),send=f.t.request.bind(f.t);f.t.request=async b=>b[0]===0x36?Buffer.from([0x76,99]):send(b);
 await assert.rejects(runFlash(f.o),/Invalid response/);assert(!f.t.calls.some(b=>b[0]===0x11));
});
test('malformed or zero download block limits never start transfer',async()=>{
 for(const response of [[0x74],[0x74,0x10,0],[0x74,0x20,1],[0x74,0x21,1,2]]){
  const f=await fixture(),send=f.t.request.bind(f.t);f.t.request=async b=>b[0]===0x34?Buffer.from(response):send(b);
  await assert.rejects(runFlash(f.o));assert(!f.t.calls.some(b=>b[0]===0x36));
 }
});
test('verify NRC or wrong routine result never resets or reports success',async()=>{
 for(const response of [[0x7f,0x31,0x72],[0x71,1,0xff,1,1],[0x71,1,0,1,0]]){
  const f=await fixture(),send=f.t.request.bind(f.t);f.t.request=async b=>b[0]===0x31&&b[3]===1?Buffer.from(response):send(b);
  await assert.rejects(runFlash(f.o));assert(!f.t.calls.some(b=>b[0]===0x11));
 }
});
test('reset refusal and failed restart read-back never report success',async()=>{
 const f=await fixture(),send=f.t.request.bind(f.t);f.t.request=async b=>b[0]===0x11?Buffer.from([0x7f,0x11,0x22]):send(b);await assert.rejects(runFlash(f.o),/rejected/);
 const g=await fixture();g.b.adapter.afterReset=async()=>false;await assert.rejects(runFlash(g.o),/read-back/);
});
test('transfer counter wraps at 255 and each byte is verified',async()=>{
 const f=await fixture(),p=await f.b.adapter.plan();p.blockSize=64;f.b.adapter.plan=async()=>p;
 await runFlash(f.o);assert(f.t.calls.some(b=>b[0]===0x36&&b[1]===0));assert(Buffer.concat(f.t.received).equals(f.b.data));
});
test('file loader checks hash, size, exact hex and path confinement',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'smiley-files-'));fs.mkdirSync(path.join(dir,'flash'));const root=path.join(dir,'flash'),b=demoBundle();
 const p={schema:1,provider:'unknown-bmw',label:'Owner calibration',ecuAddress:0x1234,expected:b.profile.expected,image:{file:'test.bin',bytes:b.data.length,sha256:b.hash}};
 fs.writeFileSync(path.join(root,'test.bin'),b.data);const put=()=>fs.writeFileSync(path.join(root,'profile.json'),JSON.stringify(p));put();
 const loaded=loadCalibration(dir,{});assert(!loaded.adapter&&loaded.blocker);p.verified=true;put();assert(!loadCalibration(dir,{}).adapter);
 for(const mutate of [()=>p.image.sha256='0'.repeat(64),()=>p.image.bytes++,()=>p.image.file='../test.bin',()=>p.expected.hardwareHex='f1xx']){mutate();put();assert.throws(()=>loadCalibration(dir,{}));p.image={file:'test.bin',bytes:b.data.length,sha256:b.hash};p.expected=Object.assign({},b.profile.expected);}
 const outside=path.join(dir,'outside.bin');fs.writeFileSync(outside,b.data);fs.symlinkSync(outside,path.join(root,'link.bin'));p.image.file='link.bin';put();assert.throws(()=>loadCalibration(dir,{}),/Invalid/);
});
test('connection file must explicitly name protocol, tester and ECU',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'smiley-config-'));fs.mkdirSync(path.join(dir,'flash'));const file=path.join(dir,'flash/connect.json');
 fs.writeFileSync(file,JSON.stringify(config));assert.equal(loadConnection(dir).ecuAddress,0x1234);
 for(const bad of [{host:'example.com'},{ecuAddress:undefined},{protocol:'enet'},{port:0},{testerAddress:0x1234}]){fs.writeFileSync(file,JSON.stringify(Object.assign({},config,bad)));assert.throws(()=>loadConnection(dir));}
});
test('durable incomplete journal survives restart and blocks reconnect',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'smiley-journal-')),j=new Journal(dir);assert.equal(j.read(),null);j.write({incomplete:true,phase:'Erasing'});
 const w=new FlashWorkspace({dataDir:dir,demo:()=>false,quiet:async()=>{throw Error('should not connect');}});assert(w.recovery);await assert.rejects(w.connect(),/recovery/);
 fs.writeFileSync(j.file,'broken');assert(new Journal(dir).read().incomplete);
});
test('UI workflow requires load, power and a second press; locks disconnect',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'smiley-workspace-'));let quiet=0;const w=new FlashWorkspace({dataDir:dir,demo:()=>true,quiet:async()=>quiet++});
 await w.connect();w.transport.delay=1;await assert.rejects(w.flash(),/Load/);w.load();w.togglePower();await w.flash();assert(w.view().confirmation);assert(!w.transport.calls.some(b=>b[0]===0x10));
 const run=w.flash();assert.throws(()=>w.disconnect(),/locked/);assert.throws(()=>w.load(),/Wait/);await run;
 assert.equal(w.phase,'Simulation complete');assert.equal(w.percent,100);assert(!w.connected);assert.equal(quiet,0);assert.equal(w.journal.read(),null);
});
test('expired confirmation requires a new review without programming',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'smiley-expired-')),w=new FlashWorkspace({dataDir:dir,demo:()=>true});
 await w.connect();w.load();w.togglePower();w.confirmUntil=Date.now()-1;await w.flash();assert(w.view().confirmation);assert(!w.transport.calls.some(b=>b[0]===0x10));w.disconnect();
});
(async()=>{let passed=0;for(const [name,fn] of tests){try{await fn();passed++;console.log('PASS '+name);}catch(e){console.error('FAIL '+name+'\n'+e.stack);process.exitCode=1;}}console.log(passed+'/'+tests.length+' Connect / Flash tests passed');})();
