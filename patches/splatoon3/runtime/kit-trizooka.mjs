// Trizooka — Splatoon 3 special for Splattershot (issue 177, lane freebuff-2).
//
// Primary source, verified by SHA before any value was used:
//   Leanny/splat3 @ 7280ff9cde8bb1c5dcef46c700c326471584d2e6
//   data/parameter/1130/weapon/WeaponSpUltraShot.game__GameParameterTable.json
//   sha256 b088c9df476ed786a4a9e76c1fd3d7166885adf0dcffd563b36d1d20b9995d22
// WeaponInfoSpecial maps BaseShooter_Normal_00 -> SpUltraShot at 200 p.
//
// The quarantined freebuff-3 draft used the UltraStamp hammer table and its 570F
// duration. None of those values are used here. The quarantined copy was reviewed
// for harness structure only; its numbers were discarded, not ported.
//
// Authority: the native single projectile list, `Projectiles._push`,
// `Projectiles._step` and `Projectiles._blastBurst` stay the only owners of
// flight, collision, paint, damage and the network record. This module adds no
// second list and no second integrator.
//
// Parent descriptor contract (candidate 7691dc7):
//   - `p.s3SpecialWeapon` is preserved before `_push` and reset in `_new`.
//   - `_blastBurst` reads the descriptor's splashBands / burstRadius / impactRadius.
//   - `SPECIALS[wid].projectileDescriptor(p)` restores the descriptor for ghosts.
//
// Conversions are the ones already recorded in profile.calibration:
// framesToSeconds /60, perFrameVelocityToPerSecond *60,
// perFrameGravityToPerSecondSquared *3600, rawDamageToHP /10.

const FRAME = 1 / 60;
const rawDamage = (v) => (v == null ? null : v / 10);
const frames = (v) => (v == null ? null : v * FRAME);
const perSecond = (v) => (v == null ? null : v * 60);

export const TRIZOOKA_SOURCE = {
  repository: 'Leanny/splat3',
  ref: '7280ff9cde8bb1c5dcef46c700c326471584d2e6',
  path: 'data/parameter/1130/weapon/WeaponSpUltraShot.game__GameParameterTable.json',
  sha256: 'b088c9df476ed786a4a9e76c1fd3d7166885adf0dcffd563b36d1d20b9995d22',
  verifiedAt: '2026-10-04',
};

export const TRIZOOKA_ID = 'trizooka';
export const TRIZOOKA_KIT_COST = 200;   // WeaponInfoSpecial: BaseShooter_Normal_00 -> SpUltraShot

// ---- spec -------------------------------------------------------------------

export const TRIZOOKA = {
  id: TRIZOOKA_ID,
  name: 'Trizooka',
  // spl__WeaponSpUltraShotParam
  shots: 3,                       // three firing actions; Trizooka fires a volley per action
  startDelay: frames(5),          // StartDelayFrame 5
  repeatFrame: frames(55),        // RepeatFrame 55, and HoldAimFrame 55
  shotDelay: frames(15),          // ShotDelayFrame 15
  reqShotInStartDelay: true,      // IsReqShotInStartDelay
  duration: frames(330),          // SpecialDurationFrame.Low, AP 0. NOT the Stamp 570.
  durationMid: frames(405),
  durationHigh: frames(480),
  moveSpeed: perSecond(0.07),     // MoveSpeed 0.07
  moveSpeedInCharge: perSecond(0.04),   // MoveSpeedInCharge 0.04
  // MoveParam — the three flight states
  spawnSpeed: perSecond(1.125),   // SpawnSpeed 1.125
  goStraightFrames: frames(16),   // GoStraightToBrakeStateFrame 16
  brakeFrames: frames(10),        // BrakeToFreeStateFrame 10
  brakeGravity: 0.09 * 3600,      // BrakeGravity 0.09
  brakeAirResist: 0.09,           // BrakeAirResist 0.09 (per-frame retention)
  brakeVelocityXZ: 1.0,           // BrakeToFreeVelocityXZ
  brakeVelocityY: -0.1,           // BrakeToFreeVelocityY
  freeGravity: 0.0190565 * 3600,  // FreeGravity 0.0190565
  freeAirResist: 0.01985,         // FreeAirResist 0.01985
  goStraightMaxSpeed: 1.0,        // GoStraightStateEndMaxSpeed
  // UltraShotMoveParam — the spiraling orbit
  orbitalRadiusEnd: 1.0,          // OrbitalRadiusEnd
  orbitalTransitionFrames: frames(10),   // OrbitalRadiusTransitionFrame 10
  // DamageParam / BlastParam
  directHitDamage: rawDamage(2200),       // DirectHitDamage 2200 -> 220 HP
  splashBands: [[2.5, rawDamage(530)], [4.0, rawDamage(350)]],   // 53 HP @2.5, 35 HP @4.0
  paintRadius: 3.2,               // BlastParam.PaintRadius
  knockBack: { accel: 470, bias: 0.8, distance: 8.0 },
  // CollisionParam — the variable hit sphere
  collision: {
    initRadiusField: 0.01, initRadiusPlayer: 0.01,
    endRadiusField: 0.3, endRadiusPlayer: 0.75,
    framesField: frames(20), framesPlayer: frames(10),
  },
  // SpecialChargeUp ladder recorded but not yet driving behaviour
  specUp: {
    paintRadius: { low: 3.2, mid: 3.6, high: 4.0 },
    distanceDamageDistanceRate: { low: 1.0, mid: 1.15, high: 1.3 },
  },
  status: 'extracted',
};

