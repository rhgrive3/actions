#!/usr/bin/env node
// Splatoon 2 5.5.0 -> Splatoon 3 11.3.0 parameter comparison.
// IMPORTANT: This is a field-by-field archival value comparison, NOT a claim
// that any retail game kernels or world-unit conversions are equivalent.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S2 = path.join(ROOT, 'patches/splatoon3/reference/splatoon2-550');
const S3 = path.join(ROOT, 'patches/splatoon3/reference/weapon-audit-1130');

function field(family, key, s2File, s2Key, s3File, s3Key, factor = 1) {
  return Object.freeze({ family, key, s2File, s2Key, s3File, s3Key, factor });
}

// Factors are independently specified for each observed source field.
// In particular, do not extrapolate a distance factor to angle, time, ink or
// the S3 side-step parameters omitted from its sparse GameParameterTable.
export const LINEAGE_FIELDS = Object.freeze([
  field('shooter', 'splash-between', 'ShooterNormal', 'mCreateSplashLength', 'WeaponShooterNormal', 'SplashSpawnParam.SpawnBetweenLength', 0.1),
  field('shooter', 'splash-count', 'ShooterNormal', 'mCreateSplashNum', 'WeaponShooterNormal', 'SplashSpawnParam.SpawnNum'),
  field('shooter', 'ink-consume', 'ShooterNormal', 'mInkConsume', 'WeaponShooterNormal', 'WeaponParam.InkConsume'),
  field('shooter', 'move-speed', 'ShooterNormal', 'mMoveSpeed', 'WeaponShooterNormal', 'WeaponParam.MoveSpeed', 0.1),
  field('shooter', 'stand-spread', 'ShooterNormal', 'mDegRandom', 'WeaponShooterNormal', 'WeaponParam.Stand_DegSwerve'),
  field('shooter', 'jump-spread', 'ShooterNormal', 'mDegJumpRandom', 'WeaponShooterNormal', 'WeaponParam.Jump_DegSwerve'),

  field('splatling', 'splash-between', 'SpinnerStandard', 'mCreateSplashLength', 'WeaponSpinnerStandard', 'SplashSpawnParam.SpawnBetweenLength', 0.1),
  field('splatling', 'splash-count', 'SpinnerStandard', 'mCreateSplashNum', 'WeaponSpinnerStandard', 'SplashSpawnParam.SpawnNum'),
  field('splatling', 'ink-consume', 'SpinnerStandard', 'mInkConsume', 'WeaponSpinnerStandard', 'WeaponParam.InkConsume'),
  field('splatling', 'move-speed', 'SpinnerStandard', 'mMoveSpeed', 'WeaponSpinnerStandard', 'WeaponParam.MoveSpeed', 0.1),
  field('splatling', 'stand-spread', 'SpinnerStandard', 'mDegRandom', 'WeaponSpinnerStandard', 'WeaponParam.Stand_DegSwerve'),
  field('splatling', 'jump-spread', 'SpinnerStandard', 'mDegJumpRandom', 'WeaponSpinnerStandard', 'WeaponParam.Jump_DegSwerve'),
  field('splatling', 'repeat-frame', 'SpinnerStandard', 'mRepeatFrame', 'WeaponSpinnerStandard', 'WeaponParam.RepeatFrame'),

  field('dualies', 'ink-consume', 'TwinsNormal_2', 'mSideStepInkConsume', 'WeaponManeuverNormal', 'SideStepParam.InkConsume'),
  field('dualies', 'move-frame', 'TwinsNormal_2', 'mSideStepMoveFrm', 'WeaponManeuverNormal', 'SideStepParam.MoveFrame'),
  field('dualies', 'move-distance', 'TwinsNormal_2', 'mSideStepMoveDist', 'WeaponManeuverNormal', 'SideStepParam.MoveDist', 0.1),
  field('dualies', 'move-damping', 'TwinsNormal_2', 'mSideStepMoveStepKd', 'WeaponManeuverNormal', 'SideStepParam.MoveStepKd'),
  field('dualies', 'air-slide-distance', 'TwinsNormal_2', 'mSideStepSlideMoveDistAir', 'WeaponManeuverNormal', 'SideStepParam.SlideMoveDistAir', 0.1),
  field('dualies', 'post-slide-duration', 'TwinsNormal_2', 'mSideStepSlideMoveFrm', 'WeaponManeuverNormal', 'SideStepParam.SlideMoveFrame'),
  field('dualies', 'input-accept-window', 'TwinsNormal_2', 'mSideStepInputReqAcceptFrm', 'WeaponManeuverNormal', 'SideStepParam.InputReqAcceptFrame'),

  field('blaster', 'flight-spacing', 'BlasterMiddle', 'mCreateSplashLength', 'WeaponBlasterMiddle', 'SplashSpawnParam.SpawnBetweenLength', 0.1),
  field('blaster', 'flight-nearest', 'BlasterMiddle', 'mNearestSplahSplitLength', 'WeaponBlasterMiddle', 'SplashSpawnParam.SpawnNearestLength', 0.1),
  field('blaster', 'flight-count', 'BlasterMiddle', 'mCreateSplashNum', 'WeaponBlasterMiddle', 'SplashSpawnParam.SpawnNum'),
  field('blaster', 'flight-split', 'BlasterMiddle', 'mSplashSplitNum', 'WeaponBlasterMiddle', 'SplashSpawnParam.SplitNum'),
  field('blaster', 'spawn-speed', 'BlasterMiddle', 'mInitVel', 'WeaponBlasterMiddle', 'MoveParam.SpawnSpeed', 0.1),
  field('blaster', 'move-speed', 'BlasterMiddle', 'mMoveSpeed', 'WeaponBlasterMiddle', 'WeaponParam.MoveSpeed', 0.1),
  field('blaster', 'ink-consume', 'BlasterMiddle', 'mInkConsume', 'WeaponBlasterMiddle', 'WeaponParam.InkConsume'),
  field('blaster', 'ink-recover-stop', 'BlasterMiddle', 'mInkRecoverStop', 'WeaponBlasterMiddle', 'WeaponParam.InkRecoverStop'),
  field('blaster', 'repeat-frame', 'BlasterMiddle', 'mRepeatFrame', 'WeaponBlasterMiddle', 'WeaponParam.RepeatFrame'),
  field('blaster', 'post-delay', 'BlasterMiddle', 'mPostDelayFrm_Main', 'WeaponBlasterMiddle', 'WeaponParam.PostDelayFrame'),
  field('blaster', 'guide-frame', 'BlasterMiddle', 'mGuideCheckCollisionFrame', 'WeaponBlasterMiddle', 'WeaponParam.ShotGuideFrame'),
  field('blaster', 'jump-bias', 'BlasterMiddle', 'mDegJumpBias', 'WeaponBlasterMiddle', 'WeaponParam.Jump_DegBiasMax'),
  field('blaster', 'jump-spread', 'BlasterMiddle', 'mDegJumpRandom', 'WeaponBlasterMiddle', 'WeaponParam.Jump_DegSwerve'),
  field('blaster', 'stand-spread', 'BlasterMiddle', 'mDegRandom', 'WeaponBlasterMiddle', 'WeaponParam.Stand_DegSwerve'),
  field('blaster', 'straight-frame', 'BlasterMiddle', 'mStraightFrame', 'WeaponBlasterMiddle', 'MoveParam.GoStraightToBrakeStateFrame'),
  field('blaster', 'straight-end-speed', 'BlasterMiddle', 'mStraightStateEndSpeed', 'WeaponBlasterMiddle', 'MoveParam.GoStraightStateEndMaxSpeed', 0.1),
    field('blaster', 'timed-sphere', 'BlasterMiddle_Burst', 'mSphereSplashPaintRadius', 'WeaponBlasterMiddle', 'BlasterBurstParam.SplashPaintRadius', 0.1),
  field('blaster', 'collision-sphere', 'BlasterMiddle_Burst', 'mSphereSplashPaintShotCollisionHitRadius', 'WeaponBlasterMiddle', 'BlasterBurstParam.SplashPaintShotColHitRadius', 0.1),
  field('blaster', 'timed-drop', 'BlasterMiddle_Burst', 'mSphereSplashDropPaintRadius', 'WeaponBlasterMiddle', 'BlasterBurstParam.SplashDropPaintRadius', 0.1),
  field('blaster', 'collision-drop', 'BlasterMiddle_Burst', 'mSphereSplashDropPaintShotCollisionHitRadius', 'WeaponBlasterMiddle', 'BlasterBurstParam.SplashDropPaintShotColHitRadius', 0.1),
  field('blaster', 'collision-radius-rate', 'BlasterMiddle_Burst', 'mShotCollisionHitRadiusRate', 'WeaponBlasterMiddle', 'BlasterBurstParam.ShotCollisionHitRadiusRate'),
]);

