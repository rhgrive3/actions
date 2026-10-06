import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { FixedClock, STEP } from '../runtime/clock.mjs';
import { SPECIAL_GAUGE_SEGMENTS } from '../runtime/tidal-slam-gauge.mjs';

async function slam({ land = true } = {}) {
  const f = await fixture(), a = f.make('shooter');
  assert.equal(a.weapon.special, 'slam');
  a.special = a.specialCost();
  f.G.projectiles.throwStorm = () => {};
  const impacts = [];
  a._slamImpact = () => impacts.push(a.special);
  a._resolve = () => {
    if (land && a.specialActive?.phase === 'fall' && a.specialActive.t >= 8 * STEP) a.grounded = true;
  };
  a._startSpecial();
  return { f, a, impacts };
}

test('Tidal Slam owns a nonzero gauge through its phases and consumes the last segment at impact', async () => {
  const { a, impacts } = await slam();
  const cost = a.specialCost(), segment = cost / SPECIAL_GAUGE_SEGMENTS;
  assert.equal(a.special, cost, 'activation retains the filled meter');
  assert.equal(a.specialReady(), false, 'a live Slam cannot be reactivated from its retained gauge');
  let previous = a.special, ticks = 0;
  while (a.specialActive && ticks++ < 180) {
    a._updateSpecial(STEP);
    assert.ok(a.special <= previous + 1e-10, 'the action-owned gauge never rises');
    previous = a.special;
  }
  assert.ok(ticks < 180, 'native Slam reaches its existing impact condition');
  assert.equal(impacts.length, 1);
  assert.ok(Math.abs(impacts[0] - segment) < 1e-8, 'the impact observes exactly one remaining segment');
  assert.equal(a.special, 0, 'the final segment is consumed when the native action ends');
  assert.equal(a.specialFrac(), 0, 'the existing HUD fraction reads the same actor meter');
});

test('a mid-action splat applies the existing Special Saver path to the remaining Slam gauge', async () => {
  const { a } = await slam({ land: false });
  for (let i = 0; i < 36; i++) a._updateSpecial(STEP);
  const before = a.special;
  assert.ok(before > 0 && before < a.specialCost(), 'the live Slam owns a partially depleted gauge');
  a.splat(null);
  assert.equal(a.special, before * 0.5, 'the existing default Special Saver loss is applied to the actual remainder');
  assert.equal(a.specialActive, null);
});

test('the existing fall-impact timeout also completes the action-owned gauge', async () => {
  const { a, impacts } = await slam({ land: false });
  const segment = a.specialCost() / SPECIAL_GAUGE_SEGMENTS;
  let ticks = 0;
  while (a.specialActive && ticks++ < 180) a._updateSpecial(STEP);
  assert.ok(ticks < 180);
  assert.equal(impacts.length, 1);
  assert.ok(Math.abs(impacts[0] - segment) < 1e-8);
  assert.equal(a.special, 0);
});

test('the action-owned gauge trace is identical at 30/60/120 Hz render cadence', async () => {
  const histories = [];
  for (const hz of [30, 60, 120]) {
    const { a, impacts } = await slam();
    const clock = new FixedClock(), trace = [];
    for (let frame = 0; frame < hz * 3 && a.specialActive; frame++) {
      clock.advance(1 / hz, dt => {
        if (!a.specialActive) return;
        a._updateSpecial(dt);
        assert.ok(Math.abs(a.specialFrac() - a.special / a.specialCost()) < 1e-12);
        trace.push([a.specialActive?.phase ?? 'complete', a.special, a.specialFrac()]);
      });
    }
    assert.equal(a.special, 0);
    assert.equal(impacts.length, 1);
    histories.push(trace);
  }
  assert.deepEqual(histories[1], histories[0]);
  assert.deepEqual(histories[2], histories[0]);
});

test('Storm keeps its existing instant-consume behavior', async () => {
  const f = await fixture(), a = f.make('charger');
  assert.equal(a.weapon.special, 'storm');
  a.special = a.specialCost();
  f.G.projectiles.throwStorm = () => {};
  a._startSpecial();
  assert.equal(a.special, 0);
  assert.equal(a.specialActive.id, 'storm');
});
