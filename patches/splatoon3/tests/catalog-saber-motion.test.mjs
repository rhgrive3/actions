import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
test('actual swing serial controls tap/full pose and horizontal handedness, including charged Dental',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
  extraExports:"export * as SABER_POSE from './patches/splatoon3/runtime/weapon-models/splatanas.mjs';"});
 const C={ANC:0,ANCR:3,CHEST:6,SPINE:9,IKL:12};
 for(const id of ['s3-saber-lite','s3-saber-normal','s3-saber-heavy']){
  const runner={charge:0,catalogState:{pending:{},saberSwing:{serial:1,key:'saber-horizontal',ordinal:0}}};
  const ch={weapon:{def:{modelId:id}},_runner:()=>runner,kidForm:true,P:new Float64Array(16)};
  f.SABER_POSE.FAMILY_POSE(ch,1/60,{},C);const first=f.SABER_POSE.sabreSnapshot(ch);
  runner.catalogState.saberSwing={serial:2,key:'saber-horizontal',ordinal:1};
  f.SABER_POSE.FAMILY_POSE(ch,1/60,{},C);const second=f.SABER_POSE.sabreSnapshot(ch);
  assert.equal(second.yaw,-first.yaw,id+' opposite horizontal sweep, even without rendered idle frame');
  runner.catalogState.saberSwing={serial:3,key:'saber-vertical',ordinal:2};
  f.SABER_POSE.FAMILY_POSE(ch,1/60,{},C);const full=f.SABER_POSE.sabreSnapshot(ch);
  assert.equal(full.full,true,'mode comes from the actual swing, with no prior charged render');
  assert.equal(full.horizontal,id==='s3-saber-heavy');assert.ok([...ch.P].every(Number.isFinite));
 }
});

test('validated remote slash metadata reproduces mode/side once without gameplay authority; old/repeated births cannot rewind it',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 const a=f.make('s3-saber-lite');a.form='kid';a.nid=1;a.aimDir.set(0,0,1);
 a.weaponRunner.update(1/60,{fire:true});for(let i=0;i<12;i++)a.weaponRunner.update(1/60,{fire:false});
 const p=f.G.projectiles.list.find(p=>p.catalog);let packet;
 f.NetMatch.prototype.recProj.call({_rec:row=>{packet=[1,...row,0,1];return packet;},cfg:{id:'saber-motion'}},p);
 const remote=f.make('s3-saber-lite');remote.remote=true;remote.form='kid';
 f.G.projectiles.ghostProjectile(remote,packet);const s=remote.weaponRunner.catalogState;
 assert.equal(s.saberSwing.key,'saber-horizontal');assert.equal(s.saberSwing.ordinal,0);
 const duplicate=[...packet];f.G.projectiles.ghostProjectile(remote,duplicate);assert.equal(s.saberSwing.serial,1);
 const second=[...packet];second[0]=2;f.G.projectiles.ghostProjectile(remote,second);
 assert.equal(s.saberSwing.serial,2);assert.equal(s.saberSwing.ordinal,1);
 f.G.projectiles.ghostProjectile(remote,packet);assert.equal(s.saberSwing.serial,2);
 assert.equal(s.melee,null);assert.equal(s.lunge,null);assert.equal(remote.ink,100);
 const bad=[...packet];bad[0]=3;bad[27]={...bad[27],s3Catalog:[1,'invalid',0,1,0]};
 f.G.projectiles.ghostProjectile(remote,bad);assert.equal(s.saberSwing.serial,2);
});

test('all alternate Splatana kits share the exact base source and live four-frame melee owner',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 const rows=Object.values(f.WEAPONS).filter(w=>w.variantOf&&w.behaviorKind==='splatana');
 assert.ok(rows.length>=5);
 for(const weapon of rows){
  const a=f.make(weapon.id);a.form='kid';a.aimDir.set(0,0,1);
  assert.equal(a.weapon.catalogRecord,f.WEAPONS[weapon.variantOf].catalogRecord);
  a.weaponRunner.update(1/60,{fire:true});a.weaponRunner.update(1/60,{fire:false});
  assert.equal(a.weaponRunner.catalogState.melee.shape.bullet.MoveParam.AliveFrame,4);
  assert.equal(a.weaponRunner.catalogState.saberSwing.key,'saber-horizontal');
 }
});
