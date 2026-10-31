# Native battle benchmark cf0

Saved result: `d1ee8c7ec754ec9edd287182402a7b304d200bb3e99ba64e19e3a9dd924f3662` (6,886,757 bytes). Status **passed**, launcher exit **0**.

A: `17ce3883007b9f402a82dc194285f23deba3afb9`; B: `470e952a2066adfbbeedf754850a0abd0f7d9fd2`.

Hagglefish native, low, 480×300, shooter, eight actors/seven bots, 900 fixed ticks per window at 60 Hz. Scene submissions are disabled (`_skipRender=true`); paint-atlas draws remain active on software GPU. Worker CPUs 2–3 and GPU CPUs 0–1 are disjoint under a four-core cgroup quota. No profiling, forced GC, outlier exclusion, automatic retry, or post-launch affinity changes.

44/44 windows retained: 20 warmups, 8 A/A measured windows, 16 A/B measured windows. 22/22 matched-ordinal pairs pass exact recorded parity. GPU PID 48308; 13,129 observed thread entries across before/after snapshots satisfy affinity. No page errors, context loss, or rejected windows.

## Timing result and uncertainty

Ratios are B/A, so negative changes mean lower cost. A/A uses build A on both pages. Each estimate uses all predeclared ABBA quartets; frames are not independent replications. Intervals are descriptive Student-t 95% intervals over log quartet ratios, conditional on approximate normality and independence.

| Phase | Metric | Quartets | Geometric B/A | Change | 95% change interval | Quartet min–max |
|---|---|---:|---:|---:|---:|---:|
| A/A | frameMeanMs | 2 | 0.83064 | -16.94% | -43.62% to +22.37% | 0.80569–0.85636 |
| A/A | rendererThreadMsPerTick | 2 | 0.82084 | -17.92% | -53.83% to +45.93% | 0.78449–0.85886 |
| A/B | frameMeanMs | 4 | 0.96281 | -3.72% | -8.30% to +1.09% | 0.92732–0.99804 |
| A/B | rendererThreadMsPerTick | 4 | 0.96978 | -3.02% | -6.78% to +0.88% | 0.94666–1.00345 |

The A/A control quantifies noise in this run; its state-parity pass does not imply acceptable timing noise. Four A/B quartets and two A/A quartets provide limited uncertainty information. The same-run observations do not establish repeatability across hosts, sessions, stages, rendering settings, or devices.

Same-build A/A `frameMeanMs` shows an apparent -16.94% change (quartets -19.43% to -14.36%). The A/B-to-A/A ratio of geometric ratios is 1.15912 (+15.91%); this is only a sensitivity description, not a validated correction, because the phases can have different interference and history. No timing-noise acceptance threshold was predeclared.
Same-build A/A `rendererThreadMsPerTick` shows an apparent -17.92% change (quartets -21.55% to -14.11%). The A/B-to-A/A ratio of geometric ratios is 1.18146 (+18.15%); this is only a sensitivity description, not a validated correction, because the phases can have different interference and history. No timing-noise acceptance threshold was predeclared.

For `frameMeanMs`, the A/B interval includes zero change. The point estimate is -3.72%; this run does not establish a directional performance improvement.
For `rendererThreadMsPerTick`, the A/B interval includes zero change. The point estimate is -3.02%; this run does not establish a directional performance improvement.

## All measured quartets

| Phase | Round | Frame A ms | Frame B ms | Frame change | Thread A ms/tick | Thread B ms/tick | Thread change |
|---|---:|---:|---:|---:|---:|---:|---:|
| A/A | 0 | 27.687 | 23.710 | -14.36% | 11.279 | 9.687 | -14.11% |
| A/A | 1 | 26.912 | 21.683 | -19.43% | 11.443 | 8.977 | -21.55% |
| A/B | 0 | 22.759 | 21.105 | -7.27% | 9.256 | 8.976 | -3.02% |
| A/B | 1 | 22.828 | 21.837 | -4.34% | 9.372 | 8.872 | -5.33% |
| A/B | 2 | 21.656 | 21.020 | -2.94% | 9.253 | 8.884 | -3.99% |
| A/B | 3 | 21.612 | 21.569 | -0.20% | 8.761 | 8.791 | +0.35% |

## Measured-window distributions and heap

SD is across retained windows and is descriptive. Heap units are MiB (2²⁰ bytes); deltas are after minus before. Heap snapshots alone cannot identify GC events or establish memory-leak behavior. No timing samples were removed for heap changes or throttling.

