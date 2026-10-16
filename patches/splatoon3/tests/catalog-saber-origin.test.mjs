import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

async function setup(id='s3-saber-lite') {
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
    extraExports:"export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"});
  f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);
  f.G.physics.level=null;
  f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  f.G.physics.raycast=(_a,_b,_d,h)=>{h.hit=false;return h;};
  const a=f.make(id);a.form='kid';a.pos.set(7,4,-3);
  a.aimDir.set(1,0,0);a.aimPoint.copy(a.pos).addScaledVector(a.aimDir,100);
  return {f,a};
}
function input(a,fire,frames=1) {
  for(let i=0;i<frames;i++)a.weaponRunner.update(1/60,{fire,firePressed:fire&&i===0});
}
function tap(a){input(a,true);input(a,false,40);}
function near(v,w){assert.ok(v.distanceTo(w)<1e-8,`${v.toArray()} != ${w.toArray()}`);}

for(const id of ['s3-saber-lite','s3-saber-normal','s3-saber-heavy'])test(id+' horizontal wave uses the source offset at the rotated feet origin, and records that birth',async()=>{
  const {f,a}=await setup(id);tap(a);
  const p=f.G.projectiles.list.find(p=>p.catalog);assert.ok(p);
  const o=a.weapon.catalogRecord.parameters.spl__WeaponSaberParam.SwingParam.ShotBulletOffset_L;
  near(p.pos,a.pos.clone().add(new f.THREE.Vector3(o.Z,o.Y,-o.X)));
  near(p.start,p.pos);near(p.prev,p.pos);
  let packet;a.nid=1;
  f.NetMatch.prototype.recProj.call({_rec:row=>{packet=[0,...row,0,1];return packet;},cfg:{id:'saber-origin'}},p);
  assert.ok(packet);
  const remote=f.make(id);remote.remote=true;
  f.G.projectiles.ghostProjectile(remote,packet);
  const ghost=f.G.projectiles.list.at(-1);assert.ok(ghost.ghost&&ghost.catalog);
  // Network coordinates are quantized by the existing recorder.
  assert.ok(ghost.start.distanceTo(p.start)<.02);
});

test('left/right offsets alternate on emitted waves; empty input and cancelled windup preserve the next side',async()=>{
  const {f,a}=await setup();
  const r=a.weapon.catalogRecord;
  // Distinct test offsets expose side selection: the current retail rows have
  // identical L/R values, so checking those alone cannot detect a stuck side.
  const swing={...r.parameters.spl__WeaponSaberParam.SwingParam,
    ShotBulletOffset_L:{X:-.4,Y:1,Z:1.4},ShotBulletOffset_R:{X:.7,Y:1.2,Z:1.8}};
  a.weapon={...a.weapon,catalogRecord:{...r,parameters:{...r.parameters,
    spl__WeaponSaberParam:{...r.parameters.spl__WeaponSaberParam,SwingParam:swing}}}};
  tap(a);const first=f.G.projectiles.list.at(-1);
  near(first.pos,a.pos.clone().add(new f.THREE.Vector3(1.4,1,.4)));
  a.ink=0;tap(a);assert.equal(f.G.projectiles.list.length,1);
  a.ink=100;input(a,true);input(a,false);
  assert.ok(a.weaponRunner.catalogState.pending);
  a.weaponRunner.update(1/60,{fire:false,sub:true});
  input(a,false,45);assert.equal(f.G.projectiles.list.length,1);
  a.ink=100;tap(a);
  near(f.G.projectiles.list.at(-1).pos,a.pos.clone().add(new f.THREE.Vector3(1.8,1.2,-.7)));
  assert.equal(a.weaponRunner.catalogState.saberShotOrdinal,2);
});

test('vertical source offset stays independent of horizontal side selection',async()=>{
  const {f,a}=await setup('s3-saber-normal');
  input(a,true,30);input(a,false,40);
  const p=f.G.projectiles.list.at(-1);assert.equal(p.catalog.descriptor.key,'saber-vertical');
  const o=a.weapon.catalogRecord.parameters.spl__WeaponSaberParam.SwingParam.ShotBulletOffset_Vertical;
  near(p.start,a.pos.clone().add(new f.THREE.Vector3(o.Z,o.Y,-o.X)));
  assert.equal(a.weaponRunner.catalogState.saberShotOrdinal,0);
});

test('a forward wave offset cannot spawn through a wall',async()=>{
  const {f,a}=await setup();
  f.G.physics.raycast=(_from,_dir,length,h)=>{h.hit=length>.5;h.dist=.5;return h;};
  tap(a);const p=f.G.projectiles.list.at(-1);
  const chest=a.pos.clone().add(new f.THREE.Vector3(0,1.05,0));
  assert.ok(p.start.distanceTo(chest)<=.480000001);
  assert.ok(p.start.x<a.pos.x+.5);
});
