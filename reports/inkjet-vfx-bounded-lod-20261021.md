# Inkjet bounded and fair density candidate, 2026-10-21

Current candidate adds Inkjet-only per-actor admission quotas to the historical bounded proposal below. It is not accepted as retail-perfect or within a measured performance percentage. PR1744 head3fce162f remains fixed; these results apply only to the separate bounded-lod branch.

## Fair admission, measured against the initial guard

At the first Inkjet request per rendered frame, collect eligible active Inkjet actors and owners of existing Inkjet flight records. Reuse one actors array and WeakMap record per owner. Share only the currently free puff/glow slots equally. Rotate indivisible remainder slots on advancing60Hz time epochs, without reordering G.actors or its update loop. A final pool-cap check handles competing FX after the snapshot. Unknown new flight owners wait one render instead of stealing another share. Live sprites are never evicted or deleted. Participant discovery runs once per rendered frame only when Inkjet requests admission, not on idle scenes. This adds bookkeeping CPU work; it is not a CPU/GPU benchmark.

The following comparison uses the same actual recipe/Float32 pool code and the actual Director order of all actors first, then all projectile rounds. The earlier section's interleaved test was useful for the cap bound but did not reproduce that order. Constant random=.2, two seconds, one visible round per actor:

| Cap | Hz | Actors | Initial-guard admissions | Fair admissions | Before max/min | After max/min | Peak puffs |
|---|---|---|---|---|---|---|---|
| 182 | 30 | 1 | 660 | 660 | 1.000 | 1.000 | 137 |
| 182 | 30 | 2 | 598/283 | 456/456 | 2.113 | 1.000 | 174 |
| 182 | 30 | 4 | 529/267/63/45 | 238/241/240/237 | 11.756 | 1.017 | 182 |
| 182 | 60 | 1 | 927 | 927 | 1.000 | 1.000 | 178 |
| 182 | 60 | 2 | 834/117 | 487/487 | 7.128 | 1.000 | 182 |
| 182 | 60 | 4 | 691/177/44/44 | 265/265/265/265 | 15.705 | 1.000 | 182 |
| 182 | 120 | 1 | 909 | 909 | 1.000 | 1.000 | 182 |
| 182 | 120 | 2 | 823/104 | 478/478 | 7.913 | 1.000 | 182 |
| 182 | 120 | 4 | 682/159/44/44 | 260/261/261/260 | 15.500 | 1.004 | 182 |
| 520 | 30 | 1 | 660 | 660 | 1.000 | 1.000 | 137 |
| 520 | 30 | 2 | 660/660 | 660/660 | 1.000 | 1.000 | 274 |
| 520 | 30 | 4 | 622/622/605/534 | 600/600/600/600 | 1.165 | 1.000 | 500 |
| 520 | 60 | 1 | 1320 | 1320 | 1.000 | 1.000 | 280 |
| 520 | 60 | 2 | 1253/1165 | 1214/1214 | 1.076 | 1.000 | 510 |
| 520 | 60 | 4 | 1163/936/344/140 | 672/672/672/672 | 8.307 | 1.000 | 520 |
| 520 | 120 | 1 | 1320 | 1320 | 1.000 | 1.000 | 291 |
| 520 | 120 | 2 | 1245/1131 | 1194/1194 | 1.101 | 1.000 | 518 |
| 520 | 120 | 4 | 1158/921/309/139 | 659/659/659/659 | 8.331 | 1.000 | 520 |

All18 cases: zero evictions, same peak puff bound as the initial guard. New records are reused across frames. Tests also cover capacity below current live count, excluded submerged/superjump/dead actors, and continued flight after owner death.

Fairness does not mean zero overhead: at cap182/four actors,60Hz total accepted births increased956→1060 because equal shares alter the mix/lifetimes of accepted particles, even though the pool peak stayed182. At120Hz it increased929→1042. This is an additional CPU/allocator risk to measure. The deterministic equal-demand ratios above are not a guarantee with different actor actions, different effect lifetimes, camera conditions or competing other FX.

Executed: four source-recipe/clock tests and19 actual-pool/admission tests in the available JS runtime. Mesh/upload destinations are stubs. Committed Node execution, production/emitted suites, exact new-head CI and actual-browser performance remain pending. No retail continuous-frame footage comparison is claimed.

## Historical initial bounded proposal and its rejected fairness

# Initial bounded proposal (historical, not accepted)

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


## Live-owner review follow-up

The first fair candidate used `actors.includes` for each remembered round and could reserve a share for a dead, removed, or recycled projectile before `updateRounds` pruned it. Admission now scans the current projectile list once, excludes dead/non-Inkjet entries, and deduplicates owners with the existing WeakMap record's frame marker. This removes quadratic membership scans without changing actor order or shared pools. It also admits a new live projectile owner in the same frame. Camera visibility remains deliberately outside this budget; invisible active owners can still hold shares.

The updated extracted actual recipe/pool suite passes 20 tests in the pure V8 harness (not Node/WebGL), including 32 duplicate live projectiles, stale/dead/recycled owners, same-frame newcomer, removal, quality reduction, and the existing 18 frequency/actor/capacity cases. The cadence suite remains 4 previously passing tests; source and emitted integration are explicitly wired into the specials workflow. CI for superseded heads must not be reused. No CPU/GPU/alloc/frame few-percent claim is made; the saturated fairness birth-count increases above still apply. The no-eviction guarantee is scoped to these continuous Inkjet emissions, not activation/impact bursts or other effects.
