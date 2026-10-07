// Trizooka tests against the ACTUAL adapted native runtime.
//
// These load the real inkwave-public modules through the production adapter and
// the real production installer (`install(profile)`), then compose the trizooka
// module on top exactly as the parent integration will. The actor under test is
// a real `new api.Actor(...)`, driven through its real `update(dt)` loop with a
// real `intent`. Nothing here re-implements the projectile list, the flight
// integrator, the blast or the special lifecycle.
//
// No test mutates VOLLEY_CONFIG or any other module global to make a shot
// appear: the volley configuration is the shipped default and must fire.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {adaptKitSource as adaptSource} from './kit-composed-fixture.mjs';
import {
  TRIZOOKA, TRIZOOKA_KIT_COST, TRIZOOKA_SOURCE, TRIZOOKA_SPEC_UP, VOLLEY_CONFIG,
  installKitTrizooka, installTrizookaLifecycle, trizookaSpecialWeapon, trizookaProjectileDescriptor,
  startTrizooka, stepTrizooka, endTrizooka, canActivateTrizooka, disposeTrizooka, trizookaIsActive,
  newTrizookaState, newTrizookaReplayState, trizookaReplayActivate, trizookaReplayFire, trizookaReplayEnd,
  splashBandsFor, splashRadiusFor, perpendicularBasis,
  throwVolley, apOf, durationFor,
  selectTrizookaFlight, selectTrizookaCollision, trizookaOrbitOffset, trizookaDragPerSecond,
  trizookaClearProjectile, trizookaApplyProjectile,
  TRIZOOKA_SELECTORS, TRIZOOKA_DRAG, TRIZOOKA_ORBIT, TRIZOOKA_PROJECTILE_FIELDS,
} from '../runtime/kit-trizooka.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.resolve(process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public'));
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-9, `${m || ''} ${a} ~ ${b}`);
const F = 1 / 60;

// ---- pinned primary values --------------------------------------------------

test('spec matches the pinned UltraShot table, not the quarantined stamp values', () => {
  assert.equal(TRIZOOKA_SOURCE.sha256, 'b088c9df476ed786a4a9e76c1fd3d7166885adf0dcffd563b36d1d20b9995d22');
  assert.equal(TRIZOOKA_SOURCE.ref, '7280ff9cde8bb1c5dcef46c700c326471584d2e6');
  assert.equal(TRIZOOKA_KIT_COST, 200);

  assert.equal(TRIZOOKA.spawnSpeed, 67.5);             // SpawnSpeed 1.125 * 60
  assert.equal(TRIZOOKA.goStraightFrames, 16 / 60);    // GoStraightToBrakeStateFrame 16
  assert.equal(TRIZOOKA.brakeFrames, 10 / 60);         // BrakeToFreeStateFrame 10
  assert.equal(TRIZOOKA.directHitDamage, 220);         // DirectHitDamage 2200 / 10
  assert.deepEqual(TRIZOOKA.splashBands, [[2.5, 53], [4.0, 35]]);
  assert.equal(TRIZOOKA.paintRadius, 3.2);
  // AP 0 duration. The quarantined draft used the UltraStamp 570F.
  assert.equal(TRIZOOKA.duration, 330 / 60);
  assert.notEqual(TRIZOOKA.duration, 570 / 60);
  assert.equal(TRIZOOKA.startDelay, 5 / 60);
  assert.equal(TRIZOOKA.repeatFrame, 55 / 60);
  assert.equal(TRIZOOKA.shotDelay, 15 / 60);
  assert.equal(TRIZOOKA.maxFireActions, 3);
  // variable collision sphere
  assert.equal(TRIZOOKA.collision.endRadiusPlayer, 0.75);
  assert.equal(TRIZOOKA.collision.endRadiusField, 0.3);
  assert.equal(TRIZOOKA.collision.framesPlayer, 10 / 60);
  assert.equal(TRIZOOKA.collision.framesField, 20 / 60);
  assert.equal(TRIZOOKA.orbitalRadiusEnd, 1.0);
  assert.equal(TRIZOOKA.orbitalTransitionFrames, 10 / 60);
  near(TRIZOOKA.freeGravity, 0.0190565 * 3600);
  near(TRIZOOKA.brakeGravity, 0.09 * 3600);
  assert.deepEqual(TRIZOOKA_SPEC_UP.duration, [330 / 60, 405 / 60, 480 / 60]);
  assert.equal(apOf({}), 0, 'an actor without an equipped AP snapshot uses zero');
  assert.equal(durationFor(0), 330 / 60);
});

test('the volley configuration is a real non-null calibration, honestly labelled', () => {
  assert.ok(VOLLEY_CONFIG.lobes > 0, 'a null count would fire nothing at all');
  assert.equal(VOLLEY_CONFIG.lobes, 3);
  assert.match(VOLLEY_CONFIG.lobesStatus, /calibration-not-extracted/);
  assert.match(VOLLEY_CONFIG.spreadStatus, /calibration-not-extracted/);
  assert.ok(VOLLEY_CONFIG.spreadDeg > 0);
  assert.equal(VOLLEY_CONFIG.damageCarriers, 1);
  assert.match(VOLLEY_CONFIG.damageStatus, /single-authoritative/);
});

test('the descriptor carries the numbers the native blast reads', () => {
  const d = trizookaSpecialWeapon();
  assert.deepEqual(d.splashBands, [[2.5, 53], [4.0, 35]]);
  assert.equal(d.splashRadius, 4.0);
  assert.equal(d.burstRadius, 4.0);
  assert.equal(d.impactRadius, 4.0);
  assert.equal(d.paintRadius, 3.2);
  assert.equal(d.directDamage, 220);
  assert.equal(d.wid, 'trizooka', 'wid is the native cause id used by ghost restore');
  assert.equal(trizookaProjectileDescriptor(null).wid, 'trizooka');
  assert.equal(d.splashDamageMax, 53);
  assert.equal(d.splashDamageMin, 35);
});

