import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptSource } from '../adapter.mjs';
import { fidelityPlayerCollisionRadius, slosherDropScale, slosherYawOffset, fidelitySlosherImpactPaint, blasterPaintContract } from '../runtime/weapons-fidelity.mjs';

const root = new URL('../../../', import.meta.url);
const source = fs.readFileSync(new URL('inkwave-public/src/game/weapons.js', root), 'utf8');

test('weapons fidelity composes through the real gameplay adapter order', () => {
  const out = adaptSource('src/game/weapons.js', source);
  assert.match(out, /advanceFidelityProjectile\(p, dt\)/);
  assert.match(out, /fidelityProjectileTargets\(this, p\)/);
  assert.doesNotMatch(out, /if \(e\.team === p\.team \|\| !e\.alive\) continue;/, 'the consumer loop must not re-implement team/liveness filtering solved by fidelityProjectileTargets');
  assert.match(out, /p\.fidelityImpactActor === e/);
  assert.match(out, /p\.fidelityImpactT/);
  assert.match(out, /const elapsed = Math\.max\(0, dt - Math\.max\(0, p\.delay \|\| 0\)\)/);
  assert.match(out, /configureFidelityFlick\(p, a, w, i, ang, sp\)/);
  assert.match(out, /applyFidelitySlosherSplash/);
  assert.match(out, /e\.team !== p\.team\) this\._sloshSplash\(p, _v, e\)/, 'an ally-consumed glob must not splash enemies behind the blocker');
  assert.match(out, /WEAPONS_FIDELITY_EPSILON/);
  assert.match(out, /configureFidelityInkFlight\(this, \{ profileFor, launchSpeed, correctInkAim, referenceReach \}\)/,
    'native InkFlight helpers are injected once by the real Projectiles constructor');
});

test('critical native anchor changes fail closed through the full adapter', () => {
  for (const anchor of [
    `      p.age += dt;
      p.prev.copy(p.pos);
      if (p.age > p.straight) p.vel.y -= p.grav * dt;
      if (p.drag) p.vel.multiplyScalar(1 - p.drag * dt * (p.age > p.straight ? 1 : 0));
      p.pos.addScaledVector(p.vel, dt);`,
    '      // actors\n      for (const e of G.actors) {',
    '  constructor(scene) {\n    this.scene = scene;',
    '        if (e.team === p.team || !e.alive) continue;\n        const h = e.form === \'squid\' ? PLAYER.squidHeight : PLAYER.height;',
    '      if (!dead && p.age > p.life) {',
  ]) {
    assert.throws(() => adaptSource('src/game/weapons.js', source.replace(anchor, '')), /conflict/);
    assert.throws(() => adaptSource('src/game/weapons.js', source + anchor), /conflict/);
  }
});

test('profile and pinned reference retain explicit provenance boundaries', () => {
  const profile = JSON.parse(fs.readFileSync(new URL('patches/splatoon3/profile.json', root)));
  const ref = JSON.parse(fs.readFileSync(new URL('patches/splatoon3/reference/weapons-fidelity-reference.json', root)));
  assert.equal(profile.referenceVersion, '11.3.0');
  assert.equal(profile.referenceHz, 60);
  assert.equal(profile.weaponsFidelity.schema, 1);
  assert.equal(ref.sourceCommit, '7280ff9cde8bb1c5dcef46c700c326471584d2e6');
  assert.equal(ref.explicitFields.length, 63);
  assert.deepEqual(profile.weapons.roller.ballistics.horizontalPlayerCollision, { initRadius: 0.12, endRadius: 1.02, changeTime: 4 / 60 });
  assert.equal(profile.weapons.roller.ballistics.verticalUnits[2].playerCollision.endRadius, 0.82);
  assert.equal(ref.analystDefaults.every(x => x.official === false), true);
  assert.equal(ref.uncertainties.some(x => /world distance calibration/i.test(x)), true);
});


test('roller player collision grows from pinned initial to end radius over four frames', () => {
  const p = { size: 0.15, age: 0, fidelityPlayerCollision: { initRadius: 0.116, endRadius: 0.87, changeTime: 4 / 60 } };
  assert.equal(fidelityPlayerCollisionRadius(p), 0.116);
  p.age = 2 / 60; assert.ok(Math.abs(fidelityPlayerCollisionRadius(p) - 0.493) < 1e-12);
  p.age = 4 / 60; assert.equal(fidelityPlayerCollisionRadius(p), 0.87);
  p.age = 1; assert.equal(fidelityPlayerCollisionRadius(p), 0.87);
  p.fidelityPlayerCollision = null; assert.equal(fidelityPlayerCollisionRadius(p), 0.15);
});


