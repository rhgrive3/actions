# Native-stage downward ray specialization

## Current integration and browser status

Main `545c6b3fcfc0d25c43678e9b44b1af4e26400fec` integrates the shared PR1304 verifier fixes. Reapply only this PR's five owned files on that main: production contentHash remains exactly `60c31f4d5235dc9e595640eca6d10c6a0dbbb44d7e352fcafd4f8b6e6e08dda1`, identical to original candidate5559297. Local focused23/23 and production build pass. Original5559297 native-integration CI [38281620667](https://github.com/rhgrive3/actions/actions/runs/38281620667) succeeds. Final-head native/general CI remain required.

Actual Scorch main-loop diagnostic [38284051070](https://github.com/rhgrive3/actions/actions/runs/38284051070), harness19e9de3, completed four runs with8actors alive. **Performance acceptance fails:** repeated A/A baseline paint grids differ, so the fixture is not deterministic. Keep these results; do not claim whole-game or device speedup. Separate60-frame CDP samples do establish that ray is a live cost: before95.087ms, after82.927ms. These are one sampled window per build, not a passing ABBA speed result. Caller self samples are FX droplets52.863→58.371ms, Character ground23.205→15.989ms, Physics groundProbe17.951→6.427ms, bot groundHeight1.068→1.076ms (plus1.064ms sampled camera ray only after). GPU synchronization waits of about39s also contaminate long wall times. Repair fixture clock/RAF/asynchronous asset control before another full-game acceptance run; the proposed same-input actual-browser ray replay is a separate bounded measurement.

## Scope and immutable baseline

Baseline `ac1159b76b42a10ff02fe58add74a8285cc08d32` (main verified 2026-10-12). The only product change is in `patches/native-stages/runtime/triangle-world.mjs`: exact vertical-down rays bypass the generic three-axis BVH slab loop. Both positive and negative zero qualify in X/Z; Y must be exactly -1. The original Y division, min/max arithmetic, stack order, triangle intersection, hit tie behavior, flags, normal filters and counters remain. No caches, geometry changes, slower AI, actor-count reductions, quality changes, or changes to paint/rig/weapon models.

This is an INKWAVE implementation optimization; no new claim about Splatoon 3 gameplay parity, retail frame values, or physical iPad mini 6 performance is made.

## Evidence

- Production composition build passes, contentHash `60c31f4d5235dc9e595640eca6d10c6a0dbbb44d7e352fcafd4f8b6e6e08dda1`. Emitted engine geometry tests2/2 pass after a temporary test-only initializer imports the public bundled engine. The stock source helper imports unbundled `native-ranked.mjs`, so its first emitted-only run failed before assertions; no verifier or product workaround was committed.
- 12,401 exact paired boundary/fallback queries, including signed zeros, origin/box boundaries, inside nodes, negative/zero/infinite/NaN range, tie triangles, floor/ceiling normals, grates, near-parallel/general/up rays, invalid origins, and rebuilt worlds. All hit records and query/triangle counters match.
- Existing dynamic-box/tower, grate, wall, lifted-body, paint-hole, legacy collision, Scorch stage/ranked regressions: 23/23 pass, zero skips.
- Actual Scorch source integration: 1/1 pass, zero skips, including 30/60/120 Hz controller movement, wall ink/climbing, nav/reachable goals and ranked calibration. Standard native suite without all five local assets: 7 pass, 10 skip. This is not a five-stage complete pass.
- Pinned Scorch OBJ SHA256 `c8d0e21345ff9f4eb528e699de2ad9c478af78d7284f347399cc59ab94eb4cd8`; production source conversion gives 133,737 collision triangles, 32,767 BVH nodes, and 45,171 paint faces.
- Eight-Actor/600-frame/60-Hz Scorch logic trace: 79,827 ray queries, 69,884 exactly vertical-down. All replayed complete hits (distance, triangle, point, normal, UV, flags/object) match exactly; both execute 2,097,385 triangle tests. The replay checks in-memory before/after signed zero equality as well as the serialized capture.
- Normal-realm, uninstrumented ray replay ABBA, two complete traces per sample: A235.489 / B202.817 / B2206.174 / A2238.605 ms. Medians237.047→204.496 ms (13.73% ray-only). One trace is around119 ms across600 simulated frames; this is not a severe whole-frame speedup or FPS claim.
- Uninstrumented Node VM logic fixture ABBA: A8091.048 / B5468.522 / B25086.926 / A27909.580 ms. Timing groups are empty. Final Actor vectors/HP/ink/stats, paint grid/ownership/order records, command count and RNG match. The VM's cross-realm/inherited Math cost magnifies the benefit; **do not extrapolate this large reduction to Chromium or iPad**. Native Chromium CPU-profile and whole-game before/after evidence remain required.

The logic fixture executes native BotBrain, physics, NavGraph, projectiles, paint growth and restored Actor integration. Character rendering, Actor finishFrame and spawn-barrier hooks are stubbed. It is not a complete main-loop benchmark.

- Additional paired30/60/120Hz,2-second runs hash every frame's BotBrain, intent, Actor/runner scalar/vector state and every GPU paint command argument. All pairs match exactly, including final state/RNG. `vmPerformance` uses the same deterministic simulation clock for both builds so `_netLifeStartedAt` remains tested rather than excluded. These hashing runs are not timing samples. Raw numeric results are in the neighboring JSON report.

## Reproduction

Run the focused regression with:

`node --experimental-vm-modules --test patches/native-stages/tests/ray-down-parity.test.mjs patches/native-stages/tests/geometry-contract.test.mjs patches/local-quality/tests/collision-hotpath.test.mjs`

`INKWAVE_NATIVE_STAGE_ASSETS=<converted-stage-root> node --experimental-vm-modules --test --test-name-pattern='native source physics, painting, movement, nav and rules: scorch' patches/native-stages/tests/native-integration.test.mjs`

The diagnostic `scripts/probes/inkwave-native-down-ray.mjs` requires `INKWAVE_NATIVE_QUERY_ASSETS` with `scorch-data.v8` (Node v8.serialize of the production `convertSource` result for the pinned Scorch OBJ/MTL/tree metadata) and `triangle-world-baseline.mjs` from the immutable baseline. It accepts `--reference`, `--parity`, `--instrument`, and `--out <json>`; `PROBE_HZ`/`PROBE_FRAMES` default to60/600. Never use `--instrument` or `--parity` for timing acceptance. `--parity` additionally hashes per-frame BotBrain, intent, Actor/runner scalar/vector state and every paint GPU command argument, separately from timing.

No source OBJ/MTL/textures or converted third-party geometry are committed. Source identity is pinned by the existing production catalog; geometry input and texture integrity metadata are not replaced with synthetic substitutes.

## Rejected alternatives

Legacy Tidewater eight-bot600-frame audit found only12/4702 same-frame repeated LOS calls,2/130 nearest calls,0/64 path calls and1/13761 ground-height calls. Broad caching is unjustified for those queries. Lazy A* heuristic reuse showed no established improvement. Single-cell legacy hash-query dedup removal showed only ~3% query-only benefit and was not retained. Neither experiment changed production code.

## Acceptance still open

Exact-head Chromium whole-game profile/ABBA, remaining native source stages, full integration CI, and physical-device measurement are not yet complete. Keep draft. No merge or deployment is requested by this change.
