# Shooter full-flight/marker collision invalidation

Incremental follow-up on integration `550ec3219c0b8e20a842949322efe22e516f3ce0`, which already contains the verified collision producer and accepted ShotGuide/Dualies consumer. Source changes are limited to the existing `s3ShooterImpact` and `muzzleBlockFeedback` caches. The earlier guide commits and producer are preserved and must not be applied again for this follow-up.

## Reproduction and result

The existing real-Tower cache regression uses the production-composed Actor/Character/Level/Physics and installed RankedWorld. Kid Shooter is grounded, yaw/pitch/speed zero. A pole-relative origin is selected at `towerPoleBlock.center + (0,0,-4)`; Actor and Character root translate together so the actual muzzle reaches it. Aim is fixed at that origin plus `(0,0,70)`. Calls are controlled prediction APIs, with no `computeAim` between the Tower change and the contact queries and no advancing simulation time.

The actual `beforeActors({rule:{state:{progress:.1}}})` writer moves the Tower. In this reused regression the revision is **8→9**, because append/rebuild/solid checks precede Tower installation; the peer's standalone scene had the equivalent **5→6** change. No revision is fabricated to force the result.

| Query | Before Tower move | Old cached result after move | Fresh solver / fixed result after move |
| --- | --- | --- | --- |
| `s3ShooterImpact` | `[-3.86e-17,2.945,-.28000000000000064]` | Same stale pole contact | `[-2.24e-17,5.55e-17,9.499870059670593]` |
| `muzzleBlockFeedback` | Same pole contact | Same stale pole contact | Same fresh floor contact |

The original strengthened regression failed as expected: `full-flight prediction observes the actual collision revision immediately`. Its logged values show both stale caches. The fixed source and emitted runs agree with the independently recomputed native full-flight solver within `1e-8`. That recomputation only invalidates the private impact cache as a CPU test oracle; it is not a forced gameplay or visual-success claim. The nominal ShotGuide already updated before this follow-up and remains separate.

## Narrow fix

Both demonstrated consumers now reuse only with a valid, unchanged safe nonnegative `physics.level.collisionRevision`, from the already-reviewed producer contract. Uninstrumented/segment-only owners recompute. Query stamps and legacy unproduced generation fields do not establish reuse. Existing periodic refresh remains a secondary policy, not a substitute for collision invalidation.

The keys bind the actual Actor/Character/weapon/runner, relevant launch inputs and functions, Physics/Level/query owners and methods, native data and `triangleWorld` identities. The outer marker cache therefore cannot hide an inner prediction invalidation. Existing field-contact admission, full-flight lifetime, collision integration, target feedback and screen projection are unchanged. No marker hiding, concentricity, aim convergence, smoothing or new physics rule is added.

The #945 isolated unit now declares the verified revision contract explicitly, tests that a dedup stamp does not invalidate, and checks an unversioned owner always recomputes. The #94 geometry/cost fixture now uses the canonical production composition and actual Level add/hash/notification writers instead of a custom world with a manually changed unused generation. Its original assertions are retained; real Tower/native-surface and unknown-world tests provide the production evidence.

## Verification

- Source cache/owner/near-cover cases: **13/13** using `shooter-shot-guide-cache.test.mjs`, `issue-945-muzzle-feedback-cache.test.mjs`, and `issue-94-muzzle-feedback.test.mjs`.
- Actual-shot impact agreement and prediction-cache lifetime: **15/15** using `issue-94-impact-agreement.test.mjs` and `prediction-cache-lifetime.test.mjs`.
- Actual final optimized emitted runtime: **11/11** using `shooter-shot-guide-cache.test.mjs` and `shooter-dualies-projection.test.mjs` with `INKWAVE_BUILT_SITE=/tmp/inkwave-shooter-impact-revision-20261026`.
- Normal `build-inkwave.mjs`, quick compatibility and startup budget/all-artifact digest gate: passed. Source-input and emitted-artifact readback match both modified runtime modules; all203 raw upstream inputs match the build manifest. No upstream snapshot, workflow, other cache consumer or producer source is edited.

`verification.json` gives the full code commit, build hashes, complete before/fixed/emitted point traces and source readbacks. Gzipped logs preserve the correct pre-fix negative, fixed Tower case, source/compatibility/emitted runs and build/gates. Optional dynamic source motion cannot load in the VM, so native Character fallback is explicit. These are controlled CPU/source/emitted collision checks, not natural HUD/GPU/Switch evidence. The original inner-marker appearance remains unresolved. No original-game media is included; no PR, merge or manual CI is launched by this follow-up.
