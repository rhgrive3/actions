# PR1854 terminal acceptance checklist

**NOT MERGE READY.** Official Validate run [39953697907](https://github.com/rhgrive3/actions/actions/runs/39953697907) completed **failure** at 2026-10-23 13:17:47 UTC on exact head `2e8d90b8afb6aac057edfbb988fae789ef36cfd3`. Final readback still has PR1854 open/Draft, base and main `726e338ac256ba9609086ce65e25a68ddd99df85`. No runtime, QA, workflow, PR, main or access change was made; no CI rerun or dispatch was requested.

| Acceptance item | Actual result |
|---|---|
| Exact production/build-input binding4c9→2e8 | PASS: only the admitted test changed; all6326 other leaves and1421 normal build inputs unchanged. Original images remain4c9 captures. [Proof](../head-2e8-binding/README.md). |
| Other seven automatic new-head workflows | PASS:19-special, projectile visuals, Crab/gyro, main weapons, alpha volume, reopened-six, A+ quality/security. |
| Validate source gate | FAIL: `validate_core`120415050551 and required aggregate `validate`120431911691. |
| Validate patch/build/support gates | PASS: all eight patch shards, build_site, seven_claims, resource_paint_continuation. |
| Hosted browser suites | PASS: UI, startup, responsive, range, catalogue, network. Active job120415050667 is FAILURE with its idle-resource step CANCELLED by runner shutdown; later active checks did not run. |
| Conditional diagnostics/combined QA | SKIPPED by workflow predicates; not passes. Combined QA is gated to another named branch; video pilot/diagnostics are dispatch-only conditions. |
| Actual local Chromium special/continuation work | Scoped PASS: four priority method observations plus lifecycle fixes; corrected Reef reset/reuse/death passes on candidate and parent; phone/desktop loadout continuation after geometry/PNG passes. Original failed probes and all before/after outputs preserved. [Coverage and native tick-labelled frames](../README.md). |
| Local WebKit / full local hosted matrix | NOT RUN: actual WebKit executable absent. Hosted successful suites above are separate CI evidence; the incomplete active job remains incomplete. |
| Candidate-specific renderer regression | NOT ESTABLISHED: both baseline and candidate stall before a special under unchanged normal rendering. One completed baseline frame's long wait is inside existing drawElements. No more stall probes were run. |
| Hardware real-time performance / Nintendo retail fidelity | NOT ESTABLISHED / NOT RUN. Simulation ticks, render submission and wall time remain distinct. No hardware-FPS or retail-equivalence claim. |
| Broad independent final source-admission review | INCOMPLETE. Automated tests and this browser report do not complete it. |

## Exact CI failure and minimal diagnosis

The first failing core step is **Check local module and stylesheet references**. `node --test scripts/tests/inkwave-local-references.test.mjs` returned7 tests,2 pass,5 fail. The first error is `Pinned reference source mismatch: inkwave-public/src/game/nav.js` at checker line107, test line16. Failing subtests are1,3,5,6,7; later negative-control assertions encounter that earlier pin error. The shell stopped there, so the following real-root `node scripts/check-inkwave-local-references.mjs .` command did not execute.

Static exact-head Git comparison finds the checker, test, and all nine inspected source/target mappings unchanged from main726. Three unique files have stale registry pins: nav.js, native-stages/runtime/engine.mjs, world/stages/index.js. For nav.js the expected SHA-256 is `419738ae4f8e23096b0ead55c9d353dc1e36867965d4515170dbe6046be3db4a`, actual `d6fc66dbb6f15957638d29d501e47fe281a68be8d229cfd981bea7b8d9d45e2c`; these actual bytes already exist on main726. The shadow fixture also copies engine.mjs without its relative native-helper dependency closure and reports extra missing-reference noise. This demonstrates an inherited inconsistent QA fixture/pin gate; it does not prove a sealed production site's imports are missing, and does not waive the failed gate.

The later **Retain bounded Turf finish evidence** upload fails because its directory was never generated after the earlier failure. The aggregate correctly prints `validate_core=failure patch_tests=success` and exits1. Neither missing upload evidence nor failed assertions should be relaxed.

**Proposal only, not performed:** independently review and refresh the exact reference pins to intended main726 bytes and give disposable negative fixtures valid dependency closure before each mutation. Preserve unknown-reference, traversal, symlink, build-only, shadow and emitted root/versioned digest rejection. Revalidate the repaired QA at its new exact head; old2e8 CI cannot become new-head success.

The active browser job has a separate termination: at13:17:43.557 UTC its runner reports a shutdown signal; page/context closure follows at the GPU identity read, `check-inkwave-idle-resources.mjs:168`. The log does not identify who/what initiated shutdown and does not show an assertion failure or job-timeout error. Its incomplete idle-resource and later runtime-profile checks remain unaccepted. No blind rerun or timeout/flag change was attempted.

## Requirements, originals and read-only endpoint limits

Pinned [workflow requirements](workflow-requirements.json) retain all nine workflow blob and SHA-256 identities. The validate aggregate explicitly requires both core and patch success. Supported official `/branches/main` and `/rulesets?includes_parents=true` reads returned main726, protection disabled, no required contexts/checks and no rulesets. These server settings do not waive the user's mandatory acceptance gates or authorize changing protections/Draft status.

Two generic read URLs were rejected by the connector's URL allowlist: `/rules/branches/main` and `/actions/jobs/120415050551`. They were not retried or bypassed; allowed branch/ruleset reads and dedicated workflow-job/log tools supplied the relevant evidence. No denied write occurred and no operation has an uncertain write outcome.

Full original decoded core and active logs are protected in the saved workspace. [Log receipt](failure-log-receipt.json) provides exact SHA-256 hashes, job links and selected original lines. [Original failing test step](core-failing-step-original.log) excludes credential/setup sections. [Static diagnosis](minimal-failure-diagnosis.json) includes every mapping hash and unchanged-main Git proof. [Terminal official readback](ci-terminal.json) retains workflow/job conclusions, failed-step records and active-job completed steps. Prior CI checkpoints and initial failing Reef records remain intact and are not rewritten.
