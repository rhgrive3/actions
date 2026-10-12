# Lossless removal of unreferenced weapon-LOD rows

Independent candidate based on main `80555b8cf12e3a9529c0f461bd2acc3ee17f1764`. This does not include new model shapes, face removal, quantization, threshold changes, or the rejected zero-area PR1273.

## Rule

After source-corner preserving weapon LOD construction and its original bounding-sphere computation, discard attribute rows that no output index references. Keep surviving rows in original order, remap indices in place, retain the original index type and attribute objects/metadata, and preserve the pre-compaction bounds. Nonweapon clustering is unchanged. The rule is shared by every geometry carrying weapon `aMat` and `color`, without weapon-ID exceptions.

## Source checks

All 65 body/ink outputs compare raw indexed attribute bytes, triangle order, index type, bounds, groups, draw range, source immutability and cache identity. Additional fixtures cover empty indices, normalized integer attributes, signed zero/NaN payload bits, metadata, already-dense buffers, and Uint32 promotion after material splits. The default oracle is the exact main805 module (Git blob `aeaed818231b333acc2dae0e164a19115455a4e9`); normal test runs do not require environment variables.

Local results (one immutable geometry set per row):

| Model set | Before compaction | After | Saved | Removed rows |
|---|---:|---:|---:|---:|
| Main805 all65 | 1,425,482 B | 1,415,602 B | 9,880 B | 247 |
| Nine7630 all65 | 1,503,572 B | 1,489,412 B | 14,160 B | 354 |
| Nine7630 + four4afb | 1,520,594 B | 1,504,314 B | 16,280 B | 407 |
| Above + Quad/Explo7d8 | 1,529,146 B | 1,512,146 B | 17,000 B | 425 |

All four compositions passed the same four source tests. Against the pre-boundary LOD on the same nine-model geometry, cached allocation changes from 1,252,612 to 1,489,412 B (+18.9045%), below the existing unchanged 20% guard. The future nine+four composition remains +21.2497% (old 1,240,674 B): its budget is NOT approved by this candidate. These are all65 shared-cache allocations, not simultaneously visible eight-player bytes.

Same-process Node cold-construction ABBA, all65 body+ink: six post-warmup observations per condition, median totals 769.08 ms before / 773.38 ms after (+4.30 ms, +0.56%). Ranges overlap (before 704.84–856.08, after 747.40–804.28 ms). This single local run is not a performance-equivalence proof. Cache identity was verified 100 times per part; full raw per-model timing is retained outside this source report and will also be generated in CI.

## Real browser gate (pending)

Dedicated CI admits only this exact feature branch and builds both fixed main805 and nine7630 compositions. For each composition, it renders all65 × two teams × four static cameras, nine actual Actors × game/far × four cameras, and two eight-Actor rosters covering all nine × game/far. In the same renderer and fixed pose/camera, A/A and A/B compare full raw RGBA SHA-256 with zero tolerance, draw/triangle counts and nonempty captures. Studio PMREM uses valid cube256, Neutral tone mapping. The comparison swaps only finished far-weapon buffers; source geometry, native materials, character pose and culling bounds are held fixed.

Synchronous `readPixels` establishes the image readback boundary. This is a losslessness check, not a GPU benchmark or full world/postprocessing screenshot. Historical `render + gl.finish` values are CPU submission/flush-backpressure measurements and do not establish GPU completion. Current nine-model performance adoption remains a separate review.
