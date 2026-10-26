import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

// Native, fully composed camera/Actor/Character/Level/Physics and ink predictor.
// These are CPU cache/collision invariants, not Nintendo HUD or GPU evidence.
let compiled;
async function scene(pitch=0) {
  const f=await (compiled ||= fixture({productionComposition:true,includeCharacter:true,fullRuntime:true,
    extraExports:`export { computeShotGuide } from './patches/splatoon3/runtime/weapons-fidelity.mjs';
      export { NativeLevel, NativePhysics } from './patches/native-stages/runtime/engine.mjs';
      export { RankedWorld } from './patches/splatoon3/runtime/ranked/world.mjs';`}));
  const {G,THREE}=f;
  G.scene=new THREE.Scene();G.boss=null;G.netm=null;
  G.audio={play(){},playWeapon(){},loop(){return{set(){},stop(){}};}};G.fx={muzzle(){},burst(){}};
  G.level=new f.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-80,0,0],[80,0,0]],spawnBarrier:0,
    single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}],half:[]});
  G.physics=new f.Physics(G.level);G.projectiles=new f.Projectiles(G.scene);G.paint={sample:()=>1,splat:()=>0};
  const a=new f.Actor({team:0,name:'Shooter guide cache',weapon:'shooter',CharacterClass:f.Character});
  a.pos.set(0,0,0);a.yaw=a.aimYaw=0;a.aimPitch=pitch;a.form='kid';a.grounded=true;a.vel.set(0,0,0);
  a.aimDir.set(0,Math.sin(pitch),Math.cos(pitch));G.actors=[a];
  const cam=G.camera=new THREE.PerspectiveCamera(60,16/9,.1,400);
  cam.position.set(-.28,2-4.5*Math.sin(pitch),-4.5*Math.cos(pitch));cam.lookAt(cam.position.clone().add(a.aimDir));cam.updateMatrixWorld(true);
  G.rig={gameCam:cam};
  const controller=new f.PlayerController(a,null,null);G.match={controller,playing:()=>true,canRespawn:()=>false};
  for(let i=0;i<45;i++)a.character.update(1/60,{form:'kid',grounded:true,firing:false,charge:0,aimPitch:pitch,speed:0,localMove:{x:0,z:0},ink:1,hp:1,vy:0});
  a.character.wAim=1;a.character.root.updateMatrixWorld(true);
  let sweeps=0;const world=G.projectiles.inkFlight.world;
  G.projectiles.inkFlight.world=function(...args){sweeps++;return world.apply(this,args);};
  return {f,G,a,cam,controller,ps:G.projectiles,sweeps:()=>sweeps};
}
const point=s=>({x:s.x,y:s.y,z:s.z,frames:s.frames});

test('Shooter repeated horizontal/downward computeAim reuses its verified-world guide at 30/60/120Hz',async()=>{
  const rows=[];
  for(const pitch of [0,-.8])for(const hz of [30,60,120]){
    const s=await scene(pitch),{G,controller,ps}=s;
    controller.computeAim();const initial=point(controller.shotGuide),before=s.sweeps(),scratch=s.f.installedRuntime._shotGuide;
    assert.ok(scratch?.probe);
    for(let i=0;i<120;i++){G.time+=1/hz;controller.computeAim();assert.deepEqual(point(controller.shotGuide),initial);}
    const extra=s.sweeps()-before;
    rows.push({pitch,hz,initial:before,repeated120:extra});
    assert.equal(s.f.installedRuntime._shotGuide,scratch,'native integration scratch is retained');
    assert.equal(ps.list.length,0,'prediction never creates a live shot');
  }
  console.log('Shooter guide sweep counts',JSON.stringify(rows));
  assert.ok(rows.every(r=>r.repeated120===0),'unchanged launch and verified collision world must not replay sphere sweeps: '+JSON.stringify(rows));
});

