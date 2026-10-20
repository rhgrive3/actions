// #1642: the atlas rebuild after a WebGL context loss. Real PaintSystem (raw upstream source) with a recording
// renderer: logic-level evidence. The pixels that really reach a restored GPU are checked by
// scripts/check-inkwave-paint-context-restore.mjs in a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installPaintContextRestore, restorePaintFromGrid } from '../paint-context-restore.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.resolve(process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public'));
const ATLAS = 2048;

async function realm() {
  const rel = 'src/world/paint.js';
  const context = vm.createContext({ console, performance, URL, Math, Float32Array, Uint8Array, Uint32Array });
  const modules = new Map();
  const load = requested => {
    if (modules.has(requested)) return modules.get(requested);
    const module = new vm.SourceTextModule(fs.readFileSync(requested, 'utf8'), {
      context, identifier: requested, initializeImportMeta(meta) { meta.url = pathToFileURL(requested).href; },
    });
    modules.set(requested, module);
    return module;
  };
  const entry = new vm.SourceTextModule(
    `export { PaintSystem } from './inkwave-public/${rel}'; export * as THREE from 'three';`,
    { context, identifier: path.join(ROOT, 'paint-restore-entry.mjs') });
  await entry.link((spec, from) => spec === 'three'
    ? load(path.join(SRC, 'vendor/three/build/three.module.js'))
    : load(path.resolve(path.dirname(from.identifier), spec)));
  await entry.evaluate();
  return entry.namespace;
}

async function harness({ floor = 8 } = {}) {
  const { THREE, PaintSystem } = await realm();
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const face = (origin, wall) => ({ paintable: true, turf: !wall, origin, u: v(1, 0, 0), v: wall ? v(0, 1, 0) : v(0, 0, 1),
    n: wall ? v(0, 0, 1) : v(0, 1, 0), su: wall ? 8 : floor, sv: wall ? 6 : floor, block: 0, wall });
  const level = { faces: [face(v(0, 0, 0), false), face(v(0, 0, 10), true)], blocks: [{ aabbMin: v(-5, -5, -5), aabbMax: v(30, 10, 30), faces: [0, -1, -1, -1, -1, -1] }],
    pointInside: () => false, queryBlocks: () => [0] };
  const draws = [];
  let target = null;
  const renderer = {
    capabilities: { getMaxAnisotropy: () => 8 }, autoClear: true,
    getRenderTarget: () => target, setRenderTarget: rt => { target = rt; },
    getClearColor: color => color.set(0), getClearAlpha: () => 0, setClearColor() {}, clear() {},
    render() {
      if (target !== paint.rt || !paint.quads) return;
      const quads = [];
      for (let q = 0; q < paint.quads; q++) {
        const px = ((paint.aPos[q * 8] + paint.aPos[q * 8 + 4]) / 2 + 1) / 2 * ATLAS;
        const py = ((paint.aPos[q * 8 + 1] + paint.aPos[q * 8 + 5]) / 2 + 1) / 2 * ATLAS;
        quads.push({ x: Math.round(px * 100) / 100, y: Math.round(py * 100) / 100, team: paint.aSplat[q * 16 + 1], radius: paint.aSplat[q * 16] });
      }
      draws.push(quads);
    },
  };
  const paint = new PaintSystem(renderer, level, { atlasSize: ATLAS, maxDensity: 8 });
  return { THREE, paint, draws, level };
}

// Where the cell centre lands in the atlas, in texels.
function texel(face, i, j) {
  const a = face.atlas;
  return { x: Math.round((a.x + a.pad + (i + 0.5) * face.cu * a.ppm) * 100) / 100, y: Math.round((a.y + a.pad + (j + 0.5) * face.cv * a.ppm) * 100) / 100 };
}
function ownedCells(paint) {
  const out = [];
  for (const face of paint.paintFaces) for (let j = 0; j < face.nv; j++) for (let i = 0; i < face.nu; i++) {
    const owner = paint.grid[face.grid + j * face.nu + i];
    if (owner && !paint.dead[face.grid + j * face.nu + i]) out.push({ ...texel(face, i, j), team: owner - 1 });
  }
  return out;
}
const key = c => `${c.x},${c.y},${c.team}`;
function paintSomething(paint, THREE) {
  paint.splat(new THREE.Vector3(2, 0, 2), 1.2, 0, { seed: 0.31 });
  paint.splat(new THREE.Vector3(5, 0, 3.5), 1.0, 1, { seed: 0.62 });
  paint.splat(new THREE.Vector3(4, 2.5, 10.05), 1.1, 0, { seed: 0.77 });   // the wall face
  for (let i = 0; i < 400; i++) paint.flush(1 / 60);                       // finish every spread and drip
}

