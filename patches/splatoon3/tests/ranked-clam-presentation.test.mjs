import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { RankedWorld } from '../runtime/ranked/world.mjs';
import { RankedEngine } from '../runtime/ranked/engine.mjs';
import { createClamBarrier, createClamPose, CLAM_VISUAL_SCALE, CLAM_VISUAL_HALF_HEIGHT } from '../runtime/ranked/clam-presentation.mjs';
const stage = { id:'clam-presentation', clams:{spawns:[],goals:[[0,0,20],[0,0,-20]]} };
function setup() {
 const scene=new THREE.Scene(), triggers=[];
 const actor={nid:'player',team:0,slot:0,alive:true,yaw:0,pos:new THREE.Vector3(),character:{trigger:name=>triggers.push(name)}};
 const engine=new RankedEngine('clams',stage),G={scene,time:0};
 const world=new RankedWorld({THREE,G},{mode:'clams',actors:[actor]},stage);
 return {scene,G,engine,world,actor,triggers};
}
const same=(a,b)=>assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));

test('display scale and ground support change only meshes; inventory uses the same factor',()=>{
 const {world,engine}=setup();
 for(const kind of ['small','power']) {
  const c=engine.rule._newClam(kind,0,[1,2,3]);
  engine.rule.state.inventories.player={team:0,small:kind==='small'?7:0,power:kind==='power'};
  const before=engine.snapshot(); world.update(engine,1/60); same(engine.snapshot(),before);
  const field=world._clamMarkers.get(c.id).mesh,group=world._inventoryMarkers.get('player');
  assert.equal(field.scale.x,CLAM_VISUAL_SCALE[kind]);
  assert.equal(field.position.y,2+CLAM_VISUAL_HALF_HEIGHT[kind]);
  const held=kind==='small'?group.userData.smallClams:group.userData.powerClam;
  assert.equal(held.scale.x,field.scale.x);
 }
 world.dispose();
});

test('football X long-axis follows velocity for opposite/vertical directions; phase is age, not global time',()=>{
 const pose=createClamPose(THREE),mesh=new THREE.Mesh();
 for(const v of [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0],[0,-1,0],[3,4,-2]]) {
  const c={kind:'power',pos:[2,3,4],velocity:v,age:.17,grounded:false};
  pose(mesh,c);const long=new THREE.Vector3(1,0,0).applyQuaternion(mesh.quaternion);
  assert.ok(long.dot(new THREE.Vector3(...v).normalize())>1-1e-10);
  const q=mesh.quaternion.clone();pose(mesh,c);assert.ok(q.angleTo(mesh.quaternion)<1e-7);
  c.age+=.1;pose(mesh,c);assert.ok(q.angleTo(mesh.quaternion)>.1);
 }
});

test('grounded clams stop clock spin and reused markers clear flight/drill scale and pose',()=>{
 const {world,engine,G}=setup(),r=engine.rule;
 const c=r._newClam('power',0,[0,0,0],{grounded:false,age:1,velocity:[1,2,3]});
 world.update(engine);const mesh=world._clamMarkers.get(c.id).mesh;
 c.kind='small';c.grounded=true;c.velocity=[0,0,0];world.update(engine);const q=mesh.quaternion.clone();
 G.time=10000;c.age=10000;world.update(engine);assert.ok(q.angleTo(mesh.quaternion)<1e-9);
 assert.equal(mesh.scale.x,CLAM_VISUAL_SCALE.small);assert.equal(mesh.userData.clamPhase,'grounded');
 world.dispose();
});

