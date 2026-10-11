# Actions

汎用 GitHub Actions worker。対象リポジトリを runner 上へ clone / checkout し、調査・テスト・任意コマンド・同一 branch への安全な push・artifact 保存を行う。

## Workflow

`.github/workflows/pr-worker.yml`

### 主な用途

- `inspect`: clone / fetch / checkout、HEAD / base、status / log、差分一覧を取得
- `test`: 指定した test command を実行
- `command`: runner 上で指定 command を実行
- `command-and-test`: command 実行後に test command を実行
- `fix-and-push`: command → test → HEAD競合確認 → commit → 同じ branch へ push

### Push の安全策

`fix-and-push` で `push=true` の場合だけ push する。

push 前に checkout 時点の branch HEAD と remote branch HEAD を比較する。不一致なら中止する。force-push は行わない。working tree に変更がなければ commit / push もしない。

### Cross-repository push

`rhgrive3/actions` の `GITHUB_TOKEN` だけでは別 repository の branch push に使えないため、Actions repository に `GH_PAT` secret を登録する。

必要権限は対象 repository の branch を push できる範囲だけに絞る。Fork PR など、token の権限モデルが異なる対象は別途確認する。

## 例

### 調査

- repository: `rhgrive3/hex-ida`
- ref: `codex/...`
- operation: `inspect`

### テスト

- operation: `test`
- test_command: `npm test -- --runInBand`

### 修正 + 検証 + push

- operation: `fix-and-push`
- command: 修正スクリプト / patch 適用コマンド
- test_command: 対象テスト
- push: `true`

実行結果は artifact に `inspect.txt`, `command.log`, `test.log`, `push.txt`, `final.txt` として保存される。


## Hex parallel lanes

Hex completion work has three bounded measurement lanes that can run concurrently against an exact `rhgrive3/hex-ida` SHA:

- `.github/workflows/hex-lane-perf.yml`
- `.github/workflows/hex-lane-realgames.yml`
- `.github/workflows/hex-lane-quality.yml`

All three use `.github/workflows/hex-lane-worker-reusable.yml`, enforce a finite hard watchdog, verify the exact target SHA, and upload only bounded evidence (structured JSON plus the last 200 command lines). See `lanes/README.md`.

A one-shot bootstrap for permanent worker repositories is also present at `.github/workflows/bootstrap-hex-worker-repos.yml` with its requested repository list in `bootstrap/worker-repos.json`.
