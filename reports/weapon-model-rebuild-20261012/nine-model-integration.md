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
