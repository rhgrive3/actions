import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fixture, ROOT } from '../weapons-fixture.mjs';
import { reset, launch, finish, paintMetrics } from '../measure-weapons-fidelity.mjs';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
async function receipt({ legacyScale = false, site } = {}) {
  const f = await fixture({ fidelity: true, site: site || path.join(ROOT, '.ci-scratch/unbuilt-slosher-golden') });
  const c = { key: 'slosher', id: 'slosher' }, a = reset(f, c);
  const scale = f.profile.weaponsFidelityCompletion.worldUnitsPerSourceUnit;
  assert.equal(scale, 1, 'the configured source-to-world scale is one, not range-line units');
  const nativeImpact = f.projectiles._impact, impacts = [];
  f.projectiles._impact = function (p, hit) {
    if (p.type !== 'slosh' || !p.fidelitySloshUnit) return nativeImpact.call(this, p, hit);
    const src = p.fidelitySloshIndex > 0 ? p.fidelitySloshUnit.AfterPaintParam : p.fidelitySloshUnit.PaintParam;
    const distance = Math.hypot(hit.point.x - p.start.x, hit.point.z - p.start.z);
    const t = Math.max(0, Math.min(1, (distance / scale - src.DistanceXZNear) / (src.DistanceXZFar - src.DistanceXZNear)));
    const drop = Math.max(0, p.start.y - hit.point.y);
    const fall = Math.max(0, Math.min(1, (drop - src.ScaleStartFallDistance) / (src.ScaleEndFallDistance - src.ScaleStartFallDistance)));
    const shrink = 1 + (src.WidthDepthScaleFall - 1) * fall;
    const radius = (src.WidthHalfNear + (src.WidthHalfFar - src.WidthHalfNear) * t) * scale * shrink;
    const depth = Math.max(.05, (src.DepthScaleNear + (src.DepthScaleFar - src.DepthScaleNear) * t) * shrink);
    const splat = f.G.paint.splat;
    let count = 0;
    f.G.paint.splat = function (point, actualRadius, team, opts) {
      count++;
      near(actualRadius, radius); near(opts.stretchAmt, depth);
      assert.equal(opts.claimOwner, a, 'the real landing stamp retains the native actor');
      impacts.push({ distance, radius, depth, index: p.fidelitySloshIndex });
      if (legacyScale) {
        // Reproduce the removed second wrapper: it ignored the configured
        // world scale and drop correction, treating range-line 0.2 as world units.
        const oldT = Math.max(0, Math.min(1, (distance - src.DistanceXZNear * .2) / ((src.DistanceXZFar - src.DistanceXZNear) * .2)));
        actualRadius = (src.WidthHalfNear + (src.WidthHalfFar - src.WidthHalfNear) * oldT) * .2;
        opts = { ...opts, stretchAmt: src.DepthScaleNear + (src.DepthScaleFar - src.DepthScaleNear) * oldT };
      }
      return splat.call(this, point, actualRadius, team, opts);
    };
    try { return nativeImpact.call(this, p, hit); }
    finally { f.G.paint.splat = splat; assert.equal(count, 1, 'one authoritative native landing stamp'); }
  };
  launch(f, a, c); finish(f, a);
  assert.equal(impacts.length, 9, 'all nine native units reach their source-owned landing');
  return { paint: paintMetrics(f), impacts };
}

test('Slosher exact paint golden follows source-scaled native landing, and rejects the legacy 0.2 override', async () => {
  const current = await receipt(), legacy = await receipt({ legacyScale: true });
  assert.equal(current.paint.bounds.maxZ, 20.875);
  assert.equal(current.paint.area, 102.9375);
  assert.equal(legacy.paint.bounds.maxZ, 13.625, 'negative control reproduces the stale CI golden');
  assert.notEqual(current.paint.bounds.maxZ, legacy.paint.bounds.maxZ);
  assert.deepEqual(current.impacts, legacy.impacts, 'only the obsolete second paint wrapper changes the receipt');
});

test('emitted Slosher paint golden retains source radii, owners and exact scoring cells', { skip: !process.env.INKWAVE_BUILT_SITE }, async () => {
  const source = await receipt(), emitted = await receipt({ site: process.env.INKWAVE_BUILT_SITE });
  assert.deepEqual(emitted, source);
});
