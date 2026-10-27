# 終了した単発 workflow

固定コミット・固定 run ID・特定の診断ブランチを使った単発検証を、GitHub Actions の現役一覧から分離しました。23本の YAML 本文は移動前と同一です。一般の PR・main 更新の回帰テスト、手動 worker、再利用可能な benchmark lane は `.github/workflows/` に残しています。

`compare-post9263-main-benchmark.yml` は、退役した固定 benchmark に依存する `workflow_run` 比較もまとめて保管したものです。

| 保存した workflow | 元の検証 |
| --- | --- |
| [compare-current-hex-vs-ida.yml](compare-current-hex-vs-ida.yml) | compare current hex benchmark vs IDA artifact |
| [compare-pr9263-main-benchmark.yml](compare-pr9263-main-benchmark.yml) | Compare PR 9263 vs main fresh benchmark |
| [cxx-pr-focused-review.yml](cxx-pr-focused-review.yml) | CXX PR9380 focused review |
| [export-hex-ida-main-source.yml](export-hex-ida-main-source.yml) | Export hex-ida fix source |
| [goto-compare-existing-runs.yml](goto-compare-existing-runs.yml) | goto compare existing benchmark runs |
| [hex-fast-tail-branch.yml](hex-fast-tail-branch.yml) | hex FAST tail branch benchmark |
| [hex-ida-focused-review.yml](hex-ida-focused-review.yml) | Hex IDA focused PR review |
| [hex-ida-main-fresh-benchmark.yml](hex-ida-main-fresh-benchmark.yml) | hex-ida main FAST full fresh decompile benchmark 15m |
| [hex-ida-zero-partial-diagnostic.yml](hex-ida-zero-partial-diagnostic.yml) | hex-ida zero partial diagnostic |
| [hex-ida-zero-partial-focused.yml](hex-ida-zero-partial-focused.yml) | hex-ida zero partial focused |
| [hex-ida-zero-partial-full.yml](hex-ida-zero-partial-full.yml) | hex-ida zero partial full 160 final |
| [hex-live-hotfix-browser.yml](hex-live-hotfix-browser.yml) | Hex live hotfix browser probe |
| [hex-live-probe.yml](hex-live-probe.yml) | Hex live publication probe |
| [hex-param-varargs-verification-diag.yml](hex-param-varargs-verification-diag.yml) | hex param_varargs verification caller diagnostic |
| [hex-perf-userscript-sync.yml](hex-perf-userscript-sync.yml) | hex perf userscript sync check |
| [hex-realgame-tail-parallel.yml](hex-realgame-tail-parallel.yml) | hex current-main real-game + tail parallel |
| [hex-runtime-hotfix-diff.yml](hex-runtime-hotfix-diff.yml) | Hex runtime hotfix diff |
| [inkwave-wiper-plane-pilot.yml](inkwave-wiper-plane-pilot.yml) | INKWAVE Wiper native plane pilot |
| [openjev-real-game-holdout.yml](openjev-real-game-holdout.yml) | openjev real-game holdout arm64 |
| [paired-post9263-hotspot-benchmark.yml](paired-post9263-hotspot-benchmark.yml) | Paired post-9263 hotspot benchmark |
| [pr9263-fresh-benchmark.yml](pr9263-fresh-benchmark.yml) | Main full fresh decompile benchmark 15m |
| [repeat-post9263-unstable-pairs.yml](repeat-post9263-unstable-pairs.yml) | Repeat unstable post-9263 paired cases |
| [compare-post9263-main-benchmark.yml](compare-post9263-main-benchmark.yml) | Compare post-9263 main vs pre-9263 baseline |

## 再実行する場合

必要な YAML だけを `.github/workflows/` へ戻し、対象コミット・参照する run ID・アセットの保存期限を確認します。過去の対象を検証するための固定値を、現在の検証対象と混同しないでください。再実行の入口は `workflow_dispatch` にして意図したコミットから実行します。保管中の自己ファイル名 `push.paths` は履歴の一部であり、archive 配下から自動起動しません。

```sh
git mv .github/workflow-archive/<name>.yml .github/workflows/<name>.yml
# on: を workflow_dispatch: に変更し、対象と依存を確認してコミットする
```

新しい単発診断が完了したら、結果の保存先を記録してここへ移します。継続的な回帰検証は、所有するテスト群・現役 workflow に登録します。
