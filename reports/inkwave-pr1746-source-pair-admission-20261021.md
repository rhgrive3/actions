# PR1746 source-pair admission candidate

## Diagnosis
Validate core at c72dd6da46f53f3ea931e0263885685172bb12e9 failed two historical six-PR positive tests. They combined an immutable baseline with the live checkout and still required eba73df5/af66a10b receipts. This is not evidence of missing runtime integration.

Official merge f31238a48b9d1a4af2d4f5f5f9182af777a79c83 (PR1746) introduced the exact three changed leaves:
- adapter.mjs: 5178f8d681efee14c083e361bbacc854f3c67c8a -> 31346b2c8ed07fa0f96721ae40d5f88b39294c1f (Bucket sheet FX hooks).
- runtime/roller.mjs: 5166cece72cedbeb3544d59cd53f175284ad5c57 -> d8bec5a2220ebf970c489969fa41d9e6f74affed (vertical swing pose curve).
- runtime/main-weapon-catalog.mjs: 3869e44e4b0056bb508271f22dd03084d8fd6dd9 -> b63b0bc1ebf9380967c11e77cc934319057ec410 (Bucket sheet muzzle routing, deferred poseBirth ownership retained).

All 29 allowlisted paths in main c72dd6 exactly match their f312 tree blobs. The footprint adapter remains cdcc9e94cfe5b754a0b1f99fbd204b28ff24d91c. Its error was the older fallback reached after catalog tuple rejection, not a footprint edit.

## Narrow repair
- Retain every existing historical tuple and pin.
- Freeze the six-PR candidate from official af66a10b full source snapshot, Git blob 13661ec34f512985267156c48ec1178ee2008655. Pose candidate bytes at this commit equal the old eba tuple; paint matches the af66 tuple. Verify fixture and each leaf before tests.
- Add complete ecfb -> f312 pose and 95c -> f312 paint pairs, with zero source replay, plus the complete identical f312 pose epoch needed by current-pose tests.
- PR1746 paint pair has exactly two different leaves (network adapter and catalog); preserve the CLI controls' fixed four-leaf count for all prior contracts and use exact two only for the declared 95c/f312 pair.
- Preserve input-byte checks, no-write receipts, missing/modified/both-side rejection, swap and peer-copy rejection, and add partial old/new pose epoch rejection.
- No production files, workflow capture comparison scope, compiled packaging verification, physics/image acceptance, or other PRs are changed. Source admission does not establish compiled or visual equivalence. Existing actual build manifest/served hash and native physical/image gates remain required.

## Verification status
Official GitHub trees and PR1746 merge provenance read. Candidate JavaScript receives syntax-only validation in V8. Node unit/CLI checks and compiled/native comparison have NOT run in this environment (executor mount ENOSPC, no surviving Node). Required acceptance: Validate core; pose/paint baseline suites; current-pair controls against separate exact 95c/f312 roots (plus ecfb/f312 pose); build source/compiled identity; relevant native physical/image comparisons. Not merged; required validation pending. No completion claim.

Sources: https://github.com/rhgrive3/actions/commit/f31238a48b9d1a4af2d4f5f5f9182af777a79c83 , https://github.com/rhgrive3/actions/pull/1746 , https://github.com/rhgrive3/actions/actions/runs/39625199354/job/119316607247 .

## Exact same-f312 workflow case
The PR's actual base/head have unchanged production sources, so the projectile workflow also needs a distinct pr1746-byte-identical-current-paint mode. It is admitted only when every one of the thirteen leaves on BOTH sides equals the complete f312 candidate tuple. Arbitrary equality, partial old/new epochs, missing leaves, one-sided changes, and equal unknown drift remain rejected. Its receipt explicitly says unchanged source is not evidence of an improvement. The CLI performs no writes, asserts zero changed leaves, runs 52 one-sided missing/byte CLI negatives plus same-directory rejection, and 26 both-sided helper negatives. Earlier unlike-source pair controls retain their original rejection semantics and four-leaf/two-leaf counts.

This mode does not verify the emitted code or images by itself: workflow packaging/source identity and native physics/image gates remain unchanged and required. The actual checkout commit is still recorded by build/capture manifests separately from the immutable source epoch f312.

## Bind the requested contract through negative controls
Independent review found that copying the complete candidate into an unlike-epoch baseline now forms an intentionally admitted identity tuple. The comparison must not silently switch modes. planMainInkBaseline therefore accepts an optional exact expected {mode,sourceBase,sourceHead} contract; the CLI accepts the three equivalent required-together flags. Current-pair controls pass all three values on every subprocess and helper negative. Any otherwise approved identity/differing tuple that differs from the requested contract rejects before any source or receipt write. Unknown/incomplete expectations reject too. Added helper regressions and a real Node CLI regression for rejected copied identity with unchanged prior receipt, incomplete flags, and separately requested intentional identity success. These new Node executions remain pending CI; only syntax has run locally.

## Current PR1758 caller integrity
Audit found the old workflow invokes current-pair controls only for historical PR1695/base conditions and calls prepare without an expectation. This candidate adds a bounded PR1758 path only: workflow passes declared PR base/head SHAs to controls and prepare. All thirteen working-source leaves must byte-match git show SHA:path under Git roots whose HEAD matches the declared SHA before planning or writing. The expected admitted mode is then obtained from those immutable sources, not a possibly copied directory. Controls preserve those Git roots while exercising separate negative scratch trees. Receipts retain declared commits and all thirteen Git blobs.

New regressions create isolated Git fixture repositories: genuine unlike and intended identical epochs pass; copying the full candidate source into baseline while keeping its old HEAD fails; a mismatched declared SHA fails; the dirty-copy CLI fails without overwriting the prior receipt. These are Node tests awaiting CI, not locally executed. Existing PR1695/audio-derived and other historical workflow paths remain unchanged and do NOT gain a general all-caller immutable-input guarantee. Exact compiled bytes and native comparisons are still separate mandatory gates.
