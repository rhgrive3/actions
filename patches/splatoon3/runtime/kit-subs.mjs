// Splatoon 3 sub weapons for the published INKWAVE runtime.
//
// Authority stays exactly where issue 177 and the parent advisory place it:
//   - sub release  : real `WeaponRunner.update` (`const bomb = SUB.bomb`)
//   - sub object   : real `Projectiles.throwBomb` / `_updateBombs` / `_explodeBomb`
// Native names confirmed against inkwave-public: the runner is `a.weaponRunner`
// and `throwBomb(a)` allocates and pushes the bomb record itself.
//
// There is no second projectile list, collision pass, paint pass or damage pass
// here, and no extra full-list iteration: `stepSubBomb` is called once per bomb
// from inside the native `_updateBombs` loop (hook `S3_SUB_BOMB_STEP` below).
//
// Per-bomb state lives on the thrown record (`b.s3Sub`, `b.s3Resolved`,
// `b.s3Mode`, `b.s3Fuse`). Nothing is resolved from a global `SUB.bomb` per
// frame. The only temporary rebinding is a scoped numeric swap around a single
// native call, restored in a `finally` even if the call throws.
//
// Provenance: Leanny/splat3 @ 7280ff9cde8bb1c5dcef46c700c326471584d2e6,
// data/parameter/1130. Conversions are those already recorded in
// profile.calibration.unitConversions:
//   framesToSeconds /60 · perFrameVelocityToPerSecond *60
//   perFrameGravityToPerSecondSquared *3600 · rawDamageToHP /10
//   inkFractionToTankPoints *100
//
// Honesty rule applied throughout: a field the 11.3.0 tables omit is never
// back-filled from another weapon's table and then presented as sourced. Omitted
// fields are `null` + `unknown-omitted`. Where gameplay needs a usable value,
// an explicit *functional calibration* is supplied and labelled `calibrated`,
// never `extracted`.

const FRAME = 1 / 60;
const rawDamage = (v) => (v == null ? null : v / 10);
const frames = (v) => (v == null ? null : v * FRAME);
const perSecond = (v) => (v == null ? null : v * 60);
const tankPoints = (v) => (v == null ? null : v * 100);

// ---- Suction Bomb ------------------------------------------------------------
// data/parameter/1130/weapon/WeaponBombSuction.game__GameParameterTable.json
// sha256 a64c24c3167e5a7ec201cf8377fbeb3f6f8870ecd0be4549c50b9c3c57e840f7
export const SUCTION = {
  id: 'suction',
  name: 'Suction Bomb',
  mode: 'stick',
  chargeable: false,

  // WeaponParam is `spl__WeaponSubParam` and carries ONLY InkRecoverStop in 11.3.0.
  inkCost: null,
  inkCostStatus: 'unknown-omitted',
  // Functional calibration: INKWAVE's existing tank model charges 70 points per
  // sub release. Not a Nintendo 11.3.0 figure — labelled calibrated, not sourced.
  inkCostFallback: 70,
  inkRecoverStop: frames(60),
  inkRecoverStopStatus: 'extracted',

  throwSpeed: perSecond(1.12),   // MoveParam.SpawnSpeedZSpecUp.Low
  throwSpeedStatus: 'extracted',
  // SpawnSpeedZSpecUp Low/Mid/High is the gear (Special Power Up) ladder. It is
  // deliberately NOT used as the charge curve; Curling owns its charge mapping.
  throwSpeedTiers: { low: perSecond(1.12), mid: perSecond(1.4), high: perSecond(1.68) },

  // MoveParam.FlyGravity is omitted for Suction in 11.3.0 (Splat Bomb states 0.016).
  gravity: null,
  gravityStatus: 'unknown-omitted',
  // MoveParam.BurstFrame is omitted for Suction in 11.3.0.
  fuse: null,
  fuseStatus: 'unknown-omitted',
  // Functional calibration: a stuck bomb needs a finite countdown or it never
  // detonates. Matches the existing INKWAVE bomb fuse; NOT a Nintendo figure.
  fuseFallback: 1.0,
  fuseFallbackStatus: 'calibrated',
  warningRestFrame: frames(60),  // MoveParam.WarningSERestFrame
  guideHitCollision: 'EnemyOffFenceOn',   // MoveParam.GuideHitCollisionType
  geyserAddSpeedPerImpact: 0.15,          // spl__BulletInformImpactControlForGeyserParam

  // BlastParam
  radius: 8.0,                    // DistanceDamage outer distance
  crossPaintRadius: 2.5,
  crossPaintCheckLength: 2.5,
  paintRadius: 5.0,
  paintOffsetY: 0.45,
  damageOffsetY: 0.6,
  damageMax: rawDamage(1800),      // 180 HP
  damageMin: rawDamage(300),       // 30 HP
  damageInnerDistance: 4.6,
  damageOuterDistance: 8.0,
  splashSatellites: 15,           // SplashAroundParam.Num
  splashSatelliteRadius: 1.116,
  splashOffsetY: 0.5,
  splashPitchMin: 5,
  splashPitchMax: 45,
  splashVelocityMin: 0.48,
  splashVelocityMax: 0.64,
  knockBack: { accel: 700, bias: 0.8, distance: 12.0 },
  playerVelocity: { xRate: 1.6, yMax: 0.32, yPlusRate: 4.0, zRate: 2.0 },

  // Functional calibration: Suction Bomb adheres to walls and ceilings, unlike the
  // existing Splat Bomb which arms only on near-vertical normals. Not a 11.3.0 field.
  sticksToWalls: true,
  sticksToCeilings: true,
  status: 'extracted+calibrated',
};

