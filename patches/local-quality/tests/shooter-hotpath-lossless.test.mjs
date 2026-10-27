import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptCollisionHotpath } from '../collision-hotpath-adapter.mjs';
import { adaptLosslessShooterHud } from '../shooter-hud-hotpath-adapter.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

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


test('full production HUD composition retains Splatoon 3 tank and reuses exact map pixel strings', () => {
  const output = adaptBuildSource('src/ui/hud.js', originalHud);
  assert.match(output, /const px1 = px\.toFixed\(1\), py1 = py\.toFixed\(1\);/);
  assert.ok(output.includes('translate3d(${px1}px,${py1}px,0)'));
  assert.ok(output.includes('_s3PaintTank('), 'the original S3 tank should remain authoritative');
  assert.doesNotMatch(output, /depthGradient = g2/, 'never reinstate replaced legacy ink tank rendering');
});

test('final HUD map-marker coordinates are byte-identical including dynamic heading', () => {
  const endOfQueue = `
    const raw = d._mapKey || (d._mapKey = {}), self = !!p.isSelf, yaw = self ? (+p.yaw || 0) : 0, alive = p.alive !== false;
      const key = \`\${px.toFixed(1)}|\${py.toFixed(1)}|\${yaw.toFixed(2)}|\${p.alive === false ? 0 : 1}|\${p.isSelf ? 1 : 0}|\${p.team}\`;
      d.style.transform = \`translate3d(\${px.toFixed(1)}px,\${py.toFixed(1)}px,0) rotate(\${p.isSelf ? (+p.yaw || 0).toFixed(3) : 0}rad)\`;
  `;
  const compiled = adaptLosslessShooterHud('src/ui/hud.js', endOfQueue, once);
  assert.ok(compiled.includes('const px1 = px.toFixed(1), py1 = py.toFixed(1);'));
  assert.throws(() => adaptLosslessShooterHud('src/ui/hud.js', compiled, once), /non-unique source anchor/);
  let seed = 0xabcdef11;
  const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  for(let i=0;i<1800;i++) {
    const px = i % 53 === 0 ? -0 : (rand()-.5)*2400;
    const py = (rand()-.5)*1000;
    const p={yaw:(rand()-.5)*Math.PI*2,isSelf:!!(i%3),alive:!!(i%2),team:i%2};
    const self=!!p.isSelf, yaw=self?(+p.yaw||0):0;
    const oldKey = `${px.toFixed(1)}|${py.toFixed(1)}|${yaw.toFixed(2)}|${p.alive===false?0:1}|${p.isSelf?1:0}|${p.team}`;
    const oldTransform = `translate3d(${px.toFixed(1)}px,${py.toFixed(1)}px,0) rotate(${p.isSelf?(+p.yaw||0).toFixed(3):0}rad)`;
    const px1=px.toFixed(1),py1=py.toFixed(1);
    const newKey = `${px1}|${py1}|${yaw.toFixed(2)}|${p.alive===false?0:1}|${p.isSelf?1:0}|${p.team}`;
    const newTransform = `translate3d(${px1}px,${py1}px,0) rotate(${p.isSelf?(+p.yaw||0).toFixed(3):0}rad)`;
    assert.equal(oldKey,newKey);
    assert.equal(oldTransform,newTransform);
  }
});
