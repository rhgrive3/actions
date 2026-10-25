# Additional ranked queue changes, 2026-10-25

Base: PR #1870 head `8e539eac1e5fe4a6412d3e5852d7f5eaa5d0c1da`.
The complete 513-item current queue inventory yields 49 rows in this workstream: 11 newly implemented, 27 already represented by #1870 (including existing declined decisions), 11 still requiring evidence or a different ownership contract. Per-row reasons are in `queue-extra-ranked-dispositions-20261025.json`.

## Changes

- Preserve the final ranked-overlay clearing composite, then bypass unused unranked snapshots.
- Stop clam pickup field copying when the current eligible receiver list is empty; finally blocks still release nested scratch arrays.
- Reuse tick-local aim pitch cosine and exact event-kind comparisons.
- Reject non-shot barrier event kinds before fingerprint serialization, leaving eligible-shot authentication/replay checks intact.
- Build one Rainmaker wall LOS origin instead of an offset vector plus clone. Explicit additions on all three axes preserve signed zero.
- Reuse a zone center's current projection for its rectangle and numbered marker.
- Aggregate team clam HUD values in own-key order without values/filter arrays; retain sequential addition and finite fallbacks.
- Keep only power-holder keys for minimap markers, preserving key order and first actor with a duplicated ID.
- Build the carried-clam actor index only when a visible inventory consumes it; still hide stale markers on empty frames and release nested scratch references.
- Resolve normal data-property visual time once per clam-marker update. Accessor clocks retain original per-marker read behavior; rotation operation order is unchanged.

## Local validation

- `node --test patches/splatoon3/tests/drive-ranked-parity.test.mjs patches/splatoon3/tests/ranked-added-minimap.test.mjs patches/splatoon3/tests/ranked-clams.test.mjs patches/splatoon3/tests/ranked-barrier-admission.test.mjs`: 44 pass, zero failure/skip.
- `node --test patches/splatoon3/tests/queue-extra-ranked.test.mjs`: 7 pass, zero failure/skip. Exercises ranked removal/reentry, empty pickup and exception cleanup, 40 marker exact values at 30/60/120Hz with rewinding/nonfinite time and dynamic accessors, lazy inventory cleanup, Canvas command coordinates/projection counts, nonshot serialization rejection, and LOS allocation/signed-zero ownership.
- Combined final focused command including the seven new cases: 51 pass, zero failure/skip.
- Full existing `ranked-*.test.mjs` plus drive parity/new focused tests, with `--experimental-vm-modules`: **585 cases; 583 pass, 1 skip, 1 fail** in the original run. The sole failing family-representative test in `ranked-rainmaker-motion-actor.test.mjs` loaded an obsolete outfit transform anchor while the parallel motion workstream was updating composition (`Extra motion composition conflict: same tilt preserves signed-zero and nonfinite semantics`). No ranked assertion or game output discrepancy caused that failure.
- After the motion workstream removed that stale anchor, reran **only** `node --experimental-vm-modules --test --test-concurrency=1 patches/splatoon3/tests/ranked-rainmaker-motion-actor.test.mjs`: **5 pass, 0 fail, 0 skip**, 87.30 seconds. The formerly failing test now completes all 11 weapon families in both native/source states, with carry/charge/recoil and full aim range; exact support-grip and reach assertions pass. The retry includes four cases already passing in the original suite and does not add five new unique cases.
- Combined disposition of the original **585 unique cases** after this targeted retry is **584 verified passing, 1 existing skip, no remaining failing case**. This is original-suite evidence plus the targeted correction retry, not a claim that the whole 585-case suite was rerun after the correction. The initial attempt without the required VM-modules flag is not counted as verification.
- `git diff --check` clean. Other open PR heads in the current snapshot have no changes under `patches/splatoon3/runtime/ranked/`; these additional edits therefore do not duplicate another open PR's ranked module changes.

## Limits and Splatoon 3 comparison

Comparison target remains Splatoon 3 Ver.11.3.0 and the repository's existing rule/weapon fixtures. These optimizations retain simulation step cadence, score/penalty/winner state, shot admission and renderer command values rather than asserting new retail parity. Existing retail/iPad/Safari, real multiplayer handoff and device CPU/GC/FPS limitations remain unresolved. New tests are source/runtime tests with deterministic collaborators, not real device screen measurements.

Unsafe or unproven proposals were not silently implemented: exposed actor-position identity, mutable path metrics, partial paint dirty tracking, expiry event intermediate states, and field snapshots observable through synchronous Object3D hooks retain their existing contracts. Local close-range regressions and weak synthetic evidence are recorded per row.
