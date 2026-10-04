// Issue #406 — attack-locomotion direction state (BUILD-ONLY PRESENTATION ADAPTER).
//
// Splatoon 3 selects one of four directional lower-body locomotion states while
// the character fires or holds a charge (forward run, backpedal, left strafe,
// right strafe); the upper body keeps tracking the reticle. The published
// INKWAVE runtime had no such state: the whole root follows aimYaw and one
// continuous gait plus a continuous hip/lean bias served every direction.
//
// This module adds the missing *state selection* to the visual layer only:
//   - `attackGaitState()` derives {forward|backward|left|right} + blend weights
//     from movement relative to the body while a firing pose is active.
//   - `adaptIssue406Source()` injects exactly one call into the build copy of
//     `src/game/character.js` (never into the repository sources) so the native
//     hip-twist target becomes the blended four-state presentation value.
//
// Scope guards (checked by patches/splatoon3/tests/issue-406-attack-gait.test.mjs):
//   - Authoritative movement, weapon timing, collisions and aim facing are not
//     touched: no change to `Actor._face()`, velocity, foot clocks, or profile.
//   - When the state is inactive (not firing / not moving / not kid form) the
//     patched code executes the exact native statements -> bit-identical
//     behavior to main (negative control).
//   - Twist magnitudes reuse the native formula constants evaluated at the four
//     canonical directions; no new gameplay or frame numbers are introduced.
//     Like walkMotion's numbers they are visual calibration, not measured
//     Nintendo joint values (public sources do not expose those).
//
// BUILD WIRING (parent/orchestrator owns this; shared files untouched here):
//   scripts/build-inkwave.mjs, adaptBuildSource = rel => ... adaptIssue406Source(rel, ...)
//   wrapping the existing chain (any position works: both edit regions are
//   disjoint from every other adapter's anchors; tests apply shared
//   adaptSource first, as the recommended order does).
//
// This file is imported at runtime by the patched character.js, so it must stay
// free of node: imports (it is copied into the published build); the local
// replaceOnce copy below exists for exactly that reason.

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Native hip-twist formula for a *canonical* strafe direction (mdx=±1, mdz=0):
//   clamp(atan2(mdx, |mdz| + 0.3) * 0.78, -0.8, 0.8)
// Re-evaluating the existing expression at the canonical input keeps strafe
// magnitudes exactly what main already produces — no new number is introduced.
const STRAFE_TWIST = clamp(Math.atan2(1, 0 + 0.3) * 0.78, -0.8, 0.8);

// Four-state selector. Pure, deterministic, presentation-only.
// Kid space: +z forward, +x left (character.js: "kid space (+x left)").
// `mx`/`mz` are the per-frame body-space travel velocity components
// (character.kgx/kgz), NOT the native mdx/mdz pair: those are damped and then
// renormalized every frame, so for an exact reversal the damp step shrinks mdz
// toward -1 and the renormalize snaps it straight back to +1 — with mdx === 0
// the sign can never cross zero and pure backpedal stays classified forward
// forever (observed on the real rig; the issue text also notes mdx === 0 for
// pure backward). Raw velocity carries the correct sign every frame.
// Returns null unless the attack gait applies, so callers fall back to the
// untouched native path.
export function attackGaitState(input) {
  const { moving, kid, firing, mx, mz, speedScale } = input || {};
  if (!moving || !kid || !firing) return null;
  const len = Math.hypot(mx, mz);
  if (!(len > 1e-6)) return null;
  const dx = mx / len, dz = mz / len;
  // Direction lobes with a shared blend band: near a diagonal both lobes are
  // partially on and the presentation interpolates instead of snapping.
  const wForward = smooth(0.15, 0.5, dz);
  const wBackward = smooth(0.15, 0.5, -dz);
  const wLeft = smooth(0.15, 0.5, dx);
  const wRight = smooth(0.15, 0.5, -dx);
  const sum = wForward + wBackward + wLeft + wRight;
  if (!(sum > 1e-6)) return null;
  const forward = wForward / sum, backward = wBackward / sum;
  const left = wLeft / sum, right = wRight / sum;
  // Stable tie-break order; cardinal inputs resolve unambiguously.
  let id = 'forward', best = forward;
  if (backward > best) { id = 'backward'; best = backward; }
  if (left > best) { id = 'left'; best = left; }
  if (right > best) { id = 'right'; }
  // Canonical twists: forward/backpedal keep the pelvis on the aim line (the
  // native formula evaluates to 0 at mdx=0), strafes turn the pelvis toward the
  // travel side. Blended by the normalized state weights.
  const twist = (left - right) * STRAFE_TWIST * (Number.isFinite(speedScale) ? speedScale : 0);
  return { id, forward, backward, left, right, twist };
}

// Local exactly-once string replace (same contract as patches/splatoon3/adapter.mjs).
// Kept local because this module is also imported by the built game code.
function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`INKWAVE patch conflict (issue-406 ${label}): expected exactly one connection. Review upstream changes; site was not built.`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

const IMPORT_LINE = "import { attackGaitState } from '../../patches/splatoon3/issue-406-adapter.mjs';\n";
const HIP_TWIST_ANCHOR = '    this.hipTwist = damp(this.hipTwist, tw, 7, dt);';
const HIP_TWIST_PATCHED = [
  '    // issue-406: attack-locomotion direction state (presentation only).',
  '    const ag = attackGaitState({ moving: this.moving, kid: this.kidForm && !this.dance, firing: !!s.firing || (s.charge ?? 0) > 0, mx: this.kgx, mz: this.kgz, speedScale: sstep(0.5, 2.2, v) });',
  '    this.attackGait = ag;',
  '    if (ag) tw = ag.twist;',
  HIP_TWIST_ANCHOR,
].join('\n');

// Build-tree source transform. The repository copy of inkwave-public/ is never
// modified; only the disposable build output (or a test's in-memory copy) is.
export function adaptIssue406Source(rel, code) {
  if (rel !== 'src/game/character.js') return code;
  if (code.includes('attackGaitState(')) {
    throw new Error('INKWAVE patch conflict (issue-406 character attack gait): already applied. Review adapter chain order; site was not built.');
  }
  const patched = replaceOnce(code, HIP_TWIST_ANCHOR, HIP_TWIST_PATCHED, 'character attack gait');
  return IMPORT_LINE + patched;
}

