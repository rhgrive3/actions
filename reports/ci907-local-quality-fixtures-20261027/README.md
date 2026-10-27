# Exact907 local-quality fixture corrections

Base `90706e3778586fa6c9d09a64ac354e547086e1c0`; isolated test-only code
`3643bdbca4e735c8c721f6161846b4bd19418a22`. Runtime, frozen JSON, character,
rig, hair/model, workflow, threshold and physical-comparison files are unchanged.

## Actual new core failure

[Job122020314174](https://github.com/rhgrive3/actions/actions/runs/40451016135/job/122020314174)
passes step7's e038 workflow-pin contract, then fails step41,
`Verify local quality regressions`:1817pass/17fail/8skip. The later missing
Turf/launch uploads are secondary to skipped producers; their gates remain strict.

The17 failures have three concrete fixture causes:

- Fifteen pause tests: the empty-world Physics double lacks `segment`, now used
  by the actual native shot-guide path. Add a counted no-hit method consistent
  with its empty raycast. Initial and resumed native queries must execute, while
  paused queries remain zero. The original15 test bodies are byte-identical.
- AABB test: literal borrowed-method receivers lack `markCollisionChanged`.
  Inherit the real Level prototype and initialize revision0. Every original
  `Object.is` bound assertion, finite/fallback/negative-zero case and getter-read
  assertion stays; actual revision advancement to1 is additionally required.
- Sparse source-pose test: its frozen dense-storage SourceController bypasses
  the subsequently added common walking-display adapter, while the current
  sparse controller receives it. Apply that same existing adapter to the old
  control **in memory**. No frozen byte is replaced. Inverting only the common
  import/speed block restores the exact frozen source. The complete strict
  pose/contact/skeleton/muzzle and camera-follow test body remains byte-identical.

The last correction isolates sparse storage under the same walking behavior;
it does not assert that the newly requested walking display equals the older
raw-speed presentation. No epsilon, rounding or omitted pose field is used.

## Focused results

| Check | Result |
| --- | --- |
| Local original missing-segment reproduction | selected case fails |
| Local original missing-revision-method reproduction | selected case fails |
| Final pause source tests, including native-query control |16/16, no skips |
| Original real Level AABB case |1/1, no skips |
| Original real source-bank pose/camera at30/60/120Hz |1/1, no skips |
| AST/body/frozen-control proof | original bodies/assertions retained; frozen JSON unchanged; common walk replay exactly reversible |
| Unchanged907 runtime audit at candidate |1493 committed inputs/2199 artifacts, zero mismatches |

`assertion-and-control-proof.json` records body and frozen-source hashes.
`validation.json` records exact commands and compressed-log hashes. This is
focused **source** acceptance, not an emitted test pass or a replay of1842 tests.
No build is needed because none of the runtime inputs changed.

The first newly added probe incorrectly demanded fresh old paused guide sweeps;
the valid guide cache instead reused its result. Its15pass/1new-failure log is
preserved. The corrected probe requires actual initial/resumed native queries,
zero new paused sweeps and unchanged strict resume state. It does not demand
redundant work or remove any original assertion.

The separate catalog missing-module audit and52-capture paint/SP contract are
outside this patch. PR1895 remains at907 pending independent review/integration;
there is no manual CI rerun, metadata retry, new PR or merge in this handoff.
