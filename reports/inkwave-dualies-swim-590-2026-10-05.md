# Dualies swim first shot, Issue #590

Baseline main fc057af9baac421ec707504f4637e2ed8824a444. Issue claim 5992189556. No main merge or external implementation publication is performed by this lane.

## Root and reference

The existing `weapon-edgecases` Actor wrapper records `s3DualiesEmerging`, and the first admitted runner call skips humanoid startup. Native generic emergence is therefore the entire swim startup: the existing regression measured first shot on counted frame6. The current community Splat Dualies description says first fire from swim takes13 frames (https://splatoonwiki.org/wiki/Splat_Dualies). This correction uses that documented target, with explicit calibration provenance. It is not directly extracted from the pinned raw weapon table or a new Switch timing measurement.

Frame convention is unchanged from the existing humanoid regression: the recognized input update is frame1, so frame13 equals12 elapsed simulation intervals / .2 seconds. Human3F similarly means2 elapsed intervals. No13F is added after the generic emergence delay.

## Implementation

At a fresh fire edge while the actual Actor is squid, start a private runner countdown from profile `swimFirstShotDelay=.2`. Native form conversion and generic emergence continue concurrently. The runner cannot emit or debit shot ink until both its existing admission and this countdown permit it. Once accepted, it skips the separate humanoid2-interval startup. Existing damage/spread/velocity/roll distance/ink amounts and native shot events are untouched.

Cancel the pending countdown on release, sub, special, super-jump, death, reset, weapon replacement, Dodge/lock or a new dive. Clear native fireBuffer only when discarding that pending startup, so canceled taps cannot reappear later. This does not redesign generic buffered fire for other weapons. The countdown is Actor-specific and progresses with the simulation dt. Remote projectile replication remains under its existing owner and packet format.

The separate old PR318 owns post-roll/post-shot action gates; PR549 owns Dodge startup and Blaster first shot; PR493 owns Slosher swim18F. Searches and their current scopes found no duplicate implementation of this fresh Dualies swim root. Their future full composition must retain all owners.

## Validation

- Source focused5/5 plus existing edge-case16/16, including the earlier6F assertion deliberately replaced by independently tested13F input-edge behavior.
- Actual emitted build40871fc6ac7b: same21/21, without applying source adapters again.
- Actual native Actor/Runner: shots13/18/23 with zero early shot ink, generic emergence0/2/5/10F in parallel, canceled taps after1/4/8/12 held frames, seven takeover/reset cases, render30/60/120/144Hz through FixedClock.
- Existing stable humanoid3F, normal5F, turret4F, low-ink and other weapon/collision regressions retain their own assertions.
- Numeric status is regenerated; the new field is calibration/unverified rather than claiming pinned raw derivation.

## Limits

Tests use native gameplay modules but stub scene collision/display in the timing fixture; real browser input/display latency, Switch recordings, network ordering and exact emergence bone animation are not newly accepted. Recently emerged humanoids whose fire edge occurs after exiting swim are left under the previous generic/humanoid policy; this root captures actual swim form at the recognized edge. PR530/549/318 and the full integration tree require their combined acceptance before publication. No special armor, extra movement or animation coefficient is introduced.

## Focused integration follow-up

The actual PR536 `sub-action-adapter.mjs` (#530) from the integration lane was applied after this source adapter in a separate native-module fixture: the five swim startup cases all pass, including admitted sub cancellation. This confirms the direct shared dispatcher boundary. It is not a full integration tree/reliability/browser run; PR549/318 remain unincorporated dependencies.

## Additional reference boundary

The wikiwiki verification table (v10.0.1, https://wikiwiki.jp/splatoon3mix/検証/メインウェポン/前隙・後隙) reports human2F/swim11F for Splat Dualies. Its observation starts at visible turning / fading swim ink gauge and ends immediately before shooting becomes possible. That is a different stated boundary from the Inkipedia13F first projectile target selected by Issue590. This patch defines its input-recognition-to-projectile count explicitly; it does not prove that either community observation maps exactly to this engine's input/update ordering, or reconcile both tables by guessing another offset. Additional physical capture would be needed for that claim.
