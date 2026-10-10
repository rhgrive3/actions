// Splatoon 3 sub weapons for the published INKWAVE runtime.
//
// Authority stays exactly where issue 177 and the parent advisory place it:
//   - sub release  : real `WeaponRunner.update` (`const bomb = SUB.bomb`)
//   - sub object   : real `Projectiles.throwBomb` / `_updateBombs` / `_explodeBomb`
// Native names confirmed against inkwave-public: the runner is `a.weaponRunner`
// and `throwBomb(a)` allocates and pushes the bomb record itself.
//
// There is no second projectile list, collision pass, paint pass or damage pass
// here, and no extra full-list iteration: native per-bomb selectors are called
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

// The upstream SUB registry is passed in by the adapter from the real weapons.js
// scope, so these hooks always read the one live registry and still behave exactly
// like the native code when installKitSubs has not been applied.

import { SPRINKLER, beginSprinkler, stepSprinkler } from './kit-sprinkler.mjs';
const FRAME = 1 / 60;
const rawDamage = (v) => (v == null ? null : v / 10);
const frames = (v) => (v == null ? null : v * FRAME);
const perSecond = (v) => (v == null ? null : v * 60);
const tankPoints = (v) => (v == null ? null : v * 100);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// The pristine templates, never the live registry copies. `installGear` rewrites
// `sub.inkCost` on the live registry object for the duration of one
// `WeaponRunner.update` (ink saver scales the fallback), so a provenance label read
// off the live object would report a *calibrated* number as `unknown-omitted` or
// `extracted` depending on which actor happened to hold gear. Labels are derived
// from the template so they describe where the number came from, not who scaled it.
const kitTemplate = (sub) => (sub?.id && Object.hasOwn(KIT_SUBS, sub.id) ? KIT_SUBS[sub.id] : null);

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
  // #1028: attached Suction Bombs use the verified 120F / 2.0 s countdown.
  // The 11.3.0 parameter mirror omits BurstFrame for this weapon, so provenance
  // remains community-measured rather than invented from the Splat Bomb.
  fuseFallback: 2.0,
  fuseFallbackStatus: 'community-verified',
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

export const KIT_SUBS = { suction: SUCTION, curling: CURLING, sprinkler: SPRINKLER, bomb: BOMB };

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

// Reads only the live registry. A sub that has not been registered falls back to
// the native generic bomb, so an un-composed build keeps its existing behaviour
// instead of losing the release entirely.
export function kitSubFor(weapon, SUB) {
  const id = weapon?.sub;
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
    splashSatellites: Math.round(a.splashSatellites + (b.splashSatellites - a.splashSatellites) * c),
    splashSatelliteRadius: a.splashSatelliteRadius + (b.splashSatelliteRadius - a.splashSatelliteRadius) * c,
    trailRadius: spec.paintRadiusMinCharge + (spec.paintRadiusMaxCharge - spec.paintRadiusMinCharge) * c,
  };
}

// Resolves everything the throw and the per-bomb step need, once, onto the bomb.
// Split from the selection so a replayed ghost can resolve the SAME object from a
// wire charge fraction without borrowing the local actor's held seconds.
export function resolveSubAtCharge(sub, charge) {
  if (!sub) return null;
  const c = sub.chargeable ? clamp01(Number.isFinite(charge) ? charge : 0) : 0;
  const tpl = kitTemplate(sub);
  const blast = sub.chargeable ? curlingBlastParams(c, sub) : sub;
  const fuse = sub.chargeable && sub.mode === 'roll' &&
    Number.isFinite(sub.burstFrame) && Number.isFinite(sub.maxChargeTime) && Number.isFinite(sub.chargeFrameBlastRate)
    ? Math.max(0, sub.burstFrame - c * sub.maxChargeTime * sub.chargeFrameBlastRate)
    : sub.fuse ?? sub.fuseFallback ?? sub.burstFrame ?? null;
  return {
    spec: sub,
    charge: c,
    fuse,
    fuseStatus: sub.fuse != null ? sub.fuseStatus
      : sub.fuseFallback != null ? (sub.fuseFallbackStatus || 'calibrated')
      : sub.burstFrame != null ? 'extracted' : 'unknown-omitted',
    inkCost: sub.inkCost ?? sub.inkCostFallback ?? null,
    inkCostStatus: tpl?.inkCost != null ? sub.inkCostStatus : 'calibrated',
    paintRadius: blast.paintRadius,
    crossPaintRadius: blast.crossPaintRadius ?? sub.crossPaintRadius ?? null,
    splashSatellites: blast.splashSatellites ?? sub.splashSatellites ?? 0,
    splashSatelliteRadius: blast.splashSatelliteRadius ?? sub.splashSatelliteRadius ?? null,
    radius: blast.radius,
    damageMax: sub.damageMax,
    damageMin: sub.damageMin,
    damageInnerDistance: blast.damageInnerDistance ?? sub.damageInnerDistance,
    damageOuterDistance: blast.damageOuterDistance ?? sub.damageOuterDistance,
    trailRadius: sub.mode === 'roll' ? blast.trailRadius : null,
    throwSpeed: sub.chargeable ? curlingThrowSpeed(c, sub) : sub.throwSpeed,
  };
}

