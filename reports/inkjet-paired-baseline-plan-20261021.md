# Inkjet paired baseline diagnostic proposal

Status: saved diagnostic candidate only. Not executed. Does not change PR1744's fixed 9c4ca8e head or add CI jobs.

## Exact comparison
- A: pre-Inkjet main c72dd6da46f53f3ea931e0263885685172bb12e9.
- B: candidate 9c4ca8e60699ce786a96b351fdfc4c7ab3750fa1.
- Their only production runtime changes are special-vfx.mjs and the candidate's two Inkjet helper imports. Other game/build inputs are shared.
- scripts/prepare-inkjet-baseline.mjs compiles only A's special-vfx.mjs using the production adaptBuildSource -> esbuild 0.28.2 transform (esm/minify/utf8/legalComments:inline) -> compactModuleStrings pipeline. It first recompiles B and requires exact byte hash equality with the already-built emitted B module. All original manifest artifact hashes are checked. Failure stops the comparison; do not weaken the hash requirement.
- No second site build, production mutation, or false baseline manifest. A is an explicit diagnostic overlay whose source commit/hash and emitted hash are separate from the immutable candidate build identity. All other requests serve the same verified emitted files. Both helper modules remain available but are not imported by A.

## Browser orchestration to implement next
Use one existing CI Chromium/SwiftShader installation and one server. For each run, create a fresh browser context/page and reload the complete module graph; never reuse VFX module state between A/B runs. Serve the pinned overlay only for A's exact special-vfx module path, without changing import specifiers. Assert served hashes for A/B and common modules.

Per case use A-B-B-A blocks, at least three complete blocks (12 observations), not a single favorable pair. Start with one 60 Hz / one-actor near pilot block to validate the route and artifacts before scheduling the full matrix. Keep the exact order and raw samples; do not repeat only slow or failing variants. Alternating block order B-A-A-B can be added to diagnose startup/thermal/order bias.

Full matrix: 30/60/120 simulated Hz x 1/2/4 actors x near/mixed (one additional out-of-range flight-only owner). All runs use identical initial actor positions, camera [12,10,15], viewport 960x720, quality .35, source/model readiness, fixed dt, VFX module initial seed 0x9e3779b9, Math.random LCG initial seed 0x12345678, and identical stationary projectile records. First one second drains activation; extend warm-up to at least two seconds for timing comparison, then sample at least three seconds. Warm-up/sample lengths must be identical between A/B. Record actual random call divergence rather than reseeding per frame; the change in emission recipe naturally changes later VFX random consumption.

Do not apply candidate assertions to A: A intentionally emits 2*Hz exhaust glows per actor/second, whereas B emits 2*min(Hz,60). Candidate no-eviction and fairness assertions remain strict. For both, require valid specialActive/Inkjet tracks, each expected actor's exhaust, nonempty PNGs in every case, 12 consecutive 60 Hz frames, exact viewport, no pageerror/console error/swallowed director error and no lost WebGL context. Flight-only scenes must fail the exhaust assertions.

## Measurements and interpretation
- Preserve per-frame FX-update CPU, render-submission CPU, controlled-loop wall time, draw calls, triangles, sprite births/occupancy/evictions and per-actor admissions.
- Time neither PNG encoding nor readPixels inside measured frames. Keep evidence capture in a separate identically seeded pass.
- Separately record GPU-completion-inclusive wall time using a fixed completion method in both A/B if needed; gl.finish perturbs scheduling and is not GPU timer data.
- Record WebGL timer query availability/disjoint results. SwiftShader is software rendering, never hardware GPU performance. If unavailable, GPU timing stays null. JS heap snapshots/deltas are not allocation rates; without trustworthy instrumentation allocation rate stays null.
- Report every observation and per-case median/p95/max, paired ratios and dispersion. Use block-level paired ratios, not pooled frame samples treated as independent. With only three blocks, uncertainty is large: overlapping/noisy results are inconclusive, not a pass. Increase paired blocks only where needed, symmetrically.
- A provisional 3% comparison line may be shown as a diagnostic reference, not as a user-agreed exact threshold. A claimed few-percent acceptance requires an agreed threshold and a conservative uncertainty bound below it for every required case, with no hidden low-FPS or four-player regression.
- This frozen-gameplay continuous-presentation probe is not whole-game frame time. It can isolate FX cost and show changed rendering burden, but full-engine before/after frame CPU, hardware GPU and allocation acceptance still requires the actual game loop on an appropriate renderer.
- Low-cap fair admission can raise total births 10.9%/12.2% relative to the rejected first-come candidate while holding peak occupancy. Preserve that risk and the mixed-distance unused-quota cost in results. Those percentages are not comparisons against old main and are not CPU measurements.

## Required negative checks before CI expansion
Wrong baseline ref, altered shared production input, mismatched emitted candidate compilation, tampered served overlay, missing actor activation, missing exhaust producer, empty/missing PNG, missing/partial ABBA block and WebGL errors must stop or invalidate the comparison. Keep the original Splashdown default lifecycle checks unchanged.

## Current blocker / next step
The preparation script is syntactically checked in pure V8 only; esbuild/Node/filesystem execution is pending because the workspace cannot start under ENOSPC. Current PR1744 CI is still responsible for candidate-only source/emitted/browser acceptance. Do not present this proposal as measured before/after results or retail S3 visual matching.
