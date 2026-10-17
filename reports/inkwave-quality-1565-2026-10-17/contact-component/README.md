# ContactTransition component: active-path follow-up

The longer run measured a settled-path improvement and nearly unchanged active/mixed timings. Its irregular-contact median is adverse: **+0.274% wall / +0.279% process CPU**. That small value remains unresolved. These component results do not establish whole-game nondegradation, zero overhead, frame rate or device performance.

## Complete results

Percent change is candidate/baseline minus one; positive is slower. Each median uses four complete windows per version. Every original row, including unusual rows, remains in [component.json](component.json) and [component-long.json](component-long.json).

| Run / controlled mode | Wall median A → B (ms) | Wall change | CPU median A → B (ms) | CPU change |
|---|---:|---:|---:|---:|
| Short / mostly settled | 108.213 → 107.639 | −0.530% | 118.516 → 116.292 | −1.877% |
| Short / always active | 128.861 → 130.968 | **+1.635%** | 139.682 → 129.914 | −6.993% |
| Short / irregular contact | 106.159 → 105.458 | −0.661% | 109.050 → 108.319 | −0.671% |
| Long / mostly settled | 1149.267 → 1062.922 | −7.513% | 1156.085 → 1069.043 | −7.529% |
| Long / always active | 1335.872 → 1322.621 | −0.992% | 1338.132 → 1326.907 | −0.839% |
| Long / irregular contact | 1045.888 → 1048.748 | **+0.274%** | 1048.272 → 1051.198 | **+0.279%** |

The short always-active wall and CPU medians disagree. Its final candidate window is 177.848 ms wall / 128.063 ms CPU. It is retained, and is not one of the two middle candidate wall values used by the median. Some early windows also have process CPU above wall time. Process CPU aggregates process threads; these receipts contain no JIT/GC event trace, so they do not identify compilation, collection or scheduling as the cause.

After inspecting the short run, **one tenfold-work follow-up was specified before it ran**: 5,001,600 advances per window and 201,600 warmup advances per version, with the same script, sources, modes and ABBA/BAAB order. The short run used 500,160 and 20,160 respectively (rounded to complete 960-frame input cycles). The longer run reduces the relative influence of short-window disturbances but does not prove optimization/GC completion or statistical equivalence. Both runs remain evidence; the favorable longer active median does not erase the short adverse wall median or the longer adverse irregular median.

## Workload and correctness controls

Both versions use the actual source `ContactTransition` and shipped Three.js `Vector3` (revision 186), through the committed source-composition/baseline fixture. Source HEAD is pinned to `fb33e4530b1419b5762ac180ef829360035aff4d`; baseline restores only the original advance arithmetic. The receipts bind committed inputs and both evaluated class sources. Node is v24.19.0 on AMD EPYC 9V74; this is a Node component measurement, not browser JavaScript or a console comparison.

Each mode replays fixed 960-frame buffers. Two versions are prewarmed, then measured in ABBA followed by BAAB, four windows/version. Explicit GC occurs before each window. Timing includes the scheduler, copies into preallocated input vectors, and transition/reset calls. The tick and class code add no explicit per-iteration allocations; actual engine allocation/heap use is not measured.

| Mode | Controlled input | Counts outside timing, per version over 1,920 advances |
|---|---|---|
| Mostly settled | Original benchmark's constant goal/velocity, dt=1/60; transition every 120 frames with duration .13 s. This control has zero transition offsets. | 1,920 clamps; 1,808 saturated; 16 transitions; polynomial evaluations **1,920 → 112**. |
| Always active | Smooth moving goals/velocities, dt=1/60; real transition every four frames, before .13 s duration completes. | 1,920 clamps; **zero saturated**; 480 transitions (479 with nonzero offsets); polynomials **1,920 → 1,920**. |
| Irregular contact | Fixed dt mix including pauses, 30/120/144 Hz intervals and .1 s steps; post-advance fixed-support capture/release plus resets. Synthetic contact-like scheduling, not recorded gameplay. | 1,900 clamps; 1,564 saturated; 40 nonzero transitions; 20 resets; polynomials **1,900 → 336**. |

Outside timing, every step of two input cycles compares complete filter state and input vectors with strict numeric equality, including signed zero. Owned vector identities and unchanged goal/destination inputs are checked. Clamp/saturation counts match and polynomial savings equal saturated calls. Timed final state matches exactly, input-buffer hashes stay unchanged, and source bindings are rechecked after measurement. These finite component states complement the separate nonfinite/source-Actor/browser regressions; they do not replace them.

The active mode skips no polynomials. A branch and any JIT treatment of local aliases can therefore have a cost even when settled work is cheaper. The measurements support keeping that concern explicit; four windows/version and the changing signs do not qualify every transition workload as nondegrading.

## Reproduction and immutable copies

The exact executed [script](1565-contact-active-benchmark.mjs) is copied here, SHA-256 `d9f7978e282054d719a96b6ac7dfa8e0e083686bdf0631474cea56f706e3ce41`. No production code, tests or PR head changed for these probes. No additional measurement was run while preparing this record.

```sh
node --experimental-vm-modules --expose-gc /workspace/scratch/1565-contact-active-benchmark.mjs --source-root /workspace/motion-1565 --expected-head fb33e4530b1419b5762ac180ef829360035aff4d --out /workspace/actions/.ci-scratch/1565/evidence/contact-active/component.json
node --experimental-vm-modules --expose-gc /workspace/scratch/1565-contact-active-benchmark.mjs --source-root /workspace/motion-1565 --expected-head fb33e4530b1419b5762ac180ef829360035aff4d --iterations 5001600 --warmup 201600 --out /workspace/actions/.ci-scratch/1565/evidence/contact-active/component-long.json
```

JSON SHA-256: short `46ba1014e0914fa00124b30e32cddea241f5c276ecd04600904f77e43dc1a562`; long `bfcb8f7f5163426cacfe4005dd5843acbc7153c000d33c930c404b1fcaf6860a`. The copies preserve every row and full source/input/count binding.
