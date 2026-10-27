import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const raw = fs.readFileSync(new URL('../../../inkwave-public/src/world/level.js', import.meta.url), 'utf8');
const composed = adaptBuildSource('src/world/level.js', raw);
function load(source) {
  const plain = source.replace(/^import .*;\s*$/gm, '').replace(/\bexport /g, '');
  return new Function('THREE', plain + '\nreturn Level;')({ Vector3: class {} });
}
function fixture(Level, stamp = 0xffffffff) {
  const level = Object.create(Level.prototype);
  Object.assign(level, {
    hx0: 0, hz0: 0, hashCell: 4, hw: 2, hd: 1,
    hash: [[0], [1]], blocks: [{ solid: true }, { solid: true }],
    blockStamp: new Uint32Array([13, 1]), _stamp: stamp,
    pointInBlock: () => true,
  });
  return level;
}

test('production point probe wraps the shared stamp before subsequent block queries', () => {
  const level = fixture(load(composed));
  assert.equal(level.pointInside({ x: 2, y: 0, z: 2 }), true);
  assert.deepEqual(level.queryBlocks(5, 1, 7, 3, []), [1],
    'a stale generation in another cell must not hide its collision block');
  assert.equal(level._stamp, 2);
});

test('point/query interleaving preserves reference ordering and complete stamp state across wrap', () => {
  const Native = load(raw), Optimized = load(composed);
  for (const initial of [0xfffffffd, 0xfffffffe, 0xffffffff]) {
    const a = fixture(Native, initial), b = fixture(Optimized, initial);
    for (let i = 0; i < 16; i++) {
      if (i % 3 === 0) {
        assert.deepEqual(b.queryBlocks(1, 1, 7, 3, []), a.queryBlocks(1, 1, 7, 3, []));
      } else {
        const p = { x: i % 2 ? 2 : 6, y: 0, z: 2 };
        assert.equal(b.pointInside(p, 0, i % 5 === 0 ? 0 : -1), a.pointInside(p, 0, i % 5 === 0 ? 0 : -1));
      }
      assert.equal(b._stamp, a._stamp);
      assert.deepEqual(b.blockStamp, a.blockStamp);
    }
  }
});

test('regression control reproduces omitted collision candidate with the former fast path', () => {
  const marker = 'const ids = this.hash[z0 * this.hw + x0], st = this._nextQueryStamp();';
  assert.ok(composed.includes(marker));
  const old = load(composed.replace(marker, 'const ids = this.hash[z0 * this.hw + x0], st = ++this._stamp;'));
  const level = fixture(old);
  level.pointInside({ x: 2, y: 0, z: 2 });
  assert.deepEqual(level.queryBlocks(5, 1, 7, 3, []), [], 'negative control must reproduce the bug');
});
