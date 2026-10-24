# Roller early return: stationary phaseのcontrolを既存support reachへ制限する候補

**部分改善の別候補。early全体の修復・実画面採用・本家一致は未承認。** branch `candidate/roller-vertical-early-condition-20261023`、runtimeコード `96a5836ced682d3c9846c82483032f8884f51923`。元main、0278293、ecf5、cf9/37a/4dd、不採用試行1b2517を保護する。main/PR1856は更新・mergeしない。Work、サブエージェント、Nintendo mediaは使用していない。

## 原因の切り分け

元・027をnative VMと実production Chromiumで別々に比較した。early40/46は既存backで同じstationary follow-through keyへ到達する（今回46tick）。raw weight1、pitch+.6、曲線tangent0。通常48は既にreturn u=.2、weight.896、raw pitch.2776だが、READYとの既存blend後ANCR pitchは−.0112704で、followRotationも.25から.328へ変わっている。これは既存の表示phaseで、本家frame値の追加ではない。

**VMの速度谷はhelperだけにはない。** 50→51→52のhelper角stepは.460→.491→.501、native IKへ渡る最終orientationは.672→.332→.456。既存`alignLeft`のreach補正が.416→.052→0radへ抜ける。floor評価は各1回で、新しい探索補正は選ばれていない。観測あり/なしの全180 native行は厳密一致した。

VMでは元の50→51→52移動.458488→.465888→.373261が、027で.538374→.284899→.362366となる。一方、条件を揃えた実browserの027は.466182→.555237→.635437で、この速度谷は再現しなかった。元の49tickの1.109129の跳ねも.354417へ減る。VMは−Z床探索解、browserは+Z解という違いも記録した。小さなmax増加だけを理由にearly全体をnative fallbackへ戻すと、この実画面の改善を失う。

actual shaftのworld-up符号も十分な判定ではない。VMの通常48のuncorrected shaft Yは−.127984で、単純な「上向きだけ開始」は有益な通常48まで除外する。新しい角度閾値でfitしていない。

## 今回の最小変更

捕捉時に作るupright qUp自体が、q0が合法でも左腕reach外になる早期fixtureを確認した。既存`alignLeft` callbackを`roller.mjs`からhelperへ渡し、**native return weightがまだ1のstationary keyから始まる場合だけ**、その時点の既存support constraintへqUpを一度投影する。その後はqUpを固定する。returnが既にREADYへblend中なら027と同じcontrolを保つ。phase条件は既存back/end/easeから計算し、新しい時刻・frame・角度閾値は設けない。

共有IK・socket・grip基準・geometryを変更せず、既存reach計算をcontrolに一度使う。追加floor探索やIK solve、未来poseの予測、時間係数、遅いtailはない。native gameplay/input/runner/physics/paint/network、横振り、Carbon/Dynamo/Flingza、別担当spawn/reset/landing gateは変更しない。

旧027のcontrolがreach違反となるfixtureを凍結した。新しい投影で既存reach boundを満たし、開始q0とdeadlineを変えず、以後controlを追従させないold-fails/new-passes回帰を加えた。

## 保護した不採用試行

- **level waypoint**: 既存backで捕捉したshaftをworld level面へ投影するQA試行。early46で48/49tickのfloor fallback2回、最大finite jerkは027の170947から452176へ悪化。不採用。これは凍結emitted graphへの明示的QA注入であり、別buildの成功とは呼ばない。
- **全phaseでqUpをreach投影する1b2517**: earlyは改善したが、実browserの通常48の49姿勢も変わり、新しい全出力不変検査が失敗した。コード・site・raw・失敗ログを保護。最終候補は既存stationary phaseへ限定し、この通常48を元へ戻す。

## 画像の条件

QAの乱数closureをmodule初期化前に設置し、caseごとに同じclosureのstateをresetする。従来は後で`Math.random`を差し替えていたため、FXが保存した`const rand`のstreamまで巻戻っていなかった。runtime FXや粒子を変更・非表示にはしない。

元/027/最終候補は同じchecker・camera・既存avatar/gear・palette・geometry hash・名前seedで比較し、各tickの乱数state/消費数と記録したFX pool統計・drop位置/速度/属性配列も照合する。全画面のpixel parityは主張しない。修正後も動作前/終了後の画像で上部背景領域の差が残る（旧比較のbboxはx0–800,y75–239）。その背景差の原因は今回のscopeで変更していない。

