import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, RATES } from './zipcaster-vfx-cadence-harness.mjs';

// Captured by executing frozen main 726e338ac's actual frame method for 2s
// at 60 Hz, LCG seed 23. Hashes cover emitted arguments in RNG order, not pixels.
const native = {
  hookFlight: { drops: 69, coat: 12, randomCalls: 363, hash: 'b3041f373dd6c785bfae0021012b466e34d642129ee40cbef316746361222786' },
  zip: { drops: 240, coat: 12, randomCalls: 756, hash: 'd821b3eca65fe11ae8b3398f2df3ba841acd946f89131028fd54033244c32f68' },
  active: { drops: 0, coat: 12, randomCalls: 36, hash: '66233f6f78b17af1cd437d8b2ed66d9c56f4c8974e33450c7ead77b2b04e7822' },
};
for (const hz of RATES) {
  test(`actual Zipcaster recipe preserves native opportunity/RNG sequence at ${hz} Hz`, () => {
    for (const phase of Object.keys(native)) {
      assert.deepEqual(harness().run(hz, 2, phase).summary(), native[phase], phase);
    }
    for (const [phase, drops] of [['hookFlight', 60], ['zip', 120]]) {
      const f = harness({ random: () => .25 }).run(hz, 1, phase);
      assert.equal(f.summary().drops, drops);
      assert.equal(f.summary().coat, 6);
      assert.equal(f.beams.length, 1, 'one reused ink strand');
      if (phase === 'zip') {
        assert.equal(f.ribbons.length, 1);
        assert.equal(f.pushes.length, hz, 'ribbon follows every render frame');
      }
    }
  });
  test(`phase boundaries sample only the live state and retain coat cadence at ${hz} Hz`, () => {
    const f = harness();
    for (const phase of ['active', 'hookFlight', 'zip', 'active', 'hookFlight', 'zip']) {
      f.run(hz, .5, phase);
      if (phase === 'active' && f.beams.length) {
        assert.equal(f.track.d.line.v[11], 0);
        assert.equal(f.track.d.trail, null);
        assert.equal(f.ribbons.at(-1).ended, true);
      }
    }
    assert.deepEqual(f.summary(), { drops: 156, coat: 18, randomCalls: 582,
      hash: 'a66f83cc5b991033cc4f3e4a27922e3f30fad5eac57387a6de873df72fc2391b' });
    assert.equal(f.beams.length, 1);
    assert.equal(f.ribbons.length, 2, 'retired trail is replaced on the next zip');
  });
}

test('jitter, sub-tick phase changes and missing targets do not replay stale spray', () => {
  const f = harness({ random: () => .25 });
  f.step(1 / 240);
  assert.equal(f.rows.length, 0);
  f.actor._s3AllSpecialState.phase = 'zip';
  f.step(1 / 240);
  f.actor._s3AllSpecialState.phase = 'active';
  f.step(1 / 120);
  assert.equal(f.rows.length, 0, 'native opportunity observes active, not the earlier hook/zip');
  assert.equal(f.track.d.line.v[11], 0);
  assert.equal(f.ribbons[0].ended, true);
  f.actor._s3AllSpecialState.phase = 'zip';
  f.actor._s3AllSpecialState.zipTarget = null;
  f.step(1 / 60);
  assert.equal(f.rows.length, 0, 'no target means no hook or zip drops');
  assert.equal(f.track.d.trail, null);
  f.actor._s3AllSpecialState = null;
  f.step(1 / 60);
  assert.equal(f.rows.length, 0);

  const jitter = harness();
  for (let i = 0; i < 120; i++) { jitter.step(1 / 240); jitter.step(1 / 80); }
  assert.deepEqual(jitter.summary(), native.hookFlight);
});

test('zero/invalid dt consume no opportunity, RNG or carry; stalls have bounded catch-up', () => {
  const f = harness({ random: () => .25 });
  f.actor._s3AllSpecialState.phase = 'zip';
  f.step(1 / 240);
  const carry = f.track.d.zipVfxCarry, acc = f.track.acc;
  for (const dt of [0, -1, NaN, Infinity, -Infinity, undefined, null, '0.1']) {
    f.step(dt);
    assert.equal(f.rows.length, 0);
    assert.equal(f.randomCalls(), 0);
    assert.equal(f.track.d.zipVfxCarry, carry);
    assert.equal(f.track.acc, acc);
  }
  f.step(1 / 80);
  assert.equal(f.summary().drops, 2, 'fraction survives invalid deltas');
  for (const dt of [.1, 5, Number.MAX_VALUE]) {
    const before = f.summary().drops;
    f.step(dt);
    assert.equal(f.summary().drops - before, 4, 'at most two native opportunities');
    const after = f.summary().drops;
    f.step(1 / 60);
    assert.equal(f.summary().drops - after, 2, 'no stall backlog on next frame');
    assert.ok(f.track.d.zipVfxCarry >= 0 && f.track.d.zipVfxCarry < 1);
  }
  const fresh = harness({ random: () => .25 });
  fresh.step(1 / 240);
  assert.equal(fresh.rows.length, 0, 'new track has no carry from retired track');
});

test('beam endpoints, line thickness, trail options and native zip-velocity droplets stay calibrated', () => {
  const f = harness({ random: () => .25 });
  f.step(0);
  assert.deepEqual(f.track.d.line.update, [{ x: 1, y: 3.2, z: 3 }, { x: 1, y: 3.025, z: 13.5 }, .048, .06, 1]);
  f.actor._s3AllSpecialState.phase = 'zip';
  f.step(1 / 60);
  assert.deepEqual(f.track.d.line.update, [{ x: 1, y: 3.2, z: 3 }, { x: 1, y: 3, z: 15 }, .1 * .8, .1, 1]);
  assert.deepEqual(f.ribbons[0].args[1], { width: .8, widthTail: .15, color: [.7, .2, .1], alpha: 1, style: 1, life: .25, spacing: .15 });
  assert.deepEqual(f.rows[0].slice(2), [-2.4, -.6, -1.2, .35, .08, [.7, .2, .1], { drag: 3, grav: 8, stretch: .06 }]);
  const before = JSON.stringify(f.actor);
  f.run(240, 2, 'zip');
  assert.equal(JSON.stringify(f.actor), before, 'presentation never authors actor movement or native phase clocks');
});
