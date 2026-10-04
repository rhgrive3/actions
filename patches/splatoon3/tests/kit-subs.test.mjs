import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KIT_SUBS, SUCTION, CURLING, kitSubFor, registerKitSubs, installKitSubs, curlingChargeFraction, curlingThrowSpeed, curlingBlastParams, resolveSubForThrow, stepSubBomb } from '../runtime/kit-subs.mjs';

const near = (actual, expected, msg) => assert.ok(Math.abs(actual - expected) < 1e-9, `${msg || ''} ${actual} ~ ${expected}`);

// A stand-in with the real native surface: throwBomb allocates and pushes its own
// record, throwVelocity is the native one, and _explodeBomb owns the blast.
function harness() {
  const log = [];
  class Projectiles {
    constructor() { this.bombs = []; this.scene = { add() {}, remove() {} }; this.bombGeo = {}; this.bombCapGeo = {}; this.bombMatCache = new Map(); }
    _bombMat() { return { clone: () => ({ emissiveIntensity: 0 }) }; }
    throwVelocity(a, speed) { return { x: 0, y: speed, z: 0, copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; } }; }
    throwBomb(a) {
      const b = this.bombs[this.bombs.length - 1];
      const rec = { kind: 'bomb', owner: a, team: a.team, pos: { x: 0, y: 1.35, z: 0, copy(o) { this.x = o.x; this.y = o.y; this.z = o.z; } },
        vel: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; }, dot(n) { return this.x * n.x + this.y * n.y + this.z * n.z; },
          addScaledVector(n, s) { this.x += n.x * s; this.y += n.y * s; this.z += n.z * s; },
          copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; }, clone() { return { ...this }; } },
        fuse: -1, age: 0, beepT: 0 };
      this.bombs.push(rec);
      log.push(['throw', this.bombs.length]);
      return b;
    }
    _explodeBomb(b) {
      // record what the native blast actually reads, while the scoped swap is live
      log.push(['explode', b.s3Sub?.id, SUB.bomb.paintRadius, SUB.bomb.radius, SUB.bomb.damageMax]);
      return 'exploded';
    }
    updateArc(a, show) { log.push(['arc', SUB.bomb.throwSpeed]); return 'arc'; }
  }
  class WeaponRunner { constructor(a) { this.a = a; } reset() { return 'reset'; } }
  const SUB = { bomb: { id: 'bomb', name: 'Splat Bomb', inkCost: 70, throwSpeed: 67.2, fuse: 1.0, radius: 7.0, damageMax: 180, damageMin: 30, paintRadius: 2.7 } };
  const api = { SUB, Projectiles, WeaponRunner, G: {}, profile: {} };
  installKitSubs(api, {});
  return { api, Projectiles, WeaponRunner, SUB, log };
}

function actorFor(weapon, SUB, hold = 0) {
  const a = { weapon: { sub: weapon }, team: 0, s3SUB: SUB, ink: 100 };
  const { WeaponRunner } = harnessClass;
  const r = { a, s3SubHold: hold };
  Object.setPrototypeOf(r, WeaponRunner.prototype);
  a.weaponRunner = r;
  return a;
}
let harnessClass = {};

