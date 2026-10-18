# 顎下左右から首への局所接続補正（2026-10-18）

## 対象・基準

- Production baseline: `a505ef6523e708c1c6aa339da0d8233f1f8170a3`。原本 `inkwave-public/` を改変せず、production composition の build-time adapter で適用する。
- ユーザーの比較画像の赤丸は、顎下左右の肌色輪郭が細い首の脇へ張り出す部分。真正面の頭ボーン基準カメラと弱陰影でも残るため、影だけでは説明できない形状差だった。
- 本家の主参照は任天堂の [Splatoon 3 × Pokémon フェス告知（2022-10-07）](https://www.nintendo.com/jp/topics/article/b504b47c-8904-4ef8-9557-b4f5ae13c96a)。[公式画像](https://assets.topics.apps-jp.nintendo.com/image/2022/10/01114414246407/800/02.jpg) は 800×450、右の青インクリングの顔幅は約80px。ほぼ正面だが傾き・表情・照明・レンズは一致していない。キャラクターの性別・body styleも断定しない。
- その画像から、頬から顎への大きな先細りは参考にできるが、正確な顎幅・曲率・首寸法や横顔の一致は判定できない。amiibo製品写真は補助参照に留め、ゲームモデルと同一とは扱わない。今回の数値はすべてINKWAVE内部の局所校正で、任天堂のモデル値ではない。

## 実装

`patches/local-quality/s3-face-look-adapter.mjs` に、一意アンカー置換 `localized under-jaw to neck transition` を追加。変更は `character-face.js` の `unionField` とその丸め幅のみ。

1. 下部carrierのhead fieldを、左右と後方へ少し上がる滑らかな下限で局所的に切り上げる。下限は `1.078 + 0.11 * (sqrt(x² + 0.02²) - 0.02) + 0.012 * sstep(0.04, -0.07, z)`、smooth-max幅は `0.014`。
2. 首とのsmooth-union幅を `0.017` から `0.028` に変更し、接続の折れを和らげる。
3. `headShape`、目・鼻・口・耳・髪/ギアfit、首tube半径、骨格・アニメーション・body・ゲームロジックは変更しない。顔全体の横幅や中央顎先をV字化していない。上部の最初のface rowとcollar ringは保持する。

これは後ろ寄りの下顎が前顎より低く垂れ、正面の首脇へ投影される部分を減らす処理である。特定の本家メッシュ形状を復元したとの主張ではない。

## 固定座標での実測

Production composed `unionField` の同一 `x,z` に対し、下側のゼロ交点 `y` を二分探索した。単位はkid-space内部座標。括弧内のmm表示は **1内部単位=1mと仮定した換算** に過ぎず、本家または実物の寸法ではない。

| x | z | 変更前y | 変更後y | Δy 内部座標（仮定換算） |
|---:|---:|---:|---:|---:|
| 0 | 0.120 | 1.1029892244 | 1.1029892244 | 0 |
| ±0.020 | 0.120 | 1.1048706787 | 1.1048706787 | 0 |
| ±0.060 | -0.040 | 1.0793197324 | 1.0925806017 | +0.0132608692（13.261mm） |
| ±0.035 | -0.070 | 1.0720785731 | 1.0922342418 | +0.0201556686（20.156mm） |
| 0 | -0.070 | 1.0660962577 | 1.0900000000 | +0.0239037423（23.904mm） |
| ±0.080 | 0 | 1.0915270458 | 1.0937624859 | +0.0022354401（2.235mm） |

上記は選んだ座標点の測定であり、全表面での最大変位とは断定しない。下首のfieldとtube半径は不変。

## 検証と証拠

### 数値・回帰テスト

```sh
node --experimental-vm-modules --test patches/local-quality/tests/s3-chin-neck.test.mjs patches/local-quality/tests/s3-face-look.test.mjs
```

a505のproduction/test/scriptsを用いて **18/18 pass**（既存15＋追加3）。追加試験は以下を確認する。

- 左右後寄りの局所切り上げ、鏡対称、前中央顎の固定座標保持。
- 解析的head surfaceと顔feature surfaceのサンプル完全一致、下首fieldとtube半径の保持。
- 全120 profile列の有限座標、下降性、隣接間隔、upper joinとcollar joinの連続性。

既存試験は全detail level、目鼻口、normal、鏡像triangulation等を含む。数値テストだけで外観合格や本家一致とは判定しない。

### Native production rendering

[diagnostic run 39095121381](https://github.com/rhgrive3/actions/actions/runs/39095121381)、exact head `156ec04300679323eaec9d30ce5ec609a9f113ba` で、a505 baselineとcandidateの **43+43ケース成功**。固定harnessで同じrig/表情/カメラ/照明を使い、PNG integrityとexact headを確認した。hero/game/far、閉口・開口・笑顔、首姿勢、hat0および4～7、正面・左右斜め・下・横を含む。正面と横は通常/弱陰影の両条件。

- 正面弱陰影でも赤丸位置の下がった張り出しが減り、中央前顎と顔featureは維持されている。
- 斜め/横では後ろ下顎の張り出しが減る。横下面は以前より水平で直線的に見えるため、「本家の丸みと厳密一致」とはしない。前顎を尖らせた変更ではない。
- 確認した下・横・首上向き画像に穴や大きな首分離は見られない。首を太らせて隠す処理ではない。
- 対応ケースの頂点数・triangle数・draw数は増加なし。skinの有限性・正規化等の技術検証は正常。これらは描画時間/FPSの完全不変を保証するものではない。
- 髪の形を保持したまま後下顎を切り上げるため、背面の髪下に新しい隙間がないかを追加確認する。背面を含めた44ケース版 exact head `33e8bec5a2fbb17d4b7eb89854e8dc56fc5bffc3` は **本記録作成時点で未完了**。43ケース成功をもって背面確認済みとはしない。

## 変更ファイルと固定ハッシュ

SHA-256:

- `patches/local-quality/s3-face-look-adapter.mjs`: `dd8383f91d961b46e76e298b28bfbf156f4bc1e318d7c33fd27250ccd19b771f`
- `patches/local-quality/tests/s3-chin-neck.test.mjs`: `5324d43969b59b8f1cdfeb7c563fb0735f686544d2c40e52567e73451b7d582b`

診断workflow/harnessは診断専用branchであり、本番runtime変更に含めない。本番PRの最終head CI、背面追加確認、公開反映は別gate。公開サイト更新・マージ完了をこの記録では主張しない。
