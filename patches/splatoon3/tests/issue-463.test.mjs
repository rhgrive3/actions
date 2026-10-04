import { adaptQualitySource } from '../../local-quality/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import { adaptSource } from '../adapter.mjs';
import { adaptIssue463 } from '../issue-463-adapter.mjs';
import { BLASTER_PLAYER_COLLISION_RADIUS, blasterPlayerCollisionRadius } from '../runtime/blaster-player-radius.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');

async function createFixture({ apply463 = true } = {}) {
  const math = Object.create(Math);
  math.random = () => 0.5; // deterministic
  const context = vm.createContext({ console, performance, Math: math });
  const modules = new Map();

  function resolve(spec, from) {
    if (spec === 'three') return path.join(UPSTREAM, 'vendor/three/build/three.module.js');
    let file = path.resolve(path.dirname(from), spec);
    if (file.startsWith(path.join(ROOT, 'inkwave-public/'))) file = path.join(UPSTREAM, path.relative(path.join(ROOT, 'inkwave-public'), file));
    if (file.startsWith(path.join(UPSTREAM, 'patches/'))) file = path.join(ROOT, path.relative(UPSTREAM, file));
    if (file.startsWith(path.join(ROOT, 'src/'))) file = path.join(UPSTREAM, path.relative(ROOT, file));
    return file;
  }

  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const relative = path.relative(UPSTREAM, file);
    let source = file.startsWith(UPSTREAM + path.sep)
      ? adaptSource(relative, fs.readFileSync(file, 'utf8'))
      : fs.readFileSync(file, 'utf8');

    if (apply463 && file.startsWith(UPSTREAM + path.sep)) {
      source = adaptQualitySource(relative, adaptReliability(relative, adaptTouchLayout(relative, source)));
    }

    const mod = new vm.SourceTextModule(source, { context, identifier: file });
    modules.set(file, mod);
    return mod;
  }

  const root = new vm.SourceTextModule(`
    export * from './inkwave-public/src/core/ctx.js';
    export * from './inkwave-public/src/config.js';
    export * from './inkwave-public/src/game/actor.js';
    export * from './inkwave-public/src/game/weapons.js';
    export * from './inkwave-public/src/game/physics.js';
    export * from './inkwave-public/src/game/player.js';
    export * from './inkwave-public/src/core/shadowcache.js';
    export * as THREE from 'three';
    export * from './patches/splatoon3/runtime/movement.mjs';
    export * from './patches/splatoon3/runtime/weapons.mjs';
    export * from './patches/splatoon3/runtime/gear.mjs';
    export * from './patches/splatoon3/runtime/flow.mjs';
    export * from './patches/splatoon3/runtime/resources.mjs';
    export * from './patches/splatoon3/runtime/render.mjs';
  `, { context, identifier: path.join(ROOT, 'fixture.mjs') });

  await root.link((spec, from) => load(resolve(spec, from.identifier)));
  await root.evaluate();

  const api = { ...root.namespace };
  const { G, THREE, PLAYER, WEAPONS, SUB } = api;
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json'), 'utf8'));

  Object.assign(PLAYER, profile.player);
  Object.assign(SUB.bomb, profile.bomb);
  for (const [id, data] of Object.entries(profile.weapons)) {
    if (WEAPONS[id]) Object.assign(WEAPONS[id], data);
  }

  for (const install of ['installWeapons', 'installMovement', 'installGear', 'installFlow', 'installResources', 'installRendering']) {
    if (typeof api[install] === 'function') api[install](api, profile);
  }

  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.level = { blocks: [], groundHeight: () => 0 };
  G.time = 0;
  G.physics = {
    los: () => true,
    raycast: (_a, _b, _c, h) => { h.hit = false; return h; },
    segment: (_from, _to, hit) => { hit.hit = false; return hit; }
  };
  G.paint = { sample: () => 1, splat: () => 0 };
  G.match = { playing: () => true, canRespawn: () => false };
  G.camera = { position: new THREE.Vector3(0, 20, 0) };

  class Character {
    constructor() {
      this.root = { position: new THREE.Vector3(), rotation: {} };
      this.events = [];
    }
    trigger(...args) { this.events.push(args); }
    getMuzzle(out) { return out.copy(this.root.position).add(new THREE.Vector3(0, 1.05, 0.3)); }
    setVisible() {}
    setHurt() {}
    setWeapon() {}
  }

  function make(weapon = 'blaster', team = 0, isLocal = true) {
    const a = new api.Actor({ team, name: 'actor-' + team, weapon, CharacterClass: Character });
    a.isLocal = isLocal;
    a.grounded = true;
    a.ground.hit = true;
    a.ground.face = 0;
    a._spawnBarrier = () => {};
    a._finishFrame = () => {};
    a._integrate = () => {};
    a._nearCamera = () => false;
    return a;
  }

  return { ...api, make, apply463, profile };
}

