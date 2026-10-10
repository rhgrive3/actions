import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptSource, replaceOnce } from '../adapter.mjs';
import { adaptIssueBatch1171 } from '../issue-batch-1171-adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = path.join(ROOT, 'inkwave-public');
const PAINT_FILE = path.join(UPSTREAM, 'src/world/paint.js');
const PAINT_SOURCE = fs.readFileSync(PAINT_FILE, 'utf8');
const BAND = PAINT_SOURCE.match(/const BAND_L = ([\d.]+), BAND_W = ([\d.]+), BAND_R = ([\d.]+);/);
assert.ok(BAND, 'native roller band constants remain available');
const BAND_L = Number(BAND[1]), BAND_R = Number(BAND[3]);

async function loadPaint(adapt) {
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
    // This A/B isolates first-frame presentation. Keep the separately fixed
    // #1165 permanent ownership geometry equal on both sides of that control.
    if (!adapt && file === PAINT_FILE) source = adaptIssueBatch1171('src/world/paint.js', source, replaceOnce);
    if (file.startsWith(UPSTREAM + path.sep) && adapt) source = adaptSource(path.relative(UPSTREAM, file), source);
    const module = new vm.SourceTextModule(source, { context, identifier: file });
    modules.set(file, module);
    return module;
  }
  const entry = new vm.SourceTextModule(`
    export { PaintSystem } from './inkwave-public/src/world/paint.js';
    export * as THREE from 'three';
  `, { context, identifier: path.join(ROOT, 'issue-570-fixture-entry.mjs') });
  await entry.link((specifier, referencing) => load(resolve(specifier, referencing.identifier)));
  await entry.evaluate();
  return entry.namespace;
}

function makePaint(PaintSystem, THREE) {
  const face = {
    atlas: { x: 0, y: 0, w: 512, h: 512, pad: 8, ppm: 20 },
    origin: new THREE.Vector3(0, 0, 0), n: new THREE.Vector3(0, 1, 0),
    u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, 1),
    su: 10, sv: 10, wall: false, turf: true, nu: 400, nv: 400, cu: 0.025, cv: 0.025, grid: 0,
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
  if (paint._takeSplatEntries) Object.assign(paint, { _splatEntryPool: [], _splatGrowthPool: [], _splatPoolsDisposed: false,
    _splatPoolStats: { entryArraysCreated: 0, entryArraysReused: 0, growthRecordsCreated: 0, growthRecordsReused: 0 } });
  paint.grid = new Uint8Array(face.nu * face.nv);
  paint.dead = new Uint8Array(face.nu * face.nv);
  paint.counts = [0, 0];
  paint.version = 0;
  paint.clock = 0;
  paint.frame = 0;
  paint._wetUntil = 0;
  paint._dryAcc = 0;
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

function roll(paint, THREE) {
  const center = new THREE.Vector3(5.0125, 0, 5.0125);
  const point = new THREE.Vector3(center.x + 0.62 * 0.58, 0, center.z);
  const claimed = paint.splat(center, 0.62, 0, {
    kind: 'roll', stretch: new THREE.Vector3(1, 0, 0), seed: 0.25,
  });
  return { claimed, point, team: paint.sampleWorld(0, point) };
}

test('native roller CPU ownership and first-frame shader body disagree before the adapter, then body-only mode closes the gap', async () => {
  const raw = await loadPaint(false);
  const installed = await loadPaint(true);
  const generated = adaptSource('src/world/paint.js', PAINT_SOURCE);
  assert.match(generated, /installIssue570PaintPresentation\(PaintSystem\)/);
  assert.match(generated, /bool bodyOnly = vGrow\.z > 1\.5/);
  assert.match(generated, /if \(vGrow\.z < 0\.5 \|\| bodyOnly\)/);
  assert.match(generated, /if \(!bodyOnly && isWall > 0\.5/);
  assert.match(PAINT_SOURCE, /float grow = mix\(0\.4, 1\.0, tb\)/);

  const frameIntervals = [1 / 30, 1 / 60, 1 / 120];
  for (const dt of frameIntervals) {
    const baseline = makePaint(raw.PaintSystem, raw.THREE);
    const original = roll(baseline.paint, raw.THREE);
    const cpuCounts = [...baseline.paint.counts];
    assert.ok(original.claimed > 0);
    assert.equal(original.team, 1);
    assert.equal(baseline.submitted.length, 0, 'native non-instant splat queues no landing-frame body draw');

    baseline.paint.flush(dt);
    const firstNativeDraw = baseline.submitted[0];
    assert.ok(firstNativeDraw, 'first flush submits native paint geometry');
    assert.equal(firstNativeDraw.mode, 0, 'native shader receives its growing-body mode');
    const tn = Math.min(firstNativeDraw.tn, 1);
    const growth = 0.4 + 0.6 * (1 - (1 - tn) ** 4);
    const bodyReach = 0.62 * (BAND_R + BAND_L * growth);
    const cellCenterU = (Math.floor(original.point.x / baseline.face.cu) + 0.5) * baseline.face.cu;
    const cpuOwnedOffset = Math.abs(cellCenterU - 5.0125);
    assert.ok(bodyReach < cpuOwnedOffset,
      `at dt=${dt}, submitted roller body reaches ${bodyReach.toFixed(4)}m but CPU-owned cell center is ${cpuOwnedOffset.toFixed(4)}m away`);

    const fixed = makePaint(installed.PaintSystem, installed.THREE);
    const accepted = roll(fixed.paint, installed.THREE);
    assert.equal(accepted.claimed, original.claimed, 'visual fix preserves the native claimed-area result');
    assert.deepEqual([...fixed.paint.counts], cpuCounts, 'visual fix preserves native turf ownership counts');
    assert.equal(accepted.team, original.team, 'visual fix preserves the native point query');
    assert.equal(fixed.submitted.length, 1, 'the landing call submits one native body-only quad');
    assert.equal(fixed.submitted[0].mode, 2, 'body-only shader mode is encoded in native quad attributes');
    assert.equal(fixed.submitted[0].tn, 3, 'the native body reaches its full shape on the landing call');
    const fullBodyReach = 0.62 * (BAND_R + BAND_L);
    assert.ok(fullBodyReach > cpuOwnedOffset, 'the full roller body reaches the CPU-owned sample');

    fixed.paint.flush(dt);
    assert.equal(fixed.submitted[0].mode, 2, 'later growth does not replace the immediate full-body submission');
    assert.equal(fixed.submitted[1].mode, 0, 'native growth, including its existing later effects, remains scheduled');
  }
});

test('paint adapter fails closed if the native body shape connection changes', () => {
  const pooledAppendShape = PAINT_SOURCE.replace('else this.growing.push(g);', 'else { this.growing.push(g); }');
  assert.throws(() => adaptSource('src/world/paint.js', pooledAppendShape), /return or retain growth lease/,
    'the installed pool layer rejects unknown native append shapes before the presentation layer');
  assert.throws(() => adaptSource('src/world/paint.js', PAINT_SOURCE.replace('float grow = mix(0.4, 1.0, tb);', 'float grow = 1.0;')),
    /paint native body growth/);
  assert.throws(() => adaptSource('src/world/paint.js', PAINT_SOURCE.replace('this.growing.push(g);', 'this._other.push(g);')),
    /return or retain growth lease|paint deferred growth record/);
});
