# INKWAVE: 所有者・復活・切断境界の追加レビュー

2026-10-23。既存PRの解消とは別のローカル作業。修正前は `21b7959a11f59dc5649ee73be72aa99cba11d1be`、公開比較の基点は `26a4db4123d23162a3dbf8a12150b1b5bc6ccf64`。`inkwave-public/` の原本、既存PR、remote、公開サイトは変更していない。

## 再現して修正した問題

| 経路・再現条件 | 修正前の影響 | 最終変更と対照 |
| --- | --- | --- |
| ポイントセンサー: 同じActorをA→B→Aへ引き継ぎ、それぞれserial 1を使用 | 古いfieldが検索で先に選ばれ、新しいfieldの正当な検知が消える | fieldを受理時の台帳オブジェクトへ束縛。同一所有者の複数fieldは独立して検知する |
| キューインキ: 遠隔終了イベント欠落、30/60/120Hz | 時間上限でWeakMapだけ消し、native special tokenとliveStatesを残す | 通常のdispose経路で全資源を退役。ゲージを新しい所有者へ書き戻さない |
| キューインキ: 所有者交代・life更新・local化・match交換 | 古い吸引領域や保存済み接触callbackが、新しいActor状態で吸引を続ける | 接触探索と吸収実行の両方で所有者・life・remote区分・match・生存を確認 |
| キューインキ: native切断と再参加 | 前所有者のserial/tombstoneが次所有者の発動を拒否 | onLeave/adopt/removeで状態と受信台帳を退役。同一所有者の遅延発動は引き続き拒否 |
| 8種サブ: 復活後、native sample→event→Actor表示更新の順で受信 | パケットは新lifeとして受理されるのに、表示側の古いlifeでbirthを捨てる | 受信者のsource lifeだけをnative受理済みlifeへ合わせる。標的・物理接触のlifeは従来の表示/ゲーム状態のまま |
| トーピード: 上記順序で受理したbirth | privateな限定軌道観測へ登録されず、受信側の追跡が欠落 | 同じ受理済みlifeをprivate capabilityのcontext検査にも使用。直接replayや偽birthの権限は増やさない |
| ロボットボム: 標的Actorが死亡後に同じオブジェクトで復活 | 旧lifeを追っていたボムが復活先へ追尾する | 取得時の標的lifeを固定し、変化したら既存のlost-target countdown。同lifeの通常移動は追尾する |
| サブ・スペシャルの遠隔複製: leave/adopt/remove | ビーコン・シールド等が残留。旧トーピードが最初のlocal投擲を塞ぎ、remote→local後のspecialが送信主体になる | 複製だけを既存のremove経路で退役。送信も生成時のremote属性で拒否。通常復活・無関係なownerの切断・local装置は保持 |
| **全bootstrap合成後の切断**: intro/playing/finish | 後から入るDisconnectFidelityがonLeaveを置き換え、上記の個別wrapperだけでは実製品の後始末に届かない | game単位のWeakMapに退役callbackを登録し、最終切断方針から実行。7種類×3状態で同じ経路とlocal装置の維持を確認 |

サブ8種は burst / fizzy / toxicMist / angleShooter / splashWall / beakon / inkMine / torpedo。各30/60/120Hz、初期life 0と復活後life 2を、実際の投擲→NetMatch送信→JSON複製→受信→sample→event→applyRemoteで検査する。旧lifeの新serialは拒否する。

native単体のhost引き継ぎと、本番の「切断した人間をBOT化せず非活動化する」方針は別である。両方を別fixtureで検証し、最終bootstrapでは前者の動作を要求しない。

## 本家との比較と根拠の範囲

