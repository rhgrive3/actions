import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { installSquidrollMotion as duplicateInstall, squidrollMotionSnapshot as duplicateSnapshot } from '../runtime/squidroll-motion.mjs';

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
    export { installSquidrollMotion, squidrollMotionSnapshot } from './patches/splatoon3/runtime/squidroll-motion.mjs';
    export { movementMotionSnapshot } from './patches/splatoon3/runtime/movement-motion.mjs';
    export { beforeActions } from './patches/splatoon3/runtime/movement.mjs';
    export { FixedClock } from './patches/splatoon3/runtime/clock.mjs';
  `, { context, identifier: path.join(ROOT, 'squidroll-production-entry.mjs') });
  await entry.link((specifier, from) => load(specifier === 'three'
    ? path.join(SRC, 'vendor/three/build/three.module.js')
    : specifier.startsWith('three/addons/')
      ? path.join(SRC, 'vendor/three/jsm', specifier.slice('three/addons/'.length))
      : path.resolve(path.dirname(from.identifier), specifier)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = { ...entry.namespace.install(profile), ...entry.namespace, profile };
  api.installSquidrollMotion(api, profile);
  assert.throws(() => entry.namespace.install(profile), /already installed/);
  const hooks = ['update', '_updateSquid', 'trigger', 'setWeapon', 'dispose'].map(k => api.Character.prototype[k]);
  api.installSquidrollMotion(api, profile); duplicateInstall(api, profile);
  assert.deepEqual(['update', '_updateSquid', 'trigger', 'setWeapon', 'dispose'].map(k => api.Character.prototype[k]), hooks);
  const { G, THREE, Physics } = api, V = THREE.Vector3;
  G.scene = new THREE.Scene(); G.settings = { quality: 'high' };
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  const center = new V(0, -.1, 0), half = new V(100, .1, 100);
  const floor = { id: 0, solid: true, center, half, axes: [new V(1, 0, 0), new V(0, 1, 0), new V(0, 0, 1)],
    faces: [-1, -1, 0, -1, -1, -1], aabbMin: center.clone().sub(half), aabbMax: center.clone().add(half) };
  G.level = { blocks: [floor], faces: [{ origin: new V(-100, 0, -100), u: new V(1, 0, 0), v: new V(0, 0, 1) }],
    spawnPads: [new V(-80, 0, 0), new V(80, 0, 0)], spawnBarrier: 0,
    hasRails: false, groundHeight: () => 0, queryBlocks: (_x, _z, _xx, _zz, out) => { out.length = 0; out.push(0); return out; } };
  G.physics = new Physics(G.level);
  G.paint = { sample: () => 1, splat: () => 0 };
  G.match = { playing: () => true, canRespawn: () => false };
  G.projectiles = Object.fromEntries(['fireShooter', 'fireDualies', 'fireCharger', 'fireSplatling',
    'fireBlaster', 'fireSlosh', 'throwBomb', 'fireFlick'].map(k => [k, () => {}]));
  G.actors = []; G.time = 0;
  cached = api; return api;
}
function rig(api, enabled = true, weapon = 'shooter') {
  const { G, THREE, Actor, Character } = api;
  const a = new Actor({ team: 0, name: 'actual squidroll regression', weapon,
    CharacterClass: Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const ch = a.character; ch.actor = a; ch.onEvent = null; ch.s3SquidrollMotionEnabled = enabled;
  G.scene.add(ch.root); G.actors = [a]; G.time = 0;
  const step = (dt = 1 / 60, input = {}) => {
    if (input.move) a.intent.move.fromArray(input.move);
    for (const k of ['jump', 'squid', 'fire', 'sub', 'special']) if (k in input) a.intent[k] = input[k];
    G.time += dt; a.update(dt); ch.root.updateMatrixWorld(true);
  };
  const visual = (dt = 1 / 60) => { a._finishFrame(dt); ch.root.updateMatrixWorld(true); };
  for (let i = 0; i < 60; i++) step();
  assert.equal(ch._owner(), a); assert.equal(ch._runner(), a.weaponRunner);
  return { api, a, ch, step, visual,
    close() { G.scene.remove(ch.root); G.actors = []; ch.dispose(); assert.equal(api.squidrollMotionSnapshot(ch), null); } };
}
function prepare(r) {
  for (let i = 0; i < 45; i++) r.step(1 / 60, { squid: true, jump: false, move: [0, 0, 1] });
  assert.equal(r.a.submerged, true); assert.equal(r.ch.squidRoot.visible, true); assert.equal(r.ch.kid.visible, false);
}
function launch(r, dir = [0, 0, -1]) {
  r.step(1 / 60, { squid: true, jump: true, move: dir });
  assert.ok(r.a.s3.actions.roll, 'actual native beforeActions launches Roll');
  r.a.intent.jump = false;
}
function mantle(r) {
  return new r.api.THREE.Vector3(0, 1, 0).applyQuaternion(r.ch.squid.pivot.getWorldQuaternion(new r.api.THREE.Quaternion()));
}
function nativeMantle(r) {
  const q = r.ch.model.getWorldQuaternion(new r.api.THREE.Quaternion()).multiply(r.ch.sqQuat);
  return new r.api.THREE.Vector3(0, 1, 0).applyQuaternion(q);
}
function gameplay(r) {
  const a = r.a, runner = a.weaponRunner;
  return JSON.parse(JSON.stringify({ pos: a.pos.toArray(), vel: a.vel.toArray(), yaw: a.yaw,
    form: a.form, grounded: a.grounded, submerged: a.submerged, hp: a.hp, ink: a.ink,
    intent: a.intent, actions: a.s3.actions, jump: a.superJumpState, special: a.specialActive,
    clocks: [a.airTime, a.landT, a.kidT, a.coyote, a.jumpBuffer, a.lastFire, a.lastDamage],
    runner: { cd: runner.cd, charge: runner.charge, chargeT: runner.chargeT, dodge: runner.dodge,
      fuse: runner.fuse, slosh: runner.slosh, rolling: runner.rolling, lockT: runner.lockT },
    nativeTimers: Array.from(r.ch.tr), nativeSprings: Array.from(r.ch.sp) }));
}
// CPU evaluation of the actual squid vertex shader's displacement, using the
// actual indexed geometry and uniforms. GPU/browser validation is parent-owned.
function squidVertex(r, mesh, i) {
  const g = mesh.geometry, p = new r.api.THREE.Vector3().fromBufferAttribute(g.attributes.position, i);
  if (mesh === r.ch.squid.body) {
    const col = g.attributes.color, wig = col.getY(i), ph = col.getZ(i) * 6.2831;
    const u = r.ch.u, amp = u.uWig.value.x, freq = u.uWig.value.y, time = u.uTime.value;
    const s = Math.sin(time * freq + ph - wig * 4.2), c = Math.cos(time * freq * .8 + ph * 1.3 - wig * 3.1);
    const k = wig * wig * amp * 2, len = Math.hypot(p.x, p.z);
    const rx = len > 1e-4 ? p.x / len : 0, rz = len > 1e-4 ? p.z / len : 1;
    p.x += rx * s * k * 1.1 - rz * c * k * .9;
    p.z += rz * s * k * 1.1 + rx * c * k * .9;
    p.y += (s * .5 + .5) * wig * amp * .8 + s * k * .35;
  }
  return mesh.localToWorld(p);
}
function posed(r, dense = false) {
  const { ch, api } = r, q = ch.squid.pivot.quaternion.toArray();
  const meshes = [ch.squid.body, ch.squid.dark, ch.squid.eyes];
  const geometry = meshes.map(mesh => {
    const g = mesh.geometry; assert.ok(g.index.count > 0);
    const ids = dense ? Array.from({ length: g.attributes.position.count }, (_, i) => i)
      : Array.from({ length: 32 }, (_, n) => g.index.getX(Math.floor(n * (g.index.count - 1) / 31)));
    return { vertices: ids.map(i => squidVertex(r, mesh, i).toArray()),
      indices: dense ? Array.from(g.index.array) : ids };
  });
  ch.skeleton.update();
  const skin = ch.kid.children.find(x => x.isSkinnedMesh);
  assert.ok(skin?.geometry.index.count > 0, 'actual native drawn kid geometry exists');
  const drawn = skin.getVertexPosition(skin.geometry.index.getX(0), new api.THREE.Vector3());
  return { q: Array.from(q), scale: Array.from(ch.squid.pivot.scale.toArray()),
    mantle: Array.from(mantle(r).toArray()), nativeMantle: Array.from(nativeMantle(r).toArray()),
    pivot: Array.from(ch.squid.pivot.getWorldPosition(new api.THREE.Vector3()).toArray()),
    root: Array.from(ch.root.position.toArray()), model: Array.from(ch.model.matrixWorld.elements),
    nativeIK: Array.from(ch.ikErr), pose: Array.from(ch.P), skinVertex: Array.from(skin.localToWorld(drawn).toArray()),
    bones: Object.fromEntries(['hips', 'head', 'handR', 'handL', 'footR', 'footL'].map(k => [k,
      Array.from(ch.bones[k].matrixWorld.elements)])),
    weapon: Array.from(ch.weapon.off.matrixWorld.elements), geometry,
    form: ch.form, kidVisible: ch.kid.visible, squidVisible: ch.squidRoot.visible,
    action: JSON.parse(JSON.stringify(api.movementMotionSnapshot(ch))),
    motion: JSON.parse(JSON.stringify(api.squidrollMotionSnapshot(ch))) };
}
function save(rows) {
  const destination = process.env.INKWAVE_SQUIDROLL_TRACE_PATH;
  if (!destination) return;
  const dir = fs.realpathSync(path.dirname(destination));
  assert.ok(dir.startsWith('/mnt/workspace/.dev-state/agent-work/evidence/'));
  const file = path.join(dir, path.basename(destination));
  const body = { schema: 1, proof: 'actual native indexed geometry/pose with CPU shader displacement; no GPU proof',
    sourceHash: createHash('sha256').update(fs.readFileSync(path.join(SRC, 'src/game/character.js'))).digest('hex'),
    runtimeHash: createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/runtime/squidroll-motion.mjs'))).digest('hex'), rows };
  fs.writeFileSync(file + '.pending', JSON.stringify(body) + '\n'); fs.renameSync(file + '.pending', file);
}

test('actual production Roll turns mantle end over end, follows launch direction and preserves native gameplay/IK', async () => {
  const api = await production(), rows = [], histories = [];
  for (const enabled of [false, true]) {
    const r = rig(api, enabled), history = [];
    try {
      prepare(r); launch(r);
      for (let i = 0; i < 60; i++) {
        if (i) r.step();
        const shape = posed(r, [0, 3, 6, 9, 13, 16, 59].includes(i));
        history.push({ gameplay: gameplay(r), shape });
        if ([0, 3, 6, 9, 13, 16, 59].includes(i)) rows.push({ enabled, tick: i, shape });
      }
      assert.equal(r.a.grounded, true, 'native collision must actually land');
      assert.equal(api.squidrollMotionSnapshot(r.ch).phase, null);
      assert.ok(r.ch.squid.pivot.quaternion.angleTo(r.ch.sqQuat) < 1e-6);
      // Squid frames hide the kid; returning to kid must execute the real
      // native two-bone solver again and preserve drawn bones/weapon grips.
      const solve = r.ch._solveLimb; let solved = 0;
      r.ch._solveLimb = function (...args) { solved++; return solve.apply(this, args); };
      for (let i = 0; i < 60; i++) r.step(1 / 60, { squid: false, move: [0, 0, 0] });
      assert.ok(solved > 100, 'native IK must execute after Roll/form recovery');
      assert.equal(r.ch.kid.visible, true); assert.equal(r.ch.squidRoot.visible, false);
      const grip = r.ch.weapon.off.localToWorld(r.ch.weapon.def.handR.pos.clone());
      assert.ok(grip.distanceTo(r.ch.bones.handR.getWorldPosition(new api.THREE.Vector3())) < .025);
      assert.ok(r.ch.ikErr.every(e => Number.isFinite(e) && e < .001));
      const returned = posed(r, true); returned.nativeIKCalls = solved;
      history.push({ gameplay: gameplay(r), shape: returned });
      rows.push({ enabled, tick: 119, shape: returned });
      histories.push(history);
    } finally { r.close(); }
  }
  for (let i = 0; i < histories[0].length; i++) {
    assert.deepEqual(histories[1][i].gameplay, histories[0][i].gameplay, `native state unchanged at ${i}`);
    const a = histories[0][i].shape, b = histories[1][i].shape;
    for (const k of ['nativeIK', 'pose', 'bones', 'weapon', 'root', 'model', 'skinVertex']) assert.deepEqual(b[k], a[k], `${k} unchanged at ${i}`);
  }
  const V = api.THREE.Vector3, baseline = histories[0][6].shape, corrected = histories[1][6].shape;
  assert.ok(new V().fromArray(baseline.mantle).dot(new V().fromArray(baseline.nativeMantle)) > .999,
    'baseline axial turn leaves the mantle direction unchanged');
  // Compare the vertical component: native heading lags the reversal, so a
  // dot product against that old heading can hide a genuine half-turn.
  assert.ok(corrected.mantle[1] < -.25 && corrected.nativeMantle[1] > .25,
    `visible mantle turns down while the native flight pose points up: ${corrected.mantle} / ${corrected.nativeMantle}`);
  const first = histories[1][0].shape.mantle;
  assert.ok(new V(first[0], 0, first[2]).normalize().dot(new V(0, 0, -1)) > .98,
    'visible mantle faces reversal on launch instead of waiting for swim yaw');
  const distances = corrected.geometry[0].vertices.map((p, i) => {
    const b = baseline.geometry[0].vertices[i]; return Math.hypot(p[0] - b[0], p[1] - b[1], p[2] - b[2]);
  });
  const rms = Math.sqrt(distances.reduce((sum, d) => sum + d * d, 0) / distances.length);
  assert.ok(rms > .1, `actual indexed body surface moves, not just a target/constant (RMS ${rms})`);
  for (let i = 12; i < 17; i++) {
    const a = histories[1][i - 1].shape.q, b = histories[1][i].shape.q;
    assert.ok(new api.THREE.Quaternion().fromArray(a).angleTo(new api.THREE.Quaternion().fromArray(b)) < .65,
      'late Roll recovers without a half-turn snap');
  }
  save(rows);
});

test('FixedClock 30/60/120Hz rendering gives identical native trajectory and posed geometry', async () => {
  const api = await production(), traces = [];
  for (const hz of [30, 60, 120]) {
    const r = rig(api), clock = new api.FixedClock(), rows = [];
    try {
      prepare(r);
      for (let i = 0; i < hz; i++) clock.advance(1 / hz, dt => {
        r.step(dt, { squid: true, jump: clock.ticks === 0, move: [0, 0, -1] });
        rows.push({ gameplay: gameplay(r), shape: posed(r) });
      });
      assert.equal(clock.ticks, 60); assert.equal(r.a.grounded, true);
      traces.push(rows);
    } finally { r.close(); }
  }
  assert.deepEqual(traces[0], traces[1]); assert.deepEqual(traces[1], traces[2]);
});

test('fresh chained direction replaces the old roll without feeding native pose springs', async () => {
  const api = await production(), r = rig(api);
  try {
    prepare(r); launch(r);
    const first = api.squidrollMotionSnapshot(r.ch).sequence;
    for (let i = 0; i < 45; i++) r.step();
    assert.equal(r.a.grounded, true); assert.ok(r.a.s3.actions.chain > 0);
    r.a.submerged = true; r.a.vel.set(0, 0, -11.52); r.a.intent.move.set(1, 0, 0);
    assert.equal(api.beforeActions(r.a, 1 / 60, true), true); r.visual();
    const next = api.squidrollMotionSnapshot(r.ch);
    assert.equal(next.sequence, first + 1); assert.deepEqual(Array.from(next.direction), [1, 0, 0]);
    assert.ok(Math.abs(mantle(r).x) > .7, 'real surface faces the new lateral launch');
    assert.ok(Math.abs(next.age - 1 / 60) < 1e-9); assert.ok(r.a.s3.actions.chain >= 2);
    assert.deepEqual(duplicateSnapshot(r.ch), next, 'second module realm sees installed snapshot');
    // Eligibility is staged here; native wall-roll launch and _setClimb(false)
    // still execute. This is not a physical painted-wall/Switch comparison.
    r.a.climbing = true; r.a.wallN.set(0, 0, 1); r.a.intent.move.set(0, 0, 1);
    assert.equal(api.beforeActions(r.a, 0, true), true); r.visual();
    assert.equal(r.a.climbing, false);
    const wall = api.squidrollMotionSnapshot(r.ch);
    assert.deepEqual(Array.from(wall.direction), [0, 0, 1]);
    assert.ok(mantle(r).z > .7, 'native wall-roll departure faces the captured launch normal');
  } finally { r.close(); }
});

test('nullable previews, custom duration, dt0/pause and direct 30/60/120Hz cancel cleanly', async () => {
  const api = await production();
  for (const hz of [30, 60, 120]) {
    const ch = new api.Character({ name: 'roll preview', weapon: 'shooter', style: { hair: 0, skin: 2 } });
    const state = { form: 'squid', grounded: false, speed: 6, vy: 1, localMove: { x: -1, z: 0 } };
    try {
      for (let i = 0; i < hz; i++) ch.update(1 / hz, state);
      ch.trigger('squidroll', { duration: .2 }); ch.update(1 / hz, state);
      const before = api.squidrollMotionSnapshot(ch), q = ch.squid.pivot.quaternion.toArray();
      for (let i = 0; i < 5; i++) ch.update(0, state);
      assert.deepEqual(api.squidrollMotionSnapshot(ch), before);
      assert.deepEqual(ch.squid.pivot.quaternion.toArray(), q);
      for (let i = 1; i < hz / 5 + 1; i++) ch.update(1 / hz, state);
      assert.equal(api.squidrollMotionSnapshot(ch).phase, null);
      assert.ok(ch.squid.pivot.quaternion.angleTo(ch.sqQuat) < 1e-6);
      ch.update(0, null); assert.equal(ch.form, 'kid');
    } finally { ch.dispose(); }
  }
});

test('reset, death, form/sub/weapon interruption, hidden body and other action branches leave no stranded offset', async t => {
  const api = await production();
  for (const kind of ['reset', 'death', 'form', 'sub', 'weapon', 'hidden', 'surge', 'superjump']) await t.test(kind, () => {
    const r = rig(api);
    try {
      prepare(r); launch(r); r.step();
      assert.equal(api.squidrollMotionSnapshot(r.ch).phase, 'roll');
      if (kind === 'reset') { r.a.reset(); r.visual(0); }
      if (kind === 'death') { r.a.splat(null); r.visual(0); }
      if (kind === 'form') r.step(1 / 60, { squid: false });
      if (kind === 'sub') { r.a.anim.subAim = true; r.ch.update(0, r.a.anim); }
      if (kind === 'weapon') { r.a.setWeapon('dualies'); r.visual(0); }
      if (kind === 'hidden') { r.ch.setVisible(false); for (let i = 0; i < 20; i++) r.step(); r.ch.setVisible(true); r.visual(0); }
      if (kind === 'surge') { r.a.s3.actions.roll = null; r.a.climbing = true; r.a.anim.wallNormal.set(0, 0, 1);
        r.a.s3.actions.surge = { phase: 'charge', charge: .5 }; r.ch.trigger('squidsurge'); r.visual(); }
      if (kind === 'superjump') { r.a.superJump(new api.THREE.Vector3(0, 0, 8)); r.visual(0); }
      assert.equal(api.squidrollMotionSnapshot(r.ch).phase, null);
      assert.equal(api.squidrollMotionSnapshot(r.ch).applied, kind === 'sub' || kind === 'weapon');
      if (!['surge', 'superjump', 'sub', 'weapon'].includes(kind))
        assert.ok(r.ch.squid.pivot.quaternion.angleTo(r.ch.sqQuat) < 1e-6);
    } finally { r.close(); }
  });
});

test('ordinary swim, wall Surge and Super Jump pose remain byte-identical with the Roll layer enabled', async () => {
  const api = await production();
  for (const kind of ['swim', 'surge', 'superjump']) {
    const traces = [];
    for (const enabled of [false, true]) {
      const r = rig(api, enabled);
      try {
        prepare(r);
        if (kind === 'surge') { r.a.climbing = true; r.a.grounded = false; r.a.anim.wallNormal.set(0, 0, 1);
          r.a.s3.actions = { roll: null, surge: { phase: 'charge', charge: .5 } }; }
        if (kind === 'superjump') r.a.superJump(new api.THREE.Vector3(0, 0, 8));
        for (let i = 0; i < 4; i++) r.visual();
        const row = posed(r); delete row.motion; traces.push(row);
      } finally { r.close(); }
    }
    assert.deepEqual(traces[0], traces[1], `${kind} channels unchanged`);
  }
});

test('repeated native Rolls keep scene resources bounded and disposal preserves shared indexed geometry', async () => {
  const api = await production(), r = rig(api);
  const geometry = r.ch.squid.body.geometry, material = r.ch.mats.squid;
  let geometryDisposals = 0, materialDisposals = 0;
  const sharedDisposed = () => geometryDisposals++, ownDisposed = () => materialDisposals++;
  geometry.addEventListener('dispose', sharedDisposed); material.addEventListener('dispose', ownDisposed);
  try {
    prepare(r);
    const objects = []; r.ch.root.traverse(obj => objects.push(obj));
    const sceneSize = api.G.scene.children.length;
    for (let n = 0; n < 8; n++) {
      const sign = n % 2 ? 1 : -1;
      r.a.vel.set(0, 0, -sign * 11.52); r.a.intent.move.set(0, 0, sign);
      assert.equal(api.beforeActions(r.a, 1 / 60, true), true);
      r.visual(); assert.equal(api.squidrollMotionSnapshot(r.ch).phase, 'roll');
      for (let i = 0; i < 60; i++) r.step();
      assert.equal(r.a.grounded, true); assert.equal(api.squidrollMotionSnapshot(r.ch).phase, null);
      const current = []; r.ch.root.traverse(obj => current.push(obj));
      assert.deepEqual(current, objects); assert.equal(api.G.scene.children.length, sceneSize);
      assert.equal(r.ch.squid.body.geometry, geometry);
    }
  } finally {
    r.close(); geometry.removeEventListener('dispose', sharedDisposed);
  }
  assert.equal(geometryDisposals, 0, 'shared native geometry must survive character disposal');
  assert.equal(materialDisposals, 1, 'native per-character material disposes exactly once');
});
