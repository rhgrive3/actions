# 300-frame counterbalanced session ba

Status **passed**, launcher exit **0**. Result SHA-256 `13f2d254ec28e664e64e938cfca8b25edb15d6cea37d90e5541e5334fbb1392b` (5,315,224 bytes).

Hagglefish native, low, 480×300, eight actors/seven bots, shooter, 60 Hz fixed cadence. 300 frames per warmup/measured window. Page creation `ba`, quartet start `b`. A/A orders BAAB, ABBA; A/B orders BAAB, ABBA, BAAB, ABBA.

All 44 windows retained (20 warmups, 8 A/A, 16 A/B), with 22 exact ordinal pairs, including score/HUD caches and binary64 coverage bits. No page errors, context loss or rejected windows. Scene submissions are zero; software GPU paint-atlas draws remain active. GPU CPUs 0–1, worker CPUs 2–3; unchanged four-core quota. No profiling, forced GC, outlier removal, automatic retry, or post-launch affinity changes.

The score observer reads already-produced own-data caches after both timing metrics and GPU drain. Every endpoint is current and unchanged, has matching coverage/HUD bits, and passes exact pair parity. The observer invokes no coverage, teamSummary, getters, simulation, or state transition. This verifies live-Turf endpoint cache/transport behavior, not every intermediate HUD frame, DOM/pixels, finish coverage, judge/winner behavior, or external-device behavior.

## Timing and uncertainty

B/A ratios; negative changes mean lower cost. A/A compares build A on both pages. The quartet is a reporting unit; its repeated use of retained pages does not establish independent replication. Conditional log-ratio t intervals are shown without treating individual frames as independent samples. One-order A/A has only one quartet and no interval.

| Phase | Order group | Quartets | Metric | Geometric B/A | Change | Conditional 95% change interval | Quartet range |
|---|---|---:|---|---:|---:|---:|---:|
| A/A | all | 2 | frameMeanMs | 1.07656 | +7.66% | -18.54% to +42.27% | 1.05320–1.10044 |
| A/A | all | 2 | rendererThreadMsPerTick | 1.05177 | +5.18% | -46.76% to +107.77% | 0.99690–1.10966 |
| A/A | ABBA | 1 | frameMeanMs | 1.10044 | +10.04% | unavailable (one quartet) | 1.10044–1.10044 |
| A/A | ABBA | 1 | rendererThreadMsPerTick | 0.99690 | -0.31% | unavailable (one quartet) | 0.99690–0.99690 |
| A/A | BAAB | 1 | frameMeanMs | 1.05320 | +5.32% | unavailable (one quartet) | 1.05320–1.05320 |
| A/A | BAAB | 1 | rendererThreadMsPerTick | 1.10966 | +10.97% | unavailable (one quartet) | 1.10966–1.10966 |
| A/B | all | 4 | frameMeanMs | 0.94309 | -5.69% | -14.23% to +3.70% | 0.88885–1.02439 |
| A/B | all | 4 | rendererThreadMsPerTick | 0.86988 | -13.01% | -19.19% to -6.36% | 0.83519–0.92227 |
| A/B | ABBA | 2 | frameMeanMs | 0.93209 | -6.79% | -12.99% to -0.15% | 0.92705–0.93715 |
| A/B | ABBA | 2 | rendererThreadMsPerTick | 0.83823 | -16.18% | -19.96% to -12.22% | 0.83519–0.84128 |
| A/B | BAAB | 2 | frameMeanMs | 0.95421 | -4.58% | -61.27% to +135.08% | 0.88885–1.02439 |
| A/B | BAAB | 2 | rendererThreadMsPerTick | 0.90272 | -9.73% | -31.24% to +18.52% | 0.88358–0.92227 |

A/A state parity does not establish acceptable timing noise; no numerical timing-noise acceptance threshold was predeclared. Alternating ABBA/BAAB balances outer/inner slots but does not remove persistent page/renderer differences or guarantee equal wall-clock spacing. Reversed page order and quartet start change together across the two full sessions, so their effects cannot be individually identified. Fixed session order and changing host conditions also limit causal attribution.

`frameMeanMs`: -5.69%, conditional 95% interval -14.23% to +3.70%. The interval includes zero; this session does not establish a directional performance change.
`rendererThreadMsPerTick`: -13.01%, conditional 95% interval -19.19% to -6.36%. The conditional interval is below zero; assess this together with A/A noise, order-specific results and the reversed independent session before attributing the change.

## Every measured quartet

| Phase | Round | Order | Frame A ms | Frame B ms | Frame change | Thread A ms/tick | Thread B ms/tick | Thread change |
|---|---:|---|---:|---:|---:|---:|---:|---:|
| A/A | 0 | BAAB | 16.545 | 17.425 | +5.32% | 10.894 | 12.089 | +10.97% |
| A/A | 1 | ABBA | 15.979 | 17.584 | +10.04% | 10.430 | 10.398 | -0.31% |
| A/B | 0 | BAAB | 16.839 | 14.967 | -11.12% | 11.417 | 10.530 | -7.77% |
| A/B | 1 | ABBA | 16.672 | 15.456 | -7.29% | 12.515 | 10.529 | -15.87% |
| A/B | 2 | BAAB | 17.086 | 17.503 | +2.44% | 12.307 | 10.874 | -11.64% |
| A/B | 3 | ABBA | 17.884 | 16.760 | -6.28% | 12.024 | 10.043 | -16.48% |