// Picks the spec this release will use. `runner.s3Sub` is the per-runner selection
// made at `WeaponRunner.reset`; the live registry is the fallback so an actor whose
// runner has not been reset yet still resolves the sub its weapon actually carries.
// Both are per-actor, and the values read from them are the gear-scoped ones, so
// two owners releasing in the same frame cannot see each other's cost or speed.
function actorSubSpec(actor, sub) {
  const m = actor?.s3?.modifiers || {}, power = m.subPower ?? 1;
  const cost = sub.inkCost ?? sub.inkCostFallback;
  return { ...sub, inkCost: Number.isFinite(cost) ? cost * (m.inkSaverSub ?? 1) : cost,
    throwSpeed: Number.isFinite(sub.throwSpeed) ? sub.throwSpeed * power : sub.throwSpeed,
    throwSpeedMaxCharge: Number.isFinite(sub.throwSpeedMaxCharge) ? sub.throwSpeedMaxCharge * power : sub.throwSpeedMaxCharge };
}
export function resolveSubForThrow(actor, subHoldSeconds, SUB) {
  const id = actor?.weapon?.sub;
  const sub = actor?.weaponRunner?.s3Sub
    || (id ? (SUB?.[id] || KIT_SUBS[id]) : null)
    || kitSubFor(actor?.weapon, SUB);
  if (!sub) return null;
  return resolveSubAtCharge(actorSubSpec(actor, sub), sub.chargeable ? curlingChargeFraction(subHoldSeconds || 0, sub) : 0);
}

// ---- Narrow native hooks -----------------------------------------------------
// Every function here is called from *inside* the native pipeline by the adapter
// (see patches/splatoon3/adapter.mjs, "sub weapon hooks"). There is no second
// projectile list, no second pass over `this.bombs`, and no second fuse
// decrement: the native `_updateBombs` loop keeps ownership of ordering,
// integration, contact resolution and the fuse countdown. These functions only
// select values for the bomb already being processed and mutate that one record.

const CONTACT_BIAS = 0.21;   // the native bomb contact offset

// Two different questions, two different resolvers.
//
// AUTHORITY (`resolvedOf`) answers "may this bomb paint, hurt, credit turf or
// explode with its own bands?". Only a bomb this client actually threw qualifies,
// so a replayed remote bomb is excluded twice over: it is marked `ghost`, and it
// carries its numbers on `s3GhostResolved`, never on `s3Resolved`.
//
// PRESENTATION (`presentedOf`) answers "what should this bomb look like while it
// flies?". That is the ghost's business too: a remote Suction Bomb has to stick to
// the wall it was thrown at, and a remote Curling Bomb has to roll and burst on
// its own clock, or the throw you watched is not the throw you saw.
const ownsAuthority = (b) => !!b && !b.ghost && !!b.s3Resolved;

const resolvedOf = (b) => (ownsAuthority(b) ? b.s3Resolved : null);

