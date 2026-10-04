# Final integration — Movement Physics + Sub/Special + Network Replication

Integration baseline: `404c66c858cfea14e81225fb6364febcf2c9c528`.

Source heads at integration:
- PR #59 Movement Physics: `8880f3bf6aa655dd61a16555fdfdb8b8fec1d10a`
- PR #259 Bomb / Special / Ink Distribution: `7a508f27d9bda527fcede395fcea244b184b50b0`
- PR #182 Network / Replication: `1f824a176f519ebf86931f9f53a16fef7c5b889c`

This branch exists only for combined acceptance. It must not be merged into `main` by this task.

## Acceptance invariants

- gameplay remains on the production fixed 60 Hz clock; 30/60/120 Hz render schedules must produce the same authoritative movement ticks
- Kid 5.76, own-ink Squid 11.52, Roller base 6.48, Roller dash 7.92 WU/s are retained; scale-independent ratios are 1 : 2 : 1.125 : 1.375
- standing Kid height 1.45 WU is used only as an internal normalization anchor, not as a Nintendo-meter claim
- Splat Bomb throw transform/any-surface arm remain enabled and authoritative paint is exactly center + 15 secondary splats
- Ink Storm remains 24 DPS for 8 s and special activation refills the ink tank
- remote Bomb/projectile ghosts cannot author gameplay paint/damage; owner splats and terminal events are replayed once
- stale/duplicate packets and events are rejected and ownership changes retire the old ghost timeline
- network packet growth is limited to deterministic replay data; Bomb cosmetic spin is intentionally not transmitted

## Combined validation

The network native-replay harness is wired to install the Sub/Special fidelity overlay in both owner and receiver VM contexts. Its existing Bomb and Storm scenarios therefore exercise the same final gameplay overlay as the combined build. Bomb acceptance additionally asserts 16 owner paint writes and 16 receiver-applied owner splats, ruling out both missing paint and ghost double-application.

A combined snapshot test drives Kid, Squid and Roller movement with the Movement Physics vector integrator, publishes 20 Hz actor snapshots, and samples the remote actor at the identical owner tick. Position and velocity must match the quantized owner state within the existing wire precision.

CI/run receipts are appended after the exact combined SHA completes.
