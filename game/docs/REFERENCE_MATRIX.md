# REFERENCE_MATRIX — values, sources, confidence

Units: 60 fps frame data converted to seconds (`F(n) = n/60`) in `src/game/data/tuning.ts` / `weapons.ts`. World scale: 1 unit = 1 m, Inkling ≈ 1.5 m. Splatoon "distance units" (DU) were normalised so that base run speed (0.96 DU/f) = 4.8 m/s, i.e. **1 DU ≈ 0.083 m**. Tier: T1 official, T2 Inkipedia (frame data w/ traceable sources), T3 footage measurement, T4 community.

| Key | Value used | Reference value | Source tier | Version | Conf. | Notes |
|---|---|---|---|---|---|---|
| Turf War duration | 180 s | 3:00 | T1 | all | HIGH | |
| Final-minute cue | 60 s | "1 minute remaining" | T1 | all | HIGH | |
| Run speed (Splattershot) | 4.8 m/s | 0.96 DU/f | T2 | 9.x+ | HIGH | scale anchor |
| Swim speed | 9.6 m/s | 1.92 DU/f (2.0× run) | T2 | 9.x+ | HIGH | |
| Enemy ink speed | 1.2 m/s | ≈0.24 DU/f | T2/T3 | | MED | |
| Enemy ink damage | 18/s, cap 40 | 0.3/f, cap 40 | T2 | | MED | |
| Run accel | full speed in ~9 f | 8–10 f (footage) | T3 | | MED | ±2 f |
| Jump airtime | ≈0.5 s (v0 6.9, g 22) | ≈30 f (footage) | T3 | | MED | |
| Squid transform | 8 f enter / 6 f exit | ≈8 f (footage) | T3 | | MED | |
| Squid Roll | 20 f, 12 f armour | armour on reversal roll | T2 | | MED | |
| Health | 100, recovery after 60 f | 100 HP, 60 f delay | T2 | | HIGH | |
| Respawn | 8.5 s | ≈8.5 s incl. animation | T2 | | MED | |
| Ink tank refill (squid) | 3 s | 3 s (180 f) | T2 | | HIGH | |
| Ink tank refill (kid) | 10 s | ≈10 s | T2 | | MED | |
| Splattershot fire interval | 6 f | 6 f | T2 | 11.x | HIGH | |
| Splattershot damage | 36 → 18 min | 36 / 18 | T2 | 11.x | HIGH | |
| Splattershot ink | 0.92 % | 0.92 % | T2 | 11.x | HIGH | |
| Splattershot spread | 6° ground / 12° jump | 6° / 12° | T2 | | HIGH | 1/3 shots straight |
| Splattershot range | 11.5 m | ≈2.3 test-range lines | T2/T3 | | MED | |
| Splattershot move-while-firing | 0.75× | 0.72 DU/f | T2 | | HIGH | |
| Splattershot refill delay | 20 f | 20 f | T2 | | HIGH | |
| Splat Roller H-flick dmg | 150 → 50 | 150 / 50 | T2 | 11.x | HIGH | |
| Splat Roller H-flick startup | 8 f | ≈8 f | T2 | | MED | |
| Splat Roller V-flick startup | 17 f | ≈17 f | T2 | | MED | |
| Splat Roller flick ink | 8.5 % / 9 % | 8.5 % / 9 % | T2 | | MED | |
| Splat Roller roll speed | 5.4 m/s | 1.08 DU/f | T2 | | HIGH | |
| Splat Roller contact dmg | 125 dash / 70 | 125 / 70 | T2 | | MED | dash after 10 f |
| Splat Charger full charge | 60 f | 60 f | T2 | 11.x | HIGH | |
| Splat Charger damage | 40 → 160 | 40 min / 160 full | T2 | 11.x | HIGH | curve convex (T3) |
| Splat Charger full range | 14.5 m | ≈2.9 lines | T2/T3 | | MED | |
| Splat Charger ink (full) | 18 % | 18 % | T2 | | HIGH | |
| Splat Charger charge storage | 1.5 s | stored charge in squid form | T2 | | MED | |
| Splat Charger move while charging | 0.21× | ≈0.2 DU/f | T2 | | MED | |
| Charger air charge | 0.6× rate | slower in air | T2 | | MED | |
| Camera FOV | 60° vertical | est. 58–62° (footage) | T3 | | MED | |
| Camera distance | 3.6 m, shoulder 0.55 m | est. from screen occupancy | T3 | | MED | |
| Scorch Gorge spawn→spawn | 104 m | est. ~9–10 s swim | T3 | | LOW-MED | |
| Scorch Gorge heights | spawn 8 / plaza 5 / perch 6.5 / floor 2.5 / mid 4.5 | relative heights from footage | T3 | | LOW-MED | |
| Flow Aura | 2 splats / 8 s → 10 s | "consecutive splats in a short period" | T1 (qualitative) | 11.0.0 | LOW | numbers unpublished |
| Team colours | Yellow #e6e200 vs Blue #4a3fdc | common S3 Turf colour pair | T3 | | MED | original hex values |
