import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {composed, declaration} from './queue-visual-world-20261031.helper.mjs';

const REL = 'src/world/props-marina-vessels.js';
const source = composed(REL);
const oldGridFile = fs.readFileSync(new URL('./fixtures/queue-marina-grid-before-20261031.mjs.txt', import.meta.url), 'utf8');
const oldGrid = oldGridFile.trimEnd();
const grid = declaration(source, null, 'gridSurface');
const before = source.slice(0, grid.start) + oldGrid + source.slice(grid.end);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const bytes = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const plain = x => JSON.parse(JSON.stringify(x));

function walk(n, visit, parent = null, grand = null) {
  if (!n || typeof n !== 'object') return;
  visit(n, parent, grand);
  for (const v of Object.values(n)) {
    if (Array.isArray(v)) { for (const x of v) walk(x, visit, n, parent); }
    else if (v && typeof v === 'object') walk(v, visit, n, parent);
  }
}
function gridAPI(s) {
  const code = [declaration(s, 'IWMarinaStaging', null).source,
    declaration(s, 'MB', null).source, declaration(s, null, 'gridSurface').source].join('\n');
  return new Function('THREE', code + '; return { MB, gridSurface };')(THREE);
}
const apis = [gridAPI(before), gridAPI(source)];
function sameGeometry(a, b) {
  assert.deepEqual(Object.keys(a.attributes), Object.keys(b.attributes));
  for (const k of Object.keys(a.attributes)) {
    const x = a.attributes[k], y = b.attributes[k];
    assert.equal(x.itemSize, y.itemSize, k);
    assert.equal(x.normalized, y.normalized, k);
    assert.equal(x.array.constructor.name, y.array.constructor.name, k);
    assert.equal(Buffer.compare(bytes(x.array), bytes(y.array)), 0, k + ' bytes');
  }
  assert.equal(a.index.array.constructor.name, b.index.array.constructor.name);
  assert.equal(Buffer.compare(bytes(a.index.array), bytes(b.index.array)), 0, 'index bytes');
}
function builders(base = 0) {
  return apis.map(({MB}) => {
    const mb = new MB(); mb._reserveVertices(base);
    for (let i = 0; i < base; i++) assert.equal(mb.v(i / 7, -i / 9, i / 11, 0, -1, 0, null), i);
    return mb;
  });
}
function sameBuilders(a, b) {
  assert.equal(a._vc, b._vc); assert.equal(a._ic, b._ic); assert.equal(a._max, b._max);
  for (const k of ['p', 'n', 'c']) assert.equal(Buffer.compare(bytes(a[k].subarray(0, a._vc * 3)), bytes(b[k].subarray(0, b._vc * 3))), 0, k);
  const ga = a.geo(), gb = b.geo(); sameGeometry(ga, gb); ga.dispose(); gb.dispose();
}
const rowsFor = (ni, nj, flip = 1) => Array.from({length: ni}, (_, i) =>
  Array.from({length: nj}, (_, j) => [Math.cos(j / nj * Math.PI * 2) * (1 + i / 17),
    flip * Math.sin(j / nj * Math.PI * 2), i / 7]));

test('private grid callers discard the result and local MB allocates dense IDs', () => {
  assert.equal(hash(oldGridFile), '5abbb15d86441dcec83c014746c213f16eb6bd77033578d2396ff2a99980a780');
  const ast = parse(source, {ecmaVersion: 'latest', sourceType: 'module'});
  let calls = 0, declarations = 0;
  walk(ast, (n, parent, grand) => {
    if (n.type !== 'Identifier' || n.name !== 'gridSurface') return;
    if (parent.type === 'FunctionDeclaration' && parent.id === n) { declarations++; return; }
    assert.equal(parent.type, 'CallExpression', 'grid helper must not escape or be aliased');
    assert.equal(parent.callee, n);
    assert.equal(grand.type, 'ExpressionStatement', 'a new consumer must retain the previous ID-matrix contract');
    assert.equal(parent.arguments[0].type, 'Identifier');
    assert.equal(parent.arguments[0].name, 'mb');
    calls++;
  });
  assert.equal(declarations, 1); assert.equal(calls, 15);
  const vertex = declaration(source, 'IWMarinaStaging', '_vertex').source;
  const v = declaration(source, 'MB', 'v').source;
  assert.equal(hash(vertex), '2ebc8f51532ec9d0346b5df1c8f9b09415041e09e14d46ef5e6431745a43dd1f');
  assert.equal(hash(v), 'aaf3b8c84aa5a11d4a94701212cfb4cbca89cdc19671569b3c86c8c2aec9d660');
  assert.match(vertex, /return this\._vc\+\+;/);
  assert.match(v, /return this\._vertex\(x,y,z,nx\/l,ny\/l,nz\/l,c\?c\.r:1,c\?c\.g:1,c\?c\.b:1\);/);
  let oldArrays = 0, newArrays = 0;
  walk(parse(oldGrid, {ecmaVersion: 'latest'}), n => { if (n.type === 'ArrayExpression') oldArrays++; });
  walk(parse(grid.source, {ecmaVersion: 'latest'}), n => { if (n.type === 'ArrayExpression') newArrays++; });
  assert.equal(oldArrays, 2); assert.equal(newArrays, 0);
});

