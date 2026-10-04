// Real-source tests for the Splatoon 3 sub weapons.
//
// These run the ACTUAL adapted native modules (inkwave-public Actor,
// WeaponRunner, Projectiles, Physics, PaintSystem) through one VM, install the
// real production installer, then add installKitSubs exactly as the parent
// adapter hook does. Nothing here is a stand-in for the sub pipeline: the bombs
// are real Projectiles records, the flight/contact/fuse loop is the real
// `_updateBombs`, and the blast is the real `_explodeBomb`.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { KIT_SUBS, SUCTION, CURLING, registerKitSubs, kitSubFor, curlingChargeFraction, curlingThrowSpeed, curlingBlastParams } from '../runtime/kit-subs.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.resolve(process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public'));
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-9, `${m || ''} ${a} ~ ${b}`);

// ---- spec-level facts that need no engine ------------------------------------

test('suction spec keeps 11.3.0 omissions explicitly unknown', () => {
  assert.equal(SUCTION.inkRecoverStop, 1);
  assert.equal(SUCTION.throwSpeed, 67.2);
  assert.equal(SUCTION.paintRadius, 5);
  assert.equal(SUCTION.damageInnerDistance, 4.6);
  assert.equal(SUCTION.damageOuterDistance, 8);
  assert.equal(SUCTION.damageMax, 180);
  assert.equal(SUCTION.damageMin, 30);
  assert.equal(SUCTION.fuse, null);
  assert.equal(SUCTION.fuseStatus, 'unknown-omitted');
  assert.equal(SUCTION.inkCost, null);
  assert.equal(SUCTION.gravity, null);
  assert.equal(SUCTION.fuseFallbackStatus, 'calibrated');
});

test('curling charge uses SpawnSpeedZMaxCharge, never the gear tiers', () => {
  assert.equal(CURLING.maxChargeTime, 1);
  assert.equal(CURLING.burstFrame, 3.5);
  near(curlingThrowSpeed(0), 24, 'tap = SpawnSpeedZSpecUp.Low 0.40*60');
  near(curlingThrowSpeed(1), 12, 'full = SpawnSpeedZMaxCharge 0.20*60');
  assert.ok(curlingThrowSpeed(0.5) < CURLING.throwSpeedTiers.mid, 'must not climb into the gear ladder');
  assert.equal(curlingChargeFraction(99), 1);
  const lo = curlingBlastParams(0), hi = curlingBlastParams(1);
  assert.deepEqual([lo.paintRadius, lo.radius, lo.damageOuterDistance], [2.133, 5, 5]);
  assert.deepEqual([hi.paintRadius, hi.radius, hi.damageOuterDistance], [5, 8, 8]);
});

// ---- the real adapted runtime ------------------------------------------------