test('S3 Ver. 11.3.0 pinned primary source constant: BLASTER_PLAYER_COLLISION_RADIUS is exactly 0.285', () => {
  assert.equal(BLASTER_PLAYER_COLLISION_RADIUS, 0.285);
  const mockBlast = { type: 'blast', size: 0.26 };
  assert.equal(blasterPlayerCollisionRadius(mockBlast), 0.285);

  const mockTagged = { type: 'blast', size: 0.26, s3PlayerRadius: 0.285 };
  assert.equal(blasterPlayerCollisionRadius(mockTagged), 0.285);

  const mockShooter = { type: 'shot', size: 0.15 };
  assert.equal(blasterPlayerCollisionRadius(mockShooter), 0.15);
});

test('fireBlaster exposes authoritative player collision radius of 0.285 while preserving visual size 0.26', async () => {
  const f = await createFixture({ apply463: true });
  const a = f.make('blaster', 0, true);
  const ps = new f.Projectiles(new f.THREE.Scene());
  f.G.projectiles = ps;

  ps.fireBlaster(a, a.weapon, 0);
  assert.equal(ps.list.length, 1);
  const p = ps.list[0];

  assert.equal(p.type, 'blast');
  assert.equal(p.size, 0.26, 'visual size must stay 0.26');
  assert.equal(p.s3PlayerRadius, 0.285, 'authoritative player radius must be 0.285');
  assert.equal(p.damage, 125, 'direct damage must stay 125');
  assert.equal(blasterPlayerCollisionRadius(p), 0.285);
});

test('grazing collision boundary: inside new 0.025 band hits with fix (125 dmg) and misses in negative baseline', async () => {
  for (const apply463 of [false, true]) {
    const f = await createFixture({ apply463 });
    const shooter = f.make('blaster', 0, true);
    const target = f.make('shooter', 1, false);
    target.invuln = 0;
    target.hp = 100;

    const oldBound = f.PLAYER.radius * 0.95 + 0.26;
    const newBound = f.PLAYER.radius * 0.95 + 0.285;
    const grazingOffset = (oldBound + newBound) / 2; // right in the center of the 0.025 band
    target.pos.set(grazingOffset, 0, 0.5);

    f.G.actors = [shooter, target];

    const ps = new f.Projectiles(new f.THREE.Scene());
    f.G.projectiles = ps;

    const p = ps._new();
    Object.assign(p, {
      type: 'blast',
      owner: shooter,
      team: shooter.team,
      age: 0,
      life: 1.0,
      straight: 99,
      radius: shooter.weapon.impactRadius,
      damage: shooter.weapon.directDamage,
      size: 0.26,
      s3PlayerRadius: apply463 ? 0.285 : undefined,
      vel: new f.THREE.Vector3(0, 0, 20),
      pos: new f.THREE.Vector3(0, 1.0, 0),
      prev: new f.THREE.Vector3(0, 1.0, 0),
      start: new f.THREE.Vector3(0, 1.0, 0)
    });
    ps._push(p);

    // Step by 1/20s (0.05s) -> moves from z=0 to z=1.0, passing target at z=0.5
    ps.update(0.05);

    if (apply463) {
      assert.equal(target.hp, 0, 'Fix: grazing band must register direct hit (125 damage splat)');
      assert.equal(ps.list.length, 0, 'projectile must be consumed on direct hit');
    } else {
      assert.equal(target.hp, 100, 'Negative baseline: grazing band must miss direct hit');
      assert.equal(ps.list.length, 1, 'projectile continues flight in negative baseline');
    }
  }
});

