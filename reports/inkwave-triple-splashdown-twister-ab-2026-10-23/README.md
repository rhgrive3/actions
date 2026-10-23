# ウルトラチャクチ one-band TWISTER 候補: 実ブラウザ A/B

**判定: この凍結候補の採用は推奨しない（reject）。** 直立した縁は曲がった細い帯になるが、左右 +18〜+26 では規則的な輪／螺旋の面が目立つ。終端では候補だけに不透明な細片が残り、+40→+41 のband破棄で消えることを実画面で確認した。丸い飛散片・直線柱・既存ドームは両版に残る。機能テストや同一粒子数から品質改善を推定していない。

この担当は親の本家sheetを閲覧していない。親の「本家では長く曲がって交差する筋が見える」という観察を引き継いだが、上の判断は **INKWAVEの元版と候補の実画面A/B** に対するもの。本家との形状一致・距離を測定したとは主張しない。

## まず見る画像

上段A＝元版、下段B＝私有候補。各列は同一native eventからの同じsimulation tick。画面全体の縮小配置で、詳細crop以外はクロップしていない。

| 段階 | 中央 | 左右 |
| --- | --- | --- |
| +0 / +2 / +4 / +6 / +10 | [中央・初期](central-early.png) | [左右・初期](paired-early.png) |
| +10 / +18 / +26 / +38 / +48 | [中央・広がり](central-spread.png) | [左右・広がり](paired-spread.png) |
| +38 / +40 / +41 / +42 / +43 | [中央・退役](central-retirement.png) | [左右・退役](paired-retirement.png) |

[右端の退役詳細](paired-retirement-right-edge-detail.png) は同じ通常カメラ画像の `(x0,y0,x1,y1)=(1080,160,1280,440)` を両版とも同じ位置で切り出した検査用拡大。別カメラ、別レンダー、描き足しではない。候補の+38/+40では壁の看板を横切る薄い不透明なピンクの細片が見え、+41で消える。元版の同位置にはこの細片がない。

## 実際に確認した質と制約

- 中央 +10 は、元版の立った縁に代わって候補の細い円弧が見える。元の硬い壁状の縁を低く曲げる効果はある。
- 左右 +10〜+26 は帯が重なった輪／螺旋に見え、特に +18/+26 で滑らかな円周と幅の揃った面が強い。薄い膜になっても、今回の通常カメラでは液体が不規則に飛び散る感じより、輪が回る装置のように見える。ここを品質面の主なreject理由とした。
- 不透明な終端細片の消失も確認した。最大の画面占有は小さいが、元版にはない新しい消え方であり、改善として受け入れない。
- 新しい膜は既存ドームと重なって見える。既存ドームのプール状態は前後一致している。ドーム欠落を修正した候補とは扱わない。
- ±1.4 のtwist値から左右が鏡像の巻き方向になったとは主張しない。独立sourceレビューの指摘どおり、鏡像化の成功を評価成果に含めない。
- この静止画列だけで連続動作の快適さ・実機FPS・本家一致を確定していない。全カメラ角度を試した評価でもない。

## 終端: source上のリスクを実画面で確認

左右の2つのbandがともに残っている最後の採取時点は +40（simulation f127）。+41（f128）では両方とも退役している。`+0`はnative eventを発行したstepの通常FX更新・カメラ更新・描画を終えた状態なので、+40でrecord ageは41/60秒となる。

| 左右impactからのoffset | sim frame | その左右band record age | v[11]（侵食制御値） | 元版と候補の画素差 >8 / RGB各成分max |
| --- | --- | --- | --- | --- |
| +38 | 125 | 0.650000 s | 0.02548321 | 5,473画素 |
| +40 | 127 | 0.683333 s | 0.00295944 | 2,622画素 |
| +41 | 128 | recordなし | 該当なし | 0画素 |
| +42 | 129 | recordなし | 該当なし | 0画素 |
| +43 | 130 | recordなし | 該当なし | 0画素 |
| +48 | 135 | recordなし | 該当なし | 0画素 |