test('Shooter cache observes launch, owner, weapon/mode, camera and collision-query identities immediately',async()=>{
  const s=await scene(),{a,G,ps,cam,f}=s;
  s.controller.computeAim();
  const changes=[
    ()=>{a.vel.z=4;},()=>{a.yaw=.1;},()=>{a.aimPoint.x+=1;},()=>{a.aimDir.y+=.01;},
    ()=>{a.character.root.position.y+=.1;a.character.root.updateMatrixWorld(true);},
    ()=>{a.weapon={...a.weapon,range:a.weapon.range+.2};},()=>{a.weaponRunner.s3Turret=true;},
    ()=>{cam.position.x+=.1;cam.updateMatrixWorld(true);},()=>{cam.fov+=1;cam.updateProjectionMatrix();},
    ()=>{G.rig.gameCam=cam.clone();G.rig.gameCam.updateMatrixWorld(true);},
    ()=>{G.level.triangleWorld={sweepSphere(){}};},
    ()=>{const q=G.level.queryBlocks;G.level.queryBlocks=function(...args){return q.apply(this,args);};},
    ()=>{const ray=G.physics.raycast;G.physics.raycast=function(...args){return ray.apply(this,args);};},
    ()=>{const muzzle=ps._muzzle;ps._muzzle=function(...args){return muzzle.apply(this,args);};},
  ];
  for(const change of changes){
    f.computeShotGuide(a);const before=s.sweeps();change();const got=point(f.computeShotGuide(a));
    assert.ok(s.sweeps()>before,'changed source input must replay the guide');
    ps._s3ShooterGuideCache.ready=false;
    assert.deepEqual(point(f.computeShotGuide(a)),got,'cached result equals a fresh native prediction');
  }
  const first=point(f.computeShotGuide(a));
  const other=new f.Actor({team:0,name:'second owner',weapon:'shooter',CharacterClass:f.Character});
  other.pos.copy(a.pos);other.aimDir.copy(a.aimDir);other.aimPoint.copy(a.aimPoint);other.vel.set(0,0,0);other.yaw=0;other.aimPitch=0;other.form='kid';
  f.computeShotGuide(other);
  assert.deepEqual(point(f.computeShotGuide(a)),first,'another controller cannot replace the first actor\'s world result');
});

test('unverified custom collision worlds recompute and immediately observe unversioned obstacle edits',async()=>{
  const s=await scene(-.8),{G,f,a,ps}=s,level=G.level;
  // Deliberately not a registered native Level producer. No invented revision.
  G.level={blocks:level.blocks,faces:level.faces,queryBlocks:level.queryBlocks.bind(level)};
  G.physics=new f.Physics(G.level);s.controller.computeAim();
  const first=point(f.computeShotGuide(a)),before=s.sweeps();
  for(let i=0;i<20;i++)f.computeShotGuide(a);
  assert.ok(s.sweeps()>before,'unsupported worlds do not acquire an idle cache hit');
  ps.s3ShooterImpact(a,a.weapon);ps.muzzleBlockFeedback(a);
  const beforeImpact=s.sweeps();ps.s3ShooterImpact(a,a.weapon);
  assert.ok(s.sweeps()>beforeImpact,'unverified full-flight predictions are recomputed');
  const beforeMarker=s.sweeps();ps.muzzleBlockFeedback(a);
  assert.ok(s.sweeps()>beforeMarker,'unverified marker predictions are recomputed');
  const floor=level.blocks[0];floor.center.y-=2;floor.aabbMin.y-=2;floor.aabbMax.y-=2;
  const changed=point(f.computeShotGuide(a));
  assert.ok(changed.y<first.y-1,'same-array floor movement cannot remain hidden behind a cache');
  assert.ok(Math.abs(ps.s3ShooterImpact(a,a.weapon).point.y+2)<1e-8);
  assert.ok(Math.abs(ps.muzzleBlockFeedback(a).point.y+2)<1e-8,'marker follows the unversioned floor immediately');
});

