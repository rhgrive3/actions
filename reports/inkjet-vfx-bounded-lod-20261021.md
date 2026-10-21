# Inkjet bounded density candidate, 2026-10-21

This supersedes the unbounded-low-FPS density proposal as a candidate only. PR1744 head 3fce162f7ff8c7bcd0657dc91ec23e0ed628954f remains a fixed comparison record. This branch is not accepted as retail-perfect or within a measured GPU/CPU percentage.

## Minimal scope

Only Inkjet continuous flight/nozzle/spray particle births are gated. The existing 60Hz presentation clock advances even when births are skipped. At most one density tick is emitted per rendered update: 30Hz retains its old sparse budget, 60Hz retains its old budget, 120Hz uses the 60Hz density. The ground-disc clock is separate. Beam/ribbon following, existing sprite trajectories and second-based lifetimes are unchanged.

Before each Inkjet continuous sprite birth, inspect the existing target pool's n and cap. If full, skip the new sprite. Do not evict or delete existing sprites. This respects the current quality-derived capacities and also suppresses births if a capacity is lowered below the existing live count. The common SpritePool and other specials are untouched. Activation/impact bursts are unchanged and are NOT covered by this new sustained-emission admission guarantee.

## Why the earlier candidate was insufficient

At 30Hz, normalizing all births to 60Hz doubled this effect's expected sprite work. Near-ground exhaust plus one continuously visible round rose from approximately73.61 to147.22 live sprite instances per rendered frame (Float32 lifetime stepping included, unsaturated uniform-random expectation). Four actors could newly saturate the high-quality puff pool. Its existing eviction implementation linearly scans live particles. No claim that this fit a few-percent whole-game budget was justified.

The current density cap restores the old30Hz birth ceiling. At60Hz it is unchanged unless the pool fills; at120Hz it halves the old expected density. This intentionally changes particle-density LOD, not elapsed motion time. It does not prove retail spray shape or temporal fidelity.

## Executed source-level negative tests

Executed the actual two Inkjet source recipe methods and actual SpritePool.spawn/update code in the available JavaScript runtime. Mesh/buffer-upload destinations are stubbed; Float32 ages, gravity/drag integration, lifetime removal and attribute writes use the actual implementation. Random=.2 forces all tested probability branches to emit. Each actor has one continuously visible round. Two seconds, fixed order, no activation/impact or unrelated effects. The pool's eviction function throws if called.

| Puff cap | Hz | Actors | Peak drawn puffs | Peak glows | Evictions | Puff admissions by actor |
|---|---|---|---|---|---|---|
| 182 | 30 | 1 | 137 | 2 | 0 | 660 |
| 182 | 30 | 2 | 174 | 4 | 0 | 643/235 |
| 182 | 30 | 4 | 182 | 8 | 0 | 579/221/54/44 |
| 182 | 60 | 1 | 178 | 4 | 0 | 912 |
| 182 | 60 | 2 | 182 | 8 | 0 | 842/98 |
| 182 | 60 | 4 | 182 | 16 | 0 | 741/118/44/44 |
| 182 | 120 | 1 | 182 | 6 | 0 | 891 |
| 182 | 120 | 2 | 182 | 12 | 0 | 828/95 |
| 182 | 120 | 4 | 182 | 24 | 0 | 729/109/44/44 |
| 520 | 30 | 1 | 137 | 2 | 0 | 660 |
| 520 | 30 | 2 | 274 | 4 | 0 | 660/660 |
| 520 | 30 | 4 | 500 | 8 | 0 | 660/658/631/426 |
| 520 | 60 | 1 | 280 | 4 | 0 | 1320 |
| 520 | 60 | 2 | 510 | 8 | 0 | 1319/1111 |
| 520 | 60 | 4 | 520 | 16 | 0 | 1266/948/224/127 |
| 520 | 120 | 1 | 291 | 6 | 0 | 1320 |
| 520 | 120 | 2 | 518 | 12 | 0 | 1318/1063 |
| 520 | 120 | 4 | 520 | 24 | 0 | 1259/907/218/127 |

All18 cases stayed within their pool caps with zero continuous-Inkjet evictions. Reducing both sprite caps to zero after the run and invoking another emission frame retained every currently live sprite unchanged while suppressing new sprites. This is a deliberately severe negative test, not a supported UI quality value. The ordinary full-cap and cap-minus-one tests also suppress/limit births. Separate clock tests cover jitter, invalid dt, submerged carry and5-second stalls.

## Explicit fairness limitation

The guard is first-come-first-served. At cap182/30Hz/four actors the fixed-order admission split was579/221/54/44 over two seconds. This is not fair and is not presented as acceptable multiplayer visual fidelity. Other effects can occupy the same pool; later actors may lose more spray. Pool safety and fairness are different acceptance criteria. A later fair admission design must not silently change other FX or gameplay.

## Remaining acceptance gates

- Run committed Node source and production-composition tests, including the new actual-pool test.
- Emitted/minified verification and exact new-head CI. Old-head successes are not evidence for this branch.
- Actual-browser before/after sequences and CPU/GPU/frame/allocation/draw measurements for30/60/120Hz and1/2/4 actors, including competing FX.
- Resolve or explicitly accept saturation fairness; do not conflate a bounded pool with a small runtime cost.
- Obtain actual continuous S3 frames and compare projectile body, flight spray, impact and exhaust separately. Prior1.98-second storyboards are insufficient.
