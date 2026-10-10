# INKWAVE ブラスター床塗りの数値比較（2026-10-09）

対象: Nintendo Splatoon 3 Ver.11.3.0 の `WeaponBlasterMiddle`（ホットブラスター）、INKWAVE 基準 `5d0be6b7` に塗りの既存修正を組み込んだ `INKWAVE-5d0be6b7-weapon-fidelity-source.zip`。

## 確認した抽出パラメータ

| 項目 | S3 11.3.0 | INKWAVEソースに組み込まれた値 | 一致 |
|---|---:|---:|---|
| 最初の飛翔中塗り位置 (`SpawnNearestLength`) | 0.5 | 0.5 | ○ |
| 続く発生間隔 (`SpawnBetweenLength`) | 1.5 | 1.5 | ○ |
| 1発当たりの上限 (`SpawnNum`) | 7 | 7 | ○ |
| 足元の飛沫の塗り半径 (`WidthHalfNearest`) | 2.43 | 2.43 | ○ |
| 一般飛沫の塗り半径 (`WidthHalf`) | 1.62 | 1.62 | ○ |
| 飛沫塗り長さ変化の高さ端点 | 3, 10 | 数値は3,10。ただし飛翔中塗りの描画処理が使用しない | ×（処理） |
| 地形弾着時の爆発液滴半径 (`SplashDropPaintShotColHitRadius`) | 2.5 | 2.5 | ○ |
| 壁衝突の塗り半径（ゲーム本体の関連設定） | 2.2 | 2.2 | ○ |

INKWAVEの `worldUnitsPerSourceUnit` は1。これはローカルの尺度選択であり、実際の画面・マップの寸法の等価性は未立証。

## コードで確認できた不一致

### ① 飛翔中の床塗りに高さ4.0のハードカットがある
`patches/splatoon3/runtime/blaster-flight-paint.mjs` の `paintDistanceFlight` は `game.physics.raycast(sample, down, 4, ...)` により、飛翔弾位置の真下 **4 world units以内** に床がないとき、その飛沫位置の床塗りを永久に捨てる。これに対応する4.0の閾値は抽出した `SplashPaintParam`にはない。

平坦な床、水平に11単位進む弾、フライト飛沫の7候補に固定したローカルコード検査結果:

| 飛翔弾の床からの高さ | INKWAVEで生じたフライト塗り |
|---:|---:|
| 2.00 | 7個 |
| 3.95 | 7個 |
| 4.00 | 7個 |
| 4.05 | **0個** |
| 5.00 | **0個** |
| 10.00 | **0個** |

この値は本家の実測値ではなく、実際のINKWAVEソースを走らせた結果。元のS3パラメータから「高さ5で7個必ず床に付く」とまでは導けないが、S3の `DepthMaxDropHeight=3` / `DepthMinDropHeight=10` は飛沫塗りの**長さ倍率**に関連する高さであり、4.0を超えたら発生を破棄する仕様根拠にならない。高所からの落下後に床へ塗る過程を別に構成する必要がある。

### ② 塗りの長さ倍率が実際の飛翔中7候補に適用されていない
S3の飛沫塗りは高さ3以下のとき長さが約**1.2倍**、高さ10以上では**1.0倍**、その間で移行する（Inkipedia のSplatoon 3版データ記述）。INKWAVEの上記 `paintDistanceFlight` は生成地点と半径だけを読み、`stretch`/`stretchAmt` を設定しない。高さ2で本来変化する長さ倍率が **1.2 vs 1.0** に相当する実装の欠落がある。1.2倍側を基準にすれば、伸びの長さは約**16.7%短い**。ただし本家の最終塗り境界は別途形状情報が必要であり、円形面積の差には直結しない。

### ③ 別の飛翔壁滴関数が通常弾では呼ばれない
`configureBlasterFlightPaint` は通常のBlaster projectile の `trailEvery` を**0**に設定する。一方、`weapons-adapter.mjs` から生成される `src/game/weapons.js` の `applyFidelityBlasterFlightPaint` 呼び出しは `if (... && p.trailEvery)` ブロック内にある。したがって通常弾はこの経路に入らない。`SplashWallHitParam.SpawnParam.FirstDistance=1.8`などの値が正しく読み込まれていても、壁飛沫の追加経路として実行されない。

### ④ 爆発の床塗り形状は本家の数値だけでは校正されていない
`weapons-fidelity.mjs` は時間起爆時に床まで下方3.5WUのraycastを行い、中心に半径2.0のINKWAVE `paint.splat` を描き、独立の落下滴を**1個**キュー（半径3.2）。下方検知は起爆地点の0.2WU上からなので、直下床まで起爆高さ約**3.3WU**を超えると即時中心塗りは0。地形接触時は別の半径2.5処理となる。

