# Remaining: Movement Physics follow-ups

The core defects fixed by this Draft do not prove complete Splatoon movement fidelity.

Still open:

## Absolute calibration
An independent Nintendo-to-INKWAVE world-scale anchor is not established. Therefore the retained values (Kid 5.76, Squid 11.52, Roller 6.48/7.92, etc.) are not yet certified as perceptually/physically equal to Splatoon.

## Curves and directional behavior
Implementation behavior is now quantitatively locked for the current candidate (including 30/60/120 partition/render-cadence regressions), but Nintendo-side source/device evidence is still required before claiming exact curve fidelity for:
- normal Kid/Squid acceleration and braking
- air control
- reverse/turn curve
- roller lateral/backward trajectory and turn response
- stopped rolling dash-timer behavior
- equipment/weight-specific modifiers

## Release gates
Before treating the movement work as release-accepted:
- normal cold source build
- full repository suite
- rendered browser movement/visual gate
- Android/iPhone/iPad real-device check
- representative maps/surfaces
- 2-peer check that the changed authoritative roller yaw/dodge state replicates safely

## Performance
Dodge collision slicing roughly doubles the measured microbenchmark cost for that path. It should be profiled on mobile hardware before calling the trade-off negligible.

## Ownership
Future Motion work should consume the authoritative root velocity/yaw produced here rather than create a second movement direction.
Future Input work should leave the post-admission dodge integrator owned here.
