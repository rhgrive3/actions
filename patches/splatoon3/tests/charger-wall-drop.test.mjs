// #625 S3 Splat Charger wall impacts enter the pinned post-impact wall-drop
// pipeline instead of ending all gameplay paint on the collision frame.
// Logic-only source-fixture checks against the real installed flight module
// (no browser/Switch). Only explicitly sourced charge endpoints are asserted;
// omitted/default field semantics are not guessed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chargerWallDropPaint } from '../runtime/weapons-charger-flight.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json'), 'utf8'));
const completion = profile.weaponsFidelityCompletion;
const close = (actual, expected, label) => assert.ok(
  Math.abs(actual - expected) < 1e-9, `${label}: ${actual} ~= ${expected}`);

test('#625 charger wall-drop shock/fall envelopes respect sourced charge endpoints', () => {
  const min = chargerWallDropPaint(completion, 0);
  close(min.shock, 1.2, 'top shock min');
  close(min.fall, 0.8, 'top fall min');
  close(min.splashShock, 0.6, 'splash shock min');
  close(min.splashFall, 0.45, 'splash fall min');
  const max = chargerWallDropPaint(completion, 1);
  close(max.shock, 1.8, 'top shock max');
  close(max.fall, 1.2, 'top fall max');
  close(max.splashShock, 0.9, 'splash shock max');
  close(max.splashFall, 0.675, 'splash fall max');
  close(max.splashGround, 0.4, 'splash ground');
  // Partial charge interpolates between the sourced endpoints.
  const half = chargerWallDropPaint(completion, 0.5);
  close(half.shock, 1.5, 'top shock half');
  close(half.fall, 1.0, 'top fall half');
  close(half.splashShock, 0.75, 'splash shock half');
  close(half.splashFall, 0.5625, 'splash fall half');
});

test('#625 charger wall-drop movement timing is source-driven', () => {
  const topMove = completion.weapons.charger.WallDropMoveParam;
  const splashMove = completion.weapons.charger.SplashWallHitParam.WallDropMoveParam;
  // Pinned records: top first=15, top last=30; splash 15-30 / 15-30 ranges.
  assert.equal(topMove.FallPeriodFirstFrameMin, 15);
  assert.equal(topMove.FallPeriodLastFrameMax, 30);
  assert.equal(topMove.FallPeriodFirstTargetSpeed, 0.04);
  assert.equal(topMove.FallPeriodSecondTargetSpeed, 0.05);
  assert.equal(splashMove.FallPeriodFirstFrameMin, 15);
  assert.equal(splashMove.FallPeriodFirstFrameMax, 30);
  assert.equal(splashMove.FallPeriodLastFrameMin, 15);
  assert.equal(splashMove.FallPeriodLastFrameMax, 30);
  assert.equal(splashMove.FallPeriodFirstTargetSpeed, 0.04);
  assert.equal(splashMove.FallPeriodSecondTargetSpeed, 0.05);
});

test('#625 installed charger flight enters wall-drop on a qualifying wall hit', async () => {
  const source = fs.readFileSync(path.join(ROOT, 'patches/splatoon3/runtime/weapons-charger-flight.mjs'), 'utf8');
  assert.match(source, /beginWallDrop\(system,job,world\)/);
  assert.match(source, /advanceWallDrop\(job,dt\)/);
  assert.match(source, /job\.wallDrop/);
  // Terminal one-frame path is preserved for non-qualifying contacts.
  assert.match(source, /chargerWallDropEligible/);
  // Ghosts never enter authoritative wall-drop paint.
  assert.match(source, /if\(job\.ghost\|\|job\.wallDrop\|\|!chargerWallDropEligible/);
  // Full-charge piercing, cover ordering and packet shape are untouched.
  assert.match(source, /if\(!job\.full\)/);
  assert.match(source, /weapon:fire/);
});