test('suction spec: only 11.3.0 primary values, omissions left explicitly unknown', () => {
  assert.equal(SUCTION.inkRecoverStop, 1);
  assert.equal(SUCTION.throwSpeed, 67.2);
  assert.deepEqual(SUCTION.throwSpeedTiers, { low: 67.2, mid: 84, high: 100.8 });
  assert.equal(SUCTION.paintRadius, 5);
  assert.equal(SUCTION.radius, 8);
  assert.equal(SUCTION.damageInnerDistance, 4.6);
  assert.equal(SUCTION.damageMax, 180);
  assert.equal(SUCTION.damageMin, 30);
  assert.equal(SUCTION.splashSatellites, 15);
  assert.equal(SUCTION.guideHitCollision, 'EnemyOffFenceOn');
  // Omitted in 11.3.0 — never back-filled from Splat Bomb and never called sourced.
  assert.equal(SUCTION.fuse, null);
  assert.equal(SUCTION.fuseStatus, 'unknown-omitted');
  assert.equal(SUCTION.gravity, null);
  assert.equal(SUCTION.gravityStatus, 'unknown-omitted');
  assert.equal(SUCTION.inkCost, null);
  assert.equal(SUCTION.inkCostStatus, 'unknown-omitted');
  // Functional fallbacks are explicitly labelled calibrated, not extracted.
  assert.equal(SUCTION.fuseFallback, 1.0);
  assert.equal(SUCTION.fuseFallbackStatus, 'calibrated');
  assert.equal(SUCTION.inkCostFallback, 70);
});

test('curling spec is extracted, chargeable, and uses SpawnSpeedZMaxCharge for held charge', () => {
  assert.equal(CURLING.inkCost, 65);
  assert.equal(CURLING.maxChargeTime, 1);
  assert.equal(CURLING.burstFrame, 3.5);
  assert.equal(CURLING.inkRecoverStop, 70 / 60);
  assert.equal(CURLING.inkRecoverStopMaxCharge, 0.5);
  assert.equal(CURLING.damageMax, 180);
  assert.equal(CURLING.damageMin, 30);
  assert.equal(CURLING.minCharge.paintRadius, 2.133);
  assert.equal(CURLING.maxCharge.paintRadius, 5);
  assert.equal(CURLING.contactJump.maxBoundNum, 3);
  assert.equal(CURLING.flyGravity, 57.6);
  // The gear ladder is kept but is explicitly not the charge curve.
  assert.equal(CURLING.chargeSpeedCurveStatus, 'calibrated');
  near(CURLING.throwSpeedTiers.low, 24);
  near(CURLING.throwSpeedTiers.mid, 27.6);
  near(CURLING.throwSpeedTiers.high, 31.2);
});

test('charge speed spans tap 0.40 -> SpawnSpeedZMaxCharge 0.20, not the gear tiers', () => {
  near(curlingThrowSpeed(0), 24, 'tap speed = Low 0.40*60');
  near(curlingThrowSpeed(1), 12, 'full charge = SpawnSpeedZMaxCharge 0.20*60');
  near(curlingThrowSpeed(0.5), 18);
  // never climbs toward the gear Mid/High values
  assert.ok(curlingThrowSpeed(0.5) < CURLING.throwSpeedTiers.mid);
});

test('charge fraction clamps to the pinned MaxChargeFrame window', () => {
  assert.equal(curlingChargeFraction(0), 0);
  assert.equal(curlingChargeFraction(0.5), 0.5);
  assert.equal(curlingChargeFraction(1), 1);
  assert.equal(curlingChargeFraction(99), 1);
  assert.equal(curlingChargeFraction(0.5, SUCTION), 0);
});

test('curling blast interpolates between the two pinned charge tables', () => {
  const lo = curlingBlastParams(0), hi = curlingBlastParams(1), mid = curlingBlastParams(0.5);
  assert.deepEqual([lo.paintRadius, lo.radius, lo.damageOuterDistance], [2.133, 5, 5]);
  assert.deepEqual([hi.paintRadius, hi.radius, hi.damageOuterDistance], [5, 8, 8]);
  near(mid.paintRadius, (2.133 + 5) / 2);
  near(mid.radius, 6.5);
  near(mid.trailRadius, (1.075 + 1.29) / 2);
});

test('per-weapon selection follows the equipped weapon, never the generic default', () => {
  const SUB = { bomb: { id: 'bomb', inkCost: 70, throwSpeed: 67.2 } };
  registerKitSubs(SUB, {});
  assert.equal(kitSubFor({ sub: 'suction' }, SUB).id, 'suction');
  assert.equal(kitSubFor({ sub: 'curling' }, SUB).id, 'curling');
  assert.equal(kitSubFor({ sub: 'bomb' }, SUB).id, 'bomb');
  assert.equal(kitSubFor({ sub: 'slam' }, SUB).id, 'bomb');
  assert.equal(kitSubFor(undefined, SUB).id, 'bomb');
});

