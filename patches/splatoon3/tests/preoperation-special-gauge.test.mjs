import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

// S3mix general gauge rule + individual Wave/Cooler/Storm: before operation,
// held devices retain the full gauge; death uses the ordinary Saver penalty.
// Real composed Actor/Projectiles/gear paths, not a retail capture.
const F=1/60,near=(a,b,m)=>assert.ok(Math.abs(a-b)<1e-8,`${m}: ${a} != ${b}`);
const EXTRA=`export {preOperationGaugeState,specialGaugeLocked,startPendingSpecialGauge,clearSpecialGaugeLocks} from './patches/splatoon3/runtime/tacticooler-gauge.mjs';
 export {specialGaugeFraction} from './patches/splatoon3/runtime/storm-effects.mjs';`;
async function world(){
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:EXTRA}),{G,THREE}=f;
 G.scene=new THREE.Scene();G.camera=new THREE.PerspectiveCamera();G.match={mode:'turf',state:'playing',playing:()=>true,canRespawn:()=>false};
 G.physics.segment=(from,to,h)=>{h.hit=from.y>=0&&to.y<0;if(h.hit){h.point.copy(from).lerp(to,from.y/(from.y-to.y));h.normal.set(0,1,0);}return h;};
 const a=f.make();a.nid=7;a.netLife=3;a.owner='local';a.isLocal=true;a.aimDir.set(0,0,1);a.aimPoint.set(0,1,30);a._resolve=()=>{};
 function start(id,ap=0){
  G.projectiles.clear();a.reset();a.pos.set(0,0,0);a.netLife=3;a.owner='local';a.remote=false;
  a.s3.loadout=ap===57?Array.from({length:3},()=>({main:'specialSaver',subs:Array(3).fill('specialSaver')})):f.emptyLoadout();a.s3RefreshGear();
  a.weapon={...a.weapon,special:id,sub:'bomb'};a.special=a.specialCost();a.intent.sub=a.intent.fire=false;a._prevIntent={};a._startSpecial();
 }
 function tick(){G.time+=F;a.update(F);G.projectiles.update(F);}
 function release(){a.intent.sub=true;tick();a.intent.sub=false;tick();for(let i=0;i<30&&a.specialActive;i++)tick();}
 return {f,G,a,start,tick,release};
}

test('all four native held devices preserve full points for ordinary death/Saver, without creating a deployed lock',async()=>{
 const w=await world(),{f,a,G}=w;
 for(const id of ['storm','tacticooler','waveBreaker','splattercolorScreen'])for(const ap of [0,57]){
  w.start(id,ap);const state=f.preOperationGaugeState(a);assert.ok(state,id);const cost=state.cost;near(a.special,cost,'canonical full held remainder');
  assert.equal(f.specialGaugeLocked(a),false,'held state is not a deployed lock');assert.equal(a.specialReady(),false,'retained full points cannot reactivate');
  const uses=a.stats.specials;a._startSpecial();assert.equal(a.stats.specials,uses,'actual activation rejects held reuse');
  const turf=a.stats.turf;a.addTurf(12);near(a.stats.turf-turf,12,'paint score still counts');near(a.special,cost,'held reserve does not gain charge');
  const keep=a.s3.modifiers.specialSaver;near(keep,ap===57?1:.5,'actual equipped Saver modifier');
  a.splat(null,'water');near(a.special,cost*keep,`${id} AP${ap} ordinary death remainder`);assert.equal(f.preOperationGaugeState(a),null);
  assert.equal(f.specialGaugeFraction(a),null,'death removes the held display projection');near(a.specialFrac(),keep,'HUD fallback uses ordinary saved charge');
  a.respawnTimer=1;G.time+=F;a.update(F);near(a.special,cost*keep,'dead ticking cannot resume consumption');
  G.projectiles.clear();
 }
});