| Phase/side | Windows | Frame mean ± SD ms | Thread mean ± SD ms/tick | Frame pooled p95 / max ms | Used heap before mean | Used heap after mean | Heap delta mean [min, max] | Negative deltas | Throttled windows / periods / ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A/A/A | 4 | 27.300 ± 5.215 | 11.361 ± 2.896 | 100.620 / 860.400 | 204.78 | 214.71 | 9.93 [4.48, 16.06] | 0 | 4 / 40 / 1121.708 |
| A/A/B | 4 | 22.697 ± 1.713 | 9.332 ± 0.887 | 77.005 / 434.800 | 207.32 | 226.21 | 18.89 [-10.21, 34.87] | 1 | 4 / 9 / 772.091 |
| A/B/A | 8 | 22.214 ± 0.810 | 9.160 ± 0.304 | 75.005 / 264.000 | 218.95 | 218.68 | -0.27 [-12.83, 22.75] | 6 | 5 / 7 / 4.805 |
| A/B/B | 8 | 21.383 ± 0.483 | 8.881 ± 0.126 | 74.800 / 249.600 | 204.79 | 221.90 | 17.11 [-0.11, 34.57] | 1 | 6 / 9 / 10.316 |

Cgroup counters describe the cgroup-wide interval, including other processes and software GPU work; they are not per-game CPU measurements. Renderer ThreadTime includes digest/counter/CDP observer work. Per-frame wall times exclude subsequent observers and are not presented frame intervals.

## Every retained window, including warmups

