# Retire Storm scratch actor references at world clear

Base: `03a349162165c3496c24011e55bc043656ed93be`.
Originally diagnosed and peer-reviewed on df8a4b8f; after main advanced, all
30 changed non-report source/test files were independently fetched and matched
the official Git blobs. Both variants were regenerated on this new base.
Scope: production-composed `inkwave-public/`, not the old prototype.

## Reproduced resource-retirement defect

CPU-07a reuses `Projectiles._rainHits` to arbitrate rain damage. The Map keys
are victims and its values contain cloud owners. After the final cloud expires,
the existing empty-cloud fast path leaves those entries in place. The actual
`Projectiles.clear()` previously did not empty that Map either. `Game` creates
its Projectiles once and calls clear when switching matches/attract mode, so
the scratch Map can keep retired-match actors reachable until another active
rain tick or destruction of the Projectiles owner.

The local reproduction uses the real composed `_updateClouds`, `clear`,
`_releaseCloud` and Storm helpers with synthetic scene/actors. Both victim and
owner references remain after expiry, an empty tick and clear on the baseline.
This is a strong-reference demonstration, not a measured heap-size/FPS result.

## Minimal change

The cache's existing build adapter adds only `this._rainHits?.clear();` to
Projectiles.clear, before the existing ink-flight owner. It does not allocate a
Map, replace the reused Map, or change active rain ticks. The baseline and
candidate full compositions differ by that one emitted line. Raw upstream
`inkwave-public/` files are unchanged.

## Focused validation

`node --test patches/local-quality/tests/rain-hit-scratch-clear.test.mjs`

- Six node:test cases: baseline 1 pass / 5 fail; candidate 6 pass / 0 fail / 0 skip.
- Expiry, empty ticks, normal/repeated clear, no cache before first rain,
  and new-match reuse of the same emptied Map.
- Exact active damage/owner order, RNG and paint at 30/60/120 render Hz through
  the real FixedClock, including remote catch-up controls.
- Interrupted update and a later ink-flight-clear throw preserve the thrown
  object while the scratch Map has already released its entries. This is not
  a guarantee that every unrelated teardown owner handles arbitrary throws.
- Frozen df8 clear preimage and idempotent production composition checked.

Local symlink shadows additionally need `--preserve-symlinks
--preserve-symlinks-main`; these flags are not needed in a normal checkout.
Other resource owners in the isolated method fixture are inert call recorders;
this is not full-browser/resource/disposal or arbitrary injected-Map validation.

Issue #226 remains open: RainNum=72 semantics and retail generation/paint
calibration are unchanged and unverified. No new S3 constants or weapon tuning
are introduced. Related resource-retirement scope does not complete #1565.
At publication preflight, open PRs #1972–#1978 and #1980 have no matching
Storm scratch repair. #1980 changes the same adapter in unrelated GPU hunks,
not its Storm/clear hunk; those changes are not copied here. Fixed #1975
`2a0f50e1` and #1977 `ca275b94` diffs contain neither rainHits nor _updateClouds.
No manual CI dispatch, approval or main merge is part of this patch. PR-triggered
CI results must be read separately at its exact head; local cases are not full CI.
