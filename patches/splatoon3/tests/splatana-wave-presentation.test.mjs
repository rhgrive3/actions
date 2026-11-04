import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { drawSplatanaWaves, SPLATANA_WAVE } from '../runtime/splatana-wave-presentation.mjs';

function projectile(seed = 0.4) {
  return { s3Shape: 'slash-h', delay: 0, seed, age: 0.017, pos: new THREE.Vector3(0, 1, 3.3), start: new THREE.Vector3(0, 1, 0.5),
    vel: new THREE.Vector3(0, 0, 198), owner: { color: new THREE.Color(1, 0.8, 0), isLocal: true }, catalog: null, wid: 's3-saber-lite' };
}

test('a flying wave draws smear crescents and only reads its projectile', () => {
  const drops = [], G = { time: 1, fx: { drop: (...a) => drops.push(a) } };
  const p = projectile(), system = { list: [p], scene: new THREE.Scene() };
  const before = JSON.stringify([p.pos, p.vel, p.age]);
  assert.equal(drawSplatanaWaves(system, THREE, G), SPLATANA_WAVE.smearCopies);
  G.time += 1 / 60; p.pos.z += 3.3; p.age += 1 / 60;
  assert.equal(drawSplatanaWaves(system, THREE, G), SPLATANA_WAVE.smearCopies);
  assert.equal(JSON.stringify([p.pos, p.vel, p.age]), JSON.stringify([new THREE.Vector3(0, 1, 6.6), p.vel, 0.017 + 1 / 60]));
  assert.ok(drops.length >= SPLATANA_WAVE.flightSpray, 'flight spray');
  for (const [, v, , o] of drops) { assert.ok(v.length() < 12, 'droplets stay near the wave'); assert.equal(o.paint, undefined, 'visual-only droplets'); }
});

test('a retired wave dissolves forward and is gone after the dissolve window', () => {
  const G = { time: 1, fx: { drop() {} } };
  const p = projectile(), system = { list: [p], scene: new THREE.Scene() };
  drawSplatanaWaves(system, THREE, G);
  system.list = [];
  G.time += 1 / 60;
  assert.equal(drawSplatanaWaves(system, THREE, G), 1);
  const W = system._splatanaWaves, z0 = W.dissolving[0].pos.z;
  G.time += 1 / 60; drawSplatanaWaves(system, THREE, G);
  assert.ok(W.dissolving[0].pos.z > z0, 'keeps travelling while it breaks up');
  for (let i = 0; i < 20; i++) { G.time += 1 / 60; drawSplatanaWaves(system, THREE, G); }
  assert.equal(W.dissolving.length, 0);
  assert.equal(W.meshH.count, 0); assert.equal(W.meshH.visible, false);
});

test('nothing is created until a Splatana wave exists', () => {
  const system = { list: [{ s3Shape: 'shot', owner: { color: new THREE.Color() } }], scene: new THREE.Scene() };
  assert.equal(drawSplatanaWaves(system, THREE, { time: 0 }), 0);
  assert.equal(system._splatanaWaves, undefined);
});