この 2.0 と 3.2 は疎なS3型フィールドの**ランタイム既定値として組み込まれているもの**。InkipediaではS3の空中爆発の液滴による塗り半径を3.2と記載。一方、抽出JSONには2.0、3.2の明示的フィールドがないので、型既定値の取得根拠とNintendo内部の形状生成・落下粒数を再検証しない限り、最終床塗り面積を「本家と一致」とは言えない。

### ⑤ 最終塗り輪郭の問題
`inkwave-public/src/world/paint.js`の `splat` は独自の `blobWobble` 乱形、CPU所有グリッド0.25WUセル、GPUの種類別衛星液滴／スパッタと成長カーブで塗る。中間飛沫は`kind:'drop'`を強制。S3数値の幅1.62を渡しても、生成された塗りマスク・面積・密度がNintendoと等しいとは言えない。正確な面積差は本家の形状生成ロジックかそれと等価な参照が必要。

## 結論

パラメータの半径・間隔・個数は抽出値と一致。しかし高さ4WUの塗り破棄、高さ別の塗り長さ未反映、壁飛沫の未到達経路がコード上の明確な不足。数値比較・局所修正のために本家実機撮影や実測は不要。最終の形状・総塗り面積の一致確認は、抽出数値だけで断定できない。

出典:
- Nintendo Ver.11.3.0 抽出パラメータ: https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponBlasterMiddle.game__GameParameterTable.json
- Splatoon3 Blaster data: https://splatoonwiki.org/wiki/Blaster
- INKWAVE: 修正済みソースの `patches/splatoon3/profile.json`, `patches/splatoon3/runtime/blaster-flight-paint.mjs`, `patches/splatoon3/runtime/weapons-fidelity.mjs`, `patches/splatoon3/weapons-adapter.mjs`, `inkwave-public/src/world/paint.js` と `_site/src/game/weapons.js`。

---

# PR1188 修正後（2026-10-09, Claude）

上記①〜⑤を、パラメータの値ではなく **飛沫の発生 → 落下 → 地形衝突 → 塗り生成 → CPU所有 → GPU描画** の処理として作り直した。対象は `patches/splatoon3/runtime/blaster-flight-paint.mjs`（共有の落下飛沫キュー）、`weapons-fidelity.mjs`（爆発・壁飛沫の接続）、`roller-vertical-paint.mjs`、`paint-ownership-adapter.mjs`（CPU本体輪郭）と、InkFlight（シューター系）の飛沫足跡アダプター。

## 根拠の区分

| 区分 | 値 | 出典 |
|---|---|---|
| 11.3.0抽出（確定） | SpawnNearestLength 0.5 / SpawnBetweenLength 1.5 / SpawnNum 7 / SplitNum 1、WidthHalfNearest 2.43 / WidthHalf 1.62、DepthMaxDropHeight 3 / DepthMinDropHeight 10、FreeGravity 0.016、SplashWallHitParam（FirstDistance 1.8, VelocityMinusYRate 0.4, Shock 1.4, Fall 1.0, 15/35/20–35F）、SplashDropPaintShotColHitRadius 2.5、SplashRoundAxis 4×5、SplashWallDrop Shock 1.2、KnockBackParam 700/0.8/3.5 | `patches/splatoon3/reference/weapon-audit-1130/WeaponBlasterMiddle…json`（Leanny/splat3 `7280ff9c`） |
| 型既定値（疎な表に無い・公開解析／既存実装） | DepthScaleMax 1.2 / DepthScaleMin 1.0、RandomSpawnVel X 0.055 / Y 0.015 / Z 0.01–0.02、FreeAirResist 0.02、SplashPaintRadius 2.0、SplashDropPaintRadius 3.2、SplashDropOn true、WallHitPaintRadius 2.2 | Inkipediaの1.2→1.0記述、上流 `inkwave-public/src/game/inkFlight.js` の INK_PROFILES / INK_MODEL（シューター系で既に使用中の同型既定値）、既存 #1107 / #975。11.3.0表では RandomSpawnVel を明示する3ブキがちょうどこの値を書いている。 |
| 推定モデル（本家コード非公開） | 飛沫は放出点から上記初速で放出され、ブキ自身の FreeGravity と空気抵抗0.02で落下し、最初に当たった面に塗る。深さ倍率は3〜10の間を線形補間。楕円 WidthHalf×(WidthHalf×depth) を PaintSystem の前方スメアへ **全長と面積が一致** するよう写像（`sa=1.6(depth−1)`、中心を `0.375·r·sa` 後退）。爆発は「爆点中心の球状塗り（半径2.0、地形/直撃は ShotColHit 側）＋落下滴1個（3.2、地形/直撃は2.5）」。地形/直撃の球半径は Middle の表に無いため SplashPaintRadius で代用。 | 本報告とコードコメントに明記 |

