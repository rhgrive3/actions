# Scoring prefix: independent two-pass proposal

保存専用。基点は PR #1973 head `87fca6d7a15678e5e323fa2c8af2ec0af6d7494d`。既存PR branch/main/workflowは変更しない。

`coverageReplay` の一時 `groups=[]` / `starts=[]` とtyped copyだけを、validate/count pass → exact-size typed arraysへのdirect fillへ変更。加算順・prefix検証・checkpoint・cache invalidation・storage fallbackは不変。score/塗り重みは変更しない。

**採用・統合の推奨は保留。** #1975 head `3df9007587e1b8e9609b701921ac85abd35eff71` は同じ `runtime/scoring.mjs` に `noteCoverageCell` / sparse bitsetの別方式を含む。意味比較・統合検証は未実施で、同時適用不可。この案を#1975へ混ぜない。

## 再現（Node 24、依存追加・network・browserなし）

```sh
node --test reports/scoring-prefix-two-pass-20261031/verify-local.mjs
node --experimental-vm-modules --test patches/splatoon3/tests/coverage-prefix.test.mjs
```

最初のfixtureは `git show 87fca6d7a15678e5e323fa2c8af2ec0af6d7494d:patches/splatoon3/runtime/scoring.mjs` を読み、両sourceのSHA-256を固定確認する。基点objectが手元になければ正しい元sourceを用意し、`INKWAVE_PREFIX_BASE_SOURCE=/absolute/path/to/head-scoring.mjs` を指定する。自動fetchなし。

4 tests: empty/dense/sparse・全byte-mask、255/256/257/511/512/513 group境界、offset、groups/starts/ownership/prefix/totals一致、異常index fallback、allocation失敗時の未公開とretry。既存12＋独立4は別ローカルのmain df8 text closure＋PR3filesでPASS、別peer4もPASS。完全build/emitted/browser受入ではない。

元source SHA-256: `1796177c81f6cdf69ad5e120d3173ec9df3d9ba5b3762cc965b07fb88c381003`。
案source SHA-256: `cc4c5c207eeea5e9e7c0313d122952e0cd511e898dbec716bac584d14f5d7e9d`。

## 局所測定と未確認事項

Node24.22.1、denseな単一floor face、各size/variant 4 fresh processes（全24、順序反転）、32warmup＋16窓×16既知late writes。初回と全256出力のbinary64 digest一致。GCは計時外のみ。

| cells | 初回ms: baseline / PR head / 案 | 定常late-write ms: baseline / PR head / 案 |
|---|---|---|
| 314,792 | 6.725 / 14.720 / 11.676 | 0.417 / 0.128 / 0.130 |
| 1,048,576 | 18.195 / 43.255 / 28.556 | 2.881 / 0.424 / 0.418 |

定常値はprocess内窓中央値のprocess間中央値。末尾書換に有利な小標本で、全体速度・browser/実機FPS・全stage/塗り密度・統計的優位は未確認。探索値をpoolしていない。案もbaseline比の初回コストは残る。

replay typed buffersは `12*G + 16*ceil(G/256)` bytesでhead/案とも949,304 / 3,162,112 bytes。既存index `12*E` とJS objectは別で、resident buffer削減ではない。初回OS process maxRSS増分中央値KiB（baseline/head/案）は315kで7,360/14,558/9,072、1Mで14,870/33,566/18,640。process全体のhigh-waterで、正確なJS heap/browser peakではない。

1GiB grid guardはgroup表現の上限で、実用的なreplay memory budgetではない。memory budget、native/browserの初回負荷、現mainとの統合は未解決。巨大rawは追加せず親のcheckpoint packetへ分離保存。[技術レビュー](https://github.com/rhgrive3/actions/pull/1973#issuecomment-6537391949)も参照。
