# MAP3 実ランタイム美術・可読性の独立レビュー

日付: 2026-10-31 UTC。対象: 通常公開ステージ Tidewater Plaza / Kelpline Terminal。参照元と観察範囲は [art-reference-observations.md](art-reference-observations.md) に記録する。

## 判定と実施範囲

**初回の実ランタイム画像12枚を画素で確認し、美術の完成判定を「要修正」とした。** 地形は多層化されているが、同じ装飾箱の反復、孤立した遠景の小島、広い床の強い模様により、依頼された完成ステージとして物体の用途・生活感・構造の説得力が不足する。rootとstage_artへ修正を送付した。改訂版は別の節で判定し、初回の問題を無根拠に解消済みとしない。

初回画像の入力は `/workspace/scratch/aa397237a07c/map3-captures/`。各stageで `overview / marketまたはterminal / underpass / bridgeまたはgantry / spawn-a / spawn-b` の6枚。設計用blockoutではなく、実ランタイムのカメラを所定位置へ置いた画像である。ただしレターボックスがあり、spawnの4枚ではintroの発射装置が大きく残る。**通常プレイヤーカメラとしての合格記録にはしない。** 塗りが広がった実戦状態も含まれない。画像入力はこのセッションの検査用ファイルであり、本書だけで画像を恒久同梱したとはしない。

## ビュー別の観察

| 画像 | 直接確認した状態 | 限界・再撮影 |
|---|---|---|
| Tidewater overview | 水の欠け、複数の床高、中央と外周の分離は見える。外部の屋台とアーチ橋が個別の小島に分断される | 到達可能性・操作・公平性は確認しない |
| Tidewater market | 広いタイル床・木床・坂が分かれる。一方ほぼ全遮蔽が同じクリーム色と青緑の箱 | marketという用途を読める内部物体が足りない |
| Tidewater underpass | 橋下面と側面の細い桁装飾が見える | 主に坂を見上げる画角で、低路入口から出口への連続した見えは未確認 |
| Tidewater bridge | 橋床・格子・下床が分かれ、遠景との遮蔽も少ない | 橋は平板と細い縁が中心。装飾が構造の輪郭を変えていない |
| Tidewater spawn-a/b | introの発射装置と正面壁が画面の大部分を覆う | intro終了後に通常cameraで再撮影する |
| Kelpline overview / terminal | 上路の大きな床と下路、局所的な貨物色は見える | 長い淡色デッキと小型箱の反復が中心で、港の動線・機能を読めない |
| Kelpline underpass | 上下の空洞と連続する下床は見える | 天井は床と同じ大きな黒点模様。青い影の下路は用途・出口の目印が乏しい |
| Kelpline gantry | 貨物箱の縦リブ・枠は別物体として読める | 近接箱が画面右の大部分を覆い、橋側面・出口の全体を確認できない |
| Kelpline spawn-a/b | intro状態。中央の長い淡色デッキが見える | 通常cameraは未確認 |
| 塗りのある対戦状態 | 今回の12枚にはない | 人物、弾、インク、UIと装飾の優先順位を別に確認する |

## 優先修正

### 1. 外部建築を街・港としてつなぐ

Tidewaterの独立した小台座上の屋台と、両端に行き先のないアーチ橋は、機能する市場より模型の展示に見える。Kelplineのターミナル棟と門も孤立した台座で終わる。同じ部品を増やすのでなく、arenaから明確な運河を隔てた連続する岸壁、商店の軒、荷役設備、建物の奥行きへつなぐ。景観の橋には陸地・建物という終点を持たせる。可遊床に似た行き止まり足場を境界のすぐ外へ置くと到達可能性を誤読させる。

### 2. 遮蔽を用途のある物体へ分ける

Tidewaterはほぼ全ての遮蔽がクリーム色の箱、青緑の縁、小さい茶色の四角列で、低いものと高いものの用途が読めない。Kelplineも白いキャビネットが反復し、少数の橙色貨物箱だけが明確に別の物として読める。

Tidewaterには閉店中の売店カウンターと庇、保守キャビネット、荷箱のまとまり、低い腰掛け・植栽基壇を別のシルエットで作る。Kelplineには発電・換気設備、段積み荷物、保守端末、ドック器具などの用途を分ける。既存の高さと遮蔽の役割を優先し、立てる低いcover上面を装飾で一律に失わせない。既存範囲を超える実体は描画とcolliderを同じ定義から作り、経路・camera・towerを再検証する。

