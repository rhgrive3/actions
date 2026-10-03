# INKWAVE 髪 v4 — 引き継ぎ（2026-09-30）

状態: 候補のみ。production master（`ink/tools/inkwave-modeler/blender/INKWAVE_CHARACTER_MASTER.blend`, md5 先頭 `e21cb706d6a2`）、production GLB、main は変えていない。コミットしていない。

## ファイル
- 候補: `HAIR_V4_CANDIDATE.blend`（コレクション `HAIR_V4`。古い髪 `HAIR` の中身は削除済み）
- 版ごとのコピー: `HAIR_V4_CANDIDATE_v10/v11/v12/v13.blend`（v13 が最新）
- 比較図（最新）: `HAIR_v13_8views.jpg`, `FRONT_v13_big.png`, `BANGS_v13_compare.jpg`
- 作業スクリプトとデータ: `scratchpad_backup/`（元は session scratchpad）。docs コピー: `ink/tools/inkwave-modeler/docs/hair-v4/`

## 物体（HAIR_V4）
| 物体 | 作り方 | スクリプト |
|---|---|---|
| V4_cuff_L/R + V4_buckle_* | 尻尾の留め具（ヘアカフ）。測った線 + 40° 前へ回す | v4/cuff.py（`ROT=40` を globals で渡す, v9_cuff.py） |
| V4_tailcore_L/R | 尻尾の芯（丸い断面） | v4/tails.py（run_tails.py） |
| V4_tail_L/R, V4_fins | 尻尾の表面の束（丸い断面）とヒレ（水玉） | v4/tails.py |
| V4_scalp / V4_stubble | なでつけた層 / 剃った部分（HEAD_face を写した殻） | v4/scalp.py |
| V8_shell | 頭頂のふくらみ（殻を最大 3.5cm 外へ） | v8shell.py（run_shell.py） |
| V7_bangs | 前髪 A–D。SAM の中心線 → 3D → 平滑化スプライン → 薄い刃（木の葉の断面） | sam/centerline.py → v7/lift.py → v12/smooth.py → v12/build.py |
| V7_fill | 前髪の奥の束 | v12/fill.py |
| V9_E | 分け目の横の大きな弧の束（正面参照からなぞる、面は正面向き） | v12/E_s.json（外で計算）→ v9_E.py |
| V9_silver | 銀白の巻き（E の内側） | v9_silver.py |
| V8_crown | v13 で削除（前髪の左のごちゃつきの元） | — |

マテリアル: v4/materials.py（run_mat.py）。GN の面の向きは必ず `v7/fix_mode.py`（Mode=Free）を最後に実行。

## 実行の仕方（画面なし。GUI は他の作業で落ちやすい）
```
S=<scratchpad or scratchpad_backup>
TMPDIR=$S blender -b HAIR_V4_CANDIDATE.blend --python $S/hl.py -- <outdir|none> <script1.py> <script2.py> ...
```
hl.py はスクリプトを順に実行 → 候補に上書き保存 → 4 方向 Cycles。8 方向は v4/cy8.py、比較図は v4/sheet.py / v4/bcmp.py / v5/pair.py。
V4 変数が必要なスクリプトは run_*.py 経由で渡す。Blender 内で scipy は使わない（落ちる）。

## 学んだこと
- 黒いものは尻尾ごとの留め具 2 個（カチューシャではない）。
- 髪は全部頭皮から生やす。
- 「ブヨブヨ」の原因: 道すじの 70–90° の折れ目、太さのへこみ、厚みが幅に比例。→ 平滑化スプライン + 単峰の太さ + 薄い刃。
- GN の Set Curve Normal は Mode=Free にしないと法線が効かない。断面は X=厚み（法線）, Y=幅。
- 関数の中の `'X' in dir()` は外の変数を見ない → `globals().get()`。

## 残り（v13 時点）
- 尻尾の上のふくらみ: 参照は束の重なり、候補はつるつるの玉。
- 尻尾の下半分: 参照は数本の束に分かれる、候補は 1 本の管。
- 前髪 A の上（分け目の後ろ）が横から見るとアーチに見える。