const presentedOf = (b) => {
  if (!b) return null;
  if (b.ghost) return b.s3GhostResolved ?? null;
  return ownsAuthority(b) ? b.s3Resolved : null;
};

// The live global context, used only for the native actor scan. Captured at install
// time from the running composition.
let G_REF = null, PLAYER_REF = null, PHYSICS_REF = null;

// ---- 1. sub release: selected spec and held charge ---------------------------

// Called at the native `const bomb = SUB.bomb` site. Accumulates the held charge
// while the sub button is down and returns the spec that this release will use, so
// the native ink check, `fireFacing` and cost subtraction all read one object.
// Returns ONE authoritative release object, cached on the runner so the native
// ink check/subtraction and the throw hook consume the same selection. `inkCost`
// is resolved here because a raw spec can carry a null primary field: left
// unresolved, the native `a.ink < bomb.inkCost` compares against null and the
// release costs nothing.
export function kitSubRelease(SUB, runner, dt, inp) {
  if (inp?.sub) runner.s3SubHold = (runner.s3SubHold || 0) + dt;
  else if (!inp?.subReleased) runner.s3SubHold = 0;
  const sub = actorSubSpec(runner.a, kitSubFor(runner.a?.weapon, SUB));
  const hold = runner.s3SubHold || 0;
  const charge = sub.chargeable ? curlingChargeFraction(hold, sub) : 0;
  const tpl = kitTemplate(sub);
  const inkCost = Number.isFinite(sub.inkCost) ? sub.inkCost
    : Number.isFinite(sub.inkCostFallback) ? sub.inkCostFallback
    : SUB.bomb.inkCost;
  const release = sub.chargeable
    ? { ...sub, ...curlingBlastParams(charge, sub), inkCost }
    : { ...sub, inkCost };
  release.__charge = charge;
  release.__hold = hold;
  // Provenance comes from the template, so the ink-saver swap `installGear` makes on
  // the live registry for this frame cannot relabel the number's origin.
  release.__inkCostStatus = tpl?.inkCost != null ? sub.inkCostStatus : 'calibrated';
  runner.s3Release = release;
  return release;
}

// Held charge at the release instant, consumed by the throw hook.
export function kitSubHoldSeconds(runner) {
  return runner?.s3SubHold || 0;
}

// ---- 2. throw: per-bomb spec, attached before recBomb records identity ------

// Called from the adapter immediately after the native `this.bombs.push(...)` and
// BEFORE `G.netm.recBomb(...)`, so the record already carries its kit identity
// when the network snapshots it. This is a real before-recBomb hook, not a claim:
// the previous draft attached from a wrapper AFTER the native call had already
// recorded. A remote actor never gets a spec, so ghosts hold no authority: their
// numbers live on `s3GhostResolved` (see `kitGhostBombAttach`).
export function kitBombAttach(SUB, projectiles, actor, release) {
  const b = projectiles.bombs[projectiles.bombs.length - 1];
  // `ghostBomb` builds its record through the native `throwBomb`, so this hook runs
  // once for a replayed remote bomb too. Refuse it there: a ghost never gains
  // authority and never re-enters the recorder (see `withGhostBombSpawn`).
  if (ghostBombSpawning() || b?.ghost || actor?.remote) return null;
  const sub = kitSubFor(actor?.weapon, SUB);
  const holdSeconds = release?.__hold ?? 0;
  const resolved = release
    // The cached release may only contribute its charge while it still describes
    // THIS sub. A release cached for a different weapon must not carry its charge
    // across onto the one being thrown.
    ? { ...resolveSubForThrow(actor, holdSeconds, SUB), charge: release.id === sub.id ? (release.__charge ?? 0) : 0 }
    : resolveSubForThrow(actor, holdSeconds, SUB);
  if (!b || !resolved) return null;
  // One physical Sprinkler at a time per owner, on the same native bomb list.
  if (sub.mode === 'sprinkler') for (let i=projectiles.bombs.length-2;i>=0;i--) {
    const previous=projectiles.bombs[i];
    if (previous.owner!==actor || previous.s3Sub?.mode!=='sprinkler') continue;
    projectiles._releaseBomb(previous);projectiles.bombs.splice(i,1);
  }
  b.s3Sub = sub;
  b.s3Resolved = resolved;
  b.s3Charge = resolved.charge;
  b.s3Mode = 'flight';
  b.s3Bounces = 0;
  b.s3TrailPoint = null;                 // allocated lazily, reused for the roll
  b.s3FuseTotal = resolved.fuse;         // denominator for the native beep curve
  // #1099: Curling's source-backed lifetime starts at release, not at first
  // floor contact. Suction/Splat Bomb keep their own contact arming.
  if (sub.mode === 'roll' && Number.isFinite(resolved.fuse)) b.fuse = resolved.fuse;
  // Held charge re-aims through the native throwVelocity, so aim pitch and
  // player-velocity carry stay with the native implementation.
  if (resolved.throwSpeed != null) {
    const v = projectiles.throwVelocity(actor, resolved.throwSpeed, b.vel.clone());
    if (v) b.vel.copy(v);
  }
  return b;
}

