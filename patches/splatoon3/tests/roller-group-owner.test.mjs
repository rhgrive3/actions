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
  const apply = f.projectiles.applyHit; let maximum = 0;
  f.projectiles.applyHit = function(owner,victim,damage,weapon,group) {
    if (group != null) { const next=Math.max(maximum,damage); damage=next-maximum; maximum=next; }
    if (damage>0) return apply.call(this,owner,victim,damage,weapon,group);
  };
  launch(f,a,c); finish(f,a);
  const total = f.hits.reduce((n,h) => n+h.damage,0);
  // #771 re-encodes this seeded volley: per-glob yaw now carries the sourced
  // SwerveRateBySpeed, so the single recorded increment lands at 146.24…
  // instead of 149.19…. The assertion's purpose (second increment dropped,
  // one cumulative-maximum hit) is unchanged.
  assert.ok(Math.abs(total-146.2467193896255)<1e-9);
});

test('receiver uses immutable hit weapon identity after attacker switches weapon', async () => {
  const f = await fixture({site: `${ROOT}.group-source`, fidelity:true});
  const a = f.make('shooter'), victim = f.make('shooter',{team:1,z:2});
  f.G.netm=null; a.weapon=f.WEAPONS.roller;
  f.projectiles.applyHit(a,victim,40,'slosher','wire-volley');
  f.projectiles.applyHit(a,victim,70,'slosher','wire-volley');
  f.projectiles.applyHit(a,victim,70,'slosher','wire-volley');
  assert.equal(f.hits.reduce((n,h)=>n+h.damage,0),70,'Slosher cumulative maximum remains deduplicated');
  f.hits.length=0; a.weapon=f.WEAPONS.slosher;
  f.projectiles.applyHit(a,victim,149.19758204830146,'roller','roller-volley');
  f.projectiles.applyHit(a,victim,.8024179516985441,'roller','roller-volley');
  assert.equal(f.hits.reduce((n,h)=>n+h.damage,0),150,'Roller increments remain additive after switching');
});
