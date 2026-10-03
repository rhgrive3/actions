# INKWAVE タッチ操作の配置編集

オプション → タッチ → ボタン配置の編集。射撃、ジャンプ、移動スティック、イカ、サブ、スペシャル、マップ、ジャイロ、ポーズをドラッグして移動できる。選択リストでボタンを選び、50〜170%のサイズと、必要なら横・縦の位置をスライダーで調整する。

「保存」でこの端末の `inkwave.touchLayout` に反映。「キャンセル」は編集前に戻る。選択ボタンのみ／全体のリセットも、保存するまでは下書き。ストレージに保存できなければ編集画面を維持し、エラーを表示する。浮動スティックは触れた位置に出現する従来の動作を保ち、移動した待機位置でも操作を開始できる。固定スティックは設定位置を中心に動作する。

`scripts/build-inkwave.mjs` が `adapter.mjs` をゲームプレイパッチの後に適用する。上流の `inkwave-public/` を書き換えず、設定入口、プレビューの不足していた import、モバイル入力の拡張、CSS をビルドに組み込む。3ファイルのハッシュは `inkwave-build.json` の `build.touchLayout` と `files` の `touch-layout/` 名前空間に保存され、生成内容の revision にも反映される。`check-inkwave-browser.mjs --exact-source` もエディターのソースをコミットと照合する。接続箇所が上流で変わったらビルドは失敗する。

既存の配色、暗いカード、丸い操作ボタン、フォントを使用。編集中はゲーム入力を消去し、タッチ設定の選択・スライダー・保存操作がゲーム操作として処理されない。画面回転時にはジェスチャーを終了し、ボタンを安全領域内に収める。縦画面では配置編集を利用でき、実際の試合の横向き案内は維持する。

確認コマンド（ブラウザがインストールされた環境）:

```sh
node scripts/check-inkwave-touch-layout.mjs
node scripts/build-inkwave.mjs inkwave-public /mnt/workspace/.dev-state/agent-work/scratch/inkwave-touch-layout-20261002/site
node scripts/check-inkwave-touch-layout.mjs --site /mnt/workspace/.dev-state/agent-work/scratch/inkwave-touch-layout-20261002/site
```

テストは実際のメニュー／モバイルモジュールとCSSを使用する。保存・キャンセルは実タッチイベントで確認し、ドラッグ・ピンチは PointerEvent の再現を使用する。Chromium/WebKit の端末エミュレーションであり、実機iOSや公開済みサイトの証明ではない。

本家の操作との比較範囲と未確認項目は [比較記録](../../reports/inkwave-touch-layout-2026-10-02.md) を参照。
