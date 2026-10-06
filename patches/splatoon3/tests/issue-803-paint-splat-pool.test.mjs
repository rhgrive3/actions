import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { fixture } from './source-fixture.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = path.join(ROOT, 'inkwave-public');
const PAINT_PATH = path.join(UPSTREAM, 'src/world/paint.js');
const THREE_PATH = path.join(UPSTREAM, 'vendor/three/build/three.module.js');

async function loadPaintSystem({ adapted, countNativeAllocations = false }) {
  const context = vm.createContext({ console, performance });
  const modules = new Map();
  function resolve(spec, from) {
    return spec === 'three' ? THREE_PATH : path.resolve(path.dirname(from), spec);
  }
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const original = fs.readFileSync(file, 'utf8');
    let source = adapted && file === PAINT_PATH ? adaptSource('src/world/paint.js', original) : original;
    if (countNativeAllocations && file === PAINT_PATH) {
      for (const [before, after] of [
        ['    const entries = [];', '    this._nativeSplatStats.entryArraysCreated++;\n    const entries = [];'],
        ['      const g = {', '      this._nativeSplatStats.growthRecordsCreated++;\n      const g = {'],
      ]) {
        assert.equal(source.split(before).length - 1, 1, `native allocation counter anchor should occur once: ${before.trim()}`);
        source = source.replace(before, after);
      }
    }
    const module = new vm.SourceTextModule(source, { context, identifier: file });
    modules.set(file, module);
    return module;
  }
  const paintModule = load(PAINT_PATH);
  await paintModule.link((spec, parent) => load(resolve(spec, parent.identifier)));
  await paintModule.evaluate();
  const ctx = modules.get(path.join(UPSTREAM, 'src/core/ctx.js'));
  const three = modules.get(THREE_PATH);
  return { PaintSystem: paintModule.namespace.PaintSystem, G: ctx.namespace.G, THREE: three.namespace };
}

function makePaint(runtime, { events = [], adapted = false } = {}) {
  const { PaintSystem, THREE } = runtime;
  const face = {
    origin: new THREE.Vector3(), n: new THREE.Vector3(0, 1, 0),
    u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, 1),
    su: 20, sv: 20, cu: 0.25, cv: 0.25, nu: 80, nv: 80,
    grid: 0, turf: true, wall: false, atlas: { pad: 8, ppm: 4, x: 0, y: 0 },
  };
  const bounds = { x: -2, y: -1, z: -2 };
  const maxBounds = { x: 22, y: 2, z: 22 };
  const block = { aabbMin: bounds, aabbMax: maxBounds, faces: [0, -1, -1, -1, -1, -1] };
  const renderer = {
    getRenderTarget: () => null,
    getClearColor: color => color,
    getClearAlpha: () => 1,
    setRenderTarget() {}, setClearColor() {}, clear() {},
  };
  const paint = Object.create(PaintSystem.prototype);
  Object.assign(paint, {
    renderer,
    level: {
      faces: [face], blocks: [block],
      queryBlocks(_x0, _z0, _x1, _z1, out = []) { out.length = 1; out[0] = 0; return out; },
    },
    grid: new Uint8Array(face.nu * face.nv), dead: new Uint8Array(face.nu * face.nv),
    counts: [0, 0], version: 0, growing: [], clock: 0, frame: 0, _wetUntil: 0,
    quads: 0, rip: new Float64Array(24 * 4), ripP: new Float32Array(24 * 4), _ripS: new Float32Array(24),
    _dryAcc: 0, _dryU: { uDry: { value: 0 } }, dryMesh: { visible: false, geometry: { dispose() {} }, material: { dispose() {} } },
    rt: { dispose() {} }, geo: { dispose() {} }, mat: { dispose() {} },
    _drawQuads() {},
    _emitGrowth(g, tn, dT, dripOnly) { events.push([g.team, g.seed, tn, dT, dripOnly, g.entries?.length ?? -1]); },
  });
  if (adapted) Object.assign(paint, {
    _splatEntryPool: [], _splatGrowthPool: [], _splatPoolsDisposed: false,
    _splatPoolStats: { entryArraysCreated: 0, entryArraysReused: 0, growthRecordsCreated: 0, growthRecordsReused: 0 },
  });
  return { paint, face, THREE };
}

