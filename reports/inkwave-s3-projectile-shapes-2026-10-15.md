# メインウェポンの弾形状（スプラトゥーン3との比較）2026-10-15

対象：シューター全14種（カタログ追加分を含む）、スクリュースロッシャー、エクスプロッシャー、オーバーフロッシャー、シェルター4種、ストリンガー3種、ワイパー3種の **飛行中の弾の見た目** と、途中で落ちるインク。

本家の参照は既存記録と同じ Ver.11.3.0 の数値（Leanny/splat3 `7280ff9c`）。映像は収録バージョンが揃っていない（下記）。**見た目のシルエットを映像に合わせたものであり、任天堂のメッシュ・シェーダー・描画半径の抽出値ではない。**

## 見た本家の資料

公式映像は 60fps で1フレームずつ抽出し、横・後方・前方・俯瞰に近い場面を選んで比較した。任天堂の映像フレームはリポジトリに入れていない。

| ブキ | 資料 | 見た場面 |
|---|---|---|
| スプラシューター | Inkipedia `S3 About videos 05 - Splattershot.mp4`（任天堂公式サイトの紹介動画、1280×720 60fps） | 2.6–4.4 s の真横・斜め後方。発射後2–8フレーム |
| パラシェルター | `S3 About videos 04 - Splat Brella.mp4` | 1.45–1.65 s の真横（散弾の展開） |
| トライストリンガー | `S3 About videos 03 - Tri-Stringer.mp4` | 1.6–2.0 s（空中撃ち、カメラ方向へ飛ぶ矢） |
| ワイパー | Inkipedia `S3 Splatana Wiper promotional screenshot.jpg`（任天堂公式 1920×1080） / `S3 Mint Decavitator demonstration English.mp4` / Bilibili BV1z84y167yQ（試し撃ち場、後方視点） | タメ縦斬りの斬撃弾を真横から |
| オーバーフロッシャー | Bilibili BV1mg411z7om（試し撃ち場、後方視点 30fps） | 18.6–19.4 s。泡が近距離で4つ並ぶ場面 |
| エクスプロッシャー | Bilibili BV1zW4y1e7de（試し撃ち場、後方視点） | 34–37 s。飛行・落下インク・爆発 |
| スクリュースロッシャー | Bilibili BV15N411h7Ke（対戦映像） | 6–14 s, 72–74 s。試し撃ち場の鮮明な映像は取得できなかった |
| 落ちるインク | 上記スプラシューター紹介動画 | 着弾前に落ちる飛沫 |

YouTube はこの環境からの取得がボット判定で拒否されたため、Inkipedia 掲載の任天堂公式ファイルと Bilibili を使った。

## 本家の形状と INKWAVE の差分（変更前 → 変更後）

