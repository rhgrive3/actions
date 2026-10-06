import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const close = (actual, expected, msg = '') =>
  assert.ok(Math.abs(actual - expected) < 1e-5, `${actual} != ${expected} (diff: ${Math.abs(actual - expected)}) ${msg}`);

function setupActor(f, { special = 'storm', grounded = true, onEnemy = true } = {}) {
  f.G.projectiles.throwStorm = () => {};
  f.G.physics.collideBody = () => ({});
  f.G.physics.groundProbe = (_x, _y, _z, _up, _down, _r, gh) => {
    gh.hit = grounded;
    gh.normal.set(0, 1, 0);
    return gh;
  };
  const a = f.make();
  a.weapon = { ...a.weapon, special };
  a.special = 200;
  a.grounded = grounded;
  f.G.paint.sample = () => (onEnemy ? 2 : 1);
  return a;
}

test('vulnerable Storm throw-state window applies normal passive enemy-ink damage across its 0.35s duration', async () => {
  const f = await fixture();
  const a = setupActor(f);

  // 1. One ordinary tick before activation: takes 0.3 HP damage
  f.tick(a);
  close(a.hp, 99.7);
  close(a.damageFromInk, 0.3);
  close(a.s3.enemyInkTime, 1 / 60);

  // 2. Activate special
  a.intent.special = true;
  f.tick(a);
  assert.equal(a.specialActive?.id, 'storm');
  assert.equal(a.specialActive?.armor, false);

  // 3. Step through entire storm throw lock
  let stormTicks = 0;
  const hpStart = a.hp;
  while (a.specialActive) {
    stormTicks++;
    const prevHp = a.hp;
    const prevTime = a.s3.enemyInkTime;
    f.tick(a);
    close(a.hp, prevHp - 0.3);
    close(a.s3.enemyInkTime, prevTime + 1 / 60);
  }

  // 21-22 ticks elapsed, continuous damage applied
  assert.ok(stormTicks >= 21 && stormTicks <= 22);
  close(hpStart - a.hp, stormTicks * 0.3);
});

test('enemy-ink damage pass does not run twice on first or last lock tick', async () => {
  const f = await fixture();
  const a = setupActor(f);

  // Ordinary step
  f.tick(a);
  const hp0 = a.hp;

  // Activation tick
  a.intent.special = true;
  f.tick(a);
  assert.equal(a.specialActive?.id, 'storm');

  // First lock tick of _updateSpecial
  f.tick(a);
  close(hp0 - a.hp, 0.3, 'first lock tick deals exactly one tick of damage');

  // Step until lock clears
  let lastLockHp = a.hp;
  while (a.specialActive) {
    lastLockHp = a.hp;
    f.tick(a);
    const drop = lastLockHp - a.hp;
    close(drop, 0.3, `each lock tick deals exactly one tick of damage, got ${drop}`);
  }

  // Next ordinary tick after lock cleared
  const hpRightAfterLock = a.hp;
  f.tick(a);
  const postLockDrop = hpRightAfterLock - a.hp;
  close(postLockDrop, 0.3, 'post-lock tick deals exactly one tick of damage (no double pass on boundary)');
});

test('genuine invulnerability prevents passive enemy-ink damage during Storm throwlock', async () => {
  const f = await fixture();
  const a = setupActor(f);

  a.invuln = 2.0;
  a.intent.special = true;
  f.tick(a); // activation

  while (a.specialActive) {
    f.tick(a);
    close(a.hp, 100);
    close(a.damageFromInk, 0);
  }
});

test('airborne actor during Storm throwlock does not take grounded enemy-ink damage', async () => {
  const f = await fixture();
  const a = setupActor(f, { grounded: false });

  a.intent.special = true;
  f.tick(a); // activation

  while (a.specialActive) {
    f.tick(a);
    close(a.hp, 100);
    close(a.damageFromInk, 0);
  }
});

test('Ink Resistance Up grace period delays damage accumulation across Storm throwlock', async () => {
  const f = await fixture();
  f.profile.resources.enemyInkGrace = 0.05; // 3 ticks grace (0.05s)
  const a = setupActor(f);

  // Step 1: activation
  a.intent.special = true;
  f.tick(a);

  // Ticks 1..3 of lock: within grace
  f.tick(a); // tick 1
  close(a.hp, 100);
  f.tick(a); // tick 2
  close(a.hp, 100);
  f.tick(a); // tick 3 (0.05s reached)
  close(a.hp, 100);

  // Tick 4: beyond grace
  f.tick(a);
  assert.ok(a.hp < 100, 'damage starts after grace expires');
});

test('Storm throwlock does not grant armor against weapon hits', async () => {
  const f = await fixture();
  const a = setupActor(f, { onEnemy: false }); // dry/friendly ground

  a.intent.special = true;
  f.tick(a); // activation
  assert.equal(a.specialActive?.id, 'storm');
  assert.equal(a.specialActive?.armor, false);

  const dealt = a.damage(40, null, 'weapon');
  assert.equal(dealt, false);
  close(a.hp, 60, 'Storm user takes full weapon damage without armor reduction');
});
