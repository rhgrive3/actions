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
import { adaptIssue482 } from '../issue-482-adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');

async function createFixture({ apply482 = true } = {}) {
  const context = vm.createContext({ console, performance, Math: Object.create(Math) });
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

    if (apply482 && file.startsWith(UPSTREAM + path.sep)) {
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
    export * from './inkwave-public/src/net/netmatch.js';
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

  const api = { ...root.namespace }, { G, THREE, PLAYER, WEAPONS, SUB, SPECIALS } = api;
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json'), 'utf8'));
  Object.assign(PLAYER, profile.player);
  Object.assign(SUB.bomb, profile.bomb);
  for (const [id, data] of Object.entries(profile.weapons)) Object.assign(WEAPONS[id], data);
  for (const install of ['installWeapons', 'installMovement', 'installGear', 'installFlow', 'installResources', 'installRendering']) {
    api[install](api, profile);
  }

  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.level = { blocks: [], groundHeight: () => 0, spawnPads: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 10 }] };
  G.time = 0;
  G.physics = {
    los: () => true,
    raycast: (_a, _b, _c, h) => { h.hit = false; return h; },
    groundProbe: () => ({ hit: true, y: 0, normal: new THREE.Vector3(0, 1, 0) })
  };
  G.paint = { sample: () => 0, splat: () => 0 }; // default dry ground
  G.match = { playing: () => true };

  class Character {
    constructor() { this.root = { position: new THREE.Vector3(), rotation: {} }; this.events = []; }
    trigger(...args) { this.events.push(args); }
    getMuzzle(out) { return out.copy(this.root.position).add(new THREE.Vector3(0, 1.05, .3)); }
    setVisible() {}
    setHurt() {}
    setWeapon() {}
  }

  function make(team = 0, name = 'fixture') {
    const a = new api.Actor({ team, name, weapon: 'shooter', CharacterClass: Character });
    a.grounded = true;
    a.ground.hit = true;
    a.ground.face = 0;
    a._spawnBarrier = () => {};
    a._finishFrame = () => {};
    a._integrate = () => {};
    return a;
  }

  function advance(actor, seconds, dt = 1 / 60) {
    const steps = Math.round(seconds / dt);
    for (let i = 0; i < steps; i++) {
      G.time += dt;
      actor.update(dt);
    }
  }

  function triggerWaterDeath(actor, dt = 1 / 60) {
    G.level.groundHeight = () => -Infinity;
    actor.pos.y = -2.0;
    actor.grounded = false;
    G.time += dt;
    actor.update(dt);
  }

  return { ...api, profile, make, advance, triggerWaterDeath };
}

// ---------------------------------------------------------------------------
// Test 1: Adapter transforms
// ---------------------------------------------------------------------------
test('issue-482 adapter transforms Actor and NetMatch with exact connections', () => {
  const actorSrc = fs.readFileSync(path.join(UPSTREAM, 'src/game/actor.js'), 'utf8');
  const netSrc = fs.readFileSync(path.join(UPSTREAM, 'src/net/netmatch.js'), 'utf8');

  const patchedActor = adaptIssue482('src/game/actor.js', actorSrc);
  assert.ok(patchedActor.includes('this.lastAttackerHitAge = 99;'));
  assert.ok(patchedActor.includes('this.lastAttackerHitAge = 0;'));
  assert.ok(patchedActor.includes('this.lastAttackerHitAge = (this.lastAttackerHitAge ?? 99) + dt;'));
  assert.ok(patchedActor.includes('this.lastAttacker && (this.lastAttackerHitAge ?? this.lastDamage) < 4'));

  const patchedNet = adaptIssue482('src/net/netmatch.js', netSrc);
  assert.ok(patchedNet.includes('a.lastAttackerHitAge = (a.lastAttackerHitAge ?? 99) + dt;'));
  assert.ok(patchedNet.includes('a.lastAttackerHitAge = 99;'));

  // Non-matching file is passed through untouched
  assert.equal(adaptIssue482('src/config.js', 'const x = 1;'), 'const x = 1;');
});

