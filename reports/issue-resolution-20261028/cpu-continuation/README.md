# Remaining CPU work, 2026-10-29

Two actual sources of unnecessary CPU/allocation work were removed without changing gameplay constants or visual settings. The measurements below establish exact recorded output and fewer operations. They do **not** establish a whole-frame speedup: the repeated baseline drifted substantially, and the candidate wall times were adverse. Physical-device testing is outside the requested acceptance criteria; it is not a remaining blocker.

## Changes and source identity

- `4e95f49607057f40dc520a5277d380c7ae8746e9`: remove the explicit `drum.updateWorldMatrix(true,false)` immediately before `drum.localToWorld(to)` in physical roller contact painting. Three's `localToWorld` performs that same ancestor update before applying the world transform. Stamp/contact calculations retain their order and values. This duplicate exists in both the public root and optimized branch and was not already removed by PR #1907.
- `be1c4b71bbe24830fcaeb981a54652d15a86e7d6`, common root/optimized fix: visible hair ticks no longer read `currentClips`. Hidden ticks copy only name/frame/weight into a controller-owned reusable pool. Deferred replay uses those saved scalars; manual poses and bank cleanup release them.
- `7a4ab4aee3323c0212b2f68cd815e32e740725b6`, optimized branch only: a nonexported controller helper returns the private current clip frame without materializing public diagnostic records. The hair adapter copies its rows immediately and never retains aliases to either recycled clip frame. The original writable, detached public diagnostic exports are retained.

The latter fixes the actual optimized CI failure in `motion-diagnostics.test.mjs`: the original common hair adapter read `currentClips.length` on every tick, defeating the optimized branch's lazy descriptor allocation.

No Model/MOV-08b work, manual isolated Character QA, quality reductions, source-clock changes, or speculative Splatoon 3 constants are introduced. Roller contacts and clip/body/hair outputs remain those of the existing implementation. These tests compare implementation behavior; they add no retail frame/speed claim.

## Normal RAF profile investigation

The retained parent-run profiles use normal RAF, HIGH, 480×300, native tidewater/kelpline, two five-second windows, with ordinary simulation/render/audio/game owners. Their source receipt is `0faf90be9b38ee5c3c430793a953ea22d4987882`, runtime content `d731f060585d5a942d07d3675d5f55e32afdafedc04da5f48c0cf936a7a4fa08`. They are prior diagnostic windows, not final lifecycle acceptance.

`scripts/analyze-inkwave-cpu-profile.mjs` weights V8 `timeDeltas`, separates self and inclusive states, deduplicates recursive frame identities, and retains idle/blocking boundaries. Original profiles and the full analysis are compressed alongside this report.

| Profile | Window | Game frame inclusive | Match inclusive | Source motion inclusive | Render inclusive | Idle | GL program query |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| combat-0 | 5674.928 ms | 372.406 ms | 238.442 ms | 89.311 ms | 49.984 ms | 4540.816 ms | 0 ms |
| combat-1 | 5532.351 ms | 1452.788 ms | 119.110 ms | 14.796 ms | 1304.713 ms | 3879.627 ms | 1276.226 ms |

These sample states overlap and include cold clip/program creation. A sampled `getProgramParameter` can include a driver wait and does not represent CPU arithmetic cost. Three still needs the first-use active-uniform query even with shader error checks disabled; removing it would not be a valid optimization. The second profile also sampled the real roller contact-paint function (9.310 ms self), which led to the independently proven duplicate matrix update. The short profiles cannot establish a steady-state dominant cost or displayed FPS.

## Eight-actor composed CPU comparison

The same source-sealed harness ran serially in order A1, B1, A2. A1/A2 use public root `035233299348e5c3527f6106b98e721ed2dfd011` (content `d731f060585d5a942d07d3675d5f55e32afdafedc04da5f48c0cf936a7a4fa08`). B1 uses `4e95f49607057f40dc520a5277d380c7ae8746e9` (content `c20f6b85c751af3f3c91a34246f6b85e82b66cc46bdd2e0f24f065dfa8710190`). It precedes the later hair allocation fix.

Node 22.23.4, Chromium 151.0.7922.34/SwiftShader, HIGH, 960×640, 60 Hz, 300 measured fixed-step game transactions. This runs the legacy tidewater layout (`native:false`, 285 paint faces, atlas4096, ppm27.6), not native triangle geometry. The local compact roller and all seven seeded bots remain present and alive throughout every run. All eight actual source-motion controllers are ready. Final scene rendering is suppressed only in this explicit CPU measurement window; the existing paint atlas still draws. Loading, 423 warm-up simulation ticks, first scene render and GPU fence are outside measurement. This is separate from the normal-RAF profile evidence.

All three runs preserve every one of the 300 recorded gameplay digests, final digest `3421516292`, paint counts `[5367,5205]`, ownership/grid state, loaded roster/settings and live-scene counts. Window resources remain zero new geometries/textures; recorded atlas draw counters match exactly (300 frame delta,2 calls,136 triangles). This legacy layout has zero triangle-BVH queries/tests, so it makes no native collision acceleration claim. `minActors` and `minLiving` both equal8 in all runs and are now included in strict comparison. No selected state or adverse timing sample was discarded.

