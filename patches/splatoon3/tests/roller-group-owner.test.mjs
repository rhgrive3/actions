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

test('negative cumulative-max interpretation drops the second Roller increment', async () => {
  const f = await fixture({site: `${ROOT}.group-source`, fidelity:true});
  const c = CASES.find(c => c.key === 'roller-horizontal'), a = reset(f,c,5.6);
  const apply = f.projectiles.applyHit; let maximum = 0; const submitted = [];
  f.projectiles.applyHit = function(owner,victim,damage,weapon,group) {
    if (group != null) { submitted.push(damage); const next=Math.max(maximum,damage); damage=next-maximum; maximum=next; }
    if (damage>0) return apply.call(this,owner,victim,damage,weapon,group);
  };
  launch(f,a,c); finish(f,a);
  const total = f.hits.reduce((n,h) => n+h.damage,0);
  // #430 changes capsule contact time, and thus the exact first pellet's damage.
  // Keep a differential negative control instead of pinning a terrain-radius accident.
  assert.ok(submitted.length > 1, 'real volley must submit multiple increments');
  assert.ok(Math.abs(submitted.reduce((n,d)=>n+d,0)-150)<1e-9, 'correct additive volley remains 150');
  assert.ok(Math.abs(total-Math.max(...submitted))<1e-9, 'buggy cumulative-max path drops the real top-up');
  assert.ok(total < 150-1e-7, 'the negative implementation must lose lethal damage');
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
