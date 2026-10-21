import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
// All tested runtime exports resolve through the same source/emitted namespace.
const {context,THREE,RankedWorld,RankedEngine,createClamBarrier,createClamPose,CLAM_VISUAL_SCALE,CLAM_VISUAL_HALF_HEIGHT,installWeaponHandoffMotion}=await fixture({extraExports:`
 export {RankedWorld} from './patches/splatoon3/runtime/ranked/world.mjs';
 export {RankedEngine} from './patches/splatoon3/runtime/ranked/engine.mjs';
 export {createClamBarrier,createClamPose,CLAM_VISUAL_SCALE,CLAM_VISUAL_HALF_HEIGHT} from './patches/splatoon3/runtime/ranked/clam-presentation.mjs';
 export {installWeaponHandoffMotion} from './patches/splatoon3/runtime/weapon-handoff-motion.mjs';
`});
context.structuredClone=structuredClone;
const stage = { id:'clam-presentation', clams:{spawns:[],goals:[[0,0,20],[0,0,-20]]} };
function setup() {
 const scene=new THREE.Scene(), triggers=[];
 const actor={nid:'player',team:0,slot:0,alive:true,yaw:0,pos:new THREE.Vector3(),character:{trigger:name=>triggers.push(name)}};
 const engine=new RankedEngine('clams',stage),G={scene,time:0};
 const world=new RankedWorld({THREE,G},{mode:'clams',actors:[actor]},stage);
 return {scene,G,engine,world,actor,triggers};
}
const same=(a,b)=>assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));

// Production ball presentation is deliberately held at the existing main
// transform. The unused calibration helper remains only as a negative control.
function legacyPose(mesh,clam,clock){
 const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(
  clam.velocity?.[0]*.04||0,(clam.velocity?.[1]*.04||0)+clock*1.4,
  clam.drilling?clock*24:(clam.velocity?.[2]*.04||0)));
 assert.equal(JSON.stringify(mesh.scale.toArray()),'[1,1,1]','main ball scale');
 same(mesh.position.toArray(),[clam.pos[0],clam.pos[1]+(clam.kind==='power'?.255:.066),clam.pos[2]]);
 assert.ok(mesh.quaternion.angleTo(q)<1e-7,'main clock/velocity ball rotation');
}
test('field and inventory sizes and ground support remain main-equivalent',()=>{
 const {world,engine,G}=setup();
 for(const kind of ['small','power']){
  const c=engine.rule._newClam(kind,0,[1,2,3]);
  engine.rule.state.inventories.player={team:0,small:kind==='small'?7:0,power:kind==='power'};
  const before=engine.snapshot();world.update(engine,1/60);same(engine.snapshot(),before);
  const mesh=world._clamMarkers.get(c.id).mesh,group=world._inventoryMarkers.get('player');legacyPose(mesh,c,G.time);
  const held=kind==='small'?group.userData.smallClams:group.userData.powerClam;
  same(held.scale.toArray(),[1,1,1]);same(group.position.toArray(),[0,kind==='power'?.34:.16,-.72]);
 }world.dispose();
});
test('flight and same-id kind reuse retain main scale, lift and clock rotation',()=>{
 const {world,engine,G}=setup(),r=engine.rule;
 const c=r._newClam('power',0,[2,3,4],{grounded:false,age:.17,velocity:[1,2,3]});
 for(const kind of ['power','small'])for(const v of [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0],[0,-1,0],[3,4,-2]]){
  c.kind=kind;c.velocity=v;G.time+=.17;const before=engine.snapshot();world.update(engine);same(engine.snapshot(),before);legacyPose(world._clamMarkers.get(c.id).mesh,c,G.time);
 }
 c.grounded=true;c.velocity=[0,0,0];G.time=10000;world.update(engine);legacyPose(world._clamMarkers.get(c.id).mesh,c,G.time);world.dispose();
});
test('rejected 8a calibration fails the production main-equivalence gate',()=>{
 const pose=createClamPose(THREE),mesh=new THREE.Mesh(),c={kind:'power',pos:[0,1.15,0],grounded:false,velocity:[0,4,9.84],age:0};
 pose(mesh,c);assert.throws(()=>legacyPose(mesh,c,1),/main ball scale/);
 mesh.scale.setScalar(1);assert.throws(()=>legacyPose(mesh,c,1));
 mesh.position.y+=.255;assert.throws(()=>legacyPose(mesh,c,1),/main clock\/velocity/);
});
test('drilling marker remains main-equivalent while the barrier follows authority countdown',()=>{
 const {world,engine,G}=setup(),b=engine.rule.state.baskets[0];
 b.pendingBreak={remaining:1,pos:[0,.55,19],sequence:1};G.time=.3;const before=engine.snapshot();world.update(engine,1/60);same(engine.snapshot(),before);
 const mesh=world._clamMarkers.get('drill-0').mesh;
 legacyPose(mesh,{kind:'power',pos:b.pendingBreak.pos,drilling:true},G.time);
 b.pendingBreak.remaining=.7;G.time=.6;world.update(engine,1/60);legacyPose(mesh,{kind:'power',pos:b.pendingBreak.pos,drilling:true},G.time);
 assert.equal(world.baskets[0].gate.userData.clamBarrierPhase,'drilling');world.dispose();
});

