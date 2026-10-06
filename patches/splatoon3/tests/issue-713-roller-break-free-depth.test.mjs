import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';

async function volley(vertical = false) {
  const f = await fixture(), { G, THREE } = f;
  G.scene = new THREE.Scene(); G.camera = new THREE.PerspectiveCamera(); G.actors = []; G.boss = null; G.netm = null;
  G.level.queryBlocks = (_a, _b, _c, _d, out) => { out.length = 0; return out; };
  G.physics = new f.Physics(G.level);
  const system = G.projectiles = new f.Projectiles(G.scene), a = f.make('roller');
  a.weaponRunner.s3FlickVertical = vertical; a.aimDir.set(0, 0, 1); a.aimPoint.set(0, 1, 50);
  f.setRandom(() => 0.5);
  const paints = [];
  G.paint.splat = (...args) => { paints.push(args); return 0; };
  system.fireFlick(a, a.weapon);
  return { f, system, a, globs: [...system.list], paints, THREE };
}
// Drive the installed integrator until the glob lands on the flat ground.
function land(f, q, ground = 0) {
  while (q.pos.y > ground) f.advanceFidelityProjectile(q, 1 / 60);
  return { x: q.pos.x, y: ground, z: q.pos.z };
}
function impact(f, system, q, point) {
  const hit = new f.Hit();
  hit.hit = true; hit.block = -1; hit.face = -1;
  hit.point.set(point.x, point.y, point.z); hit.normal.set(0, 1, 0);
  system._impact(q, hit);
  return hit;
}
const source = f => f.profile.weaponsFidelityCompletion.weapons.roller;
const unit = (f, vertical, index = 0) => source(f)[vertical ? 'VerticalSwingUnitGroupParam' : 'WideSwingUnitGroupParam'].Unit[index].UnitParam;

test('#713 both pinned height endpoints resolve to the matching break/free depth of their own record', async () => {
  const f = await fixture(), paint = unit(f, false).PaintParam;
  assert.equal(paint.HeightUseDepthScaleMaxBreakFree, 1.5);
  assert.equal(paint.HeightUseDepthScaleMinBreakFree, 10);
  const probe = (record, height) => {
    const q = { ghost: false, fidelityPhase: 1, start: { y: 0 }, fidelityRollerUnit: { UnitParam: { PaintParam: record } },
      fidelityBreakFreeY: height };
    return f.rollerBreakFreeDepth(q, { y: 0 });
  };
  assert.equal(probe(paint, 0), paint.DepthScaleMaxBreakFree);
  assert.equal(probe(paint, 1.5), paint.DepthScaleMaxBreakFree);
  assert.equal(probe(paint, 10), paint.DepthScaleMinBreakFree);
  assert.equal(probe(paint, 40), paint.DepthScaleMinBreakFree, 'the curve clamps, it does not keep extrapolating');
  assert.ok(Math.abs(probe(paint, (paint.HeightUseDepthScaleMaxBreakFree + paint.HeightUseDepthScaleMinBreakFree) / 2)
    - (paint.DepthScaleMaxBreakFree + paint.DepthScaleMinBreakFree) / 2) < 1e-9);
  // Both fields really are inputs: mirroring the thresholds mirrors the result.
  const mirrored = { ...paint, HeightUseDepthScaleMaxBreakFree: 10, HeightUseDepthScaleMinBreakFree: 1.5 };
  assert.equal(probe(mirrored, 1.5), paint.DepthScaleMinBreakFree);
  assert.equal(probe(mirrored, 10), paint.DepthScaleMaxBreakFree);
  // The endpoints come from the record, not from a Roller-wide constant.
  assert.notEqual(unit(f, false).PaintParam.DepthScaleMaxBreakFree, unit(f, true).PaintParam.DepthScaleMaxBreakFree);
});

test('#713 straight flight, ghosts, non-Roller rounds and records without the selector keep the caller amount', async () => {
  const f = await fixture(), paint = unit(f, false).PaintParam;
  const base = { ghost: false, start: { y: 6 }, fidelityRollerUnit: { UnitParam: { PaintParam: paint } }, fidelityBreakFreeY: 6 };
  assert.equal(f.rollerBreakFreeDepth({ ...base, fidelityPhase: 0 }, { y: 0 }), null);
  assert.equal(f.rollerBreakFreeDepth({ ...base, fidelityPhase: 1, ghost: true }, { y: 0 }), null);
  assert.equal(f.rollerBreakFreeDepth({ ...base, fidelityPhase: 1, fidelityRollerUnit: null }, { y: 0 }), null);
  assert.equal(f.rollerBreakFreeDepth({ ...base, fidelityPhase: 1, fidelityRollerUnit: { UnitParam: {} } }, { y: 0 }), null);
  assert.equal(f.rollerBreakFreeDepth({ ...base, fidelityPhase: 1, fidelityRollerUnit: { UnitParam: { PaintParam: { DepthScaleMaxBreakFree: 2 } } } }, { y: 0 }), null);
  // A break/free glob whose boundary height was never recorded falls back to its spawn height.
  const fallback = { ...base, fidelityPhase: 1, fidelityBreakFreeY: null, start: { y: 10 } };
  assert.equal(f.rollerBreakFreeDepth(fallback, { y: 0 }), paint.DepthScaleMinBreakFree);
});

