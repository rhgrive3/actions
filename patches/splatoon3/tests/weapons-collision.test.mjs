import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { capsuleEntry, roundedBoxEntry, sweptWorldHit } from '../runtime/weapons-collision.mjs';

function vec(x = 0, y = 0, z = 0) {
  return {
    x, y, z,
    set(nx, ny, nz) { this.x = nx; this.y = ny; this.z = nz; return this; },
    copy(v) { return this.set(v.x, v.y, v.z); },
    addScaledVector(v, scale) {
      this.x += v.x * scale; this.y += v.y * scale; this.z += v.z * scale;
      return this;
    },
  };
}

function block(centerX = 0, grate = false) {
  return {
    solid: true, grate, center: vec(centerX),
    axes: [vec(1), vec(0, 1), vec(0, 0, 1)],
    half: { x: 1, y: 1, z: 1 }, faces: [10, 11, 12, 13, 14, 15],
  };
}

function world(blocks, ids) {
  const hit = { hit: false, dist: 0, block: -1, face: -1, normal: vec(), point: vec() };
  const physics = {
    _wfSweepIds: ids,
    level: { blocks, faces: [], queryBlocks() { return ids; } },
  };
  return { physics, hit };
}

test('rounded-box, capsule and world contacts keep the established first-contact geometry', () => {
  assert.equal(roundedBoxEntry([-2, 0, 0], [4, 0, 0], [1, 1, 1], 0.5), 0.125);
  assert.equal(roundedBoxEntry([-3, 0, 0], [3, 0, 0], [1, 1, 1], 0, 1), 0.5);
  assert.equal(capsuleEntry(vec(-2, 0.9), vec(2, 0.9), vec(), 0.4, 1.8, 0.1), 0.375);

  const { physics, hit } = world([block()], [0]);
  assert.equal(sweptWorldHit(physics, vec(-2), vec(2), 0.5, 0.5, hit), hit);
  assert.equal(hit.hit, true);
  assert.equal(hit.dist, 0.5);
  assert.equal(hit.block, 0);
  assert.equal(hit.face, 11);
  assert.deepEqual([hit.point.x, hit.point.y, hit.point.z], [-1, 0, 0]);
  assert.deepEqual([hit.normal.x, hit.normal.y, hit.normal.z], [-1, 0, 0]);
});

test('world contacts keep candidate ordering, grate filtering and initial-overlap normals', () => {
  const near = block(-1.5), far = block(0);
  const { physics, hit } = world([near, far], [1, 0]);
  sweptWorldHit(physics, vec(-4), vec(4), 0.1, 0.1, hit);
  assert.equal(hit.block, 0, 'near contact wins even when the broad-phase list is reversed');

  near.grate = true;
  sweptWorldHit(physics, vec(-4), vec(4), 0.1, 0.1, hit);
  assert.equal(hit.block, 1, 'skipGrates still excludes grate geometry');

  const overlap = world([block()], [0]);
  sweptWorldHit(overlap.physics, vec(0), vec(0.25), 0.1, 0.1, overlap.hit);
  assert.equal(overlap.hit.hit, true);
  assert.deepEqual([overlap.hit.normal.x, overlap.hit.normal.y, overlap.hit.normal.z], [-1, 0, 0]);
});

test('warmed collision queries do not call array allocation methods or construct per-query collections', () => {
  const { physics, hit } = world([block()], [0]);
  const from = vec(-2), to = vec(2);
  for (let i = 0; i < 100; i++) sweptWorldHit(physics, from, to, 0.5, 0.5, hit);

  let maps = 0, sorts = 0, pushes = 0;
  const map = Array.prototype.map, sort = Array.prototype.sort, push = Array.prototype.push;
  Array.prototype.map = function (...args) { maps++; return map.apply(this, args); };
  Array.prototype.sort = function (...args) { sorts++; return sort.apply(this, args); };
  Array.prototype.push = function (...args) { pushes++; return push.apply(this, args); };
  try {
    for (let i = 0; i < 200; i++) {
      sweptWorldHit(physics, from, to, 0.5, 0.5, hit);
      capsuleEntry(from, to, vec(), 0.4, 1.8, 0.1);
    }
  } finally {
    Array.prototype.map = map;
    Array.prototype.sort = sort;
    Array.prototype.push = push;
  }
  assert.equal(maps, 0);
  assert.equal(sorts, 0);
  assert.equal(pushes, 0);

  const source = fs.readFileSync(new URL('../runtime/weapons-collision.mjs', import.meta.url), 'utf8')
    .replace('physics._wfSweepIds = []', 'physics._wfSweepIds = SCRATCH');
  assert.doesNotMatch(source, /=\s*\[[^\]]*\]/s, 'hot path should not create array literals');
  assert.doesNotMatch(source, /=\s*\{[^}]*\}/s, 'hot path should not create object literals');
});
