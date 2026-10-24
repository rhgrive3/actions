# 通常roller: 同attackの再captureと不要なlate returnを防ぐ別候補

**部分修正の候補。全体採用・本家一致は未承認。** branch `candidate/roller-vertical-shaft-once-20261023`、runtimeコード `1c449d63b719a00c35775a60ecd0eae6438f4fd0`。ecf5原本、cf9/37a/4ddの不採用3案、a8診断、main/既存PRを保護する。PR1856のheadはcf9のままで、この別候補を採用したとは扱わない。Work・サブエージェントは使っていない。

`roller-vertical-shaft-return.mjs`の`clear()`がattack identityも捨てていたため、48解放→51/52再押下→53再解放で同じattackを再captureした。短い残時間の経路が54/55を余分に曲げ、56の元姿勢への引渡しで大きく戻った。ACTIVEだった経路を中断した時だけそのattack identityを消費済みにし、同attackで再armしない。初回activation前のheldは消費せず、新attackは再利用する。null取消や同identityの巻戻しでも消費済み状態を消さない。

また、release52の最初の通常solverは`chosenAxis=-1, chosenA=0`で、床探索補正を必要としていなかった。最初の適格sampleに実際の非ゼロ床探索補正が選ばれた場合だけcaptureし、それ以外はそのattack中ずっと元のcarryを保つ。48解放では既存`axis=2, a=1.3`を受け取り、49tickの改善を維持する。任意のframe閾値・新しい時間係数・曲線は加えていない。

runtimeの変更は表示helperの所有状態と、`roller.mjs`から既存`chosenAxis/chosenA`を渡す1行だけ。共有IK、grip/socket/左支持、geometry/skin、通常rolling・横振り・他roller、入力・runner・physics・paint/network、別担当spawn/reset/landing gateは変更しない。source/emittedで元版のnative状態と実paint stamp入力を検査する。

| source・同じnative入力 | 元main | ecf5 | この候補 |
| --- | ---: | ---: | ---: |
| 再押下: 55→56 drum移動 | 0.000638 | 0.288331 | 0.000638 |
| 再押下: 57有限加速度 | 8.116 | 1042.839 | 8.116 |
| 再押下: 48–58最大有限加速度 | 6270.284 | 6439.008 | 6270.284 |
| 再押下: 48–58最大finite jerk | 734575.994 | 759011.610 | 734575.994 |
| release52: 55→56移動 | 0.000638 | 0.203693 | 0.000638 |
| release52: 57有限加速度 | 8.116 | 738.261 | 8.116 |

INKWAVE world座標・固定simulation tickからの有限差分。Nintendo映像のencoded frame、実機tick、実測メートルや本家timingへ読み替えない。release52の元からある最初のjump **1.596267は残る**。改善は不要な後半経路の除去。

## 残る負例と承認gate

**release40/46は未修復。** 46–58の最大移動は元0.541789に対し候補0.582695、最大有限加速度は1947.409対2035.259、57有限加速度は8.116対150.158。ecf5と同じで、今回の2修正を全unheld受入とはしない。通常48解放でも、既報の50–56総移動増加・53の大きな軸向き・56へのincoming stepは全体の実画面判断が残る。よく見える49の一点だけで採用しない。

公式参照への以前の通常GETはHTTP403拒否。再取得・迂回はせず、本家と同camera/aim/native phaseの比較は未確認のまま。全必須CIもこの候補headでは別gateとする。

## 実行検査

- 旧ecf5で新しい再押下回帰が54tickで失敗することを保存。その後、元/候補51–58全出力、54/55、56 incoming、57減速、48–58加速度/jerkを検査して成功。凍結した旧helperのSHA256は`9970995021e44d08059d2b0b294326a2a79a6c2de6d2fb9a087bb0e1af136d8c`。
- floor必要性追加前の新回帰はclear native carryのrelease49で失敗。追加後はrelease49/52/55の**全90tick**が元と一致。通常48解放の49改善、40/48開始点/56以降の不変も通過。
- sourceと実minify生成物のproduction統合は各10/10。再押下/late/既存操作の3種traceはsource/emittedで各byte一致。held/rolling、横振り、Carbon/Dynamo/Flingza、airborne/landing、moving aim、reset/cancel/form/sub、実bomb、paint、30/60/120Hzと180tickの新attack反復を含む。
- helper単体6/6。5 Quaternion＋2 Vectorのrecord再利用、per-sample cloneなしを維持。support faultのsource SHAだけを追随し、3つの故障anchor・b34原本・閾値は変えない。packaging10/10、既存ecf5 evidenceの再生2/2。

