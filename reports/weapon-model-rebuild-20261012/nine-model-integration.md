# Original nine circled weapons: final integration candidate

## Scope and immutable inputs

The three Splatanas, three Stringers and three Brellas are the reviewed PR1271 / PR1272 models, previously combined at `77d70411995fb1cb52ece10e829ee1ac6412e3f9` and verified on main5ed at `7630c58a3a8dedf4e3bf79c48c2dd7583b457db2`. This reconciliation changes no model shapes. LACT keeps the reduced .132 central collar and both animated diagonal ties. The Brella paid-preparation, guard-facing and real network corrections remain included. Undercover is a non-selected regression control.

The new canonical main input is `ed3a046574208471c5db5309e2469d263cacfdfd`, including main805 source-corner LOD preservation, mainb4dc touch-button centering and the native-stage selection/build composition. All seven feature production files retain their reviewed7630 bytes. The LOD implementation is the **uncompacted** main805 file, Git blob `aeaed818231b333acc2dae0e164a19115455a4e9`. Rejected zero-area PR1273 and unadopted compaction PR1298 are excluded. Other weapon/glass/spread candidates are excluded.

The 805 and b4dc deltas were SHA-verified. All 52 text files in b4dc-to-ed3 (1,209,159 bytes) were fetched and Git-blob verified; the eight modified files matched the exact b4dc base before overlay. None overlaps the seven feature production paths. The canonical remote main tree preserves binary assets and report files, including items not duplicated locally. Both browser A/B builds use this same immutable latest-main composition; stage/render changes cannot appear only on one side.

## Two different allocation contracts

The original `<20%` guard was introduced to bound the **LOD algorithm's** all-catalog cached allocation cost. A changing model catalog also changes that ratio's denominator, so it is not a useful independent model-complexity budget. Its numerical threshold is unchanged:

1. **Fixed algorithm inputs:** all65 models from immutable main805 are reconstructed by a test-only source fixture and passed through the original pre-boundary implementation and current LOD implementation. The original global `<oldBytes * 1.20` assertion remains. Ordinary no-environment-variable test invocation runs this check.
2. **Current catalog correctness:** a separate mandatory all65 sweep still checks triangle count/order and indexed positions, normal/tint/animation attributes, authored material/color boundaries, source immutability, cache identity and the existing per-model `<2x` allocation bound. Existing near-model `<=16000` triangle and attribute contracts remain. The current catalog is not replaced by the fixed fixture.
3. **Selected-model complexity:** actual eight-Actor browser rosters use approved absolute increases relative to the same latest main: unique visible geometry buffers **+1MiB maximum at game LOD and +128KiB maximum at far LOD**. Logical beauty-pass draws remain **118 / 119** for game rosters A / B and **59** for either far roster. These are explicit approvals of increased model complexity, not a lightweight or timing-performance success claim.

The test-only fixed source archive is 269,527 bytes compressed / 881,427 bytes expanded JSON. It contains 27 existing repository-source modules after the same source adapters; three existing Three vendor modules are reused only after exact main805 Git-SHA checks. All 30 original source SHAs were checked against immutable main805. SHA256 is `11362bbf7af3ea1a7105b0e4df63bc71e69a0e9ee18c8ac7d57f405a1349d0f7`. No user attachment or reference image is included. The reproduction script requires a clean exact main805 checkout. Both build copying and runtime import traversal exclude `patches/splatoon3/tests/`, so the archive cannot enter the production bundle.

Isolated fixture initialization measured 7.62s locally; the latest combined test measured 7.85s (an earlier shared-load run was 10.39s). This is additional test setup, not game startup cost. Local fixed-set cached bytes are 1,220,882 → 1,425,482 (+16.76%). Current nine-model catalog bytes are 1,252,612 → 1,503,572 (+20.0349%); this second total remains reported, rather than silently discarded. Node22/24 differ by 260 bytes on one non-selected bathtub model, so exact cross-runtime byte totals must be compared within the same run.

The preceding immutable-main805 diagnostic observed these uncompacted eight-Actor increases:

| Roster / LOD | Draws | Triangles before → after | Unique visible geometry bytes before → after | Increase |
| --- | ---: | ---: | ---: | ---: |
| A / game | 118 | 284750 → 314974 | 2445944 → 3282608 | 836664 B |
| B / game | 119 | 288557 → 317480 | 2547466 → 3374764 | 827298 B |
| A / far | 59 | 81752 → 83924 | 755960 → 826032 | 70072 B |
| B / far | 59 | 82180 → 83886 | 763528 → 822364 | 58836 B |

