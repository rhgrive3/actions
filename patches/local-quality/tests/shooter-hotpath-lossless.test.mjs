import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptCollisionHotpath } from '../collision-hotpath-adapter.mjs';
import { adaptLosslessShooterHud } from '../shooter-hud-hotpath-adapter.mjs';

const read = path => fs.readFileSync(new URL('../../../' + path, import.meta.url), 'utf8');
function once(source, before, after, label) {
  const i = source.indexOf(before);
  if (i < 0 || source.indexOf(before, i + before.length) >= 0)
    throw Error('non-unique source anchor: ' + label);
  return source.slice(0, i) + after + source.slice(i + before.length);
}
const originalLevel = read('inkwave-public/src/world/level.js');
const originalHud = read('inkwave-public/src/ui/hud.js');

function buildQuery(source) {
  const start = source.indexOf('  queryBlocks(');
  const end = source.indexOf('\n  pointInBlock(', start);
  assert.ok(start > 0 && end > start, 'queryBlocks method boundary');
  const method = source.slice(start, end);
  class Base {
    constructor(hash, width, stamp) {
      this.hash = hash; this.hw = width; this.hd = hash.length / width;
      this.hx0 = this.hz0 = 0; this.hashCell = 1;
      this._stamp = stamp;
      this.blockStamp = new Uint32Array(32);
    }
    _nextQueryStamp() {
      let next = (this._stamp + 1) >>> 0;
      if (next === 0) { this.blockStamp.fill(0); next = 1; }
      this._stamp = next;
      return next;
    }
    _hxi(x) { return Math.max(0, Math.min(this.hw - 1, Math.floor((x - this.hx0) / this.hashCell))); }
    _hzi(z) { return Math.max(0, Math.min(this.hd - 1, Math.floor((z - this.hz0) / this.hashCell))); }
  }
  return new Function('Base', 'return class Query extends Base {' + method + '\n}')(Base);
}

test('single-cell Level queries preserve order, dedup, stamps and overflow with mixed cells', () => {
  const transformed = adaptCollisionHotpath('src/world/level.js', originalLevel, once);
  assert.match(transformed, /if \(x0 === x1 && z0 === z1\) \{/);
  const Old = buildQuery(originalLevel), Fast = buildQuery(transformed);
  const hash = Array.from({ length: 49 }, (_, i) => {
    const a = [i % 17, (i * 3) % 17, (i * 7) % 17];
    if (i % 3 === 0) a.push(a[1]); // even manually duplicated hash entries must dedup
    return a;
  });
  let rng = 0x12345678;
  const rand = () => ((rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0) / 2 ** 32) * 10 - 1.5;
  for (const initial of [0, 0xfffffffe, 0xffffffff]) {
    const old = new Old(hash, 7, initial), fast = new Fast(hash, 7, initial);
    for (let i = 0; i < 1200; i++) {
      const x = rand(), z = rand();
      const w = i % 3 ? (i % 7 === 0 ? -0.5 : 0.01) : rand();
      const h = i % 4 ? 0.01 : rand();
      const a = old.queryBlocks(x, z, x + w, z + h, [999]);
      const b = fast.queryBlocks(x, z, x + w, z + h, [999]);
      assert.deepEqual(b, a, 'candidate order for query ' + i);
      assert.equal(fast._stamp, old._stamp, 'stamp counter at ' + i);
      assert.deepEqual(fast.blockStamp, old.blockStamp, 'dedup stamp writes at ' + i);
    }
  }
  assert.throws(() => adaptCollisionHotpath('src/world/level.js', transformed, once),
    /collision hotpath|already adapted|non-unique source anchor/);
});

test('map layout scalars and reused formatted positions are byte-identical', () => {
  const compiled = adaptLosslessShooterHud('src/ui/hud.js', originalHud, once);
  assert.ok(!compiled.includes('const fit = (sz) =>'));
  assert.ok(compiled.includes('const w0 = wide ? small : small * asp'));
  assert.ok(compiled.includes('translate3d(${px1}px,${py1}px,0)'));
  for (let i = 0; i < 1800; i++) {
    const W = 320 + (i % 1501), H = 240 + ((i * 17) % 957);
    const asp = (i % 13 === 0 ? 1 : i % 2 ? .37 : 3.7);
    const u = Math.min(W / 100, (H * 1.7778) / 100);
    const fit = sz => asp >= 1 ? [sz, sz / asp] : [sz * asp, sz];
    const [w0, h0] = fit(14.5 * u), [w1, h1] = fit(Math.min(H * .78, W * .6));
    const small = 14.5 * u, large = Math.min(H * .78, W * .6), wide = asp >= 1;
    const nw0 = wide ? small : small * asp, nh0 = wide ? small / asp : small;
    const nw1 = wide ? large : large * asp, nh1 = wide ? large / asp : large;
    assert.deepEqual([nw0, nh0, nw1, nh1], [w0, h0, w1, h1]);
    const px = (i * 13.37) % nw0, py = (i * 3.14) % nh1;
    const key = `${px.toFixed(1)}|${py.toFixed(1)}|${(i / 100).toFixed(2)}`;
    const px1 = px.toFixed(1), py1 = py.toFixed(1);
    assert.equal(`${px1}|${py1}|${(i / 100).toFixed(2)}`, key);
  }
  assert.throws(() => adaptLosslessShooterHud('src/ui/hud.js', compiled, once),
    /lossless shooter HUD|non-unique source anchor/);
});

test('CanvasGradient cache reuses only identical context, endpoints and palette; draws unchanged', () => {
  const transformed = adaptLosslessShooterHud('src/ui/hud.js', originalHud, once);
  const begin = transformed.indexOf('    if (T2.depthCtx !== c');
  const end = transformed.indexOf('    // bubbles', begin);
  assert.ok(begin > 0 && end > begin);
  const render = new Function('T2', 'c', 'lvl', 'H', 'cDeep', transformed.slice(begin, end));
  function ctx() {
    const made = [], filled = [];
    const c = {
      createLinearGradient(...coords) {
        const g = { coords, stops: [], addColorStop(p, value) { this.stops.push([p, value]); } };
        made.push(g); return g;
      },
      fill() { filled.push(JSON.stringify([this.fillStyle.coords, this.fillStyle.stops])); },
    };
    return {c, made, filled};
  }
  const first = ctx(), other = ctx(), state = {};
  const scenarios = [
    [first, 12, 128, '#332211'], [first, 12, 128, '#332211'],
    [first, 12.001, 128, '#332211'], [first, 12.001, 128, '#332211'],
    [first, 12.001, 130, '#332211'], [first, 12.001, 130, '#112233'],
    [other, 12.001, 130, '#112233'], [other, 12.001, 130, '#112233'],
  ];
  for (const [obj, level, h, color] of scenarios) {
    const before = obj.made.length;
    render(state, obj.c, level, h, color);
    const expected = JSON.stringify([[0, level, 0, h], [
      [0, 'rgba(255,255,255,.18)'], [.15, 'rgba(255,255,255,0)'], [1, color + '66'],
    ]]);
    assert.equal(obj.filled.at(-1), expected);
    const identical = obj === scenarios[Math.max(0, obj.filled.length === 1 ? 0 : 1)]?.[0];
    assert.ok(obj.made.length >= before && obj.made.length <= before + 1);
  }
  assert.equal(first.made.length, 4, 'same frame gradients are never regenerated');
  assert.equal(other.made.length, 1, 'a new Canvas context invalidates the cache');
});
