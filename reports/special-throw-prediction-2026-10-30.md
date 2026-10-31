# スペシャル投擲・着弾予測 個別監査（19種）

参照: Splatoon 3 11.3.0 PvP。対象INKWAVE SHA: `5d4c27df4d4acb49676c08ca72cfa4486a3c64c2`。調査日: 2026-10-30。

予測と実弾は同じ発射位置・初速・積分・接触規則を利用する。これはINKWAVE内の予測一致の検証であり、本家実機との完全一致を主張するものではない。表の「非確定」は未実装との混同を避けるために明示した動作で、未来の敵移動・手動停止・身体着地を保証リングとして表示しない。

## 実装と判定

| 種類 / ID | API outcome | 確定できる条件 | 非確定・本家未確認事項 |
|---|---|---|---|
| ウルトラショット / `trizooka` | impact-explosion / airburst | 3本すべてが静的地形または寿命で終端 | 敵身体・防御装置に当たる見込みは条件付き。弾道の遅延4F/軌道角速度は既存較正 |
| グレートバリア / `bubbler` | not-applicable | 投擲軌道/爆破中心の対象外 | 設置可能領域は既存設置UIが所有 |
| ショクワンダー / `zipcaster` | hook-contact / hook-miss | 35以内の実地形接触。床面は距離3以上 | 本体到達時刻/移動中の対人接触はhook終点から確定しない |
| マルチミサイル / `tentaMissiles` | target-dependent | ロックした現在位置のみ | 追尾中の敵移動/散開の未来着弾は非確定 |
| アメフラシ / `storm` | delegated to sub predictor | s3PredictSubTrajectoryの実接触/雲生成規則に従う | 水没/射程外で雲中心を確定しない |
| ジェットパック / `inkjet` | impact-explosion / airburst | 静的地形/寿命での実弾爆心 | 対人/防御装置は条件付き。速度21/飛距離30の距離以外は既存較正 |
| ウルトラチャクチ / `slam` | action-dependent | 2拳は既存fist centersと地面+0.12/LOS条件。固定支持があれば各拳complete | 本体はActor._resolve着地依存。拳の87F総時間と高さ変化/壁越えは較正 |
| ナイスダマ / `booyahBomb` | impact-explosion / airburst | 接触点または寿命位置。地形接触はnative queue 1F+40Fで成長開始、空中寿命は40F | 対人/防御装置は条件付き。未抽出の初速Y/実機抵抗解釈は未確認 |
| ウルトラハンコ / `ultraStamp` | impact-explosion / airburst | 投げ姿勢からの静的地形/寿命終点 | 振り攻撃は投擲対象外。敵/防御装置は条件付き |
| キューインキ / `inkVac` | impact-explosion / airburst | 実chargeの初速/サイズ、接触または50F寿命位置 | Source SpawnBlastWaitFrameのretail意味と移動慣性の適用は未確認。既存native寿命解釈を維持 |
| メガホンレーザー5.1ch / `killerWail` | not-applicable | 対象外 | 追尾線は既存ロック/VFX表示が所有 |
| カニタンク / `crabTank` | impact-explosion / impact / airburst | cannonとshooterの別初速/段階/成長衝突半径 | ball中と発射終了フェーズは非表示。敵/防御装置は条件付き。大砲初速18は既存較正 |
| サメライド / `reefslider` | action-dependent | 現在フェーズを返す | 手動停止・段差解決・38F移動付きpreburstが爆心を変えるため保証リングを出さない |
| トリプルトルネード / `tripleInkstrike` | deployment | 床/壁/天井/grateへの初接触+法線0.08。竜巻は接触後82F | 水没/時間上限は非確定。省略gravity/drag defaultsは未抽出 |
| エナジースタンド / `tacticooler` | deployment | 壁/天井では既存slide、支持床に置けた位置 | 水没/5s失効/将来の足場移動は非確定。retail反射/設置footprint詳細は未確認 |
| デコイチラシ / `superChump` | landing-pattern | 有効な既存activation seedと支持床で12点、108F飛行+210F待機 | inactiveでseed未確定/空中/支持無しは非確定。正確な散開分布は較正 |
| テイオウイカ / `krakenRoyale` | not-applicable | 対象外 | 本体突進/ジャンプは既存移動/攻撃が所有 |
| スミナガシート / `splattercolorScreen` | deployment | 静的地形への接触/法線0.08 | 敵Vacで吸収/水没/上限時は非確定。省略gravity/drag defaultsは未抽出 |
| ホップソナー / `waveBreaker` | deployment | 壁/天井接触からslideし上向き支持面で設置 | 敵Vacで吸収/水没/上限は非確定。波は設置後90/240/390F |

