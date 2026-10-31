# 30-frame admission smoke

Status **passed**, launcher exit **0**. Result SHA-256 `e58a50821ccf79a82fb283015c28cd9810a8f7e7511b8c00cf28fab619c9ade7` (2,451,250 bytes).

Hagglefish native, low, 480×300, eight actors/seven bots, shooter, 60 Hz fixed cadence. 30 frames per warmup/measured window. Page creation `ab`, quartet start `a`. A/A orders ABBA, BAAB; A/B orders ABBA, BAAB.

All 20 windows retained (4 warmups, 8 A/A, 8 A/B), with 10 exact ordinal pairs, including score/HUD caches and binary64 coverage bits. No page errors, context loss or rejected windows. Scene submissions are zero; software GPU paint-atlas draws remain active. GPU CPUs 0–1, worker CPUs 2–3; unchanged four-core quota. No profiling, forced GC, outlier removal, automatic retry, or post-launch affinity changes.

The score observer reads already-produced own-data caches after both timing metrics and GPU drain. Every endpoint is current and unchanged, has matching coverage/HUD bits, and passes exact pair parity. The observer invokes no coverage, teamSummary, getters, simulation, or state transition. This verifies live-Turf endpoint cache/transport behavior, not every intermediate HUD frame, DOM/pixels, finish coverage, judge/winner behavior, or external-device behavior.

**This smoke validates admission and actual score observation only. Its short timing is not performance evidence and is not pooled with the full runs.**

## Timing and uncertainty

B/A ratios; negative changes mean lower cost. A/A compares build A on both pages. The quartet is a reporting unit; its repeated use of retained pages does not establish independent replication. Conditional log-ratio t intervals are shown without treating individual frames as independent samples. One-order A/A has only one quartet and no interval.

| Phase | Order group | Quartets | Metric | Geometric B/A | Change | Conditional 95% change interval | Quartet range |
|---|---|---:|---|---:|---:|---:|---:|
| A/A | all | 2 | frameMeanMs | 0.96193 | -3.81% | -79.43% to +349.82% | 0.85197–1.08609 |
| A/A | all | 2 | rendererThreadMsPerTick | 0.96939 | -3.06% | -72.14% to +237.33% | 0.87878–1.06935 |
| A/A | ABBA | 1 | frameMeanMs | 0.85197 | -14.80% | unavailable (one quartet) | 0.85197–0.85197 |
| A/A | ABBA | 1 | rendererThreadMsPerTick | 0.87878 | -12.12% | unavailable (one quartet) | 0.87878–0.87878 |
| A/A | BAAB | 1 | frameMeanMs | 1.08609 | +8.61% | unavailable (one quartet) | 1.08609–1.08609 |
| A/A | BAAB | 1 | rendererThreadMsPerTick | 1.06935 | +6.94% | unavailable (one quartet) | 1.06935–1.06935 |
| A/B | all | 2 | frameMeanMs | 0.93894 | -6.11% | -59.34% to +116.84% | 0.87908–1.00287 |
| A/B | all | 2 | rendererThreadMsPerTick | 0.94788 | -5.21% | -52.92% to +90.86% | 0.89708–1.00155 |
| A/B | ABBA | 1 | frameMeanMs | 0.87908 | -12.09% | unavailable (one quartet) | 0.87908–0.87908 |
| A/B | ABBA | 1 | rendererThreadMsPerTick | 0.89708 | -10.29% | unavailable (one quartet) | 0.89708–0.89708 |
| A/B | BAAB | 1 | frameMeanMs | 1.00287 | +0.29% | unavailable (one quartet) | 1.00287–1.00287 |
| A/B | BAAB | 1 | rendererThreadMsPerTick | 1.00155 | +0.16% | unavailable (one quartet) | 1.00155–1.00155 |