test('Shooter guide reuse does not cache target flags or retain retired owner/world references',async()=>{
  const s=await scene(),{f,G,a,cam,ps,controller}=s;
  cam.lookAt(0,1,5);cam.updateMatrixWorld(true);
  const target=f.make('shooter');target.team=1;target.pos.set(0,0,5);target.anim.form='kid';
  controller.computeAim();assert.equal(controller.onTarget,target);
  target.pos.x=8;controller.computeAim();assert.equal(controller.onTarget,null,'camera target selection still runs before guide reuse');
  const expected=point(controller.shotGuide),cache=ps._s3ShooterGuideCache,scratch=f.installedRuntime._shotGuide;
  assert.ok(cache?.ready);assert.ok(cache.values.includes(a));
  ps.clear();assert.equal(cache.ready,false);assert.equal(cache.values.length,0);
  assert.equal(scratch.probe.owner,null,'existing guide scratch releases its Actor');
  controller.computeAim();assert.deepEqual(point(controller.shotGuide),expected);
  assert.equal(ps._s3ShooterGuideCache,cache,'cache storage is reused after clear');
  assert.equal(f.installedRuntime._shotGuide,scratch,'guide scratch storage is reused after clear');
});

test('real append/rebuild, notified solid changes and Tower movement/removal invalidate a stationary guide',async()=>{
  const s=await scene(),{f,G,a,ps}=s,level=G.level;
  s.controller.computeAim();const open=point(f.computeShotGuide(a));
  level._addBlock({kind:'box',min:[-1,0,4],max:[1,3,4.3]});level._buildHash();
  const wall=point(f.computeShotGuide(a));assert.ok(wall.z<open.z-2,'real appended cover clips the guide');
  const block=level.blocks.at(-1);block.solid=false;level.markCollisionChanged();
  assert.deepEqual(point(f.computeShotGuide(a)),open,'notified solid-disable restores the original trajectory');

  G.paint=null;
  const world=new f.RankedWorld({G,THREE:f.THREE,Hit:f.Hit},{mode:'tower',actors:[]},
    {id:'guide-cache-tower',tower:{path:[[-10,2,0],[0,2,0],[0,2,10],[0,2,0],[10,2,0]],centerIndex:1,halfSize:1.4}});
  const origin=world.towerPoleBlock.center.clone().add(new f.THREE.Vector3(0,0,-4));
  const delta=origin.clone().sub(ps._muzzle(a,new f.THREE.Vector3()));
  a.pos.add(delta);a.character.root.position.add(delta);a.character.root.updateMatrixWorld(true);
  a.aimDir.set(0,0,1);a.aimPoint.copy(origin).add(new f.THREE.Vector3(0,0,70));
  const tower=point(f.computeShotGuide(a)),revision=level.collisionRevision;
  const impactBefore=ps.s3ShooterImpact(a,a.weapon).point.clone(),markerBefore=ps.muzzleBlockFeedback(a).point.clone();
  const before=s.sweeps();
  world.beforeActors({rule:{state:{progress:world._towerProgress}}});
  assert.equal(level.collisionRevision,revision,'unchanged actual Tower transform does not advance its revision');
  f.computeShotGuide(a);assert.equal(s.sweeps(),before,'no-op Tower update does not replay a stationary guide');
  world.beforeActors({rule:{state:{progress:.1}}});
  const moved=point(f.computeShotGuide(a));assert.notDeepEqual(moved,tower,'real in-place Tower motion is visible immediately');
  const impactMoved=ps.s3ShooterImpact(a,a.weapon).point.clone(),markerMoved=ps.muzzleBlockFeedback(a).point.clone();
  ps._s3ShooterImpactCache.valid=false;
  const uncached=ps.s3ShooterImpact(a,a.weapon).point.clone();
  console.log('Tower first-field cache agreement',JSON.stringify({beforeRevision:revision,movedRevision:level.collisionRevision,
    impactBefore:impactBefore.toArray(),markerBefore:markerBefore.toArray(),impactMoved:impactMoved.toArray(),markerMoved:markerMoved.toArray(),uncached:uncached.toArray()}));
  assert.ok(impactBefore.distanceTo(uncached)>1,'actual Tower movement changes the full-flight first field contact');
  assert.ok(impactMoved.distanceTo(uncached)<1e-8,'full-flight prediction observes the actual collision revision immediately');
  assert.ok(markerMoved.distanceTo(uncached)<1e-8,'outer marker cache cannot mask a changed first field contact');
  ps._s3ShooterGuideCache.ready=false;assert.deepEqual(point(f.computeShotGuide(a)),moved);
  const beforeDispose=s.sweeps();world.dispose();const removed=point(f.computeShotGuide(a));
  assert.ok(s.sweeps()>beforeDispose,'real Tower removal invalidates even with unchanged block arrays');
  ps._s3ShooterGuideCache.ready=false;assert.deepEqual(point(f.computeShotGuide(a)),removed);
});

