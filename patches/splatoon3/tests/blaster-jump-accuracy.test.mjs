import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

// #684: the S3 Blaster carries a jump-accuracy state on the fixed simulation
// clock — recovery starts at Jump_DegBiasDecreaseStartFrame (25F), reaches its
// endpoint at Jump_DegBiasEndFrame (70F), and the initial outer-reticle bias is
// Jump_DegBiasMax (0.5). Only those sourced endpoints/boundaries are asserted.
// The curve between them is NOT a sourced Nintendo value, so these tests assert
// monotonicity and the boundaries only and never a specific intermediate value.
const STEP = 1 / 60;
const HZ = 60;
const START_F = 25, END_F = 70, BIAS_MAX = 0.5;
const close = (actual, expected, label, eps = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= eps, `${label}: ${actual} != ${expected}`);

const blasterSource = f => f.profile.weaponsFidelityCompletion.weapons.blaster.WeaponParam;
const state = (a) => a.weaponRunner.s3BlasterJumpState(a.weapon);

// grounded frame(s) first so the runner has seen the ground, then leave it.
function jump(f, a) {
  f.tick(a, 2);
  a.grounded = true; f.tick(a, 2);
  a.grounded = false; f.tick(a);          // leave-ground edge frame
  return a;
}
function airborne(f, a, frames) { for (let i = 0; i < frames; i++) f.tick(a); return a; }

test('#684 pinned source boundaries are the values under test', async () => {
  const f = await fixture();
  const src = blasterSource(f);
  assert.equal(src.Jump_DegBiasDecreaseStartFrame, START_F, 'sourced recovery start frame');
  assert.equal(src.Jump_DegBiasEndFrame, END_F, 'sourced recovered endpoint frame');
  assert.equal(src.Jump_DegBiasMax, BIAS_MAX, 'sourced initial outer-reticle bias');
  assert.equal(src.Stand_DegSwerve, 0, 'grounded endpoint stays 0');
});

test('#684 grounded endpoint stays 0 and the jump edge starts the bias state at 0.5', async () => {
  const f = await fixture();
  const a = f.make('blaster');
  f.tick(a, 2); a.grounded = true; f.tick(a, 2);
  assert.equal(a.weapon.spreadGround, 0, 'grounded endpoint');
  assert.equal(a.weapon.spreadAir, 10, 'airborne envelope');
  assert.equal(a.weaponRunner._spreadDeg(a.weapon), 0, 'grounded cone');
  assert.equal(state(a).active, false, 'no jump-accuracy state while grounded');

  a.grounded = false; f.tick(a);
  const s = state(a);
  assert.equal(s.active, true, 'a live jump-accuracy state after leaving the ground');
  assert.equal(s.frames, 0, 'state starts on the jump edge');
  close(s.envelope, 10, 'airborne angular endpoint stays the sourced maximum');
  close(s.bias, BIAS_MAX, 'outer-reticle bias starts at Jump_DegBiasMax');
  close(s.cone, 5, 'expected cone is the bias-weighted endpoint');
});

test('#684 no recovery begins before the sourced 25F boundary', async () => {
  const f = await fixture();
  const a = jump(f, f.make('blaster'));
  airborne(f, a, 24);                       // 24 frames after the edge
  close(state(a).frames, 24, 'age at 24F', 1e-6);
  close(state(a).bias, BIAS_MAX, 'bias is unchanged at 24F');
  airborne(f, a, 1);                        // 25F
  close(state(a).frames, START_F, 'age at 25F', 1e-6);
  close(state(a).bias, BIAS_MAX, 'bias is unchanged at the sourced 25F boundary');
});

test('#684 recovery begins after 25F, is monotone, and ends at the sourced 70F endpoint', async () => {
  const f = await fixture();
  const a = jump(f, f.make('blaster'));
  airborne(f, a, START_F);                  // hold: 0..25F
  const samples = [];
  for (let frame = START_F + 1; frame <= END_F; frame++) {
    airborne(f, a, 1);
    const s = state(a);
    close(s.frames, frame, `age at ${frame}F`, 1e-6);
    samples.push(s.bias);
  }
  assert.ok(samples[0] < BIAS_MAX, 'recovery has begun just after 25F');
  for (let i = 1; i < samples.length; i++)
    assert.ok(samples[i] <= samples[i - 1] + 1e-12, `bias must not increase (frame ${START_F + 1 + i})`);
  close(samples.at(-1), 0, 'bias reaches the recovered endpoint at 70F');
  // No intermediate value is asserted: the ramp is a documented placeholder.
});

test('#684 landing before 70F keeps the remaining jump-accuracy state', async () => {
  const f = await fixture();
  const a = jump(f, f.make('blaster'));
  airborne(f, a, 30);                       // 30F airborne
  const before = state(a);
  close(before.bias, BIAS_MAX * (END_F - 30) / (END_F - START_F), 'bias at 30F');

  a.grounded = true; f.tick(a, 1);          // land well before 70F
  const after = state(a);
  assert.equal(after.active, true, 'landing does not erase the remaining state');
  assert.ok(after.bias > 0, 'remaining bias is preserved after landing');
  assert.ok(after.bias <= before.bias + 1e-12, 'bias keeps decreasing, never jumps up');
  assert.ok(after.cone > 0, 'the reticle cone is not snapped back to the grounded endpoint');

  a.grounded = true; airborne(f, a, END_F - 31);   // finish the sourced timeline on the ground
  assert.equal(state(a).active, false, 'state completes at the sourced endpoint');
  assert.equal(a.weaponRunner._spreadDeg(a.weapon), a.weapon.spreadGround, 'back to the grounded endpoint');
});

