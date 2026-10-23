# PR1859：emitted試験後のartifact-tail修復候補

固定基点 **2e2bc38661dd49655ee3b4abc491dcc8ee65e8e1**。実装は **2f48821a917b1a3bd8c981b6d774520add17c11e**、保存枝 `fix/inkwave-pr1859-artifact-tail-20261023`。PR1859/mainは更新しない。watchdog候補は別commit・別branchに保持する。

[公式core job120574652780](https://github.com/rhgrive3/actions/actions/runs/39986361808/job/120574652780) は2026-10-23 19:23:02 UTC、201 tests / 201 pass / 0 failの後、Bash line29で `_site-launch-packets.json: command not found`、exit127となった。公式ログを取得し、該当箇所を `official-core-excerpts.txt` に保存した。これは全ログではない。

既レビュー **4d6166936eaa8058a8b936053992960b510eec88** の対象2葉を再利用した。修復前の2葉は2e2とdonor親で同じblob、修復後はdonorと同じblobである。donorのruntime、基点、他reportや他PRの変更は取り込まない。

- `.github/workflows/validate-inkwave-update.yml`：run末尾のartifact名とretention指定を独立した `actions/upload-artifact@v4` へ移す。`if: always()`、SOURCE_SHA/run_attemptを含むname、実生成器と同じpath、`if-no-files-found: error`、retention14日を保持する。
- `scripts/tests/inkwave-wall-diagnostic-workflow.test.mjs`：元の7 job hashを変えず、正確な修復だけを旧bytesへ逆写像して比較する。旧tail自体は元hashでも拒否する。upload不実行、path/name変更、missing-file緩和、テスト削除、余分なshell命令、fan-in条件削除も負例で拒否する。

検証結果：新guardを旧workflowへ適用すると **4 pass / 3 fail / 0 skip**。修復後のwall / integration / added CI contracts / projectile intro試験は **70/70、fail0/skip0**。

`check-shell.py` は実workflowからBashを抽出する。Node stubによるshell試験では旧exit127→修復後exit0、Node自身のexit73はshellへ伝播する。28行・27 suite pathsとargvは同一。stubは実emitted試験の代用ではない。

別途、その抽出した正規Bashを `bash --noprofile --norc -e -o pipefail` で実行し、**201/201、fail0/skip0、exit0** を確認した（Node24.19.0、172762.382852ms）。flags、suite順、`INKWAVE_BUILT_SITE=_site`、相対pathは原文のまま。実shell SHA256は `09179baf4f3840162ab74e50b2dce3156b9fb3d18d88880950146a86e177d4f7`。

このemitted再実行は固定headの既存正規buildを使い、fresh buildやbrowser/GPU実行とは呼ばない。`audit-scope.mjs` は1420 canonical入力をGitと既存manifestへ結び、2110成果物を再hashし、contentHash **fb5f0fab676d92749db0e02f332770530eb930b6c6d7590ec0e926dd3715c5d7** の一致を確認した。builder、runtime、参照QAのc68修復と追加9-edgeも保持する。最初の補助auditは末尾改行をtrimして不一致になり、Gitのraw bytes比較へ直して検証した。製品/workflowの追加修正はしていない。

再現はworktree rootから `node --test scripts/tests/inkwave-wall-diagnostic-workflow.test.mjs scripts/tests/inkwave-integration-workflow.test.mjs scripts/tests/inkwave-added-ci-contracts.test.mjs scripts/tests/inkwave-projectile-intro-ui.test.mjs`。scopeの再読は `node reports/reticle-artifact-tail-20261023/audit-scope.mjs /path/to/existing/site`。shell再現は `python3 reports/reticle-artifact-tail-20261023/check-shell.py /path/to/worktree /new/private/output`。

実際のhosted artifact upload、新headのCI、browser/GPU完走は未確認。別browser jobの外部runner shutdown原因も未確定で、このtail修復やwatchdogがその原因を修復したとは主張しない。Chromium取得403は迂回せず、再downloadも行っていない。原本・中間出力は `/workspace/scratch/reticle-artifact-tail-20261023/` に保持した。
