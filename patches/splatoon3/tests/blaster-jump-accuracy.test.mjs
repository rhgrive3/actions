import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fixture } from './source-fixture.mjs';
import { adaptSource } from '../adapter.mjs';
import { gearCurve } from '../runtime/gear.mjs';
import { adaptRange } from '../../practice-range/adapter.mjs';
import { compose as composePracticeRange } from '../../practice-range/tests/harness.mjs';

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
  // #1102: leaving a ledge must NOT activate Blaster jump accuracy. The
  // native jump owner increments s3JumpSerial only for an actual jump.
  a.grounded = false; a.s3JumpSerial = (a.s3JumpSerial || 0) + 1;
  f.tick(a); // explicit jump edge frame
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

  a.grounded = false; a.s3JumpSerial = (a.s3JumpSerial || 0) + 1;
  f.tick(a);
  const s = state(a);
  assert.equal(s.active, true, 'a live jump-accuracy state after leaving the ground');
  assert.equal(s.frames, 0, 'state starts on the jump edge');
  close(s.envelope, 10, 'airborne angular endpoint stays the sourced maximum');
  close(s.bias, BIAS_MAX, 'outer-reticle bias starts at Jump_DegBiasMax');
  assert.equal(s.phase, 'held', 'the sourced initial state is held through 25F');
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
  assert.equal(state(a).phase, 'held', '25F is still the initial hold boundary');
  airborne(f, a, 1);
  assert.equal(state(a).phase, 'recovering', 'the separate HUD cue marks recovery after 25F');
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
  close(after.envelope, 10, 'the HUD keeps the sourced outer envelope while bias recovers');
  close(a.weaponRunner.spread, 10, 'landing does not shrink the rendered outer envelope early');

  a.grounded = true; airborne(f, a, END_F - 31);   // finish the sourced timeline on the ground
  assert.equal(state(a).active, false, 'state completes at the sourced endpoint');
  assert.equal(a.weaponRunner._spreadDeg(a.weapon), a.weapon.spreadGround, 'back to the grounded endpoint');
});

test('#684 extended airtime preserves the outer envelope while the independent bias recovers', async () => {
  const f = await fixture();
  const a = jump(f, f.make('blaster'));
  airborne(f, a, START_F);
  const at25 = state(a);
  airborne(f, a, 5);  const at30 = state(a);
  airborne(f, a, 30); const at60 = state(a);
  airborne(f, a, 10); const at70 = state(a);
  assert.ok(at25.bias > at30.bias && at30.bias > at60.bias && at60.bias > at70.bias,
    `outer-shot bias must recover: ${[at25.bias, at30.bias, at60.bias, at70.bias]}`);
  for (const sample of [at25, at30, at60, at70]) close(sample.envelope, 10, 'outer envelope stays at the sourced endpoint');
  close(at70.bias, 0, 'bias reaches the sourced recovered endpoint');
  assert.equal(at70.phase, 'recovered', 'the separate HUD presentation reaches its recovery endpoint');
  close(a.weaponRunner.spread, 10, 'HUD continues to display the actual outer envelope');
  assert.equal(a.grounded, false, 'still airborne past the endpoint');
});

