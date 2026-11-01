# Counterbalanced native battle validation

Both sequential, separately launched Chromium sessions passed saved-file readback: 88/88 full-run windows, 44/44 matched-ordinal pairs, zero rejected windows, page errors or WebGL context losses. All endpoint score/HUD caches are current, unchanged and exactly equal within each pair, including binary64 coverage encodings. The separate 20-window/10-pair 30-frame admission smoke also passed.

Hagglefish native, low, 480×300, shooter, eight actors/seven bots, fixed 60 Hz; 300 frames per warmup/measured window; five warmups per side per phase; two A/A and four A/B quartets per session. Scene submissions are disabled and software GPU paint-atlas draws remain active. GPU CPUs 0–1 and worker CPUs 2–3 remain disjoint under the same four-core quota. No profiling, forced GC, outlier exclusion, automatic retries or post-launch affinity changes.

A: `17ce3883007b9f402a82dc194285f23deba3afb9`. B: `470e952a2066adfbbeedf754850a0abd0f7d9fd2`.

Fixed sequence: `cba0` creates pages A→B and starts with ABBA, then alternates BAAB/ABBA; `cbb0` starts a fresh browser, creates pages B→A and starts with BAAB, then alternates ABBA/BAAB. A/A uses the baseline A build on both pages. The second session began after the first finished, with a different GPU PID. The two schedule factors reverse together; the experiment cannot identify their individual effects.

## Independent-session timing

Negative B/A changes mean lower cost. Conditional 95% intervals use quartet log-ratios within each session. Retained pages and a shared browser do not establish independence. All predeclared samples are retained.

| Session | Phase | Quartets | Metric | Geometric B/A | Change | Conditional 95% change interval |
|---|---|---:|---|---:|---:|---:|
| cba0 · ab/a | A/A | 2 | frameMeanMs | 1.01992 | +1.99% | -48.55% to +102.18% |
| cba0 · ab/a | A/A | 2 | rendererThreadMsPerTick | 1.00724 | +0.72% | +0.33% to +1.12% |
| cba0 · ab/a | A/B | 4 | frameMeanMs | 1.05724 | +5.72% | -1.16% to +13.09% |
| cba0 · ab/a | A/B | 4 | rendererThreadMsPerTick | 0.99105 | -0.89% | -6.85% to +5.44% |
| cbb0 · ba/b | A/A | 2 | frameMeanMs | 1.07656 | +7.66% | -18.54% to +42.27% |
| cbb0 · ba/b | A/A | 2 | rendererThreadMsPerTick | 1.05177 | +5.18% | -46.76% to +107.77% |
| cbb0 · ba/b | A/B | 4 | frameMeanMs | 0.94309 | -5.69% | -14.23% to +3.70% |
| cbb0 · ba/b | A/B | 4 | rendererThreadMsPerTick | 0.86988 | -13.01% | -19.19% to -6.36% |

The session-level calculation below uses each session’s geometric ratio once (n=2, df=1). Its interval is conditional on approximately normal, independent session log-ratios. Two sequential sessions on one host provide very limited evidence for those assumptions, even though their browser processes are independent. No eight-quartet pooled confidence interval is presented as independent replication.

| Phase | Metric | Sessions | Geometric B/A | Change | Conditional session-level 95% change interval |
|---|---|---:|---:|---:|---:|
| A/A | frameMeanMs | 2 | 1.04786 | +4.79% | -25.67% to +47.72% |
| A/A | rendererThreadMsPerTick | 2 | 1.02926 | +2.93% | -21.81% to +35.49% |
| A/B | frameMeanMs | 2 | 0.99853 | -0.15% | -51.68% to +106.36% |
| A/B | rendererThreadMsPerTick | 2 | 0.92849 | -7.15% | -59.45% to +112.62% |

`frameMeanMs`: session estimates +5.72% and -5.69%; combined session estimate -0.15%, conditional 95% interval -51.68% to +106.36%. The session-level interval includes zero; these runs do not establish a directional overall performance change for this metric. The point estimate changes sign between the reversed sessions.
`rendererThreadMsPerTick`: session estimates -0.89% and -13.01%; combined session estimate -7.15%, conditional 95% interval -59.45% to +112.62%. The session-level interval includes zero; these runs do not establish a directional overall performance change for this metric.

## Order-specific results

Within-session A/A has one quartet per order and no order-specific interval. Within-session A/B has two quartets per order; its log-t intervals are particularly unstable. BAAB/ABBA compares order-group geometric ratios descriptively and is not an independently randomized effect estimate.

