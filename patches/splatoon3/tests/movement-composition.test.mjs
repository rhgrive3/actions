import test from 'node:test';
import { CATALOG_WALL_HEIGHT, CATALOG_SCENARIOS, catalogRenderFrames } from '../../../scripts/check-inkwave-motion-catalog.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { installMovementMotion, movementMotionSnapshot } from '../runtime/movement-motion.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.join(ROOT, 'inkwave-public');
const plain = value => JSON.parse(JSON.stringify(value));
// Exact pre-fix cb381b3 blob, available in shallow clones and source archives.
const legacySource = fs.readFileSync(new URL('./fixtures/movement-owner-before.mjs', import.meta.url), 'utf8');
assert.equal(createHash('sha256').update(legacySource).digest('hex'), '385583f2102796592356007aaea0083ac5e61e7ad48a8166bedc28c9286a172c');

// Fresh complete production realm for every experiment, including every motion
// installer. Do not join source-fixture's stub Character to a different Actor.
async function production(legacyMovement = false) {
  const context = vm.createContext({ console, performance, URL, innerHeight: 720 }), modules = new Map();
  const load = requested => {
    let file = requested.startsWith(path.join(SRC, 'patches') + path.sep)
      ? path.join(ROOT, path.relative(SRC, requested)) : requested;
    if (file.startsWith(path.join(ROOT, 'src') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    const source = legacyMovement && file === path.join(ROOT, 'patches/splatoon3/runtime/movement-motion.mjs')
      ? legacySource
      : fs.readFileSync(file, 'utf8');
    const mod = new vm.SourceTextModule(file.startsWith(SRC + path.sep) ? adaptSource(path.relative(SRC, file), source) : source,
      { context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    modules.set(file, mod); return mod;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { installMovementMotion, movementMotionSnapshot } from './patches/splatoon3/runtime/movement-motion.mjs';
    export { FixedClock } from './patches/splatoon3/runtime/clock.mjs';
    export { beforeActions } from './patches/splatoon3/runtime/movement.mjs';
    export { wallMotionSnapshot } from './patches/splatoon3/runtime/wall-motion.mjs';
    export { Level } from './inkwave-public/src/world/level.js';
  `, { context, identifier: path.join(ROOT, 'movement-composition-entry.mjs') });
  await entry.link((spec, from) => load(spec === 'three' ? path.join(SRC, 'vendor/three/build/three.module.js')
    : spec.startsWith('three/addons/') ? path.join(SRC, 'vendor/three/jsm', spec.slice(13))
      : path.resolve(path.dirname(from.identifier), spec)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = { ...entry.namespace.install(profile), ...entry.namespace, profile };
  const { G, THREE, Physics, Level } = api;
  const level = new Level({ bounds: { minX: -30, maxX: 30, minZ: -30, maxZ: 30 }, spawnPads: [[-25, 0, 0], [25, 0, 0]],
    spawnBarrier: 0, half: [], single: [{ kind: 'box', min: [-30, -.5, -30], max: [30, 0, 30] }] });
  Object.assign(G, { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), settings: { quality: 'high' },
    actors: [], time: 0, level, physics: new Physics(level), mode: 'match',
    teamColors: [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')],
    match: { playing: () => true, canRespawn: () => false }, paint: { sample: () => 1, splat: () => 0 } });
  // CPU boundary: uniform own ink; real collision and Projectiles/Runner, with
  // no whole-game update or projectile advance. No GPU claim in these tests.
  G.projectiles = new api.Projectiles(G.scene);
  return api;
}
function rig(api) {
  const a = new api.Actor({ team: 0, name: 'full movement composition', isLocal: true, weapon: 'shooter',
    CharacterClass: api.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const ch = a.character; ch.actor = a; api.G.actors.push(a); api.G.scene.add(ch.root); ch.setLod('game');
  const step = dt => { api.G.time += dt; a.anim.time = api.G.time; a.update(dt); ch.root.updateMatrixWorld(true); ch.skeleton.update(); };
  for (let i = 0; i < 60; i++) step(1 / 60);
  return { a, ch, step, close() { ch.dispose(); api.G.projectiles.clear(); } };
}
const characterHooks = ['update', '_updateSquid', 'trigger', 'dispose'];
const actorHooks = ['_finishFrame', 'reset', 'splat', '_startSpecial', 'superJump'];

test('full production cross-realm registration keeps every composed hook and exposes the owning snapshot', async () => {
  const api = await production(), r = rig(api), { a, ch } = r;
  try {
    a.intent.squid = true; for (let i = 0; i < 30; i++) r.step(1 / 60);
    a.vel.set(0, 0, 11.52); a.intent.move.set(0, 0, -1); a.intent.jump = true; r.step(1 / 60);
    assert.ok(a.s3.roll && api.movementMotionSnapshot(ch).phase === 'roll', 'native reversal launches real Roll');
    assert.deepEqual(plain(movementMotionSnapshot(ch)), plain(api.movementMotionSnapshot(ch)), 'snapshot crosses module realms');
    const hooks = characterHooks.map(k => api.Character.prototype[k]), actors = actorHooks.map(k => api.Actor.prototype[k]);
    installMovementMotion(api, api.profile); api.installMovementMotion(api, api.profile); installMovementMotion(api, api.profile);
    assert.deepEqual(characterHooks.map(k => api.Character.prototype[k]), hooks, 'all later production Character hooks retained');
    assert.deepEqual(actorHooks.map(k => api.Actor.prototype[k]), actors, 'all later production Actor hooks retained');
    a.intent.jump = false; r.step(1 / 60);
    assert.deepEqual(plain(movementMotionSnapshot(ch)), plain(api.movementMotionSnapshot(ch)));
  } finally { r.close(); }
});

function output(api, r) {
  const { a, ch } = r, { THREE } = api;
  const skin = ch.root.getObjectsByProperty('isSkinnedMesh', true).find(m => m.geometry.index && !m.name.startsWith('s3-'));
  assert.ok(skin && ch.squid.body.geometry.index && a.weaponRunner, 'native indexed geometry/Runner exists');
  const vertices = mesh => [0, Math.floor(mesh.geometry.index.count / 2), mesh.geometry.index.count - 1].map(i =>
    mesh.getVertexPosition(mesh.geometry.index.getX(i), new THREE.Vector3()).applyMatrix4(mesh.matrixWorld).toArray());
  return plain({ pos: a.pos.toArray(), vel: a.vel.toArray(), root: ch.root.position.toArray(), yaw: a.yaw,
    ink: a.ink, hp: a.hp, input: a.intent, actions: a.s3.actions, grounded: a.grounded, form: a.form,
    time: api.G.time, poseTime: ch.t, nativeTimers: Array.from(ch.tr), springs: [ch.sqScale, ch.sqQuat.toArray()],
    runner: Object.fromEntries(['cooldown', 'chargeT', 'charge', 'slosh', 'lockT', 'streaming', 'aimingSub'].map(k => [k, a.weaponRunner[k]])),
    motion: api.movementMotionSnapshot(ch), pivot: ch.squid.pivot.quaternion.toArray(), scale: ch.squid.pivot.scale.toArray(),
    squid: vertices(ch.squid.body), skin: vertices(skin), bones: ch.skeleton.bones.map(b => b.matrixWorld.elements),
    ik: Array.from(ch.ikErr), muzzle: ch.getMuzzle(new THREE.Vector3()).toArray() });
}
async function trace(hz, duplicate, legacy = false) {
  const api = await production(legacy), r = rig(api), rows = [], clock = new api.FixedClock();
  try {
    r.a.intent.squid = true; for (let i = 0; i < 30; i++) r.step(1 / 60);
    r.a.vel.set(0, 0, 11.52);
    if (duplicate) installMovementMotion(api, api.profile);
    let roll = false, landed = false, air = false;
    for (let i = 0; i < hz * 2; i++) clock.advance(1 / hz, dt => {
      r.a.intent.move.set(0, 0, clock.ticks < 36 ? -1 : 0); r.a.intent.jump = clock.ticks === 0;
      r.step(dt); roll ||= !!r.a.s3.roll; air ||= !r.a.grounded; landed ||= air && r.a.grounded;
      rows.push(output(api, r));
    });
    assert.equal(clock.ticks, 120); assert.ok(roll && landed, 'actual native roll/collision/landing exercised');
    assert.ok(rows.some(row => row.motion.spin > 4), 'dedicated motion exercised');
    assert.ok(rows.every(row => row.ik.every(Number.isFinite)));
    return rows;
  } finally { r.close(); }
}
test('duplicate realm install preserves complete native gameplay, visual clocks, indexed output and IK at 30/60/120Hz', async () => {
  // Only the movement module comes from the frozen pre-fix production commit.
  // This is a preservation oracle, not a mock of native behavior.
  const baseline = await trace(60, false, true);
  for (const hz of [30, 60, 120]) {
    const actual = await trace(hz, true);
    for (let tick = 0; tick < baseline.length; tick++) assert.deepEqual(actual[tick], baseline[tick], `${hz}Hz native tick ${tick}`);
  }
});

test('reset/disposal route to the character owner and cannot reacquire disposed movement state', async () => {
  const api = await production(), r = rig(api), { a, ch } = r;
  try {
    a.intent.squid = true; for (let i = 0; i < 30; i++) r.step(1 / 60);
    a.vel.set(0, 0, 11.52); a.intent.move.set(0, 0, -1); a.intent.jump = true; r.step(1 / 60);
    assert.equal(api.movementMotionSnapshot(ch).phase, 'roll');
    const frozen = plain(api.movementMotionSnapshot(ch)); a._finishFrame(0);
    assert.deepEqual(plain(api.movementMotionSnapshot(ch)), frozen, 'dt0 freezes action age');
    a.reset(); assert.equal(api.movementMotionSnapshot(ch).phase, null);
    assert.equal(movementMotionSnapshot(ch).phase, null); assert.equal(a.anim.movementMotion, undefined);
    ch.update(0, null); assert.equal(ch.form, 'kid', 'native nullable preview retained');
    ch.dispose(); assert.equal(api.movementMotionSnapshot(ch), null); assert.equal(movementMotionSnapshot(ch), null);
    installMovementMotion(api, api.profile);
    ch.trigger('squidroll'); ch.update(1 / 60, { form: 'squid', grounded: false });
    a.reset(); a._finishFrame(0); ch.dispose();
    assert.equal(api.movementMotionSnapshot(ch), null); assert.equal(movementMotionSnapshot(ch), null);
    assert.equal(a.anim.movementMotion, undefined, 'disposed owner cannot regain a live movement frame');
  } finally { r.close(); }
});

// Native CPU driver coverage; GPU RGB pairs are still required separately by CI.
test('catalog wall leaves room for moving charge, readiness, launch and crest samples', async () => {
  const api = await production(), { THREE, G, Physics } = api;
  const floor = { id: 0, solid: true, center: new THREE.Vector3(0, -.5, 0),
    half: new THREE.Vector3(200, .5, 200), faces: [-1, -1, -1, -1, -1, -1],
    axes: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)],
    aabbMin: new THREE.Vector3(-200, -1, -200), aabbMax: new THREE.Vector3(200, 0, 200) };
  const traces = [];
  for (const height of [3, CATALOG_WALL_HEIGHT]) {
    const wall = { id: 1, solid: true, center: new THREE.Vector3(0, height / 2, -.7),
      half: new THREE.Vector3(3, height / 2, .2), faces: [0, 0, 0, 0, 0, 0], axes: floor.axes,
      aabbMin: new THREE.Vector3(-3, 0, -.9), aabbMax: new THREE.Vector3(3, height, -.5) };
    const level = { blocks: [floor], groundHeight: () => 0, pointInside: () => false,
      faces: [{ origin: new THREE.Vector3(), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 1, 0) }],
      spawnPads: [new THREE.Vector3(), new THREE.Vector3(0, 0, 20)],
      queryBlocks: (_a, _b, _c, _d, out) => {
        out.length = 0; out.push(...level.blocks.map(b => b.id)); return out;
      } };
    G.level = level; G.physics = new Physics(level); G.actors = [];
    const a = new api.Actor({ team: 0, name: 'catalog wall probe', weapon: 'shooter',
      isLocal: true, CharacterClass: api.Character });
    const ch = a.character; ch.actor = a; G.actors.push(a);
    a.grounded = a.ground.hit = true; a.ground.block = 0; a.groundN.set(0, 1, 0);
    function step() {
      a.intent.fire = false; G.time += 1 / 60;
      a.weaponRunner.update(1 / 60, {}); a._finishFrame(1 / 60);
      ch.root.updateMatrixWorld(true); ch.skeleton.update();
    }
    try {
      for (let i = 0; i < 100; i++) step();
      level.blocks = [floor, wall]; a.form = 'squid'; a.submerged = false;
      a.pos.set(0, .5, -.05); a.intent.move.set(0, 0, -1); a._updateClimb(1 / 60, true);
      for (let i = 0; i < 40; i++) step();
      const samples = [];
      for (let frame = 0; frame < 180; frame++) {
        a.intent.jump = frame >= 20 && frame < 75;
        a._updateClimb(1 / 60, true); api.beforeActions(a, 1 / 60, false);
        a._integrate(1 / 60, true, false); step();
        samples.push({ ...api.wallMotionSnapshot(ch), frame, y: a.pos.y });
      }
      traces.push(samples);
    } finally { ch.dispose(); }
  }
  const [old, current] = traces;
  assert.equal(old.some(s => s.phase === 'launch'), false, 'negative control: short wall crests before release');
  assert.ok(current.filter(s => s.phase === 'charge').length >= 20);
  assert.ok(current.some(s => s.ready && s.glow > 0), 'native readiness glint remains observable');
  const scenario = CATALOG_SCENARIOS.find(s => s.name === 'wall-surge-ready-crest');
  const renders = catalogRenderFrames(scenario);
  for (const phase of ['charge', 'launch', 'crest']) {
    assert.ok(renders.some(frame => current[frame].phase === phase), `actual scheduled RGB frames include ${phase}`);
  }
  G.projectiles.clear();
});