### 3. プレイ域から見える建築的な目印を作る

現状、個性のあるアーチや大きい庇はarenaの外にあり、実プレイ域は空の台と小箱に見える。既存coverの位置を支点にする市場の庇、橋の入口門、荷役用の梁などを局所的に作り、渡る方向と施設の用途を伝える。中央全域を覆う大屋根ではなく、選んだ橋端・市場端に特徴を置く。上方を使う場合もtower・乗員・cameraの実際の掃引範囲を避ける。

### 4. 上面・下面・斜面を別の構造として表す

Tidewaterの橋下面は上面と似た長い木目帯。Kelplineの天井はデッキ上面と同じ黒点の反復で、下路画像の上半分を大きく占める。支持梁、横桁、パネル継ぎ目の向き、濃い側面と淡い上面を分け、構造を示す。同じ模様を暗くするだけでは不足する。slabの下へ桁を増やす場合はclearanceの減少を実測する。

両stageの坂は横縞が強く、連続した坂より階段列に見える。Tidewaterの全坂へ同じ石段模様を使うこと、Kelplineの全坂へ密な黄線を敷くことを弱める。静かな面と端の少量の滑り止め・安全線で方向を示す。Kelpline中央の大きな黒点の総反復は、粗い鋼板パネルと限定した接合金物へ置き換える。

### 5. 通常状態の実ビューを追加する

intro終了後の両spawn、Tidewater低路入口から出口、Kelpline gantryの全体、同じ地点で人物とインクが存在する実戦を追加する。旧spawn画像に発射装置が大きく写ることだけで通常カメラの破綻とは断定しない。

## 統合時に発見した具体的な重なり

Environment._buildDockの標準船はlayout.envBoatsがfalseでなければ追加される。Tidewaterの釣船の設定XZ `(45.25, 38.88)` は、新しい屋台基壇 `(49,40)` の範囲 `44.5..53.5 × 35.5..44.5` と重なる。反対側の小艇も屋台付近に来る。これはコード座標で見つけた問題で、rootとstage_artへ `envBoats:false` または意図した再配置を依頼した。無関係な通常stageへの適用は求めていない。

## 検証の区分

map3-art.jsはMAP3の床・障害物レコードから装飾を作る。初版は小さな面枠・金具・薄い素材帯を主とし、床側面の桁も既存slab厚の中へ収めていた。この方針はclearance維持に役立つが、完成美術として十分なシルエットを作れなかった。今後の大きな追加物は見た目の改善とcollisionの整合を両方検証する。

ブラウザ静止画は外観・可読性の証拠。操作、camera追従、イカの格子通過、武器射線、塗り分離、対戦公平性には、それぞれの実操作・runtime測定が必要。商用相当の品質も、単一解像度の数枚だけで全端末・全ルールまで保証しない。

## 初回入力の識別

両stage12枚のSHA256を記録する。再撮影で同じファイル名が上書きされた場合、初回の判定と混ぜない。

| ファイル | SHA256 |
|---|---|
| tidewater-overview.png | a2fcf4b2335ef4fdacc37f484c8d3f39e603d26f7a06624a2daf1f67851550b8 |
| tidewater-market.png | 3d9777559c300a716c66098cab247d88b85702e7b67c1d47436389585eff3fe2 |
| tidewater-underpass.png | f51415995ac6b21eba165bed511191ef9172a0a0df9049a3feb0fd72af40ca33 |
| tidewater-bridge.png | 34e1d51eefce696e72da88ec00252f4420cb4e49b3aea1b3799896a57d8f6da9 |
| tidewater-spawn-a.png | 8d49e6325cccd748073d8a7e7e4b46697f424d02a4ef67355cab7d89344e14b2 |
| tidewater-spawn-b.png | 93234e47c686cf56a6e32eb0696fcd07e13347a4fb0247a46d9a0291930b7c98 |
| kelpline-gantry.png | 7e380c1e46fece2e4107fdfd12eb3a2873eb6d49143db9a285dd2d3e35dd5604 |
| kelpline-overview.png | fb9834cb09a2148cc898d1c7580a827fc16ce4bd6609d0425f4458997d490b8c |
| kelpline-spawn-a.png | a5c77128442ff4453f79d433a190bff7a5fc26bc2a63502e4672cea08d57baf1 |
| kelpline-spawn-b.png | e2cb32161cbdcc9571408c80d5a4c3e6d6de5e933b286bca96cc8194377c183c |
| kelpline-terminal.png | d05aea78889befe38f79d75b387e8c565ba16365cb016434961abc80ea147906 |
| kelpline-underpass.png | 2ae03030cef766b1bd1985ce29bfae0f9bf2d7f2f5ddeb45fdf978662ef47caa |

