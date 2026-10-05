# Roller flight paint and Storm coverage

Baseline: main b4d5c31e33258a0b6f874e42234448e404eec2d4. Targets #682 and #683 only.

## Changes

#682: WideSwing horizontal Roller rounds inherited native trailEvery=1.8, allowing every airborne glob to stamp turf repeatedly. The canonical Roller initialization now sets only horizontal trailEvery to zero, including reconstructed ghosts. Native impact paint, 13 horizontal / 5 vertical projectiles, trajectories, damage, collision, random launch geometry and vertical trail owner are retained. The vertical generic trail is not claimed to implement the source-specific bounded #423 model.

Reference: repository profile.weaponsFidelityCompletion.weapons.roller mirrors S3 11.3.0 at upstream extraction commit 7280ff9cde8bb1c5dcef46c700c326471584d2e6. Its WideSwingUnitGroupParam has no SpawnSplashFirstLength/SpawnSplashBetweenLength/SpawnSplashNum/SplashPaintParam, whereas VerticalSwingUnitGroupParam contains them. This is a structural correction, not a new absolute paint calibration or hardware measurement.

#683: the real cloud loop computes an existing growth/fade scale and uses scaled radius for Boss and visual rain. Player damage alone used the full radius. The fail-closed source adapter now uses the same existing scaled radius for Player distance rejection. At the first 60 Hz tick radius=3.6769259259: a player at x=4 previously lost 0.4 HP despite being outside the rain; it now takes zero. Existing 24 DPS, 8-second profile duration, drift, height, LOS, recipient ownership and retirement are unchanged. The existing main end-of-cloud cutoff remains separately owned by #563; this change does not implement or undo that pending fix. Rain paint distribution is also unchanged.

## Verification

- Before fixes: the new horizontal assertion observed trailEvery=1.8; the native cloud damaged x=4 to99.6 HP outside radius3.6769.
- Seven focused tests pass in source and emitted/minified build. They exercise native Projectile flight/impact, a restored-old-cadence negative, horizontal/vertical/ghost separation, raw group structure, real Actor HP, growth/fade radii, LOS/height/team/remote exclusions, and identical fixed60Hz traces driven at30/60/120Hz.
- Existing focused fidelity/sub-special suites plus initial new cases:21/21.
- Production build succeeds, content2c9f8ec8f489. Build output is temporary because the persistent workspace is nearly full; logs remain in the workspace.
- All15 existing trajectory/range/paint goldens pass without changing their expectations. The subsequent inherited packet verifier fails its old27-field mock-recorder assertion against current native metadata. Existing PR701 already owns the native32-field verifier correction; it is not duplicated here and this run is not reported as full canonical acceptance.
- No browser, physical Switch, mobile hardware or mixed-version online acceptance is claimed by these local tests. Exact Draft CI remains the acceptance gate.

## Ownership audit

Fresh open issue/assignee/comment and Open/Draft PR body checks preceded claims. #660/#661 were initially investigated, then released: the actual installWeapons->_new wrapper already clears s3Weapon/s3DamageGroup/s3Vertical, and Shooter-to-Slosher reuse emitted9 correct units without error. No redundant pool reset is included. #627/#628 were excluded because existing #670 owns victim-side group accounting. #668's Storm overlap/recovery remains its own work; this batch changes only the native Player radius anchor and can compose before that collector hook.