A/A state parity does not establish acceptable timing noise; no numerical timing-noise acceptance threshold was predeclared. Alternating ABBA/BAAB balances outer/inner slots but does not remove persistent page/renderer differences or guarantee equal wall-clock spacing. Reversed page order and quartet start change together across the two full sessions, so their effects cannot be individually identified. Fixed session order and changing host conditions also limit causal attribution.


## Every measured quartet

| Phase | Round | Order | Frame A ms | Frame B ms | Frame change | Thread A ms/tick | Thread B ms/tick | Thread change |
|---|---:|---|---:|---:|---:|---:|---:|---:|
| A/A | 0 | ABBA | 14.670 | 12.498 | -14.80% | 16.230 | 14.262 | -12.12% |
| A/A | 1 | BAAB | 11.287 | 12.258 | +8.61% | 13.958 | 14.926 | +6.94% |
| A/B | 0 | ABBA | 15.562 | 13.680 | -12.09% | 17.597 | 15.786 | -10.29% |
| A/B | 1 | BAAB | 12.190 | 12.225 | +0.29% | 14.063 | 14.084 | +0.16% |

## Measured-window distributions, heap and cgroup

SD across windows is descriptive. Heap values use MiB (2²⁰ bytes). Negative deltas cannot identify individual GC events; no samples were removed for heap changes or throttling. Cgroup counters cover the entire cgroup, not just the game.

| Phase · side | n | Frame mean ± SD ms | Thread mean ± SD ms/tick | Pooled frame p95/max ms | Used heap before→after mean MiB | Heap delta mean [min,max] MiB | Negative deltas | Throttled windows/periods/ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| A/A · A | 4 | 12.978 ± 2.950 | 15.094 ± 2.139 | 24.495/37.600 | 187.76→194.22 | 6.46 [4.31,9.19] | 0 | 0/0/0.000 |
| A/A · B | 4 | 12.378 ± 1.122 | 14.594 ± 0.815 | 20.700/28.100 | 193.12→190.80 | -2.32 [-22.47,4.81] | 1 | 0/0/0.000 |
| A/B · A | 4 | 13.876 ± 2.899 | 15.830 ± 3.424 | 23.105/71.400 | 180.92→180.30 | -0.62 [-24.67,10.29] | 1 | 0/0/0.000 |
| A/B · B | 4 | 12.953 ± 1.181 | 14.935 ± 1.871 | 20.460/41.000 | 190.35→189.60 | -0.75 [-26.88,11.09] | 1 | 0/0/0.000 |

## Every retained window

