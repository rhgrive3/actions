# WEAPON_SPEC (data: src/game/data/weapons.ts)

All weapons resolve aim as: camera ray → target point (world hit or max range) → shot direction from the character's muzzle to that point. Projectiles are pooled (512) and simulated in the fixed step: straight flight for `straightTime`, then gravity + horizontal deceleration; segment-vs-world raycast and segment-vs-player cylinder tests each tick; damage falloff by age.

## Splattershot / スプラシューター
- 6 f interval, 3 f first-shot delay, 0.92 % ink/shot, 20 f refill delay.
- 36 dmg (18 min) falloff from 8 f to 15 f of flight; projectile 24 m/s, 4 f straight, gravity 26, hit radius 0.22, life 28 f.
- Spread 6° ground / 12° airborne, +0.4°/shot degradation (max 3°), recovers 12°/s; every ~3rd shot flies straight.
- 0.75× move speed while firing (0.25 s after last shot). Paint: 0.62 m impact splash + 2 secondary droplets, 0.36 m drips.

## Splat Roller / スプラローラー
- Tap = **horizontal flick** (8 f startup, movement locked; 9 globs in ±30° fan, 150→50 dmg, ink 8.5 %, 22 f recovery at 0.55× speed); centre globs fly furthest.
- Airborne or V-FLICK button = **vertical flick** (17 f startup; 7 globs in a line up to 11 m, 150→40 dmg, 9 % ink, 30 f recovery).
- Hold = **roll** at 5.4 m/s (1.125× run): strip 1.75 m wide painted ahead of the drum; 5.4 %/s ink; contact damage 70, or 125 after 10 f of dashing (0.5 s per-victim cooldown). Drum spins with travel; flick splashes under the roller.

## Splat Charger / スプラチャージャー
- Hold to charge: 60 f to full (0.6× rate airborne), 0.21× move speed, laser sight visible to everyone once > 5 %.
- Release: damage 40 + 120·t² (convex), range 6 → 14.5 m, ink 2.25 % + 15.75 %·t drained during charge, 20 f recovery.
- Full charge pierces players; partial stops at first hit. Beam VFX + dotted ink line on the ground beneath + impact splash.
- Diving into ink with > 2 % charge stores it for 1.5 s; re-holding fire resumes from the stored charge.
- FOV tightens by up to 8° while charging.

## Golden tests (manual/automatable — see TEST_PLAN.md)
Shooter 10 s continuous: expect 97 shots (1 first-shot delay) and 89.2 % ink → forced refill pauses. Roller 10 m roll: 45 strip stamps, 10 % ink. Charger: min/half/full → 40 / 70 / 160 dmg, 6 / 10.25 / 14.5 m.
