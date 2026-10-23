# 投擲描画：元版1ケースを1フレームずつ呼び出した診断

**元版GP0水平・60Hz配信dtの1ケースが、Q/Sub発動3tick、飛行終端、撮影まで完了した。** timeout・assertion・render抑制の変更で通したものではない。残り18条件の再実行やruntimeの追加編集はしていない。以前の8回一括呼び出しで止まった記録もそのまま保持する。

基準はreport-only commit `aca428f4679fa5b664ab8ca09716211cae6bc306`。既存beforeビルドのcontentHashは `37cdb283fc69c08f34a562f9b30c6b1b29fedcfaba36242b2516e536f332f96b`。既存Chromium 154.0.8037.57・同じflags/SwiftShader・新context、同じ実練習場/足元(6,0,0)/GP0/入力/物理dt=1/60秒を使った。scene・材質・shader・ゲームコードは変更していない。既知の拒否済み取得・Library・新debug port・権限変更はない。

## 変更した診断方法

前回の `flight-batch` は、**1つのpage.evaluateでGame._frame(1/60)を最大8回呼び、gl.finish()する**処理だった。今回、Game._frameを1回ずつのpage.evaluateへ分けた。GPU完了の採取は従来と同じ8回ごとと終端で、Q/Sub各tickのGPU完了採取も維持した。各step・関数前後の時刻を記録し、ページ限定の通常Playwright CDP接続でCPU profileを取得した。

初期settle1tick＋Q/Sub3tick＋発射後87配信フレームの計91回でrenderを有効にし、`_skipRender=false`をassert。発射後の通常followカメラpitch−0.35、160tick内終端、正常発射のassertも前回どおり。step/render/撮影は1操作30秒を維持。初期playing待ちだけは元からの240秒設定をそのまま使い、今回は47.257秒で完了した。実時間で60FPSを達成したという意味ではない。

## 結果

- Q/Sub発動から終端までGame._frameが復帰し、終端はtick140、缶なし・雲なし。元版が通常レーン奥へ飛んで雲を出さず消える既存の結果と整合する。この診断は新しく缶のrelease位置をhookしておらず、98.56mの数値自体は以前の90traceの計測値を保持する。
- 撮影は **28.385秒**、30秒上限内で成功した。[通常ゲーム画面](evidence/inkwave-storm-render-step-2026-10-23/before-GP0.png)。ページerror/crash・context-lost・resource取得失敗は観測0、撮影前glError=0。consoleには前回同様KHR_parallel_shader_compile非対応のwarningが1件。
- 終端のgeometry257 / texture29 / live program140、compileShader404 / linkProgram202。起動やFXの資源準備は観測したが、この1件だけでリークや全条件の安定性を認定しない。

遅かったstepは、Node側のstage全体と、ブラウザ内で前後を記録したGame._frame本体の時間に大きい差があった。

| 発射後step index（0始まり） | Node stage全体 | ブラウザGame._frame本体 | stage開始→ブラウザ内frame開始 |
| --- | ---: | ---: | ---: |
| 6 | 6,987ms | 10.8ms | 6,975ms |
| 12 | 6,165ms | 11.5ms | 6,152ms |
| 20 | 8,924ms | 9.2ms | 8,913ms |
| 58 | 10,602ms | 8.7ms | 10,592ms |

最後の列はNode側ログ開始とブラウザDate.nowの差であり、CDPへ実際に送信した瞬間を別途記録した値ではない。Nodeの記録処理/送信、CDP配送、ブラウザでの実行待ちを含む。本体終了からstage終了までは上記4件で1〜2msだった。飛行中のGame._frame本体の最大は37.9ms、発射tickは622.2ms。`gl.finish`を呼ぶ専用RPCも12.233 / 8.503 / 7.903秒の待ちを記録したが、今回はその関数内部と配送待ちを独立に測っていない。

CPU profileは発射後40フレームから終端まで約21.768秒、500nodes/15,624samples。timeDeltasによるサンプル重み付け時間21,766,933usのうち、`(idle)`は20,447,559us、**93.94%**だった。これは対象ページV8のCPU profileで、GPU/compositorやNode側CPUの測定ではない。ログ処理自体の観測負荷もある。

## 切り分けと残件

今回の遅延について、Game._frameの本体が6〜10秒のJS処理を続けていたという証拠はなく、遅延の大半は観測した本体の外側だった。前回は8回一括のRPCが返らず停止位置が不明だったが、今回は各frameと関数の復帰を確認できた。

ただし、呼び出し粒度・詳細ログ・CDP samplingを同時に変えた1件の診断である。**8回一括だけが原因だった、問題が修復された、GPUだけが原因だったとは断定しない。** Node側の記録/送信待ち、CDP、ブラウザ/renderer/compositorの待ちの内訳は未分離。撮影も上限30秒に対して28.385秒であり、余裕ある安定動作の証明ではない。

この元版1件の成功を残りの版・Hz・GPの成功へ広げず、今回は小さい診断だけで終了する。90trace/180replayや以前の画像を再計算せず保持した。実通信admissionと実際の途中参加は未検証で、別担当のadmission修正とは区別する。runtimeは未採用のまま。

[step別の時刻・資源数・stage一覧](inkwave-storm-render-step-2026-10-23.json)、[関数前後の全3,094イベント](evidence/inkwave-storm-render-step-2026-10-23/browser-function-events.jsonl)、[Chrome CPU profile](evidence/inkwave-storm-render-step-2026-10-23/before.cpuprofile)、[実行probe](evidence/inkwave-storm-render-step-2026-10-23/probe.txt)。生の重複を含む9MBの診断JSONは私有保存し、そのhashを公開JSONに記録した。公開資料は元データからstep時刻・関数イベント・profile・画像を抽出したもの。