for(const hz of [30,60,144])test(`bounded barrier fracture finishes at the same elapsed time at ${hz}Hz; does not replay`,()=>{
 const barrier=createClamBarrier(THREE,0x3355ff),s={barrierOpen:false};
 barrier.update(s,0); s.pendingBreak={remaining:.3};barrier.update(s,0);
 const geo=barrier.mesh.geometry,mat=barrier.mesh.material,matrix=barrier.mesh.instanceMatrix;
 assert.equal(mat.forceSinglePass,true,'Transparent DoubleSide must not silently double the barrier draw');
 s.pendingBreak=null;s.barrierOpen=true;barrier.update(s,0);
 assert.equal(barrier.mesh.userData.clamBarrierPhase,'breaking');
 const start=Array.from(matrix.array);barrier.update(s,0);assert.deepEqual(Array.from(matrix.array),start);
 for(let i=0;i<Math.ceil(.56*hz);i++)barrier.update(s,1/hz);
 assert.equal(barrier.mesh.visible,false);assert.equal(barrier.mesh.userData.clamBarrierPhase,'open');
 for(let i=0;i<100;i++)barrier.update(s,1/hz);assert.equal(barrier.mesh.visible,false);
 assert.equal(barrier.mesh.geometry,geo);assert.equal(barrier.mesh.material,mat);assert.equal(barrier.mesh.instanceMatrix,matrix);
 s.barrierOpen=false;barrier.update(s,1/hz);assert.equal(barrier.mesh.visible,true);
 s.barrierOpen=true;barrier.update(s,0);assert.equal(barrier.mesh.userData.clamBarrierPhase,'breaking');
 barrier.mesh.dispose();geo.dispose();mat.dispose();
});

test('late joining an already open basket never invents a fracture and cancelling drill resets all matrices',()=>{
 const a=createClamBarrier(THREE,1);a.update({barrierOpen:true},0);assert.equal(a.mesh.visible,false);
 a.update({barrierOpen:false},0);const closed=Array.from(a.mesh.instanceMatrix.array);
 a.update({barrierOpen:false,pendingBreak:{remaining:.21}},0);
 a.update({barrierOpen:false},0);assert.deepEqual(Array.from(a.mesh.instanceMatrix.array),closed);
 a.mesh.dispose();a.mesh.geometry.dispose();a.mesh.material.dispose();
});

