# テストと CI の管理

テスト群の一覧は [`scripts/ci/inkwave-test-suites.json`](../scripts/ci/inkwave-test-suites.json)、名前付きテスト群の実行入口は [`run-inkwave-test-suite.mjs`](../scripts/ci/run-inkwave-test-suite.mjs) です。`package.json` と workflow に同じファイル一覧を複写しません。テスト本体は検証対象の近くに置きます。Node.js 22.12 以上を使用します。

## 実行する

```sh
npm run test:list
node scripts/ci/run-inkwave-test-suite.mjs --dry-run memory
npm run test:ci-config
npm test
```

`--dry-run` は実際の実行プログラムと引数を JSON で表示します。通常のログは大量のファイル列挙を件数にまとめます。`npm test` は日常検証であり、全領域・実ブラウザ・実機比較を網羅するものではありません。

| コマンド | 対象と実行場所 |
| --- | --- |
| `test:ci-config` | runner の入力・失敗伝播、CI の呼び出しと変更時の起動条件。ローカルと A+ CI |
| `test:direct-source` | ソース所有権、配信元の同一性、可逆画像最適化。ローカルと A+ CI |
| `test:quality` | 日常の品質・モーション回帰と3つの性能検証。ローカルと A+ CI |
| `test:relay` | `server/tests/*.test.mjs` 全体を自動検出。ローカル・A+・専用リレー CI |
| `test:account` | `account/tests/*.test.mjs` 全体を自動検出。ローカルとアカウント CI |
| `test:backup` | Python のバックアップ・復元回帰。ローカルと A+ CI |
| `test:queue-recovery` | 復旧・エフェクトの回帰。ローカル |
| `test:memory` | ヒープ上限768 MB、ファイル並列数1のリソース回帰。ローカル |
| `test:verifier` | 検証器・workflow 回帰。統合 CI と手動再現 |
| `test:acceptance` | 統合 CI の受け入れガード。384/128 MB・並列数1を維持 |
| `test:source-network` | network 全件を並列数2で単独再現。ローカルでの領域確認用 |
| `test:source-quality` | local-quality 全件と idle の CI 契約を並列数2で単独再現。ブラウザの準備条件は以下を参照 |

専用リレー CI は共通リレー群に加え、本番合成されたクライアントとの互換性・旧形式拒否を検証します。一覧にない領域は [開発ガイド](inkwave-development.md) に従って関連テストを選びます。

## 統合 CI の所有関係

| 検証 | 所有する実行場所 |
| --- | --- |
| splatoon3 / reliability / network / local-quality の CPU ソース回帰、idle の CI 契約 | `patch_tests` の8分割。各マシンでファイル並列数2 |
| `settings-hud-queue` と `paint-mipmaps` のブラウザを使うソース回帰 | `validate_core` の `source-browser`。既存の Chromium を共用し、不在を成功扱いしない |
| パッチ適用済み生成物、固定原典値、検証器、ビルドの同一性 | `validate_core` の各ステップ |
| ゲーム画面・操作・ネットワークの実ブラウザ検証 | 7つの `browser` 群と各領域の専用 workflow |

CPU の正規一覧は [`discoverSourceTestFiles`](../scripts/lib/inkwave-test-shards.mjs) が検出します。同じ一覧を GitHub Actions と CircleCI が使用し、全ファイルがいずれか1つの分割に入ります。ブラウザを使う2ファイルは CPU の一覧から除き、`source-browser` に登録します。8分割の集約判定、CircleCI の正確な SHA の受領確認、各ブラウザ群の結果は維持しています。

```sh
# 全 CPU ソース回帰。1マシンでは長時間かかります。
node --experimental-vm-modules scripts/check-inkwave-patches.mjs

# CI と同じ分割の1つを再現。番号は0..7。
INKWAVE_TEST_SHARD_COUNT=8 INKWAVE_TEST_SHARD_INDEX=0 INKWAVE_TEST_CONCURRENCY=2 \
  node --experimental-vm-modules scripts/check-inkwave-patches.mjs

# 実ブラウザを使うソース回帰。Playwright と Chromium を先に用意します。
CI=true INKWAVE_REQUIRE_BROWSER_TESTS=1 \
  node scripts/ci/run-inkwave-test-suite.mjs source-browser
```

ログは `.ci-scratch/inkwave-patches/`（`INKWAVE_TEST_LOG_DIR` で変更可能）に保存します。分割実行では全分割の成功が必要です。ソースと生成物は異なる検証なので、同じファイル名でもまとめません。`INKWAVE_BUILT_SITE` などを指定した生成物検証・固定原典データ・名前フィルター付きの追加検証は、それぞれの条件を記録します。

