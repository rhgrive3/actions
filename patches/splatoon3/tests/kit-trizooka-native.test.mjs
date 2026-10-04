// Trizooka NATIVE-pipeline tests (lane freebuff-2, issue 177).
//
// These drive the REAL adapted native `Projectiles._step` / `_blastBurst` /
// `_new` / `ghostProjectile` with the Trizooka hooks installed, through the real
// production installer. They assert the single native pipeline really applies
// the stage constants, the orbit difference, the growing radii, the pooled-field
// clearing and the ghost reconstruction — not that the selectors return plausible
// metadata.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { installKitTrizooka, VOLLEY_CONFIG, throwVolley, trizookaSpecialWeapon, TRIZOOKA_PROJECTILE_FIELDS } from '../runtime/kit-trizooka.mjs';
import { kitTrizookaClearPooled, kitTrizookaGhost, isDamageCarrier, kitTrizookaFlight } from '../runtime/trizooka-collision.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.resolve(process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public'));
const F = 1 / 60;
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6, `${m || ''} ${a} ~ ${b}`);

let cached;
async function production() {
  if (cached) return cached;
  const context = vm.createContext({ console, performance, URL });
  const modules = new Map();
  const map = (f) => (f.startsWith(path.join(SRC, 'patches') + path.sep)
    ? path.join(ROOT, path.relative(SRC, f))
    : f.startsWith(path.join(ROOT, 'inkwave-public') + path.sep)
      ? path.join(SRC, path.relative(path.join(ROOT, 'inkwave-public'), f))
      : f.startsWith(path.join(ROOT, 'src') + path.sep)
        ? path.join(SRC, path.relative(ROOT, f))
        : f);
  const load = (file) => {
    if (modules.has(file)) return modules.get(file);
    const raw = fs.readFileSync(file, 'utf8');
    const source = file.startsWith(SRC + path.sep) ? adaptSource(path.relative(SRC, file), raw) : raw;
    const m = new vm.SourceTextModule(source, {
      context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; },
    });
    modules.set(file, m);
    return m;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export * from './inkwave-public/src/core/ctx.js';
    export * from './inkwave-public/src/config.js';
    export * from './inkwave-public/src/game/actor.js';
    export * from './inkwave-public/src/game/weapons.js';
    export * from './inkwave-public/src/game/physics.js';
    export * as THREE from 'three';
  `, { context, identifier: path.join(ROOT, 'trizooka-native-entry.mjs') });
  await entry.link((specifier, from) => {
    if (specifier === 'three') return load(path.join(SRC, 'vendor/three/build/three.module.js'));
    if (specifier.startsWith('three/addons/')) return load(path.join(SRC, 'vendor/three/jsm', specifier.slice('three/addons/'.length)));
    return load(map(path.resolve(path.dirname(from.identifier), specifier)));
  });
  await entry.evaluate();
  const ns = entry.namespace;
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json'), 'utf8'));
  const api = ns.install(profile);
  installKitTrizooka(api, profile);      // explicit, exactly as the parent will call it
  cached = api;
  return api;
}

// A real native world: one axis-aligned block standing in the flight path.
function world(api, { blockAt = [6, 1.2, 0], blockSize = [2, 4, 4] } = {}) {
  const { G, THREE } = api;
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.time = 0; G.actors = []; G.netm = null; G.boss = null; G.local = null;
  G.fx = null; G.audio = null;
  G.camera = { position: new THREE.Vector3(0, 6, 12) };
  // a real oriented block: the native Physics needs center/axes/half/id
  const center = new THREE.Vector3(blockAt[0], blockSize[1] / 2, blockAt[2]);
  const block = {
    id: 0,
    center,
    half: new THREE.Vector3(blockSize[0] / 2, blockSize[1] / 2, blockSize[2] / 2),
    axes: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)],
    faces: [-1, -1, -1, -1, -1, -1],   // no face UVs: this block is collision-only
    solid: true, grate: false,
  };
  G.level = {
    blocks: [block], faces: [], spawnPads: [new THREE.Vector3(), new THREE.Vector3()],
    queryBlocks: (x0, z0, x1, z1, out = []) => { out.length = 0; out.push(0); return out; },
    groundHeight: () => 0,
  };
  G.physics = new api.Physics(G.level);          // the REAL collision implementation
  G.paint = { sample: () => 1, splat: () => 0 };
  G.match = { playing: () => true, canRespawn: () => true };
  const projectiles = new api.Projectiles(new THREE.Scene());
  G.projectiles = projectiles;
  return projectiles;
}

function shooter(api) {
  const a = new api.Actor({ team: 0, name: 'native', weapon: 'shooter', isLocal: true, CharacterClass: api.Character });
  api.G.actors = [a];
  a._spawnBarrier = () => {}; a._finishFrame = () => {}; a._integrate = () => {};
  a.weapon = { ...api.WEAPONS.shooter, special: 'trizooka', specialCost: 200, sub: 'suction' };
  a.special = 200;
  a.pos.set(0, 0, 0);
  a.aimYaw = 0; a.aimPitch = 0;
  a.aimPoint.set(0, 1.5, 20);
  a.aimDir.set(0, 0, 1);
  return a;
}

// ---- the native step really applies the stage constants --------------------

test('the native _step applies the three flight stages, not the launch gravity', async () => {
  const api = await production();
  const projectiles = world(api);
  const a = shooter(api);
  const fired = throwVolley(projectiles, a, trizookaSpecialWeapon());
  const p = fired[VOLLEY_CONFIG.damageLobeIndex];

// the native step advances p.age BEFORE the hook runs, so each case sets the age
// one frame below the boundary it wants to observe
p.age = 0;
projectiles._step(p, F);
assert.equal(p.s3Stage, 'straight', 'frame 0 is the straight stage');
assert.equal(p.grav, 0, 'straight flight is gravity-free in the native step');
assert.equal(p.drag, 0);

p.age = 14 / 60;
projectiles._step(p, F);
assert.equal(p.s3Stage, 'straight', 'still straight on frame 15');
assert.equal(p.grav, 0, 'still gravity-free on frame 15');

p.age = 16 / 60;
projectiles._step(p, F);
assert.equal(p.s3Stage, 'brake', 'frame 16 starts the brake stage');
near(p.grav, 0.09 * 3600, 1);
near(p.drag, 0.09 * 60, 1);

p.age = 26 / 60;
projectiles._step(p, F);
assert.equal(p.s3Stage, 'free', 'frame 26 reaches the free stage');
near(p.grav, 0.0190565 * 3600, 1);
assert.notEqual(p.grav, 0.09 * 3600, 'the free stage is not the brake gravity');
});

test('a non-trizooka projectile is untouched by the flight hook', async () => {
  const api = await production();
  const projectiles = world(api);
  const a = shooter(api);
  const p = projectiles._new();
  p.type = 'shot'; p.wid = 'shooter'; p.owner = a; p.team = 0; p.age = 0;
  p.life = 5; p.straight = 0; p.damage = 36; p.size = 0.2; p.grav = 57.6; p.drag = 0;
  p.pos.set(0, 2, 0); p.prev.copy(p.pos);
  const y0 = p.pos.y;
  projectiles._step(p, F);
  assert.equal(p.grav, 57.6, 'the native gravity is untouched');
  assert.equal(p.s3Stage, undefined, 'and no kit stage was stamped');
  assert.ok(p.pos.y < y0, 'the native integrator still applied gravity');
});

// ---- the orbit is a difference around the centreline ------------------------

test('the orbit is applied as an offset difference, not an absolute circle', async () => {
  const api = await production();
  const projectiles = world(api, { blockAt: [999, 0, 0] });
  const a = shooter(api);
  const fired = throwVolley(projectiles, a, trizookaSpecialWeapon());
  const p = fired[VOLLEY_CONFIG.damageLobeIndex];// the baseline is the SAME launch state without the kit hook, so the only
  // difference measured is the orbit correction
const plain = projectiles._new();
  Object.assign(plain, { type: 'shot', wid: 'shooter', owner: a, team: 0, age: 0, life: 5,
    straight: 99, damage: 0, size: 0, grav: 0, drag: 0 });
  plain.pos.copy(p.pos); plain.prev.copy(p.pos); plain.vel.copy(p.vel);
  const plainSteps = [];
  for (let i = 0; i < 8; i++) { projectiles._step(plain, F); plainSteps.push(plain.pos.clone()); }

  const kitSteps = [];
  for (let i = 0; i < 8; i++) { projectiles._step(p, F); kitSteps.push(p.pos.clone()); }

  assert.equal(p.s3OrbitApplied, true, 'the orbit hook ran');
  // the deviation must stay bounded and oscillate: an absolute circle added every
  // frame would accumulate without bound
  const offsets = kitSteps.map((q, i) => q.distanceTo(plainSteps[i]));
  for (const d of offsets) assert.ok(d < 3, `offset stayed bounded, got ${d}`);
  const changes = offsets.slice(1).map((d, i) => Math.abs(d - offsets[i]));
  assert.ok(changes.some((c) => c > 1e-4), 'the offset actually moves rather than accumulating');
  // and the first frame is at most one orbit radius off the centreline
  assert.ok(offsets[0] <= 1.001, `first frame offset bounded by OrbitalRadiusEnd, got ${offsets[0]}`);
});

// ---- growing radii are real geometry ---------------------------------------

test('the growing actor sphere actually changes the native capsule query', async () => {
  const api = await production();
  const projectiles = world(api, { blockAt: [999, 0, 0] });
  const a = shooter(api);
  const enemy = new api.Actor({ team: 1, name: 'target', weapon: 'shooter', isLocal: false, CharacterClass: api.Character });
  api.G.actors = [a, enemy];
  enemy.pos.set(0, 0, 3.2);
  enemy._spawnBarrier = () => {}; enemy._finishFrame = () => {}; enemy._integrate = () => {};

  const fired = throwVolley(projectiles, a, trizookaSpecialWeapon());
  const p = fired[VOLLEY_CONFIG.damageLobeIndex];
  p.pos.set(0, 0.7, 2.4); p.prev.copy(p.pos);
  p.age = 0;                                     // sphere just out of the 0.01 init radius
  projectiles._step(p, F);
  const early = p.s3ActorRadius;
  p.age = 10 / 60;                               // sphere completed at 10F
  projectiles._step(p, F);
  const grown = p.s3ActorRadius;
  assert.ok(early < 0.2, `the sphere starts near the 0.01 init radius, got ${early}`);
  assert.ok(grown > 0.7, `the sphere grows to its 0.75 end radius, got ${grown}`);
  assert.ok(grown > early * 3, 'and it is genuinely increasing');
  // the number is real geometry, not metadata: the native capsule query inflates
  // by s3SizeBase + this radius
  const { kitTrizookaActorRadius } = await import('../runtime/trizooka-collision.mjs');
  const native = api.PLAYER.radius * 0.95 + p.size;
  assert.equal(kitTrizookaActorRadius(projectiles, p), native + grown,
    'the native body capsule and visual shell are both kept, with only the table sphere added');
  assert.ok(kitTrizookaActorRadius(projectiles, p) > native, 'it really inflates the capsule');
});

test('the growing world sphere contacts a block earlier than the bare point ray', async () => {
  const api = await production();
  const projectiles = world(api, { blockAt: [0, 1.2, 8], blockSize: [2, 4, 4] });
  const a = shooter(api);
  const T = api.THREE;
  const hit = new api.Hit();
  // the bare native point ray: the block spans z 6..10, so the near face is at 6m
  const probe = api.G.physics.segment(new T.Vector3(0, 1.2, 0), new T.Vector3(0, 1.2, 20), hit, true);
  assert.equal(probe.hit, true, 'the block is really in the flight path');
  const faceDist = probe.dist;
  assert.ok(Math.abs(faceDist - 6) < 0.2, `the block face is at ~6m along the path, got ${faceDist}`);

  // the same query through the growing sphere must report an earlier contact
  const { kitTrizookaWorldSweep } = await import('../runtime/trizooka-collision.mjs');
  const probe2 = projectiles._new();
  Object.assign(probe2, { wid: 'trizooka', damageOwner: true, ghost: false, size: 0.22,
    pos: new T.Vector3(0, 1.2, 20), prev: new T.Vector3(0, 1.2, 0) });
  probe2.age = 12 / 60;                             // field sphere is part-grown
  kitTrizookaFlight(projectiles, probe2, F);
  assert.ok(probe2.s3WorldRadius > 0, 'the field sphere has grown');
  const swept = kitTrizookaWorldSweep(projectiles, probe2, new api.Hit(), api.G.physics);
  assert.equal(swept.hit, true);
  assert.ok(swept.dist < faceDist - 0.001,
    `the sphere contacts before the point ray: ${swept.dist} vs ${faceDist}`);
  assert.ok(swept.point.z < 6 - 0.001, 'and the contact point is on the near side of the face');
});

// ---- pooled reuse ----------------------------------------------------------

test('pooled reuse clears every transient kit field', async () => {
  const api = await production();
  const projectiles = world(api);
  const a = shooter(api);
  const fired = throwVolley(projectiles, a, trizookaSpecialWeapon());
  const p = fired[0];
  projectiles._step(p, F);                          // stamps the stage fields
  assert.ok(p.s3Stage, 'the step stamped transient state');
  assert.ok(p.s3ActorRadius > 0);
  p.s3SpecialWeapon = trizookaSpecialWeapon();
  p.s3Yaw = 1.2;
  p.damageOwner = true;

  projectiles.clear();                             // returns every object to the pool
  const reused = [projectiles._new(), projectiles._new(), projectiles._new()];
  assert.ok(reused.includes(p), 'the pool really handed the object back');
  for (const r of reused) {
    // the parent's weapons.mjs _new wrapper re-assigns s3SpecialWeapon/s3Weapon to
    // null after the native body, so "cleared" means falsy, not absent
    for (const k of TRIZOOKA_PROJECTILE_FIELDS) assert.ok(!r[k], `${k} leaked a truthy value through the pool: ${r[k]}`);
    assert.ok(!r.damageOwner, 'damage ownership leaked');
    assert.ok(!r.s3ActorRadius && !r.s3WorldRadius, 'the grown radii leaked');
    assert.equal(r.wid, null, 'the native wid reset still applies');
    assert.equal(r.damage, 0, 'the damage of the previous volley was cleared');
  }
});

// ---- ghost reconstruction ---------------------------------------------------

test('a ghost rebuilds its descriptor and is stripped of all authority', async () => {
  const api = await production();
  const projectiles = world(api);
  const a = shooter(api);
  const fired = throwVolley(projectiles, a, trizookaSpecialWeapon());
  const source = fired[VOLLEY_CONFIG.damageLobeIndex];const ghostOwner = shooter(api);
  ghostOwner.team = 1;
  const ghost = projectiles._new();
ghost.type = 'blast'; ghost.wid = 'trizooka'; ghost.owner = ghostOwner; ghost.team = 1;
ghost.ghost = true; ghost.pos.set(0, 2, 0); ghost.prev.copy(ghost.pos);
kitTrizookaGhost(ghost, ghostOwner, api.SPECIALS);
assert.equal(ghost.ghost, true);
assert.equal(ghost.wid, 'trizooka');
assert.ok(ghost.s3SpecialWeapon, 'the descriptor was reconstructed for the visual trajectory');
assert.equal(ghost.s3SpecialWeapon.kind, 'trizooka');
assert.equal(isDamageCarrier(ghost), false, 'a ghost is never a damage carrier');
assert.equal(isDamageCarrier(source), true, 'the live carrier still is');

kitTrizookaClearPooled(ghost);
assert.ok(!ghost.s3SpecialWeapon, 'and it can be cleared like any pooled round');
});

// ---- side lobes are visual only --------------------------------------------

test('only the damage carrier may damage, paint or turf', async () => {
  const api = await production();
  const projectiles = world(api, { blockAt: [999, 0, 0] });
  const a = shooter(api);
  const fired = throwVolley(projectiles, a, trizookaSpecialWeapon());
  const carriers = fired.filter((p) => isDamageCarrier(p));
  assert.equal(carriers.length, 1, 'exactly one authoritative lobe');
  for (const p of fired.filter((x) => !isDamageCarrier(x))) {
    assert.equal(p.damage, 0, 'a side lobe carries no damage');
    assert.notEqual(p.type, 'blast', 'a side lobe never enters the blast path');
    assert.equal(p.trailEvery, 0, 'and it paints no trail');
  }
  // a ghost carrier is never authoritative even though it looks like one
  const g = fired[0];
  g.ghost = true;
  assert.equal(isDamageCarrier(g), false, 'ghosts have no authority even when the transport is disposed');
});

// ---- bands ------------------------------------------------------------------

test('the blast steps the discrete damage bands instead of lerping', async () => {
  const api = await production();
  const { distanceDamage } = await import('../runtime/weapons.mjs');
  const bands = [[2.5, 53], [4.0, 35]];
  // the stepped form returns a table point, never an interpolated value:
  // 53 inside 2.5m, then 35 for everything up to 4.0m
  near(distanceDamage(bands, 1.0, false), 53);
  near(distanceDamage(bands, 2.5, false), 53);
  near(distanceDamage(bands, 3.0, false), 35, 'the outer band, not an invented midpoint');
  near(distanceDamage(bands, 4.0, false), 35);
  near(distanceDamage(bands, 12, false), 35);
  // the linear form really would invent damage, which is why it is not used
  const invented = distanceDamage(bands, 3.0, true);
  assert.ok(invented < 53 && invented > 35, 'the linear form interpolates, the Trizooka does not');
});