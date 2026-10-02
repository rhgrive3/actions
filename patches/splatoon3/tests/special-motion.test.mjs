import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { installSpecialMotion as duplicateInstaller } from '../runtime/special-motion.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.resolve(process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public'));
let cached;
const evidence = [];
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
    export { installSpecialMotion, specialMotionSnapshot } from './patches/splatoon3/runtime/special-motion.mjs';
    export { FixedClock } from './patches/splatoon3/runtime/clock.mjs';
  `, { context, identifier: path.join(ROOT, 'special-production-entry.mjs') });
  await entry.link((specifier, from) => load(specifier === 'three'
    ? path.join(SRC, 'vendor/three/build/three.module.js')
    : specifier.startsWith('three/addons/')
      ? path.join(SRC, 'vendor/three/jsm', specifier.slice('three/addons/'.length))
      : path.resolve(path.dirname(from.identifier), specifier)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = { ...entry.namespace.install(profile), ...entry.namespace, profile };
  api.installSpecialMotion(api, profile);
  const update = api.Character.prototype.update, slam = api.Character.prototype._poseSlam;
  api.installSpecialMotion(api, profile); duplicateInstaller(api, profile);
  assert.equal(api.Character.prototype.update, update);
  assert.equal(api.Character.prototype._poseSlam, slam);
  const { G, THREE } = api;
  G.scene = new THREE.Scene(); G.settings = { quality: 'high' };
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.level = { blocks: [], groundHeight: () => 0 }; G.paint = { sample: () => 1, splat: () => 0 };
  G.match = { playing: () => true, canRespawn: () => false };
  G.physics = { los: () => true, raycast: (_a, _b, _c, hit) => { hit.hit = false; return hit; } };
  G.projectiles = Object.fromEntries(['fireShooter', 'fireDualies', 'fireCharger', 'fireSplatling',
    'fireBlaster', 'fireSlosh', 'throwBomb', 'throwStorm', 'fireFlick'].map(name => [name, () => {}]));
  G.actors = []; G.time = 0; cached = api; return api;
}
function rig(api, kind = 'shooter', enabled = true) {
  const { Actor, Character, G, THREE } = api;
  const a = new Actor({ team: 0, name: 'special native regression', weapon: kind,
    CharacterClass: Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const ch = a.character; ch.actor = a; ch.onEvent = null; ch.s3SpecialMotionEnabled = enabled;
  a.grounded = a.ground.hit = true; G.actors.push(a); G.scene.add(ch.root);
  const visual = (dt = 1 / 60) => { G.time += dt; a._finishFrame(dt); ch.root.updateMatrixWorld(true); ch.skeleton.update(); };
  for (let i = 0; i < 60; i++) visual();
  assert.equal(ch._owner(), a); assert.equal(ch._runner(), a.weaponRunner);
  return { api, a, ch, visual, snapshot: () => api.specialMotionSnapshot(ch),
    close() { G.actors = G.actors.filter(x => x !== a); G.scene.remove(ch.root); ch.dispose(); } };
}
function start(r, id = 'slam') {
  assert.equal(r.a.weapon.special, id, 'use the real public kit');
  r.a._startSpecial();
}
function posed(r, label) {
  const { ch, api } = r, { THREE } = api;
  ch.root.updateMatrixWorld(true); ch.skeleton.update();
  const tier = ch.lod.to >= 0 && ch.lod.f >= .5 ? ch.lod.to : ch.lod.tier;
  const meshes = [];
  for (const mesh of ch.lodSets[tier].list) {
    if (!mesh.visible || !mesh.geometry.index) continue;
    const index = mesh.geometry.index, vertices = [];
    for (let k = 0; k < index.count; k += Math.max(1, Math.floor(index.count / 24))) {
      const vertex = index.getX(k), point = mesh.getVertexPosition(vertex, new THREE.Vector3());
      vertices.push({ indexOffset: k, vertex, world: point.applyMatrix4(mesh.matrixWorld).toArray() });
    }
    meshes.push({ name: mesh.name, triangles: index.count / 3, skinned: !!mesh.isSkinnedMesh, vertices });
  }
  assert.ok(meshes.length > 0 && meshes.some(x => x.skinned));
  return { label, diagnostic: r.snapshot(), pose: Array.from(ch.P),
    bones: Object.fromEntries(['hips', 'spine', 'chest', 'head', 'handL', 'handR', 'footL', 'footR'].map(name => [name, {
      world: ch.bones[name].getWorldPosition(new THREE.Vector3()).toArray(),
      quaternion: ch.bones[name].getWorldQuaternion(new THREE.Quaternion()).toArray() }])),
    weapon: ch.weapon.off.matrixWorld.toArray(), kid: ch.kid.matrixWorld.toArray(),
    nativeIK: Array.from(ch.ikErr), meshes };
}
function gameplay(a) {
  return { special: a.special, active: a.specialActive ? { ...a.specialActive } : null,
    pos: a.pos.toArray(), vel: a.vel.toArray(), ink: a.ink, hp: a.hp, grounded: a.grounded,
    form: a.form, invuln: a.invuln, stats: { ...a.stats }, runner: {
      charge: a.weaponRunner.charge, dodge: a.weaponRunner.dodge, lockT: a.weaponRunner.lockT } };
}
function save(rows) {
  const destination = process.env.INKWAVE_SPECIAL_TRACE_PATH; if (!destination) return;
  const folder = fs.realpathSync(path.dirname(destination));
  assert.ok(folder.startsWith('/mnt/workspace/.dev-state/agent-work/evidence/'));
  const file = path.join(folder, path.basename(destination));
  const body = { schema: 1, evidence: 'actual native posed bones/IK and indexed skinned vertex CPU output; GPU proof parent-owned',
    runtimeSha256: createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/runtime/special-motion.mjs'))).digest('hex'), rows };
  fs.writeFileSync(file + '.pending', JSON.stringify(body, null, 2) + '\n'); fs.renameSync(file + '.pending', file);
}

test('one production realm: special gates stop a cancelled leap and leave native clocks and geometry intact', async () => {
  const api = await production(), r = rig(api), before = rig(api, 'shooter', false);
  try {
    const rows = [];
    for (const x of [before, r]) {
      start(x); for (let i = 0; i < 14; i++) x.visual();
      const unchanged = gameplay(x.a); x.visual(0); assert.deepEqual(gameplay(x.a), unchanged);
      rows.push(posed(x, x === r ? 'after-rise' : 'before-rise'));
      x.a.specialActive = null; x.a.grounded = true; x.visual();
      rows.push(posed(x, x === r ? 'after-cancel' : 'before-cancel'));
    }
    assert.equal(r.snapshot().phase, null);
    const C = api.CHARACTER_CHANNELS;
    assert.ok(Math.abs(before.ch.P[C.MODELR]) > 1, 'native orphaned somersault is still running');
    assert.ok(Math.abs(r.ch.P[C.MODELR]) < .1, 'cancelled special no longer rotates the body');
    assert.notDeepEqual(rows[1].bones.handR, rows[3].bones.handR);
    assert.notDeepEqual(rows[1].meshes, rows[3].meshes);
    assert.equal(r.ch.tr[api.CHARACTER_TIMERS.T_LEAP], before.ch.tr[api.CHARACTER_TIMERS.T_LEAP]);
    evidence.push(...rows); save(evidence);
  } finally { r.close(); before.close(); }
});

test('real slam phase changes suppress leap; grounded recovery releases the normal weapon pose', async () => {
  const api = await production(), r = rig(api), before = rig(api, 'shooter', false);
  try {
    for (const x of [before, r]) { start(x); for (let i = 0; i < 34; i++) x.visual();
      x.a.specialActive.phase = 'hang'; x.a.specialActive.t = 0; x.visual(); }
    assert.equal(r.snapshot().phase, 'hang');
    const nativeHang = posed(before, 'before-hang'), calibratedHang = posed(r, 'after-hang');
    assert.notDeepEqual(nativeHang.bones.footL, calibratedHang.bones.footL);
    assert.notDeepEqual(nativeHang.meshes, calibratedHang.meshes);
    assert.ok(r.ch.bones.footL.getWorldPosition(new api.THREE.Vector3()).y
      > r.ch.bones.footR.getWorldPosition(new api.THREE.Vector3()).y + .15);
    evidence.push(nativeHang, calibratedHang);
    for (const x of [before, r]) { x.a.specialActive.phase = 'fall'; x.a.specialActive.t = 0; x.ch.trigger('special_slam');
      for (let i = 0; i < 3; i++) x.visual(); }
    assert.equal(r.snapshot().phase, 'fall');
    assert.ok(Math.abs(r.ch.P[api.CHARACTER_CHANNELS.MODELR]) < .1);
    evidence.push(posed(before, 'before-fall'), posed(r, 'after-fall'));
    for (const x of [before, r]) { x.a.specialActive = null; x.a.grounded = true; x.visual(); }
    assert.equal(r.snapshot().phase, 'slam-recovery');
    const clocks = Array.from(r.ch.tr), phase = r.snapshot(); r.visual(0);
    assert.deepEqual(Array.from(r.ch.tr), clocks); assert.deepEqual(r.snapshot(), phase);
    for (let i = 0; i < 28; i++) { r.visual(); before.visual(); }
    assert.equal(r.snapshot().phase, null);
    assert.ok(r.ch.tr[api.CHARACTER_TIMERS.T_SLAM] < 1.4, 'fade completes before the orphaned native timer');
    assert.ok(Array.from(r.ch.ikErr).every(x => Number.isFinite(x)));
    evidence.push(posed(before, 'before-recovered'), posed(r, 'after-recovered')); save(evidence);
    assert.ok(before.ch.ikErr[1] > .1, 'orphaned native strike puts the right target outside arm reach');
    assert.ok(r.ch.ikErr[1] < .0005, 'recovered actual two-bone IK no longer clamps that target');
    const hand = r.ch.weapon.def.handR.pos.clone();
    assert.ok(r.ch.weapon.off.localToWorld(hand).distanceTo(
      r.ch.bones.handR.getWorldPosition(new api.THREE.Vector3())) < .025);
  } finally { r.close(); before.close(); }
});

test('storm aligns empty-hand follow-through to actual immediate deployment, ordinary sub throws are unchanged', async () => {
  const api = await production(), r = rig(api, 'charger'), before = rig(api, 'charger', false);
  try {
    assert.equal(r.a.weapon.special, 'storm');
    let deployments = 0; api.G.projectiles.throwStorm = () => { deployments++; };
    for (const x of [before, r]) { start(x, 'storm'); x.visual(); }
    assert.equal(deployments, 2);
    const C = api.CHARACTER_CHANNELS;
    assert.ok(Math.abs(r.ch.P[C.FARML]) < Math.abs(before.ch.P[C.FARML]), 'released hand is no longer cocked behind the head');
    const nativeThrow = posed(before, 'before-storm'), releaseThrow = posed(r, 'after-storm');
    assert.notDeepEqual(releaseThrow.bones.handL, nativeThrow.bones.handL);
    evidence.push(nativeThrow, releaseThrow); save(evidence);
    for (const x of [before, r]) {
      x.a.specialActive = null; x.a.weaponRunner.aimingSub = true; x.visual();
      x.ch.trigger('throw'); x.a.weaponRunner.aimingSub = false; x.visual();
    }
    assert.equal(r.snapshot().phase, null);
    assert.ok(Math.abs(r.ch.P[C.FARML] - before.ch.P[C.FARML]) < .02);
    assert.equal(deployments, 2);
  } finally { r.close(); before.close(); }
});

test('actual native special physics, phase clocks, landing and resources are identical with the visual patch', async () => {
  const api = await production(), { G, THREE } = api, previous = G.physics;
  const floor = { id: 0, solid: true, center: new THREE.Vector3(0, -.5, 0), half: new THREE.Vector3(100, .5, 100),
    faces: [-1, -1, -1, -1, -1, -1],
    axes: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)],
    aabbMin: new THREE.Vector3(-100, -1, -100), aabbMax: new THREE.Vector3(100, 0, 100) };
  const level = { blocks: [floor], queryBlocks: (_x, _z, _ex, _ez, out) => { out.length = 0; out.push(0); return out; } };
  G.physics = new api.Physics(level);
  try {
    for (const id of ['slam', 'storm']) for (const hz of [30, 60, 120]) {
      const r = rig(api, id === 'slam' ? 'shooter' : 'charger'), before = rig(api, id === 'slam' ? 'shooter' : 'charger', false);
      try {
        for (const x of [before, r]) { x.a.pos.set(0, 0, 0); start(x, id); x.visual(0); }
        for (let i = 0; i < 2 * hz; i++) {
          for (const x of [before, r]) {
            if (x.a.specialActive) x.a._updateSpecial(1 / hz);
            const unchanged = gameplay(x.a); x.visual(1 / hz); assert.deepEqual(gameplay(x.a), unchanged);
          }
          assert.deepEqual(gameplay(r.a), gameplay(before.a));
        }
        assert.equal(r.a.specialActive, null); assert.equal(r.snapshot().phase, null);
        assert.ok(r.a.grounded);
      } finally { r.close(); before.close(); }
    }
  } finally { G.physics = previous; }
});

test('reset, death, form, sub, weapon and action interruption cannot resurrect a special pose', async () => {
  const api = await production();
  for (const interrupt of ['reset', 'death', 'form', 'sub', 'weapon', 'action', 'hidden']) {
    const r = rig(api);
    try {
      start(r); r.visual();
      if (interrupt === 'reset') r.a.reset();
      if (interrupt === 'death') r.a.splat();
      if (interrupt === 'form') r.a.form = 'squid';
      if (interrupt === 'sub') r.a.weaponRunner.aimingSub = true;
      if (interrupt === 'weapon') r.a.setWeapon('charger');
      if (interrupt === 'action') r.ch.trigger('squidroll', { duration: .2 });
      if (interrupt === 'hidden') { r.ch.setVisible(false); r.a.specialActive = null; }
      if (interrupt === 'form') r.ch.update(1 / 60, { form: 'squid', grounded: false }); else r.visual();
      assert.equal(r.snapshot().phase, null, interrupt);
      if (interrupt === 'form') {
        for (let i = 0; i < 4; i++) r.ch.update(1 / 60, { form: 'squid', grounded: false });
        r.ch.update(1 / 60, { form: 'kid', grounded: true });
        assert.equal(r.snapshot().phase, null, 'the same interrupted live token stays cancelled');
      }
      r.a.specialActive = null; r.a.form = 'kid'; r.a.weaponRunner.aimingSub = false;
      r.ch.setVisible(true); r.visual(); assert.equal(r.snapshot().phase, null, interrupt);
      r.a.reset(); r.a.setWeapon('shooter'); start(r); r.visual();
      assert.equal(r.snapshot().phase, 'rise', `fresh special after ${interrupt}`);
    } finally { r.close(); }
  }
});

test('30/60/120Hz presentation schedules produce identical real pose output at fixed gameplay ticks', async () => {
  const api = await production(), traces = [];
  for (const hz of [30, 60, 120]) {
    const r = rig(api), clock = new api.FixedClock(), rows = [];
    try {
      start(r);
      for (let frame = 0; frame < hz; frame++) clock.advance(1 / hz, dt => {
        const tick = clock.ticks;
        if (tick === 20) { r.a.specialActive.phase = 'fall'; r.a.specialActive.t = 0; r.ch.trigger('special_slam'); }
        if (tick === 25) { r.a.specialActive = null; r.a.grounded = true; }
        r.visual(dt); rows.push({ phase: r.snapshot().phase, pose: Array.from(r.ch.P),
          hand: r.ch.bones.handR.getWorldPosition(new api.THREE.Vector3()).toArray(), ik: Array.from(r.ch.ikErr) });
      });
      assert.equal(clock.ticks, 60); traces.push(rows);
    } finally { r.close(); }
  }
  assert.deepEqual(traces[0], traces[1]); assert.deepEqual(traces[1], traces[2]);
});

test('nullable native preview and disposal have no persistent resources', async () => {
  const api = await production(), ch = new api.Character({ weapon: 'shooter' });
  ch.onEvent = null;
  ch.update(0, null); ch.update(1 / 60, null);
  assert.ok(Array.from(ch.P).every(Number.isFinite));
  assert.equal(api.specialMotionSnapshot(ch).phase, null);
  ch.dispose(); assert.equal(api.specialMotionSnapshot(ch), null);
});

test('incomplete network special state retains native replay rather than inventing a phase', async () => {
  const api = await production(), r = rig(api), before = rig(api, 'shooter', false);
  try {
    for (const x of [before, r]) { start(x); x.a.specialActive = { id: 'slam', net: true };
      for (let i = 0; i < 35; i++) x.visual(); }
    assert.equal(r.snapshot().phase, 'native-unmapped');
    assert.deepEqual(Array.from(r.ch.P), Array.from(before.ch.P));
    r.a.specialActive = null; r.visual(); assert.equal(r.snapshot().phase, null);
  } finally { r.close(); before.close(); }
});