function makeOwner(Actor) {
  return Object.assign(Object.create(Actor.prototype), {
    stats: { turf: 0 }, special: 0, specialActive: false, weapon: { specialCost: 1000 },
  });
}

test('#803: installed adapter preserves native seeded Turf area, cell ownership, and special credit', async () => {
  const native = await loadPaintSystem({ adapted: false });
  const installed = await loadPaintSystem({ adapted: true });
  const { Actor } = await fixture();

  function run(runtime, adapted) {
    const events = [];
    const { paint, THREE } = makePaint(runtime, { events, adapted });
    const owner = makeOwner(Actor);
    const areas = [];
    const shots = [
      { x: 4, z: 4, r: 0.82, team: 0, seed: 0.14, kind: 'shot' },
      { x: 4.25, z: 4.05, r: 0.62, team: 1, seed: 0.73, kind: 'line', stretch: [1, 0, 0.35], stretchAmt: 0.85 },
      { x: 7.1, z: 6.4, r: 0.4, team: 1, seed: 0.8, kind: 'trail' },
      { x: 8.0, z: 7.1, r: 0.65, team: 0, seed: 0.37, kind: 'roll', stretch: [1, 0, 0.3], stretchAmt: 1.1 },
      { x: 8.2, z: 7.25, r: 0.5, team: 1, seed: 0.91, kind: 'blast' },
    ];
    for (const shot of shots) {
      const opts = { seed: shot.seed, kind: shot.kind };
      if (shot.stretch) { opts.stretch = new THREE.Vector3(...shot.stretch); opts.stretchAmt = shot.stretchAmt; }
      const area = paint.splat(new THREE.Vector3(shot.x, 0.05, shot.z), shot.r, shot.team, opts);
      areas.push(area);
      Actor.prototype.addTurf.call(owner, area);
      paint.flush(0.25);
    }
    return {
      areas, grid: [...paint.grid], counts: [...paint.counts], version: paint.version,
      actorTurf: owner.stats.turf, special: owner.special, events,
    };
  }

  const before = run(native, false);
  const after = run(installed, true);
  assert.deepEqual(after, before);
  assert.ok(before.areas.some(area => area > 0));
  assert.ok(before.special > 0);
});

test('#803: 5 s warm-up then 60 simulated seconds at 100 seeded splats/s stops creating entry arrays and growth records', async t => {
  const runtime = await loadPaintSystem({ adapted: true });
  const { paint } = makePaint(runtime, { adapted: true, events: [] });
  paint._emitGrowth = () => {};
  const nativeRuntime = await loadPaintSystem({ adapted: false, countNativeAllocations: true });
  const { paint: nativePaint } = makePaint(nativeRuntime, { adapted: false, events: [] });
  nativePaint._nativeSplatStats = { entryArraysCreated: 0, growthRecordsCreated: 0 };
  nativePaint._emitGrowth = () => {};
  function simulation(runtime, target) {
    const center = new runtime.THREE.Vector3(1, 0.05, 1);
    const opts = { seed: 0, kind: 'trail' };
    let call = 0;
    function simulate(seconds) {
      const frames = seconds * 60;
      for (let frame = 0; frame < frames; frame++) {
        const splats = frame % 3 === 2 ? 1 : 2;
        for (let n = 0; n < splats; n++) {
          center.x = 1 + (call % 64) * 0.28;
          center.z = 1 + (Math.floor(call / 64) % 64) * 0.28;
          opts.seed = (call * 0.61803398875) % 1;
          target.splat(center, 0.18, 0, opts);
          call++;
        }
        target.flush(1 / 60);
      }
    }
    return { simulate, get calls() { return call; } };
  }

  const adaptedRun = simulation(runtime, paint), nativeRun = simulation(nativeRuntime, nativePaint);
  adaptedRun.simulate(5);
  nativeRun.simulate(5);
  const afterWarmup = { ...paint._splatPoolStats };
  adaptedRun.simulate(60);
  nativeRun.simulate(60);
  for (let frame = 0; frame < 30; frame++) { paint.flush(1 / 60); nativePaint.flush(1 / 60); }
  const final = paint._splatPoolStats;
  assert.deepEqual(
    { entryArraysCreated: final.entryArraysCreated, growthRecordsCreated: final.growthRecordsCreated },
    { entryArraysCreated: afterWarmup.entryArraysCreated, growthRecordsCreated: afterWarmup.growthRecordsCreated },
  );
  assert.equal(adaptedRun.calls, 6500);
  assert.equal(nativeRun.calls, adaptedRun.calls);
  assert.equal(nativePaint._nativeSplatStats.entryArraysCreated, nativeRun.calls);
  assert.equal(nativePaint._nativeSplatStats.growthRecordsCreated, nativeRun.calls);
  assert.equal(paint.growing.length, 0);
  assert.ok(paint._splatEntryPool.length <= 64);
  assert.ok(paint._splatGrowthPool.length <= 64);
  assert.ok(paint._splatEntryPool.every(entries => entries.length === 0));
  assert.ok(paint._splatGrowthPool.every(growth => growth.entries === null));
  assert.ok(final.entryArraysReused > 6000);
  assert.ok(final.growthRecordsReused > 6000);
  t.diagnostic(JSON.stringify({
    simulatedSeconds: 65, sustainedSeconds: 60, splatsPerSecond: 100, splatCalls: adaptedRun.calls,
    nativePerCallArrays: nativePaint._nativeSplatStats.entryArraysCreated,
    nativePerCallGrowthRecords: nativePaint._nativeSplatStats.growthRecordsCreated,
    pooledArraysCreated: final.entryArraysCreated, pooledGrowthRecordsCreated: final.growthRecordsCreated,
    pooledArraysReused: final.entryArraysReused, pooledGrowthRecordsReused: final.growthRecordsReused,
    arraysCreatedAfterWarmup: final.entryArraysCreated - afterWarmup.entryArraysCreated,
    growthRecordsCreatedAfterWarmup: final.growthRecordsCreated - afterWarmup.growthRecordsCreated,
  }));
});

