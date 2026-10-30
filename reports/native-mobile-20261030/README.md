# iPad・スマートフォンの全ネイティブステージ負荷対策

対象は利用可能な23ネイティブステージ。既存の利用不可定義（マヒマヒ、リュウグウ）は有効化しない。実装は `d513f22b9d0cce6acc4aca2193c9e21a590782f0`、比較基準は `23cb684` のゲームコード（前段PRのCPU最適化を含む）。その後、mainを `79eeed4313bb79a5531a05b6d6a54ffeb5aee67a`、横画面UI修正を含む最新mainを `c87d921697e07d0ab8eaea460e0ae284ffcb6428` で取り込んだ。今回の変更ファイルとの競合はない。

この後のmain統合と追加の描画選別CPU削減は、[追加軽量化の記録](../native-mobile-extra-20261030/README.md)を参照。以下の測定・46ケースは各記載コミットの証跡として保持する。

## 共通経路を修正

圧縮テクスチャが使える端末では、それまでモバイル向けの詳細マップ制限が外れていた。圧縮はメモリを減らすが、法線・粗さ・発光マップのピクセル処理を減らすものではない。モバイルHighを色・透過マップ中心のbalancedへ変更した。全23ステージ合計の画像要求数は5587→2068、Roboでは151→55。Ultraは圧縮詳細マップを明示的に選択する経路として残す。

モバイルのネイティブ描画は最初の読み込みから倍率1.0、影1024、反射倍率0.1・4フレーム間隔に制限する。従来のiOS倍率1.2／他タッチ端末1.35、影2048、反射0.2・2フレーム間隔より軽い。MSAAなし、AOなし、ブルームなしは既存のモバイル設定であり、今回の新しい削減には数えない。水面反射もネイティブRendererの実際の制限を参照し、通常ステージへ戻れば通常の設定を復元する。

これは画質の意図的な調整を含む。色・透過・地形・衝突を維持し、細かい凹凸、影、水面反射の精細さを抑える。ゲームの固定tick、射撃、塗り所有権、スコアは間引かない。

塗りには次の追加対策を入れた。

- 乾燥描画をネイティブでも有効な湿った領域に限定する。RGBA8の既存減算処理を使い、画質変更でコピーされた既存インクは保守的に全面乾燥する。未知の描画状態は元の全面描画へ戻す。
- 小さなネイティブ面が同じ／新しい塗りですでに保護されている場合、結果を変更できない付随形状の構築を省く。毎回の所有権を読み直し、64セルを超える範囲や未所有セルは従来の処理を使う。

## 結果

iPad相当のChromium／SwiftShader、1024×768 CSS、High、Robo、8人対戦で通常のフレーム処理全体を比較した。600フレーム準備後、20フレームの描画ウォームアップ、6フレーム×3区間。GPU完了を待つ計測であり、物理iPadの表示FPSではない。

| 区間 | 処理速度の比（修正後／修正前） |
| --- | ---: |
| 1 | 2.006倍 |
| 2 | 1.829倍 |
| 3 | 2.254倍 |
| 全18フレームの合計時間 | **2.016倍（完了時間50.4%短縮）** |

全3区間の全アクター状態と塗りグリッドは一致。新規シェーダー0、ブラウザエラー0。描画倍率や影・詳細マップを変更する比較なので、画面全体のピクセル一致を合格条件にしていない。[比較](ipad-comparison.json)、[修正前](ipad-before.json)、[修正後](ipad-after.json)。

乾燥処理だけの配信版WebGL試験は、256px／2048px、疎な塗り・端・全面・クリア・再初期化・画質転送を含む34チェックポイントでRGBA差分0。疎な固定入力では乾燥描画面積を97.4%／98.1%削減した。全面が濡れた場合の削減率ではない。[生データ](drying-webgl.json)。

CPU塗り判定は実Roboから採取した3個のボム、597回の呼び出しを再生。毎回の塗り・所有権・得点が一致し、中央値199.96→185.43ms（7.26%短縮）。128／256セルへの拡張は採らず64セルに制限した。[詳細](paint-ownership.json)。

