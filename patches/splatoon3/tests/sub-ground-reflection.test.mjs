import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './source-fixture.mjs';
import { makePaintWorld } from './paint-authority-fixture.mjs';
import { ALL_SUB_SPECS } from '../runtime/all-subs.mjs';

// S3 11.3.0 GP0. Explicit Ground/WallReflectAngleRate and BoundRate fields,
// with Wiki confirmation that slopes send the dart almost along the plane:
// https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/ラインマーカー#i393784f
const STEP=1/60;
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('Angle Shooter distinguishes extracted ground and wall rebound coefficients',()=>{
  const raw=JSON.parse(fs.readFileSync(new URL('./fixtures/source-1130/weapon/WeaponLineMarker.game__GameParameterTable.json',import.meta.url))).GameParameters.MoveParam;
  for(const [runtime,source] of [['reboundGroundAngleRate','ReboundGroundReflectAngleRate'],['reboundWallAngleRate','ReboundWallReflectAngleRate'],
    ['reboundGroundSpeedRate','ReboundGroundBoundRate'],['reboundWallSpeedRate','ReboundWallBoundRate']])
    assert.equal(ALL_SUB_SPECS.angleShooter[runtime],raw[source]);
});

for(const hz of [30,60,120])for(const pitch of [0,.35,Math.PI/2])for(const ghost of hz===60?[false,true]:[false])test(`Angle Shooter real plane reflection ${pitch} at ${hz} Hz, ghost=${ghost}`,async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  const {level}=makePaintWorld(f),V=(x,y,z)=>new f.THREE.Vector3(x,y,z);
  const normal=V(0,Math.cos(pitch),-Math.sin(pitch)),tangent=V(0,Math.sin(pitch),Math.cos(pitch)),origin=V(0,0,30);
  const block=level.blocks[0];block.center.copy(origin).addScaledVector(normal,-1);block.half.set(30,1,30);
  block.axes=[V(1,0,0),normal.clone(),tangent.clone()];block.aabbMin.set(-40,-40,-10);block.aabbMax.set(40,40,70);
  const owner=f.make();owner.pos.set(50,0,50);owner.weapon={...owner.weapon,sub:'angleShooter'};
  let marker;
  if(ghost){
    Object.assign(owner,{nid:1,netLife:0,remote:true});
    assert.equal(f.installedRuntime.replaySub({v:1,phase:'spawn',subId:'angleShooter',seq:1,eventSeq:1,life:0,sourceLife:0,
      x:0,y:1,z:30,vx:0,vy:0,vz:0,seed:42,charge:0,hold:0,actor:owner}),true);
    marker=f.G.projectiles._s3SubObjects[0];assert.equal(marker.ghost,true);
  }else marker=f.G.projectiles.throwBomb(owner);
  let paint=0,events=0;const splat=f.G.paint.splat.bind(f.G.paint);
  f.G.paint.splat=(...args)=>{paint++;return splat(...args);};f.on('all:sub',()=>events++);
  marker.pos.copy(origin).addScaledVector(normal,.5);marker.prev.copy(marker.pos);
  marker.vel.copy(tangent).multiplyScalar(120).addScaledVector(normal,-120);
  const speed=marker.vel.length(),angle=Math.PI/4*(normal.y>.5?.1:1);
  for(let i=0;i<Math.ceil(hz/60);i++){f.G.time+=1/hz;f.G.projectiles.update(1/hz);}
  assert.equal(marker.bounceCount,1,'the real OBB segment collision owns the rebound');
  const outgoingNormal=marker.vel.dot(normal),along=marker.vel.clone().addScaledVector(normal,-outgoingNormal).length();
  near(Math.atan2(outgoingNormal,along),angle);near(marker.vel.length(),speed);
  assert.ok(marker.lineSegments.length>0,'the contacted flight still contributes a residual sensor line');
  const line=marker.lineMesh;
  for(let i=0;i<hz*2;i++){f.G.time+=1/hz;f.G.projectiles.update(1/hz);}
  assert.equal(marker.dead,true);assert.equal(line.parent,null,'ordinary tail expiry frees the reflected line');
  if(ghost){assert.equal(paint,0);assert.equal(events,0,'a reflected replica cannot paint or emit an owned consequence');}
  f.G.projectiles.clear();assert.equal(f.G.projectiles._s3SubObjects.length,0);
});
