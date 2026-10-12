# INKWAVE floor-paint footprint audit (2026-10-12 UTC)

## Target / source provenance

- Reproduction: `rhgrive3/actions` public `inkwave-public/src/world/paint.js` through `patches/splatoon3/adapter.mjs` and `scripts/inkwave-source-composition.mjs`, not the historic prototype.
- Main when the branch was opened: `ed3a046574208471c5db5309e2469d263cacfdfd`.
- Comparison rules: Splatoon 3 Ver.11.3.0; pinned [Leanny source tables](https://github.com/Leanny/splat3/tree/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon); pinned `MAIN_WEAPON_CATALOG` contains 65 main weapon records, including 14 Shooter, 7 Blaster, 5 Roller, 3 Brush, 8 Charger, 6 Slosher, 6 Splatling, 6 Dualies, 4 Brella, 3 Stringer and 3 Splatana records. Non-Splatoon-3 generation data are secondary research, not a 11.3.0 calibration oracle.
- [Source Splat Roller](https://raw.githubusercontent.com/Leanny/splat3/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponRollerNormal.game__GameParameterTable.json) BodyParam PaintParam: WidthHalfMax=2.8, SpeedMax=0.132 per 60Hz frame. The community [Inkipedia Splat Roller data](https://splatoonwiki.org/wiki/Splat_Roller) also describe maximum rolling width 5.6 source units. No intermediate width law is present in the sparse table.
- `WeaponRollerNormal` VerticalSwingUnitGroupParam: SpawnSplashNum=5, first=1.2, spacing=4.6, SplashPaintParam WidthHalf=1.287, WidthHalfNearest=1.287, DepthScaleMax=3. These are source **release counts and envelopes**, not five independently confirmed ground-hit stamps; four intermediate drops plus one separately owned nearest splash is the current model.
- Legacy/main Shooter, Slosher, Roller impact radii/depths already use dedicated sources under `runtime/shooter-impact-paint.mjs`, `runtime/roller-impact-paint.mjs`, `runtime/roller-vertical-paint.mjs` and `runtime/blaster-flight-paint.mjs`. This patch deliberately does not replace their per-weapon 11.3.0 numbers with a global radius multiplier.

## Root cause and code ownership

1. The procedural main-body radius was `radius * wob(angle, seed)` and `wob > 1` on many angles; even after the older ancillary-reach trimming, one source WidthHalf became a larger INKWAVE-defined body footprint. Use `radius * min(1,wob)` in GL shading, CPU owner-cell decisions, and separately credited delayed ray roots. **Only lobes outside the supplied radius are clipped; inside-body irregularity, stretch/depth and real stamp positions remain.**
2. The native protected-source Roller-band CPU/GPU seed-wave and zero-crossing fix already exists in `issue-batch-1171-adapter.mjs` (#1165) and is **not a new change**. Its existing regression remains intact.
3. Live turf-only area and wall/dead-cell credit separation already exist in `score-hud-adapter.mjs` and ownership continuation. They were **not newly introduced**. New tests protect the contract while body radius changes.
4. The seven added catalogue Rollers and Brushes used `a.pos + a.aimDir*.6` for the floor splat. A sufficiently downward-tilted aim origin was **below the ground**, making the downward ray miss even while rolling. Paint now follows horizontal drum heading at `a.pos.y + .35`. Damage contact retains its previous vector. The last accepted contact is used to subdivide abnormally long updates (max 6 stamps) and reset on release, fresh weapon, cancel and defeat.
5. The legacy Splat Roller roller uses fixed native band morphology and a batching distance of .28; a first stationary contact was dropped, and a large step could leave a gap. Retain first contact and only subdivide anomalously long displacements. No flight integration, collision, shot projectile/VFX, or ② interface change.

## Numeric before/after: isolated source-width body mask

Pixel-independent CPU integration of the **native procedural body only**, with `R=1`, square sample pitch `0.025` world units, full `[-1.5,+1.5]^2`. `area` counts occupied sample centres times `0.025^2`; absolute calibration to retail square metres is not established.

| Seed | Baseline body area (WU²) | Capped body area (WU²) | Difference |
| ---: | ---: | ---: | ---: |
| 0.00 | 3.3219 | 2.9231 | -12.00% |
| 0.10 | 3.3125 | 2.9181 | -11.91% |
| 0.37 | 3.3138 | 2.9438 | -11.17% |
| 0.77 | 3.3244 | 2.8881 | -13.12% |

The single-stamp body difference scales with `R²` for uniform radius changes. This comparison **excludes** the forward smear, prior/existing rays, wall drips, accumulated overlap across multiple shots, source-ground contact scheduling and render AA; it must **not** be relabeled as final turf score reduction or accuracy versus the retail Switch.

## Regression and performance checks

- `tests/floor-paint-fidelity.test.mjs`: shader/CPU/late ownership body-edge agreement, seed sweep, source-radius bound, live floor vs wall vs buried-cell credit, native stationary and subdivided rolling.
- `tests/catalog-roll-floor-contact.test.mjs`: native seven added Roller/Brush runtime paths, down-aimed reticle, source WidthHalfMax, direction order, displacement cap and release/no stale bridge.
- Existing `issue-1165-roller-band-grid.test.mjs`: seeded, rotated CPU/GPU band equality, no surface gap.
- Local-quality `paint-hotpath-adapter.mjs`: retained proven `r*.68` shortcut with exact `min(1,wob)` body. Its parity suite asserts unchanged hotpath versus the new slower oracle.
- CI status and exact immutable head must be checked on the PR. Ordinary rolling still emits the existing number of stamps; only exceptional movement adds work up to a bounded limit. There is **no claim of a measured browser FPS or GPU speedup**, no full 65-weapon retail footage comparison, and no Nintendo emitter/texture equivalence.

## Remaining calibration boundaries

- Nintendo's actual runtime ink-mask generation/paint fraction is not completely described by the sparse parameter JSON. `WidthHalf` is used as an envelope based on its name/schema, but that does not prove a hard Nintendo clip to the same circular body.
- `worldUnitsPerSourceUnit=1` is the project's working calibration, not an independent retail-world scale match.
- Horizontal and vertical Roller flick **flight path/landing positions** are separately owned by projectile physics/②; no out-of-scope retiming is bundled to conceal source landing gaps.
- The source-scheduled intermediate ink-drop counts/spacings and final paint area require direct comparable measured retail ground masks before claiming exact 11.3.0 equivalence.

## Follow-up: significant *systemic* mismatch, not just an 11–13% blob correction (Oct 13 JST)

**Important correction:** The earlier isolated blob area change of ~11–13% is NOT an estimate of total per-shot or retail area accuracy. A new source-audit found the larger issues below, which must be resolved before this PR can be described as full retail paint fidelity.

### 1. Impact smear expands forward **and backward** without narrowing laterally

Production `inkwave-public/src/world/paint.js`, shader `PAINT_FS` and CPU `_cpuSplat`, remap incoming physical ink locations so that:

- positive forward axis scales by `1 + sa`;
- backward axis scales by `1 + .25*sa`;
- lateral axis is unchanged.

The verified [Splatoon 3 system investigation](https://wikiwiki.jp/splatoon3mix/%E3%82%B7%E3%82%B9%E3%83%86%E3%83%A0%E8%A9%B3%E7%B4%B0%E4%BB%95%E6%A7%98#) explicitly distinguishes fore-aft elongation with **reduced sideways ink width** for Shooter, Roller, Spinner/Splatling, Dualies and Stringer. It says the exact scaling law is still unknown. Hence the native width/length shape is **not reproduced** merely by passing sourced DepthScaleMax/Min into the existing smear.

For a unit circle and `DepthScaleMax=2.24` (`sa=1.24`), the current affine area multiplication is `(2.24 + 1.31)/2 = 1.775`, even before organic lobes and satellite rays, whereas the actual retail lateral-width compensation is not applied. A **hypothetical** width divisor `sqrt(1+0.625*sa)` would lower this single-stamp area by ~25%, but **this is not an extracted Nintendo law and must NOT be adopted as established physics**. A shape/coverage calibration with real reference is required.

### 2. Physical area and scored paint points are incorrectly treated as the same unit

`inkwave-public/src/game/actor.js`: `addTurf(area)` increments `stats.turf` **and** the special gauge by raw area. `inkwave-public/src/config.js`: `MATCH.pointsPerM2=1`, but this constant does not establish native score conversion. In INKWAVE, one world-unit-square of newly painted turf is treated approximately as one displayed/charging point. Source-backed 11.3.0 paint radius values alone do not justify that scoring rule.

The game's [community data](https://wikiwiki.jp/splatoon3mix/%E6%A4%9C%E8%A8%BC/%E3%83%A1%E3%82%A4%E3%83%B3%E3%82%A6%E3%82%A7%E3%83%9D%E3%83%B3) report Splattershot **4.0p/shot**, Splat Roller **20.4p horizontal /17.8p vertical** and full Splat Charger **23p/shot** under their measured action conditions. The separate historic INKWAVE source-composed diagnostic in Drive (`INKWAVE-weapon-audit-20261009.md`, base `5d0be6b7`) measured: Shooter **12.25 WU²**, Roller horizontal **78.625 WU²**, vertical **67.875 WU²**, Charger full **81.6875 WU²**, Slosher **14.625 WU²**. These are actual **INKWAVE CPU cells** on a single horizontal/action fixture but they are **NOT official game points or a new measurement on this PR's head**.

| Historical action | Historical INKWAVE WU² | Retail Wiki p/action | **Numeric WU²/p** (NOT a physical overpaint multiple) |
| --- | ---: | ---: | ---: |
| Splattershot single shot | 12.25 | 4.0 | 3.06 |
| Splat Roller horizontal | 78.625 | 20.4 | 3.85 |
| Splat Roller vertical | 67.875 | 17.8 | 3.81 |
| Splat Charger full | 81.6875 | 23.0 | 3.55 |
| Slosher | 14.625 | 13.6 | 1.08 |

**Do not interpret this table as “INKWAVE paints N times more physical ground.”** The numerator is INKWAVE world-square-area and the denominator is Nintendo turf **points**. Nevertheless it proves that equating world-unit-square to one native point is not independently calibrated, and changing only blob radii does not solve scored points or special buildup. Splatoon 2 community sources estimate ~3.3m² per point; transplanting that exactly into Splatoon 3 without verifying the shared physical area and map scaling is also unproven. The Slosher exception is further reason to measure weapon-specific footprint and contact timing instead of a blanket scale.

### 3. Shooter/Charger intermediate emissions must be measured separately

A Splattershot's source `SplashSpawnParam.SpawnNum=1.5` schedules 1 or 2 candidate drops by successful shot count; only released, surviving, physically landed droplets should ink. The existing projectile/drop owner is separate from this PR's ink rasterizer. Existing catalogue Chargers also use a repeated `floorPaint(..., d.radius)` sweep; whether that full radius applies along the entire line and its actual overlap with the terminal stamp is not established by the sparse `RadiusFullCharge` field. This is a concrete area-inflation hypothesis that needs matched action-level area tests, not an assertion of an already proven retail mismatch.

**Current acceptance stance:** PR #1302 contains limited structural improvements and tests, NOT a fully calibrated 65-weapon paint solution. Do not merge claiming retail footprint or native point/charge equivalence until the complete composed runtime is action-level calibrated and the width/length formula is justified. No arbitrary universal radius multiplier or point-scale correction is silently inserted into production.
