import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
const STEP=1/60;
// S3 11.3.0 GP0. Wiki community testing observes an 8F B-button bonus
// split 2.5/2.5/2.5/.5 starting on the same pressed frame, even in midair.
// https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/タンサンボム#characteristic
test('Fizzy admitted jump bonus starts on its input frame and drains only once per frame',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true}),a=f.make();
  a.weapon={...a.weapon,sub:'fizzy'};a.weaponRunner.reset();a.ink=100;a.grounded=false;
  for(let i=0;i<12;i++)a.weaponRunner.update(STEP,{sub:true});
  assert.ok(a.weaponRunner.s3SubHold>0);
  const before=a.weaponRunner.s3SubHold;a.intent.jump=true;
  const increments=[];
  for(let i=0;i<4;i++){
    const start=a.weaponRunner.s3SubHold;
    a.weaponRunner.update(STEP,{sub:true});
    increments.push(Math.round(((a.weaponRunner.s3SubHold-start)/STEP-1)*10)/10);
    a.intent.jump=false;
  }
  assert.deepEqual(increments,[2.5,2.5,2.5,.5]);
  assert.ok(Math.abs((a.weaponRunner.s3SubHold-before)/STEP-12)<1e-8);
  assert.equal(a.weaponRunner.s3FizzyCharge.queue,0);
  assert.equal(a.ink,100,'charging itself does not pay ink or manufacture a projectile');
  a.weaponRunner.reset();assert.equal(a.weaponRunner.s3FizzyCharge,null);
});
