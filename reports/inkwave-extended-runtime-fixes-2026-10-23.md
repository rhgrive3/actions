# INKWAVE: 多層床・スペシャル入力・支援装置の追加修正

対象は公開版 `inkwave-public/` の本番合成と runtime overlays。main `26a4db4123d23162a3dbf8a12150b1b5bc6ccf64` に、先行のローカル修正 `63e13b6f0` / `5e484fa17` を積んだ作業ツリーを基準とする。今回の runtime 変更は `all-specials.mjs`、`kit-ink-vac.mjs`、`kit-support.mjs` の3ファイル。既存PRの解消や統合作業とは別の追加修正で、公開・デプロイ・mainへの統合は行っていない。

## 修正した挙動

| 問題 | 再現条件と影響 | 修正 |
| --- | --- | --- |
| ジェットパックの床選択 | 下階で浮遊中、20 WU上からの探索が屋根を拾い、上階を基準に上昇する | 現在位置の直上0.25 WUから下へ探索し、fallbackにも同じ上限を渡す。既存の浮遊高・boost・servoは維持 |
| ミサイル等の地面への投影 | 屋根下の空中ターゲットで近傍探索が外れると、24 WU上からの再探索が屋根へ飛ぶ | 遠い床を調べる場合も起点の高さを上げない。fallbackの上限も対象の高さに合わせる |
| エナジースタンドの着地 | 屋根下の実投擲で、無制限のgroundHeightが上の階へ装置を移す | その更新の前後位置を超える床を着地候補から除外 |
| スペシャルのキャンセル | フォーカスreset・pointercancel等でボタンがfalseになると、独立した保持状態が「通常の解除」と解釈して投げる。キューインキは反撃弾、テイオウイカは充填済み突進が出る | WeaponRunnerの既存キャンセル経路から各スペシャルの保持履歴を中立化。受付済みthrow/startup、発動時計、残量、キューインキの自動発射期限は保持 |
| センサーの新しいlife | 同じActorが復活してもSetに残るため、有効なフィールドに再び触れた新しいlifeが検知されない | 検知済みをActor→lifeのMapで記録。同じlifeの重複延長と旧lifeの申告は拒否 |
| センサーの期限境界 | 削除処理より先に接触判定するため、期限ちょうどの新規侵入者を検知する。削除tick前の遅延markも通る | local接触と受信markの双方でfield期限を先に確認 |
| 支援イベントのremote life | nativeが新lifeを受理済みでも、描画側のnetLifeが古い間に正しいセンサー/スタンドの受信を拒否する | nativeが受理したnet.lastLifeとlocal counterの最大値を使う。既存のsource-life照合を保持 |
| 切断後の支援serial | 同じActorを別ownerが引き継ぐと、旧ownerの大きいserialが残り、新ownerの初回イベントが落ちる | native onLeaveがownerを書き換える前に、そのownerの支援serial ceilingを退役。旧送信者の再送は引き続き拒否 |
| テレポート直後の投擲受信 | NetMatchはsample→eventの順、Actor座標への反映は後。移動先が受理済みでも、旧描画位置からの10 WU制限で正しいイベントが落ちる | ready・finite・同lifeのnative sampleを距離判定に使用。10 WU制限を維持し、不正sampleや遠方配置は拒否 |

キャンセル対象はアメフラシ、エナジースタンド、ホップソナー、スミナガシート、ウルトラハンコ、トリプルトルネード、ナイスダマ、キューインキ、テイオウイカの9種類。別ボタンだけのキャンセルがR投擲を消さないことも検査した。

支援キットは従来通りopt-inで、メインはShooter近似である。H-3等の本家メインを再現したという扱いにはしていない。

## Splatoon 3との比較条件

