import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { adaptRemainingPaint20261026 } from '../queue-remaining-paint-20261026-adapter.mjs';
import { adaptCombatWorldQueue20261027 } from '../queue-combat-world-20261027-adapter.mjs';
import { adaptCombatGpuCpuPerfect } from '../combat-gpu-cpu-perfect-adapter.mjs';
import { adaptPaintRenderRegions } from '../paint-render-regions-adapter.mjs';
import { replaceOnce } from '../adapter.mjs';
import { geometryFixture } from './geometry-build-fixture.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url)), SRC = path.join(ROOT, 'inkwave-public');
const baseline={paint:{source:JSON.parse(fs.readFileSync(new URL('./fixtures/queue-world-paint-envelope-before-20261029.json',import.meta.url)))['src/world/paint.js']},ownership:{composedSource:adaptBuildSource('patches/splatoon3/runtime/paint-ownership.mjs',fs.readFileSync(new URL('../../splatoon3/runtime/paint-ownership.mjs',import.meta.url),'utf8'))}};
const sha = b => createHash('sha256').update(b).digest('hex');

const candidate=adaptBuildSource('src/world/paint.js',fs.readFileSync(new URL('../../../inkwave-public/src/world/paint.js',import.meta.url),'utf8'));
const names = [['aPos', 2], ['aLocal', 3], ['aSplat', 4], ['aStretch', 3], ['aGrow', 4]];
const plain = x => structuredClone(x);

// Behavioral parity below loads the remaining-paint intermediate; regional
// GPU/mip execution is not exercised by these mocked draw methods.
async function loadPaint(changed) {
  const counts = { hypot: 0, sqrt: 0, random: 0 }, math = Object.create(Math), document = { hidden: false };
  for (const key of ['hypot', 'sqrt']) math[key] = (...args) => { counts[key]++; return Math[key](...args); };
  math.random = () => { counts.random++; return .375; };
  const context = vm.createContext({ console, performance, URL, TextEncoder, TextDecoder, Math: math, document });
  const modules = new Map();
  function resolve(spec, from) {
    if (spec === 'three') return path.join(SRC, 'vendor/three/build/three.module.js');
    if (spec.startsWith('three/addons/')) return path.join(SRC, 'vendor/three/jsm', spec.slice(13));
    const file = path.resolve(path.dirname(from), spec).replace('/inkwave-public/patches/', '/patches/');
    return file.startsWith(path.join(ROOT, 'src/')) ? path.join(SRC, path.relative(ROOT, file)) : file;
  }
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const rel = path.relative(SRC, file), raw = fs.readFileSync(file, 'utf8');
    let source = rel === 'src/world/paint.js' ? (changed ? candidate : baseline.paint.source)
      : file.endsWith('/patches/splatoon3/runtime/paint-ownership.mjs') ? (changed ? adaptBuildSource('patches/splatoon3/runtime/paint-ownership.mjs', raw) : baseline.ownership.composedSource)
      : rel.startsWith('..') ? raw : adaptBuildSource(rel, raw);
    const mod = new vm.SourceTextModule(source, { context, identifier: file, initializeImportMeta(m) { m.url = pathToFileURL(file).href; } });
    modules.set(file, mod); return mod;
  }
  const entry = new vm.SourceTextModule("export { PaintSystem } from './inkwave-public/src/world/paint.js'; export * as THREE from 'three'; export { G } from './inkwave-public/src/core/ctx.js';", { context, identifier: path.join(ROOT, 'paint-remaining-fixture.mjs') });
  await entry.link((s, parent) => load(resolve(s, parent.identifier))); await entry.evaluate();
  return { ...entry.namespace, counts, document };
}
const runtimes = Promise.all([loadPaint(false), loadPaint(true)]);

