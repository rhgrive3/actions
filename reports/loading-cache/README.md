# 再現手順と証拠の読み方

このディレクトリの `native/results.json` は **blocked-policy**。他のfixture/byte gateがpassでも、native PWA・WebGLのpassを意味しない。既存commitからのfresh source buildも、この制限環境では実行していない。

## 通常の完全checkoutでの手順

このbranchの変更をbaseline `5e28dbd16f7829aebd88052ff5f7fdf71f39fdad` の完全checkoutへ適用する。既存build用esbuild環境をそのまま使用し、まずbaselineの配信ディレクトリを別に用意する。以下の `BASELINE_SITE` はその実在パス、`_site` は新規build先。

```sh
node scripts/build-inkwave.mjs inkwave-public _site
node scripts/check-inkwave-startup-budget.mjs _site
INKWAVE_BASELINE_SITE="$BASELINE_SITE" node --test patches/loading-cache/tests/*.test.mjs
INKWAVE_BASELINE_SITE="$BASELINE_SITE" python patches/loading-cache/tests/harness.test.py
python scripts/test-inkwave-startup-dom.py --out reports/loading-cache/dom
node scripts/analyze-inkwave-startup.mjs _site reports/loading-cache/after
node scripts/benchmark-inkwave-cache-model.mjs "$BASELINE_SITE" _site reports/loading-cache/cache-model.json
node scripts/benchmark-inkwave-startup-cpu.mjs _site reports/loading-cache/cpu-after.json 5
```

既存exact-source browser checkerも使用する。`--exact-source` は新namespaceを含めてHEADのGit blobと照合するため、先にローカルcommitが必要。evidence/profileは既存checkerの要件どおりworkspace内を指定する。

```sh
node scripts/check-inkwave-browser.mjs --site _site \
  --evidence-dir reports/loading-cache/full-game \
  --profile-dir .browser-profiles/loading-cache --exact-source
```

native比較用にはPython Playwright、WebGLが動くChromium、opensslを使用する。ブラウザ管理policyを解除するコードはない。利用を認められた通常の実行環境で動かす。

```sh
python scripts/benchmark-inkwave-startup.py \
  --before "$BASELINE_SITE" --after _site --runs 3 \
  --profiles desktop,4g,slow --battle \
  --out reports/loading-cache/native
```

詳細traceを別測定する場合は `--trace --startup-profile` を付ける。通常timing比較は追加phase profileなしが既定。CDPによる4G/CPU設定は実機性能ではなく、worker内部fetchへ同じネットワーク制限が適用されるとは限らないため、worker全体の帯域比較はOS側shapingでも確認する。

このrunnerのHTTP warm / SW warmはcontext内のreloadであり、OSによるブラウザ終了後のdisk-cache再起動やHome Screen standaloneを偽装していない。その2種類とSafari/Androidの実機測定は別途必要。

## Artifact replayという限定手順

`scripts/replay-inkwave-startup.mjs BASELINE_SITE OUTPUT` は、hash検証済み配信成果物からminification後のstageを正確に復元し、同じloading adapter/versioningを適用するための限定的な検証用。fresh upstream buildの代用ではない。出力manifestに `freshSourceBuildExecuted:false` と `productCommitAttested:false` を残す。存在するOUTPUTを勝手に上書きしない。

## データ分類

`asset-inventory*` / `dependency-graph*` / `budget.json` は静的byteとgraph。`cache-model.json` はNodeのCache API契約fixtureで、fetch呼び出しとcache.put数。`cpu-*.json` はNode/V8のESM object構築（link/evaluateしない）。`dom/` はabout:blankのDOM fixtureでbootstrapを置換し、一部はfake SW container。これらをnativeゲームの起動時間・転送量・Safari互換性に読み替えない。

`native/results.json` のfailed/blockedサンプルのbytesはブラウザのエラー画面などを含み得るため、ゲームの転送量として集計しない。`native-scenario-matrix.json` のnullは未測定であってゼロではない。
