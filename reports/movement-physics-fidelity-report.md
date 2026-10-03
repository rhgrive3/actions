# INKWAVE Movement Physics Fidelity — Draft integration report

## Baseline

- main: `5e28dbd16f7829aebd88052ff5f7fdf71f39fdad`
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