test('#684 HUD renders the 10-degree outer envelope and a separate bias cue from the authoritative state', async () => {
  const f = await fixture();
  const a = f.make('blaster'); a.isLocal = true;
  jump(f, a);
  airborne(f, a, 30);
  const s = state(a);
  // main.js projects runner.spread to screen pixels; hud.js scales the outer ring
  // from that projection. It must remain the real outer envelope, not its 5-degree
  // bias-weighted expectation. Bias is rendered independently by the owned adapter.
  close(a.weaponRunner.spread, s.envelope, 'HUD spread is the full sourced outer envelope');
  close(a.weaponRunner._spreadDeg(a.weapon), s.envelope, 'runner spread matches the firing envelope');
  assert.equal(s.phase, 'recovering', 'the current bias is visibly in its recovery phase');

  const hudSource = fs.readFileSync(new URL('../../../inkwave-public/src/ui/hud.js', import.meta.url), 'utf8');
  const adaptedHud = adaptSource('src/ui/hud.js', hudSource);
  assert.doesNotThrow(() => new vm.SourceTextModule(adaptedHud), 'adapted HUD is valid module source');
  assert.ok(adaptedHud.includes('s3BlasterJumpState'), 'HUD reads the same runner state as the sampler');
  assert.ok(adaptedHud.includes("cuePhase === 'held' ? `OUTER ${percent}%`"), 'HUD presents the sourced initial outer-shot bias');
  assert.ok(adaptedHud.includes("cuePhase === 'recovering' ? 'RECOVERING'"), 'HUD presents recovery without inventing an intermediate probability law');
  assert.ok(adaptedHud.includes('this._blasterBiasEl.textContent = cue;'), 'HUD renders the current bias value');
  assert.ok(adaptedHud.includes('this._blasterBiasEl.dataset.phase = cuePhase'), 'HUD presents hold/recovery phase separately');
  const mainSource = fs.readFileSync(new URL('../../../inkwave-public/src/main.js', import.meta.url), 'utf8');
  assert.ok(mainSource.includes('const coneDeg = a.weaponRunner.spread'), 'native main projects the runtime envelope into the HUD');
  const s3Css = fs.readFileSync(new URL('../ui.css', import.meta.url), 'utf8');
  assert.ok(s3Css.includes('.iw-ret--blaster .iw-ret__bias'), 'the owned stylesheet presents the independent bias cue');

  const { Projectiles, THREE } = f;
  const ps = Object.create(Projectiles.prototype);
  ps._muzzle = (actor, out) => out.set(0, 0, 0);
  ps._aimFrom = (actor, muzzle, out) => out.set(0, 0, 1);
  ps._new = () => ({ pos: new THREE.Vector3(), prev: new THREE.Vector3(), start: new THREE.Vector3(), vel: new THREE.Vector3() });
  const owners = [], deviations = [];
  ps._push = p => {
    owners.push(p.owner);
    const v = p.vel.clone().normalize();
    deviations.push(Math.acos(Math.max(-1, Math.min(1, v.z))) * 180 / Math.PI);
  };
  a._nearCamera = () => false;
  const remote = f.make('blaster'); remote.isLocal = false; remote._nearCamera = () => false;
  jump(f, remote); airborne(f, remote, 30);
  const randomSequence = values => {
    let i = 0;
    f.setRandom(() => values[Math.min(i++, values.length - 1)]);
  };

  // First draw chooses outer/inner. The composed family spread owner then gets
  // radius=1 and azimuth=0, so the actual projectile deviation equals the chosen envelope.
  randomSequence([0.1, 1, 0]);             // 0.1 < bias -> outer reticle
  ps.fireBlaster(a, a.weapon, 999);
  close(deviations.at(-1), s.envelope, 'outer draw uses the full airborne envelope', 1e-6);
  randomSequence([0.1, 1, 0]);
  ps.fireBlaster(remote, remote.weapon, 999);
  close(deviations.at(-1), state(remote).envelope, 'remote owner also uses its own full outer envelope', 1e-6);
  assert.equal(owners[0], a, 'native projectile keeps its local owner');
  assert.equal(owners[1], remote, 'native projectile keeps its remote owner');
  randomSequence([0.9, 1, 0]);             // 0.9 >= bias -> grounded endpoint
  ps.fireBlaster(a, a.weapon, 999);
  close(deviations.at(-1), s.ground, 'inner draw stays on the grounded endpoint', 1e-6);
  f.restoreRandom();
  assert.notEqual(s.bias, 0.5, 'mid-recovery bias is below the initial maximum');

  // Past the endpoint the bias is 0, so no draw can reach the outer envelope.
  airborne(f, a, END_F - 30);
  randomSequence([0, 1, 0]);
  ps.fireBlaster(a, a.weapon, 999);
  close(deviations.at(-1), a.weapon.spreadGround, 'recovered state always uses the grounded endpoint', 1e-6);
  f.restoreRandom();
});