## 処理の修正

1. **4.0WU打ち切りの撤廃**：飛翔中の各飛沫は固定長の下向きレイではなく、落下滴として60Hz固定ステップで落下させる。高さに上限はなく、空間外（水面−2、240F）に出た滴だけ破棄。シューター系（InkFlight）・縦振りローラーも同じキュー/写像を使う。
2. **深さ倍率の適用**：着地時の落下高さから 1.2→1.0 を計算し、実際の `paint.splat` の `stretch/stretchAmt` と中心位置に反映。
3. **壁飛沫の接続**：通常弾は `trailEvery=0` のため旧 `applyFidelityBlasterFlightPaint` に到達しなかった。壁判定（FirstDistance 1.8、Y減算0.4）を飛沫スケジューラーの放出ごとのフックに移し、壁に掛かった飛沫は SplashWallHit の壁落ちになり、床には落ちない（二重塗りなし）。
4. **爆発**：時間起爆の「下方3.5WUレイ＋円盤2.0」と地形/直撃の「下方3.5WUレイ＋円盤2.5」を廃止。球状塗り（高さとともに連続的に縮小し、2.0以上離れると0）＋どの高さからでも落ちる滴に変更。壁に当たった地形爆発の滴は壁から衝突半径0.4だけ離れて壁際の床へ落ちる。#729 の次ティック化キューに滴の向き（法線）と種を引き継ぐ。
5. **CPU/GPU**：GPU本体輪郭はSDFの零交差（α=0.5）だが、CPU所有は 0.97 倍で切っていた。WebGL2（SwiftShader）実描画で、本体セル32,313中1,864セル（5.8%）が「見えているのに誰の塗りでもない」ことを確認し、CPUを零交差に一致させた。

## 固定条件の数値（INKWAVE実モジュール、本家実機ではない）

`node --experimental-vm-modules scripts/measure-blaster-floor-paint.mjs --out reports/weapon-audit-20261009/evidence/blaster-floor-paint-1188.json`

| 飛翔高さ | 床へ届いた飛沫 | 深さ倍率 | 最長落下F | 7飛沫のCPU面積 |
|---:|---:|---:|---:|---:|
| 0 | 7 | 1.200 | 1 | 50.56 |
| 2 | 7 | 1.200 | 16 | 50.75 |
| 3 | 7 | 1.200 | 20 | 50.75 |
| 3.95 | 7 | 1.173 | 24 | 50.50 |
| 4.00 | 7 | 1.171 | 24 | 50.50 |
| 4.05 | 7 | 1.170 | 24 | 50.50 |
| 5 | 7 | 1.143 | 27 | 49.81 |
| 10 | 7 | 1.000 | 40 | 46.75 |

旧実装は 4.00 で7個、4.05 以上で0個。新実装は 3.95/4.00/4.05 で連続（差0.003）。放出位置はすべての高さで 0.5, 2.0, 3.5 … 9.5（SpawnNearest/Between と一致）。

| 実弾（発射高さ） | 塗り要求 | 飛翔飛沫 | 時間起爆の球 | 起爆滴(3.2) | 床CPU面積 |
|---|---:|---:|---:|---:|---:|
| 1.05 | 9 | 7 | 1 | 1 | 70.00 |
| 3.05 | 9 | 7 | 1 | 1 | 69.56 |
| 5.05 | 9 | 7 | 1 | 1 | 68.69 |
| 11.05 | 9 | 7 | 1 | 1 | 66.19 |

時間起爆の高さ 0.51 / 0.56 / 0.66 / 2.56 / 5.56 / 10.56 に対し、球状塗りの床面積は 12.38 / 12.19 / 12.06 / 0 / 0 / 0、落下滴(3.2)は常に床へ届き 34.06。段差（高さ2・z≥4）では手前は床、段差の上は段上、漂流した1滴は段差の側面（法線y=0）に塗る。斜面（0→3）では全着地点が斜面上（法線y 0.97）、壁（z=6）では放出 5.3 の1滴だけ壁落ち（Shock 1.4 + Fall 1.0）、残り3滴は床、地形爆発の滴(2.5)は壁際 z=5.6 の床。30/60/120Hz の描画間隔で全塗り要求は完全一致。

