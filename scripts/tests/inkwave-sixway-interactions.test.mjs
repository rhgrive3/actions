// One full production module graph and native Actor/Character/Physics sequence.
// Controlled dry floor and synthetic saturation are component boundaries, not
// real network/retail or a claim about natural weapon throughput.
import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoadedActorFixture} from '../../patches/splatoon3/tests/source-loaded-actor-fixture.mjs';
import {prepareSpawn,launchSpawn} from '../../patches/splatoon3/tests/respawn-spawn-owner-fixture.mjs';

test('spawn exclusion, native landing/reset, family cosmetics and Tri floor draw compose in one live registry',async()=>{
  const f=await sourceLoadedActorFixture({random:()=>.314159,extraExports:`
    export {spawnMotionAllowsAction,spawnPoseSnapshot} from './patches/splatoon3/runtime/spawn-pose-motion.mjs';
    export {weaponHandoffSnapshot} from './patches/splatoon3/runtime/weapon-handoff-motion.mjs';
  `});
  const {G,THREE,PLAYER}=f,a=await prepareSpawn(f),ch=a.character;
  G.level.spawnPads=[new THREE.Vector3(0,0,0),new THREE.Vector3(0,0,14)];G.level.spawnBarrier=4.2;
  G.camera=new THREE.PerspectiveCamera();G.camera.position.set(0,3,7);
  const radius=4.2+PLAYER.radius+.02;
  // The previously selected endpoint is now inside the exclusion volume.
  // Native supported-target validation must refuse that launch, then accept
  // a real clear endpoint; do not force an invalid flight to satisfy a test.
  a.intent.fire=false;f.tick(a);a.intent.fire=true;f.tick(a);
  assert.equal(a.s3.squidSpawn.phase,'aim','opposing exclusion invalidates the old landing target');
  a.intent.fire=false;a.aimPoint.set(0,0,7);f.tick(a);launchSpawn(f,a);
  a.intent.move.set(0,0,1);let frames=0,minDistance=Infinity;
  while(a.s3.squidSpawn&&frames++<300) {
    f.tick(a);const distance=Math.hypot(a.pos.x,a.pos.z-14);minDistance=Math.min(minDistance,distance);
    assert(distance>=radius-1e-6,'real launch/body finish stays outside opposing volume');
    if(a.s3.squidSpawn)assert.equal(f.spawnMotionAllowsAction(ch,true),false,'active lifecycle retains action ownership');
  }
  assert(frames<300&&a.grounded&&!a.s3.squidSpawn,'real supported touchdown completes');
  a.intent.move.set(0,0,0);assert(minDistance<radius+.2,'native steering reaches the exclusion boundary');
  f.tick(a);f.tick(a);const active=f.weaponHandoffSnapshot(ch);
  assert(active.weight>0&&active.weight<1,'display return actually active at reset boundary');
  a.reset();assert.equal(f.weaponHandoffSnapshot(ch),null,'new-life display retired before native return');
  a.setWeapon('shooter');a.intent.fire=false;for(let i=0;i<3;i++)f.tick(a);
  assert.equal(f.weaponHandoffSnapshot(ch)?.weight??0,0,'new weapon cannot inherit spawn display');

  // The actual composed draw contains both family cosmetics and the Tri path.
  const ps=G.projectiles,V=THREE.Vector3,matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),s=new V(),p=new V();
  assert(ps.shooterMuzzleDroplets,'firing adapter is registered after the UI/build chain');
  const splat=await f.make();splat.setWeapon('splatling');
  function add(owner,type,i,y=3) {
    const row=ps._new();Object.assign(row,{type,wid:owner.weapon.id,owner,team:0,age:.1,delay:0,size:.12,vis:.086,seed:.37,life:3,straight:1,grav:0,drag:0,tail0:1,tailK:0,wob:0,sats:0});
    row.start.set(0,y,0);row.pos.set(0,y,1+i*.0001);row.vel.set(0,0,20);ps._push(row);
  }
  ps.clear();G.time=1/60;for(let i=0;i<32;i++)add(splat,'shot',i,5);for(let i=0;i<660;i++)add(a,'blast',i);
  ps._s3SplashDrops=Array.from({length:48},(_,i)=>({owner:a,pos:new V(i*.05,4,2),vel:new V(0,-1,0),radius:.1,seed:i/48,frames:2}));
  const native=JSON.stringify(ps.list.map(r=>[r.pos.toArray(),r.vel.toArray(),r.age,r.life,r.seed]));ps._draw();
  assert.equal(JSON.stringify(ps.list.map(r=>[r.pos.toArray(),r.vel.toArray(),r.age,r.life,r.seed])),native);
  let oldDrops=0;for(let i=0;i<ps.blobs.count;i++){ps.blobs.getMatrixAt(i,matrix);if(Math.abs(matrix.elements[13]-4)<1e-6&&Math.abs(matrix.elements[14]-2)<1e-6)oldDrops++;}
  assert.equal(ps.blobs.count,700);assert.equal(oldDrops,40,'existing late drops keep priority after landing/weapon changes');
  assert.equal(ps.shooterMuzzleDroplets.drawn,0);

  ps.clear();const drop={owner:a,pos:new V(1,2,3),vel:new V(0,-6,0),dirX:0,dirZ:1,radius:.94,drawRadius:.2,sourceActor:'WeaponSlosherDiffusion',frames:4,seed:.23};
  const snapshot=d=>JSON.stringify(d,(key,value)=>key==='owner'?'bound-owner':value);
  ps._s3SplashDrops=[drop];const before=snapshot(drop);ps._draw();assert.equal(ps.blobs.count,1);
  ps.blobs.getMatrixAt(0,matrix);matrix.decompose(p,q,s);
  assert(Math.abs(s.x-.1)<1e-7,'retains expressly provisional .5 Tri visual calibration');
  assert(new V(0,0,1).applyQuaternion(q).z>.999999,'captured heading survives family-pool reuse');
  assert.equal(drop.owner,a);assert.equal(snapshot(drop),before,'draw changes no authoritative drop state');
  assert.equal(a.ink,100);assert.equal(a.stats.turf,0);
  console.log(JSON.stringify({mode:process.env.INKWAVE_BUILT_SITE?'emitted':'source',frames,minDistance,radius,activeWeight:active.weight,oldDrops,triWidth:s.x,ink:a.ink,turf:a.stats.turf}));
  f.reset();
});