## Measured-window distributions, heap and cgroup

SD across windows is descriptive. Heap values use MiB (2²⁰ bytes). Negative deltas cannot identify individual GC events; no samples were removed for heap changes or throttling. Cgroup counters cover the entire cgroup, not just the game.

| Phase · side | n | Frame mean ± SD ms | Thread mean ± SD ms/tick | Pooled frame p95/max ms | Used heap before→after mean MiB | Heap delta mean [min,max] MiB | Negative deltas | Throttled windows/periods/ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| A/A · A | 4 | 16.262 ± 0.571 | 10.662 ± 0.351 | 58.010/592.700 | 179.09→188.20 | 9.11 [-0.29,32.29] | 1 | 0/0/0.000 |
| A/A · B | 4 | 17.505 ± 0.642 | 11.243 ± 1.630 | 68.505/409.900 | 191.51→203.45 | 11.94 [-1.67,27.92] | 1 | 1/2/2.349 |
| A/B · A | 8 | 17.120 ± 1.361 | 12.066 ± 1.706 | 48.010/1280.200 | 217.46→218.15 | 0.69 [-10.75,32.43] | 5 | 5/17/1281.048 |
| A/B · B | 8 | 16.172 ± 1.095 | 10.494 ± 0.363 | 55.205/602.100 | 193.23→205.71 | 12.49 [-16.48,27.75] | 3 | 2/4/7.059 |

## Every retained window

