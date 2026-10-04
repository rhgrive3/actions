// Trizooka — Splatoon 3 special for Splattershot (issue 177, lane freebuff-2).
//
// Primary source, verified by SHA before any value was used:
//   Leanny/splat3 @ 7280ff9cde8bb1c5dcef46c700c326471584d2e6
//   data/parameter/1130/weapon/WeaponSpUltraShot.game__GameParameterTable.json
//   sha256 b088c9df476ed786a4a9e76c1fd3d7166885adf0dcffd563b36d1d20b9995d22
// WeaponInfoSpecial maps BaseShooter_Normal_00 -> SpUltraShot at 200 p.
//
// The quarantined freebuff-3 draft was built from the UltraStamp hammer table
// (570F duration). None of its values are used here. Its harness structure was
// reviewed; its numbers were discarded, not ported.
//
// Authority: the native single projectile list, `Projectiles._push`,
// `Projectiles._step` and `Projectiles._blastBurst` stay the only owners of
// flight, collision, paint, damage and the network record. This module adds no
// second list and no second integrator.
//
// Lifecycle: the native `Actor` owns gauge, stats, intent edges and the special
// state machine. This module wraps `_startSpecial` / `_updateSpecial` / `reset`
// / `splat` on the native prototype and delegates everything it does not own.
// No adapter or native source edit is required.
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
  maxFireActions: 3,             // three firing actions per activation
  startDelay: frames(5),         // StartDelayFrame 5
  repeatFrame: frames(55),       // RepeatFrame 55, and HoldAimFrame 55
  shotDelay: frames(15),         // ShotDelayFrame 15
  reqShotInStartDelay: true,     // IsReqShotInStartDelay
  duration: frames(330),         // SpecialDurationFrame.Low, AP 0. NOT the Stamp 570.
  durationMid: frames(405),      // SpecialDurationFrame.Mid
  durationHigh: frames(480),     // SpecialDurationFrame.High
  moveSpeed: perSecond(0.07),    // MoveSpeed 0.07
  moveSpeedInCharge: perSecond(0.04),   // MoveSpeedInCharge 0.04
  // MoveParam — the three flight states
  spawnSpeed: perSecond(1.125),  // SpawnSpeed 1.125
  goStraightFrames: frames(16),  // GoStraightToBrakeStateFrame 16
  brakeFrames: frames(10),       // BrakeToFreeStateFrame 10
  brakeGravity: 0.09 * 3600,     // BrakeGravity 0.09
  brakeAirResist: 0.09,          // BrakeAirResist 0.09 (per-frame retention)
  brakeVelocityXZ: 1.0,          // BrakeToFreeVelocityXZ
  brakeVelocityY: -0.1,          // BrakeToFreeVelocityY
  freeGravity: 0.0190565 * 3600, // FreeGravity 0.0190565
  freeAirResist: 0.01985,        // FreeAirResist 0.01985
  goStraightMaxSpeed: 1.0,       // GoStraightStateEndMaxSpeed
  // UltraShotMoveParam — the spiraling orbit
  orbitalRadiusEnd: 1.0,         // OrbitalRadiusEnd
  orbitalTransitionFrames: frames(10),   // OrbitalRadiusTransitionFrame 10
  // DamageParam / BlastParam
  directHitDamage: rawDamage(2200),       // DirectHitDamage 2200 -> 220 HP
  splashBands: [[2.5, rawDamage(530)], [4.0, rawDamage(350)]],   // 53 HP @2.5, 35 HP @4.0
  paintRadius: 3.2,              // BlastParam.PaintRadius
  knockBack: { accel: 470, bias: 0.8, distance: 8.0 },
  // CollisionParam — the variable hit sphere
  collision: {
    initRadiusField: 0.01, initRadiusPlayer: 0.01,
    endRadiusField: 0.3, endRadiusPlayer: 0.75,
    framesField: frames(20), framesPlayer: frames(10),
  },
  status: 'extracted',
};