// ---- Curling Bomb ------------------------------------------------------------
// data/parameter/1130/weapon/WeaponBombCurling.game__GameParameterTable.json
// sha256 aa1d1c0a13d13c4f5d236524fb0452ccf6bfadf736274cb207181cb75b8fe815
export const CURLING = {
  id: 'curling',
  name: 'Curling Bomb',
  mode: 'roll',
  chargeable: true,

  inkCost: tankPoints(0.65),      // spl__WeaponBombCurlingParam.InkConsume
  inkCostStatus: 'extracted',
  inkRecoverStop: frames(70),
  inkRecoverStopMaxCharge: frames(30),
  inkRecoverStopStatus: 'extracted',
  maxChargeTime: frames(60),      // MaxChargeFrame
  maxChargeStatus: 'extracted',
  chargeFrameBlastRate: 2.0,

  // MoveParam.SpawnSpeedZSpecUp Low 0.40 is the tap speed; SpawnSpeedZMaxCharge
  // 0.20 is the explicit held-charge ceiling. The Mid/High tiers are the gear
  // ladder and are NOT interpolated here.
  throwSpeed: perSecond(0.4),
  throwSpeedStatus: 'extracted',
  throwSpeedMaxCharge: perSecond(0.2),   // MoveParam.SpawnSpeedZMaxCharge
  throwSpeedTiers: { low: perSecond(0.4), mid: perSecond(0.46), high: perSecond(0.52) },
  // The 11.3.0 tables state both endpoints but no interpolation curve between
  // them. Linear is our reading, not a Nintendo-exported field.
  chargeSpeedCurve: 'linear',
  chargeSpeedCurveStatus: 'calibrated',

  spawnSpeedY: perSecond(0.12),
  spawnSpeedYMaxCharge: perSecond(0.12),
  flyGravity: 0.016 * 3600,        // MoveParam.FlyGravity
  groundGravity: 0.0016 * 3600,    // MoveParam.GroundGravity
  gravityStatus: 'extracted',
  burstFrame: frames(210),         // rolling burst window before the blast
  burstStatus: 'extracted',
  warningAnimRestFrame: frames(90),
  baseSpeedMinCharge: 0.22,
  baseSpeedComeOverRate: 0.92,
  baseSpeedComeUnderRate: 0.96,
  contactJump: { maxBoundNum: 3, addSpeedOneBoundRate: 0.5, addSpeedPerImpact: 0.05167 },
  contactDash: { addSpeedPerImpact: 0.22807, addSpeedSequenceFrameRate: 0.95 },
  damageDirectHit: rawDamage(200),
  damageDirectSpanSecond: 0.6667,
  paintCheckHeight: 2.0,
  paintRadiusBias: 0.25,
  paintBurstRadiusBias: 0.65,
  paintRadiusMinCharge: 1.075,     // rolling trail radius
  paintRadiusMaxCharge: 1.29,
  guideHitCollision: 'EnemyOnFenceOn',
  knockBack: { accel: 350, bias: 0.0, degree: 60, distance: 10.0 },
  // BlastParamMinCharge / BlastParamMaxCharge
  minCharge: {
    paintRadius: 2.133, crossPaintRadius: 1.0,
    radius: 5.0, damageInnerDistance: 1.6, damageOuterDistance: 5.0,
    splashSatellites: 12, splashSatelliteRadius: 0.805,
    splashPitchMin: 19, splashPitchMax: 33, splashVelocityMin: 0.25, splashVelocityMax: 0.3,
  },
  maxCharge: {
    paintRadius: 5.0, crossPaintRadius: 2.1,
    radius: 8.0, damageInnerDistance: 4.6, damageOuterDistance: 8.0,
    splashSatellites: 12, splashSatelliteRadius: 0.805,
    splashPitchMin: 19, splashPitchMax: 33, splashVelocityMin: 0.4, splashVelocityMax: 0.48,
  },
  damageMax: rawDamage(1800),
  damageMin: rawDamage(300),
  bounces: true,
  rolls: true,
  status: 'extracted+calibrated',
};

