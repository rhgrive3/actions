# Additional queue: geometry construction

Base: `8de71b09cd7a3bc05fa4ce06b00f99687beb44ad`. Both assigned notes were read completely. The legacy Level hybrid is implemented locally; the Environment proposal is rejected on measured CPU cost. Original notes and immutable upstream source are preserved. Splatoon 3 reference remains 11.3.0; these changes do not establish retail or device parity.

## Adopted: bounded legacy Level storage

Keep `B.pos` as the original JavaScript double array and keep `tri`'s original indexed reads and subtraction/cross/dot order. Write the other eight attributes and indices to typed chunks using fixed widths. A 3072-element chunk is divisible by all actual write widths (2, 3, 4), so production tuples never straddle a chunk. Each output consumes its source chunks before the next output allocates; The original `Float32BufferAttribute` and `Uint16BufferAttribute`/`Uint32BufferAttribute` subclasses wrap each complete output ArrayBuffer with a view, preserving public constructor/`instanceof` behavior without copying the backing storage. The existing early release of source fields remains. Index width follows the actual vendor rule: maximum index **>=65535** selects Uint32 to preserve primitive restart behavior.

On actual Range geometry (17,658 vertices; 36,861 index values), retained JS numeric buffer slots fall from **478,311 to 52,974 (88.9%)**. Measured typed capacity is **1,757,184 bytes** before final conversion, **2,214,456 bytes** at its tracked peak, and **1,839,522 bytes** final. The remaining JS position array is excluded from these typed-byte figures. Base already released its JS arrays progressively; no comparison assumes otherwise. Actual process RAM, JS-array bytes, GC and browser/device impact remain unmeasured.

The first generic/full-Float64-position writer was not adopted: generic winding lookups cost roughly 1.7–2× build time. Fixed-width pushes reduced that cost, but all five warmed layout medians still increased (Tidewater 28.142→34.152ms). The final hybrid removes the added position/chunk read work.

Final design decision-run warmed Node medians, two warmups then five samples per side with alternating order:

| Layout | Base ms | Hybrid ms | Difference ms |
|---|---:|---:|---:|
| Tidewater | 26.927 | 27.666 | +0.740 |
| Kelpline | 25.215 | 24.815 | -0.400 |
| Cargo | 66.756 | 58.462 | -8.294 |
| Halyard | 18.437 | 18.526 | +0.089 |
| Range | 79.326 | 68.057 | -11.269 |

The sum is 216.662→197.527ms; the observed -8.8% is a shared-host sample, not a speedup claim. Final shipping verification medians were respectively 27.194→22.684, 24.566→23.711, 46.130→44.203, 18.185→17.534 and 80.640→59.272ms. Both complete sample sets are retained in `geometry-measurements.json`; their variation reinforces the measurement limit.

A real generated-box counterexample at X=100,000,000 proves that rounding position to Float32 before `tri` changes indices even when final position bytes match. That unsafe proposal is explicitly rejected. A count pass is not introduced: filters run exactly once and retain original order/side effects.

## Rejected: consuming Environment source attributes

The actual scenery experiment preserves exact position/normal/color/glow/bld bytes, index, bounds, mesh count, instance matrices/colors, materials and ordering. Only fully private city/static/tree source parts were eligible. `terrainParts` stays on the original vendor merge: `_cityIsland.geo` and island records escape. Ineligible formats, morph/interleaved/indexed data or duplicate Geometry references return to the original merge before consuming anything.

Actual city: **1,755 parts / 80,052 vertices / 4,162,704 source attribute bytes**. Attribute-by-attribute source release reduces tracked strongly referenced typed capacity from **8,325,408 to 5,123,328 bytes**, or **104→64 B/vertex** (3,202,080 bytes fewer). Static parts are 450 parts/34,500 vertices, 2,760,000→1,794,000 bytes; trees 3 parts/468 vertices, 37,440→24,336 bytes. This is owned attribute storage, not measured process RAM or GC reclamation.

However, warm actual-city clones with rotated execution order, two warmups and six samples produced vendor **4.048ms**, deleting-source **7.613ms**, and stable-shape null-source **5.827ms** medians. Null assignment improves the deletion variant but remains **+1.779ms / +43.9%** above the vendor. Confirmation medians were vendor 2.939ms, delete 7.774ms and null 7.244ms. Whole-scene single samples vary by run (all retained in measurements); neither method demonstrates CPU nonregression. No further method trial is undertaken.

The Environment helper/adapter is therefore under `tests/fixtures/geometry-storage/` only. Production has no Environment rewrite or runtime import of that candidate. Exact production composed Environment output equals the base: SHA256 `87afc8d716b274219a9d38fc93a01ecad0f2b69f7847204ac6264169768fd97f`.

## Validation and limits

`flock /workspace/scratch/1dcd5205fbb6/added-heavy-tests.lock node --experimental-vm-modules --test --test-concurrency=1 patches/local-quality/tests/geometry-build-storage.test.mjs patches/local-quality/tests/runtime-frame-scratch.test.mjs patches/local-quality/tests/collision-hotpath.test.mjs scripts/tests/inkwave-three-composition.test.mjs scripts/tests/inkwave-direct-source-ownership.test.mjs`

**36 passed, 0 failed, 1 skipped**. The skipped control requires a configured full-site build; parent owns combined emitted-site/browser validation. The geometry cases compare 5 legacy layouts × 4 filters × 2 paint/light atlas states byte-for-byte, vendor index boundaries (65534/65535/65536), production native override identity, actual full scenery, resource fallback and precision counterexamples. Existing index-source expectation was updated to require the exact new typed threshold; behavioral assertions were retained.

`node scripts/check-inkwave-patches.mjs --quick`: passed (immutable upstream compatible, reference 11.3.0). `git diff --check`: passed. Device Safari/Chrome, GPU/visual captures, process peak RAM, GC, offline/reload and full native-stage render validation remain unmeasured here. No admission, protocol, gameplay numeric, source-integrity or CI guard changed. Independent cold-start Issue #1767 stays open and untouched.

Public-attribute follow-up: actual vendor constructors all call `super(new TypedArray(array), ...)`. Passing the offset-zero, exact-size output `.buffer` preserves the original subclass while sharing the same backing. After this correction, **5 focused tests passed, 0 failed, 0 skipped**, rechecking all 40 layout/filter/atlas combinations plus `constructor.name`, each realm's `instanceof`, normalized/gpuType, complete buffer/zero offset, buffer identity, vendor index thresholds, build-only composition and bundled vendor behavior. The full 36/0/1 run above preceded this narrow correction; the other unchanged cases were not repeated.
