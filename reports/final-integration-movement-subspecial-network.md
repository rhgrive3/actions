# Final integration — Movement Physics + Sub/Special + Network Replication

Latest main integration baseline: `f1f98db94af412fd584a459b11fc97346466a063`.

Latest source heads used:
- PR #59 Movement Physics: `8880f3bf6aa655dd61a16555fdfdb8b8fec1d10a`
- PR #259 Bomb / Special / Ink Distribution: `16d1259d731cc695b0aa1d467df17be1c1c5bff4`
- PR #182 Network / Replication: `1f824a176f519ebf86931f9f53a16fef7c5b889c`

Individual INKWAVE validation at those heads is green:
- PR #59 run `37192505923`
- PR #259 run `37192957616`
- PR #182 run `37192638219`

The concurrently failing `CXX OpenTTD projection diagnostic` workflow was independently inspected: it fails in the OpenTTD RTTI/vtable probe and is unrelated to INKWAVE.

This branch and Draft PR #337 exist only for combined acceptance. They must not be merged into `main` by this task.

## Movement quantitative acceptance

Authoritative gameplay remains on the production fixed 60 Hz clock.

Retained top speeds:

| Mode | WU/s | standing-Kid-heights/s | ratio to Kid |
|---|---:|---:|---:|
| Kid | 5.76 | 3.9724 | 1.000 |
| own-ink Squid | 11.52 | 7.9448 | 2.000 |
| Roller base | 6.48 | 4.4690 | 1.125 |
| Roller dash | 7.92 | 5.4621 | 1.375 |
| enemy-ink cap | 1.44 | 0.9931 | 0.250 |

The internal normalization anchor is the upstream standing Kid height of 1.45 WU. It is not treated as a Nintendo-meter conversion.

Normal grounded acceleration is 36 WU/s²; attack/aim/sub/special acceleration is 72 WU/s². Candidate 60 Hz behavior reaches Kid top speed in 10 ticks, Squid top speed in 20 ticks, full Kid reversal in 20 ticks, and a full-speed 90° Kid turn in 14 ticks. The 90° turn minimum speed is about 4.0749 WU/s, preserving inertia rather than rotating a full-speed vector in place.

The movement smoke suite includes direct 30/60/120 Hz partition checks and 30/60/120 Hz render schedules feeding the same production 60 Hz fixed clock.

## Bomb / Special acceptance

- Splat Bomb throw transform uses the pinned 11.3.0 values.
- Fuse arms on first world-surface contact, including vertical walls.
- Authoritative gameplay paint remains exactly 1 center + 15 secondary splats.
- Native damage / LOS / FX / audio remain owned by the original gameplay path.
- Ghost Bombs do not add authoritative replacement paint.
- Ink Storm remains 24 HP/s for 8 s with radius 10.
- Special activation refills ink to `PLAYER.inkMax` before native special startup.
- `RainNum=72` remains reference metadata and is not misrepresented as 72 gameplay splats.

## Network / ownership acceptance

- Owner gameplay remains authoritative; remote projectile/Bomb state is presentation/reconstruction.
- Ghost projectile/Bomb paths cannot author projectile damage or gameplay paint.
- Storm keeps the existing victim-owner damage model; catch-up does not burst historical damage.
- stale/duplicate ticks, event sequences and projectile identities are rejected
- ownership transfer/disposal retires the old ghost timeline
- projectile terminal events retire ghosts rather than allowing remote actor collision guesses
- packet format is not expanded for Bomb cosmetic spin; only replay/ownership data needed for deterministic reconstruction is retained

## Combined cross-regression

The network native-replay fixture is composed with both the Movement/Sub-Special gameplay adapter and the Network adapter.

The combined comparison harness explicitly installs the Sub/Special fidelity overlay in both owner and receiver VM contexts. Therefore its existing `bomb` and `storm` replay scenarios exercise the final throw transform, Bomb 1+15 paint distribution and Storm settings rather than the older baseline overlay.

For the networked Bomb scenario the acceptance harness requires:
- owner gameplay paint calls: 16
- receiver-applied owner paint calls: 16
- ghost-authored authoritative replacement paint: 0 by the existing mute/ghost guards

A combined movement snapshot regression drives Kid, Squid and Roller velocity through the Movement Physics integrator, publishes the resulting owner state on the replication path and verifies remote position/velocity at the same owner tick within existing wire precision.

The first combined CI attempt reached 754/754 gameplay patch tests before failing only in the newly-added integration-test fixture: the test passed the wrong synthetic runner shape to `rollingMovementSpeed`. The production implementation was not implicated. The fixture now uses the production `runner.a.weapon + runner.rollT` shape.

Final acceptance is the exact-head `Validate INKWAVE update` check on Draft PR #337. No `main` merge is performed here.
