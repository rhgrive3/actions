# INKWAVE #8 / #1 / #3 — final combined acceptance

Date: 2026-10-04

## Inputs
- latest main: `17602ab094da6efb663d872934458e818ae3c93e`
- PR #60 iOS PWA / Gyro / Lifecycle: `25797fb0bc70f8690a66cf75fbd581f40ba7037b`
- PR #324 Motion / Animation / Visual Fidelity: `eed27876f10d463e416652e2a75d4f85d1c6cf78`
- PR #62 Input / Action Reliability: `979263f8155fa559ff6a53c9fb162ce3c715acfb`

The integration branch is latest main plus exact changed-file blobs from the three source heads. Main's CI concurrency/parallelization is retained.

## Final root-cause fixes
1. Optional DeviceMotion permission completion checks both request generation and lifecycle epoch.
2. Combined keyboard-dodge proof no longer depends on a synthetic mouse event.
3. The live rAF simulation is frozen only during the physical-keyboard edge proof so browser events reach production Input but unrelated frames cannot consume them before explicit fixed ticks.
4. The physical browser edge under test is Space press/release/repress. Fire and movement direction are deterministic dodge-admission preconditions; the runner asserts Space is present in both held and pressed Input state before each fixed tick.
5. The real game canvas is explicitly focused before the physical Space proof so stale gear-select focus cannot consume the key.
6. First- and second-dodge direction/fire preconditions are established only after the corresponding physical Space edge. Lifecycle boundary resets may clear unrelated held controls, but cannot invalidate the action-edge proof.
7. Responsive room-code checks are scoped to the current ONLINE owner, excluding only the intentional 340 ms `.is-leaving` retiree while preserving all typing/paste/join/geometry assertions.

## Acceptance coverage
- 24 hide/show suspend/resume cycles; stable listener/subscriber owners; one pending game rAF.
- 30,000 ms wall-clock gap rebases to dt=0.
- stale keyboard/mouse/touch/gamepad edges and gyro deltas are cleared without resetting cooldown/dodge/roll/projectile gameplay state.
- old/new gyro permission race, disable-while-pending, lifecycle-epoch race.
- 12,000 keyboard/gamepad/touch timing-fuzz cases across phase and render cadences.
- Chromium active/catalog; Chromium + WebKit UI/reliability.
- walk gait/turn/reversal, roller pose/model plus authoritative 21F/26F release/ink/projectile/damage, resting squid and 30/60/120Hz swim determinism.
- motion changes stay in presentation/model ownership and do not replace movement or weapon gameplay owners.

## Real-device pending
Physical iPhone/iPad Safari and installed Home Screen Web App gyro remain **real-device pending**. Chromium/WebKit cannot prove the OS prompt or standalone sensor delivery. Follow `reports/platform-lifecycle-real-device-checklist.md`: native prompt, stale-input/gyro resume, 20+ app-switch cycles and a 30-second background gap.

## Merge rule
This combined PR is acceptance-only. Do not merge it into main; source PRs remain the merge units.
