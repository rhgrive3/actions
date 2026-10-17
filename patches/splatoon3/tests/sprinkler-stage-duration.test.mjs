import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { emptyLoadout } from '../runtime/gear.mjs';
import { SPRINKLER, resolveSprinklerPower, sprinklerPhase, sprinklerShotFrames } from '../runtime/kit-sprinkler.mjs';

// S3 11.3.0. PeriodFirst/Second are durations of their respective stages.
// https://wikiwiki.jp/splatoon3mix/検証/パラメータ情報/サブ
// Community confirmation explicitly distinguishes 8s and +15s =23s:
// https://z.wikiwiki.jp/spla3/topic/149/1394
const STEP=1/60;
for(const ap of [0,57])test(`Sprinkler ${ap} AP middle stage lasts its full extracted duration`,()=>{
  const spec=resolveSprinklerPower(SPRINKLER,ap),end=spec.periodFirstFrames+spec.periodSecondFrames;
  assert.equal(sprinklerPhase(spec.periodFirstFrames-1,spec),0);
  assert.equal(sprinklerPhase(spec.periodFirstFrames,spec),1);
  assert.equal(sprinklerPhase(spec.periodSecondFrames,spec),1,'second duration is not an absolute age');
  assert.equal(sprinklerPhase(end-1,spec),1);assert.equal(sprinklerPhase(end,spec),2);
  const shots=sprinklerShotFrames(end+20,spec),at=shots.indexOf(end);
  assert.ok(at>0);assert.equal(shots[at+1]-shots[at],9);
  assert.equal(shots[at]-shots[at-1],6);
});

for(const ap of [0,57])test(`native input-created Sprinkler ${ap} AP emits the middle cadence until the cumulative boundary`,async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true}),a=f.make();
  a.weapon={...a.weapon,sub:'sprinkler'};a.weaponRunner.reset();a.ink=100;
  a.s3.loadout=emptyLoadout();if(ap)for(const piece of a.s3.loadout){piece.main='subPower';piece.subs.fill('subPower');}
  a.s3RefreshGear();
  for(let i=0;i<8;i++)a.weaponRunner.update(STEP,{sub:true});
  a.weaponRunner.update(STEP,{sub:false,subReleased:true});a.weaponRunner.update(STEP,{sub:false});
  const b=f.G.projectiles.bombs.find(o=>o.s3Sub?.id==='sprinkler');assert.ok(b);assert.equal(a.ink,40);
  let first=true;f.G.physics.segment=(_start,end,hit)=>{
    hit.hit=first;first=false;if(hit.hit){hit.point.copy(end);hit.normal.set(0,1,0);}return hit;
  };
  f.G.time+=STEP;f.G.projectiles.update(STEP);assert.ok(b.s3Sprinkler);
  const spec=b.s3Resolved.spec,end=spec.periodFirstFrames+spec.periodSecondFrames;
  while((b.age-b.s3Sprinkler.sourceAge)/STEP<end-2){f.G.time+=STEP;f.G.projectiles.update(STEP);}
  assert.equal(b.s3Sprinkler.phase,1,'the actual source device has not weakened early');
  for(let i=0;i<4;i++){f.G.time+=STEP;f.G.projectiles.update(STEP);}
  assert.equal(b.s3Sprinkler.phase,2);assert.ok(f.G.projectiles.bombs.includes(b));
  a.splat(null,'fall');f.G.time+=STEP;f.G.projectiles.update(STEP);
  assert.ok(!f.G.projectiles.bombs.includes(b),'ordinary native owner-death retirement remains intact');
});
