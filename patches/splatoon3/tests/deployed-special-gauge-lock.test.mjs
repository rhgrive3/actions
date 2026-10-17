import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const STEP=1/60,near=(a,b,m)=>assert.ok(Math.abs(a-b)<1e-8,`${m}: ${a} != ${b}`);
const EXTRA=`
 export { specialGaugeLocked, specialGaugeRemaining, clearSpecialGaugeLocks } from './patches/splatoon3/runtime/tacticooler-gauge.mjs';
 export { advanceStormLock } from './patches/splatoon3/runtime/storm-effects.mjs';
 export { bigBubblerDomes, clearBigBubblers } from './patches/splatoon3/runtime/kit-big-bubbler.mjs';
 export { advanceTenacity as advanceActorTenacity } from './patches/splatoon3/runtime/tenacity.mjs';
 export { advanceTenacity as advanceMatchTenacity } from './patches/local-quality/tenacity.mjs';
 export { Match } from './inkwave-public/src/game/match.js';
 export { BotBrain } from './inkwave-public/src/game/bots.js';
 export { NetSession } from './inkwave-public/src/net/session.js';
 export { installRanked } from './patches/splatoon3/runtime/ranked/install.mjs';
 export { RankedEngine } from './patches/splatoon3/runtime/ranked/engine.mjs';
 export { acceptState } from './patches/splatoon3/runtime/ranked/network.mjs';
`;
async function world(ap=0){
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,adaptRuntime:adaptBuildSource,extraExports:EXTRA});
 const {G,THREE}=f;G.scene=new THREE.Scene();G.camera=new THREE.PerspectiveCamera();G.match={mode:'turf',state:'playing',time:180,playing:()=>true,canRespawn:()=>false};
 G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
 const a=f.make(),enemy=f.make();enemy.team=1;enemy.pos.set(0,0,15);enemy.remote=true;
 a._resolve=()=>{};a.isLocal=true;a.nid=7;a.aimDir.set(0,0,1);a.aimYaw=0;a.aimPitch=0;a.aimPoint.set(0,1,15);
 a.s3.loadout=ap===57?Array.from({length:3},()=>({main:'specialPower',subs:Array(3).fill('specialPower')})):f.emptyLoadout();
 a.s3RefreshGear();
 const equip=id=>{a.weapon={...a.weapon,special:id,sub:'bomb',specialCost:100};a.special=100;a.intent.fire=a.intent.sub=false;};
 const start=id=>{equip(id);a._startSpecial();assert.equal(a.stats.specials>0,true);};
 const tick=(n=1)=>{for(let i=0;i<n;i++){G.time+=STEP;f.advanceStormLock(a,STEP);if(a.specialActive)a._updateSpecial(STEP);G.projectiles.update(STEP);}};
 const subThrow=()=>{a.intent.sub=true;a._updateSpecial(STEP);a.intent.sub=false;a._updateSpecial(STEP);for(let i=0;i<20&&a.specialActive;i++)tick();};
 return{f,G,a,enemy,equip,start,tick,subThrow,p:G.projectiles};
}

test('Tenta and Chump fixed activation locks survive death/reset and cleared missiles/decoys, at AP0/57',async()=>{
 for(const ap of [0,57])for(const [id,frames]of [['tentaMissiles',600],['superChump',635]]){
  const w=await world(ap),{f,G,a,p}=w;w.start(id);const started=G.time;
  near(f.specialGaugeRemaining(a),frames/60,`${id} activation duration`);
  a.intent.fire=true;a._updateSpecial(STEP);a.intent.fire=false;
  w.tick(45);assert.equal(a.specialActive,null,`${id} actor recovery finished while lock remains`);
  for(const o of p._s3AllSpecialObjects||[])o.dead=true;
  p._s3AllSpecialObjects=[];p.list.length=0;
  assert.equal(f.specialGaugeLocked(a),true,'effect removal cannot waive a fixed lock');
  a.splat(null,'water');a.reset();a.specialActive=null;
  assert.equal(f.specialGaugeLocked(a),true,'a new life retains the activation clock');
  a.addTurf(10);near(a.special,0,'dead/reset cannot recharge');
  G.time=started+(frames-1)/60;assert.equal(f.specialGaugeLocked(a),true,'penultimate source frame');
  G.time=started+frames/60;assert.equal(f.specialGaugeLocked(a),false,'exact fixed deadline');
  a.addTurf(10);near(a.special,10,'recharge resumes');
 }
});

