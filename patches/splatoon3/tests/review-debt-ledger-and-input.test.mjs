import test from 'node:test';
import assert from 'node:assert/strict';
import { volleyOwnerKey, trackedSlosherVolley } from '../runtime/weapons.mjs';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { scheduleLethal, flushPendingLethal, hasPendingLethal } from '../runtime/damage-timing.mjs';

test('Slosher wire volley id is bounded and rejects malformed peer or group fields', () => {
  const a = { owner: 'peer-a', nid: 3 };
  assert.equal(volleyOwnerKey(a, 'volley-1'), '["peer-a",3,"volley-1"]');
  assert.equal(volleyOwnerKey(a, 'x'.repeat(129)), null);
  assert.equal(volleyOwnerKey({ owner: 'x'.repeat(129), nid: 3 }, 2), null);
  assert.equal(volleyOwnerKey(a, { attacker: 'untrusted-object' }), null);
  assert.equal(volleyOwnerKey(a, Number.POSITIVE_INFINITY), null);
});

test('Slosher in-flight wire ledger keeps per-victim maxima without retaining unbounded groups', () => {
  const groups = new Map();
  const victim = {};
  const first = trackedSlosherVolley(groups, 'g-0', 0);
  assert.ok(first instanceof WeakMap);
  first.set(victim, 60);
  assert.equal(trackedSlosherVolley(groups, 'g-0', 1).get(victim), 60);
  for (let i = 1; i < 512; ++i) assert.ok(trackedSlosherVolley(groups, 'g-' + i, 2));
  assert.equal(groups.size, 512);
  assert.equal(trackedSlosherVolley(groups, 'overflow', 3), null,
    'flooded wire ids must not bypass an in-flight duplicate ledger');
  assert.equal(groups.size, 512);
  assert.equal(trackedSlosherVolley(groups, 'g-0', 3).get(victim), 60);
  assert.ok(trackedSlosherVolley(groups, 'after-expiry', 11));
  assert.equal(groups.size, 1, 'expired volley keys are collected on new group admission');
  assert.equal(trackedSlosherVolley(groups, 'x'.repeat(421), 10), null);
  assert.equal(trackedSlosherVolley(groups, 'some-key', Infinity), null);
  groups.clear();
  assert.equal(groups.size, 0, 'match cleanup still clears the ledger');
});

test('Dualies/Slosher fixed-tick input gate retains one dynamic view without cloning frozen inputs', async () => {
  const f = await fixture();
  let bombs = 0;
  f.G.projectiles.throwBomb = () => { bombs++; };
  for (const kind of ['dualies', 'slosher']) {
    const actor = f.make(kind), runner = actor.weaponRunner;
    const idle = Object.freeze({ fire: false, firePressed: false, sub: false, subReleased: false });
    for (let i = 0; i < 200; i++) runner.update(1 / 60, idle);
    if(kind==='dualies') assert.equal(runner.s3SubGateInput, undefined, 'ordinary Dualies avoid even the first gate allocation');
    const blocked = Object.freeze({ fire: false, sub: true, subReleased: true });
    if (kind === 'dualies') runner.s3DualiesPostShot = 3 / 60;
    else runner.s3SloshPostShot = 3 / 60;
    runner.update(1 / 60, blocked);
    const view=runner.s3SubGateInput?.view; assert.ok(view, kind+' initializes one reusable gate only when needed');
    assert.equal(blocked.sub, true, 'caller-owned input remains immutable');
    assert.equal(blocked.subReleased, true);
    assert.equal(runner.s3SubReady?.pending, true, 'the integrated readiness owner buffers release behind the action lock');
    runner.s3DualiesPostShot = 0; runner.s3SloshPostShot = 0;
    for(let i=0;i<6;i++) runner.update(1 / 60, idle);
    assert.equal(bombs, kind === 'dualies' ? 1 : 2, 'buffered sub release observes normal preparation and 1F use-startup');
    for (let i = 0; i < 200; i++) runner.update(1 / 60, idle);
    assert.equal(bombs, kind === 'dualies' ? 1 : 2, 'no duplicate bomb after replay');
    assert.equal(runner.s3SubGateInput.view, view, 'no per-tick proxy replacement');
  }
});

test('lethal hit cannot be flushed by a later actor in the same simulation tick', () => {
  const splats = [];
  const victim = { alive: true, hp: 0, splat(attacker, cause) { splats.push([attacker, cause]); this.alive = false; } };
  assert.equal(scheduleLethal(victim, null, 'weapon', 8 / 60), true);
  assert.equal(flushPendingLethal(victim, 8 / 60), false);
  assert.equal(hasPendingLethal(victim), true, 'same-frame pending damage is not discarded');
  assert.equal(splats.length, 0);
  assert.equal(flushPendingLethal(victim, 9 / 60), true);
  assert.deepEqual(splats, [[null, 'weapon']]);
  assert.equal(flushPendingLethal(victim, 10 / 60), false);
});
