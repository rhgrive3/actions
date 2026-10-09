import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { installDualiesMotion as installOtherRealm, dualiesMotionSnapshot as crossRealmSnapshot } from '../runtime/dualies-motion.mjs';

import { dualiesMotionLock, dualiesMotionAllowsFootPlant, specialMotionAllowsAction } from '../runtime/action-admission.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.resolve(process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public'));
// Exercise the actual production source hooks, with no prospective rewrites.
const connections = [
  ['character-lock', 'const lock = kid && !dance && this.dual && ((R ? (R.lockT || 0) > 0 || (!!R.dodge && dk > 0.55) : this.tr[T_DODGE] < this.dodgeDur + 0.5) || (dk > 0.55 && dk < 1));',
    'const lock = dualiesMotionLock(this, R, kid && !dance && this.dual && ((R ? (R.lockT || 0) > 0 || (!!R.dodge && dk > 0.55) : this.tr[T_DODGE] < this.dodgeDur + 0.5) || (dk > 0.55 && dk < 1)));'],
  ['character-foot', 'this.tr[T_DODGE] > this.dodgeDur * 0.86', 'dualiesMotionAllowsFootPlant(this, this.tr[T_DODGE] > this.dodgeDur * 0.86)'],
  ['walk-foot', 'tr[T.T_DODGE]>ch.dodgeDur*.86', 'dualiesMotionAllowsFootPlant(ch,tr[T.T_DODGE]>ch.dodgeDur*.86)'],
];
const appliedConnections = new Set();
function candidateSource(file, source) {
  const code = file.startsWith(SRC + path.sep) ? adaptSource(path.relative(SRC, file), source) : source;
  const character = file === path.join(SRC, 'src/game/character.js'), walk = file === path.join(ROOT, 'patches/splatoon3/runtime/walk.mjs');
  for (const [label, _before, after] of connections.filter(([label]) => character ? label.startsWith('character') : walk && label === 'walk-foot')) {
    assert.equal(code.split(after).length - 1, 1, 'actual production admission connection ' + label);
    appliedConnections.add(label);
  }
  return code;
}

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
    const m = new vm.SourceTextModule(candidateSource(file, source),
    { context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    modules.set(file, m); return m;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { installDualiesMotion, dualiesMotionSnapshot } from './patches/splatoon3/runtime/dualies-motion.mjs';
    export * from './patches/splatoon3/runtime/action-admission.mjs';
    export * from './patches/splatoon3/runtime/special-motion.mjs';
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
  const projectiles = new api.Projectiles(G.scene); G.projectiles = projectiles;
  const nativeFire = projectiles.fireDualies;
  projectiles.fireDualies = function (...args) {
    shots.push({ time: G.time, hand: args[3] }); return nativeFire.apply(this, args);
  };
  const visual = (dt = 1 / 60) => { a._finishFrame(dt); ch.root.updateMatrixWorld(true); ch.skeleton.update(); };
  const step = (dt = 1 / 60, input = {}) => {
    a.intent.fire = !!input.fire; a.intent.sub = !!input.sub;
    G.projectiles = projectiles; G.time += dt; a.weaponRunner.update(dt, input); visual(dt);
    assert.ok(Array.from(ch.P).every(Number.isFinite));
  };
  for (let i = 0; i < 90; i++) step();
  function roll(x = 1, z = 0) {
    a.intent.fire = true; a.intent.move.set(x, 0, z);
    assert.equal(a.weaponRunner.tryDodge(a.intent.move), true);
    a.intent.move.set(0, 0, 0);
  }
  return { api, a, ch, visual, step, roll, shots,
    close() { projectiles.clear(); G.scene.remove(projectiles.blobs); G.actors = G.actors.filter(other => other !== a); ch.dispose(); } };
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

const nativeRows = [];
function save(label, r, details = {}) {
  const destination = process.env.INKWAVE_ADMISSION_TRACE_PATH;
  if (!destination) return;
  const directory = fs.realpathSync(path.dirname(destination));
  assert.ok(directory.startsWith('/mnt/workspace/.dev-state/agent-work/evidence/'));
  nativeRows.push({ label, ...details, gameplay: gameplay(r), posed: posed(r),
    aim: r.ch.wAim, stance: [...r.ch.stance], plantWeight: r.ch.plantW,
    feet: r.ch.feet.map(f => ({ planted: f.planted, swing: f.sw, display: f.disp.toArray() })) });
  const file = path.join(directory, path.basename(destination));
  fs.writeFileSync(file + '.pending', JSON.stringify({ schema: 1, rows: nativeRows,
    productionSourceConnections: [...appliedConnections],
    nativeDrawBoundary: 'Selected vertices within native indexed draw ranges, CPU skinning/bones and native IK. Native Physics/Actor/Runner/Projectiles; no GPU draw or Nintendo hardware attestation.',
    inputHashes: Object.fromEntries(['action-admission', 'dualies-motion', 'bomb-motion'].map(name =>
      [name, createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/runtime/' + name + '.mjs'))).digest('hex')]))
  }, null, 2) + '\n'); fs.renameSync(file + '.pending', file);
}

// Retained red receipts predate these hooks; current tests exercise their actual
// production activation before native aim/stance/contact consume the result.
test('admission paused and remote Runner clocks govern native aim, stance and feet before rendering', async () => {
  const api = await production(), T = api.CHARACTER_TIMERS;
  for (const hz of [30, 60, 120]) for (const remote of [false, true]) {
    const reference = rig(api), stale = rig(api);
    try {
      for (const r of [reference, stale]) { r.a.remote = remote; r.roll(); r.step(1 / 60, { fire: true }); }
      reference.ch.tr[T.T_DODGE] = .02; stale.ch.tr[T.T_DODGE] = 2;
      const before = [reference, stale].map(gameplay);
      for (let i = 0; i < 4; i++) for (const r of [reference, stale]) r.visual(1 / hz);
      assert.equal(stale.a.weaponRunner.dodge.t, before[1].runner.dodge.t);
      assert.equal(reference.ch.lockW, stale.ch.lockW);
      assert.equal(reference.ch.wAim, stale.ch.wAim, 'native wAim must consume the same authoritative admission as lockW');
      assert.deepEqual([...reference.ch.stance], [...stale.ch.stance]);
      assert.equal(reference.ch.plantW, stale.ch.plantW, 'paused early roll cannot plant solely because Character age advanced');
      assert.deepEqual(reference.ch.feet.map(f => [f.planted, f.sw, f.disp.toArray()]), stale.ch.feet.map(f => [f.planted, f.sw, f.disp.toArray()]));
      assert.ok(reference.ch.plantW < .4, 'the real early roll fades the native plant weight');
      const expected = posed(reference), actual = posed(stale);
      assert.ok(actual.geometry.some(m => m.skinned && m.vertices.length > 0));
      assert.deepEqual(actual.bones, expected.bones);
      assert.deepEqual(actual.geometry, expected.geometry);
      save('paused-runner', stale, { hz, remote });
      for (const r of [reference, stale]) { const gameplayBefore = gameplay(r); r.visual(0); assert.deepEqual(gameplay(r), gameplayBefore); }
    } finally { reference.close(); stale.close(); }
  }
});

test('admission native aim consumes Runner lock before stance even with an unfired remote presentation', async () => {
  const api = await production(), T = api.CHARACTER_TIMERS, a = rig(api), b = rig(api);
  try {
    for (const r of [a, b]) {
      r.roll(); r.step(1 / 60, { fire: true }); r.ch.lockW = .49; r.ch.wAim = 0;
      r.ch.lastShot = r.ch.lastRelease = 99;
    }
    a.ch.tr[T.T_DODGE] = .01; b.ch.tr[T.T_DODGE] = .15;
    const input = r => ({ form: 'kid', grounded: true, speed: 0, firing: false, subAim: false, runner: r.a.weaponRunner });
    for (const r of [a, b]) r.ch.update(1 / 30, input(r));
    assert.equal(a.ch.lockW, b.ch.lockW); assert.equal(a.ch.wAim, b.ch.wAim);
    assert.equal(a.ch.wAim, 0, 'real early roll has not admitted turret aim');
    assert.deepEqual([...a.ch.stance], [...b.ch.stance]);
    for (const r of [a, b]) { r.ch.root.updateMatrixWorld(true); r.ch.skeleton.update(); }
    assert.deepEqual(posed(a).bones, posed(b).bones); assert.deepEqual(posed(a).geometry, posed(b).geometry);
    save('native-pre-aim-admission', b);
  } finally { a.close(); b.close(); }
});

test('admission late, chained, cancelled and completed Runner tokens preserve native events and contact output', async () => {
  const api = await production(), T = api.CHARACTER_TIMERS, r = rig(api);
  try {
    r.roll(); for (let i = 0; i < 11; i++) r.step(1 / 60, { fire: true });
    const before = gameplay(r), clocks = [...r.ch.tr];
    assert.ok(r.a.weaponRunner.dodge.t / r.a.weaponRunner.dodge.dur > .86);
    assert.equal(api.dualiesMotionAllowsFootPlant(r.ch, false), true);
    assert.equal(dualiesMotionAllowsFootPlant(r.ch, false), true);
    for (let i = 0; i < 8; i++) {
      assert.equal(dualiesMotionLock(r.ch, r.ch._runner(), false), true);
      assert.equal(dualiesMotionAllowsFootPlant(r.ch, false), true);
    }
    assert.deepEqual(gameplay(r), before, 'helper lookup never mutates native clocks/Actor/Runner');
    r.visual(0); assert.deepEqual([...r.ch.tr], clocks);
    for (let i = 0; i < 3; i++) r.step(1 / 60, { fire: true });
    assert.equal(api.dualiesMotionSnapshot(r.ch).phase, 'plant');
    assert.ok(grip(r, 'L') < .025 && grip(r, 'R') < .025);
    assert.ok(r.ch.ikErr.slice(0, 2).every(v => v < .001));
    assert.ok(posed(r).geometry.some(m => m.skinned && m.vertices.length > 0));
    save('actual-post-roll-plant', r);
    r.a.ink = 100; r.roll(0, -1); r.step(1 / 60, { fire: true });
    const second = r.a.weaponRunner.dodge;
    assert.equal(dualiesMotionAllowsFootPlant(r.ch, true), false, 'a fresh chained roll immediately retires foot admission');
    r.ch.setVisible(false); r.ch.setVisible(true); r.visual(0);
    assert.equal(r.a.weaponRunner.dodge, second); assert.equal(api.dualiesMotionSnapshot(r.ch).phase, null);
    assert.equal(dualiesMotionLock(r.ch, r.ch._runner(), true), false);
    const atReset = [...r.ch.tr]; r.a.weaponRunner.reset();
    assert.equal(r.ch.tr[T.T_THROW], 99, 'pre-existing production Runner reset event stays intact');
    assert.equal(r.ch.tr[T.T_DODGE], 99); assert.ok(atReset[T.T_DODGE] < .2);
    r.visual(0); assert.equal(api.dualiesMotionAllowsFootPlant(r.ch, false), true);
    const registry = r.ch[Symbol.for('inkwave.splatoon3.dualies-motion.v1')];
    r.ch.dispose(); assert.equal(registry.states.has(r.ch), false);
    assert.equal(dualiesMotionLock(r.ch, r.a.weaponRunner, true), true);
    assert.equal(dualiesMotionAllowsFootPlant(r.ch, false), false);
    r.ch.setVisible(false); r.ch._updateStates(0, r.a.anim);
    assert.equal(registry.states.has(r.ch), false, 'disposed registry cannot be recreated');
  } finally { r.close(); }
});

test('admission managed Special action ownership includes Storm with disabled, unmapped and detached native fallback', async () => {
  const api = await production(), r = rig(api, true, 'shooter');
  try {
    const unchanged = (ch, expected) => {
      const fields = { timers: [...ch.tr], age: ch.t, ownerLookup: ch._ownT, pose: [...ch.P] };
      for (const fallback of [false, true]) {
        const result = expected === 'fallback' ? fallback : expected;
        assert.equal(specialMotionAllowsAction(ch, fallback), result);
        assert.equal(api.specialMotionAllowsAction(ch, fallback), result);
      }
      assert.deepEqual({ timers: [...ch.tr], age: ch.t, ownerLookup: ch._ownT, pose: [...ch.P] }, fields);
    };
    r.a.weapon = { ...r.a.weapon, special: 'slam' }; r.a._startSpecial(); unchanged(r.ch, 'fallback'); r.visual(0); unchanged(r.ch, false);
    r.ch.trigger('movement_cancel'); r.a.grounded = true; r.visual(0);
    assert.ok(r.a.specialActive, 'same interrupted native token is retained'); unchanged(r.ch, true);
    r.ch.s3SpecialMotionEnabled = false; unchanged(r.ch, 'fallback'); r.ch.s3SpecialMotionEnabled = true;
    r.a.specialActive = { id: 'slam', net: true }; r.visual(0); unchanged(r.ch, 'fallback');
    r.a.weaponRunner.aimingSub = true; r.visual(0); unchanged(r.ch, 'fallback'); r.a.weaponRunner.aimingSub = false;
    r.a.specialActive = { id: 'future-special', t: 0 }; r.visual(0); unchanged(r.ch, 'fallback');
    r.a.specialActive = null; r.a.weapon = { ...r.a.weapon, special: 'storm' }; r.a._startSpecial(); r.visual(0);
    unchanged(r.ch, false); assert.equal(api.specialMotionAllowsFootPlant(r.ch, false), true, 'Storm retains its existing foot contract');
    r.ch.trigger('movement_cancel'); r.visual(0); unchanged(r.ch, true);
    const preview = new api.Character({ name: 'detached native admission', weapon: 'dualies', style: { hair: 0 } });
    try {
      preview.update(0, null); preview.trigger('special_leap'); unchanged(preview, 'fallback');
      const reg = preview[Symbol.for('inkwave.splatoon3.dualies-motion.v1')];
      const prior = reg.states.get(preview), timers = [...preview.tr];
      for (const f of [false, true]) {
        assert.equal(dualiesMotionAllowsFootPlant(preview, f), f); assert.equal(dualiesMotionLock(preview, null, f), f);
      }
      assert.equal(reg.states.get(preview), prior); assert.deepEqual([...preview.tr], timers);
    } finally { preview.dispose(); }
    for (const f of [false, true]) {
      assert.equal(specialMotionAllowsAction(null, f), f); assert.equal(dualiesMotionLock(null, null, f), f);
      assert.equal(dualiesMotionAllowsFootPlant(null, f), f);
    }
    const nativeRunner = r.a.weaponRunner; r.a.setWeapon('dualies'); r.a.specialActive = null; r.visual(0);
    r.ch.s3DualiesMotionEnabled = false;
    for (const f of [false, true]) assert.equal(dualiesMotionLock(r.ch, nativeRunner, f), f);
    r.ch.s3DualiesMotionEnabled = true;
    nativeRunner.dodge = { net: true }; r.visual(0);
    for (const f of [false, true]) {
      assert.equal(dualiesMotionLock(r.ch, nativeRunner, f), f); assert.equal(dualiesMotionAllowsFootPlant(r.ch, f), f);
    }
  } finally { r.close(); }
});

test('admission cancelled Bomb permits a fresh real Dodge without fast-forwarding the native throw or projectile clocks', async () => {
  const api = await production(), T = api.CHARACTER_TIMERS, r = rig(api);
  try {
    for (let ready = 0; ready < 6; ready++) r.step(1 / 60, { sub: true });
    r.step(1 / 60, { subReleased: true });
    assert.equal(api.G.projectiles.bombs.length, 0, 'native #1037 use requires one further frame');
    r.step(1 / 60, {});
    assert.equal(api.G.projectiles.bombs.length, 1);
    const bomb = api.G.projectiles.bombs[0], age = r.ch.tr[T.T_THROW], bombBefore = { age: bomb.age, fuse: bomb.fuse, pos: bomb.pos.toArray(), vel: bomb.vel.toArray() };
    r.ch.setVisible(false); r.ch.setVisible(true); r.visual(0);
    assert.equal(r.ch.tr[T.T_THROW], age);
    assert.equal(api.bombMotionAllowsAction(r.ch, false), true);
    r.roll(-1, 0); r.step(1 / 60, { fire: true });
    assert.equal(api.dualiesMotionSnapshot(r.ch).phase, 'roll');
    assert.equal(r.ch.tr[T.T_THROW], Math.fround(age + 1 / 60));
    assert.deepEqual({ age: bomb.age, fuse: bomb.fuse, pos: bomb.pos.toArray(), vel: bomb.vel.toArray() }, bombBefore);
    const output = posed(r); assert.ok(output.geometry.some(m => m.skinned && m.vertices.length > 0));
    assert.ok(output.nativeIK.every(Number.isFinite)); save('fresh-dodge-after-bomb-cancellation', r);
    r.a.weaponRunner.reset(); r.visual(0);
    const before = gameplay(r); r.ch.s3BombMotionEnabled = false;
    assert.equal(api.bombMotionAllowsAction(r.ch, false), false);
    assert.deepEqual(gameplay(r), before);
    assert.equal(api.bombMotionAllowsAction(null, false), false);
  } finally { r.close(); }
});