test('real MB preserves exact vertex, normal, color and winding bytes for open/closed grids and repeated appends', () => {
  for (const ni of [2, 4, 17]) for (const nj of [2, 5, 12]) for (const closed of [false, true])
    for (const base of [0, 1, 7]) for (const flip of [-1, 1]) {
      const pair = builders(base), rows = rowsFor(ni, nj, flip);
      for (let pass = 0; pass < 2; pass++) {
        for (let k = 0; k < 2; k++) apis[k].gridSurface(pair[k], rows,
          (i, j) => [0, flip * .3, rows[i][j][2]],
          (x, y, z, i, j) => ({r: (i + 1) / ni, g: (j + 1) / nj, b: (x + y + z) / 9}), closed);
        sameBuilders(...pair);
      }
    }
});

test('degenerate surfaces and 16-bit index boundary preserve real MB filtering and index type', () => {
  for (const rows of [rowsFor(1, 4), [[], []], [[[0,0,0],[0,0,0]], [[0,0,0],[0,0,0]]]]) {
    const pair = builders(3);
    for (let k = 0; k < 2; k++) apis[k].gridSurface(pair[k], rows, () => [0, 1, 0], null, true);
    sameBuilders(...pair);
  }
  for (const base of [65530, 65535]) {
    const pair = builders(base), rows = rowsFor(4, 5);
    for (let k = 0; k < 2; k++) apis[k].gridSurface(pair[k], rows, (i, j) => [0, 0, rows[i][j][2]], null, true);
    sameBuilders(...pair);
    assert.equal(pair[1].geo().index.array.constructor.name, 'Uint32Array');
  }
});

test('normal/color callback failures keep the same completed vertices and no premature triangles', () => {
  for (const failure of ['ref', 'color']) {
    const pair = builders(5), rows = rowsFor(4, 5), sentinel = {failure};
    const traces = [];
    for (let k = 0; k < 2; k++) {
      const trace = [], visit = (kind, i, j) => { trace.push([kind, i, j]); if (kind === failure && i === 1 && j === 2) throw sentinel; };
      assert.throws(() => apis[k].gridSurface(pair[k], rows,
        (i, j) => { visit('ref', i, j); return [0, 0, rows[i][j][2]]; },
        (x, y, z, i, j) => { visit('color', i, j); return {r: .2, g: .3, b: .4}; }, true), x => x === sentinel);
      traces.push(trace);
    }
    assert.deepEqual(traces[0], traces[1]); sameBuilders(...pair);
    assert.equal(pair[1]._ic, 0);
  }
});

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.join(ROOT, 'inkwave-public');
async function propFixture(old) {
  const context = vm.createContext({console, performance, URL, TextEncoder, TextDecoder, __gridCalls: []});
  const cache = new Map();
  const resolve = (s, from) => s === 'three' ? path.join(SRC, 'vendor/three/build/three.module.js')
    : s.startsWith('three/addons/') ? path.join(SRC, 'vendor/three/jsm', s.slice('three/addons/'.length))
    : path.resolve(path.dirname(from), s).replace('/inkwave-public/patches/', '/patches/');
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const rel = path.relative(SRC, file), raw = fs.readFileSync(file, 'utf8');
    let code = rel.startsWith('..') ? raw : adaptBuildSource(rel, raw);
    if (rel === REL) {
      if (old) { const fn = declaration(code, null, 'gridSurface'); code = code.slice(0, fn.start) + oldGrid + code.slice(fn.end); }
      code = code.replace('function gridSurface(mb, rows, ref, colorFn, closedJ = false) {',
        'function gridSurface(mb, rows, ref, colorFn, closedJ = false) { globalThis.__gridCalls.push([rows.length, rows[0].length, closedJ, mb._vc]);');
    }
    if (rel === 'src/world/props-core.js') code += '\nexport {D as queueDefinitions, PACK_RESOURCES as queuePackResources};';
    const mod = new vm.SourceTextModule(code, {context, identifier: file, initializeImportMeta(m) {m.url = pathToFileURL(file).href;}});
    cache.set(file, mod); return mod;
  }
  const entry = new vm.SourceTextModule(`
    import {PropKit, registerPropPack, queueDefinitions, queuePackResources} from './inkwave-public/src/world/props-core.js';
    import {registerMarinaVessels, HALYARD_VESSELS} from './inkwave-public/src/world/props-marina-vessels.js';
    const existing = new Set(Object.keys(queueDefinitions));
    registerPropPack('marina-vessels', registerMarinaVessels);
    export const marinaTypes = Object.keys(queueDefinitions).filter(k => !existing.has(k));
    export {PropKit, HALYARD_VESSELS, queuePackResources};
  `, {context, identifier: path.join(ROOT, 'queue-marina-grid-entry.mjs')});
  await entry.link((s, from) => load(resolve(s, from.identifier))); await entry.evaluate();
  return {...entry.namespace, context};
}
function bucketState(kit) {
  const geometry = new WeakMap();
  const geo = g => {
    if (!geometry.has(g)) geometry.set(g, {
      attributes: Object.fromEntries(Object.entries(g.attributes).map(([k, a]) => [k,
        {type: a.array.constructor.name, itemSize: a.itemSize, normalized: a.normalized, bytes: a.array.byteLength, hash: hash(bytes(a.array))}])),
      index: g.index ? {type: g.index.array.constructor.name, bytes: g.index.array.byteLength, hash: hash(bytes(g.index.array))} : null,
      groups: plain(g.groups), range: {start: g.drawRange.start, count: g.drawRange.count},
    });
    return geometry.get(g);
  };
  return [...kit._buckets].map(([key, parts]) => [key, Array.from(parts, p => ({
    g: geo(p.g), m: Array.from(p.m.elements), c: Array.from(p.c.toArray()), uv: plain(p.uv), uvs: plain(p.uvs), ao: plain(p.ao),
  }))]);
}

