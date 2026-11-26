import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as REAL_THREE from '../../../inkwave-public/vendor/three/build/three.module.js';

import {
  TRIZOOKA_ID,
  startTrizooka,
  stepTrizooka,
  disposeTrizooka,
  setTrizookaMatchCheck,
} from '../runtime/kit-trizooka.mjs';
import { PaintPacketNegotiation } from '../runtime/paint-packet-codec.mjs';
import { installWeapons } from '../runtime/weapons.mjs';
import { installWeaponEdgecases } from '../runtime/weapon-edgecases.mjs';
import { installAllSpecials, replaySpecial } from '../runtime/all-specials.mjs';
import { validDeviceDamageCause } from '../runtime/sub-resistance.mjs';
import {
  installKitBigBubbler,
  replayBigBubbler,
  bigBubblerRemoteDomes,
  clearBigBubblers,
} from '../runtime/kit-big-bubbler.mjs';
import { retireActorReplicas } from '../runtime/replica-retirement.mjs';
import { beginChargerWallDrop } from '../runtime/weapons-charger-flight.mjs';
import { installKitDefense } from '../runtime/kit-defense.mjs';

class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new Vec3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  length() { return Math.hypot(this.x, this.y, this.z); }
  lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  normalize() { const l = this.length(); if (l > 0) this.multiplyScalar(1 / l); return this; }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  crossVectors(a, b) {
    this.x = a.y * b.z - a.z * b.y;
    this.y = a.z * b.x - a.x * b.z;
    this.z = a.x * b.y - a.y * b.x;
    return this;
  }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  lerp(v, t) { this.x += (v.x - this.x) * t; this.y += (v.y - this.y) * t; this.z += (v.z - this.z) * t; return this; }
}

const mockTHREE = {
  Vector3: Vec3,
  Group: class { constructor() { this.children = []; this.userData = {}; this.position = new Vec3(); this.rotation = { x: 0, y: 0, z: 0 }; this.scale = new Vec3(1, 1, 1); this.visible = true; } add(c) { this.children.push(c); } remove(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); } traverse(fn) { fn(this); for (const c of this.children) c.traverse?.(fn); } },
  Mesh: class { constructor(g, m) { this.geometry = g; this.material = m; this.userData = {}; this.position = new Vec3(); this.rotation = { x: 0, y: 0, z: 0 }; this.scale = new Vec3(1, 1, 1); this.visible = true; this.children = []; } add(c) { this.children.push(c); } traverse(fn) { fn(this); } },
  SphereGeometry: class { dispose() {} },
  CylinderGeometry: class { dispose() {} },
  RingGeometry: class { dispose() {} },
  BoxGeometry: class { dispose() {} },
  TorusGeometry: class { dispose() {} },
  CircleGeometry: class { dispose() {} },
  PlaneGeometry: class { dispose() {} },
  MeshBasicMaterial: class { dispose() {} },
  MeshStandardMaterial: class { dispose() {} },
  MeshLambertMaterial: class { dispose() {} },
  DoubleSide: 2,
  AdditiveBlending: 2,
  Color: class { constructor(v = 0) { this.v = v; } clone() { return new mockTHREE.Color(this.v); } multiplyScalar() { return this; } lerp() { return this; } },
};

// ---------------------------------------------------------------------------
// P0-1: kit-trizooka.mjs
// ---------------------------------------------------------------------------
test('P0-1: disposeTrizooka clears trizooka specialActive without touching other specials', () => {
  const actor = {
    alive: true,
    special: 120,
    fireBuffer: 0.2,
    specialActive: { id: TRIZOOKA_ID },
    s3Trizooka: { active: true },
  };
  disposeTrizooka(actor);
  assert.equal(actor.s3Trizooka, null);
  assert.equal(actor.specialActive, null);

  const other = {
    specialActive: { id: 'crabTank' },
    s3Trizooka: { active: true },
  };
  disposeTrizooka(other);
  assert.equal(other.s3Trizooka, null);
  assert.deepEqual(other.specialActive, { id: 'crabTank' });
});

