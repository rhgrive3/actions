import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
import { adaptNetworkSource } from '../../network-replication/adapter.mjs';

// Exercise the actual production installer in one VM realm. The older
// source-fixture helper intentionally omits installWeaponsFidelity by default.
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.resolve(process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public'));
let runtime;
async function production() {
  if (runtime) return runtime;
  const context = vm.createContext({ console, performance, URL });
  const modules = new Map();
  const compose = (rel, code) => adaptNetworkSource(rel,
    adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code)))));
  const load = requested => {
    let file = requested.startsWith(path.join(SRC, 'patches') + path.sep)
      ? path.join(ROOT, path.relative(SRC, requested)) : requested;
    if (file.startsWith(path.join(ROOT, 'src') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    const source = fs.readFileSync(file, 'utf8');
    const module = new vm.SourceTextModule(file.startsWith(SRC + path.sep)
      ? compose(path.relative(SRC, file), source) : source,
      { context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    modules.set(file, module);
    return module;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { NetMatch } from './inkwave-public/src/net/netmatch.js';
    export { applyFidelityProjectileHit, advanceFidelityProjectile, fidelityPlayerCollisionRadius, fidelityProjectileTargets } from './patches/splatoon3/runtime/weapons-fidelity.mjs';
  `, { context, identifier: path.join(ROOT, 'issue-305-production-entry.mjs') });
  await entry.link((specifier, from) => load(specifier === 'three'
    ? path.join(SRC, 'vendor/three/build/three.module.js')
    : specifier.startsWith('three/addons/')
      ? path.join(SRC, 'vendor/three/jsm', specifier.slice('three/addons/'.length))
      : path.resolve(path.dirname(from.identifier), specifier)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = entry.namespace.install(profile);
  const { G, THREE } = api;
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.scene = new THREE.Scene();
  G.level = { blocks: [], groundHeight: () => 0 };
  G.physics = {
    los: () => true,
    raycast: (_o, _d, _r, hit) => { hit.hit = false; return hit; },
    segment: (from, to, hit) => { hit.hit = false; hit.dist = from.distanceTo(to); return hit; },
  };
  G.paint = { sample: () => 1, splat: () => 0 };
  G.match = { playing: () => true };
  G.camera = { position: new THREE.Vector3() };
  G.actors = [];
  G.time = 0;
  G.projectiles = new api.Projectiles(G.scene);
  runtime = { ...api, ...entry.namespace, profile };
  return runtime;
}

function actor(f, { vertical = false, nid, local = true } = {}) {
  // Keep game-object construction light while exercising the actual installed
  // WeaponRunner, Projectiles, fidelity module and NetMatch implementations.
  const a = {
    team: 0, name: `#305 roller ${nid ?? 'local'}`, weapon: f.WEAPONS.roller,
    pos: new f.THREE.Vector3(), vel: new f.THREE.Vector3(), aimDir: new f.THREE.Vector3(0, 0, 1),
    aimPoint: new f.THREE.Vector3(0, 1, 10), yaw: 0, aimPitch: 0,
    isLocal: local, remote: !local, grounded: !vertical, ink: 100, lastFire: 0,
    character: { trigger() {}, _s3CancelRollerFlick() {} }, _nearCamera: () => false,
  };
  if (nid !== undefined) a.nid = nid;
  a.weaponRunner = new f.WeaponRunner(a);
  f.G.actors = [a];
  return a;
}

function productionActor(f) {
  class CharacterStub {
    constructor() { this.events = []; }
    _owner() { return this.actor; }
    trigger(...event) { this.events.push(event); }
    setWeapon() {}
    setVisible() {}
    setHurt() {}
  }
  const a = new f.Actor({ team: 0, name: '#305 production Actor timing', weapon: 'roller',
    CharacterClass: CharacterStub, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  a.character.actor = a;
  a.isLocal = true; a.remote = false; a.grounded = true;
  a.ground.hit = true; a.ground.face = 0;
  f.G.actors = [a];
  return a;
}

function runnerTick(f, a, dt, input) {
  f.G.time += dt;
  a.weaponRunner.update(dt, input);
}

function releaseSwing(f, a, dt) {
  runnerTick(f, a, dt, { fire: true, firePressed: true });
  let frames = 0;
  while (a.weaponRunner.flick >= 0 && frames++ < 180)
    runnerTick(f, a, dt, { fire: false, firePressed: false });
  assert.ok(frames < 180, 'native Roller windup releases');
}

function ownedShots(f, a) { return f.G.projectiles.list.filter(p => p.owner === a); }

test('native depleted-to-empty follow-up stays rejected at 30/90/120 Hz in both swing modes', async () => {
  const f = await production();
  for (const vertical of [false, true]) for (const hz of [30, 90, 120]) {
    f.G.projectiles.clear();
    f.G.netm = null;
    const dt = 1 / hz, a = actor(f, { vertical }), r = a.weaponRunner;
    a.ink = 4;
    releaseSwing(f, a, dt);
    const first = ownedShots(f, a);
    assert.equal(first.length, 3, `${vertical ? 'vertical' : 'horizontal'} first depletion at ${hz} Hz`);
    assert.equal(a.ink, 0);
    assert.equal(r.s3RollerAttack?.depleted, true);

    // Reproduce the reported edge: the previous depleted state still exists,
    // and the next input is delivered with no more than one render step left.
    let guard = 0;
    while (r.cooldown > dt + 1e-10 && guard++ < 180)
      runnerTick(f, a, dt, { fire: false, firePressed: false });
    assert.ok(guard < 180, 'cooldown reaches its final render step');
    assert.ok(r.cooldown > 0 && r.cooldown <= dt + 1e-10, `cooldown=${r.cooldown}, dt=${dt}`);
    assert.equal(r.s3RollerAttack?.depleted, true, 'prior depleted record is still present at the edge');

    runnerTick(f, a, dt, { fire: true, firePressed: true });
    assert.equal(r.flick, -1, 'zero ink must not start another native windup');
    for (let i = 0; i < Math.ceil((vertical ? a.weapon.verticalWindup : a.weapon.flickWindup) / dt) + 2; i++)
      runnerTick(f, a, dt, { fire: false, firePressed: false });
    assert.equal(ownedShots(f, a).length, 3, 'no second free full-output volley');
    assert.equal(a.ink, 0);
    r.reset();
    assert.equal(r.s3RollerAttack, null);
    assert.equal(a.character.s3RollerFlick, null);
  }
});

test('native recProj packets preserve depleted collision chronology for local and remote H/V swings', async () => {
  const f = await production();
  const recorder = () => new f.NetMatch({ myId: 'owner', isHost: false }, { map: 'test', difficulty: 'normal' });
  for (const vertical of [false, true]) {
    f.G.projectiles.clear();
    const nm = recorder(); f.G.netm = nm;
    const local = actor(f, { vertical, nid: 0, local: true });
    local.ink = 4;
    releaseSwing(f, local, 1 / 60);
    const localShots = ownedShots(f, local);
    const packets = nm.out.filter(e => e[1] === 'p');
    assert.equal(localShots.length, 3);
    assert.equal(packets.length, 3);
    assert.ok(packets.every(e => e.length === 32), 'native recProj tuple keeps its current composed event length');

    const remote = actor(f, { vertical, nid: 1, local: false });
    for (const packet of packets) f.G.projectiles.ghostProjectile(remote, packet);
    const ghosts = ownedShots(f, remote);
    assert.equal(ghosts.length, localShots.length);
    for (let i = 0; i < localShots.length; i++) {
      const p = localShots[i], ghost = ghosts[i];
      assert.equal(packetSize(packets[i]), Math.round(p.size * 100) / 100);
      assert.ok(p.size < .12, 'local depleted packet carries a reduced player radius');
      assert.deepEqual(ghost.fidelityPlayerCollision, p.fidelityPlayerCollision);
      assert.deepEqual(ghost.fidelityFieldCollision, p.fidelityFieldCollision);
      assert.equal(ghost.fidelityDepleted, true, 'existing rounded packet size identifies the depleted slot');
      for (const age of [0, 1 / 60, 3 / 60, .1, .25]) {
        p.age = ghost.age = age;
        p.fidelityPrevAge = ghost.fidelityPrevAge = age;
        assert.equal(f.fidelityPlayerCollisionRadius(ghost), f.fidelityPlayerCollisionRadius(p), `age ${age}`);
      }
      assert.equal(ghost.damage, 0);
      assert.equal(ghost.ghost, true);
    }

    // The same production swept actor-collision routine sees local and packet
    // ghosts on the same first-contact tick for a target placed on their path.
    const p = localShots[0], ghost = ghosts[0];
    const victim = { team: 1, alive: true, pos: p.start.clone().addScaledVector(p.vel, 3 / 60), smoothY: 0, form: 'kid', nid: 2 };
    f.G.actors = [local, remote, victim];
    const firstContact = round => {
      round.age = 0; round.fidelityPrevAge = 0;
      round.pos.copy(round.start); round.prev.copy(round.start);
      for (let frame = 0; frame < 24; frame++) {
        if (f.fidelityProjectileTargets(f.G.projectiles, round).includes(victim)) return frame;
        f.advanceFidelityProjectile(round, 1 / 60);
      }
      return null;
    };
    const localContact = firstContact(p), ghostContact = firstContact(ghost);
    assert.notEqual(localContact, null);
    assert.equal(ghostContact, localContact, 'remote visual collision chronology matches local');

    let hitCalls = 0, paintCalls = 0;
    f.G.projectiles.applyHit = () => { hitCalls++; };
    f.G.paint.splat = () => { paintCalls++; return 1; };
    f.applyFidelityProjectileHit(f.G.projectiles, ghost, victim, 999, ghost.pos.clone());
    f.G.projectiles._impact(ghost, { point: ghost.pos.clone(), normal: new f.THREE.Vector3(0, 1, 0) });
    assert.equal(hitCalls, 0, 'ghost cannot apply authoritative damage');
    assert.equal(paintCalls, 0, 'ghost cannot apply authoritative paint');

    // Clear/reuse the actual projectile pool, then reconstruct a normal volley
    // through a fresh NetMatch recorder to cover the reconnect path.
    f.G.projectiles.clear();
    const next = recorder(); f.G.netm = next;
    const full = actor(f, { vertical, nid: 3, local: true });
    full.ink = full.weapon.flickInk;
    releaseSwing(f, full, 1 / 60);
    const normal = ownedShots(f, full), normalPackets = next.out.filter(e => e[1] === 'p');
    assert.equal(normal.length, vertical ? 5 : 13);
    const nextRemote = actor(f, { vertical, nid: 4, local: false });
    for (const packet of normalPackets) f.G.projectiles.ghostProjectile(nextRemote, packet);
    const normalGhosts = ownedShots(f, nextRemote);
    for (let i = 0; i < (vertical ? normal.length : 12); i++) {
      assert.equal(normalGhosts[i].fidelityPlayerCollision.initRadius, normal[i].fidelityPlayerCollision.initRadius);
      assert.equal(normalGhosts[i].fidelityFieldCollision.initRadius, normal[i].fidelityFieldCollision.initRadius);
    }
    assert.ok(normalGhosts.every(p => !p.fidelityDepleted), 'pooled depletion state does not leak into reconnect packets');
  }
  f.G.netm = null;
});

function packetSize(event) { return event[15]; }

test('production Actor keeps the merged squid-start 34F horizontal origin', async () => {
  const f = await production(), a = productionActor(f);
  f.G.projectiles.clear(); f.G.netm = null;
  a.form = 'squid';
  a.intent.squid = true;
  a.intent.fire = true;
  a._surface = () => { a.groundTeam = 1; return { isSquid: false, onEnemy: false }; };
  a._updateClimb = () => {};
  a._horizontal = () => {};
  a._integrate = () => {};
  a._spawnBarrier = () => {};
  a._finishFrame = () => {};
  a.ground.hit = true; a.ground.face = 0;
  a.ink = 100;
  let shotTick = null;
  for (let tick = 0; tick < 50; tick++) {
    a.intent.fire = tick === 0;
    f.G.time += 1 / 60;
    a.update(1 / 60);
    if (ownedShots(f, a).length) { shotTick = tick + 1; break; }
  }
  assert.equal(shotTick - 1, 34);
  assert.equal(ownedShots(f, a).length, 13, 'squid-start edge keeps the normal horizontal volley');
  assert.equal(a.ink, 91.5, 'normal swing retains its configured full cost');
  assert.equal(a.weaponRunner.s3RollerAttack?.depleted, false);

  f.G.projectiles.clear();
  a.weaponRunner.reset();
  a.form = 'kid'; a.intent.fire = false; a.intent.squid = false;
  a._prevIntent.fire = false; a._prevIntent.squid = false;
  a.lastFire = f.profile.resources.inkRefillDelay + 1;
  a.ink = 0;
  let refillFrames = 0;
  while (a.ink === 0 && refillFrames++ < 60) {
    f.G.time += 1 / 60;
    a.update(1 / 60);
  }
  assert.ok(refillFrames > 1 && refillFrames < 60, 'native recover stop expires before refill');
  assert.equal(a.ink, f.profile.resources.inkRefillKid / 60, 'existing native refill rate resumes after reset and recover stop');
  assert.equal(a.weaponRunner.s3RollerAttack, null);

  a.weaponRunner.reset(); a.ink = 0;
  runnerTick(f, a, 1 / 60, { fire: true, firePressed: true });
  assert.equal(a.weaponRunner.flick, -1, 'zero ink remains a true empty boundary after reset');
  assert.equal(a.weaponRunner.s3RollerAttack, null);
  assert.equal(ownedShots(f, a).length, 0);
});
