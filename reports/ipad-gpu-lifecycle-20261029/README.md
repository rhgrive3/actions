# iPad の画面遷移と GPU 資源寿命の監査

基点: `e67c636b81762df56b346a09ef570964d43084df`（2026-10-29 に取得した main）。ユーザー報告は「バトルを一時停止して終了すると iPad でグラフィックが落ちることがある」。実機のクラッシュログや機種情報は提供されていないため、GPU 資源の保持・重複と遷移の競合を再現可能な範囲で確認した。実機クラッシュの原因確定や、全機種での解消を表す記録ではない。

## 検出した問題と変更

| 経路 | 修正前に確認した問題 | 修正 |
| --- | --- | --- |
| iOS の一時停止 → 再開／終了／別画面 | 履歴を先に置き換えた後で一時停止を判定するため、退出時の GPU 負荷保護が外れる。旧 DOM が 340 ms 残る | 履歴更新前に退出元を保存し、iOS の停止メニューの出入りではワイプを抑止して旧画面を同期削除 |
| メニュー演出が進行中の一時停止 | 新しいワイプの抑止だけでは、既に動作中の Canvas と遅延 swap が残る | swap token を失効させてから既存ワイプを cancel。古い onMid が旧画面を再表示できない |
| 停止中のリサイズ／画質変更／再キャプチャ | 古い停止画像を保持したまま実描画のターゲットを復元し、さらに新画像確保まで HDR ターゲットを保持する | 古い画像 → 実描画 → HDR/MSAA ターゲット解放 → 新しい停止画像確保の順に変更 |
| 停止したページをバックグラウンドへ移す | RAF が止まるため、停止画像がイベントなしには解放されない | canvas の document の visibilitychange でも画像を解放し、復帰後のキャプチャを無効化。canvas 交代時に旧 listener も解除 |
| 演出終了／キャンセル後 | clearRect は全画面 Canvas の大きい backing store を解放しない | 演出終了時に 1×1 に戻す。onMid/onDone が次の演出を開始したときはその資源を消さない |

演出以外のゲーム進行、ブキ・ギア・移動・射撃・塗り・判定の数値は変更していない。スプラトゥーン3の比較条件は既存記録の Ver.11.3.0 を引き継ぐ。元ゲームの実機との終了操作比較は未実施。

## 確認範囲

- 最適化ビルドの実 Menus / InkWipe / Renderer を Chromium 154 と Linux WebKit 26.5 で検証。オフラインのメニュー API と固定の小さな WebGL シーンを使用。
- 各ブラウザで停止／停止内の設定からの退出を計72回、実際の終了確認ボタン操作、既存ワイプのキャンセル、full/light/fade の自然終了を確認。
- 各ブラウザで12回の縦横リサイズ・解像度倍率変更・停止画像取得・次のブラウザフレームでの表示・再開を実行。各回の完成画面の全 RGBA チャンネルを比較し、計6,480,000チャンネルに差なし。黒画面での偽陽性も拒否。
- 各回の GL 資源は描画後の texture 2 / renderbuffer 1 / framebuffer 2 から、停止画像取得後は 1 / 0 / 0 に戻る。繰り返しで増加せず、最後の所有資源解放後は全て0。これはブラウザの GL ハンドル数であり、物理 GPU の使用メモリ計測ではない。
- RAF を挟まない visibilitychange で停止画像とキャプチャ済み状態を解放。context loss 後も既存の再読み込み案内が出る。実際のタブ移動イベントの代わりに visibilitychange を合成しているため、実機のバックグラウンド挙動は別途確認が必要。
- 実際の練習場 Game でも Chromium のソフトウェア WebGL で、停止 → LOW/HIGH 画質変更 → 再開を6回繰り返し、最後に停止状態からメイン画面へ終了。停止中の試合時間とプレイヤー座標の不変、再開／終了時の画像解放、GL エラー0、ページ例外0を確認。これはローカル練習場の確認であり実対戦ではない。
- 同種の所有権を持つポートレート、非表示スタジオ、リザルト、composer の再生成、影・レンズの保持、通常メニューへの復帰もコードと既存回帰で確認。隠れたスタジオの破棄、非同期ポートレート読出し中の解放延期、オフスクリーン compositor の資源保持は既存の契約を維持。

## 回帰と再実行

新規・拡張21ケースは基点の main にテストだけを移植すると16失敗／5成功、修正版では21成功。修正前の保持・解放順・退出時判定を実際に検出する。`memory` suite に新規 GPU 寿命テストと iOS 遷移テストを追加した。

| コマンド／確認 | 結果 |
| --- | --- |
| `node scripts/ci/run-inkwave-test-suite.mjs memory` | 98成功、失敗・skip 0 |
| `node scripts/ci/run-inkwave-test-suite.mjs quality` | 43テスト成功、後続の AO・geometry・topology 検証も終了コード0 |
| `node scripts/ci/run-inkwave-test-suite.mjs runner-contracts` | 24成功 |
| 関連する停止シミュレーション・renderer resize・影設定・レンズ等6ファイル | 51成功（上記と一部重複） |
| `node --test scripts/tests/inkwave-test-suites.test.mjs` | 7成功 |
| quick パッチ互換性・source migration audit・最適化ビルド・起動予算検査・`git diff --check` | 合格 |

ブラウザ検証コマンド（ビルド後）:

```sh
node scripts/build-inkwave.mjs inkwave-public work/ipad-site
CHROMIUM_PATH=/usr/bin/chromium node scripts/check-inkwave-ipad-gpu-lifecycle.mjs --site work/ipad-site --out work/chromium.json
node scripts/check-inkwave-ipad-gpu-lifecycle.mjs --site work/ipad-site --browser webkit --out work/webkit.json
CHROMIUM_PATH=/usr/bin/chromium node scripts/check-inkwave-ipad-game-lifecycle.mjs --site work/ipad-site --out work/game.json
```

Playwright と対象ブラウザが必要。今回の WebKit は system install 権限がなかったため、Debian の追加共有ライブラリを作業ディレクトリ内に展開した。動的ライブラリ検出が private bundle の GLES を検出できないため、起動時だけ `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` を使用。WebKit 本体の起動、実描画、画素比較、GL エラー・資源数・回復 UI の検査は全て実行した。テストの失敗条件は外していない。

検証 JSON: [Chromium](chromium.json)、[WebKit](webkit.json)、[練習場](game.json)、[検証集計・実装ハッシュ](verification.json)。各 JSON に contentHash・inputHash・ビルド版の識別子（revision）と `physicalDeviceVerified: false` を保持している。revision はアセット版の識別用ハッシュであり、Git のコミット SHA ではない。実装コミット `46d3792c3` から再ビルドし、検証候補との inputHash・contentHash・全 artifacts の一致を再確認した。基点だけの検証結果を意味しない。

iPad 実機の Safari / GPU プロセスの終了、WebGL context loss の実際の頻度、他端末とのオンライン対戦、全ステージの長時間対戦は未測定。公開・マージはこの作業では行っていない。
