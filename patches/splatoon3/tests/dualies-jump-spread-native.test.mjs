// #887 — Splat Dualies jump-accuracy recovery on the real composed runtime.
//
// Pinned Ver.11.3.0 WeaponManeuverNormal publishes:
//   Stand_DegSwerve = 2, Jump_DegSwerve = 7.5,
//   Jump_DegBiasMax = 0.4,
//   Jump_DegBiasDecreaseStartFrame = 25, Jump_DegBiasEndFrame = 70.
// The table does not publish the curve between the two boundaries, so the
// in-between blend is an internal monotone interpolation, not a Nintendo value.
// These tests assert only the sourced endpoints/boundaries, that landing does
// not snap, that the LapOver turret cone stays independent, that the projectile
// cone and HUD read the same state, and that 30/60/120 Hz agree.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';
import { splatlingJumpRecoveryAt } from '../runtime/splatling-jump-spread.mjs';

const HZ = 60;
const START_F = 25, END_F = 70;
const close = (actual, expected, label, eps = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= eps, `${label}: ${actual} != ${expected}`);

const dualiesSource = f => f.profile.weaponsFidelityCompletion.weapons.dualies.WeaponParam;
const bloomScale = a => {
  const first = a.weapon.spreadFirst ?? 0.45;
  return first + (1 - first) * a.weaponRunner.bloom;
};
const ageOf = a => a.s3SplatlingJumpAgeFrames;
const expectedSpread = a => {
  const w = a.weapon, recovery = splatlingJumpRecoveryAt(ageOf(a));
  if (recovery === null) return (a.grounded ? w.spreadGround : w.spreadAir) * bloomScale(a);
  return (w.spreadAir + (w.spreadGround - w.spreadAir) * recovery) * bloomScale(a);
};

