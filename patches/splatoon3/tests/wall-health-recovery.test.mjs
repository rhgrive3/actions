import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

async function wallActor() {
  const f = await fixture(), a = f.make();
  a.form = 'squid'; a.intent.squid = true; a.intent.move.set(0, 0, 1);
  a.grounded = false; a.hp = 10; a.lastDamage = 10;
  let paint = 1;
  f.G.paint.sample = () => paint;
  f.G.physics.raycast = (_origin, _direction, _distance, hit) => {
    hit.hit = true; hit.face = 0; hit.u = hit.v = .5;
    hit.normal.set(0, 0, -1);
    return hit;
  };
  return { f, a, paint: value => { paint = value; } };
}

for (const hz of [30, 60, 120]) {
  test(`own-ink wall uses swim healing through the actual Actor at ${hz} Hz`, async () => {
    const { f, a } = await wallActor();
    for (let i = 0; i < hz / 5; i++) a.update(1 / hz);
    assert.equal(a.climbing, true);
    assert.equal(a.submerged, false, 'floor submersion must retain its original meaning');
    assert.ok(Math.abs(a.hp - (10 + f.profile.resources.regenRateSwim / 5)) < 1e-8);
  });
}

test('dry and enemy-painted walls drop swim healing on the detach tick', async () => {
  for (const paint of [0, 2]) {
    const r = await wallActor(); r.a.update(1 / 60);
    assert.equal(r.a.climbing, true);
    r.paint(paint); const hp = r.a.hp; r.a.update(1 / 60);
    assert.equal(r.a.climbing, false);
    assert.ok(Math.abs(r.a.hp - hp - r.f.profile.resources.regenRate / 60) < 1e-8);
  }
});

test('wall recovery retains the damage delay and does not advance on a paused tick', async () => {
  const { a } = await wallActor(); a.lastDamage = 0;
  a.update(1 / 60); assert.equal(a.climbing, true); assert.equal(a.hp, 10);
  a.lastDamage = 10; a.update(0); assert.equal(a.hp, 10);
});

test('leaving swim form or resetting never retains fast wall recovery', async () => {
  const { f, a } = await wallActor(); a.update(1 / 60);
  a.intent.squid = false; const hp = a.hp; a.update(1 / 60);
  assert.equal(a.climbing, false);
  assert.ok(Math.abs(a.hp - hp - f.profile.resources.regenRate / 60) < 1e-8);
  a.reset(); assert.equal(a.climbing, false);
});
