import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const close = (actual, expected, eps = 1e-8) =>
  assert.ok(Math.abs(actual - expected) <= eps, `${actual} != ${expected}`);

test('rescued PR #63 death causes retain distinct respawn totals', async () => {
  const f = await fixture(), a = f.make();
  a.splat(null, 'weapon'); close(a.respawnTimer, 8.5);
  a.reset(); a.splat(null, 'water'); close(a.respawnTimer, 7);
  a.reset(); a.splat(null, 'out-of-bounds'); close(a.respawnTimer, 5.5);
});

test('rescued PR #63 health regeneration uses 12.5/100 HP per second after 1.0s', async () => {
  const f = await fixture(), a = f.make();
  a.hp = 50; a.lastDamage = f.profile.resources.regenDelay;
  f.tick(a, 60); close(a.hp, 62.5);
  a.reset(); a.hp = 50; a.lastDamage = f.profile.resources.regenDelay;
  a.form = 'squid'; a.intent.squid = true; a.grounded = true; a.ground.hit = true; a.ground.face = 0;
  f.tick(a, 30); close(a.hp, 100);
});
