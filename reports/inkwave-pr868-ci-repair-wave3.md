# PR 868 CI repair wave 3

Base: ac1a87c05e555c7d58c4a0ef0d0f1dd32f34f8c4. Main merge remains pending.

## Runtime connections
- Refs #427: retain the assists ID array and add known helper life metadata. Reject stale helper lives; legacy packets require accepted credit evidence. Terminal-before-ACK and native owner adoption remain supported. Unknown legacy epochs are never inferred as the current life.
- Remote respawn: reuse the existing movement reset cleanup after native proxy respawn, retiring prior-life roll/Surge state without replacing position, authorization, life or spawn armor owners.

## Source fixtures
Current Flow, conditional gear, respawn, native special selection, presentation, feed and reveal owners are used by the fixtures. Dualies component fixtures install their required canonical fidelity records. The aim source assertion follows the current shared cone sampler. No gameplay constants or assertion tolerances were relaxed.

## Validation
- Assist-life source cases: 20 passed; movement/Flow source cases: 65 passed.
- UI/motion source cases: 55 passed; Dualies component cases: 9 passed; current aim sequence assertion: 1 passed. These are bounded lane results, not a whole-suite count.
- The composed assist-life and remote-respawn boundary: 25 passed, zero skipped.
- All 294 source transformations, emitted build and startup budget passed (145 module hints).
- Runtime content: e7b8f25d784f446f1427489a23296212bc6d2420717a8f1674d509b04317079c.
- Independent reviews passed for all included sets. Full source-suite and browser acceptance remain CI work; the preceding cold-stage failure is not declared repaired by this set.
