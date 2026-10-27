# Projection test / phase-route compatibility

## Preserved automatic failure

Automatic PR run [40472337256](https://github.com/rhgrive3/actions/actions/runs/40472337256),
source `8bcc34ac3d9d4713e45490bce1778d1c6d588be2` (local frozen source
`86066e3e5b1fe97540c31704ca2ad835f95dbdcb`), failed job `122082208952`
before candidate build or capture. Its source/UI command passed 100/101 tests.
The projection test at line 64 rejected any `if:` on the ordinary comparison
step, including the exact reviewed PR1895 alternative to the stricter
three-lane phase verifier. This is a QA integration conflict, not evidence of
browser, camera, source-phase, paint or SP drift.

The normal GitHub job-log response is preserved locally at
`/workspace/shared/inkwave-native/role-3/.ci-scratch/native-phase-acceptance-8bcc/after-job-122082208952.log`,
SHA-256 `60ab288e462de03b5fcce6b0bb38997b053f322eae63105321deb919d8815233`.
The unchanged projection file locally reproduces 8/9 passed and exit 1;
`projection-before.log` in the same directory has SHA-256
`3d686d8c1ab635b005e2c5582fe80ed222ccc2b0e0e09184d7c9af2e2398f9f2`.
The failing upload explicitly found no candidate files; there is no after
artifact to reinterpret as accepted.

## Narrow separate-branch change

Only the projection test is changed. The existing full-workflow byte seal is
verified, but its returned historical workflow is **not** substituted into the
test. Assertions inspect the current executable workflow directly:

- The ordinary comparison must retain its exact negative PR1895 condition,
  original before/after arguments, `--require-complete`, and no historical FOV
  normalization or `continue-on-error`.
- The alternate exact positive PR1895 condition must require the existing
  strict three-way verifier, independently downloaded phase-control artifact,
  original/control/target paths and original source-control receipt.
- All three actual capture lanes, their precise side conditions, modes and
  commands remain required; comparison must still depend on `capture`.
- Removing, reversing, misrouting, skipping or weakening these paths is
  rejected, including missing target/compare steps and `if: false` substitutions.
  An unknown condition or changed sealed fixture hash also fails.

No workflow, source receipt, observer, comparator, runtime, numeric tolerance,
capture image or frozen `8bcc` source is changed. This local branch is for a
future normal automatic PR event after independent review; no manual CI or
browser retry is performed.

## Focused verification

- Projection and explicit route/hash negatives: **11/11**.
- The four unchanged UI/intro test files read from frozen role-1, plus the
  repaired projection test in role-3: **103/103**. This reproduces the failed
  source-test stage without modifying frozen files.
- Projection plus phase accounting/orchestration and historical workflow-seal
  compatibility: **28/28**.

These are source/VM checks, not the later Chromium intro test or candidate
native screenshots. Original/control running-lane evidence is preserved;
three-lane acceptance remains blocked by the missing target capture until a
future exact-head automatic run establishes it. Any original-only pixels are
controlled capture-protocol evidence, not ordinary user-input or retail proof.
