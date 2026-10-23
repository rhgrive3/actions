# Zipcaster acceptance follow-up — frozen candidate 66a271f8

取消時の4粒差は、検証補助がnative更新の外側でlife resetを実行した順序によるものでした。候補の取消欠陥として修正する根拠はありません。一方、30 Hzでは移動中のhook先端を2回使う位置サンプリング差を再現しました。今回の通常カメラでは大きな団子状の塊は確認できず、視覚的重要性の最終判断は親のreviewに残します。

基準 `726e338ac256ba9609086ce65e25a68ddd99df85`、候補 `66a271f8fe5d91fc108f1f2a8a3d13860bff410e`、先の報告 `0adcf00dea878b5f1af352110236365475a087f5` と両minified buildを保持しました。候補runtime、main、PR1854は変更していません。

## 取消の4粒を特定

比較基準は元60 Hzのlife cycleです。旧120 Hzの過剰な粒数の維持は要求していません。callbackとbirth rowは0始まりです。

| record | 元60 Hzのrecord観測区間 | 該当する最後のbirth | 候補120 Hzでの順序 |
|---|---|---|---|
| L1 | callback132/native133からcallback179/native180まで。callback180直前に取消 | row239・240、native180、phase=zip、life=.35 s、size=.08 | callback358/native179で2粒。359/native180はcarry=.5で0粒。360はnative180のまま、FXより前に直接reset |
| L2 | callback192/native193からcallback239/native240まで。callback240直前に取消 | row305・306、native240、phase=zip、life=.35 s、size=.08 | callback478/native239で2粒。479/native240はcarry=.5で0粒。480はnative240のまま、FXより前に直接reset |

元60 Hzは各recordに48回、候補120 Hzは95 callbacks=47.5回分を与え、次の半tickを与える前にrecordを破棄していました。life=.35は発生引数で、recordの寿命とは別です。正確な位置・速度と元ログ内のrowは [ledger](cancellation-ledger.before-repeat.json) に保存しました。元ログにはcarryを直接記録していないため、その列は変更していない式と実callback間隔からの再構成です。同ファイル末尾の「classificationPending」は再実行前の記録として保持しています。

ログだけでは取消順序の因果を確定できなかったため、同じ既存Chromium・flags・timeouts・minified buildで0.9秒simulationの短い再実行を3本だけ行いました。3本とも全54 native tickの位置・phase・timerが完全一致しました。

| 実行 | .8秒で要求したresetの適用点 | zip births |
|---|---|---:|
| 元60 Hz | callback48のActor.update内、native49 | 56 |
| 候補120 Hz・旧補助順序 | callback96/native48、Game._frameより前、carry=.5 | 54 |
| 候補120 Hz・native境界 | 要求はcallback96、適用はcallback97のActor.update内/native49、carry=0 | 56 |

取消要求をnative境界へ揃えるだけで56粒になりました。旧matrixのL1/L2で各2粒消えた理由をこの順序差で説明できます。半tick時点で明示的にrecordを破棄した際、未到来の発生を無理にflushする変更は提案しません。resetは検証用の`Actor.spawnAt`であり、通常プレイのcancelボタンを試したという主張ではありません。3本は同一page内の逐次試行でVFX RNGを跨ぐため、全birth値の一致試験とは扱いません。

## 30 Hzの同一原点ペアと見え方

fresh pageの元60 Hzと候補30 Hzでhookを20 native ticksだけ実行しました。native stateは全20行同一、通常カメラ行列は共通capture4枚すべて同一です。独立初期化したhand-anchor差を除くため、元60 HzのhandR入力をnative tickごとに記録し、候補の**VFX bone入力境界だけ**で同じテープを参照しました。Character/modelの変形・コードは変更していません。この入力制御を含む実emitted VFXのbrowser検査であり、無加工の全pose/pixel一致試験ではありません。

5粒のseed・回転・速度・life等、原点以外の全23-slot Float32 birth値は順番ごとに同一でした。

| birth | 元60 Hzのnative tick | 候補30 Hzのnative tick | 原点差 WU |
|---:|---:|---:|---:|
| 1 | 13 | 14 | 8.717977 |
| 2 | 16 | 16 | 0 |
| 3 | 17 | 18 | 1.596060 |
| 4 | 18 | 18 | 0 |
| 5 | 19 | 20 | .184082 |

候補の3・4粒目は生成時に同一点でした。native18の実pool状態では、二粒の距離は元1.593078 WU→候補.074815 WU、通常カメラへの投影中心間隔は3.079989 px→1.335570 pxです。両方の保存画像を確認しましたが、この一条件では目立つ大きな塊には見えませんでした。[元60 Hz](base-hook-tick18.jpg) / [候補30 Hz](candidate-hook-tick18.jpg)。この観察を全カメラ・全移動条件の視覚合格には広げません。

