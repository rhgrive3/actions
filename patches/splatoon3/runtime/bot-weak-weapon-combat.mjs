// Weak-weapon Bot combat AI improvements (2026-11-25).
// Strictly leaves strong families ('shooter', 'dualies', 'slosher') untouched.
// Delegates each of the 8 weak weapon families (39 individual weapons) to its
// dedicated O(1) zero-allocation module grounded in Splatoon 3 mechanics.
import { botRawWeaponFamily } from './bot-turf-paint.mjs';
import { applyChargerCombat } from './bot-ai-charger.mjs';
import { applyBlasterCombat } from './bot-ai-blaster.mjs';
import { applyRollerCombat } from './bot-ai-roller.mjs';
import { applyStringerCombat } from './bot-ai-stringer.mjs';
import { applySplatanaCombat } from './bot-ai-splatana.mjs';
import { applyBrushCombat } from './bot-ai-brush.mjs';
import { applySplatlingCombat } from './bot-ai-splatling.mjs';
import { applyBrellaCombat } from './bot-ai-brella.mjs';
import { bigBubblerDomes, bigBubblerRemoteDomes } from './kit-big-bubbler.mjs';

const STRONG_FAMILIES = new Set(['shooter', 'dualies', 'slosher']);

function findShieldingAlliedDome(list, actor, targetX, targetZ, hasTarget) {
  if (!list || !list.length) return null;
  const ax = actor.pos.x;
  const az = actor.pos.z;
  for (let i = 0; i < list.length; i++) {
    const d = list[i];
    if (!d || d.dead || d.team !== actor.team || !d.pos || !(d.radius > 1.5)) continue;
    const rx = ax - d.pos.x;
    const rz = az - d.pos.z;
    if (rx * rx + rz * rz >= d.radius * d.radius) continue;
    if (hasTarget) {
      const tx = targetX - d.pos.x;
      const tz = targetZ - d.pos.z;
      if (tx * tx + tz * tz <= (d.radius + 0.5) * (d.radius + 0.5)) continue;
    }
    return d;
  }
  return null;
}

function clampMoveInsideAlliedBubbler(actor, move, ctx) {
  if (!actor?.pos || !move || !Number.isFinite(actor.pos.x) || !Number.isFinite(actor.pos.z)) return;
  const hasTarget = Number.isFinite(ctx?.dx) && Number.isFinite(ctx?.dz);
  const targetX = hasTarget ? actor.pos.x + ctx.dx : 0;
  const targetZ = hasTarget ? actor.pos.z + ctx.dz : 0;
  const dome =
    findShieldingAlliedDome(bigBubblerDomes(), actor, targetX, targetZ, hasTarget) ||
    findShieldingAlliedDome(bigBubblerRemoteDomes(), actor, targetX, targetZ, hasTarget);
  if (!dome) return;

  let mx = Number.isFinite(move.x) ? move.x : 0;
  let mz = Number.isFinite(move.z) ? move.z : 0;

  // Strip forward movement toward an enemy outside our own Big Bubbler so bots
  // (especially Splatana lunge / Roller rush) do not launch themselves out of the shield.
  if (hasTarget && ctx.dist > 1e-4) {
    const ex = ctx.dx / ctx.dist;
    const ez = ctx.dz / ctx.dist;
    const fwd = mx * ex + mz * ez;
    if (fwd > 0) {
      mx -= fwd * ex;
      mz -= fwd * ez;
    }
  }

  const rx = actor.pos.x - dome.pos.x;
  const rz = actor.pos.z - dome.pos.z;
  const r = Math.hypot(rx, rz);
  const safeR = Math.max(0.5, dome.radius - 1.15);
  if (r > 1e-4) {
    const nx = rx / r;
    const nz = rz / r;
    const outward = mx * nx + mz * nz;
    if (r >= safeR) {
      mx = (mx - outward * nx) - nx * 0.45;
      mz = (mz - outward * nz) - nz * 0.45;
    } else if (outward > 0 && r >= safeR * 0.55) {
      mx -= outward * nx;
      mz -= outward * nz;
    }
  }

  move.x = mx;
  move.z = mz;
}

export function botWeakWeaponCombat(brain, G, actor, dt, move, ctx) {
  if (!brain || !actor || !ctx) return null;
  if (actor.alive === false || actor.specialActive || actor.superJumpState || actor.climbing) return null;

  const w = actor.weapon;
  const rawFamily = botRawWeaponFamily(w, ctx.family);
  if (STRONG_FAMILIES.has(rawFamily)) return null;

  const it = actor.intent;
  const wr = actor.weaponRunner;
  if (!it || !wr) return null;
  if (brain._bombAim || it.sub || wr.aimingSub) return null;
  if (!Number.isFinite(dt) || dt < 0 || !Number.isFinite(ctx.dist) || !Number.isFinite(ctx.range) || !Number.isFinite(ctx.inkFrac)) return null;

  let res = null;
  switch (rawFamily) {
    case 'charger':   res = applyChargerCombat(brain, G, actor, dt, move, ctx); break;
    case 'blaster':   res = applyBlasterCombat(brain, G, actor, dt, move, ctx); break;
    case 'roller':    res = applyRollerCombat(brain, G, actor, dt, move, ctx); break;
    case 'stringer':  res = applyStringerCombat(brain, G, actor, dt, move, ctx); break;
    case 'splatana':  res = applySplatanaCombat(brain, G, actor, dt, move, ctx); break;
    case 'brush':     res = applyBrushCombat(brain, G, actor, dt, move, ctx); break;
    case 'splatling': res = applySplatlingCombat(brain, G, actor, dt, move, ctx); break;
    case 'brella':    res = applyBrellaCombat(brain, G, actor, dt, move, ctx); break;
    default:          return null;
  }
  clampMoveInsideAlliedBubbler(actor, move, ctx);
  return res;
}