test('P0-1: stepTrizooka forced exits go through endTrizooka and clear special/fireBuffer/specialActive', () => {
  const cases = [
    { label: 'death', setup: (a) => { a.alive = false; }, matchPlaying: true },
    { label: 'superjump', setup: (a) => { a.superJumpState = { phase: 'air' }; }, matchPlaying: true },
    { label: 'match-end', setup: () => {}, matchPlaying: false },
  ];
  try {
    for (const c of cases) {
      setTrizookaMatchCheck(() => true);
      const actor = {
        alive: true,
        remote: false,
        superJumpState: null,
        weapon: { special: TRIZOOKA_ID },
        special: 150,
        fireBuffer: 0.15,
        specialActive: null,
        pos: new Vec3(),
        vel: new Vec3(),
        intent: {},
      };
      const state = startTrizooka(actor);
      assert.ok(state, `${c.label}: trizooka should start`);
      actor.specialActive = { id: TRIZOOKA_ID };
      c.setup(actor);
      setTrizookaMatchCheck(() => c.matchPlaying);
      const events = stepTrizooka(actor, 1 / 60, null, true);
      assert.deepEqual(events, [], `${c.label}: returns empty events`);
      assert.equal(actor.s3Trizooka, null, `${c.label}: s3Trizooka cleared`);
      assert.equal(actor.specialActive, null, `${c.label}: specialActive cleared`);
      assert.equal(actor.special, 0, `${c.label}: special cleared`);
      assert.equal(actor.fireBuffer, 0, `${c.label}: fireBuffer cleared`);
      assert.equal(state.active, false, `${c.label}: state marked inactive`);
      assert.equal(state.endReason, c.label, `${c.label}: endReason recorded`);
    }
  } finally {
    setTrizookaMatchCheck(() => true);
  }
});

// ---------------------------------------------------------------------------
// P0-2: paint-packet-codec.mjs
// ---------------------------------------------------------------------------
test('P0-2: packTick enforces 256-row online limit including custom toJSON and roundtrips <=256', () => {
  let nonce = 0;
  const make = () => new PaintPacketNegotiation(() => (++nonce).toString(16).padStart(32, '0'));
  const a = make(), b = make();
  a.sync('m1', 'a', ['a', 'b']);
  b.sync('m1', 'b', ['a', 'b']);
  const q = [];
  const send = (from) => (to, d) => { q.push([from, to, JSON.parse(JSON.stringify(d))]); return true; };
  a.announce(send('a'));
  b.announce(send('b'));
  while (q.length) {
    const [from, to, d] = q.shift();
    (to === 'a' ? a : b).control(from, d, send(to));
  }
  assert.equal(a.canEncode(), true);

  const row = (i) => [i / 60, 's', i * 0.003, -2.5, 8, 1.56, 0, 0.412, 0, 0, 0, 0, 0, 1, ['inkwave-paint-order-v1', 'm1', i, 0], i, i];

  const t256 = { k: 't', ts: 1, a: [], e: Array.from({ length: 256 }, (_, i) => row(i)) };
  const packed256 = a.packTick(t256);
  assert.ok(packed256.pe, '256 rows should compress');
  assert.deepEqual(b.acceptTick('a', JSON.parse(JSON.stringify(packed256))).e, t256.e);

  const t257 = { k: 't', ts: 2, a: [], e: Array.from({ length: 257 }, (_, i) => row(i)) };
  assert.equal(a.packTick(t257), t257, '257 rows must return original uncompressed tick');

  const t512 = { k: 't', ts: 3, a: [], e: Array.from({ length: 512 }, (_, i) => row(i)) };
  assert.equal(a.packTick(t512), t512, '512 rows must return original uncompressed tick');

  const tCustom = { k: 't', ts: 4, a: [], e: Array.from({ length: 257 }, (_, i) => row(i)) };
  tCustom.e.toJSON = function () { return this.slice(); };
  assert.equal(a.packTick(tCustom), tCustom, '257 rows with custom toJSON must return original tick');
});

