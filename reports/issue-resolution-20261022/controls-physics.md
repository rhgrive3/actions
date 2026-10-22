# 操作・物理 issue 10件の残件監査

対象: `rhgrive3/actions` main `26a4db4123d23162a3dbf8a12150b1b5bc6ccf64`、2026-10-22 UTC。公開版 `inkwave-public/` と本番合成patchが対象。AGENTS.mdの「実機計測が必要な差分は未確認として残す」に従う。

既存資料で確定できる新たなruntime修正は見つからなかった。10件とも実機・原典資料待ちの残受入条件を持つ。既存部分実装を今回の修正として再計上せず、全件Open維持を提案する。作成物はこの報告とJSONのみ。remote変更なし。

## 今回の検証

- 初回: Node v24.19.0、384 MiB、直列、120秒上限。11ファイル **52/52成功**、22.371秒、skip/cancel/失敗ゼロ。
- 追加: 同Node、384 MiB、直列、90秒上限。#79実射撃3件・#532地形8件・#992 native4件の計15件成功。一方、#890 hold-boundary-terrainファイルはV8 heap OOMでabort。追加群全体は15 pass＋1 file failure、50.868秒であり、無中断の全成功とは扱わない。
- 再実行: #890の同じ未変更ファイルだけを768 MiB・90秒上限で実行し **6/6成功**、11.766秒、skip/cancelゼロ。384 MiB失敗履歴は保持する。
- 異なる成功caseは計73件。ただし3実行を合算した値。pure math/source/VM本番合成・実Physics/CPU Paint fixtureの証拠であり、emit全体、ブラウザ、GPU、controller/mobile実機、本家11.3.0一致の証拠ではない。

初回11ファイル: gyro-sensitivity-endpoints、gyro-sensitivity-cadence-725、pad-sensitivity、pad-sensitivity-rate-287、issue-79-shooter-impact-paint、storm-vertical-cutoff-735、issue-890-jump-hold、storm-rain-calibration、dualies-roll-phases-1130、issue-992-dualies-normal-paint、issue-992-dualies-impact-paint（すべて `patches/splatoon3/tests/*.test.mjs`）。追加4ファイル: issue-79-shooter-live-impact-paint、issue-532-dualies-roll-terrain-native、issue-992-native-flight-paint、issue-890-hold-boundary-terrain-native。

## #79についての訂正

初期のissueコメント読解では「wall footprint未実装」と分類したが、最新repo記録と実射撃試験で訂正した。汎用 `Projectiles._impact` を直接呼ぶ試験はlive Splattershot経路を代表しない。liveはInkFlightを使い、既にsourceの壁shock半径1.56を適用する。今回の実射撃3件でも床・壁・周期一致を確認した。残るのはbreak/free高度セレクタと実機面積/形状等であり、架空の新パラメータを足さない。

## 各issueの状態とローカル更新案

### [#79](https://github.com/rhgrive3/actions/issues/79)

状態: `blocked_retail_evidence`。

既存実装・確認: 実射撃は fireShooter → InkFlight(shooter) → Physics OBB → CPU PaintSystem。床の距離幅1.93→1.71、straight角度深さ2.24→1.31、壁shock半径1.56を既存実装が適用。generic Projectiles._impact試験だけではlive経路を代表しない。

残件: break/free高度セレクタと原作の面積・形状/遮蔽・壁drop全体の対応。

必要資料: 同じ11.3.0武器・ギア・射角・距離・面を固定した実機塗り面積/分布と、break/free高度合成の原典。

実装/証拠の場所:

- [patches/splatoon3/runtime/shooter-impact-paint.mjs](../../patches/splatoon3/runtime/shooter-impact-paint.mjs)
- [patches/splatoon3/tests/issue-79-shooter-live-impact-paint.test.mjs](../../patches/splatoon3/tests/issue-79-shooter-live-impact-paint.test.mjs)
- [inkwave-public/src/game/inkFlightRuntime.js](../../inkwave-public/src/game/inkFlightRuntime.js)

