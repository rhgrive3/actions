# Issue #592: enforce water death after special-owned movement

Base: the #536 integration at `7c391daf6b51023befafbe2ebea693d732ffbd86`, including #530 and #582. This patch is a separate later candidate.

## Root and correction

The ordinary Actor update enforces the existing `fallDeathY` plus `groundHeight(...) === -Infinity` condition. Storm movement returned before reaching it, leaving a living actor below the lethal boundary until the special lock ended. The initial six-case reproduction had four failures.

The adapter extracts that existing condition and its original FX, audio, attacker attribution and `splat(..., 'water')` call into one helper. Ordinary movement still invokes it once. Special movement and special activation invoke it before `_finishFrame`. Dead actors return without repeated effects. Tidal Slam's movement uses the same check; movement tuning and impact code are unchanged. At the time of the #592 patch, Super Jump's separate movement path was unchanged and was not accepted by that patch. The later #1050 correction below covers its missing admission, wall-supported charge and flight checks.

The existing dry-dock exemption remains authoritative. No sea level, threshold, duration, damage, paint, cloud or gauge values change. A valid Storm throw still occurs once; entering lethal water interrupts its owner through the existing death path.

## Reference and limits

[Issue #592](https://github.com/rhgrive3/actions/issues/592) records the Splatoon 3 comparison and source links. [Nintendo's Splatoon 3 update history](https://en-americas-support.nintendo.com/app/answers/detail/a_id/61257/~/splatoon-3-update-history) independently discusses falling into water and stage-fall splats. This correction restores INKWAVE's already-established water hazard invariant; it does not claim a new original-game frame measurement. The cited Inkipedia pages returned HTTP 403 in this verification session, so their complete contents were not independently read.

Exact #322 Storm adapter composition was separately checked: a held device reaches the ordinary check, and the throw phase reaches the special check. This proves the narrow adapter boundary, not acceptance of the entire existing #322/#259 PRs.

## Verification

- Final aggregate: 1,118 passed, 0 failed, 5 existing optional emitted-mode skips. The new water cases and #582 emitted checks were explicitly run as listed below.

- Focused source: 8/8, including a real owner snapshot and remote timeline water-death playback. The network case explicitly applies the production network adapter.
- Build: `d092f066e86d`.
- Actual emitted modules: 18/18 across the new water cases and existing #582 spawn-barrier cases.
- Independent review found no blocker; extra expiry-tick probes verified exactly one splat, water burst and sound, without a finishing frame or repeated effects.
- Tests cover activation below the boundary, crossing during movement, dry trenches, recent/stale attribution, Slam falling, unchanged safe Storm trajectories and 30/60/120/144Hz render cadence.

Tests use native adapted/emitted logic with controlled collision/audio/display services. Remote death is checked after its accepted event playback, not asserted to occur before network delivery. No physical device or rendered full-map comparison is claimed.

## 2026-10-08 follow-up: Super Jump water ownership (#1050)

[Issue #1050](https://github.com/rhgrive3/actions/issues/1050) is a separate correction on main `c2c938b9af5b6cce2a7bdbecf0415c7c3836cadb`. It reuses the existing sea-threshold, dry-ground exemption, attribution, effects and owner water-splat helper. The maintained `patches/splatoon3/adapter.mjs` checks admission before creating a jump, then checks before/after jump-owned movement and stops once death is committed. Existing unsupported falling-charge handling remains. No water threshold, trajectory, charge time, weapon parameter, paint or network event protocol is changed.

The complete six-adapter native Actor composition reproduced six failures and two already-passing controls before the fix. Nine permanent tests now cover admission, a former wall-supported escape fixture, flight crossing, dry low ground, attribution/resource/death guards and actual NetMatch owner/proxy playback. The wall admission fixture now dies before entering a wall-supported jump; it is not evidence that a new supported charge was started after crossing the boundary. Native owner/proxy playback applies one accepted death, rejects duplicate/late alive samples and sends no proxy echo. See `patches/splatoon3/tests/issue-1050-superjump-water.test.mjs`.

This is an INKWAVE invariant correction under its existing profile (pinned Splatoon 3 v11.3.0), with controlled terrain/Character services. It introduces no original-game numeric value. No new Switch water/Super Jump timing, frame measurement, rendered-browser comparison or physical peer test is claimed. The final product source `3132ec1` passed the 52-test network/Range/kit integration, production build and unchanged startup budget; later UI-verifier diagnostics leave those product subtrees identical. Native CI for the new batch remains pending.