function nativeFloor(f,y=0) {
  return new f.NativeLevel({
    manifest:{id:'guide-cache-native',bounds:{minX:-30,maxX:30,minZ:-30,maxZ:30},spawnPads:[[-20,0,0],[20,0,0]],spawnBarrier:0,objects:[],faces:[]},
    triangles:new Float32Array([-30,y,-30,0,y,30,30,y,-30]),normals:new Float32Array([0,1,0]),
    flags:new Uint32Array([3]),objectIds:new Uint32Array([0]),nodes:new Float32Array([-30,y,-30,30,y,30,-1,1]),
    order:new Uint32Array([0]),triangleFace:new Int32Array([-1]),mask:new Uint8Array(),
  });
}
test('actual native triangleWorld replacement invalidates without relying on block-table or revision changes',async()=>{
  const s=await scene(-.8),{f,G,a,ps}=s;
  G.level=nativeFloor(f);G.physics=new f.NativePhysics(G.level);s.controller.computeAim();
  const first=point(f.computeShotGuide(a)),revision=G.level.collisionRevision;
  assert.ok(Math.abs(ps.s3ShooterImpact(a,a.weapon).point.y)<1e-8);
  assert.ok(Math.abs(ps.muzzleBlockFeedback(a).point.y)<1e-8);
  const before=s.sweeps();
  for(let i=0;i<120;i++)f.computeShotGuide(a);
  assert.equal(s.sweeps(),before,'unchanged native source triangles reuse the guide');
  G.level.triangleWorld=nativeFloor(f,.35).triangleWorld;
  assert.equal(G.level.collisionRevision,revision,'identity check covers a source-world replacement independently');
  const changed=point(f.computeShotGuide(a));assert.ok(s.sweeps()>before);
  assert.ok(Math.abs(first.y)<1e-8&&Math.abs(changed.y-.35)<1e-6,'guide follows the new real triangle surface');
  assert.ok(Math.abs(ps.s3ShooterImpact(a,a.weapon).point.y-.35)<1e-6,'full-flight prediction follows the new source triangles');
  assert.ok(Math.abs(ps.muzzleBlockFeedback(a).point.y-.35)<1e-6,'marker follows the new source triangles');
});

test('full-flight and marker caches invalidate on actual owner and query-function replacement',async()=>{
  const s=await scene(),{f,G,a,ps}=s;s.controller.computeAim();
  const nativeImpact=ps.s3ShooterImpact;let calls=0;
  ps.s3ShooterImpact=function(...args){calls++;return nativeImpact.apply(this,args);};
  const changes=[()=>{a.character=Object.create(a.character);},()=>{a.weaponRunner=Object.create(a.weaponRunner);},
    ()=>{const q=G.level.queryBlocks;G.level.queryBlocks=function(...args){return q.apply(this,args);};},
    ()=>{const q=ps.inkFlight.world;ps.inkFlight.world=function(...args){return q.apply(this,args);};},
    ()=>{const q=ps._nominalInkGuide;ps._nominalInkGuide=function(...args){return q.apply(this,args);};},
    ()=>{G.physics=new f.Physics(G.level);}];
  for(const change of changes){
    ps.s3ShooterImpact(a,a.weapon);ps.muzzleBlockFeedback(a);change();
    const before=s.sweeps(),impact=ps.s3ShooterImpact(a,a.weapon).point.clone();
    assert.ok(s.sweeps()>before,'owner/query replacement replays the native full-flight solver');
    const beforeMarker=calls,marker=ps.muzzleBlockFeedback(a).point.clone();
    assert.equal(calls,beforeMarker+1,'outer marker cache forwards the changed source owner');
    assert.ok(marker.distanceTo(impact)<1e-8,'marker still copies the exact same field contact');
  }
});
