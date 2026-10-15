# INKWAVE issue 解消・検証記録（2026-10-14 JST）

確認対象は最新main `14f9f913a8438353d0e462a0e74e17d8af876230` の全69件。6件の修正を一つの変更に集約した。**残り63件は解消済みとしない。**

## 実装と検証

新規: #1396の取消済みPointer Lock要求を退役し、試合をまたぐ完了・fallbackを拒否する。初回menu→countdown、fresh retry、touch handoff、legacy errorも保つ。#1400は実Gameルータでeditorの入力を止め、閉じた後は物理ボタンとstickのニュートラルを待つ。フレーム間の短いeditor開閉もInputへ境界を記録する。

既存候補の集約: #1359の正確な5ファイル（#1357/#1360/#1340）と#1321のnetwork/runtime/testファイルを取り込んだ。関連するnetwork bomb/Storm/Sprinklerのauthority修正は同じ依存を保つ。元PRのworkflow、独立stage、表示モデル、未採用CPU最適化は含めない。上流 `inkwave-public/` と全workflowは変更していない。

| 検証 | 結果 | 範囲 |
|---|---|---|
| imported-source | 96 pass / 0 fail / 0 skip | ローカルNode。集計間に重複あり |
| input-final-source | 32 pass / 0 fail / 0 skip | ローカルNode。集計間に重複あり |
| issue-audit-source | 455 pass / 0 fail / 4 skip | ローカルNode。集計間に重複あり |
| input-emitted | 97 pass / 0 fail / 0 skip | ローカルNode。集計間に重複あり |
| network-emitted | 32 pass / 0 fail / 0 skip | ローカルNode。集計間に重複あり |
| packaging-final | 9 pass / 0 fail / 0 skip | ローカルNode。集計間に重複あり |
| browser-candidate | passed / 5ケース | 実Chromium、制御入力。実機比較ではない |
| browser-baseline | passed / 3ケース | 実Chromium、制御入力。実機比較ではない |

source監査の4skipは明示Turf Mapのemitted条件であり、別の配布版テスト4ケースは実行して合格。source監査は75ファイル、455pass/4skip。各テストの成功は本家と完全一致の証明ではない。
配布ビルドcontentHash: `99a82bafc4b265ea325512f704794be0a347e848c5c7338fe2f4f72340f54f1a`。startup/worker/precache容量も既存ゲートに合格。

Chromiumは配布版をそのまま読み、Gameをexportするため起動末尾のみ検証用に置き換えた。controllerはnavigator.getGamepadsの制御snapshot、Pointer Lockは遅延wrapperから実ブラウザAPIを呼ぶ。編集ダイアログのキャンセルは実DOM操作、タンクはnative Path2D/Canvas2Dで描画。修正前はeditor入力透過・遅延lock取得・負のcorner半径を独立に再現し、修正後は5ケース合格。

保持した失敗: 最初のブラウザfixtureは広いbutton CSSがeditorボタンを重ねたため検証不能だった。fixtureを限定した。ブラウザ自動downloadは破損archive、npm配布のChromiumを展開して実行した。初回packagingは未commitのコードとHEADの相違を正常に拒否し、code commit後に無変更のguardが9/9合格。最初の広域scoutingは入力を変更中に実行されていたため中断し、baseline passに数えない。

## 根拠

