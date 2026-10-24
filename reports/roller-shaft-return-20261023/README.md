# 通常ローラー縦振り: 実shaftを経由するunheld return候補

**候補保存。採用・本家一致は未承認。** 独立レビューから受領した球面二次経路を、基本`weaponId=roller`の表示専用wrapperだけで試した。runtimeコードcommitは`5d9b5b408b5aab23ce2a500931b2874d5fe46d8a`。branchは`candidate/roller-vertical-shaft-return-20261023`、基準runtimeは公式main`7e027ac2`と同じa8a8b99d。main・既存PR・cf9/37a/4ddの不採用3案・a8診断原本は更新しない。Work・サブエージェントは使っていない。

## 実装の範囲と式

`roller.mjs`の右腕表示wrapperに小さいhelperを接続した。共有native IK、grip/socket/左支持、mesh/hair/skin、横振り、native入力・runner・physics・paint/network、別担当spawn/reset/landing gateを変更しない。Carbon/Dynamo/Flingza等は対象外で全出力を旧版と照合し、各武器のtimingを上書きしない。

既存verticalの`end=max(windup+2/60,interval)`、`settle=windup+min(5/60,(end-windup)*.35)`、`back=max(settle+(end-settle)*.1,end-10/60)`を使う。発射済み、unheld、非rolling/contact、既存right-arm適格時だけ有効。`holdRoll`はZRとgroundedの積なので、実際の`actor.intent.fire`も読み、空中falseを解放と取り違えない。

back以降の最初の適格sampleでは元solverを完走し、その実elapsed=t0とnative右腕IKへ渡す最終q0を保存する。今回のfixtureは47までheldなので**t0=48、46では開始しない**。開始sample自身は変えない。

```
weapon0 = q0 * inverse(handR.socketQuaternion)
shaft0 = weapon0 * local +Z
upLocal = normalize((inverse(kidQuaternion) * world +Y) / kidScale)
qUp = shortestRotation(shaft0 -> upLocal) * weapon0 * handR.socketQuaternion
x = clamp((elapsed-t0)/(end-t0), 0, 1)
u = x*x*(3-2*x)
a = shortestSlerp(q0, qUp, u)
b = shortestSlerp(qUp, currentLiveInputOrientation, u)
qCandidate = shortestSlerp(a, b, u)
```

qUpは固定し、未来endpointは保存しない。候補も元のtarget clamp/alignLeft/live-cylinder評価へ通す。不合法なら元solverへfallbackし、失敗数を記録する。fallbackを連続性成功とは扱わない。attack identity変更・巻戻し・取消・再押下・form不適格・deadlineでは以前の経路を持ち越さない。既存のnative終了で直接元へ戻り、fading tailを足さない。

## 実ブラウザの結果と懸念

同じchecker、既存avatar/gear、名前seed3564230742、Aqua/Cherry palette、25 geometry SHA、水平aim、native cameraで比較した。色・装備違いのA/Bではない。元build contentHash`caa80f...d100`と候補`51b803...cdd4`は別保存。[build identity](build-identity.json)、[raw](raw)、[完全解析](analysis.json)、[簡約](summary.json)、[39–57tick CSV](ticks-39-57.csv)。数値はINKWAVE単位で、retail encoded frameや実測メートルではない。

| 基本roller・同じnative入力 | 元 | 候補 |
| --- | ---: | ---: |
| 40tickのdrum移動 | 0.788756 | 0.788756 |
| 48tick開始sampleの移動 | 0.292492 | 0.292492 |
| 49tickの実drum中心移動 | 1.109129 | 0.253771 |
| 48–56最大1tick移動 | 1.109129@49 | 0.723188@53 |
| 48–56最大加速度（単位/s²） | 4155.844@49 | 1959.650@49 |
| 48–56移動総量 | 4.063008 | 4.363164 |
| 50–56移動総量 | 2.661387 | 3.816900 |
| 55→56の移動 | 0.036617 | 0.168101 |
| 48–56投影centre最大移動 | 129.750px@49 | 69.924px@51 |
| 48–56実axle最大角変化 | 1.897308rad@49 | 0.746307rad@53 |

**49の段差は減るが、後半へ動きが移る。** 40tickと48開始点以前、56以降の全native行は元と厳密一致した。56で位置・軸・姿勢の残差はないが、直前の有限差分は大きい。31–56、39–56、48–56、50–56を別々に保存しており、49だけや総移動低下だけを受入指標にしない。

同条件画像を実際に読んだ。[元49](images/before-49.png)／[候補49](images/candidate-49.png)では低いfollow-throughが残る。[元53](images/before-53.png)／[候補53](images/candidate-53.png)では候補のdrum端面がカメラ側へ向き、軸の見え方が大きく異なる。これを本家のモーションと認定しない。[元40](images/before-40.png)／[候補40](images/candidate-40.png)、[元56](images/before-56.png)／[候補56](images/candidate-56.png)も保存した。

