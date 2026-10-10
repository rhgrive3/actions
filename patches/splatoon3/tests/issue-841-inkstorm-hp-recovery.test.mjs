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
  close(gainedHp, stormTicks * (12.6 / 60), 'continuous natural HP recovery during storm throw');
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


test('#841 actual R-released Storm throw regenerates 0.21 HP once per fixed tick', async () => {
  const f = await fixture();
  let throws = 0;
  f.G.projectiles.throwStorm = () => { throws++; };
  f.G.paint.sample = () => 1;
  const a = f.make();
  a.weapon = { ...a.weapon, special: 'storm' };
  a.special = 200;
  a.hp = 50;
  // This focused source fixture intentionally has no rigid-body solver;
  // Storm release invokes native _resolve for presentation placement.
  // Suppress only that unrelated collision pass, not Actor.update/resources.
  a._resolve = () => {};
  a.lastDamage = 10; // the separate 60F post-hit wait is already complete
  a.intent.special = true;
  f.tick(a);
  assert.equal(a.specialActive?.phase, 'hold');
  assert.equal(throws, 0, 'activating alone does not throw');
  a.intent.special = false;
  a.intent.sub = true;
  f.tick(a);
  a.intent.sub = false;
  f.tick(a);
  assert.equal(throws, 1, 'actual R press/release throws one device');
  assert.equal(a.specialActive?.phase, 'throw');
  const hp = a.hp;
  const tickCount = 10;
  for (let i = 0; i < tickCount; i++) {
    f.tick(a);
    assert.equal(a.specialActive?.phase, 'throw', 'check only real throw frames');
    close(a.hp - hp, (i + 1) * .21, 'normal HP recovers once per 60Hz throw frame', 1e-8);
  }
  close(f.profile.resources.regenRate, 12.6);
  close(f.profile.resources.regenRateSwim, 100);
});

test('#841 throwing a Storm never bypasses a fresh 60F damage recovery delay', async () => {
  const f = await fixture();
  f.G.projectiles.throwStorm = () => {};
  f.G.paint.sample = () => 1;
  const a = f.make();
  a.weapon = { ...a.weapon, special: 'storm' };
  a.special = 200; a.hp = 50; a.lastDamage = 0;
  a._resolve = () => {}; // isolated Storm throw; no physics solver in source fixture
  a.intent.special = true; f.tick(a); a.intent.special = false;
  a.intent.sub = true; f.tick(a);
  a.intent.sub = false; f.tick(a);
  assert.equal(a.specialActive?.phase, 'throw');
  const before = a.hp;
  f.tick(a, 10);
  assert.equal(a.hp, before, 'the damage recovery wait still gates the real throw');
});

// Storm throw window helpers. Ink refill and enemy-ink contact during the throw are
// governed by the #624 contract in storm-throwlock-resources.test.mjs, not asserted here.
const stormSetup = async (hz, { paint = 1, hp = 50, ink, enemyInkTime = 0, ally = false } = {}) => {
  const f = await fixture();
  f.G.projectiles.throwStorm = () => {};
  f.G.paint.sample = () => paint;
  const a = f.make();
  a.weapon = { ...a.weapon, special: 'storm' };
  a.special = 200; a.hp = hp; a.lastDamage = 10; a._resolve = () => {};
  if (ink !== undefined) a.ink = ink;
  if (enemyInkTime) { a.s3 ||= {}; a.s3.enemyInkTime = enemyInkTime; }
  if (ally) f.G.projectiles.clouds = [{ t: 0, dur: 5, team: a.team, group: { position: { x: a.pos.x, y: a.pos.y + 3, z: a.pos.z } } }];
  const step = () => { f.G.time += 1 / hz; a.update(1 / hz); };
  return { f, a, step };
};
const reachThrow = (a, step) => {
  a.intent.special = true; step();
  a.intent.special = false; a.intent.sub = true; step();
  a.intent.sub = false; step();
  assert.equal(a.specialActive?.phase, 'throw', 'reached the real throw phase');
};

test('#841 Storm throw HP regen is time-equivalent across 30/60/120 Hz over a fixed 0.3 s window', async () => {
  const gains = [];
  for (const hz of [30, 60, 120]) {
    const { a, step } = await stormSetup(hz);
    reachThrow(a, step);
    const hp = a.hp;
    const ticks = Math.round(0.3 * hz);
    for (let i = 0; i < ticks; i++) { step(); assert.equal(a.specialActive?.phase, 'throw', `throw still active at ${hz}Hz tick ${i}`); }
    gains.push(a.hp - hp);
  }
  const expected = 0.3 * 12.6;
  for (const g of gains) close(g, expected, 'fixed-window HP gain is Hz-independent', 1e-6);
});

test('#841 Storm activation and exit boundary ticks each apply exactly one regen step', async () => {
  const { a, step } = await stormSetup(60);
  const deltas = [];
  const record = () => { const hp = a.hp; step(); deltas.push(a.hp - hp); };
  a.intent.special = true; record();                       // activation tick
  a.intent.special = false; a.intent.sub = true; record();  // release: throw begins
  a.intent.sub = false;
  while (a.specialActive && deltas.length < 80) record();   // throw ... exit tick
  const throwTicks = deltas.length;
  record();                                                 // first ordinary tick after exit
  assert.equal(a.specialActive, null, 'the Storm window ended');
  assert.ok(throwTicks > 20, 'the real throw window lasted more than 20 ticks');
  for (const d of deltas) close(d, 0.21, 'one 0.21 HP step per 60Hz tick, including activation and exit', 1e-8);
});

test('#841 allied Storm rain regen stays a single 100 HP/s rate during a throw', async () => {
  const { f, a, step } = await stormSetup(60, { ally: true });
  reachThrow(a, step);
  const rate = f.profile.resources.regenRateSwim / 60;
  for (let i = 0; i < 10 && a.specialActive?.phase === 'throw'; i++) {
    const hp = a.hp; step(); close(a.hp - hp, rate, 'allied rain uses the single regenRateSwim rate, no stacking', 1e-6);
  }
});
