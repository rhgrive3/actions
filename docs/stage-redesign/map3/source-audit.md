# 実装・尺度・面積の監査

2026-10-31。対象は PR #1985 の Tidewater Plaza / Kelpline Terminal と、比較用に読み取った既存 native 23 ステージ。再設計の対象に native ステージは含めない。調査基準は親コミット `0582bb1ee6ac03dfb54e292ea839d18463e33fcc` と、PR head `b208addacc61009fba44ae973d5288b6f315f303` の変更ファイル。現在の `maps.js` にある部分拡張と、`map2` の未実装設計を区別する。

**結論：84×144 / 88×144 WU、スポーン間134.4 / 136 WUは、既存nativeの設定境界・設定スポーンと比較して妥当な規模の参照値になる。一方、以前の「native中央値12,480」は床面積でなく境界矩形面積であり、その数字を塗り床の目標に置き換えてはいけない。** 同じ測り方で得たnativeの上向き衝突面のXZ和集合は、0.5 WU中心点サンプルで中央値約8,011 WU²。現在の部分拡張は Tidewater 11,968、Kelpline 12,672 WU²で、外形のほぼ全域に床の投影がある。

## 1. 単位と比較の範囲

長さは WU、面積は WU²と記す。[config.js](../../../inkwave-public/src/config.js) の古いコメントには meters とあるが、[profile.json](../../../patches/splatoon3/profile.json) の `calibration.distanceScale` は factor=1、status=inferred、実際のキャラ・ステージ尺度は要計測とする。同ファイルには「retained INKWAVE world scale; not an SI-metre claim」と明記される。[source-convert.mjs](../../../patches/native-stages/runtime/source-convert.mjs) のmanifestも「OBJ Y-up float32, no scale/translation; retail unit equivalence unverified」とする。**1 WU = 現実の1 m、または本家の塗りポイントpへの換算は確立していない。**

nativeとは、このリポジトリが固定OBJを読み込み、表示三角形から衝突・塗りマスク等を推定したもの。本家から回収した正規のcollision、mask、respawn、ranked配置ではない。manifestの `collisionStatus / paintStatus / spawnStatus / ruleStatus` をJSONに保存した。23件は有効なpayloadが存在する比較群で、未提供の定義だけを件数に加えていない。本家実機のバージョン・ブキ・ギア・操作条件を揃えた比較は行っていない。処理はファイルと数値の検査であり、ブラウザ実走、描画確認、対戦バランス検証ではない。

## 2. 再現と計測定義

[measure_baseline.py](measure_baseline.py) と [baseline-metrics.json](baseline-metrics.json) が再現用の入力経路と結果を持つ。通常の完全checkoutで、native payloadを持つディレクトリを指定して実行する。

```sh
python docs/stage-redesign/map3/measure_baseline.py \
  --native-root /path/to/native-prebuilt \
  --out docs/stage-redesign/map3/baseline-metrics.json
```

Node と NumPy を使う。`--three` で既存vendorの `three.module.js` を指定できる。今回、別作業ディレクトリの既存native payloadを**読み取り専用**で使い、各ステージの triangles / normals / faceF64 / faceI32 / mask の全chunkを、このcheckoutのHEADにあるGit LFS pointerのSHA256・サイズおよびcached manifestのSHA256・サイズと照合した。nativeのbounds・spawnPads・sourceSha256も現在のcatalogに一致する。古いcached stage.json自体は最新manifestとの同一性を主張せず、使う座標・array payloadを個別に照合している。ダウンロード、nativeデータの変更、他の作業ディレクトリへの書込みはしていない。

| 指標 | 定義 | 何を証明しないか |
|---|---|---|
| 設定境界矩形 | `(maxX−minX)×(maxZ−minZ)` | 水・空白・床の欠けを引いていない |
| スポーン間隔 | 設定された2点の3Dユークリッド距離。XZ距離もJSONに保存 | 実際の移動経路長、到達時間、正規本家スポーン |
| 全衝突頂点bounds | collision三角形のXYZ最小最大 | プレイ可能範囲。nativeでは設定境界の外まで含む |
| 上向き面の実表面積合計 | collidable、normal.y≥0.68、設定XZ内で三角形をclipした面積の和 | 重複・内部床・天井の上・到達不能面を引いていない |
| 上向き面の投影合計 | 同じ三角形のXZ投影面積を加算 | 上下・同高の重複を重ねて加算する |
| XZ和集合サンプル | 同じ面群を0.5 WU格子の中心で判定。端の部分セルは実面積を用いる | 厳密なpolygon unionでも、頭上クリアランスや到達可能性を考慮した床面積でもない |
| 上下差サンプル | 同じXZで最高/最低の上向き面の差が1.6 / 2.5 WU以上の面積 | その間が空洞とは限らない。盛土の埋まった底面も拾うため、上下通行面積ではない |
| runtime turfArea | 通常は `PaintSystem._initGrid`、nativeは `initNativeGrid` のliveなturfセルの `cu×cv` 合計 | 地形全体の投影面積、到達可能な床、得点の実機校正値ではない |
| bounds内turfArea | 上記のセル中心が設定XZ内のものだけを加算 | runtime自体がこのclipを行うという意味ではない |

