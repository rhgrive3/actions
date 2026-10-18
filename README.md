# Actions / INKWAVE

`rhgrive3/actions` は、INKWAVE の公開サイトをビルド・検証・配信するコードと、他リポジトリの調査・修正・計測を実行する GitHub Actions worker を管理するリポジトリです。

## 目的から探す

| やりたいこと | 入口 |
| --- | --- |
| INKWAVE をローカルでビルド・確認する | [開発ガイド](docs/inkwave-development.md) |
| 修正先とパッチの役割を調べる | [パッチ構成](patches/README.md) |
| 並行作業で変更を持ち込む | [コントリビューション手順](CONTRIBUTING.md) |
| テスト結果・比較資料を探す | [ドキュメント案内](docs/README.md) |
| 他リポジトリでコマンド・テストを実行する | [PR Worker の運用](docs/pr-worker.md) |
| Hex の性能・実ゲーム・品質を並行計測する | [Hex worker lanes](lanes/README.md) |

## リポジトリ構成

| パス | 内容 |
| --- | --- |
| [`inkwave-public/`](inkwave-public/) | 取得済み公開サイトを起点とするゲーム本体。直接統合済みの機能はここが編集対象。原作者の完全なソースリポジトリを保証するものではない |
| [`patches/`](patches/) | ビルド時の変換、実行時の追加機能、参照値、回帰テスト |
| [`scripts/`](scripts/) | ビルド、検証、計測、画像生成。共通処理は `scripts/lib/`、回帰テストは `scripts/tests/` |
| [`server/`](server/) | Cloudflare Workers / Durable Objects によるオンライン対戦リレー |
| [`tools/`](tools/) | キャラクター制作・アセット QA・音声関連の補助ツール |
| [`docs/`](docs/)、[`reports/`](reports/) | 開発・運用手順と、変更ごとの調査結果・証跡 |
| [`remaining/`](remaining/) | 各作業が残した未完了範囲の記録。現在の完了状況は関連 PR・後続レポートと照合する |
| [`.github/workflows/`](.github/workflows/) | INKWAVE の検証・Pages 配信、汎用 worker、Hex 計測 |
| [`lanes/`](lanes/)、[`bootstrap/`](bootstrap/) | Hex 計測 lane の契約と専用 worker リポジトリの準備 |

## INKWAVE の最初の確認

Node.js 22 以上を使用し、リポジトリのルートで実行します。ルートに `package.json` はなく、ビルド用ツールは CI と同じバージョンで個別に導入します。

```sh
npm install --no-save --no-package-lock --no-audit --no-fund esbuild@0.28.2
node scripts/check-inkwave-patches.mjs --quick
node scripts/build-inkwave.mjs inkwave-public _site
node scripts/check-inkwave-startup-budget.mjs _site
```

`_site/` がパッチ適用済みの配信物です。テストの選び方、ローカル表示、ブラウザ検証は [開発ガイド](docs/inkwave-development.md) を参照してください。公開配信は [`pages-inkwave.yml`](.github/workflows/pages-inkwave.yml) が対象パスの `main` 更新または手動実行で行います。

パッチからゲーム本体への移行は [直接ソース移行ガイド](docs/inkwave-direct-source-migration.md) を参照してください。残るビルド時書き換えの確認は `node scripts/inkwave-source-migration-audit.mjs --all` で実行できます。元サイトの再取得は候補アーカイブの作成までとし、既存ゲームコードを自動上書きしません。

挙動を変更するときは [AGENTS.md](AGENTS.md) の比較・記録ルールに従います。ロジックテスト、ブラウザの確認、本家の実機比較は、それぞれ確認できる範囲が異なります。