全てINKWAVE座標・固定simulation tickの有限差分。retail映像のencoded frameや実機tick、実測メートルへ読み替えない。公式参照は以前のHTTP403拒否のままで、再取得・迂回しない。

## 確定した数値と残る負例

[全解析](analysis.json)は46–58全区間のstep/有限加速度/finite jerkを残し、49の一点だけを採用基準にしない。early40/46の数値は同じ。native VMと実browserは異なるfixtureなので分ける。

| 実production browser60Hz・early40/46、46–58 | 元main | 027 | 最終候補 |
| --- | ---: | ---: | ---: |
| 最大1tick移動 | 1.109129 | .635437 | .523502 |
| 最大有限加速度 | 4113.793 | 1834.152 | 814.985 |
| 最大finite jerk | 394231.367 | 107618.193 | 49776.511 |
| 移動総量 | 4.143838 | 4.031767 | 3.142882 |
| 55→56 incoming移動 | .036617 | .118943 | .099742 |
| 57有限加速度 | 142.528 | 428.037 | 370.202 |

最終候補も元より55→56 incomingと57減速が大きい。49→50は.291459→.285517と少し減速し、その後51→52→53は.345386→.470713→.523502。全体の見た目や本家一致は未承認。実vertex最低点（46–58）+.018160、物理grip gap最大2.37e−15は全roleで同じ。

| native VM・early40/46、46–58 | 元 | 027 | 最終候補 |
| --- | ---: | ---: | ---: |
| 最大1tick移動 | .541789 | .582695 | .583147 |
| 最大有限加速度 | 1947.409 | 2035.259 | 1803.537 |
| 最大finite jerk | 140383.968 | 170947.447 | 158910.902 |
| 移動総量 | 2.822507 | 2.878575 | 2.883163 |
| 57有限加速度 | 8.116 | 150.158 | 146.177 |

VMの速度谷は残る。最終50→51→52は.457576→.294447→.398480で、nativeの.458488→.465888→.373261にはなっていない。jerk/移動最大/57減速も元より悪い。これらを除外してearly受入とは扱わない。

**通常48は027と全66 native行が一致**（累積renderer.infoを除く）。実browserの49改善を保つ。一方、通常48の027由来の後半移動・軸向き・57減速604.593対元142.528はそのままで、今回解消していない。

## 最終検査・負荷

- 単体9/9（凍結027のcontrol reach違反、新投影、固定control、既存deadline、faded phase不変、pre-module RNG closure再利用を含む）。
- 最終source11/11・実minify生成物11/11。short repress、late49/52/55、実native新attack再利用、通常rolling/横振り/他roller、airborne/landing、moving aim、reset/cancel/form/sub、実paint/projectilesと30/60/120Hzの既存操作を検査した。repress/late traceはsource/emittedでbyte一致し、027保存traceとも同じSHA256。
- focused47/47、exact commit入力を照合するpackaging10/10。847検査はcurrent-source SHAだけ追随し、故障anchor・b34・閾値は変更しない。
- 実browserは元/027/候補のearly40・early46・通常48、全9caseが60Hzで完走（各66 ticks/66 renders）。新しい実browser30/120は実行していない。以前の元版120Hz最終tick65撮影60000ms timeoutは未解消の証拠として維持し、timeout/描画flagsを変更しない。
- native early46の観測ありでは、床評価1074→1074、align評価1074→1075、fallback0→0。増えた1回はcapture時だけのsupport投影。新しいfloor探索ループ・IK solve・mesh・particleはない。
- steady-read helper7×50,000回の中央値は凍結027約168ns、新source164ns、emitted178ns。capture時のprojectionそのものを含まず、sub-microsecondノイズもあるので性能改善とは呼ばない。5 Quaternion＋2 Vectorを再利用し、既存unheld align分岐もscratch vector/quaternionを使う。
- 記録FX/RNG stateが揃った実browserでは、同操作のrender増分も一致した。early40は3233calls/14,318,146 triangles、early46/通常48は3211/14,314,517。bootstrap込み全wall時間やGPU性能の保証ではない。