test('Wave lock begins at throw for 360F; Screen begins at operation for 300F, independent of AP/effect lifetime',async()=>{
 for(const ap of [0,57])for(const [id,frames,kind]of [['waveBreaker',360,'wave'],['splattercolorScreen',300,'screen']]){
  const w=await world(ap),{f,G,a,p}=w;w.start(id);
  assert.equal(f.specialGaugeLocked(a),false,'holding/activation alone starts no device lock');
  w.subThrow();const object=p._s3AllSpecialObjects.find(o=>o.kind===kind);
  assert.ok(object);const state=a.s3SpecialGaugeLocks.get(id);
  near(state.until, state.game.time+(frames/60),`${id} throw/operation clock`);
  a.addTurf(4);near(a.special,0,'main paint blocked after animation finishes');
  w.tick(frames-1);assert.equal(f.specialGaugeLocked(a),true,'last locked source frame');
  w.tick();assert.equal(f.specialGaugeLocked(a),false,'source deadline during the real world update');
  assert.equal(object.dead,false,'device still exists after its shorter gauge window');
  a.addTurf(4);near(a.special,4,'living device no longer blocks recharge');
 }
});

test('Wave destruction ends its lock immediately; stale retirement cannot clear another special lock',async()=>{
 const w=await world(),{f,a,p,enemy}=w;w.start('waveBreaker');w.subThrow();
 const object=p._s3AllSpecialObjects.find(o=>o.kind==='wave');assert.ok(object);
 enemy.remote=false;p.s3DamageSpecialObjects(enemy,object.pos,5,()=>10000,'Shooter');
 assert.equal(object.dead,true,'real device HP destruction path is exercised');
 assert.equal(f.specialGaugeLocked(a),false,'destroyed device immediately releases its own lock');
 a.addTurf(5);near(a.special,5,'recharge after destruction');
 p.clear();w.start('tentaMissiles');assert.equal(f.specialGaugeLocked(a),true);
 object.dead=true;assert.equal(f.specialGaugeLocked(a),true,'retired wave cannot unlock a fixed missile use');
});

test('Big Bubbler starts at native ignition, retains AP-controlled HP lifetime after death, and ends on collapse',async()=>{
 const lifetimes=[];
 for(const ap of [0,57]){
  const w=await world(ap),{f,G,a}=w;w.start('bubbler');const dome=f.bigBubblerDomes()[0];assert.ok(dome);
  assert.equal(f.specialGaugeLocked(a),false,'unignited structure starts no lock');
  w.tick(14);assert.equal(f.specialGaugeLocked(a),false);w.tick();assert.equal(dome.ignited,true);assert.equal(f.specialGaugeLocked(a),true);
  a.splat(null,'water');a.reset();assert.equal(f.bigBubblerDomes().includes(dome),true);assert.equal(f.specialGaugeLocked(a),true);
  let frames=15;while(!dome.dead&&frames<1400){w.tick();frames++;}
  assert.ok(dome.dead);assert.equal(f.specialGaugeLocked(a),false);lifetimes.push(frames);
  a.addTurf(4);near(a.special,4,'collapse resumes charge');
  assert.equal(a.stormGaugeLock||0,0,'Bubbler never borrowed the Storm clock');
 }
 assert.ok(lifetimes[1]>lifetimes[0],'Special Power already extends the real HP lifetime; no guessed lock interpolation');
 const w=await world();w.start('bubbler');w.tick(15);assert.equal(w.f.specialGaugeLocked(w.a),true);
 w.f.clearBigBubblers('test-destruction');assert.equal(w.f.specialGaugeLocked(w.a),false,'early collapse releases lock');
});

test('Storm starts on native cloud creation after delayed flight/death, preserves actual AP denominator, rejects ghosts/adoption and clears cleanly',async()=>{
 const w=await world(57),{f,G,a,p}=w;w.start('storm');
 a.intent.sub=true;G.time+=STEP;a.update(STEP);a.intent.sub=false;G.time+=STEP;a.update(STEP);
 const bomb=p.bombs.at(-1);assert.ok(bomb);bomb.pos.y=100;near(a.stormGaugeLock||0,0,'throw alone is not cloud operation');
 for(let i=0;i<20;i++){G.time+=STEP;a.update(STEP);p._updateBombs(STEP);}near(a.stormGaugeLock,0,'delayed airborne interval is unlocked');
 assert.equal(p.clouds.length,0,'falling device has not operated');
 a.splat(null,'water');a.special=13;G.physics.segment=(_from,to,h)=>{h.hit=true;h.point.copy(to);h.normal.set(0,1,0);return h;};
 p._updateBombs(STEP);near(a.stormGaugeLock,10,'native contact after death starts the full AP57 duration');near(a.stormGaugeDuration,10,'HUD denominator is the actual cloud duration');
 near(a.special,0,'a newly operating spent-gauge window cannot retain refill from before operation');
 G.time+=STEP;a.update(STEP);near(a.stormGaugeLock,10-STEP,'native actor decrements once even while dead');
 a.reset();near(a.stormGaugeLock,10-STEP,'reset retains remaining clock and denominator');near(a.stormGaugeDuration,10,'HUD denominator survives snapshot cleanup');
 p.clear();near(a.stormGaugeLock,0,'retiring the real cloud clears its lock');
 for(const remote of [true,false]){
  a.remote=remote;a.special=17;p._spawnCloud({...bomb,ghost:true});near(a.stormGaugeLock,0,'remote/adopted ghost cannot acquire an authoritative cloud clock');near(a.special,17,'replica cannot consume the adopted actor charge');p.clear();
 }
});

