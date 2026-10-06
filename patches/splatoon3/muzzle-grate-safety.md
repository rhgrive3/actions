# Charger sight and Dualies birth safety (#712, #727)

Baseline: main `37ab02fcb7314eee8a6b3e6e8e6b0593610e7bff`.

The Charger sight now uses the same grate-skipping ray mask as ink. With a grate at z=2 and a solid wall at z=5, the previous sight stopped at 1.65 while the actual shot continued 4.65 world units. The sight reaches the solid wall after this change. Physical Bomb collision still sees the grate.

Each Dualies hand now validates its actual muzzle against the full body-to-muzzle ray, then checks the existing 0.3 aim-direction fallback before using it. The query skips grates, matching ink. Invalid muzzle coordinates use the same checked fallback. Clear hand positions, cadence and admission are retained. No new physical constant or source-game coefficient is introduced.

The native continuous projectile sweep already consumed a projectile born inside a wall on its first tick. Therefore #727 is not evidence of unlimited through-wall flight. The reproduced defect is an unsafe birth and back-face painting: an actual Character left muzzle at (0.08401, 0.86803, 0.47738), with a small obstacle centered 0.01 behind it, starts inside that obstacle despite the actor body being clear (nearest XZ distance 0.45125 > radius 0.38). Before the guard the paint center was z=0.62738, beyond the obstacle; with the checked native fallback at (0,1.05,0.3), it is z=0.37101, on the body-facing side. A body itself embedded inside geometry is outside this fix.

## Verification

- New source tests 7/7, existing weapon-edgecases 16/16 (23/23 together).
- Actual emitted Projectile/Physics tests 7/7; unchanged source Character fixture supplies the real rig positions.
- Build content `c332331eba6c347431a629b3f1833435a98b4af6f04729052bcc598d65c45a4c`.
- Covered grate/wall/open sight at three charge levels, real Charger damage behind a grate, physical Bomb grate collision, mirrored hands, converged hand control, endpoint obstruction, invalid coordinates, real-rig unsafe birth, normal hand alternation, and missing/duplicated adapter anchors.
- PR697 exact `a90d94fa45df253a2e915ac908434726bf8e9430` frame-order adapter was applied to the adapted native weapons source: one relocated sight method, the corrected grate mask and module syntax all pass. This is the shared source connection check, not a full PR697/browser acceptance.

Combined browser/CI acceptance belongs to the next integration batch. No physical-device or original-game measurement is claimed. The new guard changes local birth obstruction handling, not network authority or remote packet format.