test('actual successful throws retain canonical event type without an arm consumer, and reject empty attempts',()=>{
 const {world,engine,actor,triggers}=setup(),r=engine.rule;
 const ra={id:'player',team:0,alive:true,pos:[0,0,0]},frame={actors:[],floorAt:()=>0,blocked:()=>false};
 for(const kind of ['small','power']) {
  r.state.inventories.player={team:0,small:kind==='small'?1:0,power:kind==='power'};
  assert.equal(r._throw(ra,{aim:[0,0,1]},frame),true);
  const event=engine.events.at(-1);assert.equal(event.kind,'clam-throw');assert.equal(event.clamKind,kind);
  const state=engine.snapshot();world.presentEvent?.(event);world.presentEvent?.(event);same(engine.snapshot(),state);
 }
 assert.deepEqual(triggers,[]);const count=engine.events.length;
 assert.equal(r._throw(ra,{aim:[0,0,1]},frame),false);assert.equal(engine.events.length,count);
 actor.alive=false;world.presentEvent?.({kind:'clam-throw',clamKind:'power',id:'dead',actor:'player'});
 world.presentEvent?.({kind:'power',id:'old',actor:'player'});assert.equal(triggers.length,0);world.dispose();
});

test('real scoring keeps 1.2 second break, 20/3 points, clean event discriminator and no presentation mutation',()=>{
 const {world,engine}=setup(),r=engine.rule,b=r.state.baskets[0];
 const c=r._newClam('power',0,[0,.55,19],{grounded:false});
 assert.equal(r._tryGoal(c,[0,.55,18],[0,.55,21],{actors:[],floorAt:()=>0,blocked:()=>false}),true);
 assert.equal(b.pendingBreak.remaining,1.2);world.update(engine,0);
 engine.update(1.1,{actors:[],inputs:{},floorAt:()=>0});assert.equal(b.barrierOpen,false);same(engine.counts,[100,100]);
 engine.update(.1,{actors:[],inputs:{},floorAt:()=>0});assert.equal(b.barrierOpen,true);same(engine.counts,[80,100]);
 const before=engine.snapshot();world.update(engine,1/60);same(engine.snapshot(),before);
 r._score(0,'small',[0,.55,20]);same(engine.counts,[77,100]);
 const score=engine.events.filter(e=>e.kind==='clam-score');same(score.map(e=>[e.clamKind,e.points]),[['power',20],['small',3]]);
 world.dispose();
});

test('200 throw/expiry cycles bound scene markers, reuse resources, dispose once',()=>{
 const {world,engine,scene}=setup(),r=engine.rule;let gd=0,md=0;
 world.powerClamResources.geometry.addEventListener('dispose',()=>gd++);world.powerClamResources.material.addEventListener('dispose',()=>md++);
 for(let i=0;i<200;i++) {
  const c=r._newClam('power',0,[i,0,0]);world.update(engine,1/60);
  c.expiresIn=.01;r._expireAndAge(.02);world.update(engine,1/60);
  assert.ok(world._clamMarkers.size<=48);assert.ok(world.clamsGroup.children.length<=50);
 }
 assert.equal(gd,0);assert.equal(md,0);world.dispose();world.dispose();assert.equal(gd,1);assert.equal(md,1);assert.equal(scene.children.length,0);
});