// Cartridge visuals are recorded from spl__WeaponSpUltraShotParam; the eject mesh
// itself is not yet driven, so this is calibration data, not claimed behaviour.
export const TRIZOOKA_CARTRIDGE = {
  ejectFrame: 30, fadeOutFrame: 5, lifeTimeFrame: 60, initSpeed: 5,
  angular: { x: 35, y: 0, z: 20 }, hideBeforeEject: 1,
  knockBack: { airBreakRt: 0.8, impactValue: 0.04, stickDownRt: 5.0 },
  status: 'extracted-not-driven',
};

// ---- descriptor -------------------------------------------------------------

// The projectile descriptor the parent's `_blastBurst` and ghost restore read.
// Every number here comes from the table above; nothing is invented per projectile.
export function trizookaSpecialWeapon() {
  return {
    kind: 'trizooka',
    wid: TRIZOOKA_ID,
    // read by the native blast
    splashBands: TRIZOOKA.splashBands,
    burstRadius: TRIZOOKA.paintRadius,
    impactRadius: TRIZOOKA.paintRadius,
    damageMax: rawDamage(530),
    damageMin: rawDamage(350),
    directDamage: TRIZOOKA.directHitDamage,
    // flight
    type: 'blast',
    grav: TRIZOOKA.freeGravity,
    drag: TRIZOOKA.freeAirResist,
    s3StageFrames: [TRIZOOKA.goStraightFrames, TRIZOOKA.brakeFrames],
    s3Orbit: { end: TRIZOOKA.orbitalRadiusEnd, frames: TRIZOOKA.orbitalTransitionFrames },
    s3Collision: TRIZOOKA.collision,
    status: TRIZOOKA.status,
  };
}

// Replay/ghost path: the parent restores the descriptor from SPECIALS[wid].
export function trizookaProjectileDescriptor(_p) {
  return trizookaSpecialWeapon();
}

// ---- volley -----------------------------------------------------------------

// One volley is a fixed number of projectiles spread across the three firing
// actions. Splatoon 3's Trizooka fires 3 volleys of 10; 10 is not stated in this
// table, so the per-volley count is NOT invented here. `perVolley` stays null and
// is an explicit handoff gap, and `throwVolley` fires whatever count is configured.
export const VOLLEY_CONFIG = {
  perVolley: null,
  perVolleyStatus: 'unknown-not-stated-in-primary',
  spreadDeg: null,
  spreadStatus: 'unknown-not-stated-in-primary',
};

function countFor(actor) {
  const v = VOLLEY_CONFIG.perVolley;
  return Number.isFinite(v) ? v : 0;
}

