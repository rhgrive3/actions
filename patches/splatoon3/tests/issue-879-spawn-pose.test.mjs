import test from 'node:test';
import assert from 'node:assert/strict';
import { production, rig, grip, gameplay } from './spawn-pose-fixture.mjs';
import { SPAWN_POSE_CALIBRATION, spawnPoseSnapshot as crossRealm, installSpawnPoseMotion } from '../runtime/spawn-pose-motion.mjs';
const kinds = Object.keys(SPAWN_POSE_CALIBRATION);
function launch(r, remote=false) { r.a.respawn(); r.a.remote=remote; r.a.grounded=r.a.ground.hit=false; }
function bothGrips(r) {
  const {THREE}=r.api, ch=r.ch;
  assert.ok(grip(r)<.035, `${ch.weaponKind}: right grip=${grip(r)}`);
  const left=ch.dual ? ch.weapon.left : ch.weapon;
  if (!ch.dual && ch.weaponKind==='slosher') {
    assert.equal(ch.P[r.api.CHARACTER_CHANNELS.IKL],ch.wTwo,'native one-hand bucket keeps its free arm, not forced onto an unused grip');
  } else if (left.def.handL) {
    if (!ch.dual) assert.ok(ch.P[r.api.CHARACTER_CHANNELS.IKL]>.99, 'native supporting-hand IK remains enabled');
    const anchor=left.off.localToWorld(left.def.handL.pos.clone());
    const distance=anchor.distanceTo(ch.bones.handL.getWorldPosition(new THREE.Vector3()));
    assert.ok(distance<.035, `${ch.weaponKind}: left grip=${distance}`);
  }
  assert.ok(Array.from(ch.P).every(Number.isFinite));
  assert.ok(Array.from(ch.skeleton.boneMatrices).every(Number.isFinite));
}
for (const kind of kinds) test(`#879 ${kind}: native respawn has class pose, attached grips and no gameplay edits`, async()=>{
  const api=await production(), r=rig(api,{kind}), baseline=rig(api,{kind});
  try {
    baseline.ch.s3SpawnPoseMotionEnabled=false;
    launch(r); launch(baseline);
    for(let n=0;n<SPAWN_POSE_CALIBRATION[kind].peakFrame;n++){r.visual();baseline.visual();bothGrips(r);}
    const s=api.spawnPoseSnapshot(r.ch);
    assert.equal(s?.family,kind); assert.equal(s?.phase,'flight'); assert.ok(s.weight>.999);
    assert.notDeepEqual(Array.from(r.ch.P),Array.from(baseline.ch.P),'not ordinary airborne carry');
    assert.notDeepEqual(drawnVertices(r),drawnVertices(baseline),'actual indexed skinned draw vertices change, not just metadata');
    assert.deepEqual(gameplay(r),gameplay(baseline),'pose leaves life, root, velocity, input and runner unchanged');
    assert.equal(r.ch.P[api.CHARACTER_CHANNELS.LTW],0,'no old three-point floor hand');
    assert.deepEqual({...crossRealm(r.ch)},{...s});
    r.a.grounded=true;r.a.vel.set(0,0,0);r.ch.trigger('land',.5);r.visual();
    assert.equal(api.spawnPoseSnapshot(r.ch).phase,'off');assert.equal(api.spawnPoseSnapshot(r.ch).weight,0);
    bothGrips(r);
  } finally{r.close();baseline.close();}
});
test('#879 all families have unique calibrated target curves and documented complete timelines',()=>{
 const curves=new Set(kinds.map(k=>JSON.stringify(SPAWN_POSE_CALIBRATION[k].values)));
 assert.equal(curves.size,kinds.length);
 for(const k of kinds){const p=SPAWN_POSE_CALIBRATION[k];assert.ok(p.peakFrame>0&&p.recoverFrame>p.peakFrame&&p.endFrame>p.recoverFrame&&p.endFrame<84);}
});
for(const remote of [false,true]) test(`#879 ${remote?'remote':'local'}: 30/60/120 Hz renders yield identical fixed phase boundaries`,async()=>{
 const api=await production(), traces=[];
 for(const hz of [30,60,120]){
  const r=rig(api,{kind:'dualies'}),clock=new api.FixedClock(),trace=[];
  try{launch(r,remote);for(let n=0;n<hz;n++)clock.advance(1/hz,dt=>{r.visual(dt);const s=api.spawnPoseSnapshot(r.ch);trace.push([s?.family,s?.phase,s?.age,s?.weight]);bothGrips(r);});traces.push(trace);}
  finally{r.close();}
 }
 assert.equal(traces[0].length,60);assert.deepEqual(traces[1],traces[0]);assert.deepEqual(traces[2],traces[0]);
 assert.equal(traces[0].at(-1)[1],'off');
});
test('#879 remote timestamped spawn trigger selects the same class as local and needs no new packet',async()=>{
 const api=await production(),local=rig(api,{kind:'roller'}),remote=rig(api,{kind:'roller'});
 try {
  launch(local);remote.a.remote=true;remote.a.grounded=false;remote.a.alive=true;
  remote.ch._netTrig=remote.ch.trigger.bind(remote.ch);
  const net=Object.create(api.NetMatch.prototype);net.byNid=new Map([['remote879',remote.a]]);
  api.NetMatch.prototype._play.call(net,'owner879',[0,'tr','remote879','spawn',null]);
  for(let n=0;n<40;n++){local.visual();remote.visual();assert.deepEqual({...api.spawnPoseSnapshot(remote.ch)},{...api.spawnPoseSnapshot(local.ch)});}
 }finally{local.close();remote.close();}
});
for(const event of ['land','death','special','superjump','weapon','hidden','reset','sub','shoot','squid'])test(`#879 ${event} cancels ownership and cannot revive until another spawn`,async()=>{
 const api=await production(),r=rig(api,{kind:'shooter'});
 try{launch(r);for(let i=0;i<8;i++)r.visual();assert.equal(api.spawnPoseSnapshot(r.ch)?.phase,'flight');
  if(event==='land')r.a.grounded=true;
  if(event==='death')r.a.alive=false;
  if(event==='special')r.a.specialActive={id:'storm',phase:'hold'};
  if(event==='superjump')r.a.superJumpState={phase:'charge'};
  if(event==='weapon')r.ch.setWeapon('roller');
  if(event==='hidden')r.ch.setVisible(false);
  if(event==='reset')r.a.reset();
  if(event==='sub')r.a.weaponRunner.aimingSub=true;
  if(event==='shoot')r.ch.trigger('shoot');
  if(event==='squid')r.a.form='squid';
  r.visual();assert.equal(api.spawnPoseSnapshot(r.ch).phase,'off');
  r.a.alive=true;r.a.grounded=false;r.a.form='kid';r.a.specialActive=null;r.a.superJumpState=null;r.a.weaponRunner.aimingSub=false;r.ch.setVisible(true);
  r.visual();assert.equal(api.spawnPoseSnapshot(r.ch).phase,'off');
 }finally{r.close();}
});
test('#879 spawn pose is independent from armor loss and installer is idempotent across realms',async()=>{
 const api=await production(),r=rig(api,{kind:'charger'});
 try{const before=[api.Character.prototype.trigger,api.Character.prototype._poseSpawn,api.Actor.prototype.reset];
  installSpawnPoseMotion(api);api.installSpawnPoseMotion(api);assert.deepEqual([api.Character.prototype.trigger,api.Character.prototype._poseSpawn,api.Actor.prototype.reset],before);
  launch(r);r.a.s3.spawnArmor=null;r.a.invuln=0;for(let n=0;n<8;n++)r.visual();assert.equal(api.spawnPoseSnapshot(r.ch).phase,'flight');
  const root=r.ch.root; r.close();assert.equal(api.spawnPoseSnapshot(r.ch),null);assert.ok(root);
 }finally{if(api.spawnPoseSnapshot(r.ch))r.close();}
});

