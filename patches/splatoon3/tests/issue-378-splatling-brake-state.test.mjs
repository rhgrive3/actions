import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../../scripts/weapons-fixture.mjs';

// #378: Heavy Splatling rounds keep their straight, brake and free states on the
// live flight. Speeds are units/second (60 per frame). The brake factor 0.64 and
// 252 u/s^2 brake gravity are the INKWAVE splatling motion record (inkFlight.js,
// motionDefaults for brake/free); the Ver.11.3.0 MoveParam pinned by Leanny has
// only GoStraightToBrakeStateFrame/GoStraightStateEndMaxSpeed/SpawnSpeed fields, so the
// brake and free constants stay 未確認 for native verification.
const BRAKE = 1 - 0.36, FREE = 1 - 0.02;
const CAP = 1.5105 * 60;
const close = (x, y, tolerance = 1e-9) => assert.ok(Math.abs(x - y) < tolerance, `${x} != ${y}`);

async function fire(charge, speed) {
  const f = await fixture({fidelity: true, floor: false}), a = f.make('splatling', {y: 2});
  a.vel.set(0, 0, 0); a.aimDir.set(0, 0, 1); a.aimPoint.set(0, 2, 1000);
  f.projectiles._aimFrom = (_a, _from, out) => out.set(0, 0, 1);
  a.weaponRunner.fidelitySplatlingCharge = charge; a.weaponRunner.charge = charge;
  f.projectiles.fireSplatling(a, a.weapon, 0);
  const p = f.projectiles.list[0];
  // Deterministic launch vector, level and unspread. Charge-dependent spawn sampling is #252.
  p.vel.set(0, 0, speed);
  return {f, p, start: p.pos.clone()};
}

// Advances the live update path in 1/hz steps and samples at the requested frames.
async function trace(hz, charge, speed, frames) {
  const {f, p, start} = await fire(charge, speed), dt = 1 / hz, out = {};
  let steps = 0;
  for (const frame of frames) {
    const target = frame * hz / 60;
    assert.ok(Number.isInteger(target), `${frame}F is not on a ${hz} Hz step boundary`);
    while (steps < target) { f.projectiles.update(dt); steps++; }
    out[frame] = {z: p.pos.z - start.z, vz: p.vel.z, vy: p.vel.y, phase: p.fidelityPhase, inkPhase: p.inkPhase, inkFrame: p.inkFrame};
    assert.equal(p.inkFrame, frame, 'the live flight advances one 60 Hz frame per 1/60 s');
  }
  return out;
}

const FRAMES = [8, 9, 10, 11, 12, 13];

test('#378 min-charge 1.05 u/f: 8F straight, 9F brake to 0.672 u/f, free from 12F at 60 Hz', async () => {
  const t = await trace(60, 0, 63, FRAMES);
  // Straight: 8 frames at 1.05 u/f, no vertical drift, still in the straight state.
  const s8 = t[8];
  close(s8.vz, 63); close(s8.vy, 0); close(s8.z, 8.4); assert.equal(s8.phase, 0);
  // 9F: first brake frame. Speed x 0.64 (0.672 u/f), then 252 u/s^2 brake gravity over 1/60 s.
  const vz9 = 63 * BRAKE, vy9 = -252 / 60;
  close(t[9].vz, vz9); close(t[9].vy, vy9); close(t[9].z, 8.4 + vz9 / 60);
  assert.equal(t[9].phase, 1); assert.equal(t[9].inkPhase, 1);
  // 10F, 11F stay braked; the free test (vy < -9 u/s) is not yet met at 11F.
  const vz10 = vz9 * BRAKE, vy10 = vy9 * BRAKE - 252 / 60;
  close(t[10].vz, vz10); close(t[10].vy, vy10); assert.equal(t[10].phase, 1);
  const vz11 = vz10 * BRAKE, vy11 = vy10 * BRAKE - 252 / 60;
  close(t[11].vz, vz11); close(t[11].vy, vy11); assert.equal(t[11].phase, 1);
  assert.ok(vy11 > -9, 'vy at 11F is still above the -9 u/s brake exit');
  // 12F: the first frame with vy < -9 u/s moves the round to the free state.
  const vz12 = vz11 * BRAKE, vy12 = vy11 * BRAKE - 252 / 60;
  close(t[12].vz, vz12); close(t[12].vy, vy12); assert.ok(vy12 < -9);
  assert.equal(t[12].phase, 2); assert.equal(t[12].inkPhase, 2);
  // 13F: free state, drag 0.02 per frame and 57.6 u/s^2 gravity.
  close(t[13].vz, vz12 * FREE); close(t[13].vy, vy12 * FREE - 57.6 / 60);
  assert.equal(t[13].phase, 2);
});

test('#378 full-charge 2.1 u/f: the 1.5105 u/f ceiling applies at 9F before braking', async () => {
  const t = await trace(60, 1, 126, [8, 9]);
  close(t[8].vz, 126); assert.equal(t[8].phase, 0);
  close(t[9].vz, CAP * BRAKE); // 1.5105 u/f x 0.64 = 0.96672 u/f
  close(t[9].vy, -252 / 60); assert.equal(t[9].phase, 1);
});

test('#378 brake and free states are frame-identical at 30, 60 and 120 Hz', async () => {
  const ref = await trace(60, 0, 63, FRAMES);
  const half = await trace(120, 0, 63, FRAMES);
  for (const frame of FRAMES) {
    close(half[frame].vz, ref[frame].vz); close(half[frame].vy, ref[frame].vy);
    close(half[frame].z, ref[frame].z); assert.equal(half[frame].phase, ref[frame].phase);
  }
  // 9F is not on a 30 Hz step boundary, so the 30 Hz check uses the boundaries 8F, 10F, 12F.
  const slow = await trace(30, 0, 63, [8, 10, 12]);
  for (const frame of [8, 10, 12]) {
    close(slow[frame].vz, ref[frame].vz); close(slow[frame].vy, ref[frame].vy);
    close(slow[frame].z, ref[frame].z); assert.equal(slow[frame].phase, ref[frame].phase);
  }
});
