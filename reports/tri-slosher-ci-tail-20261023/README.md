# PR1855 exact784 の必須CI artifact-tail修復候補

基点は `784615eaddd13e1cb4d9dd6bf202990a4aaa6d3f`。保存枝は `codex/tri-slosher-ci-tail-20261023`。PR1855/main/他PRのrefは更新しない。runtime・browser verifier・timeout・flags・校正値は変更しない。

## 確認した失敗

[Validate run39980858842 core job120523763416](https://github.com/rhgrive3/actions/actions/runs/39980858842/job/120523763416) の公式ログを取得した。sourceはexact784。2026-10-23 18:37:44 UTCに、生成物のsub/special fidelity **201 tests / 201 pass / 0 fail / 0 skip** の後、Bash line29で `_site-launch-packets.json: command not found`、exit127になる。

workflowの `Verify emitted sub and special fidelity boundaries` のrun末尾に、artifact filenameとretention指定が残っていた。Bash文法としては成立するため `bash -n` だけでは防げない。

別の [active browser job120523763671](https://github.com/rhgrive3/actions/actions/runs/39980858842/job/120523763671) は18:35:06.5837850にrunner shutdown通知、18:35:07.4962132にbrowser closed、`check-inkwave-idle-resources.mjs:168` のstackとcanceledで終了した。これは中断の記録であり、ヒッセンの機能回帰と証明されていない。成功にも数えず、検証の弱体化・timeout延長・flags変更で修復しない。

公式の全文ログは [logs/](logs/) にUTF-8原文をlossless gzipで保存した。BOM/改行を保持し、解凍後のbytes数・SHA256は [official-log-hashes.json](official-log-hashes.json)。取得したdecoded textのUTF-16長も照合した。[該当箇所の抜粋](official-error-excerpts.txt) は全文とは別。

## 再利用した既存修復と競合範囲

PR1853の `4f69f5f95` の修復と、strict uploadを確定した最新head **`62d6eb3e448d68fe8a41303f344d6a88076aa338`** を読み、次の2ファイルを**最新headとbyte同一**で再利用した。

- `.github/workflows/validate-inkwave-update.yml`
- `scripts/tests/inkwave-wall-diagnostic-workflow.test.mjs`

PR1860最新head `05eb9b8243bfba7e166600990df33ac19bbaa0c2` も比較した。同じ修復に加えてrespawn専用emitted acceptanceとそのcanonical guardがあるため、その差分は取り込まない。PR1853全体の参照QAを上書きせず、基点784にあるc68の閉じたfixtureと追加9-edge試験を維持する。並行workflow最適化やruntimeをmergeしない。[再利用・不変範囲proof](reuse-and-scope-proof.json)。

## 具体的な変更

27suiteのNodeコマンド28行は一切変更しない。run末尾のartifact名とretentionだけを、独立した `actions/upload-artifact@v4` stepへ移す。

- `if: always()`
- nameは `SOURCE_SHA` と `github.run_attempt` にbound
- `path: _site-launch-packets.json`（先行する実生成器の `--out` と同一）
- `if-no-files-found: error`
- `retention-days: 14`

元の7job承認SHA256は変更せず、この正確な末尾修復だけを旧bytesへ逆写像して検査する。旧tailそのものは、元hashに一致しても拒否する。テスト削除、未知path、identity変更、upload不実行、missing-file緩和、余分なshell command、fan-in失敗条件の削除を負例で拒否する。browser suiteの中身は変えない。

## 実行した検証

- 最新の同じ新guardを旧workflowへ適用: **4pass/3fail**。旧tailが回帰で拒否されることを確認した（[負例ログ](logs/tri-tail-old-workflow-negative.tap.gz)）。
- wall / integration / added CI contracts / projectile intro の関連試験: **48/48、fail0/skip0**（[実行ログ](logs/tri-tail-workflow-regressions.tap.gz)）。
- 同じargvを記録するnode stubで、旧runは成功するテストの直後にexit127、新runはexit0、テスト自身がexit73ならshellもexit73。28 command lines・27suite pathsは同一。[shell比較receipt](comparison.json)、[再現コード](check-shell.py.txt)。stubはshell形状・失敗伝播の検証であり、生成物テストを実行したという証拠ではない。
- 新workflowから抽出した [after.sh](after.sh) はPR1853保存済みの実shellともbyte一致。SHA256 `09179baf4f3840162ab74e50b2dce3156b9fb3d18d88880950146a86e177d4f7`。
- そのBashを実際に `bash --noprofile --norc -e -o pipefail` で実行: **201/201、fail0/skip0、exit0**、Node24.19.0、117012ms。Nodeコマンドやflagsはworkflow原文のまま。[実行receipt](real-emitted-replay.json)、[全文ログ](logs/repaired-real-emitted-201.log.gz)。

実201再実行は既存のexact784正規生成物を使い、fresh buildとは言わない。contentHashは `2042ffbbb14645c4f4a4db2188826b7988c4112dcebab1a14915fd2f72e77a07`、inputHashは `578137eac3693d92b6432d17ac9bc4d5e93c6c3a0c943a7a3ed8578625ea09e8`。canonical入力1420件・成果物2110件を全hash再読して一致した。今回のworkflow/guard/reportはbuild入力ではない。

実shellの相対root `_site` とsuite pathsを変えないため、私有scratchに既存サイト・patches/scriptsへのsymlinkを置いた。最初の実行開始要求は作成前のcwdを指定したためprocess開始前に失敗し、mkdir後に実行した。テスト自身の失敗ではない。

## 残る受入

この新commitのhosted CIと実際のartifact upload完了は未検証。active browserの中断も未解消・未合格として残す。CI再送、main merge、force push、他PR編集はしていない。ヒッセンの `.5` は引き続きUNSOURCEDな暫定校正で、本家一致・物理発射角の実測へ言い換えない。
