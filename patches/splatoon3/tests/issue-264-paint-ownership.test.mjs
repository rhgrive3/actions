import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { shaderPaintMaskContains } from '../runtime/paint-ownership.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = path.join(ROOT, 'inkwave-public');
const PAINT_FILE = path.join(UPSTREAM, 'src/world/paint.js');
const PAINT_SOURCE = fs.readFileSync(PAINT_FILE, 'utf8');

async function loadPaint(adapt = true) {
  const context = vm.createContext({ console, performance });
  const modules = new Map();
  function resolve(specifier, from) {
    if (specifier === 'three') return path.join(UPSTREAM, 'vendor/three/build/three.module.js');
    let file = path.resolve(path.dirname(from), specifier);
    if (file.startsWith(path.join(UPSTREAM, 'patches') + path.sep)) {
      file = path.join(ROOT, 'patches', path.relative(path.join(UPSTREAM, 'patches'), file));
    } else if (file.startsWith(path.join(ROOT, 'inkwave-public') + path.sep)) {
      file = path.join(UPSTREAM, path.relative(path.join(ROOT, 'inkwave-public'), file));
    }
    if (file.startsWith(path.join(ROOT, 'src/'))) file = path.join(UPSTREAM, path.relative(ROOT, file));
    return file;
  }
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    let source = fs.readFileSync(file, 'utf8');
    if (file.startsWith(UPSTREAM + path.sep) && adapt) source = adaptSource(path.relative(UPSTREAM, file), source);
    const module = new vm.SourceTextModule(source, { context, identifier: file });
    modules.set(file, module);
    return module;
  }
  const entry = new vm.SourceTextModule(adapt ? `
    export { PaintSystem, blobWobble, PAINT_GPU_OWNERSHIP_CONTRACT } from './inkwave-public/src/world/paint.js';
    export * as THREE from 'three';
  ` : `
    export { PaintSystem } from './inkwave-public/src/world/paint.js';
    export * as THREE from 'three';
  `, { context, identifier: path.join(ROOT, 'issue-264-fixture-entry.mjs') });
  await entry.link((specifier, referencing) => load(resolve(specifier, referencing.identifier)));
  await entry.evaluate();
  return entry.namespace;
}

function makePaint(PaintSystem, THREE, { cell = 0.25, wall = false } = {}) {
  const cells = Math.round(10 / cell);
  const face = {
    atlas: { x: 0, y: 0, w: 512, h: 512, pad: 8, ppm: 20 },
    origin: new THREE.Vector3(0, 0, 0), n: new THREE.Vector3(0, 1, 0),
    u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, 1),
    su: 10, sv: 10, wall, turf: true, nu: cells, nv: cells, cu: cell, cv: cell, grid: 0,
  };
  const paint = Object.create(PaintSystem.prototype);
  paint.level = {
    blocks: [{
      aabbMin: new THREE.Vector3(0, -1, 0), aabbMax: new THREE.Vector3(10, 1, 10),
      faces: [0, -1, -1, -1, -1, -1],
    }],
    faces: [face],
    queryBlocks: () => [0],
  };
  paint.growing = [];
  if (paint._takeSplatEntries) Object.assign(paint, {
    _splatEntryPool: [], _splatGrowthPool: [], _splatPoolsDisposed: false,
    _splatPoolStats: { entryArraysCreated: 0, entryArraysReused: 0, growthRecordsCreated: 0, growthRecordsReused: 0 },
  });
  paint.grid = new Uint8Array(face.nu * face.nv);
  paint.dead = new Uint8Array(face.nu * face.nv);
  paint.counts = [0, 0];
  paint.turfTotal = face.nu * face.nv;
  paint.version = 0;
  paint.clock = 0;
  paint.frame = 0;
  paint._wetUntil = 0;
  paint._dryAcc = 0;
  paint._dryU = { uDry: { value: 0 } };
  paint.size = 1024;
  paint.quads = 0;
  paint.aPos = new Float32Array(6000 * 4 * 2);
  paint.aLocal = new Float32Array(6000 * 4 * 3);
  paint.aSplat = new Float32Array(6000 * 4 * 4);
  paint.aStretch = new Float32Array(6000 * 4 * 3);
  paint.aGrow = new Float32Array(6000 * 4 * 4);
  paint.dryMesh = { visible: false };
  paint._rippledNear = () => false;
  paint.ripple = () => {};
  paint._drawQuads = function drawIntoNoRenderer() { this.quads = 0; };

  const submitted = [];
  const pushQuad = paint._pushQuad;
  paint._pushQuad = function recordNativeQuad(...args) {
    const first = this.quads;
    const result = pushQuad.apply(this, args);
    for (let q = first; q < this.quads; q++) {
      const grow = q * 16;
      submitted.push({ tn: this.aGrow[grow], dT: this.aGrow[grow + 1], mode: this.aGrow[grow + 2] });
    }
    return result;
  };
  return { paint, face, submitted };
}

