# Explosher capture admission hardening candidate
Parent: e4ca7e1dc30543a945578f361fa1246a773bdd5d. Runtime unchanged.
Separate branch preserves the original PR head and its queued CI.
The guard test evaluates the actual wrapper/generated-driver admission conditions with mocked image statistics and mocked checkout data. It does not exercise Chromium, PNG decoding or actual Git hashing.
Positive: complete 18 capture matrix and nonflat opaque image statistics.
Negative: duplicate/missing/unexpected frame, missing live native points, pageerror, flat/transparent image statistics, source SHA mismatch.
[
  {
    "name": "complete 18 capture matrix",
    "status": "pass"
  },
  {
    "name": "duplicate tick/view replaces required frame",
    "status": "rejected",
    "reason": "Error: Duplicate or unexpected native capture"
  },
  {
    "name": "missing one capture",
    "status": "rejected",
    "reason": "Error: Wrong native capture count"
  },
  {
    "name": "18 frames with unexpected tick",
    "status": "rejected",
    "reason": "Error: Duplicate or unexpected native capture"
  },
  {
    "name": "zero live native points at tick3",
    "status": "rejected",
    "reason": "Error: Missing live Explosher in native capture"
  },
  {
    "name": "pageerror rejects capture",
    "status": "rejected",
    "reason": "Error: Native page errors: TypeError: render failed"
  },
  {
    "name": "blank PNG rejects despite positive draws",
    "status": "rejected",
    "reason": "Error: Empty or flat native capture"
  },
  {
    "name": "transparent PNG rejects",
    "status": "rejected",
    "reason": "Error: Empty or flat native capture"
  },
  {
    "name": "nonflat correct-size image passes",
    "status": "pass"
  },
  {
    "name": "source SHA mismatch",
    "status": "rejected",
    "reason": "Error: Requested SHA does not match checkout HEAD"
  }
]
Real screenshots remain subject to visual review; nonempty statistics and draw counts cannot prove fidelity.

## Native initial-history reset
The original run 39616040214 completed both captures, but rejected the pair on physical state at tick 0 (same seed/damage/life, different muzzle position/velocity). These are not an accepted equal-condition pair.
The diagnostic copy now reuses resetCaptureCharacter verbatim from the existing native evaluator, awaits the normal source loader, verifies ownership/disposal, and resets diagnostic clocks before the normal fixed-step settling frames.
Neither production Character source nor animation settings are edited. Both before/after use this same diagnostic helper and exact physical equality remains required.
PNG acquisition is still blocked by environment storage and Library scope; no images have been reviewed.

## Camera preflight revision
Run 39624988660 also rejected strict tick-0 physical equality after both nonempty 18-frame captures passed admission. The observed tick-0 position minus velocity/60 was exactly identical on both sides: [22.887363783504767,0.6155094993067594,-17.450669513060834]. Remaining difference is the emitted direction, not a different muzzle origin.
The diagnostic now invokes the existing CameraRig.follow(actor,true) snap after canonical placement, on both sides. It records pre-shot aimPoint/aimDir, camera springs/gameCam, and a transparent read-only trace of the normal _aimFrom calls. No projectile is fabricated.
One-frame preflights must first pass exact trace/physics/camera equality before the full 36-image pair runs. Failures remain failures, with no tolerance relaxation. Production source is unchanged.

## Shoulder-history preflight correction
Run 39628749184 stopped at the short preflight, before long captures. Its actual normal _aimFrom trace proved equal muzzle/seed/direction intent but a differing aimPoint.x. All recorded active springs matched; the remaining camera position offset comes from CameraRig._follow's shoulder damping, which follow(actor,true) does not reset.
The diagnostic initializes shoulder to the native first-follow effective value (undefined || 0) on both sides before fixed stepping and records that initial value. This is not a production camera change or post-hoc rounding. Strict effective pre-shot, aim-trace and physical equality remain required.
Whole-scene triangle/geometry counts differed between the rejected pair (startup/render history was unequal). They are not reported as a glitter cost improvement or pass.

## Full-capture binding and normal palette input
Run 39635232430 passed its strict preflight, then generated both full sets. Final comparison failed inkHex (15917842 versus 16747028), so no total 36-frame physical/resource pass is claimed.
Both isolated diagnostic browsers now select the game's existing colorblind accessibility palette through inkwave.settings before native initialization, matching the existing projectile evaluator's #ffd21a check. No Character/material/model color is overwritten after boot.
Each full capture must match its saved preflight at tick 0 for real physical state, aim trace, camera, palette, clock and scene-light/viewport inputs before further screenshots. Palette/physical mismatch negative cases reject. The saved preflight content hash is recorded.
Video remains dependent on a successful complete strict pair and actual visual review.


## Correct frame0 view correspondence (174c diagnostic failure)
Run 39641505699 passed strict preflight, then the base full capture stopped after its behind frame because the harness incorrectly bound tele-side camera to the behind-only preflight. No complete pair pass is claimed. Preserve its failure artifact.
The correction keeps all frame0 physics, aim, palette, native reset, time, sparkle, light and viewport checks for every view. Only camera binding is conditioned on the same view. Tele-side and tele-oblique cameras are not bound to behind preflight, but remain strictly compared against their same-view before/after counterpart. RAM admission tests reject same-view camera drift and any-view physics/palette drift while accepting a legitimate different-view camera. Actual browser validation remains pending.


## 3aa57b full-pair resource failure and source-readiness diagnostics
Run 39646463296 passed strict preflight and both 18-frame captures. Full comparison failed at the first frame's triangle limit; later frame physics was not yet evaluated. Artifact 12371163750 preserves all captures (ZIP SHA256 4e0c46cd482957a59a8210be059a1a290ffa7d75b978274ae73ea8ce42795cdb). Preflight whole-scene triangles were 697773/702921, calls162/162, points28/28, geometries288/287. These are not isolated VFX costs.
Official source comparison against7581ca9 has only the intended19-line production shapes change; other changes are diagnostic/test/report files. Before freezing, the next diagnostic awaits existing actor sourceMotion.ready and any already-started _warmed Promise, rejects unavailable/replaced owners, and never starts warmAll or changes LOD/model/visibility. WarmAll restores temporary visibility before awaiting GPU compilation, so pending compilation is not proof of all-visible rendering. Readiness completion is not geometry equality.
A read-only per-owner scene inventory records native source status, variant, clips, LOD tier, mesh/point/line counts, geometry/index/drawRange entries and instances. This inventory is not frustum/shadow/GPU triangle attribution. Every physical and resource check is collected across all18pairs before a hard failure; no triangle limit is weakened. RAM guards cover late physical mismatch after early triangle failure, failed/replaced native owners and read-only census classification. Actual browser validation remains pending.


## Explicit native range-target classification after 5e28c11 preflight failure
Run39659894118 passed48 native tests and both builds, but stopped before capture because its all-actor readiness gate incorrectly expected sourceMotion on TargetDummyCharacter. Artifact12376333896 preserves this failure. Native practice-range/runtime/session.mjs constructs these synchronous no-rig characters as real Actors and adds them to match.range.targets and match.actors; dummy.mjs intentionally has no sourceMotion.
The diagnostic imports the exact emitted TargetDummyCharacter class from the manifest's versioned module, accepts only instances with range.targets membership, integer rangeTarget.index, actor back-reference and scene-owned range:dummy root, and records them as range-target/native-no-source-rig. Normal Characters still require native source readiness, including rejection/error/ownership checks. Both categories remain in the read-only scene census and all rendering/resource gates. A known target positive plus real Character missing-loader and invalid target ownership negatives are added. No production/gameplay model changes.
