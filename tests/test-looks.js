'use strict';
// The ten themes on the real app (through the head-unit stub): each one draws its own Live Stats
// screen, its More readings page and every other tab; a tap on a reading makes it big; the tab bar
// leaves a touch area for every tab; an unknown saved theme becomes Slash.
const assert=require('assert'),path=require('path'),fs=require('fs'),os=require('os');
const stage=path.join(__dirname,'../dist/smiley'),app=path.join(stage,'source/javascript');
const {DiagLink}=require(path.join(app,'diaglink'));
DiagLink.prototype.init=async function(){this.available=false;this.diag={available:false,physical:async()=>null};return this;};
const {headUnit}=require('../kit/tools/hu-stub');
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'smiley-looks-'));
const hu=headUnit(stage,{dataDir,fresh:true,sets:{demo:'on',theme:'l_burgundy'},image:async()=>{}});
hu.start();
const UI=require(path.join(app,'ui')),Looks=require(path.join(app,'looks'));
const rec=()=>Array.from(hu.display.recorders.values())[0];
const targets=()=>(rec()&&rec().targets)||[];
const tap=async(key)=>{await hu.loopFn();const t=targets().find((x)=>x.key===key);assert(t,'no button '+key+' among '+targets().map((x)=>x.key).join(','));await t.run();await hu.loopFn();};
setTimeout(async()=>{
 try{
  const opts=hu.spec.settings.find((s)=>s.key==='theme');
  assert.deepStrictEqual(opts.options.map((o)=>o[0]),['slash','midnight','deco','bigtach','neon','hive','comic','lcd','rally','pixel']);assert.equal(opts.default,'slash');
  assert.deepStrictEqual(Object.keys(UI.PALETTES),Looks.ORDER,'only the ten themes are left');
  ['statsLayout','gaugeStyle','surprises','customA','customB','customBg'].forEach((k)=>assert(!hu.spec.settings.some((s)=>s.key===k),k+' is gone from Settings'));
  assert.equal(hu.ctx.settings.get('theme'),'slash','a saved theme that no longer exists becomes Slash');
  for(const id of Looks.ORDER){
   hu.ctx.settings.set('theme',id);await hu.display.onTab(UI.PAGE.stats);await hu.loopFn();
   assert.equal(UI.THEME.id,id);assert.equal(UI.THEME.accent,Looks.LOOKS[id].pal.accent);
   const keys=targets().map((t)=>t.key);
   assert(keys.indexOf('big-rpm')>=0||keys.indexOf('big-power')>=0,id+': the main reading can be made big');assert(keys.indexOf('big-boost')>=0,id+' shows boost');assert(keys.indexOf('big-oil')>=0,id+' shows oil');
   assert(!keys.some((k)=>k==='editStart'||k==='layoutNext'),id+': no old gauge editor or layout button');
   assert.equal((rec().tabRects||[]).length,UI.TABS.length,id+': a touch area for every tab');
   await tap('big-boost');assert(targets().some((t)=>t.key==='bigClose'));await tap('bigClose');
   await tap('statsPage');const more=targets().map((t)=>t.key);['big-iat','big-oilp','big-hpfp','big-lpfp','big-timing','big-lambda','big-boostTarget','big-load','big-stft1','big-stft2'].forEach((k)=>assert(more.indexOf(k)>=0,id+' More readings has '+k));
   await tap('big-lambda');await tap('bigClose');await tap('statsPage');assert(targets().some((t)=>t.key==='big-boost'),id+': back on the main screen');
   for(const p of ['xdrive','perf','controls','faults','ai','info']){await hu.display.onTab(UI.PAGE[p]);await hu.loopFn();}
  }
  // the block and segment lettering never throws on what a reading can show
  const cv={fillRect(){}};['0123456789','-12.5','--','P','R','N','D','4',''].forEach((s)=>{Looks.seg7(cv,s,0,0,50,'#000','#111');Looks.pix(cv,s,0,0,8,'#000');});
  console.log('PASS ten themes: each with its own Live Stats screen, More readings, big number mode and tab bar; old themes and layouts gone');process.exit(0);
 }catch(e){console.error(e.stack);process.exit(1);}
},700);