These are budget-design evidence only. The new exact head must reproduce the contracts against ed3 in CI. The separate compaction proposal saved only14,160 all-catalog bytes while its CI cold-build median rose approximately27ms; it was not adopted. Its520 static RGBA comparisons passed per composition, but actual Actor/crowd strict comparisons failed, including unchanged A/A controls. That failure is retained without tolerance relaxation. The proposed future nine-plus-four composition also exceeded the old ratio even with compaction; it is not represented as solved.

## Actual completion and initial warm measurements

The previous `renderCompleteMs` / `renderMs` values used render plus `gl.finish()`. Chromium's implementation intentionally flushes rather than finishing; those numbers measure **CPU submission plus queue backpressure**, not completion or dedicated GPU time. Historical reports and field names must be read with this correction. Legacy family JSON now includes that scope explicitly.

The final eight-Actor harness uses one actual native Renderer and GL context, valid1024-wide equirectangular input / cube256 PMREM, native Neutral tone mapping and the high-quality full postprocessing stack. It calls the native batched `Character.warmAll` API and records Actor setup, initial warm duration, compiled-program counts and the first postprocessed frame separately.

For every measured frame, the harness performs a synchronous final-output1px `readPixels` **in the same JavaScript task immediately after the native postprocessor**. It asserts the default output target/read framebuffer, valid nonempty RGBA, no GL error and no context loss. Independent PR1295's 60-frame synchronous-read/PBO-fence/read-repeat comparison established this completion boundary. Raw per-frame Actor-update, render-submit, readback-wait and render-through-readback values are retained; none is described as isolated GPU timing or physical-device FPS.

Each fresh-browser ABBA pass records game and far with three warmup plus twelve completed samples per tier. This replaces the old80 queued/flush-only samples; it does not treat an unresolved queue as completed work. All native post/quality/resolution, camera, exact roster, settled force/tier/to and near/far flags are checked. Two eight-Actor rosters cover all nine weapons: A omits Recycled Brella, B omits Stamper. The environment is an isolated studio with actual Actors and postprocessing; there is no world geometry, arena shadow, paint, network or projectile workload. CI uses SwiftShader. With twelve measured samples, p95 is effectively the sample maximum and is not a statistical performance guarantee; all raw samples and ranges remain available. A failed completion-pixel check saves the immediate image and GL state for diagnosis rather than silently relaxing the criterion. Timing remains a manual adoption decision even when memory/draw contracts pass.

## Admission, visuals and contracts

The dedicated workflow explicitly admits PR1271 on `feat/inkwave-splatana-stringer-rebuild`; unrelated PRs do not run the heavy review. Historical per-family workflow skips are not substituted for this gate. Three visual jobs cover all nine near models, actual Actor hold/attack, Brella open/closed/launch and two reverse-movement guard cases. The studio fixture now uses valid cube256 PMREM and Neutral mapping consistently for both builds. Added far galleries show all nine merged body/ink geometries, two teams and four identical cameras; far source-corner attributes remain mandatory in the structural tests. Far galleries are not represented as full Actor screenshots.

Source gates retain all eight bow-shape tests, motion/sockets, three Brella rebuilds, paid preparation, repeated close/reopen, yaw wrapping,243 live holds,65-weapon mutation isolation, facing and actual NetMatch. Fresh emitted gates cover all nine models, real Actor ownership and native network. The built fixture does not apply adaptRuntime, so its five lifecycle tests are distinct from the source mutation oracle. Camera, world aim, same-tick/stored muzzle, feedback and reticle contracts run on the exact emitted composition.

The general validate job remains at the previously approved60-minute wall-clock limit, after44m34s/45m05s predecessors and an artifact-only timeout. Test conditions, ordering, counts, tolerances and required gates are not weakened.

## Evidence status at preparation

Latest ed3 local source results: six-family35/35, Brella51/51, all-nine-plus-Undercover registry/Actor3/3, latest network/touch27/27 and LOD/budget8/8. The final budget validator unit suite passes4/4, including one-byte excess, draw, invalid readback, missing post and bad LOD rejection. Native-stage structural tests pass4; five source-stage integration tests explicitly skip because `INKWAVE_NATIVE_STAGE_ASSETS` is not supplied. These skipped stage-specific tests are not claimed as passes. No extra full local build/browser tree was created under the constrained shared disk.

Prior exact7630 completed all16 required checks, with five intentional historical-workflow skips. Its all-source suite was4961 tests,4942 passes and19 skips, and its production artifact was uploaded successfully. Independent same7630 normal-IBL/native-day material sheets for all nine were visually reviewed, including both team colors, with no additional blocking shape/material problem. Those results remain tied to7630, not reused as the new head's green checks.

The new exact-head production build, all required CI, normal/far/Actor images, completed ABBA and initial-warm measurements are **pending** until explicitly recorded. Main merging remains a separate final parent-review decision. Increasing triangle/buffer cost is acknowledged; success of structural and draw gates alone will not be called performance-neutral.
