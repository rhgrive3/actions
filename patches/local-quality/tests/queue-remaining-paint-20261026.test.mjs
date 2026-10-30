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
import { adaptWorldNative20261029 } from '../queue-world-native-20261029-adapter.mjs';
import { replaceOnce } from '../adapter.mjs';
import { geometryFixture } from './geometry-build-fixture.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url)), SRC = path.join(ROOT, 'inkwave-public');
const baseline = JSON.parse(fs.readFileSync(new URL('./fixtures/queue-remaining-paint-before.json', import.meta.url)));
const sha = b => createHash('sha256').update(b).digest('hex');
const finalPaintOwnerBytes=fs.readFileSync(new URL('./fixtures/queue-remaining-paint-wave345-1915.json',import.meta.url));
function finalPaintOwners(bytes=finalPaintOwnerBytes){
  assert.equal(sha(bytes),'f9b4a7d39284fa5d943943f327ec00efdec854dfe3768505d58bf8b07d256bc3','sealed final paint owner tuples');
  return JSON.parse(bytes);
}
function replayFinalPaintOwners(source,bytes=finalPaintOwnerBytes){
  for(const {before,after,label} of finalPaintOwners(bytes))source=replaceOnce(source,before,after,label);
  return source;
}
// Reviewed native-stage contact-plane routing, subsequently added to the
// source chain. Keep every historical byte and prove each new anchor exactly.
const nativeContactOwners = [
  ["import { initNativeGrid, layoutNativePaint } from '../../patches/native-stages/runtime/engine.mjs';",
   "import { nativeContactFace, nativeContactCoplanar } from '../../patches/native-stages/runtime/native-paint.mjs';\nimport { initNativeGrid, layoutNativePaint } from '../../patches/native-stages/runtime/engine.mjs';"],
  ['    const faceIds = Number.isInteger(opts.face) && opts.face >= 0 ? this.level.queryFaceBlock?.(opts.face, this._qb || (this._qb = [])) : null;',
   '    const contactFace = nativeContactFace(this.level, opts.face, opts.kind);\n    const faceIds = !contactFace && Number.isInteger(opts.face) && opts.face >= 0 ? this.level.queryFaceBlock?.(opts.face, this._qb || (this._qb = [])) : null;'],
  ['          if (fid < 0 || (faceOnly >= 0 && fid !== faceOnly)) continue;\n          const f = this.level.faces[fid];\n          if (!f.atlas) continue;',
   '          if (fid < 0 || (!contactFace && faceOnly >= 0 && fid !== faceOnly)) continue;\n          const f = this.level.faces[fid];\n          if (!f.atlas || (contactFace && !nativeContactCoplanar(contactFace, f))) continue;'],
];
function replayNativeContact(source, reverse=false){
  for(const [before,after] of reverse?[...nativeContactOwners].reverse():nativeContactOwners)
    source=replaceOnce(source,reverse?after:before,reverse?before:after,'reviewed native paint contact');
  return source;
}
for (const row of Object.values(baseline)) if (row?.source) assert.equal(sha(row.source), row.sha256);
assert.equal(sha(baseline.ownership.composedSource), baseline.ownership.composedSha256);
const candidate = adaptRemainingPaint20261026('src/world/paint.js', baseline.paint.source);
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

