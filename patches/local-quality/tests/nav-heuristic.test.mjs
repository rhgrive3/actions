import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { BUILD_ONLY_PATCH_MODULES } from '../../../scripts/lib/inkwave-build-only-modules.mjs';
import { adaptNavHeuristic } from '../nav-heuristic-adapter.mjs';
import { replaceOnce } from '../adapter.mjs';
import { convertSource } from '../../native-stages/runtime/source-convert.mjs';

const frozen = fs.readFileSync(new URL('./fixtures/nav-9c070329.mjs.txt', import.meta.url), 'utf8');
const f = await fixture({ productionComposition: true, adaptRuntime: adaptBuildSource, extraExports: `
  export { NavGraph } from './inkwave-public/src/game/nav.js';
  export { NativeLevel, NativePhysics } from './patches/native-stages/runtime/engine.mjs';
` });
const math = Object.create(Math);
const OldNav = new Function('THREE', 'PLAYER', 'buildNativeNav', 'Math',
  frozen.replace(/^import .*;$/gm, '').replace(/^export /gm, '') + '\nreturn NavGraph;')(
  f.THREE, f.PLAYER, () => { throw Error('Construct the real native graph before cloning its immutable topology'); }, math);
const hash = text => createHash('sha256').update(text).digest('hex');
const random = (seed = 79417) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const flat = value => value == null ? value : Array.from(value);
const graph = (Class, nodes) => Object.assign(Object.create(Class.prototype), { nodes });

function layeredNodes() {
  const r = random(), nodes = [], width = 24;
  for (let layer = 0; layer < 2; layer++) for (let z = 0; z < width; z++) for (let x = 0; x < width; x++)
    nodes.push({ id: nodes.length, x, y: layer * 2 + ((x + z) % 7) * .04, z, zone: x === 0 ? 0 : x === width - 1 ? 1 : -1, nb: [] });
  for (const n of nodes) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) {
      const x = n.x + dx, z = n.z + dz, layer = n.id >= width * width ? 1 : 0;
      if (x < 0 || z < 0 || x >= width || z >= width || (x === 12 && z % 6 !== 0)) continue;
      n.nb.push({ to: layer * width * width + z * width + x, cost: Math.hypot(dx, dz) + r() * .7, type: 'walk' });
    }
    if ((n.x + n.z) % 11 === 0) n.nb.push({ to: (n.id + width * width) % nodes.length, cost: 4.3, type: 'climb' });
  }
  // Unreachable component and equal-priority alternatives exercise old tie/limit behavior.
  nodes.push({ id: nodes.length, x: -100, y: -4, z: -100, zone: -1, nb: [] });
  return nodes;
}

function comparePair(nodes, cases) {
  const pair = [graph(OldNav, nodes), graph(f.NavGraph, nodes)];
  let before = 0, after = 0, paths = 0;
  const original = f.VM_MATH.hypot;
  math.hypot = (...args) => { before++; return Math.hypot(...args); };
  f.VM_MATH.hypot = (...args) => { after++; return original(...args); };
  try {
    for (const [a, b, team, limit = 6000, filtered = false] of cases) {
      const visits = [[], []];
      const results = pair.map((nav, k) => nav.path(a, b, team, limit, filtered ? edge => {
        visits[k].push([edge.to, edge.cost, edge.type]);
        return edge.type !== 'climb' && edge.to % 13 !== 0;
      } : null));
      assert.deepEqual(flat(results[1]), flat(results[0]), `route ${a}/${b}/${team}/${limit}`);
      assert.deepEqual(visits[1], visits[0], 'native edge-filter calls and order');
      for (const key of ['_g', '_from', '_seen', '_closed'])
        assert.deepEqual(flat(pair[1][key]), flat(pair[0][key]), key + ' search state');
      assert.equal(pair[1]._heap?.n, pair[0]._heap?.n, 'queue logical length');
      if (pair[0]._heap) {
        const n = pair[0]._heap.n;
        assert.deepEqual(flat(pair[1]._heap.ids.slice(0, n)), flat(pair[0]._heap.ids.slice(0, n)), 'queue order');
        assert.deepEqual(flat(pair[1]._heap.pr.slice(0, n)), flat(pair[0]._heap.pr.slice(0, n)), 'Float64 queue priorities');
      }
      if (results[0]?.length > 1) paths++;
    }
  } finally { f.VM_MATH.hypot = original; delete math.hypot; }
  return { queries: cases.length, nontrivialPaths: paths, before, after, reduction: 1 - after / before,
    extraScratchBytes: pair[1]._h?.byteLength || 0 };
}