test('real Storm/Cooler flight retains its captured native cost until late operation consumes the saved next-life remainder',async()=>{
 const w=await world(),{f,a,G}=w;
 for(const id of ['storm','tacticooler'])for(const ap of [0,57]){
  w.start(id,ap);a.pos.y=100;w.release();assert.equal(a.specialActive,null);
  const state=f.preOperationGaugeState(a);assert.ok(state?.device,id);const cost=state.cost;near(a.special,cost,'real released record owns full gauge');assert.equal(f.specialGaugeLocked(a),false);
  assert.equal(a.specialReady(),false,'flight full remainder is not a second activation');const uses=a.stats.specials;a._startSpecial();assert.equal(a.stats.specials,uses);
  a.addTurf(7);near(a.special,cost,'flight scoring cannot add to the reserved gauge');
  const keep=a.s3.modifiers.specialSaver;a.splat(null,'water');near(a.special,cost*keep,'ordinary airborne death uses Saver');
  a.reset();a.special=cost*keep; // simulate the respawn owner's preserved finalized death value
  for(let n=0;n<300&&!f.specialGaugeLocked(a);n++)w.tick();
  assert.equal(f.specialGaugeLocked(a),true,'surviving source operates after death/reset');near(a.special,0,'existing late-operation contract consumes the new-life retained remainder');
  a.addTurf(9);near(a.special,0,'post-operation paint cannot refill');G.projectiles.clear();
 }
});

test('pre-operation ownership is local, life/match bound, and reset/Rainmaker/teardown retire the canonical reserve',async()=>{
 const w=await world(),{f,a,G}=w;
 for(const change of ['owner','life','match','remote']){
  w.start('tacticooler');const state=f.preOperationGaugeState(a);assert.ok(state);
  if(change==='owner')a.owner='other';if(change==='life')a.netLife++;if(change==='match')G.match={...G.match};if(change==='remote')a.remote=true;
  assert.equal(f.preOperationGaugeState(a),null,change);const before=a.special;a.specialReady();
  near(a.special,change==='match'?0:before,'foreign/remote life receives no authority mutation; stale same-life match reserve is spent');
 }
 w.start('storm');a.reset();near(a.special,0,'live reset starts empty');assert.equal(f.preOperationGaugeState(a),null);
 w.start('tacticooler');f.clearSpecialGaugeLocks(a);near(a.special,0,'Rainmaker clear consumes reserved gauge');assert.equal(f.preOperationGaugeState(a),null);
 w.start('tacticooler');a.pos.y=100;w.release();assert.ok(f.preOperationGaugeState(a));G.actors=[];G.projectiles.clear();
 near(a.special,0,'teardown includes departed owners of flying stands');assert.equal(f.preOperationGaugeState(a),null);
 w.start('tacticooler');const original=f.preOperationGaugeState(a),foreign={owner:{},ghost:false};
 f.startPendingSpecialGauge(a,G,'tacticooler',foreign,[foreign]);assert.ok(f.preOperationGaugeState(a)===original,'foreign projectile cannot take canonical ownership');
 const device={owner:a};f.clearSpecialGaugeLocks(a);f.startPendingSpecialGauge(a,G,'tacticooler',device,[device]);
 assert.equal(f.preOperationGaugeState(a),null,'a stray later throw cannot recreate a cleared activation reserve');
});

test('pre-operation full fraction follows native gear cost changes before ordinary death instead of restoring an obsolete point denomination',async()=>{
 const w=await world(),{f,a}=w;w.start('tacticooler');const state=f.preOperationGaugeState(a),old=state.activationCost;
 a.s3.loadout=Array.from({length:3},()=>({main:'specialCharge',subs:Array(3).fill('specialCharge')}));a.s3RefreshGear();
 const cost=a.specialCost();assert.notEqual(cost,old,'the test actually changes the native point denomination');w.tick();
 near(a.special,cost,'canonical native full points use the new cost');near(a.specialFrac(),1,'held fraction remains full');near(state.activationCost,old,'activation provenance is retained');
 a.splat(null,'water');near(a.special,cost*.5,'existing Saver receives current full points, not the old denomination');
});
