# スプラスピナー系 武器モデル（Splatoon 3 Ver.11.3.0）

対象: `patches/splatoon3/runtime/weapon-models/splatlings.mjs`。基準バージョン 11.3.0。
本家ソース: 公式 3D レンダー（`refs/<id>.3d.png`）と回転映像の 12 フレーム（`rotsheets/<id>.rot.jpg`、Inkipedia "S3 <名称> model rotating.mp4"）。Inkipedia 上の正確なファイル名と URL は、この作業では記録していない（未記録）。
IoU は 3D レンダー（斜め 3/4 視点）のシルエットとの比較で、真側面ではない。このため絶対値の上限は低い。

| 武器（ID） | 内部モデル名 | IoU 前→後 | 登録 | 主な残差と確認状態 |
|---|---|---|---|---|
| バレルスピナー（`splatling`） | Wmn_Spinner_StandardT | 0.57 → 0.58 | 登録 | 6 本バレルとピンクのハブを回転 part `barrels` に置いた。タンクは legacy 寸法を流用し、高さを 1.90:1 の目安に寄せた（最終 1.71）。充電メーター（native coil）は削除した。参照に表示がないため。実機の充電表示の有無は未確認。 |
| スプラスピナー（`s3-spinner-quick`） | Wmn_Spinner_QuickT | 0.39 → 0.70 | 登録 | 紫のハウジング、黄色のドラム、青い 6 ノズルの前面。白い球形タンクは球で近似した。寸法は画像からの目測（画像から推定）。 |
| ハイドラント（`s3-spinner-hyper`） | Wmn_Spinner_HyperT | 0.32 → 0.49 | 登録 | 銀缶タンクは円柱で近似し、傾きは推定。赤いドラムと真鍮ノズル 4 本。最終アスペクト 1.20 に対し参照 1.45（縦長、画像から推定）。タンクを 0.20 まで下げた試作は 0.43 に悪化したため戻した。 |
| クーゲルシュライバー（`s3-spinner-downpour`） | Wmn_Spinner_Downpour | 0.40 → 0.50 | 登録 | 透明管は `M.lens`。3 本のバレルは管の内部。アスペクト 1.64 に対し参照 2.29（背が高い、画像から推定）。残差は大きい。 |
| ノーチラス47（`s3-spinner-serein`） | Wmn_Spinner_Serein | 0.44（基底）→ 未登録 | 未登録 | 試作の最良値は 0.40 で基底 0.44 を下回るため登録しない。後方ドーム（大円盤）の傾きを 0.7 rad にした試作は 0.22 に悪化し、戻した。ドームの向きと寸法は未解決。 |
| イグザミナー（`s3-spinner-hypershort`） | Wmn_Spinner_HyperShort | 0.37 → 0.55 | 登録 | 白い箱型タンク、赤いドラム、銀のバイルは形状を目測で近似。アスペクト 1.64 に対し参照 2.12（画像から推定）。 |

## 共通事項
- グリップ: `gripR` は native の `GRIP_PISTOL`。`gripL` は native `(0, 0, 0.1515)` のまま変更していない。その位置に `supportHandle` で前グリップを描いた。hold は native のまま。`weapon-models-all` の支持手テストは通過した。
- マズル: 多バレルの中心前端（`muzzle = (0, ay, 前端 z)`）。splatling 0.456 / quick 0.302 / hyper 0.212 / downpour 0.33 / hypershort 0.242。実機の弾道起点は未確認。
- 動き: native の `trigger` と `barrels`（チャージ/ストリームで回転）をそのまま使う。独自の `animate` は無し。`d.glow`（充電コイル）は、参照 6 点に充電メーターが見えないため全機種で削除した。
- 三角形数: 2129〜4213（上限 12000 以内）。

## テスト
- `WEAPON_IDS=splatling,s3-spinner-quick,s3-spinner-hyper,s3-spinner-downpour,s3-spinner-hypershort node --experimental-vm-modules --test patches/splatoon3/tests/weapon-models-all.test.mjs`: pass 3 / fail 0。
- splatling / spinner 関連テスト 22 本: 全て exit 0。

## 未確認（根拠なしに解消済みにしないもの）
1. 寸法: 全機種とも画像からの目測で、原典データ（Leanny の寸法パラメータ）や実機計測による確認はしていない。（未確認: 実機計測が必要）
2. 保持ポーズ: 検証は `--no-held` のみ。支持手が前グリップに届くかの見た目は、実機スクリーンショットと比べていない。（未確認）
3. 充電表示: 参照に充電メーターが見えないため native coil を削除した。実機で充電表示があるかは未確認。
4. マズル位置: 多バレルの中心前端を弾道起点とした。実機の起点は未確認。
5. ノーチラス47: 未登録。ドームの向きと寸法を要再作業。
6. ダウンプア / イグザミナー / ハイドラント: アスペクトが参照と大きく違う（上の表）。形状の再作業が必要。
