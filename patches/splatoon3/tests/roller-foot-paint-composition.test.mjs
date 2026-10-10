import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
import { adaptNetworkSource } from '../../network-replication/adapter.mjs';
import { adaptRange } from '../../practice-range/adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.join(ROOT, 'inkwave-public');
const adaptProduction = (rel, code) => adaptRange(rel, adaptNetworkSource(rel,
  adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))))));
let runtime;

async function production() {
  if (runtime) return runtime;
  let randomDraws = 0;
  const math = Object.create(Math);
  math.random = () => { randomDraws++; return ((randomDraws * 37) % 997) / 997; };
  const context = vm.createContext({ console, performance, URL, Math: math });
  const modules = new Map();
  const load = requested => {
    let file = requested.startsWith(path.join(SRC, 'patches') + path.sep)
      ? path.join(ROOT, path.relative(SRC, requested)) : requested;
    if (file.startsWith(path.join(ROOT, 'src') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    const source = fs.readFileSync(file, 'utf8');
    const rel = file.startsWith(SRC + path.sep) ? path.relative(SRC, file) : path.relative(ROOT, file);
    const module = new vm.SourceTextModule(adaptProduction(rel, source),
      { context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    modules.set(file, module);
    return module;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { NetMatch } from './inkwave-public/src/net/netmatch.js';
  `, { context, identifier: path.join(ROOT, 'roller-foot-paint-entry.mjs') });
  await entry.link((specifier, from) => load(specifier === 'three'
    ? path.join(SRC, 'vendor/three/build/three.module.js')
    : specifier.startsWith('three/addons/')
      ? path.join(SRC, 'vendor/three/jsm', specifier.slice('three/addons/'.length))
      : path.resolve(path.dirname(from.identifier), specifier)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json'), 'utf8'));
  const api = entry.namespace.install(profile);
  const { G, THREE } = api;
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.scene = new THREE.Scene();
  G.camera = { position: new THREE.Vector3(0, 4, -4) };
  G.match = { playing: () => true };
  G.time = 0;
  G.actors = [];
  runtime = { ...api, ...entry.namespace, profile,
    resetRandom() { randomDraws = 0; }, randomCount() { return randomDraws; } };
  return runtime;
}

function flatLevel(THREE) {
  const floor = {
    id: 0,
    solid: true,
    center: new THREE.Vector3(0, -0.1, 0),
    half: new THREE.Vector3(100, 0.1, 100),
    axes: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)],
    faces: [-1, -1, -1, -1, -1, -1],
    aabbMin: new THREE.Vector3(-100, -0.2, -100),
    aabbMax: new THREE.Vector3(100, 0, 100),
  };
  return {
    blocks: [floor], faces: [], groundHeight: () => 0, pointInside: () => false,
    queryBlocks(_x0, _z0, _x1, _z1, out) { out.length = 0; out.push(0); return out; },
  };
}

function makeActor(api, { remote = false, y = 0, grounded = true, vertical = false, yaw = 0 } = {}) {
  const { Actor, G, THREE } = api;
  class FastCharacter {
    constructor() { this.root = { position: new THREE.Vector3(), rotation: {} }; this.events = []; }
    _owner() { return null; }
    trigger(...args) { this.events.push(args); }
    getMuzzle(out) { return out.copy(this.root.position).add(new THREE.Vector3(0, 1.05, 0.3)); }
    setVisible() {}
    setHurt() {}
    setWeapon() {}
  }
  const actor = new Actor({ team: 0, name: 'foot-paint composition regression', weapon: 'roller',
    CharacterClass: FastCharacter, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  actor.remote = remote;
  actor.isLocal = remote ? false : undefined;
  actor.nid = 1;
  actor.alive = true;
  actor.pos.set(0, y, 0);
  actor.yaw = yaw;
  actor.aimPitch = 0;
  actor.grounded = grounded;
  actor.ground.hit = grounded;
  actor.ink = 100;
  actor.weaponRunner.s3FlickVertical = vertical;
  G.actors = [actor];
  return actor;
}

async function setup({ remote = false, y = 0, grounded = true, vertical = false, yaw = 0 } = {}) {
  const api = await production();
  const level = flatLevel(api.THREE);
  api.G.level = level;
  api.G.physics = new api.Physics(level);
  const paintCalls = [];
  const paint = Object.create(api.PaintSystem.prototype);
  paint.level = level;
  // This release-geometry fixture has no atlas faces, but uses native CPU state.
  paint.cell = 0.25;
  paint.paintFaces = level.faces.filter(face => face.paintable);
  paint._initGrid();
  paint.growing = [];
  paint._qb = [];
  // Match the current production constructor's native splat-pool ownership.
  if (paint._takeSplatEntries) Object.assign(paint, {
    _splatEntryPool: [], _splatGrowthPool: [], _splatPoolsDisposed: false,
    _splatPoolStats: { entryArraysCreated: 0, entryArraysReused: 0, growthRecordsCreated: 0, growthRecordsReused: 0 },
  });
  const splat = paint.splat.bind(paint);
  paint.splat = (center, radius, team, opts = {}) => {
    const area = splat(center, radius, team, opts);
    paintCalls.push({ center: [Number(center.x), Number(center.y), Number(center.z)], radius, team, opts: { ...opts }, area });
    return area;
  };
  api.G.paint = paint;
  api.G.netm = null;
  const actor = makeActor(api, { remote, y, grounded, vertical, yaw });
  const net = new api.NetMatch({ myId: remote ? 'remote' : 'owner', hostId: 'owner', isHost: !remote,
    _members: new Map([['owner', 'Owner'], ['remote', 'Remote']]) }, {});
  net.byNid.set(actor.nid, actor);
  api.G.netm = net;
  const projectiles = new api.Projectiles(api.G.scene);
  api.G.projectiles = projectiles;
  return { ...api, actor, net, projectiles, paintCalls };
}

function projectileSnapshot(projectiles, actorY = 0) {
  return projectiles.list.map(p => {
    const start = p.start.toArray(), pos = p.pos.toArray();
    start[1] -= actorY; pos[1] -= actorY;
    return {
      unit: p.s3FlickUnit ?? 0,
      mode: p.fidelityMode ?? null,
      vertical: !!p.s3Vertical,
      start,
      pos,
      vel: p.vel.toArray(),
      seed: p.seed,
      life: p.life,
      straight: p.straight,
      damage: p.damage,
      dmgFar: p.dmgFar,
      radius: p.radius,
      size: p.size,
      grav: p.grav,
      drag: p.drag,
      trailEvery: p.trailEvery,
      damageGroup: p.s3DamageGroup ?? null,
    };
  });
}

function projectilePhysicsDigest(projectiles) {
  const physics = projectileSnapshot(projectiles).map(p => ({
    unit: p.unit, mode: p.mode, vertical: p.vertical, vel: p.vel, seed: p.seed,
    life: p.life, straight: p.straight, damage: p.damage, dmgFar: p.dmgFar,
    radius: p.radius, size: p.size, grav: p.grav, drag: p.drag, trailEvery: p.trailEvery,
  }));
  return crypto.createHash('sha256').update(JSON.stringify(physics)).digest('hex');
}

const mainSnapshots = {
  horizontal: { randomDraws: 124, sha256: 'd0e66466798477372636ce056a7499c70cdaf006aa7af46642accb1846f4e77a', physicsSha256: 'dabc60d166032b840ed07cf05e4fce3dcd0bc157d4bf7527b688aa956f532e49' },
  // Vertical provenance (stale a628 golden, kept for audit only): grounded y=0 full
  // '12ce562aae09f7f292c207211671ae352298f49ed7c0edd6464ef9ad09126bfc' and physics
  // 'e0845aaa2a4d5ca278ba35c330c57cb234ad7be94cb2cf4749f3c93c8173debf'. Current main
  // intentionally emits trailEvery=0 via the #423 primary vertical-paint owner
  // (patches/splatoon3/runtime/roller-vertical-paint.mjs:23) instead of the legacy
  // random trail (1.8), so physics payloads differ only there. Independent SAME
  // current-production grounded control below replaces the stale golden.
  vertical: { randomDraws: 30, sha256: null, physicsSha256: null },
};

const verticalGroundControl = { digest: null, physics: null, randomDraws: null };

async function currentVerticalGroundControl() {
  if (verticalGroundControl.digest) return verticalGroundControl;
  const f = await setup({ y: 0, grounded: true, vertical: true });
  f.resetRandom();
  f.projectiles.fireFlick(f.actor, f.actor.weapon);
  assert.equal(f.projectiles.list.length, 5, 'independent grounded control keeps 5 release units');
  assert.equal(f.paintCalls.length, 1, 'independent grounded control keeps one release footprint');
  assert.equal(f.paintCalls[0].radius, 1.462, 'independent grounded control keeps source radius');
  assert.equal(f.randomCount(), mainSnapshots.vertical.randomDraws, 'grounded control consumes the same draws');
  assert.ok(f.projectiles.list.every(p => p.trailEvery === 0),
    'primary vertical-paint owner disables the legacy random trail (no double paint)');
  verticalGroundControl.digest = crypto.createHash('sha256')
    .update(JSON.stringify(projectileSnapshot(f.projectiles))).digest('hex');
  verticalGroundControl.physics = projectileSnapshot(f.projectiles).map(p => ({
    unit: p.unit, mode: p.mode, vertical: p.vertical, vel: p.vel, seed: p.seed,
    life: p.life, straight: p.straight, damage: p.damage, dmgFar: p.dmgFar,
    radius: p.radius, size: p.size, grav: p.grav, drag: p.drag, trailEvery: p.trailEvery,
  }));
  verticalGroundControl.randomDraws = f.randomCount();
  return verticalGroundControl;
}

async function assertReleaseShape(mode, y, grounded) {
  let heightControl=null;
  if(y!==0){const base=await setup({y:0,grounded,vertical:mode==='vertical'});base.resetRandom();base.projectiles.fireFlick(base.actor,base.actor.weapon);heightControl=projectilePhysicsDigest(base.projectiles);}
  const f = await setup({ y, grounded, vertical: mode === 'vertical' });
  const { actor, G, net, projectiles, paintCalls } = f;
  const expected = mode === 'horizontal' ? { radius: 1.5, count: 13, mainCount: 12, mainLast: 11 } :
    { radius: 1.462, count: 5, mainCount: 5, mainLast: 4 };
  f.resetRandom();
  projectiles.fireFlick(actor, actor.weapon);
  assert.equal(projectiles.list.length, expected.count);
  assert.equal(projectiles.list.filter(p => p.s3FlickUnit === 0).length, expected.mainCount);
  assert.equal(new Set(projectiles.list.map(p => p.s3DamageGroup)).size, 1);
  assert.ok(projectiles.list.every(p => p.age === 0), 'paint is recorded before any projectile step');
  assert.equal(paintCalls.length, 1, 'one dedicated paint call at release');
  assert.equal(paintCalls[0].radius, expected.radius);
  assert.equal(paintCalls[0].team, actor.team);
  assert.equal(paintCalls[0].center[0], 0);
  assert.ok(Math.abs(paintCalls[0].center[1] - 0.1) < 1e-12);
  assert.equal(paintCalls[0].center[2], 0.5);
  assert.equal(paintCalls[0].opts.seed, projectiles.list[expected.mainLast].seed);
  assert.equal(net.out.filter(e => e[1] === 's').length, 1, 'owner records one authoritative paint event');
  assert.equal(net.out.filter(e => e[1] === 'p').length, expected.count, 'projectile packet count remains unchanged');
  assert.equal(f.randomCount(), mainSnapshots[mode].randomDraws, 'foot paint consumes no additional random draws');
  if (mode === 'horizontal' && actor.pos.y === 0) {
    const digest = crypto.createHash('sha256').update(JSON.stringify(projectileSnapshot(projectiles))).digest('hex');
    assert.equal(digest, mainSnapshots[mode].sha256, 'launch transform and full projectile payload match main');
  } else if (mode === 'vertical') {
    // Independent SAME current-production grounded control (no copied golden):
    // airborne physics must equal the current grounded release payload field-for-field.
    const control = await currentVerticalGroundControl();
    const controlDigest = crypto.createHash('sha256').update(JSON.stringify(control.physics)).digest('hex');
    assert.equal(projectilePhysicsDigest(projectiles), controlDigest,
      'airborne height does not change seed, velocity, lifetime, damage or projectile payload');
    assert.deepEqual(projectileSnapshot(projectiles).map(p => ({
      unit: p.unit, mode: p.mode, vertical: p.vertical, vel: p.vel, seed: p.seed,
      life: p.life, straight: p.straight, damage: p.damage, dmgFar: p.dmgFar,
      radius: p.radius, size: p.size, grav: p.grav, drag: p.drag, trailEvery: p.trailEvery,
    })), control.physics, 'grounded and airborne physics payloads stay field-identical');
    assert.ok(projectiles.list.every(p => p.trailEvery === 0),
      'primary vertical-paint owner keeps legacy random trail disabled (no double paint)');
    const normalizedY = Array.from(projectileSnapshot(projectiles, actor.pos.y), p => Number(p.start[1].toFixed(6)));
    assert.deepEqual(normalizedY, [1.8, 1.3, 1.3, 0.3, 0.3], 'airborne release shifts launch origins only by actor height');
  } else {
    assert.equal(projectilePhysicsDigest(projectiles), heightControl,
      'airborne height preserves the current horizontal projectile payload');
  }
  return { f, paintEvent: net.out.find(e => e[1] === 's'), projectileEvents: net.out.filter(e => e[1] === 'p') };
}

test('profile derives both source SplashNearest footprints through the retained world scale', async () => {
  const f = await production();
  assert.equal(JSON.stringify(f.WEAPONS.roller.releaseFootPaint.horizontal), JSON.stringify({
    maxHeight: 0.2, offset: { x: 0, y: -2, z: 0.5 }, paintDepthScale: 1.5, paintWidthHalf: 1.5, distanceScale: 1,
  }));
  assert.equal(JSON.stringify(f.WEAPONS.roller.releaseFootPaint.vertical), JSON.stringify({
    maxHeight: 0.2, offset: { x: 0, y: -2, z: 0.5 }, paintDepthScale: 1.462, paintWidthHalf: 1.462, distanceScale: 1,
  }));
  assert.equal(f.WEAPONS.shooter.releaseFootPaint, undefined, 'derived Roller geometry does not leak into other weapons');
  assert.equal(f.profile.weapons.roller.releaseFootPaint, undefined, 'source profile remains immutable');
});

test('horizontal release paints the source-sized near-player footprint before projectile travel', async () => {
  await assertReleaseShape('horizontal', 0, true);
});

test('airborne vertical release paints only when source-bounded walkable ground is in range', async () => {
  await assertReleaseShape('vertical', 1.8, false);
  const high = await setup({ y: 2.21, grounded: false, vertical: true });
  high.projectiles.fireFlick(high.actor, high.actor.weapon);
  assert.equal(high.paintCalls.length, 0, 'no foot splash when the ground probe exceeds Offset.Y plus MaxHeight');
});

test('NetMatch replays owner paint once and remote projectile visuals never paint again', async t => {
  for (const [mode, y, grounded] of [['horizontal', 0, true], ['vertical', 1.8, false]]) {
    await t.test(mode, async subtest => {
      const { f, projectileEvents } = await assertReleaseShape(mode, y, grounded);
      let packet;
      f.net.s.tr = { broadcast: value => { packet = JSON.parse(JSON.stringify(value)); } };
      f.net._sendTick();
      assert.equal(packet.e.filter(event => event[1] === 's').length, 1);
      assert.equal(packet.e.filter(event => event[1] === 'p').length, projectileEvents.length);

      // The owner has already applied this paint sequence. Receive through a
      // distinct session and world, as another authenticated client would.
      const receiver = await setup({ remote: true, y, grounded, vertical: mode === 'vertical' });
      const { G, net, paintCalls, actor: remote } = receiver;
      subtest.after(() => { net.dispose(); f.net.dispose(); });
      assert.notEqual(net, f.net);
      assert.notEqual(net.s, f.net.s);
      assert.equal(net.s._members.has('owner'), true);
      remote.owner = 'owner'; // production admission requires the actual sender owner
      net.bind({ actors: [remote], state: 'playing', time: 180 });
      const deliver = value => {
        net.onMessage('owner', JSON.parse(JSON.stringify(value)));
        net.peers.get('owner').tr = value.ts;
        net._playEvents();
      };
      deliver(packet);
      assert.equal(paintCalls.length, 1, 'the replicated splat is the only remote turf mutation');
      assert.equal(G.projectiles.list.length, projectileEvents.length);
      assert.ok(G.projectiles.list.every(p => p.ghost), 'remote projectile events remain visual ghosts');
      assert.equal(net.out.length, 0, 'remote replay does not re-record paint or projectile packets');
      deliver(packet);
      deliver({ ...packet, ts: packet.ts + 1 / 60 });
      assert.equal(paintCalls.length, 1, 'duplicate packets and repeated paint sequences never repaint');
      assert.equal(G.projectiles.list.length, projectileEvents.length, 'duplicate births never create extra ghosts');
      assert.equal(net.out.length, 0, 'duplicate replay never emits new packets');
      G.projectiles.clear();
      G.projectiles.fireFlick(remote, remote.weapon);
      assert.equal(paintCalls.length, 1, 'remote fireFlick cannot apply the owner footprint a second time');
      assert.equal(net.out.length, 0);
    });
  }
});

test('WeaponRunner admission pays once, releases once, and suppresses idle, empty-ink and reset windups', async () => {
  const f = await setup();
  const { actor, projectiles, paintCalls } = f;
  const runner = actor.weaponRunner;
  const dt = 1 / 60;
  runner.update(dt, { fire: false });
  assert.equal(paintCalls.length, 0);
  assert.equal(projectiles.list.length, 0);
  // #305 permits positive-tank depletion swings; only an empty tank rejects.
  actor.ink = 0;
  runner.update(dt, { fire: false, firePressed: true });
  assert.equal(paintCalls.length, 0, 'empty ink is rejected before release');
  assert.equal(projectiles.list.length, 0);

  actor.ink = 100;
  runner.update(dt, { fire: false, firePressed: true });
  assert.equal(actor.ink, 100 - actor.weapon.flickInk);
  assert.equal(paintCalls.length, 0, 'windup has no premature footprint');
  const releaseFrames = Math.ceil(actor.weapon.flickWindup / dt);
  for (let i = 1; i < releaseFrames; i++) {
    runner.update(dt, { fire: false });
    assert.equal(paintCalls.length, 0);
    assert.equal(projectiles.list.length, 0);
  }
  runner.update(dt, { fire: false });
  assert.equal(projectiles.list.length, 13);
  assert.equal(paintCalls.length, 1);
  assert.equal(actor.ink, 100 - actor.weapon.flickInk, 'release adds no second ink charge');
  assert.equal(runner.cooldown, actor.weapon.flickInterval - actor.weapon.flickWindup);
  runner.update(dt, { fire: false, firePressed: true });
  assert.equal(paintCalls.length, 1, 'cooldown prevents a duplicate release');

  const reset = await setup();
  reset.actor.weaponRunner.update(dt, { fire: false, firePressed: true });
  reset.actor.reset();
  for (let i = 0; i < 30; i++) reset.actor.weaponRunner.update(dt, { fire: false });
  assert.equal(reset.paintCalls.length, 0, 'reset clears an unfinished flick before release');
  assert.equal(reset.projectiles.list.length, 0);
});
