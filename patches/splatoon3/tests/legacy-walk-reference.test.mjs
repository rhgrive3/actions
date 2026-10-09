import test from 'node:test';
import assert from 'node:assert/strict';
import { LEGACY_GAIT_INFO, LEGACY_GAIT_CHANNELS as C, sampleLegacyGait } from '../runtime/legacy-walk-curves.mjs';
import { weakDiagonalWalkTrace } from '../runtime/walk.mjs';
import { character } from './real-character-fixture.mjs';

const clip = (phase, x = 0, z = 1, aim = 0, run = 0) =>
  sampleLegacyGait(new Float32Array(14), phase, x, z, aim, run);
const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const distance = (a, b) => a.reduce((sum, value, i) => sum + Math.abs(value - b[i]), 0);

test('legacy source provenance is explicit; both 40F walk and 32F run use a single cyclical clock', () => {
  assert.equal(LEGACY_GAIT_INFO.game, 'Splatoon (Wii U)');
  assert.equal(LEGACY_GAIT_INFO.walkFrames, 40);
  assert.equal(LEGACY_GAIT_INFO.runFrames, 32);
  assert.equal(LEGACY_GAIT_INFO.calibratedRuntimeRate, false);
  for (const run of [0, 1]) for (const phase of [0, .17, .25, .73, 1.5]) {
    const a = clip(phase, .1, .9, .4, run);
    const b = clip(phase + 1, .1, .9, .4, run);
    const neg = clip(phase - 2, .1, .9, .4, run);
    a.forEach((v, i) => { close(v, b[i]); close(v, neg[i]); assert.ok(Number.isFinite(v)); assert.ok(Math.abs(v) < 2); });
  }
});

test('walking diagonal blends four source direction clips, not a faster procedural foot oscillator', () => {
  const front = clip(.28, 0, 1), left = clip(.28, 1, 0), right = clip(.28, -1, 0), back = clip(.28, 0, -1);
  const diag = clip(.28, Math.SQRT1_2, Math.SQRT1_2);
  for (let i = 0; i < diag.length; i++) close(diag[i], (front[i] + left[i]) * .5);
  assert.ok(distance(left, right) > .08, 'direction-dependent source clips');
  assert.ok(distance(front, back) > .08, 'backpedal has a separate source gait');
  assert.ok(distance(front, clip(.28, 0, 1, 1)) > .1, 'shooting locomotion uses a separate source clip');
  assert.ok(distance(front, clip(.28, 0, 1, 0, 1)) > .1, 'running uses a shorter source clip');
  assert.ok(distance(clip(.28, 0, 1, 0, 1), clip(.28, 0, 1, 1, 1)) > .1,
    'held run and shooting run use distinct 32-frame native reference clips');
  // Compare direction changes at the SAME clock phase. Comparing phase .21
  // with `front` at .28 above measured normal animation, not discontinuity.
  for (const phase of [0, .21, .28, .73, 1 - 1e-6]) {
    for (const [x, z] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const axis = clip(phase, x, z);
      for (const epsilon of [-1e-9, 0, 1e-9]) {
        const u = clip(phase, x || epsilon, z || epsilon);
        assert.ok(distance(u, axis) < 1e-6, 'no abrupt source pose at a diagonal sign crossing');
      }
    }
  }
});

test('loop joins do not snap joint samples at the reference wrap, including reverse and strafing', () => {
  for (const [x, z] of [[0, 1], [0, -1], [1, 0], [-1, 0], [.6, .8]]) {
    for (const run of [0, 1]) {
      const before = clip(1 - 1e-6, x, z, .4, run), after = clip(1e-6, x, z, .4, run);
      assert.ok(distance(before, after) < .005, 'continuous sampled reference near 0/1');
      const even = clip(.1, x, z, .4, run);
      assert.ok(Number.isFinite(even[C.footL]) && Number.isFinite(even[C.footR]));
    }
  }
});

