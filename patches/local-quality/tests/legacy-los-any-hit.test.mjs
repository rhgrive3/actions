import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const source = fs.readFileSync(new URL('../../../inkwave-public/src/game/physics.js', import.meta.url), 'utf8');
const load = text => new Function('THREE', text.replace(/^import .*;$/gm, '').replace(/\bexport /g, '') + '\nreturn { Physics, Hit };')(THREE);
const engines = [['source', load(source)], ['composed', load(adaptBuildSource('src/game/physics.js', source))]];
let seed = 0x478acd;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

function box(id, x, y, z, yaw, grate = false) {
  const center = new THREE.Vector3(x, y, z), half = new THREE.Vector3(.3 + random() * 2, .2 + random() * 2, .3 + random() * 2);
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const axes = [new THREE.Vector3(c, 0, s), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-s, 0, c)];
  const bounds = new THREE.Box3();
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    bounds.expandByPoint(center.clone().addScaledVector(axes[0], half.x * sx).addScaledVector(axes[1], half.y * sy).addScaledVector(axes[2], half.z * sz));
  }
  return { id, center, half, axes, solid: true, grate, aabbMin: bounds.min, aabbMax: bounds.max, faces: Array(6).fill(id) };
}
function level(blocks) {
  return { blocks, faces: blocks.map(b => ({ origin: b.center, u: b.axes[0], v: b.axes[2] })),
    queryBlocks(_x0, _z0, _x1, _z1, out) { out.length = 0; for (const b of blocks) out.push(b.id); return out; } };
}

for (const [name, { Physics, Hit }] of engines) {
  test(`${name}: Boolean LOS matches the full nearest ray including grates and inside origins`, () => {
    const blocks = Array.from({ length: 48 }, (_, id) => box(id, random() * 30 - 15, random() * 8 - 3, random() * 30 - 15, random() * Math.PI, id % 7 === 0));
    const physics = new Physics(level(blocks)), hit = new Hit();
    const pairs = Array.from({ length: 1200 }, () => [new THREE.Vector3(random() * 36 - 18, random() * 10 - 4, random() * 36 - 18), new THREE.Vector3(random() * 36 - 18, random() * 10 - 4, random() * 36 - 18)]);
    for (const b of blocks) pairs.push([b.center.clone(), b.center.clone().add(new THREE.Vector3(15, 0, 0))]);
    const origin = new THREE.Vector3();
    for (const distance of [0, .00001, .0001, .01, .05, .050001]) pairs.push([origin.clone(), new THREE.Vector3(distance, 0, 0)]);
    for (const [from, to] of pairs) {
      const dir = to.clone().sub(from), length = dir.length();
      const expected = length < 1e-4 || !physics.raycast(from, dir.multiplyScalar(1 / length), length - .05, hit, true).hit;
      assert.equal(physics.los(from, to), expected);
    }
  });

  test(`${name}: accepted occluder stops candidate traversal and does not compute point/normal/UV`, () => {
    const blocks = Array.from({ length: 64 }, (_, id) => box(id, 3 + id, 0, 0, 0));
    let visits = 0;
    for (const b of blocks) Object.defineProperty(b, 'solid', { get() { visits++; return true; } });
    const physics = new Physics(level(blocks)), origin = new THREE.Vector3(), end = new THREE.Vector3(100, 0, 0);
    const complete = physics.raycast(origin, new THREE.Vector3(1, 0, 0), 99.95, new Hit(), true);
    assert.equal(complete.hit, true);
    assert.equal(visits, 64);
    visits = 0;
    physics._losHit = new Hit();
    physics._losHit.point.copy = physics._losHit.normal.copy = () => { throw Error('Boolean LOS must not fill unused vectors'); };
    assert.equal(physics.los(origin, end), false);
    assert.equal(visits, 1);
    assert.equal(complete.block, 0);
    assert.ok(Number.isFinite(complete.u + complete.v), 'ordinary ray still computes its complete result');
  });

  test(`${name}: five-argument overrides retain their own ray result`, () => {
    class CustomPhysics extends Physics {
      raycast(origin, direction, max, out, skipGrates) {
        assert.equal(skipGrates, true);
        out.hit = direction.x > 0;
        return out;
      }
    }
    const physics = new CustomPhysics(level([]));
    assert.equal(physics.los(new THREE.Vector3(), new THREE.Vector3(1, 0, 0)), false);
    assert.equal(physics.los(new THREE.Vector3(), new THREE.Vector3(-1, 0, 0)), true);
  });
}
