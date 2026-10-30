# INKWAVE ネイティブ描画の最適化（2026-10-30）

ロボROM-enの8人対戦で、本番フレーム全体の処理速度が **45.409%向上**した。基準版と同じ解像度・medium設定・MSAA・影・ブルーム・AI人数を使い、全3区間で30%以上の改善を確認した。フレーム完了時間では31.229%の短縮に相当する。

測定環境には実GPUがない。以下はChromiumのSwiftShaderでGPU処理完了まで待ったスループットであり、実機GPUや画面表示FPSの測定値ではない。0.2前後という絶対値もソフトウェア描画に由来する。

| 区間 | 基準版 FPS | 最適化版 FPS | 改善 |
| --- | ---: | ---: | ---: |
| 630–639 | 0.196515 | 0.289598 | +47.367% |
| 640–649 | 0.208216 | 0.281605 | +35.247% |
| 650–659 | 0.189695 | 0.292085 | +53.976% |
| 全30フレーム／合計完了時間 | 0.197850 | 0.287693 | **+45.409%** |

基準コミットは `0cc5ce3712f93c275095d36c1f35ffdbd8565e2e`、公開コードは `2917d9190e6324145d472636b875f7b525a58a15`。公開tree `f1e95f02dbfffe91120fc4b65ba8bd0e90885dcf` は検証したローカル実装と一致する。生成物は全1,550入力・2,267ファイルを照合済み。基準／候補の生成物contentHashは [数値記録](inkwave-native-render-performance-20261030/results.json) に記載した。

CPU/GPUの主な削減箇所は次の通り。

- 原典の粗い材質では、低周波の環境光と広い反射ローブを頂点で計算して補間する。表裏の法線を別々に扱う。法線マップを使う材質は従来方式へ戻し、粗さマップや金属材質・ガラスの反射、インクの光沢は画素ごとの計算を維持する。
- ネイティブインクの定数をコンパイラへ明示し、完全にインクで覆われた床では寄与しない下地のテクスチャ計算を省く。縁・壁・段差の残す凹凸は維持し、座標の微分は条件分岐の前に求める。
- 未塗装画素は軽いステンシル描画で除外する。ステンシルのない反射先では通常の透明描画へ戻す。インク自身の深度書込みは増やさず、微分の前でdiscardしない。
- 大きな不透明原典オブジェクトは、保守的なタイル境界で画面外の三角形を除く。三角形の頂点・UV・順序は保ち、反射／影カメラの切替と未転送index更新を扱う。衝突・塗り・ナビ用のデータは変更しない。
- 後処理専用の色ターゲットから不要なMSAA・深度・ステンシルを外す。シーン側のRGBA16F・MSAA 2は維持し、reset／品質変更でもターゲットの役割を保つ。

解像度、描画スケール、元画像とミップチェーン、異方性フィルタの上限4、影サイズ2048、ブルーム、2048の塗りatlasは維持した。効果が小さかった深度先行描画、影の計算変更、異方性フィルタ上限2の試行は最終コードに含めていない。

画像は前・左・後・右の4方向を固定した状態で比較した。8bit RGBの平均差1.25以下・99パーセンタイル差3以下を閾値とし、ロボROM-enではalphaも完全一致した。この閾値は既存の [composer WebGL比較](../scripts/check-inkwave-composer-webgl.mjs) と同じ値を使っている。

| ステージ | 4画面で最大のRGB平均差 | RGB差の最大p99 | 最大単一チャンネル差 |
| --- | ---: | ---: | ---: |
| ロボROM-en | 0.017464 / 255 | 1 / 255 | 8 / 255 |
| ザトウマーケット（mako、追加RGB比較） | 0.037708 / 255 | 1 / 255 | 34 / 255 |

ロボROM-enでは各測定フレームの8人分の位置・速度・HP・インク量・生存状態のdigest、および塗りgrid・counts・coverageと最終状態が一致した。各区間の新規shader programは双方0、GLエラー0、動的スケール1。歩行・射撃・塗り等のロジック変更はない。既存の [スプラトゥーン3との挙動差分](inkwave-splatoon3-behavior-2026-10-02.md) を今回の描画検証で解消済みとは扱わない。

検証条件は Node 24.19.0、Chromium 154.0.8037.57、esbuild 0.28.2、Playwright 1.62.1、AMD EPYC 9V74／4 CPU quota、960×540。乱数はフレーム単位で固定し、通常の8人・normal bot対戦を600フレーム準備した後、30フレームの本番描画でwarmup、10フレーム×3区間を測る。各フレームは本番 `_frame(1/60)` を実行する。自動RAFを止めて二重更新を防ぎ、時間区間の前後で同期 `readPixels` によりGPU完了を待つ。`gl.finish()` やCPU単独の時間は合否に使わない。

再現には、基準版と公開コードを別checkoutで通常の最適化ビルドにする。両方で `native-prebuilt/robo/` と `native-prebuilt/mako/`、次の4つのLFS packのみを同じ状態で取得した。他ステージを取得済みの場合は生成物hashが変わり得る。

```text
native-prebuilt/packs/0ea1220dded1953ebc6bf130e3870e91.bin
native-prebuilt/packs/a539e5f0d9b2d65a34d002f0aa41f537.bin
native-prebuilt/packs/a520c306eaec5401e18c871c145ba5b9.bin
native-prebuilt/packs/e2244a93fc62bdc58749eae6a34f54dc.bin
```

ビルドは [開発手順](../docs/inkwave-development.md) と同じ `ESBUILD_MODULE=... node scripts/build-inkwave.mjs inkwave-public <site>` を各checkoutで実行する。esbuild・Playwrightを解決できる公開コードのcheckoutから、次を順に実行する。Chromiumのパスは必要に応じて `CHROMIUM_PATH` で指定できる。

```sh
node scripts/benchmark-inkwave-native-render.mjs --site ../site-before --out .browser-evidence/native-perf/before --setup-frames 600 --warmup 30 --frames 10 --runs 3
node scripts/benchmark-inkwave-native-render.mjs --site ../site-after --out .browser-evidence/native-perf/after --setup-frames 600 --warmup 30 --frames 10 --runs 3
python3 scripts/compare-inkwave-native-render.py .browser-evidence/native-perf/before .browser-evidence/native-perf/after --out .browser-evidence/native-perf/comparison.json
```

テストは関連ソースの76件中71成功・既存アセット依存5件skip、更新後の描画テストはソース／配信engineそれぞれ24件中19成功・5件skip。配信版の検証では、minifyされた既存bindingをVM内でexportするだけで、関数本体をソース版に差し替えていない。ShaderLibの文字列は単体テストの入力であり、実際のshaderリンクと全描画は上記ブラウザ比較で検証した。

```sh
node --experimental-vm-modules --test patches/native-stages/tests/ink-chunks.test.mjs patches/native-stages/tests/ink-empty-lifecycle.test.mjs patches/native-stages/tests/ink-offscreen-chart.test.mjs
INKWAVE_BUILT_SITE=/absolute/path/to/site-after node --experimental-vm-modules --test patches/native-stages/tests/ink-chunks.test.mjs patches/native-stages/tests/ink-empty-lifecycle.test.mjs patches/native-stages/tests/ink-offscreen-chart.test.mjs
```

Makoの最初の時間計測は途中のshader program生成を検出したため不採用。warmupを60へ増やした再計測は実行環境の切断後に完了を検証できず、FPS結果には含めていない。全ステージ・全品質や実機GPUで45.4%を保証する記録ではない。広いCI全体の成功も主張しない。画像・モデル・ブラウザプロファイルはGitへ含めず、数値と再現手順だけを保存する。
