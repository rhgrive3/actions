import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../inkwave-public/vendor/three/build/three.module.js';
import { adaptBuildSource } from '../inkwave-source-composition.mjs';

// Execute the complete production-composed classes. The frozen source methods
// are a differential oracle for route ties, search state, RNG and exact clocks;
// these component checks make no browser/FPS or retail-Splatoon claim.
const read = rel => fs.readFileSync(new URL('../../' + rel, import.meta.url), 'utf8');
const unmodule = code => code.replace(/^import .*;$/gm, '').replace(/^export /gm, '');
const G = {};
const load = (code, exports, bindings = {}) => new Function('THREE', 'G', ...Object.keys(bindings),
  unmodule(code) + '\nreturn {' + exports + '};')(THREE, G, ...Object.values(bindings));
const current = rel => adaptBuildSource('src/boss/' + rel, read('inkwave-public/src/boss/' + rel));
const { BossNav } = load(current('bossNav.js'), 'BossNav');
const { BossHazards, HZ, moveTimes } = load(current('bossHazards.js'), 'BossHazards,HZ,moveTimes', { Hit: class {} });
const { BossBrain } = load(current('bossBrain.js'), 'BossBrain', { HZ });
const before = load(read('scripts/tests/fixtures/boss-processing-48511150.mjs.txt'),
  'BossNav,LegacyBossBrain,LegacyBossHazards', { HZ });

function random(seed) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

function graph(Type, width, mode) {
  const nav = Object.assign(Object.create(Type.prototype), {
    nx: width, nz: width, step: .5, x0: -3.25, z0: 1.125,
    plan: new Uint8Array(width * width).fill(1),
    Dw: new Float32Array(width * width), Dv: new Float32Array(width * width), planIds: [],
  });
  const rnd = random(9127);
  for (let z = 0; z < width; z++) for (let x = 0; x < width; x++) {
    const id = z * width + x;
    const barrier = x === (width >> 1) && (mode === 'disconnected' || mode === 'blocked' && z % 9 !== 2);
    nav.plan[id] = barrier || mode === 'blocked' && rnd() < .15 ? 0 : 1;
    nav.Dw[id] = mode === 'ties' ? 6 : 2.9 + rnd() * 6;
    nav.Dv[id] = mode === 'ties' ? 4 : 1.8 + rnd() * 4;
    if (nav.plan[id]) nav.planIds.push(id);
  }
  return nav;
}

// A retained plan Proxy records each tested neighbour without changing its value.
// Equal reads plus all mutable search arrays establish exact expansion order,
// including searches which stop with queued heap work still remaining.
function traceSearch(nav, args) {
  const plan = nav.plan, reads = [];
  nav.plan = new Proxy(plan, { get(target, key) { reads.push(key); return target[key]; } });
  try { return { path: nav.path(...args), reads }; }
  finally { nav.plan = plan; }
}

test('boss plans preserve exact routes and expansion order through repeated goals and disconnected searches', () => {
  const rnd = random(723);
  let paths = 0, misses = 0;
  for (const mode of ['ties', 'open', 'blocked', 'disconnected']) {
    const old = graph(before.BossNav, 32, mode), next = graph(BossNav, 32, mode);
    let retainedHeap;
    for (let i = 0; i < 80; i++) {
      const from = old.xz(old.planIds[(rnd() * old.planIds.length) | 0]);
      const to = i % 7 === 0 ? from : old.xz(old.planIds[(rnd() * old.planIds.length) | 0]);
      const args = [from[0], from[1], to[0], to[1]];
      const expected = traceSearch(old, args), actual = traceSearch(next, args);
      assert.deepEqual(actual, expected, mode + ': query ' + i);
      for (const key of ['_g', '_from', '_seen', '_closed']) assert.deepEqual(next[key], old[key], mode + ': ' + key);
      if (actual.path) paths++; else misses++;
      if (retainedHeap) assert.equal(next._heap, retainedHeap, 'search heap remains owned by this graph');
      retainedHeap = next._heap;
    }
    assert(next._h instanceof Float64Array, 'heuristic retains JS Number precision');
  }
  assert(paths > 200 && misses > 10);
});

