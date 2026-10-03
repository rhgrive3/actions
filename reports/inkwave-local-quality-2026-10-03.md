# INKWAVE local-quality integration — 2026-10-03

Base: `ddfa5d8a49f4f0e2b76943b24bcc80b987ba019b`.

This change integrates the locally validated quality fixes into the existing build-only patch architecture. `inkwave-public/` remains unchanged; the canonical build composes `splatoon3 -> touch-layout -> reliability -> local-quality`, and the new runtime modules are copied into the revisioned build like the existing patches.

## Fixes

- Ink surface: convert mask derivatives to a small world-space film slope, use defined smoothstep ordering, and exclude the actor's actual supporting ramp from the feet-obstruction dither. Paint mask resolution, coverage/scoring and geometry are unchanged.
- Walking: cadence uses filtered scalar root travel speed so a direction reversal cannot cancel signed velocity and collapse the step rhythm. Foot planting remains owned by the existing walk layer.
- Vertical roller motion: replace the zero-velocity release seam with a continuous Hermite release curve while retaining the authoritative windup/release/interval.
- Vertical roller visuals: distinguish the vertical airborne shape by visually coupling non-scoring curtain droplets to the real central vertical projectiles. Projectile physics, collision budget, random draws, damage, paint and packet shape are unchanged.
- Menus: remove the duplicate animation owner while the game is already driving `Menus.update`, and suspend only offscreen settings-preview ticks using `IntersectionObserver` with a 64px pre-roll margin.
- Gyro: Android stays on orientation quaternion deltas; rotationRate on other platforms is continuously admitted only while it agrees with recent attitude and falls back on disagreement, silence, screen rotation or resync. No aiming deadzone is added.

## Local evidence before integration

The local package ran 35 added tests successfully. A 390x844 Chromium settings probe measured 3-second TaskDuration of 130.023ms before vs 45.851ms after for the offscreen-preview scenario, while external UI updates stayed about 60Hz. A Node microbenchmark showed the visual FX path increasing by about 0.00271ms average per tested update; this is small but not zero cost.

## Limits

Those local measurements are not a substitute for the repository CI or real-device acceptance. Android/iOS hardware, live battle frame time/GPU counters, WebGL rendering of the ink edge and roller silhouette, online rooms and installed-PWA/offline behavior still require CI/device verification. Do not interpret this report as a claim of exact Nintendo animation data or zero regression risk.
