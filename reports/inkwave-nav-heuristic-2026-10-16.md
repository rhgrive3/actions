# A* heuristic reuse (2026-10-16)

Baseline: main `9c0703298aed297667837533c32454cc60980603`. This is separate from the existing model, texture-readback, source-motion FK and paint-distance PRs.

The production composition already reuses the A* heap. This change additionally reuses each node's distance-to-goal heuristic within one synchronous search. Each search still calculates the original `Math.hypot(dx, dz) + abs(dy) * 0.5`, retaining Float64 precision. Existing visit stamps invalidate the cached value when the goal/search changes. The Float32 path costs, queue ordering, iteration limit, native edge filtering and chosen routes stay unchanged.

Storage is one reusable Float64Array per graph: 8 bytes per node, or 8 KiB for the browser's 1,024-node workload. It is replaced when graph size changes and is released with the graph; there is no cross-match/global cache. This trades a small bounded buffer for fewer distance calculations, rather than claiming a memory reduction.

## Verification

- Source and actual minified output: 800 path queries per run. Full paths, Float32 costs, predecessors, visit/closed stamps, remaining queue priorities and native filter call order match the SHA-256-pinned pre-change implementation. Includes unreachable goals, equal-priority paths, both teams, low iteration limits, changed goals, thrown filters and resized graphs.
- The actual block and native triangle graph builders each generated 400-node graphs. In 100-query comparisons, heuristic calls fell from 10,041 to 7,706 (23.3%) and 8,523 to 6,760 (20.7%). A 600-query layered/adversarial graph fell from 67,603 to 50,792 (24.9%).
- Headless Chromium 154 loaded the actual minified production NavGraph and its native dependency graph. For 256 queries on a synthetic 1,024-node obstacle graph, paths and full search state matched; heuristic calls fell from 84,329 to 60,509 (28.2%).
- The browser receipt retains all 12 samples per variant, alternating ABBA/BAAB after four warm rounds. On the final small-PR integration, median batch time was 9.65 ms before and 9.4 ms after. A prior concurrently loaded run measured 26.85/20.8 ms. This variation prevents a reliable timing-speedup claim; the deterministic reduction in calculation count is the result established here. These are local component timings, not full-game or device/FPS evidence.
- Reproduce: `node --experimental-vm-modules --test patches/local-quality/tests/nav-heuristic.test.mjs`; repeat with `INKWAVE_BUILT_SITE` pointing to the real production build. Run `scripts/benchmark-inkwave-nav-heuristic.mjs SITE OUTPUT.json` with Playwright and Chromium configured for browser evidence.

This does not establish that device crashes are fixed. Physical-phone CPU, memory/context-loss traces and whole-game frame timing remain separate validation work.
