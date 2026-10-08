import test from 'node:test';
import assert from 'node:assert/strict';
import { offscreenCharacterRuntime } from './offscreen-character-fixture.mjs';

const DT = 1 / 60;
const IDLE_MUZZLE_TOLERANCE = 1e-4;

function environment(api) {
  const { THREE, G, Character } = api;
  const scene = new THREE.Scene();
  G.scene = scene;
  G.teamColors = ['#2df', '#f3a'];
  G.match = null;
  const rays = { count: 0 };
  G.physics = {
    raycast(origin, direction, distance, hit) {
      rays.count++;
      hit.hit = true;
      hit.point.set(origin.x, 0, origin.z);
      hit.normal.set(0, 1, 0);
      return hit;
    },
  };
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
  camera.position.set(0, 1.6, -5);
  camera.lookAt(0, 1.2, 0);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  G.camera = camera;
  G.rig = { gameCam: camera };
  const renderer = {
    info: { render: { frame: 0 } },
    xr: { isPresenting: false },
    getRenderTarget: () => null,
    getPixelRatio: () => 1,
    getSize: out => out.set(1280, 720),
  };
  const cameraPresenter = new Character({ name: 'main camera presenter', weapon: 'shooter' });
  scene.add(cameraPresenter.root);
  const renderCamera = () => {
    renderer.info.render.frame++;
    camera.updateMatrixWorld(true);
    cameraPresenter._camHook(renderer, scene, camera);
  };
  renderCamera();
  return {
    THREE, G, scene, camera, renderer, rays, renderCamera,
    dispose() {
      cameraPresenter.dispose();
      G.scene = null;
      G.camera = null;
      G.rig = null;
      G.physics = null;
      G.match = null;
    },
  };
}

function makeRemoteActor(api, env, { name, weapon = 'shooter', x = 80, z = 0, speed = 4, onEvent = () => {} }) {
  const { THREE, Character, Actor } = api;
  const character = new Character({
    name, weapon, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 },
  });
  character.onEvent = onEvent;
  env.scene.add(character.root);
  let firing = false;
  const actor = Object.create(Actor.prototype);
  Object.assign(actor, {
    remote: true, isLocal: false, isBot: false, alive: true, team: 0, form: 'kid',
    pos: new THREE.Vector3(x, 0, z), vel: new THREE.Vector3(0, 0, speed),
    yaw: 0, aimPitch: 0.22, grounded: true, smoothY: 0, smoothYV: 0,
    hurtFlash: 0, hp: 100, invuln: 0, ink: 100, specialActive: null,
    submerged: false, climbing: false, character, anim: { localMove: { x: 0, z: 1 } },
    weaponRunner: {
      firingPose: () => firing,
      charge: 0,
      rolling: false,
      aimingSub: false,
      busy: () => firing,
    },
    specialFrac: () => 0,
    _events() {},
  });
  return {
    actor,
    character,
    setFiring(value) { firing = !!value; },
  };
}

function makeUnculledActor(api, env, options) {
  const result = makeRemoteActor(api, env, options);
  result.actor.isLocal = true;
  return result;
}

function countPoseWork(character) {
  const counts = { feetUpdates: 0, groundPathFrames: 0, build: 0, apply: 0 };
  for (const [method, key] of [['_updateFeet', 'feet'], ['_buildPose', 'build'], ['_applyPose', 'apply']]) {
    const original = character[method];
    character[method] = function countExecutedPose(dt, state) {
      if (key === 'feet') {
        counts.feetUpdates++;
        if (!this._iwOffscreenSkipGround) counts.groundPathFrames++;
      } else if (!this._iwOffscreenSkipPose) counts[key]++;
      return original.call(this, dt, state);
    };
  }
  return counts;
}

function advanceActor(actor, dt = DT) {
  actor._finishFrame(dt);
}

function assertSameOrigin(THREE, gated, reference, getter, label, maxError = 1e-6) {
  const actual = new THREE.Vector3(), expected = new THREE.Vector3();
  gated[getter[0]](actual, ...(getter.slice(1)));
  reference[getter[0]](expected, ...(getter.slice(1)));
  const error = actual.distanceTo(expected);
  assert.ok(error <= maxError, `${label} world-origin error ${error}: ${actual.toArray()} vs ${expected.toArray()}`);
  return actual.toArray();
}