test('Roller wall-drop source remains bound per flick unit', () => {
  const profile = JSON.parse(fs.readFileSync(new URL('patches/splatoon3/profile.json', root)));
  const roller = profile.weaponsFidelityCompletion.weapons.roller;
  const wideMain = roller.WideSwingUnitGroupParam.Unit[0].UnitParam;
  const wideNear = roller.WideSwingUnitGroupParam.Unit[1].UnitParam;
  const vertical = roller.VerticalSwingUnitGroupParam.Unit[0].UnitParam;
  assert.deepEqual(
    [wideMain.WallDropMoveParam.FallPeriodFirstFrameMin, wideMain.WallDropMoveParam.FallPeriodFirstFrameMax,
      wideMain.WallDropMoveParam.FallPeriodSecondFrame, wideMain.WallDropMoveParam.FallPeriodSecondTargetSpeed,
      wideMain.WallDropMoveParam.FallPeriodLastFrameMin, wideMain.WallDropMoveParam.FallPeriodLastFrameMax,
      wideMain.WallDropCollisionPaintParam.PaintRadiusGround],
    [60, 80, 5, .08, 20, 35, .5],
  );
  assert.deepEqual(
    [wideNear.WallDropMoveParam.FallPeriodFirstTargetSpeed, wideNear.WallDropMoveParam.FallPeriodSecondTargetSpeed,
      wideNear.WallDropCollisionPaintParam.PaintRadiusShock, wideNear.WallDropCollisionPaintParam.PaintRadiusFall,
      wideNear.WallDropCollisionPaintParam.PaintRadiusGround],
    [.06, .08, 1.3, .65, .5],
  );
  assert.deepEqual(
    [vertical.WallDropMoveParam.FallPeriodFirstTargetSpeed, vertical.WallDropMoveParam.FallPeriodSecondTargetSpeed,
      vertical.WallDropCollisionPaintParam.PaintRadiusShock, vertical.WallDropCollisionPaintParam.PaintRadiusFall,
      vertical.WallDropCollisionPaintParam.PaintRadiusGround],
    [.08, .10, 1.4, .7, .65],
  );
});

test('#1022 Slosher random-yaw bias changes scatter but preserves source angle and exceptions', () => {
  const u = { RandomRotateYDegree: 4.5, RandomRotateYBias: .65, RandomRotateYOffOrderNum: [0] };
  assert.equal(slosherYawOffset(u, 0, () => .75), 0);
  const bias = slosherYawOffset(u, 1, () => .75);
  const uniform = slosherYawOffset({ ...u, RandomRotateYBias: .5 }, 1, () => .75);
  assert.ok(bias > uniform && bias < 4.5 * Math.PI / 180, 'source 0.65 bias favors larger yaw than neutral 0.5');
  assert.ok(Math.abs(slosherYawOffset(u, 1, () => 1) - 4.5 * Math.PI / 180) < 1e-12);
  assert.ok(Math.abs(slosherYawOffset(u, 1, () => 0) + 4.5 * Math.PI / 180) < 1e-12);
});

test('#1140 high-drop Slosher collision narrows after normal age growth', () => {
  const profile = JSON.parse(fs.readFileSync(new URL('patches/splatoon3/profile.json', root)));
  const u = profile.weaponsFidelityCompletion.weapons.slosher.UnitGroupParam.Unit[1];
  const p = { fidelitySloshUnit: u, fidelitySloshIndex: 0, start: { y: 50 }, pos: { y: 50 },
    age: 5 / 60, size: .1, fidelityPlayerCollision: { initRadius: .1, endRadius: .8, changeTime: 4 / 60 } };
  assert.equal(slosherDropScale(p), 1);
  assert.equal(fidelityPlayerCollisionRadius(p), .8);
  p.pos.y = 38;
  assert.ok(Math.abs(slosherDropScale(p) - .7) < 1e-12);
  assert.ok(Math.abs(fidelityPlayerCollisionRadius(p) - .56) < 1e-12);
  p.pos.y = -10;
  assert.ok(fidelityPlayerCollisionRadius(p) < .08, 'extreme fall no longer retains a full-size damage capsule');
});

test('#1011 Slosher landing paint respects first/after-unit width and distance records', () => {
  const profile = JSON.parse(fs.readFileSync(new URL('patches/splatoon3/profile.json', root)));
  const u = profile.weaponsFidelityCompletion.weapons.slosher.UnitGroupParam.Unit[1];
  const p = { fidelitySloshUnit: u, fidelitySloshIndex: 0, start: { x: 0, y: 10, z: 0 }, pos: { y: 10 } };
  const radius = d => fidelitySlosherImpactPaint(p, { x: d, y: 10, z: 0 }).radius;
  assert.ok(Math.abs(radius(u.PaintParam.DistanceXZNear) - u.PaintParam.WidthHalfNear) < 1e-12);
  assert.ok(Math.abs(radius(u.PaintParam.DistanceXZFar) - u.PaintParam.WidthHalfFar) < 1e-12);
  p.fidelitySloshIndex = 1;
  assert.ok(Math.abs(radius(u.AfterPaintParam.DistanceXZNear) - u.AfterPaintParam.WidthHalfNear) < 1e-12);
  assert.ok(Math.abs(radius(u.AfterPaintParam.DistanceXZFar) - u.AfterPaintParam.WidthHalfFar) < 1e-12);
});

test('#1107 sparse Blaster timed burst restores normal and falling-drop defaults', () => {
  const profile = JSON.parse(fs.readFileSync(new URL('patches/splatoon3/profile.json', root)));
  const burst = blasterPaintContract(profile.weaponsFidelityCompletion.weapons.blaster).burst;
  assert.equal(burst.radius, 2.5, 'impact-specific radius remains independent');
  assert.equal(burst.timedSplashRadius, 2.0);
  assert.equal(burst.timedDropRadius, 3.2);
  assert.equal(burst.timedDropOn, true);
  assert.equal(burst.timedDropInitialSpeed, 0);
});
