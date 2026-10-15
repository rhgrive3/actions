# Native vertical-slab predicate: lossless CPU experiment (2026-10-13)

## Decision and scope

Candidate for independent Draft review. The correctness gates pass, and the same-harness emitted CPU fixture improves in all four adjacent pairs. The normal-realm ray result is smaller and has a mixed short batch. **Browser, whole-game FPS and iPad mini6 improvement are unproven.** No merge or deployment is authorized by this report.

This is separate from frozen PR #1366. Base is `ee9fbbab5883f20d1968e36a4b6b2faeb1f748fe`. The only runtime edit is the exact-down BVH interval-rejection block in `patches/native-stages/runtime/triangle-world.mjs`. It adds no cache, geometry copy, persistent field, allocation, bot limit, cadence change or reduced collision/paint/damage work. Triangle tests and nearest-hit results are unchanged. Process heap equality is not claimed.

Ownership audit: merged #1316 head `9e97f5f734586f667f960d8b29b862add708e96d` introduced the existing downward specialization. Open #1324 head `b449ed886d2c4e4626be462315232f3318eabf2e` still only adds `sweepSphere` to this file. Its ray block is untouched. The narrow follow-on scope was recorded in [coordination comment](https://github.com/rhgrive3/actions/pull/1324#issuecomment-6142161870). No pending stage/foundation behavior is imported.

## Why this operation

The prior pinned e57 eight-bot Node/VM profile attributes 23,190 position ticks to the vertical Y slab line, versus 227 to triangle-edge subtraction. These samples identify a candidate, not a browser cost guarantee or additive timing breakdown. e57 and ee9 TriangleWorld bytes are identical. Rather than add approximately 6 MiB of cached triangle edges, this experiment removes repeated min/max comparisons with no new data structure.

On the newly captured source-composed Scorch trace, 14,043 rays include 12,422 exact-down rays. All hit fields and 429,434 triangle tests match. Separate diagnostic counters give:

| Operation | Baseline | Candidate |
|---|---:|---:|
| Math.min calls | 1,622,648 | 424,326 |
| Math.max calls | 1,622,648 | 424,326 |

That is 2,396,644 fewer calls (73.8%), not a corresponding speed or FPS percentage. Counting wrappers are off during component timings.

## Exact predicate contract

The original vertical block computes `a=(lowerY-originY)/-1` and `b=(upperY-originY)/-1`, then rejects when `min(best,max(a,b)) < max(0,min(a,b))`. The divisions remain literally unchanged.

For ordered endpoints `a>=b` and primitive numeric `best`, rejection is `best===best && (a<0 || best<0 || b>best)`. When best is NaN, the original comparison is false and so is the new guard. With ordered non-NaN endpoints, either upper endpoint being negative makes the intervals disjoint; otherwise rejection is precisely b>best. Infinities and signed zero preserve the strict/inclusive boundary decisions. NaN or inverted endpoints, and non-number far values, execute the original min/max fallback, including coercion order and thrown exceptions.

The computed low/high variables are not used after slab rejection. Candidate/triangle order, nearest-distance tightening, equal-distance replacement, grates, minNormalY, near epsilon, flags, object, triangle, distance, barycentrics, normal and point arithmetic stay unchanged. Arbitrary/up/nearly-vertical rays retain the existing general loop.

## Correctness and actual emitted ownership

Frozen world SHA-256: `76206bdf0a42a5122759ca0914435e3a3f89da590740253e8c4f18d6127af92f`.
Candidate world SHA-256: `8ec489c0cd23c18d4e7cf9727c38f705a9c94b20076a97cb06bf01873c5f5842`.

- Source contracts: **31 pass, 10 optional native-asset skips, 0 failures**.
- Focused tests are included in that source result; actual emitted/minified focused suite: **8/8**.
- Emitted stage-image packaging: **1/1**.
- Existing downward specialization tests remain intact and pass.
- 1,005,400 scalar cases execute the actual source predicate, including extreme exponents and special values.
- 18,144 full source/emitted rays cover inverted, NaN and infinite Float64 bounds, huge/subnormal origins, signed zeros and unusual far values. Additional tests cover non-number coercions and exceptions.
- Full-hit deep equality preserves signed zero and NaN, all metadata and query/triangle counters. World keys and input geometry-buffer identity are unchanged.
- Separate real Actor admission → WeaponRunner → projectile → damage tests at 30/60/120 Hz require actual hits, target splat and paint; native-wall protected targets survive. Only display/movement and paint storage are stubbed in this dedicated damage fixture.

