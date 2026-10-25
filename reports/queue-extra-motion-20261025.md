# Additional character and motion optimizations, 2026-10-25

Base: open PR #1870, head `8e539eac1e5fe4a6412d3e5852d7f5eaa5d0c1da`. The current 513-entry queue inventory was screened by scope. [The dispositions](queue-extra-motion-dispositions-20261025.json) explicitly distinguish ten new fixes from mechanisms already effective on that PR and five unresolved proposals. No new hosted workflow was dispatched.

## Changes

- TentacleSurface shares its duplicate arc-length mapping. Mirrored ear sections share build-local rows. Eyeballs share exact ring/azimuth operands and reuse the derivative vector.
- Authored `character-outfit.js` directly owns its three new improvements: a lazy tilt cache, four exact-coordinate limb centreline tables, and conservative strap distance block rejection. This module was already Direct-Source migrated, so no build-time outfit rewrite was introduced. The frozen before fixture's hash is `e63ce564ca2ba43efb4cc310451c1e5a81fa724ef7f55baf18a3707e006cd16c`.
- Action lookup uses live Map checks in the original priority order. Dance cache misses scan the full fallback roster only if both preferred clips are absent. Six fixed response coefficients share exact-dt scalar slots; six stance components share one identical damping alpha.
- Other immutable raw inputs stay unchanged. Existing source pose, IK/FK, hair integration, forms, weapon logic, cadence, LOD density/fades, damage, paint and network contracts remain intact. This work does not claim closer retail Splatoon 3 Ver.11.3.0 parity or resolve its existing unmeasured differences.

## Local evidence

`node --experimental-vm-modules --test patches/local-quality/tests/queue-extra-motion.test.mjs` covers eight distinct tests. The main seven-test run passed; after the independent dance first-miss improvement, the pinned-source, response-slot and dance tests also passed. No tests were skipped. A fixture-only cross-realm array-prototype comparison was corrected with structured cloning; it had identical structures and did not represent a production geometry difference.

- 24 actual Three.js curve variants, including zero-length curves, exact P/T/O/B, tube attributes/index/normals and suction geometry. Arc-length searches fall from `2*(N+1)` to `N+1`.
- All 12 face LOD/quality combinations, 77,242 face vertices, exact attribute/index/AO and source weight data, plus both mirrored eyeball cap buffers.
- Actual source-loaded Character at 30/60/120 Hz: 288 before/after comparisons of every bone transform/world matrix, skeleton buffer, springs, hair state, stance and muzzle. Every tested human LOD mesh attribute/index matched. RNG observers remained equal (zero calls on both sides).
- 17,920 live action-clip map/family/event comparisons. Dance primary, normal fallback, ordered roster fallback and empty-roster exception match; preferred clips cause zero roster scans.
- Limb-cache coordinate invalidation, four-table bound and caller-output isolation; plate tilt `+0/-0/NaN/Infinity`; exact response boundaries and warmed work counters. Fixed-dt response slots perform zero repeated exp/expm1 after warm-up; changed dt recomputes the exact coefficients.
- Direct-Source ownership suite: 14 passes, zero failures/skips, including its unchanged outfit zero-rewrite contract.
- Existing character-kernel, motion-scalar, motion-cold and motion-FK regression suites: 18 passes, zero failures/skips. The actual source-loaded motion trace covers 1,164 comparisons at 30/60/120 Hz including idle, move, air, land, ToSquid and ToHuman states.

[The local CPU benchmark](queue-extra-motion-benchmark-20261025.json) evaluates full production `teeFold` on 7,600 actual tee surface points, three sweeps per measurement, eight alternating-order measurements per side. All 7,600 displacements match with Object.is and both aggregate sums match. Median 152.57 → 72.52 ms (about 52.5% less CPU in this isolated Node workload). This measures construction math, not game frame rate, GPU, iPad memory, GC or end-user startup latency.

## Limits and unresolved work

The existing main/PR mechanisms already cover tube angle/twist sharing, suction normal scratch, retarget head/rest reuse, root-hair head reuse and per-chain coefficients, invisible remote eye work, jump references, root smoothing, native source-owned leg IK, procedural hair coefficients, LOD mesh reuse, yaw/vergence, sparse locomotion accumulators, option records and unread overlay FK. They are not counted as new fixes.

Five proposals remain pending with specific reasons in the machine-readable dispositions: bounded character warmup concurrency, exact-zero cosmetic trig, fully quiescent root-hair early return, zero-reach parent-walk skipping, and lazy public clip snapshots. Their finite-state assumptions, scratch/cache effects or public/lifecycle semantics are not silently treated as proven no-ops.

Browser pixel comparison, Safari/iPad measurement and retail-game capture were not performed by this workstream. Actual source-loaded/geometry equivalence must not be described as rendered-screen or physical-device equivalence.
