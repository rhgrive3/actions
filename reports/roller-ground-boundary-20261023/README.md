# ローラー縦振り: 接地解の切替境界（保証未成立）

**受入可能な修正は未成立。production runtimeは変更していない。** 別branch `candidate/roller-vertical-ground-boundary-20261023` は公式main `7e027ac2ff7eea31c04155e0ee1e0d3e5604ed51` から作成した。cf9、weighted37a、X限定4ddfcd2bは不採用のまま保護。main・既存PR ref・他担当spawn/reset/landing gate・grip基準・共有native IKを更新しない。通常Codex cloudで作業し、Workとサブエージェントは使用していない。

## 実ビルドの制約を再現

通常rollerの同じmatched fixture、名前seed3564230742、既存avatar/gear、Aqua/Cherry palette、25 geometry SHA、camera/水平aim、66 simulation ticks/66 rendersで計測した。元artifact contentHashは`caa80f320098ca6b8d4cbedd4b8f6ca2b8652663cfb120412abf8dfb78f4d100`。manifestへ配信bodyを照合し、観測用レスポンスにだけwrapperを追加した。

右/左肩origin、既存reach、握り、cylinder bound、kid transform、肩drop、live foldを読み取る。native共有scratchやsolver途中の`updateMatrixWorld`を呼ばない。新しい観測なしbrowser controlと、**全66tickのnative行が厳密一致**した（bootからの累積renderer.infoだけを明示除外）。40/49tickもpose・手・drum・弾・ink・攻撃時計が一致した。

`floorEvaluator`はsnapshotから既存の非contact床評価とalignLeftを読み取り専用で再計算する診断であり、runtimeからimportされない。実際の探索**1,472件**との差は床誤差最大**1.2213e−15**、quaternion成分最大**3.0531e−16**。別のgripや理想化したgeometryの結果ではない。

[観測raw](observed.json.gz)、[対照raw](control.json.gz)、[全解析](analysis.json)。rawには元artifactと観測レスポンスのSHAを記録した。元・3不採用案・そのbuild/images/logsは既存の枝に保護したまま。

## 必須負例: 着地40tickと復帰49tick

既存admissionは`groundError <= .003`、非contact誤差は`max(0, -.002 - cylinderBottom)`。INKWAVE座標での診断であり、本家encoded video frameや実測メートルへ換算しない。

| 当該tickの制約で前tickの最終quaternionを保持 | 床誤差 | 左/右reach誤差 |
| --- | ---: | --- |
| 着地40tick | 0.769353 | 0 / 0 |
| 復帰49tick | 0.038359 | 0 / 0 |

前解を保持するだけでは両方で接地制約を破る。40tickはground gateがfalse→trueになり、以前合法な空中姿勢が接地姿勢として合法でなくなる。このgateを変えず、任意の入力に対する完全なC0接続をここだけで保証することはできない。元40tickより悪化しない条件は引き続き必須であり、元の着地段差を今回解消したという意味ではない。

49tickの同じsnapshotでは、Z補正1.25radと1.50radの両端は床・左右reach誤差0だが、中間は床へ入る。

| 接続方法 | 中点の床誤差 |
| --- | ---: |
| scalar角度1.375rad | 0.107418 |
| 補正後quaternionの最短slerp | 0.109811 |

既存`.05rad`のbracketから各30回の二分だけで、観測した不可領域の端を**1.2654840541rad付近**と**1.4659904977rad付近**へ挟めた。offline追加64評価で、runtime探索は追加していない。個々のbracketの境界測定であり、全SO(3)の大域的な経路不存在の証明ではない。

合法な2解でも、そのscalar/Euler/quaternion補間が合法とは限らない。前のZ+1.3radをそのまま当てる方法も49tickでは床誤差0.059152。新しい見た目合わせ曲線は追加しない。

## 境界だけの小さい案を実装・再生して却下

native classへ入れる前に、同じsnapshotで以下を再生した。既存`.003`/`.05`/30step/`.06`/`.1`をそのまま使い、新しい見た目係数はない。solver段階のcounterfactualで、最終bone/world軌道の改善とは扱わない。

