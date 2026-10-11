# Conditional gear clocks across owner departure

## Reproduced gaps

The static loadout candidate preserves legal gear identities, but does not transfer active conditional clocks. An actual owner with 12 seconds of Comeback remaining became an adopted bot with zero. Opening Gambit with two earned extensions and a 60-second deadline reverted to the ordinary 30-second deadline on takeover.

A separate clock reconstruction based only on `match.duration - match.time` was rejected during testing: native host-clock reconciliation can move that value backwards and refund elapsed effect time. Global `G.time` is also unsuitable because it advances while the match is paused.

## Candidate

A versioned `gc` sidecar carries owner/life/adoption-sequence-bound remaining Comeback time, dead-owner eligibility, earned Opening extension count and remaining Opening time. It is consumed only after native owner/life/revision admission and successful fixed-slot static-loadout admission. It carries no AP, effect magnitude, speed, damage or special-cost multiplier. Receipts are immutable and bound to the local match object as well as match id.

Receiver-local active time advances once in actual `NetMatch.update(dt)`, before Match physics substeps. Only finite positive dt in active, unpaused, non-attract play advances it. Host clock corrections cannot move it backwards. Interpolated snapshots reuse the receipt's original deadline; newer same-life Comeback claims cannot refill it. Opening credits must not decrease, and each newly claimed extension can add at most the existing configured 15 seconds. Match-object replacement discards old receipts even if the room id is reused.

Dead-owner eligibility is retained after admitted native death playback, including departure before another snapshot arrives. This builds on the separate static-gear correction that restores admitted equipment before death playback clears the native snapshot buffer. A fresh hostile respawn can start a new Comeback life; old-life packets cannot replace it. Environmental deaths remain ineligible under the existing conservative lifecycle policy.

## Existing source values and limits

This change keeps the existing conditional profile: Comeback 20 seconds / 10 AP, Opening Gambit initial 30 seconds / 30 AP / 15 seconds per credited elimination. It does not newly establish those values from a Nintendo binary or change their existing calibration/source classification. The 86,400-second and 65,535-credit bounds are defensive transport limits, not retail ability limits.

The current game is owner-authoritative. This sidecar validates ownership, identity, slots, bounds and monotonic receipt behavior; it does not cryptographically prove that a remote owner earned a claimed kill credit or hostile death. Authoritative server validation remains unimplemented. Receipt aging does not infer unknown transit latency, and initial clock disagreement is handled conservatively rather than asserting frame-perfect retail synchronization.

## Verification

Separate actual Actor/NetMatch realms send ordinary owner packets through JSON. Cases cover 30/60/120 Hz, waiting before takeover, pause, host time rollback, duplicate/stale/foreign packets, legal death/respawn, immediate dead-owner departure, impossible bounds, extension replay, roster rebind and new-match isolation. The first complete production-built run passes 53/53: 15 new clock cases, 17 existing conditional regressions and 21 static-loadout regressions.

A new exact browser-probe body additionally uses actual Actor updates and actual JSON admission for Comeback and Opening Gambit, including pause and host-clock rollback. Its local contract test passes. DisplayCharacter now supplies its required color field for the existing spawn-motion hook; the gameplay respawn path is not bypassed. Actual Chromium/WebKit evidence is pending future publication after the static-loadout change.

This is an independent local candidate. Publication order remains powered-envelope/weight PR 1239, static loadout adoption, then these conditional clocks. No all-gear or retail-parity completion claim is made.

## Missing-sidecar regression

Additional self-review found that a newer missing or rejected clock sidecar could leave the last rendered Comeback number frozen, and that a new-life snapshot without clocks could retain an old-life buff. Two actual JSON reproductions failed before correction. The receiver now continues aging its last immutable same-life receipt when a later sidecar is absent, while a new life without valid receipt clears Comeback and pending eligibility. Focused death/absence/new-life regressions pass 4/4; full rebuilt suites are rerun for this correction.

## Ranked-main composition

The candidate is locally composed with main `b49de995` and static loadout PR 1242. Four additional tests install actual ranked runtime and real Physics, then send objective, gear and conditional-clock sidecars together through JSON. All four modes preserve 10 seconds of Comeback after an 8-second owner period plus a 2-second receiver wait, pause without consuming it, and expire after the remaining active interval. The source group passes 4/4; the final built and full gates are being rerun on this composition.

The newly shipped ranked engine was also checked directly for Last Ditch Effort: all four modes restore an authenticated current-host opponent count of 30, recompute 18 ink AP locally, reject an un-restored local count mutation, and retain the legal effect after host takeover. Source and production-built groups pass 4/4. This replaces relying solely on the earlier optional external-PR compatibility fixture; it does not expand the owner-authoritative trust boundary.

## Ranked composition gate evidence

The broad source gate completed with 3,849 tests: 3,839 passed, 10 explicit optional-reference skips, zero failures (866.2 seconds, concurrency four). Runtime files stayed unchanged during this run; the final browser-probe isolation and four shipped-ranked LDE cases were additionally checked separately. The production-built clock/static-ranked group passed 26/26 at content hash `793273104c4ced4a2ddd61228513a4a5c8676f6b8b2fe95590e9bab7860b4ed8`. Both extracted browser-probe contract tests pass against source and built modules. Each probe restores the shared `G.time`, so later native tick/sequence assertions are independent. These are local contract checks; actual Chromium/WebKit execution of the conditional-clock addition still awaits its separate PR.

## Independent review follow-up

The actual composed `Match.update` actor loop was exercised at 30/60/120 Hz. While the actor remains remote, it calls timeline playback and makes zero Actor.update calls; after takeover it invokes Actor.update once per simulation step. Remaining Comeback time falls by exactly elapsed active time in both phases. A further Opening case covers missing sidecars, expiration, equipment changes, a new life and same-match rebind without reviving the old deadline. The helper now returns inactive zero during partial initialization before configuration; the full installer configures it before actual Actor gear refresh. Source clock cases pass 22/22; production-built clock/ranked/browser-contract cases pass 28/28 at hash `4f573f021b849de33cfbe97f2791b3bae51ce9a249f78ede7cfcff467effc1fb`. The latest-main network gate also passed 448/448 before this fail-closed initialization guard.

The match-replacement case now creates and binds a genuinely new NetMatch. The production reliability layer intentionally rejects a second bind on an already bound connection; the former fixture changed G.match while that guard left NetMatch.match unchanged. The corrected new-connection isolation case passes against source and built modules, without changing the runtime guard.

A wider downstream source run caught an initialization-guard regression in the pre-existing pure conditional/Flow composition test: that function already receives explicit tuning, but the new helper consulted only installed module configuration. `conditionalBonus` now passes its explicit tuning into `openingRemaining`, while a truly unconfigured call still returns zero. The existing pure composition cases plus all 22 clock cases pass 25/25 after correction.

## Final independent local gate

At runtime commit `64aede85`, the frozen full source gate completed with 3,858 tests: 3,848 pass, 10 explicit optional-reference skips, zero failures (1,046 seconds, concurrency four). The rebuilt clock/ranked/browser-contract plus pre-existing pure conditional/Flow cases passed 30/30 at content hash `7efd241687287977358ec0c01564d5873b5e6059cb8506f8aa6b99b1898100aa`. Main `9e865ddbe08c7b4dcde56f87cdfcadf13c175da1` was reproduced through the GitHub connector; its additional README-only change removing public-site promotion is retained. Static equipment PR 1242 is merged. This candidate contains only conditional-clock changes and tests; Tacticooler/Drop Roller transfer remains separate. Actual Chromium/WebKit execution and exact-head CI remain pending publication.
