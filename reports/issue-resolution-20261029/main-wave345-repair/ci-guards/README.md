# Fix-forward candidate: exact CI and historical verification

All three commands ran once against clean commit `a02d717bbf3fc3f32c721336c25138e147290c68`, with Node 22.23.4 and real Ruby/Psych on PATH. HEAD and every tracked file remained unchanged through completion. This candidate starts from the externally merged main tree and includes the reviewed Wave composition, native faults, posture API and historical caller bridges.

- Canonical 41-file verifier: 687 tests, 686 passed, 0 failed, 1 existing optional emitted-pack skip.
- Separate historical CPU contract file: 9/9 passed, 0 skipped.
- Actual full A+ program: exit 0, valid JSON, empty stderr. All three frozen historical composed migration pairs remain byte-identical. No new runtime or game-FPS gain is claimed.

Compressed raw outputs and eight immutable code hashes are recorded in summary.json. Earlier candidate proofs remain separate; overlapping counts are not added together. Root separately verified the mandatory 34 emitted files, 14 source files and production build; their results are not folded into these counts.

This is local candidate acceptance. It does not establish hosted CI or hardware acceptance, validate the externally merged fecc main tree, or mark the former45 failure families resolved. A new ready PR against main is the publication target; no old closed PR retry, cancellation or main write occurred in this phase.