48–56の実vertex最低点は**+0.024645**、物理的な左右grip gap最大**1.35e−15**。Box3の回転した保守AABBは48で負になるが、実vertexは正だった。右手IK targetの並進は元と厳密一致、通常caseのfallbackは**0**。floor評価1,472件も元と同数で、大きな探索を追加していない。

観測wrapperあり/なしの候補の全66tick・geometry測定が一致。実context間を位置/scale線形・quaternion最短補間して512中間点を再計算すると、最小cylinder bottom**+0.003847**、両reach誤差0だった。[dense計測](dense-constraints.json)。これは有限のsnapshot補間検査で、任意の3D入力・全変形・本家一致の証明ではない。

## 操作・refresh・生成物の検査

- source／実minify生成物で、解放before/at/after back、late release、repress、空中、moving aim、reset/表示取消/form中断、繰り返し・再利用、実paint stamp入力を比較。検査対象ではfallback0。**遅い解放の最初のsampleに元からあるjumpは残る**。そのsampleを元どおり捕捉する設計で、全解放edgeを解消したとは扱わない。
- 再押下からnative rolling/contactに実際に入る追加検査では、以後の全表示・paint入力が元と一致し、切替のdrum移動も増えていない。carryをrollへ強制しない。
- 通常rolling・横振り・Carbon/Dynamo/Flingzaは全出力が旧版と一致。30/60/120Hzと繰り返しの各180 native tickも一致し、3種以上のwindupを維持した。
- 実Chromeは元/候補の60Hz×4操作、30Hzと120Hzの通常解放をすべて完走。全case66 simulation ticks、renderは33/66/132。native行はrefresh間でも厳密一致。120Hzでは開始後65回のzero-tick描画が直前と同じ実pose/fold/kid transformを描いた。flags・800×600・60000ms撮影timeout・描画方式を変えていない。旧reused-context120Hz timeoutやsession39616の別結果を上書きしていない。
- 単体4/4、browser evidence再生2/2、既存focused47/47（support8を含む）、exact commit入力blobへ生成物を照合するpackaging10/10。support検査はcurrent-source SHAだけを追随し、3つの故障anchor・b34原本・閾値を維持した。
- 最終production統合検査は**source8/8・実minify生成物8/8**成功。[checks](checks)と[操作別source trace](raw/operation-cases-source.json.gz)／[emitted trace](raw/operation-cases-built.json.gz)を参照。stamp比較は実native CPU PaintSystemとProjectilesを通し、GPU surfaceだけheadless stubを使う。GPU画像のpixel parityを主張しない。VMではoptional source-motion loaderは使えないため、実browserでロード済み・roller active=falseを別確認した。

追加サブQAの最初の失敗はfixtureのcamera未設定だったため、fixtureだけを補った。閾値緩和・skip・runtime中断gateの変更はしていない。最後はnativeサブの実発生・軌道も比較して通過した。

公開rawから解析を再実行し、保存analysis.jsonとbyte一致した。元と候補のchecker／metrics helper SHA、選択geometry／cameraも機械照合した。独立再生のq0/qUp期待値はテストにだけ置き、runtimeにhardcodeしない。

## alloc・実負荷

normal frameでは診断payloadを作らない。5 Quaternion＋2 Vectorを最初のCharacter recordで確保し、以後のsample・再利用にcloneを追加しないことを検査した。helper単独7×50,000回の中央値はsource約**0.446µs**、emitted約**0.262µs**、比較用copy約0.023µs。[benchmark](benchmark.json)。GC後heap差はノイズを含み、全alloc計測やGPU性能値ではない。

同じ観測なしchecker・同じ条件の単発browser wallは元102.671秒／候補99.728秒、child user秒3.864／3.983、child max RSS KiB187204／185380。[元計測](before-time.json)、[候補計測](released-60-time.json)。boot・SwiftShader・撮影込みで、性能改善や全process peak memoryの保証ではない。通常解放caseのdraw call増分3233、triangle増分14,318,378は元/候補で同じ。新しいgeometry・particleを追加しない。

## 未完・保護範囲

これは通常ローラーだけの**未受入候補**。後半の大きい移動・53tickの軸向き・late edgeに残る既存jumpはレビュー対象で、見た目全体の承認はない。他rollerへ適用を広げず、native gameplay/lifecycleを変えない。CI・本家同条件比較は未完。公式紹介ページ／player`NablZy7jqxO`の既存HTTP403は再取得・迂回していない。任天堂mediaは含めていない。

```sh
node --test patches/splatoon3/tests/roller-vertical-shaft-return.test.mjs
node --experimental-vm-modules --experimental-global-webcrypto --test patches/splatoon3/tests/roller-shaft-production.test.mjs
INKWAVE_BUILT_SITE=<site> node --experimental-vm-modules --experimental-global-webcrypto --test patches/splatoon3/tests/roller-shaft-production.test.mjs
node scripts/analyze-inkwave-roller-shaft-return.mjs reports/roller-shaft-return-20261023 /tmp/replayed.json --published
```
