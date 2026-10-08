// #771 focused regression: the pinned 11.3.0 WideSwingUnitGroupParam carries a
// non-zero SwerveRateBySpeed for both horizontal units (main 0.05 / near 0.1).
// The fidelity layer rebuilt main-glob yaw as a pure deterministic fan, so each
// main index kept one fixed yaw while speed/spawn varied; the near glob never
// read the field at all. These tests drive the real adapted Projectiles through
// a real Actor and assert both rates are consumed via each glob's own speed
// sample, with no extra RNG draw, no wire change, and the #734 damage geometry,
// vertical path, and volley counts unchanged.
//
// The linear speedSample coupling in radians is an explicit UNVERIFIED model:
// the pinned Leanny 11.3.0 JSON carries the values only, with no formula,
// units, curve, or RNG semantics, and this repo documents no native swerve law.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';

const DEG = Math.PI / 180;
const MAIN = 12;

function sequence(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0x100000000; };
}

async function fire({ random, yaw = 0.3, vertical = false } = {}) {
  const f = await fixture(), { G, THREE } = f;
  G.scene = new THREE.Scene(); G.camera = new THREE.PerspectiveCamera();
  G.actors = []; G.boss = null; G.netm = null;
  G.level.queryBlocks = (_a, _b, _c, _d, out) => { out.length = 0; return out; };
  G.physics = new f.Physics(G.level);
  if (random) f.setRandom(random);
  const system = G.projectiles = new f.Projectiles(G.scene);
  const a = f.make('roller');
  a.yaw = yaw; a.aimPitch = 0;
  a.weaponRunner.s3FlickVertical = vertical;
  system.fireFlick(a, a.weapon);
  return { f, system, a };
}

const yawOf = p => Math.atan2(p.vel.x, p.vel.z);
const speedOf = p => Math.hypot(p.vel.x, p.vel.y, p.vel.z);
// system.list lives in the fixture VM realm; Array.from re-homes the samples
// into host-realm arrays so strict equality is meaningful.
const yawsOf = sys => Array.from(sys.list, yawOf);
const speedsOf = sys => Array.from(sys.list, speedOf);
const fanOf = i => (i / (MAIN - 1)) * 2 - 1;
// The normalized speed sample the emitter drew, recovered from emitted speed.
const sampleOf = p => {
  const u = p.fidelityRollerUnit;
  return (speedOf(p) / 60 - u.SpawnSpeedBase) / u.SpawnSpeedRandom;
};

test('#771 horizontal main globs consume the sourced SwerveRateBySpeed on top of the fan', async () => {
  const { system, a } = await fire({ random: sequence(0x1234abcd) });
  assert.equal(system.list.length, 13, '12 main globs + 1 near glob');
  for (let i = 0; i < MAIN; i++) {
    const p = system.list[i];
    assert.equal(p.fidelityRollerUnitIndex, 0, `main glob ${i} rides unit 0`);
    const u = p.fidelityRollerUnit;
    assert.equal(u.SwerveRateBySpeed, 0.05, `main glob ${i} unit carries the pinned 0.05`);
    const d = sampleOf(p);
    assert.ok(Math.abs(d) <= 1 + 1e-9, `main glob ${i} speed sample stays inside the sourced envelope`);
    const expected = a.yaw + fanOf(i) * (u.SpawnWideDegree || 0) * DEG + d * u.SwerveRateBySpeed;
    assert.ok(Math.abs(yawOf(p) - expected) < 1e-9, `main glob ${i} yaw = fan + SwerveRateBySpeed * own speed sample`);
  }
  const swerves = Array.from(system.list).slice(0, MAIN).map(p => Math.abs(sampleOf(p) * p.fidelityRollerUnit.SwerveRateBySpeed));
  assert.ok(swerves.filter(s => s > 1e-6).length >= 10, 'the swerve is non-zero across the volley');
});

test('#771 fixed actor yaw no longer pins each main-glob index to one fan yaw', async () => {
  const A = await fire({ random: sequence(0xc0ffee) });
  const B = await fire({ random: sequence(0xbadf00d) });
  const offA = yawsOf(A.system).slice(0, MAIN);
  const offB = yawsOf(B.system).slice(0, MAIN);
  assert.notDeepEqual(offA, offB, 'a different speed sample changes the main yaw vector');
  for (let i = 0; i < MAIN; i++) {
    const u = A.system.list[i].fidelityRollerUnit;
    const residualA = offA[i] - sampleOf(A.system.list[i]) * u.SwerveRateBySpeed;
    const residualB = offB[i] - sampleOf(B.system.list[i]) * u.SwerveRateBySpeed;
    assert.ok(Math.abs(residualA - residualB) < 1e-12, `main glob ${i} keeps the same fan once the swerve is removed`);
    assert.ok(Math.abs(residualA - (A.a.yaw + fanOf(i) * (u.SpawnWideDegree || 0) * DEG)) < 1e-9,
      `main glob ${i} fan placement is unchanged`);
  }
});

