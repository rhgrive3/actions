// Super Jump state rules. The trajectory stays owned by native Actor; these
// connections run in the same fixed simulation tick as its normal controller.
import * as THREE from 'three';
import { G } from '../../../src/core/ctx.js';
import { PLAYER } from '../../../src/config.js';

// Preserve the public game's existing human-form boundary, NOT a measured S3
// frame value. Nintendo confirms pre-landing attacks but not their exact gate.
export const SUPERJUMP_MAIN_PROGRESS = 0.82;

// Splatoon 3 Ver. 11.0.0 Stealth Jump flight-only penalty (#272).
// Current public measurement resolves the stage-forward travel coordinate from
// the difference of XZ distances to two stage-specific reference foci. Their
// exact placement is not published and is not equivalent to ordinary spawn pads,
// so only an explicitly calibrated level.stealthJumpFoci pair is accepted. This
// deliberately fails closed rather than guessing anchors for INKWAVE stages.
// The verified curve is 0F through 60 units, linear to +60F at 100 units, then
// capped. Vertical displacement is intentionally excluded.
export const STEALTH_JUMP_DISTANCE_MIN = 60;
export const STEALTH_JUMP_DISTANCE_MAX = 100;
export const STEALTH_JUMP_EXTRA_FRAMES_MAX = 60;

function xzDistance(a, b) {
  return Math.hypot((a?.x || 0) - (b?.x || 0), (a?.z || 0) - (b?.z || 0));
}

export function stealthJumpLongitudinalDistance(from, to, level = G.level) {
  const refs = level?.stealthJumpFoci;
  if (!from || !to || !refs?.[0] || !refs?.[1]) return 0;
  const axis = p => (xzDistance(p, refs[0]) - xzDistance(p, refs[1])) * 0.5;
  return Math.abs(axis(to) - axis(from));
}

export function stealthJumpExtraFrames(a, from, to, level = G.level) {
  if (!a?.s3?.modifiers?.stealthJump) return 0;
  const d = stealthJumpLongitudinalDistance(from, to, level);
  if (d <= STEALTH_JUMP_DISTANCE_MIN) return 0;
  if (d >= STEALTH_JUMP_DISTANCE_MAX) return STEALTH_JUMP_EXTRA_FRAMES_MAX;
  return (d - STEALTH_JUMP_DISTANCE_MIN) /
    (STEALTH_JUMP_DISTANCE_MAX - STEALTH_JUMP_DISTANCE_MIN) * STEALTH_JUMP_EXTRA_FRAMES_MAX;
}

export function stealthJumpExtraTime(a, from, to, level = G.level) {
  return stealthJumpExtraFrames(a, from, to, level) / 60;
}

// S3 starts the Super Jump clock from the form the destination was confirmed
// in: a 1F term while already swimming, 22F from humanoid form. It sits in
// front of the unchanged 80F charge wait and is never folded into
// jumpChargeTime, so Quick Super Jump still scales only charge and flight.
// The admission form is captured by Actor.superJump() before it forces squid.
export function superJumpStartupTime(a) {
  const s3 = a.s3, s = a.superJumpState;
  const frames = s && s.startForm === 'kid' ? s3.jumpStartupHumanoidF : s3.jumpStartupSwimF;
  return (frames || 0) / 60;
}

export function rememberSuperJumpGround(a) {
  if (!a.alive || !a.grounded || a.climbing || a.superJumpState?.phase === 'flight') return;
  if (!Number.isFinite(a.pos.x + a.pos.y + a.pos.z)) return;
  (a.superJumpGround ||= new THREE.Vector3()).copy(a.pos);
}

export function prepareSuperJump(a, dt) {
  const s = a.superJumpState;
  a.form = 'squid';
  a.vel.x = a.vel.z = 0;
  // A wall is support only while the same nearby face is still inked. Do not
  // trust a captured climbing flag after the wall is repainted or disappears.
  if (s.wallSupport) {
    const origin = a.pos.clone().add(new THREE.Vector3(0, .3, 0));
    const direction = s.wallSupport.clone().negate();
    const h = G.physics.raycast(origin, direction, PLAYER.radius + .35, a.wallHit);
    if (h.hit && Math.abs(h.normal.y) < .5 && h.face >= 0 && G.paint.sample(h.face, h.u, h.v) - 1 === a.team) {
      a.vel.set(0, 0, 0); a.grounded = false; return true;
    }
    s.wallSupport = null;
  }
  // Preparation locks horizontal input, not gravity. Human collision admission
  // retains grate/rail support even though the charge is rendered as a squid.
  // S3 composition (#820) removed the universal radial spawn clamp from ordinary
  // movement; #848 removes it from Super Jump charge as well so a legal
  // in-spawn position is not projected to the old 4.2 boundary on charge start.
  a._integrate(dt, false, false);
  if (a._checkFallDeath()) return false;
  rememberSuperJumpGround(a);
  a._probeGround();
  return a.grounded;
}

export function superJumpTarget(target, out) {
  if (!target?.pos?.isVector3) {
    if (!target?.isVector3 || ![target.x, target.y, target.z].every(Number.isFinite)) return false;
    out.copy(target); return true;
  }
  if (!target.alive) return false;
  rememberSuperJumpGround(target);
  // Never silently fall back to an airborne coordinate. Newly seen airborne
  // network peers have no known support yet and cannot be resolved safely.
  if (!target.superJumpGround) return false;
  out.copy(target.superJumpGround);
  return true;
}

export function updateSuperJumpMain(a, dt, firePressed) {
  const s = a.superJumpState;
  // #528: sub aim is a presentation/hold state, never throw authority in flight.
  // Early flight stays disarmed until the existing humanoid descent window.
  if (!a.alive || (s && (s.phase !== 'flight' || s.t / s.dur <= SUPERJUMP_MAIN_PROGRESS)) || a.form !== 'kid') {
    if (s && a.weaponRunner) a.weaponRunner.aimingSub = false;
    return;
  }
  const buffered = a.fireBuffer > 0;
  a.weaponRunner.update(dt, {
    fire: a.intent.fire || buffered,
    firePressed: firePressed || buffered,
    sub: !!a.intent.sub,
    subReleased: false, // no projectile, no ink debit before landing
  });
  a.fireBuffer = 0;
}
