# mainの参照チェック追随漏れ

対象main: `726e338ac256ba9609086ce65e25a68ddd99df85`。必須CIの[validate_core job](https://github.com/rhgrive3/actions/actions/runs/39938396410/job/120368597967)はlocal reference段階で失敗し、後続のTurf finish試験は未実行です。Turf evidence未生成のupload失敗はこの副作用です。

`aa5e99b6`でnav.jsがasync native構築・既存のnearest/path memoを直接所有し、engine.mjsは同じnative-nav.mjsからbuildNativeNavAsyncもexportするようになりました。`62575ce0`ではstage互換facadeの説明更新と、production用data.jsへの軽量descriptor分離が入りました。参照先のruntimeパスは変わっていません。この履歴を照合して固定値を更新し、data.jsの4本の明示的なpractice-range importを追加しました。[旧・新の参照記録](migration.json)には全bytes hashと変更元commitを保存しています。ゲーム本体・配信builder・workflow・必須jobの承認hashには変更を加えていません。

Node22.23.4で次を確認しました。

- 参照の正常・改変・未知owner・未知path・escape・build-only・shadow拒否、既存のnav/selected-prop-pack回帰: **33/33、skipなし**。[最終TAP](reference-migration-final.tap)。native graph order/edge/cost/spawnとasync cancel、pathの回帰、production cold dependency graphとoffline facadeを含みます。
- 通常minify済みの実生成物に対して全13参照の入力keyとroot/versioned成果物hashが一致。[結果](reference-emitted.json)。使用した生成物は別のPR #1852のsource421fb933・content24be9651です。この参照範囲の入力bytesは当ブランチと同じですが、サイト全体のmain同一性や本PR全体のCI成功を主張するものではありません。
- nav/facade/dataの全9対象edgeについてsource/targetの追加改変と未知owner/pathを個別に拒否。

最初の局所試験はengine側の追加exportも旧hashに固定されていたため28pass/4fail/1skipでした。[この失敗](reference-migration.tap)も残しています。変更元commitのengine差分を照合後、再試験と実生成物の参照確認を通しています。

再現:

```sh
node --experimental-vm-modules --test --test-concurrency=1 scripts/tests/inkwave-local-references.test.mjs scripts/tests/inkwave-selected-prop-pack-contracts.test.mjs patches/native-stages/tests/native-nav-time-slice.test.mjs patches/local-quality/tests/nav-heuristic.test.mjs patches/local-quality/tests/bot-navigation.test.mjs
node scripts/check-inkwave-local-references.mjs . --site /path/to/verified/site
```

生成物を含む33件を再現するときは先のtestコマンドにも`INKWAVE_BUILT_SITE=/path/to/verified/site`を指定します。指定がなければemitted optional packの1件はskipです。本PRのremote CI完了は別途必要です。別のmain browser active失敗はrunner shutdown signalの後にブラウザが閉じた記録であり、参照チェックの原因とは分けます。
