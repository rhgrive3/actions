# Combined QA dependency validation candidate

This candidate is **QA-only and unaccepted**, not a production/model/VFX repair or a merge request to main. It combines independently preserved fixes so their validations need not remain blocked by each other's old QA defects. No success is inferred from assembly.

## Immutable inputs

Base main: 870872c8b82015bc8b5c1fa0151808c0fbb43e6f.
- PR1753 C1: 5ccc9e73921e8524eb5464ae1ad33d8271870b9f. Literal-head Node shard6 job119335672372 passed950, including continuity and tangent/position-jump negative controls.
- PR1758 source pairs: 33da73fc4b0660ec1f8ef6651b09aa5352bc2ef2. Literal-head validate_core job119378890289 completed all steps successfully, including57/57 source-pair/unknown-leaf/partial/dirty-HEAD/expected-mode/identity controls; 48 paired native captures, physical/RNG identity and18 synthetic controls passed at this source PR. Identity validation is not evidence of visual improvement.
- PR1759 placement: 6adaddab5181aa9089c264e37e4328bcf146bbe7. Latest placement candidate included for joint validation; native acceptance is NOT established here.
- PR1761 #847 source pin: 16d583c604ae56f922e40637efea77013582cdf7. Literal-head Node job119398636107 passed8 including physical/fault/frozen-source controls.
- PR1762 readiness: 1f9b0c3ae9908e48fc51c2025aecbc6b259cb369. Includes PR1760 12a5bb772b46174ff125793519ab4af64b706649; do not apply twice. Actual Node readiness9 and summary11 passed at source PR; native readiness/visibility acceptance is NOT established here.

Source PRs, commits and original evidence are preserved. Runtime differences already in main (including swim-surface) are inherited, not introduced by this candidate. Against870872, there are zero gameplay/model/assets changes.

## Composition invariants

25 unique source-PR paths plus this report and one focused workflow =27 changed paths.
The sole overlapping source-PR path is .github/workflows/validate-inkwave-update.yml:
- preserve1762 core summary/readiness test arguments;
- preserve1759 network placement test step;
- retain all existing full validation jobs and thresholds.

The PR1758 projectile workflow also routes the exact diagnostic branch test/inkwave-combined-qa-20261021 into the SAME strict declared-source path as PR1758. The branch is a routing condition only, not source admission. The controls run before reference replay; prepare itself also receives declared immutable base/head. No pins or accepted leaf sets are broadened.

The added focused job checks out literal870872 and the exact PR head, verifies both HEADs, asserts a27-path QA-only allowlist, and executes declared13-leaf admission/rejection controls plus pose/sourcepair/placement/readiness/C1/#847 tests. It does not replace full mandatory validation or native capture. Its fixed870872 base and the projectile capture's event-declared PR base are separately receipted; do not conflate them if main advances.

Git tree audit: all13 paint and16 pose leaves (29 unique) in870872 exactly equal the admitted f31238a48b9d1a4af2d4f5f5f9182af777a79c83 epoch. Candidate assembly preserves all29 blobs. This is leaf-limited identity, NOT whole-tree, emitted, physical or visual equivalence.

## Exact path provenance

