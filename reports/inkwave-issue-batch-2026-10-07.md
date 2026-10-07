# INKWAVE issue 修正 30 件の差分記録 (2026-10-07)

ベース `f31f5da`。本家の参照版は Splatoon 3 Ver. 11.3.0 (数値の一次抽出は `upstream-lock.json` の Leanny/splat3 固定コミット)。
すべて **ロジック単独の確認** (公開版の Actor / WeaponRunner / Projectiles / Match を VM で動かした回帰試験)。
ブラウザ実動作・Switch 実機との比較は、特記がない限り **未確認**。固定 60 Hz 更新を 30/60/120 Hz の描画間隔で回した確認は、実フレームペーシングの測定ではない。
`inkwave-public/` は変更していない (パッチ層のみ)。

## 状況一覧

| Issue | 結果 |
| --- | --- |
| #941 #934 #918 #936 #925 #920 #903 | 修正 |
| #939 #933 #922 | 修正 |
| #937 #926 #911 #924 #917 | 修正 |
| #930 #906 #905 #928 | 修正 |
| #938 #932 #908 #923 #914 #913 | 修正 |
| #896 | main で対応済み。固定用テストのみ追加 |
| #931 #910 | 現行 main で再現せず。ガードテストのみ追加 (修正前に失敗する回帰ではない) |
| #927 | 見送り。回復倍率が固定データにもリポジトリにもない |
| #890 | 見送り。B 長押しの閾値・小/大ジャンプ曲線が固定データにない |

## 本家比較の修正