全必須CIは公開exact headの別gate。reference403・全体の見た目・残るVM速度谷と最終減速・120Hz実画面が未完なので、source検査成功から実画面採用へ読み替えない。

## 同じnative tickの画像

上部背景差が残るため全画面pixel parityとは呼ばない。選択条件と記録FX/RNGは照合済み。[46–58 CSV](browser-46-58.csv)、[raw](raw)、[checks](checks)、[build identity](build-identity.json)。

| 操作/tick | 元 | 027 | 候補 |
| --- | --- | --- | --- |
| early40/49 | [元](images/before-early40-edge-49.png) | [027](images/previous-early40-edge-49.png) | [候補](images/candidate-early40-edge-49.png) |
| early40/51 | [元](images/before-early40-edge-51.png) | [027](images/previous-early40-edge-51.png) | [候補](images/candidate-early40-edge-51.png) |
| early40/55 | [元](images/before-early40-edge-55.png) | [027](images/previous-early40-edge-55.png) | [候補](images/candidate-early40-edge-55.png) |
| early40/56 | [元](images/before-early40-edge-56.png) | [027](images/previous-early40-edge-56.png) | [候補](images/candidate-early40-edge-56.png) |
| early46/49 | [元](images/before-early-edge-49.png) | [027](images/previous-early-edge-49.png) | [候補](images/candidate-early-edge-49.png) |
| early46/51 | [元](images/before-early-edge-51.png) | [027](images/previous-early-edge-51.png) | [候補](images/candidate-early-edge-51.png) |
| early46/55 | [元](images/before-early-edge-55.png) | [027](images/previous-early-edge-55.png) | [候補](images/candidate-early-edge-55.png) |
| early46/56 | [元](images/before-early-edge-56.png) | [027](images/previous-early-edge-56.png) | [候補](images/candidate-early-edge-56.png) |
| 通常48/49 | [元](images/before-released-edge-49.png) | [027](images/previous-released-edge-49.png) | [候補](images/candidate-released-edge-49.png) |
| 通常48/53 | [元](images/before-released-edge-53.png) | [027](images/previous-released-edge-53.png) | [候補](images/candidate-released-edge-53.png) |
| 通常48/56 | [元](images/before-released-edge-56.png) | [027](images/previous-released-edge-56.png) | [候補](images/candidate-released-edge-56.png) |

## 再現

```sh
node --test patches/splatoon3/tests/roller-early-reach.test.mjs patches/splatoon3/tests/roller-vertical-shaft-return.test.mjs scripts/tests/inkwave-roller-qa-random.test.mjs
node scripts/build-inkwave.mjs inkwave-public /tmp/roller-early-site
node --experimental-vm-modules --experimental-global-webcrypto --test patches/splatoon3/tests/roller-shaft-production.test.mjs
INKWAVE_BUILT_SITE=/tmp/roller-early-site node --experimental-vm-modules --experimental-global-webcrypto --test patches/splatoon3/tests/roller-shaft-production.test.mjs
INKWAVE_BUILT_SITE=/tmp/roller-early-site node --test scripts/tests/inkwave-build-packaging.test.mjs
node scripts/check-inkwave-roller-early.mjs /tmp/roller-early-site /tmp/roller-early-browser early-focused
node scripts/analyze-inkwave-roller-early.mjs reports/roller-early-condition-20261023 /tmp/roller-early-analysis.json --published
node --test scripts/tests/inkwave-roller-early-evidence.test.mjs
```

元・027・1bのbuildは各凍結refから別outputへ作る。QA native fixtureの詳細は`trace-roller-early.mjs <out.json> 46,48`で保存でき、`INKWAVE_BUILT_SITE`で固定したbuildを指定する。`INKWAVE_QA_LAYERS=1`は観測、`INKWAVE_QA_EARLY_LEVEL=1`/`INKWAVE_QA_PROJECT_UP=1`はそれぞれ凍結027 helperへの明示的試行注入。試行は別buildの検査と混同しない。

公開raw再生ではnormal48全66行の027不変、FX/RNG各tick一致、棄却した1bの49差、level fallback、observer on/off全180行、floor評価数不変/align1回増加、source/emittedのtrace一致を確認する。以前の120Hz screenshot timeoutやNintendo参照403は再実行していない。