- PR1753: patches/splatoon3/tests/motion-five-regression.test.mjs (205b1cee466014c9d68145ae0753cc044ce2c90e)
- PR1758: .github/workflows/inkwave-projectile-visuals.yml (6dd21428846eebbcc6dbcd2c867e826cedee95e6) [strict combined-branch routing added]
- PR1758: reports/inkwave-pr1746-source-pair-admission-20261021.md (d2d34d813df2d746a06c9fd4db3474336778c69e)
- PR1758: scripts/check-inkwave-current-pair-controls.mjs (61ff81a226f117b50810c8585c1988541a105f43)
- PR1758: scripts/fixtures/inkwave-open-pr-af66-sources.json (13661ec34f512985267156c48ec1178ee2008655)
- PR1758: scripts/lib/inkwave-character-pose-baseline.mjs (17784868d6d278b487ca070bf62376185ab71dc6)
- PR1758: scripts/lib/inkwave-declared-paint-source-pair.mjs (ac93ffcac122e4693da1689c2ceb5fe3b4408765)
- PR1758: scripts/lib/inkwave-main-ink-baseline.mjs (85c6ac93bd0b2ceacfbdf0cde36f2714c735e518)
- PR1758: scripts/prepare-inkwave-projectile-baseline.mjs (a241106c34266e81b5c2dbb3f214da9b710aa968)
- PR1758: scripts/tests/inkwave-character-pose-baseline.test.mjs (e0517d258943a9b28326e9d656bba9535f3b37d7)
- PR1758: scripts/tests/inkwave-open-pr-source-pairs.test.mjs (306aa4c9f2e1fd24933bd97a0af598d27b0a0e4a)
- PR1762: .github/workflows/validate-inkwave-update.yml (b795e03bbc0dfa09ec4f3654ab3113e1dbe3db95) [logical union with1759]
- PR1759: scripts/check-inkwave-combat-ceiling-browser.mjs (c000b835886dd03099d50ac52edc27a81fd216f2)
- PR1759: scripts/lib/inkwave-combat-ceiling-placement.mjs (60f81599b1dd0407f355ea657ad3f4f51f64cabf)
- PR1759: scripts/tests/inkwave-combat-ceiling-placement.test.mjs (745ce2c81ca3e88eb70bcff70ea87e0ff40800e2)
- PR1761: .github/workflows/inkwave-roller-support-source-pin.yml (5d1c5c848111b594e622d8cc5fa49e06592818e2)
- PR1761: patches/splatoon3/tests/issue-847-roller-drum-support.test.mjs (eaff5e3f4d3d1da2c41cdbf08227fdff7b565388)
- PR1762: reports/inkwave-motion-detail-source-readiness-20261021.md (94f19ecd4fd8916157cf53c9425f89ce2a25718e)
- PR1762: reports/inkwave-motion-detail-stdout-diagnostic-20261021.md (967ac03f26c01a04ff378594ca412d26f7e7d4ca)
- PR1762: scripts/check-inkwave-motion-catalog.mjs (d7c1fdca50e5c03859e45423d1ebbb29dcef151f)
- PR1762: scripts/check-inkwave-motion-detail.mjs (507209a5aa78f4df8f92d4e563cecfc6c6f37ff0)
- PR1762: scripts/lib/inkwave-detail-source-readiness.mjs (02c143107a77d8b932cd9173148813bd85cf00f2)
- PR1762: scripts/lib/inkwave-motion-detail-failure-summary.mjs (8d3a16b69ecacd712c8f4680acdcbb8ed89bd883)
- PR1762: scripts/tests/inkwave-detail-source-readiness.test.mjs (7c81069b5d0e8d015cfb20d0f6a580fe88676b26)
- PR1762: scripts/tests/inkwave-motion-detail-failure-summary.test.mjs (58de204426cf091e5cefb2aa3fa520691522ead8)
- New: .github/workflows/inkwave-combined-qa.yml (exact-source focused validation only).
- New: reports/inkwave-combined-qa-20261021.md (this record).

## Unresolved acceptance

Assembly and static review are not execution. Combined candidate Node/build/browser checks have not run at preparation time. Placement and readiness may reveal further defects; catalog empty geometry/ancestor visibility remains unresolved and failure stays failure. No stopped character model is made visible or modified. No allowlist broadening, assertion weakening, swallowed failure, source fallback or baseline repaint is introduced.

Kraken PR1743 remains at746fb26; its verified source/emitted results and oldfc5 video retain their original labels. This candidate does not include the Kraken runtime changes or claim its visual acceptance. No final merge until actual final-head mandatory CI and required visual review pass.
