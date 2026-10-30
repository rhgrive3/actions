# ネイティブステージの継続的な負荷の修正

基準: `fd6435a4dd2781928d211537c485c87bc50b3784`。実装・検証対象: `d3313ffdf4f553dde06549ff27a7de5d32dfe6b0`。

「ネイティブステージでプレイ中ずっと重い」という報告に対し、毎フレームの描画選別と接地判定を軽くし、極端な低FPSで既存の自動解像度調整が停止する不具合を修正した。ロボROM-enの変換済み実データを使った。実機の端末・GPUは未計測で、下記のCPU部品の削減率をゲーム全体のFPS改善率とは扱わない。

## 変更と根拠

1. `native-render.mjs`: 画面・影・反射のカメラが変わるたびに、選ばれた三角形の全インデックスを個別に比較していた。元の順序の連続区間を読み込み時に記録し、変わらない先頭を除いた区間を型付き配列へ一括コピーする。細かく交互に並ぶメッシュでは従来のループを使う。頂点、UV、三角形順、影、保留中のGPU転送範囲は維持する。
2. `triangle-world.mjs`: 接地の9本のレイについて、BVHの各ノード・三角形で9本すべてを走査していた。候補ビットが立つレイだけを同じ昇順で処理し、三角形の定数計算を共有する。交点、同距離時の勝者、カウンター、カスタムレイのフォールバックを維持する。
3. `_dynRes`: 250msを超えるフレームをすべて除外するため、4FPS未満が続くと自動解像度調整が一度も動かなかった。可視・プレイ中・非ポーズのネイティブ対戦で4フレーム連続した場合だけ、既存の調整へ渡す。診断用の1サンプルは最大1秒とし、実際のシミュレーション時間は変えない。単発停止、非表示、ポーズ、Ultra、手動診断を除外し、改善しない解像度試行は既存どおり元に戻す。画質下限や通常フレームの制御も変えない。

## 計測

同じ実データと入力を用い、変更前後を交互に実行したNode CPU計測。実装とデータのハッシュ、全サンプルはJSONに保存した。

| 部品と条件 | 変更前CPU中央値 | 変更後CPU中央値 | 結果 |
| --- | ---: | ---: | --- |
| 描画選別: Roboの63メッシュ、240視点×4周、8組 | 5917.535ms | 371.359ms | 93.72%短縮 |
| 接地: Roboの実三角形上、5000回、7組 | 138.341ms | 119.181ms | 13.85%短縮 |
| 接地の密な合成面対照 | 31.443ms | 31.680ms | 0.75%増加 |

[描画の全サンプル](display.json)は全インデックス、描画数、転送範囲、更新回数の一致を検証した。[接地の全サンプル](ground.json)は全交点とクエリー／三角形テスト数の一致を検証した。描画計測の三角形合計には当初Three.jsの`Infinity`番兵が混ざったため、計測値を保持したまま、同じ入力を使って有限の選択数を再計算した。

[負荷調整の対照試験](dynres.json)では、300ms間隔を40回渡しても基準版は調整しない。修正版は既存の0.875倍の試行へ進み、間隔が改善しなければ1.0へ戻る。これは制御ロジックの試験であり、端末のFPS計測ではない。

塗りの点中心判定を先行する候補も比較したが、所有権再生の中央値が約1.1%遅かったため採用しなかった。塗りの製品コードは変更していない。[不採用の記録](paint-rejected.json)。

## 検証と再現

- 描画・接地・インクの重点ソース試験: 48成功、失敗0、既存アセット依存5skip。
- 負荷調整・クロック・ポーズ・手動診断・コンテキスト復旧: 100成功、失敗0、skip0。
- 最適化済み配信インク試験: 19成功、失敗0、既存アセット依存5skip。
- 入力互換性、通常ビルド、起動サイズ予算、移行監査: 成功。
- 実ブラウザ: Robo、medium、960×540、通常8人対戦。600フレーム準備・15フレーム描画warmup後の3区間で、全アクターの状態・塗りグリッドが一致した。前・左・後・右の4画像は変更ピクセル0、PNGハッシュも一致。新規シェーダープログラム0、ブラウザエラー0。
- 実配信`_dynRes`の追加プローブ: 300ms×40回で`[0.875, 1]`と調整・復元し、シミュレーションtickは633のまま変わらなかった。

[検証要約](validation.json)、[ブラウザ比較](browser-comparison.json)、[基準の生データ](browser-before.json)、[候補の生データ](browser-after.json)を保存した。[コミットとの入力照合](source-binding.json)では、両ビルドの全1561入力と各コミットが一致し、ブラウザ起動前には各2283配信物のハッシュも検証した。

SwiftShaderでの完了待ち込み処理速度は、この1回の対では0.4259→0.4465フレーム/秒だった。実GPUのFPSではなく、短い3区間の時間は変動するため、この約4.8%を実機の改善率や継続的な高速化の保証として使わない。採用根拠は同一結果での部品CPU削減と、極端な過負荷を無視していた制御の修正である。

