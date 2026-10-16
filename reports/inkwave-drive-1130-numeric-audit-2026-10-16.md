# Drive 11.3.0 numeric audit: current main (2026-10-16)

## Provenance and scope
Google Drive folder: https://drive.google.com/drive/folders/1iAhs_iWB0jfPkAB3lgUT9le95T-B323b

The source is **Splatoon-public-sources-part-02-of-19.zip**, nested `Splatoon3-resources/splat3/data/parameter/1130/weapon/`, source repository Leanny/splat3 at `7280ff9cde8bb1c5dcef46c700c326471584d2e6`. The `SOURCE_INFO.txt` in part 01 confirms this bundle contains **no retail Splatoon 3 RomFS, executable or disassembly**.

Current official INKWAVE main at the start of audit: `07f44b97b83aa888d810a24dc505fbf7c70e737f`. The extracted data is not equivalent to knowledge of the private field-composition or simulation algorithm.

## Exact raw-to-profile leaf comparison
We compared every source `GameParameters` property, array element and leaf to the cloned tree in `profile.json/weaponsFidelityCompletion/weapons`. These are copies of the **same seven canonical source files**, not proof of gameplay accuracy:

| Family / source | Compared leaves | Mismatches |
|---|---:|---:|
| Roller / WeaponRollerNormal | 362 | 0 |
| Charger / WeaponChargerNormal | 77 | 0 |
| Shooter / WeaponShooterNormal | 68 | 0 |
| Blaster / WeaponBlasterMiddle | 117 | 0 |
| Splatling / WeaponSpinnerStandard | 87 | 0 |
| Slosher / WeaponSlosherStrong | 344 | 0 |
| Dualies / WeaponManeuverNormal | 90 | 0 |
| **Total** | **1145** | **0** |

## Issues and source-gap classification
- **#285**, Roller horizontal: `BulletNum=12, SpawnPositionWidth=0.8, SpawnPositionRandomCube=0.1` are source values. Current per-projectile fan+cube draws are tested. Raw parameter names do **not** establish half-width/full-width, random law/order, coordinate transform or native units, so the issue cannot be closed solely on these copied values.
- **#278**, Roller vertical: 1+2+2 multiplicities, offset-height groups +0.5/-0.25/-1.25 and `SpawnPositionHeight=0.25` on both two-shot groups. Current INKWAVE sums the fields to make +0.5/0/-1.0 group heights. Raw tables do **not** explain whether `SpawnPositionHeight` is a spread within each group. Scale/additive law remains an INKWAVE assumption.
- **#966**, Tidal Slam timing: true retail `WeaponSpPogo` 11.3.0 records `Rise_Frame=60`, `Rise_NoDamageStartFrame=50`; fist `MoveFrame=15, MoveDistance=6.54`. The ground impact around 70F is consistent with roughly ten descent frames but **70F is not a raw field**. Do not equate the local 0.5s `hang` with source `Rise_Frame`. Current timing and rendering require independent phase, ground, paint and VFX verification.
- **#912**, damage values from `BlastParamNormal.DistanceDamage`: raw 2200/600, radii 6.4/9.6. Dividing damage by ten yields current 220/60. These four exact endpoints are linked in profile bindings by this PR. Neither the falloff interpolation, wall/travel mechanics, nor renderer is proven.
- **#1165** is INKWAVE CPU/GLSL roller-body SDF parity, not a missing Nintendo numeric field. Composed source now shares wobble and removes old CPU inset; remaining real GPU blending/ownership/score acceptance is not resolved by the raw weapon parameter.
- **#642** mobile GPU memory and **#956** shoe-specific muzzle mechanics are not reducible to a main-weapon parameter copy. Charger `MuzzleLocalPos.Y=0.2105` is not a per-shoe height formula.

## Historical cross-check: Pogo vs legacy SuperLanding
`WeaponSpPogo` at 6.0.0: rise70F, no-damage70F, distance6, far radius12. At 7.2.0: rise60F, no-damage60F, far radius10.5. At 11.3.0: rise60F, no-damage50F, fist6.54, damage radii6.4/9.6. Raw SHA256 `9edc75af8698166c89191cfa07c22aa3fda5ce4ea4d0ffaac600bd18be41e910`.

**Do not substitute** `WeaponSpSuperLanding` (raw SHA256 `c72d1e280bf25cb5e9588d9f48821af7988c530513a044650db1b61153fd4891`) with its separate 1800/700/550 damage series and 7/10/14 distances. `WeaponSpPogo.BlastParamNormal.PaintRadius=9.0` persists through 11.3.0 raw snapshots even though secondary sources report a 9.3.0 inking-radius increase; no unverified reversal of the runtime footprint is made.

**Disposition:** No Issue closure or gameplay tuning justified by this source-only audit. This PR updates source bindings and reproducibility checks without changing game damage/paint/motion or treating a verified number as a verified algorithm.