| Phase | Kind | Round/slot | Order | Side/build | Ordinal | Frame mean ms | Thread ms/tick | Frame p95/max ms | Heap used before→after MiB | Throttled periods | Score coverage bits |
|---|---|---:|---|---|---:|---:|---:|---:|---:|---:|---|
| A/A | warmup | 0/0 | warmup | b/a | 1 | 17.727 | 12.855 | 30.000/679.500 | 221.01→220.48 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/A | warmup | 0/1 | warmup | a/a | 1 | 17.065 | 14.298 | 35.400/81.500 | 167.96→199.97 | 1 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/A | warmup | 1/2 | warmup | b/a | 2 | 15.033 | 11.608 | 21.300/456.900 | 168.26→191.68 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/A | warmup | 1/3 | warmup | a/a | 2 | 16.788 | 11.689 | 23.400/524.000 | 169.25→193.49 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/A | warmup | 2/4 | warmup | a/a | 3 | 16.432 | 11.101 | 28.300/363.200 | 210.45→217.94 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/A | warmup | 2/5 | warmup | b/a | 3 | 16.896 | 13.127 | 43.700/187.400 | 169.59→179.93 | 10 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/A | warmup | 3/6 | warmup | b/a | 4 | 23.363 | 19.291 | 52.400/648.400 | 189.16→194.97 | 18 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/A | warmup | 3/7 | warmup | a/a | 4 | 16.820 | 13.851 | 29.000/488.200 | 184.08→191.21 | 1 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/A | warmup | 4/8 | warmup | a/a | 5 | 19.269 | 14.290 | 59.400/364.800 | 213.70→214.40 | 2 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/A | warmup | 4/9 | warmup | b/a | 5 | 18.036 | 12.620 | 60.600/402.400 | 189.08→193.63 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/A | measurement | 0/0 | BAAB | b/a | 6 | 18.011 | 13.685 | 47.800/318.300 | 209.55→207.88 | 2 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/A | measurement | 0/1 | BAAB | a/a | 6 | 16.411 | 10.636 | 21.600/592.700 | 178.05→177.75 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/A | measurement | 0/2 | BAAB | a/a | 7 | 16.680 | 11.152 | 74.400/351.600 | 179.02→181.48 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/A | measurement | 0/3 | BAAB | b/a | 7 | 16.840 | 10.492 | 80.300/409.900 | 172.15→200.07 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/A | measurement | 1/0 | ABBA | a/a | 8 | 15.422 | 10.325 | 53.300/328.500 | 177.56→179.54 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/A | measurement | 1/1 | ABBA | b/a | 8 | 18.098 | 10.318 | 80.400/180.800 | 184.17→184.67 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/A | measurement | 1/2 | ABBA | b/a | 9 | 17.071 | 10.477 | 82.400/204.300 | 200.18→221.18 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/A | measurement | 1/3 | ABBA | a/a | 9 | 16.537 | 10.535 | 75.000/180.300 | 181.72→214.02 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | warmup | 0/0 | warmup | b/b | 1 | 19.326 | 15.431 | 47.000/146.900 | 209.87→169.24 | 1 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | warmup | 0/1 | warmup | a/a | 1 | 21.255 | 17.857 | 48.800/253.400 | 221.60→223.04 | 4 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | warmup | 1/2 | warmup | b/b | 2 | 16.993 | 12.494 | 41.100/388.700 | 197.83→189.60 | 1 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | warmup | 1/3 | warmup | a/a | 2 | 16.086 | 11.751 | 23.000/240.500 | 176.10→168.44 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | warmup | 2/4 | warmup | a/a | 3 | 15.026 | 11.330 | 26.200/358.200 | 183.19→194.69 | 2 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | warmup | 2/5 | warmup | b/b | 3 | 15.248 | 11.063 | 24.100/307.200 | 195.95→206.48 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | warmup | 3/6 | warmup | b/b | 4 | 15.310 | 10.784 | 24.600/586.000 | 212.66→213.86 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | warmup | 3/7 | warmup | a/a | 4 | 27.360 | 23.397 | 101.800/263.500 | 197.49→173.71 | 11 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | warmup | 4/8 | warmup | a/a | 5 | 15.730 | 11.065 | 54.600/272.000 | 204.38→203.91 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | warmup | 4/9 | warmup | b/b | 5 | 15.007 | 10.721 | 18.500/434.900 | 201.50→179.01 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | measurement | 0/0 | BAAB | b/b | 6 | 15.055 | 10.388 | 20.900/602.100 | 199.92→197.13 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | measurement | 0/1 | BAAB | a/a | 6 | 17.103 | 10.920 | 70.200/198.000 | 244.17→243.51 | 2 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | measurement | 0/2 | BAAB | a/a | 7 | 16.575 | 11.914 | 25.600/710.900 | 264.32→258.82 | 1 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | measurement | 0/3 | BAAB | b/b | 7 | 14.880 | 10.671 | 21.100/499.600 | 172.78→200.53 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | measurement | 1/0 | ABBA | a/a | 8 | 15.488 | 10.409 | 53.700/170.700 | 194.55→196.73 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | measurement | 1/1 | ABBA | b/b | 8 | 15.487 | 10.659 | 40.100/397.900 | 192.59→217.28 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | measurement | 1/2 | ABBA | b/b | 9 | 15.425 | 10.399 | 53.200/556.800 | 203.31→198.03 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | measurement | 1/3 | ABBA | a/a | 9 | 17.856 | 14.621 | 66.100/312.400 | 181.16→182.48 | 1 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | measurement | 2/0 | BAAB | b/b | 10 | 17.668 | 11.140 | 75.500/307.900 | 191.89→215.86 | 2 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | measurement | 2/1 | BAAB | a/a | 10 | 17.280 | 10.629 | 58.400/668.500 | 222.61→212.94 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | measurement | 2/2 | BAAB | a/a | 11 | 16.893 | 13.984 | 27.700/656.900 | 217.38→213.52 | 3 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | measurement | 2/3 | BAAB | b/b | 11 | 17.338 | 10.608 | 82.200/178.400 | 181.33→206.83 | 2 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | measurement | 3/0 | ABBA | a/a | 12 | 15.858 | 10.609 | 66.500/180.100 | 187.39→219.82 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | measurement | 3/1 | ABBA | b/b | 12 | 17.047 | 10.104 | 56.600/490.200 | 181.40→203.93 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | measurement | 3/2 | ABBA | b/b | 13 | 16.474 | 9.982 | 64.900/429.500 | 222.58→206.10 | 0 | `3f9348abcb0648193f99e96d6bc5ba3d` |
| A/B | measurement | 3/3 | ABBA | a/a | 13 | 19.911 | 13.440 | 53.900/1280.200 | 228.13→217.38 | 10 | `3f9348abcb0648193f99e96d6bc5ba3d` |

## Source, LFS, HTTP and saved-file readback

- A source `17ce3883007b9f402a82dc194285f23deba3afb9`, content `3b3361d48aab678c369fef73b57c724a9bf12df024d6ba707c00094553eefb5d`: all 17 private LFS oid/size records verified; 691 served files and 2134 requests with admitted hash/size receipts.
  Private files admitted on disk but not requested by HTTP: native-prebuilt/packs/17bb58c376d433629f030474dc50e198.bin.
- B source `470e952a2066adfbbeedf754850a0abd0f7d9fd2`, content `b533be802784df3aec66803ef733352f8caa07eaf238709fde2c9a095b80aff8`: all 17 private LFS oid/size records verified; 691 served files and 714 requests with admitted hash/size receipts.
  Private files admitted on disk but not requested by HTTP: native-prebuilt/packs/17bb58c376d433629f030474dc50e198.bin.

All nine harness hashes match the fixed plan, saved copies and execution sources. Before/after affinity verifies 13,536 observed thread entries with one GPU PID (52743). All exact pairs independently compare recorded initial fixture, all gameplay digests, final paint counts, score/HUD stamp/cache/flags/binary64 values, scene/draw/resources/pose/budget counters, and exact BVH work. No BVH reduction was admitted.

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
