# Avoid empty Big Bubbler beam scratch allocations

## Scope

Baseline: main `45780e3a1f19945753f21c9cd2b169a19cc45ac7`.
Only runtime change: `damageBigBubblerFromBeam` in `patches/splatoon3/runtime/kit-big-bubbler.mjs` checks the combined live local/remote dome count before constructing its scratch probe and exclusion Set. The eligible zero-target path previously created both and executed zero contact iterations. Its ordinary return remains zero. No damage, geometry, visuals, scheduling, source rates, network ownership or RNG changes.

The production caller is `hitBeam` in `all-specials.mjs`: every eligible Killer Wail beam invokes this helper. The count is read on each invocation; there is no negative-result cache, so a later local activation or remote deployment is immediately eligible. Nonempty contact processing is unchanged.

All 18 other permitted open PR changed-file lists were checked on 2026-10-14; none contained this runtime file. PR401 was excluded and untouched. No held feature is adopted.

## Regression and provenance

- Existing Bubbler/source-rate suites: 55 passed, no failures or skips, including multi-dome piercing damage, source rows, remote proposals, owner authority, real Actor activation, reset/disposal and Tower behavior.
- New regression: eligible empty calls, no hit events or mutation of endpoints/ink/gauge; subsequent real local activation; unchanged authoritative damage; ineligible remote attacker; clear; remote-only deployment with damage proposal and unchanged remote HP.
- Negative control on original main: new test fails with exactly 1,000 Set constructions for 1,000 empty calls rather than zero.
- Tests used actual source modules and composed Actor fixtures loaded read-only from the immutable main Git tree, with only the runtime candidate and new test overlaid. This is source/fixture validation, not the complete emitted game or a browser/hardware test. Display/audio and fixture collision remain fixture boundaries.
- Final verification additionally hashes each retrieved Git blob before evaluating it: 146 unique baseline inputs verified. Final runs passed the new test, four source-rate tests and 51 broader Bubbler tests (56 total). A concurrent rerun had one process-level failure without assertion details; the same broad suite then passed serially (51/51). No clone, whole checkout or production build was performed.

## Bounded allocation and CPU diagnostic

Node v24.19.0, same machine, original main and candidate module; fresh fixture setup before timing. Warmup 100,000 eligible empty calls, then eleven batches of 1,000,000 calls. Return checksum is zero for both. Set construction counting is a separate untimed phase with 10,000 calls.

- Original: 10,000 Set constructions. Median batch 44.042647 ms; individual samples 70.674, 60.212, 56.541, 44.043, 44.874, 37.064, 38.607, 35.663, 41.065, 39.798, 47.998 ms.
- Candidate: zero Set constructions. Median batch 18.527609 ms; samples 10.378, 15.822, 18.528, 21.509, 19.231, 14.362, 33.738, 32.317, 24.086, 16.847, 11.907 ms.

These are isolated Node helper timings under shared-machine load. They are not match CPU, retained-heap bytes, GPU time, browser FPS or iPad evidence. The probe object literal is also bypassed by source inspection; only Set constructions were instrumented, so total allocation counts are not claimed. No performance acceptance threshold is inferred.

## Splatoon 3 comparison and remaining checks

The existing Big Bubbler 11.3.0 source rows, damage ratios and owner boundaries are unchanged. This optimization has no new retail behavior claim and does not resolve any previously unverified retail equivalence. Exact published-head CI, emitted production composition and browser checks remain required before adoption. No merge or deployment is included.