// ---- 3. per-bomb gravity, contact and fuse inside the native loop ------------

// Storm keeps the native 24 constant; this hook must not drag it onto the bomb
// gravity. A stuck bomb gets zero, so it cannot drift off its surface without a
// fresh physics hit. Otherwise the spec's own flight or ground value is used.
// Presentation-only, so a replayed ghost follows the same arc the owner threw.
export const NATIVE_STORM_GRAVITY = 24;
export function kitBombGravity(SUB, b) {
  if (b?.kind === 'storm') return NATIVE_STORM_GRAVITY;
  if (b?.s3Mode === 'stuck' || b?.s3Mode === 'sprinkling') return 0;
  const spec = presentedOf(b)?.spec;
  if (!spec) return SUB.bomb.gravity;
  if (b?.s3Mode === 'rolling') return Number.isFinite(spec.groundGravity) ? spec.groundGravity : SUB.bomb.gravity;
  const g = Number.isFinite(spec.gravity) ? spec.gravity : spec.flyGravity;
  return Number.isFinite(g) ? g : SUB.bomb.gravity;
}

// Contact subtype, called from the native `if (hit.hit)` block. Returns true when
// this bomb has taken over the contact and the native reflection must be skipped.
// Returns false to let the native bounce/settle run unchanged.
//
// Unlike the earlier draft this never disables wall handling after landing: a
// rolling Curling Bomb still reflects on a wall, and the bounce budget is a real
// bound that stops adding energy once exhausted.
//
// The contact itself only moves the record and arms its fuse, which is why a ghost
// may take it: a remote Suction Bomb that bounced off the wall would be a lie about
// the throw the owner made. Painting and damage live in `kitBombTrail`, which stays
// authority-only.
export function kitBombContact(SUB, b, hit, dt) {
  const r = presentedOf(b);
  if (!r || !hit?.hit) return false;
  const n = hit.normal;
  const spec = r.spec;

  if (spec.mode === 'sprinkler') {
    if (b.s3Mode === 'sprinkling') return true;
    b.pos.copy(hit.point).addScaledVector(n, CONTACT_BIAS);
    b.vel.set(0,0,0);b.fuse=-1;b.s3Mode='sprinkling';
    b.s3SurfaceNormal ||= new b.pos.constructor();b.s3SurfaceNormal.copy(n);
    beginSprinkler(b,n,spec);
    return true;
  }
  if (spec.mode === 'stick') {
    const onFloor = n.y > 0.6;
    const onWall = Math.abs(n.x) > 0.5 || Math.abs(n.z) > 0.5;
    const onCeiling = n.y < -0.5;
    if (!onFloor && !onWall && !onCeiling) return false;
    b.pos.copy(hit.point);
    b.pos.addScaledVector(n, CONTACT_BIAS);
    b.vel.set(0, 0, 0);
    // Arm once, like the native `b.fuse < 0` guard. Re-arming on every contact
    // would reset the countdown each tick and the bomb would never detonate.
    if (b.fuse < 0) { b.fuse = r.fuse; b.s3FuseTotal = r.fuse; }
    b.s3Mode = 'stuck';
    b.s3SurfaceNormal ||= new b.pos.constructor();
    b.s3SurfaceNormal.copy(n);
    b.s3StuckOn = onCeiling ? 'ceiling' : onWall ? 'wall' : 'floor';
    return true;                       // native bounce is skipped for a stuck bomb
  }

  if (spec.mode === 'roll') {
    const c = spec.contactJump;
    if (n.y > 0.6) {
      // floor: clamp to the contact surface so the bomb cannot sink through it and
      // the trail paints the surface it actually rests on.
      b.s3Mode = 'rolling';
      b.s3SurfaceNormal ||= new b.pos.constructor();
      b.s3SurfaceNormal.copy(n);
      b.pos.copy(hit.point);
      b.pos.addScaledVector(n, CONTACT_BIAS);
      b.vel.y = 0;
      b.vel.x *= spec.baseSpeedComeOverRate;
      b.vel.z *= spec.baseSpeedComeOverRate;
      if (b.fuse < 0) { b.fuse = r.fuse; b.s3FuseTotal = r.fuse; }
      return true;
    }
    // vertical surface: reflect with the pinned rate, bounded by MaxBoundNum.
    // Once the budget is spent the bomb stops gaining energy instead of setting
    // a flag that nothing reads.
    if (b.s3Mode === 'rolling') b.s3Mode = 'rolling';
    b.s3Bounces = (b.s3Bounces || 0) + 1;
    if (b.s3Bounces > c.maxBoundNum) {
      b.vel.multiplyScalar(0);
      b.s3BounceExhausted = true;
      return true;
    }
    const vn = b.vel.dot(n);
    b.vel.addScaledVector(n, -vn * (1 + c.addSpeedOneBoundRate));
    return true;
  }
  return false;
}

