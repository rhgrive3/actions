# INKWAVE: Splatoon 3 11.3.0 Bloblobber source-parity audit
Updated 2026-10-22. Scope: `WeaponSlosherBathtub`, all four projectiles.

## Source provenance and confidence
- **Primary extracted numbers:** `Leanny/splat3` pinned commit `7280ff9cde8bb1c5dcef46c700c326471584d2e6`,
  `data/parameter/1130/weapon/WeaponSlosherBathtub.game__GameParameterTable.json`.
- **Published S3 behavioral checks:** https://splatoonwiki.org/wiki/Bloblobber (use S3 section only);
  Japanese system spec https://wikiwiki.jp/splatoon3mix/システム詳細仕様 ;
  dedicated technique https://sites.google.com/view/spl3bloblobber/オバフロテクニック/オバフロちょこっとリファレンス .
- **Parameter field interpretation:** https://wikiwiki.jp/splatoon3mix/%E6%A4%9C%E8%A8%BC/%E3%83%91%E3%83%A9%E3%83%A1%E3%83%BC%E3%82%BF%E6%83%85%E5%A0%B1/%E3%83%A1%E3%82%A4%E3%83%B3 explains that `FrameOffsetDegreeRate` is the multiplicative yaw-sweep correction specific to Bloblobber.
- **Unverified native engine defaults:** https://splatoonwiki.org/wiki/User:XarrotD/paramtable .
  The source group is *sparse*: a field absent in the JSON is NOT proof that the Nintendo engine disables its default.

## Source and implementation inventory
| Behavior | 11.3.0 source | INKWAVE owner / evidence |
|--|--|--|
| Four projectile groups | 1 large + 3 small | `UnitGroupParam.Unit`, catalog `emitUnits` |
| Launch timing | windup 6F; later small bubbles 5/10/15F | `SwingLiftFrame`, `UnitDelayFrame`, `AfterOffsetDelayFrame`; production true-birth queue |
| Ground speeds | large .53982 m/F; small .53, .52, .51 m/F | emitted sourced speed |
| Air speeds | large .51 m/F; small .50, .49, .48 m/F | selected at true birth |
| Y lift | +.2 times horizontal launch speed | `AddSpawnSpeedYRateByXZ` |
| Straight/brake/free | straight 3F; brake .01 drag + .01 gravity for 1F; free .01 drag + .015 gravity | `advance`, fixed 60Hz |
| Collision growth | large field .075→.75 at 4F; small .05→.5 with offsets | `collisionRadius`; source core for floor contact |
| Ground termination | two rebounds, terminate at third floor touch | `groundBounces` |
| Wall | unlimited; outward speed multiplier .8 | `reflect(normal)*.8` |
| Radius shrink | ×.75 per rebound | shared physical & visual collision decay |
| Bounce paint | 1.65 large / 1.32 small, later ×.85 | `finishContact`; 11.3.0 rows |
| Damage | 32 each | `DamageParam.ValueMax/10` |
| Move inheritance | `ZRate=.5`, `YMinusRate=0` | `applyCatalogPlayerVelocity` |
| Floor NearestParam | `PaintWidthHalf=2.2`, `PaintDepthScale=1.2`, player colliders 0 | newly reuse native `paintSlosherNearest`, grounded and authority-only |
| Yaw during 6F windup | technique page: reticle movement influences all four trajectories | newly reuse native INKWAVE Slosher last-yaw-step × sourced later 5F spacing |

## 0° / -45° flat-floor empirical INKWAVE baseline
Actions `39708248288`, numerical-main job `119593237910` (actual production-composed projectiles):
- Original big: 28.53329 (0°) / 20.09918 (-45°).
- Original three small: 21.16/21.16/20.84 (0°) and 12.04/12.04/12.04 (-45°).
- Removing only the old **whole-vector** speed cap in a test-only counterfactual changes -45° small endpoints to 19.70/19.08/18.45. This does NOT prove retail equality.
- Merged PR #1772 already changed the small-bubble `BounceAfterMaxSpeed=.35` handling to cap only outgoing floor-normal speed. It preserves forward speed but is a testable INKWAVE interpretation, NOT decoded Nintendo code.
- This PR does not modify those ballistics again. Tests must prove static 0/-45 trajectories remain unchanged.

## Fix in this PR
1. Sample signed yaw motion at a fixed 60Hz only while the accepted `SwingLiftFrame` is counting down.
2. Match existing native INKWAVE Slosher's angle wrapping, last-tick sample and ±10°/F clamp, and its cumulative `AfterOffsetDelayFrame` yaw offsets for the three late bubbles; multiply the offset by the pinned **Bloblobber-only `FrameOffsetDegreeRate = 0.3`**, then clamp its total magnitude to **`FrameOffsetMaxDegree = 10°` (documented default)**, as explained in the Japanese parameter documentation. Four velocities are committed **at release**, not updated by later camera movement.
3. Reset the per-swing sample on cancel, switch or release, preventing stale prior actions.
4. Reuse the source-guided native Slosher `NearestParam` paint-only release owner instead of omitting that ink stamp entirely. Preserve source width/depth, deterministic local paint seed, remote/airborne guard and zero player collision radius.
5. No source JSON, shared shooter physics, hit protocol or game asset changes.

## Explicit remaining uncertainties (not disguised as parity)
- `BounceAfterMaxSpeed` is explicit .35 in small group, absent in large group; generic default .4 exists, but exact native application/ordering is not decoded.
- `UpHill*` and `DnHill*` parameter defaults include slope thresholds, normal/tangent factors and added speed. Precise original branch conditions and equations are not recovered. The existing elastic physical slope-reflection remains INKWAVE's current model.
- `FrameOffsetDegreeRate=.3` is now applied as a yaw-sweep multiplier, backed by the Japanese parameter guide and the pinned 11.3.0 record. Exact Nintendo per-frame sampling, pitch-sweep formula and `FrameOffsetMaxMoveLength` limits are still unknown; the yaw model follows the *native INKWAVE family implementation* rather than recovered Nintendo source code.
- Native timing of muzzle animation, camera convergence, field-shell graze, 480F cleanup, wall-edge normal selection, source foot paint SpawnOffset local-axis mapping, true Switch actor hurtboxes and simultaneous bubble hit distances all need original engine code or frame-accurate Switch captures to certify equality.
- A passed Node or browser CI test is not proof of visual/behavioral 11.3.0 perfection.

## Focused regression gates
`patches/splatoon3/tests/bloblobber-launch-sweep.test.mjs`: yaw wrap, native clamp, 4 real projectile yaw with stationary/moving reticle, no post-release retargeting, reset on new volley, source grounded-only NearestParam stamp exactly once, no unnecessary airborne foot paint.
`patches/splatoon3/tests/bloblobber-flat-45-audit.test.mjs`: independently recorded 4 projectile flat 0/-20/-45 trajectories and bounce velocities.
Other existing tests: `catalog-projectile-vfx-range.test.mjs`, `catalog-slosher-birth-speed.test.mjs`, `catalog-slosher-flight-contact.test.mjs`, built-stage and full-source checks.
