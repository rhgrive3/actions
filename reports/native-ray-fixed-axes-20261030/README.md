# Native ray の固定3軸 slab

基準は `5637c8038e00466a8022c4d2b705ec9e5dc1c8d2`。Hagglefish の実163,625三角形を使用した。`TriangleWorld.ray` の非垂直レイで、各 BVH ノードの3軸ループを x/y/z に展開する。座標の読取順、除算と比較、unordered/coercion fallback、早期除外、子ノード順、同距離の source triangle ID、戻り値と出力所有権を維持する。垂直 ray と `rayDownBatch` の実装は変更しない。訪問ノード数を減らす変更ではなく、各ノードの軸選択とループ制御を減らす変更である。

調査に用いた900 tick native profileは `_frame` 内8,514 samples中、ray self419、rayDownBatch self195だった。負のtimeDeltaがあるため、この件数を時間比率や速度の根拠にしていない。rayDownBatchの共通Y再利用も検討したが、公開APIのgetter・途中書換・再入の読取契約を守る条件が重くなるため実装していない。

## 独立レビュー後の加算順修正

固定軸展開時に `ni+3+k` の左結合を `ni+4/5` に畳んでいた点を修正し、y/z上限を `(ni+3)+1/2` とした。通常のInt32子ノードでは起きないが、巨大なstack indexを返すProxyでは浮動小数の丸めが変わり、異なるプロパティを読む。[修正前の負例](huge-index-negative.log)を再現し、near-zero方向を含む巨大indexの読取順・例外・stack解放を検証した。

また、初期finite検証でthrowしていた従来coercion試験を補い、nth valueOfでslab中のthrowを確認した。far.valueOf中のthrow、nested ray、反復する値変更、origin/direction/node途中変更も比較した。[追加6試験](coercion-tests.log)、[関連28試験](left-associated-tests.log)、[修正後の実形状16,000 ray](native-parity-left-associated.json)は成功した。集約は[left-associated validation](left-associated-validation.json)を参照。

現時点の部品計測表と通常配信build receiptは加算順修正前の候補に対応する。修正後の再ビルド・部品再測定は共有枠の解放後に実施する。

## 実入力の記録と部品計測

通常配信された基準ビルドで、low、shooter、60Hz、8人、900 tickの入力を記録した。ray wrapperがcanonical判定やbatch処理を変えないよう、判定を維持し、batch中だけ元のrayを呼ぶ。[記録器](record-harness.mjs.txt)と[照合結果](recording-parity.json)を保存した。元のprofile実行との initial、全フレームdigest、最終digest `1606414722`、塗り `[11915,10228]`、BVH `247281 / 5193821`、draw、resources、sceneが一致し、page errorsは0だった。記録器の時間は性能の根拠に使わない。

記録したscalar ray全138,886本を、同じ実三角形・入力・options・出力所有権でNodeから再生した。全交点、hit数、query数、triangleTestsを照合してから、ABBA warmup後、ABBA/BAABを交互に4 blocks（各版8回）計測した。次の値はprocess CPU時間の中央値で、偶数件の中央値は中央2値の平均とする。

| 種別 | 実呼出数 | 基準CPU ms | 候補CPU ms | 短縮率 |
| --- | ---: | ---: | ---: | ---: |
| 全scalar ray、元の混在順 | 138,886 | 302.617 | 274.094 | 9.43% |
| 垂直down、変更しない対照 | 50,426 | 91.739 | 90.908 | 0.91% |
| 斜めanyHit | 6,193 | 10.616 | 9.374 | 11.70% |
| 斜めnearest、far ≤ 1 | 62,552 | 128.958 | 120.136 | 6.84% |
| 斜めnearest、far > 1 | 19,715 | 49.094 | 43.253 | 11.90% |

[全試行・環境・実装ハッシュ](component.json)は不利な値も保持している。例えば垂直downの候補最大値は110.871msで、基準最大96.074msより遅い。カテゴリを分けるとJITやキャッシュ状態が変わるため、カテゴリ中央値の合計を全体中央値として扱わない。実対戦フレーム時間、GPU、端末FPS、画像同一性の測定ではない。batch、capsule、sphere sweepの速度効果は測っていない。

[入力全件](ray-inputs.json.gz)は再生可能なgzip JSONである。JSONは符号付きゼロを正のゼロへ正規化するため、符号付きゼロの同等性は別の境界試験で確認した。記録した範囲は1ステージ・1ブキ・1入力系列に限られ、全ステージやブキの頻度分布を代表するとはしない。

## 機能検証と残る確認

- 既存ray/downward slab/BVH lifetime/ground batch/mask/LOSの24 tests成功。ランダム12,000 ray、異常slab 18,144回、極値predicate 1,005,400回、30/60/120Hzのnative移動と実weapon admission/damage/paintを含む。
- [追加3 tests](fixed-axes-tests.log)成功。getter/proxyの全読取順、各軸early reject、読取例外、非number coercion、node getter中のnested rayとnode途中書換を、変更前の厳密なループと比較した。
- [Hagglefish実形状の独立16,000 ray](native-parity.json)は全hit情報、query16,000、triangleTests4,157,951が一致した。
- 通常配信ビルドとemitted testsの結果は `build-validation.json` を参照。候補ビルドの実battle全体・画像比較は親作業で確認する範囲として残す。

Splatoon 3の既存比較条件Ver.11.3.0を引き継ぎ、新しい移動・射撃・塗り・衝突の数値は導入しない。本家内部のBVH方式を推定せず、既存の実機挙動比較の未確認項目は維持する。

再生コマンド（baseline sourceは指定commitから取り出す）:

```sh
git show 5637c803:patches/native-stages/runtime/triangle-world.mjs > .ci-scratch/triangle-before.mjs
node --experimental-vm-modules scripts/benchmark-native-ray-inputs.mjs --baseline-file .ci-scratch/triangle-before.mjs --prebuilt-root /workspace/actions-native-base/native-prebuilt --stage hagglefish --inputs reports/native-ray-fixed-axes-20261030/ray-inputs.json.gz --blocks 4 --out .ci-scratch/ray-component.json
```

HydrateしたHagglefishの17ファイルは[asset binding](native-asset-binding.json)のSHA-256を検証して使用する。元モデル・テクスチャ・変換済み三角形はこの変更へ追加しない。
