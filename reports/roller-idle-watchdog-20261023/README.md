# PR1856固定headからのQA watchdog単独port候補

2026-10-23。baseは `433299cb5e1518458e00f520d0a9845baa560db3`。公開Draft PR1856のheadを更新せず、別branch `qa/roller-idle-watchdog-20261023` に保存するレビュー用候補。runtime・motion・shared IK・grip・spawn/reset/landing・geometry・paint/gameplay・workflowは変更していない。

## 原ログと確認できた範囲

対象は [exact433299 active job120639734641](https://github.com/rhgrive3/actions/actions/runs/40011720962/job/120639734641)。resources結果は20:48:59.152 UTCに同head/contentHashでpass。その直後、20:48:59.171 UTCに次の操作が始まった。

```sh
node scripts/check-inkwave-idle-resources.mjs --site .built-site/_site --evidence-dir "$CI_STORAGE/evidence/idle-resources" --profile-dir "$CI_STORAGE/cache/idle-resources" --exact-source
```

20:55:47.997 UTCにrunner自身がshutdown signalを報告し、その後に `page.evaluate: Target page, context or browser has been closed`、旧checker168:25のstackが出た。この行はGPU identityのevaluateだが、そこへ到達した時間や外部shutdownの原因は記録から確定できない。Roller motionのassert失敗と扱わない。再実行はしていない。

取得したdecoded原ログはUTF-8 BOMも含む239,983bytes、SHA256 `1476e69a3c56f41abacfde00b9c9a29359615786230f1ebecf190b94b81b54fb`。workspace原本を `/workspace/actions/.roller-recovery/watchdog-port-20261023/original-job120639734641.log` に保護し、公開用には[必要行だけの抜粋](checks/original-shutdown-excerpt.log)と[identity](checks/original-log-identity.json)を保存した。

## exact donorの範囲

レビュー済みHUD donor `2d164d063050c15266febcb6af88109938f26701` の次の3ファイルだけを同一blobで移植した。GitHub公式treeのreadbackでも一致した。

| path | Git blob |
| --- | --- |
| `scripts/check-inkwave-idle-resources.mjs` | `bc5ad497b0b2d3e5f21e792d9c0ced0608b822d9` |
| `scripts/tests/inkwave-idle-evaluate-deadline.test.mjs` | `0dcb6fe498086c81a2c5218347ca7cd8f451274f` |
| `scripts/tests/inkwave-idle-resources-gates.test.mjs` | `d384824f3ac170167db9ff5e3dd0a62ee77e7518` |

Playwrightのevaluateに対して、既存setDefaultTimeoutと同じ120,000msのNode側deadlineを付ける。期限時はphaseと取得済み結果をcleanupより先に保存し、元エラー・診断失敗・cleanup失敗を失わない。遅いevaluateの解決でfailed receiptをpassへ上書きしない。timeoutしたpageへ追加のscreenshot/evaluateを送らない。cold経路も既存観測結果をcloseより先に保存する。

このdeadlineはGPUやevaluateを強制中断する機能ではなく、browser.closeの完了保証もない。外部shutdownの原因修復やhosted CI成功を主張しない。HUD runtime、artifact-tail/workflow repairは取り込んでいない。

## 実際に完了した検査

```sh
node --check scripts/check-inkwave-idle-resources.mjs
node --test scripts/tests/inkwave-idle-resources-gates.test.mjs scripts/tests/inkwave-cold-observer.test.mjs
node reports/roller-idle-watchdog-20261023/verify-port.mjs
git diff --check
```

既存判定・cold observer・deadline関連は[50/50 pass](checks/watchdog-tests.tap)。実checkerのdesktop setupを切り出した未応答page doubleでは、旧版は120秒の既定値を設定してもhost timerが0でpendingを継続し、候補は同じ120秒で `INKWAVE_IDLE_EVALUATION_TIMEOUT` を返した。これは旧版で失敗／候補で通るQA supervision回帰であり、実ブラウザやGPUの受入ではない。

[再現helper](verify-port.mjs)と[source preservation](checks/source-preservation.json)に、evaluate callback12本、既存6関数（validator含む）のbyte一致、browser flags一致、既存明示timeout6値一致、runtime/workflow差分0を保存した。最終head433299のproduction treeとmain7e保持はそのまま。

## 別保存の30Hz結果と残るgate

30Hz実ブラウザ18caseは先に完了し、別の[証跡commit6a6535cdc](https://github.com/rhgrive3/actions/commit/6a6535cdc29cbf757f3c8e38eb3a65ed79c54884)に保存済み。通常・early40/46・短再押下・late52・無入力の、main30／候補30／候補60。canonical・physical paint・native31/56tick期限・対応native時点の実描画poseは一致した。

保存済み30Hz画像も再確認した。通常49では候補drumが床近くの横向き、51では胴体前を斜めに通る。early49–51ではdrumが顔・胴体の大部分を遮る。55ではnative ready側へ近づく。短再押下55・late55・無入力65の武器姿勢は元と一致する。既存avatar/gear/palette/cameraは記録照合済みだが、FXと背景は全画面一致しない。これを本家一致やsilhouette承認とは扱わず、motionを追加調整していない。

30Hzのstrict FX/RNG比較7失敗、55–57のsettlingを含む全体の見た目、本家参照403、元の120Hz screenshot timeout、必須CIが未解消。旧120Hzを再実行せず、flags/timeout/粒子描画を変更していない。このQA候補も実hosted/GPU完走は未検証。PR/mainへ適用する前の独立レビューが必要で、PR1856はDraft/head433299のまま。
