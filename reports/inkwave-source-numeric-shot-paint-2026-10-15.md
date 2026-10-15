# S3 11.3.0 Shot Paint: Source-Numeric Correction

## Immutable source

- Leanny/splat3 commit `7280ff9cde8bb1c5dcef46c700c326471584d2e6`
- `data/parameter/1130/weapon/WeaponShooterNormal.game__GameParameterTable.json`.
- INKWAVE locked `patches/splatoon3/profile.json` (`weaponsFidelityCompletion`), `main-weapon-catalog-data.mjs` (65 original mains, 11 families), and the original source physics/ink-flight runtime.

| Internal key | Raw source |
|---|---:|
| `PaintParam.WidthHalfNear / Middle / Far` | `1.93 / 1.93 / 1.71` |
| `PaintParam.DistanceMiddle` | `1.1` |
| `spl__BulletShooterPaintParam` schema defaults | `DistanceNear=1.1, DistanceFar=20, DegreeUseDepthScaleMax=10°, DegreeUseDepthScaleMin=35°` |
| `PaintParam.DepthScaleMax / Min` | `2.24 / 1.31` |
| `PaintParam.DepthScaleMaxBreakFree / MinBreakFree` | `2.24 / 1.12` |
| `SplashPaintParam.WidthHalf / WidthHalfNearest` | `1.472 / 2.0608` |
| `SplashSpawnParam.SpawnNum / SplitNum` | `1.5 / 8` |
| `SplashSpawnParam.ForceSpawnNearestAddNumArray` | `[4]` |

## Diagnosis and correction

The project already removed invented satellites/spatter from its ordinary paint shader in `patches/splatoon3/adapter.mjs`, shrinking the generic reach to approximately 1.75 times the nominal paint radius. The first version of PR #1443 then divided source radius again by 2.56/2.08; that second factor came from the **unpatched** artist shader, not S3 parameters, and failed 16 source/match tests including zone capture. This is reverted; retaining raw `WidthHalf` values is an explicit invariant.

The revised build creates dedicated sourced physical paint kinds. A single source impact keeps its parameter-space width; a detached source splash keeps its distinct `SplashPaintParam` width and its `SplashSpawnParam` birth schedule. The source physical paint mask uses a plain parametric ellipse: lateral half-width is the exact source WidthHalf, with authored forward DepthScale; there is no additional artist-defined wobble on authoritative ink. Its depth uses the resolved source `DepthScale`: the existing asymmetric PaintSystem mapping (front 1+sa, rear 1+sa/4) with sa=1.6×(depth−1) and center offset .375×radius×sa is algebraically equivalent to a centered ellipse of half-depth radius×depth. Removing the rear quarter contribution breaks that identity, so it is retained as a coordinate conversion rather than an added paint bonus. No source event generates additional CPU-scored artist rays, satellites, spatter or unsupported wall drips. The same source kind, radius and stretch are used in shader, CPU ownership and full-precision network replay. Generic bombs, specials, death blast, roller body and unreconstructed paint types keep existing behavior.

Source-guided shooter-family `InkFlightRuntime` uses the same kind. For `WeaponShooterNormal`, the actual native head hit resolves `WidthHalfNear / Middle / Far` and `DepthScale*` through `shooterImpactRadius` / `shooterImpactDepthScale`, using the additional documented Shooter schema defaults `DistanceFar=20` and `DegreeUseDepthScaleMax/Min=10°/35°` (rather than inventing a far anchor at the weapon's firing range). The native `inkPhase` selects the actual straight versus brake/free state; exact retail break/free depth-height selection remains unverified. Dualies uses its existing sourced impact width/depth. The catalog helper uses the source kind across its source-derived main weapon paint emissions.

## Explicitly not proven

- Nintendo's proprietary mask texture, exact boundary wobble, splash animation and area sampling have not been extracted. The simple source-width ellipse is an INKWAVE geometry fallback, *not* an authentic Nintendo texture.
- The profile's `worldUnitsPerSourceUnit=1` is an existing INKWAVE mapping, not independent Nintendo world-to-metre verification. Wiki `×0.2` conversions mean range-marker units and must not be silently applied to the INKWAVE game-world scale.
- Shooter sparse weapon JSON omits some typed schema defaults. Inkipedia's [Shooter parameter table](https://splatoonwiki.org/wiki/Template:Shooter_data_S3) separately lists `DistanceNear=1.1`, `DistanceFar=20`, and 10°/35° angle thresholds. This revision now uses those explicit schema defaults, not the weapon's firing range as a substitute. These defaults are secondary documented parameter evidence, not verified against an original Nintendo executable.
- The `DepthScaleMaxBreakFree` / `MinBreakFree` height-versus-impact-angle selector is not fully understood in available source. The current fallback is provisional and is not proof of exact Nintendo flight-phase paint.
- Full CPU/GPU, GPU render, 65-weapon gameplay, network and zone-score equivalence remain subject to **exact revised head** CI. Do not merge on earlier runs.

## Acceptance gates

1. Production adapter exact anchors and build identity pass; full root/gameplay source tests pass.
2. A sourced main-impact stamp preserves its raw `WidthHalf` and only reaches cells inside the source width and `DepthScale` transformed contour.
3. One shooter shot emits separately clocked real source splashes; no second artist satellite creates turf.
4. Local and replay receive identical authenticated kind/radius/seed/stretch for actual floor faces; no extra credit after settling.
5. All 65 original main weapons still paint and score in a real composed Actor / PaintSystem battle; original special/ranked/negative-gate cases unchanged.
6. Pixel/atlas geometry must be checked separately in Chromium/WebKit before claiming retail visual correctness.

Changes are pending validation in draft PR #1443. Do not convert this report into a claim of full S3 11.3.0 paint parity.