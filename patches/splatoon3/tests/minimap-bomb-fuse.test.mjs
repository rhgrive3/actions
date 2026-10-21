// The minimap bomb halo must stay a valid (non-negative) arc radius for subs
// whose fuse is longer than the stock Splat Bomb's. Display only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const source = adaptBuildSource('src/game/minimap.js', fs.readFileSync(new URL('../../../inkwave-public/src/game/minimap.js', import.meta.url), 'utf8'));

test('production minimap clamps bomb fuse progress to the arc-safe range', () => {
  const line = source.split('\n').find(l => l.includes('const k = armed ?'));
  assert.ok(line, 'bomb progress line present in the composed minimap');
  const expression = line.trim().replace(/^const k = /, '').replace(/;$/, '');
  const radiusLine = source.split('\n').find(l => l.includes('(SUB.bomb.radius || 3) * s * (0.5 + 0.5 * k)'));
  assert.ok(radiusLine, 'halo radius still derives from k');
  const progress = new Function('armed', 'b', 'SUB', 'return ' + expression);
  const SUB = { bomb: { fuse: 1.2, radius: 3 } };
  for (const b of [
    { fuse: 4.5 },                       // catalogue sub, first-ground fuse
    { fuse: 4.5, s3FuseTotal: 5 },       // kit sub with its own total
    { fuse: 0 }, { fuse: 1.2 }, { fuse: 0.3, s3FuseTotal: 0.6 }, { fuse: 30 },
  ]) {
    const k = progress(true, b, SUB);
    assert.ok(k >= 0 && k <= 1, JSON.stringify(b) + ' -> ' + k);
    assert.ok(SUB.bomb.radius * 8 * (0.5 + 0.5 * k) >= 0);
  }
  assert.equal(progress(true, { fuse: 0.6 }, SUB), 0.5, 'stock bombs keep the stock curve');
  assert.equal(progress(true, { fuse: 1.25, s3FuseTotal: 5 }, SUB), 0.75, 'own total sets the curve');
  assert.equal(progress(false, { fuse: -1 }, SUB), 0);
});