test('baseline is pinned; transformer is guarded, composed, and excluded from browser assets', () => {
  assert.equal(hash(frozen), '6439aa71cbf266777b0190a8e568561aaaf41b39b149fadd6735bb3f116b280f');
  assert(BUILD_ONLY_PATCH_MODULES.has('patches/local-quality/nav-heuristic-adapter.mjs'));
  const raw = fs.readFileSync(new URL('../../../inkwave-public/src/game/nav.js', import.meta.url), 'utf8');
  const transformed = adaptBuildSource('src/game/nav.js', raw);
  assert.match(transformed, /acceptEdge && !acceptEdge\(e\)/);
  assert.throws(() => adaptNavHeuristic('src/game/nav.js', transformed, replaceOnce), /conflict/);
  assert.throws(() => adaptNavHeuristic('src/game/nav.js', '', replaceOnce), /conflict/);
  assert.equal(adaptNavHeuristic('src/main.js', 'unrelated', replaceOnce), 'unrelated');
});

test('600 layered A* routes preserve paths, costs, ties, iteration limits and edge callback order', () => {
  const nodes = layeredNodes(), r = random(712);
  const cases = Array.from({ length: 600 }, (_, i) => [
    i % 29 === 0 ? -1 : (r() * nodes.length) | 0,
    i % 17 === 0 ? nodes.length - 1 : (r() * nodes.length) | 0,
    i % 2, [0, 1, 8, 50, 6000][i % 5], i % 3 === 0,
  ]);
  const result = comparePair(nodes, cases);
  assert(result.nontrivialPaths > 50);
  assert(result.after < result.before * .9, 'materially fewer heuristic calculations');
  console.log(JSON.stringify({ scope: 'exact source/emitted A* component; no hardware/FPS claim', ...result }));
});

test('actual block and source-triangle native graph builders retain their complete route results', () => {
  const layout = { bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 }, spawnPads: [[-7, 0, 0], [7, 0, 0]], spawnBarrier: 0,
    single: [{ kind: 'box', min: [-10, -1, -10], max: [10, 0, 10] }, { kind: 'box', min: [-2, 0, -3], max: [2, 1, 3] }], half: [] };
  const level = new f.Level(layout);
  const legacy = new f.NavGraph(level, new f.Physics(level));
  const data = convertSource({ id: 'heuristic-native', bounds: layout.bounds, spawnPads: layout.spawnPads, spawnBarrier: 0 },
    'o Fld_floor\nusemtl Concrete00\nv -10 0 -10\nv 10 0 -10\nv -10 0 10\nv 10 0 10\nvn 0 1 0\nvn 0 1 0\nvn 0 1 0\nvn 0 1 0\nf 1//1 3//3 2//2\nf 2//2 3//3 4//4\n', 'newmtl Concrete00\nKd 1 1 1\n', {});
  const nativeLevel = new f.NativeLevel(data);
  const native = new f.NavGraph(nativeLevel, new f.NativePhysics(nativeLevel));
  for (const nav of [legacy, native]) {
    assert(nav.validIds.length > 100);
    const ids = nav.validIds, r = random(317);
    const result = comparePair(nav.nodes, Array.from({ length: 100 }, (_, i) => [ids[(r() * ids.length) | 0], ids[(r() * ids.length) | 0], i % 2, 6000, i % 4 === 0]));
    assert(result.nontrivialPaths > 50);
    console.log(JSON.stringify({ graph: nav.level.native ? 'source-triangle native' : 'block', nodes: nav.nodes.length, ...result }));
  }
});

test('repeated goals, resized graphs and interrupted edge filters never reuse another search heuristic', () => {
  const nodes = layeredNodes(), pair = [graph(OldNav, nodes), graph(f.NavGraph, nodes)];
  for (const nav of pair) assert.throws(() => nav.path(1, 400, 0, 6000, () => { throw Error('stop'); }), /stop/);
  for (const [a, b] of [[1, 400], [400, 1], [42, 42], [1, 800]])
    assert.deepEqual(flat(pair[1].path(a, b, 0)), flat(pair[0].path(a, b, 0)));
  const scratch = pair[1]._h;
  pair[1].path(7, 300, 1);
  assert.equal(pair[1]._h, scratch, 'reuse bounded per-graph storage');
  for (const nav of pair) nav.nodes = nodes.slice(0, 2).map((n, id) => ({ ...n, id, nb: id ? [] : [{ to: 1, cost: 1, type: 'walk' }] }));
  assert.deepEqual(flat(pair[1].path(0, 1, 0)), flat(pair[0].path(0, 1, 0)));
  assert.equal(pair[1]._h.byteLength, 16, 'resize releases the former heuristic buffer');
});