// ---------------------------------------------------------------------------
// P0-3, P1-1, P1-2, P2-1: weapons.mjs
// ---------------------------------------------------------------------------
test('P0-3, P1-1, P1-2, P2-1: weapons.mjs guards, shooter reset, blaster optional chaining, no duplicate install', () => {
  class Actor {
    update() {}
    reset() {}
  }
  class WeaponRunner {
    constructor(a) { this.a = a; }
    reset() { return 'reset-ok'; }
    busy() { return false; }
    moveSpeed() { return 1; }
    spread() { return 1; }
    update() {}
    _shooter() {}
    _blaster() {}
    _roller() {}
    _charger() {}
    _slosher() {}
    _splatling() {}
    _dualies() {}
  }
  class Projectiles {
    constructor() { this.hits = []; this.blasterCalls = []; }
    _ballistic(_f, d) { return d; }
    fireBlaster(a, w, full) { this.blasterCalls.push({ a, w, full }); return 'blaster-ok'; }
    fireShooter() { return 'shooter-ok'; }
    fireRoller() {}
    fireCharger() {}
    fireSlosher() {}
    applyHit(attacker, victim, damage, weaponId, groupId) {
      this.hits.push({ attacker, victim, damage, weaponId, groupId });
      return 'accepted';
    }
    clear() {}
  }
  class Hit { constructor() { this.hit = false; this.point = new Vec3(); this.normal = new Vec3(0, 1, 0); } }

  const api = {
    Actor,
    WeaponRunner,
    Projectiles,
    PLAYER: { runSpeed: 6 },
    WEAPONS: {
      slosher: { id: 'slosher', kind: 'slosher' },
      blaster: { id: 'blaster', kind: 'blaster', spreadGround: 2 },
      shooter: { id: 'shooter', kind: 'shooter' },
    },
    G: { netm: null, paint: { splat() { return 0; } }, physics: { segment() { return { hit: false }; } } },
    THREE: mockTHREE,
    Hit,
  };
  // Profile with minimal completion table and omitted blaster -> blasterParam is undefined (tests P1-2)
  installWeapons(api, {
    weaponsFidelityCompletion: {
      schema: 1,
      worldUnitsPerSourceUnit: 0.4,
      weapons: {
        roller: { BodyParam: { CollisionParam: { Radius: 0.5, WidthHalf: 1.0 } } },
        slosher: { UnitGroupParam: { Unit: [] } },
      },
    },
  });

  // P1-1: WeaponRunner.prototype.reset clears all 5 shooter interrupt flags
  const runner = new WeaponRunner({ weapon: api.WEAPONS.shooter, form: 'human', grounded: true });
  runner.s3ShooterInterruptSub = 0.05;
  runner.s3ShooterInterruptSquid = 0.06;
  runner.s3ShooterInterruptJustArmed = true;
  runner.s3ShooterCancelMain = true;
  runner.s3ShooterStreamActive = true;
  assert.equal(runner.reset(), 'reset-ok');
  assert.equal(runner.s3ShooterInterruptSub, 0);
  assert.equal(runner.s3ShooterInterruptSquid, 0);
  assert.equal(runner.s3ShooterInterruptJustArmed, false);
  assert.equal(runner.s3ShooterCancelMain, false);
  assert.equal(runner.s3ShooterStreamActive, false);

  // P1-2: fireBlaster does not throw when blasterParam is undefined
  const proj = new Projectiles();
  const blasterActor = { weaponRunner: {} };
  assert.equal(proj.fireBlaster(blasterActor, api.WEAPONS.blaster, 3), 'blaster-ok');
  assert.equal(proj.blasterCalls.length, 1);

  // P0-3: Slosher applyHit rejects null attacker and null volleyOwnerKey without throwing
  const victim = { hp: 100, alive: true };
  assert.equal(proj.applyHit(null, victim, 50, 'slosher', 'sv:1'), 'rejected');
  assert.equal(proj.applyHit({ owner: 'x'.repeat(200), nid: 1 }, victim, 50, 'slosher', 'sv:1'), 'rejected');
  assert.equal(proj.hits.length, 0);
  assert.equal(proj._s3SlosherOwnerGroups?.has(null) ?? false, false);

  // Valid attacker still works
  const validAttacker = { nid: 7, owner: 'p1' };
  assert.equal(proj.applyHit(validAttacker, victim, 50, 'slosher', 'sv:1'), 'accepted');
  assert.equal(proj.hits.length, 1);

  // P2-1: installContactRecovery(api) is called only once in weapons.mjs
  const src = fs.readFileSync(new URL('../runtime/weapons.mjs', import.meta.url), 'utf8');
  const matches = src.match(/installContactRecovery\(api\)/g) || [];
  assert.equal(matches.length, 1, 'duplicate installContactRecovery(api) call must be removed');
});

