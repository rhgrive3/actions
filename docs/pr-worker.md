# PR Worker の運用

[`.github/workflows/pr-worker.yml`](../.github/workflows/pr-worker.yml) は、対象リポジトリを runner に clone / checkout し、調査・コマンド・テスト・同一ブランチへの push と成果物保存を行います。

GitHub Actions の **PR Worker → Run workflow** から入力します。対象コードを実行する worker なので、`command` と `test_command` の内容、および対象リポジトリを確認して指定してください。

## 入力

| 入力 | 用途・既定値 |
| --- | --- |
| `repository` | 対象の `owner/name`。例: `rhgrive3/hex-ida` |
| `ref` | 対象ブランチ名。現在の実装は `origin/<ref>` を checkout するためブランチを指定する |
| `base_ref` | 比較元ブランチ。既定は `main` |
| `operation` | 下表の処理種別 |
| `command` | 対象 checkout で実行する修正・調査用シェルコマンド |
| `test_command` | 対象 checkout で実行する検証コマンド |
| `push` | 既定は `false`。`fix-and-push` と組み合わせた場合のみ push |
| `artifact_name` | ログ等の artifact 名。既定は `pr-worker-output` |

## 処理種別

| `operation` | 実行内容 |
| --- | --- |
| `inspect` | HEAD、status、log、比較元との差分一覧 |
| `test` | 調査後に `test_command` を実行 |
| `command` | 調査後に `command` を実行 |
| `command-and-test` | `command` の成功後に `test_command` を実行 |
| `fix-and-push` | `command` → `test_command` → 条件を満たせば commit / push |

`command` を必要とする処理で空のコマンドは拒否されます。`test`、`command-and-test`、`fix-and-push` は空の `test_command` を拒否します。それ以外の処理でも `test_command` を指定するとテストを実行します。

## 使用例

| 目的 | 指定例 |
| --- | --- |
| ブランチの調査 | `repository=rhgrive3/hex-ida`、`ref=codex/topic`、`operation=inspect` |
| テスト | 対象ブランチと `operation=test`、`test_command=対象プロジェクトのテストコマンド` |
| 修正・検証のみ | `operation=fix-and-push`、`command=修正コマンド`、`test_command=検証コマンド`、`push=false` |
| 修正・検証・反映 | 上記に `push=true` を指定 |

依存ツールやテストコマンドは対象プロジェクトに合わせます。この worker 自体が対象プロジェクトの依存を自動で導入するわけではありません。

## Push の条件と認証

`operation=fix-and-push` かつ `push=true` のときだけ反映します。コマンドとテストの成功後、差分を確認し、checkout 時点の HEAD とリモートブランチの現在の HEAD を比較します。ブランチが進んでいれば中止し、force-push は行いません。ブランチ更新後は最新の対象で修正と検証をやり直してください。

現在の実装は `git diff --quiet` で変更を判定します。**未追跡ファイルの追加だけでは commit / push されません。** 追跡済みファイルの差分があって commit 処理へ進むと `git add -A` で対象 checkout の変更をまとめて取り込みます。生成物や意図しないファイルが残らないコマンドを指定してください。

別リポジトリへの push には Actions リポジトリの `GH_PAT` secret を使用します。`rhgrive3/actions` の `GITHUB_TOKEN` だけでは別リポジトリへの push はできません。`GH_PAT` がない場合、公開リポジトリの読み取り clone は試行できますが、push は失敗します。必要権限は対象ブランチを更新できる範囲に絞り、fork PR など権限モデルが異なる場合は別途確認します。

## 実行結果と制限

artifact には、生成された以下のファイルを保存します。失敗位置によって一部が存在しない場合があります。

- `initial_head.txt`、`base_head.txt`: checkout 時点の対象と比較元。
- `inspect.txt`: HEAD、status、log、差分一覧。
- `command.log`、`test.log`: 実行出力。
- `push.txt`: push 成功時の HEAD。
- `final.txt`: 最終 HEAD、status、差分チェック。

同じ repository / ref の実行は共通の concurrency group に入り、実行中の処理はキャンセルしません。ジョブの上限は 45 分です。この workflow は修正用のもので、PR の新規作成までは行いません。

有限タイムアウトと構造化結果を持つ Hex の並行計測には [専用 lanes](../lanes/README.md) を使います。専用 worker リポジトリの準備は [`bootstrap-hex-worker-repos.yml`](../.github/workflows/bootstrap-hex-worker-repos.yml) と [`worker-repos.json`](../bootstrap/worker-repos.json) を参照してください。
