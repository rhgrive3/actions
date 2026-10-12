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
