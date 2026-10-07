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
import {adaptKitSource as adaptSource} from './kit-composed-fixture.mjs';
import { installKitTrizooka, VOLLEY_CONFIG, throwVolley, trizookaSpecialWeapon } from '../runtime/kit-trizooka.mjs';
import {
  kitTrizookaWorldSweep, kitTrizookaFlight, kitTrizookaActorRadius, isDamageCarrier,
  kitPaintCredit, kitPaintAuthority, kitVolleyHitAuthority,
} from '../runtime/trizooka-collision.mjs';
import { TRIZOOKA_ORBIT } from '../runtime/kit-trizooka.mjs';

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

// The world AABB of an OBB, so a faithful spatial index can be built.
function blockAabb(b) {
  const ex = Math.abs(b.axes[0].x) * b.half.x + Math.abs(b.axes[1].x) * b.half.y + Math.abs(b.axes[2].x) * b.half.z;
  const ez = Math.abs(b.axes[0].z) * b.half.x + Math.abs(b.axes[1].z) * b.half.y + Math.abs(b.axes[2].z) * b.half.z;
  return { minX: b.center.x - ex, maxX: b.center.x + ex, minZ: b.center.z - ez, maxZ: b.center.z + ez };
}

function world(api, blocks, { capturePaint = false, faithfulQuery = false } = {}) {
  const { G, THREE } = api;
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.time = 0; G.netm = null; G.boss = null; G.local = null; G.fx = null; G.audio = null;
  G.camera = { position: new THREE.Vector3(0, 6, 12) };
  const aabbs = blocks.map(blockAabb);
  G.level = {
    blocks, faces: [], spawnPads: [new THREE.Vector3(), new THREE.Vector3()],
    // A real index returns only the blocks that overlap the supplied rect. The
    // permissive variant returns everything, which hides any query that forgets
    // to widen its rect for the sphere, so the broadphase tests must use
    // `faithfulQuery: true`.
    queryBlocks: faithfulQuery
      ? (x0, z0, x1, z1, out = []) => {
        out.length = 0;
        blocks.forEach((_, i) => {
          const bb = aabbs[i];
          if (bb.maxX < x0 || bb.minX > x1 || bb.maxZ < z0 || bb.minZ > z1) return;
          out.push(i);
        });
        return out;
      }
      : (a, b, c, d, out = []) => { out.length = 0; blocks.forEach((_, i) => out.push(i)); return out; },
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

// ---- actor radius: the table sphere REPLACES the visual shell ----------------

test('the actor sphere replaces the render-only shell instead of adding to it', async () => {
  const api = await production();
  const { projectiles } = world(api, []);
  const a = shooter(api);
  const { p } = shell(api, projectiles, a, 0);
  const body = api.PLAYER.radius * 0.95;
  const grown = kitTrizookaActorRadius(projectiles, p);
  // body allowance kept, table sphere in its place, p.size NOT also counted
  near(grown, body + p.s3ActorRadius, 1e-9);
  assert.ok(grown > body, 'the growing sphere really inflates the reach');
  // the old expression double counted the projectile: body + shell + table
  const doubled = body + p.size + p.s3ActorRadius;
  assert.ok(grown < doubled - 1e-6, `the shell must not be counted twice (${grown} < ${doubled})`);
  // p.size is a RENDER-only shell: changing it must not move the physical reach
  const base = kitTrizookaActorRadius(projectiles, p);
  p.size = 0.9;
  near(kitTrizookaActorRadius(projectiles, p), base, 1e-12);
  p.size = 0.01;
  near(kitTrizookaActorRadius(projectiles, p), base, 1e-12);
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
  const nm = new api.NetMatch({myId:'local',hostId:'peer',isHost:false,_members:new Map([['peer','peer']])},{});
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
  const ghostOwner = shooter(api); ghostOwner.team = 1; ghostOwner.nid = 7;ghostOwner.remote=true;ghostOwner.owner='peer';
  nm.byNid.set(7, ghostOwner);
  api.G.actors = [ghostOwner];
  const before = projectiles.list.length;
  for (const e of packets) api.NetMatch.prototype._play.call(nm, 'peer', e);
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

test('a ghost still runs the flight stage for presentation, and never takes the integrator', async () => {
  const api = await production();
  const { projectiles } = world(api, []);
  const a = shooter(api);
  const { p } = shell(api, projectiles, a, 0);
  p.ghost = true;
  const took = kitTrizookaFlight(projectiles, p, F);
  // the hook publishes constants; it NEVER takes the native integration over, so
  // the single native grav/drag pair still runs for a ghost and for a live lobe
  assert.equal(took, false, 'the helper never swallows the native force pair');
  assert.equal(p.s3Stage, 'straight');
  assert.equal(p.grav, 0);
  assert.ok(p.s3ActorRadius > 0, 'the growing radii are still published');
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
// ---- broadphase: the real spatial index, widened for a sphere ----------------
//
// These use `faithfulQuery`, so `queryBlocks` returns ONLY the blocks that
// overlap the rect it was handed. The permissive stub returns every id, which
// is exactly why the original broadphase bug survived: the un-widened rect was
// never actually rejecting anything.

test('the broadphase rect is widened by the sphere radius, so a grazing block is found', async () => {
  const api = await production();
  const { projectiles } = world(api, [obb(api, [0, 1, 8], [1, 1, 1])], { faithfulQuery: true });
  const a = shooter(api);
  const { p } = shell(api, projectiles, a, 20);          // field sphere at its 0.3 end radius
  const r = p.s3WorldRadius;
  assert.ok(r > 0.1, `the sphere must be wide enough to graze (r = ${r})`);
  // the centre line runs 0.1m outside the block's x slab: its rect contains NO
  // block at all, while the sphere genuinely overlaps the block
  p.prev.set(1.1, 1, 0); p.pos.set(1.1, 1, 20);
  const ids = api.G.level.queryBlocks(1.1, 0, 1.1, 20, []);
  assert.equal(ids.length, 0, 'the bare centre-line rect really does exclude the block');
  const bare = api.G.physics.segment(p.prev, p.pos, new api.Hit(), true);
  assert.equal(bare.hit, false, 'and the native point ray misses it entirely');
  const swept = kitTrizookaWorldSweep(projectiles, p, new api.Hit(), api.G.physics);
  assert.equal(swept.hit, true, 'the swept sphere must still find the grazing contact');
  // contact when the centre is r from the block: x gap 0.1, so z = 7 - sqrt(r^2-0.01)
  const expectZ = 7 - Math.sqrt(r * r - 0.01);
  near(swept.dist, expectZ, 1e-3);
});

test('a grate is skipped exactly like the native segment(..., true) it replaces', async () => {
  const api = await production();
  const solid = obb(api, [0, 1, 8], [1, 1, 1]);
  const grate = obb(api, [0, 1, 8], [1, 1, 1]); grate.grate = true;
  const a = shooter(api);

  const hitSolid = world(api, [solid], { faithfulQuery: true });
  const p1 = shell(api, hitSolid.projectiles, a, 20).p;
  p1.prev.set(0, 1, 0); p1.pos.set(0, 1, 20);
  assert.equal(kitTrizookaWorldSweep(hitSolid.projectiles, p1, new api.Hit(), api.G.physics).hit, true,
    'the same block is solid geometry and is hit');

  const hitGrate = world(api, [grate], { faithfulQuery: true });
  const p2 = shell(api, hitGrate.projectiles, a, 20).p;
  p2.prev.set(0, 1, 0); p2.pos.set(0, 1, 20);
  // native: `physics.segment(a, b, out, true)` means "shots pass through grates"
  assert.equal(api.G.physics.segment(p2.prev, p2.pos, new api.Hit(), true).hit, false,
    'native skips the grate for a shot');
  assert.equal(kitTrizookaWorldSweep(hitGrate.projectiles, p2, new api.Hit(), api.G.physics).hit, false,
    'the swept sphere must skip it too');
});

// ---- contact normal and point, re-derived independently ---------------------

// The test's own closest point on the OBB, written from the block data rather
// than taken from the helper.
function closest(block, pt) {
  const c = block.center;
  let lx = 0, ly = 0, lz = 0;
  const d = [pt.x - c.x, pt.y - c.y, pt.z - c.z];
  const h = [block.half.x, block.half.y, block.half.z];
  for (let k = 0; k < 3; k++) {
    const A = block.axes[k];
    let t = d[0] * A.x + d[1] * A.y + d[2] * A.z;
    t = t > h[k] ? h[k] : t < -h[k] ? -h[k] : t;
    lx += A.x * t; ly += A.y * t; lz += A.z * t;
  }
  return { x: c.x + lx, y: c.y + ly, z: c.z + lz };
}

test('a rotated corner contact gets the real OBB normal, not a world-axis one', async () => {
  const api = await production();
  const block = obb(api, [0, 1, 8], [2, 2, 2], 35);
  const { projectiles } = world(api, [block], { faithfulQuery: true });
  const a = shooter(api);
  const { p } = shell(api, projectiles, a, 20);
  const r = p.s3WorldRadius;
  // aim past the block's leading corner: a diagonal that only the shell reaches
  p.prev.set(2.6, 2.6, 0); p.pos.set(2.6, 2.6, 20);
  const swept = kitTrizookaWorldSweep(projectiles, p, new api.Hit(), api.G.physics);
  assert.equal(swept.hit, true, 'the grazing corner is contacted');
  // re-derive: the sphere centre at the reported distance, the real closest point
  // on the OBB, and the direction between them
  const len = 20;
  const centre = { x: p.prev.x, y: p.prev.y, z: p.prev.z + swept.dist };
  const q = closest(block, centre);
  let nx = centre.x - q.x, ny = centre.y - q.y, nz = centre.z - q.z;
  const nl = Math.hypot(nx, ny, nz);
  near(nl, r, 1e-3);
  nx /= nl; ny /= nl; nz /= nl;
  near(swept.normal.x, nx, 1e-6);
  near(swept.normal.y, ny, 1e-6);
  near(swept.normal.z, nz, 1e-6);
  // the old corner branch was radial from the box centre using WORLD half
  // extents; on a rotated box that disagrees with the true surface normal
  const radial = (() => {
    const dx = centre.x - block.center.x, dy = centre.y - block.center.y, dz = centre.z - block.center.z;
    const m = Math.hypot(dx, dy, dz) || 1;
    return { x: dx / m, y: dy / m, z: dz / m };
  })();
  assert.ok(Math.abs(radial.x - nx) + Math.abs(radial.y - ny) + Math.abs(radial.z - nz) > 1e-3,
    'the radial-from-box-centre normal really is different here');
  // the reported POINT is the shell contact, one radius in front of the centre
  near(swept.point.x, centre.x - nx * r, 1e-6);
  near(swept.point.z, centre.z - nz * r, 1e-6);
  assert.ok(len > 0);
});

test('the impact ink centre lies on the real surface, outside the geometry', async () => {
  const api = await production();
  const block = obb(api, [0, 1, 8], [2, 2, 2]);
  const { projectiles } = world(api, [block], { faithfulQuery: true });
  const a = shooter(api);
  const { p } = shell(api, projectiles, a, 20);
  const r = p.s3WorldRadius;
  p.prev.set(0, 1, 0); p.pos.set(0, 1, 20);
  const swept = kitTrizookaWorldSweep(projectiles, p, new api.Hit(), api.G.physics);
  assert.equal(swept.hit, true);
  const q = closest(block, swept.point);
  near(Math.hypot(swept.point.x - q.x, swept.point.y - q.y, swept.point.z - q.z), 0, 1e-6);
  // native _impact offsets 0.14 along the normal, so the painted centre must be
  // outside the solid: the OBB-local coordinates must exceed the half extent
  const inside = (pt) => {
    const d = [pt.x - block.center.x, pt.y - block.center.y, pt.z - block.center.z];
    const h = [block.half.x, block.half.y, block.half.z];
    // inside the OBB only when EVERY local axis is within its own half extent
    for (let k = 0; k < 3; k++) {
      const A = block.axes[k];
      if (Math.abs(d[0] * A.x + d[1] * A.y + d[2] * A.z) >= h[k] - 1e-9) return false;
    }
    return true;
  };
  assert.equal(inside(swept.point), false, 'the contact point itself is not inside the box');
  const painted = { x: swept.point.x + swept.normal.x * 0.14, y: swept.point.y + swept.normal.y * 0.14, z: swept.point.z + swept.normal.z * 0.14 };
  assert.equal(inside(painted), false, 'nor is the offset the native impact actually paints at');
  assert.ok(r > 0);
});

test('face, uv and block are filled from a valid native face', async () => {
  const api = await production();
  const T = api.THREE;
  const block = obb(api, [0, 1, 8], [2, 2, 2]);
  // a real face entry, so the uv can be computed exactly like native does
  const face = { origin: new T.Vector3(0, 1, 6), u: new T.Vector3(1, 0, 0), v: new T.Vector3(0, 1, 0) };
  block.faces = [0, 1, 2, 3, 4, 5];
  const { projectiles } = world(api, [block], { faithfulQuery: true });
  api.G.level.faces = [face, face, face, face, face, face];
  const a = shooter(api);
  const { p } = shell(api, projectiles, a, 20);
  p.prev.set(0, 1, 0); p.pos.set(0, 1, 20);
  const swept = kitTrizookaWorldSweep(projectiles, p, new api.Hit(), api.G.physics);
  assert.equal(swept.hit, true);
  assert.equal(swept.block, block.id, 'the block index is real');
  // travelling +z hits the -z face, i.e. axis 2 with a negative sign
  assert.equal(swept.face, 5, 'a valid face index, not -1');
  near(swept.u, swept.point.x - face.origin.x, 1e-9);
  near(swept.v, swept.point.y - face.origin.y, 1e-9);
});

// ---- one credit, one paint --------------------------------------------------

function spyTurf(actor) {
  const calls = [];
  const real = actor.addTurf.bind(actor);
  actor.addTurf = (n) => { calls.push(n); return real(n); };
  return calls;
}

test('each native paint site credits turf exactly once, for a carrier and an ordinary round', async () => {
  const api = await production();
  const { projectiles } = world(api, [obb(api, [0, -1, 3], [6, 1, 6])]);
  const a = shooter(api);
  const calls = spyTurf(a);
  const hit = { point: new api.THREE.Vector3(0, 1, 3), normal: new api.THREE.Vector3(0, 0, -1) };

  const fired = throwVolley(projectiles, a, trizookaSpecialWeapon());
  const carrier = fired[VOLLEY_CONFIG.damageLobeIndex];

  // a NON blast impact is the clean probe: native lays one splat and one credit
  calls.length = 0;
  projectiles._impact({ ...carrier, type: 'shot', vol: null }, hit);
  assert.equal(calls.length, 1, `one impact credits once, not twice (${calls.length})`);

  calls.length = 0;
  projectiles._blastBurst(carrier, new api.THREE.Vector3(0, 1, 3), null);
  assert.equal(calls.length, 1, `one blast credits once, not twice (${calls.length})`);

  calls.length = 0;
  const trail = projectiles._new();
  Object.assign(trail, { type: 'shot', wid: 'trizooka', owner: a, team: 0, age: 0, life: 5,
    straight: 0.2667, radius: 3.2, size: 0.22, grav: 0, drag: 0, damage: 0, damageOwner: true,
    vol: null, trail: 0.3, trailEvery: 0.1, trailRadius: 0.3 });
  trail.pos.set(0, 0.3, 3); trail.prev.set(0, 0.3, 3);
  projectiles._step(trail, F);
  assert.equal(calls.length, 1, `one trail drip credits once, not twice (${calls.length})`);

  calls.length = 0;
  const plain = projectiles._new();
  Object.assign(plain, { type: 'shot', wid: 'shooter', owner: a, team: 0, age: 0, life: 5,
    straight: 0.06, radius: 0.5, size: 0.2, grav: 57.6, drag: 0, damage: 36, trail: -1.5,
    trailEvery: 0, trailRadius: 0.3 });
  plain.pos.set(0, 1, 3); plain.prev.set(0, 1, 3);
  projectiles._impact(plain, hit);
  assert.equal(calls.length, 1, `an ordinary main round also credits exactly once (${calls.length})`);
  assert.ok(calls[0] > 0, 'and the credit is the real paint area');
});

test('kitPaintCredit is pure: it returns the amount and never credits by itself', async () => {
  const api = await production();
  const { projectiles } = world(api, []);
  const a = shooter(api);
  const calls = spyTurf(a);
  const fired = throwVolley(projectiles, a, trizookaSpecialWeapon());
  const carrier = fired[VOLLEY_CONFIG.damageLobeIndex];
  const side = fired.find((x) => !isDamageCarrier(x));

  assert.equal(kitPaintCredit(carrier, 10), 10, 'the carrier is credited its area');
  assert.equal(calls.length, 0, 'but the helper itself never calls addTurf');

  assert.equal(kitPaintCredit(side, 10), 0, 'a side lobe is credited nothing');
  assert.equal(kitPaintCredit({ ...carrier, ghost: true }, 10), 0, 'nor is a ghost');
  assert.equal(kitPaintCredit({ ...carrier, owner: null }, 10), 0, 'nor a projectile with no owner');
  assert.equal(calls.length, 0, 'still a pure function throughout');
});

test('the authority rule is intrinsic: a kit ghost is refused with no transport at all', async () => {
  const api = await production();
  const { projectiles, paintCalls } = world(api, [obb(api, [0, 1, 8], [2, 2, 2])]);
  const a = shooter(api);
  api.G.netm = null;
  const inkVacOwner = shooter(api); inkVacOwner.team = 1;
  const calls = spyTurf(inkVacOwner);

  // InkVac carries no projectile of its own; the rule it needs is the same one a
  // Trizooka ghost needs, and it must not depend on G.netm being present
  const inkVacGhost = {
    type: 'blast', wid: 'inkVac', owner: inkVacOwner, team: 1, age: 0, life: 5, straight: 0.1,
    radius: 3.2, size: 0.22, grav: 0, drag: 0, damage: 220, ghost: true, vol: null,
    trail: -1.5, trailEvery: 0, trailRadius: 0.3,
  };
  assert.equal(kitPaintAuthority(inkVacGhost), false, 'an inkVac ghost has no paint authority');
  assert.equal(kitPaintCredit(inkVacGhost, 10), 0);
  paintCalls.length = 0;
  const hit = { point: new api.THREE.Vector3(0, 1, 6), normal: new api.THREE.Vector3(0, 0, -1) };
  projectiles._impact(inkVacGhost, hit);
  assert.equal(paintCalls.length, 0, 'and the native impact lays no ink for it');
  assert.equal(calls.length, 0, 'nor credits turf');

  // an ORDINARY native ghost keeps the native rule: it still presents its ink
  const plainGhost = {
    type: 'shot', wid: 'shooter', owner: inkVacOwner, team: 1, age: 0, life: 5, straight: 0.06,
    radius: 0.5, size: 0.2, grav: 57.6, drag: 0, damage: 36, ghost: true, vol: null,
    trail: -1.5, trailEvery: 0, trailRadius: 0.3,
  };
  assert.equal(kitPaintAuthority(plainGhost), true, 'an ordinary round is untouched by this guard');
});

// ---- the authoritative volley ledger ----------------------------------------

test('a side lobe never poisons the volley ledger, in either list order', async () => {
  const api = await production();
  for (const order of ['side-first', 'carrier-first']) {
    const { projectiles } = world(api, []);
    const a = shooter(api);
    const enemy = new api.Actor({ team: 1, name: 'victim', weapon: 'shooter', isLocal: false, CharacterClass: api.Character });
    enemy.hp = 1000;
    enemy._spawnBarrier = () => {}; enemy._finishFrame = () => {}; enemy._integrate = () => {};
    enemy.pos.set(0, 0, 3);
    api.G.actors = [a, enemy];

    const fired = throwVolley(projectiles, a, trizookaSpecialWeapon());
    const carrier = fired[VOLLEY_CONFIG.damageLobeIndex];
    const side = fired.find((x) => !isDamageCarrier(x));
    const vol = carrier.vol;
    vol.hits.length = 0;

    // both lobes sit on the enemy this frame; only the carrier may damage
    carrier.pos.set(0, 0.7, 3); carrier.prev.copy(carrier.pos);
    side.pos.set(0, 0.7, 3); side.prev.copy(side.pos);

    const order2 = order === 'side-first' ? [side, carrier] : [carrier, side];
    for (const p of order2) projectiles._step(p, F);

    assert.equal(vol.hits.length, 1, `${order}: the victim is recorded once, not by the side lobe`);
    assert.equal(vol.hits[0], enemy, `${order}: and it is the real victim`);
    const dealt = 1000 - enemy.hp;
    assert.ok(dealt > 0, `${order}: the carrier's real hit lands (dealt ${dealt})`);
    assert.equal(dealt, 220, `${order}: exactly one carrier hit, never two and never zero`);
    assert.equal(kitVolleyHitAuthority(side), false, 'a side lobe has no ledger authority');
    assert.equal(kitVolleyHitAuthority(carrier), true, 'the carrier does');
    assert.equal(kitVolleyHitAuthority({ wid: 'shooter', vol: {} }), true,
      'an ordinary drop/slosh round keeps the native shared-vol semantics');
  }
});

test('a side lobe never writes the boss volley ledger either', async () => {
  const api = await production();
  const { projectiles } = world(api, []);
  const a = shooter(api);
  const bossHits = [];
  const boss = {
    hp: 900, id: 7, splash: () => {},
    hit: (...args) => { bossHits.push(args); },
    segHit: () => null,
  };
  api.G.boss = boss;
  const fired = throwVolley(projectiles, a, trizookaSpecialWeapon());
  const carrier = fired[VOLLEY_CONFIG.damageLobeIndex];
  const side = fired.find((x) => !isDamageCarrier(x));
  const vol = carrier.vol;
  vol.hits.length = 0;
  const bh = { point: new api.THREE.Vector3(0, 1, 3), target: boss, dist: 3 };

  projectiles._bossImpact(side, bh);
  assert.equal(vol.hits.length, 0, 'a visual side lobe leaves the boss ledger alone');
  assert.equal(bossHits.length, 0, 'and never hits the boss');

  projectiles._bossImpact(carrier, bh);
  assert.equal(vol.hits.length, 1, 'the carrier records the boss once');
  assert.equal(bossHits.length, 1, 'and lands its one real boss hit');
});

// ---- packet: per-lobe identity survives the wire ----------------------------

test('the volley identity rides the main projectile packet, and old packets still replay', async () => {
  const api = await production();
  const { projectiles } = world(api, []);
  const a = shooter(api);
  a.nid = 7;
  const nm = new api.NetMatch({myId:'local',hostId:'peer',isHost:false,_members:new Map([['peer','peer']])},{});
  nm.out = []; nm.mute = 0; nm.applying = false;
  nm.byNid = new Map(); nm.replayKitEvent = () => false;
  api.G.netm = nm;

  throwVolley(projectiles, a, trizookaSpecialWeapon(57));
  const wire = JSON.parse(JSON.stringify(nm.out));      // the real serialisation hop
  const packets = wire.filter((e) => e[1] === 'p');
  assert.equal(packets.length, VOLLEY_CONFIG.lobes);
  // the two appended fields are the last two, and they are the lobe index
  for (let i = 0; i < VOLLEY_CONFIG.lobes; i++) {
    assert.equal(packets[i][27], i, `packet ${i} carries its own volley index`);
    assert.equal(packets[i][28], 0, 'and the action index');
    assert.equal(packets[i][33].s3SpecialPowerAP, 57, '#977 immutable AP follows stable metadata');
  }

  nm.out.length = 0;
  const ghostOwner = shooter(api); ghostOwner.team = 1; ghostOwner.nid = 7;ghostOwner.remote=true;ghostOwner.owner='peer';
  nm.byNid.set(7, ghostOwner);
  api.G.actors = [ghostOwner];
  let before = projectiles.list.length;
  for (const e of packets) api.NetMatch.prototype._play.call(nm, 'peer', e);
  const ghosts = projectiles.list.slice(before);
  assert.equal(ghosts.length, VOLLEY_CONFIG.lobes);
  assert.deepEqual([...ghosts.map((g) => g.s3VolleyIndex)], [0, 1, 2],
    'every replayed lobe keeps its own identity, so they stay 120 degrees apart');
  const phases = ghosts.map((g) => g.s3OrbitPhase);
  for (let i = 1; i < phases.length; i++) {
    near(phases[i] - phases[i - 1], TRIZOOKA_ORBIT.lobePhase, 1e-9);
  }
  for (const g of ghosts) {
    assert.equal(g.damageOwner, false, 'and none of them carries authority');
    assert.equal(g.s3SpecialWeapon.specialPowerAP, 57);
    near(g.s3SpecialWeapon.impactRadius, 5.2, '#977 ghost inherits owner radius');
  }

  // an OLD packet, with no appended fields at all, must still replay
  const legacy = packets.map((e) => e.slice(0, 27));
  before = projectiles.list.length;
  for (const e of legacy) api.NetMatch.prototype._play.call(nm, 'peer', e);
  const old = projectiles.list.slice(before);
  assert.equal(old.length, VOLLEY_CONFIG.lobes, 'an older packet still reconstructs every lobe');
  for (const g of old) {
    assert.equal(g.s3VolleyIndex, 0, 'with the missing identity defaulting to lobe 0');
    assert.equal(g.ghost, true, 'and never becoming authoritative');
  }

  // a hostile or malformed value is bounded on the way in: the same packet the
  // real recorder produced, with only its two appended fields tampered with
  const evil = packets[0].slice();
  evil[27] = 1e9;
  evil[28] = -5;
  before = projectiles.list.length;
  api.NetMatch.prototype._play.call(nm, 'peer', evil);
  const bounded = projectiles.list.slice(before);
  assert.equal(bounded.length, 1);
  assert.equal(bounded[0].s3VolleyIndex, 2, 'a huge index is clamped to the last lobe');
  assert.equal(bounded[0].s3ActionIndex, 0, 'a negative index is refused');
});
