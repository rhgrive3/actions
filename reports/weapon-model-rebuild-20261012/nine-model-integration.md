# Original nine circled weapons: combined integration candidate

## Scope and ancestry

This candidate combines the six models reviewed at PR1271 `35211cecdba35f5e3b30b100241f0235b3976457` and the three Brellas plus guard-facing correction at PR1272 `c7b6a6eb3f2b37d68eaf8a049452fc23534daac4` on immutable main `bca45e7cb55f3331a58459ea0219e42b44762712`.

The production model files are copied byte-for-byte from those reviewed candidates. There is no new shape revision in this integration. LACT retains its reduced .132 central collar and both animated diagonal ties; the other five Splatana/Stringer definitions remain unchanged. Brella's helper, adapter and paid-preparation catalogue changes are preserved from c7. Shared kit, registry, Character, motion ownership, Quad, Mini and glass candidates are outside this change. Undercover remains a non-selected regression control. Rejected zero-area PR1273 is not included.

The shared Splatoon3 adapter and catalogue matched adopted main before importing c7, so this integration does not overwrite a second competing edit. Both FIFO network files are exactly main bca bytes. The combined remote commit has the two reviewed branch heads as parents; c7 already contains bca. Main merging remains a separate parent-review decision.

## Admission and fresh evidence

The unified workflow admits PR1271 on `feat/inkwave-splatana-stringer-rebuild` explicitly. All three visual families and the combined contract/crowd job share that admission. The historical feature-specific workflows are not relied on as gates. Unrelated PRs do not start this heavy review. Both baseline and candidate are checked out at immutable SHAs, built as full production compositions and measured on the same runner.

- Three visual matrix jobs cover all nine models at fixed matching before/after cameras, including actual Actor holding/attack states. Brellas retain their full framing, forced game LOD, open/closed/launch and reverse-movement contact cases. Both reverse cases per Brella must meet guard bounds.
- Source contracts cover six-model sockets/motion, all eight bow-shape tests, all three Brella rebuilds, paid preparation, repeated close/reopen, yaw wrapping, 243 live holds, the 65-weapon mutation-based isolation oracle, facing regressions, and actual NetMatch sender/receiver. The source registry/Actor sweep includes all nine plus non-selected Undercover. Main's network FIFO source regression runs too.
- Fresh emitted contracts cover every selected model, real Actor ownership, Brella preparation/lifecycle and actual NetMatch. The built fixture does not apply adaptRuntime; its five lifecycle tests are distinct from the source-only mutation oracle. Camera, world aim, same-tick/stored muzzle, feedback and reticle contracts run against the exact combined built site.
- Two eight-player mixed rosters cover the union of all nine weapons. A contains all except Recycled Brella; B contains all except Stamper. Both run main/candidate/candidate/main, each at forced settled game and far LOD. Exact eight IDs, roster union, actual camera transform/direction, force/tier/to, near/far weapon mode, finite timing samples and unchanged draw counts are enforced. Candidate and second-baseline draws must match the first baseline; no threshold relaxation is used.

The crowd records Actor update time, CPU render submission, CPU wall time through gl.finish, triangles, visible geometry-buffer bytes and renderer geometry counts. Draw equality is not a performance pass by itself. It is a short component benchmark on CI SwiftShader, without a full arena, paint/network/projectile workload or physical mobile GPU. Brella open/closed single-Actor cost is captured separately; mixed crowd timings are fixed-pose render/update costs, not a worst-case match guarantee.

## Local preparation and remaining gates

All 15 Brella handoff blobs were SHA-verified, including the shared adapter/catalogue. The two-parent union adds only the approved runtime changes and review infrastructure. The evidence validator was checked with one valid synthetic fixture and five deliberately invalid cases (missing weapon, unsettled LOD, wrong camera, changed draws, wrong near/far mode); all five are rejected. Synthetic fixtures are not performance measurements.

Local source contracts passed 102/102; the separate all-nine plus Undercover registry/actual Actor sweep passed 3/3. The evidence manifest records both logs. With the shared workspace below 40 MB free, no extra full build tree was generated; fresh exact-head production/built/browser evidence must come from CI. Prior 352/c7 CI results and images remain historical evidence, not substitutes for the new combined head. Final image, performance, all required CI and parent integration review are pending until explicitly recorded for the new SHA.

## Latest-main reconciliation after the successful 77d review

The previous combined head `77d70411995fb1cb52ece10e829ee1ac6412e3f9` completed 16 successful checks and five intentional historical-workflow skips. Its full source suite had 4961 tests: 4942 passes, 19 skips and no failures. The exact compiled site artifact was uploaded successfully (11742760304). Its four dedicated all-nine jobs also succeeded. These results are retained for that head only.

The next candidate preserves latest main `5ed08c6376696dd67391afed7c36463106959de8`, including PR1248 ink volumes (`3165f4f`) and the subsequent Pages workflow fix. Main's 47-file delta has no path overlap with the original 27-file model feature. Shared verified source and the two canonical runtime packs are reused; the remote base tree preserves all binary reports and source images even where those were not materialized locally. All seven feature production files remain exactly77d bytes. The dedicated before checkout advances to immutable5ed; all camera/LOD, source, emitted, Actor, guard, network, visual and ABBA conditions remain unchanged.

Only the general `validate` job's wall-clock limit changes from45 to60 minutes, explicitly approved after measured77d duration44m34s and c7's cancellation at45m during its final artifact upload. The purpose is bounded headroom for environmental waits and artifact preservation. No test condition, count, order, tolerance, assertion or mandatory gate is weakened. Parsed YAML equality excluding that one scalar was verified. Other job budgets are unchanged.

The77d performance result is not cost-neutral: mixed rosterB game render-complete medians1.1/1.2ms before versus1.4/1.3ms after; rosterA has substantial baseline drift. Both game rosters add about10% triangles and32–34% visible unique geometry-buffer bytes despite unchanged draw counts. Far render medians were approximately0.8ms in all passes. The separate c7 eight-Brella approximately+1ms game median remains relevant and is not superseded by the diluted mixed scenarios. Fresh latest-main images, ABBA, full CI and parent adoption review are required for the new exact head.
