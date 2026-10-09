# Claude引継ぎプロンプト — INKWAVE 武器挙動 Ver.11.3.0

あなたはINKWAVEのスプラトゥーン3 Ver.11.3.0ブキ性能再現を完成させる実装担当です。調査だけで終了せず、コード修正・自動テスト・ビルド・実行時確認・Draft PR更新まで一貫して完了してください。必要な修正件数や調査範囲を恣意的に制限しないでください。

## 作業場所

- リポジトリ：`rhgrive3/actions`、作業対象：**Draft PR #1188** `https://github.com/rhgrive3/actions/pull/1188`
- 作業ブランチ：`wip/weapon-fidelity-1130-offline-20261009`。ベースmainのコミットは `5d0be6b7fdebfd07e696e75497aaa97aa5ff5648`。
- **このPRには今回の修正51ファイル（既存26・新規25）が既にコミットされている。Driveの差分を再適用して二重変更しないこと。** まず現在のPRの実装と残存不一致を確認する。
- 別PRの変更やmainへのマージは依頼していない。勝手にmainを変更・マージしない。既存機能と正常な修正は保全する。
- GitHub操作が制限される環境では、ローカルで直接編集・テストし、Driveに完全な成果物と差分を保存する。読み書き不能を理由に実装修正を止めない。接続できる場合は上記PRブランチへコミットする。

## 利用可能なGoogle Drive資料

同じDriveコネクタから以下を取得できる。

- フォルダ：`INKWAVE-weapon-fidelity-handoff-20261009`
- 元mainからの完全差分：`INKWAVE-5d0be6b7-weapon-fidelity.patch`  
  https://drive.google.com/file/d/1Zquzr99z66g6w9xX5FNpVy-cQuO0lZYe/view
- 変更ファイルのみのZIP：`INKWAVE-5d0be6b7-weapon-fidelity-changes.zip`  
  https://drive.google.com/file/d/1MuAEK6y7RNofwsO30EgK7P3HDaRt_B33/view
- 全ブキ調査報告：`INKWAVE-weapon-audit-20261009.md`  
  https://drive.google.com/file/d/1sQ6NAEB5NuuLE0c1U7iCKOJyMF1eLMef/view
- **ブラスター床塗りの数値比較と再現条件：** `INKWAVE-blaster-floor-parameters-comparison.md`  
  https://drive.google.com/file/d/1a255i0tx0FgmOYlpTOuD6irCwB5RbKXm/view
- テストログ・計測結果：`INKWAVE-validation.zip`  
  https://drive.google.com/file/d/1gKbTTH7k_HwWAJONo2WpMHDfJokkqPlU/view
- ベースソース：`INKWAVE-main-5d0be6b7-core.zip`  
  https://drive.google.com/file/d/1HwpJoZUsMUimxWSRnskZqieNi_8P5mqT/view
- 同じDriveに`INKWAVE-main-5d0be6b7-tools1〜3.zip`、`Splatoon-Decomp-NTSC-thick-plus-Splatoon3-resources`がある。
- 本家11.3.0抽出パラメータ：`https://github.com/Leanny/splat3/tree/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon`

## 最優先：ブラスター床塗りを本家相当に修正

現行ブランチでは床塗りの根本修正は**未実施**。少なくとも次をコードと数値で検証・修正する。

1. `patches/splatoon3/runtime/blaster-flight-paint.mjs`の `raycast(sample, down, 4, ...)` が高さ4.00では中間床塗り7個、高さ4.05では0個になる不連続を作る。4WUという固定切捨ての仕様根拠がない。実際の飛沫の落下・床・斜面・壁衝突と寿命を整合的に実装し、根拠なく「高さ10では必ず7個塗る」とは決めつけない。
2. ホットブラスターの抽出値 `SpawnNearestLength=0.5`、`SpawnBetweenLength=1.5`、`SpawnNum=7`、`WidthHalfNearest=2.43`、`WidthHalf=1.62` は現行設定と一致する。**値を無意味に調整するのでなく実際の塗り生成へ反映する。** 高さ3〜10に連動した長さ倍率およそ1.2→1.0の未適用も確認する。ワールド単位換算の等価性は別途立証する。
3. 通常の飛翔壁飛沫が`trailEvery=0`を通過できず実行されない経路を修正する。射撃/衝突/飛翔中/爆発/時間起爆の挙動を重複や塗り漏れなく接続する。
4. 時間起爆の床への直接塗り半径2.0、落下液滴半径3.2、地形接触時半径2.5は、確定抽出値・実装既定値・推定モデルを区別して吟味する。高さや遮蔽で正しく床・壁・地形に塗るようにする。
5. `inkwave-public/src/world/paint.js` と実行生成コードのCPU所有グリッド、GPUマスク、散布、輪郭・塗り面積が一致することを検査する。単にパラメータが一致しただけでは床塗りの一致判定にしない。

本家の実機撮影・目視測定は上記修正の必須条件ではない。11.3.0抽出値と公開解析資料から確かめられる数値は直接比較し、未公開の塗り形状などは推定を「本家確定値」とせず、検証限界と代替モデルの根拠を記載する。

## 残るブキ性能の不一致も解消

Draft PRと全ブキ監査の `reports/weapon-audit-20261009/`を読み、修正済み項目を二重に変更しない。少なくとも、スピナーのチャージ開始専用減速・2段チャージ/部分チャージ/射撃移動と確率分布、ブラスター爆風ノックバックとオブジェクト倍率、ローラー接触ノックバック/塗り形状、マニューバー空中スライドの落下軌道、ブキ別サブ・スペシャル構成、散布確率と乱数分布、チャージャーの有限弾速/移動曲線、スロッシャー4+5弾/横振り/着弾塗り、被弾/遮蔽/入力キャンセル/同期まで通して確認する。射撃開始・硬直・連射・インク・飛翔・当たり・CPU/GPUの塗り・照準・モーション・音・遅延における残る実装差を修正する。

`patches/splatoon3/`からビルド生成コードへの適用を追跡し、パラメータを更新しただけで終わらず実際の発射→飛翔→衝突→塗り→表示→通信に作用するよう修正する。初代のデコンパイルはロジック参考にしてよいが、3との差分を確認する。公式更新履歴・11.3.0抽出テーブルを優先する。

## 必須検証と成果

本家出典と比較する自動テストを作る。特にブラスターは高さ0/2/3/3.95/4.00/4.05/5/10の水平射撃、段差・斜面・壁・高所落下・時間起爆を固定シードで検証し、塗り生成個数・座標・時刻・面積・CPU/GPUマスク差を保存する。全ブキについて射程、実ダメージ、射撃フレーム、命中分布、塗り幅/面積、チャージ、硬直、歩行/スライド、インク消費、入力キャンセル、30/60/120Hz、通信の決定性・遮蔽を試す。期待値を実装結果に合わせるだけのテスト書換えは禁止。基準元mainとの差を比較し、品質回帰を直す。

修正コードを当該Draft PRへコミットし、テスト/ビルド/生成後検証・CIの結果をPRに明示する。根拠不足・実機確認待ちなど残る事項は分離する。すべて完了した場合のみReady for Reviewへ移す。**mainマージはしない。** 最後に「修正の内容、根拠、本家差分、再現手順、テスト結果、未検証事項、コミットSHA、PR URL」を残す。作業計画や中途報告だけで終了しない。
