# INKWAVE Bloblobber: flat-floor -45° range investigation (2026-10-22)

## Verdict and evidence levels
- **Observed by user (retail A/B, qualitative):** Bloblobber on a flat floor, aimed down ~45°, runs out much sooner than Splatoon 3 Ver.11.3.0.
- **Confirmed in executed production-composed INKWAVE CI:** first large bubble flies **28.533295 world units at 0°**, versus **20.099179 at -45°**, when fired from a level origin. Actual CI log: GitHub Actions run `39618360969`, job `119284966975`, test `catalog-projectile-vfx-range.test.mjs`.
- **Independent 60Hz integrator reproduction:** implementing the current source-selected velocity, per-frame 1% drag / .015 gravity, core-radius floor contact, 2 bounces and the `.35` total-speed cap yields **~12.0 world units** for the first of three smaller bubbles at -45° (versus ~20.1 for the large bubble). That calculation reproduces the executed large-bubble endpoint to <0.001 world unit, but is NOT an executed four-bubble runtime measurement.
- **New executable audit:** `patches/splatoon3/tests/bloblobber-flat-45-audit.test.mjs` prints real emitted main-weapon trajectories for all 4 bubbles at 0°, -20° and -45°, including each rebound velocity. Once CI runs, inspect `BLOBLOBBER_FLAT_BOUNCE_AUDIT` and append its actual four-round trace before claiming exact figures.
- **Retail -45° distance:** no reproducible console measurement recovered. Do not claim an exact ratio to the retail game yet.

## Deterministic code-level causes
1. **Whole-vector ground speed cap on the later three bubbles**:
`main-weapon-catalog.mjs` `finishContact` computes elastic `p.vel.reflect(h.normal)`, then if the source small-bubble `BounceAfterMaxSpeed` is present, it clamps the full `p.vel.length()` to `0.35*60` world units/sec after *each* floor collision. This cuts *horizontal as well as vertical* movement.
2. **Launch pitch is preserved; geometric horizontal component shrinks**: launch forward speed is `0.53*cos(45°)` units/frame for the small bubbles, and launch Y is boosted by `0.2*horizontal speed`. A steep down-shot contacts the floor almost immediately; a horizontal shot does not.
3. **S3's angle/slope-dependent floor rebound law is not in the INKWAVE interpreter**: the current floor uses purely elastic normal reflection with no recovered `DnHillBounceAfterAddSpeed`, `DnHillDegUseBounceAfterMinDeg`, `UpHillBounceRateCross`, etc. The publicly documented *struct default names/values* are not enough to establish the exact 11.3.0 dispatch conditions; the pinned weapon JSON does not store these implicit defaults.

## Numeric diagnostic (not a retail baseline)
Large-bubble executed runtime reaches (world):
| pitch | first ground rebound | second ground rebound | third ground touch |
| --- | ---: | ---: | ---: |
| 0° | 12.170975 | 21.798333 | 28.533295 |
| -20° | 4.351236 | 12.861665 | 19.018060 |
| -40° | 1.515092 | 12.983072 | 20.361574 |
| -45° | 1.216393 | 13.063827 | 20.099179 |
| -60° | 0.636402 | 11.209217 | 16.759119 |

Reproducing the same 60Hz maths for small bubble 1 at -45° with current **full-vector** cap:
- first floor `~1.25`, second `~7.65`, terminal `~12.04`.
- disabling **only** the cap in a separate *analytical counterfactual* yields `~19.70`, ~64% farther; this is **not** evidence the retail game disables the cap.
- The small-bubble floor cap `0.35` **is** in pinned 11.3.0 `BounceGroupParam.BounceParam`. The **exact applicability and component** (full speed, vertical only, angle-conditional, etc.) has not been recovered.

## Other candidates and non-causes
- PR #1749 (merged) changed wall-edge **classification**; it does not change a perfectly flat floor's bounce response, so it cannot fix this case.
- PR #1600 addressed expanded collision-shell false floor hits, and the 0°/-45° large-bubble traces confirm 2 complete post-contact bounces in the unit fixture. We cannot dismiss a second false collision in specific practice-stage geometry without stage tests.
- `life=480/60` is an INKWAVE fallback; the -45° test terminates at the third floor, not due to the 480F age guard.
- For S3 typical aim, wiki reports effective ~5.3 range lines and guaranteed four-hit ~4.7 lines. These metrics are **not -45° endpoints**. Never compare them as if they were the -45° third-floor location.

## Evidence / next engineering decision
1. Read the new 4-round **actual runtime** CI log; isolate the ground-response cap's contribution per group and the first/second collision.
2. Compare 0° and -45° **separately for first and small three bubbles** to matched Ver.11.3.0 video in test range, with muzzle/eye/pitch controlled.
3. Change the *conditional* speed cap or add slope/angle handling only once retail measurements or decoded logic establish the rule. An arbitrary global `bounce *= 1.4` or removing the `.35` cap would be unjustified.
4. If the physical trajectory is adequate but visible ink paint is missing, inspect splash-drop emission separately rather than modifying projectile velocity.

Sources: [Leanny S3 11.3.0](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSlosherBathtub.game__GameParameterTable.json), [Inkipedia bounce data](https://splatoonwiki.org/wiki/Bloblobber), [XarrotD generic parameter defaults](https://splatoonwiki.org/wiki/User:XarrotD/paramtable). 
