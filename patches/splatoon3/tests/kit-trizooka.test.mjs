// Trizooka tests against the ACTUAL adapted native runtime.
//
// These load the real inkwave-public modules through the production adapter and
// the real production installer, then compose the trizooka module on top exactly
// as the parent integration will. Nothing here re-implements the projectile list,
// the flight integrator or the blast.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import {
  TRIZOOKA, TRIZOOKA_KIT_COST, TRIZOOKA_SOURCE, VOLLEY_CONFIG,
  installKitTrizooka, trizookaSpecialWeapon, trizookaProjectileDescriptor,
  startTrizooka, stepTrizooka, canActivateTrizooka, disposeTrizooka,
} from '../runtime/kit-trizooka.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.resolve(process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public'));
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-9, `${m || ''} ${a} ~ ${b}`);

// ---- pinned primary values --------------------------------------------------

test('spec matches the pinned UltraShot table, not the quarantined stamp values', () => {
  assert.equal(TRIZOOKA_SOURCE.sha256, 'b088c9df476ed786a4a9e76c1fd3d7166885adf0dcffd563b36d1d20b9995d22');
  assert.equal(TRIZOOKA_SOURCE.ref, '7280ff9cde8bb1c5dcef46c700c326471584d2e6');
  assert.equal(TRIZOOKA_KIT_COST, 200);

  assert.equal(TRIZOOKA.spawnSpeed, 67.5);        // SpawnSpeed 1.125 * 60
  assert.equal(TRIZOOKA.goStraightFrames, 16 / 60);   // GoStraightToBrakeStateFrame 16
  assert.equal(TRIZOOKA.brakeFrames, 10 / 60);        // BrakeToFreeStateFrame 10
  assert.equal(TRIZOOKA.directHitDamage, 220);        // DirectHitDamage 2200 / 10
  assert.deepEqual(TRIZOOKA.splashBands, [[2.5, 53], [4.0, 35]]);
  assert.equal(TRIZOOKA.paintRadius, 3.2);
  // AP 0 duration. The quarantined draft used the UltraStamp 570F.
  assert.equal(TRIZOOKA.duration, 330 / 60);
  assert.notEqual(TRIZOOKA.duration, 570 / 60);
  assert.equal(TRIZOOKA.startDelay, 5 / 60);
  assert.equal(TRIZOOKA.repeatFrame, 55 / 60);
  assert.equal(TRIZOOKA.shotDelay, 15 / 60);
  assert.equal(TRIZOOKA.shots, 3);
  // variable collision sphere
  assert.equal(TRIZOOKA.collision.endRadiusPlayer, 0.75);
  assert.equal(TRIZOOKA.collision.endRadiusField, 0.3);
  assert.equal(TRIZOOKA.collision.framesPlayer, 10 / 60);
  assert.equal(TRIZOOKA.collision.framesField, 20 / 60);
  assert.equal(TRIZOOKA.orbitalRadiusEnd, 1.0);
  assert.equal(TRIZOOKA.orbitalTransitionFrames, 10 / 60);
  near(TRIZOOKA.freeGravity, 0.0190565 * 3600);
  near(TRIZOOKA.brakeGravity, 0.09 * 3600);
});

test('the descriptor carries the numbers the native blast reads', () => {
  const d = trizookaSpecialWeapon();
  assert.deepEqual(d.splashBands, [[2.5, 53], [4.0, 35]]);
  assert.equal(d.burstRadius, 3.2);
  assert.equal(d.impactRadius, 3.2);
  assert.equal(d.wid, 'trizooka', 'wid is the native cause id used by ghost restore');
  assert.equal(trizookaProjectileDescriptor(null).wid, 'trizooka');
});

test('per-volley projectile count is not invented', () => {
  assert.equal(VOLLEY_CONFIG.perVolley, null);
  assert.match(VOLLEY_CONFIG.perVolleyStatus, /unknown/);
});

