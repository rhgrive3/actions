# Native bot paint-goal query

Baseline: `3715e29d1656a00b853f73e12a89624b17985b7c`.

`nativePaintGoalIds` traverses every directed reachable node when a bot's start
node or team changes. On wide source stages, most of those nodes are outside its
existing 34-unit paint-goal radius. The changed helper rejects points outside
the circle's enclosing square before calling the existing `Math.hypot` test.
Traversal, output order, enemy spawn restrictions, validity checks, cache keys,
cache identity, scratch storage and generation wrap remain unchanged. This does
not add an approximate distance, cache, allocation or simulation-rate change.

The original helper is frozen in
[`native-bots-3715e29d.mjs.txt`](../../patches/native-stages/tests/fixtures/native-bots-3715e29d.mjs.txt)
(SHA-256 `dd6c3ce9b7c616b2e4f509a7669161dc4400a193c1dd2905994e41de4771be86`).

## Verification

The new test executes the production-composed helper against the frozen original.
It compares ordered goal IDs and traversal scratch state on near/wide directed
graphs, enemy-zone barriers, invalid/nonpaintable nodes, circular and square
boundaries, signed zeros, overflow, NaN/Infinity, cache hits, start/team changes,
graph replacement/resizing and stamp wrap. All four cases pass. A 14,400-node
fixture retains the complete result while reducing `hypot` calls from 14,400 to
4,761; points on the circle and square boundaries still use `hypot`.

Commands from the repository root:

```sh
node --experimental-vm-modules --test patches/native-stages/tests/native-paint-goal-bounds.test.mjs
node --experimental-vm-modules --test --test-concurrency=2 \
  patches/native-stages/tests/native-paint-goal-bounds.test.mjs \
  patches/native-stages/tests/native-nav-time-slice.test.mjs \
  patches/native-stages/tests/native-spawn-nav.test.mjs \
  patches/native-stages/tests/native-integration.test.mjs \
  patches/local-quality/tests/bot-navigation.test.mjs \
  patches/local-quality/tests/nav-heuristic.test.mjs
node reports/performance-20261030/gameplay-benchmark.mjs reports/performance-20261030/gameplay-benchmark.json
```

The combined related suite records 21 passes, seven failures and six skips in
[`gameplay-tests.json`](gameplay-tests.json). The same seven legacy Kelpline
movement/combat/refill failures in `bot-navigation.test.mjs` reproduce on the
baseline checkout, where that file records five passes and seven failures.
The JSON preserves commands, test names, assertion messages, raw-log hashes and
scratch paths. The four new cases and the other 12 completed native/navigation
cases pass.
Six actual-stage tests skip because the available native asset files are LFS
pointers and the required stage-asset environment is unset. Neither those skips
nor the synthetic graph checks establish actual-stage movement or performance.

## Measurement

[`gameplay-benchmark.mjs`](gameplay-benchmark.mjs) measures the complete helper,
including BFS and result allocation, on synthetic connected grids. It clears
only the existing goal-result cache before each uncached query, retains the
existing per-graph scratch lifecycle, verifies equal result arrays, warms both
versions, and records six windows per version in repeated ABBA order. A separate
cache-hit case retains the cache. CPU and wall samples, machine/runtime details
and exact baseline/candidate source hashes are in
[`gameplay-benchmark-run1.json`](gameplay-benchmark-run1.json) and
[`gameplay-benchmark.json`](gameplay-benchmark.json). Both final runs took place
after the other planned browser, build and test work completed. Node was
v24.19.0 on Intel Xeon Platinum 8573C. The machine is shared, and these are
diagnostic samples rather than a CI timing threshold.

| Synthetic workload | Calls/window | CPU median ms, run 1 before → after | CPU median ms, run 2 before → after |
| --- | ---: | ---: | ---: |
| Near: 24×24, step 1 | 8,000 | 151.122 → 152.831 (+1.13%) | 153.687 → 154.662 (+0.63%) |
| Wide: 120×120, step 1 | 300 | 256.763 → 252.538 (−1.65%) | 266.683 → 249.123 (−6.58%) |
| Wide: 80×80, step 2 | 400 | 132.238 → 117.834 (−10.89%) | 134.792 → 127.699 (−5.26%) |
| Existing cache hit | 500,000 | 5.546 → 5.488 (−1.04%) | 5.529 → 5.608 (+1.43%) |

The useful repeatable improvement is in the wide uncached scan, particularly
step 2. The near scan adds approximately 0.12–0.21 microseconds per call; cache
hit differences change sign and are noise at this scale. Earlier concurrent
exploratory runs showed larger improvements, so they are not used as the final
performance claim. The optimization leaves 576 near-grid `hypot` calls
unchanged, reduces the 120×120 grid from 14,400 to 4,761 calls, and reduces the
step-2 grid from 6,400 to 1,225 calls. These counts explain the workload
difference; the table measures the whole function, not just `hypot`.

These CPU component timings are not browser frame timings, complete-match FPS,
physical-device measurements or Nintendo comparisons. No Splatoon 3 executable
version, weapon, gear or real-device input condition was measured here. Existing
unconfirmed entries in `inkwave-splatoon3-behavior-2026-10-02.md` remain unconfirmed;
this optimization preserves INKWAVE's current goal radius and decisions.

## Rejected candidates

Two initially promising native counterparts of existing legacy optimizations
were not adopted: skipping the unused horizontal `hypot` during nonhorizontal
contact solves, and sharing the two possible 8-neighbor edge distances during
native navigation construction. The contact result was inconsistent between
short/long runs (roughly 0% to 3% CPU improvement); navigation construction was
slower in both runs. Native ground-hit metadata deferral was also left unchanged
because custom callback/output ownership requires a wider contract review.

The longer exploratory CPU samples are in
[`rejected-candidates.json`](rejected-candidates.json), reproducible with
`node --experimental-vm-modules reports/performance-20261030/rejected-candidates.mjs OUTPUT.json`.
They were gathered while other investigation was active and do not establish
isolated device performance. No code from these candidates is included.