| Phase | Kind | Round/slot | Order | Side/build | Ordinal | Frame mean ms | Thread ms/tick | Frame p95/max ms | Heap used before→after MiB | Throttled periods | Score coverage bits |
|---|---|---:|---|---|---:|---:|---:|---:|---:|---:|---|
| A/A | warmup | 0/0 | warmup | a/a | 1 | 18.337 | 19.228 | 29.500/36.200 | 170.96→161.70 | 0 | `3f80c43519e25d093f7b276e2a71fd9d` |
| A/A | warmup | 0/1 | warmup | b/a | 1 | 20.847 | 18.103 | 34.800/44.000 | 146.00→162.83 | 0 | `3f80c43519e25d093f7b276e2a71fd9d` |
| A/A | measurement | 0/0 | ABBA | a/a | 2 | 17.323 | 18.294 | 30.500/37.600 | 196.46→205.65 | 0 | `3f80c43519e25d093f7b276e2a71fd9d` |
| A/A | measurement | 0/1 | ABBA | b/a | 2 | 13.367 | 15.113 | 21.900/22.500 | 195.94→173.47 | 0 | `3f80c43519e25d093f7b276e2a71fd9d` |
| A/A | measurement | 0/2 | ABBA | b/a | 3 | 11.630 | 13.412 | 16.800/28.100 | 196.08→199.92 | 0 | `3f80c43519e25d093f7b276e2a71fd9d` |
| A/A | measurement | 0/3 | ABBA | a/a | 3 | 12.017 | 14.166 | 17.200/26.500 | 177.20→183.90 | 0 | `3f80c43519e25d093f7b276e2a71fd9d` |
| A/A | measurement | 1/0 | BAAB | b/a | 4 | 11.207 | 14.698 | 15.400/22.000 | 196.76→201.57 | 0 | `3f80c43519e25d093f7b276e2a71fd9d` |
| A/A | measurement | 1/1 | BAAB | a/a | 4 | 10.750 | 13.809 | 14.900/16.900 | 168.69→174.32 | 0 | `3f80c43519e25d093f7b276e2a71fd9d` |
| A/A | measurement | 1/2 | BAAB | a/a | 5 | 11.823 | 14.107 | 16.600/24.400 | 208.71→213.02 | 0 | `3f80c43519e25d093f7b276e2a71fd9d` |
| A/A | measurement | 1/3 | BAAB | b/a | 5 | 13.310 | 15.155 | 20.400/20.700 | 183.69→188.24 | 0 | `3f80c43519e25d093f7b276e2a71fd9d` |
| A/B | warmup | 0/0 | warmup | a/a | 1 | 18.047 | 18.230 | 34.800/37.400 | 213.92→231.25 | 0 | `3f80c43519e25d093f7b276e2a71fd9d` |
| A/B | warmup | 0/1 | warmup | b/b | 1 | 17.167 | 20.891 | 30.200/36.900 | 207.52→195.04 | 0 | `3f80c43519e25d093f7b276e2a71fd9d` |
| A/B | measurement | 0/0 | ABBA | a/a | 2 | 18.143 | 20.946 | 31.900/71.400 | 163.41→173.70 | 0 | `3f80c43519e25d093f7b276e2a71fd9d` |
| A/B | measurement | 0/1 | ABBA | b/b | 2 | 14.677 | 17.688 | 29.100/41.000 | 170.10→181.19 | 0 | `3f80c43519e25d093f7b276e2a71fd9d` |
| A/B | measurement | 0/2 | ABBA | b/b | 3 | 12.683 | 13.884 | 20.100/21.600 | 175.25→183.49 | 0 | `3f80c43519e25d093f7b276e2a71fd9d` |
| A/B | measurement | 0/3 | ABBA | a/a | 3 | 12.980 | 14.248 | 19.100/23.100 | 167.64→174.16 | 0 | `3f80c43519e25d093f7b276e2a71fd9d` |
| A/B | measurement | 1/0 | BAAB | b/b | 4 | 12.023 | 14.518 | 18.700/20.400 | 220.91→194.02 | 0 | `3f80c43519e25d093f7b276e2a71fd9d` |
| A/B | measurement | 1/1 | BAAB | a/a | 4 | 11.687 | 14.408 | 18.300/18.400 | 196.59→171.92 | 0 | `3f80c43519e25d093f7b276e2a71fd9d` |
| A/B | measurement | 1/2 | BAAB | a/a | 5 | 12.693 | 13.717 | 21.700/24.900 | 196.02→201.41 | 0 | `3f80c43519e25d093f7b276e2a71fd9d` |
| A/B | measurement | 1/3 | BAAB | b/b | 5 | 12.427 | 13.651 | 19.300/22.200 | 195.15→199.70 | 0 | `3f80c43519e25d093f7b276e2a71fd9d` |

## Source, LFS, HTTP and saved-file readback

- A source `17ce3883007b9f402a82dc194285f23deba3afb9`, content `3b3361d48aab678c369fef73b57c724a9bf12df024d6ba707c00094553eefb5d`: all 17 private LFS oid/size records verified; 690 served files and 2115 requests with admitted hash/size receipts.
  Private files admitted on disk but not requested by HTTP: native-prebuilt/packs/17bb58c376d433629f030474dc50e198.bin.
