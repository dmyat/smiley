'use strict';
const mgu=require('./kit/mgu');
const UI=require('./ui');
const {Controller}=require('./controller');
const {DiagLink}=require('./diaglink');
const {TuneControl}=require('./tune');
const {AutoFlap}=require('./auto');
const {Session}=require('./session');
const {Telemetry}=require('./telemetry');
const {Faults}=require('./faults');
const {XDriveControl}=require('./xdrive');
const {inspectNetwork,PhoneServer,wifiAddress}=require('./phone');
const {infoRows,readParts}=require('./info');
const {Perf}=require('./perf');
const {GaugeLayout,PER_PAGE}=require('./layout');
const {FlashWorkspace}=require('./flash-workspace');

mgu.run({async start(ctx){
    const {settings,ui,log}=ctx, session=new Session();
    session.demo=settings.get('demo')==='on';
    const ctlCtx=Object.assign({},ctx,{settings:{get:(k)=>k==='arm'&&session.demo?'off':settings.get(k)}});
    const controller=new Controller(ctlCtx), telemetry=new Telemetry(ctx,session);
    const tune=new TuneControl(ctx,{rpm:()=>telemetry.fresh('rpm',3000)});
    let page=0,faultPage=0,mapChoice=1,notice='',refreshPending=false,visible=true,statsPage=0,betaEntry=null;
    const P=UI.PAGE;
    const gauges=new GaugeLayout(ctx.dataDir,log);
    let ident=null,identTries=0,identAt=Date.now();    // the retries of the engine computer's identification (see the timer below)
    let parts=null;                // the engine computer's own parts list, read once with the rest (info.js)
    let edit=null;                 // editing the gauge layout: { picked: slot 0-15 | null }
    // The performance tools and the shift lights read the telemetry's drive feed; they send nothing.
    telemetry.setDemo(session.demo);
    const perf=new Perf(telemetry,(k)=>settings.get(k),ctx.dataDir,log);
    // xDrive off / on over the DSC's own job: the upstream module, unchanged. Off unless its setting is on.
    const xdrive=new XDriveControl(ctx,telemetry);
    let network={interfaces:[]},loop,flash;
    const phone=new PhoneServer(()=>Object.assign(telemetry.snapshot(session.demo),{tempUnit:settings.get('tempUnit'),pressUnit:settings.get('pressUnit')}));
    const link=await new DiagLink(ctx.signals,log).init();
    controller.link=link;
    // Single underlying transport. Demo/pause checks also apply to upstream modules.
    const rawPhysical=link.diag.physical.bind(link.diag);
    link.diag.physical=function(){
        if(session.demo||session.paused)return Promise.reject(new Error(session.demo?'Demo mode: nothing is sent to the car':'This app is paused'));
        return rawPhysical.apply(null,arguments);
    };
    // the whole-car scan and clear go to every unit at once: the same demo / pause gate
    const rawFunctional=link.diag.functional?link.diag.functional.bind(link.diag):null;
    link.diag.functional=function(){
        if(session.demo||session.paused)return Promise.reject(new Error(session.demo?'Demo mode: nothing is sent to the car':'This app is paused'));
        if(!rawFunctional)return Promise.reject(new Error('This car connection cannot scan the whole car'));
        return rawFunctional.apply(null,arguments);
    };
    const rawSetMode=controller.setMode.bind(controller);
    // Flap commands queue behind a running request: the rpm guard's OEM hand-back and the hold
    // re-send are sent late rather than lost (session.js).
    controller.setMode=(mode)=>session.queued(()=>rawSetMode(mode));
    const repaint=()=>{if(loop&&loop.kick)loop.kick();};
    const auto=new AutoFlap({controller,get:(k)=>settings.get(k),set:(k,v)=>settings.set(k,v),rpm:()=>telemetry.fresh('rpm',3000),log,onChange:repaint});
    const faults=new Faults(link,telemetry,ctx.dataDir);
    await telemetry.start(link);
    tune.link=link;
    const action=(fn)=>async()=>{notice='';try{if(flash&&flash.busy)throw new Error('Wait for the Connect / Flash operation');await fn();}catch(e){notice=String(e.message||e);log.warn(notice);}repaint();};
    flash=new FlashWorkspace({dataDir:ctx.dataDir,demo:()=>session.demo,changed:repaint,quiet:async()=>{
        if(session.paused)return;
        await session.action(async()=>{
            auto._stop();auto.desired='OEM';
            if(controller.real&&controller.state.requested!=='OEM'){
                const r=await rawSetMode('OEM');if(!r.accepted)throw new Error('The car did not confirm returning exhaust control to stock');
            }
            auto.sent='OEM';session.paused=true;
        });
    }});
    if(flash.recovery&&!session.demo)session.paused=true;
    async function refresh(){
        if(session.demo)return;
        await session.action(async()=>{await controller.refresh();await tune.start(link);await xdrive.start(link);
            // The Info page's own copy of who the engine computer is. The exhaust controller reads it only
            // with Exhaust control on (off, it sends nothing at all); these reads only ask, so the page
            // gets them either way.
            ident=controller.ident&&controller.ident.present?controller.ident:null;
            if(!ident&&link.available){try{const id=await link.identifyDme(controller.platform);if(id&&id.present)ident=id;}catch(e){log.warn('identify: '+String(e&&e.message||e));}}
            try{parts=await readParts(link);}catch(e){log.warn('parts list: '+String(e&&e.message||e));}});
        refreshPending=false;
    }
    let big=null;const splashAt=Date.now();          // the gauge shown full screen; the start-up animation plays once, when the app starts
    // Tyre pressures are not read yet: which signal carries them on this car is not known. This looks
    // through the head unit's own list of signals (read only) for likely names, so they can be shown on
    // the Car view and noted in the log; the next version can then ask for the right one.
    let tyreHints=[];
    (function tyreScan(){
        try{
            const cat=JSON.parse(require('fs').readFileSync('/etc/oap/someip/someip-interfaces.json','utf8')), found=[];
            Object.keys(cat.interfaces||{}).forEach((name)=>{const i=cat.interfaces[name];Object.keys((i&&i.fields)||{}).forEach((f)=>{if(/tyre|tire|rdc|rpa|wheel.*press|press.*wheel/i.test(f))found.push(name.split('.').pop()+'.'+f);});});
            log.info('tyre signals in the catalogue ('+found.length+'): '+found.join(', '));
            tyreHints=found.slice(0,6);
        }catch(e){log.info('tyre signals: catalogue not readable ('+String(e&&e.code||e&&e.message||e)+')');}
    })();
    function setPage(i){
        if(flash.programming){page=P.flash;repaint();return;}
        betaEntry=i===P.connect||i===P.flash?i:null;
        edit=null;big=null;page=i;faults.cancelConfirm();flash.confirmUntil=0;notice='';repaint();
    }
    const acts={
        tuner:(name)=>action(async()=>{
            if(!['off','mhd','bm3'].includes(name)||session.busy||session.paused)return;
            settings.set('tuner',name);refreshPending=true;
        })(),
        map:(n)=>action(async()=>{
            if(!Number.isInteger(n)||n<1||n>4)throw new Error('Pick map 1 to 4');
            if(refreshPending)throw new Error('Still checking your tune. Try again in a moment.');
            if(tune.tuner==='bm3'&&!tune.verified)throw new Error('This bootmod3 tune was not recognised, so maps cannot be switched');
            await session.action(()=>tune.setMap(n));
        })(),
        exhaust:(mode)=>action(async()=>{
            if(session.demo||session.paused)throw new Error('Not available in demo mode or while paused');
            if(settings.get('arm')!=='on')throw new Error('Turn on Exhaust control in Settings');
            if(refreshPending)throw new Error('Still checking the car. Try again in a moment.');
            await auto.press(mode);
            const s=controller.state;if(s.accepted!==true)throw new Error(s.error||'The car did not confirm the exhaust change');
        })(),
        refresh:action(refresh),
        read:action(async()=>{await session.action(()=>faults.read());faultPage=0;}),
        clear:action(async()=>{if(session.busy||session.paused||session.demo)throw new Error('Not available in demo mode or while paused');if(faults.confirm(Date.now()))await session.action(()=>faults.clear());}),
        nextFault:()=>{faultPage=(faultPage+1)%Math.max(1,Math.ceil(faults.rows.length/4));repaint();},
        faultScope:(scope)=>{if(session.busy)return;faults.setScope(scope);faultPage=0;notice='';repaint();},
        statsPage:()=>{statsPage=statsPage?0:1;repaint();},
        // Edit gauges: pick one, then tap another to swap them, or Change to bring in a different gauge.
        editStart:()=>{big=null;edit={picked:null};repaint();},
        // a tap on a gauge opens the list for it (again: closes it); a tap in the list puts that gauge there
        editTap:(slot)=>{if(!edit)return;edit.picked=edit.picked===slot?null:slot;repaint();},
        editSet:(id)=>{if(edit&&edit.picked!=null){gauges.set(edit.picked,id);edit.picked=null;repaint();}},
        editChange:()=>{if(edit&&edit.picked!=null){gauges.change(edit.picked,1);repaint();}},
        editReset:()=>{gauges.reset();if(edit)edit.picked=null;repaint();},
        editDone:()=>{edit=null;repaint();},
        resetPeaks:()=>{telemetry.resetPeaks();repaint();},
        big:(id)=>{big=id||null;repaint();},
        layoutNext:()=>{const o=UI.LAYOUT_ORDER,i=o.indexOf(settings.get('statsLayout'));big=null;settings.set('statsLayout',o[(i+1)%o.length]);repaint();},
        perfMode:(m)=>{perf.setMode(m);repaint();},
        resetG:()=>{perf.resetG();repaint();},
        perfHist:(d)=>{perf.histTurn(d);repaint();},
        network:()=>{network=inspectNetwork();repaint();},
        pause:action(async()=>{
            if(flash.connected)throw new Error('Disconnect in Connect before resuming diagnostics');
            if(flash.recovery&&!session.demo)throw new Error('An unfinished flash needs recovery review');
            if(session.paused){session.paused=false;refreshPending=true;return;}
            await session.action(async()=>{
                auto._stop();auto.desired='OEM';
                if(controller.real&&controller.state.requested!=='OEM'){
                    const r=await rawSetMode('OEM');if(!r.accepted)throw new Error('Not paused: the car did not confirm the exhaust going back to stock');
                }
                auto.sent='OEM';session.paused=true;
            });
        }),
        // AWD / 2WD: the first press asks, the second sends (xdrive.js); one request at a time like the rest
        xdriveOff:action(()=>session.action(()=>xdrive.requestOff())),
        xdriveOn:action(()=>session.action(()=>xdrive.requestOn())),
        phone:action(async()=>{if(phone.server)phone.stop();else await phone.start();}),
        flashConnect:action(()=>flash.connect()),
        flashLoad:action(()=>flash.load()),
        flashPower:()=>flash.togglePower(),
        flashStart:action(()=>flash.flash()),
        openFlash:()=>setPage(P.flash),
        openConnect:()=>setPage(P.connect),
        flashResume:action(async()=>{
            if(flash.connected||flash.recovery)throw new Error('Disconnect and resolve any unfinished flash first');
            session.paused=false;refreshPending=!session.demo;
        }),
        betaContinue:()=>{betaEntry=null;notice='';repaint();},
        betaBack:()=>setPage(P.stats),
    };
    // One frame. Only the page on screen is worked out: the other tabs cost nothing while hidden.
    function frame(){
        const demo=settings.get('demo')==='on';
        const v={page,demo,theme:settings.get('theme'),surprises:settings.get('surprises'),gaugeStyle:settings.get('gaugeStyle'),custom:{a:settings.get('customA'),b:settings.get('customB'),bg:settings.get('customBg')},paused:session.paused,busy:session.busy||refreshPending,notice,version:ctx.spec.version,
            tempUnit:settings.get('tempUnit'),pressUnit:settings.get('pressUnit'),torqueUnit:settings.get('torqueUnit')};
        v.tyres=demo?{fl:{p:2.48,t:31},fr:{p:2.48,t:32},rl:{p:2.62,t:34},rr:{p:2.62,t:33}}:null;v.tyreHints=tyreHints;          // no tyre reading from the car yet: see tyreScan
        v.big=big;v.layout=settings.get('statsLayout');v.splash=settings.get('splash')==='off'?null:Date.now()-splashAt;
        v.oilC=demo?101:telemetry.fresh('oil',30000);          // the warm-up light in the header
        v.betaGate=betaEntry===page;
        if(page===P.stats){v.stats=telemetry.snapshot(demo);v.statsPage=statsPage;v.gauges=gauges.page(statsPage);v.slots=gauges.slots;v.edit=edit;}
        else if(page===P.controls){
            v.tune=tune.view();v.bm3Verified=tune.verified;v.flap=controller.view();v.exhaustEnabled=settings.get('arm')==='on';v.flapNote=(auto.note()||{}).text;
            v.mapBlocked=demo||session.paused||session.busy||refreshPending||!link.available||tune.tuner==='off'||(tune.tuner==='bm3'&&!tune.verified);
        }
        else if(page===P.faults){v.faultScope=faults.scope;v.faultRows=faults.rows;v.faultPage=faultPage;v.faultNote=faults.note;v.scanned=!!faults.at||!!faults.savedAt;v.clearPending=Date.now()<faults.confirmUntil;}
        else if(page===P.xdrive)v.xdrive=xdrive.view();
        else if(page===P.perf)v.perf=perf.view(Date.now());
        else if(page===P.phone)v.phone=phone.view();
        else if(page===P.connect||page===P.flash)v.flash=flash.view();
        else if(page===P.info)v.info=infoRows({ident:ident||controller.ident,parts,tuner:tune.tuner,bm3Verified:tune.verified,linked:link.available,demo,wifi:wifiAddress(),version:ctx.spec.version});
        return v;
    }
    // Frames never overlap: the drawing surface is reused, so a frame asked for while one is being
    // sent (a tap during the 60-a-second loop) is drawn right after it instead of on top of it.
    let drawing=false,again=false,peakTick=0;
    async function render(){
        if(drawing){again=true;return;}
        drawing=true;
        try{
            do{again=false;const cv=ctx.canvas(UI.W,UI.H);UI.draw(cv,frame(),acts);await ui.image('MAIN_GFX',cv);}while(again);
        }finally{drawing=false;}
    }
    loop=ctx.loop('MAIN',15,render);
    ctx.onTab((i)=>{if(i>=0&&i<UI.TABS.length){setPage(i);return render();}});
    // Press and hold a gauge to edit the layout (touch, where the kit runs the screen). The kit
    // reports a finger going down, moving and lifting; a finger resting on one gauge for 0.65 s opens
    // the editor with that gauge picked. Anything unexpected leaves normal taps exactly as they were.
    const disp=ctx.display;
    if(disp&&typeof disp._touch==='function'){
        const rawTouch=disp._touch.bind(disp);let holdTimer=null,down=null,held=false;
        disp._touch=function(phase,x,y){
            try{
                if(phase===1){
                    down={x,y};held=false;clearTimeout(holdTimer);
                    holdTimer=setTimeout(()=>{
                        holdTimer=null;
                        if(!down||page!==P.stats||edit||big)return;
                        const slot=UI.slotAt(down.x,down.y);if(slot<0)return;
                        held=true;disp.ownDown=null;edit={picked:statsPage*PER_PAGE+slot};repaint();
                    },650);
                }else if(phase===2){
                    if(down&&(Math.abs(x-down.x)>14||Math.abs(y-down.y)>14)){clearTimeout(holdTimer);holdTimer=null;}
                }else if(phase===3){
                    clearTimeout(holdTimer);holdTimer=null;down=null;
                    if(held){held=false;return undefined;}          // the lift after a hold is not a tap
                }
            }catch(e){log.warn('hold: '+String(e&&e.message||e));}
            return rawTouch(phase,x,y);
        };
    }
    ui.onClick('BTN_PAGE',()=>{setPage((page+1)%UI.TABS.length);return render();});
    // The HMI's own bar buttons, where the kit does not run the screen: one meaning per tab.
    ui.onClick('BTN_CHOICE',()=>{
        if(page===P.stats)acts.statsPage();
        else if(page===P.controls){mapChoice=mapChoice%4+1;notice='Map '+mapChoice+' picked. Press Apply.';}
        else if(page===P.faults)acts.nextFault();
        else if(page===P.xdrive)acts.xdriveOn();
        else if(page===P.perf)perf.nextMode();
        repaint();
    });
    ui.onClick('BTN_ACTION',()=>betaEntry===page?acts.betaContinue():page===P.stats?acts.resetPeaks():page===P.controls?acts.map(mapChoice):page===P.faults?acts.read():page===P.xdrive?acts.xdriveOff():page===P.perf?acts.resetG():page===P.phone?acts.phone():page===P.connect?acts.flashConnect():page===P.flash?acts.flashStart():acts.refresh());
    ui.onClick('BTN_EXHAUST',()=>{if(page===P.controls)return acts.exhaust(({OEM:'OPEN',OPEN:'CLOSED',CLOSED:'OEM'})[controller.state.requested]||'OEM');});
    ui.onClick('BTN_CLEAR',()=>page===P.faults?acts.clear():null);
    ['BTN_CHOICE','BTN_ACTION','BTN_EXHAUST','BTN_CLEAR'].forEach((b)=>ctx.hideButton&&ctx.hideButton(b));
    const settingValues={};ctx.spec.settings.forEach((s)=>{settingValues[s.key]=settings.get(s.key);});let revertingSetting=false;
    settings.onChange((key)=>{
        if(revertingSetting)return;
        if(flash.busy&&!['theme','customA','customB','customBg'].includes(key)){
            revertingSetting=true;try{settings.set(key,settingValues[key]);}finally{revertingSetting=false;}
            notice='Settings are locked until the Connect / Flash operation finishes';repaint();return;
        }
        settingValues[key]=settings.get(key);
        if(key==='demo'){
            flash.invalidate();
            const on=settings.get('demo')==='on';
            const finish=()=>{session.demo=on;if(flash.recovery&&!on)session.paused=true;telemetry.setDemo(on);telemetry.resetPeaks();auto._stop();auto.desired=auto.sent='OEM';faults.forget();tune._reset();refreshPending=!on;faults.cancelConfirm();repaint();};
            // Demo stops every command, so a flap SMILEY still holds goes back to the car first.
            if(on&&!session.demo&&!session.paused&&controller.real&&controller.state.requested!=='OEM'){
                auto._stop();
                session.queued(()=>rawSetMode('OEM')).catch((e)=>log.warn('OEM before demo: '+String(e.message||e))).then(finish);
                return;
            }
            finish();return;
        }
        if(['tuner','arm','xdrive'].includes(key)){refreshPending=!session.demo;faults.cancelConfirm();}
        if(['speedUnit','rollout'].includes(key))perf.sourceChanged();
        if(['hold','closeLimit','arm'].includes(key))auto.settingsChanged(key).catch((e)=>log.warn(String(e)));
        repaint();
    });
    if(ui.onVisible)ui.onVisible((name,on)=>{if(name==='MAIN')visible=on;});
    link.onAvailable((on)=>{refreshPending=!!on&&!session.demo;identTries=0;identAt=Date.now();telemetry.times={};tune._reset();controller.state.accepted=null;controller.state.confirmed='UNKNOWN';});
    // No map/exhaust/fault-clear action at startup. Tuners and exhaust ship disabled.
    if(!session.demo&&!session.paused)await action(refresh)();
    setInterval(()=>{
        if(flash.busy||flash.connected)return;
        telemetry.setFocus(page===P.stats?(big?[big]:(UI.LAYOUTS[settings.get('statsLayout')]||{}).keys||gauges.page(statsPage)):null);          // a gauge shown big is read as fast as the car answers
        // the min / max keep counting while another tab is shown (four times a second is plenty)
        if(page!==P.stats&&(++peakTick%6===0))telemetry.snapshot(session.demo);
        // The first read of the engine computer can go unanswered (the car just woken, another app asking
        // at the same moment), which left the VIN and the type blank for the whole drive: ask again, a
        // few times, a few seconds apart.
        if(!refreshPending&&link.available&&!session.demo&&!session.paused&&!session.busy&&!(ident&&ident.present)&&identTries<8&&Date.now()-identAt>4000){identTries++;identAt=Date.now();refreshPending=true;}
        if(refreshPending&&!session.busy&&!session.paused)action(refresh)();
        else if((visible||phone.server)&&!session.demo)telemetry.poll().catch((e)=>log.warn(String(e)));
        if(!session.demo&&!session.paused)auto.tick().catch((e)=>log.warn(String(e)));
        // the mode and the front-axle torque are read only while the AWD / 2WD tab is shown
        if(visible&&page===P.xdrive&&!session.demo&&!refreshPending)session.poll(()=>xdrive.tick()).then((r)=>{if(r)repaint();}).catch((e)=>log.warn(String(e)));
    },40);
    setInterval(()=>perf.idle(Date.now()),50);
    process.once('SIGTERM',()=>{auto._stop();phone.stop();flash.stop();});
    await render();
}});
