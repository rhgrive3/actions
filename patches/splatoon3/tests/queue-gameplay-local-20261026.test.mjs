import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { ShooterMuzzleDroplets as Current } from '../runtime/shooter-muzzle-droplets.mjs';
import { ShooterMuzzleDroplets as Before } from './fixtures/queue-muzzle-before-20261026.mjs';
import { RankedWorld } from '../runtime/ranked/world.mjs';
import { createRainmakerPresentation } from '../runtime/ranked/rainmaker-model.mjs';
import { drinkEligible } from '../runtime/support-cooler.mjs';
import { stormRainContains, stormRainObjectContains } from '../runtime/storm-effects.mjs';

// The independent Before fixture is the complete source at PR #1878,
// dd90aa241aabd5f0b972cc3471386ba3d4da86dc, before any local queue changes.
function dropletsRun(Type, hz) {
  const drops = new Type(THREE), owner = { alive: true, weapon: { id: 'fixture' }, color: new THREE.Color(.1, .3, .7) };
  const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const pos = new THREE.Vector3(), dir = new THREE.Vector3(), axis = new THREE.Vector3(0, 0, 1);
  const frames = [];
  for (let frame = 0; frame < hz; frame++) {
    const time = frame / hz;
    if (frame < 3 || frame % 9 === 0) for (let birth = 0; birth < 35; birth++) {
      const seed = (frame * 17 + birth * 31) % 997 / 997;
      drops.observe({ type: 'shot', wid: 'shooter', owner, age: 0, seed, start: new THREE.Vector3(seed, 1, seed * 2),
        vel: new THREE.Vector3(birth % 2 ? 0 : 9, birth % 3 ? 2 : 0, birth % 5) }, time, null, null);
    }
    const cap = [0, 1, 2, 3, 17, 96][frame % 6], shape = new Float32Array(384), look = new Float32Array(384), petals = new Float32Array(192);
    const matrices = [], colors = [];
    const mesh = { setMatrixAt(i, m) { matrices[i] = [...m.elements]; }, setColorAt(i, c) { colors[i] = c.toArray(); } };
    const n = drops.append(time, mesh, shape, look, petals, 0, cap, matrix, q, s, pos, dir, axis);
    frames.push({ n, matrices, colors, shape: [...shape], look: [...look], petals: [...petals], count: drops.count, drawn: drops.drawn, emitted: drops.emitted });
    if (frame === Math.floor(hz / 2)) drops.clear();
  }
  return frames;
}
for (const hz of [30, 60, 120]) test(`cached muzzle phases preserve every emitted matrix and attribute at ${hz} Hz, with cap changes, overwrite and clear`, () => {
  assert.deepEqual(dropletsRun(Current, hz), dropletsRun(Before, hz));
});

test('Rainmaker checkpoint rings read passed[team] and choice[team], including reset and repeated frames', () => {
  const world = Object.create(RankedWorld.prototype);
  Object.assign(world, { mode: 'rainmaker', teamInk: [0x123456, 0xabcdef], match: { actors: [] },
    rainmaker: new THREE.Object3D(), rainmakerCarrier: new THREE.Object3D(),
    rainmakerShield: { scale: new THREE.Vector3(), material: { color: new THREE.Color() } },
    rainmakerCore: { material: { color: new THREE.Color() } }, rainmakerPresentation: { update() {} },
    rainmakerBarrier: { update() {} }, rainmakerAura: { update() {} },
    rainmakerMarkers: { checkpoints: [], goals: [] } });
  for (let team = 0; team < 2; team++) {
    for (let index = 0; index < 2; index++) world.rainmakerMarkers.checkpoints.push({ team, index, group: { userData: {} }, ring: { material: {} } });
    world.rainmakerMarkers.goals.push({ team, group: { userData: {} }, ring: { material: {} } });
  }
  for (const passed of [[false, false], [true, false], [true, true], [false, true], [false, false]]) {
    for (const choice of [[0, 1], [1, 0], [-1, -1]]) {
      const engine = { rule: { state: { checkpoint: { passed, choice, goalOpen: passed } } } };
      world._updateRainmaker(engine);
      const snapshot = world.rainmaker.userData.checkpointsPassed;
      assert.deepEqual(snapshot, passed); assert.notEqual(snapshot, passed);
      world._updateRainmaker(engine); assert.equal(world.rainmaker.userData.checkpointsPassed, snapshot);
      for (const marker of world.rainmakerMarkers.checkpoints) {
        const expected = passed[marker.team] && choice[marker.team] === marker.index;
        assert.equal(marker.group.userData.passed, expected);
        assert.equal(marker.ring.material.opacity, expected ? .28 : .9);
      }
    }
  }
});