// Rolling trail, called from the native loop once the bomb is rolling. The centre
// is a real THREE.Vector3 because the native PaintSystem reads vector fields.
// Allocated once per bomb and reused; no per-frame allocation.
export function kitBombTrail(SUB, b, paint, projectiles) {
  if (b?.s3Mode === 'sprinkling') {
    if (b.owner?.alive === false) return 0;
    return stepSprinkler(b, paint, projectiles, G_REF, PHYSICS_REF, PLAYER_REF);
  }
  const r = resolvedOf(b);
  if (!r || b.s3Mode !== 'rolling') return 0;
  const spec = r.spec;
  // DamageDirectSpanSecond is interpreted as the repeated-contact interval,
  // not DPS. This temporal mapping and the native 0.2 bomb contact radius are
  // functional calibration; the primary table pins the 20 HP damage amount.
  if (projectiles?.applyHit && Number.isFinite(spec.damageDirectHit) && spec.damageDirectSpanSecond > 0) {
    b.s3ContactTimes ||= new WeakMap();
    b.s3ContactBase ||= new b.pos.constructor();
    for (const e of (G_REF?.actors || [])) {
      if (e.team === b.team || !e.alive || !e.pos) continue;
      b.s3ContactBase.copy(e.pos); b.s3ContactBase.y += e.smoothY || 0;
      const h = e.form === 'squid' ? PLAYER_REF.squidHeight : PLAYER_REF.height;
      const distance = PHYSICS_REF.pointCapsuleDist(b.pos, b.s3ContactBase, PLAYER_REF.radius, h);
      if (distance > PLAYER_REF.radius + 0.2) continue;
      if (G_REF.physics?.los && !G_REF.physics.los(b.pos, b.s3ContactBase)) continue;
      const last = b.s3ContactTimes.get(e) ?? -Infinity;
      if (b.age + 1e-10 < last + spec.damageDirectSpanSecond) continue;
      b.s3ContactTimes.set(e, b.age);
      projectiles.applyHit(b.owner, e, spec.damageDirectHit, 'curling');
    }
  }
  if (!paint?.splat) return 0;
  const radius = r.trailRadius ?? spec.paintRadiusMinCharge;
  // Derive the real Vector3 class from the bomb's own position vector so the
  // native PaintSystem receives the type it expects, with no extra module import
  // and no per-frame allocation.
  if (!b.s3TrailPoint) b.s3TrailPoint = new b.pos.constructor();
  b.s3TrailPoint.copy(b.pos);
  const area = paint.splat(b.s3TrailPoint, radius, b.team, { seed: Math.random(), claimOwner: b.owner });
  if (area > 0) b.owner?.addTurf?.(area);
  return area;
}

