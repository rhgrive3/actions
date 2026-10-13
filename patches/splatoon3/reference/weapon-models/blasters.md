# ブラスター系モデル（Splatoon 3 Ver.11.3.0 参照）

対象: `patches/splatoon3/runtime/weapon-models/blasters.mjs`（7 種）。参照版は Ver.11.3.0。
形状は公式 3D レンダー（`refs/<id>.3d.png`）と Inkipedia のターンテーブル動画から取り、
スケールは取っ手（約 0.11 m）の画素長から求めた。IoU は側面シルエットの before → after。
Inkipedia のファイル名は下表の「動画」列に記載。3D レンダーの取得時名称は記録していない。
ゲームプレイ画像（ホールド参照）の具体的なファイル名も記録していないため、ホールドは「画像から推定」扱い。

| 武器 ID / 名称 | 内部モデル | 参照（動画） | スケール | IoU 変更前→後 | 残差と確認状態 |
|---|---|---|---|---|---|
| `blaster` ホットブラスター | Wmn_Blaster_Middle | 動画: `S3 Custom Blaster model rotating.mp4`（同形の別キット。色は 3D 画像を使用） | 取っ手 62 px → 0.00177 m/px | 0.607 → 0.752 | 前部 `front` のスプリング伸縮とレバー動作は INKWAVE 内部キャリブレーション値。原典未確認（実機計測が必要）。左手は前方ブロック上（画像から推定）。射出口 [0, 0.092, 0.345] → [0, 0.171, 0.412]（弾源の変更、後述） |
| `s3-blaster-short` ノヴァブラスター | Wmn_Blaster_Short | 動画: `S3 Luna Blaster model rotating.mp4`（推定） | 取っ手 75 px → 0.00147 | 0.266 → 0.732 | 動画の半透明インク部分は不透明インクで代用。頭部ボールの揺れは INKWAVE の二次動作（原典未確認）。射出口 [0, 0.066, 0.212] → [0, 0.131, 0.327] |
| `s3-blaster-long` ロングブラスター | Wmn_Blaster_Long | 動画: `S3 Range Blaster model rotating.mp4`（推定） | 取っ手 52 px → 0.00212 | 0.383 → 0.799 | 長さ比は参照より約 5% 短い（2.03 対 2.14）。ホース・スタンド板は簡略化（画像から推定）。射出口 [0, 0.066, 0.212] → [0, 0.195, 0.533]（弾源の変更、後述） |
| `s3-blaster-lightshort` クラッシュブラスター | Wmn_Blaster_LightShort | 動画: `S3 Clash Blaster Neo model rotating.mp4`（別キット） | 取っ手 96 px → 0.00115 | 0.503 → 0.790 | クレヨンの本数と配置は 3D 画像から推定。色は 3D 画像。射出口 [0, 0.066, 0.212] → [0, 0.090, 0.305] |
| `s3-blaster-light` ラピッドブラスター | Wmn_Blaster_Light | 動画: `S3 Rapid Blaster Deco model rotating.mp4`（別キット） | 取っ手 82 px → 0.00134 | 0.467 → 0.839 | 弾倉窓スリットのインク色とドラム輪の数は画像から推定。色は 3D 画像。射出口 [0, 0.066, 0.212] → [0, 0.174, 0.339] |
| `s3-blaster-lightlong` Rブラスターエリート | Wmn_Blaster_LightLong | 動画: `S3 Rapid Blaster Pro Deco model rotating.mp4`（別キット） | 取っ手 67 px → 0.00164 | 0.416 → 0.789 | 白いループ型ストックの形状は画像から推定。前部ポストを左手で保持（画像から推定）。射出口 [0, 0.066, 0.212] → [0, 0.177, 0.486]（弾源の変更、後述） |
| `s3-blaster-precision` S-BLAST92 | Wmn_Blaster_Precision | 動画: `S3 S-BLAST '92 model rotating.mp4` | 取っ手 53 px → 0.00205（0.11 m 基準より約 1.3% 小さい） | 0.363 → 0.745 | スコープのレンズ・紫ボタン・照門は簡略化（画像から推定）。接地時と空中時で形状が変わらないことはゲームプレイ映像から推定。射出口 [0, 0.066, 0.212] → [0, 0.135, 0.305] |

## 変更内容（共通）
- 各武器の `build` は `rebuild(d, ...)` で本体・インクを置き換え。`gripR`（取っ手）、`gripL`（左手の位置）、`muzzle`（銃口）を個別指定。
- 三角形数は 4 258 〜 11 831（blaster が 11 831 で目標 12 000 未満）。
- ホールドは武器ごとに上書き（`HOLD_BLASTER` / `HOLD_LUNA` / `HOLD_EYE` / `HOLD_EYE_LONG` / `HOLD_SHOULDER`）。構えの確認は合成画像のみ（ホールド参照との 1 対 1 比較はしていない）。
- `blaster` のみ `front` チャネルを弾源の親にする（`muzzlePart = 'front'`）。`lever`・`front` は INKWAVE の内部キャリブレーション（`blaster-mechanism.mjs`）に従う。
- `pump` / `needle` / `bulb` は本モデルに無いので非表示（`rebuild` の既定動作）。

## 弾源（射出口）の変更について（要レビュー）
射出口は弾の発射位置（ゲームプレイ）。変更前は共有 Blaster の値（0.066〜0.092 m 高さ、0.212〜0.345 m 前方）、変更後は各武器の銃口。
最大で約 0.32 m 前方へ移動する（`s3-blaster-long`）。Splatoon 3 の実機での弾源との比較はしていない（未確認）。
`AGENTS.md` の挙動差分記録 (`reports/inkwave-splatoon3-behavior-2026-10-02.md`) は本作業の範囲外のため未更新。要更新。

## 未確認（実機計測または原典データが必要）
1. 射撃時の `front`（スプリング前進）・`lever` の位置と時間 → `blaster-mechanism.mjs` の内部値。原典未確認。
2. 射出口の位置（全 7 種）→ 実機の弾源と比較していない。
3. ホールド（構え）→ 画像から推定。実機フレームとの比較は未実施。
4. 色（別キットの動画は色が異なる。色は 3D 画像から）→ 画像から推定。
5. 半透明インク（`s3-blaster-short` の前部キャップ）→ 不透明で代用。

## テスト
- `weapon-models-all.test.mjs`: 3 件中 2 件合格。3 件目（保持・攻撃）は `s3-roller-compact` で失敗（ローラー担当の別作業）。
- 同テストをブラスター 7 種のみに絞って実行: 合格（支え手が取っ手から 0.008 m 以内、攻撃を確認）。
- ブラスター関連テストファイル 14 本: 85 件すべて合格。
