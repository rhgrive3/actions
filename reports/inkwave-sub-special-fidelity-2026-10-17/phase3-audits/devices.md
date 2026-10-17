> 担当別の調査・再現・局所検証の記録。途中の失敗・後続修正も残している。最終配布物の成功件数・hash・確認範囲は[第3弾の統合記録](../../inkwave-sub-special-fidelity-phase3-2026-10-17.md)を参照。

# 第3弾: 投擲・設置系スペシャル

比較条件: Splatoon 3 PvP 11.3.0、AP0（指定回帰ではAP57）、ギア指定なし。公開版INKWAVEのproductionComposition Actor / WeaponRunner / Projectilesを使用し、地形・描画は試験ごとに制御。本家のSwitch動画・実機比較は未実施。Crab性能、上流inkwave-publicは変更しない。

## 変更した実経路

- Wave Breaker: 16WU先への瞬間配置を廃止。投擲前隙5F（Ink Mine装備時16F）後、実投擲→地形sweep→接地で作動。慣性なし、壁では法線方向速度を落として滑落。ageは投擲基準、landedAtを記録して90/240/390F波を接地基準にした。水・奈落で不発、clearで飛行物を破棄。飛行中はInk Vacに中和されるが、未公開のゲージ相当量を作らず信用0にしている。
- Wave: DamageYMin/Maxは波が届く地形表面の高度範囲に適用し、空中の足元を除外。実Actorのジャンプで回避できる一方、接地した対照は45HPを受ける。壁張付は実climbingを参照。初期検知57Fと、検知時45Fのマーキング付与を分離した。
- Triple Inkstrike: ガイドを照準先まで82Fで補間する疑似飛行を廃止。源別初速・プレイヤー速度継承で飛行し、地形だけに接着（金網を含む）。キャラ/バリアには接着しない。壁・天井から床へ引き下ろさない。接着後82F→51Fの竜巻、37.5HPを5Fごと11回。
- Triple: 汎用LOS付き±2.8高の爆風を専用円柱に置換。上20WU（raw）、下約10WU（Wiki概測）まで、地形を貫通。塗りはダメージ時計内の約30F周期から独立した2F周期へ変更し、塗り半径.5→7（ダメージ半径7.7とは区別）、塗れる床の上下範囲+7.5/-6WUを設けた。
- Screen: 投擲前隙13F後に実飛行→地形接触で展開。水没不発。展開前の装置はInk Vacに吸われる。Chimney DamageValueForDamageTag4000/10=400HPのタグを、sheet contact40HPと区別した。400特例のVac側認証/上限はretained担当の変更。
- Screen: 接触判定はstartupにも存在し、ダメージ60F制限とは別にデバフを接触中更新。初期展開時とRunning中に12点の原典位置から床を塗る。周期45F、12滴を10F内、半径2.5。ghostは塗らず、床なしでは塗らない。
- Chump: 保持中のイカ化を許可。実Actor.groundedで設置を制限し、13F前隙後に12個を発射。前隙中に支持を失った場合も発射しない。各デコイの着地点を個別の床へ投影し、ステージ外の候補は有効な中心へ戻す。previewと実発射で同一の着地計画を使い、乱数をpreviewで消費しない。
- replay: kindはmarker/wave/screenを維持しphase flightを追加。birthでvx/vy/vz/gravity/airResist/phase/age、landでpos/age/landedAt/phaseを送る。ageは投擲から、作動時間はage-landedAt。遅延landは先行予測したghost strikeもwarningへ訂正する。remoteはHP/塗りを著作しない。

## 公開原典とフィールド

ピン留めコミットは7280ff9cde8bb1c5dcef46c700c326471584d2e6。これは解析データの一次ソースであり、Nintendoによる全仕様の公式保証ではない。

- https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpShockSonar.game__GameParameterTable.json
  - GeneratorParam.MoveParam: Z=.3/F、Y=.07/F、WorldMin=-.5/F、FlyGravity=.009/F²、FlyPositionAirResist=.001。
  - SpawnBulletAdditionMovePlayerParam: XRate=YPlusRate=ZRate=0。
  - WaveEmitFrameArray90/240/390、WaveParam Damage450/10、YMin=-5.2/YMax=2.8、MaxFrame160/192/216、MaxRadius20/24/27。
  - MarkingGroundFrameRadiusRatio:4/.19、10/.4、18/.615、以後57Fまで.615。MarkingFrame45。
- https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpTripleTornado.game__GameParameterTable.json
  - MoveParam: Z=2/2.3/2.6、Y=.276、WorldMin=-.4。XRate1.6/YPlusRate4/YMax.16。
  - BlastParam: DamageHeightUp20、DamageRadiusEnd7.7、PaintRadiusStart.5/End7、PaintSpanFrame2、RadiusSpreadFrame50。
- https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpChimney.game__GameParameterTable.json
  - MoveParam: Z1.3/1.5/1.7、Y.24、WorldMin-.4、DamageValueForDamageTag4000。
  - WallParam: StartUp60/Running560/Closing60、DamageValue400、Marking120/Saturation360、SplashSpawnPosition12点、SplashSpawnSpan45/SplashSpawnAllFrame10/SplashPaintRadius2.5。
- https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpFirework.game__GameParameterTable.json
  - IceParam Flying108/Burst210/HP600/10、WeaponParam target center18..35、PipeParam DepthRadius10/MinBetweenDistance5。

## Wikiで補う動作と数値