function growthEntry(g, face) {
  for (let i = 0; i < g.entries.length; i += 7) {
    if (g.entries[i] === face) return {
      f: face, lu: g.entries[i + 1], lv: g.entries[i + 2], dn: g.entries[i + 3],
      sdu: g.entries[i + 4], sdv: g.entries[i + 5], sa: g.entries[i + 6],
    };
  }
  assert.fail('native growth entry for the turf face was captured');
}

function findMaskCell(g, face, contract, blobWobble, options, reject = () => false) {
  const entry = growthEntry(g, face);
  for (let j = 0; j < face.nv; j++) for (let i = 0; i < face.nu; i++) {
    const x = (i + 0.5) * face.cu, z = (j + 0.5) * face.cv;
    const px = x - entry.lu, py = z - entry.lv;
    if (reject(px, py)) continue;
    if (shaderPaintMaskContains(g, entry, px, py, contract, blobWobble, options)) {
      return { x, z, i, j, index: j * face.nu + i, entry, px, py };
    }
  }
  return null;
}

function stats(paint, point, team, radius = 0.75) {
  return paint.regionStats(point.x, 0, point.z, radius, team);
}

test('production PaintSystem assigns the complete seeded bomb mask to CPU ownership at every render cadence', async () => {
  const runtime = await loadPaint(true);
  assert.deepEqual(Array.from(runtime.PAINT_GPU_OWNERSHIP_CONTRACT.kindShapes, row => Array.from(row)), [
    [5, 7, 8, 3], [3, 4, 5, 2], [7, 9, 10, 4], [10, 12, 14, 5], [3, 4, 4, 2], [2, 2, 0, 1],
  ], 'the runtime mask table is extracted from the native shader kindShape contract');

  const center = new runtime.THREE.Vector3(2.5, 0, 2.5);
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
    const { paint, face, submitted } = makePaint(runtime.PaintSystem, runtime.THREE);
    const claim = paint.splat(center, 2.7, 0, { seed: 0.5, kind: 'bomb' });
    const growth = paint.growing[0];
    assert.ok(growth, 'the native PaintSystem queued its ordinary shader growth record');
    assert.ok(claim > 15, 'the native body area remains claimed and supported shader geometry adds CPU-owned cells');

    const ancillaryPoint = findMaskCell(growth, face, runtime.PAINT_GPU_OWNERSHIP_CONTRACT, runtime.blobWobble,
      { ancillary: true, drips: true }, (px, py) =>
        shaderPaintMaskContains(growth, growthEntry(growth, face), px, py,
          runtime.PAINT_GPU_OWNERSHIP_CONTRACT, runtime.blobWobble, { ancillary: false, drips: false }));
    assert.ok(ancillaryPoint, 'a final full-shader cell outside the body-only mask was found');
    const samplePoint = { x: ancillaryPoint.x, z: ancillaryPoint.z };
    assert.equal(shaderPaintMaskContains(growth, ancillaryPoint.entry, ancillaryPoint.px, ancillaryPoint.py,
      runtime.PAINT_GPU_OWNERSHIP_CONTRACT, runtime.blobWobble), true,
    'the final native fragment-mask reference covers the CPU ancillary query cell');
    assert.equal(shaderPaintMaskContains(growth, ancillaryPoint.entry, ancillaryPoint.px, ancillaryPoint.py,
      runtime.PAINT_GPU_OWNERSHIP_CONTRACT, runtime.blobWobble, { ancillary: false, drips: false }), false,
    'the same cell is outside the body-only landing mask');
    assert.equal(paint.sampleWorld(0, new runtime.THREE.Vector3(samplePoint.x, 0, samplePoint.z)), 1);
    assert.ok(stats(paint, samplePoint, 0).own > 0, 'regionStats observes the GPU-supported CPU-owned cell');
    assert.equal(paint.coverage()[0], paint.counts[0] / paint.turfTotal, 'coverage includes the added mask cells');
    assert.equal(claim, paint.counts[0] * face.cu * face.cv, 'the splat award equals its uniquely owned turf area');
    assert.deepEqual(submitted.map(q => q.mode), [2], 'the landing draw remains body-only');

    const grid = paint.grid.slice(), counts = [...paint.counts];
    paint.splat(center, 2.7, 1, { seed: 0.5, kind: 'bomb' });
    assert.equal(paint.growing.length, 1, 'the previous opposing growth is finalized before the new growth is retained');
    assert.deepEqual(submitted.map(q => q.mode), [2, 0, 2], 'old full effects draw before the new body-only landing quad');
    assert.equal(paint.sampleWorld(0, new runtime.THREE.Vector3(samplePoint.x, 0, samplePoint.z)), 2, 'newer opposing ink owns the same ancillary cell');
    assert.equal(paint.counts[0], 0);
    assert.equal(paint.counts[0] + paint.counts[1], counts[0] + counts[1], 'identical opposite ink transfers turf exactly once');
    assert.notDeepEqual(paint.grid, grid);

    let frames = 0;
    while (paint.growing.length && frames++ < 150) paint.flush(dt);
    assert.equal(paint.growing.length, 0, `native shader growth completes at ${Math.round(1 / dt)}Hz`);
    assert.deepEqual(paint.grid, Uint8Array.from(grid, value => value ? (value === 1 ? 2 : 1) : 0),
      'completed GPU growth leaves the deterministic final CPU ownership mask unchanged');
    assert.equal(paint.coverage()[1], paint.counts[1] / paint.turfTotal);

    const postGrowth = [...paint.counts];
    assert.equal(paint.splat(center, 2.7, 1, { seed: 0.5, kind: 'bomb' }), 0, 'replaying the same team mask cannot award the same cells twice');
    assert.deepEqual([...paint.counts], postGrowth);
    assert.deepEqual(Array.from(paint.coverage()), [0, postGrowth[1] / paint.turfTotal]);
  }
});

