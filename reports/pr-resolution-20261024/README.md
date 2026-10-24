# PR repair status — 2026-10-24

This is a repair and partial validation record, not acceptance of all open PRs.
No merge to main, draft promotion, issue closure, deployment, or review-thread suppression was performed.

## Repairs

- #1852: merged main GPU budget work and preserved both appended behavior records; related Brella tests passed 2/2. Head 35e0b637.
- #1864: removed five overlapping raw-source edits whose optimizations already run through the build adapters. The normal minified build succeeds. Native compact/admission 26/26 and recorded audio 18/18 pass. BodyBalance 1260-frame source transform/skeleton/contact/muzzle comparison and generic fallback pass 2/2. Its benchmark now reverses only the exact queue-source delta to the unchanged historical input; arbitrary drift and historical fixture corruption still reject. Head d3491e33.
- #1856 and #1865: reuse the source-reference migration from #1853; all 13 real edges plus mutation/escape controls pass 8/8 for each. Heads fa3359cf / f3125421.
- #1857 and #1860: the historical projectile-capture inverse now accounts for the exact added current-pair build admission, retaining the old final workload hash. Both suites pass 38/38. Heads 840b14cc / 1ce1dc53.
- #1861: merged main shader warm-up/texture memory work with the queue's texture alias/ownership metadata. Main stage compilation supersedes duplicate ink compilation. Cancellation, compile rejection and detached cleanup remain tested. Merge head 93db7485.

## #1861 QA corrections in this successor

Mocks acknowledge successful transport lock/unlock/send, expose the real Level blocks field and DOM class membership, and load the real PropKit template-cache helpers. They do not change production protocol admission. Partial VM VFX fixtures receive the real consumeVfxPeriod dependency. Periodic-disc expectations now match the explicitly introduced fractional clock; source-only movement probes require zero gameplay RNG calls.

Counterfactual Roller input and heading rollback identities bind their current exact owners. The named mutations remain mandatory. The BodyBalance benchmark reverses only the exact queue delta to its original pinned historical input, while the real 1260-frame source parity suite separately verifies final transforms.

The direct quality and full build compositions retain their distinct exact RAF cleanup anchors. Source routing and pinned-fetch coverage tests pass before updating the workflow's current job-body epoch. Original conditional routes, deadlines, failure propagation and immutable builds remain unchanged by this successor.

Instanced droplet tests check shared pool geometry/material ownership, per-birth colors, cap eviction and last-user release. The GLTF QA Three expansion now runs the same source-composition plugin as the production Three build and still demands exact reconstructed core bytes.

The special browser checker hides the actual Wail batch as well as the logical holders, and exercises SpritePools through their owning kit update. Saturated/reused pools must draw real pixels; warmed empty pools must skip draws. GPU resource counts must return to baseline.

## Validation scope

Raw outputs are alongside this file. Source BodyBalance: 2/2, 1260 compared frames; startup/transport/DOM fixtures: 213 pass, 4 conditional skips; VFX component dependencies/cadence: 28/28; emitted continuation: 16/16; Rainmaker RNG: 8/8; source-routing/workflow tests: 43/43; heading/mobile probes: 5/5; visual allocation/batching: 19/19; detached native cancellation: 9/9; allocation parity: 11/11.

A preliminary real Chromium 154 + SwiftShader special-presentation run passed against merge-built content 6051c09b4f8036007d12e4d29b9ea2178080e4610ba14928a7a78d7f3cf35cc7. Wail speaker pixels: 16933; four pool saturation/reuse/resource cycles and twelve fist lifetimes passed. Its JSON is preserved. This build predates the QA successor and is not final-head hosted acceptance or a hardware FPS claim.

## Remaining blockers

- All latest hosted required checks must finish on the actual pushed heads; queued/in_progress/skipped are not acceptance.
- #1859 has two hosted results-work deadline failures on ad0c5e8. An unmodified local diagnostic additionally failed clouds:day at 120008 ms against the unchanged 120000-ms limit. No deadline, native rendering threshold, sample count, launch flag, or production rendering workload was weakened to obtain a pass.
- #1861's previously failed closed source-pair/capture epochs require a real current comparison and provenance review. They are not waived by these test-fixture repairs. The full patch matrix and full hosted browser lane have not been accepted.
- #1854's active job failed on loopback route.fetch ECONNRESET. Exactly one job-only retry was requested; success is not assumed.
- Required retail dynamic footage, real-device/Safari/iPad GPU behavior, deployed relay acceptance and the original queue's deferred/unresolved requirements remain unverified. These cannot be replaced with source tests or the local SwiftShader run.

## Final source/build readback

On source commit 64bf3c7c6a6bf176d2dbdeb1f0b9642b8a708c2b, the normal minified build and quick compatibility gate pass. verifyWallBuild(..., true) checked all 1435 current source inputs against committed HEAD and reread all 2130 artifacts. Final contentHash is 6051c09b4f8036007d12e4d29b9ea2178080e4610ba14928a7a78d7f3cf35cc7: every artifact digest is identical to the passing special-presentation browser build. Input maps differ because the build-time adapter source changed; the emitted bytes do not. This establishes artifact identity, not a second browser run or final hosted CI acceptance.

The closed 23-PR paint source-pair suite was rerun and remains failed on its exact Roller/pose blob expectation (93e2a103 versus required d0fa9907). Its output is preserved in sourcepair1861-final.log. That gate is not re-pinned or bypassed by this repair.