// The owner can be splatted, or a game effect can explicitly retire a placed
// Sprinkler, without triggering the generic Splat Bomb explosion.
export function kitBombRetire(b) {
  return !!b && (b.s3Resolved?.spec?.mode==='sprinkler' || b.s3GhostResolved?.spec?.mode==='sprinkler')
    && (b.owner?.alive===false || b.s3Destroyed===true);
}

// Denominator for the native fuse progress/beep curve. One native decrement, so
// the bomb's own total is used rather than the generic bomb's. Presentation-only:
// the pulse and the scale-up are how a bomb reads as "about to go", and a ghost
// has to go off when the owner's did.
export function kitBombKeepsFuse(b) {
  const mode=presentedOf(b)?.spec?.mode;
  return mode==='stick'&&b.s3Mode==='stuck'||mode==='roll'&&b.s3Mode==='rolling';
}
export function kitBombFuseTotal(SUB, b) {
  const t = presentedOf(b)?.fuse;
  return Number.isFinite(t) && t > 0 ? t : SUB.bomb.fuse;
}

// ---- 4. native blast reads this bomb's own bands ----------------------------
// The adapter routes the existing `_explodeBomb` reads through these, so the
// native blast keeps owning paint, damage, LOS, fx, audio, turf and the ghost
// mute guard while consuming this bomb's numbers.
//
// Everything below is AUTHORITY. A replayed ghost reads the native `SUB.bomb`
// values here exactly as before, so no kit damage, kit paint radius or boss splash
// can be reached through somebody else's bomb. The one presentation selector is
// `kitBombFxRadius`, which the adapter uses only on the visual burst.

export function kitBombPaintRadius(SUB, b, fallback) {
  const r = resolvedOf(b);
  return Number.isFinite(r?.paintRadius) ? r.paintRadius : fallback;
}

// #1123: Suction/Curling explosion paint is authored once from that sub's own
// resolved blast record. Returning null deliberately leaves the native Splat Bomb
// footprint untouched. Satellites live in the contacted surface plane, so a
// Suction Bomb stuck to a wall/ceiling does not stamp an unrelated XZ flower.
export function kitBombExplosionPaint(SUB, b, paint) {
  const r = resolvedOf(b);
  if (!r || r.spec?.id === 'bomb' || !paint?.splat || !Number.isFinite(r.paintRadius)) return null;
  const count = Math.max(0, Math.floor(r.splashSatellites || 0));
  const satelliteRadius = Number.isFinite(r.splashSatelliteRadius) ? r.splashSatelliteRadius : 0;
  const ring = Number.isFinite(r.crossPaintRadius) ? Math.max(0, r.crossPaintRadius) : 0;
  b.s3PaintN ||= new b.pos.constructor();
  b.s3PaintT ||= new b.pos.constructor();
  b.s3PaintB ||= new b.pos.constructor();
  b.s3PaintPoint ||= new b.pos.constructor();
  const n = b.s3PaintN;
  if (b.s3SurfaceNormal?.lengthSq?.() > 1e-10) n.copy(b.s3SurfaceNormal).normalize();
  else n.set(0, 1, 0);
  const t = b.s3PaintT;
  if (Math.abs(n.y) < 0.9) t.set(0, 1, 0).cross(n).normalize();
  else t.set(1, 0, 0);
  const bit = b.s3PaintB.copy(n).cross(t).normalize();
  const center = b.s3PaintPoint.copy(b.pos).addScaledVector(n, 0.1);
  const baseSeed = Number.isFinite(b.s3ExplosionPaintSeed) ? b.s3ExplosionPaintSeed
    : (b.s3ExplosionPaintSeed = Math.random());
  let area = paint.splat(center, r.paintRadius, b.team, { seed: baseSeed, claimOwner: b.owner });
  if (satelliteRadius > 0 && ring > 0) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      center.copy(b.pos).addScaledVector(n, 0.1)
        .addScaledVector(t, Math.cos(angle) * ring)
        .addScaledVector(bit, Math.sin(angle) * ring);
      area += paint.splat(center, satelliteRadius, b.team,
        { seed: (baseSeed + (i + 1) * 0.6180339887498949) % 1, claimOwner: b.owner });
    }
  }
  return area;
}