function at(object, name) {
  let cur = object;
  for (const part of name.split('.')) {
    if (!cur || typeof cur !== 'object' || !Object.hasOwn(cur, part))
      return { present: false, value: null };
    cur = cur[part];
  }
  return { present: true, value: cur };
}

export function classifyNumeric(s2, s3, factor = 1) {
  if (!Number.isFinite(s2) || !Number.isFinite(factor) || !(factor > 0))
    throw new TypeError('Invalid historical source number/field conversion');
  const converted = s2 * factor;
  if (s3 === null || s3 === undefined)
    return { status: 'omitted-s3-default-unknown', converted };
  if (!Number.isFinite(s3)) throw new TypeError('Non-finite explicit S3 number');
  return { status: Math.abs(converted - s3) <= 1e-9 ? 'same-extracted-value' : 'changed-extracted-value', converted };
}

export function compareLineage() {
  const cache = new Map();
  const get = (generation, basename) => {
    const key = generation + '/' + basename;
    if (!cache.has(key)) {
      const dir = generation === 'S2' ? S2 : S3;
      const filename = generation === 'S2' ? basename + '.json' : basename + '.game__GameParameterTable.json';
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, filename), 'utf8'));
      const body = generation === 'S2' ? parsed.param : parsed.GameParameters;
      if (!body || typeof body !== 'object')
        throw new TypeError('Unrecognized pinned archive ' + key);
      cache.set(key, body);
    }
    return cache.get(key);
  };
  const rows = LINEAGE_FIELDS.map(rule => {
    const legacy = at(get('S2', rule.s2File), rule.s2Key);
    const recent = at(get('S3', rule.s3File), rule.s3Key);
    if (!legacy.present) throw new Error('Missing S2 source field ' + rule.s2File + '.' + rule.s2Key);
    const result = classifyNumeric(legacy.value, recent.present ? recent.value : null, rule.factor);
    return {
      family: rule.family, key: rule.key,
      source2: rule.s2File + '.' + rule.s2Key, source3: rule.s3File + '.' + rule.s3Key,
      s2: legacy.value, factor: rule.factor, s2Converted: result.converted,
      s3Explicit: recent.present ? recent.value : null, status: result.status,
    };
  });
  const counts = Object.fromEntries(['same-extracted-value', 'changed-extracted-value', 'omitted-s3-default-unknown']
    .map(status => [status, rows.filter(r => r.status === status).length]));
  return { schema: 1, from: 'Splatoon 2 v5.5.0 (Leanny archived)', to: 'Splatoon 3 v11.3.0 (pinned)',
    note: 'Cross-generation parameter field comparison only, not a verified shared executable algorithm. Omitted S3 values do not imply inherited S2 defaults.',
    counts, rows };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.stdout.write(JSON.stringify(compareLineage(), null, 2) + '\n');