test('six-layer native gate skips distant off-frustum presentation and catches up for reentry/shadows', async () => {
  const api = await offscreenCharacterRuntime();
  const env = environment(api);
  const footstep = { count: 0 };
  const far = makeRemoteActor(api, env, {
    name: 'far offscreen remote',
    x: 80,
    speed: 0,
    onEvent(name) { if (name === 'footstep') footstep.count++; },
  });
  const unculled = makeUnculledActor(api, env, { name: 'unculled far control', x: 80, speed: 0 });
  advanceActor(far.actor);
  advanceActor(unculled.actor);
  const counts = countPoseWork(far.character);
  const unculledCounts = countPoseWork(unculled.character);
  env.rays.count = 0;
  const danceStart = far.character.danceT;
  far.character.setDance('victory');
  unculled.character.setDance('victory');
  let unculledRaycasts = 0;
  let offscreenRaycasts = 0;

  for (let frame = 1; frame <= 120; frame++) {
    env.renderCamera();
    env.rays.count = 0;
    advanceActor(far.actor);
    offscreenRaycasts += env.rays.count;
    assert.equal(env.rays.count, 0, 'offscreen feet keep their event cadence without physics ground queries');
    env.rays.count = 0;
    advanceActor(unculled.actor);
    unculledRaycasts += env.rays.count;
  }

  const offscreen = { ...counts, raycasts: offscreenRaycasts, footsteps: footstep.count };
  assert.equal(counts.feetUpdates, 120, 'offscreen gait and footstep events stay active');
  assert.equal(counts.groundPathFrames, 0, 'far idle ground updates use the no-ray path');
  assert.ok(counts.build >= 10 && counts.build < 30, 'pose refreshes stay below one quarter of full cadence');
  assert.equal(counts.apply, counts.build, 'pose and bone application share the bounded refresh cadence');
  assert.deepEqual(unculledCounts, { feetUpdates: 120, groundPathFrames: 120, build: 120, apply: 120 });
  assert.ok(Math.abs(far.character.danceT - danceStart - 2) < 1e-8, 'dance clock advances while pose application is skipped');
  assert.equal(far.character.root.visible, true);
  assert.equal(far.character.root.parent.visible, true);

  let shadowMesh = null;
  far.character.root.traverse((object) => {
    if (!shadowMesh && typeof object.onBeforeShadow === 'function') shadowMesh = object;
  });
  assert.ok(shadowMesh, 'Character owns a shadow callback');
  shadowMesh.onBeforeShadow(env.renderer, env.scene, env.camera, env.camera, shadowMesh.geometry);
  assert.equal(far.character._iwOffscreenPoseStale, false);
  assert.ok(counts.build > 0 && counts.apply > 0, 'shadow submission restores the current pose');

  far.character.setDance(null);
  env.renderCamera();
  advanceActor(far.actor);
  assert.equal(far.character._iwOffscreenPoseStale, true, 'far pose can be deferred again');
  far.actor.pos.set(0, 0, 40);
  env.renderCamera();
  advanceActor(far.actor);
  assert.equal(far.character._iwOffscreenPoseStale, false, 'visible reentry applies this frame pose');
  assert.equal(far.character.feetValid, true);
  assert.equal(far.character._headSet, true);
  const visible = { ...counts, raycasts: env.rays.count };

  const nearFootsteps = { count: 0 };
  const near = makeRemoteActor(api, env, {
    name: 'near offscreen remote',
    x: 10,
    onEvent(name) { if (name === 'footstep') nearFootsteps.count++; },
  });
  advanceActor(near.actor);
  const nearCounts = countPoseWork(near.character);
  env.rays.count = 0;
  for (let frame = 1; frame <= 120; frame++) {
    env.renderCamera();
    near.actor.pos.z = 4 * frame / 60;
    advanceActor(near.actor);
  }
  assert.ok(nearCounts.feetUpdates >= 120 && nearCounts.groundPathFrames >= 120
    && nearCounts.build >= 120 && nearCounts.apply >= 120,
    'near offscreen actors keep footsteps and the complete presentation path');
  assert.ok(env.rays.count > 0);
  assert.ok(nearFootsteps.count > 0, 'near footstep events remain live');

  console.log('native presentation counters', JSON.stringify({
    offscreen, unculledOffscreen: { ...unculledCounts, raycasts: unculledRaycasts }, visible,
    near: { ...nearCounts, raycasts: env.rays.count, footsteps: nearFootsteps.count },
  }));
  far.character.dispose();
  unculled.character.dispose();
  near.character.dispose();
  env.dispose();
});

