# #845 controlled native Character CPU comparison

This is a scoped CPU observation on source `99036023f4ee40a0584aec0b7ed29f18191a6bd2`, not complete issue acceptance. The public source tree was `03b5cdc3a4ddb3810ca84be89368748f6d38b0b4`. Node v24.19.0 on the shared Linux host ran the production-composed Actor/Character with the actual awaited Player00 motion bank and a flat two-triangle `NativePhysics` floor. Three identically initialized offline Shooter bots were stepped through `Actor._finishFrame`; this is not a full Match, browser render, or device trace.

After 240 full-rate warmup ticks, each bot ran 18 blocks of 120 ticks at 60 Hz. Two controls had their last-drawn frame kept current; the other had passed the 30-frame grace period and used the long-undrawn budget. The six permutations of the three block orders were each repeated three times. Each block resets the global simulation time and renderer-frame counter to the same values for each bot, then advances them equally. Every bot had active source motion and grounded source state; all 2,160 treatment ticks entered the budget. Instrumentation counts included `_ground`, `_buildPose`, `_applyPose`, source root-hair integration and accessories. Counts and per-block timing samples, including outliers, are retained in [current-samples.json.gz](issue845-cpu/current-samples.json.gz).

| Per 120-tick block | Control A | Budget | Control B |
| --- | ---: | ---: | ---: |
| Mean process user + system CPU | 93.590 ms | 53.373 ms | 88.072 ms |
| Mean elapsed wall time | 87.375 ms | 49.462 ms | 78.068 ms |
| Process CPU range | 71.674–222.093 ms | 42.476–75.775 ms | 71.856–122.756 ms |
| Total `_ground` calls across 18 blocks | 16,290 | 13,338 | 16,290 |
| Total source root-hair updates | 2,160 | 0 | 2,160 |
| Total source accessory passes | 2,160 | 0 | 2,160 |

The budget averaged 41.2% less process CPU than the pooled control means in this fixture; it was below each control in all 18 blocks. The reported CPU interval includes the whole instrumented `Actor._finishFrame`, fixture wrappers and process background threads, rather than isolating Character self time. The 222.082 ms control-A wall outlier is retained, as are all samples and both controls; the measurement is not a whole-game or steady-frame speedup. Pose and apply still ran 120 times per block in all cases, and maximum control/treatment muzzle difference at the end of each block was zero. This is not a complete gameplay, re-entry or rendering parity test.

The source triangle floor still required 13,338 treatment `_ground` calls, so the original universal no-ground-queries criterion remains unmet. A live camera-away 4v4 comparison, return-to-view rendering and the issue's device trace are not established by these samples. The existing behavior report's older browser observation contains a favorable paired microbenchmark and an adverse dynamic live-match timing; neither is replaced by this controlled result.

An earlier exploratory run is preserved in [exploratory-samples.json.gz](issue845-cpu/exploratory-samples.json.gz). Its three bots advanced global time sequentially, so it is excluded from the controlled comparison above. The final harness corrects that setup by resetting global time and frame per block. Run from a clean checkout of the tested source with Node supporting VM modules:

```sh
mkdir -p .ci-scratch/continuation-browser
node --experimental-vm-modules reports/issue-resolution-20261029/issue845-cpu.mjs
```

The harness writes `.ci-scratch/continuation-browser/845-timing-result.json` and includes the measured source SHA and relevant file hashes. A rerun on a later source must be identified as such. SHA-256: harness `1be2232f905613097088d77d2f0f953f0b6f34ade078991ed51c8027a651be9c`; current samples `e76204d0815e2fd4b8ef7f38da8744510c18d19d1e49ce28b758c2ff9011cdf6`; exploratory samples `a03f5d0c2ad926001f7c6bc3a29d574ecddce919f7479e3e26938a6715cbfcee`.