test('registry registration is additive and preserves existing entries', () => {
  const existing = { id: 'bomb', inkCost: 70, throwSpeed: 67.2 };
  const SUB = { bomb: existing };
  registerKitSubs(SUB, {});
  assert.equal(SUB.bomb, existing);
  assert.equal(SUB.bomb.inkCost, 70);
  assert.equal(SUB.suction.id, 'suction');
  assert.equal(SUB.curling.id, 'curling');
  registerKitSubs(SUB, {});
  assert.equal(SUB.suction.id, 'suction');
});

test('a profile override of an omitted field is recorded as calibrated', () => {
  const SUB = {};
  registerKitSubs(SUB, { kitSubs: { suction: { fuse: 0.9 } } });
  assert.equal(SUB.suction.fuse, 0.9);
  assert.equal(SUB.suction.fuseStatus, 'calibrated');
  assert.equal(SUB.suction.gravityStatus, 'unknown-omitted');
  // the shared template must stay clean so a re-register re-derives the same state
  assert.equal(SUCTION.fuse, null);
  assert.equal(SUCTION.fuseStatus, 'unknown-omitted');
});

test('resolveSubForThrow keeps omitted fields honest and marks the calibrated fuse', () => {
  const r = resolveSubForThrow({ weapon: { sub: 'suction' } }, 0, {});
  assert.equal(r.spec.id, 'suction');
  assert.equal(r.charge, 0);
  assert.equal(r.fuse, 1.0);
  assert.equal(r.fuseStatus, 'calibrated');
  assert.equal(r.inkCost, 70);
  assert.equal(r.inkCostStatus, 'calibrated');
  assert.equal(r.throwSpeed, 67.2);
  const c = resolveSubForThrow({ weapon: { sub: 'curling' } }, 1, {});
  assert.equal(c.fuse, 3.5);
  assert.equal(c.fuseStatus, 'extracted');
  assert.equal(c.inkCostStatus, 'extracted');
  near(c.throwSpeed, 12);
  assert.equal(c.paintRadius, 5);
});

test('composed throw calls the native throwBomb and attaches per-bomb state', () => {
  const { Projectiles, SUB, log } = harness();
  harnessClass = { WeaponRunner: Object.getPrototypeOf(harness().Projectiles) && null };
  const p = new Projectiles();
  const a = { weapon: { sub: 'curling' }, team: 0, weaponRunner: { s3SubHold: 1 }, ink: 100 };
  p.throwBomb(a, 1);
  assert.equal(log[0][0], 'throw', 'the native throw must run and allocate the bomb');
  assert.equal(p.bombs.length, 1);
  const b = p.bombs[0];
  assert.equal(b.s3Sub.id, 'curling');
  assert.equal(b.s3Charge, 1);
  assert.equal(b.s3Resolved.fuse, 3.5);
  assert.equal(b.s3Mode, 'flight');
  assert.equal(b.s3Bounces, 0);
  // the scoped swap must be undone
  assert.equal(SUB.bomb.throwSpeed, 67.2);
  assert.equal(SUB.bomb.paintRadius, 2.7);
});

test('scoped swap is restored even when the native call throws', () => {
  const { Projectiles, SUB } = harness();
  const p = new Projectiles();
  p.throwBomb = () => { throw new Error('native failure'); };
  const a = { weapon: { sub: 'curling' }, team: 0, weaponRunner: {}, ink: 100 };
  assert.throws(() => p.throwBomb(a, 0), /native failure/);
  assert.equal(SUB.bomb.throwSpeed, 67.2);
  assert.equal(SUB.bomb.paintRadius, 2.7);
  assert.equal(SUB.bomb.radius, 7.0);
});