## 第2回: Tidewater改訂画像6枚

初回と同じ名前で上書きされたTidewater画像6枚を再視認した。rootは実ゲームをplaying状態まで進めたと報告し、画像でもintroの発射装置は消えている。ただしcameraは手動の検査位置、HUDなし。通常の追従camera・実戦の可読性の検証とは区別する。

**初回の主要な美術問題は明確に改善した。** 店の庇、換気設備、荷物、低い植栽が別の用途の物体として読める。坂は横縞の階段状から連続した斜面へ変わった。外部の屋台と建物が連続する岸壁へ接続され、運河を挟んだ市街として読める。橋下面は上面と異なる暗い構造の区画になり、新しいunderpass画像では出口の明るさと床の継続を確認できた。

残る優先度の高い美術課題は、**実際に通る橋自体の輪郭が広い木板のままで、特徴のあるアーチが主に景観側にあること**。最後の限定した追加として、2本の市場橋の長辺に細い青緑のアーチリブを置く案をrootへ推奨した。端の出入口と既定の降下口は開け、全面屋根や密な柵にしない。リブの高さ2.5〜3 WU程度は視覚上の開始案であり、正式な可通・跳躍・cameraの保証ではない。描画する部材の衝突、ルート幅、towerの範囲は別途確認する。

これ以上の小物の一律追加、背景建物の背面へ大量の窓を付ける作業より、プレイ域の橋のシルエットを優先する。背景ののっぺりした背面は主に俯瞰で目立ち、今回の主要プレイ方向の課題ではない。市場・街路の独自性は初回より増したが、これだけで商用相当・全ルール完成と断定しない。

第2回入力SHA256:

| ファイル | SHA256 |
|---|---|
| tidewater-bridge.png | c79cae3b0d02da889bb46b672b810ea0e32970ea7d5aef59f4d2edb698a94a96 |
| tidewater-market.png | 79d8764f5ae9a7159c5c76296e52cc248965ba2f31b1f5232ef3f2bcab6f6f75 |
| tidewater-overview.png | 8626ded4c18b8ac52da046924b4ac93f2f2f5275e67b5e3dd99df6dc7f9dcf01 |
| tidewater-spawn-a.png | b9741d2b37ea5eb435bca25b67d609f9d03ff6ae97a6cae2d5f582dc3352b124 |
| tidewater-spawn-b.png | 606e62d7e86bf94fbffbb5193375ea5943a4098442a74e9d8692519b3d2fddc2 |
| tidewater-underpass.png | 6d3c7a649fb3401c6897703389e7a8b3179cc2ea613ca0adfc33d31f2bb3f475 |

この時点の読み取り対象コードSHA256:

- `inkwave-public/src/world/stages/map3-art.js`: `044eb6bd53d82755391211d2de295d83194c2de4e769deda61e2e2770ba0c3ae`
- `inkwave-public/src/world/stages/map3-layout.js`: `3f8170dcc8b8faaa92572ca156bdd31a9cf56eadca1e8895d1db7e3284f4862a`

## 第2回: Kelpline改訂画像6枚

Kelplineの上書きされた6枚も再視認した。introの発射装置はなく、以前のgantry画像で大部分を隠していた近接箱は画面の左端に退き、上路・格子・次の床へ向かう見通しを確認できる。これも手動camera、HUDなしの美術検査である。

黒点の全面反復が消え、床は静かな大判パネルとして読める。下路の天井は暗い区画と桁の線になり、床上の保守箱には換気口とファン、貨物には段積みのシルエット、サービス台には透明な庇が加わった。初回の同じ小箱の反復は改善した。下路は青い影が強いが、現画像では床縁と物体の輪郭を区別できる。人物・敵インクを含む実戦でも十分かは未確認。

残る大きな課題は、Tidewaterと似た外部建物列に囲まれ、中央が広い水平なホールと小型家具だけに見えること。最後の限定した追加として、実プレイ域の中央高路へ**濃い鋼材の門型桁を一つ**置くことを推奨した。支持は既存の端部遮蔽とまとめ、上桁と少量の黄土色の斜材を両spawnから認識できる形にする。Tidewaterの細い曲線リブと対比する独自の目印が目的であり、全面の屋根や追加家具の散布は求めない。