test('paths clearly inside old bound hit in both, and paths clearly outside new bound miss in both', async () => {
  for (const apply463 of [false, true]) {
    const f = await createFixture({ apply463 });
    const shooter = f.make('blaster', 0, true);
    const ps = new f.Projectiles(new f.THREE.Scene());
    f.G.projectiles = ps;

    const oldBound = f.PLAYER.radius * 0.95 + 0.26;
    const newBound = f.PLAYER.radius * 0.95 + 0.285;

    // Case 1: Clearly inside old bound (grazing - 0.05)
    {
      const targetInside = f.make('shooter', 1, false);
      targetInside.invuln = 0;
      targetInside.hp = 100;
      targetInside.pos.set(oldBound - 0.05, 0, 0.5);
      f.G.actors = [shooter, targetInside];

      const p1 = ps._new();
      Object.assign(p1, {
        type: 'blast', owner: shooter, team: shooter.team, age: 0, life: 1, straight: 99,
        damage: shooter.weapon.directDamage, size: 0.26, s3PlayerRadius: apply463 ? 0.285 : undefined,
        vel: new f.THREE.Vector3(0, 0, 20), pos: new f.THREE.Vector3(0, 1.0, 0),
        prev: new f.THREE.Vector3(0, 1.0, 0), start: new f.THREE.Vector3(0, 1.0, 0)
      });
      ps._push(p1);
      ps.update(0.05);
      assert.equal(targetInside.hp, 0, 'Both must register direct hit when inside old bound');
    }

    // Case 2: Clearly outside new bound (grazing + 0.05)
    {
      const targetOutside = f.make('shooter', 1, false);
      targetOutside.invuln = 0;
      targetOutside.hp = 100;
      targetOutside.pos.set(newBound + 0.05, 0, 0.5);
      f.G.actors = [shooter, targetOutside];

      const p2 = ps._new();
      Object.assign(p2, {
        type: 'blast', owner: shooter, team: shooter.team, age: 0, life: 1, straight: 99,
        damage: shooter.weapon.directDamage, size: 0.26, s3PlayerRadius: apply463 ? 0.285 : undefined,
        vel: new f.THREE.Vector3(0, 0, 20), pos: new f.THREE.Vector3(0, 1.0, 0),
        prev: new f.THREE.Vector3(0, 1.0, 0), start: new f.THREE.Vector3(0, 1.0, 0)
      });
      ps._push(p2);
      ps.update(0.05);
      assert.equal(targetOutside.hp, 100, 'Both must miss direct hit when outside new bound');
    }
  }
});

test('owner and remote shooter projectiles follow the identical collision path and envelope', async () => {
  const f = await createFixture({ apply463: true });
  const oldBound = f.PLAYER.radius * 0.95 + 0.26;
  const newBound = f.PLAYER.radius * 0.95 + 0.285;
  const grazingOffset = (oldBound + newBound) / 2;

  for (const isLocal of [true, false]) {
    const shooter = f.make('blaster', 0, isLocal);
    const target = f.make('shooter', 1, false);
    target.invuln = 0;
    target.hp = 100;
    target.pos.set(grazingOffset, 0, 0.5);
    f.G.actors = [shooter, target];

    const ps = new f.Projectiles(new f.THREE.Scene());
    f.G.projectiles = ps;

    ps.fireBlaster(shooter, shooter.weapon, 0);
    const p = ps.list[0];
    assert.equal(blasterPlayerCollisionRadius(p), 0.285);

    // Set deterministic test trajectory
    p.prev.set(0, 1.0, 0);
    p.pos.set(0, 1.0, 0);
    p.vel.set(0, 0, 20);

    ps.update(0.05);
    assert.equal(target.hp, 0, `Both local and remote shooters must splat target in grazing band (isLocal=${isLocal})`);
  }
});

