# Splatoon 3 sub weapon parity — 11 October 2026

## Scope and evidence

This pass covers the ten custom subs registered by `patches/splatoon3/runtime/all-subs.mjs`: Burst Bomb, Autobomb, Fizzy Bomb, Torpedo, Ink Mine, Toxic Mist, Angle Shooter, Splash Wall, Sprinkler, and Squid Beakon. Point Sensor and the native Splat, Suction, and Curling Bomb paths are owned elsewhere.

The pinned source is Splatoon 3 11.3.0 from Leanny/splatoon3-resources commit `7280ff9cde8bb1c5dcef46c700c326471584d2e6`. Byte-identical copies of the ten full tables live in `patches/splatoon3/tests/fixtures/source-1130/weapon/`, so CI needs no sibling checkout or external source-reference path. `patches/splatoon3/tests/fixtures/catalogue-sub-source-1130.json` stores the matching source file hashes. The all-subs test reads each local raw table and checks its SHA-256 against that receipt before comparing runtime values, so omitted fixture fields cannot silently pass as `undefined`.

Community measurements below are from the [Splatoon 3 mix Wiki sub weapon pages](https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン) and parameter notes. Those are useful retail observations, not official Nintendo specifications. No in-game retail comparison was performed in this pass; source fields, Wiki measurements, and runtime mappings remain separate evidence types.

## Changes and parity status

| Sub | Source-backed behavior now represented | Remaining comparison gaps |
|---|---|---|
| Burst Bomb | 45% cost, 60F recovery stop, tiered throw speed, discrete 35/25 damage bands at raw 2.8/4.0 distances, and source paint radii. Its own `SubInkSaveLv=4` curve is used. Wiki-measured contact applies 25, then the ordinary blast lands one frame later. | The raw Quick Bomb table has no separate direct-damage field; the 25-point contact and one-frame timing are Wiki-measured. Fuse, trajectory/world scale, and paint projection are calibrated. Exact band boundary/overlap behavior still needs retail measurement. |
| Autobomb | 55% cost, 85F recovery stop, 180/30 bands, 150F chase, raw 10F target-find gate, 30F pre-rotation wait, 180F no-target warning, 60F chase/approach/lost-target waits, raw 57.6 world-unit/s² flight gravity, and per-frame position air resistance. | Target choice/radius, steering origin, visual rotate resistance, panel boosts, wall rebound, and world mapping remain unverified or calibrated. The Wiki approach distance and raw `.65` source field are not established as the same unit/measurement. |
| Fizzy Bomb | 60% cost, 85F recovery stop, sequential 40F/80F charge stages, three sourced blast bands and waits, sourced flight-drop spacing/radii/width-depth arrays, hop values, and raw 100 object-collision damage routed into the object path. Raw `GroundGravity` and `FlyRotateAirResist` are retained in the spec. | Community-tested charge acceleration is calibrated. The `GroundGravity` state mapping, low-stage hop mapping, terrain bounce, and timing remain calibrated. Flight paint uses sourced centers/radii but the renderer only accepts circular stamps, so the source elongated footprint and vertical projection are not reproduced exactly. |
| Torpedo | 65% cost, 88F recovery stop, distinct throw/chase blast records, 12-point secondary splash, 30F burst timing, and the extracted 20F chase-start delay. Chasing and throw blasts use their corresponding damage-rate causes for object hits. | The source describes the 20F delay relative to rotation end; runtime gates from projectile age. Target selection, homing trajectory, movement/world conversion, and secondary-splash admission remain calibrated. Its 20 HP shot-down threshold comes from public gameplay references, not the weapon table. |
| Ink Mine | 60% cost, sensor and marking tiers, 300/450/600F marks, two-mine capacity, 45/35 blast bands, paint radius, and `DistanceDamageDistanceRate` SPU values. Trap Resistance scales marks; mark events include owner and target life. | Sensor/ink trigger geometry and arm time are calibrated. Raw 3.6/8.0 blast distances and 8/9.5/11 marking distances retain unresolved game-world units. The source damage matrix has no Ink Mine target column, so whether mines can be shot directly stays unknown. |
| Toxic Mist | Corrected lifetime from 6s to 5s, with Wiki-measured 1.05 trial-line radius converted to 5.25 runtime units using the Wiki system page's 5m-per-line mapping, 80F recovery stop, source 60/30/15F progression/counts, 40% maximum drain, and resistance-adjusted movement, jump, and drain. The jump factor reaches the real movement integrator. A boundary test covers 5.2/5.3 units at 30/60/120 Hz. | The Wiki labels the approximately 50% slow as needing verification and does not give a jump percentage; the runtime effect values remain explicit calibrations. Raw `DistanceForOff=5.4` remains exposed separately. |
| Angle Shooter | 40% cost, 50F recovery, 40 direct damage, 300/450/600F mark tiers, 7F flight, 90F zero-damage tail, collision radius, and throw speed. Line Marker Resistance scales mark duration; local and replayed mark events carry owner and target life. | Rebound angles, actor/world collision ordering, and paint geometry still need in-game comparison. |
| Splash Wall | 60% cost, 85F recovery, throw/gravity and HP tiers, 400F lifetime, linear HP decay from initial HP over 400 frames, 30 damage per 30F contact, and raw `FlyPositionAirResist`. The Wiki-measured 35% maximum Ink Saver curve applies to HP, not lifetime. | Width, height, placement, obstruction, and wall-contact geometry are calibrated. Bomb-wall detonation interactions need broader retail comparison. |
| Sprinkler | 60% cost, 60F recovery, source first/second period tiers, hit/spout/paint values, and one-placement behavior. Public references supply 120 HP and indefinite natural lifetime. | Droplet pattern, impact geometry, and world mapping are calibrated; emitted coverage does not yet match the source’s full pattern. Retirement on owner death is implemented but not established by the parameter table. |
| Squid Beakon | 75% cost, zero recovery delay, sourced throw speed, and public-reference placement/use limits (three devices; one or two jumps by weapon). | 120 HP and indefinite lifetime are public-reference values, not extracted weapon fields. Jump reservation, placement geometry, respawn persistence, and owner-death behavior need retail comparison. |

