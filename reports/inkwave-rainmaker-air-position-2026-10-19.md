# Rainmaker full-jump support: transient position review

Status: private native-review candidate. Shoulder appearance and landing continuity are **not accepted** until exact-head native images are inspected. No source interrupted-form guard is included.

## Reproduction and attribution

Baseline: PR #1627 head `381319e16361497c6bb5f4649ce119acd7883f7f`; its handoff SHA-256 is `306ffe45c96f16e59a1acdf7ff18eba99f4062a159283f406c1c72dbae8db615`. The earlier `62cd3a08fcc43fce60fba77392beae418ce2258c` is a second diagnostic control. Main `3e8812d996eea01ad4cab84eb8fbaa3545cb5d5f` predates the dedicated Rainmaker support owner and is contextual, not an implementation of its new grip contract.

Use source Player00, Dualies, team 0, fixed name `rainmaker-qa-fixed`, style hair0/hat0/skin2/outfit0/eyes0. Real `Actor.update(1/60)` precedes `Match.advanceRanked(1/60)`. Use a real flat `Level`/`Physics`, own-ink sample, and real ranked effects. The fixture opens the shield after 60 warm-up ticks; normal rule pickup follows, then 12 pickup ticks. No actor position, velocity, grounded state or source action is injected after initialization. Carry for 12 ticks, press jump for one tick, and continue for 80 total jump/landing ticks; repeat three times. The charge case replaces each 12-tick carry with 62 fire-held ticks and also holds fire for the first eight jump ticks.

Each jump has 28 airborne frames. Three jumps therefore supply **84 airborne frames per case**, not 84 per jump. The two capture cases supply 168 airborne frames per revision. Three repeats demonstrate repeatability under that fixed input; they do not estimate real-player incidence.

On 381319, ordinary carry-jump fails the unchanged .001 world-unit grip threshold in 35/84 air frames across all three repeats. Maximum is .013303580596944345 WU. First failure is total tick 91, the seventh jump frame, while ascending; the worst is tick109 while descending. Earlier 62cd fails70/84, max .03329532503093023 WU. Main3e's hand distance to the later canonical target is max .33936781299000357 WU, with no objective support owner; this is not a new regression from a previously passing main contract. 62cd/381319 recorded actor state, native pose/springs, root/form, main muzzle, source phase and rule charge/recovery are exact under this input.

The source-air rotation introduced in 381319 reduces the legacy gap but reaches its existing .2-rad cap. Raising that cap or changing the grip threshold was not accepted.

## Narrow change

Runtime owner remains `weapon-handoff-motion.mjs` only, SHA-256 `86850404e40b60bcb2b4ca7e4eb55dd48c14d7cdad4fb916adc691134541fc81`.

After the existing support solve and capped rigid rotation, only a capped case may translate the left clavicle by the remaining world-space residual, at most .03 WU. Actual matrix transformations convert both endpoints through the parent; nonuniform scale is not approximated with a scalar. All arm bone lengths and scales are unchanged. The existing .2 rotation and .001 final-world contact gates remain. Beyond the .03 position budget, a target still fails; a synthetic negative explicitly checks this.

The current frame's baseline clavicle position joins the four already-saved left-arm quaternions. Existing pending restoration restores that position before source advance, ordinary bomb sampling, clear/reset, weapon switch and disposal. It never adds a residual to a previous frame's corrected baseline. The existing source rendered-position bank is not preemptively updated: display correction never wrote that bank, so changing its lazy baseline would itself change history.

The .03 limit is an INKWAVE calibration bound above the observed .0251609452 WU charged-jump residual, not a Nintendo measurement. Geometry, source legs, root, right-hand/muzzle and gameplay physics are untouched. The shared bomb helper remains `b0f65d561a7a09b79bc3700e4e1d769c3eb13b99866883a91573ff284d1af173`.

## Source checks completed

- Native capture and source/emitted CPU tests share the same complete real-input driver in `tools/rainmaker-air-production-qa/browser.mjs`.
- `ranked-rainmaker-air-full-jump.test.mjs`:2/2 source tests, 168/168 air frames below .001 WU. Carry maximum grip1.5101e-15, maximum translation .013303580596944439 WU. Charge maximum grip1.4089e-15, maximum translation .025160945214205237 WU. Source bank SHA-256 `17671366cb33c3da35fc9ff9599d374335c9dfe0dffb8bdf7300b492cb9ef8cb`, seed2472504081, ready/active Player00.
- Existing support/history regressions:8/8 parent independent run, including12 real ordinary-bomb release boundaries. Unit cases retain .2 rotation/.03 world translation, nonuniform-scale handling, capped unreachable negatives, and repeated no-accumulation behavior.
- Independent restore review:6/6, including120 variable nonzero baseline frames, unchanged source position bank and12 scene transfers.
- Additional actual-input comparison against381319:8 boundaries,658 post-drop frames; all recorded actor/native state, all87 bone local TRS, source rendered/air/dive banks, root/form and muzzles exactly equal. Eight actual ordinary-bomb births have identical position and velocity. Boundaries include short swim/return, same-frame release, source off, hidden/reset, setWeapon, actual death/respawn, runner reset and mode stop.
- Drop from corrected air into actual ordinary Dualies fire:2 real shots and1 subsequent ordinary bomb match381319 position/velocity exactly; all75 post-drop frames match recorded bone/source banks and actor state.

