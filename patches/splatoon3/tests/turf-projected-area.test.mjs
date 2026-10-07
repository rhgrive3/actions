import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.join(ROOT, 'inkwave-public');
async function installedPaintRuntime() {
  const context = vm.createContext({ console, performance });
  const modules = new Map();
  const resolve = (spec, from) => spec === 'three'
    ? path.join(SRC, 'vendor/three/build/three.module.js')
    : path.resolve(path.dirname(from), spec);
  const load = file => {
    if (!modules.has(file)) modules.set(file, new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { context, identifier: file }));
    return modules.get(file);
  };
  const entry = new vm.SourceTextModule(`
    export * as THREE from 'three';
    export * from './inkwave-public/src/world/paint.js';
    export * from './inkwave-public/src/world/level.js';
    export * from './inkwave-public/src/world/maps.js';
    export * from './patches/splatoon3/runtime/scoring.mjs';
  `, { context, identifier: path.join(ROOT, 'turf-projected-area-fixture.mjs') });
  await entry.link((spec, from) => load(resolve(spec, from.identifier)));
  await entry.evaluate();
  const api = { ...entry.namespace };
  const installSource = fs.readFileSync(path.join(ROOT, 'patches/splatoon3/runtime/install.mjs'), 'utf8');
  assert.match(installSource, /import\s*\{\s*installScoring\s*\}\s*from\s*['"]\.\/scoring\.mjs['"]/);
  assert.match(installSource, /\binstallScoring\(api\);/);
  // Invoke the exact hook wired by patches/splatoon3/runtime/install.mjs.
  api.installScoring({ PaintSystem: api.PaintSystem });
  return api;
}

const { PaintSystem, THREE, Level, TIDEWATER } = await installedPaintRuntime();

function makeFace({ su = 1, sv = 1, ny = 1, origin = [0, 0, 0], turf = true } = {}) {
  const nz = Math.sqrt(1 - ny * ny);
  return {
    su, sv, turf,
    origin: new THREE.Vector3(...origin),
    // u × v = n: these bases describe a floor tilted around its X axis.
    u: new THREE.Vector3(1, 0, 0),
    v: new THREE.Vector3(0, nz, -ny),
    n: new THREE.Vector3(0, ny, nz),
  };
}

function paintRig(faces, { cell = 0.25, pointInside = () => false, level = null } = {}) {
  const paint = Object.create(PaintSystem.prototype);
  Object.assign(paint, { level: level || { pointInside }, paintFaces: faces, cell, version: 0 });
  paint._initGrid();
  return paint;
}

function paintCell(paint, face, i, j, team) {
  const u = (i + 0.5) * face.cu, v = (j + 0.5) * face.cv;
  return paint._cpuSplat(face, u, v, 0.03, team, 0.23, 0, 0, 0, 0);
}

function paintFace(paint, face, team) {
  return paint._cpuSplat(face, face.su / 2, face.sv / 2, 100, team, 0.23, 0, 0, 0, 0);
}

function near(actual, expected, epsilon = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} ≉ ${expected}`);
}

test('#360 installed coverage projects cell area across unequal grids', () => {
  const scoreFlat = () => {
    const flat = makeFace({ su: 1.3, sv: 1, ny: 1 });
    const slope = makeFace({ su: 1.625, sv: 1, ny: 0.8 });
    const paint = paintRig([flat, slope]);
    assert.equal(flat.nu, 5);
    assert.equal(slope.nu, 7);
    assert.notEqual(flat.cu * flat.cv, slope.cu * slope.cv);
    near(flat.cu * flat.cv, 0.065);
    near(slope.cu * slope.cv * slope.n.y, 0.04642857142857143);
    paintFace(paint, flat, 0);
    return paint.coverage()[0];
  };
  const scoreSlope = () => {
    const flat = makeFace({ su: 1.3, sv: 1, ny: 1 });
    const slope = makeFace({ su: 1.625, sv: 1, ny: 0.8 });
    const paint = paintRig([flat, slope]);
    paintFace(paint, slope, 0);
    return paint.coverage()[0];
  };

  near(scoreFlat(), 0.5);
  near(scoreSlope(), 0.5);
});

test('#360 TIDEWATER 100 ramp cells lose to 95 flat cells on top-down projected area', () => {
  const length = Math.hypot(7, 2.8);
  const level = new Level(TIDEWATER);
  const ramp = level.faces.find(f => f.turf && Math.abs(f.su - 3.6) < 1e-9 &&
    Math.abs(f.sv - (length + 0.6)) < 1e-8 && Math.abs(f.n.y - 7 / length) < 1e-8);
  assert.ok(ramp, 'the current TIDEWATER central ramp top face should be scoreable Turf');
  const flat = makeFace({ su: 1.25, sv: 4.75, ny: 1, origin: [100, 0, 0] });
  const paint = paintRig([ramp, flat], { level });
  assert.equal(ramp.nu, 14);
  assert.equal(ramp.nv, 33);
  assert.equal(flat.nu * flat.nv, 95);
  near(ramp.cu * ramp.cv, 0.0634226, 1e-6);
  near(ramp.cu * ramp.cv * ramp.n.y, 0.0588864, 1e-6);

  const surfaceScores = [100 * ramp.cu * ramp.cv, 95 * flat.cu * flat.cv];
  assert.ok(surfaceScores[0] > surfaceScores[1], `the pre-#360 surface-area scorer selects Team 0: ${surfaceScores}`);
  assert.ok(surfaceScores[0] * ramp.n.y < surfaceScores[1], 'projected area reverses the controlled winner');

  let paintedRampCells = 0;
  for (let j = 0; j < ramp.nv && paintedRampCells < 100; j++) {
    for (let i = 0; i < ramp.nu && paintedRampCells < 100; i++) {
      const cell = ramp.grid + j * ramp.nu + i;
      if (paint.dead[cell]) continue;
      if (paintCell(paint, ramp, i, j, 0) > 0) paintedRampCells++;
    }
  }
  assert.equal(paintedRampCells, 100, 'the fixture must paint 100 distinct live TIDEWATER ramp cells');
  let paintedFlatCells = 0;
  for (let j = 0; j < flat.nv; j++) for (let i = 0; i < flat.nu; i++) {
    if (paintCell(paint, flat, i, j, 1) > 0) paintedFlatCells++;
  }
  assert.equal(paintedFlatCells, 95, 'the fixture must paint all 95 distinct live flat cells');
  assert.equal(paint.grid.filter(team => team === 1).length, 100);
  assert.equal(paint.grid.filter(team => team === 2).length, 95);

  const coverage = paint.coverage();
  assert.ok(coverage[1] > coverage[0], `Team 1 should win: ${coverage}`);
});

test('#360 ownership transitions score live overlap independently and omit buried cells', () => {
  const lower = makeFace({ origin: [0, 0, 0] });
  const upper = makeFace({ origin: [0, 3, 0] });
  const paint = paintRig([lower, upper], { pointInside: p => p.x < 0.25 && p.y < 1 });

  paintFace(paint, lower, 0);
  near(paint.coverage()[0], 3 / 7);
  near(paint.coverage()[1], 0);
  paintFace(paint, upper, 1);
  near(paint.coverage()[0], 3 / 7);
  near(paint.coverage()[1], 4 / 7);
  paintFace(paint, upper, 1);
  near(paint.coverage()[1], 4 / 7, 1e-9);

  paintFace(paint, upper, 0);
  near(paint.coverage()[0], 1);
  near(paint.coverage()[1], 0);
  paintFace(paint, lower, 1);
  near(paint.coverage()[0], 4 / 7);
  near(paint.coverage()[1], 3 / 7);
});