参照は **Ver.11.3.0**。通常の発動・保持・R投擲、キューインキのZR保持と反撃待機、テイオウイカの35F充填と解除を比較対象にする。ギアは各fixtureの既定構成（追加APなし）。既存の[固定パラメータ表](https://github.com/Leanny/splat3/tree/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon)、`support-recon.mjs` / `support-cooler.mjs` / `kit-ink-vac.mjs` の出典を継承する。

Point Sensorのfield 150F・mark 480F、EnergyStandの投擲重力/空気抵抗、キューインキのInhaleToExhaleWaitFrame 20・ExhaleWaitFrame 150などの既存値は変更していない。多層床の上下関係と入力キャンセルはINKWAVE内での矛盾を直したもので、0.25 WUの探索許容、ジェットパックの浮遊制御、browser固有のfocus/pointercancelをNintendoの抽出仕様と断定しない。

実機に同じ二層ステージ・通信遅延・足場条件を用意した比較は未実施。床を跨ぐ攻撃、全地形、全スペシャルの本家同一性は未確認のまま。

## 再現と検証

新規テストはすべて本番合成のActor・WeaponRunner・Projectiles・NetMatchを使う。床の検査では実Level/Physicsに床0・屋根12〜12.5 WUを構築した。通信更新順の検査は実装の投擲→`_rec`→`_sendTick`→JSON→`onMessage`→`_sample`→`_playEvents`→`applyRemote`を通し、描画反映より前にイベントが届く順序を維持する。

| 検査 | 結果 |
| --- | --- |
| 多層床: 30/60/120 Hz、屋根有無/実スタンド投擲/ミサイル初弾 | 修正前12件中9失敗 → 修正後12/12 |
| R保持のキャンセルと受付済みstartupの対照 | 修正前46件中42失敗 → 拡張後61/61 |
| キューインキ独立ownerの追加検査 | 中間状態で61件中7失敗 → 61/61。自動発射期限と受付済み20F startupの対照を含む |
| センサーlife・期限・切断引き継ぎ | 修正前9/9失敗 → 遅延mark期限も追加して10/10 |
| native sample/描画反映順、2種類×life 0/2×30/60/120 Hz | 修正前12/12失敗 → 12/12。不正sample・遠方配置・serial消費の否定対照を含む |
| 最終source: 新規95件＋既存支援21件 | 116/116、fail/skip/cancel 0 |
| 既存all-specials / Ink Vac / support-kit | 22プロセスに分割して123/123。最後の支援変更後も上記21件を再実行 |
| 既存の地形・入力・ゲージ・Storm・Kraken等 | 別selectionで110/110、fail/skip/cancel 0 |
| 標準npm test | 変更前・変更後ともexit 0 |
| 新規minify生成物をVM fixtureで実行 | 95/95、fail/skip/cancel 0 |
| 同じminify生成物をnative Chromiumで実行 | 95/95 |
| native Input→MobileInput→PlayerControllerのDOMキャンセル | 9種類×30/60/120 Hz×pointercancel/lostpointercapture = 54/54 |

46件・61件などは同じテストを拡張した段階別の件数で、合算しない。最初の既存suite一括実行は`all-specials.test.mjs`の累積VM読み込みでNode既定heap上限に達した。その失敗ログを残し、test-nameの選択を6件ずつに分けて全48件を実行した。assertionや受付guardを緩めず、別途Ink Vac 55件と支援20件も同じ方法で実行した。

ブラウザは **Chromium 154.0.8037.57**。95件はNodeのrunner/assertとVM起動だけをbrowser harnessへ置き換え、元のcallbackとassertionを維持して実minify moduleをimportする。追加54件はnative Inputのtouch handlerを実DOMへ登録し、MobileInputのボタン受付へ入れた後、synthetic PointerEventをdispatchしてnative PlayerControllerを通す。新しい通常pointerupで再び攻撃できる対照を全条件で検査する。

Characterは簡易fixture、通常Actorのintegration/frame finishは固定、床と装置の物理は実処理。通常ゲーム画面の描画・physical touch・実WebSocket/relay・Switch実機の確認ではない。ネットワークfixtureではnative送受信に対してJSONの配送を制御している。

## ビルドと再実行

新規本番ビルドはexit 0。宣言input **1,362件**とartifact **2,016件**をすべてSHA256で照合し、inputHash/contentHash自身も再計算した。

- inputHash: `5cdc7c98f04060f9b409b922cdbc3df0eb472bcfa505be31c390536b3a75a2a2`
- contentHash: `ff777e3af6ef94fbcafc44766c0d7519bfca5396129ac3c0694f623482946282`

```sh
node --max-old-space-size=384 scripts/build-inkwave.mjs inkwave-public work/extended-fixes/site
node --max-old-space-size=1024 --experimental-vm-modules --experimental-global-webcrypto --test --test-concurrency=1 \
  patches/splatoon3/tests/special-held-input-cancel.test.mjs \
  patches/splatoon3/tests/special-multistorey-support.test.mjs \
  patches/splatoon3/tests/support-sampled-position.test.mjs \
  patches/splatoon3/tests/support-sensor-epochs.test.mjs
INKWAVE_BUILT_SITE=work/extended-fixes/site node --max-old-space-size=1024 \
  --experimental-vm-modules --experimental-global-webcrypto --test --test-concurrency=1 \
  patches/splatoon3/tests/special-held-input-cancel.test.mjs \
  patches/splatoon3/tests/special-multistorey-support.test.mjs \
  patches/splatoon3/tests/support-sampled-position.test.mjs \
  patches/splatoon3/tests/support-sensor-epochs.test.mjs
node reports/inkwave-extended-runtime-2026-10-23/verify-browser.mjs work/extended-fixes/site
```

ブラウザ検査はPlaywrightとChromiumが必要。`CHROMIUM_PATH`で実行ファイルを指定できる。browser receiptの出力先は第2引数で変更可能。

修正前後のraw log、メモリ上限で失敗した初回、分割実行selection、ビルド照合、browser receiptは[証拠archive](inkwave-extended-runtime-2026-10-23/evidence.tar.gz)へ保存した。[receipt](inkwave-extended-runtime-2026-10-23/receipt.json)に各ファイルのSHA256と範囲を記録する。GitHub Actions・公開版への反映成功は主張しない。
