# テストと CI の管理

テスト群の一覧は [`scripts/ci/inkwave-test-suites.json`](../scripts/ci/inkwave-test-suites.json)、実行入口は [`run-inkwave-test-suite.mjs`](../scripts/ci/run-inkwave-test-suite.mjs) にまとめます。`package.json` と workflow に同じファイル一覧を複写しません。個々のテストは検証対象の近くに残します。

## 実行する

```sh
npm run test:list
node scripts/ci/run-inkwave-test-suite.mjs --dry-run memory
npm run test:ci-config
npm test
```

`--dry-run` は実行プログラムと引数を JSON で表示し、テストを起動しません。`npm test` は従来の日常検証に共通 runner の回帰を加えたものです。リポジトリの全テストや CI 全体の成功は意味しません。

| コマンド | 対象と実行場所 |
| --- | --- |
| `test:ci-config` | 一覧・runner・失敗伝播・CI の呼び出しと変更時の起動条件。ローカルと A+ CI |
| `test:direct-source` | 直接ソース所有権、配信元の同一性、可逆画像最適化。ローカルと A+ CI |
| `test:quality` | 日常の品質・モーション回帰と3つの性能検証。ローカルと A+ CI |
| `test:relay` | `server/tests/*.test.mjs` 全体を毎回検出。ローカル・A+・専用リレー CI |
| `test:account` | `account/tests/*.test.mjs` を毎回検出。ローカルとアカウント CI |
| `test:backup` | Python のバックアップ・復元回帰。ローカルと A+ CI |
| `test:queue-recovery` | 復旧・エフェクトの回帰。ローカル |
| `test:memory` | ヒープ上限768 MB、ファイル並列数1のリソース回帰。ローカル |
| `test:verifier` | 統合 CI の検証器・workflow 回帰32ファイル。統合 CI と手動再現 |
| `test:acceptance` | 統合 CI の受け入れガード12ファイル。384/128 MB・並列数1を維持 |

リレーの共通テスト群は VM modules 有効で実行します。専用リレー CI はこれに加えて、本番合成されたクライアントとの互換性・旧形式拒否を別途検証します。

一覧にない領域を変更するときは、[開発ガイド](inkwave-development.md) に従って関連テストを選びます。全 Splatoon3/reliability テストの8分割、network/local-quality の自動検出、実ビルド・ブラウザ・原典データの検証は専用入口を維持しています。

## 追加・変更する

1. テストを所有する領域に追加します。`account` / `relay` の直接の `*.test.mjs` は自動検出されます。明示リストのテスト群は JSON に登録します。
2. 必要な Node オプションは同じコマンドの `args` に置きます。`--test` を使わない独自スクリプト、ヒープ上限、並列数、別プロセスの境界も保持します。
3. `--dry-run <suite>` と `npm run test:ci-config` で確認します。runner は一覧全体を事前確認し、空の検出・欠落・重複を拒否します。途中の失敗・シグナル・起動失敗は後続処理を止めます。
4. 変更したテスト群を実行します。環境変数は呼び出し元から継承されます。ソース検証と生成物検証で同じファイルを使っていても、環境が異なる実行は統合しません。

workflow の契約テストは `expandTestSuiteSteps` で名前付き呼び出しを実コマンドへ展開して検査します。既存の選択条件・引数・ジョブ本文のハッシュ照合を維持し、無効化・追加フラグなどで変形した呼び出しは展開しません。runner 自体の回帰では実際の失敗テストを子プロセスで実行し、成功として扱われないことを確認します。

## CI の役割と残る整理範囲

2026-10-26 の基準コミット `e0072a749df0ec8c2d368e383bdf337baa7b44ad` には Node テスト1,966ファイル、workflow 101本がありました。Splatoon3 が1,052、local-quality が256、scripts/tests が208、network が137、native-stages が135、reliability が88ファイルです。この整理は回帰ケースの一括削除を行いません。

| CI | 役割 |
| --- | --- |
| A+ Quality & Security Gate | 所有権・品質・リレー・バックアップ・診断ビルド・予算・ベンチマーク |
| Validate INKWAVE update | 完全なパッチ分割、ソース・生成物・参照値、7ブラウザ群、必須の集約判定 |
| CircleCI | 有効化済みの場合に完全な8パッチ分割・7ブラウザ群を実行。GitHub の正確な SHA の受領確認を維持 |
| 領域専用 workflow | 変更パスで選択されるアカウント、リレー、モデル、操作・描画などの個別検証 |
| 歴史比較・手動 workflow | 固定基準コミット、外部リポジトリ、個別の証跡を扱う検証 |

同じテストファイル名でも、生成物の有無、環境変数、名前フィルター、VM オプション、ブラウザ、固定基準が異なる場合があります。workflow を廃止する場合は、その独自検証と必要なステータス名の移管を先に確認します。特に、PR 時だけの名前フィルター実行を全ファイルのソース検証の代用にしません。

今回 A+ とローカルを共通化した際、A+ に欠けていた `squid-rapid-idle-regression` を追加しました。リレーも3つの入口から全9ファイルを実行する形に揃え、A+ で漏れていた時計レシートなどを含めました。
