import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { installFormMotion as duplicateInstall } from '../runtime/form-motion.mjs';

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
    const module = new vm.SourceTextModule(file.startsWith(SRC + path.sep)
      ? adaptSource(path.relative(SRC, file), source) : source,
      { context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    modules.set(file, module); return module;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { installFormMotion, formMotionSnapshot, resetFormMotion } from './patches/splatoon3/runtime/form-motion.mjs';
    export { FixedClock } from './patches/splatoon3/runtime/clock.mjs';
  `, { context, identifier: path.join(ROOT, 'form-composition-entry.mjs') });
  await entry.link((specifier, from) => load(specifier === 'three'
    ? path.join(SRC, 'vendor/three/build/three.module.js')
    : specifier.startsWith('three/addons/')
      ? path.join(SRC, 'vendor/three/jsm', specifier.slice('three/addons/'.length))
      : path.resolve(path.dirname(from.identifier), specifier)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = { ...entry.namespace.install(profile), ...entry.namespace, profile };
  const native = {};
  for (const name of ['_applyPose', '_solveLimb', '_animWeapon', '_trackRoot', '_updateFeet', '_updateSquid', '_poseWeapon', '_poseAir', '_poseLand']) {
    native[name] = api.Character.prototype[name];
  }
  api.installFormMotion(api, profile);
  const hooks = ['update', '_poseForm', '_updateFormScales', 'trigger', 'setWeapon', 'dispose'];
  const installed = hooks.map(name => api.Character.prototype[name]);
  const reset = api.Actor.prototype.reset;
  api.installFormMotion(api, profile); duplicateInstall(api, profile);
  hooks.forEach((name, i) => assert.equal(api.Character.prototype[name], installed[i]));
  assert.equal(api.Actor.prototype.reset, reset);
  for (const [name, method] of Object.entries(native)) assert.equal(api.Character.prototype[name], method);
  assert.throws(() => entry.namespace.install(profile), /already installed/);
  const { G, THREE } = api;
  G.scene = new THREE.Scene(); G.settings = { quality: 'high' };
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.level = { blocks: [], groundHeight: () => 0 };
  G.paint = { sample: () => 1, splat: () => 0 };
  G.match = { playing: () => true, canRespawn: () => false };
  // Scene collision is isolated; Actor/Runner/Character, THREE, all production
  // motion hooks, complete native skeleton, skin geometry and IK are real.
  G.physics = { los: () => true, raycast: (_a, _b, _c, hit) => { hit.hit = false; return hit; } };
  G.actors = []; G.time = 0;
  cached = api; return api;
}
function rig(api, kind = 'shooter', enabled = true) {
  const { Actor, Character, G, THREE } = api;
  const a = new Actor({ team: 0, name: 'form production regression', weapon: kind,
    CharacterClass: Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const ch = a.character; ch.actor = a; ch.onEvent = null; ch.s3FormMotionEnabled = enabled;
  G.scene.add(ch.root); G.actors.push(a); a.grounded = a.ground.hit = true;
  let shots = 0;
  const projectiles = Object.fromEntries(['fireShooter', 'fireDualies', 'fireCharger', 'fireSplatling',
    'fireBlaster', 'fireSlosh', 'throwBomb', 'fireFlick'].map(name => [name, () => { shots++; }]));
  const step = (dt = 1 / 60, input = {}) => {
    G.projectiles = projectiles; a.intent.fire = !!input.fire; a.intent.sub = !!input.sub;
    G.time += dt; a.weaponRunner.update(dt, input); a._finishFrame(dt);
    ch.root.updateMatrixWorld(true); ch.skeleton.update();
    assert.ok(Array.from(ch.P).every(Number.isFinite));
  };
  for (let i = 0; i < 90; i++) step();
  assert.equal(ch._owner(), a); assert.equal(ch._runner(), a.weaponRunner);
  return { api, a, ch, step, get shots() { return shots; },
    close() { G.actors = G.actors.filter(x => x !== a); ch.dispose(); } };
}
function form(r, value) {
  r.a.form = value === 'kid' ? 'kid' : 'squid';
  r.a.submerged = value === 'swim'; r.a.climbing = value === 'climb';
}
function grip(r, side = 'R') {
  const w = side === 'L' && r.ch.dual ? r.ch.weapon.left : r.ch.weapon;
  const h = side === 'L' ? w.def.handL : w.def.handR;
  const bone = r.ch.bones[side === 'L' ? 'handL' : 'handR'];
  return w.off.localToWorld(h.pos.clone()).distanceTo(bone.getWorldPosition(new r.api.THREE.Vector3()));
}
const hash = data => createHash('sha256').update(data).digest('hex');
function geometry(r) {
  const meshes = [], v = new r.api.THREE.Vector3();
  r.ch.root.traverse(mesh => {
    if (!mesh.isMesh || !mesh.geometry.index) return;
    for (let p = mesh; p; p = p.parent) if (!p.visible) return;
    const index = mesh.geometry.index, position = mesh.geometry.attributes.position;
    const vertices = [], posed = [];
    for (const offset of [0, Math.floor(index.count / 6) * 3, index.count - 3]) {
      for (let j = 0; j < 3; j++) {
        const i = index.getX(offset + j);
        mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld);
        vertices.push({ index: i, point: v.toArray() });
      }
    }
    // Fingerprint the complete actually posed indexed draw, including native
    // skinning, instead of passing on assigned IK targets or bounding boxes.
    for (let i = 0; i < index.count; i++) {
      mesh.getVertexPosition(index.getX(i), v).applyMatrix4(mesh.matrixWorld);
      posed.push(v.x, v.y, v.z);
    }
    const bytes = Buffer.from(new Float64Array(posed).buffer);
    meshes.push({ name: mesh.name, indexedDrawCount: index.count, skinned: !!mesh.isSkinnedMesh,
      topologySha256: hash(Buffer.from(index.array.buffer, index.array.byteOffset, index.array.byteLength)),
      positionsSha256: hash(Buffer.from(position.array.buffer, position.array.byteOffset, position.array.byteLength)),
      posedIndexedSha256: hash(bytes), sampledTriangles: vertices });
  });
  return meshes;
}
function row(r, stage) {
  return { stage, form: r.ch.form, formT: r.ch.formT,
    snapshot: r.api.formMotionSnapshot(r.ch), pose: Array.from(r.ch.P),
    kidMatrix: r.ch.kid.matrixWorld.toArray(), weaponMatrix: r.ch.weapon.off.matrixWorld.toArray(),
    squidMatrix: r.ch.squid.body.matrixWorld.toArray(), nativeIK: Array.from(r.ch.ikErr),
    gripRight: grip(r), bones: Object.fromEntries(['hips', 'spine', 'chest', 'head', 'handL', 'handR', 'footL', 'footR']
      .map(name => [name, r.ch.bones[name].matrixWorld.toArray()])), geometry: geometry(r) };
}
function save(rows, basename) {
  const destination = process.env.INKWAVE_FORM_TRACE_PATH;
  if (!destination) return;
  const folder = fs.realpathSync(path.dirname(destination));
  assert.ok(folder.startsWith('/mnt/workspace/.dev-state/agent-work/evidence/'));
  const file = path.join(folder, basename || path.basename(destination));
  fs.writeFileSync(file + '.pending', JSON.stringify({ schema: 1,
    evidence: 'actual source CPU pose and native IK; rows with geometry include posed indexed draws; browser/GPU and Switch comparison remain parent-owned',
    runtimeSha256: hash(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/runtime/form-motion.mjs'))), rows }, null, 2) + '\n');
  fs.renameSync(file + '.pending', file);
}
function gameplay(r) {
  const a = r.a, runner = a.weaponRunner;
  return { pos: a.pos.toArray(), vel: a.vel.toArray(), form: a.form, ink: a.ink, hp: a.hp,
    input: { fire: a.intent.fire, sub: a.intent.sub, move: a.intent.move.toArray() },
    timers: Array.from(r.ch.tr), nativeFormT: r.ch.formT,
    runner: Object.fromEntries(Object.entries(runner).filter(([, v]) => typeof v !== 'object' && typeof v !== 'function')) };
}

test('production form patch composes once, retains native IK and removes the long emerge flourish', async () => {
  const api = await production(), old = rig(api, 'shooter', false), r = rig(api), rows = [];
  try {
    for (const x of [old, r]) { form(x, 'swim'); for (let i = 0; i < 45; i++) x.step(); form(x, 'kid'); }
    for (let i = 0; i < 7; i++) { old.step(); r.step(); }
    rows.push(row(old, 'native-emerge'), row(r, 'patched-emerge'));
    const C = api.CHARACTER_CHANNELS;
    assert.ok(Math.abs(old.ch.P[C.UARML] - r.ch.P[C.UARML]) > 1,
      'native .42s overhead arm flourish is removed in the actual pose');
    assert.notDeepEqual(rows[0].bones.handL, rows[1].bones.handL);
    assert.ok(rows[0].geometry.some((mesh, i) => mesh.posedIndexedSha256 !== rows[1].geometry[i]?.posedIndexedSha256));
    assert.ok(rows[1].geometry.some(m => m.skinned && m.indexedDrawCount > 100));
    assert.ok(grip(r) < .025); assert.ok(r.ch.ikErr[0] < .001);
    assert.deepEqual(gameplay(old), gameplay(r));
    for (let i = 0; i < 8; i++) { old.step(); r.step(); }
    assert.ok(Math.abs(old.ch.kidSY - 1) > .001, 'native scale wobble is still present after the exchange');
    assert.equal(r.ch.kidSY, 1); assert.equal(r.ch.kidSXZ, 1);
    rows.push(row(old, 'native-late-wobble'), row(r, 'patched-settled'));
    form(old, 'swim'); form(r, 'swim');
    for (let i = 0; i < 4; i++) { old.step(); r.step(); }
    rows.push(row(old, 'native-dive'), row(r, 'patched-dive'));
    for (let i = 0; i < 30; i++) { old.step(); r.step(); }
    assert.equal(r.ch.kid.visible, false); assert.equal(r.ch.squidRoot.visible, true);
    assert.equal(r.ch.sqSY, 1); assert.equal(r.ch.sqSXZ, 1);
    assert.deepEqual(gameplay(old), gameplay(r)); save(rows);
  } finally { old.close(); r.close(); }
});

test('zero-time rapid reversal preserves actual displayed scales, gun visibility and conversion clocks', async () => {
  const api = await production(), r = rig(api), old = rig(api, 'shooter', false);
  try {
    for (const x of [old, r]) { form(x, 'swim'); for (let i = 0; i < 5; i++) x.step(); }
    const before = api.formMotionSnapshot(r.ch).shape, native = api.formMotionSnapshot(old.ch).shape;
    const visible = r.ch.kid.visible;
    form(old, 'kid'); form(r, 'kid'); old.step(0); r.step(0);
    assert.deepEqual(api.formMotionSnapshot(r.ch).shape, before,
      'paused reversal cannot replace a partly drawn body with a full body');
    assert.notDeepEqual(api.formMotionSnapshot(old.ch).shape, native, 'counterfactual native timeline jumps at dt=0');
    assert.equal(r.ch.kid.visible, visible); assert.deepEqual(gameplay(old), gameplay(r));
    const hold = api.formMotionSnapshot(r.ch).shape;
    for (let i = 0; i < 5; i++) r.step(0);
    assert.deepEqual(api.formMotionSnapshot(r.ch).shape, hold);
    for (const hz of [30, 60, 120]) {
      for (let i = 0; i < 30; i++) {
        form(r, i % 2 ? 'kid' : 'swim'); r.step(1 / hz);
        const s = api.formMotionSnapshot(r.ch).shape;
        assert.ok(Object.values(s).every(Number.isFinite));
        assert.ok(s.k >= 0 && s.k <= 1 && s.s >= 0 && s.s <= 1);
      }
      form(r, 'kid'); for (let i = 0; i < hz; i++) r.step(1 / hz);
      assert.equal(r.ch.kidScale, 1); assert.equal(r.ch.sqScale, 0);
      assert.equal(r.ch.kidSY, 1); assert.equal(r.ch.kidSXZ, 1); assert.equal(r.ch.kidLift, 0);
      assert.ok(grip(r) < .025); assert.ok(r.ch.ikErr[0] < .001);
    }
  } finally { r.close(); old.close(); }
});

test('30/60/120Hz render schedules yield the same production pose, skinned vertices and weapon transitions', async () => {
  const api = await production(), traces = [];
  for (const hz of [30, 60, 120]) {
    const r = rig(api), clock = new api.FixedClock(), trace = [];
    try {
      for (let frame = 0; frame < hz; frame++) clock.advance(1 / hz, dt => {
        const tick = clock.ticks;
        form(r, tick < 20 || tick >= 40 ? 'swim' : 'kid'); r.step(dt);
        const mesh = r.ch.lodSets[r.ch.lod.tier].list.find(m => m.isSkinnedMesh);
        const v = mesh.getVertexPosition(mesh.geometry.index.getX(0), new api.THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
        trace.push({ shape: api.formMotionSnapshot(r.ch).shape, pose: Array.from(r.ch.P),
          vertex: v.toArray(), hand: r.ch.bones.handR.matrixWorld.toArray(),
          weapon: r.ch.weapon.off.matrixWorld.toArray(), nativeIK: Array.from(r.ch.ikErr) });
      });
      assert.equal(clock.ticks, 60); traces.push(trace);
      const paused = traces.at(-1).at(-1); assert.equal(clock.advance(0, () => assert.fail('pause advanced')), 0);
      assert.deepEqual(traces.at(-1).at(-1), paused);
    } finally { r.close(); }
  }
  assert.deepEqual(traces[0], traces[1]); assert.deepEqual(traces[1], traces[2]);
});

test('dry, own-ink, wall and airborne conversions keep native visibility endpoints and gun hierarchy', async () => {
  const api = await production(), r = rig(api);
  try {
    assert.ok(r.ch.weapon.off.isObject3D);
    const descendants = new Set(); r.ch.kid.traverse(node => descendants.add(node));
    assert.ok(descendants.has(r.ch.weapon.off), 'gun hides with the actual kid body hierarchy');
    for (const target of ['squid', 'swim', 'climb']) for (const grounded of [true, false]) {
      r.a.grounded = grounded; r.a.vel.set(0, grounded ? 0 : -1, 0);
      form(r, target); for (let i = 0; i < 30; i++) r.step();
      assert.equal(r.ch.form, target); assert.equal(r.ch.kid.visible, false);
      assert.equal(r.ch.squidRoot.visible, true); assert.equal(r.ch.sqScale, 1);
      form(r, 'kid'); for (let i = 0; i < 30; i++) r.step();
      assert.equal(r.ch.kid.visible, true); assert.equal(r.ch.squidRoot.visible, false);
      assert.equal(r.ch.kidScale, 1); assert.equal(r.ch.kidLift, 0);
      assert.ok(Array.from(r.ch.ikErr).every(Number.isFinite));
    }
    form(r, 'swim'); for (let i = 0; i < 30; i++) r.step();
    const native = r.ch.squid.pivot.scale.toArray();
    // A same-body swim→climb switch never starts a kid gesture or a new pop.
    form(r, 'climb'); r.step();
    assert.equal(api.formMotionSnapshot(r.ch).phase, null);
    assert.equal(r.ch.sqScale, 1); assert.equal(r.ch.sqSY, 1);
    assert.ok(native.every(Number.isFinite));
  } finally { r.close(); }
});

test('actual native Physics/Actor/Runner gameplay is unchanged by posed form corrections', async () => {
  const api = await production(), { G, THREE, Physics } = api;
  const previous = { level: G.level, physics: G.physics };
  const center = new THREE.Vector3(0, -.1, 0), half = new THREE.Vector3(100, .1, 100);
  const floor = { id: 0, solid: true, center, half,
    axes: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)],
    faces: [-1, -1, 0, -1, -1, -1], aabbMin: center.clone().sub(half), aabbMax: center.clone().add(half) };
  const level = { blocks: [floor], faces: [{ origin: new THREE.Vector3(-100, 0, -100),
    u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, 1) }],
    hasRails: false, groundHeight: () => 0,
    spawnPads: [new THREE.Vector3(-1000, 0, 0), new THREE.Vector3(1000, 0, 0)], spawnBarrier: 1,
    queryBlocks: (_x, _z, _xx, _zz, out) => { out.length = 0; out.push(0); return out; } };
  G.level = level; G.physics = new Physics(level);
  const old = rig(api, 'shooter', false), r = rig(api);
  try {
    const rows = [];
    for (let tick = 0; tick < 90; tick++) {
      for (const x of [old, r]) {
        x.a.intent.squid = tick >= 15 && tick < 45;
        x.a.intent.move.set(.3, 0, .6); x.a.intent.fire = tick >= 60;
        G.time = tick / 60; x.a.update(1 / 60);
        x.ch.root.updateMatrixWorld(true); x.ch.skeleton.update();
      }
      assert.deepEqual(gameplay(old), gameplay(r), `native floor gameplay at tick ${tick}`);
      rows.push({ position: r.a.pos.toArray(), velocity: r.a.vel.toArray(),
        grounded: r.a.grounded, form: r.a.form });
    }
    assert.ok(rows.some(x => x.form === 'squid')); assert.ok(rows.some(x => x.form === 'kid'));
    assert.ok(rows.every(x => x.grounded)); assert.ok(r.a.pos.z > 1);
  } finally { old.close(); r.close(); G.level = previous.level; G.physics = previous.physics; }
});

test('main fire, sub aim, throw, roller, dualies and special actions own their channels on emergence', async () => {
  const api = await production(), C = api.CHARACTER_CHANNELS, actionRows = [];
  for (const [kind, input] of [['shooter', { fire: true }], ['charger', { fire: true }],
    ['slosher', { fire: true }], ['roller', { fire: true }], ['dualies', { sub: true }]]) {
    const r = rig(api, kind), control = rig(api, kind);
    // Counterfactual full native rig with the owned form gesture absent. Its
    // native action, solver and scale path still run. This isolates whether
    // form acting interferes with the live action instead of asserting an
    // unsupported all-weapons reach bound for upstream attack poses.
    control.ch._poseForm = () => {};
    try {
      for (const x of [r, control]) { form(x, 'swim'); for (let i = 0; i < 30; i++) x.step(); form(x, 'kid'); }
      for (let i = 0; i < 12; i++) { r.step(1 / 60, input); control.step(1 / 60, input); }
      assert.equal(api.formMotionSnapshot(r.ch).actionBlocked, true);
      const before = Array.from(r.ch.P), timers = Array.from(r.ch.tr), runner = gameplay(r);
      r.ch._poseForm(r.ch.P);
      assert.deepEqual(Array.from(r.ch.P), before, 'form layer leaves the live action pose untouched');
      assert.deepEqual(Array.from(r.ch.tr), timers); assert.deepEqual(gameplay(r), runner);
      assert.ok(grip(r) < .04, `${kind} drawn right-hand grip: ${grip(r)}`);
      assert.deepEqual(Array.from(r.ch.ikErr), Array.from(control.ch.ikErr),
        `${kind} retains the native action's actual solver output`);
      assert.deepEqual(r.ch.bones.handR.matrixWorld.toArray(), control.ch.bones.handR.matrixWorld.toArray());
      assert.deepEqual(r.ch.weapon.off.matrixWorld.toArray(), control.ch.weapon.off.matrixWorld.toArray());
      actionRows.push({ kind, elapsed: r.ch.formT, nativeIK: Array.from(r.ch.ikErr),
        controlNativeIK: Array.from(control.ch.ikErr), grip: grip(r),
        hand: r.ch.bones.handR.matrixWorld.toArray(), controlHand: control.ch.bones.handR.matrixWorld.toArray(),
        gun: r.ch.weapon.off.matrixWorld.toArray(), controlGun: control.ch.weapon.off.matrixWorld.toArray() });
      if (kind === 'dualies') {
        assert.equal(r.ch.bombHeld, true); assert.equal(r.ch.bomb.group.visible, true);
        r.step(1 / 60, { subReleased: true });
        assert.equal(r.ch.bombHeld, false);
        assert.ok(r.ch.tr[api.CHARACTER_TIMERS.T_THROW] < .1, 'native release actually triggers throw');
        assert.equal(api.formMotionSnapshot(r.ch).actionBlocked, true);
      } else assert.ok(r.shots > 0 || r.a.weaponRunner.firingPose(), `${kind} real action reached`);
      r.a.specialActive = { id: 'slam', t: 0, phase: 'leap' }; r.step();
      const pose = Array.from(r.ch.P); r.ch._poseForm(r.ch.P);
      assert.deepEqual(Array.from(r.ch.P), pose);
      assert.ok(Number.isFinite(r.ch.P[C.ANCR]));
    } finally { r.close(); control.close(); }
  }
  save(actionRows, 'action-native-ik.json');
});

