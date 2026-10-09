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