test('wall drip mask contributes to face ownership while cosmetic specks remain render-only', async () => {
  const runtime = await loadPaint(true);
  const { paint, face, submitted } = makePaint(runtime.PaintSystem, runtime.THREE, { cell: 0.25, wall: true });
  const center = new runtime.THREE.Vector3(5, 0, 5);
  const claim = paint.splat(center, 2.7, 0, { seed: 0.37, kind: 'bomb' });
  const growth = paint.growing[0];
  assert.ok(growth.dripDur > 0);
  const drip = findMaskCell(growth, face, runtime.PAINT_GPU_OWNERSHIP_CONTRACT, runtime.blobWobble,
    { ancillary: true, drips: true }, (px, py) =>
      shaderPaintMaskContains(growth, growthEntry(growth, face), px, py,
        runtime.PAINT_GPU_OWNERSHIP_CONTRACT, runtime.blobWobble, { ancillary: true, drips: false }));
  assert.ok(drip, 'a cell covered only after adding the native final wall-drip geometry was found');
  assert.equal(paint.sampleWorld(0, new runtime.THREE.Vector3(drip.x, 0, drip.z)), 1);
  assert.ok(stats(paint, drip, 0, 2).own > 0);
  assert.ok(Math.abs(claim - paint.counts[0] * face.cu * face.cv) < 1e-8, 'CPU turf credit includes body and wall shader-mask changes');
  paint.flush(1 / 60);
  assert.ok(submitted.some(q => q.mode === 0), 'the ordinary full-effects growth draw remains enabled');

  const cosmetic = makePaint(runtime.PaintSystem, runtime.THREE, { cell: 0.25 });
  const before = cosmetic.paint.grid.slice();
  const beforeCounts = [...cosmetic.paint.counts];
  const speckClaim = cosmetic.paint.splat(center, 0.12, 0, { seed: 0.37, kind: 'speck', cosmetic: true });
  assert.equal(speckClaim, 0);
  assert.deepEqual(cosmetic.paint.grid, before, 'GPU-only cosmetic specks never enter CPU ownership');
  assert.deepEqual(cosmetic.paint.counts, beforeCounts);
});

