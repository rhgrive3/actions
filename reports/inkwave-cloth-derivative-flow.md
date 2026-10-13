# Native cloth derivative stability

## Scope and cause

Baseline: main `545c6b3fcfc0d25c43678e9b44b1af4e26400fec`, product contentHash `43ddefa5e29081aba0eed716ac9e8240e9f5fee46178ea6685dba6faf265fdcd`. All 689 official input hashes were verified before making this change. No unmerged motion, rig, weapon-detail or performance patch is included.

While verifying same-quality crowd optimizations, a frozen original scene changed small groups of cloth pixels despite identical draw arguments, actual uniforms, texture bindings, depth/blend state, bone matrices and environment texture contents. Per-draw completed readback located the first difference in `kid:cloth:game`. Independent CPU projection traced the affected pixels to tee and shorts triangles that cross bind-space `p.z = 0`.

Their shader evaluated derivative-based decoration functions only inside `if (p.z > 0.0)`. Different fragments of one triangle take different paths. [GLSL ES 3.00 §8.9](https://registry.khronos.org/OpenGL/specs/es/3.0/GLSL_ES_Specification_3.00.pdf) leaves derivatives in non-uniform control flow undefined. This is an existing renderer defect, not evidence that the proposed rig or weapon draw optimizations change poses or geometry.

## Smallest demonstrated correction

The build-only adapter changes exactly two reviewed blocks. Their complete original source blocks are SHA-256 guarded, and their body text is reused unchanged.

- Tee: evaluate the existing front decoration, then restore `base`, `iwH` and `iwShine` wherever the original front condition was false.
- Shorts: evaluate the existing front and back blocks from the same original values, then select `base`, `iwH` and `iwAO` using the original front condition.

Original colors, patterns, positional masks, height formulas, roughness, metalness, normal, lighting and AO owners remain intact. No math-function rewrite, bump removal, simplification, quality reduction, time/animation change, AI change or geometry change is included. Upstream source files remain byte-identical. The transformer is an input identity dependency but is explicitly excluded from browser distribution.

Because the former result was undefined, this is not a promise of pixel identity with the original shader. It makes the intended side selection stable. Evaluating both sides may add fragment work; completed-frame timing and optional GPU timer results are recorded rather than assuming that unchanged draw counts imply unchanged cost.

## Evidence before product integration

Dedicated diagnostic head `eee9c632168c07cce52f643905bc1c5e98d323a4`, [run 38289444469](https://github.com/rhgrive3/actions/actions/runs/38289444469), [artifact 11766541024](https://github.com/rhgrive3/actions/actions/runs/38289444469/artifacts/11766541024), ZIP SHA-256 `247628d70e7864ed5f4cdb95f688083582ef58a41caca708b0c1e7db1f975374`:

- Original eight-Actor scene and a mixed Player00/Player01 × two-team-color scene, with all source banks loaded.
- Three cameras: original, opposite and side. Both composer target phases compared separately.
- Tee-only correction resolves the original view but leaves shorts differences in the other views.
- Tee plus shorts correction gives exact zero pixel differences in all 12 same-phase image pairs. Both fixtures have zero browser errors. An independent review compared the PNG bytes directly.
- Original-to-corrected images differ only locally (35–71 pixels of 307,200 in the reviewed captures); independent image review found no missing shapes, clothing patterns or colors.

Separate controls for negative-base squares, reversed smoothstep edges, disabling cloth bump or flattening the tank-cap bump did not resolve the original drift. Those unrelated changes are not included.

## Product validation

Local guarded-source/composition tests: 3 passed, zero skipped. Production build succeeds with contentHash `ec70b09f4912be9cd9eed68789a3de5bcf70ea1e94cb149c831c54edf476b060`. Normal artifacts change only `src/game/character-mats.js` and the standard index/service-worker revision metadata. The transformer is absent from artifacts; service worker remains 70,515 bytes. Full tracked-input packaging receipt requires a real Git checkout and is enforced in Actions (the local materialized source has no `.git`).

Exact-head Actions additionally runs the actual product shader across three cameras and both source banks. A real index/bootstrap/main match test keeps native actors, AI, collisions, paint, materials, lighting and post processing. It freezes a single scene and compares original/fixed/fixed/original cloth blocks, retaining complete output, node state, draw counts and raw submit/readback-completion timing. Original output is allowed to show its diagnosed instability; the fixed shader must be exact across same-phase frozen frames. The reviewed results are recorded below.

SwiftShader timing is not iPad mini 6 or hardware GPU FPS. Real-device acceptance remains unmeasured. The Splatoon 3 gameplay reference remains Ver.11.3.0 as recorded in the existing behavior comparison; this corrects local shader evaluation and makes no new claim about Nintendo animation, movement, weapons or simulation equivalence.

## Reviewed production result

Production verification head `5bbb5105aba3aaf369f1a7647d1b96eeee559958`, [run 38293539614](https://github.com/rhgrive3/actions/actions/runs/38293539614), artifact `11767739158`, ZIP SHA-256 `833fb91383bc27e4c4ab51d857e2ae1235e4c1c25beac189a04e7d71aab2df52`: all checks passed, including 3 guarded-source tests and 9 tracked-input packaging tests.

Both product rig banks are stable across all three cameras and both composer phases. Both real game stages reached playing state after 330 real frames with eight living actors, eight active AI brains (including the autopilot local actor), native source motion, collision, paint and rendering intact. Frozen ABBA comparisons preserve all recorded node state, draw counts and triangles. All 16 corrected frames per stage are pixel-identical, independently verified from nonempty opaque PNGs. Original counterfactual frames retain the diagnosed small pixel changes.

Tidewater has 111 draws / 582,234 triangles; Scorch has 193 / 650,188. Original-to-corrected representative output differences are 45 and 9 pixels respectively, confined to actor clothing. Independent image review found no missing background, paint, equipment or clothing details.

Completed-render medians in original/fixed/fixed/original order (eight frames per batch, including synchronous full RGBA readback):
- Tidewater: 1292.60 / 1295.00 / 1287.95 / 1299.60 ms.
- Scorch: 2948.05 / 2930.85 / 2952.05 / 2927.65 ms.

These single SwiftShader ABBA measurements do not show a large whole-frame increase, but do not establish zero added fragment cost or hardware performance. The timer-query extension was advertised; every query result was unavailable at collection, so no GPU-only timing is claimed. Real iPad mini 6 acceptance remains unmeasured. The subsequent evidence-only documentation commit does not change any product input or browser harness.