| Session | Phase | Order | Quartets | Metric | Geometric B/A | Change | Conditional 95% change interval |
|---|---|---|---:|---|---:|---:|---:|
| cba0 | A/A | ABBA | 1 | frameMeanMs | 1.07635 | +7.63% | unavailable (one quartet) |
| cba0 | A/A | ABBA | 1 | rendererThreadMsPerTick | 1.00692 | +0.69% | unavailable (one quartet) |
| cba0 | A/A | BAAB | 1 | frameMeanMs | 0.96644 | -3.36% | unavailable (one quartet) |
| cba0 | A/A | BAAB | 1 | rendererThreadMsPerTick | 1.00755 | +0.76% | unavailable (one quartet) |
| cba0 | A/B | ABBA | 2 | frameMeanMs | 1.06268 | +6.27% | -43.64% to +100.38% |
| cba0 | A/B | ABBA | 2 | rendererThreadMsPerTick | 1.02023 | +2.02% | -24.91% to +38.61% |
| cba0 | A/B | BAAB | 2 | frameMeanMs | 1.05184 | +5.18% | -9.63% to +22.43% |
| cba0 | A/B | BAAB | 2 | rendererThreadMsPerTick | 0.96271 | -3.73% | -7.29% to -0.04% |
| cbb0 | A/A | ABBA | 1 | frameMeanMs | 1.10044 | +10.04% | unavailable (one quartet) |
| cbb0 | A/A | ABBA | 1 | rendererThreadMsPerTick | 0.99690 | -0.31% | unavailable (one quartet) |
| cbb0 | A/A | BAAB | 1 | frameMeanMs | 1.05320 | +5.32% | unavailable (one quartet) |
| cbb0 | A/A | BAAB | 1 | rendererThreadMsPerTick | 1.10966 | +10.97% | unavailable (one quartet) |
| cbb0 | A/B | ABBA | 2 | frameMeanMs | 0.93209 | -6.79% | -12.99% to -0.15% |
| cbb0 | A/B | ABBA | 2 | rendererThreadMsPerTick | 0.83823 | -16.18% | -19.96% to -12.22% |
| cbb0 | A/B | BAAB | 2 | frameMeanMs | 0.95421 | -4.58% | -61.27% to +135.08% |
| cbb0 | A/B | BAAB | 2 | rendererThreadMsPerTick | 0.90272 | -9.73% | -31.24% to +18.52% |

| Session | Phase | Metric | BAAB / ABBA | Descriptive change |
|---|---|---|---:|---:|
| cba0 | A/A | frameMeanMs | 0.89789 | -10.21% |
| cba0 | A/A | rendererThreadMsPerTick | 1.00062 | +0.06% |
| cba0 | A/B | frameMeanMs | 0.98980 | -1.02% |
| cba0 | A/B | rendererThreadMsPerTick | 0.94362 | -5.64% |
| cbb0 | A/A | frameMeanMs | 0.95707 | -4.29% |
| cbb0 | A/A | rendererThreadMsPerTick | 1.11311 | +11.31% |
| cbb0 | A/B | frameMeanMs | 1.02374 | +2.37% |
| cbb0 | A/B | rendererThreadMsPerTick | 1.07693 | +7.69% |

A/A timing is assessed separately from exact state parity. Same-build asymmetry, order sensitivity and between-session variation limit causal interpretation. No numerical noise acceptance threshold was predeclared, and no noise-corrected A/B effect is asserted. The earlier cf0 control was noisy; its 900-frame timings and the 30-frame smoke are not pooled into these 300-frame results.

## All measured quartets

| Session | Phase | Round | Order | Frame A/B ms | Frame change | Thread A/B ms/tick | Thread change |
|---|---|---:|---|---:|---:|---:|---:|
| cba0 | A/A | 0 | ABBA | 15.484/16.666 | +7.63% | 10.356/10.427 | +0.69% |
| cba0 | A/A | 1 | BAAB | 16.598/16.041 | -3.36% | 10.059/10.135 | +0.76% |
| cba0 | A/B | 0 | ABBA | 15.548/15.718 | +1.09% | 11.055/11.010 | -0.41% |
| cba0 | A/B | 1 | BAAB | 16.365/17.009 | +3.93% | 11.519/11.057 | -4.01% |
| cba0 | A/B | 2 | ABBA | 15.189/16.967 | +11.71% | 10.877/11.368 | +4.51% |
| cba0 | A/B | 3 | BAAB | 14.914/15.876 | +6.45% | 10.506/10.145 | -3.44% |
| cbb0 | A/A | 0 | BAAB | 16.545/17.425 | +5.32% | 10.894/12.089 | +10.97% |
| cbb0 | A/A | 1 | ABBA | 15.979/17.584 | +10.04% | 10.430/10.398 | -0.31% |
| cbb0 | A/B | 0 | BAAB | 16.839/14.967 | -11.12% | 11.417/10.530 | -7.77% |
| cbb0 | A/B | 1 | ABBA | 16.672/15.456 | -7.29% | 12.515/10.529 | -15.87% |
| cbb0 | A/B | 2 | BAAB | 17.086/17.503 | +2.44% | 12.307/10.874 | -11.64% |
| cbb0 | A/B | 3 | ABBA | 17.884/16.760 | -6.28% | 12.024/10.043 | -16.48% |

