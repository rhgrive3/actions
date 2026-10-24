# Rapid squid-form idle regression and jump-strength audit (2026-10-25)

## Baseline and user symptom

Base: `main` at `7f863ea2d65671abd1453fdae1b61de00f1d10e2`. User observed that repeatedly pressing the squid-form button corrupts the standing/idle animation. The request also asks whether squid-form normal-jump strength is genuinely faithful to Splatoon 3 Ver. 11.3.0.

## Animation cause and fix

The repository already contained `patches/local-quality/squid-form-ease-adapter.mjs`, including rendered-pose handoff for mid-gesture reversal, a continuous 0.15-second squid-to-human silhouette envelope, a corresponding 0.10-second native fallback dive envelope, pivot continuity and clip-rate preservation. **The production composer did not invoke it**: `patches/local-quality/adapter.mjs` only listed the file in `IDENTITY_FILES` but never imported/called `adaptSquidFormEase`. Therefore the gameplay build used the original discontinuous `Sqd_ToSquid`/`Sqd_ToHuman` switch and native form curves despite standalone adapter tests.

Now `adaptQualityLayer` invokes `adaptSquidFormEase` for its two intended module paths, after `adaptSquidMotionBinding`. All other files pass through unchanged. No physical player-form admission, collision, movement velocity, network protocol, gear mechanics or weapon timing is altered.

The new `patches/local-quality/tests/squid-rapid-idle-regression.test.mjs` checks the **actual composed** controller/character code rather than only the adapter module, and exercises 24 consecutive alternating form edges with zero-delta same-frame reversals at 30/60/120 fps, both source-motion and native-fallback paths. It then checks complete return to human idle, dry-squid `Sqd_Wait`, and human idle again, while verifying non-NaN/complementary mesh visibility scales and continuous source vertices during zero-time reversals. It is included in `npm run test:quality`.

## Jump baseline: what the engine ACTUALLY does

There are three distinct ordinary vertical impulses in the **composed** current game, not one:

| Launch condition | Source | Upward impulse | Estimated ballistic apex above takeoff at fixed 60 fps | Approx. zero-height flight |
| --- | --- | ---: | ---: | ---: |
| Human or dry squid on neutral own-uninked floor | `inkwave-public/src/config.js` `PLAYER.jumpVel` | 8.4 units/s | 1.349 units | 0.667s |
| Squid submerged in own ink | `PLAYER.swimJumpVel` | 9.4 units/s | 1.699 units | 0.733s |
| Standing in enemy ink, GP0 Ink Resistance | `patches/splatoon3/runtime/gear.mjs` `enemyJumpVelocity` | 0.08 * 60 = 4.8 units/s | 0.431 units | 0.383s |
| Standing in enemy ink, GP57 Ink Resistance | same, `gearExtra.enemyJumpVelocity` | 0.11 * 60 = 6.6 units/s | 0.828 units | 0.533s |

The estimates are **calculations from the existing discrete integrator**, not captured gameplay or Nintendo-measured heights. They use `dt=1/60`, `gravity=25`, `fallGravityMul=1.2` on descent, `apexGravityMul=0.82` for `|vY|<1.6`, and semi-implicit `y += vY*dt`. No rail, collision, step-up, ledge assist, surge, roll, weapon charge, full-cancel, gear-generated recovery or launch-geometry effects are included. At 30 fps, the calculated dry/ink apices are ~1.277/1.618; at 120 fps ~1.386/1.738: this difference arises from the current Euler step. Normal movement is routed through `patches/splatoon3/runtime/movement-physics.mjs`; absent a dualies dodge/glide, its `integrateMovement` calls the native integration once at the given dt.

The composed `patches/splatoon3/adapter.mjs` explicitly overrides the raw `onEnemy` multiplier `jv *= 0.72` with `this.s3.modifiers.enemyJumpVelocity ?? P.enemyInkJumpVel`, and applies the weapon-specific `normalJumpVelocity` cap. Quoting the raw actor's 0.72 multiplier as production behavior would be incorrect.

## Evidence against retail and confidence

- Splatoon 3 Japanese verification wiki identifies **1.5m small boxes / commonly traversable stage rises**, and reports **enemy-ink jump can access those boxes with Ink Resistance GP12 or higher**. This is a testable traversal benchmark, **not** an explicit retail normal-jump apex measurement: https://wikiwiki.jp/splatoon3mix/ギア/ギアパワー/分割2
- The same page reports an enemy-ink takeoff of **0.8 DU/frame** at GP0, with weapon charge caps **0.7 or 1.0 DU/frame**, depending on weapon. These are reported game-unit measurements; don't silently equate DU and INKWAVE metres.
- Pinned 11.3.0 decompiled parameter source: https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/misc/SplPlayer.game__GameParameterTable.json . It contains HighJump event coefficients (1.78 standard, 1.72 squid-action) and specialist actions/gear entries but **does not contain an authoritative ordinary submerged/dry-squid jump impulse and matching gravity policy**. The source's `spl__PlayerGrindRailParam.PlayerJumpSpeed=0.145` is a **rail jump**, not the normal grounded/squid jump; it cannot be substituted.
- GP57 enemy-ink ballistic apex of 0.828 engine units vs a 1.5m traversable small box suggests a serious **unresolved physical or collision/step-assist fidelity gap**, but the source does not prove the height expected from a flat takeoff or whether the engine's world units can be equated exactly to stage dimensions. An exact 11.3.0 squid jump match cannot currently be claimed.

**Decision:** do not blindly change `jumpVel`, `swimJumpVel`, gravity or networked collision parameters in this animation PR. The jump physics is **not verified faithful**. The specific check required for further correction is original ordinary-jump launch+gravity or input-to-peak footage at fixed elevation, plus 1.5m box traversal with GP0/12/57 and dry/submerged human comparisons. Any follow-up needs repeatable simulation at 30/60/120 fps and a no-regression collision/network gate.

## Verification boundaries

The test was committed into the production test command; actual green GitHub Actions, physical controller screenshots and retail capture are reported separately rather than presumed. This report does not claim original Splatoon 3 source motions are 1:1 with INKWAVE.
