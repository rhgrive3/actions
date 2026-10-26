// LOCAL capture recipe. Does not patch gameplay, set charge/ammunition/actor
// state, call debug.fire, or certify an unrun browser/retail gate.
import assert from 'node:assert/strict';
export const BASELINE_SHA='e0072a749df0ec8c2d368e383bdf337baa7b44ad';
export const BAMBOO_PHASES=Object.freeze(['idle','charging','full','release','squid','switch-back']);
export const PENCIL_PHASES=Object.freeze(['idle','charging','full','loaded-kid','loaded-squid','switch-back','scope-idle','scope-charging','scope-full','scope-release']);
export const CHARGER_CASES=Object.freeze([
 Object.freeze({name:'bamboo',id:'s3-charger-light',kind:'charger',profile:null,shape:'bamboo',phases:BAMBOO_PHASES}),
 Object.freeze({name:'pencil',id:'s3-charger-pencil',kind:'charger',profile:null,shape:'pencil',phases:PENCIL_PHASES}),
]);
export const SCOPE_CONTROL_ID='s3-charger-normalscope';
// Invoke once after range entry. Only observer-owned state is written. Listener
// captures scalar/vector values synchronously: never retain pooled bus payloads.
export async function installChargerObservation({before=false}={}) {
 // Production sets <base href="./_versions/REV/">. Absolute /src imports
 // would create a second ctx/registry and observe no actual accepted events.
 const {on,G}=await import(new URL('src/core/ctx.js',document.baseURI).href);
 if(G!==window.__G)throw Error('Charger observer must use the running versioned native event bus');
 const {WEAPONS}=await import(new URL('src/config.js',document.baseURI).href);
 let eligible=null;
 if(!before)({pencilLoadedReticleEligible:eligible}=await import(new URL('patches/local-quality/pencil-loaded-visibility-proposal.mjs',document.baseURI).href));
 window.__chargerRecipeObservation?.stop?.();
 const obs={events:[],registry:WEAPONS,eligible,before};
 window.__reticleNativeShots=obs.events;
 const vec=v=>v?[v.x,v.y,v.z]:null;
 obs.stop=on('weapon:fire',e=>{
  if(e.actor!==window.__G.local)return;
  const a=e.actor,r=a.weaponRunner,s=r.catalogState;
  obs.events.push(Object.freeze({ordinal:obs.events.length+1,weapon:e.weapon,weaponId:e.weapon,grounded:a.grounded===true,
   actorWeaponId:a.weaponId,charge:e.charge??null,hand:e.hand??null,
   muzzle:Object.freeze(vec(e.muzzle)||[]),dir:Object.freeze(vec(e.dir)||[]),
   nativeTick:window.__inkwave.s3Clock?.ticks??null,time:window.__G.time,
   // Event occurs before native post-emission decrement/reset. This is an
   // event-time fact, NOT the post-tick ammo assertion below.
   eventRounds:s?.rounds??null,eventChargeF:s?.chargeF??null,
   eventCharging:r.charging===true,eventRunnerCharge:r.charge??0}));
 });
 window.__chargerRecipeObservation=obs;
}
export async function installNativeShotObserver(page,options={}) {
 await page.evaluate(installChargerObservation,options);
}
export async function stopNativeShotObserver(page) {
 await page.evaluate(()=>{window.__chargerRecipeObservation?.stop?.();delete window.__chargerRecipeObservation;delete window.__reticleNativeShots;});
}
// Browser-evaluated, read-only. Uses current actor and current native HUD;
// nothing is reconstructed from a timer or from an expected ammunition count.
export function readChargerSnapshot() {
 const G=window.__G,g=window.__inkwave,a=G.local,r=a.weaponRunner,s=r.catalogState,h=g.hud,ret=h.ret;
 const obs=window.__chargerRecipeObservation;
 if(!obs)throw Error('Native Charger observation is not installed');
 const visible=el=>{let opacity=1;for(let n=el;n;n=n.parentElement){const c=getComputedStyle(n);if(c.display==='none'||c.visibility==='hidden')return false;opacity*=Number(c.opacity);}return opacity>.001;};
 const record=a.weapon.catalogRecord,p=record?.parameters,charge=h._chargeEl;
 const kit={id:a.weapon.id,variantOf:a.weapon.variantOf??null,sub:a.weapon.sub??null,special:a.weapon.special??null,specialCost:a.weapon.specialCost??null};
 return {weaponId:a.weaponId,hudWeapon:h._L.weapon,kind:h._L.kind,form:a.form,alive:a.alive,
  charge:r.charge??0,charging:r.charging===true,streaming:r.streaming===true,
  chargeF:s?.chargeF??null,rounds:s?.rounds??null,catalogId:s?.id??null,
  divideCount:p?.WeaponDivideChargerParam?.FullChargeDivideNum??null,
  cooldown:r.cooldown,pending:!!s?.pending,stored:!!s?.stored,
  hudCharge:h._L.charge,full:h._L.full===true,nativeCharging:h._L.charging===true,
  chargeOffset:charge?Number.parseFloat(charge.style.strokeDashoffset):null,chargeCircumference:h._chargeC,
  chargeHandleConnected:!!charge?.isConnected,chargeHandleInReticle:!!charge&&ret.contains(charge),
  classes:[...ret.classList],xhClasses:[...h.xh.classList],visible:visible(ret),hudVisible:h._visible===true,
  helperEligible:obs.eligible?obs.eligible(h,a.weaponId,obs.registry):null,
  shape:ret.dataset.chargerShape??null,scope:Number.parseFloat(h.scopeMask.style.opacity)||0,
  scoped:ret.classList.contains('is-scoped'),scopedWeapon:!!(a.weapon.scoped||a.weapon.scopedCharge||p?.WeaponScopeParam!=null),
  shotCount:obs.events.length,shots:obs.events.map(e=>({...e,muzzle:[...e.muzzle],dir:[...e.dir]})),
  nativeTick:g.s3Clock?.ticks??null,input:{locked:G.input.locked,fire:G.input.mouse.left,
   squid:G.input.down('ShiftLeft')||G.input.down('ShiftRight'),enabled:G.input.enabled,controllerEnabled:G.match.controller?.enabled},
  kit,source:{catalogId:record?.id??null,sourceActor:record?.sourceActor??null,sourceRow:record?.sourceRow??null,
   sourceSha256:record?.sourceSha256??null,sourcePath:record?.sourcePath??null},
  camera:{fov:G.camera.fov,aspect:G.camera.aspect},
  registryIdentity:{actual:a.weapon===obs.registry[a.weaponId],recordId:record?.id??null},
  rect:ret.getBoundingClientRect().toJSON()};
}
export function chargerPhaseReady(row,phase) {
 const p=phase.replace(/^scope-/,'');
 if(p==='charging')return row.form==='kid'&&row.charging&&row.charge>=.35&&row.charge<=.65;
 if(p==='full')return row.form==='kid'&&row.charging&&row.charge===1;
 if(p==='loaded-kid')return row.form==='kid'&&!row.charging&&row.charge===0&&row.rounds===4&&!row.pending;
 if(p==='loaded-squid')return row.form==='squid'&&!row.charging&&row.charge===0&&row.rounds===4;
 if(p==='squid')return row.form==='squid'&&!row.charging&&row.charge===0;
 if(['idle','release','switch-back'].includes(p))return row.form==='kid'&&!row.charging&&row.charge===0&&!row.pending&&!(row.rounds>0);
 return false;
}
export function assertChargerSnapshot(row,scenario,phase,{before=false}={}) {
 const scope=phase.startsWith('scope-'),id=scope?SCOPE_CONTROL_ID:scenario.id;
 assert.equal(row.weaponId,id);assert.equal(row.hudWeapon,id);assert.equal(row.kind,'charger');
 assert(chargerPhaseReady(row,phase),'native Charger phase: '+phase);
 assert(row.hudVisible&&row.chargeHandleConnected&&row.chargeHandleInReticle,'actual native HUD and gauge attached');
 assert.equal(row.full,row.charge>=.999,'native full state follows charge, never ammo');
 assert(Number.isFinite(row.hudCharge),'native HUD charge must be sampled');
 assert(Math.abs(row.chargeOffset-Number((row.chargeCircumference*(1-row.hudCharge)).toFixed(2)))<=.02,'native gauge follows current display charge including source-owned delay');
 const loaded=phase==='loaded-kid',hidden=['idle','release','squid','loaded-squid','switch-back','scope-idle','scope-release'].includes(phase);
 assert.equal(row.visible,loaded?!before:!hidden,'native idle/squid gates with candidate loaded-only exception');
 if(loaded){
  assert.equal(row.divideCount,5);assert.equal(row.catalogId,'s3-charger-pencil');assert.equal(row.rounds,4);
  assert.equal(row.hudCharge,0);assert.equal(row.full,false);assert.equal(row.nativeCharging,false);
  assert.equal(row.classes.includes('is-full'),false);assert.equal(row.classes.includes('is-charging'),false);
  assert.equal(row.classes.includes('is-idle'),before,'loaded candidate must clear native reticle idle gate');
  assert.equal(row.helperEligible,before?null:true,'candidate actual helper, not a recipe reimplementation');
 }
 if(phase==='loaded-squid'){
  assert.equal(row.rounds,4,'native owner retains loaded rounds in squid form');
  assert.equal(row.helperEligible,before?null:false);
 }
 assert.equal(row.shape,before||scope?null:scenario.shape,'candidate-only target decoration, stale shape cleared');
 if(!scope){assert.equal(row.scope,0,'unscoped target must not inherit scoped view');assert.equal(row.scoped,false);}
 if(phase==='scope-full'){assert.equal(row.scope,1);assert.equal(row.scoped,true);}
 if(['scope-idle','scope-release'].includes(phase)){assert.equal(row.scope,0);assert.equal(row.scoped,false);}
}
// Trusted page mouse/keyboard operations only; range selection is delegated to
// the caller's existing native menu/range selection path. No direct runner,
// input flags, charge, rounds, actor form, or debug.fire mutation is allowed.
export async function runChargerRecipe(page,{scenario,pace,capture,before=false,selectWeapon,dt=1/60,maxFrames=360,fullHoldTicks=30}={}) {
 assert(CHARGER_CASES.some(s=>s.id===scenario?.id));assert.equal(typeof pace,'function');
 assert.equal(typeof capture,'function');assert.equal(typeof selectWeapon,'function');
 assert([1/60,1/30].includes(dt),'native 60Hz simulation; only source-supported 30/60Hz rendering');
 const nativeTicksPerRender=Math.round(dt*60);
 assert(Number.isSafeInteger(fullHoldTicks)&&fullHoldTicks>0&&fullHoldTicks%nativeTicksPerRender===0,'full hold must cover an exact whole native-tick interval');
 const read=()=>page.evaluate(readChargerSnapshot),step=()=>pace(page,1,dt);
 const until=async phase=>{for(let i=0;i<maxFrames;i++){await step();const r=await read();if(chargerPhaseReady(r,phase))return r;}throw Error('Native Charger phase deadline: '+phase);};
 const take=async(phase,meta={})=>{const row=await read();assertChargerSnapshot(row,scenario,phase,{before});await capture(phase,{charger:row,...meta});return row;};
 try {
 await page.mouse.up({button:'left'});await page.keyboard.up('Shift');await selectWeapon(scenario.id);await step();
 assert((await read()).input.locked,'Native mouse fire requires actual pointer lock; acquire via trusted canvas gesture before recipe');
 const initial=await until('idle'),shotBase=initial.shotCount;
 await take('idle');await page.mouse.down({button:'left'});await until('charging');await take('charging');
 await until('full');const fullStart=await read();
 for(let i=0;i<fullHoldTicks/nativeTicksPerRender;i++)await step();
 const fullEnd=await read();assert.equal(fullEnd.shotCount,shotBase,'holding full must not emit');
 assert.equal(fullEnd.nativeTick-fullStart.nativeTick,fullHoldTicks,'full hold advances the declared exact native tick budget');
 assert.equal(fullEnd.charge,1);await take('full',{fullHold:{nativeTicks:fullEnd.nativeTick-fullStart.nativeTick,shotCountBefore:fullStart.shotCount,shotCountAfter:fullEnd.shotCount}});
 await page.mouse.up({button:'left'});
 const released=await until(scenario.name==='pencil'?'loaded-kid':'release');
 assert.equal(released.shotCount,shotBase+1,'one actual accepted release shot');
 const shot=released.shots.at(-1);assert.equal(shot.weapon,scenario.id);assert.equal(shot.charge,1);
 await take(scenario.name==='pencil'?'loaded-kid':'release',{acceptedShot:shot});
 await page.keyboard.down('Shift');await until(scenario.name==='pencil'?'loaded-squid':'squid');
 await take(scenario.name==='pencil'?'loaded-squid':'squid');
 await page.keyboard.up('Shift');await step();
 // Check native reset through a real weapon switch, not forced ammunition.
 await selectWeapon(SCOPE_CONTROL_ID);await step();const out=await read();
 assert.equal(out.weaponId,SCOPE_CONTROL_ID);assert.equal(out.rounds,0,'weapon switch clears native loaded rounds');assert.equal(out.shape,null);
 await selectWeapon(scenario.id);await until('switch-back');await take('switch-back',{switchOut:{weaponId:out.weaponId,rounds:out.rounds,shape:out.shape,kit:out.kit}});
 if(scenario.name==='pencil'){
  await selectWeapon(SCOPE_CONTROL_ID);await until('scope-idle');await take('scope-idle');
  const n=(await read()).shotCount;await page.mouse.down({button:'left'});await until('scope-charging');await take('scope-charging');
  await until('scope-full');await take('scope-full');await page.mouse.up({button:'left'});await until('scope-release');
  assert.equal((await read()).shotCount,n+1,'scoped control release accepted once');await take('scope-release');
 }
 return {weaponId:scenario.id,phases:[...scenario.phases],inputProtocol:'native pointer-locked left mouse; Shift squid; caller native weapon selection',execution:'native recipe completed; caller owns screenshot verification'};
 } finally {
  await page.mouse.up({button:'left'});
  await page.keyboard.up('Shift');
 }
}
