# 17ce main上のnative smoke

測定対象はbaseline `17ce3883007b9f402a82dc194285f23deba3afb9`、candidate `470e952a2066adfbbeedf754850a0abd0f7d9fd2`。公開用の追加docs commitそのものをbuild/測定した結果ではない。

[30-frame報告](e/csm0/report.md)、[元analysis](e/csm0/analysis.json)、[raw result gzip](e/csm0/result.json.gz)を保存。Hagglefish native、LOW480×300、60Hz、shooter、8 actors / 7 bots / ready source characters8、GPU CPU0–1 / worker2–3。4 warmup+4 A/A+4 A/Bの12窓/6 matched-ordinal対でstrictな記録state/paint/counts/BVH等が一致した。全窓finite、error/context lossなし。

A/A wall12.630→12.493ms、ThreadTime14.414→14.882ms。A/B wall12.050→13.263ms（不利な+10.069%）、ThreadTime14.164→13.940ms。各1 quartetで95%区間なし。全窓を保持し、このsmokeから全体改善・回帰を判定しない。scene submissionなし・paint atlas drawあり、SwiftShader/固定CPU pool/観測処理込みのThreadTimeであり、表示pose・画像同一性・実機GPU・FPSは未確認。

raw gzipの展開後SHA-256は`4c0e88091f4f3680f0bf9ab67377d48bffc327745205169a8a8fdd42721809c8`。元raw全bytesと一致。`scripts/`は記録harness8 filesと相対import依存1ファイル、`e/csm0/harness/`は記録時のsealed snapshot。Node/既存Playwright依存のあるコピーでgzipをresult.jsonに展開し、`node e/csm0/analyze.mjs`を実行できる（browserを起動しない）。analysis.jsonが書き換わるためコピー先で検証する。公開用コピーでanalyzedAt以外の全fieldが元analysisと一致した。
