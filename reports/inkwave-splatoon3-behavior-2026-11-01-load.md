# 2026-11-01 追記: ネイティブステージの負荷（続き）

本家の挙動との差分ではなく、Web上の描画・CPU負荷の改善記録。

- **画面サイズ読み取りのキャッシュ**（`patches/local-quality/viewport-cache.mjs`）
  - HUD、照準と自分の体の重なり判定（self-occlusion）などは、毎フレーム `innerWidth` / `innerHeight` を読む。スタイルを書き換えた直後に読むため、そのたびにブラウザがレイアウトを計算し直していた。
  - 画面サイズが変わったとき（resize / orientationchange / visualViewport の resize）だけ値を更新するようにした。
  - 測定条件: humpback / ナワバリ / iPad プロファイル / 描画なし / 300 フレーム。
  - 結果: 1 フレームあたり、HUD ミニマップで約 1.3 ms、self-occlusion で約 1.7 ms のレイアウト再計算がなくなった。ページエラーは 0。
- **変換済みステージデータ（`native-prebuilt/`）の作り直し**: 未実施。理由は次の 2 つ。
  - 作り直しに必要な basisu v1.16.4（npm `basis_universal@1.16.4-1` に同梱されているバイナリ）の実行が、このセッションの権限で止められた。
  - 本番の Pages ワークフロー（`.github/workflows/pages-inkwave.yml`）は、sparse-checkout で `native-prebuilt/` を取得していない。作り直しても、それだけでは本番に反映されない。データは全体で約 1.49 GB（配列 913 MB、色パック 323 MB、詳細パック 250 MB）あり、Pages の公開サイズ上限（1 GB）と Git LFS の転送量も問題になる。
