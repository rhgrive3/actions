# exact-head active job：runner shutdownの切り分け

PR1859 **2e2bc38661dd49655ee3b4abc491dcc8ee65e8e1** を固定したままの調査。変更はこのreportだけで、checker / runtime / workflow / six-way担当のファイル / PR head / mainを変更していない。

## 公式に確認した停止

| 対象 | job開始UTC | job終了UTC | job時間 | idle step時間 | idle結論 |
| --- | --- | --- | --- | --- | --- |
| [HUD job120574653079](https://github.com/rhgrive3/actions/actions/runs/39986361808/job/120574653079) | 18:50:48 | 19:19:15 | 28分27秒 | 10分19秒 | cancelled |
| [Tri job120523763671](https://github.com/rhgrive3/actions/actions/runs/39980858842/job/120523763671) | 18:01:32 | 18:35:09 | 33分37秒 | 13分13秒 | cancelled |

両方の正確なheadでworkflow blobは `e8aa7e4f3dc01b902aae907a36cc3b26acfc4ef4`、active browser jobの `timeout-minutes` は**120**。したがってconfigured job timeoutに達した停止ではない。先行のrenderer / pose / paint / resources等のstepは成功で、idle stepの後はcancelに伴って未実行になっている。

両ログとも **runner shutdown通知 → 約0.3/0.9秒後にTarget closed → operation canceled** の順で、stackはchecker168行目のGPU情報取得にある。checker blobも両headで同じ `2a7e398ce274e2542f471bcd5b4714e41bce07e0`。ブラウザー終了をgameplay回帰とは判定しない。外部からrunnerが停止されたことは確認できるが、誰/何が停止させたか、host資源障害だったかは公開metadata・取得ログだけでは確定しない。OOMの明示的な証拠も取得範囲にはない。

workflow concurrency groupにはPR番号が入る。別PRのHUDとTriが同じconcurrency groupで互いをcancelしたという説明は、この設定からは支持されない。manual cancellation / runner service停止等の区別にはrunner側の停止理由が必要で、ここでは推測しない。job全体はfailure、idle stepはcancelledという別々の値を保持している。

## checker sourceの確認

`scripts/check-inkwave-idle-resources.mjs` と `scripts/tests/inkwave-idle-resources-gates.test.mjs`、cold observer、上記exact-head workflowを読んだ。PLAYING 120 frame＋RESULTS 120 frameの実 `Game._frame(1/60)` 呼出しは有限。GPU情報取得はその後の実 `gl.getExtension/getParameter` であり、外部shutdownまでのstackだけでは、この呼出し自体の不具合と先行GPU処理待ちを分離できない。ReadPixelsのstall warningは記録されているが、fatal GPU failureの証明ではない。

既存 `page.setDefaultTimeout(120000)` は `page.evaluate` の待機を制限しない。インストール済みPlaywright1.62.1のFrame.evaluateはchannelへ `kNoTimeout` を渡す（`lib/coreBundle.js` の60006行付近）。このためGPU/JSのevaluateが返らなければ、default timeout120秒では終わらない。反復数が有限であることと、外側の待機にdeadlineがあることを混同しない。

もう一つの観察点は、進行中receiptが開始時の `phase: identity` のまま更新されないこと。途中のphase変数や完了した結果は、成功/失敗catchまでdisk/logへ出ない。長いGPU処理と外部停止を細かく分離しにくいが、これだけを根拠にworkload・flags・timeout・判定条件を変更していない。現時点でruntime correctionを正当化する再現はない。

## ローカル確認と限界

- 既存source/schema/cold-observer gateは **34/34 pass、skip0**。これはGPU受入ではない。
- CIと同じChromium151.0.7922.34 / Playwright build1234は未配置だった。公式CLIの1回のinstall呼出しがCDNの **403 Domain forbidden** で失敗した（CLI内部のretryも原ログに残る）。以後、再取得・別mirror経由の取得はしない。このexact browser binaryでのローカル再現はblocked。
- 代わりに既設Chromium154を明示して、未変更checker＋正規production buildを実行した。buildはcontentHash `fb5f0fab676d92749db0e02f332770530eb930b6c6d7590ec0e926dd3715c5d7`、`--exact-source` の入力/生成物照合を保った。4つのbrowser flags、default timeout120秒、cold wait180秒、全frame数・cloud/far/pause/audio/RESULT判定を変更していない。
- 最初の未変更runは **約458.5秒で診断者が手動停止**。receiptがidentityのままで停止位置が分からず、自然失敗ともpassとも数えない。
- 次はNode側で既存evaluate/goto/wait/screenshotのbegin/endだけを観察した。boot wait約54.02秒、audio約0.682秒が完了し、**cloud appearanceのWebGL readbackを含むevaluateが約194.60秒pending**と分かった。このrunも約255.5秒で手動停止し、未完了として保存した。CIの168行目までは到達していないので、同じ停止を再現したとは言わない。
- ローカルsamplingではGPU processがCPUを使い続け、RSSは約0.54GiBで推移した。deadlockやOOMの証明ではない。観察後は両runの所有processを終了し、背景の診断browserを残していない。

GPU成功、cold allocation、全検査完了を捏造しない。partial recordの元 `status: running` は原本どおり保持し、別のmanual-stop receiptで未完了と明示する。本家参照403と今回のbrowser download403は、対象が異なる別のアクセス拒否である。

## 引継ぎ用の結論

新headのactive blockerは、取得証拠上はconfigured120分timeoutではなく、runner shutdownに伴うcancel。停止主体・host理由は未確定。checkerにはdeadlineのないevaluate待機と途中receipt不足があるが、ここを変更して通過扱いにはしない。現段階の候補は**report-only**で、timeout増加、frame数削減、skip、GPU identityの代用、六並列担当のworkflow編集は含めない。

必要な残確認は、runnerの停止理由と、pinned Chromium151が利用可能な環境での未変更idle checker完了である。既存validation/flags/workloadを保ったphase観察の追加はその担当へ渡せるが、未完了のローカル154結果を代わりのGPU受入にしない。

`official-summary.json` に公式時刻・結論・必要な原文抜粋、`local-observations.json` に手動停止と観測の区別、`source-gates.tap.gz` にsource34件、`traced-calls.jsonl` に観察記録を保存。全原本・診断用adapterは `/workspace/scratch/reticle-idle-ci-20261023/` に保持し、SHA256を `provenance.json` に記録した。公開ref/tree/本文の読み戻しは親への最終報告を正とする。