// ---------------------------------------------------------------------------
// P1-3: weapon-edgecases.mjs
// ---------------------------------------------------------------------------
test('P1-3: dualies fast-path does not bypass gate.view when s3DualiesInterruptCancelMain is set', () => {
  const seenInputs = [];
  class Actor { update() {} }
  class WeaponRunner {
    constructor(a) { this.a = a; }
    reset() {}
    busy() { return false; }
    update(_dt, inp) { seenInputs.push({ raw: inp, fire: inp.fire }); }
    _dualies() {}
    _roller() {}
    _blaster() {}
    _slosher() {}
  }
  class Projectiles {
    _blastBurst() {}
    fireRoller() {}
    fireSlosher() {}
  }
  installWeaponEdgecases({
    Actor,
    WeaponRunner,
    Projectiles,
    PLAYER: { runSpeed: 6 },
    G: {},
    THREE: mockTHREE,
    Hit: class {},
  });

  const actor = { weapon: { kind: 'dualies' }, form: 'human' };
  const runner = new WeaponRunner(actor);
  const rawInput = { fire: true, sub: false, subReleased: false };

  // When cancelMain is active, fast-path must NOT fire: gate.view masks fire -> false
  runner.s3DualiesInterruptCancelMain = true;
  runner.update(1 / 60, rawInput);
  assert.notEqual(seenInputs[0].raw, rawInput, 'must pass gate.view proxy, not raw input');
  assert.equal(seenInputs[0].fire, false, 'fire must be suppressed by gate.view');

  // When cancelMain is false and no sub gating, fast-path preserves input identity
  runner.s3DualiesInterruptCancelMain = false;
  runner.update(1 / 60, rawInput);
  assert.equal(seenInputs[1].raw, rawInput, 'steady-state fast-path keeps raw input');
  assert.equal(seenInputs[1].fire, true);
});

