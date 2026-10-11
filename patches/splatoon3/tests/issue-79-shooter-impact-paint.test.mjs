import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture as world } from '../../../scripts/weapons-fixture.mjs';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { shooterImpactRadius, shooterImpactDepthScale } from '../runtime/shooter-impact-paint.mjs';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const lerp = (a, b, t) => a + (b - a) * t;
// Sourced Ver. 11.3.0 values (WeaponShooterNormal PaintParam), scale 1.
const impactPaint = { widthNear: 1.93, widthMiddle: 1.93, widthFar: 1.71, distanceMiddle: 1.1,
  depthMax: 2.24, depthMin: 1.31, depthMaxBreakFree: 2.24, depthMinBreakFree: 1.12 };
const weapon = { range: 10, impactPaint };
const vec = (x, y, z) => ({ x, y, z, distanceTo(o) { return Math.hypot(x - o.x, y - o.y, z - o.z); } });
const incidence = deg => { const r = deg * Math.PI / 180; return { x: Math.cos(r), y: -Math.sin(r), z: 0 }; };
const floorNormal = vec(0, 1, 0);

test('#79 floor footprint: near band keeps WidthHalfNear, far end reaches WidthHalfFar, beyond range clamps', () => {
  const at = d => shooterImpactRadius(weapon, { start: vec(0, 0, 0) }, vec(d, 0, 0));
  near(at(0.5), 1.93);
  near(at(1.1), 1.93);
  near(at(10), 1.71);
  near(at(14), 1.71);
  near(at(5.55), lerp(1.93, 1.71, (5.55 - 1.1) / (10 - 1.1)));
  // Monotonic between the sourced middle and far endpoints.
  assert.ok(at(3) >= at(7) && at(7) >= at(10));
  assert.equal(shooterImpactRadius({ range: 10 }, { start: vec(0, 0, 0) }, vec(1, 0, 0)), null);
});

test('#79 floor depth: grazing uses the Max envelope, head-on the Min envelope, break-free phases their own pair', () => {
  const depth = (deg, phase = 0) => shooterImpactDepthScale(weapon, { vel: incidence(deg), fidelityPhase: phase }, floorNormal);
  near(depth(5), 2.24);
  near(depth(10), 2.24);
  near(depth(22.5), (2.24 + 1.31) / 2);
  near(depth(35), 1.31);
  near(depth(60), 1.31);
  near(depth(5, 1), 2.24);
  near(depth(60, 1), 1.12);
  near(depth(22.5, 2), (2.24 + 1.12) / 2);
});

test('#79 floor impact paint uses the sourced footprint and ignores the native radius jitter across seeds', async () => {
  const seen = [];
  for (const seed of [1, 42, 87654]) {
    const f = await world({ fidelity: true, seed });
    const { Vector3 } = f.THREE, G = f.G, w = f.WEAPONS.shooter;
    const a = f.make('shooter');
    const records = [];
    const native = G.paint.splat;
    G.paint.splat = function (c, r, t, opts = {}) { records.push({ r, stretchAmt: opts.stretchAmt }); return native.call(this, c, r, t, opts); };
    const cases = [
      { d: 0.8, angle: 5, phase: 0, expectRadius: 1.93, expectDepth: 2.24 },
      { d: 0.8, angle: 60, phase: 0, expectRadius: 1.93, expectDepth: 1.31 },
      { d: 0.8, angle: 60, phase: 1, expectRadius: 1.93, expectDepth: 1.12 },
    ];
    for (const c of cases) {
      records.length = 0;
      const speed = 10, dir = incidence(c.angle);
      const p = { type: 'shot', wid: w.id, s3Weapon: w, owner: a, team: a.team, seed: 7, ghost: false, radius: w.impactRadius,
        start: new Vector3(0, 0, 0), vel: new Vector3(dir.x * speed, dir.y * speed, 0), fidelityPhase: c.phase, age: 0 };
      f.projectiles._impact(p, { point: new Vector3(c.d, 0, 0), normal: new Vector3(0, 1, 0) });
      assert.equal(records.length, 1, `one impact splat for ${JSON.stringify(c)}`);
      near(records[0].r, c.expectRadius);
      near(records[0].stretchAmt, c.expectDepth - 1);
      seen.push(records[0].r);
    }
    G.paint.splat = native;
  }
  // Native radius would be 0.85 * (0.85..1.15) and differ per seed; the sourced footprint does not.
  assert.ok(seen.every(r => Math.abs(r - 1.93) < 1e-9));
});

test('#79 far-range floor impact reaches the sourced far width at the weapon range', async () => {
  const f = await world({ fidelity: true, seed: 3 });
  const { Vector3 } = f.THREE, G = f.G, w = f.WEAPONS.shooter;
  const a = f.make('shooter');
  const records = [];
  const native = G.paint.splat;
  G.paint.splat = function (c, r, t, opts = {}) { records.push(r); return native.call(this, c, r, t, opts); };
  const p = { type: 'shot', wid: w.id, s3Weapon: w, owner: a, team: a.team, seed: 9, ghost: false, radius: w.impactRadius,
    start: new Vector3(0, 0, 0), vel: new Vector3(0, -10, 0), fidelityPhase: 0, age: 0 };
  f.projectiles._impact(p, { point: new Vector3(w.range, 0, 0), normal: new Vector3(0, 1, 0) });
  G.paint.splat = native;
  assert.equal(records.length, 1);
  near(records[0], w.impactPaint.widthFar);
  near(w.impactPaint.widthFar, 1.71);
});

test('#79 wall contact keeps the native impact path (dedicated wall footprint remains 未確認)', async () => {
  const f = await world({ fidelity: true, seed: 11 });
  const { Vector3 } = f.THREE, G = f.G, w = f.WEAPONS.shooter;
  const a = f.make('shooter');
  const records = [];
  const native = G.paint.splat;
  G.paint.splat = function (c, r, t, opts = {}) { records.push(r); return native.call(this, c, r, t, opts); };
  const p = { type: 'shot', wid: w.id, s3Weapon: w, owner: a, team: a.team, seed: 5, ghost: false, radius: w.impactRadius,
    start: new Vector3(0, 0, 0), vel: new Vector3(10, 0, 0), fidelityPhase: 0, age: 0 };
  f.projectiles._impact(p, { point: new Vector3(1, 0, 0), normal: new Vector3(-1, 0, 0) });
  G.paint.splat = native;
  assert.equal(records.length, 1);
  assert.ok(records[0] >= w.impactRadius * 0.85 - 1e-9 && records[0] <= w.impactRadius * 1.15 + 1e-9, `${records[0]}`);
  assert.ok(Math.abs(records[0] - 1.93) > 0.1);
});

test('#79 invalid or missing Shooter impact source fails closed at install', async () => {
  await assert.rejects(fixture({ profileTransform(p) {
    delete p.weaponsFidelityCompletion.weapons.shooter.PaintParam.WidthHalfNear;
  } }), /Invalid Shooter impact paint source/);
  await assert.rejects(fixture({ profileTransform(p) {
    p.weaponsFidelityCompletion.weapons.shooter.PaintParam.DepthScaleMin = 0;
  } }), /Invalid Shooter impact paint source/);
});