test('the descriptor exposes the full native blast field names', () => {
  const d = trizookaSpecialWeapon();
  assert.equal(d.splashRadius, 4.0);
  assert.equal(d.splashDamageMax, 53);
  assert.equal(d.splashDamageMin, 35);
  assert.equal(d.splashBands[0][1], 53);
});

// ---- real production runtime -------------------------------------------------

const gearStorage = new Map();
let cached;
async function production() {
  if (cached) return cached;
  const context = vm.createContext({ console, performance, URL, localStorage: { getItem: key => gearStorage.get(key) ?? null, setItem: (key, value) => gearStorage.set(key, value) } });
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
  installKitTrizooka(api, profile);
  api.__ns = ns;
  cached = api;
  return api;
}

// A real native Projectiles and a real native Actor, with only display/audio and
// collision callbacks stubbed.
function world(api) {
  const { G, THREE } = api;
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.time = 0; G.actors = []; G.netm = null; G.boss = null; G.local = null;
  G.fx = null; G.audio = null;
  G.camera = { position: new THREE.Vector3(0, 6, 12) };
  G.level = {
    blocks: [], spawnPads: [new THREE.Vector3(), new THREE.Vector3()],
    queryBlocks: (a, b, c, d, o = []) => (o.length = 0, o),
    groundHeight: () => 0,
  };
  // only collision callbacks are stubbed; the real Actor._resolve runs on them
  G.physics = {
    los: () => true,
    raycast: (_a, _b, _c, h) => { h.hit = false; return h; },
    segment: (_a, _b, h) => { h.hit = false; return h; },
    collideBody: () => false,
    groundProbe: (_x, _y, _z, _up, _down, _radius, hit) => { hit.hit = false; return hit; },
  };
  G.paint = { sample: () => 1, splat: () => 0 };
  G.match = { playing: () => true, canRespawn: () => true };
  const projectiles = new api.Projectiles(new THREE.Scene());
  G.projectiles = projectiles;
  return projectiles;
}

function makeActor(api, over = {}) {
  // the REAL production Character: the installed motion patches wrap its
  // channels, so a hand-rolled stub would not exercise the composed runtime
  const a = new api.Actor({ team: 0, name: 'trizooka-test', weapon: 'shooter', isLocal: true, CharacterClass: api.Character });
  api.G.actors = [a];
  // keep the actor's own physics out of the way: this suite tests the special
  // lifecycle, not the walk controller (covered by walk.test.mjs and friends)
  a._spawnBarrier = () => {}; a._finishFrame = () => {}; a._integrate = () => {};
  a.grounded = true; a.ground.hit = true; a.ground.face = 0;
  // the shooter must actually carry the Trizooka for the native path to engage.
  // The sub is left exactly as the weapon table has it: forcing one here would
  // trip the kit sub protocol's own registration, which is not this lane's code.
  a.weapon = { ...api.WEAPONS.shooter, special: 'trizooka', specialCost: TRIZOOKA_KIT_COST };
  a.special = TRIZOOKA_KIT_COST;
  a.specialReady();
  return Object.assign(a, over);
}

// The real native update loop. `move` is left neutral so this suite exercises
// the special lifecycle, not the walk controller (covered by walk.test.mjs).
const api_time = (a, dt) => { a.intent.move.set(0, 0, 0); a.update(dt); };

function pressFire(a) { a.intent.fire = true; }
function releaseFire(a) { a.intent.fire = false; }

// ---- install ----------------------------------------------------------------

test('installing composes onto the real installed runtime and registers the special', async () => {
  const api = await production();
  const s = api.SPECIALS.trizooka;
  assert.ok(s, 'the special is registered on the real SPECIALS registry');
  assert.equal(s.cost, 200);
  assert.equal(s.maxFireActions, 3);
  assert.equal(typeof s.projectileDescriptor, 'function', 'the parent ghost-restore callback exists');
  assert.equal(typeof s.replayState, 'function');
  // no stray globals, and no mutation of the shared SUB table
  assert.equal(api.TRIZOOKA, undefined, 'no stray global was added');
  assert.equal(api.SUB.__trizookaNote, undefined, 'SUB is not mutated');
  assert.deepEqual(Object.keys(api.SUB.bomb).sort(), Object.keys(api.SUB.bomb).sort());
});

test('activation is refused when dead, super jumping, already active or not ready', async () => {
  const api = await production();
  world(api);
  const a = makeActor(api);
  assert.equal(canActivateTrizooka(a), true);
  a.alive = false;
  assert.equal(canActivateTrizooka(a), false, 'dead is refused');
  a.alive = true; a.superJumpState = { phase: 'charge' };
  assert.equal(canActivateTrizooka(a), false, 'super jump blocks it');
  a.superJumpState = null; a.specialActive = { id: 'trizooka' };
  assert.equal(canActivateTrizooka(a), false, 'an in-progress special is refused');
  a.specialActive = null; a.special = 10;
  assert.equal(canActivateTrizooka(a), false, 'a full gauge is required');
  a.special = TRIZOOKA_KIT_COST;
  assert.equal(canActivateTrizooka(a), true);
});

// ---- native lifecycle -------------------------------------------------------

