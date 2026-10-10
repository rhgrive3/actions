# PR868 network owner and verifier connections

Base262c4bab. Main merge remains pending.

## Actual network connections
- Native Splat Bomb outer damage uses splat-bomb-far. Treat it as the same victim-owned explosion in both ownership classification and legacy-hit rejection. Actual far damage reaches the victim owner; forbidden sender-owned legacy hit paths remain rejected. Native deferred death is still once-only.
- Keep the existing accepted projectile lengths27/30/32/33/35. Current35 uses the Kit offset; legacy mode/seed/projectile identity uses its original offset. De-duplication, ghost metadata and terminal events use the same identity. Legacy27 never gains an invented ID. No new packet form is admitted.

## Fixture and comparison contracts
Current recorder birth/end/footer records replace manually constructed retired layouts. Typed legacy33 and historical27/30/32 remain explicitly exercised rather than relabeled current35. Invalid type/length/unit checks precede allocation/identity advancement. Extracted hit methods receive real Respawn Punisher helpers and check true/false scoped restoration plus existing fractional damage/group/ACK/life behavior.

The comparison-only network:false baseline explicitly uses native27. Its accidental mixture with two empty Kit volley/action slots is removed only when the known shape and both zero slots match. Current network:true remains unmodified. Ghost observation requires exactly one actual new list entry and cannot substitute an old tail object when a birth is rejected.

## Validation
- Composed deterministic network suite117/117 passed, zero skips; the separately added baseline envelope guard also passed and is included in the next CI suite.
- Native before/after comparison28 scenarios passed; maximum current trajectory error0.009089216476510634 under unchanged0.08, with existing birth/lifetime/paint/beam checks. Local comparison was non-exact; committed checkout verification remains CI.
- All294 source transforms, emitted build/startup145, canonical15 weapon measurements,3 reconstruction modes and wall4 families/6 cases passed. Content0ab77ecaafb448b83bc086c4ba1d5f5d5451a25f5f73cb7dea9460e52a6d8c00.
- Independent reviews passed. No gameplay value, numerical tolerance, runtime allocation budget or timeout was raised. The historical27 form has no projectile ID, so no unsupported cross-event identity guarantee is invented for that form.

Cold-process browser isolation remains under its separate exact-run acceptance. No whole-CI or device-parity success is claimed here.
