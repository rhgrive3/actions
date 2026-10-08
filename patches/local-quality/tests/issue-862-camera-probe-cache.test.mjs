// #862: exercise the native CameraRig after the exact source-adapter chain used by the build.
// The locked inkwave-public source is read only; the raw module is the baseline control.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../adapter.mjs';
import { adaptNetworkSource } from '../../network-replication/adapter.mjs';
import { adaptRange } from '../../practice-range/adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = process.env.INKWAVE_UPSTREAM_SOURCE || `${ROOT}inkwave-public`;
const REL = 'src/game/cameraRig.js';
const rawSource = () => fs.readFileSync(`${UPSTREAM}/${REL}`, 'utf8');
const installedSource = () => adaptRange(REL,
  adaptNetworkSource(REL,
    adaptQualitySource(REL,
      adaptReliability(REL,
        adaptTouchLayout(REL,
          adaptSource(REL, rawSource()))))));

let shared;
async function boot() {
  if (shared) return shared;
  const context = vm.createContext({
    console, performance: { now: () => 1000 }, Math, Object, Array, JSON,
    navigator: { userAgent: 'test' }, window: undefined,
  });
  const mk = (src, id) => new vm.SourceTextModule(src, { context, identifier: id });
  const vendor = 'vendor/three/build';
  const core = mk(fs.readFileSync(`${UPSTREAM}/${vendor}/three.core.js`, 'utf8'), 'three.core.js');
  await core.link(() => { throw new Error('three.core.js must be self-contained'); });
  await core.evaluate();
  const three = mk(fs.readFileSync(`${UPSTREAM}/${vendor}/three.module.js`, 'utf8'), 'three.module.js');
  await three.link((spec) => {
    if (spec === './three.core.js') return core;
    throw new Error(`unexpected three.module.js import ${spec}`);
  });
  await three.evaluate();
  const ctx = mk(fs.readFileSync(`${UPSTREAM}/src/core/ctx.js`, 'utf8'), 'ctx.js');
  await ctx.link(() => { throw new Error('ctx.js must be self-contained'); });
  await ctx.evaluate();
  const physics = mk(fs.readFileSync(`${UPSTREAM}/src/game/physics.js`, 'utf8'), 'physics.js');
  await physics.link((spec) => {
    if (spec === 'three') return three;
    throw new Error(`unexpected physics.js import ${spec}`);
  });
  await physics.evaluate();
  shared = { THREE: three.namespace, Physics: physics.namespace.Physics, G: ctx.namespace.G, mk, three, ctx, physics };
  return shared;
}

async function loadRig(adapted) {
  const { mk, three, ctx, physics } = await boot();
  const source = adapted ? installedSource() : rawSource();
  const mod = mk(source, adapted ? 'cameraRig-installed.js' : 'cameraRig-baseline.js');
  await mod.link((spec) => {
    if (spec === 'three') return three;
    if (spec === '../core/ctx.js') return ctx;
    if (spec === './physics.js') return physics;
    throw new Error(`unexpected cameraRig import ${spec}`);
  });
  await mod.evaluate();
  return mod.namespace.CameraRig;
}

function makeActor(THREE, x = 0) {
  return {
    form: 'kid', anim: { form: 'idle' },
    pos: new THREE.Vector3(x, 0, 0), vel: new THREE.Vector3(), smoothY: 0,
    grounded: true, climbing: false, specialActive: null,
    hp: 76, damage: 0, ink: 83,
    weaponRunner: { charging: false, charge: 0.45, chargeT: 27, nextFireAt: 12 },
    visualPos(out) { return out.set(this.pos.x, this.pos.y + this.smoothY, this.pos.z); },
  };
}

function makeLevel() {
  return {
    blocks: [], faces: [], hash: [], blockStamp: [],
    groundHeight: () => -Infinity,
    queryBlocks(_minX, _minZ, _maxX, _maxZ, out) { out.length = 0; return out; },
  };
}

function makeRuntime(CameraRig, THREE, { probeLimit = null } = {}) {
  const counts = { probeCalls: 0, probeRays: 0, raycastCalls: 0, shoulderRaycastCalls: 0 };
  const level = makeLevel();
  const env = { counts, level, probeLimit, insideProbe: false, actor: makeActor(THREE) };
  env.physics = makePhysics(env);
  env.rig = new CameraRig(new THREE.PerspectiveCamera(60, 16 / 9));
  env.rig.follow(env.actor, true);
  // Start at an already-settled follow target; mode entry is exercised in its own control below.
  env.rig._prevMode = 'follow';
  env.rig._prevTarget = env.actor;
  return env;
}

