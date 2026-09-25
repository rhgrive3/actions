# RESEARCH

## Sources consulted (this session)
- Nintendo Support — "How to Update Splatoon 3" (update history: 11.3.0 2026-08-19, 11.2.0 2026-06-10, 11.1.0 2026-03-18, 11.0.1 2026-02-04, 11.0.0 2026-01-28 incl. Flow Aura).
- Patch-note mirrors (gonintendo, miketendo64) confirming 11.3.0 as latest and its content (Plastic-Bottle Shot Replica = Tentatek Splattershot kit; no base-kit changes to the 3 target weapons).
- Inkipedia weapon pages (Splattershot / Splat Roller / Splat Charger) — frame data, damage, ink %, move-speed multipliers (values in REFERENCE_MATRIX.md; T2).
- Public gameplay/test-range footage knowledge for movement timings, camera framing, Scorch Gorge layout, ink splat shapes (T3, estimated with error bars in MEASUREMENTS section of STAGE_SPEC.md).

## Key findings applied
1. Turf War: 3:00, floor only counts. → scoreMask excludes walls/grates.
2. Splatoon shooters: 6 f interval, ~1/3 shots perfectly straight, spread doubles in air. → implemented.
3. Roller: tap flick vs hold roll; airborne = vertical. → press-time discrimination 0.16 s.
4. Charger: 60 f full, charge storable when submerged, partial charge damage scales; laser visible while charging. → implemented.
5. Camera never copies jump Y instantly; vertical follow is soft. → separate vertical spring (3.2 Hz vs 6 Hz).
6. Body faces aim direction while moving/firing, lags when idle and snaps on large turns. → body-yaw follow with turn-in-place threshold.
7. Scorch Gorge: elevated spawns, central sniper perch per side, low gorge with mid platform, asymmetric lanes (low left / high right from each spawn) that become symmetric via 180° rotation. → blockout.
8. Enemy ink slows drastically, damages up to a cap, prevents normal jumps. → implemented.
9. Ver. 11 systems: Flow Aura (visual implemented), health indication (implemented as damaged-only marker).

## Open questions (confidence LOW)
- Exact Flow Aura conditions/effects. Exact Scorch Gorge metric dimensions. Exact per-weapon drip cadence. Exact wall-swim speed. Squid Surge timing (not implemented).

# TODO / triage for future research
- Capture 60 fps footage frame counts for Squid Surge, Super Jump, and roller dash threshold to replace estimates.