The earlier private v1 wrote a lazy source position bank and therefore failed bank equality despite matching visible bones and bomb births. It is superseded. Only v2 without that write is reviewed here.

## CPU scope

Eight real source-loaded Dualies are driven through `_finishFrame` at30/60/120 Hz. Repeated carrier IDs intentionally stress eight presentation owners and do not represent a legal match. Three2-second samples per case follow2-second warm-up. Control/candidate and reverse candidate/control orders were measured sequentially on a shared CPU.

There remains exactly one pose and one left solve per actor/frame. Nonholders never enter the pending/position branch. The measured holder median differences for eight actors were −.017 to+.157 ms at30Hz, −.213 to+.050 ms at60Hz and −.160 to+.004 ms at120Hz. Nonholder variation was −.121 to+.149 ms. Signs change with order; these measurements cannot resolve a small incremental cost from shared-machine noise and are not a zero-cost, GPU or FPS claim. Position state adds one reusable Vector3 only when that Character first needs correction. No extra solver evaluation or per-frame object allocation was added by the position hunk.

## Exact-head native acceptance plan

Keep the existing128 Rainmaker images separate. The additional `rainmaker-air` suite reuses the same production build, while its before namespace overlays only381319's handoff module. It is not a full381319 build. Capture20 PNGs: five total timeline points × rear/side × before/after.

- Carry tick109: largest descending correction.
- Carry tick112: last descending frame, also immediately before landing.
- Carry tick113: first landed frame.
- Charge tick304: largest correction, last descending frame and immediately before landing.
- Charge tick305: first landed frame.

Equivalent roles share a frame instead of duplicating PNGs. Camera is fixed relative to the floor across each timeline and both revisions; native PMREM/day lighting, MSAA/AO/bloom/grade/output are identical. Every row contains full model/root/kid transforms, pose/springs, actual grip/translation, main muzzle, source state/ready/active/bank digest/seed/feet and exact simulation tick. The shared runner records exact source head, baseline blob and all emitted hashes. Before must reproduce failed grip; after must pass all84 air frames in both cases, not merely the photographed points. Actor/root/model/right-muzzle/native channels and authoritative events are compared exactly.

Landing removes the correction when source air ends. In the worst charge case the displacement magnitude changes from .0251609452 WU to0 over tick304→305. Baseline native pose also changes there. This is a visual-review risk, not proof of a visible artifact; no fade or additional bone correction has been added. Inspect shoulder/skinning, hand continuity and landing at the native images before acceptance. Source interrupted-form intersections and other untested weapon families remain outside this candidate's acceptance claims.

## 381319 native terminal receipt and two QA-only corrections

[Native run39214928591](https://github.com/rhgrive3/actions/actions/runs/39214928591) completed with two distinct test-harness failures. The emitted air-history test imported RainmakerRule directly into Node outside the fixture's ESM loader; its minified dependency graph reached a bare `three` import. Route that rule through the existing source/emitted fixture export instead. No gameplay assertion failed in that startup failure. The fixed source test passes3/3 with12 real bomb boundaries; exact emitted rerun remains required.

The Rainmaker browser completed128 captures and its internal actor checks, then the shared receipt checker failed. Its row construction overwrote the saved full PNG name with the animation phase. Store that field as `phase` and preserve the image name. A CPU-only run of the complete128-capture driver with the corrected row now has128 unique rows and64 matching camera/light pairs. This uses real Actor/source logic with mocked rendering, not new native visual evidence.

The original128 PNGs are preserved and every SHA-256/dimension plus six harness hashes matches the exact381319 receipt. Artifact12170309637 ZIP SHA-256 is `697c288284a4c9523ad795b22020389212194e24a03ffd93903b8c886a5af603`. Because the runner wrote its error result after receipt validation, the artifact lacks the browser's final metrics/row arrays. Do not reconstruct absent measurements or mark that run green. Source surface/aim emitted steps were skipped after the earlier failure and still need execution. Source carry/jump side views also show a downward-bent support wrist; numerical contact alone is not a complete visual grip acceptance.

These two QA fixes are separate from the frozen position runtime. Shared workflow/runner integration and exact-head native acceptance remain pending; no public head or main was changed by this review.