上桁をworld Y≥8へ置く案は視覚案の開始点として扱う。実tower/乗員/actor/cameraの掃引、柱の通路への張り出し、落下口と格子の意味は別のruntime検査で確認する。最終画像と実操作確認前に合格扱いしない。

第2回入力SHA256:

| ファイル | SHA256 |
|---|---|
| kelpline-gantry.png | 0c9690448867bf45d6094a6527520632eff67a9b867697c7e778af68185cfe6b |
| kelpline-overview.png | 1fdc5131cd474daa8fbf9c029e6b349534d7c6f50da51469ee021760415c1dcf |
| kelpline-spawn-a.png | 9ceee472b4a692c75053f639fa3d7ba602dd1f728d4c49def7f9a9a3615fbb69 |
| kelpline-spawn-b.png | b4249cc1dbf48a00278cbb48ce08fbd41e290e03c886d2aff710bbdafa067c61 |
| kelpline-terminal.png | d0a8990897232e95e981a4296ee94e85f2e57d74c9c48d6a046d84831a8973bd |
| kelpline-underpass.png | 49314aba9aea7160dcec24a65ea91ce8c4c2a037dd076a6dfbf39a62ace30423 |

## 最終美術パス: 公開用minified productionの実フレーム

**撮影された通常cameraでの可読性と、橋・物体の美術構成は限定付きで合格とする。今回の作業でさらに小物や背景を増やす必要はない。** 初回の「要修正」は履歴として維持する。市場のアーチ、端末港の門型桁、用途の異なる遮蔽、連続する外部岸壁、静かな床と暗い構造下面により、初回の主要な問題が改善した。商用ゲーム全体と同等の品質、全色・全端末・人間同士の対戦公平性を保証する判定ではない。

### 入力と撮影条件

画像はこの文書と同じrepositoryの `runtime-evidence/` に収録する。[browser-validation.json](runtime-evidence/browser-validation.json) は今回の検査時点で `status: passed`、runtime errorsとHTTP失敗は空配列だった。対応する手順は `scripts/check-inkwave-map3-browser.mjs`。Chromium / SwiftShader、1440×900、DPR 1のminified productionを起動し、通常のmatch開始と `Game._frame` を進めて `playing` を得ている。setup用teleportとbot停止は条件を固定するために使用した。通常camera撮影のactor位置が、spawnからの無介入移動で到達した証拠という意味ではない。

`play` の2枚は通常追従camera、実際の発射入力後の塗り、画面上のHUDを画素で確認した。`bridge` と `dusk` は構造を検査する手動camera、HUDなし。`underpass` の2枚は通常追従cameraだが、初回の最終exportは前の手動撮影からHUD非表示が残り、画像にはtimer・minimapが写らなかった。JSONの `hud:true` と矛盾するためrootへ報告し、HUD復帰と実DOM表示状態の記録を修正中。この画像をHUDの視認性や下層minimap表示の画素証拠とはしない。下層cameraの位置と地形描画は確認できる。再exportがあれば後段へ追記し、この不一致を削除して隠さない。

### 画素による判定

