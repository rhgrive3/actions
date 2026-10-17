# INKWAVE パッチ構成

`inkwave-public/` の取得済み入力を保ち、ビルド時のアダプターで変換して配信物に反映します。ビルドの入口は [`scripts/build-inkwave.mjs`](../scripts/build-inkwave.mjs)、変換の合成順は [`scripts/inkwave-source-composition.mjs`](../scripts/inkwave-source-composition.mjs) が管理します。実際の適用順はコードを参照してください。

| ディレクトリ | 主な担当・入口 |
| --- | --- |
| [`splatoon3/`](splatoon3/README.md) | ゲーム挙動、武器、モーション、参照値。移動物理の実装もこの領域にある |
| [`touch-layout/`](touch-layout/README.md) | タッチ操作の配置・編集 |
| [`reliability/`](reliability/README.md) | 入力保持、キャンセル、非同期処理と対戦進行の所有者管理 |
| [`local-quality/`](local-quality/) | 描画・表示品質のアダプターと回帰テスト |
| [`network-replication/`](network-replication/) | 対戦状態の複製とネットワークの接続処理 |
| [`loading-cache/`](loading-cache/) | 起動・配信アセット・Service Worker の管理。[検証記録](../reports/loading-cache/README.md) |
| [`practice-range/`](practice-range/README.md) | 練習場の地形・観測用 UI・セッション |
| [`native-stages/`](native-stages/README.md) | 原典ステージの読込・描画・衝突・配置と外部アセットの扱い |
| [`movement-physics/`](movement-physics/README.md) | 移動物理のスモークテストと作業範囲。実装先は `splatoon3/` 内 |

各領域の `tests/` にロジック回帰テストを置き、領域をまたぐビルド・CI の確認は `scripts/tests/` も参照します。テストの実行方法は [開発ガイド](../docs/inkwave-development.md) にまとめています。

## 変更時の注意

- 既存のアダプターと runtime の担当箇所を確認してから追加する。同じ変更を入力スナップショットとパッチの両方へ入れない。
- 接続アンカーや入力ハッシュの不一致は、上流との互換性を再確認する契機。ビルドを通すためだけに検出を外したり lock を更新したりしない。
- 配信する runtime と、変換・検証専用モジュールを区別する。新規ファイルの配信可否はビルドのコピー処理と [build-only 定義](../scripts/lib/inkwave-build-only-modules.mjs) を確認する。
- 領域ごとの README・レポートにある未確認事項を引き継ぐ。テスト成功だけで本家との一致を認定しない。
