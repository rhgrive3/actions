export function verifyGameInstance(){if(!globalThis.LACT_GAME?.game||globalThis.LACT_GAME.game!==globalThis.__inkwave)throw Error('LACT Game: inspector context is not the running Game instance');return true;}
export function networkFailure(kind,value){if(kind==='console'&&value.type==='error')return 'console: '+value.text;if(kind==='failed')return 'request failed: '+value.url;if(kind==='response'&&value.status>=400)return 'HTTP '+value.status+': '+value.url;return null;}
// Controlled actual Game input regression. No runtime charge/form/ink writes.
export async function lactGameScenario({id,holdTicks,expectKeep,captureFailure=false}) {
 const G=globalThis.LACT_GAME,g=G.game,a=G.local,r=a.weaponRunner;
 const check=(v,m)=>{if(!v)throw Error('LACT Game: '+m);},near=(x,y,m)=>check(Number.isFinite(x)&&Math.abs(x-y)<1e-7,m);
 check(a.alive&&a.grounded&&G.match.playing(),'ordinary playing grounded actor required');
 check(a.weaponId===id,'selected loadout');
 const rec=a.weapon.catalogRecord,p=rec.parameters.spl__WeaponStringerParam;
 check(p&&Number.isSafeInteger(holdTicks)&&holdTicks>0,'source parameters');
 check(expectKeep ? rec.sourceActor==='WeaponStringerShort' : rec.sourceActor==='WeaponStringerNormal'&&p.IsEnableChargeKeep===false,'explicit source capability control');
 // Match the pinned native emitArrow implementation; omitted ArrowNum is three.
 const arrowCount=Number.isFinite(p.ShotParam?.ArrowNum)?p.ShotParam.ArrowNum:3;
 check(Number.isSafeInteger(arrowCount)&&arrowCount>0,'native arrow count contract');
 const keepTicks=p.ChargeKeepParam?.KeepChargeFullFrame;
 const expectedCost=p.ChargeParam.InkConsumeFullCharge*100;
 check(Number.isFinite(expectedCost)&&expectedCost>0,'source full charge ink');
 const saved={push:G.projectiles._push,ink:Object.getOwnPropertyDescriptor(a,'ink'),mouse:g.input.mouse.left,shift:g.input.keys.has('ShiftLeft'),skip:g._skipRender};
 check(saved.ink&&'value'in saved.ink&&saved.ink.writable&&saved.ink.configurable,'observable ordinary ink property');
 let ink=a.ink,debit=0,credit=0,ticks=0,phase='charge',held=0,returned=0,after=0,paid=0,frames=0,restoreTicks=null,done=false;
 const births=[],transitions=[],writes=[];let failure;
 const push=function(...args){const out=Reflect.apply(saved.push,this,args),q=args[0];if(q?.owner===a&&!q.ghost)births.push({tick:ticks,phase,weapon:q.wid,charge:q.catalog?.descriptor?.charge,position:q.pos.toArray(),velocity:q.vel.toArray()});return out;};
 Object.defineProperty(a,'ink',{configurable:true,enumerable:saved.ink.enumerable,get:()=>ink,set:v=>{const delta=v-ink;if(delta){writes.push({tick:ticks,delta});debit+=Math.max(0,-delta);credit+=Math.max(0,delta);}ink=v;}});
 G.projectiles._push=push;
 const next=name=>{transitions.push({tick:ticks,from:phase,to:name,form:a.form,charge:r.charge,paid:r.catalogState?.paid,stored:r.catalogState?.stored?{...r.catalogState.stored}:null,debit,credit});phase=name;};
 try {
  g._skipRender=true;
  for(;ticks<900&&!done;){
   g.input.mouse.left=phase==='charge'||phase==='return';
   if(phase==='hold')g.input.keys.add('ShiftLeft');else g.input.keys.delete('ShiftLeft');
   const before=g.s3Clock.ticks;ticks++;g._frame(1/60);
   check(g.s3Clock.ticks===before+1,'exactly one Game-owned reference tick');check(a.alive&&G.match.playing(),'actor/match remains live');
   near(a.ink,saved.ink.value-debit+credit,'all ink writes accounted');const s=r.catalogState;
   if(phase==='charge'){
    check(births.length===0,'no arrow while charging');
    if(r.charge===1){paid=s.paid;frames=s.chargeF;near(paid,expectedCost,'source full-charge payment');near(debit,paid,'one initial payment');next('hold');}
   }else if(phase==='hold'){
    held++;check(a.form==='squid','actual input admitted squid');check(births.length===0,'no arrow on keep/cancel');near(debit,paid,'hold adds no debit');
    check(s.chargeF===0&&s.paid===0&&!r.charging,'active charge cleared in squid');
    if(expectKeep&&held<keepTicks){check(!!s.stored,'stored charge before expiry');near(s.stored.frames,frames,'stored frames');near(s.stored.paid,paid,'stored payment');near(s.stored.remaining,(keepTicks-held)/60,'source keep countdown');}
    else check(s.stored===null,'expired or other Stringer cannot store');
    if(held===holdTicks)next('return');
   }else if(phase==='return'){
    returned++;check(a.form==='kid','actual input returns human');check(births.length===0,'return does not auto-release');
    const retained=expectKeep&&holdTicks<keepTicks;if(retained)near(debit,paid,'retained charge not charged twice');
    if(r.charge===1){near(s.paid,paid,'restored/recharged full payment');near(s.chargeF,frames,'restored/recharged frames');near(debit,paid*(retained?1:2),'correct total payment');restoreTicks=returned;next('release');}
   }else if(phase==='release'){
    check(births.length===arrowCount,'one native arrow volley');check(births.every(q=>q.weapon===rec.id&&q.charge===1),'fully charged owned arrows');
    check(s.stored===null&&s.paid===0&&s.chargeF===0&&r.charge===0&&!r.charging,'release clears funded charge');next('after');
   }else if(phase==='after'){
    check(births.length===arrowCount,'no duplicate/delayed volley');near(debit,paid*((expectKeep&&holdTicks<keepTicks)?1:2),'no later debit');if(++after===20)done=true;
   }
  }
  check(done,'bounded scenario completes');
 }catch(e){failure=e;}
 finally{
  G.projectiles._push=saved.push;Object.defineProperty(a,'ink',{...saved.ink,value:ink});g.input.mouse.left=saved.mouse;if(saved.shift)g.input.keys.add('ShiftLeft');else g.input.keys.delete('ShiftLeft');g._skipRender=saved.skip;
 }
 const restored=G.projectiles._push===saved.push&&Object.getOwnPropertyDescriptor(a,'ink').value===ink&&g.input.mouse.left===saved.mouse&&g.input.keys.has('ShiftLeft')===saved.shift&&g._skipRender===saved.skip;
 check(restored,'observation/input restoration');
 const failureEvidence=failure?{message:String(failure.message),phase,held,form:a.form,charge:r.charge,activePaid:r.catalogState?.paid,stored:r.catalogState?.stored?{...r.catalogState.stored}:null}:null;
 if(failure&&!captureFailure)throw failure;
 return {status:failure?'failed':'passed',failure:failureEvidence,id,sourceActor:rec.sourceActor,sourceSha256:rec.sourceSha256,holdTicks,expectKeep,keepTicks,expectedCost,paid,debit,credit,ticks,restoreTicks,births,transitions,writes,restored,scope:'Actual Game fixed-step input and native Actor/projectile behavior; no pixel or retail timing claim'};
}
export async function runLactGame(browser,origin){
 const context=await browser.newContext({viewport:{width:800,height:600},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const observe=(kind,value)=>{const error=networkFailure(kind,value);if(error)errors.push(error);};
 page.on('console',m=>observe('console',{type:m.type(),text:m.text()}));
 page.on('requestfailed',r=>observe('failed',{url:r.url()}));
 page.on('response',r=>observe('response',{url:r.url(),status:r.status()}));
 await context.routeWebSocket('**/*',socket=>{errors.push('WebSocket forbidden');socket.close();});
 await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==origin){errors.push('Unpinned external request '+u.origin+u.pathname);await route.abort('blockedbyclient');}else await route.continue();});
 try{
  await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:false,musicVolume:0})));
  await page.goto(origin+'/?map=tidewater',{waitUntil:'domcontentloaded'});
  await page.evaluate(async()=>{globalThis.LACT_GAME=(await import(new URL('src/core/ctx.js',document.baseURI).href)).G;});
  await page.waitForFunction(()=>LACT_GAME.game?.menus&&LACT_GAME.mode!=='boot',null,{timeout:180000});
  await page.evaluate(verifyGameInstance);
  const cases=[];
  for(const spec of [{id:'s3-stringer-short',holdTicks:30,expectKeep:true},{id:'s3-stringer-short',holdTicks:75,expectKeep:true},{id:'s3-stringer-normal',holdTicks:30,expectKeep:false}]){
   await page.evaluate(async id=>{const g=LACT_GAME.game;g.debug.freeze();g.api.setLoadout({weapon:id});await g.startMatch({mapId:'tidewater',difficulty:'easy'});g.debug.freeze();},spec.id);
   await page.evaluate(()=>{const G=LACT_GAME,g=G.game;g._skipRender=true;g.input.mouse.left=false;for(let i=0;i<360&&!G.match.playing();i++)g._frame(1/60);if(!G.match.playing())throw Error('ordinary intro incomplete');g.input.mouse.left=true;for(let i=0;i<3;i++)g._frame(1/60);g.input.mouse.left=false;for(let i=0;i<360&&(!G.local.grounded||G.local.s3?.squidSpawn);i++)g._frame(1/60);if(!G.local.alive||!G.local.grounded||G.local.s3?.squidSpawn)throw Error('ordinary launch/landing incomplete');for(let i=0;i<60;i++)g._frame(1/60);});
   await page.evaluate(()=>{const G=LACT_GAME;globalThis.LACT_BOTS=G.actors.filter(a=>a.bot&&!a.isLocal).map(a=>({bot:a.bot,update:a.bot.update}));G.game.debug.freezeBots();});
   try{cases.push(await page.evaluate(lactGameScenario,{...spec,captureFailure:true}));}finally{await page.evaluate(()=>{for(const x of LACT_BOTS)x.bot.update=x.update;if(LACT_BOTS.some(x=>x.bot.update!==x.update))throw Error('bot observer restoration');delete globalThis.LACT_BOTS;});}
   if(cases.at(-1).status!=='passed')break;
  }
  if(errors.length)throw Error(JSON.stringify(errors));return {status:cases.length===3&&cases.every(c=>c.status==='passed')?'passed':'failed',cases,errors,source:'actual emitted Game',scope:'Controlled 60 Hz Game input regression; normal intro and native projectile updates'};
 }finally{await context.close();}
}
