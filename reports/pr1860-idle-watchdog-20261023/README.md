# PR1860 idle-watchdog QA-only successor

Candidate `07520a193bc792d6fd71ae796e2c2e9170150563`, tree `066434da855dee3de5eb7853d10af6459f6f25a8`, is a direct child of current PR head `05eb9b8243bfba7e166600990df33ac19bbaa0c2`. The review branch is `candidate/pr1860-idle-watchdog-20261023`. The PR remains draft at 05eb; no PR advance, workflow dispatch, rerun or cancellation is performed.

Exactly three tracked paths change, byte-identical to official donor `2d164d063050c15266febcb6af88109938f26701`:

- `scripts/check-inkwave-idle-resources.mjs`: blob `bc5ad497b0b2d3e5f21e792d9c0ced0608b822d9`.
- `scripts/tests/inkwave-idle-evaluate-deadline.test.mjs`: blob `0dcb6fe498086c81a2c5218347ca7cd8f451274f`.
- `scripts/tests/inkwave-idle-resources-gates.test.mjs`: blob `d384824f3ac170167db9ff5e3dd0a62ee77e7518`.

The host watchdog bounds evaluate operations at the existing 120000 ms value, preserves primary errors and available failure receipts before cleanup, and avoids asking a timed-out page for more diagnostic evaluations. It does not claim cancellation or GPU completion. Existing browser flags and the entire `validateIdleResult` acceptance block are unchanged. The new tests are imported by the existing idle gate. The strict artifact guard and workflow are byte-identical to 05eb. All other tracked blobs, the full production/patch trees, build/composition code and enemy-exclusion runtime remain unchanged. The existing immutable build is verified against both commits: 1423 inputs, input f65b5c1b…, content 535fb315…. This is preservation evidence, not a new emitted build or GPU acceptance run.

Exact candidate focused controls pass **49/49, no skips**:

```
node --test --test-reporter=tap scripts/tests/inkwave-idle-resources-gates.test.mjs scripts/tests/inkwave-wall-diagnostic-workflow.test.mjs
```

These controls cover success, synchronous/asynchronous failures, the exact 119999/120000 ms boundary, never-settling and late-settling evaluations, real desktop/cold setup wiring, failure-before-cleanup ordering, cleanup/diagnostic failures, retained error identity, schema rejection and strict artifact mutations. They are host-side doubles, not a real idle browser/GPU pass. Official candidate ref, commit parent and all 24 root entries match; all three donor blob bodies were decoded and rehashed successfully.

## Original CI evidence

Run `40002056206`, active job `120632446674`, exact head 05eb: flow, wall and resource render passed, idle entered at `20:33:06.3230724Z`, then the runner received an explicit shutdown signal at `20:39:50.5521730Z`. The following line168 page error is not evidence of a runtime assertion or a diagnosed root cause. The full original decoded log is preserved losslessly with SHA256 `95aa0491294e585b3aabdcd18938f60469ab91fa585e93e3f940465913f7c8cd`.

A single late native job-list lookup found core job `120632446662` completed with failure. Its aggregate QA step has **127 pass / 1 fail / 0 skipped (128 tests)**. The first failure is `scripts/tests/inkwave-31pr-paint-source-pair.test.mjs:18`: `current source must match the additional fixed epoch`. A targeted local reproduction on the QA successor fails the same assertion. Comparing all thirteen frozen leaves identifies two already-existing mismatches: `scripts/inkwave-source-composition.mjs` and `scripts/lib/inkwave-build-only-modules.mjs`, which include the spawn-exclusion adapter absent from that historical tuple. Neither file changes in this successor. No source-pair assertion or admission is weakened here.

After the aggregate failure, emitted producer steps were skipped, and the strict Turf/launch artifact uploads failed because their files did not exist. Those guards remain intact. Full original core log, targeted failing reproduction, mismatch hashes, native job snapshot and the run/PR snapshot are retained. The original run was still in progress at its recorded run lookup; no busy polling is used and no overall success is claimed. A generic job-URL fetch was unsupported; the authorized native workflow-run job listing supplied the status.

Read `summary.json`, `preservation-proof.json`, and the two official readback proofs first. The watchdog successor is ready for parent diff review. Existing idle GPU acceptance, the separate fixed source-pair assertion and overall PR1860 CI acceptance remain unresolved. Hair/character models, production runtime and Work are untouched.