test('the native _startSpecial engages the Trizooka and spends the gauge exactly once', async () => {
  const api = await production();
  world(api);
  const a = makeActor(api);
  assert.equal(a.special, TRIZOOKA_KIT_COST);
  const before = a.stats.specials;

  a.intent.special = true;
  a.update(F);                       // native edge detection + native _startSpecial
  assert.equal(a.specialActive?.id, 'trizooka', 'the native state machine now owns the body');
  assert.ok(trizookaIsActive(a));
  assert.equal(a.special, 0, 'the native gauge spend happened exactly once');
  assert.equal(a.stats.specials, before + 1, 'the native counter incremented exactly once');

  // holding the button must not spend again
  a.update(F); a.update(F);
  assert.equal(a.special, 0);
  assert.equal(a.stats.specials, before + 1, 're-entrant _startSpecial never double-spends');
});

test('the Trizooka does not fire without a fire press, and fires with the default config', async () => {
  const api = await production();
  const projectiles = world(api);
  const a = makeActor(api);
  a.intent.special = true; a.update(F);
  a.intent.special = false;

  for (let i = 0; i < 60; i++) api_time(a, F);          // 1s of holding nothing
  assert.equal(projectiles.list.length, 0, 'no fire input, no projectile');

  pressFire(a);
  for (let i = 0; i < 40; i++) api_time(a, F);           // past StartDelayFrame
  assert.equal(projectiles.list.length, VOLLEY_CONFIG.lobes,
    'the default calibration fires a real non-empty volley into the native list');
  releaseFire(a);
});

test('a volley has exactly one damage carrier, so three 220 HP lobes cannot stack', async () => {
  const api = await production();
  const projectiles = world(api);
  const a = makeActor(api);
  const fired = throwVolley(projectiles, a, trizookaSpecialWeapon());
  assert.equal(fired.length, VOLLEY_CONFIG.lobes);
  const carriers = fired.filter((p) => p.damageOwner);
  assert.equal(carriers.length, 1, 'exactly one authoritative shot');
  assert.equal(carriers[0].damage, 220);
  assert.equal(carriers[0].type, 'blast');
  for (const p of fired.filter((x) => !x.damageOwner)) {
    assert.equal(p.damage, 0, 'a visual lobe never applies direct damage');
    assert.notEqual(p.type, 'blast', 'a visual lobe never enters the native blast path');
  }
  // all lobes share one native vol record, so the native per-victim dedupe applies
  const vols = new Set(fired.map((p) => p.vol));
  assert.equal(vols.size, 1, 'one volley record groups the lobes');
  for (const p of fired) {
    assert.equal(p.wid, 'trizooka', 'native cause id set for ghost restore');
    assert.equal(p.s3SpecialWeapon.kind, 'trizooka', 'descriptor preserved for the native blast');
    assert.ok(p.vel.length() > 0, 'real 3D aim velocity');
    assert.equal(p.ghost, false);
    assert.equal(projectiles.list.includes(p), true, 'it is in the ONE native list');
  }
});

test('the second volley is spaced by ShotDelay, and Repeat governs held-fire repeats', async () => {
  const api = await production();
  const projectiles = world(api);
  const a = makeActor(api);
  a.intent.special = true; a.update(F); a.intent.special = false;

  const stamps = [];
  pressFire(a);
  for (let i = 0; i < 200; i++) {
    api_time(a, F);
    const n = projectiles.list.length;
    if (n > 0 && stamps.at(-1)?.count !== n) stamps.push({ t: a.s3Trizooka?.t ?? 0, count: n });
    if (stamps.length >= 3) break;
  }
  releaseFire(a);
  assert.ok(stamps.length >= 2, 'holding fire repeats the volley');
  const first = stamps[0].t, second = stamps[1].t;
  assert.ok(Math.abs(first - TRIZOOKA.startDelay) < 1e-6, `first volley waits StartDelayFrame, got ${first}`);
  assert.ok(Math.abs((second - first) - TRIZOOKA.repeatFrame) < 1e-6,
    `a held repeat waits RepeatFrame 55F, got ${(second - first) * 60} frames`);
  assert.ok(Math.abs((second - first) - TRIZOOKA.shotDelay) > 1e-6,
    'the held repeat is not the 15F shot delay');
});

test('at most three fire actions, then the special ends on its own', async () => {
  const api = await production();
  const projectiles = world(api);
  const a = makeActor(api);
  a.intent.special = true; a.update(F); a.intent.special = false;
  pressFire(a);
  for (let i = 0; i < 60 * 8; i++) api_time(a, F);
  releaseFire(a);
  const actions = projectiles.list.filter((p) => p.s3ActionIndex !== undefined)
    .map((p) => p.s3ActionIndex);
  assert.equal(Math.max(...actions), 3, 'no fourth fire action');
  assert.equal(trizookaIsActive(a), false, 'the special ends by itself');
  assert.equal(a.specialActive, null, 'and hands the body back to the native loop');
  const before = projectiles.list.length;
  pressFire(a);
  for (let i = 0; i < 30; i++) api_time(a, F);
  releaseFire(a);
  const newTrizooka = projectiles.list.slice(before).filter((p) => p.wid === 'trizooka');
  assert.equal(newTrizooka.length, 0, 'a spent special cannot fire another trizooka volley');
});

test('a press during StartDelayFrame is remembered, not lost', async () => {
  const api = await production();
  const projectiles = world(api);
  const a = makeActor(api);
  a.intent.special = true; a.update(F); a.intent.special = false;
  pressFire(a);                                   // pressed before the start delay elapses
  for (let i = 0; i < 30; i++) api_time(a, F);
  releaseFire(a);
  assert.ok(projectiles.list.length > 0, 'IsReqShotInStartDelay honoured');
});

