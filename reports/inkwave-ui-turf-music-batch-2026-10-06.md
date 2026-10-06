# Fixed UI batch: live Turf lead / final-minute music

## Scope

Two roots, three Issues: #99 with duplicate #748 (qualitative live Turf lead/Danger), and #742 (remove extra bar wait at the final-minute BGM event). No other root is added.

Baseline public main: `671e3dedcf7993d75460ac2fbb2687217195bda3`, tree `e6cd397901eebf3e8c545d3228238688e4f1113e`; local base `6fd188aa51db4e151458b142d3bf023bb0827a27` is tree-identical. The latest open PR #781 contains kit/residual gameplay files, not either UI root. Earlier open-PR actual-diff checks and primary claims are recorded in the focused reports.

The existing main UI corrections (#715/#718/#720 and lifecycle cleanup) are retained. Composition only combines the two quality registrations and appends both reports. The Main music hook and Match/HUD presentation hooks do not replace one another.

## Local composition evidence

- Focused actual composed source: 22/22 (13 Turf including verifier negatives, 9 music).
- Actual emitted modules from one combined authentic build: 22/22.
- Local-quality plus idle-resource gates: 171 total, 169 passed, zero failures, two existing optional skips (Tenacity emitted path and forced-GC collection).
- Combined build: `3cf414ae2b29c23a58dbe50e44c1163905cdd402c0e1dd5c1ab8bf654c4223e8`, 145 preloads.
- Standalone minified coverage: 13/13 Turf and 9/9 music. Production hashes are unchanged from those focused candidates.

## Pending browser acceptance

The existing UI CI runner now captures eight controlled Turf presentation PNGs (both viewer teams, 1280/375 widths, ahead/behind), with below/tie/finish clearing and Range combat-bar suppression checks. The serialized inspector rejects hidden/zero-opacity ancestors or Danger labels; it checks bounds and separation from the timer/self-arrow. Failure phase/rows and PNG are preserved before restoring the controlled scene. Negative controls reproduce the previous verifier's hidden-HUD false pass and confirm rejection after the correction.

These are prepared assertions, not completed browser results. Local Chromium's previously established EPERM restriction remains; no bypass is used. Exact source/content receipt and visual inspection of the new PNGs are required from this Draft's CI. The small viewport does not prove physical mobile hardware behavior. Final-minute evidence concerns WebAudio scheduling, not physical listening, Switch timing or real network audio synchronization.

See [Turf scope and limits](inkwave-live-turf-lead-99-748.md) and [music scope and limits](inkwave-final-minute-music-742.md). The 10-point Turf threshold is supported by the cited competition account; 1.08 emphasis remains a local layout choice, not a measured Nintendo pixel ratio.
