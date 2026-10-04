# INKWAVE authoritative HUD: #425 and #381

## Scope and source

Baseline main: `17602ab094da6efb663d872934458e818ae3c93e` (refreshed 2026-10-04 UTC).
Only the published `inkwave-public/` build pipeline is modified. The vendored
upstream tree stays byte-identical. The optional 90-second match is unchanged.

- [Issue #425](https://github.com/rhgrive3/actions/issues/425): 23-segment special
  gauge instead of the continuous liquid orb and exact 0–99% number.
- [Issue #381](https://github.com/rhgrive3/actions/issues/381): pass the already
  authoritative match winner to Judd instead of introducing a 0.05-point tie band.

Both issues had no owner comments when selected. Relevant actual diffs of
PR317/327/328/184/63/458/61 were checked; they did not implement these roots.
PR327 already covers #432's sub readiness, so that issue was excluded.
Owner comments were posted before implementation and read back without a race.

Comparison target: Splatoon 3 Ver.11.3.0. Nintendo's [current update history](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/)
is the version reference. Nintendo's [Turf War guide](https://www.nintendo.com/jp/ichikara/av5ja/03_en.html)
establishes that the most inked area wins. The issue's cited
[Special Gauge description](https://splatoonwiki.org/wiki/Special_Gauge) reports
23 segments in Splatoon 3. That segment count is community-described UI evidence,
not an extracted Nintendo parameter or a new Switch measurement. Direct page
retrieval was blocked; the indexed statement was available. No claim is made
that the replacement vector artwork matches Nintendo pixels or its hidden
sub-segment interpolation timing.

## Implementation

`patches/local-quality/hud-authority-adapter.mjs` runs at the existing final
quality-adapter stage, after gameplay, touch and lifecycle adapters. Exact,
unique source anchors fail closed on upstream drift. Its content hash is part
of `qualityIdentity()` and the production build receipt.

### #425

The native HUD constructor creates 23 separate SVG paths. A discrete filled
class comes from `floor(clamp(f.special) * 23)`; a zero-size change crossing a
segment boundary is not swallowed by the old 0.002 gain-animation deadband.
There is no liquid wave node or exact percentage text. The existing special
icon, gain pulse, ready flare/rays and active spinner remain. The accessibility
progressbar reports 0–23 segments rather than a precise percentage.

Readiness is independent of visual quantization and uses only `f.specialReady`.
A full gauge with special-active state can therefore still display all segments
without falsely becoming ready. Consumption, death-retained gauge changes and
refilling follow the next authoritative HUD frame. No actor points, charge-rate
curve, special cost, timer, roster indicator or special-use rule changes.

Touch CSS hides the desktop gauge and uses the native SP button instead. That
separate path now also has 23 SVG segments and the same normalized quantization.
Its normal button semantics, actual ready/buzz/active state and other controls
are preserved. The browser gate explicitly mounts native touch controls at a
phone landscape viewport, verifies that the desktop gauge is hidden, drives
Actor -> Game -> MobileInput frames, and captures the visible touch replacement.

### #381

Game `_judge()` supplies `m.result.winner`. The native Judd method uses that
input for its text, color, winner class and completion value. Coverage remains
only an animated number/bar input; one-decimal rounding cannot change winner.
A standalone preview without a supplied valid winner is neutral, not a second
score adjudicator. Existing reliability ownership/cancel/replace/quit behavior
is retained.

The independent exact-tie gameplay rule in #158 is **not fixed here**. Its
current winner, including a host's received winner, is displayed faithfully.
Accordingly #381 remains a non-closing reference until its requested exact-tie
integration condition is addressed.

## Verification

- Production build passes, content digest prefix `df6212281d0c` after composing main `8158a2b8`.
- Upstream-lock compatibility and numeric reference 11.3.0 quick checks pass.
- Focused source regressions: 12/12, including two negative baseline controls.
- Emitted/minified complete HUD and MobileInput modules: 1/1 additional case,
  loaded with actual module dependencies and real native update methods.
- Tests exercise all boundaries, tiny crossings, normalized 160/180/200/220
  costs, repeated ready/consume/refill/active transitions, 30/60/120Hz sampled
  presentation, both teams, 0/.000001/.04/.049/.05/.051-point leads, authoritative
  winner over contradictory percentages, actual Game result/fanfare/profile,
  and interrupted/repeated Judd flows.
- Native browser acceptance is added to the existing active browser gate. It
  drives actual Actor -> Game HUD frames and native Judd DOM/FX, checks 23 SVG
  paths and discrete states, and writes desktop/phone gauge screenshots.
- The initial temporary full regression correctly rejects temporary checkout
  storage. After space was freed, the batch moved to an isolated persistent
  worktree. No storage guard was weakened. Local Playwright first lacked its
  downloaded browser; the already-installed system Chromium was then selected
  without an installation and failed at its singleton socket with Operation not
  permitted. CI browser acceptance remains pending. No local GPU/physical
  phone/Switch comparison is claimed.

Main advanced to `8158a2b83c8e6948d0f96f1bbe0e80e987c4bafd` while publishing.
Its landing-rigidity import/identity/dispatch and combat-life/credit changes are
preserved in the merge. The two append-only report sections are both retained.
The combined production build and focused source/emitted 13 cases pass.

The persistent main8158a2b full suite passed 786/786 before adding the mobile
SP-button boundary found during review. After that extension, local quality
passed 24/24 and the dedicated source/emitted cases passed 13/13. The full suite
is being rerun on this final code; exact-head CI status is reported in the PR. A
production build and a focused pass are not a claim of full browser acceptance.

## Composition and unresolved acceptance

Merge through the final quality stage. Preserve the new import, identity entry
and call when combining with other changes to `local-quality/adapter.mjs`.
PR317/328/330 alter other HUD information; none should replace this method with
an older liquid-orb implementation. The new browser helper is called after the
existing active gate, preserving all earlier assertions. No workflow scope or
CI gate is weakened.

No merge, deployment, settings change, issue closure or external service access
is performed by this batch. #425 can be linked as closing once actual browser
acceptance for the published head is verified. #381 stays a reference for the
separate #158 condition described above.


### First browser CI findings

Run37222572436 on the prior 8f2679b5 head passed validate and active Chromium,
including the actual new desktop HUD and Judd checks. The UI shard correctly
rejected its standalone reliability fixture because it still omitted winner
while expecting team1. The fixture now passes its explicit winner (0/0/1 for
the cancellation/older/newer scenarios). Expected winner1, cancellation,
voice-stop, replacement and disposal assertions are unchanged. Mobile native
acceptance is pending the newer head; prior active success is not reused as its
proof.
