# HANDOFF: シューター B 群（shooters-b）

## 現状（ディスク上）
- 実装: `patches/splatoon3/runtime/weapon-models/shooters-b.mjs`（MODELS 7 件、registry は既に 'shooter' 家族で登録済み）。
- ビルド・レンダー成功（iterate exit 0）。三角形 1.8k〜3.9k（上限 12k 内）。
- 手続き的ジオメトリのみ。ヘルパー（px / raked / supportGrip / side / sideTube / capLathe / nozzlenose）は shooters.mjs から複写。shooters.mjs と kit.mjs は未変更。
- 専用モジュール（*.mjs 追加）は無し、preload 追加は不要。
- 出力先: `$SP/it-shooters-b/`（silhouette.json、<id>.compare.jpg、site/）。ログ `$SP/it-shooters-b.run.log`。`--no-held` で描画。

## IoU（ラウンド 1、正面 3d.png のシルエット基準）
| id | 本家モデル | before | after | aspect ours/ref |
| --- | --- | --- | --- | --- |
| s3-shooter-expert | Wmn_Shooter_Expert | 0.339 | 0.617 | 2.452 / 2.398 |
| s3-shooter-heavy | Wmn_Shooter_Heavy | 0.391 | 0.603 | 1.845 / 1.923 |
| s3-shooter-long | Wmn_Shooter_Long | 0.280 | 0.708 | 2.131 / 2.120 |
| s3-shooter-quicklong | Wmn_Shooter_QuickLong | 0.423 | 0.777 | 1.738 / 1.838 |
| s3-shooter-triplequick | Wmn_Shooter_TripleQuick | 0.395 | 0.640 | 1.444 / 1.471 |
| s3-shooter-triplemiddle | Wmn_Shooter_TripleMiddle | 0.343 | 0.693 | 1.705 / 1.900 |
| s3-shooter-flash | Wmn_Shooter_Flash | 0.426 | 0.818 | 1.673 / 1.689 |

## 決定事項（スケール・色・ink・グリップ・銃口）
- スケール: s = 0.11 / 持ち手長（参照 px）。持ち手中心を原点。
  - expert: 56px, 中心(192,253)、heavy: 88px, (88,236)、long: 63px, (120,250)、quicklong: 66px, (118,265)
  - L3: 100px, (60,268)、H3: 84px, (36,262)、flash: 64px, (36,274)
  - 参照は透視図なので、持ち手の長さは 3d.png 上の見かけで決めた（本家の実寸は未確認）。
- 形状: 3d.png の側面プロファイル（alpha の列ごとの上下端）を直接トレース。回転シートは expert（FRZ-N 別カラー）と heavy（紫の別キット）で形状確認のみ。
- ink（チーム色）: heavy のタンクのみ mat 'ink'（回転動画で紫＝チーム色に見えるため）。他は body 材。
- 'can' 割当（脈動はネイティブ can の scale パルス）: expert=銀タンク、heavy=白タンク(ink)、long=上部ハウジング、quicklong=白リアタンク、L3/H3=リールのコア（ink ホース想定、未確認）、flash=白いボトル。
- 'bolt' / 'led' は未割当（不可視）。
- 銃口(muzzle): expert (0,183)→z392 / heavy y184 z397 / long y161 z396 / quicklong y237 z384 / L3 y142 z377 / H3 y159 z388 / flash y163 z392（3d.png の先端中心）。
  - **挙動に関わる変更**: 弾の発射起点が変わる（AGENTS.md の挙動比較対象）。本家の実機比較は未実施、未確認扱い。
- 支持手(gripL): expert 銃身下の前方 / heavy 銃身下 / long 上部ハウジング下 / quicklong 白い小判状ハンドガード / L3 リール下 / H3 リール下寄り / flash ボトル首下。ゲーム画面の持ち方とは未照合。
- グリップ: pistolGrip（raked）。rake=持ち手の傾き（上が前）。PISTOL_RAKE を引いて渡す。

## 残作業（順序どおり）
1. `$SP/it-shooters-b/<id>.compare.jpg` を 7 件それぞれ 1 回ずつ確認（経済モード）。
   - 要調整候補: H3（aspect 1.705 vs 1.90、全長/高さ比のずれ）、heavy（1.845 vs 1.923）、expert / L3 の IoU 0.62〜0.64。
   - 2 ラウンド目まで。ラウンド 2 は 1 回の iterate.sh で 7 件まとめて実行（outdir は `$SP/it-shooters-b`、既存を上書き可）。
2. 持ち方の確認（任意、最後に 1 回）: `iterate.sh` を held 付き（--no-held なし）で 7 件まとめて実行。
3. テスト: `node --experimental-vm-modules --test patches/splatoon3/tests/weapon-models-all.test.mjs`（約 45 s）。ロラー/ブラシの ID のみ失敗なら他エージェント担当として報告。shooter 系テストは `ls patches/splatoon3/tests | grep -i shooter` で確認（モデル専用のテストは無い）。
4. 文書: `patches/splatoon3/reference/weapon-models/shooters-b.md`（日本語、行 1 つ/銃）。本家ファイル名: `File:S3 Weapon Main <英名>.png`、回転動画: `S3 <name> model rotating.mp4`。未確認の一覧を入れる。
5. 未確認（文書に必ず書く）:
   - 回転シートは quicklong / triplequick / triplemiddle / flash / long は未読（3d.png のみ）。
   - Nova の白タンクの紫の模様、Squeezer の赤白ストライプは未実装。
   - 持ち手長・スケールは透視図から推定（本家実寸未確認）。
   - 各 'can' の脈動対象は推定（本家のインクタンク位置は未確認）。
   - 支持手の位置はゲーム画面と未照合。
6. 報告（lead 向け）: 銃口 socket の移動は挙動差分記録 `reports/inkwave-splatoon3-behavior-2026-10-02.md` の更新対象。自分の許可範囲外のため未更新。コミットはしない。

## 既知の失敗・注意
- 今回のレンダーは held 無し（--no-held）。持ち方は未確認。
- 参照 3d.png と側面レンダーの比率は完全一致しない（透視図のため）。IoU は回帰指標。
- テストは未実行。