// ---------------------------------------------------------------------------
// P1-4 & P2-2: all-specials.mjs
// ---------------------------------------------------------------------------
test('P1-4 & P2-2: ultraStamp Set retirement across all lifecycles and crabTank 8-step spike clamp', () => {
  const listeners = new Map();
  class Actor {
    _startSpecial() {
      this.stats.specials += 1;
      this.special = 0;
    }
    _updateSpecial() {}
    reset() {}
    splat() {}
    damage() {}
    canSuperJump() { return true; }
    superJump() { return true; }
    _updateSuperJump() {}
  }
  class Projectiles {
    constructor() { this.list = []; }
    update() {}
    _step() {}
    _blastBurst() {}
    applyHit() {}
    clear() {}
  }
  class NetMatch {
    constructor() { this.byNid = new Map(); }
    onLeave() {}
    _adopt() {}
    _remove() {}
  }

  const G = {
    time: 10,
    actors: [],
    scene: new mockTHREE.Group(),
    projectiles: null,
    paint: { splat() { return 0; } },
    physics: { segment() { return { hit: false }; }, groundY() { return 0; } },
  };
  const api = {
    Actor,
    Projectiles,
    NetMatch,
    G,
    THREE: mockTHREE,
    Hit: class { constructor() { this.hit = false; this.point = new Vec3(); this.normal = new Vec3(0, 1, 0); } },
    SPECIALS: {},
    SUB: {},
    WEAPONS: {},
    PLAYER: { runSpeed: 6 },
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(fn);
    },
    emit(event, payload) {
      for (const fn of listeners.get(event) || []) fn(payload);
    },
  };
  installAllSpecials(api);

  // P1-4: remote ultraStamp retired via retireActorReplicas even when rt.system is unset
  const remoteA = { remote: true, alive: true, team: 1, nid: 1, owner: 'peer1', pos: new Vec3(), yaw: 0 };
  G.actors.push(remoteA);
  replaySpecial(api, { id: 'ultraStamp', action: 'activate', actor: remoteA, activation: 1, seed: 1, duration: 7.5 });
  // Trigger retirement before G.projectiles exists
  retireActorReplicas(G, remoteA);
  // Also verify actor:removed, match:dispose, and Projectiles.clear paths do not throw and clear stamp state
  const remoteB = { remote: true, alive: true, team: 1, nid: 2, owner: 'peer2', pos: new Vec3(), yaw: 0 };
  const remoteC = { remote: true, alive: true, team: 1, nid: 3, owner: 'peer3', pos: new Vec3(), yaw: 0 };
  const remoteD = { remote: true, alive: true, team: 1, nid: 4, owner: 'peer4', pos: new Vec3(), yaw: 0 };
  G.actors.push(remoteB, remoteC, remoteD);
  replaySpecial(api, { id: 'ultraStamp', action: 'activate', actor: remoteB, activation: 2, seed: 2, duration: 7.5 });
  api.emit('actor:removed', { actor: remoteB });

  const proj = new Projectiles();
  G.projectiles = proj;
  replaySpecial(api, { id: 'ultraStamp', action: 'activate', actor: remoteC, activation: 3, seed: 3, duration: 7.5 });
  proj.clear();

  replaySpecial(api, { id: 'ultraStamp', action: 'activate', actor: remoteD, activation: 4, seed: 4, duration: 7.5 });
  api.emit('match:dispose', { match: { actors: G.actors } });

  // Verify no active stamp intercepts a probe after all 4 retirements
  const probe = { owner: { team: 2 }, team: 2, pos: new Vec3(0, 1, 0), prev: new Vec3(0, 1, -2), radius: 0.2 };
  assert.equal(api.allSpecialObjectCandidate(probe, probe.prev, probe.pos), null);

  // P2-2: Crab Tank sourceCarry loop capped at 8 steps and clamped on dt spike
  const crabActor = Object.assign(new Actor(), {
    alive: true,
    remote: false,
    team: 0,
    nid: 10,
    weapon: { special: 'crabTank' },
    special: 200,
    stats: { specials: 0 },
    pos: new Vec3(),
    vel: new Vec3(),
    yaw: 0,
    pitch: 0,
    intent: {},
    specialReady: () => true,
  });
  crabActor._startSpecial();
  const state = crabActor._s3AllSpecialState;
  assert.ok(state && state.id === 'crabTank', 'crabTank state should be active');
  const tBefore = state.t;
  crabActor._updateSpecial(1.0); // 60 frames spike
  const elapsed = state.t - tBefore;
  assert.ok(elapsed <= 8 / 60 + 1e-6, `crabTank elapsed (${elapsed}) must be <= 8/60`);
  assert.ok(elapsed >= 8 / 60 - 1e-6, `crabTank should advance exactly 8 steps, got ${elapsed * 60}`);
  assert.equal(state.sourceCarry, 0, 'excess sourceCarry must be clamped to 0 after hitting 8-step cap');
});

// ---------------------------------------------------------------------------
// P1-5: sub-resistance.mjs
// ---------------------------------------------------------------------------
test('P1-5: validDeviceDamageCause rejects unknown weapons without failing and accepts known catalog weapons', () => {
  const actor = { weapon: { id: 'shooter', kind: 'shooter' } };
  for (let i = 0; i < 200; i++) {
    assert.equal(validDeviceDamageCause(actor, `nonexistent_weapon_${i}`, 'ChargerFull', 'main'), false);
  }
  assert.equal(validDeviceDamageCause(actor, 'charger', 'ChargerFull', 'main'), true);
});