test('#684 equipped Intensify Action scales the jump envelope without changing bias timing', async () => {
  const f = await fixture();
  const a = f.make('blaster');
  a.s3.loadout = Array.from({ length: 3 }, (_, i) => ({ main: i === 0 ? 'actionIntensify' : 'none', subs: ['none', 'none', 'none'] }));
  a.setWeapon('blaster');
  const expectedAir = 10 * (1 - gearCurve(10, 0, 0.5, 1));
  const jumping = jump(f, a);
  const initial = state(jumping);
  close(initial.bias, BIAS_MAX, 'gear does not alter the initial sourced bias');
  close(initial.envelope, expectedAir, 'gear scales the real outer envelope');
  close(jumping.weaponRunner.spread, expectedAir, 'HUD uses the same gear-scaled outer envelope');
  assert.equal(a.weapon.spreadGround, 0, 'gear scaling does not move the grounded endpoint');
  airborne(f, jumping, 24);
  close(state(jumping).bias, BIAS_MAX, 'the 25F boundary is untouched by gear');
  close(state(jumping).envelope, expectedAir, 'the full envelope follows Action Intensify scaling');
  airborne(f, jumping, 1);
  close(state(jumping).bias, BIAS_MAX, 'recovery still starts at 25F');
  airborne(f, jumping, END_F - START_F);
  close(state(jumping).bias, 0, 'recovery still ends at 70F');
});

test('#684 Blaster fields stay namespaced beside the existing Shooter update/reset owner', async () => {
  const f = await fixture();
  const a = jump(f, f.make('blaster'));
  const r = a.weaponRunner;
  r.s3WasGrounded = true;        // Shooter #98 state owner
  r.s3JumpSpreadAge = 0.4;       // Shooter #98 recovery clock
  r.s3BlasterJumpT = 12 / HZ;
  a.grounded = true;
  a.weapon = f.WEAPONS.shooter;  // exercise the non-Blaster branch without setWeapon/reset
  f.tick(a);
  assert.equal(r.s3WasGrounded, true, 'Shooter keeps ownership of its grounded marker');
  close(r.s3JumpSpreadAge, 0.4 + STEP, 'Shooter advances its own recovery clock');
  assert.equal(r.s3BlasterJumpT, null, 'leaving Blaster clears only Blaster elapsed state');
  assert.equal(r.s3BlasterWasGrounded, false, 'Blaster edge marker has its own namespace');

  r.s3WasGrounded = false;
  r.s3JumpSpreadAge = 0.4;
  r.reset();
  assert.equal(r.s3WasGrounded, true, 'shared reset restores the current Shooter grounded marker');
  assert.equal(r.s3JumpSpreadAge, null, 'shared reset clears the Shooter recovery clock through its existing owner');
  assert.equal(r.s3BlasterWasGrounded, false, 'shared reset also clears the separate Blaster edge marker');
});

test('#684 the accuracy timeline follows the fixed simulation clock, not the render cadence', async () => {
  const f = await fixture();
  // Same jump edge, then exactly 0.5 s of recovery accumulated in different
  // step sizes: the state must be a function of simulated time, not of frames.
  const run = (steps, dt) => {
    const a = f.make('blaster'); a.grounded = true; a.weaponRunner.update(STEP, { fire: false });
    a.grounded = false; a.s3JumpSerial = (a.s3JumpSerial || 0) + 1;
    a.weaponRunner.update(STEP, { fire: false });
    for (let i = 0; i < steps; i++) a.weaponRunner.update(dt, { fire: false });
    return a;
  };
  const slow = run(15, 1 / 30);                       // 15/30 s at 30 Hz
  const fast = run(30, STEP);                         // 30/60 s at 60 Hz
  const faster = run(60, 1 / 120);                    // 60/120 s at 120 Hz
  const b30 = state(slow).bias, b60 = state(fast).bias, b120 = state(faster).bias;
  assert.ok(b30 > 0 && b30 < BIAS_MAX, `mid-recovery at 0.5 s: ${b30}`);
  close(b30, b60, '30 Hz and 60 Hz give the same bias at equal simulated age', 1e-9);
  close(b30, b120, '30 Hz and 120 Hz give the same bias at equal simulated age', 1e-9);
  close(state(slow).frames, 30, 'age is measured in simulation seconds, not render frames', 1e-6);
});

test('#684 the Practice Range source composition keeps the same Blaster envelope and bias state', async () => {
  const f = await fixture({ adapt: composePracticeRange, adaptRuntime: adaptRange });
  const a = jump(f, f.make('blaster'));
  const s = state(a);
  close(s.envelope, 10, 'the Range-composed runner keeps the sourced outer envelope');
  close(s.bias, BIAS_MAX, 'the Range-composed runner keeps the sourced initial bias');
  close(a.weaponRunner.spread, 10, 'the Range-composed HUD value is the true outer envelope');
});

