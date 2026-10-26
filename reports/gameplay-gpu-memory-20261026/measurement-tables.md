# Final descriptive measurement tables

Every slash means baseline / candidate. Display values are rounded; arithmetic uses full recorded precision. Values describe these runs; they establish no causal FPS, process-memory, hardware-GPU, or power improvement rate.

**Known-defect negative control:** baseline-native-final records raw GL_INVALID_OPERATION (1282) at warm-0 and warm-2. Those two source defects are expected evidence, not clean acceptance. All other baseline capture points and every candidate capture point must be GL error 0. No context loss, freeze, render suppression or other measurement error is allowed; raw errors are preserved.

Duration ends at the last recorded process sample, not browser shutdown. Peaks are the maximum aggregate sample across the selected Chromium process tree; shared RSS is not summed here. Final JS heap follows explicit GC.

| Pair | Observed duration s | Peak PSS MiB | Peak USS MiB | Final GC JS heap MiB |
| --- | --- | --- | --- | --- |
| Crab exits | 287.667 / 292.179 | 1,741.79 / 1,668.13 | 1,615.36 / 1,541.29 | 64.44 / 64.16 |
| LOW 18 matches | 1,450.095 / 1,486.688 | 2,001.93 / 1,894.08 | 1,871.68 / 1,765.25 | 91.67 / 70.74 |
| HIGH native 3 matches | 584.171 / 600.970 | 2,420.23 / 2,248.48 | 2,291.51 / 2,119.96 | 199.60 / 125.07 |

## Observed process CPU counters

For each PID with CDP CPU data, calculate max(cpuSeconds) − min(cpuSeconds), then sum by process type. This excludes CPU before the first observation and processes without counters, including zygotes. GPU-process CPU seconds measure software-renderer CPU work; they are not GPU timer milliseconds.

| Pair | GPU process observed CPU s | Renderer processes observed CPU s | All counter-bearing processes CPU s |
| --- | --- | --- | --- |
| Crab exits | 854.46 / 858.86 | 87.33 / 88.68 | 947.46 / 953.65 |
| LOW 18 matches | 4,793.21 / 4,863.54 | 371.54 / 403.31 | 5,187.67 / 5,293.67 |
| HIGH native 3 matches | 2,107.09 / 2,170.74 | 90.20 / 93.31 | 2,207.97 / 2,274.81 |

## LOW stage aggregates

FPS = sum of observed combat frame counts / sum of each combat capture timestamp minus its preceding warm capture timestamp. Frame-function elapsed mean is sample-count weighted and includes driver/wait time. GPU mean is weighted by completed timer-query samples and covers R.render only. Query results can cross one capture boundary. Interval p95 is shown as min–max of the individual windows’ p95 values; it is neither an averaged nor a pooled percentile.

| Stage | Frames | Combat wall s | Observed FPS | Per-window interval p95 range ms | Frame elapsed mean ms | R.render GPU query mean ms | GPU samples |
| --- | --- | --- | --- | --- | --- | --- | --- |
| tidewater | 291 / 274 | 185.42 / 184.70 | 1.569 / 1.483 | 914.7–1,500.5 / 832.5–1,575.2 | 93.39 / 96.45 | 194.40 / 204.11 | 115 / 106 |
| kelpline | 223 / 225 | 185.99 / 186.88 | 1.199 / 1.204 | 1,124.9–1,734.4 / 1,079.6–1,753.3 | 85.22 / 94.50 | 209.42 / 224.57 | 86 / 92 |
| halyard | 258 / 227 | 186.18 / 186.68 | 1.386 / 1.216 | 1,084.1–1,513.2 / 967.4–1,517.3 | 80.25 / 103.75 | 274.41 / 327.12 | 100 / 93 |

## LOW 18-match exit resource sequence

Every row is released-N after explicit GC. API resource counts mean created minus explicit deletes, not driver residency. Three programs and API Program counts are kept separate.