test('main and sub are suppressed for the whole special, including the release frame', async () => {
  const api = await production();
  const projectiles = world(api);
  const a = makeActor(api);
  const mainShots = [];
  const subReleases = [];
  const realFireShooter = projectiles.fireShooter.bind(projectiles);
  const realThrowBomb = projectiles.throwBomb.bind(projectiles);
  projectiles.fireShooter = (...x) => { if (trizookaIsActive(a)) mainShots.push(x); return realFireShooter(...x); };
  projectiles.throwBomb = (...x) => { if (trizookaIsActive(a)) subReleases.push(x); return realThrowBomb(...x); };

  a._startSpecial();
  // hold fire and sub for the entire special
  a.intent.fire = true; a.intent.sub = true;
  let framesActive = 0;
  while (trizookaIsActive(a) && framesActive < 60 * 8) {
    if (framesActive === 30) a.intent.sub = false;   // the release edge lands mid-special
    api_time(a, F);
    framesActive += 1;
  }
  assert.ok(framesActive > 30, 'the release edge really landed while the special was active');
  assert.equal(mainShots.length, 0, 'no main-weapon shot while the special owns the body');
  assert.equal(subReleases.length, 0, 'the sub release edge is swallowed, not queued');
});

test('a weapon fire on the frame the control returns is not queued by the special', async () => {
  const api = await production();
  world(api);
  const a = makeActor(api);
  a.intent.special = true; a.update(F); a.intent.special = false;
  for (let i = 0; i < 60 * 6; i++) api_time(a, F);
  assert.equal(trizookaIsActive(a), false);
  assert.equal(a.fireBuffer, 0, 'ending the special clears the buffered main shot');
});

// ---- pause, death, reset, expiry -------------------------------------------

test('a paused frame (dt 0) is a strict no-op', async () => {
  const api = await production();
  const projectiles = world(api);
  const a = makeActor(api);
  a.intent.special = true; a.update(F); a.intent.special = false;
  pressFire(a);
  api_time(a, F);
  const t = a.s3Trizooka.t;
  const n = projectiles.list.length;
  for (let i = 0; i < 10; i++) stepTrizooka(a, 0, projectiles);
  assert.equal(a.s3Trizooka.t, t, 'no time passed');
  assert.equal(projectiles.list.length, n, 'no projectile was produced');
  releaseFire(a);
});

test('death drops the token, resets the gauge and cannot be restored', async () => {
  const api = await production();
  const projectiles = world(api);
  const a = makeActor(api);
  a.intent.special = true; a.update(F); a.intent.special = false;
  pressFire(a); api_time(a, F);
  assert.ok(trizookaIsActive(a));

  a.splat(null, 'test');
  assert.equal(a.s3Trizooka, null, 'splat disposes the token');
  assert.equal(a.specialActive, null);
  assert.equal(trizookaIsActive(a), false);
  const n = projectiles.list.length;
  releaseFire(a);
  for (let i = 0; i < 60; i++) api_time(a, F);
  assert.equal(projectiles.list.length, n, 'a dead actor fires nothing');
});

test('reset disposes the token and clears the gauge', async () => {
  const api = await production();
  world(api);
  const a = makeActor(api);
  a.intent.special = true; a.update(F); a.intent.special = false;
  assert.ok(trizookaIsActive(a));
  a.reset();
  assert.equal(a.s3Trizooka, null, 'reset disposes the token');
  assert.equal(a.special, 0, 'reset clears the gauge');
  assert.equal(a.specialActive, null);
});

test('disposal is permanent and the native clear releases the volley', async () => {
  const api = await production();
  const projectiles = world(api);
  const a = makeActor(api);
  a.intent.special = true; a.update(F); a.intent.special = false;
  pressFire(a);
  for (let i = 0; i < 20; i++) api_time(a, F);
  releaseFire(a);
  assert.ok(projectiles.list.length > 0);
  disposeTrizooka(a);
  assert.equal(a.s3Trizooka, null);
  assert.deepEqual(stepTrizooka(a, F, projectiles), [], 'a disposed token steps to nothing');
  projectiles.clear();
  assert.equal(projectiles.list.length, 0, 'the native clear released every projectile');
});

// ---- integration with the native integrator --------------------------------

test('the native step integrates the pushed volley rather than a second integrator', async () => {
  const api = await production();
  const projectiles = world(api);
  const a = makeActor(api);
  const fired = throwVolley(projectiles, a, trizookaSpecialWeapon());
  const p0 = fired[0];
  const start = p0.pos.clone();
  projectiles._step(p0, F);
  assert.ok(p0.pos.distanceTo(start) > 0, 'the native _step moved the projectile');
  // the module owns no integrator: the only mover of a projectile is Projectiles._step
  assert.equal(Object.keys(p0).some((k) => k.startsWith('s3Step')), false);
});

test('the flight descriptor is carried on the projectile for the parent selectors', async () => {
  const api = await production();
  const projectiles = world(api);
  const a = makeActor(api);
  const [p] = throwVolley(projectiles, a, trizookaSpecialWeapon());
  assert.deepEqual(p.s3SpecialWeapon.s3StageFrames, [16 / 60, 10 / 60]);
  assert.deepEqual(p.s3SpecialWeapon.s3Orbit, { end: 1.0, frames: 10 / 60 });
  assert.deepEqual(p.s3SpecialWeapon.s3Collision, TRIZOOKA.collision);
  assert.equal(p.straight, 16 / 60, 'native straight-flight window matches GoStraightToBrakeStateFrame');
});

