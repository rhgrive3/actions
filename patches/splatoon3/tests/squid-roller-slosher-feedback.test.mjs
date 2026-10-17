import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { sourceFormClipAdmitted, sourceAirBlendStart, SOURCE_FORM_TRANSITION } from '../runtime/source-form-transition.mjs';
import { shedFormExitOverspeed, stepGroundVelocity, FORM_EXIT_OVERSPEED } from '../runtime/movement-physics.mjs';
import { catalogSplashFirst } from '../runtime/catalog-splash-paint.mjs';
import { horizontalRollerPose, verticalRollerPose, ROLLER_POSE, HEAVY_ROLLER_SWING, STANDARD_ROLLER_SWING, heavyRollerSwingEnd } from '../runtime/roller.mjs';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.resolve(process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public'));
const near = (a, b, tol, label) => assert.ok(Math.abs(a - b) <= tol, `${label}: ${a} vs ${b}`);

test('sourced ToHuman owns the body only for a grounded, stationary form change', () => {
  const c = (o) => ({ formKid: true, grounded: true, speed: 0, s3FormClipDeclined: false, ...o });
  assert.equal(sourceFormClipAdmitted(c()), true, 'standing surfacing keeps ToHuman');
  const moving = c({ speed: 5.76 });
  assert.equal(sourceFormClipAdmitted(moving), false, 'surfacing at run speed steps into locomotion');
  moving.speed = 0;
  assert.equal(sourceFormClipAdmitted(moving), false, 'a declined clip is not re-entered mid-clip');
  assert.equal(sourceFormClipAdmitted(c({ grounded: false })), false, 'airborne change keeps the jump pose');
  assert.equal(sourceFormClipAdmitted(c({ formKid: false, speed: 9 })), true, 'ToSquid on the ground is unchanged');
  assert.ok(SOURCE_FORM_TRANSITION.moveSpeed > 0 && SOURCE_FORM_TRANSITION.moveSpeed < 1);
  const full = 0.2;
  assert.equal(sourceAirBlendStart({ formKid: true, s3FormClipDeclined: true, grounded: false, formTime: 0 }, full), full,
    'airborne emergence skips the stale hidden dive pose');
  assert.equal(sourceAirBlendStart({ formKid: true, s3FormClipDeclined: false, grounded: false, formTime: 5 }, full), 0,
    'ordinary ground -> air keeps its crossfade');
});

test('source controller composition admits the form clip and air blend through the new owners', () => {
  const rel = 'src/game/motion/source-controller.js';
  const code = adaptSource(rel, fs.readFileSync(path.join(SRC, rel), 'utf8'));
  assert.match(code, /&&sourceFormClipAdmitted\(this\)\)\{/);
  assert.match(code, /this\.formEvent=true;this\.s3FormClipDeclined=false;/);
  assert.match(code, /this\.airBlendTime=sourceAirBlendStart\(this,HOST_MOTION\.transitionSeconds\);/);
});

test('surfacing kid sheds only swim speed above its own top speed, for a short window', () => {
  const run = (kidT, speed, human, frames, hold) => {
    const a = { kidT, vel: { x: 0, y: 0, z: speed } };
    let distance = 0;
    for (let i = 0; i < frames; i++) {
      shedFormExitOverspeed(a, human, 1 / 60);
      stepGroundVelocity(a.vel, 0, hold ? 1 : 0, human, 36, 1 / 60);
      distance += a.vel.z / 60; a.kidT += 1 / 60;
    }
    return { distance, speed: a.vel.z };
  };
  const released = run(0, 11.52, 5.76, 60, false), legacy = { distance: 0 };
  { let v = 11.52; while (v > 0) { v = Math.max(0, v - 36 / 60); legacy.distance += v / 60; } }
  assert.ok(released.distance < legacy.distance * 0.6, `full swim release slide ${released.distance} < ${legacy.distance}`);
  near(run(0, 11.52, 5.76, 30, true).speed, 5.76, 1e-9, 'held stick settles at the run speed');
  const a = { kidT: FORM_EXIT_OVERSPEED.window + 0.01, vel: { x: 0, y: 0, z: 11 } };
  shedFormExitOverspeed(a, 5.76, 1 / 60);
  assert.equal(a.vel.z, 11, 'outside the window other overspeed sources are untouched');
  // Same release slide at 30/60/120 Hz (logic only; the Actor runs a fixed 60 Hz clock in the game).
  const slide = hz => { const a = { kidT: 0, vel: { x: 0, y: 0, z: 11.52 } }; let d = 0;
    for (let i = 0; i < hz; i++) { shedFormExitOverspeed(a, 5.76, 1 / hz); stepGroundVelocity(a.vel, 0, 0, 5.76, 36, 1 / hz); d += a.vel.z / hz; a.kidT += 1 / hz; }
    return d; };
  const d60 = slide(60);
  for (const hz of [30, 120]) near(slide(hz), d60, 0.12, `release slide at ${hz} Hz`);
  const b = { kidT: 0, vel: { x: 3, y: 0, z: 4 } };
  shedFormExitOverspeed(b, 5.76, 1 / 60);
  assert.deepEqual(b.vel, { x: 3, y: 0, z: 4 }, 'speed already below the humanoid target is untouched');
});

test('catalog shooter splashes stagger through SplitNum so sustained fire leaves no gap', () => {
  const jet = MAIN_WEAPON_CATALOG.records.find(r => r.id === 's3-shooter-long').parameters.SplashSpawnParam;
  const firsts = Array.from({ length: jet.SplitNum }, (_, i) => catalogSplashFirst(jet, i));
  near(firsts[jet.SplitNum - 1], jet.SpawnNearestLength, 1e-12, 'SplitNum-th shot releases at the nearest distance');
  const sorted = [...firsts].sort((x, y) => x - y);
  for (let i = 1; i < sorted.length; i++)
    assert.ok(sorted[i] - sorted[i - 1] <= jet.SpawnBetweenLength / jet.SplitNum + 1e-9, 'evenly fills one spacing');
  near(catalogSplashFirst(jet, jet.SplitNum), firsts[0], 1e-12, 'cycle repeats');
  const forced = { SpawnNearestLength: 1.2, SpawnBetweenLength: 9.2, SplitNum: 8, ForceSpawnNearestAddNumArray: [4] };
  near(catalogSplashFirst(forced, 3), 1.2, 1e-12, 'ForceSpawnNearestAddNumArray slot');
  near(catalogSplashFirst({ SpawnNearestLength: 2 }, 0), 2, 1e-12, 'no SplitNum keeps the nearest distance');
});

test('heavy roller swing: level overhead hold, ink with the drum down, floor rest and return to carry', () => {
  const windup = 45 / 60, interval = 66 / 60, end = heavyRollerSwingEnd(windup, interval), H = HEAVY_ROLLER_SWING;
  near(end, Math.max(windup + H.rest, interval) + H.ret, 1e-12, 'presentation end');
  for (const [fn, label] of [[horizontalRollerPose, 'horizontal'], [verticalRollerPose, 'vertical']]) {
    const at = t => fn(t, windup, interval, 'heavy');
    const top = at(H.coilAt), held = at(windup - H.whip - 1 / 60);
    for (let i = 0; i < 3; i++) near(held.rotation[i], top.rotation[i], 1e-9, label + ' holds overhead until the whip');
    const heavy = at(windup), follow = at(windup + H.rest * .5);
    if (label === 'vertical') {
      // The corrected release pose is explicitly upright, and the following
      // X-axis key now eases forward without replaying the horizontal flick.
      near(heavy.rotation[2], Math.PI / 2, 1e-9, 'vertical release remains upright');
      near(follow.rotation[2], Math.PI / 2, 1e-9, 'vertical follow-through remains upright');
      near(heavy.rotation[1], follow.rotation[1], 1e-9, 'no yaw twist during release');
      assert.ok(follow.rotation[0] > heavy.rotation[0], 'vertical forward follow-through begins after release');
    } else {
      for (let i = 0; i < 3; i++) near(heavy.rotation[i], follow.rotation[i], 1e-9, label + ' horizontal release hold');
    }
    const done = at(end);
    for (let i = 0; i < 3; i++) {
      near(done.anchor[i], ROLLER_POSE.READY_ANCHOR[i], 1e-7, label + ' anchor back to carry');
      near(done.rotation[i], ROLLER_POSE.READY_ROTATION[i], 1e-7, label + ' rotation back to carry');
    }
    let previous = at(0);
    for (let i = 1; i <= 2000; i++) {
      const next = at(end * i / 2000);
      for (const ch of ['anchor', 'rotation']) for (let k = 0; k < 3; k++) {
        assert.ok(Number.isFinite(next[ch][k]));
        assert.ok(Math.abs(next[ch][k] - previous[ch][k]) < .2, `${label} continuous at ${end * i / 2000}`);
      }
      previous = next;
    }
  }
});

test('standard roller swing (Splat Roller 21F/26F): same S3 order inside the gameplay interval', () => {
  const S = STANDARD_ROLLER_SWING;
  for (const [fn, windup, interval, label] of [[horizontalRollerPose, 21 / 60, 42 / 60, 'horizontal'], [verticalRollerPose, 26 / 60, 47 / 60, 'vertical']]) {
    const at = t => fn(t, windup, interval);
    const coilAt = Math.min(S.coilMax, S.coilFraction * windup), hold = windup - S.whip;
    const top = at(coilAt), held = at(hold - 1 / 120);
    for (let i = 0; i < 3; i++) near(held.rotation[i], top.rotation[i], 1e-9, label + ' level overhead is held');
    const release = at(windup), rest = at(windup + 2 / 60);
    if (label === 'vertical') {
      near(release.rotation[2], Math.PI / 2, 1e-9, 'upright standard vertical release');
      near(rest.rotation[2], Math.PI / 2, 1e-9, 'upright standard vertical follow-through');
      near(release.rotation[1], rest.rotation[1], 1e-9, 'no yaw at standard vertical release');
      assert.ok(rest.rotation[0] > release.rotation[0], 'standard vertical follow-through moves forward after ink release');
    } else {
      for (let i = 0; i < 3; i++) near(release.rotation[i], rest.rotation[i], 1e-9, 'horizontal release hold');
    }
    const done = at(interval);
    for (let i = 0; i < 3; i++) near(done.rotation[i], ROLLER_POSE.READY_ROTATION[i], 1e-7, label + ' back to carry at the interval');
    assert.equal(done.weight, 0, label + ' hands the pose back at the interval');
  }
});