test('terrain explosion and boss collision remain completely unaffected', async () => {
  const f = await createFixture({ apply463: true });
  const shooter = f.make('blaster', 0, true);
  const ps = new f.Projectiles(new f.THREE.Scene());
  f.G.projectiles = ps;

  // 1. Terrain impact test
  let terrainHitCalled = false;
  f.G.physics.segment = (_from, _to, hit) => {
    hit.hit = true;
    hit.point = new f.THREE.Vector3(0, 0, 0.5);
    hit.normal = new f.THREE.Vector3(0, 1, 0);
    terrainHitCalled = true;
    return hit;
  };

  const pTerrain = ps._new();
  Object.assign(pTerrain, {
    type: 'blast', owner: shooter, team: shooter.team, age: 0, life: 1, straight: 99,
    damage: shooter.weapon.directDamage, size: 0.26, s3PlayerRadius: 0.285,
    vel: new f.THREE.Vector3(0, 0, 20), pos: new f.THREE.Vector3(0, 0, 0),
    prev: new f.THREE.Vector3(0, 0, 0), start: new f.THREE.Vector3(0, 0, 0)
  });
  ps._push(pTerrain);

  f.G.actors = [shooter];
  ps.update(0.05);
  assert.ok(terrainHitCalled, 'Terrain segment hit must be evaluated');
  assert.equal(ps.list.length, 0, 'Terrain collision must trigger blast burst and consume projectile');

  // 2. Boss collision test
  let bossSegHitRadius = null;
  let bossHitCalled = false;
  f.G.physics.segment = (_from, _to, hit) => { hit.hit = false; return hit; };
  f.G.boss = {
    segHit: (_from, _to, r) => {
      bossSegHitRadius = r;
      return { point: new f.THREE.Vector3(0, 0, 0.5), normal: new f.THREE.Vector3(0, 0, -1), target: { hp: 500, id: 'boss' } };
    },
    hit: () => { bossHitCalled = true; },
    splash: () => {}
  };

  const pBoss = ps._new();
  Object.assign(pBoss, {
    type: 'blast', owner: shooter, team: shooter.team, age: 0, life: 1, straight: 99,
    damage: shooter.weapon.directDamage, size: 0.26, s3PlayerRadius: 0.285,
    vel: new f.THREE.Vector3(0, 0, 20), pos: new f.THREE.Vector3(0, 0, 0),
    prev: new f.THREE.Vector3(0, 0, 0), start: new f.THREE.Vector3(0, 0, 0)
  });
  ps._push(pBoss);

  ps.update(0.05);
  assert.ok(Math.abs(bossSegHitRadius - 0.26 * 0.6) < 1e-6, `Boss segHit must receive p.size * 0.6 (0.156), got ${bossSegHitRadius}`);
  assert.ok(bossHitCalled, 'Boss hit must be invoked');
  assert.equal(ps.list.length, 0, 'Boss collision must consume projectile');
});

test('direct damage is 125 and explosion damage bands / radii remain completely unchanged', async () => {
  const f = await createFixture({ apply463: true });
  const w = f.WEAPONS.blaster;
  assert.equal(w.directDamage, 125, 'direct damage must be 125');
  assert.equal(w.splashDamageMax, 70, 'splash max damage must be 70');
  assert.equal(w.splashDamageMin, 50, 'splash min damage must be 50');

  // Verify direct hit delivers exactly 125 damage
  const shooter = f.make('blaster', 0, true);
  const target = f.make('shooter', 1, false);
  target.invuln = 0;
  target.hp = 200; // extra HP to measure exact hit damage
  target.pos.set(0, 0, 0.5);
  f.G.actors = [shooter, target];

  const ps = new f.Projectiles(new f.THREE.Scene());
  f.G.projectiles = ps;
  ps.fireBlaster(shooter, shooter.weapon, 0);
  const p = ps.list[0];
  p.prev.set(0, 1.0, 0);
  p.pos.set(0, 1.0, 0);
  p.vel.set(0, 0, 20);

  ps.update(0.05);
  assert.equal(target.hp, 200 - 125, 'Direct hit must deduct exactly 125 damage');
});

test('timing, projectile speed, and ink consumption remain unchanged', async () => {
  const f = await createFixture({ apply463: true });
  const w = f.WEAPONS.blaster;
  const pw = f.profile.weapons.blaster;
  assert.equal(w.projSpeed, pw.projSpeed, 'blaster projectile speed must match profile');
  assert.equal(w.inkPerShot, pw.inkPerShot, 'blaster ink cost must match profile');
  assert.equal(w.fireInterval, pw.fireInterval, 'fire interval must match profile');
});


