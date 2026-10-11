# ブレラ系 (shelter) 外観モデル — 参照バージョン 11.3.0

実装: `patches/splatoon3/runtime/weapon-models/brellas.mjs` (modelKind = shooter、family = brella)。
形状は Inkipedia の公式 3D レンダー (`S3 Weapon Main <name> 3D`) と回転動画 (`S3 <name> model rotating`) から手作業で再構成した手続き生成ジオメトリ。公式メッシュ・テクスチャは含まない。
スケール: ピストルグリップの握り 0.11 m を基準に、傘の開き半径をレンダー中の傘/グリップ比から決定 (実寸は未確認)。

構成: 銃本体 (グリップ + 軸 = 散弾の銃身 + 軸先ハブ) と、別パーツ `canopy` (+ チームインク色の `canopyInk`)。
キャノピーは `catalogState.canopy` / `catalogState.naked` を読み取り専用で参照して `spec.animate` で動かす (毎フレームの確保なし)。
ジオメトリは畳んだ姿で焼き込み済み (遠距離LOD・未アニメ時は閉じた傘)。アニメは先端ハブを支点に幅 (x/y) と軸方向長 (z) のスケールを変える。

| ブキ | 内部モデル名 | 主な参照 | 輪郭IoU 前→後 | キャノピーの挙動 | 残る差分 (確認状態) |
|---|---|---|---|---|---|
| パラシェルター (`s3-shelter-normal`) | Wmn_Shelter_Normal | `S3 Weapon Main Splat Brella 3D.png`、`S3 Splat Brella model rotating.mp4` (別色キット、色は3Dに合わせた) | 0.47 → 0.14 (※) | 撃ち始めから `canopy.open` で開き、離すと畳む。射出 (`launched`) 中と `naked` 中は非表示 | 柄のロゴ・赤い模様・柄の印刷は未再現 (画像から推定)。開き半径 0.4 m は推定 (未確認)。インク色の範囲 (傘上部) は動画の別色キットからの推定 |
| キャンピングシェルター (`s3-shelter-wide`) | Wmn_Shelter_Wide | `S3 Weapon Main Tenta Brella 3D.png`、`S3 Tenta Brella model rotating.mp4` | 0.27 → 0.04 (※) | 同上 (開き 46F 後)。長方形のテント状 (約 1.6:1)、赤い交差ポール | 本物はたわんだ曲面の布。窓・柄・金具は未再現。インク色を左右の三角面としたのは動画からの推定 (未確認) |
| スパイガジェット (`s3-shelter-compact`) | Wmn_Shelter_Compact | `S3 Weapon Main Undercover Brella 3D.png`、動画は別色キット (Patternz) | 0.40 → 0.11 (※) | 開閉のみ。射出なし (`launched` にならない)。`naked` 中は非表示 | 持ち手は J 字の木製クルック (グリップ軸に沿わせた近似)。緑ランプは `led` チャンネルに割当済み。杖の模様は未再現 |
| 24式張替傘・甲 (`s3-shelter-focus`) | Wmn_Shelter_Focus | `S3 Weapon Main Recycled Brella 24 Mk I 3D.png`、`S3 Recycled Brella 24 Mk I model rotating.mp4` | 0.42 → 0.14 (※) | 同上。和傘風の 24 本骨、浅いドーム | 紙の質感・朱色の差し色は近似。緑のリングは `led` チャンネル |

(※) 比較レンダーの正解画像は **傘を開いた姿** だが、静止時の本モデルは仕様どおり **畳んだ姿** なので IoU は構造的に下がる。前の値は旧スタブ (開いた大きな傘形状)。開いた姿の IoU は未計測 (未確認)。傘が開いた状態は保持ポーズのレンダー (fire) で確認した。

## ムズル・グリップ
- `gripR`: ネイティブのピストルグリップ。`gripL`: 軸 (z=0.08–0.14, y=0.075) の握り (全ブキ共通テストで 0.0003 m 以内)。
- `muzzle`: 軸先ハブのノズル位置 (z=0.62 / 0.87 / 0.605 / 0.62, y=0.075)。ゲームプレイ値は変更なし (弾の発射位置のみ)。

## 動作確認
- `weapon-models-all.test.mjs` (4 ブキ)、`main-weapon-catalog.test.mjs`、`weapon-catalog-adapter.test.mjs` 通過。
- ブラウザ実動作: ギャラリーのレンダーでスパイガジェットが連射中に傘を開くことを確認。他3種は `firePressed` を与えた一時レンダーで開いた姿を確認 (テントは 46F 後)。射出後の非表示 (`launched` / `naked`) は実行確認できていない (ロジックのみ、未確認)。
- 本家実機との比較 (開閉の速度・タイミング、傘の実寸、構え姿勢) は未実施。

## 未確認(実機計測が必要)
- 傘の開閉アニメの時間 (現状は damp による近似。ゲーム内の開き時間はカタログの `open` フレームから状態だけ利用)
- 傘の実寸・開いたときの手の位置・構え姿勢の差 (FAMILY_POSE は未実装、ネイティブのシューター構え)
- 傘を持った際の歩行・ジャンプ時の傘の向き