test('stretched and instant normal paint use the same native mask contract without changing GPU effect draws', async () => {
  const runtime = await loadPaint(true);
  const center = new runtime.THREE.Vector3(4, 0, 5);
  const stretched = makePaint(runtime.PaintSystem, runtime.THREE);
  const claim = stretched.paint.splat(center, 1.4, 0, {
    seed: 0.67, kind: 'shot', stretch: new runtime.THREE.Vector3(1, 0, 0), stretchAmt: 1.25,
  });
  const growth = stretched.paint.growing[0];
  const forwardCells = [];
  const stretchedEntry = growthEntry(growth, stretched.face);
  findForward:
  for (let j = 0; j < stretched.face.nv; j++) for (let i = 0; i < stretched.face.nu; i++) {
    const x = (i + 0.5) * stretched.face.cu, z = (j + 0.5) * stretched.face.cv;
    if (x < center.x + 1.4) continue;
    const px = x - stretchedEntry.lu, py = z - stretchedEntry.lv;
    if (shaderPaintMaskContains(growth, stretchedEntry, px, py,
      runtime.PAINT_GPU_OWNERSHIP_CONTRACT, runtime.blobWobble) &&
      !shaderPaintMaskContains(growth, stretchedEntry, px, py,
        runtime.PAINT_GPU_OWNERSHIP_CONTRACT, runtime.blobWobble, { ancillary: false, drips: false })) {
      forwardCells.push({ x, z });
      break findForward;
    }
  }
  assert.ok(claim > 0 && forwardCells.length > 0, 'directional ancillary shader coverage is rasterized for a stretched shot');
  assert.equal(stretched.paint.sampleWorld(0, new runtime.THREE.Vector3(forwardCells[0].x, 0, forwardCells[0].z)), 1);
  assert.deepEqual(stretched.submitted.map(q => q.mode), [2], 'the immediate landing shader remains body-only');
  stretched.paint.flush(1 / 60);
  assert.equal(stretched.submitted[1].mode, 0, 'the normal full-effects growth shader remains active');

  const raw = await loadPaint(false);
  const baseline = makePaint(raw.PaintSystem, raw.THREE);
  const instant = makePaint(runtime.PaintSystem, runtime.THREE);
  const instantOpts = { seed: 0.41, kind: 'blast', instant: true };
  const nativeClaim = baseline.paint.splat(new raw.THREE.Vector3(5, 0, 5), 1.2, 1, { ...instantOpts });
  const adaptedClaim = instant.paint.splat(new runtime.THREE.Vector3(5, 0, 5), 1.2, 1, { ...instantOpts });
  assert.ok(adaptedClaim > nativeClaim, 'instant native full-mask emission adds its supported cells to ownership');
  assert.equal(instant.paint.growing.length, 0, 'instant growth does not retain or leak a pooled record');
  assert.ok(instant.submitted.some(q => q.mode === 0), 'instant paint still submits native full shader effects');
});

test('paint mask contract fails closed when native ray, satellite, spatter, or drip shader anchors change', () => {
  for (const [anchor, changed] of [
    ['float hsh(float n) { return fract(sin(n) * 43758.5453123); }', 'float hsh(float n) { return fract(sin(n) * 43758.5453124); }'],
    ['float tsp = 1.0 - pow(1.0 - clamp(tn * 1.4, 0.0, 1.0), 3.0);', 'float tsp = 1.0 - pow(1.0 - clamp(tn * 1.5, 0.0, 1.0), 3.0);'],
    ['float land = smoothstep(tl, tl + 0.2, tn);', 'float land = smoothstep(tl, tl + 0.21, tn);'],
    ['if (tn < 0.45 + 0.95 * h2) continue;', 'if (tn < 0.45 + 0.96 * h2) continue;'],
    ['float nD = min(6.0, ks.w + floor(R * 1.2));', 'float nD = min(6.0, ks.w + floor(R * 1.3));'],
  ]) {
    assert.throws(() => adaptSource('src/world/paint.js', PAINT_SOURCE.replace(anchor, changed)),
      /paint shader mask contract/);
  }
});
