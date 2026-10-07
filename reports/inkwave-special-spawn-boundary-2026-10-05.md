# Special movement spawn boundary (#582)

The native Slam and Storm movement branches integrate and resolve position, then return before ordinary movement's spawn-barrier call. Slam could therefore commit authoritative impact paint/hits from inside the enemy spawn circle.

A build-only adapter reconnects the existing `_spawnBarrier()` once after each special's native collision resolution. Slam calls it before `_slamImpact()`. Ordinary movement retains its original call; the native radial radius, height condition, velocity response, special phase timers, steering, damage bands and paint rules are unchanged. Storm's residual drift had the same skipped boundary and uses the same correction.

## Evidence

- Six baseline tests failed; source and actual emitted/minified dedicated suites pass 10/10.
- All four current MAP_LAYOUTS (Tidewater, Kelpline, Halyard and Cargo) supply their actual spawn-pad positions and radius to an unobstructed flat collision fixture. This is not a full rendered map-geometry claim.
- The five-tick inward Slam reproduction clamps to the radius. Rise/hang/fall, primary impact/paint origin and hit origin remain outside the protected circle. The protected-side control victim does not gain an inner-band hit from attacker penetration; ordinary area-of-effect overlap remains legal.
- Exactly one clamp per special movement tick; ordinary run/swim still calls once. The existing below-pad height exception is preserved.
- Outside the spawn boundary, phase/position/velocity traces equal the unclamped control exactly. 30/60/120/144Hz render schedules produce identical fixed-step histories.
- Actual NetMatch serialization and receiver pose carry the corrected owner position under the existing packet rounding. No network format or replay logic changed. This is in-process module evidence, not live-relay/mixed-client acceptance.
- Full gameplay aggregate: 1101 pass / 0 fail / 3 optional emitted-mode skips. Build: `b97916c3cdd7`.

This restores an existing INKWAVE world invariant. It does not calibrate Tidal Slam against a Nintendo special, add invulnerability, make the barrier block every projectile or paint splat, or claim physical-device/browser validation.

Independent read-only review found no blocker and added an actual Actor resolver + Physics proof on a synthetic flat floor: four map spawn configurations × both teams × Slam/Storm at an off-axis approach, 16 cases / 616 special ticks / 8 correctly bounded Slam impacts. Full map collision geometry is still not claimed. Existing packet rounding/interpolation can place an individual remote visual sample slightly inside the mathematical circle; this patch changes the authoritative movement boundary, not that presentation policy.