test('#713 actual horizontal impact paint stretches by the resolved depth and keeps radius and direction', async () => {
  const { f, system, globs, paints } = await volley(false);
  assert.equal(globs.length, 13);
  const q = globs[0];
  const boundary = q.pos.y;
  const point = land(f, q);
  assert.ok(q.fidelityPhase > 0, 'the glob reached break/free before landing');
  assert.equal(q.fidelityBreakFreeY, boundary, 'the boundary height is recorded once, at the phase change');
  const expected = f.rollerBreakFreeDepth(q, point);
  impact(f, system, q, point);
  const [centre, , , opts] = paints.at(-1);
  // The selector runs at the actual paint centre, which the native impact path
  // offsets along the contact normal before splatting.
  assert.equal(centre.y, point.y + 0.14);
  assert.equal(opts.stretchAmt, expected);
  assert.equal(opts.stretchAmt, f.rollerBreakFreeDepth(q, centre));
  assert.ok(expected > 1 && expected <= unit(f, false).PaintParam.DepthScaleMaxBreakFree);
  assert.notEqual(opts.stretchAmt, 0.7, 'the generic amount no longer covers the break/free landing');
  // Only the longitudinal amount moves: centre, radius and stretch axis are untouched.
  assert.ok(Math.abs(paints.at(-1)[1] - (q.radius * 1.15)) <= q.radius * 0.3);
  assert.ok(Math.abs(opts.stretch.x - q.vel.clone().normalize().x) < 1e-12);
});

test('#713 a higher break/free arc of the same unit lands a shorter footprint', async () => {
  const { f, system, paints } = await volley(false);
  const low = system.list[1], high = system.list[2];
  const lowPoint = land(f, low);
  impact(f, system, low, lowPoint);
  const lowAmount = paints.at(-1)[3].stretchAmt;
  // Same unit, same paint centre height, entered from a much higher arc.
  high.pos.y = 9;
  const highPoint = land(f, high);
  assert.equal(highPoint.y, lowPoint.y);
  impact(f, system, high, highPoint);
  const highAmount = paints.at(-1)[3].stretchAmt;
  assert.ok(highAmount < lowAmount, `${highAmount} must be a shorter footprint than ${lowAmount}`);
  assert.ok(highAmount >= unit(f, false).PaintParam.DepthScaleMinBreakFree);
  assert.equal(lowAmount, f.rollerBreakFreeDepth(low, { x: lowPoint.x, y: lowPoint.y + 0.14, z: lowPoint.z }));
  assert.equal(highAmount, f.rollerBreakFreeDepth(high, { x: highPoint.x, y: highPoint.y + 0.14, z: highPoint.z }));
});

test('#713 vertical units keep their own distinct break/free depth values', async () => {
  const { f, system, paints } = await volley(true);
  assert.equal(system.list.length, 5);
  const paint = unit(f, true).PaintParam;
  const seen = [];
  for (const q of [...system.list]) {
    const point = land(f, q);
    impact(f, system, q, point);
    seen.push(paints.at(-1)[3].stretchAmt);
    assert.ok(seen.at(-1) >= paint.DepthScaleMinBreakFree && seen.at(-1) <= paint.DepthScaleMaxBreakFree);
  }
  const horizontal = unit(f, false).PaintParam;
  assert.notEqual(paint.DepthScaleMaxBreakFree, horizontal.DepthScaleMaxBreakFree);
  assert.notEqual(paint.DepthScaleMinBreakFree, horizontal.DepthScaleMinBreakFree);
  assert.ok(Math.max(...seen) < horizontal.DepthScaleMaxBreakFree, 'the vertical band stays below the horizontal maximum');
  for (const record of [paint, horizontal]) {
    assert.equal(record.HeightUseDepthScaleMaxBreakFree, 1.5);
    assert.equal(record.HeightUseDepthScaleMinBreakFree, 10);
  }
});

test('#713 non-Roller rounds and a straight-flight Roller keep the existing generic paint amount', async () => {
  const f = await fixture(), { G, THREE } = f;
  G.scene = new THREE.Scene(); G.camera = new THREE.PerspectiveCamera(); G.actors = []; G.boss = null; G.netm = null;
  G.level.queryBlocks = (_a, _b, _c, _d, out) => { out.length = 0; return out; };
  G.physics = new f.Physics(G.level);
  const system = G.projectiles = new f.Projectiles(G.scene), a = f.make('shooter');
  a.aimDir.set(0, 0, 1); a.aimPoint.set(0, 1, 50);
  const paints = [];
  G.paint.splat = (...args) => { paints.push(args); return 0; };
  system.fireShooter(a, a.weapon);
  const shot = system.list[0];
  while (shot.pos.y > 0) f.advanceFidelityProjectile(shot, 1 / 60);
  assert.ok(shot.fidelityPhase > 0, 'the round is in its installed free flight too');
  const point = { x: shot.pos.x, y: 0, z: shot.pos.z };
  impact(f, system, shot, point);
  assert.equal(paints.at(-1)[3].stretchAmt, 0.7);
  assert.equal(f.rollerBreakFreeDepth(shot, point), null, 'no Roller paint record, no resolved depth');
  assert.ok(THREE);
});