### #930 空中の攻撃/構え中の加減速
- 根拠: Ver. 11.3.0、攻撃・サブ/スペシャル構え中の加速・減速は 2 倍 (コミュニティ計測 0.01 → 0.02 m/F²)。空中の例外は未確認。
- 実装: `patches/splatoon3/movement-physics-adapter.mjs`、`runtime/movement-physics.mjs` (`attackAirRateScale = 72/36`)。公開版 `actor.js:373-385`。
- 再現: ジャンプ中に射撃/サブ構えを保持し、フルスティックを入れる・離す。修正前 1.00 倍 → 2.00 倍。
- 影響: ジャンプ撃ち中の空中操作の応答。空中の基本係数は不変 (#562 の範囲)。
- 確認: ロジックのみ。`air-attack-acceleration.test.mjs`。

### #939 マニューバーの味方ブロック
- 根拠: `CollisionParam` / `CollisionLapOverParam` の `FriendThroughFrameForPlayer` = 0。
- 実装: `runtime/weapons-fidelity.mjs` (`fidelityProjectileTargets` / `setCollision`)。dualies のみ、生存・非潜伏の味方が連続最早接触の対象。味方接触で弾は消え、ダメージ・クレジットなし。
- 影響: 味方が射線上にいるとマニューバーが素通りしなくなる。
- 差異メモ: リポジトリ固定プロファイルの半径 0.31/0.335 と issue の 0.235/0.285 が不一致。半径は変更していない。潜伏中の味方を通すのは判断であり、本家の根拠値ではない。
- 確認: ロジックのみ。`dualies-teammate-block.test.mjs`。

### #933 チャージャーの被弾判定と smoothY
- 根拠: ヒト型カプセルは描画補間ではなくゲームプレイ位置に付く。
- 実装: `runtime/weapons-charger-flight.mjs` (約 79 行目) が `pos.y + smoothY` を使っていたため `actor.pos` のみに変更。`weapons.mjs:193`、`weapons-fidelity.mjs:303` の smoothY 使用は範囲外のまま。
- 影響: 段差補間の数 tick 間、命中が描画補間に引きずられていた。
- 確認: ロジックのみ。`charger-hurtbox-smoothy.test.mjs`。

### #922 チャージャーのレーザー射程
- 根拠: レーザーは溜め量によらず最大射程 (`DistanceFullCharge` 24.037) を示す。
- 実装: `weapon-edgecases-adapter.mjs` が `chargerReach(1)` を使う。公開版 `weapons.js` `_updateBeams` はチャージで短縮していた。
- 影響: 相手に見える脅威線が溜め初期に短くならない。遮蔽による短縮と部分チャージの射程は不変。
- 確認: ロジックのみ。`charger-laser-max-range.test.mjs`、`muzzle-grate-safety.test.mjs` の #712 期待値を更新。

### #937 バケツスロッシャーの照準射程
- 根拠: クロスヘアの有効射程 地上 約14.24 / 空中 約13.67 (Inkipedia と issue。近似値で、固定抽出データには無い)。
- 実装: `adapter.mjs:155-159` (`computeAim`)、`profile.json` `weapons.slosher.reticleRange`。弾の射程 `range 14.5` は不変。
- 影響: 空中のジャンプ撃ちで「射程内」表示が甘くならない。地上値は 14.5 → 14.24。
- 確認: ロジックのみ。`charger-hud-reach.test.mjs`。

### #926 スロッシャー射撃後 16F の泳ぎ/サブゲート
- 根拠: 射撃から泳ぎ・サブ使用まで 16F (issue と Inkipedia)。
- 実装: `runtime/weapons.mjs:62,69,117`、`runtime/weapon-edgecases.mjs:77,92,110+`、`profile.json` `postShotLock 16/60`。サブ入力はゲート中に保持して 16 tick 目に投げる。
- 影響: 即潜り・即ボムが本家より早く出なくなる。ZR 保持中は約 29 tick 中 16 tick サブ不可。29F の連射間隔、40F インク回復停止 (#876) は不変。
- 確認: ロジックのみ。`slosher-post-shot-lock.test.mjs`。`bomb-motion.test.mjs` の rig は `Actor.update` を通らなかったためテスト側のみ修正。

### #911 ブラスターの直撃
- 根拠: 直撃は壁・床と同じ縮小した衝撃爆発で、フル爆風 (70-50) ではない (wikiwiki と issue)。
- 実装: `runtime/weapon-edgecases.mjs:167` が `_blastBurst` を包む。直撃の周囲の敵は半分のダメージ (35)、直撃対象は 125 を 1 回。
- 未実施・未確認: 衝撃爆発の半径縮小 (`terrainSplashRadiusRate` 未設定、#221)、半減値の本家確認。
- 確認: ロジックのみ。`blaster-direct-impact-burst.test.mjs`。

### #896 ローラーのドラム投擲 (対応済みの確認)
- 現行 main は `adapter.mjs:~241` が `flickReleaseTime` を使い、`runtime/roller.mjs:191` が S3 の振り時間を渡す。issue が引用した未パッチ上流とは合成後の挙動が異なる。ランタイム変更なし。
- 確認: ロジックのみ。`roller-detail-motion.test.mjs` に横振り 21F 解放の固定テストを追加。ドラム位相の本家映像との一致は未確認。

### #924 タイダルスラムの HP 回復凍結
- 根拠: HP 回復は潜伏状態に依存し、スペシャル用の回復ロックは無い。
- 実装: `adapter.mjs:221,223`、`runtime/resources.mjs` に `recoverHealth()` を切り出し。スラムのみ。
- 範囲外のまま: インクストーム投擲中 (#841) とスーパージャンプ (#856) の凍結。
- 確認: ロジックのみ。`tidal-slam-recovery.test.mjs`。

### #917 タイダルスラムのダメージ
- 根拠: トリプルスプラッシュダウン 220-60 (Inkipedia。固定抽出データには無い)。
- 実装: `profile.json` `specials.slam {damageMax 220, damageMin 60}`。半径・減衰形・拳の爆発・アーマーは不変 (#912 の範囲)。
- 矛盾の記録: `reference/sub-special-fidelity-reference.json` と `reports/sub-special-ink-fidelity-report.md` は「トリプルスプラッシュダウンの数値置換はしない」とある。今回はコミュニティ出典の値として設定し、これらは未更新。
- 確認: ロジックのみ。`tidal-slam-damage.test.mjs`。

### #941 結果画面の順序
- 根拠: Ver. 11.3.0 ナワバリの結果は WIN 側が上 (issue の画面と stat.ink 記録)。
- 実装: `patches/splatoon3/adapter.mjs` が公開版 `ui/menus.js:3962` の `table(0), table(1)` を勝者先頭に書き換える。
- 確認: ロジックのみ。`results-winner-first.test.mjs`。ブラウザ描画・モバイル縦積み・カバレッジ帯の順序は未確認。

### #934 重複ブキ禁止
- 根拠: Ver. 11.3.0 レギュラーマッチにチーム内ブキ重複禁止はない (issue 内の記録で同チームにシューター3種)。
- 実装: `adapter.mjs` が通常ナワバリのボット枠を独立抽選にする。Boss とアトラクト背景は従来。オンラインのボット補充 `net/session.js:270` は未変更。
- 確認: ロジックのみ。`turf-weapon-draw.test.mjs`。S3 のマッチング構成統計は未確認。

### #918 死亡カードの SPLATTED BY
- 根拠: Ver. 11.3.0 は「Splatted by <ブキ>!」。相手名は別表示 (Inkipedia 画面)。
- 実装: `runtime/death-card.mjs`、`adapter.mjs` の hud/main 分岐。原因 (メイン/スプラッシュボム/タイダルスラム/水/敵インク) を表示し、相手名を別行へ。
- 未確認: カードのレイアウト/CSS、サブ・スペシャル原因時のアイコンとの対応、本家の文言。
- 確認: ロジックのみ。`death-card.test.mjs`。

## 本家比較ではない入力・オンライン・性能の修正

### #936 / #903 pointercancel と入力引き継ぎでチャージ・サブが発射される
- 実装: `patches/reliability/mobile-adapter.mjs`、`hold-cancel-adapter.mjs`、`touch-pointerlock-adapter.mjs`。FIRE/SUB の保持が cancel / 早すぎる lostpointercapture / リセットで終わったら、`WeaponRunner.cancelHold` がチャージ・ボムの照準を破棄する。マウス→タッチ引き継ぎも同経路。
- 副次: マップを開く・回転・blur で保持が落ちた場合も発射しない。blur/unlock のマウスクリア、Tab のマップ保持解除は未対応で後続候補。
- 確認: ロジックのみ。`hold-cancel.test.mjs` 17 件 (接続を外すと 11 件失敗)。実機の cancel 発生源は未確認。

### #925 / #920 PAUSE・MAP・マップピンが pointerdown で確定
- 実装: `mobile-adapter.mjs` (PAUSE / MAP / ミニマップは同一ポインタの pointerup・24px 以内で確定)、`pin-tap-adapter.mjs` (ピンは pointerup・同一対象・マップ開放中のみジャンプ)。
- 影響: PAUSE/MAP は指を離した時点で確定 (数十 ms 遅い)。24px は本実装の値で、実測ではない。
- 確認: ロジックのみ。`mobile.test.mjs`、`pin-tap.test.mjs` 18 件。Android Chromium / WebKit、ペンの実イベントは未確認。

### #906 空中でのイカ変身時の地面インク飛沫
- 実装: `adapter.mjs` で、変身時のバーストを `grounded && groundTeam === 1` に限定。音・形態遷移・地上のバーストは不変。
- 確認: ロジックのみ。`airborne-transform-spray.test.mjs`。

### #905 切断後に引き継がれたインクストームが塗らない
- 実装: `adapter.mjs` (weapons.js ブロック) でゴーストの雲は `!c.ghost || !c.owner.remote` のとき塗り・得点・Boss 雨を行う。
- 未対応: 切断前の遅延スプラットの重複排除。製品ビルドの network-replication パッチは所有権移動で雲を消すため、そちらでは雲が終了する。
- 確認: ロジックのみ。`storm-adoption-paint.test.mjs`。実際の `NetMatch.onLeave` とマルチクライアントは未実行。

### #928 オンラインのソフトプッシュが薄い壁を貫通
- 実装: `adapter.mjs` (match.js) と `runtime/movement-physics.mjs` の `softPushActor`。半径 1/4 の小刻みで進め、`bodyFits` が偽になる位置で止める。
- 差異メモ: issue の「次 tick で x ≤ -24.38 まで押し出される」は再現せず (-23.856 で壁内、次の解決で上方へ)。壁へ入らない不変条件は成立。0.6m の板は未検証。
- 確認: ロジックのみ。`soft-push-wall.test.mjs` (30/60/120 Hz、イカ形態含む)。

### #938 Halyard の反射ターゲット解放
- 実装: `patches/local-quality/idle-resources.mjs` `releaseReflection()`、`idle-adapter.mjs`。非マリーナ移行時に 1 回だけ dispose。約 3〜21 MiB。
- 確認: ロジックのみ (偽レンダラ)。GPU メモリ実測は未実施。

### #932 ScreenFX レンズターゲット解放
- 実装: `patches/local-quality/screenfx-lens-release-adapter.mjs`。1.5 秒の待機後または `reset()` で 4x4 に縮小し、描画前に再フィット。約 4〜28 MiB。
- 確認: ロジックのみ。GPU メモリ実測は未実施。

### #908 Actor 毎 tick の武器入力オブジェクト割り当て
- 実装: `actor-weapon-input-adapter.mjs`。Actor が 1 つのオブジェクトを再利用。全 7 ブキで挙動が同一。ブラウザのアロケーションプロファイルは未実施。#884 のラッパー割り当ては範囲外。

### #923 TIME UP / JUDGE の全アクター物理
- 実装: `patches/local-quality/time-up-freeze-adapter.mjs`、`patches/splatoon3/runtime/clock.mjs:40`。通常ナワバリ (Boss・アトラクト以外) の finish/judge でアクターと弾の更新を止め、飛翔中の弾を消去する。state 遷移・判定・カメラ・HUD・塗りフラッシュ・ネットワークは継続。results 状態は不変。
- **挙動の変更 (要確認)**: ホイッスル時に空中にあったインクは結果の塗り面積に数えられなくなる。空中のアクターはその姿勢で results まで止まる。実際の S3 でそうなるかは**未確認**。性能のための凍結が、ゲームロジックを変えている点に注意。
- 確認: ロジックのみ (`time-up-freeze.test.mjs`、30/60/120 Hz)。

### #914 チャージャー/スプラスピナーのボットが補給で溜め続ける
- 実装: `bot-refill-release-adapter.mjs`。0.25 秒溜めて離し、水たまりを塗る。0.25 秒は本プロジェクトの値で S3 の値ではない。他ブキは不変。視認できる敵がいる戦闘時の挙動は未検証。
- 確認: ロジックのみ。

### #913 ボットの縁ガードの地形プローブ
- 実装: `bot-edge-guard-adapter.mjs`。安全判定を 0.1 秒・0.3m・向き約 5.7° 以内で再利用 (7 体 × 10 秒で 8400 → 2818 回、約 66% 減)。縁の近くでの反応が最大 0.3m 遅れる場合がある。実マップ・Boss・アトラクトは未検証。
- 確認: ロジックのみ。

## 見送り・再現せず

- **#890**: S3 の B 長押し閾値と小/大ジャンプ曲線が、`profile.json`・`reference/`・固定抽出データにない。数値を作らないため未着手。`actor.js` のジャンプ分岐で離し/保持を扱う余地がある。実機計測か最新バージョンのパラメータが必要。
- **#927**: Ver. 6.1.0 の「味方インクストーム内でダメージ回復が速くなる」は、倍率が固定データにもリポジトリにもない。`resources.mjs` の `recoverHealth()` に味方雲の範囲判定を足す余地がある。倍率は未確認。
- **#931**: スピナーの 40F インク回復停止は、`lastFire` が各弾で更新されるため、最終弾から 40F 後に回復が始まる (最終弾 232 → 回復 272 tick)。実機で 40F が最終弾から測られるか、ストリーム終了から測られるかは未確認。ガードテスト `splatling-ink-recover-stop.test.mjs`。
- **#910**: 0.2 のフィールド半径は `weapons-fidelity.mjs` の `setCollision` と `weapons-adapter.mjs` の掃引で既に適用済み (壁端 0.19 で停止、0.21 で通過)。issue が見ていたのは未合成の `weapons.mjs`。ガードテスト `splatling-field-radius.test.mjs`。グレートには適用されない。
