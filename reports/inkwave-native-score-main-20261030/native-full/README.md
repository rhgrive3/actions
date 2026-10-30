# 17ce main上の900-tick native計測

baseline `17ce3883007b9f402a82dc194285f23deba3afb9` と candidate `470e952a2066adfbbeedf754850a0abd0f7d9fd2` の実行を保存した。公開用docs commit自体は再build・計時していない。[全窓・統計・制約の報告](e/cf0/report.md)、[元analysis](e/cf0/analysis.json)、[全raw gzip](e/cf0/result.json.gz)、[固定plan](e/cf0/full-plan.json)、[実行環境](environment.json)を参照。

Hagglefish native / LOW480×300 / 60Hz / shooter / 8 actors・7 bots、各窓900固定tick。worker CPU2–3とGPU CPU0–1を分離し、4-core cgroup quotaを維持した。20 warmup + 8 A/A + 16 A/Bの全44窓を保持し、22 matched-ordinal組でinitial/gameplay/paint/state/draw/resources/scene/pose/budget/BVHが記録範囲内で完全一致した。拒否窓・page error・context lossは0。観測された全13,129 thread entriesのaffinityを検証した。

| 比較 | wall変化 | renderer ThreadTime変化 |
|---|---:|---:|
| A/A（同一build、2 quartets） | −16.936%（95% −43.618〜+22.373%） | −17.916%（95% −53.830〜+45.932%） |
| A/B（4 quartets） | −3.719%（95% −8.295〜+1.085%） | −3.022%（95% −6.777〜+0.885%） |

各値は全ABBA quartetのlog ratioに基づく幾何平均とStudent-t 95%区間。少数quartetで正規性・独立性を保証せず、frameを独立反復として数えない。両A/B区間は変化0を含み、同一build A/Aの揺れも大きいため、**全体高速化は未確認**。A/Aを使った補正で改善を主張しない。外れ値・throttling・heap変化を理由に窓を除外していない。

scene submissionは無効で、paint-atlas drawは有効。SwiftShaderのsoftware GPU作業、固定CPU pool、固定ABBA・固定page作成順のhost実験で、page/build割当や順序を無作為化していない。自然scheduler・全描画・実機GPU・実機FPSは未確認。wallは各`g._frame`のみで後続observerを含まない。ThreadTimeはgameplay digest・counter・CDP観測を含む。digest observerはactor stats、paint counts/version等を読み、`coverage()`を追加呼出していない。scene submissionが0でdrawn actor framesも0のため、constant pose digestは表示アニメーションや画像同一性の証拠にはならない。audio voiceの実時間結果は記録するが一致条件にしていない。

両buildとも17 private LFS assetsをsource SHAに結び付け、served bodyのhash/size receiptを保存した。unrequested private packはdisk上の検証のみでHTTP receiptはない。Node `v24.19.0`、Chromium `154.0.8037.57`、CPUモデル・quota・全affinity snapshotはrawとenvironmentに残る。前の30-frame smokeはpoolせず、別証跡として保つ。Splatoon 3の既存比較条件Ver.11.3.0を引き継ぎ、塗り重み・面積・score仕様を変えず、本家実機の未確認事項を維持する。

rawは6,886,757 bytes、展開後SHA-256は`d1ee8c7ec754ec9edd287182402a7b304d200bb3e99ba64e19e3a9dd924f3662`。gzipは元raw全bytesに一致する。`e/cf0/`のanalysis・plan・log・launcher・元analyzer・sealed harnessも元ファイルのまま保存した。`scripts/`の8 filesは記録harness hashと一致し、相対import依存1 fileは実行元と既公開smokeの同一bytesを保存した。依存1 fileは元の8-file hash一覧の範囲外であることをmanifestに明記した。

[artifact manifest](artifact-manifest.json)と[保存後readback](publication-readback.json)を参照。既存Node/Playwright依存を指定して`python3 verify-publication.py --node-modules /absolute/path/to/node_modules`を実行すると、browserを起動せず、一時コピーで元Node analyzerと独立統計analyzerを再実行する。全窓・組・affinity・source/LFS/HTTP receipts・前smoke hashを検証し、元analysisの`analyzedAt`以外の全fieldとreport全bytesの一致を確認する。出力receiptだけを更新し、元evidenceは変更しない。