- [W3C Pointer Lock](https://www.w3.org/TR/pointerlock/): promiseと非同期lock状態イベントの境界。
- [W3C Gamepad](https://www.w3.org/TR/gamepad/): 物理状態のpolling。
- [HTML Canvas roundRect](https://html.spec.whatwg.org/multipage/canvas.html#dom-context-2d-roundrect): 負半径はRangeError。
- 本家の版はNintendo公式の11.3.0更新履歴と既存固定Leanny tablesに合わせる。今回、本家の未公開の数値・曲線を推測で追加していない。

## 全issueの状態

「追加受入が必要」は、current mainの既存部分実装を壊さず、公開根拠・実機/実ブラウザ・厳密な原典意味の残件を保持する状態。古い担当コメントの残作業はcurrent mainの欠落と即断しない。各issueの本文と過去コメント、named regressionは同名JSONに保存。

| Issue | 今回の状態 | 対象 |
|---|---|---|
| [#1400](https://github.com/rhgrive3/actions/issues/1400) | 修正・検証済み（統合対象） | [INKWAVE] Gamepad input passes through the touch-layout editor and can resume play behind it |
| [#1396](https://github.com/rhgrive3/actions/issues/1396) | 修正・検証済み（統合対象） | [INKWAVE] A cancelled pending Pointer Lock can recapture the cursor during quit |
| [#1360](https://github.com/rhgrive3/actions/issues/1360) | 修正・検証済み（統合対象） | Emitted map-gyro regression fixture still assumes the explicit Turf Map is hidden |
| [#1357](https://github.com/rhgrive3/actions/issues/1357) | 修正・検証済み（統合対象） | [INKWAVE] Queued respawn Super Jump can follow a teammate into an unconfirmed new life |
| [#1340](https://github.com/rhgrive3/actions/issues/1340) | 修正・検証済み（統合対象） | [INKWAVE] Narrow HUD ink tank sends negative roundRect radii and aborts a game frame |
| [#1311](https://github.com/rhgrive3/actions/issues/1311) | 修正・検証済み（統合対象） | [INKWAVE][Bug] Valid-life remote projectile birth flood exhausts the ghost pool |
| [#1165](https://github.com/rhgrive3/actions/issues/1165) | 追加受入が必要・未解消 | [INKWAVE][Bug] Roller band edge differs between GPU ink and CPU turf grid |
| [#1149](https://github.com/rhgrive3/actions/issues/1149) | 追加受入が必要・未解消 | [INKWAVE][Systems] Ink Vac suction never drains or slows opponents inside the vortex |
| [#1140](https://github.com/rhgrive3/actions/issues/1140) | 追加受入が必要・未解消 | [INKWAVE][Slosher] High-drop Bucket Slosher hitboxes never shrink with fall distance |
| [#1116](https://github.com/rhgrive3/actions/issues/1116) | 追加受入が必要・未解消 | [INKWAVE][Motion] Non-shooter jumps reuse generic airborne pose despite Splatoon 3 weapon-class jump animations |
| [#1110](https://github.com/rhgrive3/actions/issues/1110) | 追加受入が必要・未解消 | [INKWAVE][Motion] Remote Super Jump charge corrupts squid scale because network phase has no progress timer |
| [#1097](https://github.com/rhgrive3/actions/issues/1097) | 追加受入が必要・未解消 | [INKWAVE][Motion] Hit reactions use one weapon-agnostic flinch instead of Splatoon 3's weapon-class damage poses |
| [#1022](https://github.com/rhgrive3/actions/issues/1022) | 追加受入が必要・未解消 | [INKWAVE][Slosher] Bucket Slosher ignores S3 RandomRotateYBias and uses uniform yaw scatter |
| [#1011](https://github.com/rhgrive3/actions/issues/1011) | 追加受入が必要・未解消 | [INKWAVE][Slosher] Bucket Slosher impact paint ignores S3 per-unit near/far PaintParam |
| [#997](https://github.com/rhgrive3/actions/issues/997) | 追加受入が必要・未解消 | [INKWAVE][Motion] Ordinary weak diagonal walking gait does not match Splatoon 3 |
| [#992](https://github.com/rhgrive3/actions/issues/992) | 追加受入が必要・未解消 | [INKWAVE][Dualies] Normal-shot turf paint ignores S3 distance-angle paint profile and uses fixed random blobs |
| [#966](https://github.com/rhgrive3/actions/issues/966) | 追加受入が必要・未解消 | [INKWAVE][Damage] Tidal Slam impact resolves around 55F instead of S3 Triple Splashdown's 70F |
| [#956](https://github.com/rhgrive3/actions/issues/956) | 追加受入が必要・未解消 | [INKWAVE][Physics] Splat Charger muzzle height ignores footwear, removing S3 shoe-dependent shot origin |
| [#952](https://github.com/rhgrive3/actions/issues/952) | 追加受入が必要・未解消 | [INKWAVE][Motion] Heavy Splatling charge entry ignores S3 dedicated ground-deceleration curve-delay |
| [#940](https://github.com/rhgrive3/actions/issues/940) | 追加受入が必要・未解消 | [INKWAVE][Motion] Heavy Splatling uses generic cone bloom instead of S3's fixed 30% outer-reticle shot distribution |
| [#923](https://github.com/rhgrive3/actions/issues/923) | 追加受入が必要・未解消 | [INKWAVE][Perf] TIME UP and JUDGE keep full actor physics simulation running for about 7.7s |
| [#912](https://github.com/rhgrive3/actions/issues/912) | 追加受入が必要・未解消 | [INKWAVE][Damage] Ground Tidal Slam omits Triple Splashdown's two fist explosions and overlap damage |
| [#905](https://github.com/rhgrive3/actions/issues/905) | 追加受入が必要・未解消 | [INKWAVE][Bug] Adopted Ink Storm stays ghost-only for turf after its owner disconnects |
| [#891](https://github.com/rhgrive3/actions/issues/891) | 追加受入が必要・未解消 | [INKWAVE][Motion] Splat Dualies sustained-fire accuracy uses 4-shot cone bloom instead of S3 1%-25% outer-reticle bias |
| [#890](https://github.com/rhgrive3/actions/issues/890) | 追加受入が必要・未解消 | [INKWAVE][Movement] Normal jumps ignore B hold duration so small and high jumps collapse to one arc |
| [#887](https://github.com/rhgrive3/actions/issues/887) | 追加受入が必要・未解消 | [INKWAVE][Motion] Splat Dualies jump spread snaps to ground instead of S3 25F-70F recovery |
| [#878](https://github.com/rhgrive3/actions/issues/878) | 追加受入が必要・未解消 | [INKWAVE][Match] Hiding the host tab freezes the authoritative Turf War clock and strands guests at 0-00 |
| [#856](https://github.com/rhgrive3/actions/issues/856) | 追加受入が必要・未解消 | [INKWAVE][Damage] Super Jump flight freezes HP recovery despite S3 recovery depending only on submersion |
| [#846](https://github.com/rhgrive3/actions/issues/846) | 追加受入が必要・未解消 | [INKWAVE][Movement] Squid Surge fast climb expires after 18F instead of continuing to wall top or ink edge |
| [#845](https://github.com/rhgrive3/actions/issues/845) | 追加受入が必要・未解消 | [INKWAVE][Perf] Frustum-culled actors keep Character pose, foot-IK raycasts and hair simulation running every tick |
| [#841](https://github.com/rhgrive3/actions/issues/841) | 追加受入が必要・未解消 | [INKWAVE][Damage] Ink Storm throw animation freezes HP recovery during the special-active window |
| [#838](https://github.com/rhgrive3/actions/issues/838) | 追加受入が必要・未解消 | [INKWAVE][Match] Online guests can keep firing at 0-00 until the host finish packet arrives |
| [#771](https://github.com/rhgrive3/actions/issues/771) | 追加受入が必要・未解消 | [INKWAVE][Roller] Horizontal flick ignores S3 SwerveRateBySpeed and fixes each main-glob yaw |
| [#735](https://github.com/rhgrive3/actions/issues/735) | 追加受入が必要・未解消 | [INKWAVE][Systems] Ink Storm can damage enemies arbitrarily far below the cloud because no vertical cutoff is enforced |
| [#725](https://github.com/rhgrive3/actions/issues/725) | 追加受入が必要・未解消 | [INKWAVE][Aim] DeviceMotion gyro sensitivity spans ~1.30x-3.27x instead of Splatoon 3 measured ~1x-3x range |
| [#719](https://github.com/rhgrive3/actions/issues/719) | 追加受入が必要・未解消 | [INKWAVE][Motion] Splat Dualies cannot dodge-roll in midair while Splatoon 3 allows airborne slides |
| [#716](https://github.com/rhgrive3/actions/issues/716) | 追加受入が必要・未解消 | [INKWAVE][Match] Damaged players lack Splatoon 3 Ver. 11.0+ remaining-health bars |
| [#713](https://github.com/rhgrive3/actions/issues/713) | 追加受入が必要・未解消 | [INKWAVE][Roller] Break-free impact paint ignores S3 height-based depth scaling |
| [#649](https://github.com/rhgrive3/actions/issues/649) | 追加受入が必要・未解消 | [INKWAVE][Roller] Rolling paint stays fixed-width instead of widening with S3 roll speed |
| [#647](https://github.com/rhgrive3/actions/issues/647) | 追加受入が必要・未解消 | [INKWAVE][Systems] Tidal Slam empties the special gauge instantly instead of the Triple Splashdown through-landing drain |
| [#642](https://github.com/rhgrive3/actions/issues/642) | 追加受入が必要・未解消 | [INKWAVE][Perf] Mobile post stack permanently pins two full-resolution RGBA16F composer buffers |
| [#574](https://github.com/rhgrive3/actions/issues/574) | 追加受入が必要・未解消 | [INKWAVE][Damage] Blaster explosions omit Splatoon 3 knockback and never push hit players |
| [#573](https://github.com/rhgrive3/actions/issues/573) | 追加受入が必要・未解消 | [INKWAVE][Systems] Tidal Slam uses 75% damage reduction instead of Triple Splashdown's 50F invulnerability transition |
| [#541](https://github.com/rhgrive3/actions/issues/541) | 追加受入が必要・未解消 | [INKWAVE][Roller] Empty ink immediately cancels rolling instead of preserving S3 dry-roll state |
| [#539](https://github.com/rhgrive3/actions/issues/539) | 追加受入が必要・未解消 | [INKWAVE][Charger] Partial-charge movement is pinned to full-charge speed instead of Splatoon 3's 0.96→0.21 curve |
| [#537](https://github.com/rhgrive3/actions/issues/537) | 追加受入が必要・未解消 | [INKWAVE][Roller] Slow rolling can drain below S3's 1.2%/s minimum ink consumption |
| [#532](https://github.com/rhgrive3/actions/issues/532) | 追加受入が必要・未解消 | [INKWAVE][Motion] Splat Dualies dodge-roll targets 2.8 units instead of S3's 5.0 DU trajectory |
| [#522](https://github.com/rhgrive3/actions/issues/522) | 追加受入が必要・未解消 | [INKWAVE][Bug] Online paint events are unauthenticated and can alter authoritative turf and the winner |
| [#498](https://github.com/rhgrive3/actions/issues/498) | 追加受入が必要・未解消 | [INKWAVE][Roller] Flick paint width never applies S3's 0.6x age decay |
| [#469](https://github.com/rhgrive3/actions/issues/469) | 追加受入が必要・未解消 | [INKWAVE][Systems] Ink Storm special gauge is emptied instantly instead of draining after use |
| [#466](https://github.com/rhgrive3/actions/issues/466) | 追加受入が必要・未解消 | [INKWAVE][Roller] Dash turning never uses S3 SpeedDashTurnBreak and stays at 0.132/frame |
| [#408](https://github.com/rhgrive3/actions/issues/408) | 追加受入が必要・未解消 | [INKWAVE][Shooter] Splattershot keeps firing walk speed for 21f after ZR release |
| [#387](https://github.com/rhgrive3/actions/issues/387) | 追加受入が必要・未解消 | [INKWAVE][Roller] Rolling contact applies damage but omits S3 roller-body knockback responses |
| [#378](https://github.com/rhgrive3/actions/issues/378) | 追加受入が必要・未解消 | [INKWAVE][Physics] Heavy Splatling keeps weak generic drag after 8f instead of S3 brake state |
| [#351](https://github.com/rhgrive3/actions/issues/351) | 追加受入が必要・未解消 | [INKWAVE][ギア/索敵] リベンジがなく、自分を倒した相手の死亡まで続く本人限定追跡を使えない |
| [#292](https://github.com/rhgrive3/actions/issues/292) | 追加受入が必要・未解消 | [INKWAVE][Movement] Drop Roller is absent from Super Jump landing |
| [#287](https://github.com/rhgrive3/actions/issues/287) | 追加受入が必要・未解消 | [INKWAVE][Aim] Controller sensitivity uses 0.2×–3.0× instead of Splatoon 3's −5…+5 right-stick scale |
| [#285](https://github.com/rhgrive3/actions/issues/285) | 追加受入が必要・未解消 | [INKWAVE][Roller] Horizontal flick collapses S3 spatial spawn width into one common projectile origin |
| [#278](https://github.com/rhgrive3/actions/issues/278) | 追加受入が必要・未解消 | [INKWAVE][Roller] Vertical flick launches all five globs from one origin instead of S3's tiered spawn offsets |
| [#272](https://github.com/rhgrive3/actions/issues/272) | 追加受入が必要・未解消 | [INKWAVE][Movement] Stealth Jump cannot apply Splatoon 3 Ver. 11.0.0's distance-based Super Jump flight penalty |
| [#268](https://github.com/rhgrive3/actions/issues/268) | 追加受入が必要・未解消 | [INKWAVE][Bug] GPU splatter and wall drips render as team ink but never enter the CPU ownership grid |
| [#264](https://github.com/rhgrive3/actions/issues/264) | 追加受入が必要・未解消 | [INKWAVE][Bug] GPU splatter/drips render as team ink but never enter the CPU ownership grid |
| [#258](https://github.com/rhgrive3/actions/issues/258) | 追加受入が必要・未解消 | [INKWAVE][Slosher] 弾群が70×1＋50×7で本家4＋5弾と異なり、薙ぎ払いにも反応しない |
| [#253](https://github.com/rhgrive3/actions/issues/253) | 追加受入が必要・未解消 | [INKWAVE][壁移動] 通常の壁泳ぎでスティックを離すと高度が完全固定され、無入力の下降がない |
| [#226](https://github.com/rhgrive3/actions/issues/226) | 追加受入が必要・未解消 | [INKWAVE][Paint][要検証] アメフラシRainNum=72と公開版172回の塗り呼出の対応を校正する |
| [#198](https://github.com/rhgrive3/actions/issues/198) | 追加受入が必要・未解消 | [INKWAVE][Shooter] Splattershot uses generic cone bloom instead of the 1%-25% outer-reticle probability model |
| [#187](https://github.com/rhgrive3/actions/issues/187) | 追加受入が必要・未解消 | [INKWAVE][Mobile] Android DeviceOrientation drift is integrated as gyro aim and can keep rotating the camera |
| [#79](https://github.com/rhgrive3/actions/issues/79) | 追加受入が必要・未解消 | [INKWAVE][Shooter] Splattershot impact paint still ignores floor-wall size and impact-angle rules |
| [#71](https://github.com/rhgrive3/actions/issues/71) | 追加受入が必要・未解消 | [INKWAVE][Aim] Gamepad support has no Joy-Con / Pro Controller motion-gyro input path |
