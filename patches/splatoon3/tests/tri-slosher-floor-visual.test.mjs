import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {makePaintWorld} from './paint-authority-fixture.mjs';

// Test the actual production-composed renderer, not a duplicate size helper.
// The source/built fixture switches run exactly the same assertions.
test('Tri-Slosher floor drops use the Bucket visual scale and captured paint heading, without changing physical drops',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  const {G,THREE}=f,system=G.projectiles;
  const color=new THREE.Color('#f80'),matrix=new THREE.Matrix4(),position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();
  for(const drawRadius of [.2,.3])for(const [x,z] of [[0,1],[1,0],[-.6,.8]])for(const down of [0,-.96,-6.33]){
    const d={owner:{color,remote:false},pos:new THREE.Vector3(1,2,3),vel:new THREE.Vector3(0,down,0),
      dirX:x,dirZ:z,radius:.94,drawRadius,sourceActor:'WeaponSlosherDiffusion',frames:4,seed:.23};
    system._s3SplashDrops=[d];
    const before=JSON.stringify(d);let paintCalls=0;G.paint.splat=()=>{paintCalls++;return 1;};
    system._draw();assert.equal(system.blobs.count,1,'one existing drop remains one instance');
    system.blobs.getMatrixAt(0,matrix);matrix.decompose(position,rotation,scale);
    assert.ok(Math.abs(scale.x-drawRadius*.5)<1e-7,'floor bead must use the same calibrated half width as the shared Bucket sheet');
    assert.ok(position.distanceTo(d.pos)<1e-6,'draw stays at the actual physical drop');
    const forward=new THREE.Vector3(0,0,1).applyQuaternion(rotation);
    assert.ok(forward.dot(new THREE.Vector3(x,0,z))>.999999,'floor bead follows captured forward heading, not its vertical fall velocity');
    assert.equal(JSON.stringify(d),before,'no authoritative position, velocity, radius, frame, seed or owner changes');
    assert.equal(paintCalls,0,'drawing never paints');
  }
  for(const actor of ['WeaponSlosherDouble','WeaponSlosherLauncher',undefined]){
    const d={owner:{color},pos:new THREE.Vector3(1,2,3),vel:new THREE.Vector3(0,-6,0),dirX:1,dirZ:0,
      drawRadius:.2,radius:.94,sourceActor:actor};system._s3SplashDrops=[d];system._draw();
    system.blobs.getMatrixAt(0,matrix);matrix.decompose(position,rotation,scale);
    assert.ok(Math.abs(scale.x-(actor==='WeaponSlosherLauncher' ? .08 : actor==='WeaponSlosherDouble' ? .1 : .2))<1e-7,
      'Dread Wringer shares the main sheet scale; unrelated weapons retain their size');
    assert.ok(new THREE.Vector3(0,0,1).applyQuaternion(rotation).y<-.99999,'other weapons retain their direction');
  }
});

test('Tri-Slosher floor bead never rotates into a vertical launch when gravity first acts',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true}),{THREE,G}=f;
  G.projectiles._s3SplashDrops=[{owner:{color:new THREE.Color('#f80')},pos:new THREE.Vector3(0,2,0),
    vel:new THREE.Vector3(0,-.96,0),dirX:1,dirZ:0,drawRadius:.3,sourceActor:'WeaponSlosherDiffusion'}];
  G.projectiles._draw();const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();
  G.projectiles.blobs.getMatrixAt(0,matrix);matrix.decompose(position,rotation,scale);
  const direction=new THREE.Vector3(0,0,1).applyQuaternion(rotation);
  assert.ok(direction.x>.999999&&Math.abs(direction.y)<1e-6,'first gravity tick keeps the original forward heading');
});

async function volley(hz,draw){
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,vmMathRandom:()=>.5});
  const {paint}=makePaintWorld(f),{G}=f,a=f.make('s3-slosher-diffusion');
  a.form='kid';a.ink=100;a.pos.set(0,0,0);a.aimPitch=0;a.aimDir.set(0,0,1);a.aimPoint.set(0,1.05,60);
  a.intent.fire=true;
  for(let frame=0;frame<30&&!G.projectiles.list.length;frame++)f.tick(a);
  a.intent.fire=false;assert.equal(G.projectiles.list.length,9,'real runner emits the native Tri-Slosher volley');const ink=a.ink;
  if(!draw)G.projectiles._draw=()=>{};
  const trace=[];let peak=0;
  for(let i=0;i<hz;i++){
    G.time+=1/hz;G.projectiles.update(1/hz);
    peak=Math.max(peak,G.projectiles._s3SplashDrops?.length||0);
    if((i+1)%(hz/30)===0)trace.push({main:Array.from(G.projectiles.list,p=>[p.age,...p.pos.toArray(),...p.vel.toArray(),p.damage,p.radius,p.catalog?.dropCount]),
      drops:Array.from(G.projectiles._s3SplashDrops||[],d=>[d.frames,...d.pos.toArray(),...d.vel.toArray(),d.radius,d.seed]),cells:paint.counts[0]});
  }
  return {ink,trace,peak,grid:Array.from(paint.grid),landings:JSON.parse(JSON.stringify(G.projectiles._s3SplashLandings))};
}
test('real Tri-Slosher firing and CPU floor paint are identical with/without drawing and at 30/60/120Hz',async()=>{
  const oracle=await volley(60,false);
  assert.ok(oracle.peak>0&&oracle.landings.length>0,'actual delayed floor drops land and paint');
  assert.ok(oracle.ink<100,'actual firing consumes ink');
  for(const hz of [30,60,120])assert.deepEqual(await volley(hz,true),oracle,'drawing at '+hz+'Hz preserves trajectory, damage, coverage, source frames and count');
});
