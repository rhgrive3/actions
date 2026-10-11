# ダブルリール系（dualies）の武器モデル: 参照 Splatoon 3 Ver.11.3.0

実装: `patches/splatoon3/runtime/weapon-models/dualies.mjs`

## 方法と制約

- 参照は公式の 3D レンダー（`<id>.3d.png`、透過、銃口は右）。IoU はこの画像のアルファ輪郭と、`iterate.sh` の側面描画の輪郭を比べる。
- 参照画像は 2 丁を斜めに重ねた 3/4 像で、モデルは仕様どおり 1 丁のみ。そのため IoU には構造上の上限があり、縦横比（参照の幅/高さ 0.92〜1.47）も 1 丁では完全には合わない。
- スケールは実寸を計測していない。グリップは `pistolGrip`（柄 0.11 m、原点中心）を基準に、本体は画像から見た比率で m 単位に配置した。
- 色は `<id>.3d.png` を基準にした。回転映像（`rotsheets/`）が別キット（alt-kits）の武器は形状のみ参照した。
- グリップ: `gripR` / `gripL` は `GRIP_PISTOL` のまま変更していない。ホールド（`hold`）と回避動作は変更していない。
- 可動部: `slide`、`slideInk`（−z 反動）、`led`、`trigger` を native チャンネルとして残した。銃口 `muzzle` は各ノズルの先端に置いた。

## 武器別

| 武器 | 内部モデル名 | 出典 | IoU before → after | 登録 | 残差と確認状態 |
|---|---|---|---|---|---|
| Splat Dualies / スプラマニューバー（id `dualies`） | Wmn_Maneuver_NormalT | Inkipedia「S3 Splat Dualies 3D」（3d.png）、回転映像 `rotsheets/dualies.rot.jpg`。正確なファイル名は未記録 | 0.2583 → 0.3365 | 登録 | 黒いスライド殻、緑のグリップとノズル、マゼンタの口輪、後方の白いタンク。タンク色は 3D（白）と回転映像（桃）で不一致（画像から推定、未確認）。縦横比 1.44（参照 0.95）。 |
| Dapple Dualies / スパッタリー | Wmn_Maneuver_Short | 3d.png、回転映像 `rotsheets/s3-maneuver-short.rot.jpg` | 0.3084 → 0.3084（据え置き） | 未登録 | 候補の IoU は 0.2778 → 0.2084 で、before を下回ったため登録しない。弓形フレームと後方のブラシ柄は未完成。候補は `weapon-models/wip/dualies-dapple.mjs.txt`。 |
| Glooga Dualies / ケルビン525 | Wmn_Maneuver_Gallon | 3d.png（青/赤）。回転映像は別キット「Glooga Dualies Deco」（黄色）で、形状のみ参照 | 0.3409 → 0.4233 | 登録 | 2 本脚、後部リール、前方のフックは画像推定。上部全体を slide とした（反動で動くかは未確認）。色は 3D 基準。 |
| Dualie Squelchers / デュアルスイーパー | Wmn_Maneuver_Dual_L | 3d.png。回転映像は別キット「Custom Dualie Squelchers」 | 0.3822 → 0.4469 | 登録 | 黄緑のノズルキャップを team ink（静的）として扱ったが、ink 部位は未確認。後部の赤いタンクは箱で近似。 |
| Dark Tetra Dualies / クアッドホッパーブラック | Wmn_Maneuver_Stepper | 3d.png。回転映像は別キット「Light Tetra Dualies」（未閲覧） | 0.2459 → 0.2800 | 登録 | 白い殻、白いフープ、緑の足と緑のノズル先（team ink と仮定）。形状は 3D 画像からの推定のみ。 |
| Douser Dualies FF / ガエンFF | Wmn_Maneuver_Long | 3d.png（回転映像は未閲覧） | 0.3100 → 0.3574 | 登録 | 黄色のリングを team ink（slideInk）、後部の赤いキャニスターは円柱で近似。縦横比 1.04（参照 0.92）。 |

確認状態は、すべて「画像から推定」。原典データ（公式パラメータ）は未確認。

## 未確認（実機計測または原典確認が必要）

1. 持ち方: `--no-held` で描画のみ。両手の位置（左手の `GRIP_PISTOL` コピーと実際の支え方）、ホールド全体は未確認。
2. 寸法: 実機の寸法は未計測。モデル寸法は画像比率からの推定。
3. ink 部位: どの部位が実機で team ink か（回転映像の黄/桃の色が team ink か別キットかの区別を含む）は未確認。
4. 可動部: Gallon、Stepper、Douser の上部ブロックを slide として反動させる扱いは仮定。実機の動きは未確認。
5. IoU の上限: 参照は 2 丁の重なり像、モデルは 1 丁。縦横比の差は構造上の限界で、実機比較の代用にはならない。
6. ファイル名: Inkipedia の正確なファイル名は作業ログに残っていない。

## 検証

- `WEAPON_IDS=dualies,s3-maneuver-short,s3-maneuver-gallon,s3-maneuver-dual,s3-maneuver-stepper,s3-maneuver-long node --experimental-vm-modules --test patches/splatoon3/tests/weapon-models-all.test.mjs`: 3 件すべて成功。
- dualies 系テスト 23 ファイル（`ls patches/splatoon3/tests | grep -iE "dualies|maneuver"`）: 130 件すべて成功。
- 三角形数は 1710〜1978（上限 12,000 以内）。
