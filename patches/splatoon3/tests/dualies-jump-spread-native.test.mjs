// #887 — Splat Dualies jump-accuracy recovery on the real composed runtime.
//
// Pinned Ver.11.3.0 WeaponManeuverNormal publishes:
//   Stand_DegSwerve = 2, Jump_DegSwerve = 7.5,
//   Jump_DegBiasMax = 0.4,
//   Jump_DegBiasDecreaseStartFrame = 25, Jump_DegBiasEndFrame = 70.
// Per the Inkipedia data explanation the DegBias* fields are the hidden
// OUTER-RETICLE PROBABILITY (bias), while DegSwerve* are the deviation angles:
// the same 25F/70F window drives a per-shot selection, not an angle lerp.
// This mirrors the already-sourced Blaster jump-bias owner. The exact
// 25F->70F curve shape is NOT published; the linear recovery is the same
// repository-wide approximation, so these tests assert only the sourced
// boundaries/endpoints, that landing does not snap, turret independence, that
// HUD and projectile read the same state, and that render rate does not matter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';

const START_F = 25, END_F = 70;
const close = (actual, expected, label, eps = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= eps, `${label}: ${actual} != ${expected}`);
const round = v => Math.round(v * 1e9) / 1e9;
const bloomScale = a => {
  const first = a.weapon.spreadFirst ?? 0.45;
  return first + (1 - first) * a.weaponRunner.bloom;
};
const stateOf = a => a.weaponRunner.s3DualiesJumpState(a.weapon);

async function floorFixture() {
  const f = await fixture({ composeProductionAdapters: true });
  const { THREE, G } = f;
  const floor = {
    id: 0, solid: true, center: new THREE.Vector3(0, -0.1, 0), half: new THREE.Vector3(100, 0.1, 100),
    aabbMin: new THREE.Vector3(-100, -0.2, -100), aabbMax: new THREE.Vector3(100, 0, 100),
    axes: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)],
    faces: [-1, -1, -1, -1, -1, -1],
  };
  const level = {
    blocks: [floor], faces: [], groundHeight: () => 0,
    queryBlocks: (_x, _z, _xx, _zz, out) => { out.length = 0; out.push(0); return out; },
  };
  G.level = level;
  G.physics = new f.Physics(level);
  G.paint = { sample: () => 0, splat: () => 0 };
  G.match = { playing: () => true, canRespawn: () => false };
  G.camera = { position: new THREE.Vector3(0, 20, 0) };
  G.time = 0;
  const a = f.make('dualies', { nativeMovement: true });
  a.pos.set(0, 0, 0); a.vel.set(0, 0, 0); a.grounded = true;
  a.ground.hit = true; a.ground.y = 0; a.ground.block = 0; a.ground.face = -1; a.groundN.set(0, 1, 0);
  G.actors = [a];
  G.projectiles = new f.Projectiles(new THREE.Scene());
  return { ...f, a };
}
const jump = (f, a) => { a.intent.jump = true; f.tick(a); a.intent.jump = false; };
const angleDeg = (u, v) => Math.atan2(u.clone().cross(v).length(), u.dot(v)) * 180 / Math.PI;
// Fire one round with a scripted Math.random sequence and return its direction.
// seq[0] is the bias draw, seq[1] the radial draw (deviation = spread*sqrt(seq[1])),
// seq[2] the in-cone angle. A radial draw of 0 fires straight down the aim axis.
const fireDir = (f, a, seq) => {
  const ps = f.G.projectiles;
  let i = 0;
  f.setRandom(() => seq[Math.min(i++, seq.length - 1)]);
  ps.fireDualies(a, a.weapon, a.weaponRunner._spreadDeg(a.weapon), 0);
  f.restoreRandom();
  return ps.list.at(-1).vel.clone().normalize();
};