test('#803: newer ink force-emits older opposing growth first; instant and network paths release/replay once', async () => {
  const runtime = await loadPaintSystem({ adapted: true });
  const events = [];
  const { paint, THREE } = makePaint(runtime, { adapted: true, events });
  const center = new THREE.Vector3(9, 0.05, 9);
  paint.splat(center, 0.6, 0, { seed: 0.2, kind: 'trail' });
  const old = paint.growing[0], oldEntries = old.entries;
  paint.splat(center, 0.6, 1, { seed: 0.8, kind: 'trail' });
  assert.deepEqual(events[0].slice(0, 3), [0, 0.2, 3]);
  assert.equal(paint.growing[0], old);
  assert.equal(old.team, 1);
  assert.notEqual(old.entries, oldEntries);
  assert.equal(oldEntries.length, 0);
  assert.equal(paint.growing.length, 1);
  assert.equal(paint.growing[0].team, 1);

  paint.splat(center, 0.3, 1, { seed: 0.9, kind: 'trail', instant: true });
  assert.equal(events[1][0], 1);
  assert.equal(events[1][2], 3);
  for (let frame = 0; frame < 30; frame++) paint.flush(1 / 60);
  assert.equal(paint.growing.length, 0);

  let recorded = 0;
  runtime.G.netm = { mute: 0, applying: false, recSplat() { recorded++; } };
  paint.splat(center, 0.4, 0, { seed: 0.5, kind: 'trail' });
  assert.equal(recorded, 1);
  runtime.G.netm = null;
});

test('#803: wall drips retain their leased entries through the final drip emission', async () => {
  const native = await loadPaintSystem({ adapted: false });
  const installed = await loadPaintSystem({ adapted: true });
  const nativeEvents = [], installedEvents = [];
  const nativeRig = makePaint(native, { events: nativeEvents });
  const installedRig = makePaint(installed, { events: installedEvents, adapted: true });
  nativeRig.face.wall = installedRig.face.wall = true;
  const centerNative = new native.THREE.Vector3(9, 0.05, 9);
  const centerInstalled = new installed.THREE.Vector3(9, 0.05, 9);

  nativeRig.paint.splat(centerNative, 0.6, 0, { seed: 0.2, kind: 'trail' });
  installedRig.paint.splat(centerInstalled, 0.6, 0, { seed: 0.2, kind: 'trail' });
  const leasedGrowth = installedRig.paint.growing[0], leasedEntries = leasedGrowth.entries;
  assert.ok(leasedGrowth.dripDur > 0);
  nativeRig.paint.flush(0.5); installedRig.paint.flush(0.5);
  assert.equal(leasedGrowth.entries, leasedEntries);
  assert.equal(leasedEntries.length, 7);
  nativeRig.paint.flush(1.75); installedRig.paint.flush(1.75);
  assert.deepEqual(installedEvents, nativeEvents);
  assert.equal(installedRig.paint.growing.length, 0);
  assert.equal(leasedGrowth.entries, null);
  assert.equal(leasedEntries.length, 0);
  assert.equal(installedEvents.at(-1)[4], true);
});

