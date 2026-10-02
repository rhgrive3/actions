import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { installEmotesMotion as duplicateRealmInstall } from '../runtime/emotes-motion.mjs';

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
    export { installFlowMotion } from './patches/splatoon3/runtime/flow-motion.mjs';
    export { installEmotesMotion, emotesMotionSnapshot } from './patches/splatoon3/runtime/emotes-motion.mjs';
    export { FixedClock } from './patches/splatoon3/runtime/clock.mjs';
  `, { context, identifier: path.join(ROOT, 'emotes-production-entry.mjs') });
  await entry.link((specifier, from) => load(specifier === 'three'
    ? path.join(SRC, 'vendor/three/build/three.module.js')
    : specifier.startsWith('three/addons/')
      ? path.join(SRC, 'vendor/three/jsm', specifier.slice('three/addons/'.length))
      : path.resolve(path.dirname(from.identifier), specifier)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = { ...entry.namespace.install(profile), ...entry.namespace, profile };
  api.installFlowMotion(api); api.installEmotesMotion(api, profile);
  const hooks = ['update', 'trigger', 'setDance', '_poseDance', 'setWeapon', 'dispose'];
  const before = hooks.map(name => api.Character.prototype[name]);
  api.installEmotesMotion(api, profile); duplicateRealmInstall(api, profile);
  assert.deepEqual(hooks.map(name => api.Character.prototype[name]), before,
    'Symbol.for prototype guard must reject duplicate module realms');
  assert.throws(() => entry.namespace.install(profile), /already installed/);
  const { G, THREE } = api;
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.scene = new THREE.Scene(); G.settings = { quality: 'high' };
  G.level = { blocks: [], groundHeight: () => 0 };
  G.paint = { sample: () => 1, splat: () => 0 }; G.match = { playing: () => true, canRespawn: () => false };
  G.physics = { los: () => true, raycast: (_a, _b, _c, hit) => { hit.hit = false; return hit; } };
  G.projectiles = Object.fromEntries(['fireShooter', 'fireDualies', 'fireCharger', 'fireSplatling',
    'fireBlaster', 'fireSlosh', 'throwBomb', 'fireFlick'].map(name => [name, () => {}]));
  G.actors = []; G.time = 0;
  cached = api; return api;
}
function rig(api, { kind = 'shooter', native = false, actor = false } = {}) {
  const a = actor ? new api.Actor({ team: 0, name: 'emotes native production regression', weapon: kind,
    CharacterClass: api.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } }) : null;
  const ch = a?.character || new api.Character({ name: 'emotes native production regression', weapon: kind,
    style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  ch.onEvent = null; ch.s3EmotesMotionEnabled = !native;
  if (a) { ch.actor = a; api.G.actors.push(a); a.grounded = a.ground.hit = true; }
  const state = { form: 'kid', grounded: true, localMove: { x: 0, z: 0 }, speed: 0,
    firing: false, rolling: false, charge: 0, subAim: false, ink: 1, hp: 1, vy: 0 };
  const step = (dt = 1 / 60, overrides = {}) => {
    api.G.time += dt; ch.update(dt, overrides === null ? null : { ...state, ...overrides });
    ch.root.updateMatrixWorld(true); ch.skeleton.update();
    assert.ok(Array.from(ch.P).every(Number.isFinite));
  };
  for (let i = 0; i < 90; i++) step();
  return { api, a, ch, state, step,
    dance(variant = 0, name = 'victory') { ch.setDance(name); ch.danceVar = variant; },
    close() { api.G.actors = api.G.actors.filter(x => x !== a); ch.dispose(); } };
}
function advance(r, seconds, hz = 60) { for (let i = 0; i < Math.round(seconds * hz); i++) r.step(1 / hz); }
function grip(r, side = 'R') {
  const w = side === 'L' ? r.ch.weapon.left : r.ch.weapon;
  const bone = side === 'L' ? r.ch.bones.handL : r.ch.bones.handR;
  const point = side === 'L' ? w.def.handL : w.def.handR;
  return w.off.localToWorld(point.pos.clone()).distanceTo(bone.getWorldPosition(new r.api.THREE.Vector3()));
}
function drawnGeometry(r) {
  // Evaluate vertices addressed by actual native draw indices, with native
  // skinning and mesh/world transforms. This is CPU posed geometry, not AABB
  // or target-assignment evidence; GPU shader deformation is parent-owned.
  const meshes = [...Object.values(r.ch.meshes)];
  r.ch.weapon.pivot.traverse(m => { if (m.isMesh) meshes.push(m); });
  if (r.ch.weapon.left) r.ch.weapon.left.pivot.traverse(m => { if (m.isMesh) meshes.push(m); });
  const v = new r.api.THREE.Vector3(), rows = [];
  for (const mesh of meshes) {
    let visible = true;
    for (let p = mesh; p; p = p.parent) if (!p.visible) visible = false;
    const index = mesh.geometry.index;
    if (!visible || !index) continue;
    const start = mesh.geometry.drawRange.start;
    const count = Math.min(index.count - start, mesh.geometry.drawRange.count);
    if (!(count >= 3)) continue;
    const vertices = [];
    for (let n = 0; n < Math.min(24, Math.floor(count / 3)); n++) {
      const triangle = Math.floor(n * (Math.floor(count / 3) - 1) / 23);
      for (let c = 0; c < 3; c++) {
        const drawIndex = start + Math.max(0, triangle) * 3 + c;
        mesh.getVertexPosition(index.getX(drawIndex), v).applyMatrix4(mesh.matrixWorld);
        assert.ok(v.toArray().every(Number.isFinite));
        vertices.push({ drawIndex, vertexIndex: index.getX(drawIndex), position: v.toArray() });
      }
    }
    rows.push({ name: mesh.name, skinned: !!mesh.isSkinnedMesh, indexCount: index.count, drawCount: count, vertices });
  }
  assert.ok(rows.some(m => m.skinned)); assert.ok(rows.some(m => !m.skinned));
  return rows;
}
function capture(r, stage) {
  return { stage, diagnostic: r.api.emotesMotionSnapshot(r.ch), dance: r.ch.dance,
    nativeDanceTime: r.ch.danceT, nativePhaseOffset: r.ch.danceOfs, pose: Array.from(r.ch.P),
    dancePose: Array.from(r.ch.PD), nativeIK: Array.from(r.ch.ikErr),
    grips: r.ch.dual ? [grip(r), grip(r, 'L')] : [grip(r)],
    bones: Object.fromEntries(Object.entries(r.ch.bones).map(([name, b]) => [name, {
      position: b.getWorldPosition(new r.api.THREE.Vector3()).toArray(), quaternion: b.quaternion.toArray() }])),
    bodyTransform: r.ch.kid.matrixWorld.toArray(), weaponTransform: r.ch.weapon.off.matrixWorld.toArray(),
    geometry: drawnGeometry(r) };
}
function writeTrace(rows, suffix = '') {
  const destination = process.env.INKWAVE_EMOTES_TRACE_PATH;
  if (!destination) return;
  const folder = fs.realpathSync(path.dirname(destination));
  assert.ok(folder.startsWith('/mnt/workspace/.dev-state/agent-work/evidence/'));
  const file = path.join(folder, path.basename(destination) + suffix);
  const body = { schema: 1, evidence: 'actual native-source CPU posed bones, indexed geometry and native IK; no GPU or console claim',
    runtimeSha256: createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/runtime/emotes-motion.mjs'))).digest('hex'), rows };
  fs.writeFileSync(file + '.pending', JSON.stringify(body, null, 2) + '\n'); fs.renameSync(file + '.pending', file);
}
const difference = (a, b) => Math.max(...a.map((x, i) => Math.abs(x - b[i])));

test('native victory poses start at onset and hold their ending instead of restarting the action', async () => {
  const api = await production(), evidence = [];
  for (const variant of [0, 1, 2]) {
    const before = rig(api, { native: true }), after = rig(api);
    try {
      assert.ok(before.ch.danceOfs > .25); assert.equal(after.ch.danceOfs, before.ch.danceOfs);
      before.dance(variant); after.dance(variant); advance(before, .5); advance(after, .5);
      const b = capture(before, `native-v${variant}-onset`), a = capture(after, `patched-v${variant}-onset`);
      assert.ok(difference(b.dancePose, a.dancePose) > .1, 'seed offset previously skipped into the action');
      assert.notDeepEqual(b.geometry, a.geometry, 'the correction must change actual drawn indexed geometry');
      assert.notDeepEqual(b.bones, a.bones); evidence.push(b, a);
      advance(before, 4.5); advance(after, 4.5);
      const nativeEnding = Array.from(before.ch.PD), held = Array.from(after.ch.PD);
      assert.equal(api.emotesMotionSnapshot(after.ch).phase, 'hold');
      evidence.push(capture(before, `native-v${variant}-5s`), capture(after, `patched-v${variant}-5s`));
      advance(before, 2); advance(after, 2);
      assert.deepEqual(Array.from(after.ch.PD), held, 'finishing pose stays held while native breathing remains active');
      assert.ok(difference(Array.from(before.ch.PD), nativeEnding) > .1, 'native action visibly restarted');
      assert.ok(grip(after) < .025, 'actual weapon grip survives retiming');
      assert.ok(Array.from(after.ch.ikErr).every(error => error < .0005), 'native solver still reaches the sampled pose');
      assert.equal(after.ch.danceT, before.ch.danceT, 'no native clock was rewritten');
      evidence.push(capture(after, `patched-v${variant}-7s`));
    } finally { before.close(); after.close(); }
  }
  writeTrace(evidence);
});

test('native outgoing victory selection and held pose survive fade into idle', async () => {
  const api = await production(), r = rig(api);
  try {
    r.dance(2); advance(r, 5); const held = Array.from(r.ch.PD);
    r.ch.setDance(null); r.step();
    assert.deepEqual(Array.from(r.ch.PD), held, 'clearing danceT must not restart the fading pose');
    r.dance(2); advance(r, 5); r.ch.setDance('menu_idle');
    const current = r.ch.danceVar; r.step();
    assert.equal(r.ch.danceVar, current, 'outgoing evaluation restores current selection');
    assert.deepEqual(Array.from(r.ch.PY), held, 'crossfade uses the outgoing explicit variant');
    r.ch.setDance(null); advance(r, 2); r.dance(0); r.ch.danceT = 2.86; r.step(0);
    assert.ok(Math.abs(api.emotesMotionSnapshot(r.ch).poseTime - 2.86) < 1e-10,
      'the native flex showcase explicitly starts mid-action and must retain that offset');
  } finally { r.close(); }
});

test('unsupported original defeat/menu mappings retain native poses and preview/locker actions', async () => {
  const api = await production();
  for (const name of ['defeat', 'menu_idle', 'lobby_pose', 'locker_idle']) {
    for (const kind of ['shooter', 'dualies', 'roller', 'charger', 'blaster', 'slosher', 'splatling']) {
      const before = rig(api, { native: true, kind }), after = rig(api, { kind });
      try {
        for (const variant of name === 'defeat' ? [0, 1, 2] : [0]) {
          before.dance(variant, name); after.dance(variant, name);
          for (let frame = 0; frame < 100; frame++) { before.step(.1); after.step(.1); }
          assert.deepEqual(Array.from(after.ch.P), Array.from(before.ch.P), `${name}/${kind}/${variant} remains native`);
          assert.deepEqual(after.ch.bones.handR.quaternion.toArray(), before.ch.bones.handR.quaternion.toArray());
        }
        for (const event of ['admire', 'hairflip', 'wink', 'jump', 'land']) {
          before.ch.trigger(event, 4); after.ch.trigger(event, 4); before.step(); after.step();
          assert.equal(after.ch.dance, name); assert.deepEqual(Array.from(after.ch.P), Array.from(before.ch.P));
        }
      } finally { before.close(); after.close(); }
    }
  }
});

test('production fixed clock produces identical full emote bones and native IK at 30/60/120Hz', async () => {
  const api = await production(), traces = [];
  for (const hz of [30, 60, 120]) {
    const r = rig(api), clock = new api.FixedClock(), rows = [];
    try {
      r.dance(0);
      for (let frame = 0; frame < 5 * hz; frame++) clock.advance(1 / hz, dt => {
        r.step(dt); rows.push({ P: Array.from(r.ch.P), IK: Array.from(r.ch.ikErr),
          hips: r.ch.bones.hips.position.toArray(), hand: r.ch.bones.handR.quaternion.toArray(),
          weapon: r.ch.weapon.off.matrixWorld.toArray(), snapshot: api.emotesMotionSnapshot(r.ch) });
      });
      assert.equal(clock.ticks, 300); traces.push(rows);
      const paused = capture(r, 'paused'); const ticks = clock.ticks;
      clock.advance(0, dt => r.step(dt)); assert.equal(clock.ticks, ticks);
      assert.deepEqual(capture(r, 'paused'), paused);
      const time = r.ch.danceT, pose = Array.from(r.ch.PD); r.step(0, null);
      assert.equal(r.ch.danceT, time); assert.deepEqual(Array.from(r.ch.PD), pose);
    } finally { r.close(); }
  }
  assert.deepEqual(traces[0], traces[1]); assert.deepEqual(traces[1], traces[2]);
  // Direct preview clocks are not identical to fixed gameplay integration;
  // nevertheless all frame intervals reach the same held native dance pose.
  const held = [];
  for (const hz of [30, 60, 120]) {
    const r = rig(api); try { r.dance(2); advance(r, 5, hz); held.push(Array.from(r.ch.PD)); }
    finally { r.close(); }
  }
  assert.deepEqual(held[0], held[1]); assert.deepEqual(held[1], held[2]);
});

function gameplay(r) {
  const a = r.a, w = a.weaponRunner;
  return { root: r.ch.root.position.toArray(), rootRotation: r.ch.root.quaternion.toArray(),
    position: a.pos.toArray(), velocity: a.vel.toArray(), input: JSON.stringify(a.intent),
    hp: a.hp, ink: a.ink, alive: a.alive, special: a.special, form: a.form,
    runner: Object.fromEntries(Object.entries(w).filter(([, value]) => ['number', 'boolean'].includes(typeof value))),
    timers: Array.from(r.ch.tr), danceTime: r.ch.danceT };
}
test('emote interruptions clear presentation only and native gameplay remains authoritative', async () => {
  const api = await production();
  for (const [name, input] of [['form', { form: 'squid' }], ['sub', { subAim: true }],
    ['action', { firing: true }], ['charge', { charge: .5 }], ['roll', { rolling: true }]]) {
    const r = rig(api, { actor: true }), native = rig(api, { actor: true, native: true });
    try {
      r.dance(0); native.dance(0); advance(r, .5); advance(native, .5);
      r.step(0, input); native.step(0, input);
      assert.equal(r.ch.dance, null, name); assert.equal(r.ch.lastDance, null); assert.equal(r.ch.wDance, 0);
      assert.deepEqual(gameplay(r), { ...gameplay(native), danceTime: 0 },
        'native form/event timer effects must remain authoritative');
      assert.equal(api.emotesMotionSnapshot(r.ch).phase, 'off');
    } finally { r.close(); native.close(); }
  }
  for (const event of ['shoot', 'throw', 'slosh', 'charge_release', 'dodge', 'leap', 'slam', 'spawn', 'squidroll']) {
    const before = rig(api, { actor: true, native: true }), after = rig(api, { actor: true });
    try {
      before.dance(0); after.dance(0); advance(before, .5); advance(after, .5);
      const arg = event === 'dodge' ? { x: 1, z: 0, t: .2 } : undefined;
      before.ch.trigger(event, arg); after.ch.trigger(event, arg);
      assert.equal(after.ch.dance, null, event);
      assert.deepEqual(gameplay(after), { ...gameplay(before), danceTime: 0 }, `${event} preserves native event effects`);
    } finally { before.close(); after.close(); }
  }
  for (const action of ['reset', 'death', 'weapon']) {
    const before = rig(api, { actor: true, native: true }), after = rig(api, { actor: true });
    try {
      before.dance(1); after.dance(1); advance(before, .5); advance(after, .5);
      for (const r of [before, after]) {
        if (action === 'reset') r.a.reset();
        if (action === 'death') r.a.splat(null);
        if (action === 'weapon') r.a.setWeapon('dualies');
      }
      assert.equal(after.ch.dance, null, action);
      assert.deepEqual(gameplay(after), { ...gameplay(before), danceTime: 0 });
    } finally { before.close(); after.close(); }
  }
});

test('disposal retires emote state and allocates no extra GPU resources', async () => {
  const api = await production(), r = rig(api); r.dance(); r.step();
  const childCount = r.ch.root.children.length; let materialDisposed = 0;
  r.ch.mats.skin.addEventListener('dispose', () => materialDisposed++);
  r.ch.dispose(); r.ch.dispose();
  assert.equal(materialDisposed, 1); assert.equal(api.emotesMotionSnapshot(r.ch), null);
  r.ch.update(1 / 60, null); assert.equal(api.emotesMotionSnapshot(r.ch), null);
  assert.equal(r.ch.root.children.length, childCount);
});

test('native runner and Actor frame resume shooting/sub poses after a presentation', async () => {
  const api = await production(), before = rig(api, { actor: true, native: true }), after = rig(api, { actor: true });
  try {
    before.dance(1); after.dance(1); advance(before, 5); advance(after, 5);
    const trace = [capture(after, 'held-before-native-runner')];
    let shots = 0; const fire = api.G.projectiles.fireShooter;
    api.G.projectiles.fireShooter = (...args) => { shots++; return fire(...args); };
    try {
      for (let i = 0; i < 45; i++) for (const r of [before, after]) {
        r.a.intent.fire = true; r.a.weaponRunner.update(1 / 60, { fire: true, sub: false });
        r.a._finishFrame(1 / 60); r.ch.root.updateMatrixWorld(true); r.ch.skeleton.update();
      }
      assert.ok(shots > 2, 'actual native runner must produce attacks');
      assert.equal(after.ch.dance, null); assert.ok(after.ch.wAim > .99);
      assert.ok(after.ch.P[api.CHARACTER_CHANNELS.IKL] > .99);
      assert.ok(Array.from(after.ch.ikErr.slice(0, 2)).every(error => error < .0005));
      assert.ok(grip(after) < .025); assert.deepEqual(gameplay(after), { ...gameplay(before), danceTime: 0 });
      trace.push(capture(after, 'native-runner-shooting'));
      // Return to presentation then exercise actual native held-sub state.
      after.a.weaponRunner.reset(); after.a.intent.fire = false; after.dance(0);
      after.a.intent.sub = true; after.a.weaponRunner.update(1 / 60, { fire: false, sub: true });
      after.a._finishFrame(1 / 60); after.ch.root.updateMatrixWorld(true); after.ch.skeleton.update();
      assert.equal(after.a.weaponRunner.aimingSub, true); assert.equal(after.ch.dance, null);
      assert.ok(after.ch.wSub > 0); trace.push(capture(after, 'native-runner-sub'));
      writeTrace(trace, '.native-runner.json');
    } finally { api.G.projectiles.fireShooter = fire; }
  } finally { before.close(); after.close(); }
});

test('a future unsupported dance is not cancelled through an old supported selection', async () => {
  const api = await production(), r = rig(api);
  try {
    r.dance(); r.step(); r.ch.setDance('future-custom-presentation'); r.step(0, { firing: true });
    assert.equal(r.ch.dance, 'future-custom-presentation');
    r.ch.trigger('shoot'); assert.equal(r.ch.dance, 'future-custom-presentation');
  } finally { r.close(); }
});