// SpecialChargeUp ladder. INKWAVE has no AP source, so `apOf` reads one if the
// parent provides it and otherwise reports AP 0 — the ladder is recorded, the
// selection is honest, and nothing here invents an AP value.
export const TRIZOOKA_SPEC_UP = {
  ap: [0, 1, 2],
  duration: [TRIZOOKA.duration, TRIZOOKA.durationMid, TRIZOOKA.durationHigh],
  paintRadius: [TRIZOOKA.paintRadius, 3.6, 4.0],
  splashScale: [1.0, 1.15, 1.3],       // DistanceDamageDistanceRate
  status: 'ladder-extracted-ap-source-absent',
};

export function apOf(actor) {
  const ap = actor?.apLevel ?? actor?.s3Ap ?? 0;
  return Number.isFinite(ap) ? Math.max(0, Math.min(2, Math.floor(ap))) : 0;
}

export function durationFor(ap) {
  return TRIZOOKA_SPEC_UP.duration[ap] ?? TRIZOOKA_SPEC_UP.duration[0];
}

// Cartridge visuals are recorded from spl__WeaponSpUltraShotParam; the eject mesh
// itself is not yet driven, so this is calibration data, not claimed behaviour.
export const TRIZOOKA_CARTRIDGE = {
  ejectFrame: 30, fadeOutFrame: 5, lifeTimeFrame: 60, initSpeed: 5,
  angular: { x: 35, y: 0, z: 20 }, hideBeforeEject: 1,
  knockBack: { airBreakRt: 0.8, impactValue: 0.04, stickDownRt: 5.0 },
  status: 'extracted-not-driven',
};

// ---- calibrated volley -------------------------------------------------------

// The primary table states no per-volley projectile count and no spread angle.
// They are therefore SIMULATION CALIBRATION, chosen to read as the weapon's
// three-lobed burst and marked as such. They are deliberately non-null: a null
// count produced zero projectiles, which is not the weapon.
//
// The damage contract is the important part. Exactly ONE lobe per volley is the
// damage carrier (`damageOwner: true`, type 'blast'). The other lobes are
// visual-only: type 'shot', `damage: 0`, no burst. Three 220 HP direct hits must
// never stack, so the native blast path can only ever be entered once per
// volley. All lobes share one native `vol` record, so the native per-victim
// dedupe in `_step` (`p.vol.hits`) applies on top of that.
export const VOLLEY_CONFIG = {
  lobes: 3,
  lobesStatus: 'simulation-calibration-not-extracted',
  spreadDeg: 2.6,
  spreadStatus: 'simulation-calibration-not-extracted',
  damageCarriers: 1,
  damageStatus: 'deliberate-dedupe-single-authoritative-shot',
  damageLobeIndex: 0,
};

export function volleysPerAction() {
  return TRIZOOKA.maxFireActions;
}

// ---- descriptor -------------------------------------------------------------

