# マニューバー6種: 11.3.0 audit / 2026-10-18

基準: `9ef63350385bffee71b3afa0a09290a92e9c862b`（取得時点の最新 main）。実装コミット: `372bce6` → `67f757c` → `7fd1af8` → `33b478d`。この worktree はコードをコミット済み。PR、main への統合、CI、統合後ブラウザ・実通信は親作業で追記する。ここでは本家との完全一致を認定しない。

## 原典と根拠の区分

- Leanny `7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponManeuver{Normal,Short,Gallon,Dual,Stepper,Long}.game__GameParameterTable.json` を当日再取得。6ファイルすべての SHA256 が保持済み catalogue と一致。SideStep、Weapon、通常/スライド後の Move・Damage・Collision・Splash 行を独立照合した。[取得記録](dualies-source.json)。別オーナーの WallDrop と MainWeaponSetting は catalogue が保持しない項目を含むため「全 JSON が同一」とは主張しない。
- 数値が明示されたもの、既存 INKWAVE の校正、意味を確定できない省略値を区別する。`MoveDist` / `MoveFrame` の距離積分、明示された `SlipMoveDistAir/Gnd` と `SlipMoveFrame` の組を接続した。
- 減速曲線は既存スプラマニューバーの INKWAVE 校正を再利用した。ガエンの `MoveStepKd_Air=.98` はフレームごとの等比減衰と解釈し、積分距離を `MoveDist=5.5` に正規化した再構築。Nintendo 実行コードの復元結果ではない。
- 最新公式変更履歴の調査は親作業の source-audit に集約。11.3.0 ケルビンのスライド後精度変更を、古い測定値で上書きしていない。旧測定由来の定数を新たな本家確定値には昇格させない。

## ブキ別の現在値と実装確認

通常 → スライド後の値。ダメージは最大直撃、角度は外側コーン。これらのデータ一致だけで実機一致とは判定しない。

| ブキ | 連射 F / 拡散° / ダメージ | 今回の修正・確認 | 残る重要事項 |
| --- | --- | --- | --- |
| スプラマニューバー | 5→4 / 2→0 / 30→30 | 専用 native owner を保持。#532/#992 回帰、固定60Hz＋30/60/120Hz描画スケジュールの Actor・弾 trace が同一 | Nintendo の省略値、実機の移動・骨格曲線との一致は未認定 |
| スパッタリー | 5→4 / 6.8→3.89 / 36→36 | 3WU/8F core と明示 .6WU/30F slip。回復停止20F→50F。通常/回復の状態分離、傘等への副作用なし | 減速曲線、滑走中の入力合成、SplashSlide.MoveLength=4 の生成規則 |
| ケルビン525 | 9→9 / 3.2→2.7 / 36→52.5 | moving 中に turret を立てない。回復後の静止射撃も turret を保持。通常 SpawnSpeed2.85、LapOver3.2 の既存分岐を維持 | MoveDist/MoveFrame/SlipMoveFrame は原典が省略。現行 core5WU/12F は保持した校正。明示 slip1.2 の時長を創作せず未接続 |
| デュアルスイーパー | 6→6 / 4→2 / 28→28 | core3.5WU/12F、回復停止20F→60F。通常/スライド後の .235/.285 collision 行、移動解除8Fを保持 | SlipMoveFrame45F はあるが距離が省略。SplashSlide.MoveLength4.5 を滑走距離と断定しない。滑りながらの自由移動の retail 混合規則 |
| クアッドホッパー | 6→5 / 7.4→2.7 / 28→28 | moving rounds を normal の精度・6F・.26半径へ修正。終了後だけ turret の2.7°・5F・.31半径。4連、5回目拒否時の無課金、45F回復を確認 | 明示ChargeFrame5Fを独立startupに接続。core時長の省略MoveFrame（現行fallback12F）、最初の射撃受付の実機境界は未確定 |
| ガエンFF | 8→4 / 2.5→2.3 / 25.5→25.5 | core5.5WU/16F、明示1.2WU/50F slip。空中 Kd .98 を接続。回復終了後の静止 turret、1回制限、通常 SpawnSpeed3.72→LapOver3.312 を保持 | 空中 Kd の正規化式、空中から接地する瞬間の係数切替・垂直 dive、機構・姿勢の実機照合 |