function makePhysics(env) {
  const { Physics } = shared;
  const physics = new Physics(env.level);
  const nativeProbe = physics.cameraProbe.bind(physics);
  const nativeRaycast = physics.raycast.bind(physics);
  physics.raycast = (origin, direction, maxDist, out, skipGrates) => {
    env.counts.raycastCalls++;
    if (env.insideProbe) {
      env.counts.probeRays++;
      const limit = env.probeLimit?.(env.actor, origin, direction, maxDist);
      if (Number.isFinite(limit)) {
        out.hit = true; out.dist = limit; out.normal.set(0, 0, 1);
        return out;
      }
    } else env.counts.shoulderRaycastCalls++;
    return nativeRaycast(origin, direction, maxDist, out, skipGrates);
  };
  physics.cameraProbe = (...args) => {
    env.counts.probeCalls++;
    env.insideProbe = true;
    try { return nativeProbe(...args); }
    finally { env.insideProbe = false; }
  };
  return physics;
}

function activate(env) {
  const { G } = shared;
  G.time = 0; G.mode = 'match'; G.match = null;
  G.settings = { fov: 82, cameraShake: 0 };
  G.level = env.level; G.physics = env.physics;
}

function step(env, dt) {
  activate(env);
  if (env.disableProbeCache) env.rig._inkwaveCameraProbeCache = null;
  env.rig.update(dt);
}

function viewState(env) {
  // #363/#367 independently owns the lateral shoulder translation. Remove each
  // rig's own shoulder before comparing the #862 probe-cache result.
  const shoulder = env.rig.shoulder || 0, yaw = env.rig.yaw || 0, p = env.rig.camera.position;
  const neutralPosition = [p.x + Math.cos(yaw) * shoulder, p.y, p.z - Math.sin(yaw) * shoulder];
  return [
    ...neutralPosition, ...env.rig.camera.quaternion.toArray(),
    env.rig.camera.fov, env.rig.curDist, env.rig.wantDist, ...env.rig.pivot.toArray(),
    env.rig.boom.x,
  ];
}

function assertSameView(a, b, label) {
  const av = viewState(a), bv = viewState(b);
  assert.equal(av.length, bv.length);
  for (let i = 0; i < av.length; i++) {
    assert.ok(Math.abs(av[i] - bv[i]) < 1e-10, `${label}: native camera value ${i} differs (${av[i]} vs ${bv[i]})`);
  }
}

function actorState(actor) {
  return {
    pos: actor.pos.toArray(), vel: actor.vel.toArray(), form: actor.form,
    hp: actor.hp, damage: actor.damage, ink: actor.ink,
    weaponRunner: { ...actor.weaponRunner },
  };
}

test('Issue #862: settled native follow camera reuses identical probes with frame-rate parity', async () => {
  const { THREE } = await boot();
  const InstalledRig = await loadRig(true);
  const rawText = rawSource(), installedText = installedSource();
  assert.ok(rawText.includes('G.physics.cameraProbe(this.pivot, _back, this.wantDist, 0.62, _probe);'),
    'baseline control must contain the uncached native probe call');
  assert.notEqual(installedText, rawText, 'the installed CameraRig must receive the adapter');

  for (const hz of [30, 60, 120]) {
    const raw = makeRuntime(InstalledRig, THREE), installed = makeRuntime(InstalledRig, THREE); raw.disableProbeCache = true;
    const dt = 1 / hz;
    for (let i = 0; i < 5; i++) {
      step(raw, dt); step(installed, dt);
      assertSameView(raw, installed, `${hz}Hz warm-up ${i}`);
    }
    raw.counts.probeCalls = raw.counts.probeRays = raw.counts.shoulderRaycastCalls = 0;
    installed.counts.probeCalls = installed.counts.probeRays = installed.counts.shoulderRaycastCalls = 0;
    const rawActorBefore = actorState(raw.actor), installedActorBefore = actorState(installed.actor);
    for (let i = 0; i < hz; i++) {
      step(raw, dt); step(installed, dt);
      assertSameView(raw, installed, `${hz}Hz stationary frame ${i}`);
    }

    assert.equal(raw.counts.probeCalls, hz, `${hz}Hz baseline must probe every rendered frame`);
    assert.equal(raw.counts.probeRays, hz * 15, `${hz}Hz baseline must emit 15 rays per frame`);
    assert.ok(installed.counts.probeCalls >= 3 && installed.counts.probeCalls <= 6,
      `${hz}Hz cache must refresh periodically within its bound, got ${installed.counts.probeCalls} probes`);
    assert.ok(installed.counts.probeRays < raw.counts.probeRays / 4,
      `${hz}Hz stationary native camera must cut probe rays by at least 75%`);
    assert.equal(installed.counts.shoulderRaycastCalls, raw.counts.shoulderRaycastCalls,
      `${hz}Hz camera shoulder raycast path must remain unchanged`);
    assert.deepEqual(actorState(raw.actor), rawActorBefore, 'baseline follow update leaves gameplay actor state alone');
    assert.deepEqual(actorState(installed.actor), installedActorBefore, 'cached follow update leaves gameplay actor state alone');
  }
});