| Exit | Stage | JS heap MiB | Three geometries | Three programs | API Program | API Buffer | API VAO | Three textures | API Texture |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | tidewater | 53.97 / 54.30 | 366 / 369 | 179 / 179 | 179 / 179 | 1511 / 1517 | 468 / 471 | 30 / 30 | 34 / 34 |
| 2 | kelpline | 56.75 / 57.70 | 404 / 406 | 166 / 164 | 166 / 164 | 1708 / 1709 | 535 / 544 | 30 / 30 | 34 / 34 |
| 3 | halyard | 61.81 / 61.99 | 437 / 443 | 171 / 170 | 171 / 170 | 1867 / 1886 | 588 / 601 | 31 / 31 | 35 / 35 |
| 4 | tidewater | 70.99 / 62.83 | 481 / 455 | 170 / 169 | 170 / 169 | 2037 / 1953 | 690 / 637 | 30 / 30 | 34 / 34 |
| 5 | kelpline | 72.36 / 64.13 | 504 / 494 | 171 / 170 | 171 / 170 | 2158 / 2153 | 734 / 706 | 30 / 30 | 34 / 34 |
| 6 | halyard | 65.10 / 64.95 | 553 / 534 | 171 / 171 | 171 / 171 | 2391 / 2340 | 819 / 770 | 31 / 31 | 35 / 35 |
| 7 | tidewater | 75.46 / 65.00 | 636 / 548 | 171 / 170 | 171 / 170 | 2624 / 2416 | 999 / 805 | 30 / 30 | 34 / 34 |
| 8 | kelpline | 75.97 / 66.40 | 669 / 583 | 172 / 171 | 172 / 171 | 2796 / 2598 | 1061 / 862 | 30 / 30 | 34 / 34 |
| 9 | halyard | 76.86 / 68.16 | 697 / 634 | 172 / 171 | 172 / 171 | 2925 / 2843 | 1117 / 944 | 31 / 31 | 35 / 35 |
| 10 | tidewater | 87.07 / 67.66 | 716 / 667 | 172 / 170 | 172 / 170 | 3027 / 3015 | 1160 / 1017 | 30 / 30 | 34 / 34 |
| 11 | kelpline | 97.06 / 67.95 | 741 / 689 | 173 / 171 | 173 / 171 | 3157 / 3135 | 1206 / 1066 | 30 / 30 | 34 / 34 |
| 12 | halyard | 71.32 / 68.86 | 769 / 723 | 173 / 171 | 173 / 171 | 3288 / 3295 | 1257 / 1133 | 31 / 31 | 35 / 35 |
| 13 | tidewater | 80.25 / 69.05 | 804 / 746 | 172 / 170 | 172 / 170 | 3410 / 3409 | 1332 / 1196 | 30 / 30 | 34 / 34 |
| 14 | kelpline | 81.31 / 69.65 | 828 / 773 | 173 / 171 | 173 / 171 | 3539 / 3549 | 1387 / 1250 | 30 / 30 | 34 / 34 |
| 15 | halyard | 81.71 / 70.68 | 857 / 781 | 173 / 171 | 173 / 171 | 3673 / 3578 | 1444 / 1265 | 31 / 31 | 35 / 35 |
| 16 | tidewater | 90.54 / 70.02 | 872 / 802 | 172 / 172 | 172 / 172 | 3755 / 3691 | 1489 / 1315 | 30 / 30 | 34 / 34 |
| 17 | kelpline | 90.83 / 70.39 | 888 / 839 | 173 / 173 | 173 / 173 | 3841 / 3885 | 1521 / 1382 | 30 / 30 | 34 / 34 |
| 18 | halyard | 91.59 / 70.67 | 919 / 860 | 173 / 173 | 173 / 173 | 3987 / 3979 | 1567 / 1414 | 31 / 31 | 35 / 35 |

## HIGH native individual combat windows

These are three individual windows, not stage-level pooled percentiles. Drawing buffer and dynamic scale are the actual capture values; the game’s own quality controls remain enabled.

| Cycle | Stage | Frames | Combat wall s | Observed FPS | Window interval p95 ms | Frame elapsed mean ms | R.render GPU query mean ms | GPU samples | Drawing buffer | Dynamic scale |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | scorch | 8 / 6 | 31.88 / 22.44 | 0.251 / 0.267 | 9,841.6 / 8,737.9 | 1,373.10 / 1,648.05 | 3,963.43 / 4,160.05 | 3 / 4 | 1359×892 / 1359×892 | 1.000 / 1.000 |
| 2 | tidewater | 13 / 11 | 22.53 / 20.94 | 0.577 / 0.525 | 5,534.6 / 2,689.3 | 213.29 / 315.81 | 1,690.66 / 2,016.41 | 6 / 5 | 1019×669 / 1189×781 | 0.750 / 0.875 |
| 3 | scorch | 9 / 8 | 25.98 / 21.62 | 0.346 / 0.370 | 7,931.0 / 6,765.5 | 974.51 / 497.53 | 2,799.09 / 2,677.08 | 4 / 4 | 1019×669 / 1019×669 | 0.750 / 0.750 |