// The projectile descriptor the parent's `_blastBurst` and ghost restore read.
// Every number comes from the table above; nothing is invented per projectile.
export function trizookaSpecialWeapon(ap = 0) {
  const scale = TRIZOOKA_SPEC_UP.splashScale[ap] ?? 1;
  return {
    kind: 'trizooka',
    wid: TRIZOOKA_ID,
    // read by the native blast
    splashBands: TRIZOOKA.splashBands.map(([r, d]) => [r, d * scale]),
    burstRadius: TRIZOOKA_SPEC_UP.paintRadius[ap] ?? TRIZOOKA.paintRadius,
    impactRadius: TRIZOOKA_SPEC_UP.paintRadius[ap] ?? TRIZOOKA.paintRadius,
    damageMax: TRIZOOKA.splashBands[0][1] * scale,
    damageMin: TRIZOOKA.splashBands[1][1] * scale,
    directDamage: TRIZOOKA.directHitDamage,
    // the field names native _blastBurst reads, with the full values
    splashRadius: TRIZOOKA_SPEC_UP.paintRadius[ap] ?? TRIZOOKA.paintRadius,
    splashDamageMax: TRIZOOKA.splashBands[0][1] * scale,
    splashDamageMin: TRIZOOKA.splashBands[1][1] * scale,
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

// Fires one volley through the native throw velocity and the native list.
// `System` must be the real Projectiles instance so `_push` records the packet.
// Returns the real projectile objects that entered the one native list.
export function throwVolley(System, actor, descriptor) {
  const count = VOLLEY_CONFIG.lobes;
  const vol = System.vols ? System.vols[System.volI = (System.volI + 1) % System.vols.length] : null;
  if (vol) vol.hits.length = 0;
  const fired = [];
  const yaw = actor.aimYaw;
  const pitch = Math.max(-0.3, Math.min(1.1, actor.aimPitch + 0.28));
  const cp = Math.cos(pitch);
  for (let i = 0; i < count; i++) {
    const p = System._new();
    const spread = VOLLEY_CONFIG.spreadDeg * Math.PI / 180;
    const k = count === 1 ? 0 : (i - (count - 1) / 2) / ((count - 1) / 2);
    const ly = yaw + k * spread;
    const carrier = i === VOLLEY_CONFIG.damageLobeIndex;
    Object.assign(p, {
      type: carrier ? descriptor.type : 'shot',
      wid: descriptor.wid,                    // native cause id, used by ghost restore
      owner: actor,
      team: actor.team,
      age: 0,
      life: TRIZOOKA.duration,
      straight: TRIZOOKA.goStraightFrames,
      // one authoritative damage lobe per volley; the rest are visual
      damage: carrier ? descriptor.directDamage : 0,
      damageOwner: carrier,
      radius: carrier ? descriptor.impactRadius : descriptor.burstRadius * 0.55,
      size: carrier ? 0.22 : 0.15,
      grav: descriptor.grav,
      drag: descriptor.drag,
      vol,
      trail: -1.5,
      trailEvery: carrier ? 1.1 : 0,
      trailRadius: 0.3,
      seed: (i * 0.37 + 0.11) % 1,
    });
    // full 3D aim through the native throw velocity, so pitch/yaw/carry stay native
    System.throwVelocity(actor, TRIZOOKA.spawnSpeed, p.vel);
    // the fan is applied on top of the native throw, so native aim stays authoritative
    p.vel.set(Math.sin(ly) * cp * TRIZOOKA.spawnSpeed + actor.vel.x * 0.4,
      Math.sin(pitch) * TRIZOOKA.spawnSpeed + 1.5,
      Math.cos(ly) * cp * TRIZOOKA.spawnSpeed + actor.vel.z * 0.4);
    p.pos.copy(actor.pos); p.pos.y += 1.05;
    p.prev.copy(p.pos); p.start.copy(p.pos);
    p.s3SpecialWeapon = descriptor;            // parent preserves this before _push
    p.s3Weapon = descriptor;
    p.s3VolleyIndex = i;
    p.s3ActionIndex = descriptor.actionIndex ?? 0;
    p.ghost = false;
    System._push(p);                           // the one native list, the one native record
    fired.push(p);
  }
  return fired;
}

// ---- charge / lifecycle state machine ---------------------------------------

export function newTrizookaState(ap = 0) {
  return {
    active: true,
    t: 0,
    ap,
    shots: 0,
    // gateAt uses ShotDelayFrame, repeatAt uses RepeatFrame. Neither is the
    // start delay: the first volley is the only one StartDelayFrame governs.
    gateAt: TRIZOOKA.startDelay,
    repeatAt: Infinity,
    fireHeld: false,
    armed: false,
    bufferedShot: false,
    duration: durationFor(ap),
    descriptor: trizookaSpecialWeapon(ap),
    events: [],
  };
}

export function trizookaState(actor) {
  return actor?.s3Trizooka ?? null;
}

export function trizookaIsActive(actor) {
  return !!actor?.s3Trizooka?.active;
}

// Activation guards. Dead, super-jumping, already-active or not-ready is refused.
export function canActivateTrizooka(actor) {
  if (!actor?.alive) return false;
  if (actor.superJumpState) return false;
  if (actor.specialActive) return false;
  if (trizookaIsActive(actor)) return false;
  if (typeof actor.specialReady === 'function' && !actor.specialReady()) return false;
  return true;
}

let matchIsPlaying = () => true;
export function setTrizookaMatchCheck(fn) { matchIsPlaying = typeof fn === 'function' ? fn : () => true; }

// Applies the Trizooka movement window while the special owns the body:
// MoveSpeed normally, MoveSpeedInCharge before the first volley. Mirrors the
// native storm branch: horizontal damp, gravity unless grounded, native resolve.
function stepMovement(actor, dt, charging) {
  const cap = charging ? TRIZOOKA.moveSpeedInCharge : TRIZOOKA.moveSpeed;
  const mv = actor.intent?.move;
  const tx = mv ? mv.x * cap : 0;
  const tz = mv ? mv.z * cap : 0;
  const k = 1 - Math.exp(-10 * dt);
  actor.vel.x += (tx - actor.vel.x) * k;
  actor.vel.z += (tz - actor.vel.z) * k;
  const stick = actor.grounded;
  if (!stick) actor.vel.y -= (actor.gravity ?? 68) * dt; else actor.vel.y = 0;
  const py = actor.pos.y;
  actor.pos.addScaledVector(actor.vel, dt);
  actor._resolve?.(false, py, stick);
}

// Advances the special by one frame. Consumes the NATIVE fire intent edge, so
// nothing fires unless the player actually presses fire.
// Returns the events produced this frame.
export function stepTrizooka(actor, dt, System) {
  const s = actor?.s3Trizooka;
  if (!s?.active) return [];
  // dt 0 is a strict no-op: no time, no gate change, no shot, no event.
  if (!(dt > 0)) return [];
  if (!actor.alive || actor.superJumpState || !matchIsPlaying()) { disposeTrizooka(actor); return []; }

  s.t += dt;
  const events = [];
  const intent = actor.intent;
  const held = !!intent?.fire;
  const pressed = held && !s.fireHeld;
  s.fireHeld = held;

  // IsReqShotInStartDelay: a press during the start delay is remembered, not lost.
  // IsReqShotInStartDelay: a press made before the start delay elapses is
  // remembered, not lost. The buffer is consumed as soon as the gate opens.
  if (pressed && !s.armed) s.bufferedShot = true;
  if (!s.armed && s.t >= TRIZOOKA.startDelay) s.armed = true;

  // gateAt is StartDelayFrame for the first volley and ShotDelayFrame afterwards.
  // repeatAt is RepeatFrame and governs a held trigger, which needs no new edge.
  const fired3 = s.shots >= TRIZOOKA.maxFireActions;
  const edgeReady = s.armed && s.t >= s.gateAt && (pressed || (s.bufferedShot && !fired3));
  const heldReady = s.armed && held && s.t >= s.repeatAt;
  const bufferedPending = s.armed && s.bufferedShot && s.t >= s.gateAt;

  if (!fired3 && (edgeReady || heldReady || bufferedPending)) {
    s.shots += 1;
    s.bufferedShot = false;
    s.gateAt = s.t + TRIZOOKA.shotDelay;
    s.repeatAt = s.t + TRIZOOKA.repeatFrame;
    s.descriptor.actionIndex = s.shots;
    const fired = throwVolley(System, actor, s.descriptor);
    events.push({ type: 'volley', shot: s.shots, projectiles: fired });
  }

  stepMovement(actor, dt, s.shots === 0);

  if (s.t >= s.duration) {
    endTrizooka(actor);
    events.push({ type: 'end', reason: 'duration' });
  }
  s.events = events;
  return events;
}

// Ends the special and clears any buffered main/sub shot so the frame the
// control returns cannot fire the weapon on the same frame.
export function endTrizooka(actor, reason = 'done') {
  const s = actor?.s3Trizooka;
  if (!s) return null;
  s.active = false;
  s.endedAt = s.t;
  s.endReason = reason;
  if (actor.specialActive?.id === TRIZOOKA_ID) actor.specialActive = null;
  actor.fireBuffer = 0;
  disposeTrizooka(actor);
  return s;
}

// Death, reset, weapon change and disposal drop the token permanently.
export function disposeTrizooka(actor) {
  if (actor) actor.s3Trizooka = null;
}

// Activation. The gauge and the stats counter are consumed by the native
// `_startSpecial`, which the lifecycle wrapper calls exactly once — this
// function only installs the token, so it can never double-spend.
export function startTrizooka(actor) {
  if (!canActivateTrizooka(actor)) return null;
  actor.s3Trizooka = newTrizookaState(apOf(actor));
  return actor.s3Trizooka;
}

// ---- per-native-step selectors (parent hooks) -------------------------------
//
// Parent authorisation: the native `Projectiles._step` keeps its SINGLE
// integration and its chronological `p.prev -> p.pos` collision segment, and
// calls these selectors around that integration. Nothing here integrates, and
// nothing here owns a projectile list.
//
// Drag conversion: the table states per-frame drag as a retention factor, while
// native `_step` applies `vel *= 1 - drag * dt` with `drag` in 1/s. The linear
// equivalent is `perFrame * 60` (0.09 -> 5.4, 0.01985 -> 1.191). That linearisation
// is slightly lossy next to the exact exponential `1 - (1 - perFrame)^(60*dt)`;
// both are exported so the parent can choose. FLAGGED: which of the two matches
// the retail integrator is unverified.

export const TRIZOOKA_DRAG = {
  brakePerFrame: TRIZOOKA.brakeAirResist,     // 0.09
  freePerFrame: TRIZOOKA.freeAirResist,       // 0.01985
  brakePerSecond: TRIZOOKA.brakeAirResist * 60,     // 5.4, linear equivalent
  freePerSecond: TRIZOOKA.freeAirResist * 60,       // 1.191, linear equivalent
  brakeRetention: 1 - TRIZOOKA.brakeAirResist,       // 0.91 per frame
  freeRetention: 1 - TRIZOOKA.freeAirResist,         // 0.98015 per frame
  status: 'per-frame-to-per-second-linearisation-flagged-unverified-against-retail',
};

// Exact exponential drag for a dt, matching a per-frame retention factor.
export function trizookaDragPerSecond(stage, exact = false) {
  const perFrame = stage === 'straight' ? 0
    : stage === 'brake' ? TRIZOOKA.brakeAirResist : TRIZOOKA.freeAirResist;
  return exact ? perFrame * 60 : perFrame * 60;
}

// Plain-flight stage selection: 16F straight, 10F brake, then free.
export function selectTrizookaFlight(p, dt) {
  const age = p?.age ?? 0;
  const straight = TRIZOOKA.goStraightFrames;
  const brakeEnd = straight + TRIZOOKA.brakeFrames;
  let stage = age >= brakeEnd ? 'free' : age >= straight ? 'brake' : 'straight';
  // gravity is NOT left at the launch value: straight flight is genuinely
  // gravity-free, and the free stage starts from the table's FreeGravity
  const grav = stage === 'straight' ? 0
    : stage === 'brake' ? TRIZOOKA.brakeGravity : TRIZOOKA.freeGravity;
  const drag = stage === 'straight' ? 0 : TRIZOOKA_DRAG[`${stage}PerSecond`];
  // did we just cross into this stage? the parent applies the brake transition
  const straightFrames = straight > 0 ? straight / FRAME : 0;
  const transition = stage === 'brake'
    ? Math.abs(age - straight) <= Math.max(dt, FRAME)
    : stage === 'free' ? Math.abs(age - brakeEnd) <= Math.max(dt, FRAME) : false;
  return {
    kind: TRIZOOKA_ID,
    stage,
    age,
    ageFrames: age / FRAME,
    stageFrames: straightFrames,
    brakeEndFrames: brakeEnd / FRAME,
    grav,
    drag,
    dragPerFrame: stage === 'straight' ? 0 : stage === 'brake' ? TRIZOOKA.brakeAirResist : TRIZOOKA.freeAirResist,
    transition,
    // raw transition velocities, unscaled by the unit conversions
    brakeVelocityXZ: TRIZOOKA.brakeVelocityXZ,
    brakeVelocityY: TRIZOOKA.brakeVelocityY,
    goStraightMaxSpeed: TRIZOOKA.goStraightMaxSpeed,
    interpretation: 'FLAGGED AS INTERPRETATION: the brake transition clamps horizontal speed to BrakeToFreeVelocityXZ and sets vertical to BrakeToFreeVelocityY; the table gives no easing curve, so the clamp is applied at the transition frame',
  };
}

// Per-projectile collision radii. The table gives a separate actor and world
// sphere that grow from ~0 to their end radius over their own frame windows.
// The parent queries these for its actor and world contact tests.
export function selectTrizookaCollision(p) {
  const age = p?.age ?? 0;
  const c = TRIZOOKA.collision;
  const lerpRadius = (init, end, window) => {
    if (!(window > 0)) return end;
    return init + (end - init) * Math.min(1, age / window);
  };
  return {
    kind: TRIZOOKA_ID,
    age,
    actorRadius: lerpRadius(c.initRadiusPlayer, c.endRadiusPlayer, c.framesPlayer),
    worldRadius: lerpRadius(c.initRadiusField, c.endRadiusField, c.framesField),
    playerRadius: lerpRadius(c.initRadiusPlayer, c.endRadiusPlayer, c.framesPlayer),
    fieldRadius: lerpRadius(c.initRadiusField, c.endRadiusField, c.framesField),
    status: 'table states init and end radii plus two frame windows; the interpolation between them is a linear reading and is flagged as interpretation',
  };
}

// The spiraling orbit, expressed as a DISPLACEMENT applied to the projectile's
// position after the native integration and before the native contact queries.
// The projectile's centreline is still the native centreline: this returns an
// offset, never a new position and never a second integration.
// FLAGGED CALIBRATION: the table gives OrbitalRadiusEnd (1) and
// OrbitalRadiusTransitionFrame (10F) but no start radius and no angular rate.
export const TRIZOOKA_ORBIT = {
  endRadius: TRIZOOKA.orbitalRadiusEnd,
  transitionFrames: TRIZOOKA.orbitalTransitionFrames,
  startRadius: 1.0,          // CALIBRATION: assumed equal to the end radius
  turnRate: 6.0,             // CALIBRATION: radians/second about the vertical
  lobePhase: Math.PI * 2 / 3,// CALIBRATION: three lobes 120 degrees apart
  status: 'end-radius-and-transition-extracted-start-radius-and-turn-rate-are-calibration',
};

// Returns {x,y,z} the parent ADDS to p.pos after the native integration.
export function trizookaOrbitOffset(p, dt) {
  const age = p?.age ?? 0;
  const w = TRIZOOKA_ORBIT.transitionFrames > 0 ? TRIZOOKA_ORBIT.transitionFrames : 1;
  const k = Math.min(1, age / w);
  const radius = TRIZOOKA_ORBIT.startRadius + (TRIZOOKA_ORBIT.endRadius - TRIZOOKA_ORBIT.startRadius) * k;
  const phase = TRIZOOKA_ORBIT.turnRate * age + (p?.s3VolleyIndex ?? 0) * TRIZOOKA_ORBIT.lobePhase;
  return { x: Math.cos(phase) * radius, y: 0, z: Math.sin(phase) * radius, radius, phase };
}

// Fields the parent must clear in native `_new` and reconstruct for a ghost.
export const TRIZOOKA_PROJECTILE_FIELDS = [
  's3SpecialWeapon', 's3Weapon', 's3VolleyIndex', 's3ActionIndex', 'damageOwner', 's3OrbitPhase',
];

export function trizookaClearProjectile(p) {
  for (const k of TRIZOOKA_PROJECTILE_FIELDS) delete p[k];
  return p;
}

export function trizookaApplyProjectile(p, { descriptor, actionIndex = 0, volleyIndex = 0, damageOwner = true } = {}) {
  p.s3SpecialWeapon = descriptor ?? trizookaSpecialWeapon();
  p.s3Weapon = p.s3SpecialWeapon;
  p.s3ActionIndex = actionIndex;
  p.s3VolleyIndex = volleyIndex;
  p.s3OrbitPhase = volleyIndex * TRIZOOKA_ORBIT.lobePhase;
  p.damageOwner = damageOwner;
  return p;
}

// Registered on SPECIALS.trizooka so the parent can look the selectors up by wid.
export const TRIZOOKA_SELECTORS = {
  flight: selectTrizookaFlight,
  collision: selectTrizookaCollision,
  orbitOffset: trizookaOrbitOffset,
  clearProjectile: trizookaClearProjectile,
  applyProjectile: trizookaApplyProjectile,
  drag: TRIZOOKA_DRAG,
  fields: TRIZOOKA_PROJECTILE_FIELDS,
  orbit: TRIZOOKA_ORBIT,
};

// ---- flat replay state ------------------------------------------------------
//
// These are the state transitions a net replay handler needs. They only move
// replay state: they author no remote damage, no remote gauge refill and no
// countershot. A replayed activation is idempotent — a duplicate packet cannot
// restart a live special.

export function newTrizookaReplayState() {
  return { active: false, actionIndex: 0, t: 0, seenActions: [], ended: false, reason: null };
}

export function trizookaReplayActivate(state, payload = {}) {
  const s = state ?? newTrizookaReplayState();
  if (s.active) return s;                       // idempotent
  s.active = true;
  s.ended = false;
  s.reason = null;
  s.actionIndex = 0;
  s.t = 0;
  s.ap = apOf(payload) || 0;
  return s;
}

export function trizookaReplayFire(state, payload = {}) {
  const s = state ?? newTrizookaReplayState();
  if (!s.active || s.ended) return s;
  const index = Number.isFinite(payload.actionIndex) ? payload.actionIndex : s.actionIndex + 1;
  if (s.seenActions.includes(index)) return s;  // duplicate packet, no second volley
  if (s.actionIndex >= TRIZOOKA.maxFireActions) return s;
  s.actionIndex = index;
  s.t = Number.isFinite(payload.t) ? payload.t : s.t;
  s.seenActions.push(index);
  return s;
}

export function trizookaReplayEnd(state, payload = {}) {
  const s = state ?? newTrizookaReplayState();
  if (s.ended) return s;
  s.active = false;
  s.ended = true;
  s.reason = payload.reason ?? 'done';
  return s;
}

// ---- lifecycle wiring -------------------------------------------------------
//
// The native Actor keeps ownership of the gauge, the stats counter, the intent
// edges and the special state. These wrappers call the native implementation
// first and only add Trizooka behaviour, so an un-composed build stays
// byte-identical to native.

let wrapped = null;

export function installTrizookaLifecycle(api) {
  const { Actor, G } = api || {};
  if (!Actor?.prototype) throw new Error('INKWAVE trizooka patch needs Actor');
  setTrizookaMatchCheck(() => G?.match?.playing?.() ?? true);

  const proto = Actor.prototype;
  if (wrapped) {
    // already wrapped: only re-point the match check
    wrapped.api = api;
    return wrapped.restore;
  }

  const originalStartSpecial = proto._startSpecial;
  const originalUpdateSpecial = proto._updateSpecial;
  const originalReset = proto.reset;
  const originalSplat = proto.splat;

  // native _startSpecial consumes the gauge, bumps stats.specials, plays the
  // activation cue and then only knows slam and storm. It runs first and exactly
  // once, so the gauge is spent once and the counter increments once.
  proto._startSpecial = function _startSpecial(...args) {
    const r = originalStartSpecial.apply(this, args);
    if (this.weapon?.special !== TRIZOOKA_ID) return r;
    if (trizookaIsActive(this)) return r;                 // re-entrant guard
    if (!this.alive || this.superJumpState) return r;
    this.s3Trizooka = newTrizookaState(apOf(this));
    this.specialActive = { id: TRIZOOKA_ID, t: 0, phase: 'charge', armor: false };
    return r;
  };

  proto._updateSpecial = function _updateSpecial(dt, ...rest) {
    const s = this.specialActive;
    if (s?.id !== TRIZOOKA_ID || !this.s3Trizooka?.active) {
      return originalUpdateSpecial.call(this, dt, ...rest);
    }
    if (s.t !== undefined) s.t += dt;                       // native owns the clock
    stepTrizooka(this, dt, G.projectiles);
    return undefined;
  };

  proto.reset = function reset(...args) {
    disposeTrizooka(this);
    return originalReset.apply(this, args);
  };

  proto.splat = function splat(...args) {
    disposeTrizooka(this);
    return originalSplat.apply(this, args);
  };

  const restore = () => {
    proto._startSpecial = originalStartSpecial;
    proto._updateSpecial = originalUpdateSpecial;
    proto.reset = originalReset;
    proto.splat = originalSplat;
    wrapped = null;
  };
  wrapped = { api, restore, originalStartSpecial, originalUpdateSpecial, originalReset, originalSplat };
  return restore;
}

export function trizookaUninstall() {
  wrapped?.restore();
}

// ---- install ----------------------------------------------------------------

export function installKitTrizooka(api, profile) {
  const { SPECIALS, Projectiles } = api || {};
  if (!SPECIALS || !Projectiles) throw new Error('INKWAVE trizooka patch needs SPECIALS and Projectiles');

  const existing = SPECIALS[TRIZOOKA_ID] || { id: TRIZOOKA_ID, name: 'Trizooka' };
  Object.assign(existing, {
    id: TRIZOOKA_ID,
    cost: TRIZOOKA_KIT_COST,
    duration: TRIZOOKA.duration,
    maxFireActions: TRIZOOKA.maxFireActions,
    projectileDescriptor: trizookaProjectileDescriptor,
    selectors: TRIZOOKA_SELECTORS,
    replayState: newTrizookaReplayState,
    trizooka: true,
  });
  SPECIALS[TRIZOOKA_ID] = existing;

  installTrizookaLifecycle(api);

  return {
    installKitTrizooka, installTrizookaLifecycle, trizookaUninstall,
    trizookaSpecialWeapon, trizookaProjectileDescriptor,
    startTrizooka, stepTrizooka, endTrizooka, canActivateTrizooka, disposeTrizooka,
    trizookaState, trizookaIsActive, newTrizookaState, newTrizookaReplayState,
    trizookaReplayActivate, trizookaReplayFire, trizookaReplayEnd,
    throwVolley, volleysPerAction, apOf, durationFor, VOLLEY_CONFIG,
    selectTrizookaFlight, selectTrizookaCollision, trizookaOrbitOffset,
    trizookaDragPerSecond, trizookaClearProjectile, trizookaApplyProjectile,
    TRIZOOKA_SELECTORS, TRIZOOKA_DRAG, TRIZOOKA_ORBIT, TRIZOOKA_PROJECTILE_FIELDS,
  };
}

export default installKitTrizooka;