# 300-frame counterbalanced session ab

Status **passed**, launcher exit **0**. Result SHA-256 `bafbe42316e28bbc6b8358d17e478b328996ecc2eaec78b89fbb542bffec6193` (5,340,383 bytes).

Hagglefish native, low, 480×300, eight actors/seven bots, shooter, 60 Hz fixed cadence. 300 frames per warmup/measured window. Page creation `ab`, quartet start `a`. A/A orders ABBA, BAAB; A/B orders ABBA, BAAB, ABBA, BAAB.

All 44 windows retained (20 warmups, 8 A/A, 16 A/B), with 22 exact ordinal pairs, including score/HUD caches and binary64 coverage bits. No page errors, context loss or rejected windows. Scene submissions are zero; software GPU paint-atlas draws remain active. GPU CPUs 0–1, worker CPUs 2–3; unchanged four-core quota. No profiling, forced GC, outlier removal, automatic retry, or post-launch affinity changes.

The score observer reads already-produced own-data caches after both timing metrics and GPU drain. Every endpoint is current and unchanged, has matching coverage/HUD bits, and passes exact pair parity. The observer invokes no coverage, teamSummary, getters, simulation, or state transition. This verifies live-Turf endpoint cache/transport behavior, not every intermediate HUD frame, DOM/pixels, finish coverage, judge/winner behavior, or external-device behavior.

## Timing and uncertainty

B/A ratios; negative changes mean lower cost. A/A compares build A on both pages. The quartet is a reporting unit; its repeated use of retained pages does not establish independent replication. Conditional log-ratio t intervals are shown without treating individual frames as independent samples. One-order A/A has only one quartet and no interval.

| Phase | Order group | Quartets | Metric | Geometric B/A | Change | Conditional 95% change interval | Quartet range |
|---|---|---:|---|---:|---:|---:|---:|
| A/A | all | 2 | frameMeanMs | 1.01992 | +1.99% | -48.55% to +102.18% | 0.96644–1.07635 |
| A/A | all | 2 | rendererThreadMsPerTick | 1.00724 | +0.72% | +0.33% to +1.12% | 1.00692–1.00755 |
| A/A | ABBA | 1 | frameMeanMs | 1.07635 | +7.63% | unavailable (one quartet) | 1.07635–1.07635 |
| A/A | ABBA | 1 | rendererThreadMsPerTick | 1.00692 | +0.69% | unavailable (one quartet) | 1.00692–1.00692 |
| A/A | BAAB | 1 | frameMeanMs | 0.96644 | -3.36% | unavailable (one quartet) | 0.96644–0.96644 |
| A/A | BAAB | 1 | rendererThreadMsPerTick | 1.00755 | +0.76% | unavailable (one quartet) | 1.00755–1.00755 |
| A/B | all | 4 | frameMeanMs | 1.05724 | +5.72% | -1.16% to +13.09% | 1.01093–1.11707 |
| A/B | all | 4 | rendererThreadMsPerTick | 0.99105 | -0.89% | -6.85% to +5.44% | 0.95986–1.04514 |
| A/B | ABBA | 2 | frameMeanMs | 1.06268 | +6.27% | -43.64% to +100.38% | 1.01093–1.11707 |
| A/B | ABBA | 2 | rendererThreadMsPerTick | 1.02023 | +2.02% | -24.91% to +38.61% | 0.99592–1.04514 |
| A/B | BAAB | 2 | frameMeanMs | 1.05184 | +5.18% | -9.63% to +22.43% | 1.03934–1.06448 |
| A/B | BAAB | 2 | rendererThreadMsPerTick | 0.96271 | -3.73% | -7.29% to -0.04% | 0.95986–0.96557 |

A/A state parity does not establish acceptable timing noise; no numerical timing-noise acceptance threshold was predeclared. Alternating ABBA/BAAB balances outer/inner slots but does not remove persistent page/renderer differences or guarantee equal wall-clock spacing. Reversed page order and quartet start change together across the two full sessions, so their effects cannot be individually identified. Fixed session order and changing host conditions also limit causal attribution.