// ---------------------------------------------------------------------------
// P1-6: kit-big-bubbler.mjs
// ---------------------------------------------------------------------------
test('P1-6: kit-big-bubbler retires remote domes on retireActorReplicas, onLeave (before owner rewrite), _adopt, _remove', () => {
  const orderLog = [];
  class Actor {
    _startSpecial() {}
    reset() {}
  }
  class Projectiles {
    update() {}
    clear() {}
  }
  class NetMatch {
    constructor() {
      this.byNid = new Map();
      this.s = { hostId: 'host' };
    }
    onLeave(id) {
      orderLog.push({ op: 'onLeave', domesRemaining: bigBubblerRemoteDomes().length });
      for (const a of this.byNid.values()) if (a.owner === id) a.owner = this.s.hostId;
    }
    _adopt(actor) {
      orderLog.push({ op: '_adopt', domesRemaining: bigBubblerRemoteDomes().length, actor });
    }
    _remove(actor) {
      orderLog.push({ op: '_remove', domesRemaining: bigBubblerRemoteDomes().length, actor });
    }
  }

  const G = {
    time: 5,
    scene: new mockTHREE.Group(),
    actors: [],
    paint: { splat() { return 0; } },
  };
  const context = {
    Actor,
    Projectiles,
    NetMatch,
    G: { ...G, scene: new REAL_THREE.Group() },
    THREE: REAL_THREE,
    SPECIALS: {},
  };
  installKitBigBubbler(context, {});

  const deployRemote = (owner, serial) => {
    const res = replayBigBubbler('deploy', owner, {
      domeId: `remote-dome-${serial}`,
      serial,
      team: 1,
      t: 0,
      pos: [0, 0, 0],
      radius: 2.5,
      emitterY: 1,
      hp: 15360,
      fieldHp: 30720,
      ignited: true,
    });
    assert.equal(res.ok, true, `remote deploy ${serial} should be accepted`);
  };

  try {
    // 1. retireActorReplicas
    const a1 = { nid: 1, owner: 'p1', team: 1, remote: true, pos: new Vec3() };
    deployRemote(a1, 1);
    assert.equal(bigBubblerRemoteDomes().length, 1);
    retireActorReplicas(context.G, a1);
    assert.equal(bigBubblerRemoteDomes().length, 0);

    // 2. NetMatch.onLeave retires BEFORE original rewrites actor.owner = hostId
    const nm = new NetMatch();
    const a2 = { nid: 2, owner: 'p2', team: 1, remote: true, pos: new Vec3() };
    nm.byNid.set(2, a2);
    deployRemote(a2, 2);
    nm.onLeave('p2');
    assert.equal(orderLog[0].op, 'onLeave');
    assert.equal(orderLog[0].domesRemaining, 0, 'remote dome must be retired BEFORE onLeave rewrites owner');
    assert.equal(a2.owner, 'host');

    // 3. NetMatch._adopt retires BEFORE original
    const a3 = { nid: 3, owner: 'p3', team: 1, remote: true, pos: new Vec3() };
    deployRemote(a3, 3);
    nm._adopt(a3);
    assert.equal(orderLog[1].op, '_adopt');
    assert.equal(orderLog[1].domesRemaining, 0);

    // 4. NetMatch._remove retires BEFORE original
    const a4 = { nid: 4, owner: 'p4', team: 1, remote: true, pos: new Vec3() };
    deployRemote(a4, 4);
    nm._remove(a4);
    assert.equal(orderLog[2].op, '_remove');
    assert.equal(orderLog[2].domesRemaining, 0);

    // 5. Minimal context without NetMatch (and reused Actor without G) does not throw
    const minimalCtx = { Actor, Projectiles: class { update() {} clear() {} }, THREE: REAL_THREE, SPECIALS: {} };
    assert.doesNotThrow(() => installKitBigBubbler(minimalCtx, {}));
  } finally {
    clearBigBubblers('test-cleanup');
  }
});

