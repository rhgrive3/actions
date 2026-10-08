// Source-guided shooter-family flight, independent of rendering/THREE.
// Reference: S3 11.3.0, Leanny/splat3@7280ff9cde8bb1c5dcef46c700c326471584d2e6.
// Length scale=1 is the existing project's calibration, NOT verified real-world metres.
// See reports/ink-flight-research.md for evidence, omitted defaults and model assumptions.
export const INK_HZ = 60;
export const INK_DT = 1 / INK_HZ;
export const INK_LENGTH_SCALE = 1;
export const INK_PROTOCOL = 'iw-ink-flight-1';
const EPS = 1e-9;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const mix = (a, b, t) => a + (b - a) * t;
function freeze(value) {
  for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child);
  return Object.freeze(value);
}

// Defaults below are from the original investigator's paramtable, not explicit
// fields in the pinned weapon JSON. Y-only brake exit follows that investigator's
// experiments; BrakeToFreeStateFrame/XZ are not assumed to be active conditions.
const motionDefaults = { brakeDrag: 0.36, brakeGravity: 0.07, freeDrag: 0.02, freeGravity: 0.016, freeVelocityY: -0.15 };
const paintDefaults = { near: 0.5, middle: 1.1, far: 20, angleLow: 10, angleHigh: 35, heightLow: 1.5, heightHigh: 10 };
export const INK_PROFILES = freeze({
  shooter: {
    weapon: 'Splattershot', version: '11.3.0',
    motion: { ...motionDefaults, speed: 2.266, straightFrames: 4, endSpeed: 1.493 },
    damage: { max: 36, min: 18, startFrame: 8, endFrame: 40 },
    collision: { field: 0.2, player: 0.285 }, guideFrame: 8,
    splash: { count: 1.5, splits: 8, forceNearest: [4], nearest: 1.2, spacing: 9.2,
      radius: 1.472, feetRadius: 2.0608, depthMax: 1.2, depthMin: 1, heightLow: 3, heightHigh: 10 },
    paint: { ...paintDefaults, widthNear: 1.93, widthMiddle: 1.93, widthFar: 1.71,
      depthMax: 2.24, depthMin: 1.31, depthMaxFall: 2.24, depthMinFall: 1.12, wallRadius: 1.56 },
  },
  dualies: {
    weapon: 'Splat Dualies', version: '11.3.0',
    motion: { ...motionDefaults, speed: 2.37, straightFrames: 3, endSpeed: 2.3425 },
    damage: { max: 30, min: 15, startFrame: 7, endFrame: 15 },
    collision: { field: 0.2, player: 0.31, playerLocked: 0.335 }, guideFrame: 7,
    splash: { count: 1, splits: 7, forceNearest: [], nearest: 1, spacing: 14,
      radius: 1.55825, feetRadius: 2.18155, depthMax: 1.2, depthMin: 1, heightLow: 3, heightHigh: 10 },
    paint: { ...paintDefaults, widthNear: 1.71, widthMiddle: 1.71, widthFar: 1.66,
      depthMax: 2.24, depthMin: 1.31, depthMaxFall: 2.24, depthMinFall: 1.12, wallRadius: 1.3 },
  },
  splatling: {
    weapon: 'Heavy Splatling', version: '11.3.0',
    motion: { ...motionDefaults, speed: 1.05, chargedSpeed: 2.1, firstChargeFrames: 48, straightFrames: 8, endSpeed: 1.5105 },
    damage: { max: 30, min: 15, startFrame: 11, endFrame: 19 },
    collision: { field: 0.2, player: 0.225 }, guideFrame: 11,
    splash: { count: 1, splits: 8, forceNearest: [], nearest: 0, spacing: 20,
      radius: 1.493, feetRadius: 1.85472, depthMax: 1.6, depthMin: 1.6, heightLow: 3, heightHigh: 10 },
    paint: { ...paintDefaults, heightLow: 3, widthNear: 2.226, widthMiddle: 2.226, widthFar: 2.102,
      depthMax: 1.83, depthMin: 1.17, depthMaxFall: 1.67, depthMinFall: 1.17, wallRadius: 1.3 },
  },
});

