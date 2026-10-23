# Triple Splashdown: frozen SPLASHDOWN5 arch A/B

2026-10-23。結論は **現 hash の採用保留（未受入）**。元 SHOCK の直立した冠から外向きに曲がる形へ変わり、棄却済み TWISTER の周期的な螺旋や不透明な終端 pop は再現しなかった。一方、+10〜18 tick は幅の広い滑らかなリボン／花弁に見え、自然に崩れる液体の筋としての改善を十分に確認できない。+22〜26 tick には本体が急速に減り、薄い残りが atan の継ぎ目へ偏る。コードは追加修正せず、原案のまま比較を終了した。

代表画像は [通常追従カメラ A/B](paired-spread.png)、[追加の +18/+22/+24/+26](candidate-fade-18-22-24-26.png)、[通常画面の継ぎ目付近の切り抜き](normal-seam-area-crop.png)。後者では薄い線が残るが、通常のピンクの背景では目立ちにくい。検査表示の白い線の強さを通常画面の不透明度と解釈しないこと。

## 固定した候補と範囲

基準実装は `8437516cebd527e033711631174c4a711083aa26`。未変更の私有コピーに親指定の 2-file patch のみ適用した。公開するこの commit は報告と自作ゲーム画像のみ。公開 runtime は基準実装のままで、候補は未採用。元 SHOCK、旧 TWISTER の失敗記録も保持している。

| SHA256 | before | after |
| --- | --- | --- |
| `special-vfx.mjs` | `6f8a4b63fc09553392cd6adeeeb10189c56b55f3bbdd24808eda4263807afbcb` | `d825798b9cb19dd14a317eb62bb9d33c62fe222a0ef966eb8fb45a30d1150912` |
| `special-vfx-kit.mjs` | `8c1dd55a8aad05c19df6b3a1f173ddfdbe2ad8eb7f8c579c3d47219f871e0630` | `7d1be7d84e249d9d0b4929661861fe15f95ad8547d78edbd38c1a47282460e0f` |

Patch SHA256 は `535b249ce3cb5569aebbaf7c234dde92b1c41f5599621b90fe9edd6992ac95c2` と一致。[source-proof.json](source-proof.json) と [build-identities.json](build-identities.json) に両版の identity を記録した。候補 build revision は `d6c6ea04a0f02e1e81a385523cd2c6f83c397ae567438581460ecb31553cf508`、content hash は `b6708cb06d7854b3e519064f68e93089e5209661fb6fd75d707e866f98c067a0`。候補の証拠に基準 commit 単独の identity を流用していない。

対象は専用 band style 5 と Splashdown の描画 helper。accepted native event、routing、retirement、攻撃値、物理、判定、通信、操作ロックは変更していない。旧 style 0〜4、pool、geometry、instance 数は維持する指定案を検証した。誤った旧 4b1e kit は使っていない。

## 実画面の条件と時刻

Chromium 154 / Playwright、WebGL2、ANGLE Vulkan SwiftShader。追加 GPU フラグは指定していない。1280×800、tidewater、quality low、shadow/bloom/minimap off。両版で同 seed 12345、入力、ゲーム時刻、照明、native 通常追従カメラを使用した。固定検査カメラへ動かして画像を合わせていない。

監査 hook で通常 RAF を最初の実行前に止め、native intro 253 tick、その後 135 tick を `dt=1/60` で進め、各 tick に通常 render を 1 回実行した。bot は停止、catalogue/gauge は発動準備用設定。加速して intro を進めるため壁時計の HUD 表示処理が追いつかず、撮影時 HUD は非表示。これは **固定 step 監査中の通常追従カメラ画像** であり、無介入の通常プレイ動画ではない。通常画像には画素編集を加えず、シートで縮小・切り抜き・説明を付けた。

| accepted native event | simulation frame | G.time (s) |
| --- | ---: | ---: |
| activate | 1 | 5.316666667 |
| central impact, index -1 | 70 | 6.466666667 |
| side impacts, index 1 then 0 | 87 | 6.750000000 |

全カメラ pose は receipts に保存。impact 時の FOV は 60.09084937317433、pitch は -0.45。共通 offset は **0/2/4/6/10/18/26/38/40/41/42/43/48**。before 26 枚、after は中央／左右の +22/+24 を加えた 30 枚を採取した。before +22/+24 は保存済みの状態を別枠の GL replay に利用し、その時点の通常画面を撮影したとは扱わない。

時刻は **60 Hz simulation tick**。選択静止画なので capture FPS と encoded FPS は該当なし。本家の録画 25 fps への変換は行わない。本家映像をこの担当は閲覧しておらず、本家とのフレーム一致や質の改善は未確認。参照版・入力時刻・gear・native FPS も不明のまま。ドームは元から存在し、今回の改善項目ではない。

