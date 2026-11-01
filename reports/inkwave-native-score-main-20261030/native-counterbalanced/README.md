# Score/HUD終端値と順序反転2セッションの検証

測定sourceはA `17ce3883007b9f402a82dc194285f23deba3afb9`、B `470e952a2066adfbbeedf754850a0abd0f7d9fd2`。公開時の現在mainや今回のdocs commit自体をbuild・計時した結果ではない。[固定plan](e/cbplan0/plan.json)、[集計report](e/cbplan0/report.md)、[集計analysis](e/cbplan0/analysis.json)、[原環境の最終readback・凍結一覧](e/cbplan0/final-readback.json)を保存した。先行の[900-tick44窓](../native-full/README.md)、[30-frame smoke](../native-smoke/README.md)、[部品46.00%短縮・追加typed buffer949,340 bytes](../README.md)も残し、時間をpoolしない。

本試験は独立に起動したChromiumの2セッション、合計**88窓・44 matched-ordinal組**。内訳は40 warmup・16 A/A・32 A/Bで、全記録state/paint/workloadと終端score/HUD cacheのbinary64 coverage bitsが各組で完全一致した。別の30-frame admission smokeも**20窓・10組**で一致した。全108窓を保存し、拒否窓・page error・context lossは0。各セッションの9 harness hashes、private LFS/source binding、served-byte receipts、全観測thread affinity、固定GPU PIDも原環境のsaved-file readbackを通過した。

Hagglefish native / LOW480×300 / 60Hz / shooter / 8 actors・7 bots、各本試験窓300固定tick。GPU CPU0–1 / worker CPU2–3、4-core quotaを維持した。`cba0`はpage A→B・ABBA開始、`cbb0`は新しいbrowserでpage B→A・BAAB開始。各セッション内はABBA/BAABを交互にし、A/Aは両pageともbaseline build。5 warmups/side/phase、A/A 2 quartets・A/B 4 quartets/セッション。**page作成順と開始sideを同時に反転し、セッションも固定順で逐次実行したため、各因子と時間・host変動の効果を分離できない。**

| セッション | A/B wall変化・条件付き95%区間 | A/B renderer ThreadTime変化・条件付き95%区間 |
|---|---:|---:|
| [cba0（A→B・ABBA開始）](e/cba0/report.md) | **+5.72%**（−1.16〜+13.09%） | **−0.89%**（−6.85〜+5.44%） |
| [cbb0（B→A・BAAB開始）](e/cbb0/report.md) | **−5.69%**（−14.23〜+3.70%） | **−13.01%**（−19.19〜−6.36%） |
| 2セッションの幾何平均（n=2、df=1） | −0.15%（−51.68〜+106.36%） | −7.15%（−59.45〜+112.62%） |

個別セッションはquartetのlog ratio、2セッション行は各セッションの幾何平均比を1標本ずつ使ったStudent-t区間。保持page・browserを共有するquartet間の独立性や、2セッション間の正規性・独立性は確立していない。8 quartetsやframeを独立反復としてまとめた区間は主張しない。wallはセッション間で符号が変わり、ThreadTimeも推定差が大きい。2本目ThreadTimeの条件付き区間は0未満だが、全体として**速度改善・実機FPSは未確認**。A/Aと順序別値も[集計report](e/cbplan0/report.md)に全保存し、A/Aによる補正や改善の選別はしない。

全cgroup throttle・heap変化・不利値を保持した。A/Bのthrottleは1本目11 periods / 18.429 ms、2本目21 periods / 1,288.107 ms。cgroup全体には他processとsoftware GPU作業も含まれ、これだけで差の原因を同定しない。除外・補正・自動再試行・forced GC・profiling・起動後affinity変更は行っていない。

score observerは両タイマーとGPU drainの後に既存own-data cacheだけを読み、coverage・teamSummary・getter・simulation・state transitionを呼ばない。終端値がcurrentで観測前後に不変、coverage/HUD bitsが一致したことを確認した。全中間HUD frame・DOM/pixel・finish coverage・judge/winnerは未確認。小さなobserver allocationが後続heap履歴に影響する可能性は残る。

scene submissionは無効、software GPUのpaint-atlas drawは有効。wallは各game frame後のobserverを含まず、ThreadTimeはdigest/counter/CDPを含む。scene/drawn actor framesが0のconstant pose digestは表示アニメーションの証拠ではない。全描画・hardware GPU・自然scheduler・presented/device FPS・本家実機の比較には一般化しない。Splatoon 3の既存比較条件Ver.11.3.0と未確認事項を引き継ぎ、塗り重み・面積・score仕様は変えていない。

| raw | 元の全bytes | 展開後SHA-256 |
|---|---:|---|
| [cbsm0 smoke](e/cbsm0/result.json.gz) | 2,451,250 | `e58a50821ccf79a82fb283015c28cd9810a8f7e7511b8c00cf28fab619c9ade7` |
| [cba0](e/cba0/result.json.gz) | 5,340,383 | `bafbe42316e28bbc6b8358d17e478b328996ecc2eaec78b89fbb542bffec6193` |
| [cbb0](e/cbb0/result.json.gz) | 5,315,224 | `13f2d254ec28e664e64e938cfca8b25edb15d6cea37d90e5541e5334fbb1392b` |

原本凍結の63 filesをhash/byte照合し、raw3本だけgzipへ変換した。各runのanalysis/report/log/process/exit/launcher receiptと9-file sealed harness、plan側の元verify/analyze/aggregate/statistics libraryを保持した。原report内の`result.json`はgzip展開後の名前。空lock・browser tmp・生成pycacheは証跡外。`environment.json`は各rawのenvironmentと同一内容を取り出したもの。

[artifact manifest](artifact-manifest.json)と[公開コピーreadback](publication-readback.json)を参照。`python3 verify-publication.py --node-modules /absolute/path/to/node_modules`はbrowserを起動せず、一時コピーで元Node verifier・統計analyzer・集計を再実行する。元planの全bytesとhash `933cfcf6d8ee22328435179bb69d357351d00c64388efeb9f90bbc1623f58af6`を維持し、元scriptも変更しない。一時scriptの絶対パス参照だけを保存先へ付け替え、元_siteへのsize照合は保存したfile-size inventoryに向ける。変更箇所はreceiptに列挙する。全4 analysisは`verifiedAt`/`analyzedAt`以外の全field、全4 reportは全bytes一致した。

`builds/`は原_siteのbuild manifestとserved-file size snapshotで、private payloadは含まない。このportable replayは**保存証跡の整合性**を確認するもので、公開コピーから実source/LFS/private payloadを独立に再hashした証明ではない。実source/LFS/served bodyとの照合は原実行環境で完了し、そのreceiptsをrawに保持した。