test('drill rolls about the barrier-entry direction and preserves authority countdown',()=>{
 const {world,engine}=setup(),b=engine.rule.state.baskets[0];
 b.pendingBreak={remaining:1,pos:[0,.55,19],sequence:1};const before=engine.snapshot();
 world.update(engine,1/60);same(engine.snapshot(),before);
 const mesh=world._clamMarkers.get('drill-0').mesh;
 assert.equal(mesh.userData.clamPhase,'drilling');
 const long=new THREE.Vector3(1,0,0).applyQuaternion(mesh.quaternion);assert.ok(long.z>1-1e-10);
 b.pendingBreak.remaining=.7;world.update(engine,1/60);
 assert.ok(new THREE.Vector3(1,0,0).applyQuaternion(mesh.quaternion).z>1-1e-10);
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

test('actual successful throws retain canonical event type, animate once, and reject empty/dead attempts',()=>{
 const {world,engine,actor,triggers}=setup(),r=engine.rule;
 const ra={id:'player',team:0,alive:true,pos:[0,0,0]},frame={actors:[],floorAt:()=>0,blocked:()=>false};
 for(const kind of ['small','power']) {
  r.state.inventories.player={team:0,small:kind==='small'?1:0,power:kind==='power'};
  assert.equal(r._throw(ra,{aim:[0,0,1]},frame),true);
  const event=engine.events.at(-1);assert.equal(event.kind,'clam-throw');assert.equal(event.clamKind,kind);
  const state=engine.snapshot();world.presentEvent(event);world.presentEvent(event);same(engine.snapshot(),state);
 }
 assert.deepEqual(triggers,['clam-throw','clam-throw']);const count=engine.events.length;
 assert.equal(r._throw(ra,{aim:[0,0,1]},frame),false);assert.equal(engine.events.length,count);
 actor.alive=false;world.presentEvent({kind:'clam-throw',clamKind:'power',id:'dead',actor:'player'});
 world.presentEvent({kind:'power',id:'old',actor:'player'});assert.equal(triggers.length,2);world.dispose();
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
 const score=engine.events.filter(e=>e.kind==='clam-score');assert.deepEqual(score.map(e=>[e.clamKind,e.points]),[['power',20],['small',3]]);
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

import {fixture} from './source-fixture.mjs';
test('installed event delivery drives native rig recovery, never bomb creation or gameplay mutation',async t=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,includeCharacter:true,extraExports:`
  export {Match} from './inkwave-public/src/game/match.js';
  export {installRanked} from './patches/splatoon3/runtime/ranked/install.mjs';
  export {RankedWorld} from './patches/splatoon3/runtime/ranked/world.mjs';
  export {RankedEngine} from './patches/splatoon3/runtime/ranked/engine.mjs';
  export {bombMotionSnapshot,bombReleasePosition} from './patches/splatoon3/runtime/bomb-motion.mjs';
 `});f.context.structuredClone=structuredClone;f.installRanked(f.installedRuntime);
 f.G.scene=new f.THREE.Scene();f.G.level={blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;return out;}};
 f.G.physics=new f.Physics(f.G.level);
 const a=new f.Actor({team:0,name:'Clam native release',weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
 a.nid='player';a.isLocal=true;a.grounded=true;a.ground.hit=true;a.character.actor=a;a.character.onEvent=null;f.G.actors=[a];f.G.scene.add(a.character.root);
 const e=new f.RankedEngine('clams',stage),m=f.G.match={mode:'clams',ranked:e,actors:[a],playing:()=>true,rankedGains:[0,0],rankedEffects:{event(){}}};
 const w=m.rankedWorld=new f.RankedWorld(f.installedRuntime,m,stage);
 for(let i=0;i<60;i++){f.G.time+=1/60;a._finishFrame(1/60);}
 const physical=()=>JSON.stringify({pos:a.pos.toArray(),vel:a.vel.toArray(),ink:a.ink,hp:a.hp,alive:a.alive,form:a.form,weapon:a.weapon.id,fire:a.fireBuffer,special:a.special});
 const before=physical();e.rule.state.inventories.player={team:0,power:true,small:0};
 assert.equal(e.rule._throw({id:'player',team:0,pos:a.pos.toArray(),alive:true},{aim:[0,0,1]},{actors:[],floorAt:()=>0}),true);
 let leftSolves=0;const solve=a.character._solveLimb;
 a.character._solveLimb=function(...args){if(args[0]===this.limbs.armL)leftSolves++;return solve.apply(this,args);};
 f.Match.prototype.playRankedEvents.call(m,e.events.splice(0));
 assert.equal(leftSolves,1,'Success event performs exactly one arm solve, without replaying the full pose');
 a.character.root.updateMatrixWorld(true);const handAtEvent=a.character.bones.handL.getWorldPosition(new f.THREE.Vector3());
 assert.ok(handAtEvent.distanceTo(new f.THREE.Vector3(0,1.15-.255*1.2,0))<.015,'Power-clam lower-shell grip is present on the event frame');
 assert.equal(f.bombMotionSnapshot(a.character).phase,'clam-recovery');assert.equal(a.character.bombHeld,false);assert.equal(physical(),before);assert.equal(f.shots.length,0);
 const release=f.bombReleasePosition(a,new f.THREE.Vector3(0,1.15,0));assert.ok(release.toArray().every(Number.isFinite));
 const handRows=[];
 for(const dt of [0,1/60,1/60,1/60]) {f.G.time+=dt;leftSolves=0;a._finishFrame(dt);assert.equal(leftSolves,1,'Only the baseline left-arm solve remains on subsequent poses');a.character.root.updateMatrixWorld(true);handRows.push({dt,phase:f.bombMotionSnapshot(a.character),hand:new f.THREE.Vector3().setFromMatrixPosition(a.character.bomb.group.matrixWorld).toArray()});}
 t.diagnostic(JSON.stringify({nativeRelease:release.toArray(),ruleOrigin:e.rule.state.clams.at(-1).pos,handAtEvent:handAtEvent.toArray(),handRows}));
 for(let i=0;i<40;i++){f.G.time+=1/60;a._finishFrame(1/60);assert.ok(Array.from(a.character.P).every(Number.isFinite));}
 assert.equal(f.bombMotionSnapshot(a.character).phase,'idle');assert.equal(a.character.s3ClamGripActive,false);assert.equal(f.shots.length,0);
 const bank=f.Character.prototype[Symbol.for('inkwave.s3.bomb-motion.install.v1')].states.get(a.character).clamCache;
 const originalPose=bank.pose,originalScratch=bank.receiver.PX;
 for(let i=0;i<32;i++)a.character.trigger('clam-throw',{clamRelease:{kind:'power',pos:[0,1.15,0]}});
 const reused=f.Character.prototype[Symbol.for('inkwave.s3.bomb-motion.install.v1')].states.get(a.character).clamCache;
 assert.equal(reused,bank);assert.equal(reused.pose,originalPose);assert.equal(reused.receiver.PX,originalScratch);
 t.diagnostic(JSON.stringify({clamScratchBytes:originalPose.byteLength+originalScratch.byteLength,repeatedThrows:32,reused:true}));
 for(let i=0;i<40;i++)a._finishFrame(1/60);
 a.weaponRunner.aimingSub=true;a.character.bombHeld=true;
 const pose=Array.from(a.character.P),timer=Array.from(a.character.tr);
 w.presentEvent({kind:'clam-throw',clamKind:'power',id:'during-sub-hold',actor:'player'});
 assert.equal(a.character.bombHeld,true);assert.equal(a.weaponRunner.aimingSub,true);
 assert.deepEqual(Array.from(a.character.P),pose);assert.deepEqual(Array.from(a.character.tr),timer);
 assert.equal(f.bombMotionSnapshot(a.character).phase,'aim');
 a.weaponRunner.aimingSub=false;a.character.bombHeld=false;
 // A regular bomb immediately replaces clam presentation, and weapon/death
 // lifecycle cancellation clears it. Native solver clamps unreachable targets.
 a.character.trigger('clam-throw',{clamRelease:{kind:'power',pos:[999,999,999]}});
 assert.equal(f.bombMotionSnapshot(a.character).clamGrip,false);
 for(const weapon of ['shooter','dualies','charger','roller']){
  a.setWeapon(weapon);for(let i=0;i<40;i++)a._finishFrame(1/60);
  const L=a.character.limbs.armL,up=L.up.position.clone(),lo=L.lo.position.clone(),end=L.end.position.clone();
  a.character.trigger('clam-throw',{clamRelease:{kind:'power',pos:[0,1.15,0]}});
  assert.equal(f.bombMotionSnapshot(a.character).clamGrip,weapon!=='dualies','Dualies arm overlay is deferred until its weapon rules are confirmed');
  a.character.trigger('throw');assert.equal(f.bombMotionSnapshot(a.character).clamGrip,false);assert.equal(a.character.s3ClamGripActive,false);
  assert.ok(L.up.position.equals(up)&&L.lo.position.equals(lo)&&L.end.position.equals(end),'No limb lengths/shape changed');
  assert.ok([...L.up.quaternion.toArray(),...L.lo.quaternion.toArray()].every(Number.isFinite));
 }
 a.character.trigger('clam-throw',{clamRelease:{kind:'power',pos:[0,1.15,0]}});a.alive=false;a._finishFrame(1/60);
 assert.equal(f.bombMotionSnapshot(a.character).clamGrip,false);assert.equal(a.character.s3ClamGripActive,false);a.alive=true;
 m.mode='rainmaker';a.character.trigger('clam-throw',{clamRelease:{kind:'power',pos:[0,1.15,0]}});
 assert.equal(f.bombMotionSnapshot(a.character).clamGrip,false);assert.equal(a.character.s3ClamGripActive,false);m.mode='clams';
 const banners=[];f.G.hud={banner:(...args)=>banners.push(args)};
 e.rule._score(0,'small',[0,.55,20]);const scored=e.snapshot(),scoreEvents=e.events.splice(0);
 f.Match.prototype.playRankedEvents.call(m,scoreEvents,true);
 same(e.snapshot(),scored);assert.equal(banners.length,1,'Canonical score restores exactly one native UI notification');
 a.character.trigger('clam-throw',{clamRelease:{kind:'power',pos:[0,1.15,0]}});a.setWeapon('shooter');
 assert.equal(a.character.s3ClamGripActive,false);
 w.dispose();a.character.dispose();assert.equal(a.character.s3ClamGripActive,false);
});

import {sourceLoadedActorFixture} from './source-loaded-actor-fixture.mjs';
test('real loaded Player00 owner preserves the clam release contact without replaying full pose or changing gameplay',async()=>{
 const f=await sourceLoadedActorFixture(),a=await f.make();for(let i=0;i<60;i++)f.tick(a);
 assert.equal(a.character.sourceMotion.status,'ready');
 const e=new f.RankedEngine('clams',stage),m=f.G.match={mode:'clams',state:'playing',ranked:e,actors:[a],playing:()=>true,rankedGains:[0,0],rankedEffects:{event(){}}};
 m.rankedWorld=new RankedWorld(f,m,stage);let solves=0,fullUpdates=0;
 const original=a.character._solveLimb,update=a.character.update;
 a.character._solveLimb=function(...args){if(args[0]===this.limbs.armL)solves++;return original.apply(this,args);};
 a.character.update=function(...args){fullUpdates++;return update.apply(this,args);};
 e.rule.state.inventories[String(a.nid)]={team:0,power:true,small:0};
 e.rule._throw({id:String(a.nid),team:0,alive:true,pos:a.pos.toArray()},{aim:[0,0,1]},{actors:[],floorAt:()=>0});
 const before=e.snapshot(),physical=JSON.stringify({pos:a.pos.toArray(),vel:a.vel.toArray(),ink:a.ink,hp:a.hp,special:a.special});
 const c=e.rule.state.clams.at(-1),target=new f.THREE.Vector3(...c.pos);target.y-=.255*1.2;
 f.Match.prototype.playRankedEvents.call(m,e.events.splice(0));
 assert.equal(solves,1);assert.equal(fullUpdates,0);same(e.snapshot(),before);
 assert.equal(JSON.stringify({pos:a.pos.toArray(),vel:a.vel.toArray(),ink:a.ink,hp:a.hp,special:a.special}),physical);
 const hand=a.character.bones.handL.getWorldPosition(new f.THREE.Vector3());assert.ok(hand.distanceTo(target)<.02);
 for(let i=0;i<20;i++){solves=0;f.tick(a);assert.ok(solves<=1,'No double left-arm evaluation with source owner');}
 m.rankedWorld.dispose();f.reset();
});

import {installWeaponHandoffMotion} from '../runtime/weapon-handoff-motion.mjs';
test('inactive clam adds only a boolean read to the existing fixed-argument final owner, with identical pose output',t=>{
 const token={},G={match:{mode:'turf'}},C={};let nativeCalls=0,checks=0;
 class Probe{
  constructor(){this.P=new Float32Array(4);this.kidForm=false;}
  _applyPose(dt,s){nativeCalls++;this.P[0]=dt;this.P[1]=s.aim;this.P[2]=s.weight;return token;}
  _solveLimb(){throw Error('Inactive pose attempted IK');}_kidXform(){}_owner(){return null;}
  getMuzzle(out){return out;}setWeapon(){}dispose(){}
 }
 installWeaponHandoffMotion({THREE,G,Character:Probe,CHARACTER_CHANNELS:C});
 assert.equal(Probe.prototype._applyPose.length,2,'Final owner does not allocate rest-argument arrays');
 const ch=new Probe();Object.defineProperty(ch,'s3ClamGripActive',{get(){checks++;return false;}});
 const samples=[],params={aim:.3,weight:.8};for(const mode of ['turf','clams','rainmaker']){
  G.match.mode=mode;const beforeCalls=nativeCalls,beforeChecks=checks,start=performance.now();
  for(let i=0;i<10000;i++)assert.equal(ch._applyPose(.016,params),token);
  samples.push({mode,updates:10000,ms:performance.now()-start});
  assert.equal(nativeCalls-beforeCalls,10000);assert.equal(checks-beforeChecks,10000);
  assert.deepEqual(Array.from(ch.P),Array.from(new Float32Array([.016,.3,.8,0])));
 }
 t.diagnostic(JSON.stringify({inactiveFinalOwner:samples}));
});