通常2ステージには **`Level(layout)` のみを使い、PropKitの追加衝突は含めない**。このスコープをJSONにも記録した。実ゲームは [main.js](../../../inkwave-public/src/main.js) で `dressingFor` → `PropKit.add` のcollidersをLevelに渡す。追加の非塗装小物は隠れた床を増やすため、本表の通常turf値を最終ゲームの厳密値として扱わない。nativeのsource collision側には、変換処理がcollidableとした小物が含まれる。従って共通幾何計算は同じだが、双方のasset分類が同質であるとも主張しない。

raw面合計・和集合・runtime turfの計算順と定義は異なる。nativeマスクは三角形とセルの重なりを採用し、通常グリッドは面内のセル中心と他box内判定を使う。両者とも目標cell≈0.25だが、nativeのnu/nvはceil、通常はroundである。面積の大小だけから品質や本家再現率を決めない。

## 3. 数値の読み方

native23件の設定境界面積は6,845.19〜22,390.31、中央値12,480 WU²。スポーン間隔は87.36〜188.00、中央値134.16 WU。幅中央値88、Z方向長さ中央値145だが、横長ステージがあるため「すべて縦長88×145」と解釈しない。

nativeのXZ和集合/各ステージ設定矩形面積という**各件の比率の中央値**は73.45%。Tidewaterは98.94%、Kelplineは100%。中央値同士を割った64.19%はこれと別の統計である。現在の2つは既にnative並みの開始間隔を持つが、地上の輪郭をほぼ矩形いっぱいに埋めている。再設計ではこの外形・距離を起点に、空白、水際、回り込み、中間高、独立した上階を構成する理由がある。

nativeのraw塗り面積をそのまま目標にしてはいけない。例としてShipshapeの全source collisionはX≈−540.6まで広がり、設定boundsはX=−32..32。全runtime turfAreaは109,394.39、設定bounds内のセルだけでも44,622.43 WU²となる。これは多重面・source分類・マスク・設定範囲の違いを含み、本家の有効なナワバリ面積ではない。上向きの面積合計についても「同じXZにある複数の面」を加算するため、和集合より大きくなる。

### 現行2ステージ（部分拡張・layoutのみ）

| 指標 | Tidewater | Kelpline |
|---|---:|---:|
| 幅×Z長さ（WU） | 84×144 | 88×144 |
| 設定境界面積 | 12,096.00 | 12,672.00 |
| スポーン3D間隔（WU） | 134.40 | 136.00 |
| 上向き面の実表面積合計 | 14,225.86 | 15,807.95 |
| 上向き面のXZ投影合計 | 14,201.90 | 15,773.29 |
| XZ和集合（0.5 WU） | 11,968.00 | 12,672.00 |
| runtime turfArea / bounds内turfArea | 12,107.81 | 13,150.46 |
| 上下差≥2.5のサンプル（空洞保証なし） | 358.00 | 893.50 |

スポーン座標はTidewater `(0,2.2,±67.2)`、Kelpline `(0,3.2,±68)`。全衝突頂点のXYZ範囲はTidewater `[-42,−2.962,−72]..[42,5,72]`、Kelpline `[-44,−4.284,−72]..[44,5.2,72]`。下端には斜めのboxの下面も含む。以下の面積単位はすべてWU²。

### Native 23件・同じ座標と境界の比較