// Upstream generic bomb, retained under its own id so every existing weapon, bot
// threshold and gear snapshot that reads `SUB.bomb` keeps working untouched.
export const BOMB = {
  id: 'bomb',
  name: 'Splat Bomb',
  mode: 'generic',
  chargeable: false,
  legacy: true,
  status: 'upstream-generic',
};

export const KIT_SUBS = { suction: SUCTION, curling: CURLING, bomb: BOMB };

// ---- Registry ----------------------------------------------------------------

export function registerKitSubs(SUB, profile) {
  const kits = profile?.kitSubs || {};
  for (const [id, spec] of Object.entries(KIT_SUBS)) {
    const override = kits[id] || {};
    const merged = { ...spec, ...override };
    // A profile may supply a usable value for an omitted primary field, but the
    // marker must keep saying so. Markers live on the merged copy only, so the
    // shared template stays clean and a re-registration re-derives the same state.
    for (const [key, value] of Object.entries(override)) {
      if (spec[key] === null && value !== null && `${key}Status` in merged) merged[`${key}Status`] = 'calibrated';
    }
    if (SUB[id]) Object.assign(SUB[id], merged);
    else SUB[id] = merged;
  }
  return SUB;
}

export function kitSubFor(weapon, SUB) {
  const id = weapon?.sub;
  if (id && KIT_SUBS[id]) return SUB?.[id] || KIT_SUBS[id];
  if (id && SUB?.[id]) return SUB[id];
  return SUB?.bomb || KIT_SUBS.bomb;
}

// ---- Charge / blast ----------------------------------------------------------

export function curlingChargeFraction(hold, spec = CURLING) {
  if (!spec?.chargeable || !spec.maxChargeTime) return 0;
  const c = hold / spec.maxChargeTime;
  return c < 0 ? 0 : c > 1 ? 1 : c;
}

// Held charge governs the throw: tap speed at 0, SpawnSpeedZMaxCharge at full.
export function curlingThrowSpeed(charge, spec = CURLING) {
  const lo = spec.throwSpeed, hi = spec.throwSpeedMaxCharge;
  return lo + (hi - lo) * charge;
}

export function curlingBlastParams(charge, spec = CURLING) {
  const a = spec.minCharge, b = spec.maxCharge, c = charge;
  return {
    paintRadius: a.paintRadius + (b.paintRadius - a.paintRadius) * c,
    crossPaintRadius: a.crossPaintRadius + (b.crossPaintRadius - a.crossPaintRadius) * c,
    radius: a.radius + (b.radius - a.radius) * c,
    damageInnerDistance: a.damageInnerDistance + (b.damageInnerDistance - a.damageInnerDistance) * c,
    damageOuterDistance: a.damageOuterDistance + (b.damageOuterDistance - a.damageOuterDistance) * c,
    trailRadius: spec.paintRadiusMinCharge + (spec.paintRadiusMaxCharge - spec.paintRadiusMinCharge) * c,
  };
}

// Resolves everything the throw and the per-bomb step need, once, onto the bomb.
export function resolveSubForThrow(actor, subHoldSeconds, SUB) {
  const id = actor?.weapon?.sub;
  const sub = actor?.weaponRunner?.s3Sub
    || (id ? (SUB?.[id] || KIT_SUBS[id]) : null)
    || kitSubFor(actor?.weapon, SUB);
  if (!sub) return null;
  const charge = sub.chargeable ? curlingChargeFraction(subHoldSeconds || 0, sub) : 0;
  const blast = sub.chargeable ? curlingBlastParams(charge, sub) : sub;
  const fuse = sub.fuse ?? sub.fuseFallback ?? sub.burstFrame ?? null;
  return {
    spec: sub,
    charge,
    fuse,
    fuseStatus: sub.fuse != null ? sub.fuseStatus
      : sub.fuseFallback != null ? 'calibrated'
      : sub.burstFrame != null ? 'extracted' : 'unknown-omitted',
    inkCost: sub.inkCost ?? sub.inkCostFallback ?? null,
    inkCostStatus: sub.inkCost != null ? sub.inkCostStatus : 'calibrated',
    paintRadius: blast.paintRadius,
    radius: blast.radius,
    damageMax: sub.damageMax,
    damageMin: sub.damageMin,
    damageInnerDistance: blast.damageInnerDistance ?? sub.damageInnerDistance,
    damageOuterDistance: blast.damageOuterDistance ?? sub.damageOuterDistance,
    trailRadius: sub.mode === 'roll' ? blast.trailRadius : null,
    throwSpeed: sub.chargeable ? curlingThrowSpeed(charge, sub) : sub.throwSpeed,
  };
}