test('all real Marina prop types, seeded variants and qualities keep geometry, placements and pack leases', async t => {
  const pair = await Promise.all([propFixture(true), propFixture(false)]);
  assert.deepEqual(Array.from(pair[0].marinaTypes), Array.from(pair[1].marinaTypes));
  assert.equal(pair[1].marinaTypes.length, 16);
  let placements = 0;
  for (const quality of ['low', 'medium', 'high']) {
    const kits = pair.map(v => new v.PropKit(null, {headless: true, quality}));
    const results = [[], []];
    for (const type of pair[1].marinaTypes) for (const variant of [0, 1]) {
      const o = {variant, seed: variant ? 77 : 13, pos: variant ? [3, 1, -4] : [0, 0, 0], rotY: variant ? Math.PI : 0};
      for (let k = 0; k < 2; k++) results[k].push(plain(kits[k].add(type, o)));
      placements++;
    }
    assert.deepEqual(results[0], results[1], quality + ' colliders');
    assert.deepEqual(bucketState(kits[0]), bucketState(kits[1]), quality + ' geometry and placement bytes');
    for (let k = 0; k < 2; k++) assert.equal(pair[k].queuePackResources.get('marina-vessels').users, 1);
    for (const kit of kits) kit.dispose();
    for (let k = 0; k < 2; k++) assert.equal(pair[k].queuePackResources.get('marina-vessels').users, 0);
  }
  assert.deepEqual(plain(pair[0].context.__gridCalls), plain(pair[1].context.__gridCalls));
  const calls = pair[1].context.__gridCalls;
  assert(calls.length > 0); assert(calls.some(c => c[2])); assert(calls.some(c => !c[2])); assert(calls.some(c => c[3] > 0));
  t.diagnostic(JSON.stringify({placements, gridCalls: calls.length,
    eliminatedIdArrayConstructions: calls.reduce((n, [rows]) => n + rows + 1, 0),
    eliminatedStoredIds: calls.reduce((n, [rows, cols]) => n + rows * cols, 0)}));
});

test('actual Halyard vessel placements remain equal on cache reuse and final-owner release', async () => {
  const pair = await Promise.all([propFixture(true), propFixture(false)]);
  const owners = pair.map(v => [new v.PropKit(null, {headless: true, quality: 'high'}), new v.PropKit(null, {headless: true, quality: 'high'})]);
  for (let k = 0; k < 2; k++) for (const kit of owners[k]) for (const p of pair[k].HALYARD_VESSELS) kit.add(p.type, p);
  assert.deepEqual(bucketState(owners[0][0]), bucketState(owners[1][0]));
  assert.deepEqual(bucketState(owners[0][1]), bucketState(owners[1][1]));
  for (let k = 0; k < 2; k++) {
    const resources = pair[k].queuePackResources.get('marina-vessels');
    assert.equal(resources.users, 2);
    const survivor = bucketState(owners[k][1]); owners[k][0].dispose();
    assert.equal(resources.users, 1); assert.deepEqual(bucketState(owners[k][1]), survivor);
    owners[k][1].dispose(); assert.equal(resources.users, 0);
    const replay = new pair[k].PropKit(null, {headless: true, quality: 'high'});
    for (const p of pair[k].HALYARD_VESSELS) replay.add(p.type, p);
    assert.deepEqual(bucketState(replay), survivor); replay.dispose(); assert.equal(resources.users, 0);
  }
});