test('common device lock gates paint, Actor/Match Tenacity, ranked host/follower and Booyah without losing receipts',async()=>{
 const w=await world(),{f,G,a,enemy}=w;w.start('waveBreaker');w.subThrow();
 a.s3.loadout=f.emptyLoadout();a.s3.loadout[0].main='tenacity';a.s3.tenacityBaseCost=100;a.s3.modifiers.specialCharge=1;
 const enemy2=f.make();enemy2.team=1;G.match.actors=G.actors;
 a.addTurf(5);near(a.special,0,'paint blocked');
 near(f.advanceActorTenacity(a,STEP,f),0,'Actor Tenacity blocked');
 f.advanceMatchTenacity(G.match,STEP,f.emit);near(a.special,0,'Match Tenacity blocked');
 const caster=f.make();Object.assign(caster,{remote:true,nid:11,netLife:3,s3CatalogueBooyah:{activation:7}});
 const cheer={actor:a,id:'booyahBomb',action:'cheer',activation:7,ownerNid:11,ownerLife:3,seed:1,call:1};
 f.emit('all:special',cheer);near(a.special,0,'Booyah sender cannot recharge');
 f.context.structuredClone=structuredClone;f.installRanked({...f.installedRuntime,Match:f.Match,BotBrain:f.BotBrain,NetSession:f.NetSession,structuredClone});
 const stage={id:'gauge-zones',zones:[{center:[0,0,0],size:[6,6]}]},m=G.match;
 m.ranked=new f.RankedEngine('zones',stage);m.mode='zones';m.rankedGains=[0,0];m.rankedWorld={update(){}};m.rankedEffects={event(){}};
 f.Match.prototype.playRankedEvents.call(m,[{kind:'special-gain',team:0,points:10}]);near(a.special,0,'host objective points blocked');
 const host=new f.RankedEngine('zones',stage);host.revision=2;
 assert.equal(f.acceptState({match:m,cfg:{id:'g'},s:{hostId:'host'}},{match:'g',host:'host',state:host.snapshot(),gains:[20,0]}),true);near(a.special,0,'follower blocked');assert.equal(m.rankedGains[0],20);
 const lock=a.s3SpecialGaugeLocks.get('waveBreaker');G.time=lock.until;
 f.emit('all:special',cheer);near(a.special,0,'locked cheer stays consumed after unlock');
 f.emit('all:special',{...cheer,seed:2,call:2});near(a.special,3,'new cheer earns source points');
});

test('Rainmaker pickup cancels active lock sources while devices remain, and late cloud operation cannot restart one',async()=>{
 const w=await world(),{f,G,a,p}=w;w.start('waveBreaker');w.subThrow();const device=p._s3AllSpecialObjects.find(o=>o.kind==='wave');
 f.context.structuredClone=structuredClone;f.installRanked({...f.installedRuntime,Match:f.Match,BotBrain:f.BotBrain,NetSession:f.NetSession,structuredClone});
 const m=G.match;m.ranked=new f.RankedEngine('rainmaker',{id:'gauge-hoco',rainmaker:{center:a.pos.toArray(),goals:[[0,0,10],[0,0,-10]],checkpoints:[[],[]]}});
 m.mode='rainmaker';m.actors=G.actors;m.rankedGains=[0,0];m.rankedEffects={event(){}};
 a.stormGaugeLock=8;a.s3TacticoolerGauge={stand:{expires:100},game:G,match:m,until:100};
 m.ranked.rule.state.barrier.active=false;
 m.ranked.update(STEP,{actors:[{id:'7',team:0,pos:a.pos.toArray(),alive:true,grounded:true}],inputs:{},floorAt:()=>0});
 assert.equal(m.ranked.rule.state.carrier,'7','the real Rainmaker rule admits the pickup');
 f.Match.prototype.playRankedEvents.call(m,m.ranked.events);
 assert.equal(f.specialGaugeLocked(a),false);near(a.special,0,'Rainmaker pickup zeros the gauge');assert.equal(device.dead,false,'pickup leaves deployed devices alive');
 p._spawnCloud({owner:a,team:a.team,pos:a.pos.clone(),dir:new f.THREE.Vector3(0,0,1)});
 assert.equal(p.clouds.length,1,'a previously thrown source can still operate while its owner carries Rainmaker');
 assert.equal(f.specialGaugeLocked(a),false,'late operation respects the held-Rainmaker exception');
 a.remote=true;assert.equal(f.specialGaugeLocked(a),false);a.remote=false;
 p.clear();G.match={mode:'turf',state:'playing',time:180,playing:()=>true};w.start('tentaMissiles');assert.equal(f.specialGaugeLocked(a),true);p.clear();assert.equal(f.specialGaugeLocked(a),false,'match teardown removes fixed clocks');
});