| 入力 | 実際に見えた結果 | 判定の範囲 |
|---|---|---|
| [Tidewater play](runtime-evidence/tidewater-play.jpg) | 広いmagentaの塗りが静かな灰色の床から明確に分かれる。playerの暗い服・腕・足の輪郭、中央の坂、cream/tealの遮蔽、水の欠けを区別できる。照準・timer・weapon HUD・minimapも見える | この位置・自色の通常追従cameraで、装飾が照準や進路を隠していない。髪と自インクは近い色だが身体と影が分離する。敵色が混ざる交戦ではない |
| [Tidewater bridge](runtime-evidence/tidewater-bridge.jpg) | 実プレイ橋の長辺に細い青緑のアーチが加わり、広い木板だった経路自体が目印になる。両端の開口、下路、周囲の売店や植栽、岸壁がそれぞれ読める | 景観だけに目印がある問題を改善。静止画からリブの衝突精度や全武器の射線は判定しない |
| [Tidewater underpass](runtime-evidence/tidewater-underpass.jpg) | 暗い橋下面が桁と区画に分かれ、左の坂・正面の明るい出口・下路床の縁・水・支柱を区別できる。player全体も見える | 開口を塞ぐ装飾や、歩行面と同じ見えの天井は認めない。HUD非表示の初回exportなので下層UIの画素判定は保留 |
| [Kelpline play](runtime-evidence/kelpline-play.jpg) | 薄い床継ぎ目と灰色の面にmagentaの塗りが明確に載り、照準・ink tank・playerの身体が読める。門型桁の影は横切るが、低い保守箱と前方の坂・床縁を隠さない | この撮影位置で射撃方向の見通しを維持。小さな遠方の人物を含むが、近距離の敵味方が混ざる視認試験ではない |
| [Kelpline bridge](runtime-evidence/kelpline-bridge.jpg) | 中央高路に濃い鋼材の門型桁が立ち、Tidewaterの曲線橋と異なる工業的な目印になる。支持は端部の保守箱とまとまり、全面屋根や密な柵でcourtを覆わない | terminal / cargo / machineryの物体用途が区別できる。奥の建物は簡素だが、追加の美術作業より実戦検証を優先する |
| [Kelpline underpass](runtime-evidence/kelpline-underpass.jpg) | 天井が画面上半分を占める低路の追従cameraでも、床継ぎ目、横の出口、保守箱の輪郭、playerの髪と上半身を区別できる。最も暗い保守箱前面はcontrastが低い | 低路空間は読めるが、敵色・弾・多数のactorを含む視認性は未検証。HUD非表示の初回exportという制約もある |
| [Tidewater dusk](runtime-evidence/tidewater-dusk.jpg) / [Kelpline dusk](runtime-evidence/kelpline-dusk.jpg) | 暖色の上面と青い影の下路に分かれ、橋の曲線と門型桁の輪郭、通路の淡い縁は保たれる | 手動cameraでの素材と輪郭の検査。下路の青い影は深く、夕景の敵色視認性や人間の対戦を合格にする証拠ではない |

### 実行記録との対応

実行記録では、通常の発射入力後にteam 0のpaint cellがTidewaterで0→514、Kelplineで0→518となり、画像にも実際の自色の塗りが見える。minimapの内部layerは両stageで下路setup後に `lower` へ変わっている。**この内部layer確認と、HUDに下層の塗りが正しく見えることは別の証拠**として扱う。初回のplay画像のminimapは地形とplayer位置を読めるが、縮小された塗りの一致や上下層の塗り分離まで画素から断定しない。

同じ記録は各stageのzones / tower / rainmaker / clamsを `playing` まで起動し、対応するobjective group、同stage切替時の美術再利用、stage交換時の旧group切離しとgeometry/material各6個のdisposeを検査している。これは起動・lifecycleの検査であり、目標物の全経路完走、全対戦局面、人間同士の公平性という意味には拡張しない。

描画記録はplay時Tidewater 155 calls / 819,693 triangles、Kelpline 168 calls / 835,985 triangles。美術group単体はそれぞれ6 drawsで、総画面の負荷とは区別する。SwiftShaderのこの記録は物理端末のFPS・発熱・長時間memoryの保証ではない。

### 残る明示的な検証範囲

- 両軍の塗り、弾、近距離の敵味方が同時にある通常の交戦、特に青い影の深い下路と夕景。
- 複数のink palette、異なる画面比率・解像度、物理端末での継続的なframe time。
- 全ての武器・移動形態・objective移動と橋/門/格子/canopyの接触。今回の美術静止画はrootのgeometry/route検査を代替しない。
- 通常spawnからの両陣営の継続的な移動・視認と、人間同士の公平性。今回のfinal playはsetup地点の撮影である。

これらを未実施のまま「Splatoon 3と同等」「全モードで商用品質を実証」とは表現しない。今回の証拠に基づく結論は、**初回の一様な箱・孤立した景観・模様過多から、固有の橋と用途のある物体を持ち、撮影した通常cameraでインクと人物を識別できる公開用ステージへ改善した**、である。

### 最終入力の識別（HUD再export前の検査記録）

- buildRevision: `e00c02d506eb3a45dcf9660392f212cae1d7b0e61ff9bf486b7b36c1906707f0`
- contentHash: `8c405a1c04244585af42c72a7b6e0196417706c615051935f5a2ba6340a85761`
- buildManifestSha256: `e588d963a9fc3706a1c19eca3dbae48d472ca2aa5caa7b7f36c5b26685737c0a`