// Fires one volley through the native throw velocity and the native list.
// `System` must be the real Projectiles instance so `_push` records the packet.
export function throwVolley(System, actor, descriptor) {
  const count = countFor(actor);
  const fired = [];
  for (let i = 0; i < count; i++) {
    const p = System._new ? System._new() : { pos: actor.pos.clone(), prev: actor.pos.clone(), vel: new actor.pos.constructor(), start: actor.pos.clone() };
    p.type = descriptor.type;
    p.wid = descriptor.wid;                     // native cause id, used by ghost restore
    p.owner = actor;
    p.team = actor.team;
    p.life = 12;
    p.straight = descriptor.s3StageFrames[0];
    p.radius = descriptor.impactRadius;
    p.size = descriptor.burstRadius;
    p.grav = descriptor.grav;
    p.drag = descriptor.drag;
    p.damage = descriptor.directDamage;
    p.delay = 0; p.head = false; p.wid = descriptor.wid; p.vol = null; p.ghost = false;
    p.trail = -1.5; p.trailEvery = 1.1; p.trailRadius = 0.3;
    p.seed = (i * 0.37 + 0.11) % 1;
    p.pos.copy(actor.pos); p.pos.y += 1.05;
    p.prev.copy(p.pos); p.start.copy(p.pos);
    // full 3D aim through the native throw velocity, so pitch/yaw/carry stay native
    System.throwVelocity(actor, TRIZOOKA.spawnSpeed, p.vel);
    p.s3SpecialWeapon = descriptor;              // parent preserves this before _push
    p.s3Weapon = descriptor;
    p.s3VolleyIndex = i;
    p.s3Shots = count;
    System._push(p);                             // the one native list, the one native record
    fired.push(p);
  }
  return fired;
}

// ---- charge / lifecycle state machine ---------------------------------------

export function newTrizookaState() {
  return {
    active: false,
    t: 0,
    shots: 0,
    nextShotAt: 0,
    lastFiredFrame: -1,
    descriptor: trizookaSpecialWeapon(),
  };
}

// Activation guards. Dead, super-jumping, already-active or not-ready is refused.
export function canActivateTrizooka(actor) {
  if (!actor?.alive) return false;
  if (actor.superJumpState) return false;
  if (actor.specialActive) return false;
  if (actor.s3Trizooka?.active) return false;
  if (typeof actor.specialReady === 'function' && !actor.specialReady()) return false;
  if (typeof G_matchIsPlaying === 'function' && !G_matchIsPlaying()) return false;
  return true;
}

let G_matchIsPlaying = () => true;

// Advances the special. Returns the events the caller should apply, so the
// caller stays the owner of actor state and of the projectile list.
export function stepTrizooka(actor, dt, System) {
  const s = actor.s3Trizooka;
  if (!s?.active) return { events: [] };
  // dt 0 is a no-op: no time passes, no shot is produced.
  if (!(dt > 0)) return { events: [] };
  s.t += dt;
  const events = [];
  if (s.t >= s.nextShotAt && s.shots < TRIZOOKA.shots) {
    s.shots += 1;
    s.nextShotAt = s.t + (s.shots === 1 ? TRIZOOKA.startDelay : TRIZOOKA.repeatFrame);
    const fired = throwVolley(System, actor, s.descriptor);
    events.push({ type: 'volley', shot: s.shots, projectiles: fired });
  }
  if (s.t >= TRIZOOKA.duration) {
    s.active = false;
    events.push({ type: 'done' });
  }
  return { events };
}

// Death, reset, weapon change and disposal must drop the token permanently.
export function disposeTrizooka(actor) {
  if (actor) actor.s3Trizooka = null;
}

export function startTrizooka(actor) {
  if (!canActivateTrizooka(actor)) return null;
  actor.s3Trizooka = newTrizookaState();
  actor.s3Trizooka.active = true;
  return actor.s3Trizooka;
}

// ---- install ----------------------------------------------------------------

export function installKitTrizooka(api, profile) {
  const { SPECIALS, Projectiles, G } = api || {};
  if (!SPECIALS || !Projectiles) throw new Error('INKWAVE trizooka patch needs SPECIALS and Projectiles');
  G_matchIsPlaying = () => G?.match?.playing?.() ?? true;

  const existing = SPECIALS[TRIZOOKA_ID] || { id: TRIZOOKA_ID, name: 'Trizooka' };
  Object.assign(existing, {
    id: TRIZOOKA_ID,
    cost: TRIZOOKA_KIT_COST,
    duration: TRIZOOKA.duration,
    shots: TRIZOOKA.shots,
    projectileDescriptor: trizookaProjectileDescriptor,
    trizooka: true,
  });
  SPECIALS[TRIZOOKA_ID] = existing;

  if (api.SUB) api.SUB.__trizookaNote = 'sub weapons are owned by kit-subs.mjs';

  return {
    installKitTrizooka, trizookaSpecialWeapon, trizookaProjectileDescriptor,
    startTrizooka, stepTrizooka, canActivateTrizooka, disposeTrizooka, throwVolley,
    newTrizookaState, VOLLEY_CONFIG,
  };
}

export default installKitTrizooka;
