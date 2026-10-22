# Clock/catalogue と weapon corrections の統合preview

**同じ通常production buildで compiled25/25が成功（fail0・skip0）。** これはruntime leafの併存とsource PRの競合を事前確認する追加証拠であり、各単独sourceの固定証拠を置換しない。combined browser・実機・本家parityの受入ではない。

## 実行sourceと公開PRの区別

実行sourceは専用local merge `7f3fc023241a9e8f18118de259ba0a188a0fe4a6`、tree `6254c2541ca19b55d16fc9d2029c0ec803e6f3a0`。weapons公開source `ca4566657466baab005d2b79707a6cf92aaf440e` と catalogue/clock `144573ed7aa72f0a3a46254dd50f263ba2bf5223` をmergeした。競合は共有behavior reportの末尾append1箇所のみで、両章本文をbyte完全保持した。runtime/source競合はなく、変更9runtime leafと実行6test fileは各parentの原本hashを保持した。

[PR1846](https://github.com/rhgrive3/actions/pull/1846) の後続公開HEAD `69bab40d6a1a4cd38aaa85afb5b9d31af8610a9c`、tree `dd4c9bddff3ace24da58ffe11eeccbf2b302a237` 自体をこのpreviewでは実行していない。実行parent144段階からの差分はCI登録1fileと比較/証拠4fileのみで、runtime/test bytesは同一。後続CI結果として読み替えない。

## Buildと25件の範囲

Node22.23.4・esbuild0.28.2の変更していない通常production builderを使用。2018 artifactのbyte hashと1364 source/builder Git inputsを実行sourceへ照合し、test後もmanifest hashは不変だった。

|Identity|値|
|---|---|
|contentHash|`f91ab3022cf6283b8f68d9b9c5709d160963673dafd5049529c50c3b102c859a`|
|inputHash|`4bbf6cc3bfe09e041fe99d273501b413370ae360b3ab5c3a29a9d6d40d8db733`|
|manifest SHA256|`27ffea9bb9c8caae5e4e5ae5f8ef6597957bbfb60508c4e513f17b538c98365a`|

|Compiled scope|結果|時間|
|---|---|---|
|#1812 native Splat Roller1・#1431 actual Quad1・#1813 Dynamo3|5/5、fail/skip0|28.05秒|
|新catalogue sidecar5・既存catalogue integration15|20/20、fail/skip0|9.44秒|

同一build、worker1、元assertのまま実行した。source-only mutation controlsはname selectionで除外し、test自体は編集していない。commands・全source/test hash・生TAP・build logはJSONとraw archiveに保持する。

## 別件: Brella presentation-only stale audit

既存source-only probe2rawを保存した。監査sourceはlocal144573ed段階で、今回のcompiled25とは別の既存実行であり、公開整理時に再実行していない。実senderのpacketを同じactor row129件へ拡張すると、初回ts1000/u0はnativeに1回受理される一方、Brella optional readerは128件上限で未処理となる。その後ts1000のstale replayを1row＋valid bcへ変えると、native stats.in1・lastTs1000のまま既存snapshotへs3Brella配列が追記される。通常128件以内の初回は既存hasOwn guardでduplicate上書きを防ぐが、ここで保持したrawは129件capの反例である。

実renderer・見た目の変化は測定しておらず、gameplay影響も未証明。本catalogue修正の対象外としてruntimeを変更していない。全wrapperが安全という結論にはしない。2rawだけには実行Node version/完全commandが記録されていない。

## 証拠

- [機械receiptとprovenance](combined-runtime-review.json)
- [生JSON/TAP/logとBrella2raw](combined-runtime-review.raw.tar.gz) — SHA256 `50ade21474064ebbae882a7989ae4ad1c3e3b649315c3b21c3fe3a7a02275ef2`

専用worktree内の追加3fileのみ。既存behavior report章を変更せず、GPU・remote操作・追加testを行っていない。