// ---------------------------------------------------------------------------
// Test 2: Negative control (Unpatched reproduces bug)
// ---------------------------------------------------------------------------
test('negative control: unpatched INKWAVE revives stale attacker after >4s via enemy ink clamp', async () => {
  const f = await createFixture({ apply482: false });
  const attacker = f.make(0, 'attacker');
  const victim = f.make(1, 'victim');

  // A deals 30 damage to B
  victim.damage(30, attacker);
  assert.equal(victim.lastAttacker, attacker);

  // 5 seconds pass on dry ground (>4s threshold)
  f.G.paint.sample = () => 0; // dry ground
  f.advance(victim, 5.0);
  assert.ok(victim.lastDamage >= 4.99, `lastDamage should be >= 4.99, got ${victim.lastDamage}`);

  // B steps in enemy ink for 1 frame: unpatched resources clamp lastDamage to 0.4
  f.G.paint.sample = () => 1; // enemy ink for team 1
  f.advance(victim, 1 / 60);
  assert.ok(victim.lastDamage <= 0.5, `unpatched lastDamage was clamped: ${victim.lastDamage}`);

  // B falls into water: unpatched checks lastDamage < 4 and incorrectly credits attacker
  f.triggerWaterDeath(victim);
  assert.equal(victim.alive, false);
  assert.equal(attacker.stats.splats, 1, 'negative control: stale attacker incorrectly credited in unpatched code');
});

// ---------------------------------------------------------------------------
// Test 3: Root actual acceptance (Patched separates attacker hit age)
// ---------------------------------------------------------------------------
test('root acceptance: patched INKWAVE rejects stale attacker after >4s despite enemy ink contact', async () => {
  const f = await createFixture({ apply482: true });
  const attacker = f.make(0, 'attacker');
  const victim = f.make(1, 'victim');

  let splattedEvent = null;
  const unbind = f.on('splatted', ev => { splattedEvent = ev; });

  try {
    victim.damage(30, attacker);
    assert.equal(victim.lastAttacker, attacker);
    assert.equal(victim.lastAttackerHitAge, 0);

    // 5 seconds pass on dry ground
    f.G.paint.sample = () => 0;
    f.advance(victim, 5.0);
    assert.ok(victim.lastAttackerHitAge >= 4.99);
    assert.ok(victim.lastDamage >= 4.99);

    // B steps into enemy ink: recovery timer lastDamage is clamped, but hitAge is NOT clamped
    f.G.paint.sample = () => 1;
    f.advance(victim, 1 / 60);
    assert.ok(victim.lastDamage <= 0.5, 'recovery timer was clamped for HP delay');
    assert.ok(victim.lastAttackerHitAge >= 5.0, `hitAge must stay independent: ${victim.lastAttackerHitAge}`);

    // B falls into water
    f.triggerWaterDeath(victim);
    assert.equal(victim.alive, false);
    assert.equal(attacker.stats.splats, 0, 'stale attacker must NOT be credited');
    assert.ok(splattedEvent, 'splatted event must fire');
    assert.equal(splattedEvent.attacker, null, 'splatted event attacker must be null');
    assert.equal(splattedEvent.cause, 'water');
  } finally {
    unbind();
  }
});

// ---------------------------------------------------------------------------
// Test 4: Extended delays (10s, 30s, 60s)
// ---------------------------------------------------------------------------
test('extended delays: waiting 10s, 30s, and 60s before enemy-ink contact yields same non-revival', async () => {
  for (const delay of [10.0, 30.0, 60.0]) {
    const f = await createFixture({ apply482: true });
    const attacker = f.make(0, 'attacker');
    const victim = f.make(1, 'victim');

    victim.damage(25, attacker);
    f.G.paint.sample = () => 0;
    f.advance(victim, delay);

    // Step in enemy ink
    f.G.paint.sample = () => 1;
    f.advance(victim, 0.2);

    // Fall in water
    f.triggerWaterDeath(victim);
    assert.equal(victim.alive, false);
    assert.equal(attacker.stats.splats, 0, `delay ${delay}s: attacker must not be credited`);
  }
});