test('roller interior skips only exact zero hypots; real CPU ownership and dirty rows are identical', async () => {
  const api = await runtimes; let random = 0x47b92a1;
  const rand = () => ((random = (Math.imul(random, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  for (const native of [false, true]) {
    const views = api.map(r => makePaint(r, native)); api.forEach(r => { r.counts.hypot = 0; });
    for (let i = 0; i < 1600; i++) {
      const kind = i % 3 ? 6 : i % 20, r = .05 + rand() * 2, lu = -.3 + rand() * 10.6, lv = -.3 + rand() * 10.6;
      const angle = rand() * Math.PI * 2, args = [lu, lv, r, i % 2, rand(), Math.cos(angle), Math.sin(angle), kind === 6 ? 0 : rand(), kind];
      const outputs = views.map(v => v.paint._cpuSplat(v.faces[i % 3], ...args));
      assert.equal(outputs[1], outputs[0]);
      if (i % 40 === 0) assert.deepEqual(state(views[1].paint), state(views[0].paint));
    }
    assert.deepEqual(state(views[1].paint), state(views[0].paint)); assert.deepEqual(views[1].rows, views[0].rows);
    assert.ok(api[1].counts.hypot < api[0].counts.hypot * .9, 'real roller grid avoids interior hypots');
  }
});

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

test('unclamped growth radius preserves NaN/signed zero, legacy records, radius invalidation and hidden snapshots', async () => {
  const api = await runtimes, views = api.map(r => makePaint(r));
  const values = [0, -0, .01, .1, 1, -1, NaN, Infinity, -Infinity, Number.MIN_VALUE, Number.MAX_VALUE];
  for (const R of values) for (const dn of values) {
    const args = views.map(v => ({ entries: [v.faces[2], 3, 2, dn, 1, 0, .2], R, kind: 0, team: 0, seed: .25, dripDur: 2 }));
    const sq = R * R - dn * dn, cached = Math.sqrt(sq), admission = sq < 0 ? 0 : Math.max(0, cached);
    assert.ok(Object.is(admission, Math.sqrt(Math.max(0, sq))));
    args[1].entries.push(cached); args[1].entryStride = 8; args[1].entryRadius = R;
    for (const dripOnly of [false, true]) {
      const out = views.map((v, i) => { const rows = []; const push = v.paint._pushQuad; v.paint._pushQuad = (...a) => rows.push([a[0].id, ...a.slice(1)]);
        v.paint._emitGrowth(args[i], .5, .3, dripOnly); v.paint._pushQuad = push; return rows; });
      assert.deepEqual(out[1], out[0]);
    }
  }
  const legacy = views.map(v => ({ entries: [v.faces[0], 3, 3, .1, 1, 0, 0], R: 1, kind: 0, team: 1, seed: .2, dripDur: 0 }));
  api.forEach(r => { r.counts.sqrt = 0; });
  views.forEach((v, i) => { for (let j = 0; j < 20; j++) v.paint._emitGrowth(legacy[i], j / 20, 0, false); v.paint._drawQuads(); });
  assert.deepEqual(views[1].batches, views[0].batches); assert.equal(api[1].counts.sqrt, api[0].counts.sqrt);
  legacy[1].entries.push(Math.sqrt(1 - .01)); legacy[1].entryStride = 8; legacy[1].entryRadius = 1;
  api.forEach(r => { r.counts.sqrt = 0; });
  views.forEach((v, i) => { for (let j = 0; j < 20; j++) v.paint._emitGrowth(legacy[i], j / 20, 0, false); v.paint._drawQuads(); });
  assert.deepEqual(views[1].batches, views[0].batches); assert.equal(api[1].counts.sqrt, 0); assert.equal(api[0].counts.sqrt, 20);
  legacy.forEach(g => { g.R = .75; g.paintOrder = 4; });
  api.forEach(r => { r.document.hidden = true; });
  views.forEach((v, i) => { v.paint._emitGrowth(legacy[i], .8, .3, false); v.paint._releaseSplatGrowth(legacy[i]); });
  api.forEach(r => { r.document.hidden = false; });
  views.forEach(v => { v.paint._resumePaintPresentation(); v.paint._drawQuads(); });
  assert.deepEqual(views[1].batches, views[0].batches, 'snapshot copies stride and immutable cache provenance');
  assert.equal(legacy[1].entries, null); assert.equal(legacy[1].entryStride, 7);
});

test('native settled-mask and cell-replay caches keep integer face slots for eight-slot growth entries', async () => {
  const api = await runtimes, views = api.map(r => makePaint(r, true));
  views.forEach(v => v.paint.splat(new v.V3(4, 1, .08), 1.3, 0, { seed: .31, kind: 'bomb' }));
  for (let frame = 0; frame < 120; frame++) {
    views.forEach(v => v.paint.flush(1 / 60));
    assert.deepEqual(state(views[1].paint), state(views[0].paint));
  }
  assert.deepEqual(views[1].batches, views[0].batches);
  const growth = views[1].paint.growing[0]; assert.ok(growth, 'wall drip remains live');
  const faces = growth.entries.length / 8;
  for (const name of ['_s3AncillaryCells', '_s3SettledAncillary']) {
    const slots = growth[name]; assert.ok(slots?.length, name + ' actually exercised');
    assert.ok(slots.length <= faces, 'one logical slot per face');
    assert.ok(Object.keys(slots).every(key => Number.isInteger(Number(key))), 'no fractional stride-derived properties');
  }
});

test('shelf retries preserve stable face ordering and atomic atlas commits for five stages and adversarial layouts', async () => {
  const api = await runtimes, geometry = await geometryFixture(); let seed = 39417, attempts = 0, retries = 0;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const layouts = ['tidewater', 'kelpline', 'halyard', 'cargo', 'range'].map(id => new geometry.Level(geometry.MAP_LAYOUTS[id]).faces);
  layouts.push([], [{ su: 1e12, sv: 1e12, paintable: true }]);
  for (let n = 0; n < 180; n++) layouts.push(Array.from({ length: 2 + Math.floor(rand() * 100) }, (_, id) => ({ id, paintable: id % 11 !== 0, su: 1 + rand() * 40, sv: 1 + Math.floor(rand() * 12), atlas: { sentinel: id } })));
  for (let k = 0; k < layouts.length; k++) {
    const trace = [[], []], views = api.map((r, index) => {
      const p = Object.create(r.PaintSystem.prototype); Object.assign(p, { level: { faces: layouts[k].map((f, id) => ({ ...f, id, atlas: f.atlas ? { ...f.atlas } : undefined })) }, size: k < 5 ? 2048 : 128, pad: 8, usedHeight: -1 });
      const original = p._tryPack; let ownedStaging;
      p._tryPack = function(faces, ppm, size, staging) {
        const before = JSON.stringify(faces.map(f => f.atlas)), result = original.call(this, faces, ppm, size, staging);
        if (index) { if (ownedStaging) assert.equal(staging, ownedStaging); ownedStaging = staging; }
        if (!result) assert.equal(JSON.stringify(faces.map(f => f.atlas)), before, 'failed pack does not write any atlas');
        trace[index].push([ppm, result, this.usedHeight]); return result;
      }; return p;
    });
    views.forEach(v => v._layout(k < 5 ? 16 : 10));
    assert.deepEqual(trace[1], trace[0]); assert.deepEqual(plain(views[1].level.faces.map(f => f.atlas)), plain(views[0].level.faces.map(f => f.atlas)));
    assert.equal(views[1].ppm, views[0].ppm); assert.equal(views[1].usedHeight, views[0].usedHeight);
    attempts += trace[0].length; retries += trace[0].length - 1;
  }
  assert.ok(retries > 1000); console.log(JSON.stringify({ scope: 'actual shelf methods and five authored stage face sets', layouts: layouts.length, attempts, retries }));
});

test('paint source adapter is isolated and fail-closed', () => {
  // Remaining-paint owns this intermediate. Later production owners alter
  // the terminal bytes; verify their exact ordered composition rather than
  // falsely asserting that the intermediate is the final source.
  const world = adaptCombatWorldQueue20261027('src/world/paint.js', candidate);
  const cpu = adaptCombatGpuCpuPerfect('src/world/paint.js', world, replaceOnce);
  const regional = adaptPaintRenderRegions('src/world/paint.js', cpu, replaceOnce);
  const terminal = adaptWorldNative20261029('src/world/paint.js', regional);
  assert.notEqual(cpu, candidate, 'CPU owner is actually exercised');
  assert.notEqual(regional, cpu, 'regional rendering owner is actually exercised');
  assert.notEqual(terminal, regional, 'native mip and stretch-factor owner is actually exercised');
  const current=adaptBuildSource('src/world/paint.js',fs.readFileSync(path.join(SRC,'src/world/paint.js'),'utf8'));
  const final=replayFinalPaintOwners(terminal),owners=finalPaintOwners();
  assert.equal(owners.length,2,'both reviewed final paint owners are represented');
  assert.notEqual(final,terminal,'reviewed final owner is distinct from the unchanged older chain');
  assert.equal(current,replayNativeContact(final),'production composition includes the reviewed native contact-plane owner');
  let restored=replayNativeContact(current,true);
  for(const {before,after,label} of [...owners].reverse())restored=replaceOnce(restored,after,before,'reverse '+label);
  assert.equal(restored,terminal,'current paint source reverses to the complete independently composed older chain');
  for(const {before,after,label} of owners){
    assert.throws(()=>replayFinalPaintOwners(terminal.replace(before,'')),/expected exactly one/,'missing final paint owner site is rejected');
    assert.throws(()=>replayFinalPaintOwners(terminal+before),/expected exactly one/,'duplicate final paint owner site is rejected');
    assert.throws(()=>replaceOnce(current.replace(after,''),after,before,'missing reverse '+label),/expected exactly one/,'missing current owner cannot be reversed');
    assert.throws(()=>replaceOnce(current+after,after,before,'duplicate reverse '+label),/expected exactly one/,'duplicate current owner cannot be reversed');
  }
  assert.throws(()=>replayFinalPaintOwners(terminal,Buffer.from(finalPaintOwnerBytes.toString().replace('paintShapeSeed','unreviewedPaintShapeSeed'))),/sealed final paint owner tuples/,'changed owner cannot acquire the frozen final paint identity');
  assert.throws(() => adaptPaintRenderRegions('src/world/paint.js', terminal, replaceOnce), /already composed/);
  assert.throws(() => adaptWorldNative20261029('src/world/paint.js', terminal), /anchor/);
  assert.equal(adaptRemainingPaint20261026('src/config.js', baseline.paint.source), baseline.paint.source);
  assert.throws(() => adaptRemainingPaint20261026('src/world/paint.js', candidate), /source anchor/);
  assert.doesNotThrow(() => new vm.SourceTextModule(candidate));
});
