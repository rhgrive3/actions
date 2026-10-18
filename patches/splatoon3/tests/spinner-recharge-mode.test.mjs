import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
async function setup(id='s3-spinner-downpour'){
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
 const a=f.make(id);a.form='kid';a.ink=100;
 return {...f,a};
}
function release(f,chargeFrames,fireFrames=2){
 f.a.intent.fire=true;f.tick(f.a,chargeFrames);
 f.a.intent.fire=false;f.tick(f.a,fireFrames);
 return f.G.projectiles.list.at(-1)?.catalog?.descriptor;
}

test('Ballpoint long-range firing survives small recharges for both registered kits',async()=>{
 for(const id of ['s3-spinner-downpour','s3-spinner-downpour-01']){
  const f=await setup(id),a=f.a;
  release(f,100,70);
  assert.equal(f.G.projectiles.list.at(-1).catalog.descriptor.key,'variable');
  const peak=a.weaponRunner.catalogState.ballpointPeakShooting;
  const ink=a.ink,descriptor=release(f,1);
  assert.equal(descriptor.key,'variable',id+' re-release must not restart the short-range phase');
  assert.equal(descriptor.charge,1,id+' completed long-range interpolation stays completed');
  assert.equal(a.weaponRunner.catalogState.ballpointPeakShooting,peak,id+' old peak is retained');
  assert.ok(ink-a.ink>0&&ink-a.ink<1,id+' only new charge consumes ink');
  for(let cycle=0;cycle<5;cycle++)assert.equal(release(f,1,6).key,'variable',id+' repeated long-range recharge');
 }
});

test('Ballpoint recharge across its prior switch boundary actually returns to short range',async()=>{
 const f=await setup();release(f,100,70);
 assert.equal(release(f,1).key,'variable');
 const peak=f.a.weaponRunner.catalogState.ballpointPeakShooting;
 assert.equal(release(f,30).key,'normal','enough recharging rewinds over the switching point');
 assert.equal(f.a.weaponRunner.catalogState.ballpointPeakShooting,peak,'full prior peak is not invented again');
 f.a.intent.fire=false;f.tick(f.a,45);
 assert.equal(f.G.projectiles.list.at(-1).catalog.descriptor.key,'variable','firing traverses the boundary again');
});

test('Ballpoint raises its mode boundary only when the new charge exceeds its previous peak',async()=>{
 const f=await setup();release(f,50,42);
 const oldPeak=f.a.weaponRunner.catalogState.ballpointPeakShooting;
 assert.ok(oldPeak>90&&oldPeak<92);
 assert.equal(f.G.projectiles.list.at(-1).catalog.descriptor.key,'variable');
 assert.equal(release(f,35).key,'normal');
 assert.ok(f.a.weaponRunner.catalogState.ballpointPeakShooting>oldPeak,'higher charge establishes higher boundary');
});

test('Ballpoint reset, cancellation and spent gauge clear the previous mode boundary',async()=>{
 const f=await setup();release(f,100,50);assert.ok(f.a.weaponRunner.catalogState.ballpointPeakShooting>0);
 f.a.form='squid';f.a.intent.fire=false;f.a.weaponRunner.update(1/60,{fire:false,firePressed:false});
 assert.equal(f.a.weaponRunner.catalogState.ballpointPeakShooting,0,'submerging cancels Ballpoint gauge');
 f.a.form='kid';f.a.ink=100;assert.equal(release(f,25,2).key,'normal');
 f.tick(f.a,160);
 assert.equal(f.a.weaponRunner.streaming,false);
 assert.equal(f.a.weaponRunner.catalogState.ballpointPeakShooting,0,'spent gauge returns neutral');
 // Expired stream history must not permanently impose long-range walk speed.
 f.a.weaponRunner.firingT=0;
 assert.ok(f.a.weaponRunner.moveSpeed()>f.a.weapon.moveSpeedFiring,'idle player resumes normal walking');
});

test('only source-enabled Nautilus/Ballpoint recharge; Hydra, Mini and Heavy Edit remain committed to firing',async()=>{
 for(const [id,enabled,full] of [
  ['s3-spinner-serein',true,76],['s3-spinner-serein-01',true,76],
  ['s3-spinner-downpour',true,100],['s3-spinner-quick',false,27],
  ['s3-spinner-hyper',false,150],['s3-spinner-hypershort',false,120]]){
  const f=await setup(id),a=f.a;release(f,full,15);
  const ink=a.ink;a.intent.fire=true;f.tick(a);
  assert.equal(a.weaponRunner.charging,enabled,id);
  assert.equal(a.weaponRunner.streaming,!enabled,id);
  if(enabled){assert.ok(a.weaponRunner.catalogState.chargeF>full*.5,id+' retains paid charge');assert.ok(ink-a.ink<1,id+' no repayment');}
 }
});