別キットは合計9種（スプラ2、スパッタリー2、ケルビン1、デュアル2、クアッド1、ガエン1）。5追加ベースとその7キット、合計12モデルで moving-mode admission と実際のネットワーク送受信を実行。スプラ3モデルは native owner を共有し、専用の実 Actor＋弾trace比較でも3モデルが完全に同一であることを確認した。全6ベースの描画レート試験も実行した。

## 発見した不一致・根本修正

| ID | 基準版の失敗・再現 | 修正後 | 判定 |
| --- | --- | --- | --- |
| F01 | クアッドの開始直後に `s.turret=.75`。移動中の弾が2.7°/5F/.31になる | 開始時0。物理 core 終了まで通常7.4°/6F/.26。終了時にのみ回復開始 | 確認済み selector の不一致を修正。入力全体の本家タイミングは未確定 |
| F10-a | 5追加ブキは一定速のみ。描画用でない実 Actor に残速が残り、回復中も通常移動の制動距離が加算 | 明示距離を区間積分。core/slip終了時に平均速度の残りをゼロ化し、距離の借越しを防ぐ | 実 Actor＋本番 Physics で before/after 定量確認 |
| F10-b | Dapple .6/30F、Douser1.2/50F が未使用 | 距離と時長の両方が明示された場合に独立 slip を生成。地上/空中距離を接地状態から選択 | 数値接続確認。減速曲線は再構築 |
| D01 | クアッドだけ回復時計を移動中にも減算。他4種では移動中 return により減算しない | 全5種で core 終了時に回復時計を開始 | 固定tick・全派生テスト |
| D02 | turret が移動硬直時間だけで消滅。静止して射撃し続けても通常へ戻る | movement recovery と held turret を分離。回復終了後も静止・射撃・残インク条件が満たされれば保持。移動/射撃解除で退出 | source mode と既存 native owner の状態規則に整合。実機操作感は未認定 |
| D03 | squid intent で `busy()` が `stop` を無視して false。NoSquid硬直を回避 | `stop` の生存中は bypass しない。強制 squid/special/SuperJump/死亡/サブで残存 roll/slip を取消 | 実際の installed Runner 経路で red→green |
| D04 | スライドのインク回復停止に通常射撃の20Fを使用 | Dapple50F、Squelcher60Fを SideStep から使用 | 明示原典と一致 |
| D05 | added5 の roll が native 空間分割に入らない | 同一 native slope/step/body solver を半径の半分以下の移動区間で呼ぶ。衝突で失った距離を持ち越さない | actual Actor、0.03WU厚の壁、数学的な区間上限の試験 |
| D06 | native Character の旧テストが「スライド開始時点で既に post-roll turret」と要求 | moving pose は実 roll、終了後に turret。既存の誤った assertion を2個の phase assertionに変更 | 実際の両手 trigger/muzzle/LOD/rig 6試験を保持 |
| D07 | `kind==='dualies'` 限定により追加5種を turret packet と remote epoch validator が除外 | family-aware な read-only action view。既存bit27・dodge bit・optional `rl`・event timestamp形式で送受信 | 全12モデル＋native transport、重複/逆順/前lifeを試験 |
| D08 | catalogue roll に accepted token がなく、既存 sidecar が native `runner.dodge` のみ読む | catalogue 自身の単調増加 token、source startup（Tetra5F、他追加は保持した0）、duration、recoveryを共有packetへ接続。native `dodge` は書き換えない | 同一テストが基準 main で失敗、candidateで成功 |

## 実 Actor 移動の前後比較

同じ平地、入力方向X、許可されたスライド直後に射撃/スティックを解除、96固定tick。`Actor._integrate` と `Physics` は実物。Character描画、音、塗り raster はこの計測では stub。基準版の単体テスト fixture は `_integrate` を止めるため、残速による距離超過を検出できなかった。

| ブキ | main 9ef6335 / WU | 33b478d / WU | 出典の限界 |
| --- | ---: | ---: | --- |
| スパッタリー | 9.8450 | 3.6000 | 明示core3 + slip.6。曲線は校正 |
| ケルビン525 | 13.4733 | 5.0000 | 5は保持した fallback。原典の真の合計距離とは主張しない |
| デュアルスイーパー | 7.6083 | 3.5000 | 明示coreのみ。省略された slip 距離を未実装 |
| クアッドホッパー | 7.6083 | 3.5000 | 明示core。core時長12Fはfallback |
| ガエンFF | 11.2375 | 6.7000 | 明示core5.5 + slip1.2。曲線は校正 |

