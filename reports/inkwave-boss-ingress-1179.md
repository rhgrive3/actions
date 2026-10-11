# #1179: dead-attacker ingress and wire/internal damage boundaries

## Latest-base reconciliation

Based on PR #1182 head `f23549b00ebd65bccf3e157d1b55f79e0185936c`. Its existing over-limit ingress guard, authoritative HP invariants and corrected 2500 wire-rejection test are retained. The earlier alternative patch is not overlaid.

The remaining runtime defect is that `_acceptBossHit` accepts a dead attacker and advances `peer.lastBossHit` before `Boss.remoteHit` rejects that actor. The correction adds `actor.alive === false` to the existing transport eligibility rejection, before any sequence reservation. No other runtime behavior is changed.

The existing 2000 limit is an INKWAVE Boss wire boundary, not a new weapon damage constant. Internal `applyDamage` and `_hitCrab` accept positive finite damage beyond that limit and bound HP appropriately. The previous test mistakenly grouped 2001 with nonnumeric/negative values for every internal method. It now separates invalid numbers from valid internal damage and independently asserts that 2001 remains rejected on the wire.

Splatoon 3 reference remains 11.3.0. INKWAVE's original Boss protocol is not a retail Boss/Salmon Run equivalent; no weapon/gear/movement/frame numeric change or hardware parity is claimed.

## Native verification

The existing fixture composes the actual production adapters and uses real `NetMatch.onMessage`, `_acceptBossHit`, `Boss.remoteHit`, `applyDamage` and `_hitCrab`. An optional test-only source transform removes only the new dead-attacker clause for the negative control.

- Negative control: after a legitimate hit, a dead-attacker packet leaves HP/log unchanged but reserves sequence 2. The same sequence, retried with a live eligible attacker, is suppressed. Restoring the clause preserves sequence 1 on rejection and permits the valid retry.
- Both body and crablet malformed damage and dead-attacker input leave HP, credit, receive log and replay sequence unchanged.
- Existing over-limit rejection remains intact; exactly 2000 remains accepted on the wire.
- A direct `remoteHit` rejects 2001, while internal finite `applyDamage(2001)` remains effective. Internal crablet damage clamps at zero without healing or making HP negative/nonfinite.
- Existing owner/life/match/duplicate/weak-hit/crablet/storm controls remain unchanged.

Nine Boss-hit tests pass. Alongside Boss audio/timeline, Slosher player volley and Boss admission, and weapon-source regressions: **34/34 pass**. Syntax, `git diff --check`, and `node scripts/check-inkwave-patches.mjs --quick` pass on this latest-base checkout. The earlier numeric-status issue has been fixed upstream by `5a463ee3` and is not modified here.

These are native-source tests, not browser rendering, a two-device relay integration run, Nintendo hardware measurement, or final aggregate CI.
