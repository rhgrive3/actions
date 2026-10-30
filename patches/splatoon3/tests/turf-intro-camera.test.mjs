import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { beginTurfIntro, turfIntroShot, TURF_INTRO_FRAMES } from '../runtime/turf-intro-camera.mjs';

async function setup(team = 0, rotation = 0) {
  const f = await fixture({ productionComposition: true,
    extraExports: "export { simulationAimCamera } from './patches/splatoon3/runtime/camera-aim-controls.mjs';" });
  const { THREE, G } = f, transform = p => p.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation);
  G.level = { spawnPads: [transform(new THREE.Vector3(0, 0, -20)), transform(new THREE.Vector3(0, 0, 20))] };
  const actors = [0, 1].flatMap(t => [0, 1, 2, 3].map(slot => ({ team: t, slot, alive: true,
    pos: transform(new THREE.Vector3((slot - 1.5) * 1.8, 4.5, t ? 20 : -20)),
    s3: { squidSpawn: { initial: true, phase: 'aim' } } })));
  const local = actors[team * 4], match = { actors, local, state: 'intro', stateT: 0, paused: false };
  G.match = match;
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.15, 6500), rig = new f.CameraRig(camera), calls = [];
  const game = { match, rig, _matchFlow: {}, _playMusic: x => calls.push(x), hud: {
    setVisible: x => calls.push(x), banner: x => calls.push(x) } };
  G.audio = { play: x => calls.push('audio:' + x) };
  beginTurfIntro(game, G, THREE);
  return { ...f, match, rig, camera, game, calls };
}
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('reference cuts occur at observed video frames; both local teams see friendly first', () => {
  for (const team of [0, 1]) {
    for (const [frame, name] of [[0, 'friendly'], [208, 'friendly'], [209, 'opponent'], [398, 'opponent'], [399, 'spawn'], [576, 'spawn']]) {
      const s = turfIntroShot(frame / 60, team);
      assert.equal(s.name, name);
      assert.equal(s.team, name === 'opponent' ? 1 - team : team);
    }
  }
});

test('actual composed CameraRig samples all intro frames identically at 30/60/120 Hz; pause does not drift', async () => {
  const f = await setup(), poses = new Map();
  const original = f.match.actors.map(a => a.pos.toArray());
  for (const hz of [30, 60, 120]) {
    const rows = [];
    for (let frame = 0; frame <= TURF_INTRO_FRAMES.go; frame++) {
      f.match.stateT = frame / 60; f.rig.update(1 / hz);
      rows.push([...f.camera.position.toArray(), ...f.camera.quaternion.toArray(), f.camera.fov]);
      assert.ok(rows.at(-1).every(Number.isFinite));
      assert.deepEqual(f.rig.gameCam.position.toArray(), f.camera.position.toArray());
    }
    poses.set(hz, rows);
  }
  assert.deepEqual(poses.get(30), poses.get(60)); assert.deepEqual(poses.get(60), poses.get(120));
  f.match.stateT = 2; f.rig.update(1 / 60); const position = f.camera.position.toArray(), quaternion = f.camera.quaternion.toArray();
  f.match.paused = true;
  for (let i = 0; i < 500; i++) f.rig.update(1 / 30);
  assert.deepEqual(f.camera.position.toArray(), position); assert.deepEqual(f.camera.quaternion.toArray(), quaternion);
  assert.deepEqual(f.match.actors.map(a => a.pos.toArray()), original, 'camera cannot move actors');
  assert.equal(f.calls.filter(x => x === 'ready').length, 1);
});

test('camera follows rotated arena axes and frames local Bravo before Alpha', async () => {
  const a = await setup(1), b = await setup(1, Math.PI / 2);
  for (const frame of [0, 100, 208, 209, 350, 399, 430, 456, 575]) {
    a.match.stateT = b.match.stateT = frame / 60;
    a.rig.update(1 / 60); b.rig.update(1 / 60);
    const expected = a.camera.position.clone().applyAxisAngle(new a.THREE.Vector3(0, 1, 0), Math.PI / 2);
    for (const axis of ['x', 'y', 'z']) close(b.camera.position[axis], expected[axis]);
    const target = frame < 209 ? a.match.actors[4].pos : frame < 399 ? a.match.actors[0].pos : null;
    if (target) assert.ok(Math.abs(a.camera.position.z - target.z) < 15);
  }
});