export function kitBombRadius(SUB, b, fallback) {
  const r = resolvedOf(b);
  return Number.isFinite(r?.radius) ? r.radius : fallback;
}

// Purely visual: the explosion sprite and the minimap boom ring. It is fed no
// damage and no paint, so a ghost may use it and a full-charge Curling Bomb reads
// as the 8 m burst it was instead of the generic bomb's 7 m.
export function kitBombFxRadius(SUB, b, fallback) {
  const r = presentedOf(b);
  return Number.isFinite(r?.radius) ? r.radius : fallback;
}

// The DistanceDamage table for this bomb's charge tier. The native blast already
// evaluates `distanceDamage(s.damageBands, d, false)`; this supplies the table so
// the lethal inner band is the bomb's own distance and not a global radius guess.
export function kitBombDamageBands(SUB, b, fallback) {
  const r = resolvedOf(b);
  if (!r) return fallback;
  const inner = r.damageInnerDistance, outer = r.damageOuterDistance;
  if (!Number.isFinite(inner) || !Number.isFinite(outer)) return fallback;
  return [[inner, r.damageMax], [outer, r.damageMin]];
}

export function kitBombDamageMax(SUB, b, fallback) {
  const v = resolvedOf(b)?.damageMax;
  return Number.isFinite(v) ? v : fallback;
}

export function kitBombDamageMin(SUB, b, fallback) {
  const v = resolvedOf(b)?.damageMin;
  return Number.isFinite(v) ? v : fallback;
}

// ---- 5. the sub packet, and the ghost it replays -----------------------------
// The native `'b'` event is `[t, 'b', nid, kind, x, y, z, vx, vy, vz]`. Two fields
// are APPENDED after it:
//
//   e[10] sub id   'suction' | 'curling' | '' for "generic, behave natively"
//   e[11] charge   held-charge fraction 0..1, 0 when the sub is not chargeable
//
// Appending is what keeps this compatible in both directions. A client without the
// appended fields reads only the native indices and keeps replaying a generic
// bomb; a client WITH them, reading an older packet, sees `undefined` and
// `kitGhostBombAttach` declines, so it also falls back to the generic bomb instead
// of inventing a spec.

// Bounded: a peer's packet may only name a sub that exists in this module's own
// allowlist, and the charge may only be a finite number. Nothing off the wire
// reaches `SUB` as a lookup key.
const PACKET_SUB_IDS = Object.freeze(['suction', 'curling', 'sprinkler']);

const packetSubId = (raw) => (typeof raw === 'string' && raw.length <= 16 && PACKET_SUB_IDS.includes(raw) ? raw : null);

// Recording side. Returns `null` while a ghost is being replayed: `ghostBomb`
// builds its record through the native `throwBomb`, whose `!a.remote` guard is the
// only thing standing between a peer's packet and a new packet of our own. Once a
// peer has been adopted by this client (`_adopt` clears `remote`) that guard is
// open, and the bounce would feed itself.
export function kitBombPacket(b) {
  if (ghostBombSpawning() || b?.ghost) return null;
  const id = b?.s3Sub ? packetSubId(b.s3Sub.id) : null;
  if (!id) return ['', 0];
  const charge = id && Number.isFinite(b.s3Charge) ? clamp01(b.s3Charge) : 0;
  return [id, charge];
}