// Local, bounded reconstruction choices: not claimed to be Nintendo's particle
// integrator, particle meshes, precise pattern permutation or lifetime defaults.
export const INK_MODEL = freeze({
  headLife: 3, dropLife: 3, dropFieldRadius: 0.025, dropDrawRadius: 0.055,
  dropGravity: 0.016, dropDrag: 0.02,
  // These random-velocity bounds are documented shared SplashSpawnParam defaults.
  dropRandomX: 0.055, dropRandomY: 0.015, dropRandomZMin: 0.01, dropRandomZMax: 0.02,
  patternModel: 'descending uniform phases; forced-nearest replaces first slot',
  dropModel: 'seeded horizontal-local scatter, independent free-fall; no inherited head speed',
  paintModel: 'reference coefficients on native blob footprints; exact texture/height branching not reconstructed',
});

export function profileFor(weapon) { return INK_PROFILES[weapon?.inkFlightProfile] || null; }
export function seededUnit(seed, channel = 0) {
  let x = (Math.floor(seed * 0x100000000) ^ Math.imul(channel + 1, 0x9e3779b1)) >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d); x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b); x ^= x >>> 16;
  return (x >>> 0) / 0x100000000;
}

// Counter measures FIRED rounds, not produced droplets, frames or trigger edges.
// An occluded/unreached slot is consumed, never carried over to the next shot.
export function splashPlan(profile, sequence) {
  if (!Number.isSafeInteger(sequence) || sequence < 0) throw new RangeError('Nonnegative shot sequence required');
  const s = profile.splash, ordinal = sequence % s.splits + 1;
  const count = Math.floor((sequence + 1) * s.count + EPS) - Math.floor(sequence * s.count + EPS);
  const feet = ordinal === s.splits || s.forceNearest.includes(ordinal);
  const first = s.nearest + (feet ? 0 : s.spacing * (s.splits - ordinal) / s.splits);
  return { ordinal, count, feet, first: first * INK_LENGTH_SCALE, spacing: s.spacing * INK_LENGTH_SCALE };
}

export function launchSpeed(profile, chargeSeconds = 0) {
  const m = profile.motion;
  const speed = m.chargedSpeed === undefined ? m.speed : mix(m.speed, m.chargedSpeed, clamp(chargeSeconds * INK_HZ / m.firstChargeFrames, 0, 1));
  // Nominal charge curve; the exact Splatling speed RNG is not reconstructed.
  return speed * INK_HZ * INK_LENGTH_SCALE;
}

// Exactly one reference tick. Uses plain {x,y,z} vectors, so prediction, tests
// and runtime consume precisely the same force order and phase transitions.
export function advanceInkFrame(p, profile) {
  const m = profile.motion, v = p.vel;
  p.inkFrame++;
  if (p.inkFrame > m.straightFrames) {
    if (p.inkPhase === 0) {
      const speed = Math.hypot(v.x, v.y, v.z), cap = m.endSpeed * INK_HZ * INK_LENGTH_SCALE;
      if (speed > cap) { const k = cap / speed; v.x *= k; v.y *= k; v.z *= k; }
      p.inkPhase = 1;
    }
    const brake = p.inkPhase === 1, k = 1 - (brake ? m.brakeDrag : m.freeDrag);
    v.x *= k; v.y *= k; v.z *= k;
    v.y -= (brake ? m.brakeGravity : m.freeGravity) * INK_HZ * INK_LENGTH_SCALE;
    if (brake && v.y < m.freeVelocityY * INK_HZ * INK_LENGTH_SCALE) p.inkPhase = 2;
  }
  p.pos.x += v.x * INK_DT; p.pos.y += v.y * INK_DT; p.pos.z += v.z * INK_DT;
  p.age = p.inkFrame * INK_DT;
}

