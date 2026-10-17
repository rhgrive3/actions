# INKWAVE 開発ガイド

コマンドは特記しない限りリポジトリのルートで実行します。

## 入力・変換・出力

1. `inkwave-public/` は取得済み公開サイトの入力です。取得履歴は `FETCH_MANIFEST.json` と `README_FETCH.txt` にあります。
2. `patches/` のアダプターを `scripts/inkwave-source-composition.mjs` で合成し、ビルド中に適用します。
3. `scripts/build-inkwave.mjs` が runtime とアセットを配置・最適化し、`_site/` を生成します。
4. `inkwave-build.json` に入力と配信物のハッシュ、ビルド情報を記録します。

修正先は [パッチ構成](../patches/README.md) を確認してください。`_site/` の手修正は次のビルドで失われます。ビルドは `<出力先>.building` で組み立て、成功後に出力先を置き換えるため、出力先には専用の生成物ディレクトリを指定します。同じ出力先への同時ビルドは避けてください。

## 必要なツール

- Node.js 22 以上、npm。CI は Node.js 22 を使用します。
- 本番相当のビルドには `esbuild@0.28.2`。
- ローカルの静的配信と Python 製の検証には Python 3。
- ブラウザ検証には Playwright と対象ブラウザ。検証スクリプトによって `ws` などの追加依存があります。

ルートに `package.json` はありません。ビルド用ツールは次のコマンドで導入します。`server/package.json` はリレー用の別パッケージです。

```sh
npm install --no-save --no-package-lock --no-audit --no-fund esbuild@0.28.2
```

## ビルドとローカル表示

```sh
node scripts/check-inkwave-patches.mjs --quick
node scripts/build-inkwave.mjs inkwave-public _site
node scripts/check-inkwave-startup-budget.mjs _site
python3 -m http.server 8000 --bind 127.0.0.1 --directory _site
```

ブラウザで `http://127.0.0.1:8000/` を開きます。サーバーは Ctrl+C で停止できます。`file://` からの直接表示ではなく HTTP を使います。

`--quick` は入力の互換性と参照数値などの整合性を確認し、回帰テスト全体は実行しません。起動予算チェックも、ブラウザ操作や実機での性能測定の代わりにはなりません。

別の場所に導入済みの esbuild を使う場合は `ESBUILD_MODULE=/絶対パス/esbuild/lib/main.js` を指定できます。`INKWAVE_BUILD_UNMINIFIED=1` は最適化を省く明示的な診断用ビルドです。配信サイズ・本番性能の比較には通常ビルドを使用してください。

原典ステージは外部データの取得・キャッシュ条件があります。アセットを用意したローカルビルドと通常の公開ビルドの違いは [native-stages の手順](../patches/native-stages/README.md) を参照してください。

## テストを選ぶ

最初に変更箇所のテストを探します。

```sh
rg --files patches scripts/tests server/tests tests -g '*.test.mjs'
```

代表的な実行例です。

```sh
# 配信元の同一性に関する回帰
node --test scripts/tests/inkwave-pages-source-identity.test.mjs

# 移動物理の軽量スモークテスト
node --test patches/movement-physics/tests/movement-smoke.test.mjs

# 領域ごとのテスト（例: 練習場）
node --experimental-vm-modules --test --test-concurrency=2 patches/practice-range/tests/*.test.mjs

# splatoon3 と reliability のテスト群。長時間かかるため必要に応じて実行
node --experimental-vm-modules scripts/check-inkwave-patches.mjs
```

最後のコマンドは全パッチ領域のテストを網羅しません。ほかの領域の `tests/`、`scripts/tests/`、ブラウザ検証は別途選びます。テスト群のログは既定で `.ci-scratch/inkwave-patches/` に保存され、`INKWAVE_TEST_LOG_DIR` で変更できます。`INKWAVE_TEST_CONCURRENCY` は並列数、`INKWAVE_TEST_SHARD_COUNT` と `INKWAVE_TEST_SHARD_INDEX` は分割数と 0 始まりの分割番号です。分割実行では全 shard の成功を確認してください。

配信・統合の検証項目は [`validate-inkwave-update.yml`](../.github/workflows/validate-inkwave-update.yml)、Pages 公開前の項目は [`pages-inkwave.yml`](../.github/workflows/pages-inkwave.yml) が定義します。手動検証の `source_sha` は完全なコミット SHA を指定します。

## ブラウザで生成物を検証する

一般的なブラウザ確認用の依存をまとめて導入する例です。ビルド用 esbuild も同じコマンドに含めます。

```sh
npm install --no-save --no-package-lock --no-audit --no-fund esbuild@0.28.2 playwright@1.62.1 ws@8
npx playwright install chromium
node scripts/check-inkwave-browser.mjs \
  --site _site \
  --evidence-dir .browser-evidence/local-check \
  --profile-dir .browser-profile-local-check \
  --exact-source
```

このスクリプトはローカル HTTP サーバーを起動し、生成物のハッシュとブラウザ動作を確認します。Linux でブラウザの OS 依存が不足する場合は、Playwright の依存関係も導入してください。システムの Chromium を使う場合は `CHROMIUM_PATH`、別場所の Playwright を使う場合は `PLAYWRIGHT_MODULE` を指定できます。

`--exact-source` はビルド入力を現在の Git コミットと照合します。未コミットのコードを試す間は外せますが、コミットが確定していない結果として記録し、コミット後に再ビルド・再検証してください。

証跡とプロファイルは作業ごとに別の永続ディレクトリを用意します。`/tmp`、`/var/tmp`、`/dev/shm` は拒否されます。再実行時も保存先を分けると比較できます。タッチ・練習場・原典ステージなどは各領域の専用チェッカーも必要です。Chromium の成功を WebKit、実 iPad、Switch での確認に読み替えないでください。

## リレーと公開配信

リレー実装は [`server/src/`](../server/src/)、設定は [`server/wrangler.toml`](../server/wrangler.toml) です。ローカル開発は次の手順です。

```sh
cd server
npm install
npm run dev
```

`npm run deploy` は Cloudflare への公開操作です。サイトのビルドや Pages 配信とは別です。オンラインの検証ではクライアントとリレーの条件を両方記録します。

公開サイトは Pages workflow が生成した `_site/` を配信します。元サイトの再取得は [`fetch-inkwave.yml`](../.github/workflows/fetch-inkwave.yml) が別途行います。取得先や内容が変わる可能性があるため、通常の開発準備として再取得せず、入力 lock とアダプターへの影響を確認して実行します。

## よくある確認箇所

| 症状 | 確認すること |
| --- | --- |
| esbuild が見つからない | ルートで導入したか、`ESBUILD_MODULE` の指定が正しいか |
| upstream / anchor / lock の不一致 | 入力スナップショットとアダプターの対応。検出を外す前に入力差分を調べる |
| `--exact-source` が失敗する | 入力をコミットしたか、その入力から再ビルドしたか |
| 古い表示・設定が混ざる | 正しい生成先を配信しているか。新しいブラウザプロファイルでも確認する |
| 原典ステージを取得できない | 固定参照元への接続、初回取得、キャッシュ条件。詳細は native-stages の手順 |