## 7領域の監査範囲

1. 射撃: 6種の通常/LapOver cadence・cost・spread・damage行と runtime selector を照合。追加全キットの admission、クアッド4連、静止 turret、squid 硬直と ink recovery を実試験。省略された初弾、NoWeaponの実機境界は未確定。Tetraの明示ChargeFrame5は末尾追補で接続。
2. 弾道: 通常/LapOver の Move/Collision 選択、速度加算の既存 `applyCatalogPlayerVelocity`、native両手ソケット、固定tick発生位置を追跡。6ベースの projectile位置/時刻/ダメージ/半径traceを描画30/60/120で比較。Nintendo の空気抵抗defaultや軸の上限を再発明していない。
3. 攻撃: ケルビン36/52.5、ガエン25.5、通常とLapOverのcollision半径選択を確認。親の object-rate / LOS / 全体衝突試験は別記。Nintendo相手への距離ごとの命中率比較は未実施。
4. 塗り: 既存 `paintDualiesSlide` のCPU/GPU footprint/owner経路を保持。slipにも同じ連続strokeを使い、サブ/死亡等は終端flush。全5追加ブキの airborne無塗り、既存 native #992 直撃・通常塗りを回帰。SplashSlide.MoveLength、原典の壁/飛沫形状、Switchとの面積一致は未認定。
5. 遷移: roll / recovery / slip / held-turret を分離。squid、サブ、special、死亡、SuperJumpの取消と、max-roll拒否時にインク/塗りstrokeが変化しないことを検証。全キャンセルのNintendo入力受付フレームは未認定。
6. モーション/VFX/SE: read-only Character view と両手/native rigを維持。phase誤認を修正。音は既存65種の合成レシピ owner を使用し、原典の孤立した音声照合は不可能。姿勢/弓以外の機構/骨格の完全再現を主張しない。
7. 通信: catalogueが共有送信経路から脱落する原因を修正。全12モデルの送受信、accepted epoch、duplicate/older epoch/old life拒否、native legacyの時計とpaint戻り値の回帰。実リレー、2ブラウザ、損失・遅延の統合試験は親作業に集約。

## 検証結果

- 最初の F01 修正後、`main-weapon-catalog`、`catalog-added-family-paint`、新phase試験: **60/60**。
- phase＋実 Character/両手/muzzle＋motion: **14/14**。[ログ](dualies-motion-final.log)。最後の精密化後、motion/geometry/全6ベースFixedClock試験: **4/4**。[ログ](dualies-motion-final-determinism.log)。float誤差は最大約4e-15WU。
- `issue-532-dualies-dodge-distance`、`dualies-roll-phases-1130`、`issue-992-dualies-normal-paint`、`issue-992-dualies-impact-paint`: **24/24**。[ログ](dualies-native-regression.log)。#532/#992を新たな未修正バグとは扱わず、native owner の既存修正を保持する回帰として実行。
- catalogue送受信＋native turret＋`issue-1163-remote-dodge-clock-pr1182`: **4/4**。[ログ](dualies-network-final.log)。[基準 main の赤](dualies-network-before.log)。同一fixtureの lifecycle初期値を指定してから基準を再実行した。
- 通常最適化 production build 成功、contentHash `deed182266385d73ff107763309c8c6fb6e8af7e796dbd92c630c758828c54cc`。[ログ](dualies-build.log)。この生成物を `INKWAVE_BUILT_SITE` で直接読み、phase/physics/FixedClock/全native別キット/network **11/11**。[ログ](dualies-production.log)。これはGPU描画を伴わない本番生成物の実行試験。
- quick check成功。[ログ](dualies-quick.log)。startup budget別ログ。ブラウザGPU/実リレー/CIとmain統合後の証明は親の統合記録を参照する。

## 性能比較

[`scripts/benchmark-catalog-dualies-1130.mjs`](../../scripts/benchmark-catalog-dualies-1130.mjs) を基準と候補で同じまま実行。Node v24.19.0、5種の実 Actor/Physics、96F×10反復=4,800 actor ticks、warm-up1回後7サンプルの中央値。Character描画、弾とGPU負荷は除外。共有ホストに他検証がありwall時間は比較指標にしない。process CPU時間を併記する。

