import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { installSwimMotion as duplicateInstall } from '../runtime/swim-motion.mjs';

// One production realm: actual THREE, Actor, WeaponRunner, Character, material,
// indexed meshes, all installer hooks and native IK. No surrogate rig.
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.resolve(process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public'));
let cached;
async function production() {
  if (cached) return cached;
  const context = vm.createContext({ console, performance, URL }), modules = new Map();
  const load = requested => {
    let file = requested.startsWith(path.join(SRC, 'patches') + path.sep)
      ? path.join(ROOT, path.relative(SRC, requested)) : requested;
    if (file.startsWith(path.join(ROOT, 'src') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    const source = fs.readFileSync(file, 'utf8');
    const m = new vm.SourceTextModule(file.startsWith(SRC + path.sep)
      ? adaptSource(path.relative(SRC, file), source) : source,
    { context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    modules.set(file, m); return m;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { installSwimMotion, swimMotionSnapshot } from './patches/splatoon3/runtime/swim-motion.mjs';
    export { installFlowMotion } from './patches/splatoon3/runtime/flow-motion.mjs';
    export { movementMotionSnapshot } from './patches/splatoon3/runtime/movement-motion.mjs';
    export { FixedClock } from './patches/splatoon3/runtime/clock.mjs';
  `, { context, identifier: path.join(ROOT, 'swim-composition-entry.mjs') });
  await entry.link((specifier, from) => load(specifier === 'three'
    ? path.join(SRC, 'vendor/three/build/three.module.js')
    : specifier.startsWith('three/addons/')
      ? path.join(SRC, 'vendor/three/jsm', specifier.slice('three/addons/'.length))
      : path.resolve(path.dirname(from.identifier), specifier)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = { ...entry.namespace.install(profile), ...entry.namespace, profile };
  api.installSwimMotion(api, profile); api.installFlowMotion(api);
  const hooks = ['update', '_updateSquid', 'trigger', 'setVisible', 'setWeapon', 'dispose']
    .map(name => api.Character.prototype[name]);
  const reset = api.Actor.prototype.reset;
  api.installSwimMotion(api, profile); duplicateInstall(api, profile);
  assert.deepEqual(['update', '_updateSquid', 'trigger', 'setVisible', 'setWeapon', 'dispose']
    .map(name => api.Character.prototype[name]), hooks);
  assert.equal(api.Actor.prototype.reset, reset, 'another module realm cannot wrap Actor twice');
  assert.throws(() => entry.namespace.install(profile), /already installed/);
  const { G, THREE } = api;
  G.scene = new THREE.Scene(); G.settings = { quality: 'high' };
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.level = { blocks: [], groundHeight: () => 0 };
  G.paint = { sample: () => 1, splat: () => 0 };
  G.match = { playing: () => true, canRespawn: () => false };
  G.physics = { los: () => true, raycast: (_a, _b, _c, hit) => { hit.hit = false; return hit; } };
  G.projectiles = Object.fromEntries(['fireShooter', 'fireDualies', 'fireCharger', 'fireSplatling',
    'fireBlaster', 'fireSlosh', 'throwBomb', 'fireFlick'].map(name => [name, () => {}]));
  G.actors = []; G.time = 0;
  cached = api; return api;
}
function rig(api, enabled = true, kind = 'shooter') {
  const { Actor, Character, G, THREE } = api;
  const a = new Actor({ team: 0, name: 'swim native regression', weapon: kind,
    CharacterClass: Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const ch = a.character; ch.actor = a; ch.onEvent = null;
  ch.s3SwimMotionEnabled = enabled; G.scene.add(ch.root); G.actors.push(a);
  a.grounded = a.ground.hit = true;
  const step = (dt = 1 / 60, speed = 0, direction = [0, 1], moveRoot = true) => {
    a.vel.set(direction[0] * speed, 0, direction[1] * speed);
    if (moveRoot) a.pos.addScaledVector(a.vel, dt);
    G.time += dt; a._finishFrame(dt); ch.root.updateMatrixWorld(true);
    assert.ok(Array.from(ch.P).every(Number.isFinite));
  };
  for (let i = 0; i < 60; i++) step();
  const swim = (speed = 0) => {
    a.form = 'squid'; a.submerged = true; a.grounded = true;
    for (let i = 0; i < 60; i++) step(1 / 60, speed);
  };
  const snap = () => api.swimMotionSnapshot(ch);
  const close = () => { G.actors = G.actors.filter(actor => actor !== a); ch.dispose(); };
  return { api, a, ch, step, swim, snap, close };
}
const distance = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));
const angle = x => Math.atan2(Math.sin(x), Math.cos(x));
function grip(r, side = 'R') {
  const w = side === 'L' ? r.ch.weapon.left : r.ch.weapon;
  const p = side === 'L' ? w.def.handL : w.def.handR;
  return w.off.localToWorld(p.pos.clone()).distanceTo(r.ch.bones['hand' + side]
    .getWorldPosition(new r.api.THREE.Vector3()));
}

// Execute the native squid vertex-deformation block, read from its actual
// onBeforeCompile output. Translate only GLSL vec2/scalar syntax for CPU proof;
// all amplitudes, travelling-field math and vertex attributes remain upstream.
// GPU/browser evidence is deliberately a separate parent-owned check.
function nativeField(r) {
  const { THREE } = r.api;
  const shader = { vertexShader: THREE.ShaderLib.physical.vertexShader,
    fragmentShader: THREE.ShaderLib.physical.fragmentShader, uniforms: {} };
  r.ch.squid.body.material.onBeforeCompile(shader);
  const begin = shader.vertexShader.indexOf('float wig = color.g;');
  const end = shader.vertexShader.indexOf('vTint = color.r;', begin);
  assert.ok(begin >= 0 && end > begin, 'native travelling tentacle shader is present');
  const source = shader.vertexShader.slice(begin, end);
  let js = source.replaceAll('float ', 'let ')
    .replace('vec2 rad = position.xz;', 'let rad = [position.x, position.z];')
    .replace('length(rad)', 'Math.hypot(...rad)')
    .replace('rad / rl', 'rad.map(x => x / rl)')
    .replace('vec2(0.0, 1.0)', '[0, 1]')
    .replace('vec2 tng = vec2(-rad.y, rad.x);', 'let tng = [-rad[1], rad[0]];')
    .replace(/transformed\.xz \+= rad \* (\([^;]+\)) \+ tng \* (\([^;]+\));/,
      'transformed.x += rad[0] * $1 + tng[0] * $2; transformed.z += rad[1] * $1 + tng[1] * $2;')
    .replace(/\bsin\(/g, 'Math.sin(').replace(/\bcos\(/g, 'Math.cos(');
  assert.doesNotMatch(js, /\bvec2\b|transformed\.xz|\bfloat\b/);
  const evaluate = new Function('position', 'color', 'uTime', 'uWig',
    'const transformed = position.clone();\n' + js + '\nreturn transformed;');
  return { shader, source, evaluate };
}
function posedSquid(r, field, all = false) {
  const mesh = r.ch.squid.body, geo = mesh.geometry, { THREE } = r.api;
  mesh.updateWorldMatrix(true, false);
  assert.ok(geo.index?.count > 0, 'proof must sample actually drawn indexed triangles');
  const pos = geo.getAttribute('position'), col = geo.getAttribute('color');
  const indices = Array.from(geo.index.array);
  const drawn = [...new Set(indices)];
  const selected = all ? drawn : drawn.filter(i => col.getY(i) > .85).filter((_i, j) => j % 23 === 0);
  assert.ok(selected.length > 10, 'native tentacle tips are sampled');
  const vertices = selected.map(i => {
    const position = new THREE.Vector3().fromBufferAttribute(pos, i);
    const color = { g: col.getY(i), b: col.getZ(i) };
    const local = field.evaluate(position, color, r.ch.u.uTime.value, r.ch.u.uWig.value);
    return { i, local: local.toArray(), world: local.applyMatrix4(mesh.matrixWorld).toArray() };
  });
  return { vertices, indexCount: indices.length, indices: all ? indices : undefined,
    visible: mesh.visible && r.ch.squidRoot.visible, material: mesh.material.type,
    matrixWorld: mesh.matrixWorld.toArray(), geometryHash: createHash('sha256')
      .update(Buffer.from(pos.array.buffer)).update(Buffer.from(geo.index.array.buffer)).digest('hex') };
}
function boneProof(r) {
  r.ch.root.updateMatrixWorld(true); r.ch.skeleton.update();
  const boneNames = ['hips', 'spine', 'head', 'handR', 'handL', 'footL', 'footR'];
  const bones = Object.fromEntries(boneNames.map(name => [name,
    r.ch.bones[name].getWorldPosition(new r.api.THREE.Vector3()).toArray()]));
  const mesh = Object.values(r.ch.meshes).find(m => m.isSkinnedMesh && m.geometry.index);
  assert.ok(mesh, 'actual indexed skinned body retained');
  const ids = Array.from(mesh.geometry.index.array.slice(0, 9));
  const vertices = ids.map(i => mesh.applyBoneTransform(i,
    new r.api.THREE.Vector3().fromBufferAttribute(mesh.geometry.getAttribute('position'), i))
    .applyMatrix4(mesh.matrixWorld).toArray());
  return { bones, nativeIK: Array.from(r.ch.ikErr), vertices, indices: ids,
    rightGripError: grip(r), leftGripError: r.ch.weapon.left ? grip(r, 'L') : null,
    muzzle: r.ch.getMuzzle(new r.api.THREE.Vector3()).toArray() };
}
function gameplay(r) {
  const { a, ch } = r, runner = a.weaponRunner;
  return { pos: a.pos.toArray(), vel: a.vel.toArray(), root: ch.root.position.toArray(),
    rootQuaternion: ch.root.quaternion.toArray(), ink: a.ink, hp: a.hp, special: a.special,
    form: a.form, submerged: a.submerged, input: a.intent.move.toArray(),
    nativeTime: ch.t, nativeTimers: Array.from(ch.tr), springs: Array.from(ch.sp),
    pose: Array.from(ch.P), trackedPosition: ch.sqPos.toArray(), trackedQuaternion: ch.sqQuat.toArray(),
    runner: { cd: runner.cd, charge: runner.charge, chargeT: runner.chargeT,
      lockT: runner.lockT, dodge: runner.dodge, firing: runner.firingPose() } };
}
function saveTrace(rows, summary) {
  const destination = process.env.INKWAVE_SWIM_TRACE_PATH; if (!destination) return;
  const folder = fs.realpathSync(path.dirname(destination));
  assert.ok(folder.startsWith('/mnt/workspace/.dev-state/agent-work/evidence/'),
    'trace must resolve under persistent evidence storage');
  const file = path.join(folder, path.basename(destination));
  const hashes = Object.fromEntries(['patches/splatoon3/runtime/swim-motion.mjs',
    'patches/splatoon3/tests/swim-motion.test.mjs', 'inkwave-public/src/game/character.js',
    'inkwave-public/src/game/character-mats.js'].map(name => [name,
    createHash('sha256').update(fs.readFileSync(path.join(ROOT, name))).digest('hex')]));
  fs.writeFileSync(file + '.pending', JSON.stringify({ schema: 1,
    evidence: 'native-source VM pose + actual indexed geometry with native vertex shader evaluated on CPU; GPU/console parity not asserted',
    hashes, summary, rows }, null, 2) + '\n');
  fs.renameSync(file + '.pending', file);
}

test('ordinary swim composes on the real production rig', async t => {
  const api = await production();
  const rows = [], summary = {};
  await t.test('nullable preview and duplicate realm installation are harmless', () => {
    const r = rig(api);
    try { r.ch.update(0, null); assert.equal(r.snap().active, false); }
    finally { r.close(); }
  });
  await t.test('speed changes at late uptime cannot teleport the native tentacle wave', () => {
    const jumps = {};
    for (const enabled of [false, true]) {
      const r = rig(api, enabled);
      try {
        r.swim(5.5); for (let i = 0; i < 300; i++) r.step(1 / 60, 5.5);
        const field = nativeField(r), before = posedSquid(r, field);
        const phase = r.ch.u.uTime.value * r.ch.u.uWig.value.y;
        // Tiny elapsed time isolates the native t*frequency discontinuity from
        // normal wave progression and root/heading/body changes.
        r.step(1e-6, 11, [0, 1], false);
        const after = posedSquid(r, field);
        jumps[enabled ? 'after' : 'before'] = Math.max(...after.vertices.map((v, i) =>
          distance(v.local, before.vertices[i].local)));
        if (enabled) assert.ok(Math.abs(angle(r.ch.u.uTime.value * r.ch.u.uWig.value.y - phase)) < .00003);
        rows.push({ scenario: 'late-uptime-speed-change', enabled, shaderSource: field.source,
          snapshot: r.snap(), before, after, output: boneProof(r) });
      } finally { r.close(); }
    }
    assert.ok(jumps.before > .00005, 'native source must reproduce a phase discontinuity');
    assert.ok(jumps.after < .000005, 'posed native tentacles stay continuous');
    summary.tinyDtSpeedChange = jumps;
  });
  await t.test('public treadmill preview uses supplied swim speed and moving surface pose', () => {
    const powers = {}, poses = {};
    for (const enabled of [false, true]) {
      const r = rig(api, enabled);
      try {
        r.swim(); for (let i = 0; i < 120; i++) r.step(1 / 60, 11, [0, 1], false);
        assert.equal(r.ch.tread, true); assert.equal(r.ch.hs, 0);
        powers[enabled ? 'after' : 'before'] = r.ch.u.uWig.value.z;
        poses[enabled ? 'after' : 'before'] = r.ch.squid.pivot.scale.y;
        const field = nativeField(r);
        rows.push({ scenario: 'treadmill-full-speed', enabled, snapshot: r.snap(),
          squid: posedSquid(r, field, true), output: boneProof(r) });
      } finally { r.close(); }
    }
    assert.equal(powers.before, 0); assert.ok(powers.after > .999);
    assert.ok(poses.after > poses.before + .12);
    summary.previewSpeed = { powers, poses };
  });
  await t.test('dt0/pause freezes the applied body and tentacle geometry despite changed speed input', () => {
    const r = rig(api);
    try {
      r.swim(8); const field = nativeField(r), before = posedSquid(r, field), snap = r.snap();
      const pivot = r.ch.squid.pivot;
      const pose = [pivot.position.toArray(), pivot.quaternion.toArray(), pivot.scale.toArray()];
      for (let i = 0; i < 12; i++) r.ch.update(0, { ...r.a.anim, speed: 11 });
      assert.deepEqual(r.snap(), snap);
      assert.deepEqual([pivot.position.toArray(), pivot.quaternion.toArray(), pivot.scale.toArray()], pose);
      assert.deepEqual(posedSquid(r, field).vertices, before.vertices);
    } finally { r.close(); }
  });
  await t.test('heading follows world travel through root rotation, quarter turn and reversal', () => {
    const errors = {};
    for (const enabled of [false, true]) {
      const r = rig(api, enabled);
      try {
        r.swim(8);
        const state = { ...r.a.anim, speed: 8, localMove: { x: 1, z: 0 } };
        r.ch.root.rotation.y = Math.PI / 2;
        r.ch.update(1 / 60, state);
        const firstMantle = new api.THREE.Vector3(0, 1, 0)
          .applyQuaternion(r.ch.squid.pivot.getWorldQuaternion(new api.THREE.Quaternion()));
        if (enabled) assert.ok(Math.abs(angle(Math.atan2(firstMantle.x, firstMantle.z))) < .12,
          'root rotation cannot pull the displayed world heading sideways for a frame');
        for (let i = 1; i < 30; i++) r.ch.update(1 / 60, state);
        r.ch.root.updateMatrixWorld(true);
        const mantle = new api.THREE.Vector3(0, 1, 0)
          .applyQuaternion(r.ch.squid.pivot.getWorldQuaternion(new api.THREE.Quaternion()));
        errors[enabled ? 'after' : 'before'] = Math.abs(angle(Math.atan2(mantle.x, mantle.z)));
        for (const direction of [[1, 0], [0, -1], [-1, 0]]) {
          for (let i = 0; i < 60; i++) r.step(1 / 60, 8, direction);
          if (enabled) assert.ok(Math.abs(angle(r.snap().yaw - Math.atan2(...direction))) < .04);
          assert.ok(Array.from(r.ch.squid.pivot.quaternion.toArray()).every(Number.isFinite));
        }
      } finally { r.close(); }
    }
    assert.ok(errors.after < .12, 'compensated world heading settles to actual travel');
    summary.worldHeading = errors;
  });
  await t.test('30/60/120Hz fixed-clock composition yields identical pose, waves and native IK', () => {
    const traces = [];
    for (const hz of [30, 60, 120]) {
      const r = rig(api), clock = new api.FixedClock(), trace = [];
      try {
        r.swim();
        for (let frame = 0; frame < hz * 2; frame++) clock.advance(1 / hz, dt => {
          const tick = clock.ticks;
          const speed = tick < 20 ? tick / 20 * 11 : tick < 80 ? 11 : Math.max(0, 11 - (tick - 80) * .6);
          r.step(dt, speed, tick < 50 ? [0, 1] : [1, 0]);
          trace.push({ snapshot: r.snap(), pose: Array.from(r.ch.P), ik: Array.from(r.ch.ikErr),
            position: r.ch.squid.pivot.position.toArray(), quaternion: r.ch.squid.pivot.quaternion.toArray(),
            scale: r.ch.squid.pivot.scale.toArray(), wave: r.ch.u.uTime.value * r.ch.u.uWig.value.y });
        });
        assert.equal(clock.ticks, 120); traces.push(trace);
      } finally { r.close(); }
    }
    assert.deepEqual(traces[0], traces[1]); assert.deepEqual(traces[1], traces[2]);
    summary.renderRates = { hz: [30, 60, 120], gameplayTicks: 120, identical: true };
  });
  await t.test('raw 30/60/120Hz ordinary preview acceleration/braking stays close and returns to rest', () => {
    const traces = [];
    for (const hz of [30, 60, 120]) {
      const r = rig(api);
      try {
        r.swim();
        for (let frame = 0; frame < hz * 3; frame++) {
          const end = (frame + 1) / hz;
          const speed = end < .5 ? end * 22 : end < 1.5 ? 11 : end < 2 ? 11 * (2 - end) * 2 : 0;
          r.step(1 / hz, speed, [0, 1], false);
        }
        assert.ok(r.snap().power < .00001);
        traces.push({ hz, snapshot: r.snap(), position: r.ch.squid.pivot.position.toArray(),
          quaternion: r.ch.squid.pivot.quaternion.toArray() });
      } finally { r.close(); }
    }
    for (const trace of traces) assert.ok(distance(trace.position, traces[1].position) < .005);
    summary.rawRates = traces;
  });
  await t.test('form gestures, climb, air, roll, surge, jump, special and sub aim keep their native/action pose', () => {
    const r = rig(api);
    try {
      r.a.form = 'squid'; r.a.submerged = true;
      for (let i = 0; i < 20; i++) { r.step(); assert.equal(r.snap().active, false); }
      r.swim(8); assert.equal(r.snap().active, true);
      const branches = [
        { form: 'kid' }, { form: 'climb', wallNormal: new api.THREE.Vector3(0, 0, -1) },
        { form: 'swim', grounded: false }, { form: 'swim', subAim: true },
        { form: 'swim', firing: true }, { form: 'swim', movementMotion: { alive: true, special: {} } },
        { form: 'swim', movementMotion: { alive: true, superJump: { phase: 'flight' } } },
        { form: 'swim', movementMotion: { alive: true, actions: { roll: { age: .1 } } } },
        { form: 'climb', wallNormal: new api.THREE.Vector3(0, 0, -1),
          movementMotion: { alive: true, actions: { surge: { phase: 'charge', charge: .7 } } } },
      ];
      for (const branch of branches) {
        r.ch.update(1 / 60, { ...r.a.anim, grounded: true, ...branch });
        assert.equal(r.snap().active, false, JSON.stringify(branch));
        assert.equal(r.ch.u.uTime.value, r.ch.t, 'excluded branches retain native material time');
      }
      for (const event of ['squidroll', 'squidsurge', 'squidsurge_top', 'jump', 'throw', 'dodge', 'spawn']) {
        r.ch.trigger('movement_cancel'); r.swim(); assert.equal(r.snap().active, true);
        r.ch.trigger(event); assert.equal(r.snap().active, false, event);
      }
      rows.push({ scenario: 'interruptions', snapshot: r.snap(), output: boneProof(r) });
    } finally { r.close(); }
  });
  await t.test('reset, death, hidden parent, owner/weapon change and repeated disposal release swim state', () => {
    const r = rig(api);
    try {
      r.swim(); r.a.reset(); assert.equal(r.snap().active, false);
      r.a.grounded = true; r.swim(); r.a.setWeapon('dualies'); assert.equal(r.snap().active, false);
      r.swim(); r.ch.setVisible(false); assert.equal(r.snap().active, false);
      r.ch.setVisible(true); r.swim(); api.G.scene.visible = false;
      r.step(); assert.equal(r.snap().active, false); api.G.scene.visible = true;
      r.swim(); r.a.splat(null); assert.equal(r.snap().active, false);
      r.a.reset(); r.ch.setVisible(true); r.a.grounded = true; r.swim();
      const before = r.snap(); r.ch.actor = null; api.G.actors = api.G.actors.filter(a => a !== r.a);
      r.ch._ownT = -1; r.step(); assert.ok(r.snap().age < before.age, 'new preview owner starts fresh');
      let squidDisposals = 0; r.ch.mats.squid.addEventListener('dispose', () => squidDisposals++);
      const geo = r.ch.squid.body.geometry; let geoDisposals = 0;
      const onDispose = () => geoDisposals++; geo.addEventListener('dispose', onDispose);
      r.ch.dispose(); r.ch.dispose();
      assert.equal(r.snap().active, false); assert.equal(r.snap().resources, 0);
      assert.equal(squidDisposals, 1); assert.equal(geoDisposals, 0, 'shared native geometry stays alive');
      geo.removeEventListener('dispose', onDispose);
    } finally { api.G.scene.visible = true; r.close(); }
  });
  await t.test('native physics, gameplay clocks, pose channels, IK and returned grips are unchanged', () => {
    const traces = [], returned = [];
    for (const enabled of [false, true]) {
      const r = rig(api, enabled, 'dualies'), trace = [];
      try {
        r.swim();
        for (let i = 0; i < 120; i++) {
          r.a.intent.move.set(i < 60 ? 0 : 1, 0, i < 60 ? 1 : 0);
          if (i > 90) r.a.intent.move.set(0, 0, 0);
          r.a._horizontal(1 / 60, true, false);
          const direction = r.a.vel.length() > 0 ? [r.a.vel.x / r.a.vel.length(), r.a.vel.z / r.a.vel.length()] : [0, 1];
          r.step(1 / 60, r.a.vel.length(), direction);
          trace.push(gameplay(r));
        }
        r.a.form = 'kid'; r.a.submerged = false;
        for (let i = 0; i < 90; i++) r.step();
        const proof = boneProof(r);
        assert.ok(proof.rightGripError < .025); assert.ok(proof.leftGripError < .025);
        assert.ok(proof.nativeIK.every(x => Number.isFinite(x) && x < .002));
        returned.push(proof); traces.push(trace);
        rows.push({ scenario: 'swim-return-to-kid', enabled, snapshot: r.snap(), output: proof });
      } finally { r.close(); }
    }
    assert.deepEqual(traces[0], traces[1]); assert.deepEqual(returned[0], returned[1]);
    summary.nativeGameplayAndIKUnchanged = true;
  });
  saveTrace(rows, summary);
});