最初の粒にはより大きな位置サンプリング差があります。native14でのpool内粒中心は元(471.981,417.588) px、候補(478.418,289.460) pxへ投影されます。投影値は遮蔽・sprite面積を含む可視pixelの差ではありません。phaseタイマーを低rateで現在値にまとめる誤差は実在しますが、これだけで128 pxの可視artifactとは判定しません。旧fresh60の独立hand-anchor差.0334 WUは、この位置サンプリング差の根拠にも、候補の回帰にも使っていません。

## 別案と意図的な失敗テスト

[hook-origin-repro.test.mjs](hook-origin-repro.test.mjs) は候補の既存harnessで実際のraw director.frameを抽出実行します。手元・target・RNGを固定し、hookFlightTだけを進めます。minified/browser testではありません。元60 Hzの全recipe行との比較は合格。候補30 Hzの移動中原点比較は意図どおり失敗し、差は `[2.2989303405,0,1.5071537278,0,.8820669282,0]` WUでした。[失敗ログ](hook-origin-repro.log)。既存fixed-phase粒数試験が覆っていなかった範囲です。

最小の別案は、trackへ直前のhookFlightTを1値保存し、実際にtimerが進んだ2回catchupの先行機会だけ`hookFlightT-1/60`（直前値より前へ戻さない）から既存easeOutで発生原点を求めることです。後半機会と60 Hzの原点、RNG順序・個数・beam・ribbon・coat・native移動はそのままです。既存scratch vectorを使い、geometryやmodelを追加しません。

この**未適用の私有patch案**を別テキスト上で試し、同じ焦点テストは2/2合格、原点差は最大3.6e-15 WUになりました。[案のCPUログ](hook-origin-proposal.log)。案のSHA256は`3b65f107623e9bb0959243f8fd602d3ce48bc7adfd1408a8bd29e612db77f942`です。原点計算に現在のhandを使う小さな案であり、動くhandの完全なnative pose復元や全phase境界を保証しません。案のbuild/browser・既存全suiteは未実行です。採用を既成事実にせず、凍結候補や公開runtimeへは適用していません。

## 「17 emitted tests」の正確な範囲

先の表現は広すぎました。実行コマンドは以下です。

```sh
INKWAVE_BUILT_SITE=/workspace/zipcaster-cadence-evidence/browser-run/builds/candidate \
node --experimental-vm-modules --experimental-global-webcrypto --test \
  patches/splatoon3/tests/special-vfx.test.mjs \
  patches/splatoon3/tests/special-zipcaster-input-1130.test.mjs \
  patches/splatoon3/tests/issue-1607-zipcaster-retry-boundary.test.mjs
```

17件合格の内訳は、既存special-vfx 15件、Zipcaster input 1件、retry boundary 1件です。このうち16件はsource-fixtureの`INKWAVE_BUILT_SITE`分岐でbuilt module graphをVMへロードします。`inkwave-public/`と`patches/`をbuild出力へ解決し、source adapterを通さず、既定のidentity `adaptEmittedRuntime`からminified bytesを`vm.SourceTextModule`へ渡し、built installを呼びます。ただしtest側のdirector lookup、replay helper、定数等にraw source importもあり、physics/paint/display/audio/Character等はfixtureでstubされます。これは実emitted graphを使うCPU component evidenceです。

残り1件「remote Kraken is drawn dashing…」はraw `special-presentation.mjs`の関数だけをdynamic importするsource-only testです。したがって「17件すべてが実emitted試験」とは呼びません。新設`zipcaster-vfx-production.test.mjs`はBUILT_SITEを明示拒否する別のsource composition suiteで、この17件のコマンドには含めていません。source段階の13 raw +4 composedと混同していません。元ログは私有保存し、実browser検証は今回と先のbrowser資料による別経路です。

## 残るgateと保存資料

今回もpage/console/Director errors=0、GL error=0、context lossなし。名目30/60/120は手動Game._frameへの配信間隔で、native clockは1/60のままです。実表示refreshや実時間FPSの達成試験ではありません。既存flags/timeoutsを変更していません。pool低quality8人の元overloadを解消したとは主張しません。任天堂媒体・参照clipは追加せず、本家一致は未確認です。

[probe.mjs](probe.mjs) と [probe-result.json](probe-result.json) が実行・生記録、[measurement.json](measurement.json) が派生集計です。候補の位置サンプリング差を修正するか、通常カメラで許容するかは親の独立reviewへ戻します。新案を採用する場合は別candidateでphase/moving-hand試験・build・browser検証が必要です。元の私有成果、失敗ログ、8枚のcapture、両immutable buildは保持しています。
