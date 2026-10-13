# チャージャー系 main 武器モデル（Splatoon 3 Ver.11.3.0）

対象: `patches/splatoon3/runtime/weapon-models/chargers.mjs`（family `charger`、8 武器）。
参照素材: `$SP/refs/<id>.3d.png`（公式 3D レンダー）、`$SP/rotsheets/<id>.rot.jpg`（ターンテーブル動画の 12 コマ）、
Inkipedia の "S3 <名称> model rotating.mp4"（ファイル名はブリーフの命名規則に基づく。実ファイル名の照合は未実施）。
比較指標は `silhouette.json` の側面シルエット IoU（正面 3/4 参照との比較のため回帰指標であり、同等性の証拠ではない）。
IoU 前は汎用チャージャーモデル（`$SP/before/`）、後は `$SP/it-chargers/`（1 回目のレンダー）。

## 武器別

| 内部モデル名 | 武器 (id) | 参照 | IoU 前→後 | 主な残差 | 確認状態 |
|---|---|---|---|---|---|
| Wmn_Charger_NormalT | スプラチャージャー (charger) | `charger.3d.png`、`charger.rot.jpg`、Inkipedia "S3 Splat Charger model rotating.mp4"（t=7.3 s、6° 水平化） | 0.352 → 0.460 | 参照は 3/4 視点で側面との縦横比が合わない（ours 5.42 / ref 3.45）。台尻・上部レールの高さ比。 | 画像から推定 |
| Wmn_Charger_NormalTScope | スプラスコープ (s3-charger-normalscope) | `s3-charger-normalscope.3d.png`、rot、Inkipedia Z+F Splatterscope 側面（t=19.3 s、6.7° 水平化） | 0.178 → 0.470 | スコープの高さ・マウント位置。縦横比 ours 4.59 / ref 3.23。 | 画像から推定 |
| Wmn_Charger_Quick | スクイックリンα (s3-charger-quick) | `s3-charger-quick.3d.png`、rot、Inkipedia "S3 Classic Squiffer model rotating.mp4"（t=8.2 s、4.7° 水平化） | 0.144 → 0.323 | タンク（ボトル）とスパウトの角度・太さ。縦横比 ours 4.48 / ref 2.85 で細長すぎる。 | 画像から推定 |
| Wmn_Charger_Long | リッター4K (s3-charger-long) | `s3-charger-long.3d.png`、rot、Inkipedia "S3 E-liter 4K model rotating.mp4"（t=7.9 s、9.3° 水平化） | 0.206 → 0.546 | ホース・バネの本数。縦横比 ours 4.07 / ref 3.55。全長 1.30 m は画像からの推定。 | 画像から推定 |
| Wmn_Charger_LongScope | 4Kスコープ (s3-charger-longscope) | `s3-charger-longscope.3d.png`、rot、Inkipedia "S3 Inkling E-liter Scope render" | 0.212 → 0.541 | スコープの対物レンズ位置。縦横比 ours 4.07 / ref 3.37。 | 画像から推定 |
| Wmn_Charger_Light | 14式竹筒銃・甲 (s3-charger-light) | `s3-charger-light.3d.png`、rot、Inkipedia "S3 Bamboozler 14 Mk II model rotating.mp4"（t=8.0 s）、S2 Mk I プロモ | 0.264 → 0.502 | 竹の節の数と太さ。縦横比 ours 2.93 / ref 1.85。全長 0.49 m と握りの太さ 5 cm は推定。 | 画像から推定 |
| Wmn_Charger_Keeper | ソイチューバー (s3-charger-keeper) | `s3-charger-keeper.3d.png`、rot、Inkipedia "S3 Custom Goo Tuber model rotating.mp4"（t=6.9 s、−29.6° 水平化）、"S3 Goo Tuber charge 10.0.0.mp4" | **0.392 → 0.324（悪化）** | 参照 3D は白いホースを 3/4 視点で大きく巻いて写す。モデルはホースを team 色（インク）とした。縦横比 ours 2.27 / ref 1.44。 | 未確認（ホースの色区分をゲーム内映像で確認が必要） |
| Wmn_Charger_Pencil | Snipewriter 5H / R-PEN/5H (s3-charger-pencil) | `s3-charger-pencil.3d.png`（ほぼ側面、−7.7° 水平化、α マスクから中心線を推定）、rot | 0.138 → 0.576 | 全長と太さは縮尺推定（1 px = 1.33 mm、グリップ約 8.5 cm）。縦横比 ours 3.09 / ref 3.20 で一致。 | 未確認（実機計測が必要。縮尺は画像からの推定） |

## モデル構成（共通）
- 支持手 gripL は長い銃ほど前に出す（E-liter 系・Pencil は銃身側面で握る）。
- 可動部: `trigger`（ヒンジ）、`ports`（ポート灯）、`lens` / `eyepiece`（スコープのみ）、`d.glow` のコイル（aSeg 配線）。
- 照準の頭の傾き（`FAMILY_POSE` の SIGHT）は既存値のまま。未検証。
- muzzle は各ノズル出口（ゲーム性の値は変更なし）。

## テスト
- `charger-*.test.mjs` と `issue-*-charger-*.test.mjs` 計 218 件: 全て合格。
- `weapon-models-all.test.mjs`: 不合格 1 件。`s3-roller-compact` の支持手グリップ誤差 0.0953 m（ローラー担当の作業中ファイル。本ファイル群とは無関係）。
  このテストは最初の失敗で止まり、FAMILIES の順序でローラーがチャージャーより先に走るため、チャージャーの手の保持は**このテストでは未確認**。

## 未確認項目
1. チャージャー 8 件すべての手の保持・構えモーション（held レンダー未実施、`--no-held` のみ）。
2. Keeper のホース色（白の基本色か team 色か）と IoU 悪化の原因。
3. Pencil の全長・太さ（実機計測または原典データが必要）。
4. Light / Quick / Normalscope の縦横比（上記の残差）。
5. weapon-models-all の `s3-roller-compact` 不合格（ローラー担当が解消する必要がある）。
