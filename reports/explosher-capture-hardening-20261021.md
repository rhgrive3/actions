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