## 個別根拠・実処理の共有・検証

### ウルトラショット (`trizooka`)

- 一次抽出資料: [WeaponSpUltraShot](https://github.com/Leanny/splat3/blob/main/data/parameter/1130/weapon/WeaponSpUltraShot.game__GameParameterTable.json)。Git blob SHA: `7963d9d7049b623f8a0c1f23296774427e3e64d7`。
- 共通実処理: `trizookaLaunchGeometry / trizookaApplyProjectile / advanceFidelityProjectile / kitTrizookaWorldSweep`。
- 検証: 6弾系×FixedClock 30/60/120 render Hz、3本の各実着弾と比較。
- 数値根拠: 同名JSONの `sourceParameters` に該当GameParameterセクションを無変更で収録。

### グレートバリア (`bubbler`)

- 一次抽出資料: [WeaponSpGreatBarrier](https://github.com/Leanny/splat3/blob/main/data/parameter/1130/weapon/WeaponSpGreatBarrier.game__GameParameterTable.json)。Git blob SHA: `17c238c1cef8687ff484ec2bb180fc9039912268`。
- 共通実処理: `existing Big Bubbler placement owner`。
- 検証: 19種分類・RNG/状態不変。
- 数値根拠: 同名JSONの `sourceParameters` に該当GameParameterセクションを無変更で収録。

### ショクワンダー (`zipcaster`)

- 一次抽出資料: [WeaponSpSuperHook](https://github.com/Leanny/splat3/blob/main/data/parameter/1130/weapon/WeaponSpSuperHook.game__GameParameterTable.json)。Git blob SHA: `953eef0bc88b9bf4ad8f73b4fa1d4de1ca5d07e6`。
- 共通実処理: `zipcasterHookPlan shared with activeStep`。
- 検証: 19種分類・miss、既存all-specials hook回帰。
- 数値根拠: 同名JSONの `sourceParameters` に該当GameParameterセクションを無変更で収録。

### マルチミサイル (`tentaMissiles`)

- 一次抽出資料: [WeaponSpMultiMissile](https://github.com/Leanny/splat3/blob/main/data/parameter/1130/weapon/WeaponSpMultiMissile.game__GameParameterTable.json)。Git blob SHA: `734b7e449431aab5adadd501b878e8389aa9bb5c`。
- 共通実処理: `selectTargets / existing target owner`。
- 検証: 19種分類、既存multistoreyミサイル12ケース内。
- 数値根拠: 同名JSONの `sourceParameters` に該当GameParameterセクションを無変更で収録。

### アメフラシ (`storm`)

- 一次抽出資料: [WeaponSpInkStorm](https://github.com/Leanny/splat3/blob/main/data/parameter/1130/weapon/WeaponSpInkStorm.game__GameParameterTable.json)。Git blob SHA: `b6e86041ad2a559c6f967055c69ee2aff9769f9e`。
- 共通実処理: `s3PredictSubTrajectory(id:storm)`。
- 検証: 19種分類・hold gating。sub担当の実地形parity参照。
- 数値根拠: 同名JSONの `sourceParameters` に該当GameParameterセクションを無変更で収録。

### ジェットパック (`inkjet`)

- 一次抽出資料: [WeaponSpJetpack](https://github.com/Leanny/splat3/blob/main/data/parameter/1130/weapon/WeaponSpJetpack.game__GameParameterTable.json)。Git blob SHA: `7af9c818a43fd5a414a2a6a9f7d2cec39f86be4a`。
- 共通実処理: `specialLaunchGeometry / inkjetLaunchOrigin / configureSpecialProjectile / advanceFidelityProjectile`。
- 検証: 6弾系×FixedClock 30/60/120 render Hz。
- 数値根拠: 同名JSONの `sourceParameters` に該当GameParameterセクションを無変更で収録。

### ウルトラチャクチ (`slam`)

- 一次抽出資料: [WeaponSpPogo](https://github.com/Leanny/splat3/blob/main/data/parameter/1130/weapon/WeaponSpPogo.game__GameParameterTable.json)。Git blob SHA: `f8e210da97f8f1bf4fca07dba015b74a5439d5ef`。
- 共通実処理: `tripleSlamFistCenters / existing active fist record`。
- 検証: 19種分類、root UIは未確定本体を隠し確定拳のみ表示。
- 数値根拠: 同名JSONの `sourceParameters` に該当GameParameterセクションを無変更で収録。

### ナイスダマ (`booyahBomb`)

- 一次抽出資料: [WeaponSpNiceBall](https://github.com/Leanny/splat3/blob/main/data/parameter/1130/weapon/WeaponSpNiceBall.game__GameParameterTable.json)。Git blob SHA: `154c211ff8e6e1c42fbe26d6e6c732c6a0b22289`。
- 共通実処理: `specialLaunchGeometry / configureSpecialProjectile / stepSpecialProjectileForces / native blast center`。
- 検証: FixedClock 30/60/120 render Hz、実OBB壁、壁爆心と床塗り分離、空中寿命爆心。
- 数値根拠: 同名JSONの `sourceParameters` に該当GameParameterセクションを無変更で収録。

### ウルトラハンコ (`ultraStamp`)

- 一次抽出資料: [WeaponSpUltraStamp](https://github.com/Leanny/splat3/blob/main/data/parameter/1130/weapon/WeaponSpUltraStamp.game__GameParameterTable.json)。Git blob SHA: `570b74d13f57a4218878b5a98756e5e6fe924871`。
- 共通実処理: `specialLaunchGeometry / configureSpecialProjectile / stepSpecialProjectileForces`。
- 検証: FixedClock 30/60/120 render Hz、実OBB天井、aimThrow/commit gating。
- 数値根拠: 同名JSONの `sourceParameters` に該当GameParameterセクションを無変更で収録。

### キューインキ (`inkVac`)

- 一次抽出資料: [WeaponSpBlower](https://github.com/Leanny/splat3/blob/main/data/parameter/1130/weapon/WeaponSpBlower.game__GameParameterTable.json)。Git blob SHA: `302a975d3593c957ac934c2dcfd69b90849677f1`。
- 共通実処理: `inkVacExhaleKinematics / advanceFidelityProjectile`。
- 検証: FixedClock 30/60/120 render Hz、敵Vac予測時のscratch/charge不変。
- 数値根拠: 同名JSONの `sourceParameters` に該当GameParameterセクションを無変更で収録。

### メガホンレーザー5.1ch (`killerWail`)

- 一次抽出資料: [WeaponSpMicroLaser](https://github.com/Leanny/splat3/blob/main/data/parameter/1130/weapon/WeaponSpMicroLaser.game__GameParameterTable.json)。Git blob SHA: `5b0efbe9281eeb00fb0c9cf2eaf0d2beff02ce7a`。
- 共通実処理: `existing laser owner`。
- 検証: 19種分類・RNG/状態不変。
- 数値根拠: 同名JSONの `sourceParameters` に該当GameParameterセクションを無変更で収録。

### カニタンク (`crabTank`)

- 一次抽出資料: [WeaponSpChariot](https://github.com/Leanny/splat3/blob/main/data/parameter/1130/weapon/WeaponSpChariot.game__GameParameterTable.json)。Git blob SHA: `806e78fb51ae2db60479385b4316c689cce55345`。
- 共通実処理: `crabTankShotGeometry / safe muzzle sweep / configureCrabProjectile / stepSpecialProjectileForces`。
- 検証: FixedClock 30/60/120 render Hz、大砲実着弾、ball gating。
- 数値根拠: 同名JSONの `sourceParameters` に該当GameParameterセクションを無変更で収録。

### サメライド (`reefslider`)

- 一次抽出資料: [WeaponSpSkewer](https://github.com/Leanny/splat3/blob/main/data/parameter/1130/weapon/WeaponSpSkewer.game__GameParameterTable.json)。Git blob SHA: `cbdace64fc9e8f07ae439bc5fb8f0c797e6e855e`。
- 共通実処理: `existing reefslider actor owner kept unchanged`。
- 検証: 19種分類、既存 all-specials の突進・AP回帰を含む分割全85件が通過。本体突進処理は未変更。
- 数値根拠: 同名JSONの `sourceParameters` に該当GameParameterセクションを無変更で収録。

### トリプルトルネード (`tripleInkstrike`)

- 一次抽出資料: [WeaponSpTripleTornado](https://github.com/Leanny/splat3/blob/main/data/parameter/1130/weapon/WeaponSpTripleTornado.game__GameParameterTable.json)。Git blob SHA: `35864bc6f8e8b4f5e42eb3159a4a4533d61aefd2`。
- 共通実処理: `specialDeviceFlight / specialDeviceLaunchOrigin / stepSpecialDeviceFlight / settleSpecialDeviceContact`。
- 検証: FixedClock 30/60/120 render Hz、実OBB天井、既存deviceの壁/天井/grate。
- 数値根拠: 同名JSONの `sourceParameters` に該当GameParameterセクションを無変更で収録。

### エナジースタンド (`tacticooler`)

- 一次抽出資料: [WeaponSpEnergyStand](https://github.com/Leanny/splat3/blob/main/data/parameter/1130/weapon/WeaponSpEnergyStand.game__GameParameterTable.json)。Git blob SHA: `a23921145ecc0289295cce44deb522092a52689a`。
- 共通実処理: `createCoolerFlight / stepCoolerFlight shared by kit-support`。
- 検証: FixedClock 30/60/120 render Hz、実OBB壁→下階床、既存multistorey 30/60/120 Hz。
- 数値根拠: 同名JSONの `sourceParameters` に該当GameParameterセクションを無変更で収録。

### デコイチラシ (`superChump`)

- 一次抽出資料: [WeaponSpFirework](https://github.com/Leanny/splat3/blob/main/data/parameter/1130/weapon/WeaponSpFirework.game__GameParameterTable.json)。Git blob SHA: `424b5078fc685950877da908025fd586ab2de1d6`。
- 共通実処理: `chumpLandingPlan with private state cache`。
- 検証: 12点をlive decoy targetsと逐点比較・seed不変。
- 数値根拠: 同名JSONの `sourceParameters` に該当GameParameterセクションを無変更で収録。

### テイオウイカ (`krakenRoyale`)

- 一次抽出資料: [WeaponSpCastle](https://github.com/Leanny/splat3/blob/main/data/parameter/1130/weapon/WeaponSpCastle.game__GameParameterTable.json)。Git blob SHA: `e09d54f944b8a5fdac431e0baa209cb0e4746e5d`。
- 共通実処理: `existing Kraken owner`。
- 検証: 19種分類、既存 kraken-dash-occlusion 全32件と all-specials のcharge/release回帰が通過。本体突進/ジャンプ処理は未変更。
- 数値根拠: 同名JSONの `sourceParameters` に該当GameParameterセクションを無変更で収録。

### スミナガシート (`splattercolorScreen`)

- 一次抽出資料: [WeaponSpChimney](https://github.com/Leanny/splat3/blob/main/data/parameter/1130/weapon/WeaponSpChimney.game__GameParameterTable.json)。Git blob SHA: `76f0c48d22d2ebc780e11ab98493745129f44165`。
- 共通実処理: `specialDeviceFlight / specialDeviceLaunchOrigin / stepSpecialDeviceFlight / settleSpecialDeviceContact`。
- 検証: FixedClock 30/60/120 render Hz、既存device吸収/接触回帰。
- 数値根拠: 同名JSONの `sourceParameters` に該当GameParameterセクションを無変更で収録。

### ホップソナー (`waveBreaker`)

- 一次抽出資料: [WeaponSpShockSonar](https://github.com/Leanny/splat3/blob/main/data/parameter/1130/weapon/WeaponSpShockSonar.game__GameParameterTable.json)。Git blob SHA: `70c8752b94a8ae323c598b1438d349bcccde868d`。
- 共通実処理: `specialDeviceFlight / specialDeviceLaunchOrigin / stepSpecialDeviceFlight / settleSpecialDeviceContact`。
- 検証: FixedClock 30/60/120 render Hz、壁/天井slide/下床、既存device16。
- 数値根拠: 同名JSONの `sourceParameters` に該当GameParameterセクションを無変更で収録。

## 検証条件と結果

- `special-trajectory.test.mjs`: **最終ソース版18/18件が通過**（正の名前パターンで8+10へ分割、768 MiB上限、各ケース名を確認）。19種分類、実投擲/着弾6種、設置4種、FixedClock 30/60/120 render Hz、12デコイ地点、実Level/Physics 4ケース、ナイスダマ壁と空中爆心、予測のRNG無消費・状態不変。
- `special-device-flight.test.mjs`: 16 passed。壁・天井・grate、設置遅延、水没、レプリカ/ゲージ/吸収など既存経路。
- `special-projectile.test.mjs`: 3 passed。実弾descriptorとdamage、pool、wire/ghost。
- `special-multistorey-support.test.mjs`: 12 passed。実Level/Physicsで上階を拾わないhover/cooler/missile。
- `all-specials.test.mjs` と import 先 `kraken-dash-occlusion.test.mjs`: **全85件が通過**（本体53件 + Kraken32件）。正規テストとruntimeは変更せず、正の完全一致名パターンで5件ずつ17プロセスへ分割し、768 MiB上限で逐次実行した。全組で exit 0、pass 5 / fail 0 / skipped 0、登録名と実行名の完全一致を確認した。一括実行時のexit 137と512 MiBでのheap OOMは履歴として残す。**一括失敗、分割全件成功**という結果であり、一括実行の成功とはしていない。

新規予測テストの30/60/120 Hzはrender間隔で、実FixedClockが60 Hzのゲームtickを実行する。既存回帰は各正規テストの更新手順を変更せず実行した。Trizooka/InkVacに別のcarry ownerは追加していない。raw Projectiles APIへ直接粗いdtを渡した場合の差は本番スケジューリング条件外として残す。

## 本家根拠の限界

GameParameter JSONは差分overrideであり、省略値を0や他武器の値として確定していない。数値以外の積分順・移動慣性クランプ・全衝突mask・軌道角速度・単位換算には既存の較正が残る。今回の成果は各武器の個別経路に予測を合わせ、誤った確定表示と爆心の下階への移動を除去したこと。Nintendo Switch実機計測・ブラウザ操作の確認は別途結果を区別する。

公式変更履歴: [Nintendo of America](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/kw/Splatoon%203)、[Nintendo UK](https://www.nintendo.com/en-gb/Support/Nintendo-Switch/Game-Updates/How-to-Update-Splatoon-3-2266003.html)。11.3.0のウルトラショット速度/ウルトラチャクチ範囲・拳移動の変更を確認し、原典11.3.0テーブルと照合した。

## 最終UI契約

`Projectiles.prototype.s3CanPredictSpecialTrajectory(actor)` はactual stateを軽量に判定し、各描画frameでthrow commit、markerQueued、Crab ball等に即応する。重い飛翔再計算の間隔を待たずにガイドを消せる。

Super Chumpは `presentationOwner: special-vfx` を返し、既存の中心target discと12個のreticleを単一描画ownerとして使う。既存 `superChumpLandingPreview` もsetup commit直後からnullとなる。

時刻は現在のrelease/launch snapshotから数える。未実行の入力や投擲windupは加算しない。地形/coolerの通常blastには既存native queueの1 fixed tickを加え、Booyahの成長開始にはさらに40Fを加える。非ゼロ半径/最初のdamageはその後のsource tickとなる。

Booyahのendpointは投射物接触とeffect anchorを表す。damageRadiusが使う既存anchor+0.2Yとraw `DamageOffsetY=-0.2` の座標対応は本家未確認として維持した。根拠なしにこの値の符号やworld scaleを変更していない。

## 保存した検証ログ

`reports/validation-special-throw-2026-10-30.log` は最初の新18ケースと既存16+3+12+7ケース、および一括実行のheap OOMを保存している。最終の全85件のTAP結果は `reports/validation-all-specials-split-2026-10-30.log`、全登録名・元ソースSHA・17組のコマンド・件数照合結果は `reports/validation-all-specials-split-2026-10-30.json` に保存した。

重複を除いた最終成功数は **134ケース**（新規18 + device16 + projectile3 + multistorey12 + all-specials/Kraken85）。先行の選択7件は最終85件に含まれ、二重には数えていない。


## 最終ソース版と検証の対応

Inkjet / Booyah / Stamp の発射originは、元の実装と同様にcloneした値を保持する。共通launch geometry抽出後も再利用される `rt.v0` のscratch参照を持ち越さないための所有関係の復元であり、発射位置の計算や数値チューニングは変えていない。

この最終版の `all-specials.mjs` SHA-256 は `0006c33b3f88b11eb646b89fd2c49c24f89d103c1f20ea908a1f59b7287a3231`。全85件の既存回帰に加え、新規18件も改めて同版で実行した。新規18件は8+10件の逐次プロセス、各768 MiBで全成功し、実行前後のruntimeファイルとテストファイルのSHA不変を確認した。

- [最終source A：8件の名前付き結果](throw-prediction-20261030/evidence/source-special-final-a.txt)
- [最終source B：10件の名前付き結果](throw-prediction-20261030/evidence/source-special-final-b.txt)
- [正確な実行コマンド・ケース名・前後SHA・集計](throw-prediction-20261030/evidence/source-special-final-summary.json)

先行のsource18ログは履歴として残す。最終ソース版に対応する18件の証跡は上記の再実行結果とする。再実行は同じ18件の確認なので、重複を除いた担当範囲の成功数134件は変わらない。