let cached;
async function production() {
  if (cached) return cached;
  const context = vm.createContext({ console, performance, URL });
  const modules = new Map();
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
  // The build tree has src/ and patches/ as siblings. Map adapter-injected
  // `../../patches/...` specifiers (resolved against SRC/src) back to the repo.
  const map = (f) => (f.startsWith(path.join(SRC, 'patches') + path.sep)
    ? path.join(ROOT, path.relative(SRC, f))
    : f.startsWith(path.join(ROOT, 'inkwave-public') + path.sep)
      ? path.join(SRC, path.relative(path.join(ROOT, 'inkwave-public'), f))
      : f.startsWith(path.join(ROOT, 'src') + path.sep)
        ? path.join(SRC, path.relative(ROOT, f))
        : f);
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { installKitSubs } from './patches/splatoon3/runtime/kit-subs.mjs';
    export * from './inkwave-public/src/core/ctx.js';
    export * from './inkwave-public/src/config.js';
    export * from './inkwave-public/src/game/actor.js';
    export * from './inkwave-public/src/game/weapons.js';
    export * from './inkwave-public/src/game/physics.js';
    export * from './inkwave-public/src/world/paint.js';
    export * as THREE from 'three';
  `, { context, identifier: path.join(ROOT, 'kit-subs-entry.mjs') });
  await entry.link((specifier, from) => {
    if (specifier === 'three') return load(path.join(SRC, 'vendor/three/build/three.module.js'));
    if (specifier.startsWith('three/addons/')) return load(path.join(SRC, 'vendor/three/jsm', specifier.slice('three/addons/'.length)));
    return load(map(path.resolve(path.dirname(from.identifier), specifier)));
  });
  await entry.evaluate();
  const ns = entry.namespace;
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json'), 'utf8'));
  const api = ns.install(profile);
  // Exactly the parent handoff step, applied to the real installed composition.
  api.installKitSubs = ns.installKitSubs;
  ns.installKitSubs(api, profile);
  cached = api;
  return api;
}

// A real level stub: the native Physics and the native PaintSystem splat math run
// against it. Only the GPU atlas upload is out of scope.
function ground(api, paintMode = 'native') {
  const { G, THREE } = api;
  // One real face so the native PaintSystem actually runs its face math on the
  // centre vector (`_rel.copy(center).sub(f.origin)`), proving the trail centre is
  // a genuine THREE.Vector3 and not a look-alike object.
  const faces = [{
    origin: new THREE.Vector3(0, 0, 0), n: new THREE.Vector3(0, 1, 0), atlas: {},
    u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, 1), su: 120, sv: 120, wall: false,
  }];
  const blocks = [{ aabbMin: { x: -60, y: -20, z: -60 }, aabbMax: { x: 60, y: 40, z: 60 }, origin: new THREE.Vector3(), faces: [0, 0, 0, 0, 0, 0] }];
  const level = {
    blocks, faces, atlas: { size: 256, data: new Uint8Array(256 * 256 * 4), set: () => {}, needsUpdate: false },
    queryBlocks: (x0, z0, x1, z1, out = []) => (out.length = 0, blocks.forEach((b, i) => out.push(i)), out),
    groundHeight: () => 0,
  };
  G.level = level;
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.time = 0;
  G.actors = [];
  G.fx = null; G.audio = null; G.boss = null; G.netm = null; G.local = null;
  G.camera = { position: new THREE.Vector3(0, 6, 12) };
  G.physics = new api.Physics(level);
  // real PaintSystem.splat with the real level; only the renderer/atlas is absent
  const paint = Object.create(api.PaintSystem.prototype);
  paint.level = level; paint.size = 256; paint.cell = 0.5; paint.pad = 8; paint.maxDensity = 30;
  paint._qb = []; paint.atlas = level.atlas; paint.growing = []; paint.gridDirty = false;
  // 'native' runs the real PaintSystem.splat. Its density WRITE needs the GPU atlas
  // the constructor builds from a WebGL renderer, which this headless fixture cannot
  // provide, so 'record' mode is used by the transition tests below. Which mode each
  // test uses is stated explicitly; no test claims native density writing.
  if (paintMode === 'record') {
    const splats = [];
    paint.splat = (centre, radius, team, opts) => { splats.push({ centre, radius, team }); return 0; };
    paint.__splats = splats;
  }
  paint.grid = new Int32Array(1024 * 1024);
  G.paint = paint;
  return api;
}

function makeScene(api) {
  const scene = new api.THREE.Scene();
  const projectiles = new api.Projectiles(scene);
  return projectiles;
}

// Drives the REAL native _updateBombs, one 60 Hz tick at a time.
function tick(api, projectiles, seconds, hz = 60) {
  const dt = 1 / hz;
  const steps = Math.round(seconds * hz);
  for (let i = 0; i < steps; i++) { api.G.time += dt; projectiles._updateBombs(dt); }
  return projectiles.bombs[0] || null;
}

test('the real adapted runtime installs kit subs and keeps one native list', async () => {
  const api = await production();
  ground(api);
  const { SUB, Projectiles } = api;
  assert.equal(typeof api.installKitSubs, 'function');
  assert.ok(SUB.suction && SUB.curling, 'sub ids registered on the real SUB registry');
  assert.equal(SUB.bomb.id, 'bomb', 'the generic bomb is preserved');
  // a single authoritative projectile list, owned by the native Projectiles
  const projectiles = makeScene(api);
  assert.ok(Array.isArray(projectiles.bombs));
  assert.equal(typeof Projectiles.prototype._updateBombs, 'function');
  // kit-subs adds no second list or second pass
  assert.ok(!('s3Bombs' in projectiles));
});

test('per-weapon selection picks the equipped kit, and the generic bomb stays reachable', async () => {
  const api = await production();
  ground(api);
  const { SUB } = api;
  assert.equal(kitSubFor({ sub: 'suction' }, SUB).id, 'suction');
  assert.equal(kitSubFor({ sub: 'curling' }, SUB).id, 'curling');
  assert.equal(kitSubFor({ sub: 'bomb' }, SUB).id, 'bomb');
  assert.equal(kitSubFor({ sub: 'unknown' }, SUB).id, 'bomb', 'unknown ids fall back to the generic bomb');
});

test('registry registration is additive and never overwrites the native bomb', async () => {
  const api = await production();
  const existing = api.SUB.bomb;
  const before = { inkCost: existing.inkCost, throwSpeed: existing.throwSpeed, fuse: existing.fuse };
  registerKitSubs(api.SUB, {});
  assert.equal(api.SUB.bomb, existing, 'identity preserved');
  assert.deepEqual({ inkCost: api.SUB.bomb.inkCost, throwSpeed: api.SUB.bomb.throwSpeed, fuse: api.SUB.bomb.fuse }, before);
});

// ---- actual composed release + native _updateBombs ---------------------------

async function throwReal(api, weaponSub, hold, lateral = 0) {
  const projectiles = makeScene(api);
  const actor = {
    team: 0, remote: false, isLocal: true, alive: true, ink: 100,
    pos: new api.THREE.Vector3(0, 0, 0), vel: new api.THREE.Vector3(lateral, 0, 0),
    aimYaw: 0, aimPitch: 0.2, grounded: true, color: api.G.teamColors[0],
    weapon: { sub: weaponSub, kind: 'shooter' },
    weaponRunner: { s3SubHold: hold },
    addTurf() { this.turf = (this.turf || 0) + 1; }, _nearCamera: () => true,
  };
  api.G.actors = [actor];
  projectiles.throwBomb(actor, hold);
  return { projectiles, actor, bomb: projectiles.bombs[projectiles.bombs.length - 1] };
}

test('a real suction bomb is thrown with the selected spec and flies under native gravity', async () => {
  const api = await production();
  ground(api);
  const { projectiles, bomb } = await throwReal(api, 'suction', 0);
  assert.ok(bomb, 'the native throwBomb produced a real record');
  assert.equal(bomb.s3Sub.id, 'suction');
  assert.equal(bomb.s3Resolved.spec.id, 'suction');
  assert.equal(bomb.kind, 'bomb', 'it is a real native bomb record');
  assert.ok(bomb.vel.length() > 0, 'the native throwVelocity set a real velocity');
  assert.equal(bomb.fuse, -1, 'not armed while in flight');
  // free flight, no contact: the native loop integrates under the per-bomb gravity
  api.G.physics.segment = (a, b, out) => { out.hit = false; return out; };
  const apex = Math.max(2, bomb.vel.y / 57.6) + 0.5;
  tick(api, projectiles, apex);
  assert.ok(bomb.pos.y < 2, 'gravity brought the real bomb back down after its apex');
  assert.equal(bomb.fuse, -1, 'still in flight, not armed');
});

test('a real suction bomb sticks to a wall, then detonates on its own counted fuse', async () => {
  const api = await production();
  // record-mode paint: the native blast and fuse/removal path still run for real;
  // only the GPU density write is stubbed (see ground()).
  ground(api, 'record');
  const { projectiles, bomb } = await throwReal(api, 'suction', 0);
  // drive it into a wall by teleporting the segment query target
  const physics = api.G.physics;
  physics.segment = (a, b, out) => { out.hit = true; out.point = { x: 3, y: b.y, z: 0 }; out.normal = { x: 1, y: 0, z: 0 }; return out; };
  let b = tick(api, projectiles, 1 / 60);
  assert.equal(b.s3Mode, 'stuck', 'suction adheres to a vertical surface');
  assert.equal(b.s3StuckOn, 'wall');
  assert.deepEqual([b.vel.x, b.vel.y, b.vel.z], [0, 0, 0], 'velocity is zeroed on contact');
  assert.ok(b.fuse > 0 && b.fuse <= SUCTION.fuseFallback, 'a finite fuse is armed');
  // the native loop owns the countdown: it must reach zero and detonate
  const explosions = [];
  const nativeExplode = projectiles._explodeBomb.bind(projectiles);
  projectiles._explodeBomb = (bb) => { explosions.push(bb.s3Sub?.id); return nativeExplode(bb); };
  for (let i = 0; i < 240 && projectiles.bombs.length; i++) { api.G.time += 1 / 60; projectiles._updateBombs(1 / 60); }
  assert.ok(explosions.includes('suction'), 'the native blast ran for the stuck suction bomb');
  assert.equal(projectiles.bombs.length, 0, 'the native removal path cleared the list');
});

test('a real suction bomb adheres to a ceiling as well', async () => {
  const api = await production();
  ground(api);
  const { projectiles } = await throwReal(api, 'suction', 0);
  api.G.physics.segment = (a, b, out) => { out.hit = true; out.point = { x: b.x, y: 3, z: b.z }; out.normal = { x: 0, y: -1, z: 0 }; return out; };
  const b = tick(api, projectiles, 1 / 60);
  assert.equal(b.s3Mode, 'stuck');
  assert.equal(b.s3StuckOn, 'ceiling');
});

test('a real curling bomb rolls, reflects on a wall after landing, and bursts', async () => {
  const api = await production();
  ground(api, 'record');
  const { projectiles, bomb } = await throwReal(api, 'curling', 1, 8);
  assert.equal(bomb.s3Sub.id, 'curling');
  assert.equal(bomb.s3Charge, 1, 'full charge carried onto the real record');
  // land first: floor normal
  let mode = null;
  api.G.physics.segment = (a, b, out) => { out.hit = true; out.point = { x: b.x, y: 0, z: b.z }; out.normal = { x: 0, y: 1, z: 0 }; return out; };
  let cur = tick(api, projectiles, 1 / 60);
  assert.equal(cur.s3Mode, 'rolling', 'floor contact starts the roll');
  assert.ok(cur.fuse > 0, 'the burst window is armed');
  // now a wall must still reflect it (the earlier draft disabled this)
  const vx0 = cur.vel.x;
  api.G.physics.segment = (a, b, out) => { out.hit = true; out.point = { x: 1, y: b.y, z: b.z }; out.normal = { x: 1, y: 0, z: 0 }; return out; };
  cur = tick(api, projectiles, 1 / 60);
  assert.equal(cur.s3Bounces, 1, 'a rolling bomb still reflects on a wall');
  assert.ok(cur.s3Mode === 'rolling', 'it stays rolling, not disabled');
  assert.ok(cur.vel.x !== vx0, 'velocity actually changed on reflection');
  // bounce budget is a real bound: after MaxBoundNum the bomb stops adding energy
  for (let i = 0; i < 5; i++) tick(api, projectiles, 1 / 60);
  assert.equal(cur.s3BounceExhausted, true, 'bounce budget is exhausted and enforced');
  assert.ok(Math.abs(cur.vel.x) < 1e-12, 'an exhausted bounce budget stops the bomb rather than flipping a dead flag');
});

test('the real native PaintSystem accepts the rolling trail centre', async () => {
  const api = await production();
  ground(api);
  const { projectiles, bomb } = await throwReal(api, 'curling', 1, 8);
  api.G.physics.segment = (a, b, out) => { out.hit = true; out.point = { x: b.x, y: 0, z: b.z }; out.normal = { x: 0, y: 1, z: 0 }; return out; };
  let cur = tick(api, projectiles, 1 / 60);
  assert.equal(cur.s3Mode, 'rolling');
  // run the REAL native PaintSystem.splat through the real level
  let err = null;
  try { api.G.paint.splat(cur.pos, 1.29, 0, { seed: 1 }); } catch (e) { err = e; }
  assert.equal(err, null, 'the native paint system accepts the bomb vector centre');
  // the trail hook allocates one reusable real Vector3 per bomb, not per frame
  const before = cur.s3TrailPoint;
  tick(api, projectiles, 2 / 60);
  assert.ok(cur.s3TrailPoint instanceof api.THREE.Vector3, 'trail centre is a real THREE.Vector3');
  assert.equal(cur.s3TrailPoint, before, 'the trail point is reused, not reallocated per frame');
});

test('a ghost bomb gets no kit authority', async () => {
  const api = await production();
  ground(api);
  const projectiles = makeScene(api);
  const actor = {
    team: 1, remote: true, isLocal: false, alive: true, ink: 100,
    pos: new api.THREE.Vector3(0, 0, 0), vel: new api.THREE.Vector3(), aimYaw: 0, aimPitch: 0,
    grounded: true, color: api.G.teamColors[1], weapon: { sub: 'curling', kind: 'shooter' },
    weaponRunner: {}, addTurf() {}, _nearCamera: () => false,
  };
  projectiles.throwBomb(actor, 1);
  const ghost = projectiles.bombs[projectiles.bombs.length - 1];
  assert.ok(ghost, 'the native ghost bomb exists');
  assert.equal(ghost.s3Resolved, undefined, 'a remote actor receives no resolved kit spec');
  assert.equal(ghost.s3Sub, undefined, 'no kit identity on a ghost');
});