function makePaint(runtime, native = false) {
  const { THREE, PaintSystem } = runtime, V3 = THREE.Vector3, faces = [0, 1, 2].map(id => ({
    id, origin: new V3(0, id === 1 ? .08 : 0, 0), n: id === 2 ? new V3(0, 0, 1) : new V3(0, 1, 0),
    u: new V3(1, 0, 0), v: id === 2 ? new V3(0, 1, 0) : new V3(0, 0, 1),
    su: 10, sv: 10, cu: .25, cv: .25, nu: 40, nv: 40, grid: id * 1600,
    turf: id !== 2, wall: id === 2, atlas: { x: id * 200, y: 0, pad: 8, ppm: 8 }, paintable: true,
  }));
  const batches = [], rows = [], paint = Object.create(PaintSystem.prototype);
  Object.assign(paint, { size: 1024, pad: 8, level: { native, faces,
    blocks: [{ aabbMin: new V3(-2, -2, -2), aabbMax: new V3(12, 12, 12), faces: [0, 1, 2, -1, -1, -1] }],
    queryBlocks(_a, _b, _c, _d, out = []) { out.length = 1; out[0] = 0; return out; } },
    grid: new Uint8Array(4800), dead: new Uint8Array(4800), counts: [0, 0], version: 0,
    growing: [], clock: 0, frame: 0, _wetUntil: 0, quads: 0,
    rip: new Float64Array(96), ripP: new Float32Array(96), _ripS: new Float32Array(24),
    _dryAcc: 0, _dryU: { uDry: { value: 0 } }, dryMesh: { visible: false },
    _splatEntryPool: [], _splatGrowthPool: [], _splatPoolsDisposed: false,
    _splatPoolStats: { entryArraysCreated: 0, entryArraysReused: 0, growthRecordsCreated: 0, growthRecordsReused: 0 },
    _inkMarkRow(f, a, b, j, count) { rows.push([f.id, a, b, j, count]); },
    _drawQuads() { if (this.quads) batches.push(names.map(([name, stride]) => sha(Buffer.from(this[name].buffer, 0, this.quads * 4 * stride * 4)))); this.quads = 0; this._mipRequested = false; },
    _regenerateMipmaps() { this._lastMipClock = this.clock; this._mipsDirty = false; },
  });
  for (const [name, stride] of names) paint[name] = new Float32Array(6000 * 4 * stride);
  for (let i = 0; i < paint.dead.length; i++) if (i % 59 === 0) paint.dead[i] = 1;
  paint._preparePaintOwnership();
  return { paint, faces, batches, rows, V3 };
}
function state(p) {
  return { grid: [...p.grid], dead: [...p.dead], counts: [...p.counts], version: p.version,
    orders: [...(p._paintOwnershipOrder || [])], records: plain(p._paintOrderRecords),
    growth: Array.from(p.growing, g => { const stride = g.entryStride === 8 ? 8 : 7, entries = [];
      for (let i = 0; i < g.entries.length; i += stride) entries.push([g.entries[i].id, ...g.entries.slice(i + 1, i + 7)]);
      return [g.R, g.team, g.seed, g.kind, g.age, g.dur, g.dripDur, g.paintOrder, g.netOrderId, entries]; }) };
}

test('actual splat/growth/ownership/GPU attributes match at 30/60/120 Hz, including pool reuse and network order', async () => {
  const api = await runtimes;
  for (const hz of [30, 60, 120]) for (const native of [false, true]) {
    const views = api.map(r => makePaint(r, native)), packets = [[], []];
    api.forEach((r, i) => { r.G.netm = { mute: 0, applying: false, recSplat(center, radius, team, opts) {
      packets[i].push([center.toArray(), radius, team, { ...opts, stretch: opts.stretch?.toArray() }]);
      return { peer: 'local', clock: packets[i].length };
    } }; });
    for (let frame = 0; frame < hz * 2; frame++) {
      const index = Math.floor(frame * 20 / hz);
      if (frame === 0 || index !== Math.floor((frame - 1) * 20 / hz)) {
        const kinds = ['shot', 'line', 'blast', 'bomb', 'trail', 'drop', 'roll', 'speck', 'source-shot', 'source-splash', 'ink-shot', 'ink-slosh', 'ink-brush', 'ink-flick', 'ink-contact', 'ink-charger-a', 'ink-charger-b', 'ink-charger-c', 'ink-blast', 'ink-blast-rectified'];
        const covered = views.map(v => v.paint.splat(new v.V3(2.2 + index % 5, .05 + index % 3 * .02, .05), .1 + index % 6 * .13, index % 2,
          { seed: (index * .137) % 1, kind: kinds[index % kinds.length], stretch: new v.V3(1, 0, 0), stretchAmt: .3, instant: index % 11 === 0, cosmetic: index % 13 === 0 }));
        assert.equal(covered[1], covered[0]);
      }
      views.forEach(v => v.paint.flush(1 / hz));
      assert.deepEqual(state(views[1].paint), state(views[0].paint), `${hz}/${native}/${frame}`);
      assert.deepEqual(views[1].batches, views[0].batches, 'submitted atlas bytes/order');
    }
    assert.deepEqual(plain(packets[1]), plain(packets[0]), 'recorded authoritative splats');
    assert.ok(views[1].paint._splatPoolStats.entryArraysReused > 0);
    views.forEach(v => { v.paint._disposeSplatPools(); assert.equal(v.paint.growing.length, 0); assert.equal(v.paint._splatEntryPool, null); });
    api.forEach(r => { r.G.netm = null; });
  }
});