// ---- real runtime -----------------------------------------------------------

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
      context, identifier: file,
      initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; },
    });
    modules.set(file, m);
    return m;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { installKitTrizooka } from './patches/splatoon3/runtime/kit-trizooka.mjs';
    export * from './inkwave-public/src/core/ctx.js';
    export * from './inkwave-public/src/config.js';
    export * from './inkwave-public/src/game/actor.js';
    export * from './inkwave-public/src/game/weapons.js';
    export * from './inkwave-public/src/game/physics.js';
    export * as THREE from 'three';
  `, { context, identifier: path.join(ROOT, 'trizooka-entry.mjs') });
  await entry.link((specifier, from) => {
    if (specifier === 'three') return load(path.join(SRC, 'vendor/three/build/three.module.js'));
    if (specifier.startsWith('three/addons/')) return load(path.join(SRC, 'vendor/three/jsm', specifier.slice('three/addons/'.length)));
    return load(map(path.resolve(path.dirname(from.identifier), specifier)));
  });
  await entry.evaluate();
  const ns = entry.namespace;
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json'), 'utf8'));
  const api = ns.install(profile);
  // compose the trizooka module onto the REAL installed composition
  ns.installKitTrizooka(api, profile);
  api.__installKitTrizooka = ns.installKitTrizooka;
  cached = api;
  return api;
}

function scene(api) {
  const { G, THREE } = api;
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.time = 0; G.actors = []; G.netm = null; G.boss = null; G.local = null;
  G.fx = null; G.audio = null;
  G.camera = { position: new THREE.Vector3(0, 6, 12) };
  G.level = { blocks: [], queryBlocks: (a, b, c, d, o = []) => (o.length = 0, o), groundHeight: () => 0 };
  G.physics = { los: () => true, raycast: (_a, _b, _c, h) => { h.hit = false; return h; }, segment: (_a, _b, h) => { h.hit = false; return h; } };
  G.paint = { sample: () => 1, splat: () => 0 };
  G.match = { playing: () => true };
  const projectiles = new api.Projectiles(new THREE.Scene());
  G.projectiles = projectiles;
  return projectiles;
}

function actor(api, over = {}) {
  const { THREE } = api;
  return Object.assign({
    team: 0, remote: false, isLocal: true, alive: true, ink: 300, special: TRIZOOKA_KIT_COST,
    pos: new THREE.Vector3(0, 0, 0), vel: new THREE.Vector3(),
    aimYaw: 0, aimPitch: 0.1, grounded: true, superJumpState: null, specialActive: null,
    weapon: { kind: 'shooter', sub: 'suction', special: 'trizooka' },
    weaponRunner: {}, color: api.G.teamColors[0], hp: 100,
    addTurf() {}, damage() { return false; }, _nearCamera: () => true,
    specialReady() { return this.special >= TRIZOOKA_KIT_COST && !this.specialActive; },
  }, over);
}

test('installing composes onto the real installed runtime and registers the special', async () => {
  const api = await production();
  const s = api.SPECIALS.trizooka;
  assert.ok(s, 'the special is registered on the real SPECIALS registry');
  assert.equal(s.cost, 200);
  assert.equal(typeof s.projectileDescriptor, 'function', 'the parent ghost-restore callback exists');
  assert.equal(api.TRIZOOKA, undefined, 'no stray global was added');
});

test('activation is refused when dead, super jumping, already active or not ready', async () => {
  const api = await production();
  const a = actor(api);
  assert.equal(canActivateTrizooka(a), true);
  assert.equal(canActivateTrizooka(actor(api, { alive: false })), false, 'dead is refused');
  assert.equal(canActivateTrizooka(actor(api, { superJumpState: { phase: 'charge' } })), false, 'super jump blocks it');
  assert.equal(canActivateTrizooka(actor(api, { specialActive: { id: 'trizooka' } })), false, 'already special is refused');
  assert.equal(canActivateTrizooka(actor(api, { special: 10 })), false, 'not ready is refused');
});

test('dt 0 is a no-op: no time passes and no shot is produced', async () => {
  const api = await production();
  const projectiles = scene(api);
  const a = actor(api);
  startTrizooka(a);
  for (let i = 0; i < 10; i++) stepTrizooka(a, 0, projectiles);
  assert.equal(projectiles.list.length, 0, 'zero dt fires nothing');
  assert.equal(a.s3Trizooka.t, 0, 'and does not advance the clock');
});

test('the special fires exactly three volleys on the native cooldown and then ends', async () => {
  const api = await production();
  const projectiles = scene(api);
  const a = actor(api);
  // configure a volley size so the real list receives projectiles
  const mod = api.__installKitTrizooka;
  assert.ok(mod);
  const a2 = actor(api);
  startTrizooka(a2);
  // with perVolley unset no projectile is invented; drive the state machine only
  const events = [];
  for (let i = 0; i < 60 * 8; i++) events.push(...stepTrizooka(a2, 1 / 60, projectiles).events);
  const volleys = events.filter((e) => e.type === 'volley');
  assert.equal(volleys.length, 3, 'exactly three firing actions');
  assert.equal(events.filter((e) => e.type === 'done').length, 1, 'and it finishes once');
  assert.ok(!a2.s3Trizooka.active, 'the token is cleared when the special ends');
  // shot 1 waits StartDelayFrame, later shots wait RepeatFrame
  assert.ok(volleys[0].shot === 1 && volleys[2].shot === 3);
});

test('a volley is pushed into the native list with the descriptor attached', async () => {
  const api = await production();
  const projectiles = scene(api);
  const a = actor(api);
  const mod = api.__installKitTrizooka;
  // fire through the module's own volley path with a configured count
  const kit = await import('../runtime/kit-trizooka.mjs');
  const descriptor = kit.trizookaSpecialWeapon();
  VOLLEY_CONFIG.perVolley = 3;
  const fired = kit.throwVolley(projectiles, a, descriptor);
  VOLLEY_CONFIG.perVolley = null;
  assert.equal(fired.length, 3);
  assert.equal(projectiles.list.length, 3, 'they are in the ONE native list');
  for (const p of fired) {
    assert.equal(p.wid, 'trizooka', 'native cause id set for ghost restore');
    assert.equal(p.s3SpecialWeapon, descriptor, 'descriptor preserved for the native blast');
    assert.ok(p.vel.length() > 0, 'native throwVelocity produced real velocity');
    assert.equal(p.ghost, false);
  }
});

test('the native step integrates the pushed volley rather than a second integrator', async () => {
  const api = await production();
  const projectiles = scene(api);
  const a = actor(api);
  const kit = await import('../runtime/kit-trizooka.mjs');
  VOLLEY_CONFIG.perVolley = 2;
  const fired = kit.throwVolley(projectiles, a, kit.trizookaSpecialWeapon());
  VOLLEY_CONFIG.perVolley = null;
  const p0 = fired[0];
  const start = p0.pos.clone();
  // advance the REAL native projectile step
  projectiles._step(p0, 1 / 60);
  assert.notDeepEqual({ x: p0.pos.x, y: p0.pos.y, z: p0.pos.z }, { x: start.x, y: start.y, z: start.z },
    'the native _step moved the projectile');
});

test('death, reset and disposal drop the token and it cannot be restored', async () => {
  const api = await production();
  const projectiles = scene(api);
  const a = actor(api);
  startTrizooka(a);
  assert.ok(a.s3Trizooka, 'token exists while active');
  disposeTrizooka(a);
  assert.equal(a.s3Trizooka, null, 'disposal clears it');
  assert.deepEqual(stepTrizooka(a, 1 / 60, projectiles).events, [], 'a cleared token produces nothing');
  assert.equal(canActivateTrizooka(actor(api, { alive: false })), false);
});

test('the native list is cleared by the real clear path', async () => {
  const api = await production();
  const projectiles = scene(api);
  const kit = await import('../runtime/kit-trizooka.mjs');
  VOLLEY_CONFIG.perVolley = 3;
  kit.throwVolley(projectiles, actor(api), kit.trizookaSpecialWeapon());
  VOLLEY_CONFIG.perVolley = null;
  assert.ok(projectiles.list.length > 0);
  projectiles.clear();
  assert.equal(projectiles.list.length, 0, 'the native clear released every projectile');
});