// ---------------------------------------------------------------------------
// P2-3: weapons-charger-flight.mjs
// ---------------------------------------------------------------------------
test('P2-3: beginChargerWallDrop skips grates for both numeric block indices and object mocks', () => {
  const raw = {
    WallDropMoveParam: {
      FallPeriodFirstFrameMin: 10,
      FallPeriodFirstFrameMax: 10,
      FallPeriodSecondFrame: 5,
      FallPeriodLastFrameMin: 10,
      FallPeriodLastFrameMax: 10,
      FallPeriodFirstTargetSpeed: 0.05,
      FallPeriodSecondTargetSpeed: 0.1,
      FreeGravityType: 'value_0_008',
    },
    WallDropCollisionPaintParam: {
      PaintRadiusShock: 1.0,
      PaintRadiusShockMinCharge: 0.5,
      PaintRadiusShockMaxCharge: 1.0,
      PaintRadiusFall: 0.8,
      PaintRadiusFallMinCharge: 0.4,
      PaintRadiusFallMaxCharge: 0.8,
      PaintRadiusGround: 0.9,
    },
  };
  const api = {
    THREE: mockTHREE,
    Hit: class {},
    G: {
      paint: { splat() { return 0; } },
      physics: { level: { blocks: [{ grate: true }, { grate: false }] } },
    },
  };
  const job = { ghost: false, owner: {}, team: 0, charge: 1, seed: 0.5 };
  const baseHit = { hit: true, point: new Vec3(0, 2, 0), normal: new Vec3(1, 0, 0), face: 0 };

  assert.equal(beginChargerWallDrop({}, job, { ...baseHit, block: 0 }, raw, api), false, 'numeric grate block skipped');
  assert.equal(beginChargerWallDrop({}, job, { ...baseHit, block: { grate: true } }, raw, api), false, 'object grate mock skipped');
  assert.equal(beginChargerWallDrop({}, job, { ...baseHit, block: 1, grate: true }, raw, api), false, 'hit.grate skipped');
  assert.equal(beginChargerWallDrop({}, job, { ...baseHit, block: 1 }, raw, api), true, 'solid numeric block starts wall drop');
});

// ---------------------------------------------------------------------------
// P2-4: kit-defense.mjs
// ---------------------------------------------------------------------------
test('P2-4: kit-defense tracks spent damage per candidate object when domeId is undefined', () => {
  const onHitCounts = { a: 0, b: 0 };
  const objA = { id: 'wall-A' };
  const objB = { id: 'wall-B' };
  const victimA = { pos: new Vec3(1, 0, 0), tag: 'A' };
  const victimB = { pos: new Vec3(2, 0, 0), tag: 'B' };

  class Projectiles {
    _blastBurst(p, origin) {
      this.applyHit(p.owner, victimA, 50, 'blaster');
      this.applyHit(p.owner, victimB, 50, 'blaster');
      this.applyHit(p.owner, victimA, 50, 'blaster'); // duplicate hit on same barrier
    }
    _explodeBomb() {}
    applyHit() { throw new Error('should have been intercepted by barrier'); }
    kitBarrierCandidate(probe, _origin, end) {
      if (end.x === 1) {
        return { object: objA, distance: 1, onHit: () => { onHitCounts.a += probe.damage; } };
      }
      return { object: objB, distance: 1, onHit: () => { onHitCounts.b += probe.damage; } };
    }
  }
  const api = {
    Projectiles,
    WEAPONS: { blaster: { splashBands: [[5, 50]] } },
    SUB: { bomb: { damageBands: [[5, 30]] } },
  };
  installKitDefense(api);

  const system = new Projectiles();
  const attacker = { id: 'att' };
  system._blastBurst({ owner: attacker, team: 0, kind: 'blaster', ghost: false }, new Vec3(0, 0, 0));

  assert.equal(onHitCounts.a, 50, 'barrier A should take 50 once (not double-counted)');
  assert.equal(onHitCounts.b, 50, 'barrier B should independently take 50 (not collide on undefined domeId)');
});