v[11]を単純な透明度とは解釈していない。候補TWISTERのmaskは侵食であり、値が0付近でも不透明な断片が残る。右端cropはこれを実際に写したもの。+40のA/B差は1280×800画面の約0.256%で、+41では画面全体のA/B差が0になる。差分画像だけからの推測ではなく、候補／元版双方の画面とband recordsを確認した。

中央 +41以降の画像にもA/B差が残るのは、後から発生した左右bandがまだ生存しているため。中央のbandが退役していない証拠にはしない。全3bandの退役後を独立に見られる左右+41以降で、A/B画素一致を確認した。

## 固定した実装とビルドの識別

| 項目 | A: before | B: after（私有copyのみ） |
| --- | --- | --- |
| 実装base commit | `8437516cebd527e033711631174c4a711083aa26` | 同じbase + 親の凍結patch |
| checkout base | report-only `a344249d363b6ff6e1a1322eb139f24998eaa3c7` | 同じa344のdetached私有worktree |
| VFX source SHA256 | `6f8a4b63fc09553392cd6adeeeb10189c56b55f3bbdd24808eda4263807afbcb` | `d980f1ca6304a4e2219de234f3c1cdd03737470b3f3d1f763fa54de4e44f3213` |
| build revision | `ddb44ae400c150197e567a67b85016e01f7556a724258cc17c930ac3b31b13d7` | `14d77fc58403b3bde493aed5fb8031684559233825c7e441a15d044a46a9f975` |
| contentHash | `ed7294f6204a4ed3965bc686282f5ee116c43a4ecce3489f176f4cae21b72638` | `2a442a3dc3f9c46510de9e4e8a4f358dd7835130e50613cfa5a3433d68602cca` |

両buildの入力manifestを照合し、差は `patch/runtime/special-vfx.mjs` の1件だけ。Bのsource SHA256は親が指定したafter値に完全一致した。Bを843の実装commitそのものとは表示せず、各receiptにbase、variant、source hash、私有patchの有無、build identityを記録した。私有patchのSHA256とGit blobは [build-identities.json](build-identities.json) に残した。

BはVFXだけに指定patchを適用。private test側ではspy対象を `splashdownBlast` に合わせる観測hookだけを変更し、assertionsを維持した。native event、攻撃・物理、routing、退役、他スペシャル、共通シェーダー／材質、キャラ／髪は編集していない。**候補runtimeはcommit・pushしていない。** 公開対象はこの検証記録だけ。

## A/Bの一致確認と実行条件

