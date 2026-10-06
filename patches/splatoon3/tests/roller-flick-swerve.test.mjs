// #771 focused regression: the S3 Roller horizontal WideSwingUnitGroupParam
// main unit carries a sourced SwerveRateBySpeed (0.05); the fidelity layer used
// to overwrite the base emitter's swerve and emit one fixed fan yaw per glob
// index. These tests drive the real adapted Projectiles through a real Actor and
// assert the sourced rate is consumed for every main glob, tied to that glob's
// own speed sample, while the fan placement, the inside/outside classification
// offset, the vertical path and the RNG draw budget stay unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';

const DEG = Math.PI / 180;
const MAIN = 12;

function sequence(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0x100000000; };
}
function yaws(p) { return p.list.map(q => Math.atan2(q.vel.x, q.vel.z)); }
function speeds(p) { return p.list.map(q => Math.hypot(q.vel.x, q.vel.y, q.vel.z)); }
function fan(i) { return (i / (MAIN - 1)) * 2 - 1; }
function rate(p, i) { return p.list[i].fidelityRollerUnit.SwerveRateBySpeed; }
// The normalized speed sample the emitter drew, recovered from the emitted speed.
function sample(p, i) {
  const u = p.list[i].fidelityRollerUnit;
  return (speeds(p)[i] / 60 - u.SpawnSpeedBase) / u.SpawnSpeedRandom;
}

async function fire({ vertical = false, random } = {}) {
  const f = await fixture(), { G, THREE } = f;
  G.scene = new THREE.Scene(); G.camera = new THREE.PerspectiveCamera();
  G.actors = []; G.boss = null; G.netm = null;
  G.level.queryBlocks = (_a, _b, _c, _d, out) => { out.length = 0; return out; };
  G.physics = new f.Physics(G.level);
  if (random) f.setRandom(random);
  const p = G.projectiles = new f.Projectiles(G.scene), a = f.make('roller');
  a.yaw = 0; a.aimPitch = 0;
  a.weaponRunner.s3FlickVertical = vertical;
  a.aimDir.set(0, 0, 1); a.aimPoint.set(0, 1, 50);
  p.fireFlick(a, a.weapon);
  return { f, p, a };
}

test('#771 horizontal main globs consume the sourced SwerveRateBySpeed on top of the fan', async () => {
  const { p } = await fire({ random: sequence(0x1234abcd) });
  assert.equal(p.list.length, 13, '12 main globs + 1 near glob');
  const off = yaws(p);
  for (let i = 0; i < MAIN; i++) {
    const u = p.list[i].fidelityRollerUnit;
    assert.ok(u.SwerveRateBySpeed > 0, `main glob ${i} unit carries a non-zero SwerveRateBySpeed`);
    const d = sample(p, i);
    assert.ok(Math.abs(d) <= 1 + 1e-9, `main glob ${i} speed sample stays inside the sourced envelope`);
    const fanAngle = fan(i) * (u.SpawnWideDegree || 0) * DEG;
    assert.ok(Math.abs(off[i] - (fanAngle + d * u.SwerveRateBySpeed)) < 1e-9,
      `main glob ${i} launch yaw = sourced fan + SwerveRateBySpeed * speed sample`);
    assert.ok(Math.abs(d * u.SwerveRateBySpeed) > 1e-6, `main glob ${i} applies a non-zero swerve`);
    // #734 keeps the deterministic fan offset for inside/outside classification.
    assert.ok(Math.abs(p.list[i].fidelityYaw - fanAngle) < 1e-9,
      `main glob ${i} inside/outside offset stays the plain fan`);
  }
});

test('#771 fixed actor yaw no longer pins each main glob index to one fan yaw across swings', async () => {
  const A = await fire({ random: sequence(0xc0ffee) });
  const B = await fire({ random: sequence(0xbadf00d) });
  assert.equal(A.a.yaw, 0); assert.equal(B.a.yaw, 0);
  const offA = yaws(A.p), offB = yaws(B.p);
  assert.notDeepEqual(offA.slice(0, MAIN), offB.slice(0, MAIN),
    'a different speed sample changes every main index yaw');
  for (let i = 0; i < MAIN; i++) {
    const residualA = offA[i] - sample(A.p, i) * rate(A.p, i);
    const residualB = offB[i] - sample(B.p, i) * rate(B.p, i);
    assert.ok(Math.abs(residualA - residualB) < 1e-12,
      `main glob ${i} keeps the same fan yaw once the swerve is removed`);
    assert.ok(Math.abs(residualA - fan(i) * (A.p.list[i].fidelityRollerUnit.SpawnWideDegree || 0) * DEG) < 1e-9,
      `main glob ${i} fan placement is unchanged`);
    assert.ok(Math.abs(residualA - offA[i]) > 1e-6,
      `main glob ${i} swerve is present in the emitted yaw`);
  }
});

test('#771 the swerve reuses the existing speed draw: the flick draw budget is unchanged', async () => {
  let n = 0; const seq = sequence(0x9e3779b9);
  const { p } = await fire({ random: () => { n++; return seq(); } });
  assert.equal(p.list.length, 13);
  assert.equal(n, 176, 'the flick keeps its pre-#771 draw budget');
});

test('#771 vertical flick is untouched and stays independent of the speed sample', async () => {
  const one = await fire({ vertical: true, random: sequence(0x11) });
  const two = await fire({ vertical: true, random: sequence(0x22) });
  assert.equal(one.p.list.length, 5, 'vertical glob count unchanged');
  const o1 = yaws(one.p), o2 = yaws(two.p);
  for (let i = 0; i < one.p.list.length; i++) {
    const u = one.p.list[i].fidelityRollerUnit;
    assert.equal(u.SwerveRateBySpeed, undefined, 'vertical units carry no swerve field');
    assert.ok(Math.abs(o1[i] - (u.SpawnRotateYDegree || 0) * DEG) < 1e-9, `vertical glob ${i} keeps its sourced line`);
    assert.ok(Math.abs(o2[i] - o1[i]) < 1e-12, `vertical glob ${i} does not depend on the speed sample`);
  }
});
