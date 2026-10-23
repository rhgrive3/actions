# 縦振りrecoveryの層別診断（実装変更なし）

元main726、cf9、不採用weighted37aを、既存のmatched native fixtureと同じ条件で計測した。補間式、共有grip/接地solver、spawn/respawn表示gate、input/runner、deadline、移動・paintは編集していない。診断branchは37aから分け、runtime差分はない。原本・不採用2案・旧logsは維持した。本家403は再取得していない。

この記録は「どこで大きくなるか」の切り分けであり、本家一致／実画面合格や新しいmotion候補ではない。

## 計測方法と同一性

`check-inkwave-roller-recovery-layers.mjs` は保存済みminifyビルドを読む。元の全配信bodyをmanifest SHAと照合してから、**診断用レスポンスだけ** `install.mjs` と `roller.mjs` に観測ラッパーを重ねる。disk上のビルドやproduction sourceは変更しない。

- installerの既存メソッド捕捉順を使い、raw sampler、helperの実戻り値、blend前後、detail前後、grip/接地wrapperの前後、native腕IKへ実際に渡された目標、FK/animation/fold、pivot、最終drumを記録。
- 内部のbone/world transform読取はlocal transformsから別のMatrixへ合成する。solver途中にnative `updateMatrixWorld`を呼ばず、引数・姿勢・scratchを変更しない。
- 各案の全66tickを、その案の**観測なしmatched receipt**と照合した。全pose、左右hand、drum centre/axis、grip error、floor-search状態、攻撃時計、ink、projectile状態が**厳密一致**した。unfrozen bootから累積する`renderer.info`カウンタだけを同一性対象外として明示し、rawには残した。viewport/描画flags/60000ms撮影timeout/描画方式は維持。
- 3案のavatar/装備/palette/seed、25 geometry内容hash、初期pose、camera/射影行列は同じ。source-motionはロード済み・rollerではactive=falseであり、既存native両腕が表示を所有する。

[raw元](before.json.gz)、[raw cf9](cf9.json.gz)、[raw weighted](weighted.json.gz)、[完全解析](analysis.json)、[要約](summary.json)、[48–56tick CSV](ticks-48-56.csv)、[変換hash](provenance.json)。各raw receiptは元artifact SHAと診断レスポンスSHAも記録する。

## 1. 二重呼出し・detail・独立pivot加算ではない

44–55tickでは `_poseFlick` は各tick **1回**。helperが導関数等のためにraw曲線を複数回サンプルする場合も、native poseへの適用は1回だけだった。

`Math.fround(base + (sample - base) * effectiveWeight)` が観測したblend後のanchor/Eulerと全点一致する。blend後とroller detail後は同じで、さらにapply入口まで同じ。vertical detailや、その後のpose処理で補正を再加算していない。56tickでは全案ともnative attack tokenが終了し、flick呼出しは0回、既存READY poseへ引き渡される。

48–56tickのpivot/off/foldのlocal変換は全案で1種類、foldはidentityだった。最終drum移動を

`Δdrum = ΔhandR_translation + ΔhandR_linear_transform × prior_local_lever + current_handR_linear_transform × Δlocal_lever`

へ分解すると閉じる。分解残差は1e-10以下、最後のrelative-weapon項は最大8.4e-16未満。手首からcentreまでのleverは約1.33024 INKWAVE単位。**pivotが別途動くのではなく、手首の並進と回転をそのまま継承している。**

native骨IKが作った右手quaternionは、渡された補正後quaternionをworldへ移した値と5.2e-8rad以内で一致した。大きな角変更はnative骨IKの追加回転より前、rollerのgrip/接地wrapperで既に渡されている。

## 2. grip/接地wrapperでの角度段差を区別する

以下は同じkid座標系のquaternionの1tick変化。入力は既存body follow/sway/recoil後、消費値はroller wrapper補正後にnative腕IKが受け取った実値。

| 案/tick | wrapper入力Δq (rad) | native IK消費Δq (rad) | floor-search状態の切替 | drum移動 |
| --- | ---: | ---: | --- | ---: |
| 元49 | 0.600034 | 1.899398 | Z+1.3 → なし | 1.109129 |
| cf9 50 | 0.650033 | 1.728563 | Z+1.35 → なし | 0.780812 |
| weighted 50 | 0.357017前後 | 1.6407前後 | Z+1.35 → X−0.30 | 0.642862 |

元49の右手目標位置の移動は0.061509だが、drumは1.109129動く。内訳はhand並進0.064302、回転項1.157965、relative-weapon項ほぼ0（ベクトルなのでnormの和ではない）。

**大きな増幅はgrip/接地wrapperで変更されるorientationと長いleverに局所化できる。** 同tickでfloor-searchの選択が切り替わることも観測した。ただし、この診断ではwrapper内の`alignLeft`とfloor-searchの単独寄与は分けていない。floorだけを唯一の原因と断定しない。共有solverは未編集。