test('#771 the near glob consumes the sourced 0.1 SwerveRateBySpeed via its own speed draw', async () => {
  const { system, a, f } = await fire({ random: () => 0.75 });
  const near = Array.from(system.list).filter(p => p.s3FlickUnit === 1);
  assert.equal(near.length, 1, 'exactly one near glob');
  const p = near[0];
  assert.equal(f.WEAPONS.roller.nearFlickUnit.swerveRate, 0.1, 'profile carries the pinned Unit[1] 0.1');
  // Constant 0.75: fanSample = speedSample = 0.5.
  const expectedAngle = a.yaw + 0.5 * f.WEAPONS.roller.nearFlickUnit.halfAngleDegrees * DEG + 0.5 * 0.1;
  assert.ok(Math.abs(yawOf(p) - expectedAngle) < 1e-9, 'near yaw = sourced fan + 0.1 * own speed sample');
  const u = f.WEAPONS.roller.nearFlickUnit;
  const expectedSpeed = f.WEAPONS.roller.flickSpeed * (u.speedBase + 0.5 * u.speedRandom) / u.mainSpeedBase;
  assert.ok(Math.abs(speedOf(p) - expectedSpeed) < 1e-9, 'near speed uses the same draw');
  const flat = await fire({ random: () => 0.5 });
  const nearFlat = Array.from(flat.system.list).find(q => q.s3FlickUnit === 1);
  assert.ok(Math.abs(yawOf(nearFlat) - flat.a.yaw) < 1e-12, 'zero samples keep the prior straight-ahead angle exactly');
});

test('#771 the swerve reuses existing draws: the flick draw budget is unchanged', async () => {
  let n = 0;
  const seq = sequence(0x9e3779b9);
  const { system } = await fire({ random: () => { n++; return seq(); } });
  assert.equal(system.list.length, 13);
  assert.equal(n, 176, 'the flick keeps its pre-#771 draw budget (176, measured before and after)');
});

test('#771 vertical flick is untouched and carries no swerve field', async () => {
  const one = await fire({ vertical: true, random: sequence(0x11) });
  const two = await fire({ vertical: true, random: sequence(0x22) });
  assert.equal(one.system.list.length, 5, 'vertical glob count unchanged');
  for (let i = 0; i < one.system.list.length; i++) {
    const u = one.system.list[i].fidelityRollerUnit;
    assert.equal(u.SwerveRateBySpeed, undefined, 'vertical units carry no swerve field');
    assert.ok(Math.abs(yawOf(one.system.list[i]) - yawOf(two.system.list[i])) < 1e-12,
      `vertical glob ${i} does not depend on the speed sample`);
  }
});

test('#771 the #734 inside/outside damage geometry is unchanged by the swerve', async () => {
  const { f, system, a } = await fire({ random: () => 0.75 });
  const at = (from, distance, degrees, yaw = 0) => {
    const t = degrees * DEG + yaw;
    return { x: from.x + Math.sin(t) * distance, y: from.y, z: from.z + Math.cos(t) * distance };
  };
  const globs = Array.from(system.list);
  assert.equal(globs.length, 13, 'main 12 + near 1, no extra damage carriers');
  assert.ok(globs.every(q => q.fidelitySectorYaw === a.yaw), 'one shared swing sector');
  const hits = [];
  system.applyHit = (_o, _v, amount) => hits.push(amount);
  const outer = globs.reduce((best, q) => Math.abs(q.fidelityYaw) > Math.abs(best.fidelityYaw) ? q : best);
  assert.ok(Math.abs(outer.fidelityYaw) > 16 * DEG, 'outermost launch still clears the sector');
  const forward = at(outer.start, 3, 0, a.yaw);
  f.applyFidelityProjectileHit(system, outer, { id: 'v1' }, 999, forward);
  assert.deepEqual(hits, [f.distanceDamage(f.WEAPONS.roller.flickDamageBands, outer.start.distanceTo(forward))]);
  const inner = globs.reduce((best, q) => Math.abs(q.fidelityYaw) < Math.abs(best.fidelityYaw) ? q : best);
  hits.length = 0;
  const wide = at(inner.start, 3, 20, a.yaw);
  f.applyFidelityProjectileHit(system, inner, { id: 'v2' }, 999, wide);
  assert.deepEqual(hits, [f.distanceDamage(f.WEAPONS.roller.ballistics.horizontalOutsideDamageBands, inner.start.distanceTo(wide))]);
});

test('#771 the same seed emits identical volleys: owner/remote replay parity', async () => {
  const A = await fire({ random: sequence(0x771771) });
  const B = await fire({ random: sequence(0x771771) });
  assert.deepEqual(yawsOf(A.system), yawsOf(B.system), 'seeded launch distribution is replay-identical');
  assert.deepEqual(speedsOf(A.system), speedsOf(B.system), 'seeded speeds are replay-identical');
});
