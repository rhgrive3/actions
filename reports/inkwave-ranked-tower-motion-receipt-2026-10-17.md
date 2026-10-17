# Native Tower autonomy: motion observation — 2026-10-17

## Scope

This is a test observation improvement, with no ranked-rule, bot, weapon, movement or Nintendo parameter changes. It follows a Tower `moved` assertion failure in an earlier PR #1520 CI run. That historical failure **did not reproduce** on integrated base `d0d64b7405611cc9afe93ee370a6e647bfd2e703`: the focused Tower run and complete six-test ranked-autonomy file both passed before the assertion change. The historical failure's cause is not claimed as resolved by reproducing it.

The original movement assertion used either the final path position's distance from the start, or the greatest positive normalized progress. `ranked/tower.mjs` supports opposite attack directions for the two teams and unattended return to the centre. A negative-direction excursion followed by a return can therefore be missed by both observations. This is a limitation of the test's observation, not evidence that the Tower fails to move in the game.

## Independent native receipt

The control preserved the old assertion and added frame-by-frame observations of the rule's path position and the actual `rankedWorld.towerBlock.center`. It used the existing native BotBrain, Actor movement, Level/Physics, projectiles, ranked rules and CPU paint simulation. Only the existing display/GPU submission fixture stubs remained. No event, score, projectile or bot goal was injected.

Command:

```sh
node --experimental-vm-modules patches/splatoon3/tests/ranked-autonomy-integration.test.mjs
```

The complete file's original-assertion control passed **6/6**. Its deterministic 60Hz Tower scenario ran four Shooter bots for 3,600 simulation frames with the file's existing seed `0x51a7ed`.

| Measured value | Control result |
| --- | ---: |
| Initial path distance | 18.443198145930722 |
| Minimum path distance during the scenario | 5.8471981459312765 |
| Maximum path distance during the scenario | 18.443198145930722 |
| Final path distance | 6.663198145931266 |
| Largest absolute route displacement from the start | 12.595999999999446 |
| Initial normalized progress | 0.45634816659305544 |
| Maximum normalized progress | 0.45634816659305544 |
| Largest actual collision-body displacement | 12.297916140501295 |
| Accepted opposing-player projectile hits | 37 |
| Largest ranked count decrease | 65 |
| Tower captures / checkpoint events | 4 / 1 |

The collision-body origin was `[6.5, 3.0799999999999996, 1.7763568394002505e-15]`. Distances above are INKWAVE world/path units, not a new retail distance calibration. The route displacement differs from straight-line collision-body displacement because the path bends.

This receipt demonstrates substantial native **negative-direction** progress while the former positive-only maximum never changes. The old assertion still passes this control because the Tower finishes away from the centre; it does not reproduce the historical return-to-centre failure hypothesis.

## Strengthened assertion

`patches/splatoon3/tests/ranked-autonomy-integration.test.mjs` now retains the whole scenario's minimum and maximum path distance and the maximum observed displacement of the actual collision block. Success requires all of:

1. A native Actor lands on the live Tower collider, as before.
2. The Tower travels more than the existing 0.5-unit threshold along its route in either direction at some point.
3. The actual collision block independently moves more than 0.5 units.
4. An actual ranked count decreases, as before.
5. Native projectiles inflict accepted opposing-player damage, as before.

The initial and final positions, both route extrema, physical displacement, accepted hits and count change are emitted as one diagnostic receipt. Captures or checkpoint events cannot stand in for the movement, score or damage assertions. The test no longer requires the Tower to end away from its starting point.

The final complete six-test file passed **6/6** after the assertion change. Its receipt exactly matched the control's positions, physical displacement, hits and count change; the new maximum route displacement was `12.595999999999446`. Whitespace validation passed. This logic coverage is distinct from browser execution and Switch hardware comparison; neither is claimed here. It does not introduce or alter any S3 gameplay assumptions.
