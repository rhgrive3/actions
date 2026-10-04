// Super Jump state rules. The trajectory stays owned by native Actor; these
// connections run in the same fixed simulation tick as its normal controller.
import * as THREE from 'three';
import { G } from '../../../src/core/ctx.js';
import { PLAYER } from '../../../src/config.js';

// Preserve the public game's existing human-form boundary, NOT a measured S3
// frame value. Nintendo confirms pre-landing attacks but not their exact gate.
export const SUPERJUMP_MAIN_PROGRESS = 0.82;

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
  a._integrate(dt, false, false);
  a._spawnBarrier();
  if (a._checkFallDeath()) return false;
  rememberSuperJumpGround(a);
  a._probeGround();
  return a.grounded;
}

export function superJumpTarget(target, out) {
  if (!target?.pos?.isVector3) { out.copy(target); return true; }
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
  if (!a.alive || s && (s.phase !== 'flight' || s.t / s.dur <= SUPERJUMP_MAIN_PROGRESS)) return;
  if (a.form !== 'kid') return;
  const buffered = a.fireBuffer > 0;
  a.weaponRunner.update(dt, { fire: a.intent.fire || buffered, firePressed: firePressed || buffered, sub: false, subReleased: false });
  a.fireBuffer = 0;
}
