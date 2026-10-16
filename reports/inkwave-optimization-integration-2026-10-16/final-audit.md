# Additional optimization audit, 2026-10-16

This continuation starts after the already accepted A*, paint-distance, FK, native normal-readback and GPU-quality/lifecycle changes. It qualifies further changes against the public `inkwave-public` product, retaining existing gameplay, animation and rendering rules.

| Investigated work | Disposition and established result |
| --- | --- |
| Hair spring coefficients | Adopted in PR1514. One bounded K/D/dt record per existing segment, reused across axes/equal ticks. In the six-strand/four-segment, 120-warmed-tick control, each coefficient sqrt/exp/cos/sin goes from 8,640 evaluations to 0. A changed tick recalculates coefficients. |
| Source Euler conversion | Adopted in PR1514. Exact signed-zero sin/cos coefficients preserve the native ZYX expression. The 360-frame WalkHold control reduces each function 71,280→36,360 evaluations. No pose cache. |
| Native material membership | Adopted in PR1514. Per-load index preserves matching order, all-role matches, last-role precedence and cancellation. The 96-material/48-texture control reduces map enumeration 4,512→96. |
| Fullscreen post depth | Adopted in PR1515. Guarded mobile packed path keeps scene depth and removes only the unused fullscreen target depth. Actual WebGL live composer depth renderbuffers 2→1; native reset, fallback, resize and hidden/rebuild preserve roles and output. |
| Last-quaternion lookup cache | Rejected: paired Node actual-Character owner median regressed approximately 4.7%. Prototype and 11,016 retained bytes removed. |
| Direct texture decode/resize | Rejected: WebKit changes 423–11,792 channels, maximum 36. Native decoder retained. |
| Further FK/interpolation/source-polynomial/IK or render-pass suppression | No additional equivalence-qualified replacement established. Reducing the work without preserving required state/output needs further evidence. Existing visual budgets and authoritative gameplay remain intact. |
| Whole-game performance estimate | No claim: strict calibration against the then-current main `f11d7e2d` failed by at most one code value in two channels, and independent same-version self-control also failed. Main subsequently advanced to `b1f571da`; these failed historical calibration reports are not treated as qualification of that newer source. Reports and raw images are retained; no tolerance was relaxed and no rejected calibration was promoted to measurement. |

Both PRs require their complete applicable CI suites. Accepted-main integration is separately bound to source 359a2491ff1771aecdc41898a68a68695216cd5c / tree b5a46abb5be10288151579f1105cdc634f235b40 / product bdf3f02436095bffbdd647f2f26cc8eebf2729b66f0128b66b9de064b591d2db. Source 38/38, emitted 18/18, exact-source Game 476 verified responses, flat post 78 exact cases/engine and an additional shadow-enabled 78 cases/engine pass. See the retained receipts.

Physical iPad memory allocation, thermal/frame-time behavior and crash resolution remain unverified. Issue #642 retains device GPU/image acceptance; #845 retains mobile camera-away traces; #1434 retains strict whole-game calibration and measurement. Component operation counts and WebGL-object counts cannot establish those outcomes. No assertion is made that all possible future optimizations have been exhausted.

A final render-target inspection also confirms the native paint, cloud bake and ScreenFX lens targets already omit depth. Reflection, shadow, preview and geometry targets carry scene depth requirements, so no further attachment removal is established safe by this inspection.

PR1514 merged as `84630809391f25a51e512a850ca4abc21d07084c`; PR1515 merged as `a262d8bcd2c8e95d6fef76e6081d89c33aea25de`. The actual final tree equals the qualified tree above. Each PR has 21 successful applicable checks and 7 allowed optional skips; each full source suite has 6,364 tests / 6,341 pass / 23 conditional skips / 0 fail. CodeRabbit status is SUCCESS, but its automatic review was explicitly skipped for repository conditions; no formal submitted reviews or review threads are present. See `completed-pr-ci.json` and `review-state.json`.

Pages run38876955914 succeeded for the actual final merge. The published build inputs and artifact map equal the qualified product, and all10checked actual root/immutable response hashes match. See `final-publication.json` and `final-pages-run.json`.
