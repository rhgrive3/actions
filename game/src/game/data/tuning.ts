// Global simulation constants. All frame-based reference data (60fps) is converted to seconds here.
// Reference: Splatoon 3 Ver. 11.3.0 (see docs/REFERENCE_MATRIX.md for provenance + confidence)

export const FIXED_DT = 1 / 60;
export const F = (frames: number) => frames / 60; // frames -> seconds

/** World scale: 1 unit = 1 metre. Inkling stands ~1.5 m tall (head to feet). */
export const CHARACTER = {
  height: 1.5,
  radius: 0.32,
  eyeHeight: 1.25,
  swimHeight: 0.35,
  swimRadius: 0.28,
};

export const MOVEMENT = {
  // Humanoid — base 0.96 DU/f run speed → normalised to 4.8 m/s at our scale
  runSpeed: 4.8,
  runAccel: 32, // reaches full speed in ~9 frames (measured from footage: 8–10f)
  runDecel: 40,
  turnResponse: 14, // body yaw follow rate (1/s)
  airControl: 0.55, // fraction of ground acceleration available airborne
  airMaxSpeed: 4.8,
  jumpVelocity: 6.9, // ~ 0.85 m apex, 0.5 s airtime (footage: 30f airtime)
  gravity: 22,
  fallGravityMul: 1.15,
  stepHeight: 0.55,
  groundFriction: 0.85,
  // Swim form — 1.92 DU/f = 2.0× run
  swimSpeed: 9.6,
  swimAccel: 46,
  swimDecel: 52,
  swimEnterTime: F(8), // squid transform anticipation + morph
  swimExitTime: F(6),
  swimJumpVelocity: 7.6,
  wallSwimSpeed: 5.2,
  wallSwimAccel: 30,
  wallDetachPush: 1.6,
  // Unpainted ground in squid form — you crawl very slowly
  squidUnpaintedSpeed: 1.8,
  // Enemy ink
  enemyInkSpeed: 1.2, // 0.24 DU/f ratio ≈ 0.25× run
  enemyInkDamagePerSec: 18, // 0.3/f, capped
  enemyInkDamageCap: 40,
  enemyInkNoJumpHeightMul: 0.55,
  // Squid Roll / Surge
  squidRollSpeed: 11.5,
  squidRollTime: F(20),
  squidRollArmorTime: F(12),
  squidSurgeChargeTime: F(30),
  squidSurgeLaunchVelocity: 12,
};

export const HEALTH = {
  max: 100,
  recoveryDelay: F(60), // damage recovery begins 60f after last hit (S3 data)
  recoveryRateKid: 100 / F(180),
  recoveryRateSquid: 100 / F(60), // submerged heals much faster (footage)
  respawnTime: 8.5, // splat → back on stage (incl. respawn animation)
  splatAnimTime: 1.2,
};

export const INK_TANK = {
  max: 100,
  refillSquidTime: 3.0, // empty → full submerged in ink: 3 s
  refillKidTime: 10.0,
  refillDelay: F(20), // 20 frames after last shot (shooter class)
};

export const CAMERA = {
  fov: 60, // Splatoon 3 default vertical FOV measured ≈ 60°
  distance: 3.6,
  shoulderOffset: 0.55,
  heightOffset: 1.35,
  pitchMin: -55,
  pitchMax: 65,
  horizontalFrequency: 6.0, // second-order dynamics
  verticalFrequency: 3.2, // vertical is softer — camera does not copy jump Y
  aimFrequency: 30,
  swimDistance: 3.9,
  swimHeightOffset: 1.2,
  chargerFovAdd: -8,
  collisionRadius: 0.25,
  minDistance: 0.9,
  touchSensitivity: 0.32, // degrees per CSS pixel dragged
  gyroSensitivity: 1.0,
  mouseSensitivity: 0.12,
};

export const MATCH = {
  duration: 180,
  introTime: 3.0,
  finalMinuteWarning: 60,
  teams: 2,
  playersPerTeam: 4,
};

export const TEAM_COLORS: { name: string; hex: number; css: string }[] = [
  { name: "Yellow", hex: 0xe6e200, css: "#e6e200" },
  { name: "Blue", hex: 0x4a3fdc, css: "#4a3fdc" },
];
