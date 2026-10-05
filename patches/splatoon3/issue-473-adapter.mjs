// Issue #473: Build-only adapter for partial-charge Squid Surge armor.
//
// Reference: Splatoon 3 Ver. 11.3.0
// S3 reference documentation establishes:
// 1. Squid Surge can be released before full charge (the action occurs and climbs/launches).
// 2. Immediately after Squid Surge launches from the wall, the player receives
//    the same short armor protection window associated with wall Squid Roll.
//
// Architectural rules:
// - Build-only adapter: original files in inkwave-public/ and game/ are untouched.
// - Shared dispatchers (adapter.mjs, bootstrap.mjs, profile.json) are not modified directly by lane C.
// - Existing armor durability (100 HP), duration (0.1333s = 8F at 60 Hz), and timing constants are preserved.
// - Partial-charge and full-charge Surges share the identical authoritative armor model and duration.
// - Movement speed/distance scaling by charge amount remains unaltered.
// - Cancellation (splat, death, reset, kid form, special, superjump, landing on ground) clears armor immediately.
// - Negative controls (canceled charge without burst, unadmitted 0 charge) receive no armor.

export function replaceOnce(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1) {
    throw new Error(`INKWAVE issue-473 patch conflict (${label}): expected exactly one connection`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}

const MOVEMENT_RUNTIME_REL = 'patches/splatoon3/runtime/movement.mjs';

export function adaptIssue473(rel, code) {
  const normalized = rel.replace(/\\/g, '/').replace(/^\.?\/?/, '');
  if (
    normalized !== MOVEMENT_RUNTIME_REL &&
    normalized !== 'runtime/movement.mjs' &&
    normalized !== 'movement.mjs'
  ) {
    return code;
  }

  // 1. Separate Surge armor activation from full charge: any valid burst launch gains post-launch armor
  code = replaceOnce(
    code,
    '      surge.armorTime = surge.charge >= 1 ? cfg.surge.armorTime : 0;',
    '      surge.armorTime = surge.charge > 0 ? cfg.surge.armorTime : 0;',
    'surge armor activation on valid burst launch'
  );

  // 2. Preserve post-launch armor across the full armor window even when burst climb duration expires early
  code = replaceOnce(
    code,
    `  if (state.surge?.phase === 'burst') {
    const burst = state.surge; burst.time -= dt;
    if (burst.time <= 1e-10 || !a.climbing && a.grounded) state.surge = null;
    else if (a.climbing) {
      a.climbV = burst.speed; a.vel.y = burst.speed; a.jumpBuffer = 0;
      sync(a, state); return true;
    }
  }`,
    `  if (state.surge) {
    if (!a.climbing && a.grounded) {
      state.surge = null;
    } else if (state.surge.phase === 'burst') {
      const burst = state.surge; burst.time -= dt;
      if (burst.time <= 1e-10) {
        burst.phase = 'armor';
        if ((burst.armorTime || 0) <= 1e-10) state.surge = null;
      } else if (a.climbing) {
        a.climbV = burst.speed; a.vel.y = burst.speed; a.jumpBuffer = 0;
        sync(a, state); return true;
      }
    } else if (state.surge.phase === 'armor') {
      if ((state.surge.armorTime || 0) <= 1e-10) state.surge = null;
    }
  }`,
    'surge armor window retention and ground contact teardown'
  );

  // 3. Clear action states on fatal splat to ensure proper lifecycle teardown
  code = replaceOnce(
    code,
    '  const reset = Actor.prototype.reset, damage = Actor.prototype.damage;',
    '  const reset = Actor.prototype.reset, damage = Actor.prototype.damage, splat = Actor.prototype.splat;',
    'capture splat prototype method'
  );

  code = replaceOnce(
    code,
    '  Actor.prototype.reset = function (...args) {',
    `  Actor.prototype.splat = function (...args) {
    const result = splat.apply(this, args);
    if (!this.alive) {
      const state = movementState(this); state.roll = state.surge = null;
      this.anim.surgeCharge = 0; sync(this, state);
    }
    return result;
  };
  Actor.prototype.reset = function (...args) {`,
    'splat lifecycle teardown hook'
  );

  return code;
}

export const adaptIssue473Source = adaptIssue473;
