# #285 source/community width cross-check (2026-10-16)

## Frozen baseline
- Base official main: `07f44b97b83aa888d810a24dc505fbf7c70e737f`
- Source: Drive bundle `Splatoon-public-sources-part-02-of-19.zip` in [Splatoon-Decomp-NTSC-thick-plus-Splatoon3-resources](https://drive.google.com/drive/folders/1iAhs_iWB0jfPkAB3lgUT9le95T-B323b); nested `Splatoon3-resources/splat3/data/parameter/1130/weapon/`; pinned Leanny/splat3 commit `7280ff9cde8bb1c5dcef46c700c326471584d2e6`.
- Runtime target: `patches/splatoon3/runtime/weapons-fidelity.mjs::configureFidelityFlick` plus actual production-projectiles fixture `issue-285-horizontal-spawn-origin.test.mjs`.
- The tested source profile is Ver.11.3.0; do **not** use future 11.4.0 proposals or 2015/2017 game mechanics as primary evidence.

## Raw source and independent public community transcription
The extracted parameter `WideSwingUnitGroupParam.Unit[0].SpawnPositionWidth` is a distance in Splatoon 3 parameter space. Community strategy Wiki expresses “飛沫出現幅” in firing-range lines, **1 line = 5 m**. These sources agree by multiplication rather than interpreting the field as a centre-to-edge offset:

| Weapon | S3 main-unit source width | Community “飛沫出現幅” | Wiki × 5m |
|---|---:|---:|---:|
| Splat Roller | 0.8 | 0.16 lines | 0.8m |
| Carbon Roller | 0.6 | 0.12 lines | 0.6m |
| Dynamo Roller | 0.8 | 0.16 lines | 0.8m |
| Big Swig Roller | 1.9 | 0.38 lines | 1.9m |

Additional researcher cross-check (April 2024): [Macaron's shot velocity/projectile article](https://macarongamemo.com/entry/splatoon3-weapon-bullets), table `ローラー・フデの弾数と拡散角度`, independently lists Splat/Carbon/Dynamo/Big Swig main unit widths as 0.16/0.12/0.16/0.38 lines, with the counts 12/10/10/8. This triangulates across two volunteer presentations, but they may share the same underlying extracted data rather than independent pixel measurements.

The [community parameter glossary](https://wikiwiki.jp/splatoon3mix/検証/パラメータ情報) describes `SpawnPositionWidth` as the minimum occurrence width in range lines (`value*0.2`). This does **not** recover Nintendo's exact per-bullet placement algorithm or establish the jitter's distribution. The full-span interpretation is a testable source-guided calibration, not a Nintendo engine proof.

Wiki pages:
- https://wikiwiki.jp/splatoon3mix/ブキ/スプラローラー
- https://wikiwiki.jp/splatoon3mix/ブキ/カーボンローラー
- https://wikiwiki.jp/splatoon3mix/ブキ/ダイナモローラー
- https://wikiwiki.jp/splatoon3mix/ブキ/ワイドローラー
- https://wikiwiki.jp/splatoon3mix/システム詳細仕様 (conversion and projectile origin)

## Confirmed code-level mismatch / bounded repair
The current fan for N=12 main globs uses `fan=2*i/11-1` and previously did `side=fan*SpawnPositionWidth`. **Before the independent 0.1-m per-axis random cube, the width was 1.6m** from -0.8 to +0.8: twice the source-defined 0.8m total width transcribed in the Wiki.

The changed line sets `side=fan*SpawnPositionWidth/2`; for the 12 main globs the deterministic fan spans -0.4 to +0.4m, total 0.8m. The separate cube jitter (`SpawnPositionRandomCube=0.1`) remains unchanged. The unrelated near unit, vertical flick, launch speed, damage, ink, frame timing, RNG call count/order, and networking remain the same. Thus an observed noisy maximum can legitimately exceed 0.8m; do not equate the *source width* with the full noisy bounding box.

The actual `Projectiles.fireFlick` pre-integration test checks 12 distinct starts, the 13th existing nearest spawn, deterministic seeded repetition, side-space fan ±0.4 and independent cube jitter ±0.1 under yaw 0 and 0.73 radians. The exact Nintendo per-glob distribution/seed, body muzzle transform and semantics of width in a proprietary engine are **not** extracted. The Wiki conversion is a strong cross-check of the field magnitude and designation; it is not a physical retail capture of the full distribution.

**Issue status:** Refs #285. Preserve OPEN until complete acceptance including Nintendo's per-glob RNG/muzzle/geometry, impact-adjacent parity and a finished exact-head CI. This PR corrects one concrete double-width calibration, not every acceptance criterion in #285.

## Additional volunteer research (not included in the runtime fix)
- The community technical Wiki states that Roller damage Inside/Outside uses each projectile's **own start position**, not the player or overall weapon position, and notes 16° for Splat/Carbon horizontal, 12° for many others: https://wikiwiki.jp/splatoon3mix/システム詳細仕様 . Current main `rollerHitAngle(p,point)` already uses `p.start`; do not rewrite the working calculation.
- The same Wiki says the vertical unit globs have differing starts and launch angles, and no shot-speed randomness. Current main has only three distinct vertical source heights for its 1+2+2 globs, so #278 within-group spacing semantics remain unverified and separate from this horizontal fix.
- Triple Splashdown flat-ground activation-to-explosion timings **70F main** and **87F fists** are reproduced in https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ウルトラチャクチ and https://macarongamemo.com/entry/splatoon3-salmonrun-frame . The latter is primarily Salmon Run context, so it corroborates phase chronology but not every PvP damage condition. Current `triple-slam-fists.mjs` schedules 15F after the native landing, which would fire at 85F if that landing occurs at 70F. Yet `WeaponSpPogo.BulletParam.MoveFrame=15` in the raw source; the unexplained two-frame difference must not be "fixed" by silently changing that raw constant. See #912/#966 for separately gated verification.

No claimed Nintendo executable access or retail hardware tests. No Issues are closed by this PR.


## Additional patch: #278 vertical 1+2+2 group births
Community mechanical overview [Splatoon3 system detail](https://wikiwiki.jp/splatoon3mix/システム詳細仕様) says the vertical rollers' initial positions and launch angles differ **per glob**, not only between groups; the globs travel along a far-to-near line. The exact Nintendo interpolation/placement and raw-to-world transform are not published.

Existing main already used `AfterOffsetSpawnSpeed` and `AfterOffsetSpawnRotateXDegree` per projectile, but added `SpawnPositionHeight` indiscriminately to every glob in its group, resulting in only three distinct Y starts for the five bullets. The proposed formula is a **labelled model**: `SpawnPositionOffsetHeight + inGroupOffset*SpawnPositionHeight`. Source group fields at 11.3.0 are:
- group 0: BulletNum default1, height offset +0.5, per-index height absent0, Y +0.5
- group 1: BulletNum2, height offset -0.25, per-index height +0.25, Y -0.25 / 0
- group 2: BulletNum2, height offset -1.25, per-index height +0.25, Y -1.25 / -1.0

The native `p.start/p.prev/p.pos` before integration now distinguish all five starts (previously3) while `p.vel`, yaw, physics, paint, damage, repeat timing and random consumption remain unchanged. This should improve near-muzzle separation but **does not establish Nintendo's unrecovered indexed height semantics** or exact spacing; alternate centering/ordering hypotheses remain until direct captured projectile birth traces can choose among them. Frame-rate and replay acceptance must pass unchanged. Issue #278 stays OPEN for retail parity.

Note: `unit.SpawnPositionHeight` does not appear for the main horizontal group, and that path keeps the source-guided full width correction from #285 without reinterpreting its independent `SpawnPositionRandomCube`.
