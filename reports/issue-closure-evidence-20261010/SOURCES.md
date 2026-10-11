# Splatoon 3 Ver.11.3.0 — Issue閉鎖に使う原典資料

更新：2026-10-10 JST。資料の存在と、実コードでの消費と、本家との最終一致は別。原典の数字をそのままINKWAVEのWUや描画ピクセルと等しいと扱わない。

## 情報源と信頼度

1. **任天堂公式の更新履歴**：[スプラトゥーン3更新データ](https://support.nintendo.com/jp/switch/software_support/av5ja/index.html)。基準Ver.11.3.0は2026-08-20配信。Ver.6.1.0の味方Ink Storm内のHP回復、Ver.10.1.0のStorm範囲拡大など累積更新を含める。
2. **11.3.0抽出パラメータ**：[Leanny/splat3 固定コミット 7280ff9cde8bb1c5dcef46c700c326471584d2e6](https://github.com/Leanny/splat3/tree/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130)。このGitツリー内の生値だけを原典値と呼ぶ。疎なJSONに省略された**型既定値や実行関数はこのJSONからは導けない**。
3. **本プロジェクトの実測**：各PRの正確なHEADのbuildとテスト、CPU PaintSystem、WebGL2 GPUマスク、ネットワーク実パケットと再生。Nintendo実機測定と区別する。
4. **公開検証の解釈**：[Inkipedia](https://splatoonwiki.org/wiki/Splatoon_3)、[スプラ3 攻略＆検証Wiki](https://wikiwiki.jp/splatoon3mix/)、[システム詳細仕様](https://wikiwiki.jp/splatoon3mix/システム詳細仕様)。出典と検証バージョンを明記し、未知の確率分布・フレーム積分を確定扱いしない。
5. **Driveの元資料**：[Splatoon-Decomp-NTSC-thick-plus-Splatoon3-resources](https://drive.google.com/drive/folders/1iAhs_iWB0jfPkAB3lgUT9le95T-B323b) 内に公開ソース19分割ZIPが保存済み。[part-02](https://drive.google.com/file/d/17DwQhUw8MPASjNQ3TQn3k_EIB6igrfxW/view)にS3抽出表を収録。[武器調査ハンドオフ](https://drive.google.com/drive/folders/11GiE0wpN28INV4SI2PJ4ipgcgtqRIiGp)にはソース差分・測定・検証ログが存在。**初代decompは3の処理と同一と見なせない**。

## 固定JSONのGit blob SHA（原典の識別）

| 対象 | 固定ソース | 確認したGit blob SHA-1 |
|---|---|---|
| スプラシューター | [WeaponShooterNormal](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponShooterNormal.game__GameParameterTable.json) | bd43a9a6af6a86e8b1d3c1416eadf94724da3079 |
| マニューバー | [WeaponManeuverNormal](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponManeuverNormal.game__GameParameterTable.json) | 63cae8c18faf4757ebaa81c5eaff22995087448a |
| チャージャー | [WeaponChargerNormal](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponChargerNormal.game__GameParameterTable.json) | 176e465690d25219a8df12ae594d3d8d536abef2 |
| バレルスピナー | [WeaponSpinnerStandard](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpinnerStandard.game__GameParameterTable.json) | 76e62caaa2c3bee8f502b1794c8cf91cf5cbc972 |
| スプラローラー | [WeaponRollerNormal](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponRollerNormal.game__GameParameterTable.json) | b424343715cf39cc9262af05a99a9c4d322cca7f |
| ホットブラスター | [WeaponBlasterMiddle](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponBlasterMiddle.game__GameParameterTable.json) | d3a7a48d601a12e17a050cd934cd4e8c2fe34ee7 |
| バケットスロッシャー | [WeaponSlosherStrong](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSlosherStrong.game__GameParameterTable.json) | a7cbb627bd2b7aac9a19aa315eae513479e0390b |
| 共通プレイヤー | [SplPlayer](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/misc/SplPlayer.game__GameParameterTable.json) | 83fdedf7bccc19c65609c3b1fd2a94cf7c9c59d0 |

## 原典値と閉鎖対象Issueとの対応

| 原典対象 | 固定表に存在する数値 | 関連Issue／閉鎖の残条件 |
|---|---|---|
| Shooter | SpawnSpeed **2.266**、SplashSpawnの最初 **1.2**、後続間隔 **9.2**、SpawnNum **1.5**、消費 **0.0092** | #129の「最大2滴」について、1.5をイベント数へ変換するNintendo側の意味は数表だけでは不明。 |
| Dualies | 直進 **3F**、ブレーキ遷移上限 **2.3425**、初速 **2.37**、スライド消費 **0.07**、SplashSpawnNum **1** | #719の空中滑走の上下運動、#891の二次元着弾確率は抽出値だけでは証明できない。 |
| Charger | 最低射程 DistanceMinCharge **9.033**、最低インク消費 **0.0225 = 2.25%**、フル消費 **0.18**、キープ **75F** | #675は2.25%の独立正解を持つ。#956の靴別muzzle座標はこの表に出ていない。 |
| Splatling | ChargeFrame_First **48F**、Second **72F**、MaxShootingFrame_First **80F**、Second **160F**、RepeatFrame **4F**、InkRecoverStop **40F** | #952のチャージ開始専用減速フィールドは MoveSpeed_Charge **0.062**、VelGnd_Bias_Charge **0.9**、VelGnd_DownRt_Charge **0.05**。3値を消費する原典の積分式は非公開。 |
| Roller | WideSwing Unit0 BulletNum **12** → DepletionBulletNum **3**、Unit1は近距離 **1**発。**全体13→4発**で主unitの12→3と矛盾しない | #305の数え間違いを除去。#278/#285の出生座標はunitごとに検証する。 |
| Roller body | KnockBackOpponent AccelMin **420**、AccelMax **800**、RollerPlayer DamageOn **410〜550**、DamageOff **280** | #387の係数自体は確定。ただし独自WU/s変換式・遠隔二重適用は原典表だけでは確定しない。 |
| Hot Blaster | GoStraightToBrakeStateFrame **9F**、SpawnSpeed **0.945**、直進終速上限 **0.9131**、SplashSpawn **0.5 / 1.5 / 7**、ShotColHitRadius **2.5** | #1107の「通常の起爆」SplashDropOn=true、DropPaintRadius=3.2、SplashPaintRadius=2.0は **疎な1130 JSONに明示されない型既定値**。別資料と実装に照合する。 |
| Slosher | 弾群 **0+4+5発**、実弾のAfterOffsetDelayFrame **1/2F**、RandomRotateYBias **0.65**、高所塗りの開始 **1.5**、終了 **12**、幅倍率 **0.7** | #258/#1011/#1140には根拠。#1022のRandomRotateYBias確率変換関数は非公開で推定扱い。 |

## S3 Wiki・公開実測で確認した、抽出表以外の基準

- [Drop Roller / 受け身術](https://splatoonwiki.org/wiki/Drop_Roller)：クツのメイン専用、スーパージャンプ/Inkjet/Zipcasterから方向入力で着地回転、終了後約3秒のRun Speed/Swim Speed/Ink Resistance **+30AP**。これにより#292の能力と報酬は確認可能。ただしRoll距離・速度時系列はこのページで厳密確定できない。
- [任天堂更新履歴](https://support.nintendo.com/jp/switch/software_support/av5ja/index.html)と[アメフラシWiki](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/アメフラシ)：Ver.6.1.0の味方の非潜伏時HP回復改善。アメフラシは発動後にRで装置を投げ、地形接触後に雲を生成。Ver.10.1.0の範囲拡大も現在の比較では外せない。
- [システム詳細仕様](https://wikiwiki.jp/splatoon3mix/システム詳細仕様)：被弾後回復待機 **60F**、通常回復速度 **0.21HP/F = 12.6HP/s**。自インク潜伏/味方Stormでは高速度へ移行。表の丸め表示と1フレーム値がズレる場合、丸め規則の立証なしに閾値テストを勝手に変更しない（#927/#841）。
- [Splatoon 3のギア・ブキ体系](https://github.com/Leanny/splat3/blob/main/database.html)：実装されていないスペシャルや武器種を「同じ名前だから一致」とはしない。

## クローズ判定での使い方

1. Issue原文の受入条件を各行に分解する。
2. 原典 **固定commit/blob** の数値・測定・条件を独立oracleにする。
3. 現行main + 該当PRの**真のゲーム実行経路**のテストから出力、所有者・画面・塗り・通信を必要な範囲で測る。
4. HEAD一致のCI、既存PRとの重複修正、ブラウザ/二クライアント要求、レンダリング出力も照合する。実機測定が原文で求められていないのに勝手に必須化しない一方、明示的な動作の受入条件を単なるソース値の一致に格下げしない。
5. 全項目合格のときのみ当該PRへCloses。未証明がある限りRefsと具体的な必要検証を残す。後者をmergeだけでcompletedにしてはならない。

[全体案内へ戻る](./README.md)
