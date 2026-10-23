# 固定head433299: 実browser30Hzの復帰・canonical/paint比較

**公開PR head433299とruntimeは変更していない。** 通常rollerの限定された実browser30Hz motion/canonical確認を追加した。全画面・本家・全環境での受入ではない。今回の18実行には120Hzを含めず、既存timeoutを保護した。

## 実際に実行したもの

同じQA checkerで、main7e baseline30Hz×6、最終候補433299の30Hz×6、同候補60Hz×6を各fresh browserから同じ順序で実行。全18caseがexit0、各66 simulation ticks。30Hzは各33描画、60Hzは66描画、合計1188 native ticks／792 actual WebGL drawsだった。これはFixedClockの論理描画cadenceで、実機のwall-clock30FPS保証や全match/controller loopの検査ではない。

| trace | input | 30Hzの結果 |
| --- | --- | --- |
| 通常解放 | held0–47、unheld48以降 | main/候補canonical・paint一致 |
| early40 | held0–39、unheld40以降 | 同上 |
| early46 | held0–45、unheld46以降 | 同上 |
| 短い再押下 | release48、held51–52、unheld53以降 | 同上、再解放後の元poseを維持 |
| late52 | held0–51、unheld52以降 | 同上、元の全poseを維持 |
| 無入力ready idle | 全tickでfire=false | attack/projectile/stamp0、paint version増分0、両team grid count0 |

seed123の同じMath.random closureをmodule初期化前に設置。case準備でclosure自体を差し替えずstateをresetした。既存avatar/gear、名前seed、palette、25 geometry hash、水平aim、camera/projection、quality/shader設定は全roleで厳密一致した。runtime FXや粒子は編集・非表示にしていない。

既存Chromium flagsは `--no-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader`、viewport800×600、撮影timeout60000ms、playing待機180000msのまま。Gameをfreezeしてnative Runner/Actor/Character/IK/Projectilesを1/60固定tickで進め、実rendererで描画。flight/landingは従来のcontrolled fixtureであり、retail jump/input timing、AI/network全体の確認ではない。無入力は120tick warmup後のready idleで、別担当のrespawn/landing修復の代用にしない。

## actual rendered movementとdeadline

30Hzは各drawで2ticks、描かれたtickは1,3,…,65。全6caseで実描画のdrum center/axle、pose、両手gap、kid/fold、hand quaternion/vertex指標が、そのtickのnative状態および同じ候補60Hzの対応native状態と一致した。

攻撃5caseはmain7e・候補30・候補60すべてで、実projectile初発生／releasedが31tick、attack消去が56tick。これは観測されたINKWAVE simulation tickで、本家frame定数ではない。56での元poseへの引渡しを保ち、30Hzでは次のodd57を描く。gateを57へ延ばしたわけではない。通常は48以前/56以降、earlyは46以前/56以降、再押下は51以降、late/idleは全tickの元pose不変を照合した。

[全解析](analysis.json)と[実描画45–59 CSV](rendered-movement.csv)に各drawの中心・速度・有限加速度を保存した。30Hzの値は2ticksをまとめた描画差分で、native1tickの微分やretail動画encoded frameと混同しない。胴体前のdrum遮蔽・upright pathのtradeoff、55–57のsettling等は既存候補のままで、今回tuningしていない。

## real paintとcanonical

caseごとにnative PaintSystemをclearし、native `splat`呼出しのworld入力/opts/戻り値/CPU countを観測した。通常の`paint.flush(1/hz)`を描画ごとに通し、CPU grid/coverage/count/SHA256も保存。GPU atlasを描くがGPU pixel parityは主張しない。wrapperは読み取り記録だけで元メソッドを呼び、case終了時に復元する。

main7e30対候補30では全6caseの全66行で、入力edge・pos/vel/grounded・ink・cooldown・flick/rolling・attack、projectileの記録したscalar/vector状態、paint version/countが一致した。完全paint auditと乱数stateも一致。攻撃caseは各13stamp、idleは0stampだった。

候補30対60も全6caseで同じcanonical状態、physical stamp入力/opts/結果、CPU grid hash/count/coverageが一致した。無入力は全roleで0攻撃・0弾・0stamp・grid全0。入力を放した後の既存projectileの塗りまで0とは主張せず、元と同じ正規処理を保っていることを確認した。

## strict比較の失敗を保持

**全FX snapshotの厳密一致は失敗しており、passへ変更していない。** [preflight記録](checks/preflight-comparison.json)とanalysisのstrictFailuresに残した。

- main7e30対候補30: 攻撃5caseでFX checks/drop配列が不一致。最初は通常34tickのchecks36対32、他は35tickのchecks40対36。RNG state、canonical、完全paint auditは一致する。idleのFXは一致した。
- 候補30対60: 最初の通常caseで35tick以降のRNG/FX telemetryが不一致。physical stamp args・CPU grid等は一致するが、stampに添えたrngBefore/Afterは異なる。残り5caseのRNG/FX/完全paint auditは一致した。

既存`firefight-tier-budget.mjs`はcosmetic drop queryを `_iwCosmeticPhase` の3phaseでdeferし、`G.fx.clear()`はそのphaseをresetしない。boot後のphase差は観測差の候補だが実phaseを記録しておらず、今回の原因確定/修復とはしない。新しいphaseリセット、FX変更、粒子抑制を加えて一致させていない。上部背景差もあり、完全同一frame画像や全体の実画面受入を主張しない。

## source/baselineと保護

[build identity](build-identity.json)参照。実baselineはdetached main `7e027ac2ff7eea31c04155e0ee1e0d3e5604ed51` から通常buildし、input blobをpackaging10/10で照合した。初回はcwdを誤った別出力だったため除外し、今回のデータには使っていない。候補はhead433299と全treeが同じimmutable stationary-siteを使い、同じくpackaging10/10でhead433299のinputへ照合した。

旧120Hz timeout logを固定head内の保存blobとworkspace原本でbyte照合し、[original log](checks/protected-120hz-original.log)とSHA256を保存した。旧baselineのreused-context120Hz repress-edge・tick65 `page.screenshot` 60000ms timeoutを再実行せず、timeout/flagsも変更していない。Nintendo参照HTTP403も再取得・迂回しない。

[raw18case](raw)、[完了log](checks)を保存。canonical/poseの限定確認が通っても、strict FX/RNG・全画像・本家・120Hz・必須CI受入には拡大しない。公開runtime/PR headの変更はない。

```sh
node scripts/check-inkwave-roller-30hz.mjs <immutable-main7e-site> <out-main7e30> 30
node scripts/check-inkwave-roller-30hz.mjs <immutable433299-site> <out-candidate30> 30
node scripts/check-inkwave-roller-30hz.mjs <immutable433299-site> <out-candidate60> 60
node scripts/analyze-inkwave-roller-30hz.mjs reports/roller-browser30-20261023 /tmp/roller30-analysis.json --published
```

checkerは30/60だけを許し、120Hz planは持たない。記録した失敗を省略せず、native/runtimeも変更していない。