比較対象はSplatoon 3 **Ver.11.3.0**、既定ギア、通常投擲・センサー検知・キューインキ保持/終了・ロボットボム標的喪失/復活。既存の[固定パラメータ表](https://github.com/Leanny/splat3/tree/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon)と各runtimeの出典を継承する。今回、威力・射程・追尾速度・ヒューズ・センサー範囲・キューインキの移行時間を調整していない。

本家の装置・追尾対象・発動終了という比較軸から、INKWAVEで旧lifeや旧所有者の状態が新lifeへ誤作用しないかを調べた。受信sampleの反映順、browserキャンセル、replica所有権、bootstrapの後始末はINKWAVE固有の内部整合性であり、Nintendoの非公開通信仕様を再現したとの主張ではない。ロボットボムの復活先への追尾停止も、ここでの状態整合性修正と実機の正確なフレーム挙動一致を区別する。

## 独立した修正前比較

detached worktreeの上記修正前commitへ、**最終版とSHA256が同一の6テストとfixture helperだけ**をコピーした。production runtimeは無変更。`baseline-identity.json` にHEAD、変更範囲、7ファイルの一致を記録する。

| 固定した修正前 | tests | pass | fail | skip/cancel |
| --- | ---: | ---: | ---: | ---: |
| owner era / Vac / sub life order / Autobomb / replica handoff | 95 | 31 | 64 | 0 |
| 完全bootstrap: 7種類×intro/playing/finish | 21 | 0 | 21 | 0 |
| 計 | 116 | 31 | **85** | 0 |

どちらもassertion failureによるexit 1。実装を戻す逆パッチ比較ではなく、独立した過去runtimeで再現した。85は失敗した条件数であり、85個の独立したバグ数ではない。

レビュー中の「不正Fizzy hopが座標を先に変更する」という候補は、上流の専用guardが先に拒否しており再現しなかった。座標・速度・phase・age・fuse・popsが変化しない3件を追加し、修正前後で成功した。修正実績には数えない。初期fixtureのexport不足、初期化順、ボム戻り値やclock設定の誤りは独立比較に使用していない。

## 最終検証

Node v24.19。選択したテストは全て実行し、fail/cancel/skipは0。既存suiteのVM蓄積を避けるため、重い4 suite等はテスト名で6件ずつ独立processへ分割した。assertionは変更していない。

| 検証 | 最終結果 | raw record |
| --- | --- | --- |
| 今回の新規116件＋前回の関連95件、source | **211/211** | `final-source.log` |
| 同じ211件、新規minify生成物 | **211/211** | `emitted.log` |
| Chromium 154.0.8037.57、新規minify生成物 | **265/265、page error 0** | `browser.json`, `browser.log` |
| Ink Vac / support / all-subs / all-specials既存 | **145/145、26 process** | `final-retained/` |
| 武器状態連続性・ナワバリ戦闘/終了・切断弾・network paint既存 | **39/39、9 process** | `final-controls/` |
| nativeサブ・Beakon・Mist・Torpedo private proof・adoption・combat life既存 | **123/123** | `final-network-and-sub.log` |
| 本番build・startup budget | **成功** | `build.log`, `startup-budget.log` |
| 全input / artifact SHA256 | **1,363 / 2,018件、一致** | `build-identity.json` |
| 標準 `npm test` | **全工程成功** | `npm-test-final.log`, `npm-completion.json` |

browserは190 runtime条件＋実DOMのInput/MobileInput/PlayerControllerキャンセル54条件を一つのrealmで実行し、完全bootstrapの21条件を新しいrealmで実行する。Node用runner/assert/VM起動だけを置き換え、テストcallbackとassertionを保持する。再現scriptは全10個の追加installerと呼出順を実際の `bootstrap.mjs` へ照合し、source/harness/bootstrap hashを記録する。pointer入力の受付にnative `_press` を使い、pointercancel/lostpointercaptureは実DOM listenerへ合成イベントを渡す。

標準テストの初回は他の重い検証と並列で180秒の上限に達した（exit 124）。失敗ログを残し、600秒上限で単独実行へ切り替えた。timeoutを成功やassertion failureへ読み替えない。

最終build inputHash: `f00153f1726e6b4577f56b0d33e926ae132e96234dfbb51c5b10e36e58b1f045`。contentHash: `8e70fff054ce84027f7ab684db7e239af6c059f87c85a95767bff78b7fbe368f`。8個の変更runtimeのhashも照合済み。

## 修正後の再レビュー

| 見直した境界 | 確認した点 |
| --- | --- |
| source sampleと表示life | 受信者のbirth identityと物理標的lifeを混同しない。旧life・直接replay・不正proofを引き続き拒否 |
| leave / adopt / remove / respawn | cleanup前後の送信主体、同じActor/serialの再利用、A→B→A、通常復活、他owner/local装置の保持 |
| onLeaveのinstall順 | 個別wrapperだけでなく最終bootstrap、intro/playing/finishで実際の最終policyに到達 |
| キューインキ終了 | 終了packet欠落、liveStates/表示token、既に返したcallback、owner/life/match変更、新所有者ゲージ |
| ロボットボム標的 | 同lifeの追尾を保持し、再利用されたActorの次lifeを追わない。既存の物理/fuse回帰も保持 |
| オブジェクト除去の副作用 | 既存mesh/collider除去、Beakon jump予約との接続、clear、immutable remote属性 |
| 前回修正との合成 | 多層床・9 specialの入力cancel・sensor寿命・sample位置・旧life/owner拒否 |

この修正後の再レビューでは、上記経路に追加で再現できる問題が見つからなくなったため一区切りとする。ゲーム全域に未発見バグがないとの判定ではない。

## 再実行と証拠

```sh
node --experimental-vm-modules --experimental-global-webcrypto --test \
  patches/splatoon3/tests/*-review.test.mjs \
  patches/splatoon3/tests/special-multistorey-support.test.mjs \
  patches/splatoon3/tests/special-held-input-cancel.test.mjs \
  patches/splatoon3/tests/support-sensor-epochs.test.mjs \
  patches/splatoon3/tests/support-sampled-position.test.mjs
node scripts/build-inkwave.mjs inkwave-public work/review-closure/site
INKWAVE_BUILT_SITE=work/review-closure/site node --experimental-vm-modules \
  --experimental-global-webcrypto --test patches/splatoon3/tests/*-review.test.mjs \
  patches/splatoon3/tests/special-multistorey-support.test.mjs \
  patches/splatoon3/tests/special-held-input-cancel.test.mjs \
  patches/splatoon3/tests/support-sensor-epochs.test.mjs \
  patches/splatoon3/tests/support-sampled-position.test.mjs
node reports/inkwave-review-closure-2026-10-23/verify-browser.mjs \
  work/review-closure/site work/review-closure/browser.json
node scripts/check-inkwave-startup-budget.mjs work/review-closure/site
npm test
```

browser再実行にはPlaywrightとChromiumが必要。既存suiteの分割runner、各log、独立baseline、build identityは隣接folderの `evidence.tar.gz` に保持し、`receipt.json` にarchive/file SHA256と最終条件を記録する。生成サイト全体やnode_modulesは同梱しない。

native Level/Physics/Projectiles/NetMatchを使う制御fixtureだが、Characterは簡易実装、通常Actorのintegrate/frame finishは固定する。通常Gameの画面起動・実relay・物理touch・Switch実機比較を通したという記録ではない。startup budgetはファイル/依存の決定的検査であり、端末FPS測定ではない。