The shared Ink Saver curves are now selected per sub using each weapon's `SubWeaponSetting.SubInkSaveLv` and pinned `misc/params.json` `ConsumeRt_Sub_Lv0..4` curves: Burst uses Lv4 `[1,.855555,.711111]`; Autobomb, Fizzy, Torpedo and Mist use Lv1 `[1,.85,.7]`; Mine, Sprinkler and Beakon use Lv3 `[1,.8,.6]`; Angle Shooter uses Lv0 `[1,.9,.8]`; Wall uses the Wiki-measured `[1,.825,.65]` curve. Tests cover all ten mappings.

Direct hits and blast-radius hits on supported sub devices use the pinned `spl__DamageRateInfoConfig` matrix via `sub-resistance.mjs`, including separate Fizzy, Torpedo main/splash, Mine, and native bomb causes. The sub-only radius API is `Projectiles.s3DamageSubObjects(attack, center, radius, damageAtDistance, cause, options)`; callbacks receive `(distance, object)`, and `{pierceLOS:true}` is available for through-wall beams. Native `_explodeBomb` also routes bomb blast damage through this path. Test coverage includes Fizzy and native Splat Bomb against Splash Wall, plus a custom projectile sweep. Ink Mine is excluded from shootable-object targets because the source matrix has no corresponding target type; that is an explicit unknown, not a verified retail rule.

## Verification

`node --check patches/splatoon3/runtime/all-subs.mjs` and `node --check patches/splatoon3/runtime/all-specials.mjs` passed. `node --experimental-vm-modules --test patches/splatoon3/tests/all-subs.test.mjs` passed all 22 tests. The suite covers Toxic Mist status, jump, and drain at 30/60/120 Hz; radius boundary at 30/60/120 Hz; Splash Wall decay/lifetime at 30/60/120 Hz; Fizzy charge admission at 30/60/120 Hz; Torpedo's 19F/20F chase boundary; Autobomb source flight gravity/resistance at 30/60/120 Hz; and Burst Bomb's direct-to-blast frame sequence. The raw-table test validates fixture hashes before comparing source values. These checks verify runtime paths and rate invariance, not retail equivalence.

This report does not claim complete parity. Source parameters whose engine meaning or world-unit mapping remains unverified are called out above and in the per-sub `calibration` strings in `all-subs.mjs`; unresolved retail behavior should remain open until an in-game measurement confirms it.

### Wiki references

- [Burst Bomb](https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/クイックボム)
- [Autobomb](https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/ロボットボム)
- [Fizzy Bomb](https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/タンサンボム)
- [Torpedo](https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/トーピード)
- [Ink Mine](https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/トラップ)
- [Toxic Mist](https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/ポイズンミスト)
- [Angle Shooter](https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/ラインマーカー)
- [Splash Wall](https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/スプラッシュシールド)
- [Sprinkler](https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/スプリンクラー)
- [Squid Beakon](https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/ジャンプビーコン)
- [Sub Ink Saver and parameter notes](https://wikiwiki.jp/splatoon3mix/検証/パラメータ情報/サブ)
- [Splatoon 3 system details: 50 DU = 5 m = 1 trial line](https://wikiwiki.jp/splatoon3mix/システム詳細仕様)