| ブキ | 本家で見えた形状 | 変更前の INKWAVE | 変更後 |
|---|---|---|---|
| シューター | 1本の長い滑らかな棒。先端はやや太い丸い頭、後方へ細くなる。銃口と繋がっている間（約2–4F）は後端が平たいギザギザの膜に裂ける | 初代 Splatoon（SplatoonSWEPs）の照準ライン画像を立体化した一定太さのパイプ（ink-volume） | 丸い頭＋後方に細る棒。尾の長さは既存の MaxLengthFrame（既定2F）。発射後4F以内は尾が裂ける。全シューター共通の幅（描画半径は非公開のため校正値） |
| 途中で落ちるインク | 丸い粒（落下方向にやや伸びる） | 平たくトゲのある破片（幅2.2倍） | 丸い粒（トゲ0.12、断面0.9、幅1.5倍） |
| シェルター | 銃口から円錐状に広がる、両端が尖った細い紡錘形の筋 | 両端が丸い太いソーセージ | 頭が尖り後方へ細る紡錘形。長さは1.5F分の移動距離、半径はプレイヤー当たり判定×0.5。減速して筋が半径3個分より短くなると丸い滴になる |
| ストリンガー | 非常に細い針状の矢、小さく尖った頭 | シューターと同じ太いパイプ | 細い針（頭は当たり判定×0.36、軸は頭の半分）。刺さった爆発矢は短い矢として残す |
| ワイパー | 厚みのある艶のある三日月形の板。中央が先行し両端が遅れる。タメ縦斬りは縦に立ち、通常の横斬りは寝る | 細い棒 | 三日月板。幅・反りは `BulletSaber*Param.CollisionParam` の Offset/Radius（横：半幅1.32・両端の遅れ0.2、縦：半幅1.95）。縦の反り0.6・前後幅0.8はスクリーンショットに合わせた校正値。出現3Fで拡大、寿命の終わり30%で薄くなる |
| オーバーフロッシャー | 透明なシャボン玉の中に、小さいインク玉が入っている。周囲に小さな空の泡 | 不透明なインク玉 | 透明な泡（縁が光る薄膜）＋半径0.58倍のインク核＋発射直後の小さな空の泡3個。泡の半径は既存の DrawSizeParam と跳ね返り0.75倍 |
| エクスプロッシャー | 形の揃わない艶のあるインクの塊の周りに白いキラキラ。飛行中に下へインクを落とす | 平たい長い水滴（スロッシャーのシート） | ゆがんだ塊（半径0.3）＋白い光点16個。途中の飛沫7個を実際に落下させる（下記） |
| スクリュースロッシャー | インクの塊の後ろに、螺旋状に回る飛沫の列 | 描画半径0.1でほぼ見えない | 半径0.2の塊＋2本の螺旋（各7粒、毎秒24rad で回転）。DrawSize 0 の第2ユニットは描かない |

## ゲームロジックの変更（2件）

### ワイパーのタメ縦斬りが出ていなかった

実ゲームでタメ縦斬りの斬撃弾が **1フレーム目に床へ当たって消え、表示されていなかった**。弾を銃口（足元から約1m）で生成していたが、縦斬りの当たり判定（`BulletSaberVerticalParam.CollisionParam`）は中心から上下 ±1.6 に並ぶため、下側が床に埋まっていた。本家の `SwingParam.ShotBulletOffset_Vertical`（プレイヤー基準 Y 2.2、Z 0.8）から生成するように直した。横斬りは従来どおり銃口から生成しており、本家の `ShotBulletOffset_L/R`（Y 1.0、Z 1.4）との位置差は未修正の差分として残す。単体の試験環境は床がなく、この不具合を検出できていなかった（床面を入れた試験を追加し、修正前に失敗することを確認）。

### スロッシャーの飛行中の飛沫

カタログのスロッシャー（スクリュー・エクスプロッシャー・オーバーフロッシャー）は、飛行中の飛沫を **弾の真下へ即座に塗る** 処理だった。これを、既存の 60Hz 落下キュー（`spawnSplashDrop`、ネイティブのスロッシャーで PR1188 が使っているもの）へ流し、実際に落ちて着地点を塗るようにした。

- 個数・間隔・塗り半径は変更なし（`SplashAndSplashWallHitSpawnPrm` の SpawnNum / SpawnBetweenLength / PaintWidthHalf）。深さは同じ資料の PaintDepthScale。
- 落下の重力・空気抵抗は PR1188 と同じモデル値（0.016 DU/F²、0.02）。本家の値ではない。
- 落下する粒の大きさは同資料の DrawRadius（エクスプロッシャー0.1、スクリュー・オーバーフロッシャー0.2）。
- 本家のスクリュー・オーバーフロッシャーの飛沫はプレイヤーに当たり判定がある（EndRadiusForPlayer > 0）。INKWAVE は従来どおりダメージなし。**未実装の差分として残す。**

## 実装