// ---------------------------------------------------------------------------
// Test 5: Recent attributable hit (<4s) IS correctly credited
// ---------------------------------------------------------------------------
test('recent attributable hit within 4s window is correctly credited on water death', async () => {
  const f = await createFixture({ apply482: true });
  const attacker = f.make(0, 'attacker');
  const victim = f.make(1, 'victim');

  let splattedEvent = null;
  const unbind = f.on('splatted', ev => { splattedEvent = ev; });

  try {
    victim.damage(40, attacker);
    // 2.0s pass (<4s)
    f.G.paint.sample = () => 0;
    f.advance(victim, 2.0);

    // Step in enemy ink for 0.5s (total 2.5s < 4s)
    f.G.paint.sample = () => 1;
    f.advance(victim, 0.5);
    assert.ok(victim.lastAttackerHitAge < 4.0, `hitAge should be ~2.5s: ${victim.lastAttackerHitAge}`);

    // Fall in water
    f.triggerWaterDeath(victim);
    assert.equal(victim.alive, false);
    assert.equal(attacker.stats.splats, 1, 'recent attacker within 4s must be credited');
    assert.equal(splattedEvent?.attacker, attacker);
    assert.equal(splattedEvent?.cause, 'water');
  } finally {
    unbind();
  }
});

// ---------------------------------------------------------------------------
// Test 6: Attacker replacement (hit from C replaces A)
// ---------------------------------------------------------------------------
test('attribution replacement: hit from C replaces stale A', async () => {
  const f = await createFixture({ apply482: true });
  const attackerA = f.make(0, 'attackerA');
  const attackerC = f.make(0, 'attackerC');
  const victim = f.make(1, 'victim');

  // A hits victim
  victim.damage(20, attackerA);
  f.advance(victim, 2.0);

  // C hits victim
  victim.damage(20, attackerC);
  assert.equal(victim.lastAttacker, attackerC);
  assert.equal(victim.lastAttackerHitAge, 0);

  // 1.5s pass (total 3.5s from A, 1.5s from C)
  f.advance(victim, 1.5);

  // Step in enemy ink
  f.G.paint.sample = () => 1;
  f.advance(victim, 0.2);

  // Fall in water
  f.triggerWaterDeath(victim);
  assert.equal(attackerA.stats.splats, 0, 'A must not receive splat');
  assert.equal(attackerC.stats.splats, 1, 'C must receive splat as most recent attacker');
});

// ---------------------------------------------------------------------------
// Test 7: HP recovery suppression remains fully intact
// ---------------------------------------------------------------------------
test('HP recovery suppression: enemy ink still blocks recovery independently of hit age', async () => {
  const f = await createFixture({ apply482: true });
  const victim = f.make(1, 'victim');
  victim.hp = 50;
  victim.lastDamage = 99; // previously eligible for regen
  victim.invuln = 0;

  // While in enemy ink, hp must not recover
  f.G.paint.sample = () => 1; // enemy ink
  f.advance(victim, 1.0);
  assert.ok(victim.hp <= 50, 'hp must not recover while on enemy ink');

  // Leave enemy ink onto own ink
  f.G.paint.sample = () => 2; // own ink for team 1
  const hpOnExit = victim.hp;
  const regenDelay = f.profile.resources.regenDelay || 1.3;

  // Advance 0.5s (with 0.4s clamp, total lastDamage is 0.9s, which is well below 1.3s regenDelay)
  f.advance(victim, 0.5);
  assert.equal(victim.hp, hpOnExit, 'hp must not recover before regenDelay');

  // Advance another 1.0s (total 1.5s, exceeding 1.3s regenDelay)
  f.advance(victim, 1.0);
  assert.ok(victim.hp > hpOnExit, 'hp recovers after regenDelay elapsed on own ink');
});

