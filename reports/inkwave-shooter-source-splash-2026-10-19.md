# INKWAVE 11.3.0 Shooter intermediate/nearest paint source audit

## Evidence

- Primary S3 11.3.0 [Splattershot parameters](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponShooterNormal.game__GameParameterTable.json)
- Primary S3 11.3.0 [TripleQuick parameters](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponShooterTripleQuick.game__GameParameterTable.json)
- Primary S3 11.3.0 [TripleMiddle parameters](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponShooterTripleMiddle.game__GameParameterTable.json)
- [Splatoon3 攻略＆検証 Wiki: 中間塗り・足元塗り](https://wikiwiki.jp/splatoon3mix/システム詳細仕様)
- [Splatoon3 Wiki: パラメータ情報・メイン](https://wikiwiki.jp/splatoon3mix/検証/パラメータ情報/メイン)
- [Inkipedia S3 Shooter schema defaults](https://splatoonwiki.org/wiki/Template:Shooter_data_S3)

These are source parameter tables plus community reverse-engineering descriptions, NOT Nintendo executable code. Lengths use the existing INKWAVE source-unit mapping, not independently verified real-world metres.

## WeaponShooterNormal, Ver.11.3.0

| Field | Value | Interpretation |
| --- | --- | --- |
| SplashSpawnParam.SpawnNum | 1.5 | fractional droplet budget across fired rounds |
| SplashSpawnParam.SplitNum | 8 | nearest/intermediate eight-shot cycle |
| SplashSpawnParam.ForceSpawnNearestAddNumArray | [4] | nearest slots 4 and 8 |
| SplashSpawnParam.SpawnNearestLength | 1.2 | first near release distance |
| SplashSpawnParam.SpawnBetweenLength | 9.2 | distance between successive detached drops |
| SplashPaintParam.WidthHalf | 1.472 | intermediate drop half-width |
| SplashPaintParam.WidthHalfNearest | 2.0608 | first nearest/feet drop half-width |
| SplashPaintParam.DepthMaxDropHeight / DepthMinDropHeight | 3 / 10 | falling drop paint-depth envelope |
| MoveParam.FreeGravity | 0.016 | SimpleMove free-fall gravity |

## Typed omissions in two burst Shooters

| Source actor | SpawnNum | SplitNum | Forced near shots | SplashPaintParam widths | FreeGravity in 11.3.0 JSON |
| --- | ---: | ---: | --- | --- | --- |
| WeaponShooterTripleQuick | 1.5 | 12 | 3, 6, 9, 12 | 1.7825 / 2.4955 near | omitted, typed SimpleMove |
| WeaponShooterTripleMiddle | 3 | 5 | 3, 5 | 1.633 / 2.2862 near | omitted, typed SimpleMove |

Both primary JSON records explicitly have the type spl__BulletSimpleMoveParam. The INKWAVE catalogue packs numbers and strips type labels, so the typed default is restored via a strict two-actor allowlist, not by assuming that every missing gravity field means 0.016. This enables source-guided detached falling splashes for all 13 added Shooter rows.

The Wiki explains SpawnNum=1.5 using cumulative-floor accounting (1, 2, 1, 2 candidate droplets). Actual births are capped by travel to a collision or expiration. The wiki describes feet and intermediate ink as a fixed linked cycle.

## Maneuver and Spinner family cross-check

The source-backed controls are NOT exclusive to Shooters. Splatoon3 Wiki documents a shared intermediate/feet paint concept across Shooters, Blasters, Spinners, Maneuvers and Wipers. The current revision checked all five *additional* Spinner and all five *additional* Maneuver 11.3.0 numerical rows, in addition to the seven original base-owner weapons.

| Source actor | SpawnNum | SplitNum | BetweenLength | Forced extra nearest shots | Middle/feet WidthHalf |
| --- | ---: | ---: | ---: | --- | --- |
| SpinnerQuick | 1.6 | 6 | 10 | 3 | 1.449 / 1.7388 |
| SpinnerHyper | 1 | 8 | 23.5 | none | 1.288 / 1.5456 |
| SpinnerDownpour | 1 | 6 | 11 | none | 1.472 / 1.7664 |
| SpinnerSerein | 1.5 | 8 | 12 | 4 | 1.449 / 2.10105 |
| SpinnerHyperShort | 0.6 | 10 | 24 | 5 | 1.594 / 1.913 |
| ManeuverShort | 1 | 5 | 11 | none | 1.5525 / 2.1735 |
| ManeuverGallon | 2 | 5 | 7 | none | 1.518 / 2.1252 |
| ManeuverDual | 2 | 8 | 9 | none | 1.38 / 1.932 |
| ManeuverStepper | 1.2 | 7 | 13.5 | none | 1.541 / 2.1574 |
| ManeuverLong | 2 | 8 | 10 | 4 | 1.38 / 1.932 |

All 5 Maneuver MoveParam rows explicitly specify FreeGravity=0.016; all 5 Spinner MoveParam rows are source-typed spl__BulletSpinnerMoveParam and omit FreeGravity. **Do not** claim that Shooter SimpleMove defaults prove Spinner gravity. The current Spinner projected-footprint fallback is therefore still an approximation, not a byte-identical retail falling-drop simulation. It has been tightened so every release threshold is consumed at its exact travelled coordinate, stopping before terrain collision and lifetime/range, even with multiple releases in one reference frame. It also uses WidthHalfNearest on the single source-defined nearest first drop rather than stamping an additional muzzle-floor paint.

A preexisting main-weapon numerical test previously demanded two immediate muzzle-floor stamps from Jr. at shot births 3/7; this contradicted the single-source falling queue contract and caused numerical-main to fail (42/43). The regression now checks accepted shot slots, no premature turf, and independent falling drops with sourced feet width. The screenshot/engine phase ordering remains unresolved.

See patches/splatoon3/tests/catalog-spinner-dualies-splash-1130.test.mjs for all 10 pinned rows and real projectile ownership checks.

## Observed INKWAVE mismatches and fixes

1. Added catalogue Shooters/Spinners/Dualies double-paid a source nearest splash: once through the projectile release schedule and again via an eager muzzle-ground stamp. Staggered sourced rounds no longer perform that second stamp.
2. Detached catalogue splashes always used the regular WidthHalf even for the nearest event. The first drop on a nearest slot now uses WidthHalfNearest. Second and subsequent drops retain WidthHalf, including in the projected fallback.
3. Both 11.3.0 burst Shooter rows, TripleQuick and TripleMiddle, omit MoveParam.FreeGravity while identifying spl__BulletSimpleMoveParam in the primary JSON. Inkipedia documents 0.016 as this type's default. The compact catalogue strips type strings, so only these two verified source actors (or a retained explicit type) may inherit the missing-field default. Other unknown omissions remain unsupported, preventing unsourced physics from changing their paint. Explicit bad values and other types are not given invented physics.
4. A drop exactly at the main shot collision boundary could be released and painted in addition to the main impact. Catalogue rounds now stop releases before that boundary as native InkFlightRuntime already did.

No source damage, firing rate, ammo, player physics, weapon models, or unrelated classes are retuned.

## Regression evidence and acceptance

- Source counts and radius/slot invariants: patches/splatoon3/tests/catalog-shooter-source-splash-1130.test.mjs
- TripleQuick typed-default physics, budget and real falling paint: patches/splatoon3/tests/catalog-fractional-policy.test.mjs
- Contact/life/range splash ownership: patches/splatoon3/tests/catalog-splash-contact-distance.test.mjs
- Other existing physical 30/60/120/144Hz, ghost, wall and authoritative turf tests remain mandatory.

Exact-head CI, browser rendering, WebKit, physical iPad and retail/Switch screenshot comparisons must be reported separately rather than inferred.

## Limits of the evidence

Nintendo's proprietary splash ordering/permutation, hidden phase reset and free-fall integrator, exact pixel mask, and game-scale conversion have not been extracted. INKWAVE's existing uniform phase interpolation from SplitNum is an approximation. These edits fix directly source-identifiable divergences but do not establish perfect parity with the commercial game.
