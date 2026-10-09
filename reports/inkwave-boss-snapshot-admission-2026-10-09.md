# Host Boss snapshot admission (unassigned issue number)

## Actual counterexamples

On aggregate base `239503a9`, host ownership did not validate the Boss snapshot body. The native `NetMatch.onMessage` tick path passed `d.B` directly to `Boss.unpack`, then `_sampleBoss` and `Boss._follow`:

- `{}` became undefined scalars and then NaN Boss position and clock.
- Native `Boss.pack(false)` with its crablet list replaced by `[null]` threw in the actual guest follow loop.

Both negative controls execute all six production build transforms, the real S3 runtime install and every extra bootstrap installer in source-verified order. Boss construction/navigation/render sinks are bounded fixtures, but ingress, unpack, interpolation, follow, pack and move generation use native code. This is not browser/WebGL or live relay evidence.

## Fix boundary

The current host's Boss component is validated before unpack/buffering: native 18/19-field row shape, finite scalars, native discrete fields, nested six-field crablets and optional full move data. Malformed Boss data is omitted; valid actor/event/clock content of the same tick keeps its existing owners. No new whole-packet rejection, network epoch or host authority is introduced.

Position/velocity/heading safety limits reuse the existing actor snapshot guard's engineering limits. The clock uses the existing safely representable rounded-millisecond rule. Phase, flags, animation, crab and move shapes come from native `Boss.pack` and `BossBrain._start`, not a Nintendo calibration. Valid negative finite HP is not converted to zero or rejected.

All six native move generators across phases 1–3 are regression inputs; valid snapshot-only/full records, normal crablet interpolation, current-host ownership, omitted Boss payload and recovery after malformed data are covered. The unrelated Boss timeline event `bm` admission is not expanded by this patch.

## Verification status

Final focused tests pass 6/6, including both removed-guard counterexamples. The unchanged adjacent Boss timeline, actor snapshot, clock and event-envelope cases pass 21/21. Syntax, quick source/reference and whitespace checks pass. These were bounded concurrency-1 runs, not a repository-wide suite.

The valid-packet checks also exposed an independent native `_sampleBoss` exact-latest-timestamp bug. These schema tests sample just after that boundary so they isolate admission; the boundary defect has its own follow-up change and regression rather than being misreported as malformed data.

## Reference limits

Splatoon 3 reference remains 11.3.0. HULLBREAKER is INKWAVE-specific; this is defensive decoding of its existing protocol, not a claim about a matching Nintendo Boss or new balance/timing values. Browser, live relay and Nintendo hardware were not tested.

## Independent follow-up: exact latest playback timestamp

Normal-packet validation exposed a separate native sampling error. When `t === last.t`, `_sampleBoss` selected `s0` (the oldest retained snapshot) because its final choice used `t > last.t`. A two-packet example with x=3 then x=9 replayed x=3, HP=100 rather than 40, and Boss clock=0 rather than 10 exactly at the latest timestamp. The strict comparison is now inclusive. Extrapolation, correction springs, timestamp rates and interpolation formulas are unchanged.

Two additional complete-bootstrap/native-path tests retain the removed-fix counterexample and check the exact boundary's pose, clock, HP, phase, animation and crablet state. Final combined Boss snapshot/boundary tests pass 8/8; syntax, quick and whitespace checks pass. This is a separate commit from schema admission and makes no Nintendo timing claim.
