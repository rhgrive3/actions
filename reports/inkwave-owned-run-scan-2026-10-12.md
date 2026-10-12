# Exact owned-rectangle scan candidate

Base: adopted main ae21924c59046cc0fe81922322ac093418113586. Only the CPU scan of a row's ownership IDs changes: skip non-owned cells, then traverse each owned run. Rectangle clipping arithmetic, rectangle sequence, number of quads, shader inputs, event ownership, timing, score and wire are preserved. No cache or additional retained memory is introduced. This is independent of unadopted rectangle coalescing #1254 and codec #1245.

The immutable previous implementation is the existing paint-piece-ownership baseline fixture. Source regression compares 1,200 deterministic grids (empty/full/checker/random, fractional cell sizes and padded edges) at three order IDs, using raw Float64 bytes for rectangle sequence equality. The actual composed runtime repeats 160 grids at three orders. Source 2/2 and actual production-built scan/hidden/temporal suite17/17 pass. Build dbf3ed28669a377308e2dcbb218f73021a2f5832f69bebae6838923f84b9b7e0.

A reproducible isolated Node AB/BA benchmark in scripts/measure-owned-run-scan.mjs measures 15,000 scans per sample, after warmup: old203.52–208.29ms, candidate87.40–88.36ms (three each). This is a component microbenchmark, not an observed whole-game speedup. The older d1ad48 real SwiftShader workload had paintAdvance3579.9–3817.7ms/4s and nested cpuGrowth2764.6–2926.4ms/4s; these nested metrics must not be added or presented as this candidate's result.

The new browser oracle compares all ordered native quad arguments, counts, exact CPU grid/order/turf and every RGBA byte against the old scan for six floor/wall/shot/line/roller cases. Both Chromium and WebKit are mandatory. Real browser, exact-head CI and current-main fixed AB remain pending. The #1254 tolerance is not relaxed or reused to accept differences.

## Fixed ae219 → 338438 real-browser evidence

Both Chromium/WebKit source+built GPU oracles pass all24cases, exact ordered quad inputs/counts and all RGBA bytes (artifact11721536211). Detailed-instrumentation12runAB38189824680 confirms ownerScan reduction but has a1Actor workload regression: total929–980→979–1044ms/4s;8Actor results overlap. This unfavorable result is retained (artifacts11721591817/11721701162).

The same fixed revisions were repeated with per-method timers and per-quad wrappers disabled equally, retaining outer step/gl.finish and draw-time invariant counters. Twelve-runAB38190937489:1Actor p505.4–5.8→4.8–5.1ms,p959.0–9.4→8.3–8.9;8Actor p5022.5–24.3→18.6–19.6,p9536.7–37.8→30.6–31.1. Total1Actor1220–1328→1081–1218ms/4s;8Actor5146–5428→4186–4454. Allgrid/canvas/quad/draw/event counts match;GCheap+backing differs by at most~8.5KB. Artifacts11720978720/11720809140. These are controlled SwiftShader paint-workload results;JIT/measurement sensitivity is not a proved cause, and full-gameFPS is not established.

The old338438CI has one existing UI rematch cursor failure (opacity0/currentTime0/startTime:null,artifact11721672631); it is not reported as allgreen. Its strictGPU and other browser jobs passed. Final candidate now integrates adopted Map main90b4fea706d6018fcf48dc205198f19194fd5886, preserving both Map and scan gates. New exact-headCI and outer-only fixed AB are required; old results do not substitute.
