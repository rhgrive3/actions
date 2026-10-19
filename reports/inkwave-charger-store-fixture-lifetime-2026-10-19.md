# Charger-store test fixture lifetime (2026-10-19)

## Scope and cause

Test-only change to `patches/splatoon3/tests/charger-store-359.test.mjs`.
No runtime, model builder, cache policy, geometry, rendering or gameplay change.
The existing [S3 behavior comparison](inkwave-splatoon3-behavior-2026-10-02.md)
is unchanged; this report makes no new S3 frame/parity or physical-device claim.

The test already reused its VM, but its 18 scenario cleanups released every
native style reference and rebuilt the same game/hero geometry 36 times.
Read-only measurement of six representative clock cases attributed 13.35s to
six hero-build ticks and 0.29s to the remaining 431 update ticks. The fixture now
keeps only its first already-tested Character alive until final suite cleanup.
Every later scenario still constructs fresh objects; no warm-up Actor is added.

## Preserved coverage

All seven original test bodies and 68 existing assertions are byte-identical.
This includes 30/60/120 Hz charge/store, cancellation, refill, death/reset,
replacement and owned/remote wire checks. WeakSets and counters verify 23 distinct
Actors, Characters and Skeletons across 18 cleanup epochs. Every scene root is
removed at its original boundary; all non-retained Characters are disposed.
Both held style geometry hashes and the retained Actor's state remain unchanged
across later scenarios. The final native release runs in finally, and final
hair cache entries/liveUsers are both 0 (builds 2, releases 69, disposes 2).

Explicit Node name/skip/only filters omit only the whole-suite 23/23/23/18 totals.
Per-case identity, immutable geometry, state and final cleanup guards remain.
Normal full-suite CI still requires the exact totals. Full 7/7, selected 1/1 and
zero selected cases were checked. Four mutation controls reject reused Character,
mutated geometry, contaminated retained state and omitted final release.

The dedicated cold/native lifecycle suite `issue-483-native-hair-cache.test.mjs`
is unchanged (blob 37d6254c287e4d0b238e2e1d1e9e717c5e00e002). Its 10 cases ran
successfully in [PR1656 patch6](https://github.com/rhgrive3/actions/actions/runs/39242322009/job/118025852569),
including builds 81/disposes 81, cache 0/0 and native negative controls. That job
failed an unrelated launch fixture; it is not counted as overall CI success or
this candidate's final-head result.

## Measurement and integration

Matched source-only CPU runs on main 00b89947, using per-child os.wait4 rusage:
- Original 7/7: 56.1891s, peak RSS 363.3281 MiB.
- Candidate 7/7: 11.3701s, peak RSS 341.0898 MiB.
- Time reduced 79.76%, peak RSS reduced 6.12%; one paired measurement, not a
  statistical benchmark or browser/device performance claim.

All 535 consumed source blobs were checked against the official base, with only
the declared test overlay. Both runs retain the existing optional VM import
warning. An earlier cumulative RUSAGE_CHILDREN result was excluded.

Publication base b75bc56e2e3fa970357b3bc92f63395c7c397353 retains all 37 external
changes since 00b. Its target test has the same original blob 9f3ec943. A strict
current-main integration run passed 7/7 (537 consumed blobs, zero mismatches).
The performance comparison above uses the same 00b base on both sides.
Candidate SHA-256: edbbe88705bc006b8c14136eb5ab80752f75afa081b3bec6defd327b540e3b0f.

All required CI on the final published head must still pass. Local/source results
and the older cold-suite job do not substitute for that final-head acceptance.
