# db2134 main 上での配信ビルドと30-frame smoke

このディレクトリは親作業で取得した証跡のコピー。計測対象は baseline `db2134a71ffe3360626fdadba78916d9b702d31b` と candidate `df2491c6096c173efc14504dc5d00ea5b8458df5`。旧基準の部品計測と区別する。

- `validation.json`: 通常配信build、source/artifact照合、Hagglefishの17 LFS payloadのoid/size照合、startup budget、baseline 24 / candidate 30 emitted tests、実16,000 rayと4,157,951 triangleTestsの完全一致。
- `smoke-summary.json`: low / shooter / 60Hz / Hagglefish / 8 actors / 30 frames、4 warmup + 4 A/A + 4 A/B windows。対応する6組の記録state、paint、draw/resource/scene、BVHが完全一致。全windowを保持。
- `result.json.gz`: 元のraw result.json全体のgzipコピー。展開後SHA-256は `9063b8203f61c16bde8c713f740905a1c1f8200710fcdb26c8bcec271cb06b70`。`timing-caveats.json` と併読する。scene submissionは無効で、画素・表示pose・実機GPU・FPSの検証には使わない。
- `timing-caveats.json`: A/Aの追加cgroup throttlingを伴う外れ値、thread CPUの観測処理込み、固定CPU poolによる条件変更を保持。A/Aの時間ばらつきとA/Bの1 quartetだけで速度改善を認定しない。
- `postvalidation-old-cohort-ppm-failure.json` と `validate-smoke.mjs`: 旧cohort由来PPM=3.2の誤った後処理assertを保持。製品とbuildは変更せず、positive finite PPM検査と全initial objectの厳密な組別照合へ修正。全12 windowsのPPMは3.774873600000001。
- `smoke-plan.json`、`fixed-command.json`、`harness-pre-run-seal.json`: 実行前条件・コマンド・harness hash。

公開準備時のmain `42e6d10775ce9ab1f082c111914e52bf73ab1b35` は、上記baselineからWebKit scrollのテスト/helper 2ファイルだけを変更している。ray runtimeおよびこの変更の対象pathは同一で、競合なく取り込んだ。このmainおよび公開用merge commitの再build・実battle測定は未実施。フル対戦全体の性能、画像同一性、実機GPUと端末FPSは引き続き未確認。