- https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ホップソナー
  - 本文「装置の投擲と設置」参照: 慣性なし、壁面法線速度を消して落下、サブ依存前隙。
- https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ホップソナー#k55b7c63
  - 設置から1.5/4/6.5秒、低い波なのでジャンプ回避、壁張付にも届く。
- https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ホップソナー#b63f72de
  - 波は地形表面と円柱側面の交線にある。
- https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ホップソナー#k0bd7adb
  - 初期検知57Fと、本文にいう一律マーキング消失時点（具体Fは非記載）。
- https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ホップソナー#hd247088
  - ゲージ減少は投擲起点、約6.5秒。Screenも投擲起点とする脚注。HUD担当が個別記事優先で整理。
- https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/トリプルトルネード#a2e0a022
  - 前隙20+14F、回復19F、37.5×11/5F、着弾後猶予82F、持続51F、下方向約2line、塗り上1.5/下1.2line。
- https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/トリプルトルネード#laacb50e
  - ガイドは地形に接着、キャラ/バリアを素通り、金網には接着。竜巻は地形を貫通するが下方向は狭い。
- https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/スミナガシート#Explanation
  - 着弾で展開、展開時と移動中に塗る、地形を無視して水平移動、接触中デバフ更新、水/奈落不発、展開前はVac吸引可能。
- https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/スミナガシート#spec
  - 投擲前隙13F、接触40/60F。
- https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/デコイチラシ#afe25b2e
  - 12発、108F飛行、210F設置後起爆、13F前隙。
- https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/デコイチラシ#fc6f8a77
  - 空中設置不可、保持中イカ可、飛行中地形無視、ステージ外には落ちない。散布半径横3.5line/前後2line。

## 未確認・残す校正

- Screen/Tripleの疎JSONに重力・空気抵抗は未記載。継承を裏付ける解析実装は発見できず、既存native bomb gravityとzero dragを明示したfallbackにする。原典初速は適用したが、本家の放物線/射程と一致したとは言わない。
- Waveの.08WU接触skin、地形sweepの点半径、坂の作動カットオフ、Screenの矩形/曲面/幅・縦輪郭、非公開startup/closingのヒット輪郭は未測定。
- Waveの検知57F＋付与45Fはraw適用の仮説。Wiki本文の一律消失期限は値が不明で再現できていない。57+45Fを一律期限として創作していない。
- WaveのVac吸引時ゲージ相当量は不明。破棄は接続したが信用0であり、完全一致ではない。
- Screen塗りの初回位相/12点を10F内に割り当てる順序、滴の落下時間は未測定。初期塗り→Running周期の機能を接続し、即時床投影を用いる。
- Tripleの下10WU・塗り上下7.5/-6WUはWiki概測。20点ring足跡/成長曲線・回転の実機形状は未測定。
- Chumpの正確なランダム分布、壁際再配分、上空軌道、視点角度→距離の曲線は未測定。現共有ellipseは校正を保持する。

## 検証記録

- special-device-flight.test.mjs: 最終新16/16成功（18.3秒）。ログ /workspace/scratch/special-device-final-flight.log 。Screen opening塗り・Wave吸引中和・400タグfixまで含む現最終状態。
- consumer10件（Triple3/Wave2/Zip-Screen5）は /workspace/scratch/special-device-consumers.log で成功。
- 修正前最終26件では25成功、Screen吸引400のみ既存cap220のため失敗。retained担当が誤anchorを修正した後、該当1件を /workspace/scratch/special-device-vac.log で成功確認。全26件の成功と混同しない。
- command: node --max-old-space-size=2048 --experimental-vm-modules --test --test-concurrency=1 ...
- syntax/diff-check成功。親がemitted/site/browser/巨大all-specialsを担当。

## 親presentation独立レビュー

- Wave/Screen保持モードがsquid:trueでもnative anim.formがkid固定だった点を報告。Wave保持潜伏は https://wikiwiki.jp/splatoon3mix/ブキ/バレルスピナー に明記、Stampは https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ウルトラハンコ#g0ef9b1b に使用中潜伏可の記載。Screenは個別の「操作はアメフラシ同様」までで直接文言は未発見、親へ区別して報告。
- speakerMarksのWeakMapがclearされず、G.time巻戻し後にremote speakerが再生成される点を報告。親のWeakMap世代更新＋mark age下限ガードが反映されたことを読み取り確認。
- Zipcoatのborrowed geometryをdisposeしないflag、共有material保持、Setによる重複dispose防止は妥当。新規の同程度の具体不具合は現時点で未発見。

## HUD/gauge独立レビュー（担当の最終調整中のdiff）

- tacticooler-gauge/deployedGaugeFraction、storm-effects/specialGaugeFraction、local-quality/hud-snapshotsを読み取り。projectionはHUD/mobileへ閉じ、a.specialFrac/specialReady/networkへ書き戻す経路なし。
- Wailは別wailGaugesがnative a.specialを減少させるためactiveGaugeFraction対象外で整合。local life/owner/remote/death/resetの失効もある。
- Bubblerは実崩壊までのInfinity lockと、無被弾時寿命で減るdisplayDurationが分離。Coolerは600F分母を保持しTower450F退場で早期終了する。
- Storm/Cooler pending表示は実throw配列のmembership、alive、remote、matchを参照し、resetで消える。実作動が発生するとdeployed sourceへ置き換わり、death/reset後のlate operationもlock起点を保持する。
- 現時点で具体P0/P1なし。読み取り中心で大きいsuiteを追加起動していない。