// ---------------------------------------------------------------------------
// Test 8: Deterministic stepping across 30Hz, 60Hz, 120Hz
// ---------------------------------------------------------------------------
test('deterministic timing: 4.0s expiration boundary holds across 30Hz, 60Hz, and 120Hz', async () => {
  for (const hz of [30, 60, 120]) {
    const dt = 1 / hz;

    // Sub-test A: exactly before 4.0s (e.g. 3.9s) -> credited
    {
      const f = await createFixture({ apply482: true });
      const attacker = f.make(0, `atk_${hz}`);
      const victim = f.make(1, `vic_${hz}`);
      victim.damage(30, attacker);
      f.advance(victim, 3.8, dt);
      f.G.paint.sample = () => 1;
      f.advance(victim, 0.1, dt); // total 3.9s
      f.triggerWaterDeath(victim, dt);
      assert.equal(attacker.stats.splats, 1, `${hz}Hz: hit at 3.9s must be credited`);
    }

    // Sub-test B: exactly after 4.0s (e.g. 4.1s) -> NOT credited
    {
      const f = await createFixture({ apply482: true });
      const attacker = f.make(0, `atk_${hz}`);
      const victim = f.make(1, `vic_${hz}`);
      victim.damage(30, attacker);
      f.advance(victim, 4.0, dt);
      f.G.paint.sample = () => 1;
      f.advance(victim, 0.1, dt); // total 4.1s
      f.triggerWaterDeath(victim, dt);
      assert.equal(attacker.stats.splats, 0, `${hz}Hz: hit at 4.1s must NOT be credited`);
    }
  }
});

// ---------------------------------------------------------------------------
// Test 9: Respawn resets attacker recency
// ---------------------------------------------------------------------------
test('respawn resets lastAttacker and lastAttackerHitAge', async () => {
  const f = await createFixture({ apply482: true });
  const attacker = f.make(0, 'attacker');
  const victim = f.make(1, 'victim');

  victim.damage(30, attacker);
  assert.equal(victim.lastAttacker, attacker);
  assert.equal(victim.lastAttackerHitAge, 0);

  // Respawn victim
  victim.respawn();
  assert.equal(victim.lastAttacker, null, 'respawn must clear lastAttacker');
  assert.equal(victim.lastAttackerHitAge, 99, 'respawn must reset lastAttackerHitAge to expired');

  // Immediately falling into water after respawn must not credit anyone
  f.triggerWaterDeath(victim);
  assert.equal(attacker.stats.splats, 0, 'attacker must not be credited across respawn');
});


test('remote presentation advances native hit age once per frame and respawn clears attribution', async () => {
  const f = await createFixture();
  const net = new f.NetMatch({ myId: 'viewer', isHost: false }, {});
  const victim = f.make(1, 'remote-victim'), attacker = f.make(0, 'attacker');
  victim.remote = true;
  victim.lastAttacker = attacker;
  victim.lastAttackerHitAge = 3.9;
  victim.lastDamage = 0.4;
  victim.net = {
    ready: true, prevGrounded: true, prevVy: 0, err: new f.THREE.Vector3(),
    cur: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, aimYaw: 0, aimPitch: 0,
      f: 1 | 16 | 524288, hp: victim.hp, ink: victim.ink, sp: victim.special, turf: 0,
      ch: 0, lock: 0, tp: 0 }
  };
  const hp = victim.hp, damage = victim.stats.damage, kills = attacker.stats.kills;
  for (let i = 0; i < 12; i++) {
    net.applyRemote(victim, 1 / 60);
    assert.ok(Math.abs(victim.lastAttackerHitAge - (3.9 + (i + 1) / 60)) < 1e-9);
  }
  assert.ok(victim.lastAttackerHitAge > 4);
  assert.equal(victim.lastAttacker, attacker);
  assert.equal(victim.hp, hp);
  assert.equal(victim.stats.damage, damage);
  assert.equal(attacker.stats.kills, kills);
  net._remoteRespawn(victim);
  assert.equal(victim.lastAttacker, null);
  assert.equal(victim.lastAttackerHitAge, 99);
  victim.lastAttacker = attacker;
  victim.lastAttackerHitAge = 0;
  victim.reset();
  assert.equal(victim.lastAttacker, null);
  assert.equal(victim.lastAttackerHitAge, 99);
});