test('the rebuild draws one settled disc per owned live cell, at its atlas rectangle, in its owner colour', async () => {
  const { THREE, paint, draws } = await harness();
  paintSomething(paint, THREE);
  const expected = ownedCells(paint);
  assert.ok(expected.length > 30, 'the fixture owns real turf on both faces');
  assert.ok(new Set(expected.map(c => c.team)).size === 2, 'both teams own turf');
  draws.length = 0;
  const cells = restorePaintFromGrid(paint);
  assert.equal(cells, expected.length);
  const drawn = draws.flat();
  assert.equal(drawn.length, expected.length, 'exactly one quad per owned cell, no more');
  assert.deepEqual(drawn.map(key).sort(), expected.map(key).sort(), 'every quad sits on its cell with its owner colour');
  const cell = paint.paintFaces[0].cu;
  for (const q of drawn) assert.ok(q.radius >= cell * 0.7071 && q.radius <= cell, 'disc radius reaches the cell corners and stays local');
});

test('the rebuild never touches ownership, scoring or the grid version, and repeating it adds nothing new', async () => {
  const { THREE, paint, draws } = await harness();
  paintSomething(paint, THREE);
  const grid = paint.grid.slice(), counts = [...paint.counts], version = paint.version, coverage = paint.coverage();
  draws.length = 0;
  const first = restorePaintFromGrid(paint);
  const second = restorePaintFromGrid(paint);
  assert.equal(first, second);
  assert.deepEqual([...paint.grid], [...grid]);
  assert.deepEqual([...paint.counts], counts);
  assert.equal(paint.version, version);
  assert.deepEqual(paint.coverage(), coverage);
  assert.deepEqual(draws.flat().slice(0, first).map(key).sort(), draws.flat().slice(first).map(key).sort(), 'the same ink twice');
  assert.equal(paint.quads, 0, 'nothing is left queued');
});

test('a large turf is drawn in bounded batches, never more than the quad buffer holds', async () => {
  const { THREE, paint, draws } = await harness({ floor: 30 });
  paintSomething(paint, THREE);
  for (let k = 0; k < paint.grid.length; k++) paint.grid[k] = 1 + (k & 1);   // every cell owned: far more than one batch
  const owned = ownedCells(paint).length;
  assert.ok(owned > 6000, 'the fixture needs more cells than one 6000-quad batch');
  draws.length = 0;
  assert.equal(restorePaintFromGrid(paint), owned);
  assert.ok(draws.length >= 2 && draws.every(batch => batch.length <= 6000), 'batched');
  assert.equal(draws.flat().length, owned);
});

test('buried cells are not drawn, and an empty grid draws nothing', async () => {
  const { THREE, paint, draws } = await harness();
  paintSomething(paint, THREE);
  const face = paint.paintFaces[0];
  let buried = 0;
  for (let j = 0; j < face.nv; j++) for (let i = 0; i < face.nu; i++) {
    const k = face.grid + j * face.nu + i;
    if (paint.grid[k] && buried < 5) { paint.dead[k] = 1; buried++; }
  }
  assert.equal(buried, 5);
  const expected = ownedCells(paint);
  draws.length = 0;
  assert.equal(restorePaintFromGrid(paint), expected.length);
  assert.equal(draws.flat().length, expected.length);
  paint.grid.fill(0);
  draws.length = 0;
  assert.equal(restorePaintFromGrid(paint), 0);
  assert.equal(draws.length, 0, 'no GPU work for an empty turf');
});

test('restored ink dries on the normal schedule and the install adds the method exactly once', async () => {
  const { THREE, paint } = await harness();
  paintSomething(paint, THREE);
  paint._wetUntil = 0;
  restorePaintFromGrid(paint);
  assert.ok(paint._wetUntil >= paint.clock + 6, 'the drying pass keeps running after the rebuild');
  const proto = Object.getPrototypeOf(paint);
  delete proto.restoreFromGrid;
  installPaintContextRestore(proto.constructor);
  const first = proto.restoreFromGrid;
  installPaintContextRestore(proto.constructor);
  assert.equal(proto.restoreFromGrid, first, 'a second install does not replace it');
  assert.equal(typeof paint.restoreFromGrid, 'function');
  assert.ok(paint.restoreFromGrid() > 0);
  assert.equal(paint.gridRestoreCount, 2);
});

test('an object without the paint internals is ignored instead of throwing', () => {
  assert.equal(restorePaintFromGrid(null), 0);
  assert.equal(restorePaintFromGrid({}), 0);
  assert.equal(restorePaintFromGrid({ paintFaces: [], grid: new Uint8Array(0) }), 0);
});
