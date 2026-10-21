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
