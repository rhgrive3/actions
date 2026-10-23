# 投擲の連続描画timeout：新contextでの元版診断

追加の完走・撮影成功は0件。**元版の新contextでも途中停止を再現したため、残り2版と未実施マトリクスへ進まず、当該操作を停止した。** 以前の90trace・180replay・8画像は保持し、再計算していない。runtime・距離/contact/境界の追加編集、採用は行っていない。

基準はreport-only commit `a92f35a37302d8c88592064635ca1de044ccfefd`。実行対象は既存のbeforeビルド（contentHash `37cdb283fc69c08f34a562f9b30c6b1b29fedcfaba36242b2516e536f332f96b`、投擲2ファイルはa4と同一）。既存インストール `/usr/bin/chromium` 154.0.8037.57、起動flagsは以前と同一。新しいflags・browser取得・Library・拒否済みURLへのアクセスはない。1ブラウザに各版の新context/pageを直列で作る計画で、元版を最初に実行し、停止条件に達したため距離版/contact版のcontextは作っていない。

## 実行条件と停止位置

実練習場、足元(6,0,0)、GP0、水平、60Hz配信・既存60Hz simulation、通常Q→Sub押下/解放。sourceMotion.readyを待ち、足元とweaponを設定後、1tickの通常描画でsettleした。以前の90tick描画抑制warm-upは使わず、Q/Subの3tickを含む診断ケース全体で `_skipRender=false` をassertした。発射後は以前の代表画面と同じ通常followカメラpitch−0.35へ向けた。カメラは飛行を追跡しない。

rendererのenter/return、shader compile/link呼出数、WebGL draw呼出数、geometry/texture/program数、console/pageerror/context-lostを観測した。観測wrapperと`gl.finish`を使うため、CPU/GPU性能ベンチマークではない。shaderコードとapplication runtimeは変更していない。

| 段階 | 完了時間 | 観測 |
| --- | ---: | --- |
| 通常range playingまで | 49.928秒 | リソース取得失敗0 |
| sourceMotion.ready | 3ms | 完了 |
| 最初の射撃線settle描画 | 76ms | rendererから復帰 |
| settle後GPU完了 | 5ms | geometry241 / texture28 / program131 |
| Q押下の描画＋GPU完了 | 51ms | holdへ移行 |
| Q解放/Sub押下の描画＋GPU完了 | 23ms | 完了 |
| Sub解放の描画＋GPU完了 | 3.767秒 | 正常発射、缶(6,1.683333,1.12)、program131 |
| 発射後batch0（8配信） | 141ms | 完了 |
| batch1（8配信） | 14.052秒 | 完了、shader/program等の準備増加あり |
| batch2〜5（各8配信） | 79 / 121 / 64 / 53ms | 完了、後半の資源数一定 |
| batch6 | 30.003秒で診断deadline | 応答なし |
| 直後の読み取り専用状態採取 | 5.007秒でdeadline | 応答なし |
| context close | 552ms | 終了、ブラウザも終了 |

最後に確認できたrenderer-returnは **tick100 / simulation time 1.666667秒**。缶の位置は(6,5.043333,54.88)、雲なし。この先のどのtick・命令まで実行されたかは確認できない。batch6の新しいrenderer-enterログもなく、撮影段階には到達していない。`page.screenshot`自体の再失敗としては扱わない。

直前10描画のgeometry257 / texture31 / live program140、JS側createShader404 / compileShader404 / linkProgram202は一定。監視できた範囲でcontext-lost/restoredは0、pageerror/crashは0、request failureは0。consoleには `KHR_parallel_shader_compile extension not supported` のwarningが1件あった。最後に確認できた状態ではfontsはloaded、WebGL contextはlostではなかった。無応答区間の状態までは保証しない。

## 言えることと残る不足

- 1つ目の新context・1ケース目の元版で再現したため、複数ケースの連続再利用は停止の必要条件ではない。候補の距離/contact変更に固有の障害とは分類しない。
- 最初の描画、Q/Sub発動、発射後の追加shader/program準備は一度完了し、その後に停止した。最後の10描画にはJS側compile/linkやGPU資源数の増加がない。単純なケース間のgeometry/program蓄積や、最初のrenderer呼出だけで説明できる証拠はない。
- GPU driver内部の遅延準備、browser/compositor、JS frame処理のどこが止まったかは特定できていない。最後のrenderer復帰以後のRPCが返らず、読み取りもできなかったため、GPUだけが原因とも断定しない。
- 新しい同条件ケースの終端・撮影が未完了なので、条件付きで許可された残り水平ケースの補完は開始していない。timeout延長・assertion削除で成功扱いにする変更もない。

最小の不足は、この元版の新context・GP0水平60Hzケースが、発動3tickから終端・撮影まで完走すること。その前提が成立してから残りの版・水平連続描画ケースを補完する。既存の距離数値、配信Hz別の力学trace、公開replay methodのcatch-up成功を、連続描画や実通信admissionの成功に置き換えない。受信側admissionの既存バグ修正は別担当の範囲。

[時系列・console・資源数の生記録](evidence/inkwave-storm-capture-diagnostic-2026-10-23/diagnostic.json)、[診断プローブ](evidence/inkwave-storm-capture-diagnostic-2026-10-23/diagnostic-probe.txt)、[hash manifest](evidence/inkwave-storm-capture-diagnostic-2026-10-23/manifest.json)。これはtimeoutによる停止であり、ブラウザ起動・権限の拒否ではない。pendingだったcontextは閉じ、追加の撮影や再試行は残していない。
