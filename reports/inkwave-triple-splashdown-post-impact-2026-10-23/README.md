# Triple Splashdown: native impact 後の通常ゲーム画面

実装を `8437516cebd527e033711631174c4a711083aa26`（tree `5a7a732338c88d6ff5160202fe59b2b20358e39e`）で固定し、中央／左右の native impact を基準に +0、+2、+4、+6、+10 simulation tick を撮影した。ランタイム、ゲーム物理、VFX、シェーダー、カメラ制御は変更していない。今回の追加は検証記録のみ。

[通常ゲームカメラの比較シート](normal-game-camera.png)

## 撮影条件と時間の定義

- 通常 production boot、tidewater、通常HUD、既存のゲーム追従カメラ。固定検査カメラは使っていない。
- 初期スポナーから通常の射撃入力で飛び出して接地。保存済みカタログ設定で Triple Splashdown を選択し、ゲージを準備して Q 入力する。bots は固定。発動後の操作や物理・演出の調整はしていない。
- `debug.step(1000/60)` を1回ずつ実行し、各simulation stepで通常のゲーム描画も1回行う。指定10時点だけPNG静止画を取得した。**simulation は固定60 Hz、連続 capture FPS／encoded video FPS は該当なし**。実時間FPSやディスプレイ更新率の測定ではない。
- 親の本家参照は encoded 25 fps であり、この担当は参照を閲覧していない。録画フレームを simulation tick に換算・対応付けしていない。
- `+0` は native `impact` を発行した **通常ゲームフレームを最後まで処理・描画した直後**。そのstep内のFX更新・カメラ更新を既に経ているため、粒子の厳密なage=0や録画のサブフレーム境界は意味しない。
- `G.time` はゲーム時計。イベント発行時刻、発行時カメラ、各撮影時の position / quaternion / FOV / projectionMatrix / matrixWorld / rig yaw・pitch を [receipt.json](receipt.json) に記録。発行時カメラと描画後カメラは更新順序により異なる。
- viewportは1280×800。比較シートは各画面を512×320へ縦横比を維持して縮小し、注記を画面外に配置した。クロップ、描き足し、エフェクトの合成はしていない。本家映像・画像は含まない。
- localStorageへの品質設定は従来の撮影と同じ `quality:low, shadows:false, bloom:false, minimap:false`。Chromium 154、WebGL2、ANGLE SwiftShader。明示的GPU起動フラグは追加していない。

## native event と撮影時点

| 基準イベント | native index | 発行simulation frame | 発行G.time | +0 / +2 / +4 / +6 / +10 のsimulation frame |
| --- | --- | --- | --- | --- |
| 中央・本体 | -1 | 70 | 12.800000000000216 | 70 / 72 / 74 / 76 / 80 |
| 左右の拳（同じtick） | 1、0 | 87 | 13.083333333333563 | 87 / 89 / 91 / 93 / 97 |

発動は入力後 simulation f1、`G.time=11.650000000000158`。フレーム番号はこの撮影の入力後step数であり、本家録画番号ではない。両拳は同tickなので下段の各画像に左右とも含まれる。

中央の描画後カメラは +0 の `(-0.178057, 4.390509, -31.635250)` から +10 の `(-0.176605, 2.273174, -31.647676)` へ通常追従で移動する。左右は +0 の `(-0.175882, 2.390868, -31.653574)` から +10 の `(-0.175152, 2.506457, -31.659259)`。FOVは全採取時点で `60.09084937317433`。カメラを固定していないので、画面上のサイズ変化だけをワールド空間の膨張量とはみなさない。

## この担当が実際に画像で確認したこと

- 中央 +0 は手前に輪が見え、中央 +2〜+6 では手前の曲面と強い飛散片が現れる。+10 でも大きな曲面が画面下部を占める。f70だけで後続の形を判定するのは不十分だった。
- 左右 +0 は左右の着地点の細い柱と飛散片、+2〜+4 は左右に丸い盛り上がり、+6〜+10 では低く広がった帯と破片が見える。
- 本家の連続画像は未閲覧のため、同じ段階のドーム／シートに一致するか、大きな演出不足があるかは **未判定**。本家比較済みや一致済みとはしない。今回は修正を開始していない。

## 検証と再現

- イベント検出を基準に採取し、中央・左右それぞれ `[0,2,4,6,10]` の5枚、計10枚を検査した。
- 画像ごとに `frame = impactFrame + offset`、`G.time - impactTime = offset / 60` を検証した。
- native impact index順序 `[-1,1,0]`、WebGL2有効、console/page error 0、VFX内部エラー0、ブラウザ撮影 exit 0。
- 全emitted artifactを保存済みmanifestのSHA256と照合し、VFX source SHA256も実装commitの `6f8a4b63fc09553392cd6adeeeb10189c56b55f3bbdd24808eda4263807afbcb` に一致した。
- build revision `ddb44ae400c150197e567a67b85016e01f7556a724258cc17c930ac3b31b13d7`、contentHash `ed7294f6204a4ed3965bc686282f5ee116c43a4ecce3489f176f4cae21b72638`。前回と同じ保存済みminifiedビルドを使い、撮影のための再ビルドは行っていない。
- `git diff 8437516 -- inkwave-public patches scripts` が空であることを確認した。ゲーム実装に変更がないため、既存ゲームテストの再実行はしていない。

実行したハーネスは [capture-normal-post-impact.mjs.txt](capture-normal-post-impact.mjs.txt)、シート生成は [render-contact-sheet.py.txt](render-contact-sheet.py.txt)。これらは再現用のテキスト記録であり、ゲームやビルドの実行経路には追加していない。

再現時はハーネスをrepo配下の `.ci-scratch/triple-splashdown/post-impact/capture-normal-post-impact.mjs` にコピーし、同じビルドを指定する。

```sh
CHROMIUM_PATH=/usr/bin/chromium node .ci-scratch/triple-splashdown/post-impact/capture-normal-post-impact.mjs --site .ci-scratch/triple-splashdown/candidate-site --evidence-dir .ci-scratch/triple-splashdown/post-impact/raw
```

シート、receipt、撮影ログ、再現テキストのハッシュは [evidence-sha256.json](evidence-sha256.json)。元の10枚のPNGは同ハーネス出力ディレクトリに保持し、各SHA256をreceiptに記録した。リポジトリには画像アーカイブや本家画像を同梱せず、小さい比較シート1枚だけを追加した。