Actual source and emitted NativeLevel constructors supply the candidate class; the emitted tests do not re-minify a test copy. Build hashes:
- baseline: `656f2be5ffdb259bc89825a8370fe46d66ba1a76d2f76d51146ef542ed6539c8`
- candidate: `ddd5b9d5ea5ca26fd0f0f93be76dc5e297250e9ed039e18127396ea64e8eeb7e`

Clustered replay uses 8 real Actor/BotBrain instances, NativePhysics, native nav, projectiles and CPU paint atlas writes. After 1 second warmup, 2 seconds are recorded. All eight remain alive using explicit fixture invulnerability. No native triangles or paint work are dropped. Each pair has identical per-frame Actor/weapon state, RNG, paint grid/ownership, quad numeric commands and actual Float32 upload bytes:

| Composition | Hz | Rays, both | Triangle tests, both | Before/after |
|---|---:|---:|---:|---|
| source | 30 | 10,047 | 260,996 | exact |
| source | 60 | 14,043 | 429,434 | exact |
| source | 120 | 22,214 | 735,668 | exact |
| built | 30 | 10,756 | 284,191 | exact |
| built | 60 | 14,368 | 493,282 | exact |
| built | 120 | 20,679 | 696,681 | exact |

These are six independent before/after comparisons. Source and emitted trajectories differ even on baseline; no cross-format state identity is claimed. The component trace is the source60 lane, not the emitted60 lane. Recorded/hash timings are not performance acceptance samples. The clustered run reports zero damage; the separate mandatory real-damage cases provide damage coverage rather than treating invulnerability as evidence.

## All normal-realm ray timing trials

Node v24.19.0, Intel Xeon Platinum 8573C, shared executor. Both actual world sources run in the same normal Node realm with identical Three vectors and converted source arrays. Input SHA-256: `6bbc5f85da9a1ddced8320a80186d8c66d55e5a859727aa24c772dab5d9e3661`. Full-hit oracle and Math-call instrumentation run separately from timings. There are no per-call timing wrappers or forced GC. Every sample below is retained.

**B=baseline; A=candidate.** Each group uses B A A B B A A B B A A B after equal warmup. The first 4-repetition group has only 2/6 favorable adjacent pairs; it does not establish a stable gain. The longer 20-repetition group has 5/6 favorable pairs, with CPU medians 848.875→759.793 ms (10.5% lower) and wall medians 849.122→759.817 ms. Host/JIT variability remains; this is component evidence, not browser acceptance.

| Repetitions | Variant | Wall ms | Process CPU ms | Observed GC ms |
|---:|:---:|---:|---:|---:|
| 4 | B | 107.736 | 108.019 | 1.891 |
| 4 | A | 111.109 | 111.145 | 0.000 |
| 4 | A | 100.609 | 100.721 | 0.559 |
| 4 | B | 119.372 | 119.400 | 0.000 |
| 4 | B | 109.307 | 109.636 | 0.573 |
| 4 | A | 113.757 | 113.785 | 0.000 |
| 4 | A | 104.643 | 104.701 | 0.581 |
| 4 | B | 147.215 | 147.251 | 0.739 |
| 4 | B | 118.615 | 118.472 | 0.000 |
| 4 | A | 129.936 | 129.964 | 0.674 |
| 4 | A | 106.118 | 106.127 | 0.000 |
| 4 | B | 104.813 | 104.840 | 0.694 |
| 20 | B | 758.051 | 758.542 | 2.103 |
| 20 | A | 611.402 | 611.499 | 1.619 |
| 20 | A | 720.049 | 720.206 | 9.169 |
| 20 | B | 671.753 | 671.703 | 1.684 |
| 20 | B | 830.257 | 829.741 | 1.425 |
| 20 | A | 789.943 | 790.042 | 1.691 |
| 20 | A | 729.692 | 729.544 | 4.956 |
| 20 | B | 877.533 | 877.618 | 1.416 |
| 20 | B | 867.988 | 868.009 | 1.529 |
| 20 | A | 807.349 | 806.882 | 2.348 |
| 20 | A | 809.945 | 809.728 | 4.867 |
| 20 | B | 1150.920 | 1149.487 | 4.532 |

