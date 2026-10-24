# Cold timeout：browser close前のreceipt保存

初版候補 **fa79de6c2b46e7a95272b4d6363552ad64a8e0db** の48件証拠は原状保存した。最終レビューで、cold側の内側finallyが外側の失敗記録より先にbrowserをcloseする順序を発見した。closeが停滞した場合でも取得済み観察を残すため、同じfailure reporterをcold catchからclose前に呼ぶ。実装 **9aa4a6d442a4770df08e72ee6b714eccd3787570**。診断書込失敗も元errorをcauseに保持する。PR1859/mainは更新しない。

実checkerのcold catch/finallyを抽出して、通常closeとclose失敗の2経路を検証した。旧fa79の同じblockでは **0 pass / 2 fail**、修復後を含む全idle/cold回帰は **50/50、fail0/skip0**。timeout receiptが先、cold closeが後で、元timeout errorを保持する。実ブラウザ/GPU結果ではない。

`source-preservation.json` は既存12評価routine、validator、browser flags、6 helper、timeout/sleep値の不変を再確認したもの。`build-input-readback.json` は1420入力・2110成果物と既存正規buildの一致。新build、GPU完走、外部runner shutdown原因の修復は主張しない。Chromium151の403取得拒否は再試行・迂回していない。

再現：`node --test --test-reporter=tap scripts/tests/inkwave-idle-resources-gates.test.mjs scripts/tests/inkwave-cold-observer.test.mjs`。旧候補の負例と全50件のTAPをlossless gzipで保存した。前回の120秒deadline、通常エラーとcleanupの契約、workloadは維持する。browser closeそのものの強制中断は保証せず、外側のprocess/job監督は必要。
