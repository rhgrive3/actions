# Crowded character transform work, October 12, 2026

## Current composition and dependency

Responds to severe bot-crowd slowdown on iPad mini 6 and other devices. The final candidate uses main `545c6b3fcfc0d25c43678e9b44b1af4e26400fec` plus the separately reviewed cloth correctness prerequisite [PR1319](https://github.com/rhgrive3/actions/pull/1319). Merge that prerequisite first; no deployment or merge is implied by this report.

The four rig edits are byte-identical to the original PR1306 transformer (SHA-256 `eedc72675c1e8a50e157ae727b7a83e0d96d050105724d22722a040a6b8cad39`). Common-cloth baseline is `c98f4007ee2f57584009f8b32871f43c350498cf`, contentHash `ec70b09f4912be9cd9eed68789a3de5bcf70ea1e94cb149c831c54edf476b060`. Candidate contentHash is `dd71cbc3799b373647b52bfd55d6e693a9c21bd4283c7085f2de9dee69d3ea10`. The only changed normal product module between those builds is `src/game/motion/retarget.js`, plus ordinary index/service-worker revision metadata. Both build-only transformers are excluded from shipped assets.

## Product change

Four guarded build-time substitutions in native HumanRetarget replace repeated full-character recursive matrix updates with the descendants of the joint actually edited. Ancestor updates (`true`) remain enabled. Full initial pose and pelvis updates remain unchanged. No clip, sampling rate, solver iteration, tolerance, arm/grip, skinning, mesh, AI, collision, weapon event, shadow, DPR, quality setting or render pass changes.

CCD rotation refreshes the edited joint subtree. Ankle rotation/translation refreshes the ankle subtree. The analytic leg solve refreshes the upper-leg subtree. Subsequent reads concern that subtree; unchanged siblings were refreshed by the initial full-pose update. Regression checks compare the entire root graph, not only feet, before render-driven/forced scene updates.

Main already recognizes iPadOS Macintosh UA with `maxTouchPoints > 1`. Touch high quality already disables GTAO/bloom/MSAA, caps iOS DPR at 1.2 and shadows at 2048, and has dynamic resolution except ultra. This change does not alter these policies or manual settings. Resolution reduction cannot eliminate redundant CPU rig traversal.

## Exact native tests

Combined guarded/native tests: 5 passed, zero skipped. Actual Character and Player00/Player01 source banks at 30/60/120 Hz cover 576 paired frames, 72 forced foot-clearance CCD corrections with 36 per side, moving/rotating/nonuniformly scaled ancestors, root movement, small form scale, shooter/dualies/roller/charger switches and hero/game/far LOD switches. Complete node local/world transforms, foot diagnostics and muzzle coordinates compare exactly.

Transform calls fall from 591,765 to 320,925 (45.77%) in this contact-heavy Node fixture. It uses a deterministic slope, not production collision; operation counts are not whole-game FPS.

## Completed common-cloth browser comparison

Compared head `3bd204eba143940844b2fc3e1eb0c18c6b74ef11`: [run38297829047](https://github.com/rhgrive3/actions/actions/runs/38297829047), artifact `11769122954`, ZIP SHA-256 `df8e8234a68fc8e2ec0a96e694080d5631f54f02b90a4e3af177e096594f7cf0`. All steps succeeded, including source tests, fixed baseline/candidate input hashes, tracked-input packaging and both ABBA comparisons. Final PR publication changes only the trigger/report relative to that compared source tree; product and browser harness bytes remain unchanged.

Default Player00 and mixed Player00/Player01 × two-team-color scenes each run original/optimized/optimized/original. Each run uses eight real Actors, source-motion lifecycle at 30/60/120 Hz, native day Environment and native touch Renderer in the same WebGL context. The gate requires exact equality of all recorded actor/node/foot/muzzle snapshots (776 actor snapshots per run), character uniforms, geometry buffers, source-bank identity, every final frame hash, three cameras × both composer phases, draws, triangles and quality. Every run must have zero browser errors and stable same-phase frames. All requirements passed without pixel tolerance.

Recursive matrix calls per Actor-frame are 396.5 / 266.5 / 266.5 / 396.5, a 32.79% reduction. Native eight-Actor CPU batch medians in ABBA order:
- Default bank: 51.8 / 48.0 / 47.0 / 53.5 ms.
- Mixed banks: 51.4 / 46.1 / 46.0 / 53.5 ms.

Raw samples and completed-render submission/readback timings are retained in the artifact. These are isolated native rig measurements on Chromium/SwiftShader, not iPad mini 6 FPS, hardware GPU cost or a populated match AI/collision benchmark. Synchronous final framebuffer readPixels establishes completed output, and PNGs are captured before asynchronous hashing. Real-device acceptance remains unmeasured.

Independent actual-game profiles from the separate CPU investigation place repeated `updateWorldMatrix` self-time under HumanRetarget, corroborating that this path is active in real matches. They do not measure this candidate's whole-game speedup.

## Earlier failed baseline and resolved prerequisite

The original fixed-ed3 baseline (`5f967f1dc850…`) and rig candidate (`af763730a778…`) failed exact output checks despite matching poses. This failed evidence remains valid and is not relabeled as a pass: [run38279519060](https://github.com/rhgrive3/actions/actions/runs/38279519060), artifact11761410371 SHA-256 `0375bd232cadb164a7b69cd180c153a05e27290a4d5c872420d85f5700edb4a6`; [run38280684867](https://github.com/rhgrive3/actions/actions/runs/38280684867), artifact11762645490 SHA-256 `c33c0cbd8d526c4657fd2d02232be835a22854e84271cbe2584c2b632dbe54ea`.

Identical actual GL draw/uniform/texture-binding/FBO/depth/blend state, bone matrices and environment texture contents still produced small cloth pixel drift. Per-draw readback and independent projection localized it to tee/shorts triangles crossing spatial shader branches that contained derivative calculations. PR1319 corrects those two blocks while preserving original output masks, separately verifies actual gameplay, and records its limited fragment-cost evidence. It is applied equally to both sides of the successful final rig comparison. No quality simplification, AI removal or pixel-tolerance relaxation was used.

## Other pending integrations

PR1301 presentation motion and PR1318 source posture/carry changes are not included. PR1318 textual hooks commute with the four substitutions, but combined runtime pose/muzzle verification is still required if integrated later. PR1298 compaction and unaccepted high-detail model branches remain excluded. Only accepted main545 content and the explicit cloth prerequisite are composed here.