| Phase | Kind | Round/slot | Side/build | Ordinal | Frame mean ms | Thread ms/tick | Frame p95/max ms | Heap used before→after MiB | Throttled periods |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|
| A/A | warmup | 0/0 | a/a | 1 | 14.494 | 10.587 | 37.000/181.000 | 165.70→182.71 | 0 |
| A/A | warmup | 0/1 | b/a | 1 | 20.996 | 10.690 | 69.000/210.300 | 216.30→227.03 | 2 |
| A/A | warmup | 1/2 | a/a | 2 | 23.067 | 9.814 | 81.500/286.600 | 188.10→184.10 | 0 |
| A/A | warmup | 1/3 | b/a | 2 | 24.021 | 10.217 | 82.800/275.900 | 185.23→180.87 | 2 |
| A/A | warmup | 2/4 | b/a | 3 | 22.339 | 9.317 | 78.500/216.000 | 169.93→189.12 | 0 |
| A/A | warmup | 2/5 | a/a | 3 | 23.758 | 9.249 | 81.500/246.900 | 181.66→182.14 | 2 |
| A/A | warmup | 3/6 | a/a | 4 | 22.570 | 9.566 | 76.900/247.700 | 193.77→207.43 | 1 |
| A/A | warmup | 3/7 | b/a | 4 | 22.897 | 9.133 | 80.100/282.900 | 213.76→208.57 | 2 |
| A/A | warmup | 4/8 | b/a | 5 | 21.626 | 8.761 | 74.000/228.800 | 223.10→231.36 | 1 |
| A/A | warmup | 4/9 | a/a | 5 | 22.802 | 8.843 | 74.900/207.200 | 195.53→216.48 | 0 |
| A/A | measurement | 0/0 | a/a | 6 | 31.714 | 13.629 | 126.900/527.000 | 205.71→211.26 | 14 |
| A/A | measurement | 0/1 | b/a | 6 | 25.212 | 10.627 | 90.200/434.800 | 211.20→200.98 | 5 |
| A/A | measurement | 0/2 | b/a | 7 | 22.209 | 8.748 | 78.400/232.100 | 209.49→244.35 | 1 |
| A/A | measurement | 0/3 | a/a | 7 | 23.661 | 8.929 | 73.700/255.100 | 219.02→232.67 | 15 |
| A/A | measurement | 1/0 | a/a | 8 | 21.985 | 8.789 | 75.800/255.800 | 211.28→215.76 | 3 |
| A/A | measurement | 1/1 | b/a | 8 | 21.985 | 9.189 | 75.700/216.400 | 200.18→216.99 | 2 |
| A/A | measurement | 1/2 | b/a | 9 | 21.381 | 8.766 | 73.600/242.700 | 208.44→242.54 | 1 |
| A/A | measurement | 1/3 | a/a | 9 | 31.839 | 14.097 | 120.200/860.400 | 183.10→199.16 | 8 |
| A/B | warmup | 0/0 | a/a | 1 | 13.773 | 10.963 | 30.500/218.200 | 207.21→157.83 | 7 |
| A/B | warmup | 0/1 | b/b | 1 | 23.107 | 10.627 | 76.900/239.100 | 216.64→246.42 | 4 |
| A/B | warmup | 1/2 | a/a | 2 | 27.032 | 12.226 | 91.600/601.200 | 182.24→188.98 | 10 |
| A/B | warmup | 1/3 | b/b | 2 | 23.550 | 9.571 | 77.400/273.900 | 165.03→190.84 | 0 |
| A/B | warmup | 2/4 | b/b | 3 | 20.748 | 9.248 | 70.600/249.400 | 203.04→219.81 | 4 |
| A/B | warmup | 2/5 | a/a | 3 | 23.862 | 9.629 | 78.600/271.600 | 213.78→229.48 | 2 |
| A/B | warmup | 3/6 | a/a | 4 | 21.450 | 9.301 | 75.600/255.900 | 228.45→255.46 | 0 |
| A/B | warmup | 3/7 | b/b | 4 | 22.177 | 9.214 | 74.300/228.000 | 201.69→228.49 | 1 |
| A/B | warmup | 4/8 | b/b | 5 | 21.221 | 8.776 | 71.300/232.400 | 225.65→233.33 | 1 |
| A/B | warmup | 4/9 | a/a | 5 | 23.052 | 9.352 | 81.800/231.700 | 213.24→220.65 | 5 |
| A/B | measurement | 0/0 | a/a | 6 | 22.306 | 9.353 | 75.200/253.900 | 242.36→238.37 | 0 |
| A/B | measurement | 0/1 | b/b | 6 | 21.630 | 9.142 | 77.600/231.700 | 184.91→205.10 | 2 |
| A/B | measurement | 0/2 | b/b | 7 | 20.579 | 8.811 | 70.800/249.600 | 210.83→245.40 | 1 |
| A/B | measurement | 0/3 | a/a | 7 | 23.211 | 9.159 | 77.400/248.500 | 199.87→222.62 | 2 |
| A/B | measurement | 1/0 | a/a | 8 | 22.013 | 9.072 | 74.600/236.300 | 237.60→224.78 | 1 |
| A/B | measurement | 1/1 | b/b | 8 | 22.051 | 8.881 | 80.300/245.700 | 184.77→201.96 | 0 |
| A/B | measurement | 1/2 | b/b | 9 | 21.624 | 8.862 | 75.700/241.700 | 208.77→242.57 | 2 |
| A/B | measurement | 1/3 | a/a | 9 | 23.642 | 9.672 | 78.900/237.300 | 200.44→193.82 | 2 |
| A/B | measurement | 2/0 | a/a | 10 | 21.484 | 9.210 | 72.300/210.700 | 234.67→222.11 | 1 |
| A/B | measurement | 2/1 | b/b | 10 | 20.829 | 8.920 | 66.500/233.400 | 196.93→212.78 | 1 |
| A/B | measurement | 2/2 | b/b | 11 | 21.210 | 8.847 | 75.100/226.500 | 241.56→241.45 | 2 |
| A/B | measurement | 2/3 | a/a | 11 | 21.829 | 9.295 | 71.800/248.600 | 193.95→213.13 | 0 |
| A/B | measurement | 3/0 | a/a | 12 | 21.390 | 8.738 | 71.100/244.400 | 238.34→234.48 | 0 |
| A/B | measurement | 3/1 | b/b | 12 | 21.658 | 8.888 | 76.500/211.200 | 201.58→214.80 | 1 |
| A/B | measurement | 3/2 | b/b | 13 | 21.481 | 8.694 | 78.200/232.900 | 208.98→211.12 | 0 |
| A/B | measurement | 3/3 | a/a | 13 | 21.833 | 8.783 | 74.100/264.000 | 204.36→200.15 | 1 |

## Source, LFS, and replay validation

- A: source `17ce3883007b9f402a82dc194285f23deba3afb9`, content `3b3361d48aab678c369fef73b57c724a9bf12df024d6ba707c00094553eefb5d`; all 17 private assets match source-bound LFS SHA-256 and size. 687 distinct served files, 2146 requests, with admitted hash/size receipts.
  Unrequested private assets were admitted on disk but have no HTTP receipt: native-prebuilt/packs/17bb58c376d433629f030474dc50e198.bin.