| 指標 | main 9ef6335 | 最終候補（Tetra5F追補含む） |
| --- | ---: | ---: |
| CPU中央値 / 4,800 ticks | 664.013ms | 859.053ms |
| CPU / actor tick | 138.336µs | 178.969µs |
| 差 | — | +29.37%、+40.63µs/actor tick |
| 終了時 heapUsed（GC/JIT/VMの影響あり） | 86.17MB | 93.19MB |

追加5人が同時にこのfixtureを動く場合の増分は約0.203ms/tick。空間分割による追加の正規衝突と滑走を省略して速度を稼がない。各時点の減速後の最大速度でslice数を削減し、substep内のstate再読取りを除去した（最初の候補187.37→178.15µs/actor tick）。motion形状と計算は再利用し、core/slip開始時だけstateを生成。Tetra5F追補後も再測定し、最新CPU値は178.97µs/actor tick。heap値は保持メモリやleakの測定ではなく、GPU/ブラウザGC性能の代替にもならない。[前](dualies-benchmark-before.json)・[後](dualies-benchmark-after.json)。

## 未確定 / 未完了

- Glooga/Tetra の省略移動値、Tetra以外の追加4種の省略startup値、Glooga/Squelcherの省略slip値。`UnrelaxFrameOneMuzzle`、`SplashSlide.MoveLength` が実行コードのどこに適用されるか。推測値を本家確定値として導入していない。
- 接地中/空中の係数が変わる時の厳密な積分規則、入力を合成するSquelcherの滑走、坂・段差・空中diveの本家定量比較。既存native地形solverを使うことと本家との地形一致は別。
- 本家の制御された実機動画、Nintendo内部の省略default schema、Nintendoのjoint/SE/VFXデータによる定量比較が不足。6種＋全派生を「完全再現済み」としない。

## 親が挙動比較記録に統合する要約

`9ef6335`基準で追加Dualiesのmoving/plant混同、クアッド回復開始の不統一、通常制動へ残速を渡して距離が増える経路、SideStep ink recovery未使用、NoSquid bypass、held turret消失、catalogue通信脱落を再現・修正。Leanny1130明示パラメータを参照。Dapple3+.6/Douser5.5+1.2、固定60Hz実Actor＋弾traceの描画30/60/120一致、native#532/#992保持を確認。Nintendoの省略default/移動曲線/OneMuzzle/MoveLength、実機操作感は未確定。CPU fixtureは+29.37%の負荷増であり、完全再現や性能改善とは報告しない。詳細は本レポート・source/bench/production/networkログ。

## Tetra5F startup追補

追加調査で [Inkipedia Dualies data S3](https://splatoonwiki.org/wiki/Template:Dualies_data_S3?oldid=697265)（2026-04-21 revision697265）を取得できた。`After a {{{ChargeFrame|4}}} frame startup, the roll animation lasts for {{{MoveFrame|16}}} frames` と明記され、TetraのSplatoon3 Rolling節にはChargeFrame5が指定される。これは既存native#477の「入力受理→startup4F→独立core時計」と同じ意味を裏付ける。数値5はLeanny1130の明示値を用い、古いtemplate例のspread・damage・省略defaultを新たに採用していない。[原典記録](dualies-startup-source.json)。

Tetraのみ入力受理と3%支払いを即時実行し、5固定tickは選択方向を保持して水平移動・slide paint・core時計を停止。6tick目から既存のcore距離積分を始める。startup終了後もmoving shotは通常modeを使い、core終了後に45F回復を開始する。remote event/sidecarにはstartup5Fとcore時長を別々に送り、受信側の旧固定4F proxy値も検証済みsidecar値へ接続した。他4追加ブキの省略startupを5Fや4Fと創作していない。

新回帰は変更前`startupDur=0`で失敗し、変更後は5tickの速度0・core時計0、tick6の移動、3%の即時支払いを確認。moving/planted mode、4連roll、全kit network、remote startup→roll、固定60Hz/描画30・60・120Hzとnative派生を含む更新後のsource試験は**12/12**。[ログ](dualies-startup-5f.log)。先に掲げたproduction11/11はこの追補前の33b478d生成物であり、最終追補を含むproduction・ブラウザ・実リレーは親の再ビルド結果を別途記録する。
