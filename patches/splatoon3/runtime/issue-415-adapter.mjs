// Issue #415 — build-only enemy-ink health-recovery reset.
// Splatoon 3 Ver. 11.3.0 (reference): touching even a small amount of enemy
// ink resets the ~1.0 s healing delay, so leaving enemy ink must start the
// wait from zero. Main `patches/splatoon3/runtime/resources.mjs` instead
// clamps with `a.lastDamage = Math.min(a.lastDamage,
// r.enemyInkRegenSuppression)` (0.4 s), which pre-credits 0.4 s of the wait
// after exit. This module holds the narrow correction without touching
// inkwave-public/, profile.json numbers, damage cap/grace/rate, or the
// global regenDelay tracked in #195.
//
// The gameplay build dispatcher applies this transform to resources.mjs.
export function resetEnemyInkRecovery(a) {
  // Eligible ground contact only. While `onEnemy` is true the recovery gate
  // in resources.mjs (`!onEnemy && lastDamage >= regenDelay`) already blocks
  // healing, so resetting the elapsed timer to exactly zero is both the
  // documented reset and fixed-step deterministic (no FPS dependence).
  // Untouched: hp, damageFromInk cap, enemyInkTime/grace, damage rate,
  // regenDelay threshold, ink refill state.
  if (a && a.onEnemy) a.lastDamage = 0;
  return a;
}

const ISSUE_415_REL = 'patches/splatoon3/runtime/resources.mjs';
const ISSUE_415_ANCHOR = '    a.lastDamage = Math.min(a.lastDamage, r.enemyInkRegenSuppression);';
const ISSUE_415_IMPORT = `import { resetEnemyInkRecovery } from './issue-415-adapter.mjs';`;

export function adaptIssue415(rel, code) {
  if (rel !== ISSUE_415_REL) return code;
  const first = code.indexOf(ISSUE_415_ANCHOR);
  if (first < 0 || code.indexOf(ISSUE_415_ANCHOR, first + ISSUE_415_ANCHOR.length) >= 0) {
    throw new Error('INKWAVE issue-415 anchor mismatch: expected exactly one enemy-ink recovery clamp.');
  }
  let patched = code.slice(0, first) + '    resetEnemyInkRecovery(a);' + code.slice(first + ISSUE_415_ANCHOR.length);
  if (!patched.includes('./issue-415-adapter.mjs')) patched = `${ISSUE_415_IMPORT}\n${patched}`;
  return patched;
}