実browser・画像・負荷の最終結果は下へ追記する。検査成功と全体の表示受入を分離する。

## 実browserの確定分と未完分

元main・凍結ecf5・候補を同じchecker `960ff287…f826`、通常Chromium、800×600、同じ既存avatar/gear・名前seed・Aqua/Cherry palette・25 geometryのhash・cameraで照合。60Hzの再押下/late52は各66 native ticks/66 rendersで完走した。candidateは再押下51–65の全記録、late52では全66記録が元と厳密一致する（累積renderer.infoは除く）。同じnative phaseのdrum/axle/hand/pose/fold/kid transform、弾・ink・攻撃時計も含む。[全解析](analysis.json)、[別々のbuild identity](build-identity.json)、[raw](raw)、[checks](checks)。

| 実browser60Hz | 元main | ecf5 | 候補 |
| --- | ---: | ---: | ---: |
| 再押下: 55→56移動 | 0.036617 | 0.546786 | 0.036617 |
| 再押下: 57有限加速度 | 142.528 | 1975.003 | 142.528 |
| 再押下: 48–58最大有限加速度 | 8839.514 | 9344.524 | 8839.514 |
| 再押下: 48–58最大finite jerk | 1035215.113 | 1085487.633 | 1035215.113 |
| late52: 55→56移動 | 0.036617 | 0.390337 | 0.036617 |
| late52: 57有限加速度 | 142.528 | 1412.408 | 142.528 |

実browserとsource VMは環境・乱数条件が異なるため数値を混ぜない。再押下53の元由来の大きな移動2.387066、late52の元由来の移動2.158223は残る。修正後の滑らかな全動作や本家一致とは呼ばない。48–58の実vertex最低点は再押下+0.024645、late+0.017754で元と同じ。全66サンプルの最低点には変更対象前36tickのroot相対負値−0.740997も含み、全動作の接地合法性を主張しない。両手物理grip gap最大2.37e−15。

**画像全体のpixel parityは未確認。** 選択avatar/gear/palette/geometry/seed・camera・native状態は一致するが、freshとreused contextでFX粒子配置が異なる。`fx.js`は起動時の`Math.random`関数を`const rand`に保存し、checkerのcase準備は後でMath.randomを差し替えるため、そのcached streamの消費位置は揃っていない可能性がある。画像は武器姿勢の差を見る証拠として示し、完全同条件の全画面A/Bとは呼ばない。runtime FXや画面描画を抑制・変更していない。

| 操作・native tick | 元 | ecf5 | 候補 |
| --- | --- | --- | --- |
| 再押下53 | [元](images/before-repress-edge-53.png) | [ecf5](images/ecf5-repress-edge-53.png) | [候補](images/candidate-repress-edge-53.png) |
| 再押下54 | [元](images/before-repress-edge-54.png) | [ecf5](images/ecf5-repress-edge-54.png) | [候補](images/candidate-repress-edge-54.png) |
| 再押下55 | [元](images/before-repress-edge-55.png) | [ecf5](images/ecf5-repress-edge-55.png) | [候補](images/candidate-repress-edge-55.png) |
| 再押下56 | [元](images/before-repress-edge-56.png) | [ecf5](images/ecf5-repress-edge-56.png) | [候補](images/candidate-repress-edge-56.png) |
| 再押下57 | [元](images/before-repress-edge-57.png) | [ecf5](images/ecf5-repress-edge-57.png) | [候補](images/candidate-repress-edge-57.png) |
| late53 | [元](images/before-late-edge-53.png) | [ecf5](images/ecf5-late-edge-53.png) | [候補](images/candidate-late-edge-53.png) |
| late54 | [元](images/before-late-edge-54.png) | [ecf5](images/ecf5-late-edge-54.png) | [候補](images/candidate-late-edge-54.png) |
| late55 | [元](images/before-late-edge-55.png) | [ecf5](images/ecf5-late-edge-55.png) | [候補](images/candidate-late-edge-55.png) |
| late56 | [元](images/before-late-edge-56.png) | [ecf5](images/ecf5-late-edge-56.png) | [候補](images/candidate-late-edge-56.png) |
| late57 | [元](images/before-late-edge-57.png) | [ecf5](images/ecf5-late-edge-57.png) | [候補](images/candidate-late-edge-57.png) |

