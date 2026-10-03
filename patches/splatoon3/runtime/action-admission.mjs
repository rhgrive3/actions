// Read-only presentation arbitration. Native clocks remain event/elapsed clocks;
// they are never rewritten to make a pose eligible. No engine imports, so the
// adapted Character can call these at its original native decision boundaries.
import { specialMotionAllowsFootPlant, specialMotionOwnsPose } from './special-motion.mjs';

const SPECIAL = Symbol.for('inkwave.s3.special-motion.install.v1');
const DUALIES = Symbol.for('inkwave.splatoon3.dualies-motion.v1');
const BOMB = Symbol.for('inkwave.s3.bomb-motion.install.v1');

// Foot eligibility deliberately allows mapped Storm. Other action layers need
// the same disabled/detached/unmapped fallback, but must also yield to Storm's
// actual deployment/recovery owner. Do not use only !specialMotionOwnsPose.
export function specialMotionAllowsAction(ch, nativeEligible) {
  const m = ch?.[SPECIAL]?.states?.get(ch);
  // _owner() can update native lookup/cache clocks. The installed Special
  // observer has already resolved the actual Actor before state/pose hooks.
  const owner = ch?.actor?.character === ch ? ch.actor : null, live = owner?.specialActive;
  const mapped = !live || Number.isFinite(live.t) && (live.id === 'storm'
    || live.id === 'slam' && ['rise', 'hang', 'fall'].includes(live.phase));
  if (!owner || !m?.controlled || m.nativeOnly || ch.s3SpecialMotionEnabled === false
    || !mapped || live && m.token !== live && m.blocked !== live) return nativeEligible;
  return specialMotionAllowsFootPlant(ch, nativeEligible) && !specialMotionOwnsPose(ch);
}

// Cancelling Bomb no longer fast-forwards T_THROW. Other action layers must
// yield to its live hold/recovery, then stop excluding actions on a retired
// presentation's old age. Standalone/disabled native events keep native gates.
export function bombMotionAllowsAction(ch, nativeEligible) {
  const installation = ch?.[BOMB], m = installation?.states?.get(ch);
  if (!m || ch.s3BombMotionEnabled === false || installation.disposed?.has(ch)
    || ch.actor?.character !== ch) return nativeEligible;
  return !m.throwing && !ch.bombHeld;
}

function admission(ch, runner) {
  if (!ch?.dual || ch.weaponKind !== 'dualies' || ch.s3DualiesMotionEnabled === false) return null;
  return ch[DUALIES]?.admission?.(ch, runner) ?? null;
}

// Parent adapter: replace the RHS of native `const lock`, before native damp,
// wAim and stance. The supplied fallback is the exact native boolean expression.
export function dualiesMotionLock(ch, runner, nativeLock) {
  return admission(ch, runner)?.lock ?? nativeLock;
}

// Parent adapter/Walk: replace ONLY the old T_DODGE foot conjunction. Detached
// previews and incomplete remote progress retain the caller's native decision.
export function dualiesMotionAllowsFootPlant(ch, nativeEligible) {
  return admission(ch, undefined)?.foot ?? nativeEligible;
}
