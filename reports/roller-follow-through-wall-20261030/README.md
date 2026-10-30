# ローラーの放出直後の角度と壁着弾表示（2026-10-30）

基準は公開版 main `5d6480b2e2c1a8afa789bcc1415bae586e3156cb`。修正先は公開版の本番合成に配信される `patches/splatoon3/runtime/`。ゲームのパラメータ参照版は Splatoon 3 Ver.11.3.0。

## 本家との比較

任天堂[公式ブキ紹介](https://www.nintendo.com/jp/character/splatoon/fashion/index.html)の[通常スプラローラー映像 NablZy7jqxO](https://media-assets.apps-jp.nintendo.com/contents/embed/NablZy7jqxO)を再取得した。プレイヤーが公開する1080p/60fps HLSの2セグメントを順に連結したSHA-256は `4bb9e8f212b83f45d80696b6ddd87217403c570fd60d62a85c32f16a3576cc60`。過去の記録と同一の映像である。420–448Fを毎フレームで観察し、後続の縦振り（480–528F・544–592Fの区間）も確認した。外部映像はローカルの `/workspace/roller-reference/` に置き、配信物やこのレポートには含めない。

425–426Fでインクが飛び、430–440Fではドラムが体の横で前方へ倒れ、端面を後方カメラへ向けた低い姿勢になる。旧実装は放出後の柄のピッチを0.6radに設定していた。実ドラムの軸が立ち気味に残り、着地時には接地補正がドラムを横へ逃がしていた。単に「縦振りモードが続いている」ことを確認する既存テストでは、この軸の違いを検出できなかった。

`verticalRollerPose` の通常型のフォロースルーを1.4radへ校正した。これはINKWAVEのリグに対する設定であり、任天堂の関節角の抽出値ではない。ダイナモの別曲線は維持する。放出キー自体、放出時刻、インク消費、攻撃間隔は維持し、変更した接線は放出直前の補間にも連続して接続する。

同じキャラクター・装備・乱数・カメラ・着地条件で本番Chromium描画を比較した。放出後5Fのドラム軸の仰角は約49.0度から4.7度へ、着地時（放出後9F）は約20.4度からほぼ0度へ変化した。放出フレームと完了後の構えは同一。数値・ビルドハッシュ・条件は [comparison.json](comparison.json)、自分たちの描画だけを並べた画像は [before-after.webp](before-after.webp)。公式映像の画素角度と、このリグのワールド角度を同一視していない。

新しい角度に合わせ、構えへ戻す補正にも既存の有界な接地探索を適用する。探索する前に補正を捨ててネイティブへ戻る旧順序では、一時的な角度の跳ねが出た。探索回数の上限は増やさず、探索しても解決しない場合のフォールバックは残す。変身・スペシャルへの引き渡しでは、前の接地探索の記憶を破棄する。

## 壁に当たった飛沫が残る原因と修正

ローラーの弾は壁へ当たると `fidelityWallDrop` へ移り、壁を伝うインクの塗りを続けるため、直ちには弾リストから削除されない。従来の描画はそのデータを飛行中のまま扱い、大きいソースVTFシート、代替の履歴形状、旧blobのいずれかを壁上に残していた。

`projectile-visuals.mjs` の表示所有判定で、壁に当たったローラーの飛行表示をそのフレームから消費・非描画にする。ソースパックの有無、横振り／縦振り、補間alphaにかかわらず同じ判定を使う。`_qualityDead`、再利用世代、弾の寿命、壁の塗り・落下・通信状態は書き換えない。着弾時の小さい飛沫や、すでに離れた別のインク滴は独立した演出として残る。

## 再現と検証

1. スプラローラーでジャンプして一度縦振りし、ZRを離す。放出から低い振り抜き、着地、構えへの復帰を観察する。ZR保持・途中で離す・再入力・変身・サブ構えも確認する。
2. 塗れる壁へ横振り／縦振りを当てる。大きい飛行中の飛沫は接触直後に消え、壁のインクはその後も塗りを続ける。

```sh
node --experimental-vm-modules --test --test-concurrency=2 \
  patches/splatoon3/tests/roller-follow-through.test.mjs \
  patches/splatoon3/tests/roller-shaft-production.test.mjs \
  patches/splatoon3/tests/roller-vertical-shaft-return.test.mjs \
  patches/splatoon3/tests/roller-wall-visual.test.mjs \
  patches/splatoon3/tests/roller-wall-replay-unit.test.mjs
node scripts/build-inkwave.mjs inkwave-public _site
INKWAVE_BUILT_SITE=_site node --experimental-vm-modules --test \
  patches/splatoon3/tests/roller-follow-through.test.mjs \
  patches/splatoon3/tests/roller-wall-visual.test.mjs
node scripts/check-inkwave-roller-recovery-matched.mjs \
  _site .browser-evidence/roller-follow-through unchanged 60 roller
node scripts/check-inkwave-roller-wall-visual.mjs \
  _site .browser-evidence/roller-wall
```

CPU試験は実Actor・Runner・Character・二腕IK・Projectilesと実際の壁へのsweepを使う。旧ピッチの故障注入ではドラム軸の条件が失敗し、候補では通過する。30/60/120Hz、握りの到達範囲、放出・インク・弾・塗り・攻撃受付の比較を含む。壁の描画試験では、飛行中の本体と独立した滴を区別して数える。壁の塗りデータが残り、次の更新へ進むことも検査する。

最終の関連11ファイルのCPU回帰は **90/90成功**。最適化済み配信物でも新規の角度3件と壁表示1件が成功した。quick互換性と起動予算も通過。本番Chromium 154/SwiftShaderで同条件の66tick比較と壁の4条件が成功し、各着弾フレームのvolume instances／代替形状triangles／旧飛行blobはすべて0だった。壁の描画結果は [wall-render.json](wall-render.json)。ローラーの試験が他のスピナー／ガチホコ変更まで検証したという意味ではない。

本家映像の版・ギア・正確な入力時刻・FOVは非公開。公式映像で見える姿勢への校正と内部回帰、Chromium/SwiftShaderでの確認であり、Switch実機の同一入力比較や、全ローラー・全照準・全地形での完全一致を認定するものではない。
