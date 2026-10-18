# 16系統・派生ブキの原典監査（2026-10-18）

基準: 作業開始時の `main` = `9ef63350385bffee71b3afa0a09290a92e9c862b`。この文書のコード所見は統合前の基準に対する監査で、修正後の合否は各担当の検証結果と総合結果を参照する。公開対象は `inkwave-public/` に production アダプターを適用した版。

## 原典とバージョン

- [任天堂公式 Ver.11.3.0](https://support.nintendo.com/jp/switch/software_support/av5ja/1130.html) を当日取得。日本配信日は2026-08-20。対象系統で明記されるメイン変更は、ケルビン525/デコのスライド後ブレ約10%軽減、トライストリンガー全キット/オーダーレプリカの落下飛沫縮小。トライストリンガーコラボのSP190→200もある。その他の対象ブキを11.3.0で変更したとは記されていない。
- 指定の [Leanny/splat3 `7280ff9c`](https://github.com/Leanny/splat3/tree/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon) から通常対戦用16ファイルを独立に再取得。16/16でカタログのSHA-256と一致。生成器 `scripts/generate-inkwave-weapon-catalog.py` の `GROUPS`/`curate` を実際に適用し、16/16で保持数値グループが完全一致した。Coop表やSplatoon2値への置換はしていない。
- 上記一致は保持された数値の来歴だけを保証する。生成器は描画、ガイド、プレイヤー、ノックバック、壁落下などの一部グループを意図的に除外する。実行時の利用、未保持データ、クラス既定値、乱数則や実機一致を保証しない。
- 11.2.0の同一コミット内ファイルも再取得して変更を確認。ケルビン `WeaponParam.LapOver_DegSwerve`: **3.0→2.7°**。トライ `spl__BulletStringerParam.SplashPaintParam.WidthHalf`: **1.48→1.39**。最新版カタログは既に2.7/1.39を保持しており、ここを古い値から直したとは報告しない。
- [Sendouパラメータ履歴の公開ソース](https://github.com/sendou-ink/sendou.ink/blob/e14d91c6dcbbdae8b7c651b98e1a70d46df55df1/app/features/params/data/all-version-weapon-params.json) も11.3.0、生成日2026-08-21で上記値と一致。ただし元のLeanny表由来であり、独立した実機測定ではない。

検証可能な完全SHA、原典URL、保持グループ/数値葉数、全41キットの原典照合結果は [source-audit-checks.json](source-audit-checks.json) に保持。過去の `reports/added-family-paint-20261017/source-verification.json` が保持した10ファイルとも一致した。

## 全16種と派生25キット

通常対戦用の実装範囲は **16ベース+25派生=41プレイ可能ID**。`registerAlternateWeaponKits` はベースの `catalogRecord`、メイン処理、移動設定を共有し、派生の名前・サブ・スペシャル・必要ポイントだけを設定する。全41行のサブ/スペシャル/SPを、再取得した `WeaponInfoMain.json` と独立照合して一致した。派生ごとの実機挙動の一致を意味しない。

| ベース（INKWAVE ID） | 原典アクター | 派生名（実装ID末尾） |
| --- | --- | --- |
| スパッタリー (`s3-maneuver-short`) | `WeaponManeuverShort` | スパッタリー・ヒュー (`s3-maneuver-short-01`)、スパッタリーOWL (`s3-maneuver-short-02`) |
| スプラマニューバー (`dualies`) | `WeaponManeuverNormal` | スプラマニューバーコラボ (`dualies-01`)、スプラマニューバー耀 (`dualies-02`) |
| ケルビン525 (`s3-maneuver-gallon`) | `WeaponManeuverGallon` | ケルビン525デコ (`s3-maneuver-gallon-01`) |
| デュアルスイーパー (`s3-maneuver-dual`) | `WeaponManeuverDual` | デュアルスイーパーカスタム (`s3-maneuver-dual-01`)、デュアルスイーパー蹄 (`s3-maneuver-dual-02`) |
| クアッドホッパーブラック (`s3-maneuver-stepper`) | `WeaponManeuverStepper` | クアッドホッパーホワイト (`s3-maneuver-stepper-01`) |
| ガエンFF (`s3-maneuver-long`) | `WeaponManeuverLong` | ガエンFFカスタム (`s3-maneuver-long-01`) |
| パラシェルター (`s3-shelter-normal`) | `WeaponShelterNormal` | パラシェルターソレーラ (`s3-shelter-normal-01`) |
| キャンピングシェルター (`s3-shelter-wide`) | `WeaponShelterWide` | キャンピングシェルターソレーラ (`s3-shelter-wide-01`)、キャンピングシェルターCREM (`s3-shelter-wide-02`) |
| スパイガジェット (`s3-shelter-compact`) | `WeaponShelterCompact` | スパイガジェットソレーラ (`s3-shelter-compact-01`)、スパイガジェット繚 (`s3-shelter-compact-02`) |
| 24式張替傘・甲 (`s3-shelter-focus`) | `WeaponShelterFocus` | 24式張替傘・乙 (`s3-shelter-focus-01`) |
| トライストリンガー (`s3-stringer-normal`) | `WeaponStringerNormal` | トライストリンガーコラボ (`s3-stringer-normal-01`)、トライストリンガー燈 (`s3-stringer-normal-02`) |
| LACT-450 (`s3-stringer-short`) | `WeaponStringerShort` | LACT-450デコ (`s3-stringer-short-01`)、LACT-450MILK (`s3-stringer-short-02`) |
| フルイドV (`s3-stringer-explosion`) | `WeaponStringerExplosion` | フルイドVカスタム (`s3-stringer-explosion-01`) |
| ジムワイパー (`s3-saber-normal`) | `WeaponSaberNormal` | ジムワイパー・ヒュー (`s3-saber-normal-01`)、ジムワイパー封 (`s3-saber-normal-02`) |
| ドライブワイパー (`s3-saber-lite`) | `WeaponSaberLite` | ドライブワイパーデコ (`s3-saber-lite-01`)、ドライブワイパーRUST (`s3-saber-lite-02`) |
| デンタルワイパーミント (`s3-saber-heavy`) | `WeaponSaberHeavy` | デンタルワイパースミ (`s3-saber-heavy-01`) |

別途、原典にはオーダーマニューバー `Maneuver_Normal_O` (5015)、オーダーシェルター `Shelter_Normal_O` (6005)、オーダーストリンガー `Stringer_Normal_O` (7015)、オーダーワイパー `Saber_Normal_O` (8005) がある。現在の派生登録器はレプリカを明示的に除外しているため、これら4つは未登録・未検証である。**45種検証済みとは数えない**。

## 実行経路と7領域の監査境界

`main-weapon-catalog.mjs` の `registerMainWeaponCatalog` は既存7種（うちスプラマニューバー）をネイティブ所有のまま残す。追加15種は `R.update` のfamily分岐を通る。41キットすべてが同じ処理経路を持つことと、41種すべてが全状態で正確なことは別条件。

| 系統 | 射撃 | 弾道 | 攻撃 | 塗り | 状態 | モーション/表示/SE | 通信 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| スプラマニューバー | native `fireDualies`/`weapons-fidelity` | native `InkFlightRuntime` | native head/sweep | native impact/drop + source bridge | native dodge + `movement-physics`/`dualies-motion` | 専用C1 motion、モデル、合成SE | `dualies-network`/replication |
| 他5マニューバー | `dualies`→`auto`→`emitRound` | catalog descriptor→`P._step` | catalog collision/damage/object selectors | catalog splash/slide/wall-drop | catalog roll/turret/stop | native render view→`dualies-motion`/model、合成SE | catalog shot descriptor、remote ghost、dodge event |
| シェルター4種 | `brella`→`emitPellets` | catalog pellet/volley | shield sweep/canopy durability | volley collector、canopy trail/foot | held/open/launch/naked/repair | `brellas`/`brella-aperture`/detached canopy、合成SE | projectile ghost + victim-owner guard |
| ストリンガー3種 | `charged`→`emitArrow` | per-charge arrow descriptor | direct/stick/detonate | arrow splash/impact/blast | charge/keep/bowTilt | `stringers` family pose/string animation、合成SE | catalog metadata + ghost replay |
| ワイパー3種 | `charged`→`emitRound` + reserved melee | per-mode wave descriptor | `saberMelee`/wave/burst | foot/splash/terminal | windup/melee/lunge/stop | `splatanas` family pose、合成SE | wave metadata、melee owner hit events |

各ベースの主な未確認点を以下に明記する。全16種で、ギアを固定したSwitchの同期収録、VFX画像差分、SE波形一致、Nintendoの遅延補償/ロールバック一致は未立証。

| ブキ | 射撃・弾道・攻撃 | 塗り | 状態/移動 | 表示・通信 |
| --- | --- | --- | --- | --- |
| スプラマニューバー | 専用処理を保護。24回帰の一部で実行経路確認 | #992の現状は後述。7パターン/高さ法未確定 | #532旧2.8WUは現状と不一致。実測曲線未確定 | native専用motionあり。実機一致未確認 |
| スパッタリー | 8F/3.0 core、5% rollは明示 | roll半幅1.8、paint length4明示 | slip0.6/30F明示、速度則未確定 | variantを含むpose/遅延実測不足 |
| ケルビン525 | 11.3.0 post spread2.7°確認、通常/post damage別 | roll半幅2.0 | core距離/時間/SlipFrameの省略既定値未確定 | sourceActor共有、SE固有係数は創作 |
| デュアルスイーパー | normal/post別設定と専用移動可否を要検証 | length4.5、半幅1.8明示 | core3.5/12F、slip45F明示、slip距離省略 | 移動可能turretの操作感・通信未実測 |
| クアッドホッパー | F01:中射撃と後射撃の分離が必要 | half1.8、4連の端点保持回帰あり | 4回/3%/3.5 core明示、MoveFrame省略 | リモートphase/乱数一致未証明 |
| ガエンFF | 通常/postの射程・威力・連射を別々に確認 | half2.0 | 1回/10%/5.5/16F、slip1.2/50F明示 | 長射程通常/短射程postの表示・音響は近似 |
| パラシェルター | F05–07、散弾生成則/盾形状を要改善 | collector回帰、足元タイミング省略 | 傘gravity/ground/air係数は明示、接地法未知 | 手続きモデル、SLINKなし |
| キャンピングシェルター | F05–07、volley上限/対物倍率が重要 | collector回帰、足元タイミング省略 | 傘の坂/段差/接地法未知 | 手続きモデル、remote盾遅延未実測 |
| スパイガジェット | 開傘連射とkill/assist修復の既存テストあり | explicit foot mask回帰 | 破損/再開傘/キャンセルの全遷移未実測 | 同上。派生CstmのsourceActorも照合要 |
| 24式張替傘 | 散弾/パージ/壊れ後再展開を独立に要確認 | explicit foot mask回帰 | short naked/relaunchの固有数値と経路 | detached paper、遠LOD回帰あり |
| トライストリンガー | F04、3矢/中・全charge分離 | 最新WidthHalf1.39、wall detonation回帰 | F08:tilt45F/2の意味未確定 | 弓poseと軸同期必要、SE合成 |
| LACT-450 | 非爆発・3矢、10.5→5→0.5°既存回帰 | airborne splashの時刻/所有権回帰 | partial keep、mid/fullのfreezeを要確認 | EnableOldTiltControl=falseの規則未復元 |
| フルイドV | 5矢、mid/full矢角反転、爆発を独立に要確認 | explosion overlap/paint mask実機未比較 | reverse tilt-9と中charge固有性能 | 壁近傍spawn check、弓機構は近似 |
| ドライブワイパー | F02/03:shape/4F、vertical cylinder半径省略 | foot/terminalの既存回帰 | F09:履歴/踏み込み/硬直再構築 | 水平L/R pose未反映を追加発見 |
| ジムワイパー | slash3F/bullet6F独立既存回帰、F02/03 | foot/terminalの既存回帰 | F09:step履歴/減衰の接続不足 | 水平L/R pose未反映、full判定視覚依存 |
| デンタルワイパー | F02/03、大きいslash形状を独立に要確認 | foot/terminalの既存回帰 | F09:長いstep/groundKd固有 | chargeが水平なのに共通縦chop poseを追加発見 |

## F01–F10の再照合と追加差異

| 項目 | 基準mainでの確認 | 明示原典/不確定部分 |
| --- | --- | --- |
| F01 | `tryDodge`開始でturret設定、`auto`がturretキーを選び、中射撃にもpost条件が届く | Tetra7.4°/6F vs2.7°/5Fは明示。遷移の厳密なフレーム基準は別確認 |
| F02 | `saberMelee`は横矩形/高さの近似、左右offsetと明示shapeを使わない | Box/Cylinderは明示。HasCylinderShapeのunion/置換、有限cylinder/capsule意味は表のみでは未確定 |
| F03 | 予約callbackの単発走査で寿命なし | 3種横/縦すべてAliveFrame4明示。inclusive端点/位置追従法は解釈が必要 |
| F04 | detonate塗りはoffset、damage中心は元のpos | DamageOffsetY0.6明示。LOS発射点/壁面補正の厳密則未確定 |
| F05 | canopyはdir×speedの移動、壁でspeed0 | gravity/air/ground係数明示。地形追従・滑り則未知 |
| F06 | 固定az円周配置/固定group速度でpellet作成 | group layout/InitVelRandom/offsetは明示。乱数PDF/相関未知 |
| F07 | remote applyHit経路はattacker前方dot>0のみ | Nintendoの遅延補償は未復元。実弾道/盾形状証拠が必要 |
| F08 | grounded boolでforward/reverseのみ、keep/reset未接続 | keep45/reset2明示。45Fをいつ起算するか不明 |
| F09 | `lunge`は固定speed、履歴/MoveStepKd等未接続 | 5Fhistoryと各Kd明示。正確な入力集約法未知 |
| F10 | 追加5種はMoveDist/MoveFrameの等速、slip省略 | explicit slip値は下記。省略class defaultを原典値としない |

追加発見は担当へ通知済み: (A) `weapon-models/splatanas.mjs` が `m.side=-m.side` を更新しても姿勢計算で使わず、水平斬りの見た目が左右交互にならない。(B) 同ファイルが全ワイパーfullを縦chopにし、水平振りのデンタルを区別しない。既存 `audio/s3-articulation.mjs` 自体にもデンタルは通常/chargeとも水平と記録されている。(C) 上述の4レプリカは登録対象外。これらを修正済みと断定するには統合後の別検証が必要。

## 省略値・解釈の調査結果

Leannyの1130ツリーを全取得して調べ、`misc/SplPlayer.game__GameParameterTable.json` も確認したが、今回必要なクラス既定値は得られなかった。Sendouの公開履歴/抽出器/説明も同じ疎な表を持ち、BowTilt・SideStep・Saberの該当意味は未記入。Drive検索で該当するCommon/SideStepの独立ファイルは発見できなかった。Inkipediaの通常ページと公開API、wikiwikiのパラメータ/ストリンガー属ページはHTTP403で取得できず、当日実読した証拠としては扱わない。

- 未確定: ケルビンMoveDist/MoveFrame、クアッドMoveFrame、Squelcher slip距離、標準の一部SlipFrame/距離、BowTilt起算と復帰条件、Wiper縦斬りCylinderRadius、HasCylinderShape合成則。別ブキの明示値を無条件にNintendo既定値としてコピーしてはいけない。
- 3種Saber横斬りはStamper/Dentalで `HasCylinderShape=false` 明示。trueの縦斬りはStamper radius1.4、Dental1.8。Wiper縦は中心A(-.25,0,.7)/B(.25,0,.7)とtrueのみ明示、radiusは省略。水平に残るcylinder数値だけで、falseの形状を有効にしてはいけない。
- Keep/reset速度2などの数値があることはactivation semanticsの証明にならない。合理的に再構築する場合も、source bindingと挙動推定を分けて記録する。

## アニメーション・VFX・音響の原典境界

- `inkwave-public/assets/source-motion/catalog.json.gz` を実読: `games=["Splatoon (Wii U)"]`。保持されたlossless係数は初代のもので、新4系統のSplatoon3実機クリップの証拠ではない。4系統は手続きモデル/ポーズ補正を使用し、公式静止画/動画に基づく近似である。
- `weapon-models/brellas.mjs` は保持/放出傘・aperture、`stringers.mjs` は弦/nockと弓roll、`splatanas.mjs` はswing/charge poseを担当。形状、手位置、反動、mechanism、LODの実行テストはretail姿勢一致を保証しない。
- `audio/weapon-recipes.mjs` の `AUDIO_PROVENANCE`: original-parametric、retailComparison=unverified-no-isolated-reference。`reference-profiles.mjs` は主にS1系コミュニティSWEPの特徴量。`s3-articulation.mjs` はゲーム構造に基づく創作音響、SLINK/BARS/BWAV/本家波形ではない。全16種のSE一致は未達。
- Driveの [Splatoon内部資料フォルダ](https://drive.google.com/drive/folders/1iAhs_iWB0jfPkAB3lgUT9le95T-B323b) は当日一覧取得でき、19分割ZIPと既存資料を確認した。独立したS3アニメーションファイルは検索で特定できていない。[S3 SFX/Musicフォルダ](https://drive.google.com/drive/folders/1D7So33YcZJaU_W5eC_H8OMFnUxGA8lYJ) も存在・アクセス可能だが、Ver11.3.0の各イベントの対応と再配布条件を確認しておらず、波形を取得/組込みしたとは報告しない。

## #992・#532の現在地と実行検証

GitHubを当日read-onlyで再取得し、両IssueともOPENであることを確認。古い本文を現状の実装事実として転記しない。

- [#992](https://github.com/rhgrive3/actions/issues/992): 現native経路は `fireDualies→_fireRound→InkFlightRuntime.configure/stepHead/impact→paint`。`reports/inkwave-dualies-paint-evidence-992-2026-10-09.md` が既に過去のgeneric-owner誤認を訂正。`issue-992-native-flight-paint.test.mjs` はgeneric `_impact` を通らない実射を検証する。1.71/1.66の幅、距離/角度bridge、max1drop、CPU所有権は既存経路に接続済み。7パターン順列・粒子力学・break/free高さ則は再構築のままなので完全クローズは不適切。
- [#532](https://github.com/rhgrive3/actions/issues/532): 現profileは5.0WU予算。既存 `dualies-roll-phases-1130` は12F core4.0WU+4F glide1.0WUを別位相で保持。古い2.8WUは現mainの欠陥ではない。5.0DUのコミュニティ計測と1WU bridgeは区別し、速度曲線・空中下降・地形でSwitch一致と断定しない。

当監査で再実行したテストは **24件合格、0失敗**。production構成のVM/実Physics/CPU paintを含むが、GPUブラウザやSwitch実測ではない。

1. `issue-719-532-dualies-dodge.test.mjs`、`dualies-roll-phases-1130.test.mjs`、`issue-992-dualies-impact-paint.test.mjs`: 15/15。
2. `issue-992-native-flight-paint.test.mjs`、`issue-532-dualies-dodge-distance.test.mjs`: 9/9。

コマンドは `node --experimental-vm-modules --test <上記ファイル群>`。30/60/120Hzの固定60Hz実射、ネイティブhead/drop/CPU塗り、方向4つとcore/glide分離、ghost/独立壁落下の回帰を確認した。全41種のproduction browser、通信、性能、統合後mainについては総合検証結果を参照する。