1. **基準床誤差0でも既存探索をadmitするだけ**: early exitと6軸を維持すると49tickはZ+0.05radを選び、前tickとの角度差**1.880245rad**が残る。gateを開くだけでは接続を保証できない。
2. **前軸の全既存候補を既存costで追う**: floor-admissibleでもcostに返却期限がない。49–55tickに補正が残り、56tickのnative終了時に**1.25rad**が残る。元の構えへの引渡しは約**1.254683rad**の段差。この案も採用しない。

必要なのは、変化する接地/両腕reachの合法集合内で枝をつなぎ、native終端では元の解へ戻ることを同時に示す経路である。現行グリッド・cost・単純補間だけでは未成立。**一般の3D合法経路が存在しないとは断定しない。** 新しい3D経路solverや期限付き表示制御を、任意パラメータなし・40/49両方・実world軌道まで保証する設計はできておらず、runtime修正へ進めなかった。

## 検査・実測時間・負荷

`node --test scripts/tests/inkwave-roller-floor-boundary.test.mjs` **4/4成功**。[TAP](diagnostic.tap)。次の診断事実を固定する検査で、motionの受入ではない。

- 全66 native tickの観測あり/なし一致と、40/49の明示照合。
- 前姿勢保持が40/49で床を破る負例。
- 合法なscalar/slerp両端の中間が床を破る負例。
- 1,472件の再現、2案と56tick引渡しの再実行。geometry/根bracket/提案結果は一致し、実行時間だけを一致対象外とした。

| 同じnormal cloud browser、各1回 | 観測なし | 制約snapshot観測あり |
| --- | ---: | ---: |
| wall秒 | 102.671 | 108.815 |
| wrapper child user秒 | 3.864 | 6.831 |
| child system秒 | 1.236 | 1.400 |
| child max RSS KiB | 187204 | 393724 |

wall差+6.144秒（約6.0%）、診断event保持のRSSは約201.7MiB増えた。単発のboot・SwiftShader・撮影込みで、全Chrome process群の厳密なpeak memoryやhardware GPU benchmarkではない。[対照計測](control-time.json)、[観測計測](observed-time.json)。flags、800×600、60000ms撮影timeout、描画方式を変えず両runはexit0/page errorなし。最初の`/usr/bin/time`は未インストールでexit127（browser未実行）だったためPython monotonic/resourceで計測した。

offline再生1,472件は保存runで約13.0ms、31候補×20回のprobeは約1.66ms。製品hot pathの性能値ではない。runtime追加評価数**0**、runtime module追加**0**。巨大な探索・geometry・particleを追加せず、診断を常時表示へ入れない。

## 切断からの復旧と残作業

切断前にraw・解析・計測・4/4 TAPまで保存完了。その後のREADME/比較記録の保存コマンドがtransport disconnectedで実行不確定となった。復旧後の読み取りでREADMEも比較記録追記も存在しないことを確認した。node/pythonの実行中processはなく、残存ChromiumはすべてZ状態。browserや解析を重複起動せず、文書保存から再開した。

受入可能なmotion修正は未完成。runtime/公開sourceのgit差分は0、入力/deadline、攻撃/移動/paint/network、横振り、grip、spawn/reset/landing gate、character/hair/skin/meshは変更していない。CIは今回未実行。

公式紹介ページとplayer`NablZy7jqxO`は以前の通常GETがHTTP403で拒否された状態を継続扱いとし、再取得・迂回していない。本家の同条件比較は未確認。任天堂mediaは含まない。

```sh
node --test scripts/tests/inkwave-roller-floor-boundary.test.mjs
node scripts/analyze-inkwave-roller-floor-boundary.mjs reports/roller-ground-boundary-20261023/observed.json.gz /tmp/boundary-replayed.json
node scripts/check-inkwave-roller-recovery-layers.mjs <original-site> <output> released-edge 60
```
