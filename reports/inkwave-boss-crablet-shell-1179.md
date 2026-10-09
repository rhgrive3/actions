# #1179: preserve legitimate guest crablet damage across shell immunity

Base: aggregate `8e7ddae6`. All #1179 comments and the current implementation were checked before the additional scoped claim. The new numeric/eligibility defenses remain present.

## Residual and correction

The #1182 `Boss.remoteHit` guard checks body `invuln`/`visible` before routing to a crablet. Native `Boss.hit` routes a live crablet to `_hitCrab` before testing shell immunity, and #949's target admission deliberately follows that split. Thus an identical valid hit is admitted locally but rejected for a guest while the body is invulnerable or hidden.

With actual production-composed Boss/NetMatch methods, a valid live crablet at HP200 loses 30 HP from local `Boss.hit`, but a valid owner/life/match/sequence guest packet originally leaves it at HP200. The Boss body stays unchanged in both cases.

The runtime change makes shell `invuln`/`visible` checks conditional on the body target (`c === -1`). Whole-Boss death, match eligibility, live remote attacker, finite/positive/bounded damage, finite Boss HP, valid live crablet, sender ownership, life, match identity and replay defenses remain intact. No damage value, HP cap, special timer or packet format is changed.

## Verification

Four native regression tests cover invulnerable, hidden and combined shell states, with a same-composition negative control that removes only target-specific eligibility. Corrected guest damage matches the native local 200→170 result, replay cannot apply it twice, and body damage remains blocked. A separate matrix rejects dead Boss/crablet/attacker, non-playing match, invalid damage/target, spoofed owner, old life and old match.

New tests plus existing Boss transport, #949 admission and native feedback regressions: **22/22 pass**. Syntax, whitespace and quick upstream/numeric checks pass.

Splatoon 3 reference remains 11.3.0, but INKWAVE's original Boss/crablet design is not asserted to reproduce a Nintendo encounter. This fixes a local/guest admission inconsistency without new retail parameters. Evidence is deterministic native-source composition; no browser/relay/hardware measurement or CI wait is included.
