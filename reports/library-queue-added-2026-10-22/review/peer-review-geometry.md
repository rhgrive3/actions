# Read-only peer review: geometry2

Reviewed the final shipping diff in `wt-added-geometry` against base `8de71b09cd7a3bc05fa4ce06b00f99687beb44ad`, coordinating directly with `final_catalog_merge`. This review changed no production code and did not rerun a broad suite. Final reviewed commit is `de4e7d59a4f805bcc9f3a90b7d63739b7b74f14f` (parent `4ec3f4bf`).

Conclusion: **support the bounded Level hybrid; support rejecting the Environment candidate. No remaining concrete geometry/ownership defect was found in the final shipping diff.** This recommendation is not a claim of device RAM/GC improvement or universal CPU nonregression.

## Final scope and correctness

Shipping Level uses native `pos: []` and unchanged native triangle-position/winding reads. Eight other attributes and indices use fixed-width typed chunks; final attribute/index arrays are adopted without another TypedArray copy. Chunk capacity 3072 divides every production tuple width (2/3/4), so tuples never straddle a chunk. Index maximum retains the pinned vendor `>=65535` Uint32 threshold. Root identified that generic BufferAttribute changed the public subclass; the final follow-up now wraps each exact-sized, zero-offset finished backing buffer with the original Float32BufferAttribute or Uint16/Uint32BufferAttribute constructor. This preserves constructor/instanceof, normalized and gpuType without copying the backing data. I independently checked these real-Three API observations after the correction. Float32 conversion timing for the other eight attributes is safe because native generation does not read those staging arrays back; the exact generated outputs are independently compared by the source-level tests. Native position precision remains unchanged. This avoids the demonstrated unsafe early-Float32 winding change and the measured Float64 chunk-read CPU penalty.

The existing per-attribute early-release transform is preserved. Chunk storage is released during each finish; returned geometries own independent final attributes. Vertex/index order, triangle winding, filter call count/order, normal/color/UV/light/face attributes, groups, bounds and native-stage override remain covered. No count prepass or repeated caller filter was introduced.

Environment `all`/`staticParts`/`treeParts` consuming merge is **not shipping**. The final production adapter is identity on `src/world/environment.js`; its runtime helper has no scenery consumer. Candidate source/bridge are under `tests/fixtures/geometry-storage/` only. Thus `_cityIsland.geo` and other escaping island geometry, native merge fallback and all scenery ownership remain unchanged in production. During candidate review, city/static/tree source parts were independently owned and terrain was deliberately excluded; unsupported formats/duplicate geometry preflight went to vendor before consuming input. These correctness checks did not override the CPU rejection.

## Performance decision

The earlier full typed/Float64-position candidate had all five warmed medians worse: Tidewater +21.4%, Kelpline +7.2%, Cargo +1.1%, Halyard +6.7%, Range +1.9%; sum about +5.6%. I explicitly raised this as insufficient adoption evidence. Removing JS numeric slots alone did not prove actual process RAM or GC benefit, particularly because base already releases attributes progressively.

The final hybrid removes **478,311→52,974 staging JS numeric elements (88.9%)** on Range while keeping native position staging. This is a structural count, not measured JS bytes. Its typed-only peak is **2,214,456 bytes**, final geometry **1,839,522 bytes**; the retained JS position array is additional and is not hidden inside that typed-only number.

One alternating-order warmed comparison (two warmups, five samples per version) gave:

| Layout | Old median ms | Hybrid median ms |
| --- | ---: | ---: |
| Tidewater | 26.927 | 27.666 |
| Kelpline | 25.215 | 24.815 |
| Cargo | 66.756 | 58.462 |
| Halyard | 18.437 | 18.526 |
| Range | 79.326 | 68.057 |

Median sum 216.662→197.527ms (-8.8%) supports this smaller implementation. Tidewater +0.740ms and Halyard +0.089ms are disclosed; no per-map nonregression claim follows. The final shipping validation rerun produced lower hybrid medians on all five layouts, illustrating the host timing variance rather than establishing an exact speedup. There is no physical iPad/Safari measurement. Those warmed CPU samples preceded the final public-subclass follow-up; they support choosing the hybrid storage layout over the abandoned Float64 path, not a precise speedup claim for the final byte-identical SHA.

Environment has a real source-attribute backing-capacity reduction for the actual 1755-part/80052-vertex city: **8,325,408→5,123,328 bytes**, 104→64 bytes/vertex. This is live strongly referenced TypedArray capacity, not process RAM or immediate GC reclamation. However its independent warmed rotation comparison gave vendor/delete/null medians **4.05/7.61/5.83ms** (null +44%). The shipping-validation rerun again regressed: **2.94/7.77/7.24ms**. Its own CPU nonregression acceptance condition was not met. Keeping the candidate test-only and rejecting it is evidence-based; lower memory capacity does not justify presenting a slower merge as a successful optimization.

## Verification reviewed/executed

Reviewed `added-geometry-shipping-validation.log`: **36 passed, 0 failed, 1 skipped**. The skip is the existing emitted-site-only Three UUID test, left for root's combined build. Seven geometry tests include actual-composed 5 layouts × solid/grate/all/none × atlas off/on (40 cases), byte-exact nine attributes/index/winding/bounds, native stage override, vendor index boundaries, private scenery candidate ownership/output, unsafe Float32 negative control, typed-capacity release and warmed timings. Existing collision/frame-scratch/direct-source/vendor gates also pass. Source inspection confirms the legacy textual index assertion was updated to the exact typed adoption threshold while the actual vendor boundary comparison remains.

After root’s public-subclass finding, also reviewed `added-geometry-public-attribute-parity.log`: **5 passed, 0 failed/skipped** over the final subclass bridge, full 40-case geometry comparison and relevant native/vendor gates. These assert public class names and realm-local instanceof, metadata, backing identity and vendor index thresholds.

Independently executed lightweight assertion scripts over the final runtime/adapter: Environment source transform identity; native JS position staging; all nine fixed-width streams over 4000 tuples/chunk boundaries with exact typed results; released chunk/current references; and actual Three Float32/Uint16/Uint32 subclass identity, shared exact backing buffer/zero offset/full length, normalized and gpuType. Passed. No broad or repeated full suite was run by this reviewer.

Evidence: `added-geometry-hybrid-final-comparison.log`, `added-geometry-shipping-validation.log`, `added-geometry-environment-preserved.log` in the shared task directory. Root still owns emitted build/browser integration. Offline 20-stage cycles, screenshots, actual device peak RAM/GC/long tasks and GPU context loss remain unmeasured; this report does not convert focused CPU/source checks into those claims.

Closing receipt: **approved bounded Level hybrid / rejected Environment candidate**, final `de4e7d59a4f805bcc9f3a90b7d63739b7b74f14f`; reviewed shipping production files are `patches/local-quality/geometry-build-storage.mjs`, `geometry-build-storage-adapter.mjs`, their exact composition/identity/build-only wiring, and the associated source-level fixtures/tests.
