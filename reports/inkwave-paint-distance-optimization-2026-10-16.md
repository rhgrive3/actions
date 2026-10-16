# Avoid unnecessary paint-mask distance calculations

Base: `722c2c4783d9d603975718024a08d4bb178c8db7`.

`distance-hotpath-adapter.mjs` adds conservative squared-distance bounds to the existing CPU paint-cell loop. Cells clearly outside the existing radius limit are rejected early. Clearly interior cells bypass the unused distance calculation. The original scaled `Math.hypot`, circular limit and organic-outline tests remain for the uncertain boundary band. Bounds include a relative `1e-12` rounding margin. The negated inner comparison deliberately preserves the original NaN fallback. Roller shape evaluation, cell traversal order, native dead masks, temporal ownership, score accounting and dirty-map notifications retain their existing logic.

The transformer runs only during the build and is included in build identity. It adds no runtime dependency, cache, allocations, quality reduction or simulation-rate change. `inkwave-public/` remains byte-for-byte unchanged.

## Verification

| Check | Result |
| --- | --- |
| Real production-composed PaintSystem on block and converted triangle levels | 6,000 overlapping splats across all ten kinds; identical ownership bytes, claimed area, team counts, versions, temporal acceptance and dirty-cell callback order |
| Grid equality | 62 full-grid comparisons; 375 splats changed live turf |
| Distance calls in the same workload | 1,182,903 → 368,967 (−68.81%) |
| Boundary/extreme controls | 604 cases, including fractional/threshold radii, adjacent floating-point values, stretching, huge/infinite radii and NaN intermediates; explicit controls confirm original hypot still runs on the circle boundary |
| New regression suite | 3 passed, zero failures/skips |
| Related source regressions | 51 passed: paint hotpath, bot observations, network source footprints, temporal ownership, blaster floors, owned runs, raw credit and piece ownership/probe-level controls |
| Actual Chromium / software WebGL, composed source and minified output | Equal receipts for 124 mask cases, 1,512 hash queries and 15,295 cells; 4,261 counterfactual unsupported samples retained |
| Existing actual-shader body gate | 242 cases; zero CPU-only/GPU-only non-tie mismatches. Its unchanged float32 zero-crossing tolerance records nine boundary ties (80,621 CPU / 80,612 GPU cells) |

Final build content hash: `abf8a9696943bf2d47e00f5af6ad0596d70259a56c3bb94b13e59a8e2ba4da45`.

## CPU measurement

See `inkwave-paint-distance-benchmark-2026-10-16.json`. Node v24.19.0 / AMD EPYC 9V74, real CPU paint methods and Level metadata, mixed organic and sourced-circle splats, 1,200 splats per window, six windows per version in repeated ABBA order after warmup. Final grids and team counts match after timing. Process CPU median: **1,068.965 → 902.363 ms (−15.59%)**. Wall median: **1,069.021 → 902.456 ms (−15.58%)**. Earlier runs also improved, with a smaller approximately 9% difference. Timing magnitude depends on the workload and environment; these are isolated mask costs, not total-game or device FPS.

Reproduce:

```sh
node --experimental-vm-modules --test patches/local-quality/tests/distance-hotpath.test.mjs
node --experimental-vm-modules scripts/benchmark-inkwave-distance-hotpath.mjs
```

The existing `scripts/check-inkwave-paint-mask.mjs` validates the actual shader and both composed/emitted masks. Emitted packaging/paint-order tests additionally bind the generated output to committed inputs.

Two investigated alternatives were rejected: row-invariant hoisting in `regionStats` did not show sufficient benefit; bot separation/perception changes reduced hypot calls but did not consistently reduce CPU time (last CPU median 43.8885 → 43.999 ms). No bot runtime changes are included.

## Splatoon 3 comparison boundary

No gameplay values or outcomes change: footprint shape/size, ownership, score, timing, movement/swimming eligibility, walls and firing inputs keep their existing results. No Nintendo executable version, weapon/gear calibration or device parity is newly asserted. The unverified comparisons in `inkwave-splatoon3-behavior-2026-10-02.md` remain unverified. CPU fixtures and browser shader tests above are separate from console/real-device comparisons.
