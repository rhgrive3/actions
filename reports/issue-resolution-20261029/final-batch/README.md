# 2026-10-29 追加統合・検証記録

「実機検証はいりません」を適用。#401、mainマージ、PR1907 MOV-08b保留、isolated Character QAの既存scopeを維持した。これは新headのhosted CI開始前の固定snapshot。最新状態はPR本文・各runを参照する。

共通・最適化の通常minified生成物で、必須23fileが各212/212（147 top-level＋65 nested）、fail/skip 0。全65武器の凍結raw traceが一致した。sourceと生成物を混同せず、重なるsuite数は合算しない。

- source native replay/canonical/codec/worker/FIFO128/128。charge keep、cancel、再charge、dodge支払、armor、overkill、再入、epoch/life/ownerを検証。
- initial spawnから398tick、6骨・初回銃口が一致。trusted name/controller、camera:null、模擬relayのCPU条件であり、一般描画条件やproduction接続の証明ではない。
- 通常RAF窓は最低5秒と実描画3件を両方要求し、記録までMatch/Levelの同一性を検査。Kelpline/8actor/Crab退役released・errors0。先行2stage/2cycleも保存。
- 最終hair first-drawは両生成物各3/3、Chromium154、errors0。Inputはdesktop/touch各10回の実DOM退役とrenderer20回切替/反射が成功。
- 8actor/7bot/300tickの全状態・描画・資源は一致。roller更新380→190、入れ子blastの座標破壊も修正。変動・悪化した全体時間を保持し、全体FPS改善とはしない。
- 旧historical+hair9/9は旧adapterだけの結果。最新bridgeは実統合adb01331で9/9を再実行し、元fixtureと旧/新receiptを維持。
- 1MiBを超えるGit treeのENOBUFSを、必要path分割と全callerの明示上限で修正。巨大tree・改変・欠損の対照を維持。packagingは両生成物14/14。
- reviewのdigest無期限待機を修正し関連29/29。件数重複、欠落参照、3phase×2receiverの表記も訂正。

#1665/#1666のproduction必須接続は未解決。発射・接触0でPvP/Boss/crab各36HP減少を今も再現し、新native APIを本番解決と数えない。#890/#735のsource校正条件は元Issueに明記され、実機免除で満たしたことにしない。原典調査で既存同一1130 JSON・S1素材・viewer・parameter編集資料は確認したが、必要なS3 engine消費処理は未確認。全28件の具体的条件は[ledger](ledger.json)。

必要hosted CI成功までは解消候補Issueを閉じない。code snapshot、全file/commit、rawのhashは[ledger](ledger.json)と[receipts](receipts.json)で対応付けた。旧失敗を削除せず、原因調査なしの再実行はしていない。