import {sourceLoadedActorFixture} from './source-loaded-actor-fixture.mjs';
for(const source of [false,true])test(`installed Clam success adds zero pose evaluations or wrist discontinuity (${source?'loaded Player00':'native'})`,async t=>{
 const f=await sourceLoadedActorFixture({random:()=>.5,extraExports:`export {RankedWorld} from './patches/splatoon3/runtime/ranked/world.mjs'; export {bombMotionSnapshot} from './patches/splatoon3/runtime/bomb-motion.mjs';`});
 const a=await f.make();if(!source)a.character.sourceMotion.setEnabled(false);assert.equal(a.character.sourceMotion.enabled,source);
 a.nid=1;a.character.actor=a;a.character.onEvent=null;f.G.actors=[a];f.G.scene.add(a.character.root);
 const e=new f.RankedEngine('clams',stage),m=f.G.match={mode:'clams',state:'playing',ranked:e,actors:[a],playing:()=>true,rankedGains:[0,0],rankedEffects:{event(){}}};
 const w=m.rankedWorld=new f.RankedWorld(f,m,stage);for(let i=0;i<60;i++)f.tick(a);
 const c=a.character;let solves=0,updates=0,triggers=0;const solve=c._solveLimb,update=c.update,trigger=c.trigger;
 c._solveLimb=function(...args){solves++;return solve.apply(this,args);};c.update=function(...args){updates++;return update.apply(this,args);};
 c.trigger=function(name,...args){if(name==='clam-throw'||name==='throw')triggers++;return trigger.call(this,name,...args);};
 const wrist=()=>c.bones.handL.getWorldPosition(new f.THREE.Vector3()).toArray();
 const pose=()=>({bones:c.boneList.map(b=>b.quaternion.toArray()),P:Array.from(c.P),timers:Array.from(c.tr),springs:Array.from(c.sp),ik:Array.from(c.ikErr),wrist:wrist(),bombHeld:c.bombHeld});
 const rows=[];
 for(const kind of ['small','power']){
  e.rule.state.inventories['1']={team:0,power:kind==='power',small:kind==='small'?1:0};
  assert.equal(e.rule._throw({id:'1',team:0,pos:a.pos.toArray(),alive:true},{aim:[0,0,1]},{actors:[],floorAt:()=>0}),true);
  const events=e.events.splice(0),before=pose(),authority=e.snapshot();
  f.Match.prototype.playRankedEvents.call(m,events);f.Match.prototype.playRankedEvents.call(m,events);
  same(pose(),before);same(e.snapshot(),authority);assert.equal(solves,0);assert.equal(updates,0);assert.equal(triggers,0);assert.equal(!!c.s3ClamGripActive,false);
  rows.push({kind,eventCount:events.length,eventWristJump:0,extraSolves:0,extraUpdates:0});
 }
 const banners=[];f.G.hud={banner:(...args)=>banners.push(args)};e.rule._score(0,'small',[0,.55,20]);const scored=e.snapshot();
 f.Match.prototype.playRankedEvents.call(m,e.events.splice(0),true);same(e.snapshot(),scored);assert.equal(banners.length,1,'Score notification repair remains live');
 assert.equal(f.bombMotionSnapshot(c).phase,'idle');t.diagnostic(JSON.stringify(rows));w.dispose();f.reset();
});

test('final owner retains one native pose call and performs no inactive Clam checks or IK',t=>{
 const token={},G={match:{mode:'turf'}},C={};let nativeCalls=0,checks=0;
 class Probe{
  constructor(){this.P=new Float32Array(4);this.kidForm=false;}
  _applyPose(dt,s){nativeCalls++;this.P[0]=dt;this.P[1]=s.aim;this.P[2]=s.weight;return token;}
  _solveLimb(){throw Error('Inactive pose attempted IK');}_kidXform(){}_owner(){return null;}
  getMuzzle(out){return out;}setWeapon(){}dispose(){}
 }
 installWeaponHandoffMotion({THREE,G,Character:Probe,CHARACTER_CHANNELS:C});assert.equal(Probe.prototype._applyPose.length,2);
 const ch=new Probe();Object.defineProperty(ch,'s3ClamGripActive',{get(){checks++;return false;}});
 const samples=[],params={aim:.3,weight:.8};for(const mode of ['turf','clams','rainmaker']){
  G.match.mode=mode;const beforeCalls=nativeCalls,start=performance.now();for(let i=0;i<10000;i++)assert.equal(ch._applyPose(.016,params),token);
  samples.push({mode,updates:10000,ms:performance.now()-start});assert.equal(nativeCalls-beforeCalls,10000);assert.equal(checks,0);assert.deepEqual(Array.from(ch.P),Array.from(new Float32Array([.016,.3,.8,0])));
 }t.diagnostic(JSON.stringify({inactiveFinalOwner:samples}));
});
