import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {makePaintWorld} from './paint-authority-fixture.mjs';
import {INK_LOOK} from '../runtime/weapons-fidelity.mjs';
import {ALTERNATE_WEAPON_KITS} from '../runtime/alternate-weapon-kits-data.mjs';

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
    assert.ok(Math.abs(scale.x-drawRadius*.5*1.5)<1e-7,'Hissen floor bead uses the 1.5x display calibration over the shared Bucket width');
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

test('all three Hissen kits reuse the existing non-spherical Slosher shader profile without new resources or RNG',async()=>{
  let randomCalls=0;
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
    vmMathRandom:()=>((++randomCalls*73)%997)/997});
  const {G,THREE}=f,system=G.projectiles;
  const kits=['s3-slosher-diffusion',...ALTERNATE_WEAPON_KITS.filter(k=>k.baseId==='s3-slosher-diffusion').map(k=>k.id)];
  assert.equal(kits.length,3,'base, Nouveau and Ash kits share their source actor');
  const mesh=system.blobs,geometry=mesh.geometry,material=mesh.material;
  const buffers=[mesh.instanceMatrix,mesh.instanceColor,system.blobShape,system.blobInkLook,system.blobFourPetals];
  assert.equal(geometry.index.count/3,1360,'same existing 40-by-18 analytic blob topology');
  const shader={vertexShader:'#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>',fragmentShader:'#include <clipping_planes_fragment>\n#include <emissivemap_fragment>'};
  material.onBeforeCompile(shader);
  assert.match(shader.vertexShader,/aInkLook\.z - 1\.0/,'existing shader consumes vertical thinness');
  assert.match(shader.vertexShader,/aInkLook\.x \* iwS/,'existing shader consumes the ragged ink rim');
  assert.equal(material.customProgramCacheKey(),'iw-blob-5-ink-look','no new shader variant');
  const matrix=new THREE.Matrix4();
  for(const id of kits){
    const owner=f.make(id);
    assert.equal(owner.weapon.catalogRecord.sourceActor,'WeaponSlosherDiffusion');
    for(const radius of [.2,.3])for(const frames of [0,1,4,12]){
      const drop={owner,pos:new THREE.Vector3(1,2,3),vel:new THREE.Vector3(0,-frames*.96,0),
        dirX:.6,dirZ:.8,radius:.94,drawRadius:radius,sourceActor:owner.weapon.catalogRecord.sourceActor,frames,seed:.23};
      const state=()=>JSON.stringify({...drop,owner:{id:owner.id,ink:owner.ink,pos:owner.pos.toArray(),vel:owner.vel.toArray(),weapon:owner.weapon.id,color:owner.color.toArray()}});
      system._s3SplashDrops=[drop];const before=state(),calls=randomCalls;
      system._draw();assert.equal(mesh.count,1,'one physical child remains one visible-flag/count-admitted instance');
      assert.equal(mesh.visible,true);assert.equal(randomCalls,calls,'drawing consumes no random sample');
      assert.equal(state(),before,'physical/source state and actor ink/transform/weapon/color are read-only');assert.equal(drop.owner,owner);
      mesh.getMatrixAt(0,matrix);
      const position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();matrix.decompose(position,rotation,scale);
      assert.ok(position.distanceTo(drop.pos)<1e-6);for(const axis of ['x','y','z'])assert.ok(Math.abs(scale[axis]-radius*.5*1.5)<1e-7,'Hissen instance uses 1.5x display calibration while the source radius remains unchanged');
      assert.ok(new THREE.Vector3(0,0,1).applyQuaternion(rotation).dot(new THREE.Vector3(.6,0,.8))>.999999,'same horizontal paint heading');
      assert.deepEqual(Array.from(system.blobInkLook.array.slice(0,3)).map(v=>+v.toFixed(6)),INK_LOOK.slosh.slice(0,3));
      assert.ok(Math.abs(system.blobShape.array[0]-(1.05+Math.min(.6,drop.vel.length()*.006)))<1e-6,'short tail remains unchanged');
      assert.deepEqual(Array.from(system.blobFourPetals.array.slice(0,2)),[0,0],'no added petals or satellites');
    }
  }
  assert.equal(system.blobs,mesh);assert.equal(mesh.geometry,geometry);assert.equal(mesh.material,material);
  assert.deepEqual([mesh.instanceMatrix,mesh.instanceColor,system.blobShape,system.blobInkLook,system.blobFourPetals],buffers,'fixed buffers are reused');
});

test('only Hissen floor-child profile changes; other actors retain their bead or strand and the existing culls/caps',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true}),{G,THREE}=f,system=G.projectiles;
  const drop=actor=>({owner:{color:new THREE.Color('#f80')},pos:new THREE.Vector3(1,2,3),vel:new THREE.Vector3(0,-6,0),
    dirX:1,dirZ:0,radius:.94,drawRadius:.3,sourceActor:actor,frames:4,seed:.23});
  for(const actor of [undefined,'WeaponSlosherDouble','WeaponSlosherLauncher','WeaponSlosherStrong','WeaponSlosherWashtub','WeaponSlosherBathtub']){
    system._s3SplashDrops=[drop(actor)];system._draw();assert.equal(system.blobs.count,1);
    assert.deepEqual(Array.from(system.blobInkLook.array.slice(0,3)).map(v=>+v.toFixed(6)),INK_LOOK.droplet.slice(0,3),String(actor)+' unchanged bead profile');
    assert.ok(Math.abs(system.blobShape.array[0]-(actor==='WeaponSlosherLauncher'?2.4:1.086))<1e-6,'unrelated tail unchanged');
  }
  system._s3SplashDrops=Array.from({length:100},()=>drop('WeaponSlosherDiffusion'));system._draw();assert.equal(system.blobs.count,48,'same per-pass cap');
  G.camera={position:new THREE.Vector3(100,100,100)};system._draw();assert.equal(system.blobs.count,0,'same 30-unit camera cull');
  G.camera=null;system._s3SplashDrops=[drop('WeaponSlosherDiffusion')];system._s3SplashDrops[0].owner.remote=true;system._draw();assert.equal(system.blobs.count,0,'same remote-owner rejection');
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