`frameMeanMs`: +5.72%, conditional 95% interval -1.16% to +13.09%. The interval includes zero; this session does not establish a directional performance change.
`rendererThreadMsPerTick`: -0.89%, conditional 95% interval -6.85% to +5.44%. The interval includes zero; this session does not establish a directional performance change.

## Every measured quartet

| Phase | Round | Order | Frame A ms | Frame B ms | Frame change | Thread A ms/tick | Thread B ms/tick | Thread change |
|---|---:|---|---:|---:|---:|---:|---:|---:|
| A/A | 0 | ABBA | 15.484 | 16.666 | +7.63% | 10.356 | 10.427 | +0.69% |
| A/A | 1 | BAAB | 16.598 | 16.041 | -3.36% | 10.059 | 10.135 | +0.76% |
| A/B | 0 | ABBA | 15.548 | 15.718 | +1.09% | 11.055 | 11.010 | -0.41% |
| A/B | 1 | BAAB | 16.365 | 17.009 | +3.93% | 11.519 | 11.057 | -4.01% |
| A/B | 2 | ABBA | 15.189 | 16.967 | +11.71% | 10.877 | 11.368 | +4.51% |
| A/B | 3 | BAAB | 14.914 | 15.876 | +6.45% | 10.506 | 10.145 | -3.44% |

## Measured-window distributions, heap and cgroup

SD across windows is descriptive. Heap values use MiB (2²⁰ bytes). Negative deltas cannot identify individual GC events; no samples were removed for heap changes or throttling. Cgroup counters cover the entire cgroup, not just the game.

| Phase · side | n | Frame mean ± SD ms | Thread mean ± SD ms/tick | Pooled frame p95/max ms | Used heap before→after mean MiB | Heap delta mean [min,max] MiB | Negative deltas | Throttled windows/periods/ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| A/A · A | 4 | 16.041 ± 0.688 | 10.207 ± 0.214 | 62.955/475.200 | 206.61→211.92 | 5.31 [-6.43,23.99] | 1 | 1/1/1.463 |
| A/A · B | 4 | 16.353 ± 0.568 | 10.281 ± 0.212 | 64.265/594.200 | 193.85→208.16 | 14.31 [2.69,27.47] | 0 | 2/3/4.282 |
| A/B · A | 8 | 15.504 ± 0.810 | 10.989 ± 0.470 | 19.600/945.900 | 195.55→202.48 | 6.94 [-3.47,30.87] | 3 | 4/9/17.242 |
| A/B · B | 8 | 16.392 ± 0.888 | 10.895 ± 0.836 | 41.620/621.700 | 185.57→192.69 | 7.12 [-5.08,30.30] | 3 | 2/2/1.187 |

## Every retained window