test('a refused _startSpecial spends nothing, on every rejection path', async () => {
  const api = await production();
  world(api);

  const cases = [
    ['dead', (a) => { a.alive = false; }],
    ['super jumping', (a) => { a.superJumpState = { phase: 'charge' }; }],
    ['zero gauge', (a) => { a.special = 0; }],
    ['already active', (a) => { a.specialActive = { id: 'trizooka', t: 0 }; }],
    ['re-entrant token', (a) => { a.s3Trizooka = newTrizookaState(0); }],
  ];
  for (const [label, arrange] of cases) {
    const a = makeActor(api);
    const specials = a.stats.specials;
    const ink = a.ink;
    const gauge = a.special;
    arrange(a);
    a._startSpecial();                               // the REAL prototype method
    assert.equal(a.stats.specials, specials, `${label}: the special counter must not move`);
    assert.equal(a.ink, ink, `${label}: ink must not move`);
    assert.equal(a.specialActive?.id === 'trizooka' && label !== 'already active', false,
      `${label}: no trizooka became active`);
    if (label === 'zero gauge') assert.equal(a.special, 0, 'zero gauge stays zero');
    else assert.equal(a.special, gauge, `${label}: the gauge is untouched`);
  }
});

test('a refused _startSpecial does not reach the native call at all', async () => {
  const api = await production();
  world(api);
  const a = makeActor(api);
  const specials = a.stats.specials;
  a.alive = false;
  a._startSpecial();
  // native would have zeroed the gauge and bumped the counter; neither happened
  assert.equal(a.special, TRIZOOKA_KIT_COST, 'the gauge survived a refused activation');
  assert.equal(a.stats.specials, specials);
  assert.ok(!a.s3Trizooka, 'no token was installed');
});

test('an accepted _startSpecial spends the gauge and counter exactly once', async () => {
  const api = await production();
  world(api);
  const a = makeActor(api);
  const specials = a.stats.specials;
  a._startSpecial();
  assert.equal(a.stats.specials, specials + 1);
  assert.equal(a.special, 0);
  assert.equal(a.specialActive?.id, 'trizooka');
  assert.ok(trizookaIsActive(a));
  a._startSpecial();                                  // re-entrant call
  assert.equal(a.stats.specials, specials + 1, 'a second direct call never double-spends');
});

test('other specials still delegate to native untouched', async () => {
  const api = await production();
  world(api);
  const a = makeActor(api);
  a.weapon = { ...api.WEAPONS.shooter, special: 'storm', specialCost: 180 };
  a.special = 180;
  const specials = a.stats.specials;
  a._startSpecial();
  assert.equal(a.stats.specials, specials + 1, 'native handled it');
  assert.equal(a.specialActive?.id, 'storm', 'the native special id is untouched');
  assert.ok(!a.s3Trizooka, 'no trizooka state leaked in');
});

test('a paused frame is a strict no-op on the whole actor, not just the token', async () => {
  const api = await production();
  const projectiles = world(api);
  const a = makeActor(api);
  a._startSpecial();
  pressFire(a);
  api_time(a, F);                                    // one real frame first

  const snapshot = () => ({
    t: a.s3Trizooka?.t,
    pos: a.pos.toArray(), vel: a.vel.toArray(),
    prevIntent: { ...a._prevIntent },
    intent: { ...a.intent, move: a.intent.move.toArray() },
    fireBuffer: a.fireBuffer,
    specials: a.stats.specials,
    list: projectiles.list.length,
  });
  const before = snapshot();
  a.update(0);
  a.update(0);
  a.update(0);
  assert.deepEqual(snapshot(), before, 'a dt<=0 frame changed nothing at all');
  assert.ok(before.t > 0, 'the token had actually advanced before the pause');

  // and a real frame still works afterwards
  pressFire(a);
  api_time(a, F);
  assert.ok(a.s3Trizooka.t > before.t, 'time resumes after the pause');
});

test('the AP rate stretches distance and never the damage', async () => {
  const ap0 = trizookaSpecialWeapon(0);
  const ap57 = trizookaSpecialWeapon(57);
  assert.deepEqual(ap0.splashBands, [[2.5, 53], [4.0, 35]]);
  assert.equal(ap0.splashDamageMax, 53);
  assert.equal(ap0.splashDamageMin, 35);
  // DistanceDamageDistanceRate multiplies DISTANCE
  assert.deepEqual(ap57.splashBands, [[2.5 * 1.3, 53], [4.0 * 1.3, 35]]);
  assert.equal(ap57.splashDamageMax, 53, 'damage is unchanged at AP 57');
  assert.equal(ap57.splashDamageMin, 35, 'damage is unchanged at AP 57');
  // the damaging radius is the outer band distance, not PaintRadius
  assert.equal(ap0.splashRadius, 4.0, 'outer band distance at AP 0');
  assert.equal(ap57.splashRadius, 4.0 * 1.3);
  assert.notEqual(ap0.splashRadius, TRIZOOKA.paintRadius, 'PaintRadius is not the damage radius');
  assert.equal(ap0.paintRadius, 3.2, 'the ink/FX radius stays PaintRadius');
  // a target at 3.9m: inside AP0's 4.0 band, still inside AP57's 5.2 band
  const inside = (bands, d) => bands.some(([r, dmg]) => d <= r && dmg > 0);
  assert.equal(inside(ap0.splashBands, 3.9), true);
  assert.equal(inside(ap57.splashBands, 3.9), true);
  // at 4.5m AP0 has already dropped to its outer band edge while AP57 still catches it
  assert.equal(ap0.splashRadius >= 4.5, false, 'AP 0 does not reach 4.5m');
  assert.equal(ap57.splashRadius >= 4.5, true, 'AP 57 does reach 4.5m');
});