## All same-harness emitted CPU trials

Eight interleaved B A A B B A A B processes, 60 Hz, 1 simulated second warmup plus 4 measured seconds. This gate is **without per-call profiling/hash recording**, not completely uninstrumented: lightweight counters/wrappers remain on paint, hits, water queries and LOS, and per-frame clocks remain. Harness SHA-256 is `21b256bd67fb577a54e53286d25c82f252d6e1d4219eb6004252c2e14871df8c` throughout.

| Trial | Variant | Wall ms | User+system CPU ms | Observed GC ms |
|---:|:---:|---:|---:|---:|
| 1 | B | 2032.953 | 2574.903 | 4.610 |
| 2 | A | 1201.161 | 1712.253 | 4.874 |
| 3 | A | 1297.763 | 1696.114 | 4.468 |
| 4 | B | 2391.438 | 3477.250 | 23.167 |
| 5 | B | 2316.155 | 2806.565 | 4.554 |
| 6 | A | 1194.081 | 1742.710 | 2.259 |
| 7 | A | 1182.482 | 1662.012 | 2.039 |
| 8 | B | 2142.944 | 2601.620 | 3.293 |

All four adjacent pairs improve in this fixture. Median process CPU is 2704.093→1704.184 ms (37.0% lower); median wall is 2229.549→1197.621 ms (46.3% lower). **These percentages belong only to this Node VM fixture. Removing Math calls can have a larger effect across its context boundary; they must not be advertised as browser, game or iPad speedups.**

All trials retain identical final Actor/weapon/RNG/paint state, 8 survivors, 30,730 rays, 904,462 triangle tests, 13,749 quads, 173 upload draws, 52 splats and 3,636 LOS calls. Counters are work equality, not GPU timing. GC is observed, never forced or subtracted. Process CPU includes V8 helper threads; memory snapshots are not an allocation total. The integration worker paused its heavy work for this longer-component/full-CPU window, but full host isolation is not guaranteed.

Character display, FX, audio, GPU raster/driver and actual hardware are absent. Native paint CPU attribute generation and upload arguments execute; renderer draws do no GPU work. This is not an end-to-end graphical frame benchmark. A reviewed, bounded normal-browser measurement is still needed before a production performance claim. No additional workflow or diagnostic run is dispatched here.

## Reproduction and remaining gates

- `node --experimental-vm-modules --test patches/native-stages/tests/*.test.mjs patches/splatoon3/tests/scorch-gorge-stage.test.mjs patches/splatoon3/tests/ranked-world.test.mjs`
- Build via the existing `scripts/build-inkwave.mjs`, then `INKWAVE_BUILT_SITE=... node --experimental-vm-modules --test patches/native-stages/tests/vertical-slab-parity.test.mjs`.
- `scripts/measure-inkwave-native-slab.mjs --source-dir <verified source> --record --hz 30|60|120 --seconds 2`, paired with `--baseline` for source or a separate untouched ee9 build for emitted. `--ray-out <file>` records component inputs; it is off in timed samples.
- `scripts/benchmark-inkwave-native-slab.mjs --source-dir <verified source> --queries <recorded rays> --loops 4|20 --out <result>`.
- Existing native-stage workflow gains the emitted oracle step; no existing gate is weakened. Base ee9's separate shared catalog/Vac test correction is owned by #1362, not included in this runtime scope.

[Machine receipt](evidence/inkwave-native-vertical-slab-2026-10-13.json) retains all trial values, per-pair replay receipts, test logs, input hashes and raw-file hashes. Only identical final snapshots are deduplicated using `finalRef`. Private OBJ/MTL/texture/converted assets and the captured query file are not committed. Source geometry is pinned by the existing Scorch catalog: OBJ SHA-256 `c8d0e21345ff9f4eb528e699de2ad9c478af78d7284f347399cc59ab94eb4cd8`, revision `0611f51b35c9736ee986fb2218461e2585b7875e`, 133,737 collision triangles.

Splatoon 3 comparison remains the existing repository's Ver.11.3.0 reference context; no new retail frame/velocity claim is inferred. This patch preserves INKWAVE's existing movement, support, shot/blocker and paint decisions. Source-logic, emitted-logic, browser and retail-device evidence remain distinct. Other native assets, browser rendering, physical iPad mini6 performance and final-head CI remain open.