async function walkAt(dx, dz, speed = .6, hz = 60, firing = false) {
  const { ch, state } = await character(), dt = 1 / hz;
  state.speed = speed;
  state.localMove = { x: dx, z: dz };
  state.firing = firing;
  let contacts = 0, swinging = 0, phase = null;
  const phases = [], cadence = [], gaits = [], geometry = [];
  try {
    for (let k = 0; k < hz * 2; k++) {
      const before = ch.feet.map(f => ({ planted: f.planted, x: f.pw.x, z: f.pw.z }));
      ch.root.position.x += dx * speed * dt;
      ch.root.position.z += dz * speed * dt;
      ch.update(dt, state);
      for (let i = 0; i < 2; i++) {
        const f = ch.feet[i];
        assert.ok(Number.isFinite(f.cw.x) && Number.isFinite(f.cw.y) && Number.isFinite(f.cw.z), 'finite foot world pose');
        assert.ok(Number.isFinite(f.pitch), 'finite ankle pitch');
        if (before[i].planted && f.planted) {
          close(f.pw.x, before[i].x, 1e-7);
          close(f.pw.z, before[i].z, 1e-7);
          contacts++;
        }
        if (f.sw) swinging++;
      }
      assert.ok(Number.isFinite(ch.cad) && Number.isFinite(ch.hipTwist));
      phases.push(ch.phase); cadence.push(ch.cad); gaits.push(ch.gaitW);
      geometry.push(ch.feet.map(f => [f.cw.x, f.cw.y, f.cw.z, f.pitch]));
      if (phase !== null && ch.gaitW > .95) assert.ok(ch.phase >= phase - .001, 'single monotone gait phase');
      phase = ch.phase;
    }
    return { contacts, swinging, cadence: cadence.slice(-20), gait: gaits.at(-1), phases, geometry };
  } finally {
    ch.dispose();
  }
}

test('real Character keeps weak diagonal cadence matched to forward travel, with planted feet world-locked', async () => {
  const forward = await walkAt(0, 1, .6);
  const diagonal = await walkAt(Math.SQRT1_2, Math.SQRT1_2, .6);
  const sideways = await walkAt(1, 0, .6);
  const average = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
  const a = average(forward.cadence), b = average(diagonal.cadence), c = average(sideways.cadence);
  close(b, a, .025); close(c, a, .025);
  for (const result of [forward, diagonal, sideways]) {
    assert.ok(result.gait > .95, 'walking pose is active');
    assert.ok(result.contacts > 40, 'real feet spend time planted, not constantly skating');
    assert.ok(result.swinging > 10, 'the feet actually alternate steps');
  }
});

test('real Character remains finite in backwards, shooting, and 30/60/120 Hz sampled locomotion', async () => {
  for (const [x, z, aim, hz] of [[0, -1, false, 60], [1, 0, true, 60], [.6, .8, false, 30], [.6, .8, false, 120]]) {
    const result = await walkAt(x, z, .9, hz, aim);
    assert.ok(result.contacts > 20);
    assert.ok(result.phases.at(-1) > result.phases[0]);
  }
});


test('#997 weak-diagonal gait exposes per-tick reference and game-generation provenance without changing movement', () => {
  const ch={gv:.45,mdx:Math.SQRT1_2,mdz:Math.SQRT1_2,phase:.25,cad:1.2,duty:.64,hipTwist:.13,runW:.1};
  const before={...ch};
  const trace=weakDiagonalWalkTrace(ch);
  assert.equal(trace.referenceGame,'Splatoon (Wii U)');
  assert.equal(trace.s3CurveVerified,false);
  assert.equal(trace.legacyWalkFrames,40);
  assert.equal(trace.legacyRunFrames,32);
  assert.equal(trace.speed,.45);
  assert.equal(trace.phase,.25);
  assert.equal(trace.cadence,1.2);
  assert.equal(trace.pose.length,14);
  assert.ok(trace.pose.every(Number.isFinite));
  assert.deepEqual(ch,before,'diagnostics never retune actor or visual state');
});