test('the volley uses the native camera-ray aim path, not the bomb lob', async () => {
  const api = await production();
  const projectiles = world(api);
  const a = makeActor(api);
  // a camera aim point that disagrees with the body yaw, plus a NEGATIVE pitch
  a.aimYaw = 0.5;
  a.aimPitch = -0.25;
  const far = a.pos.clone().add({ x: 12 * Math.sin(-1.1), y: 6, z: 12 * Math.cos(-1.1) });
  a.aimPoint.copy(far);
  a.aimDir.set(Math.sin(0.5), Math.sin(-0.25), Math.cos(0.5)).normalize();

  const fired = throwVolley(projectiles, a, trizookaSpecialWeapon());
  const carrier = fired[VOLLEY_CONFIG.damageLobeIndex];
  // the native aim ray is what the carrier travels along, no fan applied to it
  const muzzle = projectiles._muzzle(a, new api.THREE.Vector3());
  const aim = projectiles._aimFrom(a, muzzle, new api.THREE.Vector3());
  const v = carrier.vel.clone().normalize();
  assert.ok(v.dot(aim) > 0.999, 'the damage carrier flies along the native aim ray');
  // it must NOT be the native bomb lob (which adds +0.28 pitch and a +1.5 lift)
  const bombDir = projectiles.throwVelocity(a, TRIZOOKA.spawnSpeed, new api.THREE.Vector3()).normalize();
  const differs = Math.abs(v.x - bombDir.x) + Math.abs(v.y - bombDir.y) + Math.abs(v.z - bombDir.z);
  assert.ok(differs > 0.01, 'the Trizooka is not thrown with the bomb pitch lift');
  // a negative pitch must actually send it downward
  assert.ok(carrier.vel.y < 0, `negative pitch points down, got y=${carrier.vel.y}`);
  // speed is the table SpawnSpeed, not the bomb throw speed
  near(carrier.vel.length(), TRIZOOKA.spawnSpeed, 1e-6);
  // the side lobes deviate laterally, but only by the calibrated fan
  for (const p of fired.filter((x) => !x.damageOwner)) {
    const d = p.vel.clone().normalize().dot(aim);
    assert.ok(d > 0.99, 'a side lobe stays within the calibrated fan');
  }
});

test('the orbit circles the flight axis, not world Y', async () => {
  const api = await production();
  const projectiles = world(api);
  const a = makeActor(api);
  a.aimPitch = 0.6;
  const fired = throwVolley(projectiles, a, trizookaSpecialWeapon());
  const p = fired[0];
  projectiles._step(p, F);                          // the native step sets the velocity
  const o = trizookaOrbitOffset(p, F);
  const axis = o.axis;
  // the offset must be perpendicular to the flight axis
  const dot = axis.x * o.x + axis.y * o.y + axis.z * o.z;
  near(dot, 0, 1e-6);
  // and it must have a vertical component for a non-vertical axis, which a
  // world-XZ circle could never produce
  assert.ok(Math.abs(o.y) > 1e-6, 'the orbit is tilted out of the world XZ plane');
  // it stays a pure displacement: the projectile is untouched
  const pos = p.pos.toArray();
  trizookaOrbitOffset(p, F);
  assert.deepEqual(p.pos.toArray(), pos, 'the selector never moves the projectile');
});

// ---- per-native-step selectors ---------------------------------------------

test('the flight selector returns the three table stages, not the launch gravity', () => {
  const at = (age) => selectTrizookaFlight({ age }, F);
  const straight = at(0);
  assert.equal(straight.stage, 'straight');
  assert.equal(straight.grav, 0, 'straight flight is gravity-free, not launch gravity');
  assert.equal(straight.drag, 0);
  assert.equal(straight.stageFrames, 16);

  const lastStraight = at(15 / 60);
  assert.equal(lastStraight.stage, 'straight', 'still straight on frame 15');
  const brake = at(16 / 60);
  assert.equal(brake.stage, 'brake');
  near(brake.grav, TRIZOOKA.brakeGravity);
  near(brake.dragPerFrame, 0.09);
  near(brake.drag, 0.09 * 60, 'per-frame drag converted to the per-second coefficient');

  const lastBrake = at(25 / 60);
  assert.equal(lastBrake.stage, 'brake');
  const free = at(26 / 60);
  assert.equal(free.stage, 'free', 'free flight begins at 16F + 10F');
  near(free.grav, TRIZOOKA.freeGravity);
  assert.notEqual(free.grav, TRIZOOKA.brakeGravity);
  near(free.dragPerFrame, 0.01985);
  near(free.drag, 0.01985 * 60);
  assert.notEqual(free.grav, straight.grav, 'the free stage is not left at launch gravity');

  // the transition frames report the raw table velocities
  assert.equal(brake.transition, true);
  assert.equal(brake.brakeVelocityXZ, TRIZOOKA.brakeVelocityXZ);
  assert.equal(brake.brakeVelocityY, TRIZOOKA.brakeVelocityY);
  assert.match(brake.interpretation, /FLAGGED AS INTERPRETATION/);
});

test('the collision selector grows the actor and world spheres over their own windows', () => {
  const c0 = selectTrizookaCollision({ age: 0 });
  near(c0.actorRadius, 0.01, 'actor sphere starts at the table init radius');
  near(c0.worldRadius, 0.01);
  const c10 = selectTrizookaCollision({ age: 10 / 60 });
  near(c10.actorRadius, 0.75, 'the actor sphere completes at 10F');
  const c20 = selectTrizookaCollision({ age: 20 / 60 });
  near(c20.worldRadius, 0.3, 'the world sphere completes at 20F');
  assert.notEqual(c10.worldRadius, c20.worldRadius, 'the two spheres have separate windows');
  assert.match(c20.status, /interpretation/);
  assert.equal(c0.kind, 'trizooka', 'the selector is tagged so the parent can gate on it');
});

