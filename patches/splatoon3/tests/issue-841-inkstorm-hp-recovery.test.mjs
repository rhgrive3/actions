import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const close = (actual, expected, msg = '', eps = 1e-4) =>
  assert.ok(Math.abs(actual - expected) < eps, `${actual} != ${expected} (diff: ${Math.abs(actual - expected)}) ${msg}`);

test('#841 Ink Storm throw animation does not freeze natural HP recovery', async () => {
  const f = await fixture();
  f.G.projectiles.throwStorm = () => {};
  f.G.paint.sample = () => 1; // friendly / dry ground

  const a = f.make();
  a.weapon = { ...a.weapon, special: 'storm' };
  a.special = 200;
  a.hp = 50;
  a.lastDamage = 10; // post-hit recovery delay (60F = 1.0s) fully elapsed

  // Activate Ink Storm
  a.intent.special = true;
  f.tick(a);
  assert.equal(a.specialActive?.id, 'storm', 'Storm activated');

  const hpBeforeThrow = a.hp;
  let stormTicks = 0;

  // Advance ticks during active special
  for (let i = 0; i < 21 && a.specialActive; i++) {
    f.tick(a);
    stormTicks++;
  }

  // Under S3 rule, 12.6 HP/s = 0.21 HP/tick, 21 ticks restores ~4.41 HP
  const gainedHp = a.hp - hpBeforeThrow;
  assert.ok(gainedHp > 4.0 && gainedHp < 5.0, `gained ${gainedHp} HP during throw (expected ~4.41 HP)`);
  close(gainedHp, stormTicks * (12.5 / 60), 'continuous natural HP recovery during storm throw');
});

test('#841 HP recovery respects post-hit delay during Ink Storm throw', async () => {
  const f = await fixture();
  f.G.projectiles.throwStorm = () => {};
  f.G.paint.sample = () => 1;

  const a = f.make();
  a.weapon = { ...a.weapon, special: 'storm' };
  a.special = 200;
  a.hp = 50;
  a.lastDamage = 0; // freshly damaged, 60F delay NOT yet elapsed

  a.intent.special = true;
  f.tick(a);

  const hpBefore = a.hp;
  // Advance 10 ticks (within delay period)
  for (let i = 0; i < 10 && a.specialActive; i++) {
    f.tick(a);
  }

  // HP should NOT have recovered because lastDamage < delay
  assert.equal(a.hp, hpBefore, 'no HP recovery before post-hit delay expires');
});

test('#841 natural HP recovery caps at 100 HP during throw', async () => {
  const f = await fixture();
  f.G.projectiles.throwStorm = () => {};
  f.G.paint.sample = () => 1;

  const a = f.make();
  a.weapon = { ...a.weapon, special: 'storm' };
  a.special = 200;
  a.hp = 99;
  a.lastDamage = 10;

  a.intent.special = true;
  f.tick(a);

  for (let i = 0; i < 21 && a.specialActive; i++) {
    f.tick(a);
  }

  assert.equal(a.hp, 100, 'HP capped at 100');
});