| Phase | Kind | Round/slot | Order | Side/build | Ordinal | Frame mean ms | Thread ms/tick | Frame p95/max ms | Heap used before→after MiB | Throttled periods | Score coverage bits |
|---|---|---:|---|---|---:|---:|---:|---:|---:|---:|---|
| A/A | warmup | 0/0 | warmup | a/a | 1 | 18.636 | 12.868 | 28.900/721.200 | 197.06→230.66 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/A | warmup | 0/1 | warmup | b/a | 1 | 16.743 | 12.716 | 33.600/79.900 | 216.37→160.49 | 1 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/A | warmup | 1/2 | warmup | a/a | 2 | 16.767 | 11.286 | 19.100/583.500 | 197.62→188.99 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/A | warmup | 1/3 | warmup | b/a | 2 | 17.062 | 11.359 | 18.700/651.700 | 204.75→196.38 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/A | warmup | 2/4 | warmup | b/a | 3 | 15.548 | 10.795 | 17.600/868.800 | 229.74→235.19 | 1 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/A | warmup | 2/5 | warmup | a/a | 3 | 16.182 | 10.960 | 25.400/426.300 | 199.85→178.76 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/A | warmup | 3/6 | warmup | a/a | 4 | 15.366 | 10.056 | 24.200/397.300 | 212.95→214.18 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/A | warmup | 3/7 | warmup | b/a | 4 | 16.593 | 10.694 | 81.000/196.400 | 200.98→206.85 | 1 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/A | warmup | 4/8 | warmup | b/a | 5 | 15.489 | 10.351 | 38.900/559.500 | 226.41→225.34 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/A | warmup | 4/9 | warmup | a/a | 5 | 16.511 | 10.382 | 59.600/258.800 | 177.67→181.84 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/A | measurement | 0/0 | ABBA | a/a | 6 | 15.194 | 10.492 | 34.000/475.200 | 174.97→178.24 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/A | measurement | 0/1 | ABBA | b/a | 6 | 16.978 | 10.491 | 76.600/182.100 | 210.32→213.88 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/A | measurement | 0/2 | ABBA | b/a | 7 | 16.354 | 10.364 | 65.500/594.200 | 196.06→198.76 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/A | measurement | 0/3 | ABBA | a/a | 7 | 15.774 | 10.220 | 30.000/455.600 | 211.19→211.58 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/A | measurement | 1/0 | BAAB | b/a | 8 | 15.604 | 10.280 | 62.300/177.700 | 196.12→219.62 | 1 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/A | measurement | 1/1 | BAAB | a/a | 8 | 16.667 | 10.136 | 80.700/286.000 | 215.55→209.12 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/A | measurement | 1/2 | BAAB | a/a | 9 | 16.529 | 9.982 | 74.100/277.300 | 224.75→248.74 | 1 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/A | measurement | 1/3 | BAAB | b/a | 9 | 16.478 | 9.991 | 44.200/412.000 | 172.90→200.37 | 2 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | warmup | 0/0 | warmup | a/a | 1 | 15.158 | 13.161 | 27.000/231.200 | 200.90→235.66 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | warmup | 0/1 | warmup | b/b | 1 | 18.419 | 15.706 | 38.800/132.800 | 201.58→156.09 | 3 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | warmup | 1/2 | warmup | a/a | 2 | 15.592 | 11.456 | 31.500/211.700 | 186.11→178.55 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | warmup | 1/3 | warmup | b/b | 2 | 15.471 | 11.156 | 30.400/328.500 | 178.54→204.54 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | warmup | 2/4 | warmup | b/b | 3 | 15.996 | 10.952 | 27.400/405.400 | 211.17→217.24 | 2 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | warmup | 2/5 | warmup | a/a | 3 | 15.137 | 14.147 | 24.900/205.000 | 194.92→173.53 | 5 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | warmup | 3/6 | warmup | a/a | 4 | 15.196 | 11.035 | 38.300/284.800 | 194.48→199.36 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | warmup | 3/7 | warmup | b/b | 4 | 16.124 | 10.843 | 21.300/708.800 | 194.08→200.62 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | warmup | 4/8 | warmup | b/b | 5 | 15.407 | 10.674 | 75.300/147.300 | 218.58→218.21 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | warmup | 4/9 | warmup | a/a | 5 | 15.061 | 10.926 | 17.900/782.200 | 195.70→201.12 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | measurement | 0/0 | ABBA | a/a | 6 | 16.109 | 11.275 | 53.200/264.900 | 180.48→189.23 | 4 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | measurement | 0/1 | ABBA | b/b | 6 | 15.815 | 10.618 | 21.600/400.600 | 180.18→210.48 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | measurement | 0/2 | ABBA | b/b | 7 | 15.620 | 11.403 | 28.800/621.700 | 188.54→190.91 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | measurement | 0/3 | ABBA | a/a | 7 | 14.987 | 10.835 | 16.700/945.900 | 196.83→199.25 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | measurement | 1/0 | BAAB | b/b | 8 | 16.876 | 10.649 | 68.300/378.700 | 175.48→176.99 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | measurement | 1/1 | BAAB | a/a | 8 | 16.749 | 11.905 | 26.500/730.100 | 202.68→199.40 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | measurement | 1/2 | BAAB | a/a | 9 | 15.982 | 11.133 | 18.900/804.500 | 203.05→199.58 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | measurement | 1/3 | BAAB | b/b | 9 | 17.142 | 11.464 | 49.100/386.600 | 204.76→200.45 | 1 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | measurement | 2/0 | ABBA | a/a | 10 | 14.519 | 10.943 | 18.000/802.700 | 188.03→188.30 | 1 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | measurement | 2/1 | ABBA | b/b | 10 | 18.095 | 12.448 | 75.000/550.900 | 172.48→175.76 | 1 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | measurement | 2/2 | ABBA | b/b | 11 | 15.839 | 10.287 | 21.100/409.100 | 200.19→195.11 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | measurement | 2/3 | ABBA | a/a | 11 | 15.858 | 10.811 | 24.300/445.500 | 173.47→204.34 | 2 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | measurement | 3/0 | BAAB | b/b | 12 | 15.708 | 10.512 | 66.000/247.100 | 189.68→189.51 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | measurement | 3/1 | BAAB | a/a | 12 | 15.357 | 10.711 | 72.300/232.300 | 197.67→197.22 | 2 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | measurement | 3/2 | BAAB | a/a | 13 | 14.471 | 10.302 | 18.400/652.300 | 222.16→242.54 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | measurement | 3/3 | BAAB | b/b | 13 | 16.044 | 9.778 | 29.300/396.000 | 173.27→202.30 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |

## Source, LFS, HTTP and saved-file readback

- A source `17ce3883007b9f402a82dc194285f23deba3afb9`, content `3b3361d48aab678c369fef73b57c724a9bf12df024d6ba707c00094553eefb5d`: all 17 private LFS oid/size records verified; 691 served files and 2135 requests with admitted hash/size receipts.
  Private files admitted on disk but not requested by HTTP: native-prebuilt/packs/17bb58c376d433629f030474dc50e198.bin.
- B source `470e952a2066adfbbeedf754850a0abd0f7d9fd2`, content `b533be802784df3aec66803ef733352f8caa07eaf238709fde2c9a095b80aff8`: all 17 private LFS oid/size records verified; 691 served files and 713 requests with admitted hash/size receipts.
  Private files admitted on disk but not requested by HTTP: native-prebuilt/packs/17bb58c376d433629f030474dc50e198.bin.

All nine harness hashes match the fixed plan, saved copies and execution sources. Before/after affinity verifies 13,648 observed thread entries with one GPU PID (52098). All exact pairs independently compare recorded initial fixture, all gameplay digests, final paint counts, score/HUD stamp/cache/flags/binary64 values, scene/draw/resources/pose/budget counters, and exact BVH work. No BVH reduction was admitted.

## Every exact ordinal pair