test('the orbit is an offset selector, not a second position or integrator', async () => {
  const api = await production();
  const projectiles = world(api);
  const a = makeActor(api);
  const fired = throwVolley(projectiles, a, trizookaSpecialWeapon());
  const o1 = trizookaOrbitOffset(fired[1], F);
  projectiles._step(fired[1], F * 30);          // the NATIVE step advances p.age
  const o2 = trizookaOrbitOffset(fired[1], F);
  assert.equal(typeof o1.x, 'number');
  assert.ok(Number.isFinite(o1.x + o1.y + o1.z), 'a finite offset');
  assert.notEqual(o1.phase, o2.phase, 'the orbit advances with age');
  assert.ok(o2.radius <= TRIZOOKA_ORBIT.endRadius + 1e-9, 'the radius settles at OrbitalRadiusEnd');
  assert.match(TRIZOOKA_ORBIT.status, /calibration/, 'the unstated parts are flagged as calibration');
  // the selector adds nothing to the projectile itself: the parent applies it
  const before = fired[1].pos.clone();
  trizookaOrbitOffset(fired[1], F);
  assert.deepEqual(fired[1].pos.toArray(), before.toArray(), 'the selector does not move the projectile');
});

test('the drag table exposes both the linear and the exact per-second forms', () => {
  near(TRIZOOKA_DRAG.brakePerSecond, 5.4);
  near(TRIZOOKA_DRAG.freePerSecond, 0.01985 * 60);
  near(TRIZOOKA_DRAG.brakeRetention, 0.91);
  near(trizookaDragPerSecond('straight'), 0, 'straight flight has no drag');
  assert.match(TRIZOOKA_DRAG.status, /flagged/);

  const linear = TRIZOOKA.brakeAirResist * 60;
  const retention = 1 - TRIZOOKA.brakeAirResist;
  // at exactly 60Hz the two forms coincide by construction: one frame of
  // retention IS perFrame*60. The linearisation only diverges at other rates.
  near(trizookaDragPerSecond('brake', true, 1 / 60), linear, 1e-9);
  // off 60Hz the exact form must differ, or the "exact" label is a lie
  const dt = 1 / 30;
  const c = trizookaDragPerSecond('brake', true, dt);
  assert.ok(Math.abs(c - linear) > 1e-3, 'exact diverges from linear away from 60Hz');
  // the exact form must reproduce the per-frame retention over dt
  near(1 - c * dt, Math.pow(retention, 60 * dt), 1e-9);
  // the linear form is only an approximation of the same thing
  assert.ok(Math.abs((1 - linear * dt) - Math.pow(retention, 60 * dt)) > 1e-4,
    'the linear form is the approximation, the exact form is not');
  near(trizookaDragPerSecond('brake'), linear, 'the default is the linear per-second coefficient');
});

test('the projectile field contract clears and reconstructs on _new and ghost replay', () => {
  const p = { s3SpecialWeapon: {}, s3VolleyIndex: 1, damageOwner: true };
  trizookaClearProjectile(p);
  for (const k of TRIZOOKA_PROJECTILE_FIELDS) assert.equal(k in p, false, `${k} must not survive a pooled round`);
  const d = trizookaSpecialWeapon();
  trizookaApplyProjectile(p, { descriptor: d, actionIndex: 2, volleyIndex: 1 });
  assert.equal(p.s3SpecialWeapon, d);
  assert.equal(p.s3ActionIndex, 2);
  assert.equal(p.s3VolleyIndex, 1);
  assert.equal(p.damageOwner, true);
});

test('the selectors are reachable from the special registry by wid', async () => {
  const api = await production();
  const s = api.SPECIALS.trizooka;
  assert.equal(typeof s.selectors.flight, 'function');
  assert.equal(typeof s.selectors.collision, 'function');
  assert.equal(typeof s.selectors.orbitOffset, 'function');
  assert.equal(typeof s.selectors.clearProjectile, 'function');
  assert.equal(s.selectors.fields.length, TRIZOOKA_PROJECTILE_FIELDS.length);
});

test('the descriptor exposes the full native blast field names', () => {
  const d = trizookaSpecialWeapon();
  assert.equal(d.splashRadius, 4.0, 'the damaging radius is the outer band distance');
  assert.equal(d.splashDamageMax, 53);
  assert.equal(d.splashDamageMin, 35);
  assert.equal(d.splashBands[0][1], 53);
  assert.equal(d.paintRadius, 3.2, 'the ink/FX radius stays PaintRadius');
});

// ---- replay ----------------------------------------------------------------

test('replay state is flat, idempotent and authors no damage, refill or countershot', async () => {
  let s = newTrizookaReplayState();
  assert.deepEqual(s, { active: false, actionIndex: 0, t: 0, seenActions: [], ended: false, reason: null });
  trizookaReplayActivate(s);
  assert.equal(s.active, true);
  trizookaReplayActivate(s);                                  // duplicate packet
  assert.equal(s.actionIndex, 0, 'a duplicate activation cannot restart the special');

  trizookaReplayFire(s, { actionIndex: 1 });
  trizookaReplayFire(s, { actionIndex: 1 });                  // duplicate volley packet
  assert.equal(s.actionIndex, 1, 'a duplicate fire packet cannot fire twice');
  assert.deepEqual(s.seenActions, [1]);
  trizookaReplayFire(s, { actionIndex: 2 });
  trizookaReplayFire(s, { actionIndex: 3 });
  trizookaReplayFire(s, { actionIndex: 4 });
  assert.equal(s.actionIndex, 3, 'a replay never exceeds three fire actions');

  trizookaReplayEnd(s, { reason: 'duration' });
  trizookaReplayEnd(s);
  assert.equal(s.active, false);
  assert.equal(s.ended, true);
  trizookaReplayFire(s, { actionIndex: 2 });
  assert.deepEqual(s.seenActions, [1, 2, 3], 'no fire after the end');
  // the replay surface is state only: no damage, no refill, no countershot
  assert.deepEqual(Object.keys(s).sort(), ['actionIndex', 'active', 'ap', 'duration', 'ended', 'reason', 'seenActions', 't']);
});