test('#684 extended airtime past 25F is not one fixed full-air state', async () => {
  const f = await fixture();
  const a = jump(f, f.make('blaster'));
  airborne(f, a, START_F);
  const at25 = state(a).cone;
  airborne(f, a, 5);  const at30 = state(a).cone;
  airborne(f, a, 30); const at60 = state(a).cone;
  airborne(f, a, 10); const at70 = state(a).cone;
  assert.ok(at25 > at30 && at30 > at60 && at60 > at70, `cone must keep recovering: ${[at25, at30, at60, at70]}`);
  close(at70, 0, 'recovered endpoint');
  assert.equal(a.grounded, false, 'still airborne past the endpoint');
});

test('#684 HUD cone and the projectile sampler consume the same authoritative state', async () => {
  const f = await fixture();
  const a = jump(f, f.make('blaster'));
  airborne(f, a, 30);
  const s = state(a);
  // The public runner publishes `spread`; main.js/hud.js render that value.
  close(a.weaponRunner.spread, s.cone, 'HUD spread is the authoritative cone');
  close(a.weaponRunner._spreadDeg(a.weapon), s.cone, 'spreadDeg is the same value');

  const { Projectiles, THREE } = f;
  const ps = Object.create(Projectiles.prototype);
  ps._muzzle = (actor, out) => out.set(0, 0, 0);
  ps._aimFrom = (actor, muzzle, out) => out.set(0, 0, 1);
  ps._new = () => ({ pos: new THREE.Vector3(), prev: new THREE.Vector3(), start: new THREE.Vector3(), vel: new THREE.Vector3() });
  ps._push = () => {};
  const seen = [];
  ps._spread = (dir, deg) => { seen.push(deg); return dir; };
  a._nearCamera = () => false;

  f.setRandom(() => 0.1);                  // 0.1 < bias -> outer reticle
  ps.fireBlaster(a, a.weapon, 999);
  close(seen.at(-1), s.envelope, 'outer draw uses the full airborne envelope');
  f.setRandom(() => 0.9);                  // 0.9 >= bias -> inner reticle
  ps.fireBlaster(a, a.weapon, 999);
  close(seen.at(-1), s.ground, 'inner draw stays on the grounded endpoint');
  f.restoreRandom();
  assert.notEqual(s.bias, 0.5, 'mid-recovery bias is below the initial maximum');

  // Past the endpoint the bias is 0, so no draw can reach the outer envelope.
  airborne(f, a, END_F - 30);
  f.setRandom(() => 0);
  ps.fireBlaster(a, a.weapon, 999);
  close(seen.at(-1), a.weapon.spreadGround, 'recovered state always uses the grounded endpoint');
  f.restoreRandom();
});

test('#684 Intensify Action scaling stays independent of the 25F->70F timing state', async () => {
  const f = await fixture();
  const a = jump(f, f.make('blaster'));
  // gear.mjs scales exactly this field for Intensify Action.
  a.weapon.spreadAir = 10 * 0.5;
  assert.equal(a.weapon.spreadGround, 0, 'gear scaling does not move the grounded endpoint');
  airborne(f, a, 24);
  close(state(a).bias, BIAS_MAX, 'the 25F boundary is untouched by gear');
  close(state(a).envelope, 5, 'the envelope follows the scaled airborne endpoint');
  airborne(f, a, 1);
  close(state(a).bias, BIAS_MAX, 'recovery still starts at 25F');
  airborne(f, a, END_F - START_F);
  close(state(a).bias, 0, 'recovery still ends at 70F');
});

test('#684 the accuracy timeline follows the fixed simulation clock, not the render cadence', async () => {
  const f = await fixture();
  // Same jump edge, then exactly 0.5 s of recovery accumulated in different
  // step sizes: the state must be a function of simulated time, not of frames.
  const run = (steps, dt) => {
    const a = f.make('blaster'); a.grounded = true; a.weaponRunner.update(STEP, { fire: false });
    a.grounded = false; a.weaponRunner.update(STEP, { fire: false });
    for (let i = 0; i < steps; i++) a.weaponRunner.update(dt, { fire: false });
    return a;
  };
  const slow = run(15, 1 / 30);                       // 15/30 s at 30 Hz
  const fast = run(30, STEP);                         // 30/60 s at 60 Hz
  const b30 = state(slow).bias, b60 = state(fast).bias;
  assert.ok(b30 > 0 && b30 < BIAS_MAX, `mid-recovery at 0.5 s: ${b30}`);
  close(b30, b60, 'same simulated age gives the same bias regardless of step size', 1e-9);
  close(state(slow).frames, 30, 'age is measured in simulation seconds, not render frames', 1e-6);
});