// ---- Per-bomb state transitions ---------------------------------------------
// Called once per bomb from inside the native `_updateBombs` loop. It only mutates
// the bomb record (and paints the rolling trail through the real PaintSystem), so
// collision, damage, turf accounting, fx, audio and the network mute guard all stay
// with the native owner.

const STICK_BIAS = 0.21;   // matches the native bomb contact offset

// Suction Bomb: adheres to a wall or ceiling, zeroes its velocity, then arms.
function suctionStick(b, hit, resolved) {
  const n = hit.normal;
  const onFloor = n.y > 0.6;
  const onWall = Math.abs(n.x) > 0.5 || Math.abs(n.z) > 0.5;
  const onCeiling = n.y < -0.5;
  if (!onFloor && !onWall && !onCeiling) return false;
  b.s3Mode = 'stuck';
  b.pos.copy(hit.point);
  b.pos.addScaledVector(n, STICK_BIAS);
  b.vel.set(0, 0, 0);
  b.fuse = resolved.fuse;
  b.s3StuckNormal = { x: n.x, y: n.y, z: n.z };
  b.s3StuckOn = onCeiling ? 'ceiling' : onWall ? 'wall' : 'floor';
  return true;
}

// Curling Bomb: bounces off walls (bounded), rolls on the ground, paints a trail
// and bursts when the pinned BurstFrame window expires.
function curlingRoll(b, hit, resolved, dt, ctx) {
  const n = hit.normal;
  if (n.y <= 0.6) {
    // vertical surface: reflect with the pinned ContactJumpPanel rates
    const c = CURLING.contactJump;
    b.s3Bounces = (b.s3Bounces || 0) + 1;
    const vn = b.vel.dot(n);
    b.vel.addScaledVector(n, -vn * (1 + c.addSpeedOneBoundRate));
    b.s3BounceExhausted = b.s3Bounces > c.maxBoundNum;
    return;
  }
  // floor contact: settle onto the ground plane and start/keep the burst window
  b.s3Mode = 'rolling';
  b.pos.copy(hit.point);
  b.pos.addScaledVector(n, STICK_BIAS);
  b.vel.y = 0;
  b.vel.x *= CURLING.baseSpeedComeOverRate;
  b.vel.z *= CURLING.baseSpeedComeOverRate;
  b.fuse = resolved.fuse;
}

function curlingTrail(b, resolved, ctx) {
  const paint = ctx?.paint;
  if (!paint?.splat) return;
  const r = resolved.trailRadius ?? CURLING.paintRadiusMinCharge;
  const y = b.pos.y + CURLING.paintCheckHeight * 0;
  const tmp = b.s3TrailPoint || (b.s3TrailPoint = { x: 0, y: 0, z: 0, set(x, yy, z) { this.x = x; this.y = yy; this.z = z; } });
  tmp.set(b.pos.x, y, b.pos.z);
  const area = paint.splat(tmp, r, b.team, { seed: Math.random() });
  if (area > 0) b.owner?.addTurf?.(area);
}

// One call per bomb per frame, from the native loop. Returns true when the bomb
// has reached its burst and should explode (the caller then invokes the native
// `_explodeBomb` and the existing removal path).
export function stepSubBomb(b, hit, dt, ctx) {
  const resolved = b.s3Resolved;
  if (!resolved) return false;
  const spec = resolved.spec;
  if (spec.mode === 'stick') {
    if (hit?.hit && b.s3Mode !== 'stuck' && suctionStick(b, hit, resolved)) return false;
    if (b.s3Mode === 'stuck' && b.fuse > 0) { b.fuse -= dt; if (b.fuse <= 0) return true; }
    return false;
  }
  if (spec.mode === 'roll') {
    if (hit?.hit && b.s3Mode !== 'rolling') curlingRoll(b, hit, resolved, dt, ctx);
    if (b.s3Mode === 'rolling') {
      curlingTrail(b, resolved, ctx);
      if (b.fuse > 0) { b.fuse -= dt; if (b.fuse <= 0) return true; }
    }
    return false;
  }
  return false;
}