test('spawn/reset, death, weapon replacement, hidden updates and nullable previews retain native cleanup', async () => {
  const api = await production(), r = rig(api);
  try {
    form(r, 'swim'); for (let i = 0; i < 5; i++) r.step(); form(r, 'kid'); r.step();
    r.a.reset(); assert.equal(api.formMotionSnapshot(r.ch), null);
    r.ch.trigger('spawn'); r.a.grounded = true; r.step();
    assert.equal(r.ch.kidScale, 1); assert.equal(r.ch.kidSY, 1);
    assert.equal(api.formMotionSnapshot(r.ch).phase, null);
    r.a.setWeapon('dualies'); assert.equal(api.formMotionSnapshot(r.ch), null); r.step();
    form(r, 'swim'); r.step(); r.a.splat(null); assert.equal(r.a.alive, false);
    const pose = Array.from(r.ch.P); r.ch._poseForm(r.ch.P);
    assert.deepEqual(Array.from(r.ch.P), pose); assert.equal(r.ch.root.visible, false);
    r.a.reset(); r.ch.trigger('spawn'); r.ch.setVisible(true); form(r, 'swim');
    r.ch.setVisible(false); for (let i = 0; i < 40; i++) r.step();
    assert.equal(r.ch.kid.visible, false); assert.equal(r.ch.sqScale, 1);
    r.ch.setVisible(true); r.step(); form(r, 'kid'); for (let i = 0; i < 40; i++) r.step();
    assert.equal(r.ch.kidSY, 1); assert.equal(r.ch.kid.visible, true);
  } finally { r.close(); }
  assert.equal(api.formMotionSnapshot(r.ch), null);
  assert.equal(r.ch.root.parent, null);
  const preview = new api.Character({ name: 'nullable form preview', weapon: 'shooter' });
  try {
    preview.update(0, null); preview.update(1 / 60, null);
    preview.update(0, { form: 'squid', grounded: true });
    for (let i = 0; i < 40; i++) preview.update(1 / 60, { form: 'squid', grounded: true });
    for (let i = 0; i < 40; i++) preview.update(1 / 60, { form: 'kid', grounded: true });
    assert.equal(preview.kidScale, 1); assert.equal(preview.sqScale, 0);
    assert.ok(Array.from(preview.P).every(Number.isFinite));
  } finally { preview.dispose(); }
  assert.equal(api.formMotionSnapshot(preview), null);
});