async function floorFixture({ jumpSpreadControl = false } = {}) {
  const f = await fixture({ composeProductionAdapters: true, jumpSpreadControl });
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

test('#887 pinned Dualies source boundaries are the values under test', async () => {
  const f = await fixture();
  const src = dualiesSource(f);
  assert.equal(src.Jump_DegBiasDecreaseStartFrame, START_F, 'sourced recovery start frame');
  assert.equal(src.Jump_DegBiasEndFrame, END_F, 'sourced recovered endpoint frame');
  assert.equal(src.Jump_DegBiasMax, 0.4, 'sourced outer-reticle bias maximum');
  assert.equal(src.Jump_DegSwerve, 7.5, 'sourced airborne endpoint');
  assert.equal(src.Stand_DegSwerve, 2, 'sourced grounded endpoint');
  assert.equal(f.WEAPONS.dualies.spreadAir, 7.5, 'runtime airborne envelope');
  assert.equal(f.WEAPONS.dualies.spreadGround, 2, 'runtime grounded endpoint');
  assert.equal(f.WEAPONS.dualies.spreadLock, 0, 'LapOver turret cone stays separate');
  close(f.WEAPONS.dualies.fireInterval, 5 / 60, 'sourced 5F normal cadence');
});

test('#887 stable grounded keeps the 2 endpoint and an un-jumped airborne actor keeps the 7.5 endpoint', async () => {
  const f = await floorFixture(), { a } = f;
  a.weaponRunner.update(1 / 60, { fire: false });
  assert.equal(ageOf(a), null, 'no jump state while stable on the ground');
  close(a.weaponRunner.spread, a.weapon.spreadGround * bloomScale(a), 'grounded cone');
  // Generic loss of ground contact (walking off a ledge) is not an admitted jump
  // and must not start the jump-accuracy clock.
  a.grounded = false;
  a.weaponRunner.update(1 / 60, { fire: false });
  assert.equal(ageOf(a), null, 'a ledge fall does not start the jump-accuracy clock');
  close(a.weaponRunner.spread, a.weapon.spreadAir * bloomScale(a), 'airborne cone keeps 7.5');
});

test('#887 a jump starts the clock at 0, holds 7.5 through 25F, and only then recovers', async () => {
  const f = await floorFixture(), { a } = f;
  a.intent.jump = true; f.tick(a); a.intent.jump = false;
  assert.equal(ageOf(a), 0, 'jump edge starts a fresh age');
  close(a.weaponRunner.spread, a.weapon.spreadAir * bloomScale(a), 'jump frame keeps the air endpoint');
  for (let i = 0; i < 25; i++) f.tick(a);
  assert.equal(ageOf(a), 25, 'age at the boundary');
  close(a.weaponRunner.spread, a.weapon.spreadAir * bloomScale(a), 'no recovery before 25F');
  f.tick(a);
  close(ageOf(a), 26, 'one frame past the boundary');
  close(a.weaponRunner.spread, expectedSpread(a), 'recovery blends after 25F');
  assert.ok(a.weaponRunner.spread < a.weapon.spreadAir * bloomScale(a), 'recovery has begun after 25F');
});

test('#887 landing before 70F preserves the remaining jump spread instead of snapping to grounded', async () => {
  const f = await floorFixture(), { a } = f;
  a.intent.jump = true; f.tick(a); a.intent.jump = false;
  let landing = null;
  for (let frame = 1; frame <= 120 && !landing; frame++) {
    const wasGrounded = a.grounded;
    f.tick(a);
    if (!wasGrounded && a.grounded) landing = { frame, age: ageOf(a), spread: a.weaponRunner.spread };
  }
  assert.ok(landing, 'the native double-jump lands on the in-memory floor');
  assert.ok(landing.age > START_F && landing.age < END_F, `landing stays inside recovery: ${landing.age}`);
  close(landing.spread, expectedSpread(a), 'landing keeps the interpolated jump spread');
  assert.ok(Math.abs(landing.spread - a.weapon.spreadGround * bloomScale(a)) > 0.05,
    'first grounded frame does not collapse to the grounded endpoint');
  for (let frame = 0; frame < 60 && ageOf(a) !== null; frame++) f.tick(a);
  assert.equal(ageOf(a), null, 'grounded recovery completes at the endpoint and clears');
  close(a.weaponRunner.spread, a.weapon.spreadGround * bloomScale(a), 'normal endpoint after recovery');
});

test('#887 the LapOver turret cone stays independent of jump recovery', async () => {
  const f = await floorFixture(), { a } = f;
  a.intent.jump = true; f.tick(a); a.intent.jump = false;
  f.tick(a, 3);
  const runner = a.weaponRunner;
  runner.s3Turret = true;
  assert.equal(runner._spreadDeg(a.weapon), a.weapon.spreadLock, 'turret spreadLock wins while recovering');
  close(runner._spreadDeg(a.weapon), 0, 'LapOver_DegSwerve stays 0');
  runner.s3Turret = false;
  close(runner._spreadDeg(a.weapon), expectedSpread(a), 'clearing turret restores the recovery state');
});

test('#887 reset, death and zero-time pause own the clock lifecycle', async () => {
  const f = await floorFixture(), { a } = f;
  a.intent.jump = true; f.tick(a); a.intent.jump = false; f.tick(a, 3);
  const age = ageOf(a); assert.ok(Number.isFinite(age));
  a.weaponRunner.update(0, { fire: false });
  assert.equal(ageOf(a), age, 'a zero-time update does not advance the clock');
  a.splat(null);
  assert.equal(ageOf(a), null, 'death clears the jump-accuracy clock');
  a.reset();
  assert.equal(ageOf(a), null, 'actor reset does not inherit a prior life');
});

test('#887 projectile cone and HUD read the same recovery state at 30/60/120Hz', async () => {
  const f = await floorFixture(), { a } = f;
  a.intent.jump = true; f.tick(a); a.intent.jump = false;
  for (let i = 0; i < 30; i++) f.tick(a);
  assert.ok(ageOf(a) > START_F && ageOf(a) < END_F, 'sampled mid-recovery');
  const spread = a.weaponRunner.spread;
  close(spread, expectedSpread(a), 'HUD scalar is the interpolated recovery cone');
  // The composed Dualies launch consumes exactly the runner scalar it is handed.
  a.weaponRunner.s3Turret = false;
  a.aimYaw = 0; a.aimPitch = 0; a.aimDir.set(0, 0, 1); a.aimPoint.set(0, 1.05, 100);
  a.character.getMuzzle = out => out.copy(a.pos).add(new f.THREE.Vector3(0, 1.05, 0.3));
  const ps = f.G.projectiles;
  const base = (() => {
    ps.fireDualies(a, a.weapon, 0, 0);
    const v = ps.list.at(-1).vel.clone().normalize();
    const right = v.clone().set(-v.z, 0, v.x);
    if (right.lengthSq() < 1e-4) right.set(1, 0, 0).addScaledVector(v, -v.x);
    right.normalize();
    return { v };
  })();
  const seq = [1 - 1e-12, 0, 0.5];
  let n = 0; f.setRandom(() => seq[n++] ?? 0.5);
  ps.fireDualies(a, a.weapon, spread, 0);
  const shot = ps.list.at(-1).vel.clone().normalize();
  const angle = Math.atan2(base.v.clone().cross(shot).length(), base.v.dot(shot)) * 180 / Math.PI;
  close(angle, spread, 'composed projectile cone equals the HUD recovery scalar', 1e-6);
  f.restoreRandom();

  // Same elapsed simulated time at three render rates gives identical 60 Hz
  // fixed-simulation traces (render cadence only decides how often steps run).
  const run = async hz => {
    const g = await floorFixture(), b = g.a, clock = new FixedClock();
    const trace = [];
    const step = dt => {
      g.G.time += dt; b.update(dt); b.intent.jump = false;
      trace.push([b.grounded, ageOf(b), +b.weaponRunner.spread.toFixed(9)]);
    };
    b.intent.jump = true;
    let rendered = 0;
    while (trace.length < 100 && rendered++ < hz * 10) clock.advance(1 / hz, step);
    return trace;
  };
  const [t60, t30, t120] = [await run(60), await run(30), await run(120)];
  assert.deepEqual(t30, t60, '30Hz and 60Hz render cadence share the fixed 60Hz trace');
  assert.deepEqual(t120, t60, '120Hz and 60Hz render cadence share the fixed 60Hz trace');
});

test('#887 the fix changes spread only, never the 5F cadence or ink accounting', async () => {
  const capture = async jumpSpreadControl => {
    const f = await floorFixture({ jumpSpreadControl }), { a } = f;
    const rows = [];
    a.intent.fire = true;
    a.intent.jump = true;
    for (let frame = 0; frame < 180; frame++) {
      if (frame === 1) a.intent.jump = false;
      f.tick(a);
      rows.push([a.grounded, +a.ink.toFixed(9), f.G.projectiles.list.length, +a.weaponRunner.cooldown.toFixed(9)]);
    }
    return rows;
  };
  assert.deepEqual(await capture(false), await capture(true),
    'jump recovery leaves landings, ink, cooldown and shot emission frames identical to the disabled control');
});
