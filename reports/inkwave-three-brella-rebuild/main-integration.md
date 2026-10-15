# Reconcile the three Brellas with main bca45e7

## Integration identity and scope

- Previous reviewed feature head: `c4740010e14d09428a9f76b9bfc73ba4331a45c2`.
- Initial refreshed main: `1fca80b32c98455924afbbffeccd952fd0122b71`.
- Final refreshed main: `bca45e7cb55f3331a58459ea0219e42b44762712` (also adopts #1282 event FIFO paint).
- New main root tree: `cc437da59713b09808cd5b5b8c8aae4a9e862c03`.
- Exact local production content hash after composition:
  `20d2be1b2804648367af34622a0f06265fabebbf982b77d13e0ccf3e289de682`.

All 43 initially changed main blobs and the two subsequent #1282 network blobs
were copied from connector-fetched, SHA-verified deltas.
The only same-file overlap with this feature is main-weapon-catalog.mjs. Three-way
integration is conflict-free: main's scope-capability metadata and scopedCharge
field are retained, as are the feature's paid-preparation flag and cancellation
boundaries. No numerical record, kit, shot timing, input speed or collision behavior
was changed by the reconciliation. Weapon geometry, model poses and native-facing
predicate are byte-identical to c474.

New main also changes production camera/muzzle composition, the source fixture,
network admission, collision and paint hot paths. Therefore c474/b078 success cannot
serve as verification of this combination. Both before checkouts in the dedicated
visual/crowd workflow now pin bca45e7. This isolates the Brella feature from those
new common changes; b078 measurements remain historical, not substituted as the new
baseline. All test assertions and sample counts are unchanged.

## Local integration checks

- On the initial 1fca composition, 35 source tests passed: rebuilt geometry/Actor/shield contracts, 65-weapon facing
  A/B traces, 243 live holds, preparation/lifecycle/remote wire checks, plus the new
  main camera-aim and queue-hardening tests.
- After the final bca/#1282 update, all 22 focused source tests passed: canonical
  paint FIFO ordering, queue hardening, and Brella actual NetMatch/wire isolation.
- Final bca exact emitted-runtime geometry, all-three Actor contracts and actual NetMatch/
  wire tests: 10/10 passed.
- Final bca exact emitted-runtime admission/lifecycle/yaw ownership and 243 live holds:
  5/5 passed. Source-only mutation-based A/B comparison is not reclassified as a
  built-runtime control experiment.
- JavaScript syntax and whitespace checks passed. Main-only blobs were preserved
  with their remote Git blob SHAs; the catalogue merge retains both independent hunks.

Fresh immutable-head CI, real-browser images and ABBA measurements are required
before adoption; the exact run/head results are recorded on the PR after completion.

## Preserve the earlier evidence

The c474 head passed all four active workflows, including every general browser
shard and source Validate, without a rerun. Its dedicated browser/crowd run
[38220413546](https://github.com/rhgrive3/actions/actions/runs/38220413546) passed.
Its same-b078-baseline geometry cost and screenshots remain available as historical
evidence. The earlier e18 UI attempt 1 failed at menu entrance while its one allowed
unchanged-head attempt 2 passed all three rounds and Practice Range. These outcomes
show intermittency, not a diagnosed or repaired cause. No UI wait or assertion was
relaxed, and the focused read-only entrance diagnostics are kept outside this model PR.
