# INKWAVE main-weapon catalog — 2026-10-10

## Scope and reference

Public target: `inkwave-public/`, composed through `patches/splatoon3/adapter.mjs`. The upstream archive and lock stay immutable. Adds **58 distinct main-weapon parameter actors** to the seven existing implementations, for **65 selectable main entries**. Scope variants have separate range records. Alternate kits, replicas, Salmon Run and story actors sharing an existing main are not duplicate entries. Sub/special loadouts remain the existing INKWAVE bomb/slam kit; this is main-weapon expansion, not retail kit expansion. New held meshes, icons and scope camera use existing family placeholders.

Numerical extraction: Splatoon 3 **11.3.0**, `Leanny/splat3` commit `7280ff9cde8bb1c5dcef46c700c326471584d2e6`, `data/parameter/1130/weapon`, `data/mush/1130/WeaponInfoMain.json`, and Japanese/English language tables. Each curated record retains the actor, row pointer, original parameter path and SHA-256. `scripts/generate-inkwave-weapon-catalog.py` reproducibly emits the numerical subset using lossless key interning; complete archives, assets and executable game code are not included. Nintendo does not publish these frame-level formulas; an extraction is a parameter source, not proof that this interpreter reproduces Nintendo's engine.

Sources: [pinned extraction](https://github.com/Leanny/splat3/tree/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon), [Nintendo weapons](https://www.nintendo.com/jp/switch/av5ja/weapon/index.html), [community frame tables](https://wikiwiki.jp/splatoon3mix/検証/メインウェポン), [community startup tables](https://wikiwiki.jp/splatoon3mix/検証/メインウェポン/前隙・後隙), [Brella table](https://wikiwiki.jp/splatoon3mix/ブキ/パラシェルター). The community frame table labels v10.0.x; Brella HP 500 uses the v11.0 correction. Those measurements are explicitly separate from 11.3.0 extracted fields.

## Numerical and action owners

Baseline: 60 Hz simulation, neutral gear, standing unless an airborne/charged/turret mode is requested. Damage converts source HP / 10, ink fractions × 100, frame intervals / 60, and source velocity × 60 through INKWAVE's existing source-unit bridge. Saber charging uses the separate DU conversion. Source-unit/world, movement-controller semantics and paint-area equivalence still require calibration. `WeaponInfoMain.Range` is matchmaking/UI metadata; it is not used to override extracted charger travel distance. Retained numbers that are not interpreted are reference data, not implemented behavior.

| Family | Total / added | Source-guided behavior |
| --- | ---: | --- |
| Shooter | 14 / 13 | Per-shot ink, cadence, burst commitment, ground/air accuracy, Squeezer held mode, source bullet speed/braking/falloff/paint |
| Blaster | 7 / 6 | Startup, direct hit, delayed explosion and distance damage, airborne S-BLAST mode data |
| Roller | 5 / 4 | Ground/air flick units, delays, ink, roll speed/contact and paint widths |
| Brush | 3 / 3 | Repeated flick units and first windup, source roll data; community repeat-frame fallback |
| Charger | 8 / 7 | Minimum/full charge, speed/distance/damage, keep-charge rules, scoped numerical range, five-shot Pencil reserve |
| Slosher | 6 / 5 | Multiple source unit groups, projectile offsets/delays, damage grouping, Bloblobber bounces, Explosher splash |
| Splatling | 6 / 5 | First/second charge stages, charged shot count, Hydra full-charge damage, recharge, Ballpoint second mode, Examiner full-charge cadence |
| Dualies | 6 / 5 | Per-weapon roll distance/time/ink/count, turret projectile/cadence mode and movement locks |
| Brella | 4 / 4 | Pellet groups and aggregate cap, open/purge lifecycle, canopy HP/cost/contact, owner-local shielding |
| Stringer | 3 / 3 | Charge stages, 3/5 arrows, ground/air spread orientation, delayed explosive arrows |
| Splatana | 3 / 3 | Weak/charged projectile, independent slash timing/damage, forward lunge, source collision lobes |

`runtime/main-weapon-catalog.mjs` owns added weapons. The existing seven keep their mature runtime owners and only gain reference names. Registration gives each addition a stable `s3-…` ID, distinct behavior family and temporary `modelKind`. Menu selection, character model fallback, localized names, HUD, reticles and bot/player family dispatch go through the build-only catalog adapter. Fire, sub/special cancellation, ink recovery, death/reset and native projectile pooling retain existing owners where possible.

Added projectiles use an internal 60 Hz accumulator and swept world/player/defense contacts. Native recorder packets include validated catalog mode metadata; remote ghosts restore descriptors for flight presentation but never gain paint/damage authority. Normal network paint admission raises its bound only from parameter paint radii of a sender's owned catalog weapons, preserving the existing sender/team/lifecycle checks. Unknown-peer compatibility, remote canopy trajectory/state replication and retail networking are not certified.

## Reproduction and observed impact

Select any new named main in the weapon picker; hold/release fire, jump for alternate spread/flick, use movement + jump while firing for dualie roll, or forward charged release for saber lunge. Shoot a wall/actor/floor, then attempt sub/special/swim/death interruption. Main effects now use per-weapon source records instead of a copied generic weapon definition. Neutral-gear source checks include committed L3 triple bursts, Quick Charger minimum tap completion, five prepaid Pencil shots, Stamper melee versus projectile timing, Dualie Squelcher source roll distance/cost, Undercover canopy damage, and native packet restoration. Gear modifies owned main ink/run factors where the existing gear system supports them; per-weapon retail gear tables are not introduced here.

## Known differences and unconfirmed details

These are remaining differences, not dismissed by successful logic tests:

- Omitted sparse-table bullet defaults, generic lifetimes and gravity/brake defaults inherit the existing source-guided INKWAVE model. Several controller formulas are interpretations rather than Nintendo-published algorithms.
- Paint rasterization/ellipse placement, precise splash chronology, wall drips, floor projection and source-world scale are unverified. Splash spawning uses accumulated travel; native surface geometry differs from retail stages.
- Sloshing Machine spiral/spray particle colliders and exact Slosher shape chronology are not implemented. Bloblobber restitution uses elastic reflection where extraction omits it. Roller contact uses a 24-frame admission interval and brush hold/push is the existing simplified control model.
- Ballpoint mode changes at 30 frames; its 10-frame interpolation and exact remaining-gauge recharge behavior are not implemented. Nautilus recharge uses the catalog's charge/stream lifecycle, not a calibrated retail gauge transfer. S-BLAST uses separate extracted airborne speed/burst records; the exact jump-mode selection window still needs hardware verification.
- Scope zoom is deferred. Pencil stored rounds/charge cancellation and all minimum-charge/keep transitions need Switch traces, despite targeted logic checks.
- Saber charge movement conversion, collision chronology, forward-step timing and vertical hitbox alignment need hardware calibration.
- Brella pellet angle kernel/collider geometry, all source-specific incoming damage multipliers, canopy collision with terrain and remote launched-canopy replication remain incomplete. Incoming online held-canopy protection uses a front-facing attacker-arrival-position approximation; it cannot establish projectile interception parity. Undercover splat/assist canopy repair and retail canopy healing chronology are not modeled.
- Bot aiming and UI stats for newly introduced families use existing family approximations. Temporary models do not encode retail barrel/muzzle offsets. Added mains use the current project sub/special kit.

The request for perfect retail numerical behavior cannot be substantiated without those algorithms and hardware comparisons. This change establishes complete main-actor coverage, reproducible source records and playable per-family action owners while preserving these explicit limits.

## Validation layers

- Source verification: optional raw-reference test recursively compares every retained value and both names against the pinned files, including SHA-256. Locally performed with `INKWAVE_MAIN_WEAPON_REFERENCE` set.
- Native fixture verification: all 58 new entries emit finite projectile/ink data through composed production Actor/WeaponRunner/Projectiles; targeted timing/resource/collision/packet tests; 30/60/120 Hz fixed projectile traces; catalog UI adapter and owned network radius tests.
- Regression/build: existing production composition suite, immutable archive quick check, all build packaging/cache-size/manifest gates. Full final-head CI is the acceptance record; earlier failure logs from in-progress edits are not passing evidence.
- Browser: `scripts/check-inkwave-catalog-browser.mjs` runs against emitted build modules in Chromium and WebKit, testing 65 entries/58 emissions and native recorder/ghost restoration. Physics/model dependencies are fixture stubs: this proves browser module/action execution, not rendered retail gameplay. Existing browser/game/network/mobile gates remain in force. Local browser download was unavailable; actual browser results must come from CI.
- Switch comparison: **not performed**. No measured gameplay parity or perfect numerical-equivalence claim.

## Added main names (temporary reference names)

| Family | Added names |
| --- | --- |
| shooter | ボールドマーカー、わかばシューター、シャープマーカー、プロモデラーMG、.52ガロン、N-ZAP85、プライムシューター、.96ガロン、ジェットスイーパー、スペースシューター、L3リールガン、H3リールガン、ボトルガイザー |
| blaster | ノヴァブラスター、ロングブラスター、クラッシュブラスター、ラピッドブラスター、Rブラスターエリート、S-BLAST92 |
| roller | カーボンローラー、ダイナモローラー、ヴァリアブルローラー、ワイドローラー |
| brush | パブロ、ホクサイ、フィンセント |
| charger | スクイックリンα、スプラスコープ、リッター4K、4Kスコープ、14式竹筒銃・甲、ソイチューバー、R-PEN/5H |
| slosher | ヒッセン、スクリュースロッシャー、オーバーフロッシャー、エクスプロッシャー、モップリン |
| splatling | スプラスピナー、ハイドラント、クーゲルシュライバー、ノーチラス47、イグザミナー |
| dualies | スパッタリー、ケルビン525、デュアルスイーパー、クアッドホッパーブラック、ガエンFF |
| brella | パラシェルター、キャンピングシェルター、スパイガジェット、24式張替傘・甲 |
| stringer | トライストリンガー、LACT-450、フルイドV |
| splatana | ジムワイパー、ドライブワイパー、デンタルワイパーミント |
