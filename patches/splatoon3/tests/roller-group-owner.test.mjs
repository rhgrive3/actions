import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, ROOT } from '../../../scripts/weapons-fixture.mjs';
import { CASES, reset, launch, finish } from '../../../scripts/measure-weapons-fidelity.mjs';

test('Roller incremental volley top-ups preserve the actual 6.1 full-damage boundary', async () => {
  for (const [distance, full] of [[5.6,true],[6.1,true],[6.2,false]]) {
    const f = await fixture({site: `${ROOT}.group-source`, fidelity:true});
    const c = CASES.find(c => c.key === 'roller-horizontal'), a = reset(f,c,distance);
    launch(f,a,c); finish(f,a);
    const total = f.hits.reduce((n,h) => n+h.damage,0);
    assert.equal(total >= 150-1e-7,full,`${distance}: ${total}`);
  }
});

test('negative cumulative-max interpretation drops a real Roller 100+50HP grouped top-up', async () => {
  // The narrower source-guided #285 fan can put a full 150HP first pellet on
  // our original 5.6-DU centerline dummy: the negative control must not depend
  // on which independent projectile happens to be the first collider.
  // Keep the *production applyHit* and sourced 150/100 damage bands, and
  // compare its required incremental semantics against the buggy cumulative
  // max transform under a controlled two-hit order.
  const f = await fixture({site: `${ROOT}.group-source`, fidelity:true});
  const owner = f.make('roller'), victim = f.make('shooter', {team:1,z:5.6});
  const w = f.WEAPONS.roller;
  const full = w.flickDamageBands[0][1], partial = w.flickDamageBands[1][1];
  assert.equal(full, 150, 'S3 Roller full damage band');
  assert.equal(partial, 100, 'S3 Roller middle damage band');
  const amounts = [partial, full-partial];
  const apply = f.projectiles.applyHit; let maximum = 0; const submitted = [];
  f.projectiles.applyHit = function(attacker,target,damage,weapon,group) {
    if (group != null) { submitted.push(damage); const next=Math.max(maximum,damage); damage=next-maximum; maximum=next; }
    if (damage>0) return apply.call(this,attacker,target,damage,weapon,group);
  };
  for (const damage of amounts) f.projectiles.applyHit(owner,victim,damage,'roller','roller-negative-control');
  const total = f.hits.reduce((n,h)=>n+h.damage,0);
  assert.deepEqual(submitted,[100,50], 'two independently admitted Roller increments use source damage bands');
  assert.equal(submitted.reduce((n,d)=>n+d,0),150);
  assert.equal(total,100,'buggy cumulative-max path loses the second 50HP increment');
  assert.ok(total<full, 'the negative grouped route is distinguishable from the correct full 150HP');
});

test('receiver uses immutable hit weapon identity after attacker switches weapon', async () => {
  const f = await fixture({site: `${ROOT}.group-source`, fidelity:true});
  const a = f.make('shooter'), victim = f.make('shooter',{team:1,z:2});
  f.G.netm=null; a.weapon=f.WEAPONS.roller;
  f.projectiles.applyHit(a,victim,40,'slosher','local:1');
  f.projectiles.applyHit(a,victim,70,'slosher','local:1');
  f.projectiles.applyHit(a,victim,70,'slosher','local:1');
  assert.equal(f.hits.reduce((n,h)=>n+h.damage,0),70,'Slosher cumulative maximum remains deduplicated');
  f.hits.length=0; a.weapon=f.WEAPONS.slosher;
  f.projectiles.applyHit(a,victim,149.19758204830146,'roller','roller-volley');
  f.projectiles.applyHit(a,victim,.8024179516985441,'roller','roller-volley');
  assert.equal(f.hits.reduce((n,h)=>n+h.damage,0),150,'Roller increments remain additive after switching');
});
