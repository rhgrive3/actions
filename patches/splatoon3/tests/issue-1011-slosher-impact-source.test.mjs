import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

// #1011: the native Slosher impact is the only first terrain stamp. Its radius and
// stretch come from the source unit, the first (PaintParam) or later (AfterPaintParam)
// bullet record, and the near/far DistanceXZ endpoint at the actual impact distance.
// Expected values are the pinned profile records times the profile world scale.
const close = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-9, `${label}: ${a} != ${b}`);

// Fires one nine-bullet volley and impacts every glob at one source endpoint.
async function impactsAt(endpoint) {
  const f = await fixture({ productionComposition: true, realProjectiles: true, fullRuntime: true });
  const scale = f.profile.weaponsFidelityCompletion.worldUnitsPerSourceUnit;
  const units = f.profile.weaponsFidelityCompletion.weapons.slosher.UnitGroupParam.Unit.filter(u => u.BulletNum > 0);
  f.setRandom(() => 0.5);
  const a = f.make('slosher');
  a.nid = 42; a.owner = 'local'; a.pos.set(0, 1, 0); a.aimPoint.set(0, 1, 10); a.aimDir.set(0, 0.1, 1).normalize();
  f.G.level.queryBlocks = (_a, _b, _c, _d, out) => { out.length = 0; return out; };
  f.G.physics = new f.Physics(f.G.level);
  // Only paint is under test; an empty enemy list keeps the head-splash side effect out of it.
  f.G.actors = [a];
  f.G.camera = { position: new f.THREE.Vector3(0, 4, -8) };
  const ps = f.G.projectiles;
  ps.fireSlosh(a, a.weapon);
  assert.equal(ps.list.length, 9);
  const calls = [];
  f.G.paint.splat = (...args) => { calls.push(args); return 0; };
  const rows = [];
  for (const p of [...ps.list]) {
    const unit = p.fidelitySloshUnit, index = p.fidelitySloshIndex, start = p.start.clone();
    const paint = index === 0 ? unit.PaintParam : unit.AfterPaintParam;
    const hit = new f.Hit();
    hit.hit = true; hit.point.set(start.x + paint[endpoint] * scale, start.y, start.z); hit.normal.set(0, 1, 0);
    calls.length = 0;
    // The head splash runs after the terrain stamp and is outside this paint contract.
    p.head = false;
    // The pool may recycle p once _impact returns, so only the snapshot above is read afterwards.
    ps._impact(p, hit);
    rows.push({ unit: units.indexOf(unit), index, paint, first: calls[0] });
  }
  return { rows, scale };
}

test('#1011 native Slosher impact paints each source unit/bullet record at its near and far endpoints', async () => {
  for (const [endpoint, radiusKey, depthKey] of [
    ['DistanceXZNear', 'WidthHalfNear', 'DepthScaleNear'],
    ['DistanceXZFar', 'WidthHalfFar', 'DepthScaleFar'],
  ]) {
    const { rows, scale } = await impactsAt(endpoint);
    assert.equal(rows.length, 9);
    for (const { unit, index, paint, first } of rows) {
      const label = `unit ${unit + 1} bullet ${index} ${endpoint}`;
      assert.ok(first, `${label} paints through the native stamp`);
      close(first[1], paint[radiusKey] * scale, `${label} radius`);
      close(first[3].stretchAmt, Math.max(0.05, paint[depthKey]), `${label} depth`);
    }
    // Unit 1 first 4.44/3.84 and later 1.44/1.92; Unit 2 first 1.2/1.2 and later 0.96/1.14.
    const width = (unit, index) => rows.find(r => r.unit === unit && r.index === index).first[1];
    const expected = endpoint === 'DistanceXZNear'
      ? { u1First: 4.44, u1Later: 1.44, u2First: 1.2, u2Later: 0.96 }
      : { u1First: 3.84, u1Later: 1.92, u2First: 1.2, u2Later: 1.14 };
    close(width(0, 0), expected.u1First * scale, `Unit1 first ${endpoint}`);
    close(width(0, 1), expected.u1Later * scale, `Unit1 later ${endpoint}`);
    close(width(1, 0), expected.u2First * scale, `Unit2 first ${endpoint}`);
    close(width(1, 3), expected.u2Later * scale, `Unit2 later ${endpoint}`);
  }
});

console.log('#1011 native Slosher source impact paint tests passed');