## 追加・変更する

1. テストを所有する領域に追加します。4領域の CPU 回帰、account、relay は直接検出します。検証器などの明示リストは JSON に登録します。
2. 実ブラウザを使う新しいソース回帰は `BROWSER_SOURCE_TESTS` と `source-browser` の両方に登録します。CPU 分割へ Chromium のインストールを追加しません。
3. Node オプションは `args` に置きます。独自スクリプト、ヒープ上限、並列数、別プロセスの境界も保持します。対象のない `node --test`、欠落したスクリプト、空の Python discovery は拒否します。
4. `--dry-run <suite>` と `npm run test:ci-config`、変更したテスト群を実行します。環境変数は呼び出し元から継承します。失敗・シグナル・起動失敗で後続処理を止めます。

workflow の契約は、必要な実行コマンド、ソース・生成物の区別、必須集約、ブラウザ準備、証跡の保存条件を直接検査します。無関係なジョブ本文を古い内容へ逆変換してハッシュを照合する方式は廃止しました。ハッシュ・原典・画像の一致そのものが検証目的のテストは維持します。

## 単発診断の扱い

終了した固定コミット・固定 run ID 向けの単発比較は [workflow archive](../.github/workflow-archive/README.md) に保存します。現役一覧から外した23本は YAML 本文を変更していません。継続的な PR/main 回帰、手動 worker、再利用可能な benchmark lane は現役です。archive 内の YAML・説明だけの変更では A+ の重いゲーム検証を省きます。現役コードを含む変更や履歴の取得失敗では通常の検証を実行します。

基準 `e781229ba` からの整理では、現役 workflow は102本から79本へ減りました。個別に並んでいた16ステップ・57ファイル指定を正規の所有先へ統合し、CPU 回帰1,537ファイルとブラウザを使う2ファイルを分けました。件数はこの基準での値であり、新しいテストの追加を禁止する上限ではありません。

固定外部ブランチ `fix/cxx-output-projection-member-types-20260924` を検証する CXX/OpenTTD 診断も、PR のソースを検証するものではないため `workflow_dispatch` 専用にしました。判定条件を維持し、診断本体は引き続き手動で実行できます。[実行40322753087](https://github.com/rhgrive3/actions/actions/runs/40322753087) で見つかったアドレスなし ELF シンボルによる索引作成時の例外は、アドレス・名前・種別の対応を保った入力の選別で修正し、実際の workflow コードを使う回帰を日常の CI 構成テストへ登録しています。

## 変更範囲に応じた実行

A+ の `relevant` はゲーム検証全体、`build_required` は最後の診断ビルド・起動予算・A+ parity benchmark の実行を決めます。既知のテスト配置にある直下の `*.test.mjs` と説明文書だけの変更では、ゲームテストを実行し、最後の2ステップを省きます。対象配置は [`requiresGameBuild`](../scripts/inkwave-quality-scope.mjs) にまとめています。fixture、テスト補助コード、benchmark、設定、製品コードとの混在、未知のパス、比較履歴の取得失敗では省きません。出力が欠落した場合も通常のビルド・計測を実行します。

## ブラウザ失敗時の証跡

GitHub Actions と CircleCI は同じ [`package-inkwave-evidence.mjs`](../scripts/ci/package-inkwave-evidence.mjs) を使用します。失敗時に提出するファイルの合計は、manifest を含む圧縮前のサイズで128 MiB以下です。上限以内では元の証跡全体を提出します。上限超過では別ディレクトリへ診断ログ、ビルド同一性、JSON、失敗した viewport の PNG を優先してコピーします。元のファイルは変更しません。

`EVIDENCE_MANIFEST.json` に元のサイズ・SHA-256、コピー／省略理由、ログの末尾だけを残した場合の開始位置を記録します。巨大な一覧も件数と全一覧のハッシュを残します。上限超過や非通常ファイルは失敗となり、縮小した証跡を保存できても成功へ変更しません。成功時の証跡と受け入れ判定は従来どおりです。

responsive は Chromium / WebKit と7画面条件を維持します。ステージ切替と loadout のアニメーション確認では、最初に観測した同一のアニメーション全件が native state 上で完了したことを確認します。タイムアウト、途中のキャンセル、入れ替わったアニメーションを成功扱いしません。操作ごとに診断 cohort をリセットし、以前の完了記録を次の操作へ持ち越しません。