| ID | 幅×Z長さ（WU） | スポーン間（WU） | 設定境界矩形 | 上向き実表面積の和 | XZ和集合（0.5 WU） | bounds内turfArea |
|---|---:|---:|---:|---:|---:|---:|
| airport | 108.06×150.00 | 162.86 | 16,209.49 | 16,147.84 | 8,011.15 | 17,731.68 |
| barnacle | 100.00×160.00 | 153.69 | 16,000.00 | 15,013.70 | 9,067.75 | 17,071.18 |
| bluefin | 69.00×150.00 | 142.04 | 10,350.00 | 18,508.49 | 7,758.25 | 18,349.77 |
| brinewater | 95.00×138.00 | 121.28 | 13,110.00 | 12,343.83 | 7,908.50 | 14,594.50 |
| crableg | 100.00×146.00 | 145.00 | 14,600.00 | 18,386.00 | 7,991.50 | 20,040.39 |
| eeltail | 57.00×196.00 | 186.60 | 11,172.00 | 20,194.15 | 9,328.25 | 17,674.78 |
| flounder | 88.00×165.00 | 141.42 | 14,520.00 | 13,665.21 | 9,179.25 | 12,930.61 |
| hagglefish | 105.87×156.00 | 134.16 | 16,515.94 | 12,352.69 | 7,968.70 | 12,195.50 |
| hammerhead | 60.00×208.00 | 188.00 | 12,480.00 | 12,406.05 | 8,532.50 | 14,419.70 |
| humpback | 78.60×131.80 | 122.00 | 10,359.48 | 27,379.96 | 10,359.48 | 16,084.86 |
| inkblot | 92.00×136.33 | 122.36 | 12,542.78 | 25,332.30 | 12,533.28 | 20,755.09 |
| mako | 67.00×135.00 | 117.06 | 9,045.00 | 13,901.02 | 7,402.50 | 14,326.59 |
| manta | 69.00×99.21 | 87.36 | 6,845.19 | 11,452.53 | 6,292.73 | 6,564.14 |
| mincemeat | 62.00×150.00 | 120.93 | 9,300.00 | 33,490.49 | 8,392.00 | 37,958.96 |
| museum | 132.00×110.00 | 132.14 | 14,520.00 | 30,441.99 | 13,404.00 | 27,248.21 |
| robo | 150.00×78.00 | 127.81 | 11,700.00 | 15,040.34 | 6,173.50 | 16,013.39 |
| scorch | 72.00×165.00 | 142.69 | 11,880.00 | 9,328.87 | 6,862.00 | 9,057.99 |
| shipshape | 64.00×145.00 | 132.97 | 9,280.00 | 41,133.09 | 9,280.00 | 44,622.43 |
| sturgeon | 60.00×145.00 | 129.52 | 8,700.00 | 14,844.77 | 7,502.50 | 15,692.53 |
| umami | 93.00×159.00 | 150.37 | 14,787.00 | 15,838.05 | 7,999.00 | 18,299.71 |
| undertow | 60.00×123.00 | 116.00 | 7,380.00 | 9,140.38 | 6,864.50 | 10,609.35 |
| urchin | 207.00×75.62 | 184.39 | 15,652.51 | 21,604.53 | 11,497.12 | 22,931.34 |
| wahoo | 239.80×93.37 | 170.00 | 22,390.31 | 17,638.81 | 11,286.63 | 20,980.39 |

全23件の設定boundsと全衝突頂点bounds、上向きXZ投影合計、clip前のturfArea、各chunkのhashはJSONに残している。この表の「上向き実表面積の和」も内部・重複・到達不能面を除去した可遊床面積ではない。

### サンプル解像度の確認

同じ処理を `--step .25` でも実行した。[baseline-resolution-check.json](baseline-resolution-check.json) に差を保存した。native和集合の中央値は0.5 WU格子で 8,011.15、0.25 WU格子で 8,037.12 WU²。各ステージの最大変化は bluefin の +1.001%（+77.69 WU²）。現行の通常2ステージも0.25 WUで再計測し、Tidewater 11,968.00 / Kelpline 12,672.00 WU²で0.5 WU時と同値だった。[ordinary-quarter-metrics.json](ordinary-quarter-metrics.json) に現行Levelからの抽出結果・入力hash・計算値を保存した。これはサンプル感度の実測で、厳密和集合に対する誤差上限の証明ではない。面の実表面積・投影合計は三角形clipの解析計算であり、この格子解像度には依存しない。

### Map3提案を同じ式で比較する