function drawnVertices(r) {
 const rows=[],point=new r.api.THREE.Vector3();
 for(const mesh of r.ch.lodSets[r.ch.lod.tier].list){
  if(!mesh.visible||!mesh.isSkinnedMesh)continue;
  const index=mesh.geometry.index;assert.ok(index?.count>0);
  for(let i=0;i<index.count;i+=Math.max(1,Math.floor(index.count/48))){
   const n=index.getX(i);mesh.getVertexPosition(n,point).applyMatrix4(mesh.matrixWorld);
   assert.ok(point.toArray().every(Number.isFinite));rows.push(point.toArray());
  }
 }
 assert.ok(rows.length>0);return rows;
}
for(const kind of kinds)test(`#879 ${kind}: full class timeline keeps both grips and releases at its calibrated end`,async()=>{
 const api=await production(),r=rig(api,{kind});
 try{launch(r);const p=SPAWN_POSE_CALIBRATION[kind],phases=new Set();
  for(let f=1;f<=p.endFrame+2;f++){r.visual();bothGrips(r);drawnVertices(r);phases.add(api.spawnPoseSnapshot(r.ch).phase);}
  assert.deepEqual([...phases],['launch','flight','recovery','off']);
  assert.equal(api.spawnPoseSnapshot(r.ch).reason,'recovered');
 }finally{r.close();}
});
test('#879 ordinary air/jump never starts spawn and a new authoritative spawn can restart after landing',async()=>{
 const api=await production(),r=rig(api,{kind:'dualies'});
 try{r.a.grounded=false;r.ch.trigger('jump');for(let n=0;n<12;n++)r.visual();assert.equal(api.spawnPoseSnapshot(r.ch),null);
  launch(r);for(let n=0;n<5;n++)r.visual();assert.equal(api.spawnPoseSnapshot(r.ch).phase,'flight');
  r.ch.trigger('land');r.visual();assert.equal(api.spawnPoseSnapshot(r.ch).phase,'off');
  launch(r);r.visual();assert.equal(api.spawnPoseSnapshot(r.ch).phase,'launch');
 }finally{r.close();}
});