## Heap and cgroup observations

Every window is retained, including all throttled windows. Heap deltas are after minus before; snapshots do not identify individual GC events, allocation counts or timing causality. Cgroup counters cover all processes and software-GPU work in the cgroup, not just the active game.

| Session | Phase · side | Heap used before→after mean MiB | Heap delta mean [min,max] MiB | Negative deltas | Throttled windows / periods / ms |
|---|---|---:|---:|---:|---:|
| cba0 | A/A · A | 206.61→211.92 | 5.31 [-6.43,23.99] | 1 | 1 / 1 / 1.463 |
| cba0 | A/A · B | 193.85→208.16 | 14.31 [2.69,27.47] | 0 | 2 / 3 / 4.282 |
| cba0 | A/B · A | 195.55→202.48 | 6.94 [-3.47,30.87] | 3 | 4 / 9 / 17.242 |
| cba0 | A/B · B | 185.57→192.69 | 7.12 [-5.08,30.30] | 3 | 2 / 2 / 1.187 |
| cbb0 | A/A · A | 179.09→188.20 | 9.11 [-0.29,32.29] | 1 | 0 / 0 / 0.000 |
| cbb0 | A/A · B | 191.51→203.45 | 11.94 [-1.67,27.92] | 1 | 1 / 2 / 2.349 |
| cbb0 | A/B · A | 217.46→218.15 | 0.69 [-10.75,32.43] | 5 | 5 / 17 / 1281.048 |
| cbb0 | A/B · B | 193.23→205.71 | 12.49 [-16.48,27.75] | 3 | 2 / 4 / 7.059 |

The second session’s A/B cgroup interval totals 21 throttled periods and 1,288.107 ms of throttled time, compared with 11 periods and 18.429 ms in the first session. These observations reinforce the host-interference limitation; they do not by themselves identify the cause of the performance differences. No throttling-based exclusion or correction was applied.

## Evidence and validation

- `../cbsm0/report.md`: actual 30-frame smoke, every window and pair, including both ABBA and BAAB.
- `../cba0/report.md` and `../cbb0/report.md`: every full-run warmup/window, exact score/paint/BVH pair, per-window and order-specific timing, heap and cgroup summaries.
- Each directory retains `result.json`, `analysis.json`, `run.log`, `process.json`, `exit.json`, fixed harness copies and byte receipts. `plan.json` fixes inputs, hashes, schedules and interpretation limits before execution.

- smoke: result SHA-256 `e58a50821ccf79a82fb283015c28cd9810a8f7e7511b8c00cf28fab619c9ade7`; 20 windows, 10 exact pairs.
- ab: result SHA-256 `bafbe42316e28bbc6b8358d17e478b328996ecc2eaec78b89fbb542bffec6193`; 44 windows, 22 exact pairs.
- ba: result SHA-256 `13f2d254ec28e664e64e938cfca8b25edb15d6cea37d90e5541e5334fbb1392b`; 44 windows, 22 exact pairs.

All private source-bound Git LFS SHA-256/size records, public/private HTTP receipts, nine frozen harness hashes, full actor/source-character admission, all observed before/after thread affinities, constant GPU PID per session, state/gameplay digests, final paint counts, existing live-HUD cache/transport, draw/resource/scene/budget/pose counters, exact BVH work, zero page errors and zero context loss passed saved-file verification. Private assets admitted on disk but not requested by HTTP are listed in each report. No BVH reduction or failed-sample removal was allowed.

## Interpretation limits

This is a fixed-step host experiment with native geometry and software GPU paint work, with scene submissions excluded. It is not device FPS, presented FPS, full-rendering performance, a hardware GPU measurement or a Splatoon 3 hardware comparison. Per-frame wall excludes later observers; renderer ThreadTime includes digest/counter/CDP observer work. GPU drain and endpoint score observation occur outside both timing metrics, although small observer allocations can affect later heap history. Exact recorded endpoint/cache parity does not prove all intermediate HUD values, all pixels/audio/private state, finish/judge/winner behavior, or external-device behavior. Heap snapshots do not identify GC events, leak absence or timing causality. Fixed run sequence, small sample size, persistent page effects and host drift remain material limitations.