[measure_proposal.py](measure_proposal.py) は上記の `geometry_metrics` を共有し、最終提案の床・坂・grate・障害物上面を三角形にして同じnormal閾値、bounds clip、中心点サンプルへ渡す。[proposal-common-metrics.json](proposal-common-metrics.json) に設計モジュールのSHA256と0.5 / 0.25 WUの結果を保存した。coverの接地面を引かず、その下の床もcover上面も含める。このため、`geometry.py` が別に出すcover控除後の地形面積や高さ分布の分母とは異なる。

| 提案 | 上向き実表面積の和（WU²） | 上向きXZ投影の和（WU²） | XZ和集合（WU²） | native 0.25中央値に対する和集合 |
|---|---:|---:|---:|---:|
| tidewater | 8,755.23 | 8,701.60 | 8,104.00 | 100.83% |
| kelpline | 11,781.77 | 11,736.80 | 9,032.00 | 112.38% |

両提案の和集合は0.5 / 0.25格子で同値だった。これは**提案の公称形状**での同じ式による比較であり、Levelから生成した実colliderとの同一性を意味しない。提案は垂直側面のslabと垂直厚さ0.6の坂で、実Rの法線方向厚さ・低端0.6延長をまだ反映していない。通路に変換するときは、床を置き換える坂の端、橋の下面、柱・柵・dressingを含む完成Levelを再計測する。提案のruntime turfAreaは未測定である。

## 4. 以前の設計資料の数値をどう引き継ぐか

- [最初のREADME](../README.md)、[tidewater.md](../tidewater.md)、[kelpline.md](../kelpline.md) は現在のゲームと別の提案。1 WUをm表記した旧注記は上記のWU表記で読み替える。
- 旧Kelpline文書の「native中央値12,480・開始間134」は今回のcatalog集計と一致するが、12,480の正体は**bounds矩形**。旧文書自体も原典塗り面積未取得と明記している。
- 以前のTidewater約12,057 / Kelpline約13,104という `turfArea` 引用には、このdocs内に確定した入力hash・実行結果・抽出器が付いていない。今回の現行layoutのみの再計測は12,107.81 / 13,150.46。差は約50.81 / 46.46だが、過去入力・追加collider・丸め等の内訳を根拠なく決めない。旧値への90%という比率を新案の保証にしない。
- [map2 Tidewater](../map2/tidewater.md) の下層10,308.8、上層736（うち格子64）、水平塗面候補10,980.8、壁占有控除後10,904.32は**提案矩形の算数**。今のゲームを測った値ではない。
- [map2 Kelpline](../map2/kelpline.md) の下層10,152、上層通常2,144＋格子152、候補12,296、追加壁占有174も提案矩形。壁の上面が塗れるなら接地面積をそのまま総turfから引くことはできない。
- [height-audit](../map2/height-audit.md) の指摘は妥当。Tidewater下層はY=0と1.2に約82%集中し、Z帯で一斉に高さが切り替わる。Kelpline下層はY=0、上層はY=3.2に集中する。上階の投影736 / 2,296という値は上下に面がある候補で、柱・壁・階段を除いた上下通行面積ではない。

## 5. 地形を決める実装制約

### 身体・坂・階段

[config.js](../../../inkwave-public/src/config.js) のみを見るとradius=.38、height=1.45、squidHeight=.55だが、本番は [install.mjs](../../../patches/splatoon3/runtime/install.mjs) がprofileを適用し、[local-batch-01-adapter.mjs](../../../patches/splatoon3/local-batch-01-adapter.mjs) がActorの地形衝突半径を置換する。実際の地形半径はヒト .35、イカ .675 WU。`.38` を最小通路幅の唯一の根拠にする旧設計記述は不十分である。

左右壁間の公称幅Wに対して、中心が動ける幅の単純な上限はヒト `W−.70`、イカ `W−1.35`。幅3なら1.65、幅4なら2.65 WUがイカ中心の余幅になる。角、斜め通行、足支持、階段、速度、カメラ、botの誤差はこの式に含まない。4 WUを主通路の設計下限にすることは判断として可能だが、通行保証にはならない。

[physics.js](../../../inkwave-public/src/game/physics.js) の歩ける法線閾値は `WALKABLE=.68`、約47.16°。通常stepUp=.35、squidStepUp=.24、stepDown=.45、footRadius=.24。botの隣接歩行閾値は別であるため、47°までの坂を主経路に採用するとbotが歩行辺として扱えない可能性がある。主経路は1 WUあたり高低差≤.5を目安にする方が現行navと整合しやすい。0.2 WU段差はイカstepUpとの差が.04しかなく、箱階段は30/60/120Hz、斜め進入、泳ぎながらの切替を実走確認する必要がある。

