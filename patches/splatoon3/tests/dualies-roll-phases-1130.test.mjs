import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STANDARD_DUALIES_PHASES, activeDualiesRollDistance, dodgeIntervalDistance,
  beginDualiesRoll, beginDualiesPostSlide,
} from '../runtime/movement-physics.mjs';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} !== ${expected}`);
const standard = { kind: 'dualies', rollDist: 5, rollTime: .2 };

test('S3 11.3 standard Dualies: 4WU core + 1WU glide, never five WU inside the 12F roll', () => {
  assert.equal(activeDualiesRollDistance(standard), 4);
  assert.equal(STANDARD_DUALIES_PHASES.slideDistance, 1);
  assert.equal(STANDARD_DUALIES_PHASES.slideTime, 4 / 60);
  for (const hz of [30, 60, 120]) {
    let core = 0, glide = 0;
    for (let t = 0; t < 12 / 60 - 1e-9; t += 1 / hz)
      core += dodgeIntervalDistance(activeDualiesRollDistance(standard), 12 / 60, t, 1 / hz);
    for (let t = 0; t < 4 / 60 - 1e-9; t += 1 / hz)
      glide += dodgeIntervalDistance(STANDARD_DUALIES_PHASES.slideDistance, 4 / 60, t, 1 / hz);
    near(core, 4); near(glide, 1); near(core + glide, 5);
  }
});

test('admitted aerial dodge starts a bounded downward dive; no unsupported side effects on grounded fixtures', () => {
  const a = { weapon: standard, grounded: false, vel: { x: 0, y: 4, z: 0 } };
  const r = { a, s3DualiesGlide: { elapsed: .01 } };
  beginDualiesRoll(r);
  assert.equal(r.s3DualiesGlide, null);
  assert.equal(a.vel.y, -8);
  a.vel.y = -12;
  beginDualiesRoll(r);
  assert.equal(a.vel.y, -12, 'do not erase faster downward velocity');
  a.grounded = true; a.vel.y = 0; beginDualiesRoll(r);
  assert.equal(a.vel.y, 0, 'grounded start does not create an airborne dive');
});

test('only the sourced standard 5WU Dualies roll receives a distinct 1WU post-roll slide', () => {
  const runner = { a: { weapon: standard } };
  beginDualiesPostSlide(runner, standard);
  assert.deepEqual(runner.s3DualiesGlide, { elapsed: 0, duration: 4 / 60, distance: 1 });
  const custom = { kind: 'dualies', rollDist: 2.8 };
  assert.equal(activeDualiesRollDistance(custom), 2.8);
  beginDualiesPostSlide(runner, custom);
  assert.equal(runner.s3DualiesGlide, null, 'other dualies must not inherit an unsourced default');
});
