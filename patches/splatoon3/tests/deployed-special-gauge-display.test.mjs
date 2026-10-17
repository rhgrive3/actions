import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const STEP=1/60,near=(a,b,m)=>assert.ok(Math.abs(a-b)<1e-8,`${m}: ${a} != ${b}`);
const EXTRA=`
 export { specialGaugeFraction,advanceStormLock } from './patches/splatoon3/runtime/storm-effects.mjs';
 export { startSpecialGauge,startTacticoolerGauge,clearSpecialGaugeLocks,specialGaugeLocked } from './patches/splatoon3/runtime/tacticooler-gauge.mjs';
 export { bigBubblerDomes,damageBigBubblerFromInkVac,clearBigBubblers } from './patches/splatoon3/runtime/kit-big-bubbler.mjs';
 export { inkVacState } from './patches/splatoon3/runtime/kit-ink-vac.mjs';
 export { hudFrameSnapshot } from './patches/local-quality/hud-snapshots.mjs';
`;
async function world(){
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,adaptRuntime:adaptBuildSource,extraExports:EXTRA});
 const {G,THREE}=f;G.scene=new THREE.Scene();G.camera=new THREE.PerspectiveCamera();
 G.match={mode:'turf',state:'playing',time:180,playing:()=>true,canRespawn:()=>false,teamSummary:()=>[]};
 G.physics.segment=(from,to,h)=>{h.hit=from.y>=0&&to.y<0;if(h.hit){h.point.copy(from).lerp(to,from.y/(from.y-to.y));h.normal.set(0,1,0);}return h;};
 const a=f.make(),enemy=f.make();enemy.team=1;enemy.pos.set(0,0,100);a.isLocal=true;a.nid=7;a.aimDir.set(0,0,1);a.aimPoint.set(0,1,15);a._resolve=()=>{};
 const tick=()=>{G.time+=STEP;if(a.specialActive)a._updateSpecial(STEP);G.projectiles.update(STEP);};
 const start=id=>{G.projectiles.clear();a.reset();a.weapon={...a.weapon,special:id,sub:'bomb',specialCost:100};a.special=100;a.intent.sub=a.intent.fire=false;a._prevIntent={};a._startSpecial();};
 const deploy=()=>{a.intent.sub=true;a._updateSpecial(STEP);a.intent.sub=false;a._updateSpecial(STEP);for(let i=0;i<30&&a.specialActive;i++)tick();};
 const game={settings:{},minimap:{},_lowInkFlash:0};
 const view=()=>f.hudFrameSnapshot(game,G.match,a,a.weapon,0,[],[],null,false,f.PLAYER,f.SUB);
 return{f,G,a,enemy,start,deploy,tick,view,game};
}

test('native Tenta/Chump/Wave/Screen spent HUD follows the captured lock after death/reset, without points or repayment',async()=>{
 const w=await world(),{f,G,a}=w;
 for(const [id,frames]of [['tentaMissiles',600],['superChump',635],['waveBreaker',390],['splattercolorScreen',300]]){
  w.start(id);if(id==='waveBreaker'||id==='splattercolorScreen'){
   near(w.view().special,1,'held device keeps its full spent display');assert.equal(f.specialGaugeLocked(a),false,'holding does not invent a deployed lock');w.deploy();
  }
  const state=a.s3SpecialGaugeLocks.get(id);assert.ok(state,id);near(state.displayDuration,frames/60,`${id} published depletion window`);
  near(w.view().special,1,'starts full');a.splat(null,'water');a.reset();
  G.time=state.startedAt+state.displayDuration/2;
  const before=a.stats.turf;a.addTurf(9);near(a.stats.turf-before,9,'turf scoring continues');near(a.special,0,'earned charge stays zero');
  const frame=w.view();near(frame.special,.5,`${id} halfway`);assert.equal(frame.specialActive,true);assert.equal(frame.specialReady,false);
  near(w.game._hudTransport.mobile.special,.5,'touch receives identical spent fraction');near(a.specialFrac(),0,'native snapshot charge stays empty');assert.equal(a.specialReady(),false);
  a.remote=true;assert.equal(f.specialGaugeFraction(a),null,'remote proxy has no invented local clock');near(w.view().special,0,'remote fallback uses native charge');a.remote=false;
  G.time=state.until;assert.equal(f.specialGaugeFraction(a),null,'exact expiry returns to normal HUD');
  a.addTurf(4);near(a.special,4,'only newly earned points refill after expiry');
 }
 G.projectiles.clear();assert.equal(f.specialGaugeFraction(a),null,'match teardown removes display ownership');
});