**高さについては特に注意する。** `collideBody/bodyFits` は `bot=lift+radius; top=max(bot,height−radius)` の端点間capsuleを使う。ヒトはlift=.35、radius=.35で上端1.45。イカはlift=.16、radius=.675なので数式上のsphere外形は上端1.51となるが、同じ関数の縦方向early-outは依然 `pos.y+height`（.55）を参照する。従って「イカの確定した全衝突高さ=.55」も「完全に一貫した高さ=1.51」も断言できない。**この不整合を利用した低い抜け穴を設計しない。** 新案の主な高架下は十分な余裕を持たせ、将来のcontroller検証で実際の上下clearanceを測る。

ジャンプ頂点は `v²/2g` のみで確定しない。元のjumpVel=8.4/swimJumpVel=9.4、gravity=25に加え、apex/fallの倍率、ledgeAssist、変身・壁処理、movement adapterがある。段差の接続を未測定の最大跳躍だけに依存させず、連続した坂/階段と戻り経路を用意する。[movement-physics-adapter](../../../patches/splatoon3/movement-physics-adapter.mjs) は上がる足支持・着地時のbodyFitsも検査するため、上の床に届くだけでは通れない。

### 薄い高架・床の接合

[Level._addBlock](../../../inkwave-public/src/world/level.js) の通常Rは、riseを使って厚くした傾斜OBBで、下を通るための板ではない。`thin:true` の時だけ指定厚を維持する。それでも低端は傾斜方向に0.6 WU延長される。高架の下面は各断面で検査し、入口にこの延長や接続slabが出ないようにする。Y方向に床を置くだけで、下階の経路が残ると判断しない。

LevelはCSGや面結合を行わない。同一高さの重複床は面・塗りセルを二重に持ち得る。内部判定は面からnormal方向に.06 WU出したセル中心が他solid box内かどうかなので、同一平面を綺麗に統合する処理ではない。矩形分割・接触辺・階段切欠きを明示する。`noPaint` は面の塗装設定で、衝突/描画を結合しない。`roof / perch / noNav / hidden` も別の意味を持つ。

### 塗り・得点・ミニマップ

「塗りは全て2Dだから上下床を扱えない」は誤り。[paint.js](../../../inkwave-public/src/world/paint.js) は各faceに独立したatlas領域とCPUセルを持ち、同じXZの別階を別々に保持する。turfはnormal.y>.7、壁は塗れてもturf得点対象と別である。grate/railは塗れず、ヒトは立てるがイカ・インク・弾・camera rayは通す。通常の実体柵とは区別する。

`coverage()` はlive turfセル**数**の比率で、`turfArea` はcu×cvの面積合計。セルの実寸が面によって違うため、この2つは完全に同じ重みではない。raw runtime turfArea、投影面積、面積に基づく設計割合、勝敗の表示率を混ぜない。塗りの飛び散り、壁越し、薄い高架の表裏への影響は、実弾と塗り結果を別に検証する。

[minimap.js](../../../inkwave-public/src/game/minimap.js) はXZ投影で最高のsolid topを持ち、paint cellも上に覆われたfaceを避けてひとつだけ採る。下階の塗りや在階の識別を全面的に表示する層切替はここにはない。上階を広く敷けば下階がmap上で隠れる。設計上、上下出入口・落下先が地上視点で読めることが必要。

### カメラ

[cameraRig.js](../../../inkwave-public/src/game/cameraRig.js) の通常pivotはヒト足元+1.85、イカ+1.3、swim+1.15。boomは通常4.5、イカ4.1、probe半径.62、pad=.3、lensに+ .15 WUを加える。near planeは [main.js](../../../inkwave-public/src/main.js) の.15。probeは中心と周囲のrayであり、`raycast` は起点がbox内部ならそのboxを無視する。そのため身体が通る高さでも、pivot/周辺rayが天井内に入ると視点の結果は別になる。短いboomでは肩越し補正も入る。

「ヒトheight=1.45だから頭上2.0で十分」として高架を設計しない。3 WU以上等の設計余裕を持たせても最終保証ではなく、上り下り、見上げ/見下ろし、壁際旋回、チャージ中のscope、ジャンプ、床裏でのaimを確認する。カメラを直す変更を本設計に暗黙で含めない。

### bot・ルール・落下