既存PR: [#1202](https://github.com/rhgrive3/actions/pull/1202)、[#1738](https://github.com/rhgrive3/actions/pull/1738)。関連commit（issue/報告の引用履歴、短縮SHAはその表記を保持）: 個別commit未特定、PR/現snapshotを参照。

更新タイトル案: **[INKWAVE][Shooter][Parity] Verify native Splattershot break/free paint selector and retail footprint after sourced floor/wall integration**

本文更新案（remote未適用）:

> 2026-10-22 main 26a4db4再評価。床/壁がgeneric footprintのみという元の現在形診断は撤回。live InkFlight射撃に床距離/角度endpointと壁shock半径1.56が既に存在する。PR #1738由来のlive検証コードも現main snapshotに存在するが、PR自体はclosed/unmergedなので個別merge済みとは呼ばない。残件は11.3.0のbreak/free高度選択、実機面積/形状・遮蔽・壁dropの全体比較。ロジック成功を実機一致とは扱わず、Open維持。

最新コメント根拠: [comment](https://github.com/rhgrive3/actions/issues/79#issuecomment-6060173990)、[comment](https://github.com/rhgrive3/actions/issues/79#issuecomment-6095522090)、[comment](https://github.com/rhgrive3/actions/issues/79#issuecomment-6308673336)。

### [#287](https://github.com/rhgrive3/actions/issues/287)

状態: `blocked_retail_evidence`。

既存実装・確認: S3 UI −5…+5の21半段階、legacy移行・default resetが既存実装済み。実PlayerControllerによる周期一致検証も存在。

残件: 暫定2^(s/5)の本家段階別yaw/pitch応答。+4.5/+5は既存yaw capに達し区別不能だが本家の値未取得で再調整不可。

必要資料: 同じ11.3.0/controller/modeの−5/0/+5および中間設定における一定stick入力の時刻・yaw/pitch trace。

実装/証拠の場所:

- [patches/splatoon3/runtime/pad-sensitivity.mjs](../../patches/splatoon3/runtime/pad-sensitivity.mjs)
- [patches/splatoon3/tests/pad-sensitivity-rate-287.test.mjs](../../patches/splatoon3/tests/pad-sensitivity-rate-287.test.mjs)

既存PR: [#1202](https://github.com/rhgrive3/actions/pull/1202)、[#1730](https://github.com/rhgrive3/actions/pull/1730)。関連commit（issue/報告の引用履歴、短縮SHAはその表記を保持）: 個別commit未特定、PR/現snapshotを参照。

更新タイトル案: **[INKWAVE][Aim][Calibration] Measure S3 right-stick response for the implemented −5…+5 setting scale**

本文更新案（remote未適用）:

> −5…+5 UI・21段階・旧保存値移行・resetは修正済み。残るのは現在の暫定曲線2^(s/5)と本家11.3.0の段階別旋回速度の対応。PR #1730で実PlayerControllerの周期/段階検証が追加済み。設定0の1×を本家一致とは認定せず、実機turn traceが得られるまでOpen維持。

最新コメント根拠: [comment](https://github.com/rhgrive3/actions/issues/287#issuecomment-6080139515)、[comment](https://github.com/rhgrive3/actions/issues/287#issuecomment-6095241025)、[comment](https://github.com/rhgrive3/actions/issues/287#issuecomment-6307932711)。

### [#890](https://github.com/rhgrive3/actions/issues/890)

状態: `blocked_retail_evidence`。

既存実装・確認: normal-jump-holdがtap/holdを分岐。buffered release・同tick人型遷移・ascent lifetimeを処理。現プロトタイプholdFrames=5/releaseRate=.7。保持N=1..5が短跳び、N>=6が持続保持と一致。

残件: S3 11.3.0の保持閾値・頂点・上昇曲線。S1 clip5F/21F/15FはB保持物理の証明ではない。

必要資料: 11.3.0の1Fから持続保持まで、地面/自敵インク/武器状態を固定した時刻・足元座標traceまたは物理実装原典。

実装/証拠の場所:

- [patches/splatoon3/runtime/normal-jump-hold.mjs](../../patches/splatoon3/runtime/normal-jump-hold.mjs)
- [patches/splatoon3/tests/issue-890-hold-boundary-terrain-native.test.mjs](../../patches/splatoon3/tests/issue-890-hold-boundary-terrain-native.test.mjs)

既存PR: [#1202](https://github.com/rhgrive3/actions/pull/1202)、[#1209](https://github.com/rhgrive3/actions/pull/1209)、[#1731](https://github.com/rhgrive3/actions/pull/1731)。関連commit（issue/報告の引用履歴、短縮SHAはその表記を保持）: `088c8981`、`daa21bf0`。

更新タイトル案: **[INKWAVE][Movement][Calibration] Verify S3 normal-jump hold cutoff and apex after tap/hold state integration**

本文更新案（remote未適用）:

> B保持が無視され全軌道同一という元診断は現mainでは解消。現在はS1参考の明示的暫定値holdFrames=5/releaseRate=.7で短跳び/長跳びを分岐する。N=1..5とN>=6の境界、坂・段差・壁際・30/60/120Hzを既存検証が保持。未promotedという冒頭は履歴でありcanonical issueは#890。残件は本家11.3.0物理較正。Open維持。

最新コメント根拠: [comment](https://github.com/rhgrive3/actions/issues/890#issuecomment-6094947239)、[comment](https://github.com/rhgrive3/actions/issues/890#issuecomment-6097532021)、[comment](https://github.com/rhgrive3/actions/issues/890#issuecomment-6307932141)。

### [#735](https://github.com/rhgrive3/actions/issues/735)

状態: `blocked_retail_evidence`。

既存実装・確認: stormRainContainsに有限の下方boundが既存実装済み。内部rain ray12WUとactor基準の合成によりcloudY−14 inclusive。遠方拒否・negative control・24HP/s周期一致を検証。

残件: 本家数値の下限・遮蔽/接触形状。内部12WU/14WUを本家値へ昇格させない。

必要資料: 11.3.0でcloud/actorの基準位置を定義し、高低差・境界±epsilon・coverのeligibilityを測る動画/座標/エンジン情報。

実装/証拠の場所:

- [patches/splatoon3/runtime/storm-effects.mjs](../../patches/splatoon3/runtime/storm-effects.mjs)
- [patches/splatoon3/tests/storm-vertical-cutoff-735.test.mjs](../../patches/splatoon3/tests/storm-vertical-cutoff-735.test.mjs)

既存PR: [#1202](https://github.com/rhgrive3/actions/pull/1202)。関連commit（issue/報告の引用履歴、短縮SHAはその表記を保持）: `97ae3fec`。

更新タイトル案: **[INKWAVE][Systems][Calibration] Verify S3 Ink Storm vertical damage reach after internal lower-bound fix**

本文更新案（remote未適用）:

> 下方無制限という元の不具合は現mainのstormRainContainsで修正済み。cloudY−14 inclusiveはINKWAVEの12WU rain traceとの内部整合値であり、本家11.3.0 cutoffではない。24HP/s・上方/下方拒否・周期同値のロジック検証はある。残件は本家の数値reachとcover比較。Open維持。

最新コメント根拠: [comment](https://github.com/rhgrive3/actions/issues/735#issuecomment-6082567731)、[comment](https://github.com/rhgrive3/actions/issues/735#issuecomment-6095090598)、[comment](https://github.com/rhgrive3/actions/issues/735#issuecomment-6307931497)。

### [#1607](https://github.com/rhgrive3/actions/issues/1607)

状態: `blocked_retail_evidence`。

既存実装・確認: 失敗/近床拒否にだけ45Fを適用し、成功はhookFlight→zip→12F hookWait。既存調査はFixedClock/PlayerControllerを用いたsource/emitted試験を記録。

残件: ShotFailedIntervalFrm20と公開失敗repeat45Fの内部phase/observable clock対応。

必要資料: 本家11.3.0のmiss・近床reject・近壁successの入力/受付/animation phaseのフレームtrace。

実装/証拠の場所:

- [patches/splatoon3/runtime/all-specials.mjs](../../patches/splatoon3/runtime/all-specials.mjs)

既存PR: 特定の修正PRなし（調査資料のみ）。関連commit（issue/報告の引用履歴、短縮SHAはその表記を保持）: `5509d2fd2c0f1f0041b835341f0b24818612cd69`、`adc2f374946ed857c6bcfa7cff9e39273f30591b`。

タイトルは現状維持の提案。

本文更新案（remote未適用）:

> 現タイトルはInvestigationであり維持可。最新コメントの第三者研究はhook repeat minimum20Fとmiss repeat45Fを区別。内部20Fだけを根拠に45Fを置換しない。11.3.0同条件phase traceが得られるまでOpen維持。

最新コメント根拠: [comment](https://github.com/rhgrive3/actions/issues/1607#issuecomment-6284252590)、[comment](https://github.com/rhgrive3/actions/issues/1607#issuecomment-6284312239)、[comment](https://github.com/rhgrive3/actions/issues/1607#issuecomment-6306103863)。

### [#532](https://github.com/rhgrive3/actions/issues/532)

状態: `blocked_retail_evidence`。

既存実装・確認: Splat Dualies専用4WU/12F core＋1WU/4F glide、4F startup・7% ink・32F lock・実地形/連鎖を保持。

残件: DU→WU換算、core/glideのeasing・4F glide・空中8WU/s。core終端0.0405WU/tick→glide開始0.367WU/tick再加速は既知で、本家curveなしに改変不可。

必要資料: 空間scaleの独立anchor、11.3.0標準Dualiesのcore/glideフレーム変位・衝突・air/chain trace、省略SlipMoveFrame/MoveStepKd既定値。

実装/証拠の場所:

- [patches/splatoon3/runtime/movement-physics.mjs](../../patches/splatoon3/runtime/movement-physics.mjs)
- [patches/splatoon3/tests/issue-532-dualies-roll-terrain-native.test.mjs](../../patches/splatoon3/tests/issue-532-dualies-roll-terrain-native.test.mjs)

既存PR: [#1577](https://github.com/rhgrive3/actions/pull/1577)、[#1593](https://github.com/rhgrive3/actions/pull/1593)、[#1595](https://github.com/rhgrive3/actions/pull/1595)、[#1731](https://github.com/rhgrive3/actions/pull/1731)。関連commit（issue/報告の引用履歴、短縮SHAはその表記を保持）: `e40c60a0ceb13f9dc2c88f4697bb36ad3cd4dd9c`、`afcf6f0a2f0317e35d0f05eff688ea1438a785e6`。

タイトルは現状維持の提案。

本文更新案（remote未適用）:

> 現再評価タイトルは妥当。4+1WU構造は既に存在するので新修正として再計上しない。PR #1731がruntimeにも本番adapterを適用した地形/startup/連鎖検証を追加。残件は空間換算と本家easing/省略defaultsでありOpen維持。

最新コメント根拠: [comment](https://github.com/rhgrive3/actions/issues/532#issuecomment-6032288729)、[comment](https://github.com/rhgrive3/actions/issues/532#issuecomment-6078588949)、[comment](https://github.com/rhgrive3/actions/issues/532#issuecomment-6095351964)。

### [#992](https://github.com/rhgrive3/actions/issues/992)

状態: `blocked_retail_evidence`。

既存実装・確認: normal native InkFlight所有・独立droplet・保持PaintParam共有resolver・phase保持・wall-drop・turf creditを既存実装済み。1shot1droplet capは以前から存在。

残件: 7-pattern permutation/nearest選択、particle速度/重力/drag/寿命、break/free高さ合成、sparse/default anchorとscale。

必要資料: 11.3.0の各shot index/phaseとhead/drop時刻座標、壁/床高さ・角度系列、原典の省略default tableまたはcaptured比較。

実装/証拠の場所:

- [inkwave-public/src/game/inkFlight.js](../../inkwave-public/src/game/inkFlight.js)
- [inkwave-public/src/game/inkFlightRuntime.js](../../inkwave-public/src/game/inkFlightRuntime.js)
- [patches/splatoon3/tests/issue-992-native-flight-paint.test.mjs](../../patches/splatoon3/tests/issue-992-native-flight-paint.test.mjs)
- [reports/inkwave-dualies-paint-evidence-992-2026-10-09.md](../../reports/inkwave-dualies-paint-evidence-992-2026-10-09.md)

既存PR: [#1202](https://github.com/rhgrive3/actions/pull/1202)、[#1577](https://github.com/rhgrive3/actions/pull/1577)、[#1593](https://github.com/rhgrive3/actions/pull/1593)、[#1595](https://github.com/rhgrive3/actions/pull/1595)。関連commit（issue/報告の引用履歴、短縮SHAはその表記を保持）: `a1de170eb7891df9fa13b47fa6901f083c5b76d9`、`6e32ba70859950ae12a68af4964f7ce26f766499`。

タイトルは現状維持の提案。

本文更新案（remote未適用）:

> 現再評価タイトル・本文の残件は維持可。native実射撃とgeneric fallbackを区別し、既存capやendpointを今回の新実装に数えない。原作7-pattern/particle/height/defaultsが未確定なのでOpen維持。

最新コメント根拠: [comment](https://github.com/rhgrive3/actions/issues/992#issuecomment-6084168331)、[comment](https://github.com/rhgrive3/actions/issues/992#issuecomment-6084479870)、[comment](https://github.com/rhgrive3/actions/issues/992#issuecomment-6093680708)。

### [#956](https://github.com/rhgrive3/actions/issues/956)

状態: `blocked_missing_source_geometry`。

既存実装・確認: 現物検査済み資料では靴カタログ256種に底高/Actor足高なし。WeaponChargerNormal MuzzleLocalPosは単一武器local offsetで靴差分ではない。

残件: 靴ごとの物理高をsource-verifiedに定義し、レーザー/実弾共通originへ接続する前提資料。

必要資料: 合法に取得した対応11.3.0の靴モデル頂点/基準骨格・装備Actor足高、または独立計測した靴2種の同座標muzzle差分。

実装/証拠の場所:

- [inkwave-public/src/game/weapons.js](../../inkwave-public/src/game/weapons.js)
- [patches/splatoon3/runtime/weapons-fidelity.mjs](../../patches/splatoon3/runtime/weapons-fidelity.mjs)

既存PR: 特定の修正PRなし（調査資料のみ）。関連commit（issue/報告の引用履歴、短縮SHAはその表記を保持）: 個別commit未特定、PR/現snapshotを参照。

タイトルは現状維持の提案。

本文更新案（remote未適用）:

> 未実装だが定数不足。靴モデル/足高の一次データなしに架空offsetや常時無効の入力口だけ追加して修正済みとはしない。GearInfoShoes情報とMuzzleLocalPosだけでは較正不可。Open維持。

最新コメント根拠: [comment](https://github.com/rhgrive3/actions/issues/956#issuecomment-6079088577)、[comment](https://github.com/rhgrive3/actions/issues/956#issuecomment-6084070298)、[comment](https://github.com/rhgrive3/actions/issues/956#issuecomment-6101764294)。

### [#725](https://github.com/rhgrive3/actions/issues/725)

状態: `blocked_retail_evidence`。

既存実装・確認: GYRO_DEG360/200/120がpublic bridge端点1×/1.8×/3×を適用。低速smootherを区間平均の厳密積分へ既に修正し、30/60/120Hz・jitter周期を検証。

残件: 11.3.0実機での端点/中間設定、Joy-Con/Pro Controllerと実mobile sensorのresponse。第三者bridgeの測定版・手順は未記載。

必要資料: 11.3.0、controller/device/firmware・mode・一定角速度を固定した物理角/ゲーム角のpaired trace。

実装/証拠の場所:

- [patches/splatoon3/adapter.mjs](../../patches/splatoon3/adapter.mjs)
- [patches/splatoon3/tests/gyro-sensitivity-endpoints.test.mjs](../../patches/splatoon3/tests/gyro-sensitivity-endpoints.test.mjs)
- [patches/splatoon3/tests/gyro-sensitivity-cadence-725.test.mjs](../../patches/splatoon3/tests/gyro-sensitivity-cadence-725.test.mjs)

既存PR: [#1202](https://github.com/rhgrive3/actions/pull/1202)、[#1730](https://github.com/rhgrive3/actions/pull/1730)。関連commit（issue/報告の引用履歴、短縮SHAはその表記を保持）: `8c351574`。

更新タイトル案: **[INKWAVE][Aim][Calibration] Verify 11.3.0 gyro response after public-bridge endpoint and sensor-cadence fixes**

本文更新案（remote未適用）:

> 旧278/132/110度テーブルの現在形診断は撤回。現mainは360/200/120でpublic bridge端点1×/1.8×/3×、PR #1730で低速周期依存も修正済み。第三者資料は測定版/手順非公開で、11.3.0の実測認定には不足する。中間値・実controller/mobile比較待ちでOpen維持。

最新コメント根拠: [comment](https://github.com/rhgrive3/actions/issues/725#issuecomment-6057251787)、[comment](https://github.com/rhgrive3/actions/issues/725#issuecomment-6059710284)、[comment](https://github.com/rhgrive3/actions/issues/725#issuecomment-6095505384)。

### [#226](https://github.com/rhgrive3/actions/issues/226)

状態: `blocked_retail_evidence`。

既存実装・確認: productionとpublic-source両スコープでcandidate/ground hit/paint/cosmetic/area/timingを分離。public-source172/172/171、production固定60Hzの周期一致。即時returnとlate credit・CPU unionを別会計で検証。

残件: RainNum72が生成総数/同時管理/再利用/地面到達のどれかの意味対応。

必要資料: 11.3.0で粒子生成→再利用→到達→paint書込を対応付けるtrace/engine source/controlled capture。

実装/証拠の場所:

- [patches/splatoon3/tests/storm-rain-calibration-harness.mjs](../../patches/splatoon3/tests/storm-rain-calibration-harness.mjs)
- [patches/splatoon3/tests/storm-rain-calibration.test.mjs](../../patches/splatoon3/tests/storm-rain-calibration.test.mjs)
- [scripts/measure-inkwave-storm-rain.mjs](../../scripts/measure-inkwave-storm-rain.mjs)

既存PR: [#1202](https://github.com/rhgrive3/actions/pull/1202)、[#1678](https://github.com/rhgrive3/actions/pull/1678)。関連commit（issue/報告の引用履歴、短縮SHAはその表記を保持）: `f534d6b2`、`22e20925`、`d47a3574`。

タイトルは現状維持の提案。

本文更新案（remote未適用）:

> 訂正済みの現タイトルは維持可。production178候補とpublic-source172/172/171の別スコープ会計は既に用意済み。PR #1678で即時/late credit/独立CPU unionを分離した。72へ直接制限せず、本家ライフサイクル未確定としてOpen維持。

最新コメント根拠: [comment](https://github.com/rhgrive3/actions/issues/226#issuecomment-6083445789)、[comment](https://github.com/rhgrive3/actions/issues/226#issuecomment-6083735577)、[comment](https://github.com/rhgrive3/actions/issues/226#issuecomment-6094997354)。

## PRの読み戻し

GitHub `fetch_pr` で取得した状態。ローカルcloneはshallowなので、全祖先の独立検証とは区別する。current snapshotに実装/試験が存在することは直接確認した。

| PR | 取得状態 | head | merge commit |
|---|---|---|---|
| [#1730](https://github.com/rhgrive3/actions/pull/1730) | merged | `0f22b94f1d7f7e70b4cd82d26ba67a448693108c` | `5400c1f7770d6fe1f2106628ec808facd9a99e34` |
| [#1731](https://github.com/rhgrive3/actions/pull/1731) | merged | `4a0310d7f1df19450ac38ce20d34e3715ba2ca64` | `ecfb851ad7d9c78c2e7b1937dda0a723946dc215` |
| [#1738](https://github.com/rhgrive3/actions/pull/1738) | closed / unmerged | `fc96accabc8c11e78e1dca4595adf1c4ab4e5614` | なし |
| [#1678](https://github.com/rhgrive3/actions/pull/1678) | merged | `c1badf66a62ca5443ea963669f9b5b4b833f8ee2` | `c9695f3558647292a2b97ad0f52560430f521bdd` |
| [#1202](https://github.com/rhgrive3/actions/pull/1202) | merged | `49f37c2016804e7e388ddf463c0c06015acb2b41` | `73a3ee02c6f994893b2e5fe27cda35202ba72b65` |
| [#1209](https://github.com/rhgrive3/actions/pull/1209) | merged | `5e48c2626160c371737e62eace97a2d010f1b94d` | `a38efd5ff060d2953d89b0976808c30b9b72d171` |
| [#1577](https://github.com/rhgrive3/actions/pull/1577) | merged | `07e44c3de58109f2a994e48d1b5c71461d962599` | `3057e33bf0f4258af91cb7f972e3a4da38cc475d` |
| [#1593](https://github.com/rhgrive3/actions/pull/1593) | merged | `01bf817ea23390a659f2dfda35795cfaea2eb0fe` | `1f459722a5417fbdef0396ed2520d7ea145ea465` |
| [#1595](https://github.com/rhgrive3/actions/pull/1595) | merged | `97d633eab9279e8a148c07d4c9cf461981ff638a` | `77402adf14da75cc11c34e5e299163f4a5fafb9e` |

#1738はclosed/unmergedであり、そこ由来の試験が現snapshotに存在しても同PRが単独mergeされたとは主張しない。#1678はintegration branchへのmergeであり、単独main-target mergeとは扱わない。