## Combat WebGL API draw-call counts

Actual intercepted drawArrays/drawElements and their instanced variants are cumulative counters. For each combat window, subtract the prior warm capture counter; LOW stage totals sum these deltas and frame counts, then divide total calls by total frames. This includes intercepted WebGL passes within those capture boundaries, not CSS/DOM UI work, and counts submitted draw calls rather than objects or GPU-resident resources.

| Combat group/window | Actual API draw-call delta | Observed frames | API draw calls / frame |
| --- | --- | --- | --- |
| LOW tidewater | 38122 / 37136 | 291 / 274 | 131.00 / 135.53 |
| LOW kelpline | 28390 / 31224 | 223 / 225 | 127.31 / 138.77 |
| LOW halyard | 36223 / 33726 | 258 / 227 | 140.40 / 148.57 |
| HIGH 1 scorch | 2026 / 1458 | 8 / 6 | 253.25 / 243.00 |
| HIGH 2 tidewater | 2089 / 1921 | 13 / 11 | 160.69 / 174.64 |
| HIGH 3 scorch | 2366 / 2102 | 9 / 8 | 262.89 / 262.75 |

## Frame-end renderer.info rendering counters

These are sample-weighted means of renderer.info.render.calls and renderer.info.render.triangles read at frame end. Each field is weighted by its own recorded sample count, never by a ratio of calls to triangles. These snapshots are not cumulative totals of every multipass, paint or UI draw in the frame; they also differ from the observer’s cumulative raw WebGL draw-call counter.

| Combat group/window | Frame-end draw calls mean | Frame-end triangles mean | Call samples | Triangle samples |
| --- | --- | --- | --- | --- |
| LOW tidewater | 131.00 / 135.53 | 444,219.68 / 435,301.67 | 291 / 274 | 291 / 274 |
| LOW kelpline | 127.31 / 138.77 | 415,043.75 / 422,424.89 | 223 / 225 | 223 / 225 |
| LOW halyard | 140.40 / 148.57 | 776,750.28 / 781,164.18 | 258 / 227 | 258 / 227 |
| HIGH 1 scorch | 253.25 / 243.00 | 747,285.00 / 659,517.50 | 8 / 6 | 8 / 6 |
| HIGH 2 tidewater | 160.69 / 174.64 | 652,839.38 / 646,054.91 | 13 / 11 | 13 / 11 |
| HIGH 3 scorch | 262.89 / 262.75 | 770,501.22 / 745,274.88 | 9 / 8 | 9 / 8 |

## Raw WebGL error observations

The baseline native warm-up errors remain visible here. Matching a documented negative control does not erase the defect or mark that baseline GL-clean.

| Run | Raw nonzero GL error captures |
| --- | --- |
| baseline-crab-clean | 0 at every captured window |
| candidate-crab-clean | 0 at every captured window |
| baseline-raf-18 | 0 at every captured window |
| candidate-raf-18 | 0 at every captured window |
| baseline-native-final | warm-0: 1282; warm-2: 1282 |
| candidate-native-final | 0 at every captured window |

## Input provenance

- Crab exits: source `e0072a749df0ec8c2d368e383bdf337baa7b44ad` / `65fa7f183d2d163af798972c2ff0ced46a92868f`; shared harness `101a74df5a39de3730c06c3dbd677a2c0fbf702f1df9d71408b4da285170fdb2`.
- LOW 18 matches: source `e0072a749df0ec8c2d368e383bdf337baa7b44ad` / `65fa7f183d2d163af798972c2ff0ced46a92868f`; shared harness `101a74df5a39de3730c06c3dbd677a2c0fbf702f1df9d71408b4da285170fdb2`.
- HIGH native 3 matches: source `e0072a749df0ec8c2d368e383bdf337baa7b44ad` / `65fa7f183d2d163af798972c2ff0ced46a92868f`; shared harness `101a74df5a39de3730c06c3dbd677a2c0fbf702f1df9d71408b4da285170fdb2`.

These tables do not identify a process-memory delta as saved application memory, infer GPU-resident bytes from API counts, or establish hardware FPS.
