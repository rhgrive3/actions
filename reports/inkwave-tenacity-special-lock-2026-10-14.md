# Tenacity: spent-special locks and one passive owner

Refs #469 and #647. Private candidate from official main
`45d60b3d11a66a8abea49ecf699aa1071f638095`. The original negative
reproduction below was recorded on `636e2b68`; the candidate was then
reconciled with the exact new main without changing its three code edits.

## Reproduced defect

The native Actor keeps `stormGaugeLock` after Ink Storm's throw animation clears,
and keeps `s3TidalSlamGaugeFinish` after Slam impact through landing recovery.
Both existing Tenacity helpers checked only `specialActive` and wrote directly to
`special`, bypassing the native turf-charge lock. In the complete production
composition, a real Storm activation, sub press/release and 21 subsequent ticks
reached `specialActive === null` while the lock remained positive and awarded
0.10833333333333332 charge in one 60 Hz tick. By 24 ticks after release, charge
was 0.43333333333333335 with 7.6 seconds of lock remaining. The displayed spent
gauge and `specialReady()` gate did not make that hidden charge legitimate.

The same baseline's Slam landing remainder increased from 8.803985507246377 to
8.912318840579712 on the next pending-recovery tick. Three new lock regression
cases all fail on unchanged baseline production files and pass with the repair.

A distinct integration defect doubled passive gain: the Actor installer added
3.24 points/s per deficit, then the production Match wrapper also added its
0/3.26/5.44/7.59 table after the roster update. At deficit one, actual Match
updates gave 6.5 points/s. This is not an intended alternate rate.

## Minimal correction

- Both helpers reject positive Storm lock and pending Slam landing ownership.
- The existing generated Match class advertises its post-actor Tenacity ownership
  using a prototype-local symbol capability. The Actor helper defers when that
  capability is present and the match mode is `turf`, matching the Match helper's
  existing mode scope. Ranked modes keep their Actor owner. No global ownership
  boolean or per-actor retained timer.
- Production retains the existing Match's coherent post-roster snapshot and rate
  table, including its SCU coordinate conversion. Standalone and ranked Actor operation
  retains its pre-existing 3.24 rate; standalone Match retains its table.
- No gauge curve, duration, readiness rule, damage, movement, projectile or
  numerical rate is changed. No speculative retail coefficient is introduced.

## Reference and confidence

Target remains Splatoon 3 11.3.0. Existing source records:
[Tenacity owner report](inkwave-tenacity-2026-10-05.md) and
[gear/weight report](inkwave-gear-weight-physics-2026-10-11.md).
The pinned Nintendo-derived GearSkillTraitsParam establishes head-only
MinorityUp, not the exact charge rate. The Match table comes from the documented
Issue #392 / community Tenacity target; the Actor scalar comes from a different
community measurement. This patch does not adjudicate those numerical sources,
average them or claim new primary-data/retail verification. It removes simultaneous
owners and honors the game's already-established spent-special locks.

The fresh 2026-10-14 open-PR audit covered 22 PRs using date-partitioned searches
and changed-file lists. Only #1226 mentions runtime/tenacity.mjs; that current
patch is identical to adopted main for this file and its body explicitly records
adoption. Its latest available comments contain no new residual-work owner.
No open PR listed either local-quality Tenacity file. The change does not claim full resolution of either Issue; final exact-head
hosted CI and browser checks remain required before main adoption.

## Verification

Current qualification is on exact main `45d60b3d11a66a8abea49ecf699aa1071f638095`
plus the three unchanged Tenacity code edits and the new regression file.

- New source suite: 8/8. It covers real Storm activation/throw/expiry at
  30/60/120 render schedules over fixed 60 Hz simulation, native Slam
  impact/recovery, standalone Actor/Match and composed rate, ready cap,
  explicit lock clear, dead/reset boundary, rejected full-installer reinstall,
  fresh VM isolation, delayed capability publication, post-roster death in both
  actor orders, and all four ranked mode strings at positive and zero clocks.
- Optimized production build completed successfully. Content hash:
  `0ae2091d4c54d5adf2385c0464bce7cf9bf514fd60ab01a043eca6529737d2cc`.
  Input hash: `51feec649856abe193684099317e3492175cc437015d6bbb60687d317b172ec6`.
  All 1,103 input hashes were checked: 1,100 match exact main Git blobs
  and only the three Tenacity code inputs differ, matching the preserved
  candidate hashes. All 1,742 emitted artifact hashes match the manifest.
- Emitted production-order replay: 7/7, exit 0. The explicitly source-only
  delayed-publication test is excluded with the test runner's skip-pattern
  option; it is covered by the source suite, not claimed as emitted coverage.
- Ranked coverage assigns each mode on a real composed Actor/Match and uses
  the native follower-clock control to retain playing at zero. It verifies
  passive ownership and Storm locking, not complete RankedEngine overtime.
- Adjacent source suites were rerun on this main: 14/14 (existing Tenacity,
  Roller composition, Storm display, Slam landing admission). The existing
  local-quality Tenacity suite passed 21 cases; its one optional emitted
  case remains skipped in this source invocation. Combined: 35 pass, zero
  fail, one existing skip.
- Earlier build/test logs remain preserved. Historical build attempts included
  an ENOSPC failure and an overly broad emitted selection that tried to link
  the source-only injected export. Neither is counted as success. On the new
  main, the first build invocation stopped before staging because this checkout
  lacked a local esbuild package; the successful build used the existing
  installed esbuild through the builder's supported module option.

The shared fixture uses actual Actor, Match, native adapters and full runtime
installers; Character/display and collision are bounded fixtures. Storm device
creation and Slam impact effects are stubbed because these tests own gauge state,
not projectile behavior. Death/reset boundary is an explicit state control, not
an end-to-end network respawn capture. No browser/device performance, GPU,
Nintendo hardware equivalence, or complete special-lifecycle parity is claimed.