[nav.js](../../../inkwave-public/src/game/nav.js) は1 WU格子の各XZで複数の高さを持つ。`roof / rail / noNav` の上面を除外し、.32/.8/1.4 WUの高さに半径 `.38+.08=.46` の点リングでclearanceを見る。これは現行イカ半径.675より狭い検査なので、nav nodeが存在してもイカ通行の証明にはならない。隣接歩行は|dy|≤.5、cardinal jumpは上り≤1.25、cardinal dropは下り≤3.4。3.4は隣接nav nodeへ降下edgeを作る閾値であり、Actorが物理的に落下できる最大距離ではない。diagonalには両orthogonalの近い高さのnodeが必要。pruneは辺を無向扱いした最大連結成分であり、一方通行の落下後に帰れることまで保証しない。上層/下層の経路は別途両方向で検査する。

[ranked/stages.mjs](../../../patches/splatoon3/runtime/ranked/stages.mjs) は各mapのzones、tower path、goals、checkpoints、Rainmaker center/retreatZ、clam spawnsを持つ。多くのYは `groundHeight(x,z)` の最高床から決まるため、既存目標の真上に高架を足すと目的階が変わる。既存の2ステージの座標を新しい床へ機械的に流用しない。

[ranked/world.mjs](../../../patches/splatoon3/runtime/ranked/world.mjs) のzone indexは `heightTolerance` 未指定ならInfinityで、同じXZの全turf階を数える。通常stageのzoneは現状center/sizeのみでfloor bandを指定しない。一方でzone得点はセル面積で重み付けする。新案はZoneを上下投影の外へ置くか、必要な高さ帯を明記して実装時に接続する。towerの下記処理にも、上下階と地上coverが影響する。

Towerの標準halfSizeは1.4、runtimeで0.8〜1.4にclampされる。deckの実colliderは **2.8×0.24×2.8 WU**、経路点Yをdeck上面にし、下面はY−0.24。poleは **0.56×2.13×0.56 WU**、Y−0.12〜Y+2.01に達する。deckは経路bearingに合わせてyaw回転するが坂にpitchせず、乗員をdeckのローカルoffsetで運ぶ。したがってground上の足元から高さ8・半径2.5の円柱を置く検査は実体と異なり、支持する坂を誤って障害とする。

`buildTowerPath` はXZを最大1.25 WU間隔に分割し、各点から `1.4×(√2+1)=3.3799 WU` の円内を0.15 WU格子で調べ、**周辺を含む最高groundHeight+0.40**をdeck上面にする。最高床には上階やsolid coverも入り得るため、単純なcenterline floor+0.40と一致しない。低い下階を通す設計でも上の床へ持ち上げられ得る。2.8幅deckの全yawを包むXZ半幅は1.4√2≈1.9799、poleは.28√2≈.3960、deck端のイカ半径まで含む乗員の粗い半幅は1.4√2+.675≈2.6549。これらは別々のY区間で検査し、deck/pole/乗員の連続掃引、角のbearing切替、補間した高さ、下階入口、grate区間を実runtimeで確認する。全yawのAABBは保守的な幾何近似であり、実capsuleや衝突応答の証明ではない。

水面Y=−1.6、通常fallDeathY=−1.45だが、[actor.js](../../../inkwave-public/src/game/actor.js) は低い位置でも `groundHeight(...,pos.y+.6)` があれば水死を避ける。現行KelplineのY=−2 trenchはこの仕組みで安全になる。水色に描くだけでは落水領域にならず、見えない底床を残すと挙動が変わる。落下先の実体床、水死、戻り口を別々に指定する。

## 6. 次のブロックアウトで解消するもの

本監査で確定したのは、入力ファイルに基づく寸法・計算定義・数値と実装上の条件である。新案は、上下に床があるだけでなく、身体の通れる空洞、異なる入口、下りた先の継続経路、戻り道、階ごとの塗りと目標を揃えて初めて多層ルートになる。完成時は同じスクリプトのlayout計測に加え、PropKit込みのlive Level、実Actor、camera、paint、各ruleを使って確認する。

最低限、両陣営、30/60/120Hz、ヒト/イカ、射撃中/泳ぎ/切替、上り/下り、壁際角、grate落下、水際帰還、近/長射程の射線、上階と下階の塗り分離、全rule目標・tower掃引を記録する。これは今ここで実施済みという意味ではない。本家実機と同一の挙動、到達時間、勝率、競技的公平性は未確認のまま残す。
