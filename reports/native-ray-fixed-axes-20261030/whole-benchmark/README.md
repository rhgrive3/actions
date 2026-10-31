# Native ray 全体測定の追加証跡

#1971 の実装がmain `17ce3883007b9f402a82dc194285f23deba3afb9`へ取り込まれた後、測定証跡だけを追加する。製品・runtime・build入力は変更しない。測定対象はbaseline `db2134a71ffe3360626fdadba78916d9b702d31b` とcandidate `df2491c6096c173efc14504dc5d00ea5b8458df5`で、archive commit自体を測定したものではない。

[完了した44窓/22組の報告](e/rnfull1/report.md)を参照。A/Bの算術平均はwall 22.6327→21.9577 ms/tick、renderer ThreadTime 9.0856→8.8373 ms/tickだが、4 ABBA quartetsの95%記述区間は比1をまたぎ、A/A雑音も大きい。全体短縮は確認できない。throttleを含む全窓を残し、未完了のrnfull0は混ぜていない。

scene submissionなし、paint atlas drawあり。固定CPU割当とSwiftShaderのホスト実験であり、表示された骨姿勢・全pixel・実機GPU・端末FPS・自然schedulerを検証しない。

## 保存内容とreadback

- `e/rnfull1/`: 完了runのraw result gzip、analysis、報告、固定plan・起動/解析失敗記録、終了/process確認、sealed harness 8 files。
- `e/rnfull0/`: 環境再接続で中断した先行runのraw result gzip、interruption、plan、元log等。未完了の33窓を統計に混ぜない。
- `scripts/`: recorded harness 8 filesと、初回解析で不足した相対import依存1ファイル。計測時の実装hashと照合した検証用snapshot。
- `publication-manifest.json`: 展開前後のSHA-256/bytes、測定source SHA、archive基点。`publication-readback.json`: この公開用コピーを使ったreadback検証。

raw resultはgzipを展開してから解析する。各gzipの展開後SHA-256をmanifestと照合し、`e/rnfull1/analyze.mjs`を実行する（Nodeと既存のPlaywright依存が必要、browserは起動しない）。scripts/harnessの相対位置を維持する。解析はanalysis.jsonを書き換えるためコピー先で実行し、元analysisを保存してanalyzedAt以外が一致することを照合する。

元の中断runからの再実行は条件を変更せず、evidence-dirのみを変えて一度最初から実行した。初回解析のmissing importと起動tool切断も保存し、製品やraw JSONを変更していない。
