import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
const F=1/60;
// Current S3 reference: ground-only placement at the feet, before ink payment.
// https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ホップソナー
// https://gamewith.jp/splatoon3/362475
test('Beakon rejects native airborne use before payment and grounded release places at the feet',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true}),a=f.make();
  a.weapon={...a.weapon,sub:'beakon'};a.weaponRunner.reset();a.ink=100;a.pos.set(12,4,30);a.grounded=false;
  for(let i=0;i<20;i++)a.weaponRunner.update(F,{sub:true});a.weaponRunner.update(F,{sub:false,subReleased:true});
  assert.equal(a.ink,100);assert.equal(f.G.projectiles._s3SubObjects?.length||0,0);assert.equal(f.G.projectiles.throwBomb(a),undefined);
  a.grounded=true;a.vel.set(12,5,18);a.aimPitch=1;
  for(let i=0;i<8;i++)a.weaponRunner.update(F,{sub:true});a.weaponRunner.update(F,{sub:false,subReleased:true});a.weaponRunner.update(F,{sub:false});
  const b=f.G.projectiles._s3SubObjects[0];assert.ok(b);assert.equal(a.ink,25);
  assert.equal(b.phase,'deployed');assert.deepEqual(b.pos.toArray(),a.pos.toArray());assert.equal(b.vel.lengthSq(),0);
  f.G.projectiles.clear();assert.equal(f.G.projectiles._s3SubObjects.length,0);
});