該当共有関数は `runtime/roller.mjs` の `installRollerMotion` が設定する `Character.prototype._solveLimb`、終盤の `orientation.copy(bestQ); return solve.call(...)` へ至る補正経路。今後ここを変える必要が出た場合は、親で予約中のspawn/respawn gateとは別の関数範囲として調整が必要。

## 3. cf9の後半はblend出力自体が速くなる

cf9の表示pitch補正（最終blend − 当該時刻raw曲線だけを通常blendした値）は、48tickで約+0.5863rad、49tickで約+0.8941rad、50tickで約+0.8656rad。これはdetailからの再加算ではなく、helperが返す角度補正とweight補正を既存blendへ入れた結果。

51tickのwrapper入力Δqは、元0.573347radに対してcf9は0.776660rad。native IK消費値もcf9は0.763141radで、その後にpivotで別の動きを足したわけではない。C1接続は速度上限や戻り全体の形を保証しない。

## 4. weightedのcurve-level検査だけではdrumの承認にならない

weightedはgripと同時に`coil/whip` envelopeの積も補間対象にしたため、胴体用envelopeまで後半へ配分し直していた。

| 55tick | 元 | cf9 | weighted |
| --- | ---: | ---: | ---: |
| rawのwhip | 0.028 | 0.028 | 0.028 |
| helperが返すwhip | rawと同じ | 0.028 | 0.665511 |
| 実際のwhip × weight | 0.000784 | 0.001203 | 0.028601 |

既存 `_poseFlick` はこの積をspine/chest/hipの表示へ使う。weightedの最後の積は56tickで0へ引き渡される。55→56のnative IK入力Δqはweighted0.1467rad、元0.0097rad。これはEulerの±π/2π折返しではなく、weightとnative deadlineのもとで残っていた表示姿勢からの戻りである。後半の観測したEuler値は折返し境界を跨いでいない。body envelopeのドラム移動への独立寄与量は、この診断では反事実を作って分離していない。

またweightedは40tickの着地で、旧/新raw poseもその近傍微分用sampleも同一であるのに、新しいendpoint bridgeを開始する。46tickではraw pitch0.6に対してhelper0.595023、47tickではraw0.593280に対してhelper0.584571。**ZR解除48tickの前にもhelperが既存曲線を変えていた。** これは新しい式を試す前に除くべき局所的な接続条件である。

## 5. 48–56全区間と画面上の位置

速度は `(centre[t]-centre[t-1])/STEP`、加速度は速度差/STEP、STEP=1/60。48tickの値は47tickからの差を含む。任天堂映像のencoded frameや実測メートルへ換算しない。

| 案 | 全区間最大速度 / tick | 全区間最大加速度 / tick | 全区間移動総量 | 投影centre最大1tick移動 / tick |
| --- | --- | --- | ---: | --- |
| 元 | 66.5477 / 49 | 4155.844 / 49 | 4.063008 | 129.750px / 49 |
| cf9 | 54.4953 / 51 | 3061.883 / 51 | 3.943367 | 90.591px / 50 |
| weighted | 45.2266 / 53 | 1952.000 / 50 | 3.936926 | 75.075px / 50 |

速度はINKWAVE単位/s、加速度は同/s²、投影は800×600の記録済みnative cameraでのcentre位置。見えている全画素のoptical flow測定ではない。

**worldの最大移動tickと、投影centreが最も跳ぶtickは候補では異なる。** weightedの世界座標最大は53tickだが、投影最大は接地補正が切り替わる50tickだった。50–56だけを切り取ると候補の後半増加が目立つ一方、48–56の総量・最大速度・最大加速度は下がる。これは運動の再配分を示すだけで、本家に近づいたことも、見た目が合格したことも示さない。元/cf9/weightedの不採用扱いと原作403未確認は維持する。

## 再実行

元の3保存ビルドへ、同じlayer checkerを1回ずつ適用する。元artifactのレスポンスを変える観測用runであることと、その案の観測なしcontrolとの一致を必ずセットで確認する。

```
node scripts/check-inkwave-roller-recovery-layers.mjs <before-site> <out>/before released-edge 60
node scripts/check-inkwave-roller-recovery-layers.mjs <cf9-site> <out>/cf9 released-edge 60
node scripts/check-inkwave-roller-recovery-layers.mjs <weighted-site> <out>/weighted released-edge 60
```

公開済みrawからの解析再現（追加browser不要）:

```
node scripts/analyze-inkwave-roller-recovery-layers.mjs reports/roller-vertical-recovery-20261023 <output.json> --from-reports
```

保存したanalysis.jsonと再生解析はbyte一致を確認した。今回の差分は診断scriptとevidenceのみ。新しい補間式やproduction修正は入れていない。
