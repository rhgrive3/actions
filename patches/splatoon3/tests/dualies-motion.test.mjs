import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { installDualiesMotion as installOtherRealm, dualiesMotionSnapshot as crossRealmSnapshot } from '../runtime/dualies-motion.mjs';

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
    // Optional prior-owned-runtime reproduction over the same production
    // installer. Normal validation always reads the current production bytes.
    const baseline = process.env.INKWAVE_ADMISSION_BASELINE_RUNTIME_DIR;
    const prior = baseline && file.startsWith(path.join(ROOT, 'patches/splatoon3/runtime') + path.sep)
      ? path.join(fs.realpathSync(baseline), path.basename(file)) : null;
    const source = fs.readFileSync(prior && fs.existsSync(prior) ? prior : file, 'utf8');
    const m = new vm.SourceTextModule(file.startsWith(SRC + path.sep)
      ? adaptSource(path.relative(SRC, file), source) : source,
    { context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    modules.set(file, m); return m;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { installDualiesMotion, dualiesMotionSnapshot } from './patches/splatoon3/runtime/dualies-motion.mjs';
    export { FixedClock } from './patches/splatoon3/runtime/clock.mjs';
  `, { context, identifier: path.join(ROOT, 'dualies-composition-entry.mjs') });
  await entry.link((specifier, from) => load(specifier === 'three'
    ? path.join(SRC, 'vendor/three/build/three.module.js')
    : specifier.startsWith('three/addons/')
      ? path.join(SRC, 'vendor/three/jsm', specifier.slice('three/addons/'.length))
      : path.resolve(path.dirname(from.identifier), specifier)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = { ...entry.namespace.install(profile), ...entry.namespace, profile };
  assert.throws(() => entry.namespace.install(profile), /already installed/);
  const hooks = ['_updateStates', '_buildPose', '_poseDodge', '_poseLook', '_poseWeapon', 'setWeapon', 'setVisible', 'dispose'];
  const originals = hooks.map(name => api.Character.prototype[name]), reset = api.WeaponRunner.prototype.reset;
  api.installDualiesMotion(api, profile); installOtherRealm(api, profile);
  hooks.forEach((name, i) => assert.equal(api.Character.prototype[name], originals[i]));
  assert.equal(api.WeaponRunner.prototype.reset, reset);
  const { G, THREE } = api;
  G.scene = new THREE.Scene(); G.settings = { quality: 'high' };
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.level = { blocks: [], groundHeight: () => 0, queryBlocks: (_a, _b, _c, _d, out) => { out.length = 0; return out; } };
  G.paint = { sample: () => 1, splat: () => 0 }; G.match = { playing: () => true, canRespawn: () => false };
  G.physics = new api.Physics(G.level);
  G.actors = []; G.time = 0;
  cached = api; return api;
}
function rig(api, enabled = true, kind = 'dualies') {
  const { Actor, Character, G } = api;
  const a = new Actor({ team: 0, name: 'dualies regression', weapon: kind,
    CharacterClass: Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const ch = a.character; ch.actor = a; ch.onEvent = null; ch.s3DualiesMotionEnabled = enabled;
  G.scene.add(ch.root); G.actors.push(a); a.grounded = a.ground.hit = true;
  const shots = [];
  G.projectiles = Object.fromEntries(['fireShooter', 'fireDualies', 'fireCharger', 'fireSplatling',
    'fireBlaster', 'fireSlosh', 'throwBomb', 'fireFlick'].map(name => [name, (...args) => {
    if (name === 'fireDualies') shots.push({ time: G.time, hand: args[3] });
  }]));
  const visual = (dt = 1 / 60) => { a._finishFrame(dt); ch.root.updateMatrixWorld(true); ch.skeleton.update(); };
  const step = (dt = 1 / 60, input = {}) => {
    a.intent.fire = !!input.fire; a.intent.sub = !!input.sub;
    G.time += dt; a.weaponRunner.update(dt, input); visual(dt);
    assert.ok(Array.from(ch.P).every(Number.isFinite));
  };
  for (let i = 0; i < 90; i++) step();
  function roll(x = 1, z = 0) {
    a.intent.fire = true; a.intent.move.set(x, 0, z);
    assert.equal(a.weaponRunner.tryDodge(a.intent.move), true);
    a.intent.move.set(0, 0, 0);
  }
  return { api, a, ch, visual, step, roll, shots,
    close() { G.actors = G.actors.filter(other => other !== a); ch.dispose(); } };
}
function gameplay(r) {
  const a = r.a, w = a.weaponRunner;
  return { pos: a.pos.toArray(), vel: a.vel.toArray(), yaw: a.yaw, ink: a.ink, hp: a.hp,
    form: a.form, grounded: a.grounded, input: { fire: a.intent.fire, sub: a.intent.sub,
      move: a.intent.move.toArray() }, runner: { cooldown: w.cooldown, dodge: w.dodge ? { ...w.dodge } : null,
      direction: w._dodgeDir.toArray(), lockT: w.lockT, turret: w.s3Turret, hand: w.hand,
      sinceHand: [...w.sinceHand], rollsLeft: w.rollsLeft, rollPaint: w.rollPaint },
    timers: Array.from(r.ch.tr), shots: r.shots.length };
}
function posed(r) {
  const { ch, api: { THREE } } = r;
  const bones = Object.fromEntries(['hips', 'chest', 'head', 'handL', 'handR', 'footL', 'footR'].map(name => {
    const b = ch.bones[name]; return [name, { position: b.getWorldPosition(new THREE.Vector3()).toArray(),
      quaternion: b.getWorldQuaternion(new THREE.Quaternion()).toArray() }];
  }));
  // Read deformed vertices through the actual native skinned mesh implementation
  // and its actual draw indices. No proxy rig, target-only or bounding-box proof.
  const geometry = [];
  ch.kid.traverse(mesh => {
    if (!mesh.isMesh || !mesh.geometry?.index) return;
    for (let p = mesh; p; p = p.parent) if (!p.visible) return;
    for (let p = mesh.parent; p && p !== ch.kid; p = p.parent) if (!p.visible) return;
    const indices = mesh.geometry.index, start = mesh.geometry.drawRange.start || 0;
    const end = Math.min(indices.count, start + mesh.geometry.drawRange.count), count = end - start;
    if (!(count > 0)) return;
    const vertices = [start, start + Math.floor(count / 3), start + Math.floor(2 * count / 3), end - 1].map(i => {
      const index = indices.getX(i), vertex = new THREE.Vector3();
      mesh.getVertexPosition(index, vertex); vertex.applyMatrix4(mesh.matrixWorld);
      return { index, position: vertex.toArray() };
    });
    geometry.push({ name: mesh.name, skinned: !!mesh.isSkinnedMesh, drawIndices: count, vertices });
  });
  return { pose: Array.from(ch.P), bones, geometry, nativeIK: Array.from(ch.ikErr),
    kid: { position: ch.kid.position.toArray(), quaternion: ch.kid.quaternion.toArray() },
    weapons: [ch.weapon.off.matrixWorld.toArray(), ch.weapon.left?.off.matrixWorld.toArray()],
    recoil: [ch.rcP, ch.rcZ, ch.rcP2, ch.rcZ2], diagnostic: r.api.dualiesMotionSnapshot(ch) };
}
function grip(r, side) {
  const { ch, api: { THREE } } = r, w = side === 'L' ? ch.weapon.left : ch.weapon;
  return w.off.localToWorld((side === 'L' ? w.def.handL : w.def.handR).pos.clone())
    .distanceTo((side === 'L' ? ch.bones.handL : ch.bones.handR).getWorldPosition(new THREE.Vector3()));
}
const evidenceRows = [];
function save(rows) {
  const destination = process.env.INKWAVE_DUALIES_TRACE_PATH;
  if (!destination) return;
  const folder = fs.realpathSync(path.dirname(destination));
  assert.ok(folder.startsWith('/mnt/workspace/.dev-state/agent-work/evidence/'));
  const file = path.join(folder, path.basename(destination));
  evidenceRows.push(...rows);
  fs.writeFileSync(file + '.pending', JSON.stringify({ schema: 1,
    proof: 'native source CPU posed bones, drawn indexed geometry and native IK; GPU/browser proof is parent-owned',
    runtimeSha256: createHash('sha256').update(fs.readFileSync(path.join(ROOT,
      'patches/splatoon3/runtime/dualies-motion.mjs'))).digest('hex'), rows: evidenceRows }, null, 2) + '\n');
  fs.renameSync(file + '.pending', file);
}

test('runner progress and world roll direction drive actual tucked bones and indexed geometry', async () => {
  const api = await production(), rows = [];
  for (const enabled of [false, true]) {
    const r = rig(api, enabled);
    try {
      r.roll(1, 1); r.step(1 / 60, { fire: true });
      rows.push({ enabled, stage: 'push-off', posed: posed(r) });
      // Rendering a frozen runner used to exhaust Character's independent roll
      // timer and erase the tumble while gameplay was still rolling.
      const nativeTime = r.a.weaponRunner.dodge.t;
      for (let i = 0; i < 45; i++) r.visual();
      assert.equal(r.a.weaponRunner.dodge.t, nativeTime);
      if (enabled) assert.equal(api.dualiesMotionSnapshot(r.ch).progress, nativeTime / r.a.weaponRunner.dodge.dur);
      rows.push({ enabled, stage: 'runner-frozen', posed: posed(r) });
      // Now advance to the middle of the physical roll and turn aim by 90deg.
      for (let i = 0; i < 5; i++) r.step(1 / 60, { fire: true });
      r.a.yaw = Math.PI / 2; const before = gameplay(r); r.visual(0);
      assert.deepEqual(gameplay(r), before, 'pose never writes gameplay or native clocks at dt=0');
      rows.push({ enabled, stage: 'mid-roll-yaw90', posed: posed(r) });
      if (enabled) {
        const axis = new api.THREE.Vector3(r.ch.tumbleX, 0, r.ch.tumbleZ)
          .applyAxisAngle(new api.THREE.Vector3(0, 1, 0), r.ch.root.rotation.y);
        assert.ok(axis.distanceTo(new api.THREE.Vector3(Math.SQRT1_2, 0, -Math.SQRT1_2)) < 1e-8);
        assert.equal(api.dualiesMotionSnapshot(r.ch).phase, 'roll');
      }
      assert.equal(r.shots.length, 0, 'no invented shot while actual runner rolls');
      assert.ok(rows.at(-1).posed.geometry.some(x => x.skinned && x.drawIndices > 100));
    } finally { r.close(); }
  }
  const old = rows.find(x => !x.enabled && x.stage === 'mid-roll-yaw90').posed;
  const next = rows.find(x => x.enabled && x.stage === 'mid-roll-yaw90').posed;
  assert.notDeepEqual(old.bones.head, next.bones.head);
  assert.notDeepEqual(old.geometry, next.geometry);
  save(rows);
});

test('expired native dodge call sites preserve the native dodge-before-face composition', async () => {
  const api = await production(), reference = rig(api), expired = rig(api);
  try {
    for (const r of [reference, expired]) { r.roll(); r.step(1 / 60, { fire: true }); }
    // Only the Character trigger age differs. Keep both values above the
    // native plant-admission threshold; runner progress remains authoritative.
    // The control retains the native call site, while the other must use the
    // patch fallback. Neither test substitutes a pose or facial routine.
    for (const r of [reference, expired]) r.ch.tr[api.CHARACTER_TIMERS.T_DODGE] = .47;
    for (let i = 0; i < 40; i++) {
      reference.ch.tr[api.CHARACTER_TIMERS.T_DODGE] = .47;
      reference.visual(); expired.visual();
    }
    for (const r of [reference, expired]) r.a.weaponRunner.update(1 / 60, { fire: true });
    reference.ch.tr[api.CHARACTER_TIMERS.T_DODGE] = .47;
    reference.visual(); expired.visual();
    assert.equal(api.dualiesMotionSnapshot(expired.ch).progress, api.dualiesMotionSnapshot(reference.ch).progress);
    const expected = posed(reference), actual = posed(expired);
    save([{ stage: 'native-callsite-order-control', posed: expected }, { stage: 'expired-callsite-order', posed: actual }]);
    assert.deepEqual(actual.pose, expected.pose, 'native face must consume the current roll effort, not the previous frame');
    assert.deepEqual(expired.ch.u.uMouth.value.toArray(), reference.ch.u.uMouth.value.toArray());
    assert.deepEqual(actual.geometry, expected.geometry);
    assert.ok(grip(expired, 'R') < .025 && grip(expired, 'L') < .025);
    assert.ok(actual.nativeIK.slice(0, 2).every(v => v < .001));
  } finally { reference.close(); expired.close(); }
});

test('native planted stance is not overwritten by roll recovery during the first real recoil shots', async () => {
  const api = await production(), traces = [];
  for (const enabled of [false, true]) {
    const r = rig(api, enabled), rows = [];
    try {
      r.roll();
      for (let i = 0; i < 90; i++) {
        r.step(1 / 60, { fire: true });
        rows.push({ gameplay: gameplay(r), posed: posed(r) });
        if (enabled && !r.a.weaponRunner.dodge) {
          assert.equal(r.ch.tumbleDrop, 0);
          assert.ok(grip(r, 'R') < .025 && grip(r, 'L') < .025);
          assert.ok(Array.from(r.ch.ikErr.slice(0, 2)).every(x => x < .0005));
        }
      }
      traces.push(rows);
      assert.equal(r.a.weaponRunner.lockT, 0); assert.equal(r.a.weaponRunner.s3Turret, true);
      assert.ok(r.ch.lockW > .999); assert.ok(r.shots.length > 10);
      const firstShot = rows.find(row => row.gameplay.shots > 0);
      assert.ok(firstShot.posed.recoil.some(x => Math.abs(x) > .0001));
    } finally { r.close(); }
  }
  traces[0].forEach((row, i) => assert.deepEqual(row.gameplay, traces[1][i].gameplay));
  const landed = traces[1].findIndex(row => !row.gameplay.runner.dodge);
  assert.notDeepEqual(traces[0][landed].posed.bones.hips, traces[1][landed].posed.bones.hips);
  assert.notDeepEqual(traces[0][landed].posed.geometry, traces[1][landed].posed.geometry);
  save(traces.flatMap((rows, i) => rows.filter((_, n) => [0, 2, 5, 8, landed, landed + 1, landed + 4, 45, 89].includes(n))
    .map(row => ({ enabled: !!i, stage: 'roll-plant-recoil', ...row }))));
});

test('30/60/120Hz renders use the same actual 60Hz roll, native pose and recoil timeline', async () => {
  const api = await production(), traces = [];
  for (const hz of [30, 60, 120]) {
    const r = rig(api), clock = new api.FixedClock(), rows = [];
    try {
      r.roll(0, -1);
      for (let i = 0; i < hz; i++) clock.advance(1 / hz, dt => {
        r.step(dt, { fire: true }); rows.push({ gameplay: gameplay(r), posed: posed(r) });
      });
      assert.equal(clock.ticks, 60); traces.push(rows);
    } finally { r.close(); }
  }
  assert.deepEqual(traces[0], traces[1]); assert.deepEqual(traces[1], traces[2]);
});

test('reset, death, form, sub, weapon, spawn and special actions cancel owned roll channels', async () => {
  const api = await production(), T = api.CHARACTER_TIMERS;
  for (const action of ['reset', 'death', 'form', 'sub', 'weapon', 'spawn', 'leap', 'slam', 'superjump', 'dance']) {
    const r = rig(api);
    try {
      r.roll(); for (let i = 0; i < 6; i++) r.step(1 / 60, { fire: true });
      assert.ok(r.ch.tumble > 0);
      if (action === 'reset') r.a.weaponRunner.reset();
      if (action === 'death') r.a.splat();
      if (action === 'form') r.a.form = 'squid';
      if (action === 'sub') r.a.weaponRunner.aimingSub = true;
      if (action === 'weapon') r.a.setWeapon('shooter');
      if (action === 'spawn') r.ch.trigger('spawn');
      if (action === 'leap') { r.ch.s3SpecialMotionEnabled = false; r.ch.trigger('special_leap'); }
      if (action === 'slam') { r.ch.s3SpecialMotionEnabled = false; r.ch.trigger('special_slam'); }
      if (action === 'superjump') r.a.superJumpState = { phase: 'charge' };
      if (action === 'dance') {
        // An active native dodge owns this frame. Integrated emotes cancels
        // supported presentation before dualies arbitration runs.
        r.ch.setDance('victory'); r.visual();
        assert.equal(r.ch.dance, null); assert.equal(api.dualiesMotionSnapshot(r.ch).phase, 'roll');
        // An unsupported future presentation remains native and blocks roll.
        r.ch.setDance('future-custom-presentation');
      }
      r.visual();
      assert.equal(r.ch.tumble, 0, action); assert.equal(r.ch.tumbleDrop, 0, action);
      assert.equal(r.ch.lockW, 0, action);
      if (action === 'form' || action === 'sub') {
        r.a.form = 'kid'; r.a.weaponRunner.aimingSub = false; r.ch.bombHeld = false;
        r.visual(); assert.equal(r.ch.tumble, 0, 'same interrupted roll must not replay');
      }
      r.a.weaponRunner.reset(); r.a.superJumpState = null; r.ch.dance = null;
      r.a.alive = true; r.a.form = 'kid'; r.ch.s3SpecialMotionEnabled = true; r.ch.setVisible(true);
      for (const name of ['T_SPAWN', 'T_LEAP', 'T_SLAM', 'T_THROW']) r.ch.tr[T[name]] = 99;
      r.a.setWeapon('dualies'); for (let i = 0; i < 60; i++) r.visual();
      assert.equal(r.ch.tumble, 0); assert.equal(r.ch.lockW, 0);
      r.roll(-1, 0); r.step(1 / 60, { fire: true }); assert.equal(api.dualiesMotionSnapshot(r.ch).phase, 'roll');
    } finally { r.close(); }
  }
});

test('hiding a live dualies character retires its roll without replaying the same runner token', async () => {
  const api = await production(), r = rig(api);
  try {
    r.roll(); for (let i = 0; i < 6; i++) r.step(1 / 60, { fire: true });
    const token = r.a.weaponRunner.dodge, before = gameplay(r);
    assert.ok(r.ch.tumble > 0); r.ch.setVisible(false);
    assert.equal(api.dualiesMotionSnapshot(r.ch)?.phase, null);
    assert.equal(r.ch.tumble, 0); assert.equal(r.ch.lockW, 0);
    r.visual(0); r.ch.setVisible(true); r.visual(0);
    assert.equal(r.a.weaponRunner.dodge, token); assert.equal(r.ch.tumble, 0);
    assert.equal(api.dualiesMotionSnapshot(r.ch).blockedRoll, true);
    assert.deepEqual(gameplay(r), before, 'all native clocks and gameplay survive hide at dt0');
    const output = posed(r); assert.ok(output.geometry.length > 0);
    assert.ok(output.nativeIK.slice(0, 2).every(v => v < .001));
    save([{ stage: 'hidden-roll-return', posed: output }]);
  } finally { r.close(); }
});

test('nullable preview, zero dt, repeated chained directions, disposal and other weapons remain native', async () => {
  const api = await production();
  assert.equal(api.dualiesMotionSnapshot(null), null);
  const ch = new api.Character({ name: 'dualies preview', weapon: 'dualies', style: { hair: 0 } });
  ch.onEvent = null;
  const s = { runner: null, form: 'kid', grounded: true, firing: false, speed: 0, localMove: { x: 0, z: 0 } };
  try {
    for (let i = 0; i < 90; i++) ch.update(1 / 60, s);
    ch.trigger('dodge', { x: -1, z: 0, t: .2 }); ch.update(.1, s);
    assert.equal(api.dualiesMotionSnapshot(ch).phase, 'roll');
    assert.deepEqual(crossRealmSnapshot(ch), JSON.parse(JSON.stringify(api.dualiesMotionSnapshot(ch))));
    const progress = api.dualiesMotionSnapshot(ch).progress, clocks = Array.from(ch.tr);
    for (let i = 0; i < 10; i++) ch.update(0, i % 2 ? null : s);
    assert.deepEqual(Array.from(ch.tr), clocks); assert.equal(api.dualiesMotionSnapshot(ch).progress, progress);
    ch.update(.1, s); assert.equal(api.dualiesMotionSnapshot(ch).phase, 'plant');
    assert.equal(ch.tumbleDrop, 0);
  } finally { ch.dispose(); }
  assert.equal(api.dualiesMotionSnapshot(ch), null);
  for (const kind of ['shooter', 'charger', 'splatling', 'blaster', 'roller', 'slosher']) {
    const before = rig(api, false, kind), old = [];
    try { for (let i = 0; i < 10; i++) { before.step(1 / 60, { fire: true }); old.push(posed(before)); } }
    finally { before.close(); }
    const after = rig(api, true, kind), next = [];
    try { for (let i = 0; i < 10; i++) { after.step(1 / 60, { fire: true }); next.push(posed(after)); } }
    finally { after.close(); }
    assert.deepEqual(old, next, kind);
  }
  const r = rig(api);
  try {
    for (let i = 0; i < 12; i++) {
      r.a.weaponRunner.reset(); r.a.ink = 100; r.roll(i % 2 ? -1 : 1, 0);
      for (let n = 0; n < 13; n++) r.step(1 / 60, { fire: true });
      assert.equal(api.dualiesMotionSnapshot(r.ch).phase, 'plant');
      r.a.ink = 100; r.roll(0, i % 2 ? -1 : 1); r.step(1 / 60, { fire: true });
      assert.equal(api.dualiesMotionSnapshot(r.ch).phase, 'roll');
    }
  } finally { r.close(); }
  assert.equal(api.dualiesMotionSnapshot(r.ch), null);
});

test('direct 30/60/120Hz native preview rolls end in actual reachable planted grips', async () => {
  const api = await production();
  for (const hz of [30, 60, 120]) {
    const ch = new api.Character({ name: 'direct dualies preview', weapon: 'dualies', style: { hair: 0 } });
    ch.onEvent = null;
    const s = { runner: null, form: 'kid', grounded: true, speed: 0, localMove: { x: 0, z: 0 } };
    const r = { api, ch };
    try {
      for (let i = 0; i < hz; i++) ch.update(1 / hz, s);
      ch.trigger('dodge', { x: 1, z: 0, t: .2 });
      for (let i = 0; i < hz / 2; i++) ch.update(1 / hz, s);
      ch.root.updateMatrixWorld(true); ch.skeleton.update();
      assert.equal(api.dualiesMotionSnapshot(ch).phase, 'plant'); assert.equal(ch.tumble, 0);
      const output = posed(r); assert.ok(output.pose.every(Number.isFinite));
      assert.ok(output.geometry.some(m => m.skinned && m.vertices.length > 0));
      assert.ok(grip(r, 'R') < .025 && grip(r, 'L') < .025);
      assert.ok(output.nativeIK.slice(0, 2).every(v => v < .001));
      const clocks = Array.from(ch.tr); ch.update(0, null);
      assert.deepEqual(Array.from(ch.tr), clocks);
      save([{ stage: 'direct-preview-rate', hz, posed: output }]);
    } finally { ch.dispose(); }
  }
});

test('admission managed Slam relinquishment allows a fresh Runner roll before legacy Special timers expire', async () => {
  const api = await production(), r = rig(api);
  try {
    r.a.weapon = { ...r.a.weapon, special: 'slam' }; r.a._startSpecial(); r.visual(0);
    r.a.specialActive = null; r.a.grounded = true; r.visual(0);
    assert.ok(r.ch.tr[api.CHARACTER_TIMERS.T_LEAP] < 1.9);
    r.roll(); r.step(1 / 60, { fire: true });
    assert.equal(api.dualiesMotionSnapshot(r.ch).phase, 'roll');
    assert.ok(posed(r).geometry.some(m => m.skinned && m.vertices.length > 0));
    for (let i = 0; i < 14; i++) r.step(1 / 60, { fire: true });
    assert.equal(api.dualiesMotionSnapshot(r.ch).phase, 'plant');
    assert.ok(grip(r, 'L') < .025 && grip(r, 'R') < .025);
    assert.ok(r.ch.ikErr.slice(0, 2).every(v => v < .001));
  } finally { r.close(); }
});
