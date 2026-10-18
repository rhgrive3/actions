# INKWAVE 11.3.0 Shooter intermediate/nearest paint source audit

## Evidence

- Primary S3 11.3.0 [Splattershot parameters](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponShooterNormal.game__GameParameterTable.json)
- Primary S3 11.3.0 [TripleQuick parameters](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponShooterTripleQuick.game__GameParameterTable.json)
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

The Wiki explains SpawnNum=1.5 using cumulative-floor accounting (1, 2, 1, 2 candidate droplets). Actual births are capped by travel to a collision or expiration. The wiki describes feet and intermediate ink as a fixed linked cycle.

## Observed INKWAVE mismatches and fixes

1. Added catalogue Shooters/Spinners/Dualies double-paid a source nearest splash: once through the projectile release schedule and again via an eager muzzle-ground stamp. Staggered sourced rounds no longer perform that second stamp.
2. Detached catalogue splashes always used the regular WidthHalf even for the nearest event. The first drop on a nearest slot now uses WidthHalfNearest. Second and subsequent drops retain WidthHalf, including in the projected fallback.
3. The 11.3.0 TripleQuick row omits MoveParam.FreeGravity but explicitly identifies spl__BulletSimpleMoveParam. Inkipedia documents 0.016 as this typed schema default. The compact MAIN_WEAPON_CATALOG records strip type-string metadata. The fix therefore identifies the pinned source actor WeaponShooterTripleQuick as the documented SimpleMove type (or reads an explicit retained type), and uses 0.016 only when that row omits FreeGravity. Unidentified missing-field rows receive no inferred physics. This restores a physical falling droplet instead of instant projected paint. Explicit bad values and other types are not given invented physics.
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