test('explosion uses the bombs own numbers and leaves the registry untouched', () => {
  const { Projectiles, SUB, log } = harness();
  const p = new Projectiles();
  const a = { weapon: { sub: 'curling' }, team: 0, weaponRunner: { s3SubHold: 1 }, ink: 100 };
  p.throwBomb(a, 1);
  p._explodeBomb(p.bombs[0]);
  const blast = log.find((e) => e[0] === 'explode');
  assert.deepEqual(blast, ['explode', 'curling', 5, 8, 180], 'the native blast read this bomb s own numbers');
  // the scoped swap must be fully undone afterwards
  assert.equal(SUB.bomb.paintRadius, 2.7);
  assert.equal(SUB.bomb.radius, 7.0);
  assert.equal(SUB.bomb.damageMax, 180);
});

test('an untagged bomb keeps the plain native explosion path', () => {
  const { Projectiles, SUB, log } = harness();
  const p = new Projectiles();
  p._explodeBomb({ s3Resolved: undefined });
  assert.deepEqual(log[0], ['explode', undefined, 2.7, 7, 180], 'no sub numbers are substituted');
});

test('suction bomb sticks to a wall, zeroes velocity and arms a counted fuse', () => {
  const resolved = resolveSubForThrow({ weapon: { sub: 'suction' } }, 0, {});
  const b = { s3Resolved: resolved, s3Sub: SUCTION, s3Mode: 'flight', fuse: -1,
    pos: { x: 0, y: 0, z: 0, copy(o) { this.x = o.x; this.y = o.y; this.z = o.z; }, addScaledVector(n, s) { this.x += n.x * s; this.y += n.y * s; this.z += n.z * s; } },
    vel: { set(x, y, z) { this.x = x; this.y = y; this.z = z; }, dot() { return 0; }, addScaledVector() {}, copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; } } };
  const wall = { hit: true, point: { x: 3, y: 1, z: 0 }, normal: { x: 1, y: 0, z: 0 } };
  assert.equal(stepSubBomb(b, wall, 1 / 60, {}), false);
  assert.equal(b.s3Mode, 'stuck');
  assert.equal(b.s3StuckOn, 'wall');
  assert.deepEqual([b.vel.x, b.vel.y, b.vel.z], [0, 0, 0], 'a stuck bomb has no velocity');
  assert.equal(b.fuse, 1.0);
  // fuse counts down and reports the burst
  assert.equal(stepSubBomb(b, null, 0.5, {}), false);
  assert.equal(stepSubBomb(b, null, 0.6, {}), true);
});

test('suction bomb also adheres to a ceiling', () => {
  const resolved = resolveSubForThrow({ weapon: { sub: 'suction' } }, 0, {});
  const mk = () => ({ s3Resolved: resolved, s3Sub: SUCTION, s3Mode: 'flight', fuse: -1,
    pos: { copy() {}, addScaledVector() {} }, vel: { set() {}, dot: () => 0, addScaledVector() {}, copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; } } });
  const b = mk();
  stepSubBomb(b, { hit: true, point: { x: 0, y: 3, z: 0 }, normal: { x: 0, y: -1, z: 0 } }, 1 / 60, {});
  assert.equal(b.s3Mode, 'stuck');
  assert.equal(b.s3StuckOn, 'ceiling');
});