| Observation | A1 baseline | B1 candidate | A2 repeated baseline |
| --- | ---: | ---: | ---: |
| Roller ancestor/world updates | 380 | **190** | 380 |
| Roller `localToWorld` calls | 190 | 190 | 190 |
| Mean transaction wall time | 11.081 ms | 20.357 ms | 17.735 ms |
| p50 | 9.600 ms | 16.600 ms | 12.700 ms |
| p95 | 25.600 ms | 45.800 ms | 44.600 ms |
| p99 | 31.900 ms | 55.800 ms | 61.200 ms |
| Renderer thread time (CDP delta) | 2733.638 ms | 3216.975 ms | 3215.629 ms |
| Observed V8 GC pause total | 13.114 ms | 13.843 ms | 13.719 ms |

The actual match removes exactly190 redundant ancestor updates. The A/A wall-time drift is large; B1 is slower than both baselines in mean wall time, and its thread time is essentially equal to A2. These data do not demonstrate a total CPU timing improvement or nonregression. The host has a four-core cgroup quota and shared CPU activity, but that context does not erase the adverse observations. Physics wrapper call counts also differed slightly across the startup states (A1 mean309.347 raycasts/tick; B1/A2 mean309.040) despite exact game-state parity; do not treat category timings as a perfectly calibrated identical-call microbenchmark. Heap before/after snapshots are retained as endpoints, not peak or allocation-rate evidence. No sampled-heap allocation run was performed in this batch.

The harness now uses the sandbox browser launcher, accepts an explicit fixture weapon, records full-roster/living minima and local drum work, and hashes the launcher with its other implementation dependencies. Existing digest, scene, resource, draw, BVH and negative controls remain strict. The comparison script reports output parity independently of timing acceptance.

## Regression coverage

- Roller source integration:23/23 tests passed, including native slope/support/contact-depth and early contact-phase coverage.
- Actual source and minified emitted private roller callback:2/2 each. At30/60/120 Hz, all stamps, stroke state and world transforms match the exact pre-change function for automatic, manual-local and manual-world transforms. World updates halve144→72,288→144,576→288; a stale-world mutation is rejected.
- Diagnostic/profile/counter tests:5/5 passed. Changing a gameplay digest, actor/living minimum, roster, quality, draw/scene/resource counters, errors or implementation receipt is rejected.
- Common source hair suite:2/2 passed. Existing full-rate body/clock/contact/current/previous hair equality remains exact at30/60/120 Hz. Twenty-five diagnostic-row mutations before reentry cannot alter saved hair inputs. Reentry remains idempotent and manual/bank cleanup releases the pool.
- Optimized combined source suites:4/4 passed. The original allocation assertion remains unchanged:195 actor frames and retained snapshots compare exactly,132 public clip arrays and525 descriptors remain unmaterialized. Added hair coverage checks420 hidden and420 visible unread frames without public descriptor materialization. Hidden/full-rate hair-add counts remain42/166 at30 Hz,28/225 at60 Hz,31/510 at120 Hz. The optimized suites ran with both common and optimized-only changes applied together. An additional2/2 focused optimized run also mutates private recycled diagnostic rows before reentry (25 checks), proving that deferred hair retains no alias to them. A deliberate alias mutation is rejected by the same unchanged equality/ownership contract; its expected failing TAP is retained as a negative control.

Raw results/traces, profiles, test TAP and their SHA-256 receipts are in [receipts.json](receipts.json) and `evidence/*.gz`; browser profiles and build outputs are excluded. New hair changes require rebuilt root and optimized artifacts before final emitted/browser integration acceptance; the roller emitted test uses the earlier sealed4e95 artifact.

## Issue implications and remaining boundaries

For #1757/#1671, this batch implements two specific unnecessary-work fixes and proves the stated software output/work-count properties. It does not establish that the original total-game slow-frame symptom is resolved. Broad CPU timing remains uncalibrated in these measurements; a clean total timing claim needs reproducible controls. Hardware is not the reason for this boundary.

#845 receives the optimized allocation regression repair above. Prior complete hair reentry/software rendering and composer validation are documented in the sibling `remaining-performance/README.md`; this batch does not repeat their old browser verdict under a newly rebuilt source identity. #642 has no additional runtime change here. #1434 strict same-native image calibration was already rejected by the authority run and is separate from these CPU digest results. #1565's unproven conditional search/distance experiments remain disabled; this batch does not invent a safe threshold or performance curve. The whole PR #1907/MOV-08b merge hold remains intact.

## Reproduction

Run a sealed build of each source, then use the same harness for all trials:

```sh
CHROMIUM_PATH=/path/to/chrome node scripts/benchmark-inkwave-composed-cpu.mjs \
  --site /path/to/sealed/site --source-sha FULL_COMMIT \
  --frames 300 --hz 60 --quality high --weapon s3-roller-compact \
  --stages tidewater --evidence-dir /path/to/trial
node scripts/compare-inkwave-composed-cpu.mjs \
  /path/to/a1/result.json /path/to/a2/result.json /path/to/b1/result.json comparison.json
node scripts/analyze-inkwave-cpu-profile.mjs \
  combat-0.cpuprofile combat-1.cpuprofile --out normal-raf-analysis.json
node --experimental-vm-modules --test \
  patches/local-quality/tests/offscreen-hair-targets.test.mjs
```

On the optimized branch also run `patches/local-quality/tests/motion-diagnostics.test.mjs` with the optimized-only helper present. Use Node22 and an unmodified browser sandbox configuration. The supplied report receipts describe the exact runs above, not a promise that different hosts reproduce their wall timings.