元の30Hz両操作は各66 ticks/33 rendersで完走し、60Hzと全native行が一致した。120Hzのzero-tick描画は成功receipt未確定で、今回は完了を主張しない。続くreused-context **120Hz repress-edgeの最終tick65 `page.screenshot` が60000msでtimeout**。[失敗操作のログ](checks/browser-before.log)。撮影完了後にreceiptを確定するcheckerなので、このcaseの成功receiptは存在せず、後続late120にも到達していない。flags・timeout・描画方式を変えて再実行しない。候補/ecf5の今回の実browser30/120は未実行で、固定時計source/emittedの30/60/120成功とは分離する。過去session39616や旧timeoutの記録も上書きしない。

追加した「中断後の次の実native attack」回帰はsource/emitted各1/1成功。先の全10/10とは別実行で、各2回のattackで49の経路が使われ、各再押下後51–58は元と一致した。既存focusedは17+30=47/47、公開raw再生1/1も成功。全必須CIの代用にはしない。

## 負荷と再現

runtimeに探索ループ・geometry・particleを追加せず、既存床探索結果の2つのprimitiveを渡す。5 Quaternion＋2 VectorをCharacter recordで再利用し、per-sample cloneなし。単独helper7×50,000回の中央値は凍結ecf5 **181.7ns**、新source **194.1ns**（約+12.4ns）、新emitted **164.6ns**。copy対照は12.6–14.4ns。[全sample/heap](benchmark.json)。sub-microsecond測定とGC後heap差はノイズを含み、全frame/GPU性能を保証しない。

実browser再押下のrender call増分は元3211/ecf53233/候補3222、triangle増分14,284,533/14,318,326/14,285,833。lateは3211/3233/3233、14,284,827/14,318,326/14,318,326。FX stream未一致のためこれを新コードの性能差・同一負荷とは判断しない。選択characterのgeometry count/hashは一致し、runtimeにparticle複雑化はない。

```sh
node --experimental-vm-modules --experimental-global-webcrypto --test patches/splatoon3/tests/roller-vertical-shaft-return.test.mjs patches/splatoon3/tests/roller-shaft-production.test.mjs
node scripts/build-inkwave.mjs inkwave-public /tmp/shaft-once-site
INKWAVE_BUILT_SITE=/tmp/shaft-once-site node --experimental-vm-modules --experimental-global-webcrypto --test patches/splatoon3/tests/roller-shaft-production.test.mjs
INKWAVE_BUILT_SITE=/tmp/shaft-once-site node --test scripts/tests/inkwave-build-packaging.test.mjs
node scripts/check-inkwave-roller-shaft-once.mjs /tmp/shaft-once-site /tmp/shaft-once-repress repress-edge 60
node scripts/check-inkwave-roller-shaft-once.mjs /tmp/shaft-once-site /tmp/shaft-once-late late-edge 60
node scripts/analyze-inkwave-roller-shaft-once.mjs reports/roller-shaft-once-20261023 /tmp/shaft-once-analysis.json --published
node --test scripts/tests/inkwave-roller-shaft-once-evidence.test.mjs
```

旧mainとecf5のbuildはそれぞれの凍結refから別outputへ作る。実装の候補保存のみ。early40/46、全体の見た目、本家同条件映像、120Hz実画面、exact公開headの全必須CIは未完。