test('#887 pinned Dualies source boundaries and endpoints are the values under test', async () => {
  const f = await fixture();
  const src = f.profile.weaponsFidelityCompletion.weapons.dualies.WeaponParam;
  assert.equal(src.Jump_DegBiasDecreaseStartFrame, START_F, 'sourced recovery start frame');
  assert.equal(src.Jump_DegBiasEndFrame, END_F, 'sourced recovered endpoint frame');
  assert.equal(src.Jump_DegBiasMax, 0.4, 'sourced outer-reticle bias maximum');
  assert.equal(src.Jump_DegSwerve, 7.5, 'sourced airborne swerve endpoint');
  assert.equal(src.Stand_DegSwerve, 2, 'sourced grounded swerve endpoint');
  assert.equal(src.Stand_DegBiasMin, 0.01, 'sourced standing bias floor');
  assert.equal(f.WEAPONS.dualies.spreadAir, 7.5, 'runtime airborne envelope');
  assert.equal(f.WEAPONS.dualies.spreadGround, 2, 'runtime grounded endpoint');
  assert.equal(f.WEAPONS.dualies.spreadLock, 0, 'LapOver turret cone stays separate');
  close(f.WEAPONS.dualies.fireInterval, 5 / 60, 'sourced 5F normal cadence');
});

test('#887 the jump bias is a probability that holds 0.4 to 25F and reaches the normal endpoint at 70F', async () => {
  const f = await floorFixture(), { a } = f;
  const runner = a.weaponRunner;
  runner.s3DualiesJumpT = 0;
  let s = stateOf(a);
  assert.equal(s.active, true, 'clock active');
  assert.equal(s.bias, 0.4, 'Jump_DegBiasMax while held');
  assert.equal(s.phase, 'held');
  runner.s3DualiesJumpT = START_F / 60;
  s = stateOf(a);
  assert.equal(round(s.frames), START_F, '25F boundary');
  assert.equal(s.bias, 0.4, 'no recovery before the 25F boundary');
  assert.equal(s.phase, 'held', 'still held at the boundary');
  runner.s3DualiesJumpT = ((START_F + END_F) / 2) / 60;
  s = stateOf(a);
  assert.ok(s.bias > 0 && s.bias < 0.4, `mid-window bias strictly between: ${s.bias}`);
  assert.equal(s.phase, 'recovering');
  runner.s3DualiesJumpT = END_F / 60;
  s = stateOf(a);
  assert.equal(round(s.frames), END_F, '70F boundary');
  assert.equal(s.bias, 0, 'normal endpoint at the 70F boundary');
  assert.equal(s.phase, 'recovered');
  assert.equal(s.envelope, 7.5, 'outer envelope is still the sourced Jump_DegSwerve');
  assert.equal(s.ground, 2, 'normal endpoint is the sourced Stand_DegSwerve');
});

test('#887 stable grounded keeps the 2 endpoint, and a non-jump ledge fall keeps the 7.5 envelope', async () => {
  const f = await floorFixture(), { a } = f;
  a.weaponRunner.update(1 / 60, { fire: false });
  assert.equal(stateOf(a).active, false, 'no jump state while stable on the ground');
  close(a.weaponRunner.spread, a.weapon.spreadGround * bloomScale(a), 'grounded cone');
  // Generic loss of ground contact (walking off a ledge) is not an admitted jump
  // and must not start the jump-accuracy clock.
  a.grounded = false;
  a.weaponRunner.update(1 / 60, { fire: false });
  assert.equal(stateOf(a).active, false, 'a ledge fall does not start the clock');
  close(a.weaponRunner.spread, a.weapon.spreadAir * bloomScale(a), 'airborne envelope keeps 7.5');
});

