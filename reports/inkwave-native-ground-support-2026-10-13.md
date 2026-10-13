# Native bot ground-support query: lossless CPU work reduction

## Result and scope

The native-stage bot water guard now asks whether acceptable support exists, instead of finding and allocating a complete nearest ground hit. In the captured eight-bot Scorch workload, the support component performs **51.0% fewer triangle tests** with identical answers. Full source and shipped/minified replay pairs preserve all recorded actor/resource/weapon, RNG, paint-grid, ownership, quad-command and atlas-buffer traces at 30/60/120 Hz.

**Whole-game, browser and iPad performance improvement is not established.** Both full CPU timing batches are noisy, with wins, regressions and large outliers. This is a narrowly verified removal of redundant work, not evidence that clustered-bot frame rate is fixed.

Runtime changes are limited to:

- `patches/native-stages/adapter.mjs`: native `BotBrain._wet` selects the Boolean support API.
- `patches/native-stages/runtime/native-level.mjs`: `hasGroundAbove` preserves the original probe origin, range and filters; custom ground methods use the original height predicate.
- `patches/native-stages/runtime/triangle-world.mjs`: opt-in early success after the existing accepted-triangle test. Default nearest-hit semantics and fields remain unchanged.

No bot count/cadence, visibility cache, damage budget, paint work, visual quality, weapon parameters or block-stage behavior is changed. The earlier exploratory SDF/paint and Boolean-LOS candidates were shelved and are not part of this patch. `NativePhysics` is unchanged.

## Provenance

