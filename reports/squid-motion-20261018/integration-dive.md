# Bidirectional transition integration

The next candidate combines the authorized human-to-squid visual curve with current main dfbdcc9c523790f66fa56a22e4cf7873bdb3af03. Preserved browser baseline is fbaf105eb310daf10ef7bd72675805ccf3f5a8bc, whose self-depth ghost fix and return envelope already passed targeted native review. No squid geometry/material changes are introduced here.

The only shared-file overlap is patches/local-quality/adapter.mjs. A three-way merge against da97926a21e0e7c6170d76864f896123d979f915 retains current main verbatim plus the existing squid adapter import/call. Current-main performance and pause regressions pass6/6. The new dive hook initially conflicted with main's lazy renderedPose copy optimization; integrated tests caught it before publication. The final hook applies the transition pose after accessory ownership and captures displayed bones directly, preserving lazy copies.

The repository tree is based on the exact current-main tree and retains prior squid branch blobs, with the reviewed overlap and new transition/QA files replacing only their intended paths. Unrelated main blobs, including the shared behavior report, must remain identical. The merge commit records both previous squid head and current main as parents.

QA keeps the old first eight seconds and adds two seconds of actual human-to-squid entry, return, reversal and double reversal. Both preserved baseline and candidate receive the same300-frame/10-second sampling. This is offline1x trajectory evidence, not achieved rendering FPS. Multiview temporal filenames now use actual cumulative form time:0/50/100/150/200ms, correcting earlier state-label ambiguity. Four ghost-depth A/B cases remain intact.

Source, emitted and native checks are required before acceptance. The source bank and driven-input fixture do not establish exact Splatoon3 animation/physics parity. Public Nintendo reference sources and timing uncertainty remain in dive-envelope.md and return-envelope.md.

## Build-input identity closure

Independent review found that the two new build-only squid adapters were absent from qualityIdentity's IDENTITY_FILES. Emitted runtime artifacts were already hashed correctly, so the prior native evidence remains valid; inputHash nevertheless omitted those authored inputs. Both files are now included without changing adapter behavior. A focused regression imports the actual identity function from an isolated copied tree, mutates each adapter independently, runs the actual build-script quality merge/inputHash expressions, and checks restoration. The emitted form of the same test verifies build.quality, files and the final inputHash against actual source bytes. Both QA runners now record these authored adapter hashes explicitly.