export function damageAt(profile, age) {
  const d = profile.damage, t = clamp((age * INK_HZ - d.startFrame) / (d.endFrame - d.startFrame), 0, 1);
  return mix(d.max, d.min, t);
}
export function referenceReach(profile, chargeSeconds = 10) {
  const p = { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: launchSpeed(profile, chargeSeconds) }, inkFrame: 0, inkPhase: 0 };
  for (let f = 0; f < profile.guideFrame; f++) advanceInkFrame(p, profile);
  return p.pos.z;
}

export function paintShape(profile, distance, angleDegrees, phase, dropHeight) {
  const p = profile.paint, d = distance / INK_LENGTH_SCALE;
  let radius = d <= p.middle ? mix(p.widthNear, p.widthMiddle, clamp((d - p.near) / (p.middle - p.near), 0, 1)) :
    mix(p.widthMiddle, p.widthFar, clamp((d - p.middle) / (p.far - p.middle), 0, 1));
  const high = phase === 0 ? p.depthMax : p.depthMaxFall;
  const low = phase === 0 ? p.depthMin : mix(p.depthMin, p.depthMinFall, clamp((dropHeight / INK_LENGTH_SCALE - p.heightLow) / (p.heightHigh - p.heightLow), 0, 1));
  const depth = mix(high, low, clamp((angleDegrees - p.angleLow) / (p.angleHigh - p.angleLow), 0, 1));
  return { radius: radius * INK_LENGTH_SCALE, stretch: Math.max(0, depth - 1) };
}
export function splashShape(profile, feet, dropHeight) {
  const s = profile.splash;
  return { radius: (feet ? s.feetRadius : s.radius) * INK_LENGTH_SCALE,
    stretch: mix(s.depthMax, s.depthMin, clamp((dropHeight / INK_LENGTH_SCALE - s.heightLow) / (s.heightHigh - s.heightLow), 0, 1)) - 1 };
}

// Reusable scratch prevents per-iteration allocations in the aim solver.
const probe = { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, inkFrame: 0, inkPhase: 0 };
function heightAt(profile, speed, pitch, distance) {
  probe.pos.x = 0; probe.pos.y = 0; probe.pos.z = 0;
  probe.vel.x = 0; probe.vel.y = Math.sin(pitch) * speed; probe.vel.z = Math.cos(pitch) * speed;
  probe.inkFrame = 0; probe.inkPhase = 0;
  for (let f = 0; f < INK_MODEL.headLife * INK_HZ; f++) {
    const z = probe.pos.z, y = probe.pos.y;
    advanceInkFrame(probe, profile);
    if (probe.pos.z >= distance) return mix(y, probe.pos.y, (distance - z) / Math.max(EPS, probe.pos.z - z));
  }
  return NaN;
}
// Preserve the app's existing camera convergence, but never solve with the old
// weak-drag trajectory. Beyond guide reach, no artificial long-range lofting.
export function correctInkAim(profile, from, dir, target, speed, maxDistance) {
  const dx = target.x - from.x, dz = target.z - from.z, distance = Math.hypot(dx, dz);
  const h = Math.hypot(dir.x, dir.z);
  if (distance < 1.5 || distance > maxDistance || h < EPS) return false;
  const dy = target.y - from.y, original = Math.atan2(dir.y, h);
  let a = original, ea = heightAt(profile, speed, a, distance) - dy;
  if (!Number.isFinite(ea)) return false;
  let b = clamp(a - Math.atan2(ea, distance), -1.2, 1.2);
  let eb = heightAt(profile, speed, b, distance) - dy;
  for (let i = 0; i < 5 && Math.abs(eb) > 0.005; i++) {
    if (!Number.isFinite(eb) || Math.abs(eb - ea) < EPS) return false;
    const next = clamp(b - eb * (b - a) / (eb - ea), -1.2, 1.2);
    a = b; ea = eb; b = next; eb = heightAt(profile, speed, b, distance) - dy;
  }
  if (!Number.isFinite(eb) || Math.abs(eb) > 0.025 || Math.abs(b - original) > 0.35) return false;
  const cp = Math.cos(b); dir.x = dir.x / h * cp; dir.z = dir.z / h * cp; dir.y = Math.sin(b);
  return true;
}
