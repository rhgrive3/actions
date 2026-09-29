# 顔の同一性フィット: 候補 E（目の開き + ライナー + まつ毛）

状態: **候補のみ**。マスターの `.blend` と GLB は変えていない。目で見て承認をもらうまで、ここで止める。

## 何をしたか

目の開きが「縦に丸すぎる」ので、参照（`../face-multiview-fit/refs/sheet_5view.png`）の横長のアーモンド形に近づけた。
目玉は動かさない。まぶたの肌が目玉の上をすべる（半径は同じ、角度だけ動く）。同じ動きを、次の部品に同時にかける。

- `HEAD_face`、`HEAD_skin` / `HEAD_skin_04`（肌の層）
- ライナー（`HEAD_eyes_03` / `_20`）、上まつ毛（`HEAD_eyes_05..11` / `_22..28`）、橋（`HEAD_eyes_12` / `_29`）
- 眉は肌からの距離を保って付け直す（動きは 0.005 mm で、ほぼ動いていない）

ライナーは、上まつ毛のつけ根の上側だけを細くした（中央 0.5 倍、外側のはね 0.75 倍）。
頂点数・UV・材料・画像は変わらない。目の作り直し（lp40 / m3 / d1 / cr1）はやり直していない。

## 動かし方

```bash
cd tools/inkwave-modeler
M=blender/INKWAVE_CHARACTER_MASTER.blend        # 新しい main のマスターにもそのまま使える
blender -b $M --python scripts/inkwave_face_identity.py -- --params analysis/identity/params_E.json --save <candidate.blend>
blender -b <candidate.blend> --python scripts/inkwave_face_identity.py -- --restore --save <back.blend>   # 元に戻す
```

`params_E.json` の 8 つの目印（目頭、目尻、上まぶた 25/50/75%、下まぶた 25/50/75%）に、角度の動き（仰角°、方位角°）を書く。
控えは点の属性 `inkwave_preid_position` と テキスト `INKWAVE_FACE_IDENTITY.json`。

## 検査（基準 A = PR #19 のマスター → 候補 E）

| 項目 | 結果 |
|---|---|
| 変わった部品 | 23 / 224（`qa/AvsE.json`）。ほかの 201 は同じ |
| 最大の動き | `HEAD_face` 3.6 mm、`HEAD_skin*` 3.6 mm、ライナー 3.2 mm、眉 0.005 mm |
| 頂点数・三角形・材料・画像 | すべて同じ |
| 2 回かけた結果 / `--restore` の結果 | 候補と 224 部品が同じ / 基準と 224 部品が同じ |
| 貫通・すき間（`qa/pen_*.json`） | 基準とほぼ同じ。左の肌の層で、顔の 0.35 mm 以上下にある頂点が 0 → 13（最小 −0.331 → −0.376 mm） |

目の開きの面積（シート px²、参照は分類器のゆるい輪郭なので目安）:

| ビュー | 参照 | 基準 A | 候補 E |
|---|---|---|---|
| 正面 L / R | 645 / 707 | 779 / 836 | 635 / 681 |
| 3/4 左 L | 672 | 748 | 602 |
| 3/4 右 R | 495 | 614 | 502 |
| 横 右 R | 258 | 344 | 279 |

## 画像（参照 | 基準 | 候補 E）

`img/1_front.jpg`、`img/2_q34.jpg`、`img/3_side.jpg`、`img/4_eye_only.jpg`、`img/5_contour_*.jpg`（黄 = 参照、赤 = 基準、水色 = 候補 E）、`img/6_clay.jpg`、`img/7_redcyan_front.jpg`。

## 未完了

- 眉と目の関係（眉の動き）はしていない。
- 3/4 左は参照より約 10% せまい。数字は目安で、見た目で決める。
- 開き直しの検査、往復検査、GLB の読み直しは、承認のあとにする。
- 頬・口・あご・鼻は、承認のあとにする。
