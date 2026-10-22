# INKWAVE：入力の復帰とアサリの空中接地を修正

基準はmain `26a4db4123d23162a3dbf8a12150b1b5bc6ccf64` と、前回の独立ローカル修正 `63e13b6f0`。対象は公開版に適用するbuild overlay。既存PRの統合や修正は行っていない。

## 1. 画面を離れた後も送信される射撃・アサリ投げ

`resetPlatformInput()` はキーや通常のActor intentを消していたが、オンラインのガチルールが送る `_rankedInput.fire/throw` と、送信拒否時に保持する `_rankedThrowPending` を残していた。復帰直後にActor更新より先に20Hz通信が走ると、過去の射撃指示・投げ予約が送信される。

本番アダプターを適用したController → Actor → NetMatch → Transport JSON → host側コマンド受理まで再現した。送信バッファが満杯で拒否された投げを作り、入力resetまたは `rebasePlatformGame()` の後、次のActor更新を入れず送信する。旧コードでは `fire:true` と `throw:true` が残る。修正後は両方falseとなり、host側の所持アサリは減らない。新たな操作での投げは一度だけ成立する。

修正は同じプラットフォーム境界で派生コマンド・投げの保持状態も中立化するもの。照準、既に成立した弾、回復待ち・クールダウンは維持する。30/60/120Hzで6件成功。比較対象はSplatoon 3 Ver.11.3.0の意図した入力による射撃・投擲だが、ブラウザのblur/BFCacheはINKWAVE固有の境界であり、任天堂の未公開時間値を追加していない。

## 2. 反射回数上限で空中に固定されるアサリ

`ClamsRule._reflect()` は3回目の衝突時、床がなくても接地扱いにしていた。投げたガチアサリが水上に固定され、水没で消えず、延長の勝敗判定にも残る。また遠く下の床が返った場合、そこへ瞬間移動していた。

反射速度を止めることと接地の成立を分離した。既存の床問い合わせの0.25 world-unit幅の近傍だけで接地し、それ以外は通常の重力・着地・水没処理へ戻す。この幅はローカル物理処理の許容値であり、Nintendoの計測値という扱いではない。

純粋ルールでは30/60/120Hz・両チームの延長とsnapshot引き継ぎ、低い床への落下、近くの床への着地を確認。さらに実際のLevel/Physics/RankedWorldを使い、床のない狭い2枚の壁の間で実OBB衝突を3回発生させ、水没まで落下することを30/60/120Hzで確認した。壁寸法は制御した回帰ステージであり、本家ステージの寸法ではない。

## 3. 空中パスの受取時に手放した小アサリの残留

小アサリを持ったプレイヤーが空中でガチアサリのパスを受けると、交換で落とす小アサリも床の有無を問わず接地扱いになっていた。`_dropSmallInventory()` に同じ実近傍の支持判定を加え、床がない場合や遠い下階の場合はその位置から落下させる。

実際の投擲飛行 → swept接触 → ガチアサリ取得 → 小アサリ排出の経路で30/60/120Hzを確認。陸上は従来どおり3個が残り、空中では重力に従い、水没で消える。落とす数、既存10秒寿命、投擲速度、得点は変更しない。

比較対象はSplatoon 3 Ver.11.3.0のガチアサリ。根拠は[S3攻略＆検証Wikiのガチアサリ解説](https://wikiwiki.jp/splatoon3mix/ガチアサリ)の落下・水没による消滅と10秒未回収による消滅の区別、ならびに既存INKWAVEの飛行・支持物理。Switch実機での反射係数・接触許容値・パス動作の完全一致は未確認。

## 検証と制約

- 失敗先行：入力の新規6件は旧コードで6件失敗。アサリの新規12件は旧コードで11件失敗、近い床への接地対照1件成功。元のログを保持。
- 最終source検証115件成功、fail/skipなし。新規21件と、既存の送信拒否・入力寿命・platform・Clams/RankedEngine/RankedNetwork回帰を含む。
- 既存の衝突テスト1件は、アサリy=1.15に対して床y=2を返しており、床問い合わせのyMax契約に反していた。衝突の初期位置を床直上y=2.1へ補正し、壁優先・得点なし・接地・床y=2という既存の検査を保持した。最初の86pass/1failログも保持。
- 新規出力先への本番minifyビルド成功。変更した2 runtimeファイルのsource pinと、2,016出力すべてのSHA-256、manifest contentHashを確認。
- Chromium 154.0.8037.57で、その新規minify出力を実行。入力reset/rebase 2条件、実Level/Physics/RankedWorldの壁反射・延長・引き継ぎ6条件、空中パス交換6条件、計14条件成功。
- 入力のsource検証は本物のゲームモジュールとTransport JSONを使うがsocketは制御している。Chromium検証も制御した入力・物理ステージであり、通常起動したゲーム画面、実relay通信、physical iPad、Switch実機のE2E検証ではない。

対象テスト：

```sh
node --experimental-vm-modules --experimental-global-webcrypto --test --test-concurrency=1 \
  patches/splatoon3/tests/ranked-platform-command-reset.test.mjs \
  patches/splatoon3/tests/ranked-clam-air-support.test.mjs \
  patches/splatoon3/tests/ranked-clam-native-wall-support.test.mjs \
  patches/splatoon3/tests/ranked-send-acceptance.test.mjs \
  patches/splatoon3/tests/ranked-input-network-lifecycle.test.mjs \
  patches/local-quality/tests/platform-analog-trigger-rebase.test.mjs \
  patches/reliability/tests/platform-pending-input.test.mjs \
  patches/reliability/tests/platform-composition.test.mjs \
  patches/splatoon3/tests/ranked-clams.test.mjs \
  patches/splatoon3/tests/ranked-engine.test.mjs \
  patches/splatoon3/tests/ranked-network.test.mjs
node --max-old-space-size=384 scripts/build-inkwave.mjs inkwave-public work/additional-fixes/site
node work/additional-fixes/check-browser.mjs
```

inputHash: `cfb93fab74f32f67849b72ab59f463df9c57e08093fcccf8237afca66a06f8e5`  
contentHash: `83b4299e23f3ab83f1e4a8306fb1214b2462d374270cb7d9a44402521db78dbc`

生ログ、比較JSON、ブラウザ用スクリプトは `work/additional-fixes/` に保存。ローカル独立ブランチでの修正であり、push・PR作成/更新・merge・デプロイは行っていない。
