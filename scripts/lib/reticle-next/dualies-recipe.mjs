// Local capture recipe only: no game/adaptor/CI writes and no browser launch.
// Caller supplies actual official Playwright page, true pointer lock acquired
// by a trusted canvas gesture, and source-owned pace(). Mouse/key actions use
// Playwright's trusted native event path, never debug input-flag writes.
// Source baseline rhgrive3/actions@e0072a749df0ec8c2d368e383bdf337baa7b44ad:
// patches/practice-range/runtime/session.mjs:215 travel(), stage/zones.mjs Dodge Pad;
// patches/splatoon3/runtime/weapon-edgecases.mjs:340 first-fire startup;
// patches/splatoon3/runtime/weapons.mjs:1032 turret/gate lifetime;
// inkwave-public/src/ui/hud.js:37 native twin WAAPI kick, :829 twin radii.
import assert from 'node:assert/strict';
export const DUALIES_BASELINE_SHA='e0072a749df0ec8c2d368e383bdf337baa7b44ad';
export const DUALIES_PHASES=Object.freeze(['idle','fire-startup','firing','rolling','post-roll-gate','turret-lock','held-after-lock','release','unlocked']);
const EPS=1e-9;
export const horizontalTravel=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);

// Browser-evaluated sampler. Only reads actual actor, runner, HUD, DOM and
// passive weapon:fire observer metadata; it never fabricates an action/state.
export function readDualiesSample() {
 const G=window.__G,g=window.__inkwave,a=G.local,w=a.weapon,r=a.weaponRunner,h=g.hud,ret=h.ret;
 const attr=(n,k)=>n?.getAttribute(k)??null;
 return {weaponId:a.weaponId,kind:w.kind,hudWeapon:h._L.weapon,hudKind:h._L.kind,
  tick:g.s3Clock.ticks,frozen:g.frozen,position:a.pos.toArray(),grounded:a.grounded,
  camera:[...G.camera.position.toArray(),...G.camera.quaternion.toArray(),G.camera.fov],
  fire:a.intent.fire===true,move:[a.intent.move.x,a.intent.move.z],
  keys:Object.fromEntries(['KeyA','KeyD','Space'].map(k=>[k,G.input.down(k)])),
  dodge:r.dodge?{t:r.dodge.t,dur:r.dodge.dur,startup:r.dodge.startup,startupDur:r.dodge.startupDur}:null,lockT:r.lockT,s3Turret:r.s3Turret===true,
  fireStartup:r.s3DualiesStart||0,shotGate:Math.max(r.s3DodgeShotPending||0,r.s3DodgeShotRemaining||0),
  charging:r.charging===true,charge:r.charge||0,ink:a.ink,hand:r.hand,
  sourceFrames:{startup:w.humanoidFirstShotDelay*60,roll:w.rollTime*60,gate:w.rollShotDelay*60,lock:w.lockTime*60},
  classes:[...ret.classList],visible:ret.isConnected&&getComputedStyle(ret).display!=='none'&&getComputedStyle(ret).visibility!=='hidden',
  mergedRadius:Number(attr(ret.querySelector('.iw-ret__merged'),'r')),
  twins:[...ret.querySelectorAll('.iw-ret__twin')].map(n=>({radius:Number(attr(n,'r')),transform:attr(n,'transform')})),
  events:(window.__dualiesRecipeEvidence?.events||[]).map(e=>({...e})),
  observedKick:window.__dualiesRecipeEvidence?.observedKick||false};
}
export function assertDualiesSample(s,phase,{before=false}={}) {
 assert(DUALIES_PHASES.includes(phase),'known native Dualies phase');
 assert.equal(s.weaponId,'dualies');assert.equal(s.kind,'dualies');
 assert.equal(s.hudWeapon,'dualies');assert.equal(s.hudKind,'dualies');
 assert(s.frozen&&s.visible,'actual frozen native game and connected visible HUD required');
 assert(!s.charging&&s.charge===0,'Dualies recipe never charges');
 assert(s.position.every(Number.isFinite));
 assert(s.position[0]>13&&s.position[0]<33&&s.position[2]>1&&s.position[2]<21,'remain within the native Dodge Pad');
 // startup here is FIRST FIRE (2F), not the separate issue477 pre-roll (4F).
 for(const [key,value] of Object.entries({startup:2,roll:12,gate:4,lock:32}))
  assert(Math.abs(s.sourceFrames[key]-value)<1e-6,'source-owned '+key+' frame contract');
 if(s.dodge)assert(Math.abs(s.dodge.startupDur*60-4)<1e-6,'source-owned separate pre-roll startup is4F');
 assert.equal(s.twins.length,2);assert(s.twins.every(t=>t.radius===6.2),'native twin radii stay 6.2');
 const merged=s.s3Turret&&s.classes.includes('is-lock');
 assert.equal(s.classes.includes('is-lock'),s.s3Turret,'native HUD lock follows actual s3Turret, not lockT');
 assert.equal(s.mergedRadius,!before&&merged?13:6.2,'candidate changes only actual merged turret circle');
 if(['idle','release','unlocked'].includes(phase)){assert(!s.fire&&!s.dodge&&!s.s3Turret&&s.lockT<=EPS);}
 if(phase==='fire-startup'){assert(s.fire&&s.fireStartup>EPS&&!s.dodge&&s.events.length===0);}
 if(phase==='firing'){assert(s.fire&&s.events.length>0&&!s.dodge&&!s.s3Turret);assert(s.observedKick,'accepted native shot must retain scale1.55→1/130ms WAAPI kick');}
 if(phase==='rolling'){assert(s.fire&&s.dodge&&s.dodge.startup<=EPS&&s.dodge.t>0&&s.keys.KeyD);assert(s.classes.includes('is-roll'));}
 if(phase==='post-roll-gate')assert(s.fire&&!s.dodge&&s.shotGate>EPS&&s.s3Turret&&s.lockT>EPS);
 if(phase==='turret-lock')assert(s.fire&&!s.dodge&&s.shotGate<=EPS&&s.s3Turret&&s.lockT>EPS);
 if(phase==='held-after-lock')assert(s.fire&&!s.dodge&&s.s3Turret&&s.lockT<=EPS&&!s.keys.KeyD);
 return s;
}
function captureInvariant(s) {
 const {events,observedKick,classes,visible,twins,mergedRadius,...native}=s;
 return {...native,eventCount:events.length,classes,mergedRadius,twins};
}
// Observer changes only recipe-owned telemetry. It does not intercept, wrap,
// invoke or replace any game method, emit an event, or advance an animation.
async function observeNativeFire(page) {
 await page.evaluate(async()=>{
  if(window.__dualiesRecipeEvidence)throw Error('Dualies observer already installed');
  const {on,G}=await import(new URL('src/core/ctx.js',document.baseURI).href);
  if(G!==window.__G)throw Error('Native event observer must share the actual game context');
  const evidence={events:[],observedKick:false};window.__dualiesRecipeEvidence=evidence;
  evidence.unsubscribe=on('weapon:fire',({actor,hand})=>{
   if(actor!==G.local||actor.weaponId!=='dualies')return;
   evidence.events.push({tick:window.__inkwave.s3Clock.ticks,hand,ink:actor.ink});
   for(const twin of window.__inkwave.hud._twin||[])for(const animation of twin.getAnimations()){
    const effect=animation.effect,frames=effect?.getKeyframes?.()||[];
    if(effect?.getTiming?.().duration===130&&frames[0]?.transform==='scale(1.55)'&&frames.at(-1)?.transform==='scale(1)')evidence.observedKick=true;
   }
  });
 });
}
export async function releaseDualiesInputs(page) {
 const operations=[()=>page.mouse.up({button:'left'}),
  ...['KeyA','KeyD','Space'].map(key=>()=>page.keyboard.up(key))];
 const results=await Promise.allSettled(operations.map(run=>Promise.resolve().then(run)));
 const errors=results.filter(r=>r.status==='rejected').map(r=>r.reason);
 if(errors.length)throw new AggregateError(errors,'Native fire/A/D/Space release failed');
 assert(await page.evaluate(()=>!window.__G.input.mouse.left&&['KeyA','KeyD','Space'].every(k=>!window.__G.input.down(k))),
  'genuine left mouse/A/D/Space must all be released');
}
export async function runDualiesRecipe(page,{pace,capture,before=false,settleCamera}={}) {
 assert.equal(typeof pace,'function','official native pace(page,frames,dt) required');
 assert.equal(typeof capture,'function','actual native frame/crop capture callback required');
 const rows=[];let primaryError=null,observerOwned=false;
 const sample=()=>page.evaluate(readDualiesSample);
 const tick=async()=>{const a=await sample();await pace(page,1,1/60);const b=await sample();assert.equal(b.tick-a.tick,1,'exactly one native 60Hz fixed tick');return b;};
 const until=async(predicate,label,max=80)=>{for(let n=0;n<max;n++){const s=await tick();if(predicate(s))return s;}throw Error('Actual Dualies phase deadline: '+label);};
 const take=async phase=>{const s=assertDualiesSample(await sample(),phase,{before});await capture(phase,s);const after=await sample();assert.deepEqual(captureInvariant(after),captureInvariant(s),'capture must not advance clock, pose, input, action or emitted shots');rows.push({phase,...s});return s;};
 try {
  await releaseDualiesInputs(page);
  assert(await page.evaluate(()=>window.__G.input.locked&&document.pointerLockElement===window.__G.renderer.domElement),'trusted native pointer lock must be acquired by caller');
  await page.evaluate(async()=>{const G=window.__G;G.match.range.setWeapon('dualies');G.match.range.travel('dualies');await G.local.character.sourceMotion.ready;});
  if(settleCamera)await settleCamera(page,180,1/60);
  else {let previous=null,stable=0;await until(s=>{const delta=previous?Math.max(...s.camera.map((v,i)=>Math.abs(v-previous[i]))):Infinity;previous=s.camera;stable=s.grounded&&delta<=1e-5?stable+1:0;return stable>=4;},'native camera/ground settle',180);}
  const start=await sample();assert(Math.abs(start.position[0]-23)<.05&&Math.abs(start.position[2]-6)<.05,'native travel reference stand only');
  await observeNativeFire(page);
  observerOwned=true;
  await take('idle');
  await page.mouse.down({button:'left'});await tick();await take('fire-startup');
  await until(s=>s.events.length>0,'actual emitted first fire',12);await take('firing');
  await page.keyboard.down('KeyD');
  await until(s=>Math.hypot(...s.move)>.01,'actual lateral KeyD input',8);
  const rollOrigin=(await sample()).position,shotCount=(await sample()).events.length;
  await page.keyboard.down('Space');await tick();await page.keyboard.up('Space');
  await until(s=>s.dodge&&horizontalTravel(s.position,rollOrigin)>.01,'actual rolling horizontal travel',8);
  const rolling=await take('rolling');assert(horizontalTravel(rolling.position,rollOrigin)>.01,'roll must really travel laterally');assert.equal(rolling.events.length,shotCount,'native roll emits no shot');
  await page.keyboard.up('KeyD');
  await until(s=>!s.dodge&&s.shotGate>EPS,'post-roll shot gate',20);const gated=await take('post-roll-gate');assert.equal(gated.events.length,shotCount,'native travel and gate emit no shot');
  await until(s=>s.shotGate<=EPS&&s.lockT>EPS&&s.events.length>shotCount,'accepted native turret shot',12);await take('turret-lock');
  await until(s=>s.lockT<=EPS,'native movement lock expiry',40);await take('held-after-lock');
  // A zero movement timer alone is NOT an unlock. Release genuine fire first.
  await page.mouse.up({button:'left'});await tick();const released=await take('release');
  await page.keyboard.down('KeyA');
  await until(s=>horizontalTravel(s.position,released.position)>.01,'native released movement',12);
  await page.keyboard.up('KeyA');await tick();const unlocked=await take('unlocked');assert.equal(unlocked.events.length,released.events.length,'released trigger emits no new shot');
  return {baselineSha:DUALIES_BASELINE_SHA,weaponId:'dualies',before,phases:rows};
 } catch(error){primaryError=error;throw error;}
 finally {
  const results=await Promise.allSettled([releaseDualiesInputs(page),observerOwned?page.evaluate(()=>{window.__dualiesRecipeEvidence?.unsubscribe?.();delete window.__dualiesRecipeEvidence;}):Promise.resolve()]);
  const failures=results.filter(r=>r.status==='rejected').map(r=>r.reason);
  if(failures.length)throw new AggregateError(primaryError?[primaryError,...failures]:failures,'Dualies recipe cleanup failed');
 }
}
