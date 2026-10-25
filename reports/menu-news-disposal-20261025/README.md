# メニュー破棄時のニュース解放 — 2026-10-25

基準は指定された検証専用 commit `354f1c50955d60be5d3bc29c6f3712be505548f8`、
tree `20c42a28e4736dff4a190462a25594cd5f565015`。GitHub origin からその commit
を取得して tree を照合し、専用 worktree / branch `fix/settings-lifetime-20261025`
で作業した。代替の main を基準にしていない。
前の成果 `f556a29d429184645ef49d560ed3cf1532787020` は書き換えていない。

## 原因・再現・最小修正

`visual-audio-queue-adapter.mjs` はニュース解放を RAF の取消行へ追加していた。
本番の全アダプター合成では `Menus.dispose()` の RAF 行は別の形に書き換わり、
同じ文字列が `Menus.update()` の「初回にエンジン駆動へ切り替える」分岐に残る。
アンカーが1個であることだけでは誤接続を検出できず、ニュースの解放が update に入る。
品質アダプター単独の経路では正しい dispose に接続するため、単独テストは通っていた。

- 表示中のニュースがある状態で初めて `Menus.update()` を呼ぶとニュースが消える。
- `maybeShow()` の700ms待機や `_tween()` の RAF を作った後で Menus を破棄すると、
  初回 update の前後どちらでもニュースの timer/RAF とプリロード参照が残る。
- 実際の修正はニュース解放の接続先を dispose 固有の
  `this.wipe.cancel(); this.el.remove();` に変更するだけ。
  曖昧な RAF 形式のフォールバックを削除し、一意性検査は保持する。

元データ、ニュースの内容・表示時間・アニメーション、ゲームルールは変更しない。
解放の呼び出し先である WhatsNew.dispose の実装自体は変更していない。
今回の結果を全UIの非同期処理やメモリ保持問題の解決とは扱わない。

## 重複しない範囲

指定候補の設定UIを先に確認し、sliderのpointer所有・blur/destroy解放、
設定画面のobserver/timer解放が既に実装されているため再実装しなかった。
2026-10-25 に GitHub connector で再取得した open PR #1867–#1877 に、
今回のニュース解放アンカー修正は含まれていなかった。
親の検証停止修復、MobileInput compatibility lock、前回のTransport、
列挙済み最適化、髪・身体・武器細部・材質変更には触れていない。

## 実行済み検証

Node v24.19.0、Chromium 154.0.8037.57。

| 検査 | 結果 | 証跡 |
|---|---|---|
| 指定候補の合成コード、新規回帰4件 | 3失敗、品質単独の1件成功 | [before.log](before.log) |
| 修正後、新規4件＋settings-ui/input-lens | 17成功、skip 0 | [focused.log](focused.log) |
| 既存menu navigation/title/input、visual batch231/358 | 47成功、skip 0 | [regression.log](regression.log) |
| 実ブラウザ・指定候補の診断合成 | 3条件不合格、page error 0 | [browser-before.json](browser-before.json) |
| 実ブラウザ・修正版の診断合成 | 3条件合格、page error 0 | [browser-after.json](browser-after.json) |
| 指定候補の通常ビルド | MobileInput lock不一致で失敗 | [baseline-build.log](baseline-build.log) |
| 修正版の通常ビルド / quick check | 同じlock不一致で失敗 | [build.log](build.log), [quick.log](quick.log) |

Node回帰は全本番アダプターの合成結果から AST で本物の Menus.update/dispose と
WhatsNew.dispose を取り出す。DOM・時計は fixture。品質単独ルートも別に確認する。
ブラウザは本物の Menus/WhatsNew と関連モジュールを読み、実DOM・実 timer/RAF を使う。
実際の open-news 表示が update 後も残ること、破棄時の timer/RAF が予約表から
取り消されること、プリロードが null になることを観測した。

通常ビルドが停止するため、ブラウザの `--source-root` は要求されたモジュールを
`adaptBuildSource` で診断用に合成して配信する。通常ビルドの検査を変えていないが、
この経路は正規生成物・minify・全配信物の受入にはならない。読み込んだモジュールの
SHA256をブラウザ証跡に保存した。基準は独立した detached worktree の指定 commit。

再実行:

```sh
node --test patches/local-quality/tests/menu-news-disposal.test.mjs patches/local-quality/tests/settings-ui.test.mjs patches/local-quality/tests/input-lens-queue.test.mjs
node --experimental-vm-modules --test patches/local-quality/tests/menu-navigation-timer.test.mjs patches/local-quality/tests/menu-title-ownership.test.mjs patches/local-quality/tests/menu-input-ownership.test.mjs patches/splatoon3/tests/queue-visual-batch231.test.mjs patches/splatoon3/tests/queue-visual-batch358.test.mjs
node scripts/check-inkwave-menu-news-disposal.mjs --source-root "$PWD" --output .ci-scratch/settings/browser.json
# lockを担当者が修復し、通常ビルドが成功した後:
node scripts/check-inkwave-menu-news-disposal.mjs --site _site --output .ci-scratch/settings/emitted-browser.json
```

## Blocker / 未確認

通常の `scripts/build-inkwave.mjs inkwave-public <output>` と quick check は
`INKWAVE patch compatibility review required: src/core/mobile.js` で停止。
**結果は失敗確定。承認拒否や実行結果不明ではない。** 別担当の所有範囲なので
lock変更・検査省略・別版への置換は行っていない。独立した修正と検証は完了。
通常生成物の再検証・startup budget・全ゲーム受入は親の統合後に残る。
Safari/iPad、実GPU、本家実機、CPU/FPS効果は未確認。大量CI・PR作成・main統合はしない。
Splatoon 3 Ver.11.3.0を引き続き比較基準とするが、独自ニュースUIに同等の
ブラウザ寿命仕様は確認できておらず、本家一致は主張しない。