test('Issue #862: movement, collision output, level rebuild, target and mode invalidate the cache', async () => {
  const { THREE } = await boot();
  const InstalledRig = await loadRig(true);
  for (const hz of [30, 60, 120]) {
    const wallProbe = (actor) => actor.pos.x > 0 ? 0.8 : null;
    const raw = makeRuntime(InstalledRig, THREE, { probeLimit: wallProbe }); raw.disableProbeCache = true;
    const installed = makeRuntime(InstalledRig, THREE, { probeLimit: wallProbe });
    const dt = 1 / hz;
    for (let i = 0; i < 8; i++) { step(raw, dt); step(installed, dt); }
    const before = installed.rig.curDist;
    raw.counts.probeCalls = installed.counts.probeCalls = 0;
    raw.actor.pos.x = installed.actor.pos.x = 0.2;
    step(raw, dt); step(installed, dt);
    assert.equal(installed.counts.probeCalls, 1, `${hz}Hz material pivot movement must refresh immediately`);
    assert.equal(raw.counts.probeCalls, 1);
    assertSameView(raw, installed, `${hz}Hz first wall-approach frame`);
    assert.ok(installed.rig.curDist < before, `${hz}Hz camera must still retract toward the newly detected wall`);
  }

  const raw = makeRuntime(InstalledRig, THREE), installed = makeRuntime(InstalledRig, THREE); raw.disableProbeCache = true;
  for (let i = 0; i < 3; i++) { step(raw, 1 / 60); step(installed, 1 / 60); }
  raw.counts.probeCalls = installed.counts.probeCalls = 0;
  raw.level.blocks = installed.level.blocks = [{}];
  raw.level.hash = installed.level.hash = [[0]];
  raw.level.blockStamp = installed.level.blockStamp = new Uint32Array([0]);
  step(raw, 1 / 60); step(installed, 1 / 60);
  assert.equal(installed.counts.probeCalls, 1, 'replaced level collision collections immediately refresh the probe');
  assertSameView(raw, installed, 'same-object level collection rebuild');

  raw.counts.probeCalls = installed.counts.probeCalls = 0;
  raw.level = makeLevel(); installed.level = makeLevel();
  raw.physics.level = raw.level; installed.physics.level = installed.level;
  step(raw, 1 / 60); step(installed, 1 / 60);
  assert.equal(installed.counts.probeCalls, 1, 'a new Level instance immediately refreshes the probe');
  assertSameView(raw, installed, 'Level-instance rebuild');

  raw.counts.probeCalls = installed.counts.probeCalls = 0;
  raw.physics = makePhysics(raw); installed.physics = makePhysics(installed);
  step(raw, 1 / 60); step(installed, 1 / 60);
  assert.equal(installed.counts.probeCalls, 1, 'a replaced Physics instance immediately refreshes the probe');
  assertSameView(raw, installed, 'Physics-instance replacement');

  raw.counts.probeCalls = installed.counts.probeCalls = 0;
  const currentProbe = installed.physics.cameraProbe;
  installed.physics.cameraProbe = (...args) => currentProbe(...args);
  step(raw, 1 / 60); step(installed, 1 / 60);
  assert.equal(installed.counts.probeCalls, 1, 'a replaced cameraProbe function immediately refreshes the probe');
  assertSameView(raw, installed, 'probe-function replacement');

  raw.counts.probeCalls = installed.counts.probeCalls = 0;
  const currentRaycast = installed.physics.raycast;
  installed.physics.raycast = (...args) => currentRaycast(...args);
  step(raw, 1 / 60); step(installed, 1 / 60);
  assert.equal(installed.counts.probeCalls, 1, 'a replaced raycast function immediately refreshes the probe');
  assertSameView(raw, installed, 'raycast-function replacement');

  raw.counts.probeCalls = installed.counts.probeCalls = 0;
  raw.rig.follow(makeActor(THREE), true); installed.rig.follow(makeActor(THREE), true);
  step(raw, 1 / 60); step(installed, 1 / 60);
  assert.equal(installed.counts.probeCalls, 1, 'a changed followed target immediately refreshes the probe');
  assertSameView(raw, installed, 'target-change frame');

  raw.counts.probeCalls = installed.counts.probeCalls = 0;
  raw.rig.mode = installed.rig.mode = 'path';
  raw.rig.path = installed.rig.path = null;
  step(raw, 1 / 60); step(installed, 1 / 60);
  assert.equal(installed.counts.probeCalls, 0, 'non-follow camera mode does not run the follow probe');
  raw.rig.mode = installed.rig.mode = 'follow';
  step(raw, 1 / 60); step(installed, 1 / 60);
  assert.equal(installed.counts.probeCalls, 1, 'returning to follow starts with a fresh probe');
  assertSameView(raw, installed, 'follow-mode re-entry frame');
});