- B: source `470e952a2066adfbbeedf754850a0abd0f7d9fd2`, content `b533be802784df3aec66803ef733352f8caa07eaf238709fde2c9a095b80aff8`; all 17 private assets match source-bound LFS SHA-256 and size. 687 distinct served files, 720 requests, with admitted hash/size receipts.
  Unrequested private assets were admitted on disk but have no HTTP receipt: native-prebuilt/packs/17bb58c376d433629f030474dc50e198.bin.

Saved harness copies match all eight recorded hashes and the execution-source files. Build source/content hashes match the predeclared plan and prior smoke receipt; the prior smoke result hash is verified. The smoke timing is not pooled with this run.

Each pair below independently compares initial fixture, every retained gameplay digest, final state/paint counts, draw/resources/scene counters, pose digests, offscreen-budget work, and exact BVH work. No BVH-work reduction was admitted. Zero scene submissions also means zero drawn actor frames; the constant pose digest is not visible-animation or pixel evidence. Real-time audio voice outcomes are recorded without equality requirements.

| Phase | Kind | Ordinal | Digest | Paint counts | BVH queries / triangle tests | Draw calls / triangles |
|---|---|---:|---:|---|---:|---:|
| A/A | warmup | 1 | 4232926174 | [11899, 10224] | 246147 / 5178260 | 1 / 54 |
| A/A | warmup | 2 | 2297137118 | [11899, 10224] | 245724 / 5182225 | 1 / 54 |
| A/A | warmup | 3 | 3096298974 | [11899, 10224] | 246971 / 5191799 | 1 / 54 |
| A/A | warmup | 4 | 3817880542 | [11899, 10224] | 247022 / 5192543 | 1 / 54 |
| A/A | warmup | 5 | 1848877278 | [11899, 10224] | 246619 / 5189673 | 1 / 54 |
| A/A | measurement | 6 | 3416691422 | [11899, 10224] | 246859 / 5196742 | 1 / 54 |
| A/A | measurement | 7 | 3878226654 | [11899, 10224] | 245871 / 5179130 | 1 / 54 |
| A/A | measurement | 8 | 1284978910 | [11899, 10224] | 246773 / 5186227 | 1 / 54 |
| A/A | measurement | 9 | 3160620190 | [11899, 10224] | 246637 / 5186515 | 1 / 54 |
| A/B | warmup | 1 | 4232926174 | [11899, 10224] | 246147 / 5178260 | 1 / 54 |
| A/B | warmup | 2 | 2297137118 | [11899, 10224] | 245724 / 5182225 | 1 / 54 |
| A/B | warmup | 3 | 3096298974 | [11899, 10224] | 246971 / 5191799 | 1 / 54 |
| A/B | warmup | 4 | 3817880542 | [11899, 10224] | 247022 / 5192543 | 1 / 54 |
| A/B | warmup | 5 | 1848877278 | [11899, 10224] | 246619 / 5189673 | 1 / 54 |
| A/B | measurement | 6 | 3416691422 | [11899, 10224] | 246859 / 5196742 | 1 / 54 |
| A/B | measurement | 7 | 3878226654 | [11899, 10224] | 245871 / 5179130 | 1 / 54 |
| A/B | measurement | 8 | 1284978910 | [11899, 10224] | 246773 / 5186227 | 1 / 54 |
| A/B | measurement | 9 | 3160620190 | [11899, 10224] | 246637 / 5186515 | 1 / 54 |
| A/B | measurement | 10 | 3723272798 | [11899, 10224] | 246808 / 5187256 | 1 / 54 |
| A/B | measurement | 11 | 4052762718 | [11899, 10224] | 246200 / 5186632 | 1 / 54 |
| A/B | measurement | 12 | 1762297182 | [11899, 10224] | 246009 / 5189146 | 1 / 54 |
| A/B | measurement | 13 | 7245150 | [11899, 10224] | 246860 / 5184810 | 1 / 54 |

## Interpretation limits

This is a fixed-step host experiment with native geometry and software paint draws, with scene rendering excluded. It provides no device FPS, presented-FPS, full-rendering, or external-console performance evidence. Exact recorded parity does not establish equality of all pixels, all audio, all private state, or external-device behavior. Rematches retain JIT and some runtime history; matching is by replay ordinal, not across ordinals. All warmups and measured samples remain in `result.json`; detailed statistics, frame blocks, heap snapshots, cgroup deltas, and pair inventory are in `analysis.json`.