test('Cooler displays the fixed 600F rate even when a Tower stand disappears at 450F, and Rainmaker cancels the display',async()=>{
 const w=await world(),{f,G,a,view}=w;w.start('tacticooler');near(view().special,1,'held stand stays full');a.specialActive=null;a.special=0;
 const stand={owner:a,expires:G.time+450/60};f.startTacticoolerGauge(stand,G);const began=G.time;
 near(view().special,1,'placement starts full');G.time=began+300/60;near(view().special,.5,'600F denominator, not stand lifetime');
 G.time=began+449/60;near(view().special,151/600,'last stand frame retains the original depletion rate');
 G.time=began+450/60;assert.equal(f.specialGaugeFraction(a),null,'disappearance ends display early');
 const replacement={owner:a,expires:G.time+900/60};f.startTacticoolerGauge(replacement,G);near(view().special,1,'new stand owns new display');
 f.clearSpecialGaugeLocks(a);assert.equal(f.specialGaugeFraction(a),null,'Rainmaker clear resets display without destroying stand');assert.equal(replacement.s3Retired,undefined);
});

test('Bubbler spent display uses undamaged natural lifetime rather than remaining device HP, then disappears on real collapse',async()=>{
 const w=await world(),{f,G,a,enemy}=w;w.start('bubbler');const dome=f.bigBubblerDomes()[0],state=a.s3SpecialGaugeLocks.get('bubbler');assert.ok(state);
 assert.equal(dome.ignited,false);near(w.view().special,1,'gauge begins during ignition motion');
 G.time=state.startedAt+state.displayDuration/4;near(w.view().special,.75,'captured natural lifetime');
 const before=dome.damageProgress;assert.ok(f.damageBigBubblerFromInkVac(dome,enemy,100)>0);assert.ok(dome.damageProgress>before);
 near(w.view().special,.75,'incoming damage does not accelerate the depletion display');
 a.splat(null,'water');a.reset();near(w.view().special,.75,'death/reset preserve the original AP/lifetime denominator');
 f.clearBigBubblers('gauge-display-test');assert.equal(f.specialGaugeFraction(a),null,'real early collapse immediately empties display');
 a.addTurf(6);near(a.special,6,'collapse grants no deferred earlier points');
});

test('spent display traces and point admission agree at 30/60/120 Hz, and changing matches retires old display state',async()=>{
 const w=await world(),{f,G,a}=w;let expected;
 for(const hz of [30,60,120]){
  G.projectiles.clear();a.specialActive=null;a.special=0;G.time=0;const clock=new f.FixedClock(),rows=[];
  f.startSpecialGauge(a,G,'splattercolorScreen',300,{dead:false});
  for(let frame=0;frame<5*hz;frame++)clock.advance(1/hz,dt=>{G.time+=dt;rows.push(f.specialGaugeFraction(a));a.addTurf(1);});
  if(expected)assert.deepEqual(rows,expected);else expected=rows;
  assert.equal(rows.at(-1),null);assert.ok(rows.at(-2)>0);near(a.special,1,'only final unlocked tick earns points');
 }
 f.startSpecialGauge(a,G,'tentaMissiles',600);assert.ok(f.specialGaugeFraction(a)>0);G.match={...G.match};assert.equal(f.specialGaugeFraction(a),null,'old match is never a display source');
});

test('local body specials display their real action clock or special ink reserve, then end on native completion',async()=>{
 const w=await world(),{f,G,a}=w;
 for(const id of ['inkjet','booyahBomb','ultraStamp','tripleInkstrike','krakenRoyale','zipcaster']){
  w.start(id);const state=a._s3AllSpecialState;assert.ok(state,id);near(w.view().special,1,`${id} activation display`);
  // These are the action owner's existing clocks, not an independent HUD
  // timer. The next real native update must be reflected immediately.
  if(id==='zipcaster'){state.inkFuel=75;near(w.view().special,.5,'Zipcaster displays its special tank, not elapsed time');state.t=1;}
  else {state.t=state.duration/2;near(w.view().special,.5,`${id} action midpoint`);}
  a._updateSpecial(STEP);
  near(w.view().special,a.specialFrac(),'HUD and canonical remaining charge agree');assert.equal(w.view().specialReady,false);
  a.remote=true;assert.equal(f.specialGaugeFraction(a),null,'remote action clocks are not fabricated');a.remote=false;
  if(id==='zipcaster')state.inkFuel=0;else state.t=state.duration;
  a._updateSpecial(STEP);
  near(w.view().special,0,`${id} exhausted action display`);
  a.splat(null,'water');assert.equal(f.specialGaugeFraction(a),null,'body action display stops at death');a.reset();
 }
 // The third real release ends Inkstrike early, even though its markers keep
 // flying. A surviving marker must never keep this body-owned display alive.
 w.start('tripleInkstrike');
 for(let n=0;n<3;n++){a.intent.sub=true;a._updateSpecial(STEP);a.intent.sub=false;a._updateSpecial(STEP);for(let i=0;i<34&&a.specialActive;i++)w.tick();}
 assert.equal(a.specialActive,null);assert.ok(G.projectiles._s3AllSpecialObjects.some(o=>o.kind==='marker'||o.kind==='strike'));
 assert.equal(f.specialGaugeFraction(a),null,'third marker immediately ends the remaining spent display');
});