// Replay side. Validated against the LIVE registry as well, so a build that has not
// registered the sub yet replays natively instead of reading a missing spec.
export function kitGhostBombAttach(SUB, projectiles, b, rawId, rawCharge) {
  if (!b || b.ghost !== true || b.kind !== 'bomb') return null;
  const id = packetSubId(rawId);
  if (!id) return null;
  // Same selection order as `resolveSubForThrow`: the live registry first so a
  // profile override and the gear-scoped numbers win, the module template only as
  // the fallback so an unregistered build still replays the sub it was sent.
  const spec = SUB?.[id] || KIT_SUBS[id];
  if (!spec || spec.id !== id) return null;
  const charge = spec.chargeable && Number.isFinite(rawCharge) ? clamp01(rawCharge) : 0;
  // Presentation only: `s3Resolved` is what grants paint/damage/turf authority, so
  // a ghost's numbers live on their own field and `ownsAuthority` stays false for
  // the whole life of the record.
  const resolved = resolveSubAtCharge(spec, charge);
  if (!resolved) return null;
  b.s3GhostResolved = resolved;
  b.s3Charge = resolved.charge;
  b.s3Mode = 'flight';
  b.s3Bounces = 0;
  b.s3FuseTotal = resolved.fuse;
  if (spec.mode === 'roll' && Number.isFinite(resolved.fuse)) b.fuse = resolved.fuse;
  return b;
}

// `ghostBomb` runs the native throw first and only sets `b.ghost` afterwards, so
// nothing downstream can be told apart by the flag alone. This synchronous depth
// counter covers exactly that window and nothing else.
let ghostSpawnDepth = 0;
export function withGhostBombSpawn(fn) {
  ghostSpawnDepth++;
  try { return fn(); }
  finally { ghostSpawnDepth--; }
}
export function ghostBombSpawning() { return ghostSpawnDepth > 0; }

// ---- Install -----------------------------------------------------------------

const KIT_KEY = '__kitSubsInstalled';

export function installKitSubs(api, profile) {
  const { SUB: _unused, Projectiles, WeaponRunner, G } = api;
  const SUB = _unused;
  if (!SUB || !Projectiles || !WeaponRunner) throw new Error('INKWAVE sub patch needs SUB, Projectiles and WeaponRunner');
  if (SUB[KIT_KEY]) return api;   // idempotent: no double wrapping
  G_REF = G; PLAYER_REF = api.PLAYER; PHYSICS_REF = api.Physics;
  registerKitSubs(SUB, profile);

  // The per-bomb spec is attached by the adapter before recBomb; this wrapper only
  // consumes the held charge so the next press starts from zero.
  const throwBomb = Projectiles.prototype.throwBomb;
  Projectiles.prototype.throwBomb = function (actor) {
    const runner = actor?.weaponRunner;
    const out = throwBomb.call(this, actor);
    // Charge is consumed by the owner's own release. A ghost replays through this
    // same method, and a remote runner's hold is not ours to clear.
    if (runner && !actor?.remote && !ghostBombSpawning()) runner.s3SubHold = 0;
    return out;
  };

  // Arc preview follows the sub that would actually be released.
  const updateArc = Projectiles.prototype.updateArc;
  Projectiles.prototype.updateArc = function (actor, show) {
    const resolved = resolveSubForThrow(actor, actor?.weaponRunner?.s3SubHold, SUB);
    if (!resolved || resolved.throwSpeed == null) return updateArc.call(this, actor, show);
    const saved = this.s3PreviewSubSpeed;
    this.s3PreviewSubSpeed = resolved.throwSpeed;
    try { return updateArc.call(this, actor, show); }
    finally { this.s3PreviewSubSpeed = saved; }
  };

  // Charge state and death / weapon-change reset live on the real runner.
  const reset = WeaponRunner.prototype.reset;
  WeaponRunner.prototype.reset = function (...args) {
    const out = reset.apply(this, args);
    this.s3SubHold = 0;
    this.s3Sub = kitSubFor(this.a?.weapon, SUB);
    return out;
  };

  Object.defineProperty(SUB, KIT_KEY, { value: true, enumerable: false, configurable: true });
  if (G && G.s3) G.s3.kitSubs = { suction: 'WeaponBombSuction', curling: 'WeaponBombCurling' };
  return api;
}

export default installKitSubs;
