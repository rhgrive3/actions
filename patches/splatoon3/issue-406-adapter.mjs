// Issue #406 — attack-locomotion direction state (BUILD-ONLY PRESENTATION ADAPTER).
//
// Splatoon 3 selects one of four directional lower-body locomotion states while
// the character fires or holds a charge (forward run, backpedal, left strafe,
// right strafe); the upper body keeps tracking the reticle. The published
// INKWAVE runtime had no such state: the whole root follows aimYaw and one
// continuous gait plus a continuous hip/lean bias served every direction.
//
// This module adds the missing *state selection* — and the direction feed it
// needs — to the visual layer only:
//   - `attackGaitState()` derives {forward|backward|left|right} + blend weights
//     + the normalized presentation direction from movement relative to the
//     body while a firing pose is active.
//   - `adaptIssue406Source()` injects one block into the build copy of
//     `src/game/character.js` (never into the repository sources) at the exact
//     spot where the native direction filter (`mdx/mdz`) is updated, so the
//     *existing* native backwards logic runs on a valid direction while
//     firing: the hip-twist sign flip (character.js), the backpedal weight
//     `bk` and the toe/heel roll + swing fold of the active S3 walk layer.
//
// Why the feed is required (observed on the real rig): `_trackRoot` damps
// `mdx/mdz` toward the travel direction and then renormalizes every frame. For
// an exact reversal (`mdx === 0`) the damp step shrinks `mdz` below 1 and the
// renormalize puts it straight back to +1 — the unit-length rescale cancels
// the damp step, so the sign can never cross zero and `mdz` stays frozen at
// +1 forever (probe: `kgz = -4.20`, `mdz = 1.000`). walk.mjs reads
// `ch.mdz/ch.mdx`, so the foot gait kept presenting *forward* while the body
// travelled backward. The injected block keeps a smoothed presentation
// direction (native `damp()` at the native rate 10, seeded from the current
// `md`, never renormalized) and writes it into `md` only while the attack gait
// applies. The native hip-twist statement itself is untouched and now
// evaluates on the valid direction, so its own backward flip applies — no
// invented joint curve, no new gameplay/frame number.
//
// Scope guards (checked by patches/splatoon3/tests/issue-406-attack-gait.test.mjs):
//   - Authoritative movement, weapon timing, collisions and aim facing are not
//     touched: no change to `Actor._face()`, velocity, foot clocks, or profile.
//   - When the state is inactive (not firing/charge, not moving, not kid form)
//     the injected block never writes `md` and never overrides `tw` -> the
//     patched build executes the exact native statements -> bit-identical
//     behavior to main (negative control on real leg/foot matrices).
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
// untouched native path. `dx`/`dz` are the normalized presentation direction
// (unit length, raw sign) that the injected block feeds into `mdx/mdz`.
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
  // travel side. Reported for observability/tests; the injected block does NOT
  // apply it — the native hip-twist formula runs unchanged on the fed
  // direction, so its own backward sign flip stays in charge.
  const twist = (left - right) * STRAFE_TWIST * (Number.isFinite(speedScale) ? speedScale : 0);
  return { id, forward, backward, left, right, dx, dz, twist };
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

// Anchor: the end of the native direction filter inside `_trackRoot`
// (damp + renormalize of mdx/mdz) and the statement that follows it. Both
// lines are unique in character.js and no other adapter anchors here.
const TRACK_ANCHOR = [
  '      const ml = Math.hypot(this.mdx, this.mdz) || 1; this.mdx /= ml; this.mdz /= ml;',
  '    }',
  '    this.vyS = damp(this.vyS, s.vy ?? this.rv.y, 14, dt);',
].join('\n');

const TRACK_PATCHED = [
  '      const ml = Math.hypot(this.mdx, this.mdz) || 1; this.mdx /= ml; this.mdz /= ml;',
  '    }',
  '    // issue-406: attack-locomotion presentation direction (presentation only).',
  '    const ag = attackGaitState({ moving: this.moving, kid: this.kidForm && !this.dance, firing: !!s.firing || (s.charge ?? 0) > 0, mx: this.kgx, mz: this.kgz, speedScale: sstep(0.5, 2.2, this.moving ? Math.max(this.gv, 0.6) : this.gs) });',
  '    this.attackGait = ag;',
  '    if (ag) {',
  '      // The native filter above deadlocks on exact reversals: the unit-length',
  '      // renormalize cancels the damp step while mdx === 0, so mdz never crosses',
  '      // zero and the walk/pose/foot layers keep reading "forward" during a',
  '      // backpedal. Feed them the smoothed direction of the raw travel velocity',
  '      // instead (native damp, native rate, never renormalized).',
  '      if (!this.attackDir) this.attackDir = { x: this.mdx, z: this.mdz };',
  '      this.attackDir.x = damp(this.attackDir.x, ag.dx, 10, dt);',
  '      this.attackDir.z = damp(this.attackDir.z, ag.dz, 10, dt);',
  '      this.mdx = this.attackDir.x; this.mdz = this.attackDir.z;',
  '    } else this.attackDir = null;',
  '    this.vyS = damp(this.vyS, s.vy ?? this.rv.y, 14, dt);',
].join('\n');

// Build-tree source transform. The repository copy of inkwave-public/ is never
// modified; only the disposable build output (or a test's in-memory copy) is.
export function adaptIssue406Source(rel, code) {
  if (rel !== 'src/game/character.js') return code;
  if (code.includes('attackGaitState(')) {
    throw new Error('INKWAVE patch conflict (issue-406 character attack gait): already applied. Review adapter chain order; site was not built.');
  }
  const patched = replaceOnce(code, TRACK_ANCHOR, TRACK_PATCHED, 'character attack gait');
  return IMPORT_LINE + patched;
}

