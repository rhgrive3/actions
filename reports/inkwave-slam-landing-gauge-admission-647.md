# #647 / #648: keep the pending landing gauge reserved

## Evidence and scope

At aggregate `abc5330f`, the merged #648 implementation already keeps Tidal Slam's used gauge through its native landing recovery. On impact, `specialActive` becomes null while `s3TidalSlamGaugeFinish` continues to own the final remainder. However, `addTurf` and `specialReady` checked only `specialActive` and the unrelated Storm clock.

A production-composed native Actor therefore accepts new turf into the held remainder. The focused negative control reaches native impact, credits ten area, and observes the remainder grow by ten. Enough subsequent turf makes the actor ready; pressing Special starts a second native Slam while the first landing's finish token still exists. The normal finish can also erase incorrectly accrued charge later.

The [open #647](https://github.com/rhgrive3/actions/issues/647) and [merged sibling #648](https://github.com/rhgrive3/actions/issues/648) describe the action-owned meter boundary. Their existing comparison baseline is Splatoon 3 11.3.0, Triple Splashdown, no gear and Special Saver. This correction does not recalibrate the existing drain curve, 23-segment interpretation, impact time or landing recovery. In particular, the earlier #647 review's unresolved Nintendo calibration concerns are not declared solved. PR #1181's separate impact/fist work is untouched.

## Correction

While the actor's existing pending landing token owns the gauge, native turf statistics and turf events continue normally, but turf cannot refill the used meter or emit a false ready transition. `specialReady` also explicitly rejects that token. The later #484 remote-presentation transform preserves this local admission condition instead of overwriting it. Plain/Storm-only compatibility forms remain accepted by that transform.

The existing landing finish still consumes the remainder at its existing boundary. Normal recharge and its ready event work immediately afterward. Void-timeout landing keeps the same reservation until the existing landing or interruption path; death sends only the original remainder to the current Special Saver path, and reset clears the token. Storm's independent lock and remote readiness data remain unchanged.

## Verification

Four new deterministic native-composition tests cover:

- A same-composition negative control removing only the new guards, reproducing both upward recharge and an actual second native Special.
- Native turf accounting, blocked recharge/ready/activation during pending landing, explicit full-number readiness defense, and normal ready emission after the existing finish.
- Void-timeout, death/Special Saver and reset boundaries.
- Identical fixed-tick admission traces under 30/60/120 Hz rendering.

New tests pass **4/4**. Adjacent native-physics/gauge, remote readiness, Slam damage-state and Storm tests pass **50/50**. Syntax, whitespace and quick upstream/numeric checks pass. Native tests use fixture presentation/ground substitutes; the existing native-physics suite separately exercises real level collision. This is not a browser, live-network or Nintendo hardware comparison.

## Complete-bootstrap follow-up and scope correction

The focused source tests above are distinct from complete bootstrap installation. A later five-case scope check applies the real runtime install and all eight extra bootstrap installers in verified order, including kit composition and the disconnect policy. The current original Dualies/Slam kit still reproduces the second-activation defect when only these guards are removed; the retained fix blocks it. A separate landing-adoption prototype is not selected because the production human-leave path does not adopt a bot. See `inkwave-gauge-bootstrap-scope-correction-2026-10-09.md` for the passing complete-wrapper evidence and its limits.