test('boss search demonstrably removes repeated grid-length and heuristic work', t => {
  const old = graph(before.BossNav, 40, 'blocked'), next = graph(BossNav, 40, 'blocked');
  const rnd = random(14), queries = Array.from({ length: 60 }, () => {
    const a = old.xz(old.planIds[(rnd() * old.planIds.length) | 0]), b = old.xz(old.planIds[(rnd() * old.planIds.length) | 0]);
    return [...a, ...b];
  });
  const original = Math.hypot, counts = [];
  try {
    for (const nav of [old, next]) {
      let calls = 0;
      Math.hypot = (...args) => { calls++; return original(...args); };
      for (const args of queries) nav.path(...args);
      counts.push(calls);
    }
  } finally { Math.hypot = original; }
  assert(counts[1] < counts[0] * .5, JSON.stringify({ before: counts[0], after: counts[1] }));
  t.diagnostic(JSON.stringify({ hypotCallsBefore: counts[0], hypotCallsAfter: counts[1], heuristicScratchBytes: next._h.byteLength }));
});

test('boss move weights retain exact threshold, cooldown, last-move and RNG choices', () => {
  const actors = [-14, -13, -10.5, -10.49, 0, 10.49, 10.5, 13, 13.01, 20].map((x, i) => ({
    alive: i !== 1, team: i === 5 ? 1 : 0, pos: { x, z: 0 },
  }));
  G.actors = actors;
  for (const phase of [1, 2, 3]) for (const crabs of [0, 2, 3, 5]) for (const cooldown of [-1, 0, .01]) {
    const boss = { phase, pos: { x: 0, z: 0 }, yaw: 0,
      nav: { inPad: (x) => x === 20 }, crabs: new Map(Array.from({ length: crabs }, (_, i) => [i, { dead: i === 4 }])) };
    const make = Type => Object.assign(Object.create(Type.prototype), {
      b: boss, cd: { crablets: cooldown, frenzy: cooldown }, rnd: random(711),
      _lane: () => phase === 1 ? null : { yaw: .625, L: 17, wall: true }, last: null,
    });
    const old = make(before.LegacyBossBrain), next = make(BossBrain);
    for (let i = 0; i < 120; i++) {
      const target = { pos: { x: i % 23, z: i % 3 } };
      if (i % 17 === 0) old.force = next.force = 'charge';
      const expected = old._choose(target), actual = next._choose(target);
      assert.deepEqual({ ...actual, faceFn: actual.faceFn?.() }, { ...expected, faceFn: expected.faceFn?.() });
      assert.equal(next.force, old.force);
      old.last = next.last = actual.id;
    }
    assert.equal(next.rnd(), old.rnd(), 'RNG consumption stays exact');
  }
  G.actors = [];
});

test('boss hazard clocks and cleanup retain exact endpoints and observe changed records', () => {
  const moves = [
    { id: 'slam', t0: 2, d: [1.15, 1.9, 1], p: { rings: [0, .4, .8] } },
    { id: 'barrage', t0: 6, d: [.85, 2, .8], p: {} },
    { id: 'sweep', t0: 8.25, d: [1.15, 2.1, .9], p: {} },
  ];
  const make = Type => Object.assign(Object.create(Type.prototype), { moves: structuredClone(moves), dead: -1,
    hits: new Set(['2|ring|0|1', '6|barrel|1|0', '8.25|beam|0|2']), prevBt: 0,
    _hurtLocal(prev, bt, dt) { this.hurt = [prev, bt, dt]; }, fx: { draw() {} },
  });
  const old = make(before.LegacyBossHazards), next = make(BossHazards);
  const checks = new Set([-1, 0, 1, 20]);
  for (const move of moves) {
    const end = moveTimes(move).end, extra = move.id === 'slam' ? (HZ.ringMax - HZ.ringR0) / HZ.ringSpeed + move.p.rings.at(-1) : 0;
    for (const boundary of [move.t0, move.t0 + end, move.t0 + end + extra + .2, move.t0 + end + 4]) {
      for (const delta of [-Number.EPSILON * 16, 0, Number.EPSILON * 16]) checks.add(boundary + delta);
    }
  }
  for (const dead of [-1, 7.5]) for (const bt of [...checks].sort((a, b) => a - b)) {
    old.dead = next.dead = dead;
    assert.deepEqual(next.current(bt), old.current(bt));
    for (let i = 0; i < moves.length; i++) assert.equal(next._live(next.moves[i], bt), old._live(old.moves[i], bt));
  }
  old.moves[0].d[1] = next.moves[0].d[1] = 3;
  assert.equal(next._live(next.moves[0], 8), old._live(old.moves[0], 8), 'no cross-call clock cache');
  for (const bt of [...checks].sort((a, b) => a - b)) {
    old.update(.016, bt, { live: true }); next.update(.016, bt, { live: true });
    assert.deepEqual(next.moves, old.moves); assert.deepEqual(next.hits, old.hits);
    assert.deepEqual(next.hurt, old.hurt); assert.equal(next.prevBt, old.prevBt);
  }
});
