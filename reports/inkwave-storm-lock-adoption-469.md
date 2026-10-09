# #469: retain the spent Storm clock after owner departure

## Reproduction and scope

Base: aggregate follow-up `60479d51`, 2026-10-09 UTC. The post-throw Ink Storm recharge lock is an actor-owned clock, separate from spendable Special charge and from the short throw action. The existing adoption snapshot omitted this clock. A real owner with six seconds remaining sends zero charge; after `NetMatch.onLeave`, the adopted bot previously had no lock and immediately earned ten charge from `addTurf(10)`.

Comparison baseline remains Splatoon 3 11.3.0, Ink Storm with no gear and the existing Special Power extension. The [issue](https://github.com/rhgrive3/actions/issues/469) and [earlier scope report](https://github.com/rhgrive3/actions/issues/469#issuecomment-5992340241) distinguish used gauge from recharge permission. This repair preserves INKWAVE's already-established lock; it introduces no retail timing, damage, scale or animation-curve assertion. Nintendo hardware, browser pixels and live relay behavior remain unmeasured.

## Correction and compatibility

An optional `sg` tick sidecar carries the remaining lock and its captured initial duration, bound to the same actor life and adoption sequence. Actor rows remain 24 fields and adoption rows remain 10 fields. The ordinary owner/life checks precede sidecar acceptance; malformed, nonfinite, inconsistent or mismatched clock data cannot replace the last accepted adoption state. The existing 60-second adoption validation ceiling is reused, not a gameplay duration.

On transfer, the latest accepted owner state is authoritative. Owner-clock extrapolation already elapsed beyond that snapshot is subtracted once. A newer snapshot without a lock clears the old state instead of reviving an interpolated display sample. Death and reset retain the remaining lock and the captured Special Power denominator. The native actor continues to own expiry and recharge permission; no timer is restarted, no charge is restored and no throw or cloud is replayed.

Legacy 8/9/10-field adoption packets still parse without inventing a clock they never carried. An exact pre-change `60479d51` receiver was also tested against the new sender's native packet: it accepted the actor snapshot (24/10 fields, HP100) and ignored the optional sidecar. Such an older receiver naturally retains the old missing-lock behavior, but the new packet does not prevent actor synchronization. Holding an unthrown Storm and cloud authority transfer are outside this change.

## Validation

The new five-case suite uses separate production-composed native Actor/NetMatch worlds and actual encoded snapshots, receives them through `onMessage`, samples them, then transfers ownership through `onLeave`.

- The remaining six-second lock prevents charge through its final tick and then permits normal charge.
- Legacy packets reproduce the original missing-lock behavior, providing a protocol-level negative control.
- A dead owner with the existing ten-second Special Power test duration preserves the clock across adoption/reset; a newer expired snapshot supersedes older display state.
- Malformed payloads use distinct increasing timestamps and sequences, so rejection is not merely replay filtering.
- Wrong owner/life and two seconds of owner-clock extrapolation do not grant or restart the lock.

New tests: **5/5 pass**. Adjacent adoption, Slam, cooldown and protection suites: **27/27 pass**. The separate exact-old-receiver compatibility probe passes. Syntax, whitespace and quick upstream/numeric checks pass. These are deterministic native-source/VM checks with presentation and floor fixtures, not browser, live-network or hardware parity claims.