test('#887 an admitted jump holds the outer envelope, then landing does not collapse it to the grounded endpoint', async () => {
  const f = await floorFixture(), { a } = f;
  jump(f, a);
  assert.equal(round(stateOf(a).frames), 0, 'jump edge starts a fresh clock');
  close(a.weaponRunner.spread, a.weapon.spreadAir * bloomScale(a), 'jump frame publishes the air envelope');
  let landing = null;
  for (let frame = 1; frame <= 120 && !landing; frame++) {
    const wasGrounded = a.grounded;
    f.tick(a);
    if (!wasGrounded && a.grounded) landing = { frame, state: stateOf(a), spread: a.weaponRunner.spread };
  }
  assert.ok(landing, 'the native double-jump lands on the in-memory floor');
  assert.ok(landing.state.active, 'landing before 70F keeps the jump-accuracy clock alive');
  assert.ok(landing.state.frames > START_F && landing.state.frames < END_F,
    `landing stays inside recovery: ${landing.state.frames}`);
  assert.equal(landing.state.envelope, 7.5, 'outer envelope is preserved after landing');
  assert.ok(landing.state.bias > 0, 'a positive bias remains after landing');
  close(landing.spread, a.weapon.spreadAir * bloomScale(a), 'first grounded frame does not collapse to the 2 endpoint');
  for (let frame = 0; frame < 120 && stateOf(a).active; frame++) f.tick(a);
  assert.equal(stateOf(a).active, false, 'grounded recovery completes and clears at the endpoint');
  close(a.weaponRunner.spread, a.weapon.spreadGround * bloomScale(a), 'normal endpoint after recovery');
});

test('#887 the fire-time bias selects the sourced swerve endpoint and the deviation law endpoints hold', async () => {
  const f = await floorFixture(), { a } = f;
  jump(f, a);
  a.aimYaw = 0; a.aimPitch = 0; a.aimDir.set(0, 0, 1); a.aimPoint.set(0, 1.05, 100);
  const bloom = bloomScale(a);
  const state = stateOf(a);
  assert.equal(state.bias, 0.4, 'held jump bias');
  const aim = fireDir(f, a, [0, 0, 0.5]);            // radial 0 => straight down the aim axis
  const outer = fireDir(f, a, [0, 0.5, 0.25]);       // bias draw 0 < 0.4 => Jump_DegSwerve
  const inner = fireDir(f, a, [0.9, 0.5, 0.25]);     // bias draw .9 > 0.4 => Stand_DegSwerve
  // spreadWeaponRound sets deviation = spread * sqrt(radial) in degrees.
  close(angleDeg(aim, outer), state.envelope * bloom * Math.sqrt(0.5), 'outer round uses Jump_DegSwerve', 1e-6);
  close(angleDeg(aim, inner), state.ground * bloom * Math.sqrt(0.5), 'normal round uses Stand_DegSwerve', 1e-6);
  close(angleDeg(aim, outer) / angleDeg(aim, inner), state.envelope / state.ground,
    'outer:normal deviation ratio is the sourced swerve ratio', 1e-6);
});

test('#887 the HUD scalar and the projectile cone read the same jump-accuracy state', async () => {
  const f = await floorFixture(), { a } = f;
  jump(f, a);
  f.tick(a, 30);
  const state = stateOf(a);
  assert.ok(state.active && state.frames > START_F && state.frames < END_F, 'sampled mid-recovery');
  close(a.weaponRunner.spread, state.envelope * bloomScale(a),
    'HUD scalar is the outer envelope while the bias is recovering');
  a.aimYaw = 0; a.aimPitch = 0; a.aimDir.set(0, 0, 1); a.aimPoint.set(0, 1.05, 100);
  const aim = fireDir(f, a, [0, 0, 0.5]);
  const round = fireDir(f, a, [0, 0.5, 0.25]);
  close(angleDeg(aim, round), a.weaponRunner.spread * Math.sqrt(0.5),
    'composed projectile cone equals the HUD recovery scalar', 1e-6);
});

test('#887 the LapOver turret cone stays independent of jump recovery', async () => {
  const f = await floorFixture(), { a } = f;
  jump(f, a);
  f.tick(a, 3);
  const runner = a.weaponRunner;
  runner.s3Turret = true;
  assert.equal(runner._spreadDeg(a.weapon), a.weapon.spreadLock, 'turret spreadLock wins while recovering');
  close(runner._spreadDeg(a.weapon), 0, 'LapOver_DegSwerve stays 0');
  const aim = fireDir(f, a, [0, 0, 0.5]);
  const turretRound = fireDir(f, a, [0, 0.5, 0.25]);
  close(angleDeg(aim, turretRound), 0, 'turret round stays on the LapOver 0 cone', 1e-9);
  runner.s3Turret = false;
  close(runner._spreadDeg(a.weapon), a.weapon.spreadAir * bloomScale(a), 'clearing turret restores the recovery envelope');
});

