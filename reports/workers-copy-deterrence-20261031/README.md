# Workers 配信の軽量な流用抑止

基準: `rhgrive3/actions` main `b60a2216a4a553be9ffa6b80f2c30c325aebfd55`（2026-10-31）。ゲームロジック・操作・描画は変更せず、Workers 本番ビルドの配信設定を変更する。本家との操作比較を必要とする挙動変更はない。

## 変更と効果

- `account/dev/vite-plugins.mjs` の本番用 `_headers` に CORP `same-origin`、CSP `frame-ancestors 'self'`、X-Frame-Options `SAMEORIGIN` を追加。外部サイトで公式アセットを直接使うことと、外部からの iframe 埋め込みをブラウザで拒否する。既存 HTML の CSP に追加適用される。
- `.assetsignore` でルート・revision ツリー内の `.map`、`.git`、`.env` / `.env.*` を配信対象から除外する。`inkwave-build.json` は公開したまま。アカウント UI の `sourcemap: false` も明示する。
- HTTP ヘッダー・デプロイ除外のみのため、ゲームへの監視 JS・追加認証・難読化処理は追加しない。キャッシュ期間と Worker の `/api/*` 優先ルーティングは維持する。Miniflare の明示依存は開発・検証専用で、既存 Wrangler と同じインストール済みバージョンを使う。

制限: ブラウザへ送る実行 JS・アセットの取得、一式の再ホスト、GitHub の公開ソース取得には効かない。CORP は `no-cors` のクロスオリジン利用を制限し、通常のモジュール読み込み・fetch は CORS の制限を受ける。HTTP クライアントやプロキシによる取得を止める仕組みではない。正規でも別オリジンで公式素材を直接使うクライアントには影響する。ホスト名固定は本番 URL が未指定のため追加していない。

## 検証

| コマンド・条件 | 結果 |
| --- | --- |
| `npm run test:account` | 109 成功 / 0 失敗 / 0 skip |
| `cd account && npm run test:assets` | 1 統合試験成功。workerd で 6 URL の配信ヘッダー、immutable/no-cache、HEAD、8 開発用ファイルの 404、API 応答への非適用を確認 |
| `npm run build:account` | Vite 8.3.3 の account-only ビルド成功。ソースマップ出力なし |
| `node --test scripts/tests/inkwave-account-ci-scope.test.mjs` | 3 成功。既存の重いビルド実行条件を保持 |
| `CHROMIUM_PATH=/usr/bin/chromium node account/tests/workers-assets.browser.mjs` | Chromium 154.0.8037.57 で成功。画像と classic script の外部流用は `ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`、iframe は CSP で拒否。同一オリジンの読み込みと Service Worker のオフライン再読み込みは成功 |
| `cd account && npx wrangler deploy --dry-run --assets ../.ci-scratch/copy-policy-assets --outdir ../.ci-scratch/wrangler-dry-run` | Wrangler 4.148.0 成功。実 Worker を bundle し、最小配信 fixture で設定検証。デプロイなし |
| `git diff --check` | 成功 |

ブラウザの結果は [browser.json](browser.json)。ブラウザ試験・統合試験は最小配信 fixture を使い、ゲーム全体の起動・全素材・実機性能を検証するものではない。今回ローカルではゲーム全体の `build:prod` は実行していない。既存の本番ビルド CI に配信統合試験を追加したが、ホスト CI の成功はこの記録の主張に含めない。

初回のアカウント試験は sparse checkout に `patches/loading-cache/vendor/acorn.mjs` が含まれず 2 ファイルが失敗した。必要ディレクトリを取得後の再実行で 109 件成功。CI scope は追加ステップ数の既存契約により最初 1 件失敗し、既存の依存インストール済みステップ内へ統合試験を配置する修正後 3 件成功。追加確認した `inkwave-staged-ci-policy.test.mjs` はこの環境に Ruby がなく 1 件未完了（他の 11 件は成功）。そのテスト・判定条件は変更していない。

本番適用は通常の `npm run build:prod` と Workers デプロイで行う。今回 main へのマージ・本番デプロイは行っていない。
