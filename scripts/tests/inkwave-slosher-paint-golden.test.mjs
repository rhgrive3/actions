import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fixture, ROOT } from '../weapons-fixture.mjs';
import { reset, launch, finish, paintMetrics } from '../measure-weapons-fidelity.mjs';

// Frozen from a separate clean checkout of main 9c070329, before this PR.
// Includes native falling splash landings and the existing collision clipping.
const baselineBytes = fs.readFileSync(new URL('../fixtures/slosher-paint-9c070329.json', import.meta.url));
assert.equal(createHash('sha256').update(baselineBytes).digest('hex'), 'd5efddda50f4b97553e67685fd08fc75e273ae0562ce0177780aa3608e32ffad');
const baseline = JSON.parse(baselineBytes);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function assertBaseline(key, receipt) {
  const { cellsXZ, ...paint } = receipt.paint;
  assert.deepEqual({ paint, cellsHash: digest(cellsXZ), stampsHash: digest(receipt.stamps),
    impactsHash: digest(receipt.impacts) }, baseline[key], key + ': exact main scoring cells, stamps, impacts and RNG');
}

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
async function receipt({ legacyScale = false, legacyDepth = false, legacyMask = false, site } = {}) {
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
    const depthRatio = (src.DepthScaleNear + (src.DepthScaleFar - src.DepthScaleNear) * t) * shrink;
    // PaintSystem adds its base width before stretchAmt. A source ratio of
    // one must therefore be zero additional stretch, not a second base width.
    const depth = Math.max(0, depthRatio - 1);
    const splat = f.G.paint.splat;
    let count = 0;
    f.G.paint.splat = function (point, actualRadius, team, opts) {
      count++;
      near(actualRadius, radius); near(opts.stretchAmt, depth);
      assert.equal(opts.claimOwner, a, 'the real landing stamp retains the native actor');
      impacts.push({ distance, radius, depth, index: p.fidelitySloshIndex });
      if (legacyDepth) opts = { ...opts, stretchAmt: depthRatio };
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
  if (legacyMask) {
    // Change only the raster kind. Keep the same launch, physical landings,
    // source dimensions, owners and seeded random sequence.
    const sourceSplat = f.G.paint.splat;
    f.G.paint.splat = function (point, radius, team, opts) {
      const kind = opts.kind === 'source-shot' ? 'shot' : opts.kind === 'source-splash' ? 'drop' : opts.kind;
      return sourceSplat.call(this, point, radius, team, { ...opts, kind });
    };
  }
  launch(f, a, c); finish(f, a);
  assert.equal(impacts.length, 9, 'all nine native units reach their source-owned landing');
  const paint = paintMetrics(f);
  if (!legacyMask) {
    const cells = sourceCells(f);
    assert.deepEqual(paint.cellsXZ, cells, 'every scored cell matches the independent source boundary');
    assert.equal(paint.area, cells.length * paint.cell ** 2);
  }
  assert.equal(f.draws(), 35, 'the raster-kind control must not change the seeded flight');
  return { paint, impacts, stamps: structuredClone(f.paints) };
}

// Independent flat-floor oracle: intersect each source sphere with the floor,
// then test cell centres against its two directional half-ellipses. Do not use
// PaintSystem._cpuSplat, blobWobble, its culling bounds, or the production mask.
function sourceCells(f) {
  assert.equal(f.G.paint.paintFaces.length, 1);
  const face = f.G.paint.paintFaces[0];
  assert.deepEqual(Array.from(face.n.toArray()), [0, 1, 0]);
  assert.deepEqual(Array.from(face.u.toArray()), [1, 0, 0]);
  assert.deepEqual(Array.from(face.v.toArray()), [0, 0, 1]);
  assert.equal(f.paints.length, 19, 'nearest splash, nine falling flight splashes and nine native impacts');
  assert.equal(f.paints.filter(p => p.kind === 'source-shot').length, 9);
  assert.equal(f.paints.filter(p => p.kind === 'source-splash').length, 10);
  const circles = f.paints.filter(p => p.stretch === null);
  assert.equal(circles.length, 9, 'depth-one falling splashes use a circle');
  assert.ok(circles.every(p => p.kind === 'source-splash' && p.stretchAmt === null));
  const shapes = f.paints.map(p => {
    assert.equal(p.cosmetic, false); assert.equal(p.team, 0);
    const height = p.center[1] - face.origin.y;
    assert.ok(height >= 0 && height < p.radius);
    const radiusSquared = p.radius ** 2 - height ** 2;
    const length = p.stretch ? Math.hypot(p.stretch[0], p.stretch[2]) : 0;
    assert.ok(p.stretch === null || length > .2);
    return { x: p.center[0], z: p.center[2], radiusSquared,
      dx: length ? p.stretch[0] / length : 0, dz: length ? p.stretch[2] / length : 0,
      circle: !length,
      stretch: p.stretchAmt * length };
  });
  const cells = [];
  for (let j = 0; j < face.nv; j++) for (let i = 0; i < face.nu; i++) {
    const x = face.origin.x + (i + .5) * face.cu;
    const z = face.origin.z + (j + .5) * face.cv;
    const owned = shapes.some(s => {
      const dx = x - s.x, dz = z - s.z;
      const along = dx * s.dx + dz * s.dz, across = dx * s.dz - dz * s.dx;
      const depth = 1 + s.stretch * (along > 0 ? 1 : .25);
      return (s.circle ? dx ** 2 + dz ** 2 : across ** 2 + (along / depth) ** 2) <= s.radiusSquared;
    });
    if (owned) cells.push([x, z]);
  }
  return cells;
}

test('Slosher source-scaled paint golden rejects stale scale and double-counted base depth', async () => {
  const current = await receipt(), legacy = await receipt({ legacyScale: true }), oldDepth = await receipt({ legacyDepth: true });
  assertBaseline('current', current);
  assertBaseline('legacyScale', legacy);
  assertBaseline('legacyDepth', oldDepth);
  assert.equal(current.paint.bounds.maxZ, 17.375);
  assert.equal(current.paint.area, 75.25);
  assert.equal(legacy.paint.bounds.maxZ, 14.875, 'negative control retains the stale scale with the sourced mask');
  assert.equal(legacy.paint.area, 16.8125);
  assert.equal(oldDepth.paint.bounds.maxZ, 21.375, 'raw depth ratio double-counts the base width');
  assert.equal(oldDepth.paint.area, 103.6875);
  assert.notEqual(current.paint.bounds.maxZ, legacy.paint.bounds.maxZ);
  assert.notEqual(current.paint.bounds.maxZ, oldDepth.paint.bounds.maxZ);
  assert.deepEqual(current.impacts, oldDepth.impacts, 'depth-only negative control preserves source radii and native landing');
  assert.deepEqual(current.impacts, legacy.impacts, 'only the obsolete second paint wrapper changes the receipt');
  // The same main graph supplies six frozen receipts, including generic-mask
  // negative controls. Only the raster kind changes; all 19 physical stamps remain.
  for (const [options, sourced, key, maxZ, area] of [
    [{}, current, 'generic', 17.875, 79.875],
    [{ legacyScale: true }, legacy, 'genericLegacyScale', 15.125, 17.4375],
    [{ legacyDepth: true }, oldDepth, 'genericLegacyDepth', 22.125, 109.5625],
  ]) {
    const generic = await receipt({ ...options, legacyMask: true });
    assertBaseline(key, generic);
    assert.equal(generic.paint.bounds.maxZ, maxZ);
    assert.equal(generic.paint.area, area);
    assert.deepEqual(generic.impacts, sourced.impacts);
    const physical = stamps => stamps.map(({ kind, area: credited, ...stamp }) => stamp);
    assert.deepEqual(physical(generic.stamps), physical(sourced.stamps),
      'kind-only control retains every physical paint event and seed');
    assert.notDeepEqual(generic.paint.cellsXZ, sourced.paint.cellsXZ);
  }
});

test('emitted Slosher paint golden retains source radii, owners and exact scoring cells', { skip: !process.env.INKWAVE_BUILT_SITE }, async () => {
  const source = await receipt(), emitted = await receipt({ site: process.env.INKWAVE_BUILT_SITE });
  assertBaseline('current', source);
  assertBaseline('current', emitted);
  assert.deepEqual(emitted, source);
});