| Pair | Gameplay digest | Coverage bits | Coverage | Paint counts | BVH queries/triangle tests | Draw calls/triangles |
|---|---:|---|---|---|---:|---:|
| preflight/warmup/1 | 149239247 | `3f9348abcb0648193f99e96d6bc5ba3d` | [0.01883190561927259, 0.0253045174626385] | [4176, 5490] | 88069/1743596 | 16/2673 |
| preflight/warmup/2 | 85424079 | `3f9348abcb0648193f99e96d6bc5ba3d` | [0.01883190561927259, 0.0253045174626385] | [4176, 5490] | 87367/1742841 | 16/2673 |
| preflight/warmup/3 | 777823695 | `3f9348abcb0648193f99e96d6bc5ba3d` | [0.01883190561927259, 0.0253045174626385] | [4176, 5490] | 88124/1744177 | 16/2673 |
| preflight/warmup/4 | 3008719055 | `3f9348abcb0648193f99e96d6bc5ba3d` | [0.01883190561927259, 0.0253045174626385] | [4176, 5490] | 89008/1750126 | 16/2673 |
| preflight/warmup/5 | 885700047 | `3f9348abcb0648193f99e96d6bc5ba3d` | [0.01883190561927259, 0.0253045174626385] | [4176, 5490] | 88333/1747673 | 16/2673 |
| measurements/warmup/1 | 149239247 | `3f9348abcb0648193f99e96d6bc5ba3d` | [0.01883190561927259, 0.0253045174626385] | [4176, 5490] | 88069/1743596 | 16/2673 |
| measurements/warmup/2 | 85424079 | `3f9348abcb0648193f99e96d6bc5ba3d` | [0.01883190561927259, 0.0253045174626385] | [4176, 5490] | 87367/1742841 | 16/2673 |
| measurements/warmup/3 | 777823695 | `3f9348abcb0648193f99e96d6bc5ba3d` | [0.01883190561927259, 0.0253045174626385] | [4176, 5490] | 88124/1744177 | 16/2673 |
| measurements/warmup/4 | 3008719055 | `3f9348abcb0648193f99e96d6bc5ba3d` | [0.01883190561927259, 0.0253045174626385] | [4176, 5490] | 89008/1750126 | 16/2673 |
| measurements/warmup/5 | 885700047 | `3f9348abcb0648193f99e96d6bc5ba3d` | [0.01883190561927259, 0.0253045174626385] | [4176, 5490] | 88333/1747673 | 16/2673 |
| preflight/measurement/6 | 1155636687 | `3f9348abcb0648193f99e96d6bc5ba3d` | [0.01883190561927259, 0.0253045174626385] | [4176, 5490] | 88580/1746537 | 16/2673 |
| preflight/measurement/7 | 3198090831 | `3f9348abcb0648193f99e96d6bc5ba3d` | [0.01883190561927259, 0.0253045174626385] | [4176, 5490] | 87877/1744625 | 16/2673 |
| preflight/measurement/8 | 2388775887 | `3f9348abcb0648193f99e96d6bc5ba3d` | [0.01883190561927259, 0.0253045174626385] | [4176, 5490] | 87826/1748935 | 16/2673 |
| preflight/measurement/9 | 1579433935 | `3f9348abcb0648193f99e96d6bc5ba3d` | [0.01883190561927259, 0.0253045174626385] | [4176, 5490] | 87930/1743958 | 16/2673 |
| measurements/measurement/6 | 1155636687 | `3f9348abcb0648193f99e96d6bc5ba3d` | [0.01883190561927259, 0.0253045174626385] | [4176, 5490] | 88580/1746537 | 16/2673 |
| measurements/measurement/7 | 3198090831 | `3f9348abcb0648193f99e96d6bc5ba3d` | [0.01883190561927259, 0.0253045174626385] | [4176, 5490] | 87877/1744625 | 16/2673 |
| measurements/measurement/8 | 2388775887 | `3f9348abcb0648193f99e96d6bc5ba3d` | [0.01883190561927259, 0.0253045174626385] | [4176, 5490] | 87826/1748935 | 16/2673 |
| measurements/measurement/9 | 1579433935 | `3f9348abcb0648193f99e96d6bc5ba3d` | [0.01883190561927259, 0.0253045174626385] | [4176, 5490] | 87930/1743958 | 16/2673 |
| measurements/measurement/10 | 2194242511 | `3f9348abcb0648193f99e96d6bc5ba3d` | [0.01883190561927259, 0.0253045174626385] | [4176, 5490] | 88014/1751005 | 16/2673 |
| measurements/measurement/11 | 2190864335 | `3f9348abcb0648193f99e96d6bc5ba3d` | [0.01883190561927259, 0.0253045174626385] | [4176, 5490] | 88157/1740273 | 16/2673 |
| measurements/measurement/12 | 2578461647 | `3f9348abcb0648193f99e96d6bc5ba3d` | [0.01883190561927259, 0.0253045174626385] | [4176, 5490] | 88822/1756181 | 16/2673 |
| measurements/measurement/13 | 2913734607 | `3f9348abcb0648193f99e96d6bc5ba3d` | [0.01883190561927259, 0.0253045174626385] | [4176, 5490] | 88209/1743833 | 16/2673 |

## Limits

This fixed-step software-GPU-paint host experiment excludes scene submissions and supplies no device FPS or presented-FPS evidence. Per-frame wall excludes subsequent digest/counter observers; renderer ThreadTime includes observers and CDP evaluation. GPU drain and score observation occur after timing. Tiny score-observer allocations can affect subsequent heap history. Ordinary rematches preserve JIT and some runtime state, so equality applies only to matched ordinals. Zero drawn actor frames and constant pose digests are not visible-animation evidence. Recorded equality is not all pixels, audio, private state, external-device behavior, or a Splatoon 3 hardware comparison. All warmups, raw frame samples and failures remain in their original evidence files; no earlier timing is pooled into this run.
