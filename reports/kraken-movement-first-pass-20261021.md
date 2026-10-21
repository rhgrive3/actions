# Kraken movement first pass, 2026-10-21

Baseline: main 95c25af145418691991a1452d4d10589754a0f1c. Open PRs at inspection: 1741,1740,1739,1738,1737,1736,1735,1732; none dedicated to Kraken. Original snapshot is unchanged.

Reference: Splatoon 3 11.3.0. Extractor's primary data: https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpCastle.game__GameParameterTable.json . This is community extraction, not Nintendo-published numerical specification.
Repository reference/README.md maps normal player .096/.192 to 5.76/11.52 and profile.json agrees; Crab target movement uses raw *60 too. This change uses that same convention, not a claim of measured Switch-to-world scale.

## Concrete baseline differences
- all-specials.mjs normal speed5.5, dash21, charge1.9 were explicit INKWAVE calibrations. Source MoveSpeed .192 and floor dash .3 map to11.52 and18. Charge endpoints .2/.1 multiply normal speed; linear interpolation is still calibration.
- Grounded normal travel did not paint. Dash used two or more broad fallback-ground stamps every frame, potentially projecting to a remote floor. Source BodyParam gives PaintSpanFrame4, PaintWidthHalf1.2, PaintDepthScale1.2, normal offset.3/dash offset.8.
- special-presentation.mjs uses opposite-phase arm x-rotation at frequency6+speed*1.4 and amplitude.35+min(.35,speed*.05). This is the flapping source. It is NOT fixed in this gameplay-only first pass; new real-footage comparisons are still needed before changing the animation.
- ZR hold then release is retained, not considered a defect. Jump60, dash120, swept radius1.5 and forward2.75 are retained.

## Change scope
Normal/dash speed caps and charge endpoint mapping; normal/dash floor painting using the existing source-splash path, 4F cadence, short local contact ray, no-special turf credit. No general character/hair changes. No new per-frame geometries, paint timer bounds stamp rate to15/s. Native movement collision and gravity owners remain in place.

## Tests and remaining acceptance
New production-composition fixture tests measure speed/one-second displacement at30/60/120Hz, diagonal normalization, 4F paint cadence, no special recharge, no airborne/missing-contact projected paint. They intentionally isolate integration to measure movement policy; not browser or Switch evidence.
At candidate publication these full Node fixture tests and emitted/browser checks are pending. V8 pure helper evaluation confirmed11.52/18 and2.304/1.152 endpoints only.
Need final-head CI, emitted runtime, actual-browser before/after clips including turns/walls/jumps/grates and measured floor trajectory, Nintendo footage side-by-side for arms; do not declare finished or exact.
Startup/end timing, whether total480 includes startup, wall movement speed, bullet knockback, dash-invalid10F, airborne attack timing, full collision volume and source rig animation remain separate unresolved comparisons. Existing startup60F and finish60F/invulnerability window unchanged.
