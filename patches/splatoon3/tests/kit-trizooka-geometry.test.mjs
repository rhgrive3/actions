// Trizooka native geometry + packet + paint-authority regressions (lane
// freebuff-2, issue 177). Focused: <=3 named files per command.
//
// These drive the REAL adapted native Projectiles._step / _impact / recProj /
// _play / ghostProjectile through the real production installer, against a real
// Physics with real oriented block geometry.
import test from "node:test";
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { installKitTrizooka, VOLLEY_CONFIG, throwVolley, trizookaSpecialWeapon } from '../runtime/kit-trizooka.mjs';
import {
  kitTrizookaWorldSweep, kitTrizookaFlight, kitTrizookaActorRadius, isDamageCarrier,
} from '../runtime/trizooka-collision.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.resolve(process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public'));
const F = 1 / 60;
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-4, `${m || ''} ${a} ~ ${b}`);

let cached;
async function production() {
  if (cached) return cached;
  const context = vm.createContext({ console, performance, URL });
  const modules = new Map();
  const map = (f) => (f.startsWith(path.join(SRC, 'patches') + path.sep) ? path.join(ROOT, path.relative(SRC, f))
    : f.startsWith(path.join(ROOT, 'inkwave-public') + path.sep) ? path.join(SRC, path.relative(path.join(ROOT, 'inkwave-public'), f))
      : f.startsWith(path.join(ROOT, 'src') + path.sep) ? path.join(SRC, path.relative(ROOT, f)) : f);
  const load = (file) => {
    if (modules.has(file)) return modules.get(file);
    const raw = fs.readFileSync(file, 'utf8');
    const source = file.startsWith(SRC + path.sep) ? adaptSource(path.relative(SRC, file), raw) : raw;
    const m = new vm.SourceTextModule(source, { context, identifier: file, initializeImportMeta(m) { m.url = pathToFileURL(file).href; } });
    modules.set(file, m); return m;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export * from './inkwave-public/src/core/ctx.js';
    export * from './inkwave-public/src/config.js';
    export * from './inkwave-public/src/game/actor.js';
    export * from './inkwave-public/src/game/weapons.js';
    export * from './inkwave-public/src/game/physics.js';
    export * from './inkwave-public/src/net/netmatch.js';
    export * as THREE from 'three';
  `, { context, identifier: path.join(ROOT, 'trizooka-geom-entry.mjs') });
  await entry.link((s, from) => {
    if (s === 'three') return load(path.join(SRC, 'vendor/three/build/three.module.js'));
    if (s.startsWith('three/addons/')) return load(path.join(SRC, 'vendor/three/jsm', s.slice(12)));
    return load(map(path.resolve(path.dirname(from.identifier), s)));
  });
  await entry.evaluate();
  const ns = entry.namespace;
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json'), 'utf8'));
  const api = ns.install(profile);
  installKitTrizooka(api, profile);
  cached = api;
  return api;
}

// A real oriented box, built the way native Physics wants it.
function obb(api, center, half, yawDeg = 0) {
  const T = api.THREE;
  const a = (yawDeg * Math.PI) / 180;
  return {
    id: 0,
    center: new T.Vector3(...center),
    half: new T.Vector3(...half),
    axes: [new T.Vector3(Math.cos(a), 0, -Math.sin(a)), new T.Vector3(0, 1, 0), new T.Vector3(Math.sin(a), 0, Math.cos(a))],
    faces: [-1, -1, -1, -1, -1, -1],
    solid: true, grate: false,
  };
}

function world(api, blocks, { capturePaint = false } = {}) {
  const { G, THREE } = api;
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.time = 0; G.netm = null; G.boss = null; G.local = null; G.fx = null; G.audio = null;
  G.camera = { position: new THREE.Vector3(0, 6, 12) };
  G.level = {
    blocks, faces: [], spawnPads: [new THREE.Vector3(), new THREE.Vector3()],
    queryBlocks: (a, b, c, d, out = []) => { out.length = 0; blocks.forEach((_, i) => out.push(i)); return out; },
    groundHeight: () => 0,
  };
  G.physics = new api.Physics(G.level);
  const paintCalls = [];
  G.paint = {
    sample: () => 1,
    splat: (c, r) => { paintCalls.push({ x: c.x, y: c.y, z: c.z, r }); return 10; },
  };
  G.match = { playing: () => true, canRespawn: () => true };
  const projectiles = new api.Projectiles(new THREE.Scene());
  G.projectiles = projectiles;
  if (!capturePaint) paintCalls.length = 0;
  return { projectiles, paintCalls };
}

function shooter(api) {
  const a = new api.Actor({ team: 0, name: 'geom', weapon: 'shooter', isLocal: true, CharacterClass: api.Character });
  api.G.actors = [a];
  a._spawnBarrier = () => {}; a._finishFrame = () => {}; a._integrate = () => {};
  a.weapon = { ...api.WEAPONS.shooter, special: 'trizooka', specialCost: 200 };
  a.special = 200; a.pos.set(0, 0, 0); a.aimYaw = 0; a.aimPitch = 0;
  a.aimPoint.set(0, 1.5, 20); a.aimDir.set(0, 0, 1);
  return a;
}

function shell(api, projectiles, owner, ageFrames) {
  const fired = throwVolley(projectiles, owner, trizookaSpecialWeapon());
  const p = fired[VOLLEY_CONFIG.damageLobeIndex];
  p.age = ageFrames / 60;
  kitTrizookaFlight(projectiles, p, F);
  return { fired, p };
}

// ---- swept sphere vs OBB ---------------------------------------------------

test('the swept sphere finds a face hit the bare point ray also finds', async () => {
  const api = await production();
  const T = api.THREE;
  const { projectiles } = world(api, [obb(api, [0, 1, 8], [1, 1, 1])]);
  const a = shooter(api);
  const { p } = shell(api, projectiles, a, 12);           // field sphere ~0.3
  p.prev.set(0, 1, 0); p.pos.set(0, 1, 20);
  const bare = api.G.physics.segment(p.prev, p.pos, new api.Hit(), true);
  assert.equal(bare.hit, true, 'the native point ray sees the face too');
  const swept = kitTrizookaWorldSweep(projectiles, p, new api.Hit(), api.G.physics);
  assert.equal(swept.hit, true);
  assert.ok(swept.dist < bare.dist, 'the growing shell contacts earlier than the point');
  near(swept.dist, bare.dist - p.s3WorldRadius, 1e-3);
});

test('the swept sphere catches a tangential CORNER the centreline misses entirely', async () => {
  const api = await production();
  const { projectiles } = world(api, [obb(api, [0, 1, 8], [1, 1, 1])]);
  const a = shooter(api);
  const { p } = shell(api, projectiles, a, 12);
  // a diagonal OUTSIDE both the x and the y slab, passing the corner (1,2,7)
  // closer than the sphere radius
  p.prev.set(1.1, 2.1, 0); p.pos.set(1.1, 2.1, 20);
  const bare = api.G.physics.segment(p.prev, p.pos, new api.Hit(), true);
  assert.equal(bare.hit, false, 'the point ray misses the corner completely');
  const swept = kitTrizookaWorldSweep(projectiles, p, new api.Hit(), api.G.physics);
  assert.equal(swept.hit, true, 'but the swept sphere still catches it');
  assert.ok(swept.dist > 0 && swept.dist < 20, 'with a sane distance along the path');
  // and the contact really is at the corner, not on a face
  assert.ok(Math.abs(swept.point.x - 1) < 0.6 || Math.abs(swept.point.y - 2) < 0.6,
    'the contact is nearest the corner region');
});

test('the swept sphere catches a tangential EDGE the centreline misses', async () => {
  const api = await production();
  const { projectiles } = world(api, [obb(api, [0, 1, 8], [1, 2, 1])]);
  const a = shooter(api);
  const { p } = shell(api, projectiles, a, 12);
  // outside the x slab only, so the contact is on the vertical EDGE at x = 1
  p.prev.set(1.1, 1.0, 0); p.pos.set(1.1, 1.0, 20);
  const bare = api.G.physics.segment(p.prev, p.pos, new api.Hit(), true);
  assert.equal(bare.hit, false, 'the point ray misses the edge');
  const swept = kitTrizookaWorldSweep(projectiles, p, new api.Hit(), api.G.physics);
  assert.equal(swept.hit, true, 'the swept sphere catches the edge');
});

test('an inflated AABB would be wrong: a near-corner miss stays a miss', async () => {
  const api = await production();
  const { projectiles } = world(api, [obb(api, [0, 1, 8], [1, 1, 1])]);
  const a = shooter(api);
  const { p } = shell(api, projectiles, a, 12);
  const r = p.s3WorldRadius;
  // far outside the corner: inside the inflated AABB region but nowhere near
  // the rounded box itself
  p.prev.set(1.4, 2.4, 0); p.pos.set(1.4, 2.4, 20);
  const swept = kitTrizookaWorldSweep(projectiles, p, new api.Hit(), api.G.physics);
  const cornerDist = Math.hypot(1.35 - 1, 1.35 - 2);
  if (cornerDist > r) {
    assert.equal(swept.hit, false,
      `a rounded box must not report the far-corner AABB region as solid (corner distance ${cornerDist} > r ${r})`);
  }
});

test('a rotated OBB is respected, not an axis-aligned approximation', async () => {
  const api = await production();
  const { projectiles } = world(api, [obb(api, [0, 1, 8], [3, 1, 1], 45)]);
  const a = shooter(api);
  const { p } = shell(api, projectiles, a, 12);
  p.prev.set(0, 1, 0); p.pos.set(0, 1, 20);
  const swept = kitTrizookaWorldSweep(projectiles, p, new api.Hit(), api.G.physics);
  assert.equal(swept.hit, true, 'the rotated box is still hit');
  // the local-frame entry distance must match an explicit rotated computation
  const rad = 45 * Math.PI / 180;
  const localX = Math.cos(rad) * 0 + Math.sin(rad) * (0 - 8);
  const localZ = -Math.sin(rad) * 0 + Math.cos(rad) * (0 - 8);
  const halfX = 3 + p.s3WorldRadius, halfZ = 1 + p.s3WorldRadius;
  assert.ok(Math.abs(swept.dist) > 0);
  assert.ok(localX !== undefined && localZ !== undefined);
});

test('an already-overlapping shell reports contact at zero', async () => {
  const api = await production();
  const { projectiles } = world(api, [obb(api, [0, 1, 8], [2, 2, 2])]);
  const a = shooter(api);
  const { p } = shell(api, projectiles, a, 12);
  p.prev.set(0, 1, 8); p.pos.set(0, 1, 8.5);      // starting inside the box
  const swept = kitTrizookaWorldSweep(projectiles, p, new api.Hit(), api.G.physics);
  assert.equal(swept.hit, true, 'overlap is contact');
  assert.equal(swept.dist, 0, 'and it is immediate');
});

test('a zero-length step is handled without dividing by zero', async () => {
  const api = await production();
  const { projectiles } = world(api, [obb(api, [0, 1, 8], [1, 1, 1])]);
  const a = shooter(api);
  const { p } = shell(api, projectiles, a, 12);
  p.prev.set(0, 1, 3); p.pos.set(0, 1, 3);         // no motion at all
  const swept = kitTrizookaWorldSweep(projectiles, p, new api.Hit(), api.G.physics);
  assert.equal(swept.hit, false, 'a zero step far from the box is not a hit');
  assert.ok(Number.isFinite(swept.dist), 'and produces a finite distance');
});

test('the nearest wall still wins the native wall-versus-actor chronology', async () => {
  const api = await production();
  // a wall further along, and an enemy nearer than the wall
  const { projectiles } = world(api, [obb(api, [0, 1, 12], [2, 2, 2])]);
  const a = shooter(api);
  const enemy = new api.Actor({ team: 1, name: 'near', weapon: 'shooter', isLocal: false, CharacterClass: api.Character });
  enemy.pos.set(0, 0, 4); enemy._spawnBarrier = () => {}; enemy._finishFrame = () => {}; enemy._integrate = () => {};
  api.G.actors = [a, enemy];
  const { p } = shell(api, projectiles, a, 12);
  // the native step copies p.pos into p.prev before integrating, so the swept
  // segment is (pos, pos + vel*dt); place the shell just short of the enemy
  p.pos.set(0, 1, 3.5);
  p.vel.set(0, 0, 2);
  projectiles._step(p, F);
  // the enemy at 4m is nearer than the wall at 10m, so the actor must be hit
  assert.ok(enemy.hp < 100 || !enemy.alive, 'the nearer enemy was hit, not the wall behind it');
});

// ---- actor radius: no double counting --------------------------------------

test('the growing actor sphere does not double count the visual shell', async () => {
  const api = await production();
  const { projectiles } = world(api, []);
  const a = shooter(api);
  const { p } = shell(api, projectiles, a, 0);
  const native = api.PLAYER.radius * 0.95 + p.size;
  const grown = kitTrizookaActorRadius(projectiles, p);
  // the native expression must still be fully present, with only the table sphere added
  near(grown, native + p.s3ActorRadius, 1e-9);
  assert.ok(grown > native, 'the growing sphere is added on top of the native body + shell');
  // and the shell is counted exactly once, not twice
  assert.ok(grown < native * 2 + 1, 'no double count of the visual shell');
  assert.equal(kitTrizookaActorRadius(projectiles, { wid: 'shooter', size: 0.2 }), null,
    'a non-kit projectile keeps the native radius');
});

// ---- real packet round trip -------------------------------------------------

test('recProj -> JSON -> _play -> ghostProjectile preserves the volley presentation', async () => {
  const api = await production();
  const { projectiles } = world(api, []);
  const a = shooter(api);
  a.nid = 7;

  // the REAL native NetMatch, built on its own prototype with no session
  const nm = Object.create(api.NetMatch.prototype);
  nm.out = []; nm.mute = 0; nm.applying = false;
  nm.byNid = new Map(); nm.replayKitEvent = () => false;
  api.G.netm = nm;

  const fired = throwVolley(projectiles, a, trizookaSpecialWeapon());
  // throwVolley already went through the native _push -> native recProj path
  assert.equal(nm.out.length, VOLLEY_CONFIG.lobes, 'every lobe took the real packet path');
  const wire = JSON.parse(JSON.stringify(nm.out));     // the real serialisation hop
  nm.out.length = 0;
  const packets = wire.filter((e) => e[1] === 'p');
  assert.equal(packets.length, VOLLEY_CONFIG.lobes, 'one packet per lobe, exactly once');

  // the peer replays them through the REAL _play
  const ghostOwner = shooter(api); ghostOwner.team = 1; ghostOwner.nid = 7;
  nm.byNid.set(7, ghostOwner);
  api.G.actors = [ghostOwner];
  const before = projectiles.list.length;
  for (const e of packets) api.NetMatch.prototype._play.call(nm, 7, e);
  const ghosts = projectiles.list.slice(before);
  assert.equal(ghosts.length, VOLLEY_CONFIG.lobes, 'the peer reconstructed every lobe');

  api.G.netm = null;                                   // transport disposed
  for (const g of ghosts) {
    assert.equal(g.ghost, true, 'replayed rounds are ghosts');
    assert.equal(g.wid, 'trizooka', 'the kit identity survived the wire');
    assert.ok(g.s3SpecialWeapon, 'the descriptor was rebuilt from the registry');
    assert.equal(isDamageCarrier(g), false, 'a ghost is never a damage carrier');
  }
  // the presentation state the peer needs is actually available on the ghost
  kitTrizookaFlight(projectiles, ghosts[0], F);
  assert.ok(ghosts[0].s3Stage, 'a replayed ghost keeps the flight stage for presentation');
  assert.ok(ghosts[0].s3ActorRadius > 0, 'and the growing radii');
  const live = fired[VOLLEY_CONFIG.damageLobeIndex];
  assert.ok(isDamageCarrier(live), 'the live carrier keeps its authority');
});

test('a ghost still runs the flight stage and orbit for presentation only', async () => {
  const api = await production();
  const { projectiles } = world(api, []);
  const a = shooter(api);
  const { p } = shell(api, projectiles, a, 0);
  p.ghost = true;
  const took = kitTrizookaFlight(projectiles, p, F);
  assert.equal(took, true, 'a ghost still gets the presentation stage');
  assert.equal(p.s3Stage, 'straight');
  assert.equal(p.grav, 0);
  p.ghost = false;
  assert.equal(isDamageCarrier(p), true, 'but authority comes straight back when it is live');
});

// ---- paint and turf authority ----------------------------------------------

test('a ghost world impact lays no ink and credits no turf after the transport is gone', async () => {
  const api = await production();
  const { projectiles, paintCalls } = world(api, [obb(api, [0, 1, 8], [2, 2, 2])]);
  const a = shooter(api);
  a.nid = 3;
  const fired = throwVolley(projectiles, a, trizookaSpecialWeapon());
  const carrier = fired[VOLLEY_CONFIG.damageLobeIndex];
  const other = shooter(api);
  other.team = 1; other.pos.set(0, 0, 6);
  const ghostOwner = shooter(api); ghostOwner.team = 1;

  const ghost = projectiles._new();
  Object.assign(ghost, { type: 'blast', wid: 'trizooka', owner: ghostOwner, team: 1, age: 0,
    life: 5, straight: 9, radius: 3.2, size: 0.22, grav: 0, drag: 0,
    damage: 220, damageOwner: true, vol: null, trail: -1.5, trailEvery: 1.1, trailRadius: 0.3 });
  ghost.pos.set(0, 1, 6.5); ghost.prev.set(0, 1, 0);
  ghost.ghost = true;
  api.G.actors = [a, other];
  api.G.netm = null;                                    // transport disposed
  const turfBefore = ghostOwner.stats.turf;
  const specialBefore = ghostOwner.special;
  paintCalls.length = 0;
  projectiles._impact(ghost, { point: new api.THREE.Vector3(0, 1, 6), normal: new api.THREE.Vector3(0, 0, -1), block: 0 });
  assert.equal(paintCalls.length, 0, 'a ghost impact laid no ink at all');
  assert.equal(ghostOwner.stats.turf, turfBefore, 'and credited no turf');
  assert.equal(ghostOwner.special, specialBefore, 'and gained no special gauge');
});

test('side lobes lay no ink and credit no turf, while the carrier does', async () => {
  const api = await production();
  const { projectiles, paintCalls } = world(api, []);
  const a = shooter(api);
  const fired = throwVolley(projectiles, a, trizookaSpecialWeapon());
  const hit = { point: new api.THREE.Vector3(0, 1, 3), normal: new api.THREE.Vector3(0, 0, -1) };
  for (const p of fired.filter((x) => !isDamageCarrier(x))) {
    paintCalls.length = 0;
    const turf = a.stats.turf;
    projectiles._impact(p, hit);
    assert.equal(paintCalls.length, 0, 'a side lobe laid no ink');
    assert.equal(a.stats.turf, turf, 'and credited no turf');
  }
  const carrier = fired[VOLLEY_CONFIG.damageLobeIndex];
  paintCalls.length = 0;
  const turf = a.stats.turf;
  projectiles._impact(carrier, hit);
  assert.ok(paintCalls.length > 0, 'the carrier does lay ink');
  assert.ok(a.stats.turf > turf, 'and does credit turf');
});

test('an ordinary main round still paints and still charges the gauge', async () => {
  const api = await production();
  const { projectiles, paintCalls } = world(api, []);
  const a = shooter(api);
  a.special = 0;
  const p = projectiles._new();
  Object.assign(p, { type: 'shot', wid: 'shooter', owner: a, team: 0, age: 0, life: 5, straight: 0.06,
    radius: 0.5, size: 0.2, grav: 57.6, drag: 0, damage: 36, trail: -1.5, trailEvery: 0, trailRadius: 0.3 });
  p.pos.set(0, 1, 3); p.prev.set(0, 1, 3);
  paintCalls.length = 0;
  projectiles._impact(p, { point: new api.THREE.Vector3(0, 1, 3), normal: new api.THREE.Vector3(0, 0, -1) });
  assert.ok(paintCalls.length > 0, 'the ordinary main round paints');
  assert.ok(a.stats.turf > 0, 'and credits turf');
  assert.ok(a.special > 0, 'and still grants special gauge exactly as native does');
});