test('Storm and Cooler flight stay full without a premature lock, then late operation starts the real depletion after owner death',async()=>{
 const w=await world(),{f,G,a}=w;
 for(const id of ['storm','tacticooler']){
  w.start(id);a.pos.y=100;
  const inputStep=()=>id==='storm'?a.update(STEP):a._updateSpecial(STEP);
  a.intent.sub=true;inputStep();a.intent.sub=false;inputStep();
  for(let i=0;i<30&&a.specialActive;i++)w.tick();
  const list=id==='storm'?G.projectiles.bombs:G.projectiles._s3SupportCoolerThrows;
  assert.ok(list.some(o=>o.owner===a),`${id}: native projectile remains in flight after throw animation`);assert.equal(a.specialActive,null);
  near(w.view().special,1,`${id} flight stays full`);assert.equal(f.specialGaugeLocked(a),false,'display adds no pre-operation lock');
  a.remote=true;assert.equal(f.specialGaugeFraction(a),null);a.remote=false;
  a.splat(null,'water');assert.equal(f.specialGaugeFraction(a),null,'unoperated projectile has no post-death display claim');a.reset();
  assert.equal(f.specialGaugeFraction(a),null,'respawn cannot revive the old pending display');
  for(let i=0;i<300&&!f.specialGaugeLocked(a);i++)w.tick();
  assert.equal(f.specialGaugeLocked(a),true,'real late device operation still locks after reset');near(w.view().special,1,'late operation starts the deployed clock full');
  G.projectiles.clear();assert.equal(f.specialGaugeFraction(a),null,'clear removes projectile and display ownership');a.pos.y=0;
 }
 w.start('tacticooler');a.pos.y=100;a.intent.sub=true;a._updateSpecial(STEP);a.intent.sub=false;a._updateSpecial(STEP);
 for(let i=0;i<30&&a.specialActive;i++)w.tick();near(w.view().special,1,'pending stand exists');
 f.clearSpecialGaugeLocks(a);assert.equal(f.specialGaugeFraction(a),null,'Rainmaker clear also removes pending display');
 G.projectiles.clear();
 w.start('tacticooler');a.intent.sub=true;a._updateSpecial(STEP);a.intent.sub=false;a._updateSpecial(STEP);
 for(let i=0;i<30&&a.specialActive;i++)w.tick();near(w.view().special,1,'new pending stand exists');
 G.actors=[];G.projectiles.clear();assert.equal(f.specialGaugeFraction(a),null,'teardown also clears a projectile owner already removed from the actor list');
});

test('Vac spent display drains during inhale and is zero throughout its separate exhale mode',async()=>{
 const w=await world(),{f,a,G}=w;w.start('inkVac');near(w.view().special,1,'activation is full');
 for(let i=0;i<180;i++){G.time+=STEP;a.update(STEP);}
 near(w.view().special,.5,'actual six-second inhale clock is the display source');near(a.specialFrac(),.5,'native canonical remaining points agree');assert.equal(a.specialReady(),false);
 for(let i=0;i<180;i++){G.time+=STEP;a.update(STEP);}
 assert.equal(f.inkVacState(a).phase,'exhale');near(w.view().special,0,'phase-local t reset must not refill the spent display');
 for(let i=0;i<10;i++){G.time+=STEP;a.update(STEP);}near(w.view().special,0,'exhale transition retains zero');
 a.splat(null,'water');assert.equal(f.specialGaugeFraction(a),null);a.reset();assert.equal(f.specialGaugeFraction(a),null);
});

test('body HUD rejects stale private action ownership, life or match without modifying a new authoritative charge value',async()=>{
 const w=await world(),{f,G,a}=w;
 for(const change of ['owner','life','match']){
  w.start('inkjet');a._s3AllSpecialState.t=1;
  if(change==='owner')a.owner='next-owner';if(change==='life')a.netLife=(a.netLife||0)+1;if(change==='match')G.match={...G.match};
  a.special=23;assert.equal(f.specialGaugeFraction(a),null,change);near(a.special,23,'pure projection cannot overwrite a new authority’s points');
 }
});
