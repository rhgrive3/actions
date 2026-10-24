# PR1859：独立したQA修復の合成候補

固定基点 **2e2bc38661dd49655ee3b4abc491dcc8ee65e8e1**。branch `candidate/inkwave-pr1859-qa-repairs-20261023`。検証した実装headは **0ffb2c4de5095c69029baf252a469c1f84517934**。このreport追加だけを後続commitにする。PR1859/mainは更新しない。

変更は次の独立候補の合成で、製品runtimeを変えない。

| 候補 | 独立head | 変更 |
| --- | --- | --- |
| 既存120秒のevaluate deadline | [39866a132c4e295b949787d757097d054511b10e](https://github.com/rhgrive3/actions/commit/39866a132c4e295b949787d757097d054511b10e) | idle checker、専用test、既存gateのimport |
| artifact-tail | [d7bae63fe40bc87511f659075a093fada9cab56c](https://github.com/rhgrive3/actions/commit/d7bae63fe40bc87511f659075a093fada9cab56c) | workflowのupload step、対応guard |

watchdogのcore修復は15b8636 / CI登録e65d447 / 実setup回帰1c3b3c9 / cold保存順9aa4a6d。artifact-tailの独立実装は2f48821、合成内はe18e9ff。各commitは分離して保持する。元候補fa79の48件証拠、cold順序修復前の負例、初回合成118件の中間ログも保持する。

合成の正規焦点試験は **120/120、fail0/skip0**：idle/cold50件とworkflow関連70件。`focused-final-120.tap.gz` に全文TAP。旧2e2の実desktop setupではdeadline登録の1件が失敗し、旧fa79のcold順序は2件失敗する。新guardを旧workflowへ適用すると4pass/3failになる。負例は各独立reportに保存している。

artifact-tailの正規Bashは独立候補で **201/201、fail0/skip0、exit0** を実行済み（既存正規emitted build、fresh buildではない）。合成でそのsuite・shell・canonical入力は変わらないので再実行したとは言わない。Node stubの旧exit127→新exit0、およびNode exit73の伝播は実emitted試験と区別する。

`source-identity.json` は5 source葉が各独立候補と同じblobであることを確認する。`scope-proof.json` はdonor4d616693のworkflow/guardとbyte一致、元7 job pins維持、対象外source差分なし、1420入力とbuilderの2e2同一性、2110成果物のhash再読を確認する。contentHashは **fb5f0fab676d92749db0e02f332770530eb930b6c6d7590ec0e926dd3715c5d7**。参照QAのc68修復と追加9-edgeも同一blobで維持する。

`source-preservation.json` は12評価routine、validator、6既存helper、browser flags、timeout/sleep値が変更前とbyte一致した証拠。無限loopは評価routine内で見つからず、既存の有限workloadを削減していない。120秒deadlineはhost側の失敗判定であり、GPU処理やbrowser closeの同期的な中断を保証しない。timeout診断はcleanup前に保存し、元errorとsecondary errorを保持する。

実際のhosted artifact upload、新head CI、browser/GPU完走は未確認。Chromium151の取得403は再試行・迂回しない。外部runner shutdownの原因も不明で、今回のQA修復が原因を解消したとは言わない。Nintendo retail参照拒否も別の未確認事項として維持する。原本は `/workspace/scratch/reticle-qa-repairs-20261023/` と各独立候補のscratchに保存した。

再現：`node --test --test-reporter=tap scripts/tests/inkwave-idle-resources-gates.test.mjs scripts/tests/inkwave-cold-observer.test.mjs scripts/tests/inkwave-wall-diagnostic-workflow.test.mjs scripts/tests/inkwave-integration-workflow.test.mjs scripts/tests/inkwave-added-ci-contracts.test.mjs scripts/tests/inkwave-projectile-intro-ui.test.mjs`。scopeは既存artifact-tail reportのaudit-scope、評価処理は既存idle reportのaudit-sourceで再読できる。