test('Rainmaker emissive writes only on change and restores external material or color changes', () => {
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
  const model = createRainmakerPresentation(THREE, mesh);
  let writes = 0;
  const setHex = mesh.material.emissive.setHex;
  mesh.material.emissive.setHex = function(...args) { writes++; return setHex.apply(this, args); };
  model.update(null, .5); assert.equal(writes, 1);
  for (let i = 0; i < 30; i++) model.update(null, .5);
  assert.equal(writes, 1);
  model.update(null, 1); assert.equal(writes, 2); assert.equal(mesh.material.emissiveIntensity, .45);
  mesh.material.emissive.setRGB(1, 0, 0); model.update(null, 1); assert.equal(writes, 3);
  assert.equal(mesh.material.emissive.getHex(), 0xffdc5c);
  mesh.material = new THREE.MeshStandardMaterial(); model.update(null, 1);
  assert.equal(mesh.material.emissive.getHex(), 0xffdc5c); assert.equal(mesh.material.emissiveIntensity, .45);
  model.update(null, 0); assert.equal(mesh.material.emissive.getHex(), 0); assert.equal(mesh.material.emissiveIntensity, 0);
});

test('Tacticooler early vertical rejection preserves capsule edge, tolerance and nonfinite behavior', () => {
  const stand = { team: 0, pos: { x: 0, y: 0, z: 0 }, expires: 10 };
  for (const radius of [0, .25, .5]) for (const height of [0, 1.5, 2]) {
    const collider = { radius, height }, actualHeight = Math.max(radius * 2, height);
    for (const x of [0, 7, 7 + radius, 7 + radius + 1e-10, 100, Infinity, NaN])
      for (const y of [-5, -actualHeight, -actualHeight + radius, 0, 3, 3 + radius, 20, NaN]) {
        const actor = { alive: true, form: 'kid', team: 0, pos: { x, y, z: 0 } };
        const radial = Math.max(0, Math.hypot(x, 0) - 7);
        const vertical = Math.max(0, -(y + actualHeight - radius), y + radius - 3);
        const expected = Number.isFinite(x) && Number.isFinite(y) && radial * radial + vertical * vertical <= radius * radius + 1e-12;
        assert.equal(drinkEligible(actor, stand, 1, collider), expected, JSON.stringify({ x, y, radius, height }));
      }
  }
});

test('Storm spatial rejection skips the envelope while valid actor and object queries retain explicit scale behavior', () => {
  const cloud = { group: { position: { x: 0, y: 10, z: 0 } }, t: .4, dur: 8 };
  const actor = { alive: true, pos: { x: 0, y: 11, z: 0 } };
  const pow = Math.pow; let calls = 0;
  try {
    Math.pow = (...args) => { calls++; return pow(...args); };
    assert.equal(stormRainContains(cloud, actor, 5), false);
    assert.equal(stormRainObjectContains(cloud, actor, 5), false); assert.equal(calls, 0);
    actor.pos.y = 5;
    assert.equal(stormRainContains(cloud, actor, 5), true); assert.equal(calls, 1);
    assert.equal(stormRainObjectContains(cloud, actor, 5), true); assert.equal(calls, 2);
    actor.pos.x = 2;
    assert.equal(stormRainContains(cloud, actor, 5, .2), false);
    assert.equal(stormRainObjectContains(cloud, actor, 5, .2), false); assert.equal(calls, 2);
  } finally { Math.pow = pow; }
});
