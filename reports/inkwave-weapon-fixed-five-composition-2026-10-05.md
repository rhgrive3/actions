# Weapon four over published fixed five: differential acceptance

The earlier read-only review's “not published” statement was correct for its10:41 read of PR536 at a9e6618. The fixed five592/588/571/567/595 were subsequently published as **ef712f898753677b9d806b2f44cf3e473d2670ae**, tree**a80b019bd800fae2297482320a535c15755fa4f8**. This execution uses its identical immutable local base**9543e3e5cfc5643e8b3ee76515de2ee2883c3c93**.

The four independent candidates563/596/590/566 are applied here. Shared report additions are retained; profile adds only Dualies.swimFirstShotDelay=.2 and Charger.swimChargeStartDelay=.1 plus the existing documented Dualies provenance update. Every pre-existing profile value was compared and retained. The numeric mirror has411 entries. No additional production correction was necessary.

## Executed differential cases

`node --experimental-vm-modules --test patches/splatoon3/tests/weapon-fixed-five-composition.test.mjs`

Five tests passed, zero skipped. The focus case was subsequently strengthened to attach the actual calibrated gyro to the native PlayerController and independently passed again; other cases were unchanged.

1. **592×563:**actual Storm activation and water death leave one thrown bomb; its actual native bomb update later creates one cloud. Both local and ghost-recipient paths produce480 eligible damage calls,479 at the preceding boundary, exactly one end/removal and no481st damage. Owner remains dead; remote targets are excluded and ghost paint stays zero.
2. **592×596/590/566:**actual Character/Runner states are created, then legal special activation in water splats the owner. Runner reset clears Dualies pending startup, Charger charging and Slosher track. Accepted remote death/reset and a fire presentation while dead do not revive a Slosher track.
3. **567/571×weapons:**real Mobile FIRE contact survives native KeyW during startup, preserving Dualies index12 (counted13) and Charger index6 deadlines. A contact canceled before admission leaves no round/beam. Unchanged held-pad polling preserves the touch Map latch; deliberate keyboard ownership closes it. A paid Slosher still emits9 units at its committed12F boundary under Map fire masking.
4. **588/595×startup:**native iOS raw calibration and smooth deceleration reach rrA; a .01 stationary residual retains that source. This gyro is attached to the native controller. Blur plus the existing platform input reset cancels pending main input; changed blurred samples cannot move controller yaw/pitch or advance kidT. Simulation updates continue advancing kidT and clear the pending Dualies attack. Focus first sample rebases; a fresh input takes the current human startup, not the old swim countdown.
5. **596 owner/remote:**actual owner Character next to wall-front .45 uses the guarded birth. The native recorder creates9 valid33-field packets; remote native replay preserves birth positions within existing .009 world-unit coordinate quantization and exact velocities. Moving the observer and making its getMuzzle throw demonstrates that remote replay does not recompute the local emitter. A free-space follow-up retains the native pose-derived origin and9 births.

## Test scope and fixture changes

The existing controls fixture gains only an opt-in `fidelity` export, defaultfalse. The new cases initialize that same-VM fidelity owner so the native network validator sees the installed configuration. Actual source adapters include gameplay/touch/reliability/quality/network; actual Character cases install native walk/roller and weapon-motion/detail hooks. Display/rendering and selected collision/movement scaffolding remain fixtures; the wall case uses actual Physics. Network recording/replay is in memory, not a new WebSocket/browser acceptance run. Tests do not claim to fix malformed/reordered life-epoch authority.

Initial failures were missing walk/fidelity fixture initialization and cross-realm Array strict comparison. Fixes were limited to test plumbing; they did not weaken collision, packet, damage or timing assertions. Existing successful broad suites, builds and full CI were not repeated. The four candidate source histories remain intact, and no main change or external publication was performed by this lane.
