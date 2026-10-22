# Geometry construction experiments (test-only)

`scenery-owned-merge.mjs` and its adapter are the rejected Environment experiment. `geometry-build-fixture.mjs` enables them only with `candidateScenery:true`; production composition never imports them. They preserve geometry but regress warmed merge CPU.

`float64-chunk-runtime.mjs` and its adapter freeze the earlier rejected full-position-chunk prototype. Apply the pair to composed base source to reproduce its exact geometry and additional winding-read cost. The shipped implementation instead retains native JS position/triangle evaluation and streams only the other attributes/indices.

Measurements and provenance are in `reports/library-queue-added-2026-10-22/geometry-measurements.json` and `geometry.md`. Tests use actual composed generators and the actual vendor merge; explicit backing-capacity counts are not process RAM/device measurements.