GPU検査（`scripts/check-inkwave-paint-mask.mjs`、実WebGL2 SwiftShader）：既存108条件の付随形状に加え、本体81条件（shot/blast/bomb/trail/drop、stretch 0/0.27/0.32/0.7/3.2、半径1.62/2.43/3.2、3種子）で **CPUだけ所有 0、GPUだけ表示 0**、浮動小数の零交差上の同値 7 セルのみ。

## 残る未検証

- 本家の塗りテクスチャ形状そのもの（INKWAVEは手続き的ブロブ）。面積・全長・幅は一致させたが、輪郭の凹凸は本家画像との比較をしていない。
- 落下滴の初速・空気抵抗・落下時間（＝塗りが現れるまでの遅延）は既定値の推定モデル。本家の時刻はフレーム実測していない。
- Middle の地形/直撃時の球状塗り半径（SplashPaintShotColHitRadius の型既定値）は未抽出で、SplashPaintRadius で代用。
- 滴の個数（爆発1個）、SplashRoundAxis の各方向の飛沫が床へ落ちる処理（現在は壁に当たったものだけ壁落ち）は本家コード未確認。

---
## スプラ2 Ver.5.5.0との交差照合（2026-10-10 / PR #1188）

**この節はPR1188に追加した独立の史料比較であり、上の2026-10-09当時の測定値とは区別する。**

- 原典：Leannyの [S2 Ver.5.5.0 BlasterMiddle_Burst.json](https://github.com/Leanny/leanny.github.io/blob/master/data/Parameter/550/WeaponBullet/BlasterMiddle_Burst.json)。対応ファイルを `patches/splatoon3/reference/splatoon2-550/BlasterMiddle_Burst.json` に保存。
- S2 `mSphereSplashPaintRadius=20` は、S3通常起爆の省略型既定値 `SplashPaintRadius=2.0` に対して10倍。S2 `mSphereSplashDropPaintRadius=32` はS3 `SplashDropPaintRadius=3.2` に対して10倍。**ここでの10倍は個別フィールドの観測対応であり、ゲーム全体の単位スケールを証明しない。**
- **従来のINKWAVEの見落とし：** S2 `mSphereSplashPaintShotCollisionHitRadius=14`（対応候補は1.4）と通常半径20（2.0）は別。PR1188のS3 Middleの直撃/地形用球半径は、欠落した値を通常の2.0で代用していた。
- S3 11.3.0でも独立した `SplashPaintShotColHitRadius` フィールドが存在する。長射程ブラスターは `SplashPaintRadius=2.093` / `SplashPaintShotColHitRadius=1.465`、クラッシュではなくショートの `2.4/1.68`、精密ブラスターの `1.0/0.7` と、約0.7の比率が実際に現れる。ただしノヴァ相当のLightShortは `1.8/1.6` と異なり、一律「×0.7」という一般則は正しくない。
- **変更したモデル：** `SplashPaintShotColHitRadius` が省略されたMiddle/Lightには、S2最終版の独立した衝突球半径14から換算した **1.4** を推定既定値として使用。S3に明記された個別ブキの値は常に優先。通常時間起爆の球半径は2.0、落下滴は通常3.2・地形/直撃2.5のまま。ダメージ・射程は変更しない。
- **重要な限界：** 3の省略型既定値のバイナリ証明ではない。S2の14→1.4という対応を継承した **cross-generation calibration** であり、任天堂3での正確な塗り半径が証明されたわけではない。公式3の実行コード、型のデフォルト定義、または独立検証が得られれば置き換える。
- 回帰テスト：`issue-1107-blaster-defaults.test.mjs` はS2原典＋S3実データをロードし、通常/地形/直撃/落下半径の混同を防止。`blaster-floor-paint-1188.test.mjs` は実発射から衝突球半径1.4・落下滴2.5を確認する。

これ以外のS2→S3の値・式の等価性は証明していない。

### 追加の独立したスプラ3側の根拠（2026-10-10）

Inkipediaの [Template:Shooter data S3](https://splatoonwiki.org/wiki/Template:Shooter_data_S3) は
`BlasterBurstParam` の型既定値として **`SplashPaintShotColHitRadius = 1.4`** と
`SplashPaintRadius = 2.0`、`SplashDropPaintRadius = 3.2` を明記している。
11.3.0のMiddle JSONには1.4が省略されるが、**独立したS3コミュニティ資料とS2最終データの両方で一致**する。
したがって本PRの衝突時1.4採用は、単なるS2→S3の当て推量より根拠が強い。
一方、このWikiは任天堂のソースコードではなく、爆発の滴数・形状・発生時刻まで証明しない。
実装の通常2.0／衝突球1.4／通常落下滴3.2／衝突落下滴2.5の独立性を引き続き守る。
