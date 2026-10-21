# Paint parity regression fixtures, 2026-10-19

## Scope and baseline

This candidate changes tests and this record only. It does not change paint geometry, radius, ownership, simulation timing, network admission, pooling, or a model. The two failures first surfaced in PR #1627 at `e4d3ab1c650f6d8eb6236f1a0d3c7501ce571be3`, general Validate run `39241023028`, shard 7 (`961/963`). Both reproduce with all consumed repository source verified against official main `00b8994711809ba6d0469723c858ddef6805e2ae`: 350 source files for #803 and 624 for Sprinkler, with no mismatched blobs. The model candidate is therefore not necessary to reproduce them.

## #803: use the same ownership contract for allocation-policy parity

The old reference applied only the historical Roller/body-edge adapters to raw PaintSystem. It omitted current #264 ownership of visible late rays and drips. The installed path includes that contract. Its final counts `[22,87]` versus the historical body-only `[17,53]` were a comparison of different paint semantics; immediate returned areas and immediate Actor turf/special credit remained equal.

The revised reference executes the current canonical implementation but discards available pool entries before every lease. This forces five fresh entry arrays and five fresh growth records, with zero reuse. The ordinary path must actually reuse both. Their complete grids, counts, version, growth-emission sequence and credit are compared exactly. The raw reference remains as a separate check for native immediate body area and immediate Actor credit. The other five existing pool tests, including 6,500 splats, no post-warmup allocation growth, reentrant leases, wall drips and clear/dispose, are unchanged.

Diagnostic mutations which remove late ownership or reinsert stale entry contents both fail the new parity assertion. This is an allocation-policy comparison, not evidence that historical raw paint and present canonical paint have identical final footprints.

## Sprinkler: compare matching terminal growth phases

The old test generated 300 owner frames, then delivered all 127 paint events together and advanced the receiver 300 more frames. The events have `instant=0`. The receiver's complete batch had finished growing, while the owner retained 12 recent stamps. A single cell was not yet owned by the owner. In the diagnostic, its visible ownership converged after three further paint frames; all pending records retired after sixteen. Three is an observation, not a hardcoded delay.

The revised test drains existing paint growth on both sides through the real `advanceSimulation`, without ticking the device or creating further packets. It requires zero pending records within eight seconds and unchanged event counts. It still compares complete grids and owner credit, retains actual JSON delivery, enemy overpaint, death persistence, and duplicate delivery checks. Duplicate packets must now additionally cause zero calls to `PaintSystem.splat`, even if canonical cell order would conceal their effect.

At 30, 60 and 120 Hz settlement intervals, a dropped real accepted stamp and a changed accepted radius remain detectable after both sides finish. These are settlement-rate checks; producer gameplay still uses its original 60 Hz input. A never-retiring growth negative must fail. An external diagnostic which clears both replay-sequence guards causes the duplicate assertion to fail.

## Validation boundary

These are CPU fixture repairs preserving current game rules. The original failing logs and main-only controls are retained. No new retail Splatoon frame value or renderer claim is established. Runtime visual comparisons and unfinished model work retain their separate acceptance status.

CPU validation on the official-main source composition: 12 file-isolated suites, 145/145 passed, no skips (128.22 s). The final changed tests were re-run together by file after adding an explicit admitted-stamp count to the radius negative: 13/13 passed. All three diagnostic mutations failed their intended assertions. A preliminary external wrapper which imported all 12 suites into one process exhausted the default V8 heap; that log is retained, and no heap increase or test removal was used. Production CI already isolates test files, so the final run follows that boundary. Exact-head CI for the independent Draft remains required.
