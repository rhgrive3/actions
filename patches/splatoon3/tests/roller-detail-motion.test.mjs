import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { ROLLER_POSE } from '../runtime/roller.mjs';
import { installRollerDetailMotion as otherRealmInstall, rollerDetailMotionSnapshot as otherRealmSnapshot } from '../runtime/roller-detail-motion.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.resolve(process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public'));
let installed;
async function production() {
  if (installed) return installed;
  const context = vm.createContext({ console, performance, URL }), modules = new Map();
  function load(requested) {
    let file = requested.startsWith(path.join(SRC, 'patches') + path.sep) ? path.join(ROOT, path.relative(SRC, requested)) : requested;
    if (file.startsWith(path.join(ROOT, 'src') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    const source = fs.readFileSync(file, 'utf8');
    const m = new vm.SourceTextModule(file.startsWith(SRC + path.sep) ? adaptSource(path.relative(SRC, file), source) : source,
      { context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    modules.set(file, m); return m;
  }
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { installRollerDetailMotion, rollerDetailMotionSnapshot } from './patches/splatoon3/runtime/roller-detail-motion.mjs';
    export { FixedClock } from './patches/splatoon3/runtime/clock.mjs';
  `, { context, identifier: path.join(ROOT, 'roller-detail-production-entry.mjs') });
  await entry.link((s, from) => load(s === 'three' ? path.join(SRC, 'vendor/three/build/three.module.js')
    : s.startsWith('three/addons/') ? path.join(SRC, 'vendor/three/jsm', s.slice('three/addons/'.length))
      : path.resolve(path.dirname(from.identifier), s)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = { ...entry.namespace.install(profile), ...entry.namespace, profile };
  assert.ok(Object.hasOwn(api.Character.prototype, Symbol.for('inkwave.s3.roller-detail-motion.install.v1')));
  const { G, THREE } = api;
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.scene = new THREE.Scene(); G.level = { blocks: [], groundHeight: () => 0 };
  G.paint = { sample: () => 1, splat: () => 0 }; G.match = { playing: () => true, canRespawn: () => false };
  G.physics = { los: () => true, raycast: (_a, _b, _c, hit) => { hit.hit = false; return hit; } };
  G.actors = []; G.time = 0;
  installed = api; return api;
}
function rig(api, { enabled = true, weapon = 'roller', interval } = {}) {
  const { Actor, Character, G, THREE } = api;
  const a = new Actor({ team: 0, name: 'roller detail native regression', weapon, CharacterClass: Character,
    style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const ch = a.character; ch.actor = a; ch.onEvent = null; ch.s3RollerDetailMotionEnabled = enabled;
  G.scene.add(ch.root); G.actors = [a]; a.grounded = a.ground.hit = true;
  // An instance profile lets us prove both the untouched foundation and the
  // requested 35F/42F integration settings; no production profile is changed.
  if (interval) a.weapon = { ...a.weapon, flickInterval: interval[0], verticalInterval: interval[1] };
  let shots = 0, solves = 0;
  G.projectiles = Object.fromEntries(['fireFlick', 'fireShooter', 'fireDualies', 'fireCharger', 'fireSplatling', 'fireBlaster', 'fireSlosh', 'throwBomb'].map(name => [name, () => { shots++; }]));
  const solve = ch._solveLimb;
  ch._solveLimb = function (...args) { solves++; return solve.apply(this, args); };
  function step(dt = 1 / 60, input = {}) {
    a.intent.fire = !!input.fire; a.intent.sub = !!input.sub;
    if (input.grounded !== undefined) a.grounded = input.grounded;
    if (input.speed !== undefined) a.vel.set(0, 0, input.speed);
    a.pos.addScaledVector(a.vel, dt); G.time += dt;
    a.weaponRunner.update(dt, input); a._finishFrame(dt);
    ch.root.updateMatrixWorld(true);
    assert.ok(Array.from(ch.P).every(Number.isFinite));
  }
  for (let i = 0; i < 90; i++) step();
  ch.fidget = -1; ch.idleT = 0; ch.shufT = 99;
  assert.equal(ch._owner(), a); assert.equal(ch._runner(), a.weaponRunner);
  return { a, ch, step, get shots() { return shots; }, get solves() { return solves; },
    close() { G.scene.remove(ch.root); G.actors = []; ch.dispose(); } };
}
function gameplay(r) {
  const { a } = r, w = a.weaponRunner;
  return { ink: a.ink, hp: a.hp, pos: a.pos.toArray(), vel: a.vel.toArray(), root: r.ch.root.position.toArray(),
    input: { fire: a.intent.fire, sub: a.intent.sub }, form: a.form, grounded: a.grounded,
    cooldown: w.cooldown, flick: w.flick, flickRecover: w.flickRecover, rollT: w.rollT, rolling: w.rolling,
    attack: w.s3RollerAttack ? { ...w.s3RollerAttack } : null, shots: r.shots,
    timers: Array.from(r.ch.tr), runner: [w.charge, w.charging, w.slosh, w.streaming, w.aimingSub] };
}
function poseRow(api, r, index, detailed = false) {
  const { ch } = r, { THREE } = api, v = new THREE.Vector3();
  let bottom = Infinity, count = 0;
  const vertices = [], triangles = [];
  ch.weapon.drum?.traverse(m => {
    if (!m.isMesh || !m.visible) return;
    for (let parent = m; parent; parent = parent.parent) if (!parent.visible) return;
    const p = m.geometry.attributes.position, idx = m.geometry.index, offset = vertices.length / 3;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).sub(ch.root.position);
      vertices.push(...v.toArray());
    }
    const start = m.geometry.drawRange.start, end = Math.min(idx?.count ?? p.count, start + m.geometry.drawRange.count);
    for (let i = start; i < end; i++) {
      const n = idx ? idx.getX(i) : i;
      bottom = Math.min(bottom, vertices[3 * (offset + n) + 1]); count++;
      triangles.push(offset + n);
    }
  });
  const grip = name => ch.weapon.off.localToWorld(ch.weapon.def[name].pos.clone())
    .distanceTo(ch.bones[name].getWorldPosition(new THREE.Vector3()));
  const bones = {};
  for (const name of ['hips', 'spine', 'chest', 'clavL', 'clavR', 'uArmL', 'uArmR', 'fArmL', 'fArmR', 'handL', 'handR', 'footL', 'footR']) {
    const b = ch.bones[name]; bones[name] = { p: b.getWorldPosition(new THREE.Vector3()).sub(ch.root.position).toArray(), q: b.getWorldQuaternion(new THREE.Quaternion()).toArray() };
  }
  const bodyMeshes = [];
  if (detailed && [8, 14].includes(index)) ch.kid.traverse(m => {
    if (!m.isMesh || !m.geometry?.attributes.position) return;
    for (let parent = m; parent; parent = parent.parent) if (!parent.visible) return;
    const p = m.geometry.attributes.position, idx = m.geometry.index, points = [], drawn = [];
    if (m.isSkinnedMesh) m.skeleton.update();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      if (m.isSkinnedMesh) m.applyBoneTransform(i, v);
      v.applyMatrix4(m.matrixWorld).sub(ch.root.position); points.push(...v.toArray());
    }
    const start = m.geometry.drawRange.start, end = Math.min(idx?.count ?? p.count, start + m.geometry.drawRange.count);
    for (let i = start; i < end; i++) drawn.push(idx ? idx.getX(i) : i);
    bodyMeshes.push({ name: m.name, skinned: !!m.isSkinnedMesh, vertices: points, triangles: drawn });
  });
  return { index, pose: Array.from(ch.P), center: ch.weapon.drum?.getWorldPosition(new THREE.Vector3()).sub(ch.root.position).toArray(),
    bottom, drawnIndexCount: count, gripL: grip('handL'), gripR: grip('handR'), ik: Array.from(ch.ikErr),
    bones, weaponMatrix: ch.weapon.off.matrixWorld.toArray(), drumA: ch.weapon.drumA, drumW: ch.weapon.drumW,
    geometrySha256: createHash('sha256').update(JSON.stringify({ vertices, triangles })).digest('hex'),
    ...(detailed ? { vertices, triangles, ...(bodyMeshes.length ? { bodyMeshes } : {}) } : {}), gameplay: gameplay(r) };
}
const evidence = [];
function saveEvidence() {
  const file = process.env.INKWAVE_ROLLER_DETAIL_EVIDENCE;
  if (!file) return;
  const folder = fs.realpathSync(path.dirname(file));
  assert.ok(folder.startsWith('/mnt/workspace/.dev-state/agent-work/evidence/'));
  const dest = path.join(folder, path.basename(file));
  fs.writeFileSync(dest + '.pending', JSON.stringify({ schema: 1,
    kind: 'actual production source CPU posed bones/native IK/indexed drawn drum geometry; GPU/browser parent-owned',
    runtimeSha256: createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/runtime/roller-detail-motion.mjs'))).digest('hex'), evidence }, null, 2) + '\n');
  fs.renameSync(dest + '.pending', dest);
}
test.after(saveEvidence);

test('one production installer and duplicate module realms preserve hook identity; nullable previews use native IK', async () => {
  const api = await production(), P = api.Character.prototype;
  const before = [P._poseFlick, P._updateStates, P.dispose, P.setWeapon, P.setVisible, api.WeaponRunner.prototype.reset, api.Actor.prototype.splat];
  api.installRollerDetailMotion(api, api.profile); otherRealmInstall(api, api.profile);
  assert.deepEqual([P._poseFlick, P._updateStates, P.dispose, P.setWeapon, P.setVisible, api.WeaponRunner.prototype.reset, api.Actor.prototype.splat], before);
  const ch = new api.Character({ name: 'standalone roller preview', weapon: 'roller', style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  try {
    assert.equal(api.rollerDetailMotionSnapshot(null), null);
    assert.equal(ch._owner(), null); assert.equal(ch._runner({ runner: null }), null);
    const s = { form: 'kid', grounded: true, speed: 0, ink: 1, hp: 1, runner: null };
    for (let i = 0; i < 90; i++) ch.update(1 / 60, s);
    ch.trigger('flick'); for (let i = 0; i < 10; i++) ch.update(1 / 60, s);
    assert.ok(Array.from(ch.P).every(Number.isFinite)); assert.ok(ch.tr[api.CHARACTER_TIMERS.T_FLICK] < .2);
    assert.equal(JSON.stringify(otherRealmSnapshot(ch)), JSON.stringify(api.rollerDetailMotionSnapshot(ch)));
    ch.update(1 / 60, { ...s, subAim: true });
    for (let i = 0; i < 60; i++) ch.update(1 / 60, { ...s, subAim: false });
    ch.trigger('flick'); ch.update(1 / 60, s);
    assert.ok(ch.P[api.CHARACTER_CHANNELS.ANCR] > -2.95, 'standalone preview can flick again after sub interruption');
  } finally { ch.dispose(); assert.equal(api.rollerDetailMotionSnapshot(ch), null); }
});

test('horizontal startup removes the double lift in actual posed geometry while preserving gameplay and native grips', async () => {
  const api = await production(), traces = [];
  for (const enabled of [false, true]) {
    const r = rig(api, { enabled }), rows = [];
    try {
      for (let i = 0; i < 70; i++) {
        r.step(1 / 60, { fire: false, firePressed: i === 0 });
        rows.push(poseRow(api, r, i, [0, 5, 8, 12, 14, 18, 21, 30, 42, 60].includes(i)));
      }
      assert.equal(r.shots, 1); assert.ok(r.solves > 300, 'the public two-bone solver executed for real limbs');
      // #896: the drum fling impulse follows the authoritative release clock (21F), not the legacy fixed 9F trigger.
      const released = rows.findIndex(x => x.gameplay.shots === 1);
      assert.equal(released, 21, 'horizontal gameplay release is on elapsed tick 21');
      assert.ok(rows.slice(0, released).every(x => x.drumW === 0), 'no drum fling before release (legacy trigger was 9F)');
      assert.ok(rows[released].drumW > 30, 'drum fling lands on the release tick');
      assert.ok(rows.every(x => x.gripL < .02 && x.gripR < .002));
      assert.ok(rows.every(x => x.bottom >= -.006 && x.drawnIndexCount > 500));
      assert.ok(rows[8].bodyMeshes.some(m => m.skinned && m.triangles.length > 1000
        && m.vertices.every(Number.isFinite)), 'actual indexed body skin is deformed by the native skeleton');
      if (enabled) assert.equal(JSON.stringify(otherRealmSnapshot(r.ch)), JSON.stringify(api.rollerDetailMotionSnapshot(r.ch)));
      traces.push(rows); evidence.push({ scenario: enabled ? 'after-horizontal' : 'before-horizontal', rows });
    } finally { r.close(); }
  }
  assert.deepEqual(traces[0].map(x => x.gameplay), traces[1].map(x => x.gameplay), 'no ink/input/root/velocity/HP/timer/runner changes');
  const reversal = rows => {
    let highest = -Infinity, drop = 0;
    for (const x of rows.slice(0, 14)) { highest = Math.max(highest, x.center[1]); drop = Math.max(drop, highest - x.center[1]); }
    return drop;
  };
  assert.ok(reversal(traces[0]) > .07, 'foundation reproduces the extra windup dip');
  assert.ok(reversal(traces[1]) < .015, 'one rising startup replaces the extra dip');
  assert.notDeepEqual(traces[0][8].bones.handR, traces[1][8].bones.handR);
  assert.notEqual(traces[0][8].geometrySha256, traces[1][8].geometrySha256, 'drawn geometry follows the corrected native arm pose');
});

test('vertical release, recovery, held ground pushing and lift on a fresh attack retain native geometry and timing', async () => {
  const api = await production(), traces = [];
  for (const enabled of [false, true]) {
    const r = rig(api, { enabled }), rows = [];
    try {
      for (let i = 0; i < 115; i++) {
        r.step(1 / 60, { fire: i < 80 || i >= 100, firePressed: i === 0 || i === 100,
          grounded: i < 40 ? false : i < 100, speed: i > 45 && i < 80 ? 6.48 : 0 });
        rows.push(poseRow(api, r, i, [0, 18, 31, 38, 56, 65, 79, 85, 100, 110].includes(i)));
      }
      assert.ok(rows.every(x => x.gripL < .02 && x.gripR < .002 && x.bottom >= -.006));
      assert.equal(rows[30].gameplay.shots, 0); assert.equal(rows[31].gameplay.shots, 1);
      assert.equal(rows[30].drumW, 0); assert.ok(rows[31].drumW > 30);
      assert.equal(rows[52].gameplay.rolling,false); assert.equal(rows[53].gameplay.rolling,true,'31F release plus22F roll admission');
      assert.ok(rows[79].gameplay.rolling && rows[79].bottom < .055, 'completed held-push window settles to the unchanged drum-height bound');
      assert.equal(rows[100].gameplay.rolling, false, 'new airborne attack lifts the rolling drum');
      assert.ok(rows[110].center[1] > rows[79].center[1] + .5);
      traces.push(rows); evidence.push({ scenario: enabled ? 'after-vertical-push-lift' : 'before-vertical-push-lift', rows });
    } finally { r.close(); }
  }
  assert.deepEqual(traces[0], traces[1], 'vertical curves and ground pushing are preserved exactly');
});

test('35F/42F instance timing never replays the horizontal legacy tail; gameplay clocks are unchanged', async () => {
  const api = await production(), traces = [];
  for (const enabled of [false, true]) {
    const r = rig(api, { enabled, interval: [35 / 60, 42 / 60] }), rows = [];
    try {
      for (let i = 0; i < 50; i++) { r.step(1 / 60, { firePressed: i === 0 }); rows.push(poseRow(api, r, i)); }
      traces.push(rows); evidence.push({ scenario: enabled ? 'after-35F-tail' : 'before-35F-tail', rows });
      assert.equal(r.shots, 1);
    } finally { r.close(); }
  }
  assert.deepEqual(traces[0].map(x => x.gameplay), traces[1].map(x => x.gameplay));
  const C = api.CHARACTER_CHANNELS;
  assert.ok(traces[0][36].pose[C.ANCR] > -2.8, 'native .7s tail returns after authoritative 35F completion');
  assert.ok(Math.abs(traces[1][36].pose[C.ANCR] - ROLLER_POSE.READY_ROTATION[0]) < .05, 'completed attack stays in shoulder carry');
  assert.ok(Math.abs(traces[0][36].pose[C.ANCR] - ROLLER_POSE.READY_ROTATION[0]) > .3, 'the native tail is a different pose');
});

test('30/60/120Hz presentation and zero elapsed pause give identical 60Hz posed bones and indexed geometry', async () => {
  const api = await production(), traces = [];
  for (const hz of [30, 60, 120]) {
    const r = rig(api), clock = new api.FixedClock(), rows = [];
    try {
      for (let frame = 0; frame < hz; frame++) clock.advance(1 / hz, dt => {
        r.step(dt, { fire: true, firePressed: rows.length === 0 }); rows.push(poseRow(api, r, rows.length));
      });
      assert.equal(clock.ticks, 60); assert.equal(r.shots, 1); traces.push(rows);
      assert.ok(rows.every(x => x.bottom >= -.006 && x.gripL < .02 && x.gripR < .002));
    } finally { r.close(); }
  }
  assert.deepEqual(traces[0], traces[1]); assert.deepEqual(traces[1], traces[2]);
  const r = rig(api);
  try {
    r.step(1 / 60, { firePressed: true }); for (let i = 0; i < 8; i++) r.step();
    const game = gameplay(r), snap = api.rollerDetailMotionSnapshot(r.ch), C = api.CHARACTER_CHANNELS;
    const anchor = Array.from(r.ch.P.slice(C.ANC, C.ANCR + 3)), drumA = r.ch.weapon.drumA;
    for (let i = 0; i < 4; i++) r.step(0);
    assert.deepEqual(gameplay(r), game); assert.deepEqual(api.rollerDetailMotionSnapshot(r.ch), snap);
    assert.deepEqual(Array.from(r.ch.P.slice(C.ANC, C.ANCR + 3)), anchor); assert.equal(r.ch.weapon.drumA, drumA);
  } finally { r.close(); }
});

test('reset, death, sub aim, form, weapon and special interruption clear addon state without changing the runner', async () => {
  const api = await production(), r = rig(api), C = api.CHARACTER_CHANNELS;
  try {
    const start = () => { r.a.weaponRunner.reset(); r.a.form = 'kid'; r.a.grounded = true; r.ch.tr.fill(99); r.ch.wSub = 0;
      r.step(1 / 60, { firePressed: true }); r.step(); assert.equal(api.rollerDetailMotionSnapshot(r.ch).active, true); };
    start(); r.a.weaponRunner.reset(); assert.equal(api.rollerDetailMotionSnapshot(r.ch), null);
    start(); r.step(1 / 60, { sub: true }); assert.equal(api.rollerDetailMotionSnapshot(r.ch).active, false);
    const attack = r.a.weaponRunner.s3RollerAttack, elapsed = attack.elapsed;
    r.ch._poseFlick(r.ch.P, .1); assert.equal(attack.elapsed, elapsed); assert.equal(r.a.weaponRunner.s3RollerAttack, attack);
    start(); r.a.form = 'squid'; r.a._finishFrame(1 / 60); assert.equal(api.rollerDetailMotionSnapshot(r.ch).active, false);
    start(); r.a.specialActive = { id: 'unmapped', t: 0 }; r.a._finishFrame(1 / 60);
    assert.equal(api.rollerDetailMotionSnapshot(r.ch).active, false); r.a.specialActive = null;
    start(); r.a.setWeapon('shooter'); assert.equal(api.rollerDetailMotionSnapshot(r.ch), null);
    assert.equal(r.ch.weaponKind, 'shooter'); assert.ok(Number.isFinite(r.ch.P[C.SPINE]));
    r.a.setWeapon('roller'); start(); r.a.splat(null); assert.equal(api.rollerDetailMotionSnapshot(r.ch), null);
    assert.equal(r.a.alive, false);
  } finally { r.close(); assert.equal(api.rollerDetailMotionSnapshot(r.ch), null); }
});

test('hide interrupts the current roller startup without cancelling its native runner', async () => {
  const api = await production(), r = rig(api), nativeOnly = rig(api, { enabled: false });
  try {
    for (const x of [r, nativeOnly]) { x.step(1 / 60, { firePressed: true }); x.step(); }
    assert.equal(api.rollerDetailMotionSnapshot(r.ch).active, true);
    const attack = r.a.weaponRunner.s3RollerAttack;
    r.ch.setVisible(false); nativeOnly.ch.setVisible(false);
    assert.equal(api.rollerDetailMotionSnapshot(r.ch).active, false);
    assert.deepEqual(gameplay(r), gameplay(nativeOnly), 'all native hide/reset clock semantics remain unchanged');
    for (const x of [r, nativeOnly]) { x.ch.setVisible(true); x.step(); }
    assert.equal(r.a.weaponRunner.s3RollerAttack, attack);
    assert.equal(api.rollerDetailMotionSnapshot(r.ch).active, false, 'show cannot resurrect an interrupted startup');
    assert.deepEqual(gameplay(r), gameplay(nativeOnly));
    r.a.weaponRunner.reset(); r.step(1 / 60, { firePressed: true });
    assert.equal(api.rollerDetailMotionSnapshot(r.ch).active, true, 'a fresh native attack owns a new startup');
    api.G.scene.visible = false; r.step();
    assert.equal(api.rollerDetailMotionSnapshot(r.ch).active, false, 'hidden parent interrupts startup too');
  } finally { api.G.scene.visible = true; r.close(); nativeOnly.close(); }
});