- Base: `ee9fbbab5883f20d1968e36a4b6b2faeb1f748fe` (includes merged #1320 and #1252).
- Baseline emitted `contentHash`: `656f2be5ffdb259bc89825a8370fe46d66ba1a76d2f76d51146ef542ed6539c8`.
- Candidate emitted `contentHash`: `7d668fe35ce869b682a939e04394cc85b82092577ba82b98bea2eaf9f715d744`.
- Oracle source files are byte-frozen from main e57 and unchanged on ee9. SHA-256 is asserted in the test and replay harness. The baseline is not another copy of the new algorithm.
- Scorch source OBJ SHA-256: `c8d0e21345ff9f4eb528e699de2ad9c478af78d7284f347399cc59ab94eb4cd8`, catalog source revision `0611f51b35c9736ee986fb2218461e2585b7875e`, tree `c5e8f6e5aa14b97a87210ad5df1c91c05b1ab451`.
- The production converter produces 133,737 collision triangles, 45,171 paint faces and 1,469,898 mask cells. OBJ, MTL and tree identities are checked before replay. Third-party source/converted assets remain private and ignored; none is added to this commit or inferred from a stage-menu image.
- Node v24.19.0, Intel Xeon Platinum 8573C, 9 reported logical CPUs, shared executor. This is not iPad hardware, WebKit, a GPU browser or a retail capture.

Machine-readable hashes, replay traces, all timing trials, work counts and GC/heap observations are in [the evidence record](evidence/inkwave-native-ground-support-2026-10-13.json).

## Why the early exit is equivalent

Original `_wet` returns true if `groundHeight(x,z,y+0.6)` is `-Infinity` or below `PLAYER.fallDeathY`. The native height query casts **straight down** and filters normals with the same `minNormalY: .68`. Its nearest accepted distance is therefore the highest accepted hit Y. The highest Y is at/above the death threshold exactly when at least one accepted hit Y is at/above it.

The Boolean path preserves `yMax+.001`, the original `yMin` and far distance, BVH/triangle acceptance, distance epsilon, barycentric tolerance, grate behavior and the original arithmetic `origin.y + dir.y * distance`. It skips an accepted hit below the threshold and keeps searching. Thus a lower pit surface cannot incorrectly certify support, while another valid upper floor can. It does not substitute slope, object bounds, chart rectangles or cached visibility for geometry.

The ordinary nearest result still computes the same point, normal, triangle, barycentrics and tie behavior. Instance, subclass and later global prototype overrides of `groundHeight` are detected against a stable captured original method and evaluated with the old predicate. Invalid-coordinate, infinity/NaN, signed-zero and threshold cases are tested. Native dynamic support semantics are whatever the original native `groundHeight` supplied; this change does not add a different dynamic-ground contract.

A Boolean miss still visits the bounded BVH. A below-threshold hit does not tighten its nearest-distance bound, so unsupported queries can do more work than the old nearest query. There is no universal per-query speedup claim; supported crowded queries are the measured target.

## Measured density and hotspot

Current composed source, fixed RNG, one simulated second of warmup, two seconds measured at 60 Hz. Actors begin clustered near the central valid native nav node. Invulnerability is fixture-only and keeps the requested density. All actors remain alive. Timings are instrumented diagnostics, not acceptance comparisons.

| Bots | Water-guard queries | Native rays | Triangle tests |
|---:|---:|---:|---:|
| 1 | 458 | 1,646 | 38,458 |
| 2 | 1,932 | 4,282 | 111,844 |
| 4 | 2,669 | 7,169 | 236,889 |
| 8 | 5,160 | 14,043 | 429,434 |

In the eight-bot run, native `ray` accounts for 1,417 ms of 2,345 ms instrumented elapsed time. `_steer` is 543 ms and `groundProbe` 543 ms, both including nested ray work; these times **must not be added together**. `_perceive` is 65 ms. Fixed-clock paint CPU work runs in `advanceSimulation` (137 ms) and `splat` (105 ms); the external `flush` call is effectively empty after that fixed-clock advance. All 11,341 quad writes and 87 native atlas draw/upload calls still execute. The renderer stub omits raster/driver work, not the CPU atlas generation. This current profile supersedes the earlier exploratory non-fixed-clock paint timing as ownership evidence.

## Exact replay and damage checks

All six paired runs use one-second warmup plus two measured seconds. Each pair agrees on alive count (8), RNG count/state, recorded actor/weapon state, paint counts/version, every measured-frame grid and ownership hash, every quad command, and actual atlas attribute-buffer bytes supplied to draw calls. Source and emitted runs are separate experiments; cross-format equality is not claimed.

| Runtime | Hz | Baseline triangles | Candidate triangles | Reduction |
|---|---:|---:|---:|---:|
| Composed source | 30 | 260,996 | 208,820 | 20.0% |
| Composed source | 60 | 429,434 | 364,980 | 15.0% |
| Composed source | 120 | 735,668 | 659,766 | 10.3% |
| Emitted/minified | 30 | 284,191 | 219,378 | 22.8% |
| Emitted/minified | 60 | 493,282 | 426,170 | 13.6% |
| Emitted/minified | 120 | 696,681 | 640,126 | 8.1% |

The frozen oracle tests cover 12,000 random ordinary rays plus boundary cases, 30,000 mixed-height support queries, stacked surfaces, overhangs/ceilings, accepted/rejected slope normals, grates, exact fall-death boundaries, custom methods and fresh-world reconstruction. Ordinary ray hit fields and traversal counters are bit-exact. The emitted oracle gets the actual bundled `TriangleWorld` through the shipped `NativeLevel` constructor; it does not re-minify a test copy.

The crowded Scorch runs produce zero damage events, including a short ordinary-combat diagnostic, so they are not claimed as damage coverage. Separate 30/60/120 Hz tests execute real Actor admission → WeaponRunner → projectiles → damage on synthetic native geometry. They require actual hits, a target splat and paint commands, and compare complete recorded results to the frozen baseline. A native wall/object case requires the target to survive. Display and stationary movement are fixture stubs in these damage tests; full CPU paint-grid/atlas parity is supplied by the independent clustered replay.

## Timing results: retain every trial

The isolated component replays the 5,160 actual captured support requests ten times per trial. Both variants perform 51,600 queries and agree on all 51,600 decisions. Triangle tests are **1,263,920 → 619,380**, with no cross-query caching. The first four interleaved pairs show about 41% lower median component wall time; a second batch is substantially noisier. Neither is a guaranteed CPU gain.

For the full emitted CPU fixture, each row below measures four simulated seconds after one second warmup. Here **B = baseline** and **A = candidate**. Order is B/A/A/B/B/A/A/B. All 16 trials retain the same final state/RNG, 8 living actors, 13,749 quads, 173 draws, 52 splats and 3,636 LOS calls. Triangle tests are 904,462 baseline versus 760,732 candidate. No recorded/profile hashing runs are mixed into these timing batches.

| Batch | Trial | Variant | Wall ms | Process user+sys ms | Observed GC ms |
|---|---:|---|---:|---:|---:|
| First | 1 | B | 3574.11 | 4160.03 | not observed |
| First | 2 | A | 2112.90 | 2644.44 | not observed |
| First | 3 | A | 1939.42 | 2507.52 | not observed |
| First | 4 | B | 1906.95 | 2388.56 | not observed |
| First | 5 | B | 2358.22 | 2928.63 | not observed |
| First | 6 | A | 1816.03 | 2324.19 | not observed |
| First | 7 | A | 2252.05 | 2702.53 | not observed |
| First | 8 | B | 2048.33 | 2528.40 | not observed |
| Final | 1 | B | 3908.92 | 4525.92 | 7.90 |
| Final | 2 | A | 1849.41 | 2239.89 | 2.16 |
| Final | 3 | A | 3415.81 | 3966.19 | 4.92 |
| Final | 4 | B | 2230.39 | 2854.24 | 2.47 |
| Final | 5 | B | 1879.18 | 2290.74 | 2.16 |
| Final | 6 | A | 2128.51 | 2565.61 | 2.40 |
| Final | 7 | A | 1885.49 | 2354.47 | 2.66 |
| Final | 8 | B | 9645.96 | 12249.75 | 16.19 |

Both batches contain two favorable and two unfavorable adjacent paired comparisons. The spread prevents establishing a whole-fixture speedup; the late baseline outlier is retained. `process.cpuUsage` includes helper-thread CPU and is not a main-thread-only counter. GC was observed, never forced or subtracted. Heap deltas are not allocation totals. The observed GC pauses alone do not explain the timing variation. Shared load/JIT/concurrent collection effects are not separately resolved. No further wall-time batch was run to select a favorable result.

The first batch includes an edit to an unused experimental duel option; all standard-path outcomes match. The final batch uses one identical harness hash for every trial. After it finished, the source-only baseline integrity check was changed from HEAD equality to fixed oracle SHA verification so the source replay remains usable after committing the optimization. No emitted runtime or measured built branch changed.

## Reproduce and validation

No third-party assets are needed for the automated oracle:

```sh
node --experimental-vm-modules --test patches/native-stages/tests/*.test.mjs \
  patches/splatoon3/tests/scorch-gorge-stage.test.mjs \
  patches/splatoon3/tests/ranked-world.test.mjs
node scripts/build-inkwave.mjs inkwave-public .built-site
INKWAVE_BUILT_SITE="$PWD/.built-site" node --experimental-vm-modules --test \
  patches/native-stages/tests/boolean-ground-parity.test.mjs
INKWAVE_STAGE_ASSET_SITE="$PWD/.built-site" node --test scripts/tests/inkwave-stage-assets.test.mjs
```

The existing native-stage workflow now runs the emitted oracle after its ordinary build. Existing browser cases are unchanged. Local results: source contract suite 32 pass / 10 optional native-asset skips; emitted oracle 9/9; stage-asset packaging 1/1. A local packaging command initially omitted `INKWAVE_STAGE_ASSET_SITE` and looked for `_site`; rerunning with the actual build path resolves that harness error. The wall damage fixture was corrected to include its collidable object metadata before recording the final pass.

With the catalog-pinned OBJ/MTL/tree available in the private source directory:

```sh
node --experimental-vm-modules scripts/measure-inkwave-native-ground.mjs \
  --baseline --seconds 2 --hz 60 --record --out before.json
node --experimental-vm-modules scripts/measure-inkwave-native-ground.mjs \
  --seconds 2 --hz 60 --record --ground-out queries.json --out after.json
node --experimental-vm-modules scripts/benchmark-inkwave-native-ground.mjs \
  --queries queries.json --out component.json
```

Repeat the paired replay at 30 and 120 Hz. For emitted comparisons, supply `INKWAVE_BUILT_SITE` pointing to separately built base and candidate artifacts; never use source substitution `--baseline` with emitted modules. Omit `--record` and `--profile` for CPU timings and keep order interleaved. The source baseline substitutes only the two frozen native modules and the old `_wet` branch into the current full composition; pin the repository revision shown above when reproducing this report.

## Remaining limits and Splatoon 3 comparison

This changes no intended movement, navigation, water/death, shooting or painting behavior. The reference condition remains the repository's Splatoon 3 11.3.0 comparison record; no new retail frame, geometry, bot behavior or device-performance claim is introduced. Native source conversion, navigation suitability, retail hurtboxes and hardware frame pacing remain independently unverified where already noted. The public frozen tree is untouched.

Acceptance here is correctness plus bounded redundant-work removal. A reviewed hosted-browser/device measurement of the same crowded workload is still needed before saying this improves frame rate or resolves the reported unplayability. Do not reduce bot counts, damage/paint work or simulation cadence to obtain that result.

## Adjacent work coordination

PR #1324 head `cfd7ccad511b26c2a0c7c84323f93331ecbe30ec` was freshly inspected. Its foundation adds `TriangleWorld.sweepSphere` and bot climb/navigation adapters, but does not change `groundHeight`, `_wet` or add this Boolean support path. In an isolated scratch copy, its two overlapping file patches apply to the pinned main base; this candidate's ray patch applies unchanged; the combined bot adapter parses with both distinct anchors intact. This is a narrow composition/overlap check, not a full foundation build or validation of the held stage changes. That owner must reconcile the shared adapter file before eventual integration. None of its pending behavior is imported here.

## Known shared CI dependency

Base ee9 has a separately owned catalog test expectation for Booyah armor before its newly introduced 30-frame startup. The fixture-only correction is tracked in PR #1355. This candidate does not weaken that assertion, import unrelated runtime changes, or treat its own focused results as an aggregate CI pass. The central integration owner must verify required checks on the published exact head and reconcile that shared dependency.