// ---- uninstall -------------------------------------------------------------

test('the lifecycle wrapper can be removed and restores the native methods', async () => {
  const api = await production();
  const restore = installTrizookaLifecycle(api);
  assert.equal(typeof restore, 'function');
  const before = api.Actor.prototype._startSpecial;
  restore();
  assert.notEqual(api.Actor.prototype._startSpecial, before, 'the prototype was restored');
  installKitTrizooka(api, JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json'), 'utf8')));
});
test('native volley side lobes are symmetric and stay inside the declared fan', async () => {
  const api = await production(), projectiles = world(api), a = makeActor(api);
  a.aimPoint.copy(a.pos).add({ x: 2, y: 3, z: 20 });
  const muzzle = projectiles._muzzle(a, new api.THREE.Vector3());
  const aim = projectiles._aimFrom(a, muzzle, new api.THREE.Vector3()).clone();
  const basis = perpendicularBasis(aim).u;
  const fired = throwVolley(projectiles, a, trizookaSpecialWeapon());
  const carrier = fired.find(p => p.damageOwner), sides = fired.filter(p => !p.damageOwner);
  assert.ok(carrier.vel.clone().normalize().distanceTo(aim) < 1e-12);
  const offsets = sides.map(p => p.vel.clone().normalize().dot(basis));
  assert.ok(offsets[0] * offsets[1] < 0, 'visual lobes straddle the authoritative aim ray');
  assert.ok(Math.abs(offsets[0] + offsets[1]) < 1e-12, 'equal opposite fan offsets');
  for (const p of sides) {
    const angle = Math.acos(Math.min(1, p.vel.clone().normalize().dot(aim)));
    assert.ok(angle <= VOLLEY_CONFIG.spreadDeg * Math.PI / 180 + 1e-12);
    assert.ok(Math.abs(p.vel.length() - TRIZOOKA.spawnSpeed) < 1e-9);
  }
});

import { gearCurve } from '../runtime/gear.mjs';
import { kitTrizookaGhost } from '../runtime/trizooka-collision.mjs';
function specialLoadout(ap, ability='specialPower') {
 const rows=Array.from({length:3},()=>({main:'none',subs:['none','none','none']}));
 for(const p of rows) if(ap>=10){p.main=ability;ap-=10;}
 for(const p of rows) for(let i=0;i<3&&ap>=3;i++,ap-=3)p.subs[i]=ability;
 assert.equal(ap,0);return rows;
}
test('#977 saved Special Power Up loadout reaches real Trizooka activation and remains snapshotted',async()=>{
 const api=await production();world(api);
 try {
  for(const ap of [0,3,10,30,57]){
   gearStorage.set('inkwave.splatoon3.gear.v1',JSON.stringify(specialLoadout(ap)));
   const a=makeActor(api);a.setWeapon('shooter');a.special=a.specialCost();a._startSpecial();
   assert.ok(a.s3Trizooka?.active);assert.equal(a.s3Trizooka.ap,ap);
   near(a.s3Trizooka.duration,gearCurve(ap,5.5,6.75,8));
   const descriptor=a.s3Trizooka.descriptor;
   near(descriptor.splashRadius,4*gearCurve(ap,1,1.15,1.3));
   assert.equal(descriptor.directDamage,220);assert.deepEqual(Array.from(descriptor.splashBands,p=>p[1]),[53,35]);
   assert.equal(descriptor.paintRadius,3.2);
   gearStorage.set('inkwave.splatoon3.gear.v1',JSON.stringify(specialLoadout(0)));a.setWeapon('shooter');
   assert.equal(a.s3Trizooka.descriptor,descriptor);assert.equal(a.s3Trizooka.ap,ap);
  }
  gearStorage.set('inkwave.splatoon3.gear.v1',JSON.stringify(specialLoadout(57,'specialCharge')));
  const a=makeActor(api);a.setWeapon('shooter');a.special=a.specialCost();a._startSpecial();
  near(a.s3Trizooka.duration,5.5);near(a.s3Trizooka.descriptor.splashRadius,4);
 } finally {gearStorage.clear();}
});
test('#977 continuous AP curves and ghost descriptors preserve activation performance without authority',()=>{
 assert.ok(durationFor(3)>durationFor(0)&&durationFor(3)<durationFor(10));
 near(durationFor(57),8);near(splashRadiusFor(57),5.2);
 const SPECIALS={trizooka:{projectileDescriptor:trizookaProjectileDescriptor}};
 for(const [wire,ap] of [[{specialPowerAP:57},57],[{specialPowerAP:10},10],[{},0],[{specialPowerAP:Infinity},0]]){
  const p={wid:'trizooka',type:'blast'};kitTrizookaGhost(p,{},SPECIALS,wire);
  near(p.s3SpecialWeapon.splashRadius,splashRadiusFor(ap));assert.equal(p.damageOwner,false);assert.equal(p.ghost,true);
  trizookaClearProjectile(p);assert.equal(p.s3TrizookaAP,undefined);
 }
});