test('muzzle and dualies hand origins stay current across offscreen pose deferral', async () => {
  const api = await offscreenCharacterRuntime();
  const env = environment(api);
  const results = {};
  const idle = makeRemoteActor(api, env, { name: 'idle muzzle parity', speed: 0 });
  const idleReference = makeUnculledActor(api, env, { name: 'idle muzzle parity', speed: 0 });
  advanceActor(idle.actor);
  advanceActor(idleReference.actor);
  for (let frame = 1; frame <= 120; frame++) {
    env.renderCamera();
    advanceActor(idle.actor);
    advanceActor(idleReference.actor);
  }
  assert.equal(idle.character._iwOffscreenPoseStale, true);
  results.idle = assertSameOrigin(api.THREE, idle.character, idleReference.character, ['getMuzzle'], 'idle offscreen getMuzzle', IDLE_MUZZLE_TOLERANCE);
  idle.setFiring(true);
  idleReference.setFiring(true);
  env.renderCamera();
  advanceActor(idle.actor);
  advanceActor(idleReference.actor);
  results.idleFiring = assertSameOrigin(api.THREE, idle.character, idleReference.character, ['getMuzzle'], 'idle remote firing getMuzzle', IDLE_MUZZLE_TOLERANCE);
  idle.character.dispose();
  idleReference.character.dispose();

  for (const weapon of ['shooter', 'dualies']) {
    const name = `muzzle parity ${weapon}`;
    const gated = makeRemoteActor(api, env, { name, weapon, x: 80 });
    const reference = makeUnculledActor(api, env, { name, weapon, x: 80 });
    advanceActor(gated.actor);
    advanceActor(reference.actor);
    for (let frame = 1; frame <= 90; frame++) {
      env.renderCamera();
      gated.actor.pos.z = 4 * frame / 60;
      reference.actor.pos.z = 4 * frame / 60;
      advanceActor(gated.actor);
      advanceActor(reference.actor);
    }
    assert.equal(gated.character._iwOffscreenPoseStale, false,
      'moving remotes keep exact gait and weapon pose origins');
    const weaponOrigins = {
      primary: assertSameOrigin(api.THREE, gated.character, reference.character, ['getMuzzle'], `${weapon} getMuzzle`),
    };
    if (weapon === 'dualies') {
      weaponOrigins.right = assertSameOrigin(api.THREE, gated.character, reference.character, ['getMuzzleHand', 0], 'Dualies right muzzle');
      weaponOrigins.left = assertSameOrigin(api.THREE, gated.character, reference.character, ['getMuzzleHand', 1], 'Dualies left muzzle');
    }
    assert.equal(gated.character._iwOffscreenPoseStale, false, 'world-pose getter catches up before returning');

    gated.setFiring(true);
    reference.setFiring(true);
    env.renderCamera();
    advanceActor(gated.actor);
    advanceActor(reference.actor);
    weaponOrigins.firing = assertSameOrigin(api.THREE, gated.character, reference.character, ['getMuzzle'], `${weapon} firing muzzle`);
    if (weapon === 'dualies') {
      weaponOrigins.firingLeft = assertSameOrigin(api.THREE, gated.character, reference.character, ['getMuzzleHand', 1], 'Dualies firing left muzzle');
    }
    results[weapon] = weaponOrigins;
    gated.character.dispose();
    reference.character.dispose();
  }
  console.log('native world shot-origin parity', JSON.stringify(results));
  env.dispose();
});

test('fixed 60Hz movement samples are unchanged at 30/60/120Hz presentation rates', async () => {
  const api = await offscreenCharacterRuntime();
  const env = environment(api);
  const results = {};
  const fixed60Trace = Array.from({ length: 61 }, (_, tick) => 4 * tick / 60);
  for (const hz of [30, 60, 120]) {
    const name = `fixed movement ${hz}`;
    const gated = makeRemoteActor(api, env, { name, x: 80 });
    const reference = makeUnculledActor(api, env, { name, x: 80 });
    advanceActor(gated.actor);
    advanceActor(reference.actor);
    const renderFrames = hz;
    for (let frame = 1; frame <= renderFrames; frame++) {
      const t = frame / hz;
      const fixedTick = t * 60;
      const lower = Math.min(60, Math.floor(fixedTick));
      const upper = Math.min(60, lower + 1);
      const mix = fixedTick - lower;
      gated.actor.pos.z = fixed60Trace[lower] + (fixed60Trace[upper] - fixed60Trace[lower]) * mix;
      reference.actor.pos.z = gated.actor.pos.z;
      env.renderCamera();
      advanceActor(gated.actor, 1 / hz);
      advanceActor(reference.actor, 1 / hz);
    }
    assert.ok(Math.abs(gated.actor.pos.z - 4) < 1e-10);
    assert.ok(Math.abs(gated.character.root.position.z - reference.character.root.position.z) < 1e-10);
    assert.ok(Math.abs(gated.character.rv.z - reference.character.rv.z) < 1e-10,
      `${hz}Hz presentation changed the fixed-60 root velocity trace`);
    results[hz] = { actorZ: gated.actor.pos.z, characterRootZ: gated.character.root.position.z, rootVelocityZ: gated.character.rv.z };
    gated.character.dispose();
    reference.character.dispose();
  }
  console.log('native fixed-60 movement at render rates', JSON.stringify(results));
  env.dispose();
});
