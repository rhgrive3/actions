# INKWAVE Movement Physics Fidelity — Draft integration report

## Baseline

- current main integration baseline: `404c66c858cfea14e81225fb6364febcf2c9c528`
- original source-workstream baseline: `5e28dbd16f7829aebd88052ff5f7fdf71f39fdad`
- source workstream commit: `bdf3eec3f728cf64dcf81ac5e0818864e4959796`
- scope: authoritative root physics only

This Draft PR intentionally does **not** claim complete Nintendo fidelity. It integrates the root-physics defects that were measurable without guessing an unverified world-scale conversion.

## Production changes

1. **Dualies dodge integration**
   - Existing configured distance: 2.8 world units.
   - Before measured flat distance: 2.970138889.
   - After: 2.800000000.
   - Active travel boundary: 13 observed ticks -> 12.
   - Recovery boundary: 33 -> 32.
   - Uses the exact integral of the existing velocity curve rather than inventing a new curve.

2. **High-speed dodge collision**
   - Dodge travel is subdivided through the existing collision controller.
   - Thin walls are not skipped.
   - Clipped distance is discarded instead of being repaid as a later teleport.

3. **Wall-squid diagonal input**
   - Oversized/raw diagonal lateral input is normalized before wall projection.
   - Example: raw (1,1) wall-squid speed 5.20 -> 3.676955262, matching the unit diagonal.

4. **Roller rolling movement ownership**
   - Removes a second runtime rolling-speed override.
   - The build-connected native `WeaponRunner.moveSpeed` is the single owner.
   - Rolling speed is guarded so it does not leak into flick/recovery/sub/air/squid/special states.

5. **Roller root heading**
   - While actively rolling, authoritative root yaw follows actual horizontal velocity instead of staying locked to aim yaw.
   - This is root physics/facing; no foot/arm/roller-pose animation was changed.

6. **Actual timestep propagation**
   - Air-time accumulation uses the timestep passed through the resolver rather than a hidden fixed `1/60` increment.

## Values deliberately retained

The workstream did **not** change the following absolute speeds because an independent Nintendo-to-INKWAVE world-scale anchor was not established:

| Mode | Retained speed |
|---|---:|
| Kid | 5.76 |
| own-ink Squid | 11.52 |
| Roller rolling base | 6.48 |
| Roller rolling dash | 7.92 |
| enemy-ink cap | 1.44 |

Those values may still require a future fidelity pass with a validated scale/reference.

## Scale-independent quantitative calibration

Current upstream standing Kid height is **1.45 world units**. Because no Nintendo-to-INKWAVE world-scale anchor is independently established, the normalized values below are the release-review measurements; they do not claim that one INKWAVE world unit equals one Nintendo meter.

| Mode | Speed (WU/s) | Standing-Kid-heights/s | Ratio to Kid |
|---|---:|---:|---:|
| Kid | 5.76 | 3.9724 | 1.000 |
| own-ink Squid | 11.52 | 7.9448 | 2.000 |
| Roller base | 6.48 | 4.4690 | 1.125 |
| Roller dash | 7.92 | 5.4621 | 1.375 |
| enemy-ink cap | 1.44 | 0.9931 | 0.250 |

The normal grounded acceleration is **36 WU/s² = 24.8276 Kid-heights/s²**. The attack/aim/sub/special acceleration is **72 WU/s² = 49.6552 Kid-heights/s²**.

At normal 36 WU/s², the continuous-time distances imply 0→Kid top speed in 0.160 s and 0→Squid top speed in 0.320 s. The 60 Hz regression reaches the exact targets on frames 10 and 20 respectively (0.1667 s / 0.3333 s because the discrete step lands on the next tick). Full Kid reversal from +5.76 to -5.76 is 11.52 WU/s of velocity change and completes on frame 20 at 60 Hz.

A full-speed 90° Kid direction change uses the same vector-acceleration budget. At 60 Hz it reaches the new target vector on frame 14 (0.2333 s). The implementation deliberately preserves inertia: speed falls to a minimum of about 4.0749 WU/s (70.7% of Kid top speed) near the middle of the turn, rather than rotating a full-speed vector instantaneously. This is a quantitative description of the INKWAVE candidate, not a claim that Nintendo's exact turn curve has been independently recovered.

The smoke gate now also runs the same piecewise acceleration/reversal path with direct 30/60/120 Hz partitions and separately feeds 30/60/120 Hz render schedules through the production 60 Hz fixed clock. Matching checkpoints/ticks are required to be numerically equal within 1e-9.

## Validation reported by the source workstream

- New tests: **604 / 604**
- Existing movement/resource/collision/action/superjump tests: **23 / 23 before and after**
- Fixed simulation: **96 scenarios x 5 render schedules = 480 comparisons, root difference 0**
- Tested render schedules: 30/60/90/120 FPS plus irregular scheduling
- Dodge distance integral tested across multiple simulation dt values

The lightweight smoke test retained in this PR checks the core pure math, rolling guards and fail-closed source connections. The large generated raw evidence is not committed here.

## Performance note

Node microbenchmark reported:

| Path | Before | After |
|---|---:|---:|
| normal horizontal | 1.276 us | 1.197 us |
| normal integration | 31.412 us | 29.550 us |
| dodge dispatch + integration | 30.191 us | 56.888 us |

The dodge path is intentionally more expensive because collision checks increase from 1 to about 1.75 per tick on average. This is a real trade-off and is not described as zero-cost.

## Explicitly untouched

- input admission/buffering
- Character gait/IK/pose
- roller model/hold pose
- squid visual animation
- network replication
- weapon range/damage/spread
- PWA/gyro/lifecycle
- general loading/runtime performance

## Draft status

This is suitable for review as an isolated Movement Physics change, but release acceptance still requires the gates listed in `remaining/movement-physics-followups.md`.
