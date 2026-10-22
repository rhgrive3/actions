# Special, subweapon and paint queue repairs — 2026-10-22

Base: `c0938a3f84768474df91713f7b372f9d7f8fe96a`. The initial batch covered 59 assigned Library queue records; the follow-up below brings the assigned total to 63. The existing 11.3.0 weapon values, frame schedules, actor authority, paint arbitration, source triangle order and VFX shader programs are retained. No additional retail/Switch parity or iPad performance acceptance is claimed.

## Resulting behavior

- Ancillary paint ownership now records the exact accepted cell in the live minimap dirty bounds. Rejected/repeated claims remain no-ops; this fixes the stale ancillary-only map update.
- Paint atlas clear/draw restores renderer state on failure. A failed draw propagates its original error and blocks another partial-pass retry until a successful clear; mipmap completion counters advance only after a successful pass.
- Burst/native bomb previews reuse visible line-distance attributes and scratch wrappers. Vac, deployed subs, sprites and ink volumes avoid inactive work. Sprinkler periods remain fixed at deployment; distant actor checks preserve the original capsule test for every candidate that could hit.
- Special flight, Inkstrike probes, grounded Fizzy/Torpedo sweeps, Zipcaster/Reefslider presentation, Wail traces/anchors, Screen history and missile previews use owned scratch storage. Empty sub ticks still process detached Torpedo splashes and actor statuses.
- Per-growth ancillary templates retain up to eight projection keys, then release face/cell caches when the growth lease ends. CPU ownership reuses the already computed GPU growth phase and validates state once per synchronous body-cell loop.
- Native paint charts allocate one final mask and preserve grouping, projection, metadata and raster bytes against the fixed baseline. Native visible chart indices use ascending set bits; repeated static chart bounds retain a single bounded memo, invalidated on clear/binding/geometry changes.
- Sprite overflow uses an indexed max heap with the original lowest-index tie break. Nonfinite or negative ratios fall back to the original scan. Recipe option reuse preserves each 23-slot Float32 birth state and presentation RNG order.
- Paint capability admission still prunes immediately on every authority-sensitive path. Unrelated replay events with no pending core only require the epoch check and bounded periodic cleanup.

## History ownership and rejected reuse proposal

1. `paint-ownership-order-history-monotonic-retention`: the queue's safe packed-metadata alternative is implemented: every local record now retains its wrapping numeric sequence without a per-stamp object. Exact returned IDs, record-array positions/length, network metadata and dedupe receipts are retained. Comparator accepts both packed local values and old local record objects. 100,000 baseline attempts, mixed network receipts, 20,000 pair comparisons, wrap and hidden/native replay preserve results. An executable stale numeric-ID counterexample rejects erasure/reuse even when no current grid cell refers to the ID; no history GC is claimed.
2. `special-shape-pool-recycle-typedarray-records`: old shape handles and their writable `v` arrays escape into tracks and follow closures. Recycling their buffers while those references survive would let an expired effect change a new effect. An executable counterexample now demonstrates both failures on the actual ShapePool: a stale `old.v[0] = 999` appears in the new shape's uploaded attribute after buffer reuse, while `old.dead = true` removes the new effect after record reuse. Raw escaped typed arrays cannot be revoked with a generation check on the record; the proposed reuse is rejected as incompatible with the existing handle contract. An API/ownership redesign would be separate work. The existing safe allocation remains.

The quad-index array queue is already implemented by `paint-hotpath-adapter.mjs`; it was verified, not duplicated. The exact zero-drag sprite change is integrated separately by the coordinating branch from PR #1779.

## Isolated performance check

An alternating 12-run Node microbenchmark on 6,000 synthetic triangles measured median chart conversion of 31.10 ms for the fixed baseline and 6.22 ms for this combined chart implementation. This is a synthetic container measurement, not a production map, browser Worker, iPad or FPS result.

## Verification and limits

Focused source and production-composition regressions cover paint arbitration/hidden replay, palette and VFX state, preview/subweapon behavior, flight/contact schedules, network paint admission, native chunks, volumes and disposal. New tests compare 120 seeded chart sets with complete metadata/mask equality; count the one final mask allocation; compare sprite heap state with the original scan at capacities 2/3/520/900; compare recipe Float32 slots/RNG order; and inject atlas render failures plus isolated ancillary-only minimap updates.

Final grouped runtime/native regressions: **180 passing, zero failing, five skipped** because pinned full-stage assets are absent (185 cases total). Separate network paint/codec and volume group: **112 passing**. Direct-source ownership: **14 passing**. Final atlas/minimap/cache-lifetime regressions: **4 passing**; real legacy hash/native memo regressions: **2 passing**. The final group includes the nine exact VFX numerical checks and two native chart baseline checks. Pinned full-stage assets are unavailable, so those comparisons remain skipped. Python `numba` was installed to run the separate Python raster oracle. Neither JS tests nor synthetic equality establish browser/GPU pixels or real-device frame-time improvements.

## Four additional paint/wake queues

- `_cpuSplat` tracks only accepted, live turf-cell extrema within each row. Affine world transforms run for at most two endpoints per changed row, preserving the exact dirty rectangle and original per-cell `inkDirty.gen` increment total. Ancillary sparse-cell writes retain their exact notifications. The composed regression covers four rotations and four source/profile kinds with native dead-cell exclusions, grid/count parity and exact dirty bounds.
- Coverage caches use a turf mutation token while every actual paint mutation still advances the public `version`. Known wall-only body/ancillary writes retain the weighted turf result. Unknown version changes (including an unknown write preceding a known wall write), clear and grid/dead/face identity changes force recalculation. Cell/weight summation order is unchanged.
- Growth leases maintain non-speck counts by team across retention, forced removal, normal completion, pooling, clear and dispose. New stamps can omit the whole reverse scan when no opposing growth exists. Unknown records or invalid teams fail open. The original reverse overlap scan and finish/draw/remove order remain on all possible opposing paths; 150 seeded actual splat calls match an unconditional-scan control exactly. No optional spatial index was introduced.
- SwimWake retains per-slot uploaded-prefix lengths and clears tail sentinels only when points become inactive. Empty bounds/head slots are written once per transition. Reset and uniform-array rebinding invalidate the complete upload epoch. Numerical uniform parity is checked against the fixed pre-change source at 30/60/120 Hz through idle, one/four swimmers, teleport, climb, sneaking, death, fade, reset, rebinding and results. Repeated fully idle frames perform zero vector writes after the initial 56. Shader loops are unchanged; the optional point-count shader branch lacks GPU timing/visual evidence and is not claimed as implemented.

The four-queue follow-up reclaims no paint order IDs, historical replay receipts or escaped handles. The subsequent packed local-metadata change resolves the history queue's low-risk alternative; unsafe reclamation and raw escaped ShapePool reuse remain rejected. Browser GPU/retail/device performance acceptance remains unmeasured.

Follow-up final verification: **71 passing, zero failing, zero skipped** across the focused queue proof, production pool/scoring/paint regressions and direct-source ownership/source-identity/lightmap gates. Strict upstream/reference 11.3.0 quick checks and `git diff --check` pass.

Packed-history follow-up verification: **35 passing, zero failing** across baseline order/dedupe proofs, actual paint authority/temporal/hidden replay and native ancillary replay. The retained history still grows in ID slots; this removes local objects, not the stable IDs required by the existing contract. Physical-device RAM/GC remains unmeasured.
