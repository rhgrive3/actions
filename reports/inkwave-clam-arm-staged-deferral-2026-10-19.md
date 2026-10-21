# Clam arm presentation: staged deferral, 2026-10-19

## Scope and evidence

This candidate follows the fixed PR #1627 diagnostic head `7893786003a79f65e4a64c945af9f463dd6fa483`. That head's native QA run39224948001 succeeded and produced252 original PNGs plus2 contact sheets. Successful mechanics and capture do not establish a faithful throw animation.

Actual Controller -> loaded Player00 Actor -> Match input on official-main b07 showed no event-frame wrist discontinuity. The same input on789378 introduced a0.300659WU jump on a normal power throw and0.494475/0.165034/0.166276/0.166539WU jumps during four small throws. The newly added success-event arm solver caused these differences. Rule state, source history, native channels and main muzzle were equal in those180 measured frames. The official preparation/release motion remains incomplete; reference camera/framing and retail timing were not recovered. See the existing [Clam presentation report](../patches/splatoon3/reference/clam-presentation-2026-10-19.md) for the original model/reference scope.

The initial-only and repeat-continuity prototypes are preserved outside this candidate. They trade initial grip for continuity and still have unresolved recovery-envelope/contact differences; neither is being silently accepted here.

## Production separation

The successful event-envelope repair, ball/inventory scale, flight/drill display, barrier fracture and resource reuse remain. The Clam arm feature is deferred for every weapon:

- `bomb-motion.mjs` returns to the main ordinary-bomb implementation with exactly the three accepted Rainmaker pending-support restoration hooks in sampleRelease, clear and pre-updateStates.
- The handoff owner loses only the Clam helper import and final Clam call. Rainmaker's bounded air correction and restoration remain.
- RankedWorld loses only its arm-only successful-event consumer and arm deduplication Set. Mesh/barrier/rule presentation remains.
- Ranked install loses that optional arm dispatch. The rest is byte-identical to current main, preserving independent event/effects/HUD/input changes.

No hidden flag re-enables the deferred code. Native T_THROW, physics/rule inputs and shot origins are not replaced by new visual estimates.

## Acceptance gates and negative control

The original789378 code, tests, captures and prototype manifests remain preserved. The same five production Clam test paths remain in both source and exact-emitted CI lanes; their scenarios are retained and now require baseline-preserving arms, rather than contact from an unaccepted action. They cover real event admission, native/source arms and history, ordinary shots/bombs, repeated throw, partial/full dive/return and lifecycle cancellation. The old789378 implementation fails these replacement arm gates while its independent ball/barrier cases pass.

The native80-image Clam suite retains all views and timing. Its success-event receipt requires both wrist positions, native clocks, pose channels and IK feedback to stay equal, with zero additional limb solves/full poses/Clam actions. Lower-shell residual remains visible in the receipt; no contact claim is made.

The separate Rainmaker-air20-image suite still compares against381319. Its before namespace now overlays both the historical handoff and its contemporaneous bomb helper, because that handoff imports the old Clam export. Rainmaker mode is fixed and each recorded frame explicitly requires the historical Clam branch to remain inactive. Both old sources are hash-recorded and production-adapted. The original128 Rainmaker comparison remains unchanged. Total capture denominator remains252 PNGs plus2 contact sheets from one production build.

## Verification status

Completed locally for the separated runtime: exact main-only180-frame Controller comparison including event records and recorded left-wrist/source/physical/muzzle state; six successful events have zero added wrist displacement. Old789378 remains a failing negative. Shared provenance/overlay contracts24/24 and Rainmaker source27/27 passed. The additional inactive-Clam Rainmaker full-jump driver and spawner geometry checks passed9/9 (168 corrected air frames and7 spawner cases).

The five-path Clam source gate passed21/21 (242.94 seconds); the same tests on preserved789378 passed10 ball/barrier cases and failed11 arm-related cases. Coverage retains66 family/pitch/native/source cases with49 samples each,12 real Controller boundaries with12 actual main shots and12 ordinary bombs, and12 partial-return throws at30/60/120Hz with zero added event jump. Frozen test hashes are reported with the candidate manifest. Exact emitted/native checks for this separated composition are required on its own new head;789378 artifacts cannot stand in for it. Local rendering is not claimed. Complete retail preparation/release motion and continuous whole-character visual acceptance remain open.