test('#887 reset, death and zero-time pause own the clock lifecycle', async () => {
  const f = await floorFixture(), { a } = f;
  jump(f, a);
  assert.equal(stateOf(a).active, true);
  const age = a.weaponRunner.s3DualiesJumpT;
  a.weaponRunner.update(0, { fire: false });
  assert.equal(a.weaponRunner.s3DualiesJumpT, age, 'a zero-time update does not advance the clock');
  a.splat(null);
  assert.equal(a.weaponRunner.s3DualiesJumpT, null, 'death clears the jump-accuracy clock');
  a.reset();
  assert.equal(a.weaponRunner.s3DualiesJumpT, null, 'actor reset does not inherit a prior life');
});

test('#887 the fix changes only spread: 5F cadence, ink and emission frames are untouched', async () => {
  const capture = async jumpRun => {
    const f = await floorFixture(), { a } = f;
    const rows = []; let last = 0;
    a.intent.fire = true;
    for (let frame = 0; frame < 180; frame++) {
      if (jumpRun && frame === 1) a.intent.jump = true;
      if (jumpRun && frame === 2) a.intent.jump = false;
      f.tick(a);
      const emitted = f.G.projectiles.list.length > last ? 1 : 0;
      last = f.G.projectiles.list.length;
      rows.push([emitted, +a.ink.toFixed(9), a.grounded === false && !!stateOf(a).active ? 1 : 0]);
    }
    return rows;
  };
  const withJump = await capture(true), noJump = await capture(false);
  assert.deepEqual(withJump.map(r => [r[0], r[1]]), noJump.map(r => [r[0], r[1]]),
    'jump recovery leaves emission frames and ink identical to the grounded run');
  assert.ok(withJump.some(r => r[2] === 1), 'the clock really was active during the jump run');
});

test('#887 30/60/120Hz render cadence shares one fixed-60Hz jump-accuracy trace', async () => {
  const run = async hz => {
    const f = await floorFixture(), { a } = f, clock = new FixedClock();
    const trace = [];
    const step = dt => {
      f.G.time += dt; a.update(dt); a.intent.jump = false;
      const t = a.weaponRunner.s3DualiesJumpT;
      trace.push([a.grounded, t == null ? null : +t.toFixed(9), +a.weaponRunner.spread.toFixed(9)]);
    };
    a.intent.jump = true;
    let rendered = 0;
    while (trace.length < 100 && rendered++ < hz * 10) clock.advance(1 / hz, step);
    return trace;
  };
  const [t60, t30, t120] = [await run(60), await run(30), await run(120)];
  assert.deepEqual(t30, t60, '30Hz and 60Hz render cadence share the fixed 60Hz trace');
  assert.deepEqual(t120, t60, '120Hz and 60Hz render cadence share the fixed 60Hz trace');
});

test('#887 an airborne actor past 70F returns to the normal airborne 7.5 endpoint, not the 0-bias 2 endpoint', async () => {
  const f = await floorFixture(), { a } = f;
  jump(f, a);
  // Hold the actor in the air well past the sourced 70F boundary. Landing is
  // the only event that could otherwise end the recovery clock.
  for (let frame = 0; frame < 90; frame++) {
    a.pos.y = 50; a.vel.y = 0;
    f.tick(a);
    assert.equal(a.grounded, false, `held airborne at frame ${frame + 1}`);
  }
  assert.equal(stateOf(a).active, false, 'an airborne clock past 70F is cleared');
  close(a.weaponRunner.spread, a.weapon.spreadAir * bloomScale(a), 'airborne spread is the 7.5 endpoint');
  a.aimYaw = 0; a.aimPitch = 0; a.aimDir.set(0, 0, 1); a.aimPoint.set(0, 1.05, 100);
  // Inactive state draws no bias sample: the draws are radial, then azimuth.
  const aim = fireDir(f, a, [0]);
  const round = fireDir(f, a, [0.5, 0.25]);
  close(angleDeg(aim, round), a.weapon.spreadAir * bloomScale(a) * Math.sqrt(0.5),
    'the airborne projectile cone equals the 7.5 endpoint, not the 2 endpoint', 1e-6);
});