- `patches/splatoon3/runtime/s3-projectile-shapes.mjs`：形状の判定と描画。弾の位置・速度・寿命・当たり・塗り・通信は読むだけ。
- `patches/splatoon3/weapons-adapter.mjs`：既存の汎用水滴と追従粒を、上記の弾では描かない。塊・螺旋の粒は既存の水滴メッシュへ追加する。
- `patches/local-quality/ink-volume/recipes.mjs`：シューターを ink-volume のパイプから外す。マニューバー・スピナーは従来どおり。
- `patches/splatoon3/runtime/weapons-fidelity.mjs`, `projectile-presentation.mjs`：落ちるインクを丸い粒に。
- `patches/splatoon3/runtime/main-weapon-catalog.mjs`：上記の落下飛沫、タメ縦斬りの生成位置、描画の組み込み。

重さ：専用の InstancedMesh 5個と Points 1個。弾がないときは非表示で描画されない。頂点はシューター類 15×26、斬撃 29×12、泡 25×17、泡の核 21×15。テクスチャ・ポストエフェクト・新しい WebGL 拡張は追加していない。棒と泡はシェーダーで変形するため、GTAO の上書きパスと影から外した（ネイティブのチャージャー光線と同じ扱い）。シューターの ink-volume パイプが無くなる分、シューター1発あたりの描画は軽くなる。

## 確認したこと・していないこと

![INKWAVE 実ゲームの描画（望遠、60Hz固定で発射後数フレーム）](assets/inkwave-s3-projectile-shapes-game-2026-10-15.webp)

![形状単体（横・斜め・前・上）](assets/inkwave-s3-projectile-shapes-studio-2026-10-15.webp)

- パッチ全体の試験：5678件中 失敗0、既存のスキップ24（`scripts/check-inkwave-patches.mjs`）。最終コードで弾・カタログ・スロッシャー・ink-volume 関連49ファイル437件を再実行し、失敗0。

- 新しい試験 `patches/splatoon3/tests/s3-projectile-shapes.test.mjs`：実際の Actor → WeaponRunner → Projectiles で全11条件（シューター3、シェルター、ストリンガー2、ワイパー横・縦、スクリュー、エクスプロッシャー、オーバーフロッシャー）を発射し、形状の分類、専用メッシュの数、汎用水滴を描かないこと、描画で状態が変わらないこと、対象外のブキを取らないこと、プールの再利用、斬撃の幅と反り、タメ縦斬りの生成高さと床での生存を確認。
- 実際にビルドしたゲームを Chromium（SwiftShader）で起動し、試し撃ち場で実入力の発射を 60Hz で進め、横・斜め・前・上・望遠の各角度で描画した（`scripts/render-inkwave-projectile-shapes.mjs`）。形状単体は `scripts/render-inkwave-shape-studio.mjs`。
- **未確認**：本家の描画半径・尾の長さ・回転速度・光点数などの数値。映像からの目視校正であり、実機の同条件比較ではない。スクリュースロッシャーは鮮明な試し撃ち映像がない。iPad/スマートフォン実機の負荷。異なるフレーム間隔での見た目は、描画が毎フレーム現在の状態だけから決まる（時間積分を持たない）ため、ロジック側の 60Hz 固定更新に従う。

## 再現

```sh
npm install --no-save --no-package-lock esbuild@0.28.2 playwright@1.62.1 meshoptimizer@1.3.0
node scripts/build-inkwave.mjs inkwave-public .built-site/shapes
node scripts/render-inkwave-projectile-shapes.mjs .built-site/shapes <出力先>          # 実ゲーム、10条件×複数角度
VIEWS=wide,tele-side,tele-oblique,tele-back node scripts/render-inkwave-projectile-shapes.mjs .built-site/shapes <出力先> shooter
node scripts/render-inkwave-shape-studio.mjs .built-site/shapes <出力.png>            # 形状単体
node --experimental-vm-modules --test patches/splatoon3/tests/s3-projectile-shapes.test.mjs
```