// #1102: walking off a ledge is not a jump. The Blaster jump-accuracy state is
// admitted only by the native jump serial, so a ledge fall must keep the sourced
// grounded 0-degree cone and must not publish the 10-degree airborne envelope.
const walkOff = (f, a, frames) => {
  f.tick(a, 2); a.grounded = true; f.tick(a, 2);
  a.grounded = false;                          // no s3JumpSerial increment: a fall, not a jump
  return airborne(f, a, frames);
};

test('#1102 walking off a ledge without a jump keeps the grounded 0-degree cone at 30/60/120 Hz', async () => {
  const f = await fixture();
  for (const hz of [30, 60, 120]) {
    const dt = 1 / hz;
    const a = f.make('blaster'); a.grounded = true; a.weaponRunner.update(dt, { fire: false });
    a.grounded = false;                        // leave the ledge without any jump input
    for (let i = 0; i < Math.round(hz * 1.5); i++) {
      a.weaponRunner.update(dt, { fire: false });
      assert.equal(state(a).active, false, `${hz} Hz: no Blaster jump-accuracy state after a fall`);
      assert.equal(a.weaponRunner._spreadDeg(a.weapon), 0, `${hz} Hz: fall keeps the grounded 0-degree cone`);
      assert.equal(a.weaponRunner.spread, 0, `${hz} Hz: the runner publishes the grounded cone`);
    }
  }
});

test('#1102 a real jump and a ledge fall from the same platform diverge: only the jump owns the 10-degree state', async () => {
  const f = await fixture();
  const walker = walkOff(f, f.make('blaster'), 30);
  const jumper = jump(f, f.make('blaster'));
  airborne(f, jumper, 30);
  assert.equal(state(walker).active, false, 'walking off starts no jump-accuracy timer');
  assert.equal(walker.weaponRunner.spread, 0, 'walking off keeps the 0-degree grounded cone');
  assert.equal(state(jumper).active, true, 'the actual jump still starts its timer');
  close(state(jumper).envelope, 10, 'the actual jump keeps the sourced 10-degree envelope');
  close(state(jumper).bias, BIAS_MAX * (END_F - 30) / (END_F - START_F), 'the actual jump keeps the sourced 25F-70F recovery at 30F', 1e-9);
});

test('#1102 Intensify Action does not turn a non-jump ledge fall into an accuracy penalty', async () => {
  const f = await fixture();
  const a = f.make('blaster');
  a.s3.loadout = Array.from({ length: 3 }, (_, i) => ({ main: i === 0 ? 'actionIntensify' : 'none', subs: ['none', 'none', 'none'] }));
  a.setWeapon('blaster');
  walkOff(f, a, END_F);
  assert.equal(state(a).active, false, 'gear does not create a jump state from a fall');
  assert.equal(a.weaponRunner._spreadDeg(a.weapon), 0, 'gear does not widen a fall');
  assert.equal(a.weaponRunner.spread, 0, 'HUD cone stays grounded after a fall');
});

test('#1102 a shot fired during a ledge fall is drawn on the grounded cone', async () => {
  const f = await fixture();
  const { Projectiles, THREE } = f;
  const ps = Object.create(Projectiles.prototype);
  ps._muzzle = (actor, out) => out.set(0, 0, 0);
  ps._aimFrom = (actor, muzzle, out) => out.set(0, 0, 1);
  ps._new = () => ({ pos: new THREE.Vector3(), prev: new THREE.Vector3(), start: new THREE.Vector3(), vel: new THREE.Vector3() });
  const deviations = [];
  ps._push = p => {
    const v = p.vel.clone().normalize();
    deviations.push(Math.acos(Math.max(-1, Math.min(1, v.z))) * 180 / Math.PI);
  };
  const a = walkOff(f, f.make('blaster'), 20);
  // Fire through the same value the runner publishes, with the draw sequence that
  // maximises any non-zero cone, so a leaked 10-degree envelope would be visible.
  f.setRandom(() => 1);
  ps.fireBlaster(a, a.weapon, a.weaponRunner._spreadDeg(a.weapon));
  f.restoreRandom();
  close(deviations.at(-1), 0, 'a fall shot leaves the muzzle on the grounded 0-degree cone', 1e-6);
});