// ---- Install -----------------------------------------------------------------

const SWAPPED = ['paintRadius', 'radius', 'damageMax', 'damageMin', 'throwSpeed'];
const KIT_KEY = '__kitSubsInstalled';

export function installKitSubs(api, profile) {
  const { SUB, Projectiles, WeaponRunner, G } = api;
  if (!SUB || !Projectiles || !WeaponRunner) throw new Error('INKWAVE sub patch needs SUB, Projectiles and WeaponRunner');
  if (SUB[KIT_KEY]) return api;   // idempotent: no double wrapping
  registerKitSubs(SUB, profile);

  // Delegate to the native throw so it allocates the mesh, applies the real
  // throwVelocity, records the network bomb and plays the real audio; then attach
  // this bomb's own resolved spec and re-aim the velocity for held charge.
  const throwBomb = Projectiles.prototype.throwBomb;
  Projectiles.prototype.throwBomb = function (actor, holdSeconds) {
    const resolved = resolveSubForThrow(actor, holdSeconds, SUB);
    if (!resolved) return throwBomb.call(this, actor);
    // Native release reads SUB.bomb; swap in this sub's numbers for that one call.
    const saved = {};
    for (const k of SWAPPED) { saved[k] = SUB.bomb[k]; if (resolved[k] != null) SUB.bomb[k] = resolved[k]; }
    let created;
    try { created = throwBomb.call(this, actor); }
    finally { Object.assign(SUB.bomb, saved); }
    const b = this.bombs[this.bombs.length - 1];
    if (b) {
      // Per-bomb state only: no grouping, no second iteration, no per-frame global.
      b.s3Sub = resolved.spec;
      b.s3Resolved = resolved;
      b.s3Charge = resolved.charge;
      b.s3Mode = resolved.spec.mode === 'roll' ? 'flight' : 'flight';
      b.s3Bounces = 0;
      if (resolved.throwSpeed != null && b.vel) {
        // Re-aim through the native throwVelocity so aim pitch/carry stay native.
        const v = this.throwVelocity(actor, resolved.throwSpeed, b.vel.clone());
        if (v) b.vel.copy(v);
      }
    }
    return created ?? b;
  };

  // Scoped swap so the native explosion owns paint, damage, LOS, fx, audio, turf
  // and the network mute guard, while reading this bomb's own numbers.
  const explode = Projectiles.prototype._explodeBomb;
  Projectiles.prototype._explodeBomb = function (b) {
    const r = b?.s3Resolved;
    if (!r) return explode.call(this, b);
    const saved = {};
    for (const k of SWAPPED) { saved[k] = SUB.bomb[k]; if (r[k] != null) SUB.bomb[k] = r[k]; }
    try { return explode.call(this, b); }
    finally { Object.assign(SUB.bomb, saved); }
  };

  // Arc preview follows the sub that would actually be released.
  const updateArc = Projectiles.prototype.updateArc;
  Projectiles.prototype.updateArc = function (actor, show) {
    const r = resolveSubForThrow(actor, actor?.weaponRunner?.s3SubHold, SUB);
    if (!r || r.throwSpeed == null) return updateArc.call(this, actor, show);
    const saved = SUB.bomb.throwSpeed;
    SUB.bomb.throwSpeed = r.throwSpeed;
    try { return updateArc.call(this, actor, show); }
    finally { SUB.bomb.throwSpeed = saved; }
  };

  // Charge accumulation and death / weapon-change reset on the real runner.
  const reset = WeaponRunner.prototype.reset;
  WeaponRunner.prototype.reset = function (...args) {
    const out = reset.apply(this, args);
    this.s3SubHold = 0;
    this.s3Sub = kitSubFor(this.a?.weapon, SUB);
    this.s3SubCharge = 0;
    return out;
  };

  // The parent adapter calls this once per bomb inside native `_updateBombs`, so
  // this module never re-iterates the bomb list itself.
  api.S3_SUB_BOMB_STEP = stepSubBomb;

  Object.defineProperty(SUB, KIT_KEY, { value: true, enumerable: false, configurable: true });
  if (G && G.s3) G.s3.kitSubs = { suction: 'WeaponBombSuction', curling: 'WeaponBombCurling' };
  return api;
}

export default installKitSubs;