test('HUD is revealed on spawn cut and READY only once; initial launch hands camera back', async () => {
  const f = await setup();
  f.match.stateT = 398 / 60; f.rig.update(1 / 60); assert.deepEqual(f.calls, [false, 'opening']);
  f.match.stateT = 399 / 60; f.rig.update(1 / 60); assert.equal(f.calls.at(-1), true);
  f.match.stateT = 436 / 60; f.rig.update(1 / 60); assert.deepEqual(f.calls.slice(-2), ['ready', 'audio:ready']);
  f.match.stateT = 576 / 60; f.rig.update(1 / 60); const end = f.camera.position.toArray();
  f.match.state = 'playing'; f.match.stateT = 0; f.rig.follow(f.match.local, true); f.rig.update(1 / 60);
  assert.deepEqual(f.camera.position.toArray(), end, 'GO keeps the settled spawn view');
  let handedBack = false;
  f.rig._follow = () => { handedBack = true; };
  f.match.local.s3.squidSpawn.phase = 'flight'; f.rig.update(1 / 60);
  assert.equal(f.rig._turfIntro, null); assert.equal(handedBack, true); assert.equal(f.rig.blend.active, true);
});

test('abandoned match or flow cannot reveal HUD or replay a cinematic', async () => {
  for (const invalidate of [f => { f.game.match = {}; }, f => { f.game._matchFlow = {}; }, f => { f.match.state = 'results'; }]) {
    const f = await setup(); f.rig.mode = f.rig._prevMode = 'orbit'; f.rig._orbit = () => {};
    invalidate(f); f.match.stateT = 8; f.rig.update(1 / 60);
    assert.equal(f.rig._turfIntro, null); assert.deepEqual(f.calls, [false, 'opening']);
  }
});

test('actual composed Match starts GO on frame 578 and freezes its clock through pause', async () => {
  const f = await fixture({ productionComposition: true,
    extraExports: "export { Match } from './inkwave-public/src/game/match.js';" });
  const m = new f.Match({}); f.G.match = m; m.start();
  for (let i = 0; i < TURF_INTRO_FRAMES.go - 1; i++) m.update(1 / 60);
  assert.equal(m.state, 'intro');
  m.paused = true; for (let i = 0; i < 300; i++) m.update(1 / 60);
  assert.equal(m.state, 'intro');
  m.paused = false; m.update(1 / 60); assert.equal(m.state, 'playing');
});

test('opening spawn aim still permits the existing map camera', async () => {
  const f = await setup(); f.match.state = 'playing'; f.rig.follow(f.match.local, true);
  f.rig.mapOpen = true; let follow = 0, map = 0;
  f.rig._follow = () => { follow++; }; f.rig._diorama = () => { map++; };
  f.rig.update(1 / 60); assert.equal(follow, 1); assert.equal(map, 1);
  assert.ok(f.rig._turfIntro);
});

test('same-tick initial aim rotates the settled optical ray in place', async () => {
  const f = await setup(); f.match.state = 'playing'; f.rig.follow(f.match.local, true); f.rig.update(1 / 60);
  const position = f.camera.position.toArray(), direction = f.camera.getWorldDirection(new f.THREE.Vector3());
  f.rig.yaw += 0.2;
  const camera = f.simulationAimCamera({ rig: f.rig, a: f.match.local });
  for (const [i, axis] of ['x', 'y', 'z'].entries()) close(camera.position[axis], position[i]);
  assert.ok(camera.getWorldDirection(new f.THREE.Vector3()).distanceTo(direction) > 0.1);
});

test('existing Splashtags follow the filmed team and retire on the spawn cut', async () => {
  const f = await setup(1), el = { dataset: {}, removed: 0, remove() { this.removed++; } };
  f.game.hud._turfIntroLineup = { match: f.match, el };
  f.rig.update(0); assert.equal(el.dataset.team, '1');
  f.match.stateT = 209 / 60; f.rig.update(0); assert.equal(el.dataset.team, '0');
  assert.equal(el.removed, 0);
  f.match.stateT = 399 / 60; f.rig.update(0); assert.equal(el.removed, 1);
  assert.equal(f.game.hud._turfIntroLineup, null);
});