test('Issue #862: caching does not replace the separate shoulder-clearance raycast', async () => {
  const { THREE } = await boot();
  const InstalledRig = await loadRig(true);
  const closeProbe = () => 0.8;
  const raw = makeRuntime(InstalledRig, THREE, { probeLimit: closeProbe }); raw.disableProbeCache = true;
  const installed = makeRuntime(InstalledRig, THREE, { probeLimit: closeProbe });
  for (let i = 0; i < 90; i++) {
    step(raw, 1 / 60); step(installed, 1 / 60);
    assertSameView(raw, installed, `shoulder-clearance frame ${i}`);
  }
  assert.ok(raw.counts.raycastCalls > 0, 'baseline fixture must exercise shoulder clearance');
  assert.equal(installed.counts.shoulderRaycastCalls, raw.counts.shoulderRaycastCalls,
    'camera shoulder collision queries remain per-frame and unchanged');
  assert.ok(installed.counts.probeCalls < raw.counts.probeCalls,
    'only the redundant multi-ray cameraProbe call is cached');
});

test('Issue #862: a same-context collision result change is observed by the bounded refresh', async () => {
  const { THREE } = await boot();
  const InstalledRig = await loadRig(true);
  const env = makeRuntime(InstalledRig, THREE, {
    probeLimit: (actor) => actor.geometryChanged ? 0.8 : null,
  });
  const dt = 1 / 60;
  for (let i = 0; i < 5; i++) step(env, dt);
  const before = env.rig.curDist;
  env.actor.geometryChanged = true;
  env.counts.probeCalls = 0;
  let waited = 0;
  while (!env.counts.probeCalls && waited < 0.25 + dt * 2) {
    step(env, dt);
    waited += dt;
  }
  assert.equal(env.counts.probeCalls, 1, 'in-place collision change must reach a full native probe');
  assert.ok(waited <= 0.25 + dt, `in-place change waited ${waited}s, beyond the 250ms refresh bound`);
  assert.ok(env.rig.curDist < before, 'the refreshed wall result must still retract the camera');
});

test('Issue #862: sub-millimetre Super Jump zoom changes keep cached free-camera endpoints exact', async () => {
  const { THREE } = await boot();
  const InstalledRig = await loadRig(true);
  for (const hz of [30, 60, 120]) {
    const uncached = makeRuntime(InstalledRig, THREE);
    const cached = makeRuntime(InstalledRig, THREE);
    const flight = {
      phase: 'flight', t: 0.4, dur: 1,
      from: { x: 0, y: 0, z: 0 }, to: { x: 3, y: 0, z: 4 },
    };
    uncached.actor.superJumpState = { ...flight };
    cached.actor.superJumpState = { ...flight };
    const dt = 1 / hz;
    let reusedWhileChanging = 0;
    for (let i = 0; i < hz * 3; i++) {
      // Keep all production adapters, only turn cache reuse off in the control.
      uncached.rig._inkwaveCameraProbeCache = null;
      const previousCalls = cached.counts.probeCalls;
      const previousWant = cached.rig.wantDist;
      step(uncached, dt);
      step(cached, dt);
      if (cached.counts.probeCalls === previousCalls && cached.rig.wantDist !== previousWant) {
        reusedWhileChanging++;
      }
      assertSameView(uncached, cached, `${hz}Hz Super Jump zoom frame ${i}`);
    }
    assert.ok(reusedWhileChanging > 0,
      `${hz}Hz must exercise cached probe reuse during small zoom changes`);
    assert.ok(cached.counts.probeCalls < uncached.counts.probeCalls,
      `${hz}Hz caching must still save collision queries`);
  }
});

test('Issue #862: obstructed probes refresh when the requested zoom distance changes', async () => {
  const { THREE } = await boot();
  const InstalledRig = await loadRig(true);
  for (const hz of [30, 60, 120]) {
    const raw = makeRuntime(InstalledRig, THREE, { probeLimit: () => 0.8 });
    const cached = makeRuntime(InstalledRig, THREE, { probeLimit: () => 0.8 });
    const flight = {
      phase: 'flight', t: 0.4, dur: 1,
      from: { x: 0, y: 0, z: 0 }, to: { x: 3, y: 0, z: 4 },
    };
    raw.actor.superJumpState = { ...flight };
    cached.actor.superJumpState = { ...flight };
    const dt = 1 / hz;
    for (let i = 0; i < hz * 3; i++) {
      raw.rig._inkwaveCameraProbeCache = null;
      step(raw, dt);
      step(cached, dt);
      assertSameView(raw, cached, `${hz}Hz blocked zoom frame ${i}`);
    }
  }
});
