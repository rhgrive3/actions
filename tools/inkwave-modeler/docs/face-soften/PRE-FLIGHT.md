# PRE-FLIGHT（2026-09-29、形を変える前の記録）

## 環境

| 項目 | 値 |
|---|---|
| Blender | 5.2.2 LTS（記録と同じ版。保存し直してよい） |
| 作業の元 | `origin/main` 09d25b6（ブランチ `claude/inkwave-face-soften-20260929`） |
| マスター `.blend` の sha256 | `775a74c2270b148e59f1156c5b07faf32ad4530c07a5cf0dd8dca52123587b03` |
| `INKWAVE_CHARACTER_MASTER.glb` / `INKWAVE_GAME.glb` の sha256 | 両方 `0325e9b512ef5d2b506970912cc569619cfdf29df440f78ad1c1e1775bcc9736` |

## Skill / MCP

| 見つけたもの | 使ったか |
|---|---|
| ユーザーのスキル `inkwave-face-edit`（前回の失敗、Blender 標準機能を先に使う、診断の道具） | 使った（最初に読んだ。`blendcmp.py` を使った） |
| ユーザーのスキル `blender`（MCP 用の一般の手順） | 読んだだけ。Blender MCP はこの環境にない |
| リポジトリの MCP | `graft` だけ（コード検索用）。Blender 用の MCP はない |
| Web: Blender Agent Studio（ifBars/blender-agent-studio の blender-modeling-workflow、blender-asset-validation、blender-iterative-refinement） | 手法だけ参考にした: Python のスクリプトを元にする、決まった多視点の画像で確かめる、書き出した GLB も読み直す、数字は合否の目安で見た目の代わりにしない。何もインストールしていない |

## `.blend` の中身

| 項目 | 値 |
|---|---|
| 部品（object） | 246（メッシュ 224、カメラなど） |
| メッシュ部品の三角形の合計 | 565,832（書き出す 208 部品では 486,596） |
| 材料 / 画像 | 125 / 93（画像はすべてパック済み） |
| アーマチュア / シェイプキー / モディファイアー | なし / なし / なし |
| テキスト | `INKWAVE_FACE_REFINE.json`、`INKWAVE_FACE_LOOK.json`、`INKWAVE_FACE_MULTIVIEW_FIT.json`、`INKWAVE_EYE_REFINEMENT.json`、`INKWAVE_SOURCE_PROFILE.json` |
| 控え | 89: `__prelook`（face_look）、`__prefit` / `__prefit_topo` / 点の属性 `inkwave_prefit_position`（multiview_fit）、`__pre_eye_refine`（eye_refine） |
| コレクション | `FACE_FIT_ORIGINAL`（12、fit 前のコピー）、`FACE_FIT_CAMERAS`（5） |
| カメラ | `FACE_FIT_CAM_front` / `q34L` / `sideL` / `q34R` / `sideR`、370×290、焦点距離 267〜301 mm |
| `HEAD_face` | 27,789 頂点、54,912 三角形（157×177 の輪の格子）、UV 1、独自の法線あり |
| `HEAD_skin` / `HEAD_skin_04` | 各 6,656 三角形（チーク。肌の 0.3 mm 上） |

## 顔の手順の順番と、元に戻すしくみ（読んで確かめたこと）

`face_refine` → `face_look` → `face_multiview_fit` → `eye_refine`（lp40 / m3 / d1 / cr1）。

- `eye_refine` の控えは最初の実行でしか作られない。前の手順をかけ直した後にそのまま実行すると、古い顔に戻る。今回、`--restore --drop-backups` を足した。
- `face_multiview_fit --restore` は点の属性と `__prefit_topo` で元に戻す。`face_look` は `__prelook` のコピーに戻してからかけ直す。
- 確認: この順（eye を元に戻す → 控えを消す → fit を元に戻す → face_look → fit → eye）で値を変えずに通すと、224 メッシュすべてが今のマスターと完全に同じになる（位置、独自の法線、UV、材料、画像）。
