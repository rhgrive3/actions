# Bidirectional transition integration

The next candidate combines the authorized human-to-squid visual curve with current main dfbdcc9c523790f66fa56a22e4cf7873bdb3af03. Preserved browser baseline is fbaf105eb310daf10ef7bd72675805ccf3f5a8bc, whose self-depth ghost fix and return envelope already passed targeted native review. No squid geometry/material changes are introduced here.

The only shared-file overlap is patches/local-quality/adapter.mjs. A three-way merge against da97926a21e0e7c6170d76864f896123d979f915 retains current main verbatim plus the existing squid adapter import/call. Current-main performance and pause regressions pass6/6. The new dive hook initially conflicted with main's lazy renderedPose copy optimization; integrated tests caught it before publication. The final hook applies the transition pose after accessory ownership and captures displayed bones directly, preserving lazy copies.

The repository tree is based on the exact current-main tree and retains prior squid branch blobs, with the reviewed overlap and new transition/QA files replacing only their intended paths. Unrelated main blobs, including the shared behavior report, must remain identical. The merge commit records both previous squid head and current main as parents.

QA keeps the old first eight seconds and adds two seconds of actual human-to-squid entry, return, reversal and double reversal. Both preserved baseline and candidate receive the same300-frame/10-second sampling. This is offline1x trajectory evidence, not achieved rendering FPS. Multiview temporal filenames now use actual cumulative form time:0/50/100/150/200ms, correcting earlier state-label ambiguity. Four ghost-depth A/B cases remain intact.

Source, emitted and native checks are required before acceptance. The source bank and driven-input fixture do not establish exact Splatoon3 animation/physics parity. Public Nintendo reference sources and timing uncertainty remain in dive-envelope.md and return-envelope.md.

## Build-input identity closure

Independent review found that the two new build-only squid adapters were absent from qualityIdentity's IDENTITY_FILES. Emitted runtime artifacts were already hashed correctly, so the prior native evidence remains valid; inputHash nevertheless omitted those authored inputs. Both files are now included without changing adapter behavior. A focused regression imports the actual identity function from an isolated copied tree, mutates each adapter independently, runs the actual build-script quality merge/inputHash expressions, and checks restoration. The emitted form of the same test verifies build.quality, files and the final inputHash against actual source bytes. Both QA runners now record these authored adapter hashes explicitly.

## Final CI fixture alignment

The full current-main CI exposed two stale test fixtures. The paint test's
independent allocating reference now supplies expected active fields to an
explicit 24-field retained-slot oracle. Complete record equality, object reuse,
empty/truncated calls and the existing >30,000 / >400,000 sampling checks remain
strict. Four independent negative controls (initial zero, ellipse assignment,
slot reuse, strict boundary) fail as expected. Production paint code is unchanged.

The material-handoff mock now provides the squid-specific eye material owned by
the actual composed Character and verifies disposal for both the cancelled
pending character and live replacement. The original warm cancellation and
program-cache assertions remain. These two source suites pass 28/28 locally;
exact-head emitted and full CI remain the acceptance gate.

## Final main reconciliation, 2026-10-19

Preserved PR1604 head `9d6a40bbd78df6fc02544a5ef28d030bbacd4e3d` is reconciled with merged main `295dfb48d0a781d642aeb13521a63ddb9670dacf` (PR1599 after main #1620/#1622). All seven shared QA/oracle paths retain merged-main versions, including the audio diagnostic superset and trusted range-menu readiness checks. Main's 32 upstream changed paths are retained; the quality adapter combines its action-presentation logic with the existing squid registration and identity entries.

The only additional runtime adjustment is the narrowly scoped spawn-flight displayed-form reset described in return-envelope.md. Independent acceptance verifies 546 exact gameplay frame receipts, six source/rate cases, 58 existing regressions, and portable form tests5/5. The unchanged motion timeline tests2/2 pass. New main's Rainmaker admission and identity tests17/17 pass; both new/changed ranked runtime files are covered by writeBuildIdentity.

The existing paired 104-frame surfaces and300-frame motion sequence remain required. A candidate-only120-frame actual Actor spawn scenario adds source/fallback launch/flight/return/landing coverage. Its exact camera passed CPU projection for every frame with at least27.85% Character edge margin. Final emitted/browser evidence and all mandatory checks are pending on the new exact head; local results are not claimed as native acceptance.