test('curling bomb reflects off a wall then rolls, paints a trail and bursts', () => {
  const charge = 1;
  const resolved = resolveSubForThrow({ weapon: { sub: 'curling' } }, charge, {});
  let area = 0;
  const painted = [];
  const paint = { splat: (pt, r, team) => { painted.push({ r, team }); area += 2; return 2; } };
  const owner = { addTurf: (v) => { area += v; } };
  const b = { s3Resolved: resolved, s3Sub: CURLING, s3Mode: 'flight', fuse: -1, team: 0, owner,
    pos: { x: 0, y: 0.5, z: 0, copy(o) { this.x = o.x; this.y = o.y; this.z = o.z; }, addScaledVector(n, s) { this.x += n.x * s; this.y += n.y * s; this.z += n.z * s; } },
    vel: { x: 10, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; }, dot(n) { return this.x * n.x + this.y * n.y + this.z * n.z; },
      addScaledVector(n, s) { this.x += n.x * s; this.y += n.y * s; this.z += n.z * s; }, copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; } } };
  const ctx = { paint };
  // wall reflection
  stepSubBomb(b, { hit: true, point: { x: 2, y: 0.5, z: 0 }, normal: { x: 1, y: 0, z: 0 } }, 1 / 60, ctx);
  assert.equal(b.s3Mode, 'flight', 'a wall bounce does not start rolling');
  assert.equal(b.s3Bounces, 1);
  // floor contact starts the roll and the burst window
  stepSubBomb(b, { hit: true, point: { x: 2, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 } }, 1 / 60, ctx);
  assert.equal(b.s3Mode, 'rolling');
  assert.equal(b.vel.y, 0);
  // the same step that starts the roll also ticks the fuse once (1/60 s)
  near(b.fuse, 3.5 - 1 / 60, 'burst fuse = BurstFrame 210/60');
  const before = area;
  stepSubBomb(b, null, 1 / 60, ctx);
  assert.ok(painted.length >= 1, 'the roll must paint a trail');
  assert.ok(area > before, 'trail turf is credited to the owner');
  near(painted[0].r, 1.29, 'full-charge trail radius');
  // burst window expires
  assert.equal(stepSubBomb(b, null, 2, ctx), false);
  assert.equal(stepSubBomb(b, null, 2, ctx), true);
});

test('curling bounce count is bounded by the pinned ContactJumpPanel max', () => {
  const resolved = resolveSubForThrow({ weapon: { sub: 'curling' } }, 1, {});
  const b = { s3Resolved: resolved, s3Sub: CURLING, s3Mode: 'rolling', fuse: 99, team: 0,
    pos: { copy() {}, addScaledVector() {} }, vel: { x: 5, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; }, dot: () => 0, addScaledVector() {}, copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; } } };
  const wall = { hit: true, point: { x: 0, y: 0, z: 0 }, normal: { x: 1, y: 0, z: 0 } };
  b.s3Mode = 'flight';
  stepSubBomb(b, wall, 1 / 60, {});
  for (let i = 0; i < 3; i++) stepSubBomb(b, wall, 1 / 60, {});
  assert.equal(b.s3Bounces, 4);
  assert.equal(b.s3BounceExhausted, true);
});

test('the per-bomb step hook is exposed for the parent adapter and is idempotent', () => {
  const { api, Projectiles, log } = harness();
  assert.equal(typeof api.S3_SUB_BOMB_STEP, 'function');
  const p = new Projectiles();
  assert.equal(typeof p.updateArc, 'function');
  assert.equal(api.SUB.suction.throwSpeed, 67.2);
  assert.equal(api.SUB.curling.inkCost, 65);
  assert.equal(api.SUB.bomb.throwSpeed, 67.2);
  const arcA = { weapon: { sub: 'bomb' }, weaponRunner: { s3SubHold: 0 } };
  p.updateArc(arcA, true);
  assert.deepEqual(log[0], ['arc', 67.2], 'the generic bomb keeps its own arc speed');
});

test('install requires the real authority and refuses to double-wrap', () => {
  assert.throws(() => installKitSubs({}, {}), /SUB, Projectiles and WeaponRunner/);
  // the same api installed twice: the second call must not wrap the prototypes again
  const { api, Projectiles, log } = harness();
  const before = log.length;
  installKitSubs(api, {});
  const p = new Projectiles();
  p.updateArc({ weapon: { sub: 'bomb' }, weaponRunner: {} }, true);
  assert.equal(log.length, before + 1, 'exactly one wrapper chain remains');
});