test('#803: splats spanning more than the reuse threshold emit every face and discard the oversized buffer without truncation', async () => {
  const runtime = await loadPaintSystem({ adapted: true });
  const { paint, face, THREE } = makePaint(runtime, { adapted: true });
  const faces = Array.from({ length: 257 }, (_, i) => ({
    ...face, origin: new THREE.Vector3(), n: new THREE.Vector3(0, 1, 0),
    u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, 1), grid: i * 80 * 80,
  }));
  const min = { x: -2, y: -1, z: -2 }, max = { x: 22, y: 2, z: 22 };
  paint.level = {
    faces,
    blocks: faces.map((_, i) => ({ aabbMin: min, aabbMax: max, faces: [i, -1, -1, -1, -1, -1] })),
    queryBlocks(_x0, _z0, _x1, _z1, out = []) { out.length = faces.length; for (let i = 0; i < faces.length; i++) out[i] = i; return out; },
  };
  paint.grid = new Uint8Array(faces.length * 80 * 80);
  paint.dead = new Uint8Array(faces.length * 80 * 80);
  let emittedFaces = 0;
  paint._emitGrowth = runtime.PaintSystem.prototype._emitGrowth;
  paint._pushQuad = () => { emittedFaces++; };
  const area = paint.splat(new THREE.Vector3(9, 0.05, 9), 0.3, 0, { seed: 0.6, kind: 'trail', instant: true });
  assert.ok(area > 0);
  assert.equal(emittedFaces, faces.length);
  assert.equal(paint._splatPoolStats.entryArraysCreated, 1);
  assert.equal(paint._splatEntryPool.length, 0);
  assert.equal(paint._splatGrowthPool.length, 1);
});

test('#803: reentrant splat leases independent arrays; clear/dispose scrub live face references', async () => {
  const runtime = await loadPaintSystem({ adapted: true });
  const { paint, face, THREE } = makePaint(runtime, { adapted: true });
  const cpuSplat = paint._cpuSplat;
  let nested = false;
  paint._cpuSplat = function (...args) {
    if (!nested) {
      nested = true;
      this.splat(new THREE.Vector3(11, 0.05, 11), 0.35, 0, { seed: 0.4, kind: 'trail' });
    }
    return cpuSplat.apply(this, args);
  };
  paint.splat(new THREE.Vector3(10, 0.05, 10), 0.35, 0, { seed: 0.6, kind: 'trail' });
  assert.equal(paint.growing.length, 2);
  assert.notEqual(paint.growing[0].entries, paint.growing[1].entries);
  assert.ok(paint.growing.every(growth => growth.entries.length === 7 && growth.entries[0] === face));

  const beforeClearStats = { ...paint._splatPoolStats };
  const clearedRecords = [...paint.growing], clearedArrays = clearedRecords.map(growth => growth.entries);
  paint.clear();
  assert.equal(paint.growing.length, 0);
  assert.ok(clearedRecords.every(growth => growth.entries === null));
  assert.ok(clearedArrays.every(entries => entries.length === 0));
  assert.ok(paint._splatEntryPool.every(entries => entries.length === 0));
  assert.ok(paint._splatGrowthPool.every(growth => growth.entries === null));

  paint._cpuSplat = cpuSplat;
  paint.splat(new THREE.Vector3(12, 0.05, 12), 0.35, 1, { seed: 0.7, kind: 'trail' });
  assert.equal(paint._splatPoolStats.entryArraysCreated, beforeClearStats.entryArraysCreated);
  assert.equal(paint._splatPoolStats.growthRecordsCreated, beforeClearStats.growthRecordsCreated);
  const live = paint.growing[0], liveEntries = live.entries;
  paint.dispose();
  assert.equal(paint.growing.length, 0);
  assert.equal(live.entries, null);
  assert.equal(liveEntries.length, 0);
  assert.equal(paint._splatEntryPool, null);
  assert.equal(paint._splatGrowthPool, null);
});
