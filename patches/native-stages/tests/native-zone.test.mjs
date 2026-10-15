import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeZone } from '../runtime/native-zone.mjs';

function floor(width, depth, keep = () => true) {
  const nodes = [];
  for (let ix = -width; ix <= width; ix++) for (let iz = -depth; iz <= depth; iz++) {
    if (keep(ix, iz)) nodes.push({ id: nodes.length, x: ix, z: iz, y: 0, ix, iz });
  }
  return nodes;
}
const middle = { x: 0, y: 0, z: 0 };

test('a broad native floor supports a larger fixed zone with deterministic placement', () => {
  const nodes = floor(12, 10);
  const zone = nativeZone(nodes, middle);
  assert.deepEqual(zone, { center: [0, 0, 0], size: [13, 11], heightTolerance: 0.75 });
  assert.deepEqual(nativeZone([...nodes].reverse(), middle), zone);
  assert.ok(zone.size[0] * zone.size[1] > 36 * 3);
});

test('zone boundaries fit narrow floors and never include missing paint/nav cells', () => {
  const nodes = floor(2, 12, (x, z) => x !== 0 || z !== 0);
  const zone = nativeZone(nodes, middle);
  assert.ok(zone.size[0] <= 5);
  assert.ok(Math.abs(zone.center[2]) > zone.size[1] / 2,
    'the hole at the old center is outside the chosen rectangle');
  for (let x = zone.center[0] - (zone.size[0] - 1) / 2; x < zone.center[0] + zone.size[0] / 2; x++) {
    for (let z = zone.center[2] - (zone.size[1] - 1) / 2; z < zone.center[2] + zone.size[1] / 2; z++) {
      assert.ok(nodes.some(n => n.x === x && n.z === z));
    }
  }
});

test('a different-height bridge cannot fill holes in the zone floor', () => {
  const nodes = floor(10, 10);
  for (const node of nodes) if (node.ix === 0) node.y = 4;
  const zone = nativeZone(nodes, middle);
  assert.ok(Math.abs(zone.center[0]) > zone.size[0] / 2);
});

test('interior props do not shrink a broad zone but a floor probe still rejects void', () => {
  const nodes = floor(10, 10, (x, z) => x % 4 !== 0 || z % 4 !== 0);
  const zone = nativeZone(nodes, { x: 1, y: 0, z: 1 }, 1, () => true);
  assert.deepEqual(zone.size, [13, 11]);
  const narrow = nativeZone(floor(2, 12), middle, 1, (x, y, z) => Math.abs(x) <= 2);
  assert.ok(narrow.size[0] <= 5);
});
