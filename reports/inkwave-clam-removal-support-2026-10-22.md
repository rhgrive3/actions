# ガチアサリ：切断・Actor除去時の水中残留を修正

対象：公開版 `inkwave-public/` に適用する `patches/splatoon3`。基準mainは `26a4db4123d23162a3dbf8a12150b1b5bc6ccf64`。既存PRの統合・更新は行わず、新規の不具合として独立ブランチに修正した。

## 不具合とプレイへの影響

ガチアサリを持つActorが切断などで除去されると、`ClamsRule.removeActor()` は最後の位置で所持品を落とすが、通常の死亡時に渡す `floorAt` を渡していなかった。このため足場のない水上・水中でも `grounded: true` のアサリが生成され、重力と水没による消滅処理を通らなかった。

最後のガチアサリがこの状態になると、劣勢側の逆転機会が残っていると判定し、既存の10秒の寿命が尽きるまで延長戦が続く。旧コードと修正後を同じルール入力で比較すると、水没位置での除去後、旧コードは30/60/120Hzのすべてで約10秒後に終了。修正後は次のルール更新で消滅・終了した。これは制御したローカル再現であり、公衆ルームでの発生頻度の測定ではない。

## 修正

`removeActor()` が最後のauthoritative frameを `_dropInventory()` に渡す。frame内の床問い合わせは実際の `RankedWorld` に接続している。足場がない場合は従来の空中・水没処理へ進み、陸上と水面より低い有効な足場では従来どおり所持品が残る。足場情報を持たない単独ルール呼び出しの既存fallbackも保持する。

ゲームの10秒寿命、通常死亡時の落下個数、得点、延長条件、通信形式は変更しない。MatchとNetMatchの既存呼び出しを共通のルール所有者で修復する。

## 比較対象と根拠

比較対象はSplatoon 3 Ver.11.3.0のガチアサリ、通常の所持品落下、水没、延長。ブキ・ギア依存の値は追加していない。[S3攻略＆検証Wikiのガチアサリ解説](https://wikiwiki.jp/splatoon3mix/ガチアサリ) は、手放されたアサリの水没・穴への落下による消滅と、未回収10秒による消滅を別条件として記載している。今回はINKWAVEの既存水没規則への接続漏れを修復する。任天堂の切断時の補充・勝敗扱いまで再現したという主張はしない。Switch実機での同時比較は未実施。

## 検証

- 失敗先行：修正前に新規9件中7件が失敗、陸上・低い足場の対照2件は成功。修正前ログを保存。
- 修正後：新規10件成功。実際に本番用アダプターを適用したActor/Character、Match.removeActor、RankedWorld/Physics、NetMatch.onLeaveを使用。30/60/120Hz、両チーム、水没、空中、陸上、低い足場、重複除去、snapshot復元と引き継ぎを検証。rendererや本物のrelay通信は使用していない。
- 既存のClams/RankedEngine/RankedNetwork検証57件成功。
- 新規出力先への本番minifyビルド成功。変更したルールのsource pinと2,016個すべての出力ファイルのSHA-256、manifest contentHashが一致。
- Chromium 154.0.8037.57で実際の新規minify出力のルールを実行し、30/60/120Hz × 両チーム × 水没・空中・陸上・低い足場の24条件成功。snapshot引き継ぎ後も結果一致。ブラウザ側は制御したframe/floor fixtureであり、通常起動したゲーム画面や実通信のE2E検証ではない。

再現コマンド：

```sh
node --experimental-vm-modules --experimental-global-webcrypto --test patches/splatoon3/tests/ranked-clam-removal-support.test.mjs
node --test --test-concurrency=1 patches/splatoon3/tests/ranked-clams.test.mjs patches/splatoon3/tests/ranked-engine.test.mjs patches/splatoon3/tests/ranked-network.test.mjs
node --max-old-space-size=384 scripts/build-inkwave.mjs inkwave-public work/clam-removal/site
node work/clam-removal/check-browser.mjs
```

build inputHash: `a30ad3585af5c9c39c34b7361de5494913d6bdcbc7ef48b96964a9ed97d88465`

build contentHash: `fd7226305fd867a9d110108cb3f3d337d15d2cf44e6b06f13a16392aab066037`

生ログとブラウザ用スクリプトは `work/clam-removal/`。コードは独立ローカルブランチに保存。PR作成・更新、push、merge、デプロイは行っていない。
