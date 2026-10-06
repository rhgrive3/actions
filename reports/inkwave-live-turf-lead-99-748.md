# Live Turf lead / Danger: #99 and duplicate #748

## Fixed scope and baseline

- Root #99, duplicate #748. Primary claim: https://github.com/rhgrive3/actions/issues/99#issuecomment-6006738229 . No separate source PR or CI run.
- Public main `671e3dedcf7993d75460ac2fbb2687217195bda3`, tree `e6cd397901eebf3e8c545d3228238688e4f1113e`; local base `6fd188aa51db4e151458b142d3bf023bb0827a27` has exactly that tree.
- Fresh open-PR diffs and issue comments were checked before claiming. Existing #715/#718/#720 are retained. Input, scoring, weapon admission and unrelated UI owners are outside this root.
- Negative control executes the real baseline `Match.teamSummary()` and `HUD._updSquads()` at coverage `[.6,.2]`, `[.2,.6]`, `[.4,.4]`: paint reads stay zero, team keys remain only `color,players`, and both squad class sets remain unchanged. This reproduces the missing live presentation rather than assuming it from issue text.

## Change

- Build-only quality adapter reads the existing paint coverage fractions only in a playing, non-attract Turf match. It emits two booleans per physical team; no live percentages or numeric delta enter the HUD payload.
- At a gap of at least 0.1 of total stage coverage, the leader gains roster emphasis and the trailer receives `Danger!` / `ピンチ!`. Below threshold, on reversal, on invalid/missing input, and in non-Turf/live states, flags clear or transfer immediately.
- Neutral paint remains in the denominator. The tiny `Number.EPSILON` tolerance handles `.3-.2` subtraction roundoff, not a gameplay threshold relaxation.
- Main's existing physical-team-to-viewer reversal stays intact. Team classes update before unchanged per-player slot cache checks. The four native child slots and alive/dead/respawn/special-ready presentation stay intact.
- Intro, finish and judge clear the team classes even without another HUD frame. No new interval, animation loop, Actor reference, input state or paint ownership mutation is added.
- The Danger pseudo-element is below the native self-arrow / respawn adornments; the leader scale is a local 1.08 layout choice. Neither this scale nor pixels are claimed to match a measured Nintendo value.

## Reference boundaries

[#748](https://github.com/rhgrive3/actions/issues/748) requests the 10-percentage-point rule. The first-hand [2026 NA League playoffs recap](https://sendou.ink/a/na-league-2026-playoffs), originally posted June 24, describes the same Danger threshold and a spectator side-switch defect. We use the reported threshold and preserve physical-team identity; this is not a claim of Nintendo source-code access, a Ver. 11.3 binary measurement, or exact icon geometry. The issue-linked Inkipedia page returned HTTP 403 and was not bypassed.

## Verification

- Source: 13/13.
- esbuild minified actual modules: 13/13.
- Authentic built emitted modules: 13/13.
- Full local-quality tests plus existing idle-resource gates: 162 tests, 160 passed, zero failures, two existing optional skips (Tenacity emitted path and forced-GC collection).
- Cases: baseline negative; exact and below threshold; neutral denominator; both physical leads and both viewer sides; 30/60/120 Hz reversals despite unchanged player dirty keys; alive/dead/respawn/special-ready and four-slot preservation; Boss/attract/intro/finish/judge; invalid values; legacy payload clearing; equal offline/follower-flagged paint decisions; actual Japanese/English localization in keyboard/touch text modes; anchor drift/reapply refusal; existing browser-probe invocation and restoration contract.
- The follower-flagged fixture establishes decision equality for equal input, not a live multi-client transport measurement. VM display nodes are not a pixel-rendering or physical-device result.
- Authentic build content: `53051bf02a61e89ea7d0f1081d5f1112db71378bb129a2d77b162d0779022580`, 145 preloads. No upstream `inkwave-public` edits.

## Browser acceptance prepared, not executed locally

The existing `check-inkwave-browser.mjs` UI suite invokes a small imported probe after its actual live gameplay check. It controls `coverage()` and the local-viewer references on the already-loaded frozen Match, calls native Main -> Match -> HUD, checks computed scale / pseudo-label / four child slots / viewport bounds / timer and self-arrow separation, and captures eight PNGs at 1280x800 and 375x812 for both lead directions and both physical viewer teams. It also checks below-threshold and tie clearing, a controlled finish snapshot, and the existing Range CSS class hiding the entire combat bar. It restores the original coverage descriptor, local references, isLocal presentation flags, match state, Range class and viewport in `finally`. It does not change paint counts, physical player teams, input or simulation time. The finish event without another frame is separately exercised by the source test; the browser probe avoids dispatching a real finish bus event that would invoke unrelated audio/judge/input side effects. Range CSS suppression is not a new end-to-end Range-entry proof. The small viewport is a layout check, not a physical touch-device claim.

Local Chromium remains blocked by the previously established sandbox/socket EPERM constraint. No permission bypass or new workflow is used. Browser computed-style results and PNG inspection remain pending the one consolidated CI run; syntax and static contract tests are not browser success.

## Independent review

The integration reviewer read the adapter and existing Main/CSS on 2026-10-06 and found no confirmed blocker: physical-team flags, viewer reversal, dirty-cache ordering, neutral denominator, state clearing and absence of a parent-transform conflict are consistent. The requested two-viewer, finish, Range-class and overlap checks are in the pending browser probe; they are not reported as executed. A second review identified that the initial geometry-only verifier accepted a hidden or zero-opacity HUD. Both negatives were reproduced against the old verifier, then corrected: the exact browser-serialized inspector now checks squad/ancestor display, visibility and opacity, plus the Danger pseudo-element visibility and bounds. Another verifier test confirms phase/rows JSON and the controlled failure PNG are captured before state restoration. These two additional tests are verifier evidence, not actual browser rendering.

## Integration notes

Bundle with the separately completed #742 only; #99/#748 are one root. Production contact is the quality dispatcher, `Match.teamSummary`, HUD roster display/state reset, one CSS block and one translation. The old open #536 HUD snapshot adapter replaces `teamSummary` wholesale: a future merge of that candidate must preserve `leading` and `danger` in its reused team records and test both viewer orders. It is not part of this base or an implicitly verified composition.

Use exact changed paths; the local sparse checkout's native deletion display belongs to its read-only upstream symlink and must never be staged.
