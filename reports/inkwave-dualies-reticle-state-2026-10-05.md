# Dualies authoritative reticle lifetime (#518)

Base: integration536 `9f1d794f79f3f78d0d2a4920fe16667b8a2e1b06`. Target is public INKWAVE plus production adapters. Raw source, CSS/pixel geometry, spread, cadence, motion and input mappings are unchanged.

## Root and change

The real S3 weapon runtime keeps `s3Turret=true` after a completed roll while firing stationary, even after the separate movement-lock timer `lockT` expires. The HUD nevertheless read only `lockT>0`, so concentrated firing still used zero spread and the4F cadence after the visible reticle had returned to its ordinary state.

Replace that one HUD state read with `s3Turret`. Keep `dodge` as the independent mid-roll presentation state. Native runtime state termination on release, permitted movement, squid form, sub action, reset and weapon switch therefore terminates the visual state on the same draw. Missing local actors fail to the inactive state. No visual timer extends or shortens gameplay.

Reference scope: current [Splat Dualies](https://splatoonwiki.org/wiki/Splat_Dualies) and [Dualie](https://splatoonwiki.org/wiki/Dualie) post-roll concentrated firing/reticle behavior, acceptance baseline Splatoon3 Ver.11.3.0 as documented in Issue518. The actionable proof is the disagreement between existing authoritative accuracy and HUD state. Exact Nintendo merged-ring pixel dimensions, diamond replacement and easing require direct capture and remain outside this state-lifetime fix.

## Verification

The tests evaluate the entire actual HUD ES module through all production adapter layers (and again from the minified site), then invoke its real `_updCrosshair` with a small DOM surface. They use the actual native `tryDodge` and `_dualies` paths, not a reconstructed game-state model.

- Completed roll begins post-roll class and clears the separate mid-roll class.
-80 stationary held-fire updates retain the class after lockT reaches0; actual spread remains0.
- Release/movement/squid/sub/reset/weapon transitions end the class with s3Turret; a physical movement lock may still exist without falsely retaining it.
-120 draws cannot mutate gameplay cooldown/spread/cadence or state.
-30/60/120 rendering schedules retain the semantic lifetime. This reads one common local actor regardless of input source; it does not claim new hardware sensor/controller testing.

Native4/4 passed. The prior minified build lacking the new HUD connection fails all4 tests, including lock-expiry mismatch. Final minified/full aggregate receipts accompany the local handoff. No browser screenshot, new geometry calibration, or Switch device measurement is claimed.