- B source `470e952a2066adfbbeedf754850a0abd0f7d9fd2`, content `b533be802784df3aec66803ef733352f8caa07eaf238709fde2c9a095b80aff8`: all 17 private LFS oid/size records verified; 690 served files and 706 requests with admitted hash/size receipts.
  Private files admitted on disk but not requested by HTTP: native-prebuilt/packs/17bb58c376d433629f030474dc50e198.bin.

All nine harness hashes match the fixed plan, saved copies and execution sources. Before/after affinity verifies 6,437 observed thread entries with one GPU PID (51179). All exact pairs independently compare recorded initial fixture, all gameplay digests, final paint counts, score/HUD stamp/cache/flags/binary64 values, scene/draw/resources/pose/budget counters, and exact BVH work. No BVH reduction was admitted.

## Every exact ordinal pair

| Pair | Gameplay digest | Coverage bits | Coverage | Paint counts | BVH queries/triangle tests | Draw calls/triangles |
|---|---:|---|---|---|---:|---:|
| preflight/warmup/1 | 3196058739 | `3f80c43519e25d093f7b276e2a71fd9d` | [0.00818673596613319, 0.006629400572932734] | [1901, 1473] | 9059/150655 | 10/535 |
| measurements/warmup/1 | 3196058739 | `3f80c43519e25d093f7b276e2a71fd9d` | [0.00818673596613319, 0.006629400572932734] | [1901, 1473] | 9059/150655 | 10/535 |
| preflight/measurement/2 | 1889454195 | `3f80c43519e25d093f7b276e2a71fd9d` | [0.00818673596613319, 0.006629400572932734] | [1901, 1473] | 8875/152442 | 10/535 |
| preflight/measurement/3 | 2689908851 | `3f80c43519e25d093f7b276e2a71fd9d` | [0.00818673596613319, 0.006629400572932734] | [1901, 1473] | 8895/152962 | 10/535 |
| preflight/measurement/4 | 3934774899 | `3f80c43519e25d093f7b276e2a71fd9d` | [0.00818673596613319, 0.006629400572932734] | [1901, 1473] | 8770/148401 | 10/535 |
| preflight/measurement/5 | 43972211 | `3f80c43519e25d093f7b276e2a71fd9d` | [0.00818673596613319, 0.006629400572932734] | [1901, 1473] | 9058/152981 | 10/535 |
| measurements/measurement/2 | 1889454195 | `3f80c43519e25d093f7b276e2a71fd9d` | [0.00818673596613319, 0.006629400572932734] | [1901, 1473] | 8875/152442 | 10/535 |
| measurements/measurement/3 | 2689908851 | `3f80c43519e25d093f7b276e2a71fd9d` | [0.00818673596613319, 0.006629400572932734] | [1901, 1473] | 8895/152962 | 10/535 |
| measurements/measurement/4 | 3934774899 | `3f80c43519e25d093f7b276e2a71fd9d` | [0.00818673596613319, 0.006629400572932734] | [1901, 1473] | 8770/148401 | 10/535 |
| measurements/measurement/5 | 43972211 | `3f80c43519e25d093f7b276e2a71fd9d` | [0.00818673596613319, 0.006629400572932734] | [1901, 1473] | 9058/152981 | 10/535 |

## Limits

This fixed-step software-GPU-paint host experiment excludes scene submissions and supplies no device FPS or presented-FPS evidence. Per-frame wall excludes subsequent digest/counter observers; renderer ThreadTime includes observers and CDP evaluation. GPU drain and score observation occur after timing. Tiny score-observer allocations can affect subsequent heap history. Ordinary rematches preserve JIT and some runtime state, so equality applies only to matched ordinals. Zero drawn actor frames and constant pose digests are not visible-animation evidence. Recorded equality is not all pixels, audio, private state, external-device behavior, or a Splatoon 3 hardware comparison. All warmups, raw frame samples and failures remain in their original evidence files; no earlier timing is pooled into this run.