## +22/+24 と継ぎ目

[検査用 alpha シート](inspection-band-alpha-ab.png) は同じ band records/camera を world/postprocessing なしで実 GL replay した alpha のグレースケール。[継ぎ目の support シート](inspection-seam-support.png) は **alpha > 0 を白で表示した二値検査図であり、不透明度の画像ではない**。既存 geometry の drawRange だけを分割し、各 band の実際の atan-wrap 24 triangle と残りを比較した。shader や mask を検査用に変更していない。

| paired impact 後 tick | 全 band の alpha>0 pixels | 継ぎ目 triangle のみ | 残りの triangle | 全 band max alpha / 255 |
| --- | ---: | ---: | ---: | ---: |
| +18 | 32462 | 2292 | 30855 | 254 |
| +22 | 6382 | 1636 | 5214 | 224 |
| +24 | 1363 | 1250 | 113 | 76 |
| +26 | 956 | 901 | 55 | 50 |

独立 render 同士には重複があり、各列の単純加算はできない。通常ゲーム画面の可視 pixel 数でもない。+26 は 901/956 が継ぎ目だけの render にも現れ、細い尾がこの sector に集中する。非継ぎ目も 55 pixel 残るため、全てが継ぎ目とは言わない。source review の AA 残りの懸念と整合するが、hard-mask field 自体の GPU 計測ではない。早期の coverage 減少が本家に対して正しいかは親側参照で未確認。

## 検証結果と費用

- 実 GL で各版 155 program の link と attached shaders の compile 成功。候補 band program 2 本に style 5 を確認。console/page/VFX errors 0、GL error 0。
- 旧 style 0〜4 を bands / inkBands で実描画し、RGBA hash が **10/10 一致**。加算 pool は alpha 0 でも RGB を持つため、alpha 数だけで空画像とは判定していない。
- [comparison.json](comparison.json) の **177 check 成功**。135 tick の native event、入力乱数、actor、phase、fist、camera、time、draw/triangle/instance と、共通 26 capture の全 non-band 状態・照明を照合した。pool 12、geometry bytes 631912、peak pool instance 合計 148 が両版同じ。
- [native-impact-tests.log](native-impact-tests.log) は **4/4 成功**。既存 assertion を維持し spy hook のみ `splashdownBlast` に対応。30/60/120 Hz、通常 3 impact、clear/再利用、owner death、remote expiry/fistGone を確認した。親の別移植版 source 11/11 を、この版の実画面証拠には流用していない。
- 実 geometry と normal の向きは記録中の min dot **0.9978094679407024**。この通常カメラで明らかな裏表照明の反転は見なかった。全角度・全照明では未確認。
- alphaControl 0 の style 5 は GL 出力も alpha 0。paired +38 は 8 pixel / max alpha 1、+40 は 0、その後の record retirement +41 も 0。棄却 TWISTER の不透明残片の突然消失は再現しなかった。
- CPU は各版 135 tick、単発の同条件順次実行。Director.update mean **0.14222 → 0.14741 ms（+3.65%）**、median 0.1、p95 0.4 ms。whole-scene render submission CPU mean **3.78222 → 3.58370 ms**。後者の低下を安定した高速化とは判定しない。SwiftShader 上の値であり、端末 GPU の費用ではない。timer extension がなく **GPU 時間は未計測**。

保存状態の GL replay は 48 観測、最終 errors 0 / GL error 0。初回は favicon の HTTP 404 を console error として検査が失敗し、検査 HTML の favicon を data URL にした。runtime は変えず再実行し、48 個の RGBA hash が初回と全て一致した。

## 保存物と残件

6 枚の共通 A/B シートは `central/paired-{early,spread,retirement}.png`、追加 4 シートは上記リンク。raw screenshots 56 枚と検査用 raw images は作業環境で保持。公開は小さな比較シート、receipts、検査 source の `.txt`、ログのみで、任天堂画像・素材や画像 archive は含まない。

Receipts は重複する row snapshot/projection を省略し、各 capture の完全な状態、per-tick の必要な band/camera/actor 状態、initial pool layout を保持する。重複 pool layout は `initialSnapshot.poolLayout` への参照にし、元 receipt の SHA256 を `recordNormalization` に記録した。図生成 source と `evidence-sha256.json` で出力を確認できる。

Library は既知の tools/list network failure のため再試行せず、Library ID はない。GitHub の画像と記録で受け渡す。本家 URL の取得拒否も再試行・迂回していない。候補 runtime の採用 push、main 更新、PR 作成・変更は行わない。現候補のリボン感、消失時期と継ぎ目の尾は残件として親へ返す。
