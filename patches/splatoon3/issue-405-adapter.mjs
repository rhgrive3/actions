// Sourced Splatoon 3 Ver. 11.3.0 180-degree direction reversal deceleration ratio (Issue #405).
// In S3 standard locomotion, stick release (neutral) and opposite stick tilt (180° reversal)
// apply the identical negative acceleration rate (0.01 m/F²; reverse/neutral braking ratio = 1.00).
// INKWAVE previously applied Math.max(P.reverseDecel, D) with reverseDecel = 78 and runDecel = 58,
// yielding a 78/58 ≈ 1.345x unnatural abrupt deceleration ratio on reversal (> 126°).
// This build-only adapter aligns reversal braking deceleration with normal locomotion deceleration D.

export function replaceOnce(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1) {
    throw new Error(`INKWAVE issue-405 patch conflict (${label}): expected exactly one connection`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}

export function adaptIssue405(rel, code) {
  const normalized = rel.replace(/^inkwave-public\//, '');
  if (normalized === 'src/game/actor.js') {
    // Current movement-physics replaces the entire grounded velocity owner with
    // stepGroundVelocity(), which already uses one deceleration rate for neutral
    // and reversal. Only patch the legacy native block when that owner remains.
    if (code.includes('stepGroundVelocity(this.vel')) return code;
    code = replaceOnce(
      code,
      'const r = Math.max(P.reverseDecel, D) * dt * (onEnemy ? 0.5 : 1);',
      'const r = D * dt * (onEnemy ? 0.5 : 1);',
      'align reverse deceleration rate with normal locomotion deceleration D'
    );
  }
  return code;
}

export const adaptIssue405Source = adaptIssue405;