全23ステージの形状・メタデータ348ファイルをSHA-256検証し、13248本の接地レイで逐次／バッチの交点・法線・UV・三角形・カウンターが一致した。[全ステージ一覧](all-stages.json)、[画像要求数と設定](mobile-budget.json)。

全23ステージをiPad設定とAndroidスマートフォン設定で通常読み込みし、各2フレームを描画する46ケースがすべて成功した。全ケースで8人、新しい描画上限、balancedテクスチャを確認し、GL・シェーダー・ページエラーは0。両端末で通常ステージへ戻した際のネイティブ状態解放・品質復元も成功した。これは候補 `d513f22` の読み込み・イントロ描画試験であり、全ステージの試合通し・実機FPS測定ではない。[46ケースの記録](all-stage-mobile-browser.json)。

`79eeed43` 統合後の重点ローカル試験50件と、最終 `c87d9216` 統合後の計測回帰を含む52件が成功し、失敗0、skip0。入力互換性、通常ビルド、起動サイズ、移行監査に合格。各段階のログは `integration-*.log.gz` と `final-*.log.gz` に保存した。

実WebKit26.5（Linux/WPE）のiPad設定でもRoboの通常読み込み・描画・旧ワールド破棄・通常品質復元が成功し、GL／ページエラーは0だった。[結果](webkit-robo.json)、[実行環境](webkit-environment.json)。これはSafariと同系統のエンジン検査で、iPadOS実機の検査ではない。

mainとの統合版でもiPad設定でRobo／Shipshapeの通常読み込み・実描画・終了処理が成功した。両方で新しい画質上限と乾燥trackerの接続を確認し、GLエラーは0。イントロ中のため乾燥passは0であり、この検査を乾燥ピクセル一致の証拠とは扱わない。[最初の統合結果](integration-ipad-robo-shipshape.json)と、横画面UI修正を含む最終 `c87d9216` の[統合結果](final-integration-ipad-robo-shipshape.json)をそれぞれ保存した。

[ソース照合](source-binding.json)では基準／候補の1561入力、最初の統合版の1570入力、最終統合版の1575入力をそれぞれのコミットと照合した。最終版は配信物2299個のハッシュも検証済み。46ケースの候補版と、後続mainを取り込んだ統合版の証跡は区別して保存する。

## 再現

Node24.19.0、esbuild0.28.2、Playwright1.62.1。変換済みデータを `git lfs pull --include='native-prebuilt/**' --exclude=''` で用意する。元のOBJ／MTL／PNGは追加していない。

```sh
node scripts/build-inkwave.mjs inkwave-public /absolute/path/to/site
node --experimental-vm-modules scripts/check-native-mobile-stage-matrix.mjs
node scripts/check-native-paint-drying-webgl.mjs --site /absolute/path/to/site
node scripts/check-native-mobile-browser.mjs --site /absolute/path/to/site --out .browser-evidence/native-mobile --device both
node scripts/benchmark-inkwave-native-render.mjs --site /absolute/path/to/site --out .browser-evidence/native-mobile-perf --device ipad --quality high --warmup 20 --frames 6 --runs 3 --setup-frames 600
```

最終ローカル試験:

```sh
node --experimental-vm-modules --test \
  patches/local-quality/tests/native-paint-dry-regions.test.mjs \
  patches/local-quality/tests/resource-budget.test.mjs \
  patches/local-quality/tests/wave345-paint-runtime-parity.test.mjs \
  patches/native-stages/tests/ancillary-cell-replay.test.mjs \
  patches/native-stages/tests/native-ancillary-protected-rect.test.mjs \
  patches/native-stages/tests/native-gpu-budget.test.mjs \
  patches/native-stages/tests/native-mobile-budget.test.mjs \
  patches/native-stages/tests/native-texture-budget.test.mjs \
  patches/native-stages/tests/native-texture-profile-reuse.test.mjs \
  scripts/tests/native-sim-observers.test.mjs
```

移動・射撃・塗り・当たり判定の参照条件は既存のSplatoon3 Ver.11.3.0記録を引き継ぐ。Nintendoの描画方式や内部数値の一致は主張しない。物理iPad／スマートフォンのGPU、OS、熱制御ごとのFPS保証でもない。