Node 24.19.0、esbuild 0.28.2、Playwright 1.62.1。実ブラウザはChromium 151のSwiftShaderを使用する。`native-prebuilt/robo/`と以下の2パックをLFSで取得した。元のOBJ・MTL・PNGをGitへ追加していない。

```text
native-prebuilt/packs/0ea1220dded1953ebc6bf130e3870e91.bin
native-prebuilt/packs/a539e5f0d9b2d65a34d002f0aa41f537.bin
```

```sh
mkdir -p .ci-scratch/native-performance
git show fd6435a4dd2781928d211537c485c87bc50b3784:patches/native-stages/runtime/triangle-world.mjs > .ci-scratch/native-performance/triangle-before.mjs
node --experimental-vm-modules scripts/benchmark-native-ground-mask.mjs --baseline-file .ci-scratch/native-performance/triangle-before.mjs --stage robo --out .ci-scratch/native-performance/ground.json
node --experimental-vm-modules scripts/benchmark-native-display-runs.mjs --stage robo --out .ci-scratch/native-performance/display.json
node --test patches/local-quality/tests/native-sustained-dynres.test.mjs patches/local-quality/tests/refresh-aware-dynres.test.mjs patches/splatoon3/tests/clock.test.mjs
```

基準と候補の別チェックアウトを通常ビルドし、同じ引数で次を実行する。

```sh
node scripts/benchmark-inkwave-native-render.mjs --site ../site-before --out ../native-render-before --warmup 15 --frames 5 --runs 3 --setup-frames 600
node scripts/benchmark-inkwave-native-render.mjs --site ../site-after --out ../native-render-after --warmup 15 --frames 5 --runs 3 --setup-frames 600
python3 scripts/compare-inkwave-native-render.py ../native-render-before ../native-render-after --min-speedup 0 --out ../native-render-comparison.json
```

描画の固定入力比較はシミュレーション、塗り、カメラ、影、解像度を同じ条件にする。この比較の合否は状態・画像の一致を目的とし、ソフトウェアGPUの速度閾値は設けないため`--min-speedup 0`を明示する。CPU削減率は上記の独立した部品計測による。候補の実行では通常のベンチマークの画像取得後に、[追加プローブ](emitted-overload-probe.mjs.txt)を挿入して実配信の`_dynRes`へ300ms間隔を入力した。レンダラーの調整呼び出しだけを記録し、判定後は元の状態へ戻す。時間計測・画像比較の区間は変更していない。

Splatoon 3の比較条件は既存記録のVer.11.3.0を引き継ぐ。今回の最適化で新しい移動・射撃・塗り・当たり判定の数値は導入しない。Nintendoの内部描画・負荷調整方式と同じという主張はせず、既存の本家実機比較の未確認項目は維持する。

## 追調査: 異常な重さの解消は未確認

ユーザーの「異常に重くなる問題」全体を解消したとは判定していない。上記は負荷の一部削減と制御不具合の修正であり、報告端末での再現・原因の特定・改善確認が残る。PR #1946はこの追記時点で未マージ、CIも待ち行列にある。

既存の`measure-inkwave-native-sim.mjs`は計測のために`physics.raycast`と`world.ray`を置き換えていた。そのため正規メソッドとの同一性を検査する接地バッチ・Boolean LOSが無効になり、遅いフォールバックを計測していた。今回、両メソッドを保持して呼び出し元と既存カウンターを観測するよう修正した。回帰2件は正規経路の維持と旧計測の負の対照を確認した。以前のラッパー付き14～17ms/tickを通常プレイの費用として扱わない。

修正後の追加診断は、Roboで同じ600tickを60Hzと300ms間隔（最後だけ100ms）で実行した。接地の正規経路を維持しても、呼び出し元のタイマーと追加カウンターの負荷は残る。平均CPUはそれぞれ19.21ms/tickと13.12ms/tickで、実機性能でも前後の改善率でもない。アクターの表示処理は6.248→2.229ms/tickとなり、既存の途中tickの表示省略が働く。物理クエリーの増殖は確認していない。

一方、塗りatlasは両方600回描画され、低い描画頻度では1表示当たり約18回になる。塗り処理は約5.2～5.5ms/tickを占めるが、これだけで報告端末の原因とは断定できない。状態digestも異なるため、この2本を挙動一致のA/B試験や高速化の証拠としては扱わない。追加のゲーム本体変更は行っていない。[60Hz](followup-60hz.json)、[300ms](followup-300ms.json)。

再現する場合は、記録した診断用スクリプトを元の相対配置へコピーする。

```sh
cp reports/native-stage-runtime-20261030/catchup-probe.mjs.txt .ci-scratch/measure-native-catchup.mjs
node .ci-scratch/measure-native-catchup.mjs --site ../site-after --stage robo --hz 60 --ticks 600 --out .ci-scratch/native-query-60hz.json
node .ci-scratch/measure-native-catchup.mjs --site ../site-after --stage robo --hz 3.3333333333333335 --ticks 600 --out .ci-scratch/native-query-300ms.json
node --experimental-vm-modules --test scripts/tests/native-sim-observers.test.mjs
```