| 画素確認したファイル | SHA256 |
|---|---|
| tidewater-play.jpg | `f7bff08e97e7510731dc088b0d5e5fff197a311c1343ca35f3135b4bc7d767f9` |
| tidewater-bridge.jpg | `6b83592af0055c352a711f4fde271d96604d9ac3331f4fba423fabf21ffae7da` |
| tidewater-underpass.jpg | `0354bdc484686fc7a392b965a6e3a169e8cc9d0ee9013abefad8a71f7f7c5762` |
| kelpline-play.jpg | `20100fe3749b3625471a84a5ff5462c2819eff767f2c24cd9e40303108f56e95` |
| kelpline-bridge.jpg | `0b047431edc2b47255e3a3f320042ddf530acaf8d7128a183fcddd90694027e1` |
| kelpline-underpass.jpg | `a06b8be07309df756f22c47f62293fed666e55f761af4ce207c3e4ed79e6c698` |
| tidewater-dusk.jpg | `5fcdaa4798b6d7f56932df2353ba506481d174f5e69ed65a3ad8170ec83f3b79` |
| kelpline-dusk.jpg | `75b4627585b25afc178b9130266703e9c8e5211742f4bfda434a0ef260fef4e4` |

## 最終再build確認: exact PR source・HUD export修正済み

公開PRの正確なsourceを復元して再buildした最終成果物について、両stageの `play` と `underpass` 計4枚を改めて画素確認した。前節のmagenta画像と数値は旧buildの検査履歴であり、現在の画像・build識別は本節を優先する。最終 [browser-validation.json](runtime-evidence/browser-validation.json) は `passed`、runtime errors / HTTP失敗は0。4枚すべて通常追従camera、`playing`、実DOM表示確認の `hudObserved:true` である。

**前回のHUD export不一致は解消した。** 両underpassの画素にtimer、両軍のweapon表示、special gauge、score、照準、ink tank、minimapが実際に写り、JSONとも一致する。下路の内部layerも両方 `lower`。これはHUD復帰と下路UI表示の確認であり、全ての上下層の塗りをminimapへ正確に投影することの網羅検査には拡張しない。

今回の自色はTidewaterがorange、Kelplineがlime green。両playで実際の塗りが灰色の歩行面から明確に分かれ、playerの身体、照準、進路の縁、水、遮蔽を識別できる。Tidewater下路は暗い橋下面と明るい出口、床縁、水、支柱が分かれる。Kelpline下路は天井が上半分を占めるが、floor / 保守箱 / 出口 / player / HUDの輪郭を維持する。前回と同様、最も暗い保守箱前面のcontrastと、夕景・敵色を含む近距離交戦は別の確認範囲に残る。

**撮影された通常cameraでの可読性について、限定付き合格を維持する。新たな美術修正は要求しない。** 今回の4枚に、塗りやactorを覆う装飾、HUDの消失、下路の出口を塞ぐ構造は見られない。bot停止・setup teleport・SwiftShaderという条件と、人間同士の交戦・全palette・物理端末性能を未保証とする前節の限界は維持する。最終play描画記録はTidewater 155 calls / 781,715 triangles、Kelpline 150 calls / 808,763 trianglesで、前節の旧build数値を現buildの計測として引用しない。

- buildRevision: `1b75e184d1476e82bf70e77ef7b2300269b11c73e9b3278bd3e22ad5f1202431`
- contentHash: `a3be056cf58eb0ed6b827994cc68143f6956e093c549f9c7807cf9aa1017c2b2`
- buildManifestSha256: `af956398f0d17ac9dee70803c18a5fa5107913502104ecaf0ee3b202ce121ab7`

| 再視認・実bytes照合した最終画像 | SHA256 |
|---|---|
| [tidewater-play.jpg](runtime-evidence/tidewater-play.jpg) | `b3ea56ead47494a7953ca243f704afd2538ffa8daf1ee916df38925aed84bfa6` |
| [tidewater-underpass.jpg](runtime-evidence/tidewater-underpass.jpg) | `16193e9d8c58c118b3badbc35d3cb685ad460ecde36eb5f3490d3e4076690bbf` |
| [kelpline-play.jpg](runtime-evidence/kelpline-play.jpg) | `3b47f1f864aa5966d96f73e1dc4f1dc07b94dd726272c83a43108295e3037641` |
| [kelpline-underpass.jpg](runtime-evidence/kelpline-underpass.jpg) | `3d395b3a03d955a45f723f8a9ad01eb49f4bf76febc373de677f4b928f32c03d` |