- saved normal-camera/native-impact harnessを拡張し、両版とも同一Math.random seed `12345` を使用。
- 通常ゲームの監査hook `__inkwave` が割り当てられた時点で既存ループを凍結し、最初のrAFから可変dtが入り込まないようにした。boot内の既存warmup 3stepは維持。通常introを253 native stepで進め、通常のスポナー射撃入力→接地→ゲージ準備→Q入力を同じscriptで実行した。ゲーム時計やactor位置を後から合わせる操作はしていない。
- その後135stepを固定dt `1/60`で進め、各stepで通常のゲーム描画を1回実行。中央／左右のnative eventから指定13 offsetずつ、A/Bそれぞれ26枚、計52枚を保存した。offsetは `[0,2,4,6,10,18,26,38,40,41,42,43,48]`。
- **simulationは固定60 Hz。選択したPNG静止画であり、連続capture FPS／encoded FPSは該当なし。** 親の録画encoded25fpsから時刻を作っていない。
- 通常の追従カメラをそのまま使用。rig pitch `-0.45`、FOV `60.09084937317433`、135stepすべてのposition/quaternion/投影行列を前後照合した。固定検査カメラは使っていない。
- これは**通常追従カメラを用いた固定step A/B検査**。introを固定stepで先に進めたため、通常HUDのwall-clock 3秒タイマーがintro終了後に条件不成立となり、HUDは非表示のままになった。前後とも同じ状態で、HUD表示やカメラを合わせるための別操作はしていない。通常の実時間プレイ録画とは区別する。
- localStorage要求設定は従来と同じ `quality:low, shadows:false, bloom:false, minimap:false`。tidewater、1280×800、Chromium154、WebGL2、ANGLE SwiftShader。明示的GPUフラグを追加していない。
- 初期ゲーム時刻は両版とも `5.2999999999999865`。中央impactは f70 / `G.time=6.466666666666649`、左右は f87 / `6.749999999999981`。native event順序は `[-1,1,0]` で一致。
- [comparison.json](comparison.json) の175チェックが一致。初期状態、毎stepのゲーム時計・Math.random state/call数・actor位置・phase・拳数・カメラ・instance数、全撮影時点の非band GPU poolバッファ／record hashes、native FX geometry buffers、ink照明uniform、team colors、kit timeを照合した。全135stepのdraw call数とtriangle数も別途完全一致を確認。
- 12poolのgeometry/index/attribute buffer bytesは両版 `631,912 bytes`、cap/layoutも一致。10instanced poolのinstance数合計のpeakは両版148（warm degenerate instance込み）。全stepのinstance数列が一致した。追加particle／instance／geometryを検出していないが、これを品質評価の根拠にはしていない。
- 両ブラウザ実行はexit0、console/page error0、VFX内部エラー0。候補のnative-impactテストはこの環境のNode24.19.0で4/4通過。親の別移植版のNode22テストを本環境のブラウザ結果として流用していない。band退役の実ブラウザ描画確認は今回60Hzのみ。

## CPUとGPU

135stepずつの逐次A/B、各1回。数値は観測結果であり、有意な性能回帰や改善を確定する反復ベンチではない。

| CPU対象 | A mean / median / p95 / max (ms) | B mean / median / p95 / max (ms) |
| --- | --- | --- |
| native Director.update | 0.1348 / 0.1000 / 0.4000 / 2.3000 | 0.1430 / 0.1000 / 0.3000 / 2.9000 |
| 全シーン R.render 呼び出し | 4.1326 / 3.8000 / 6.7000 / 10.5000 | 3.7756 / 3.5000 / 5.5000 / 10.1000 |

VFX更新平均は **+6.04%（+0.00815 ms）**、maxも2.3→2.9 msに増えた。レンダー呼び出しCPU平均は-8.64%。タイマ刻みやスケジューリングの影響を含む単発対であり、これを安定した速度差とは判定しない。PNG保存・状態hash計算はこれらの計測区間から外している。

`EXT_disjoint_timer_query_webgl2` が両版とも利用不可だったため、**GPU時間は取得できていない**。上のR.render CPUにはGPUへのコマンド送信や待ちが入り得るが、GPU時間や実機FPSの代用とはしない。権限や起動フラグを変えて取得を迂回していない。

## 保存した証拠

- receipts内の重複した `rows[].snapshot` コピーだけを省き、同一データを `captures[].snapshot` に1回ずつ保持した。省略前raw receiptのSHA256も記録した。値は変更していない。
- before / after receipts: [A](before-receipt.json) / [B](after-receipt.json)。全52原画像のSHA256、camera、event時刻、pool状態、CPU samplesを含む。
- [A/B検査と画素差・CPU集計](comparison.json)、[build identity](build-identities.json)、[候補native-impact test](after-native-impact-tests.log)。
- [撮影ハーネス](capture-ab.mjs.txt)、[比較計算](compare-ab.py.txt)、[sheet生成](render-ab-sheets.py.txt) は再現用テキスト記録。ゲーム実行経路には追加していない。
- 全recordのSHA256は [evidence-sha256.json](evidence-sha256.json)。通常画像の比例縮小と、明示した右端crop以外の画像加工はしていない。
- 原画像52枚は `.ci-scratch/triple-splashdown/band-ab/{before,after}/` に保持。リポジトリには小さな比較シート7枚と記録を保存し、画像アーカイブや任天堂素材は同梱していない。Libraryは既知の正規接続失敗を繰り返していない。
