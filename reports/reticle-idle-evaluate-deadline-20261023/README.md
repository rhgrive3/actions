# Idle evaluate：既存120秒を実際の待機にも適用するQA候補

親確認用branch `fix/inkwave-idle-evaluate-deadline-20261023`。基点は固定中の **2e2bc38661dd49655ee3b4abc491dcc8ee65e8e1**、最終実装commitは **1c3b3c9b924c86fcb2d85e91dc607278b53229df**（core 15b8636 / 既存CIへの登録 e65d447 / 実setup回帰 1c3b3c9）。PR1859/main/既存検証headは更新しない。変更はidle checker、新しい専用test、既存idle gateへのtest import 1行、このreportだけで、production runtime / workflow / six-way担当のファイルには触れない。

## 欠陥と変更

既存 `page.setDefaultTimeout(120000)` はPlaywrightの `page.evaluate` を制限しない。[前の調査](https://github.com/rhgrive3/actions/blob/a449840864df44428c8cb6c063a09fc6b4b736ff/reports/reticle-idle-runner-shutdown-20261023/README.md)では、実production source上のcloud評価が120秒を越えてpendingになることを観察した。ここではその待機の欠陥だけを修復する。

- desktop / cold pageのevaluateをhost側の **120000ms** deadlineで包む。既存値を共通constantにし、値を上げる設定は追加しない。callback・引数・this・通常の返値はそのまま委譲し、timerは成功・失敗・timeoutのすべてで解放する。
- timeoutは `INKWAVE_IDLE_EVALUATION_TIMEOUT` の失敗。呼出し時点のphaseを保持する。通常evaluateが投げたErrorは同じobjectのまま再throwし、後から来たTarget closedやlate resolveで失敗receiptを上書きしない。
- 取得済みのresult / errors / loaded paths / source identityを **failed receiptとしてcleanup前に保存**。timeout後に応答しないpageへ追加のevaluate/screenshotを要求しない。これは診断呼出しの抑止で、validationのskip/pass化ではない。
- 所有browserとHTTP serverのcleanupを試みる。browser cleanupが失敗してもserver cleanupを行い、元エラーをAggregateErrorのcauseとして残す。診断書込の失敗も元エラーを消さない。成功receiptはvalidatorとcleanupが完了してからだけ書く。
- cold route中のevaluateが先に失敗した場合は、そのエラーを後続navigationエラーで置き換えない。GPU情報取得には `gpu-identity` phaseを付ける。既存の短いcold診断10秒、screenshot15秒、cold readiness180秒は維持する。

これはevaluateのhost側deadlineであり、GPU命令の同期的な中断を保証するものではない。cleanupは既存のbrowser APIを使うので、外側のprocess/job監督も引き続き必要。**外部runner shutdownの原因を直したとは主張しない。**

## 決定的な検証

**48/48 pass、fail0、skip0**。新しいwatchdogテスト14件と既存schema / cold-observer 34件を実行した。実時間で2分待たず、注入したclockを119999ms→120000msへ進めて境界を検証する。productionでは通常のNode timerを使う。

新テストはnever-resolving evaluate、通常の同期/非同期失敗、通常成功、timeout後のlate resolve/reject、元エラー＋cleanup失敗、診断disk書込失敗、browserとserverの両cleanup失敗、二重guard、falsy throw、循環cause、実cold routeの最初の評価エラー保持、実desktop setupの最初のevaluateへのdeadline登録を含む。通常失敗のobject同一性、timeout時の保存→browser close→server close、timer残存0、cleanup失敗時に成功を書かないことを確認する。component doubleをGPU受入とは呼ばない。

`timeout-receipt.json` / `replay-summary.json` は実helperをfake clockで動かした **source componentの失敗証拠**。`isGPUAcceptance:false` とし、GPU fieldや架空のWebGL成功値は入れない。`wiring-final.tap.gz` が最終48件、`ci-route-final.tap.gz` / `focused-final.tap.gz` は中間47件、最初の46件も保存した。既存CI selectorからimportされるのでworkflowの試験選択を変えない。旧2e2の実desktop setupへ同じ回帰assertionを適用すると1件失敗し、実装後は成功する（`old-desktop-setup-negative.tap.gz`、選択実行の13件非選択は受入のskipとは別）。

## 評価処理内のloop調査（別の結論）

避けられる無限loopは、checkerの評価routine内には見つからなかった。明示的な反復はaudio toggle10回、cloud3 themeと256×80×4 byte走査/PNG80行、far遷移4回、warmup270 frame、pause120 frame、online3 frame、PLAYING/RESULTS各120 frameなど有限。native world buildやGPU readbackは待ち続ける可能性があるが、それを理由にproduction挙動やworkloadを変えていない。

ASTで基点と比較し、**12個の評価routine、validator、browser flagsがbyte一致**することを確認した。cold allocation observer等の既存6 helperも同一。明示timeout/sleep値 `[180000,200,400,180000,10000,15000]` も同一。`source-preservation.json` に最終実装のhashと結果を保存した。`audit-source.cjs` で再検証できる（Node付属parser、追加download不要）。frame数削減、人工GPU成功、assertion削除、skip追加、timeout引上げはない。

## 入力同一性と残るgate

runtime canonical1420入力 / 2110生成物は固定headの既存buildと同じ。全入力をGitへ結び、全生成物を再hashした（`build-input-readback-committed.json`）。新buildやbrowser計測は行っておらず、runtime差分がないという証拠である。

Chromium151の取得は前回の403拒否のままで、再ダウンロード・迂回は行わない。今回の候補はdeterministic source/QA受入であり、実browser/GPU完走やnew-head remote CI成功を主張しない。runner shutdownの停止主体・host資源原因も未確定のまま。PR1859への適用は親の独立差分確認後とする。

`commands.txt` は再実行方法、`provenance.json` は原ログ展開bytesと公開証拠のSHA256。失敗receipt、元source snapshot、中間TAP等の原本を `/workspace/scratch/reticle-idle-deadline-20261023/` に保持した。公開ref/tree/blobの読み戻しと最終SHAは親への最終報告を正とする。
