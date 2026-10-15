# INKWAVE 弾形状再構築 — 2026-10-11

本変更は、本番ビルドへ接続した描画専用の再構築である。本家11.3.0の原典数値と、原典不明の形状式を明確に分ける。Nintendo実機との完全一致、Android実機性能は未検証であり、Ready for Review／mainマージの条件を満たしたとは扱わない。

## 統合基点と変更範囲

- 着手時main `4ccbab16d94650bffaffe254927b91099ce37739`、現在main `f2c870859d637fccba88031c3786ecec4d95248d` を確認。
- 関連PR #1182／#1188／#1208／#1211／#1219を確認。重複変更を避け、統合PR #1182のhead `3a864f81ecf8ea3219f8209d0dbd803ca9e8b866` を基点とした。作業中に#1182がマージされ、現在mainと当初基点のtreeが完全一致することをgitで照合。PR #1220のbaseをmainへ変更した。#1220はDraft・未マージであり、今回の描画はmainへ未反映。
- 凍結された `inkwave-public/` は変更せず、最終build adapterを既存6段階の後へ追加した。生成された `src/game/weapons.js`、`src/game/inkFlightRuntime.js`、`src/main.js` とcatalog runtimeが実際の接続箇所。
- シューター／マニューバー／スピナーの共有軌跡、ローラー横・縦振り、バケツ前4＋後5を対象。派生スロッシャーは泡、渦、爆発塊、三方向、二連の表示方式を分ける。既存special、未対応family、小飛沫、着弾FXは既存所有者を保持する。

## 確認できた原典

固定コミット：[`Leanny/splat3@7280ff9`](https://github.com/Leanny/splat3/tree/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon)。65件の公開JSONを取得し、全65件のSHA-256、52ユニット、116のJSON pointerを既存カタログと照合した。詳細と全URLは [武器ソース監査](inkwave-projectile-weapon-source-audit-2026-10-11.md) と `patches/splatoon3/reference/projectile-visual-profiles.json` に記録。

| 原典ファイル | 確認できた値 | 確認できないもの |
| --- | --- | --- |
| [WeaponShooterNormal.game__GameParameterTable.json](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponShooterNormal.game__GameParameterTable.json) | 公開の弾パラメータ、通常ShooterにMaxLengthFrameの個別指定がないこと | 内部既定値、実メッシュ、銃口接続時間 |
| [WeaponRollerNormal.game__GameParameterTable.json](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponRollerNormal.game__GameParameterTable.json) | Wide主群0.3→0.3、Vertical主群0.36→0.36、ユニットごとのDrawSizeParam | 液膜の全幅・厚み・分離式 |
| [WeaponSlosherStrong.game__GameParameterTable.json](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSlosherStrong.game__GameParameterTable.json) | 4＋5、前0.5625→1.0／offset −0.05／−0.03、後0.6→0.6／offset −0.1／−0.1、Tail 0.5／4／5F | これらが形成する実メッシュ・実Emitter |

[`HoianViewer@89f23684`](https://github.com/nvnprogram/HoianViewer/tree/89f23684b9dede5da8207e5f9f1980150bec774a) のEsetb／VfxFile／Emitter／HistoryStripes／EffectFile／EffectPlaybackを解析。`.esetb.byml.zs` のzstd→BYML→PtclBin/Esets、VFXB v46、G3PR/PRMA primitive、EP02の履歴とHermite補間、描画とemission primitive IDの違いを確認した。EP01/EP03未描画などの制限を含む [VFXソース監査](inkwave-projectile-vfx-source-audit-2026-10-11.md) を参照。

対象武器のEmitterSet／Emitter／子Emitter／mesh／texture／shaderの実対応は、合法的にアクセスできるRomFS/VFX素材がなく未特定。添付RE v3 ZIPとDriveの公開ソース集も照合したが、Driveの復元manifestはゲームRomFSを含まないと明記する。S2の関数名は世代差のある参考であり、更新式の証拠ではない。Nintendoゲーム素材はこの変更・配布ZIPに同梱しない。

## 描画方式

実60Hzの物理更新点を、32標本のFloat64履歴へ記録する。粗いcatch-up更新も内部の各物理tickを観測する。描画FPS側だけが履歴を補間し、当たり判定、位置、速度、寿命、ダメージ、塗り、通信payloadを編集しない。

13断面×12頂点のCPUメッシュを単一の不透明batchへ書き込み、位置／法線／色とGPU更新範囲を再利用する。CPU頂点を用いるため、beauty／影／深度／AOの形状が一致する。Shooterは先端と末端を閉じた履歴ロッドと残留尾。Roller横振りは薄い主弾と、同一volley・同じ出生時計の隣接主弾が実際に通った近接軌跡の間の閉じた液膜を描く。先端が離れた場合も共有履歴の近接区間を調べ、離れた区間を飛び越えて接続しない。横方向は実際の弾間ベクトル、厚み方向は実際の平均接線との外積で決める。縦振りは細長い独立形状。Bucketは前弾の厚い頭と後弾の細い帯を分け、9発と既存ユニット別半径を保持する。

次は独自近似であり、本家仕様として確定しない：断面形状、薄膜厚み、ローブ、接続距離、材質、Hermite制限式、通常Shooter／Dualiesの暫定2F、Rollerの履歴窓5F／長さ上限4 source units、既存width校正Shooter0.7／Bucket0.5。Rollerの5F／4はTailパラメータが存在しない場合のINKWAVE描画用の仮値であり、Bucketに明示された同値がRollerの内部既定値を証明することはない。Splatlingの明示3Fはその原典の武器に限って使用する。根拠のない「0.1秒後に0.6mへ縮む」アニメーションは追加していない。

## 検証と未実施比較

- 最終adapterを使う実Projectiles/Physics/NetMatchの新規試験19/19成功（色転送前の複数更新・slot並び替えも検証）：原典値、形状別buffer、30/60/120Hz、4＋5、ローカル／受信、Splatling残留尾、13主弾Rollerのvolley分離、粗い30Hz更新、停止した受信弾の液膜、遅延出生のGround→Air速度、履歴長と描画補間が異なる場合の原典半径に対応した端部の丸みを検証。追加の2試験は、先端が離れた後の共有近接軌跡を覆う液膜、出生時計・volley・非近接履歴の誤接続拒否、閉じた端部・有限な単位法線・固定buffer・本番Rollerの30/60/120Hz geometry一致を検証する。
- 同じseedをVM起動前から与え、旧6段階／新最終adapterを対照比較。追加THREE資源のUUIDが12回の乱数を消費する回帰を修正し、起動時乱数回数と発射後の状態／通信が一致することを確認。
- 独立レビューで、Roller接続0件、粗い更新の出生時刻、衝突直後の履歴が壁を貫く問題、壁垂れ時計、描画多重更新、撮影時のsync漏れ、停止したperformance測定を発見し修正した。GPU転送前の複数色更新でdirty範囲が失われる問題と、履歴の厳密tick/EPS境界で接線が変わる最適化回帰も修正した。最新の [独立レビュー](inkwave-projectile-independent-review-2026-10-11.md) を参照。
- 本番の再ビルドは成功。packing testはコミット後の正確なblob照合を含め8/8成功。新ファイルを未追跡のまま検査した初回の失敗は保存し、追跡登録／コミット後に再実行した。容量上限は変更していない。
- 最初の無制限並列全suiteは8GiB環境でOOMを起こし中断。4workerで再実行し、4,449件中4,433成功／失敗0／条件付き16skip、787.6秒。品質／信頼性の別コマンドは1,815件中1,798成功／失敗0／条件付き17skip。
- CI Validate run 38116618406のpatch suiteは4,450件中4,434成功／失敗0／16skip。native flight 10/10、deterministic network 448/448、その後のattack reconstructionも成功。ブラウザ各shardも成功したが、次のbranch更新でquality試験中にrunがcancelledになったため、workflow全体の合格とは扱わない。
- 通信／loading／移動／試し撃ちの別コマンドは550件中542成功／3失敗／5skip。3件は既存worker fixtureの未準備パスで停止していた。パス準備後は2件成功、1件が明示production 68KiBのplanを渡さず旧64KiB fallbackを検査する不一致で失敗。明示68KiB契約を渡して既存68KiB負例を維持し、旧64KiB契約の別試験と合わせ5/5成功。実容量上限・負例の期待値は緩めない。

ローカルChromiumはsocket制限、headless_shellはWebGL command-buffer／udev失敗でSIGSEGVとなり、ローカルの成功スクリーンショットは0件。GitHub CI run 38116618475では本番起動の変更前45枚・変更後45枚をGLエラー0で取得した。45組すべてのseed、camera、phase、弾位置・速度・age・ユニットを照合し、差分0。実画面で先端の丸みまで長い履歴に引き伸ばされる尖りを確認し、端部リングを同じ履歴端点に固定して描画半径に応じた丸みへ修正した。5方式の独立CPUプローブで端点誤差0、端部の軸長が半径と一致。修正後画像の承認は次回CI撮影を待つ。

同runの両buildとも壁着弾検出で失敗したため、床着弾・性能測定に未到達。既存Shooterのwall-drop移行は通常impact hookを通らず弾を残し、塗りもfaceオプションなしで行われるため、実際に選択したstage Hitとwall-drop状態遷移の観測へ撮影器を修正する。凍結撮影時の影更新とrenderer統計resetも明示する。GitHub CIへ同じTidewaterの本番起動、F0/F5/F10/F15/F36、正面／横／肩越し、床／壁、連射、desktop／mobile emulationの変更前・後撮影を追加した。CIの完了結果は別の最終receiptに記録する。

本家映像は任天堂の60fps販促動画を取得・フレーム確認したが、版・色・角度・FOV・距離を統制できない。11.3.0との対応条件比較、IoU／輪郭誤差／透明度／寿命の実測は**未実施**。映像を内部仕様や完全一致の証拠として扱わない。

## 性能の範囲

新規batchは最大700形状／109,200頂点／201,600三角形、beauty draw最大1件追加。旧小飛沫batchの上限は別に保持する。CPU typed geometry 6,350,400bytes、GPU geometry同量、履歴2,508,800bytes、補助typed buffers41,136bytes（色cache16,800bytes、再利用する液膜座標系936bytesを含む）、共有module断面表3,512bytesを確保する。JS資源・ドライバbookkeepingはこの数値に含まない。700形状超過時の表示抑制は旧上限と同様に存在する。

初期CPU実装のNode VM計測では、20／100／700体で旧0.149／1.047／0.990msに対し新2.266／11.213／79.564msとなった。これはWebGL/FPSではなくbuffer生成の計測だが、大量弾で重大な負荷差があるため性能修正を実施し、直接Node／VM／実ブラウザを区別して再計測する。この初回値を成功扱いしない。旧700-body測定は上限によって139主弾＋556装飾飛沫のみを描いており、新700主弾とは対象数が異なる。端部修正後の凍結snapshot（SHA-256 40aeb6e3a3b7ac51557ae106d57301e1f4098de627f84689ee153f8c54ceef1f）では700主弾のVM 2.094ms、host 1.313〜1.326ms。同じ主弾数に近い旧head-only695主弾は1.878ms、新695主弾VMは2.232msでCPU単体の差が残る。realmを跨ぐ数値を改善率として扱わない。端部修正前の独立した500体／10方式比較では、最適化前後のFloat32位置・法線が一致した。端部修正は意図的な形状変更であり、この一致の対象外。これらはCPU単体の測定で、実ブラウザ・実GPU・FPSの代用ではない。

負荷差、FPS、GPU時間、GC頻度、実Androidはまだ合格を証明していない。静的な「1batch／固定buffer」は実端末の性能測定の代わりではない。CIのSwiftShader／mobile emulationも実Android GPUと区別する。

## 変更ファイル

`patches/splatoon3/projectile-visual-adapter.mjs`、`runtime/projectile-visuals.mjs`、`runtime/projectile-visual-source-data.mjs`、`runtime/main-weapon-catalog.mjs` のread-only observer、`runtime/weapons-fidelity.mjs` の近似表示注記、2件のreference JSON、新規native test、3件の監査report、本report、behavior reportの追補、共通build composition／build-only list／patch checker、実ゲーム撮影script、専用GitHub workflow。

コミットSHA、PR URL、CI結果、最終画像、全試験件数、マージ状態は最終の成果receiptへ追記する。完全な忠実度／端末負荷が未検証ならDraftのまま保持し、mainへ未完成変更をマージしない。

## 実画面レビュー後の再検証

`8ff22f0` のCI run 38118978863でも変更前45枚・変更後45枚を取得し、全画像・cropのSHA-256、全GLエラー0、影更新の消費を照合した。端部の尖り修正はShooter／Bucketの実画面で確認できた。Roller横振りは平たい独立帯と少数の接続に見えるという独立レビューの指摘が残り、先端同士だけの接続から共有近接履歴の液膜へ修正した。この液膜の厚み・距離上限・閉じた断面はINKWAVE独自近似であり、Nintendoのメッシュや式を特定したものではない。

同runの完全な比較条件は35/45組が一致し、最初のShooterのみseedがxorshiftの1回目／2回目にずれていた。位置・速度・ageは一致したが、描画半径もseedで変わるため45組完全一致とは扱わない。撮影準備と発射の別evaluate間に乱数を消費する可能性を排し、同じ同期処理の中でseedを設定して本番発射を呼ぶ。呼び出し元のstack、設定時／発射前／後の状態と回数を別診断として残し、実際の弾のseedや位置を書き換えない。HUDが原因という仮説は呼び出し記録で未確定であり、断定しない。

壁検証は両buildで失敗し、床と性能に未到達だった。本番Actor＋Character＋Tidewaterを使う独立プローブで、凍結された初回Squid Spawnの所有状態が残ると64Fの待ち中に壁上へ移動し、壁の向こうから撃つことを再現した。native Actor.spawnAt／reset、入力中立化、床・照準・root復元を用いると通常Actor.update経由で3F後に発射し、飛翔2Fでface34／block7へ衝突してwall-dropを開始する。Hit＋normal×0.025との差は1.42e−15。検証器の共通起動にもnative resetを適用し、性能contextへ着弾計測wrapperを入れず、通常のlive loopで測る。これらの最終ブラウザ実行・新液膜の画面承認・性能差は次のCI receiptで確認する。

`8ff22f0` の非visual CIは10 Validate jobs成功、診断1件skip。別workflowを含む重複footerを除いた36 TAP suitesは6,807件中6,777成功／30skip／失敗0。これは旧先端接続のheadに対する成功であり、共有履歴液膜を含む次headのCI成功を先取りしない。

## 共有履歴液膜の実ブラウザ確認（9b5481b3）

CI run 38121431263／head `9b5481b3f8c11255e5539f583f17c551da478db3` は変更前48枚・変更後48枚を取得した。artifact 11696210592 のZIP SHA-256は `f4309f147b18cf7d4fa04e16b3e763261344fb23e43aac9d1e046085fd83f7e1`。174件の画像・cropの全SHAがreceiptと一致し、48組すべての物理的カメラ条件、全native弾状態、6シナリオの発射後乱数seed／回数／状態が一致した。両buildのGLエラー0、影更新48/48消費を確認。

横振りはF0で6接続／19形状、F5で10接続／23形状、F10で6接続／19形状、F15で4接続／14形状。同じ実飛翔履歴間を覆うwebbingが正面画像で見え、旧先端間だけの疎な接続という欠落は解消した。滑らかで光沢の強い帯・リボン状の輪郭は依然INKWAVE独自表現であり、本家液体形状の承認とは区別する。F10とF36は肩越しのみ。F36では全主弾が既に消滅しており、正面／真横の落下輪郭比較は未実施。元の本番パッチにもShooterのロッドとSlosherの尾が存在し、F5画像の差が小さい場合がある。今回の変更を「以前は尾が一切なかった」とは説明しない。

通常Actor.updateで発射したShooterが2Fでnative壁face34／block7へ接触し、Hit＋normal×0.025でwall-dropへ移行、8F後のF10を撮影した。Strong Slosherは9発が出生し、floor impact25F、撮影33F。CPU paint faceとnative Hit、retirement、塗りcoverageなどの権威状態は両buildで一致した。FXのdrops／puffs／rings／checksの表示pool統計には差があり、原因は未確定。独立レビューでこれらは物理状態ではなく装飾描画の診断として保存すべきと確認した。現行compositionはonDropletLand／onSpeckからの塗りを無効化しており、pool統計を塗りや衝突の一致判定へ混在させない。原JSONと差分を残し、Hit／弾／paint／retirementの比較基準は維持する。

同runの最終結論は両buildとも**失敗**。desktopの6秒計測はnative frame1、render1、fire0、非空弾更新0、rAF間隔0で、有効な連射performanceを測っていなかったため厳格なgateが拒否した。GPUコンパイルが原因とは断定できない。正常なlive loopで実発射・非空更新・複数render／rAFが成立してから計測を開始するwarmupと、発射／更新回数・draw call／三角形の分布を保存する修正を進める。最初のrenderはFixedClockの物理tick前に起こり得るため、最初のframeだけのintent値は診断として残し、測定開始の必須条件にしない。次headでの実行結果は未取得。

新液膜runtime `46df9b63…` のNode CPU測定では700主弾のVM中央値2.181ms／p95 2.573ms、host中央値1.271〜1.303ms。実fireFlickで13／130／312発を生成し5tick進めた別probeは、旧先端接続の中央値0.197／1.909／4.819msに対し、新液膜0.201／1.990／4.989ms。10／99／234履歴接続、単一batch、権威弾状態と乱数不変、容量内を確認した。これはNode CPUのみであり、FPS／GPU／Android性能の証明ではない。

同headのValidate run 38121431208は10 jobs成功、render-diagnosticのみ条件付きskipで完了した。次のwarmup修正は独立レビューで機能上のP1/P2なし、`node --check`と`git diff --check`成功。60秒の有界warmupにより実native loopの発射／描画成立を待ち、warmupのtiming配列・GPU queryを6秒の本測定へ混在させない。最初のframeの入力は診断として保存し、現在のheld input／intentを admission 条件とする。修正後CIの成功、停止の根本原因、性能差はまだ証明していない。

## 最新mainのキット統合

仕上げ時にmainが `d675364691c806af16c001d9cb745da5fdf559c2`（PR #1221の65 canonical kits、tree `57de973bbc84554001064ce23c77fffc2682dc6c`）へ進んだため、その履歴を通常mergeで取り込んだ。`main-weapon-catalog.mjs` の既存read-only弾観測は自動mergeで保持され、今回の描画runtime SHA `46df9b63…` とwarmup harness SHA `bbdf119e…` は不変。次のvisual workflowの対照をこの最新mainへ固定し、同じkit基盤で両buildを再撮影する。初期main／PR1182の基点と一致した旧tree、head9b5481の48組の画像・CIは、キット統合前の履歴証拠として保持する。新mainと旧撮影baselineのtreeが一致すると宣言しない。

取り込み後の実native描画19件＋canonical kit11件は30/30成功、skip／fail0。本番build content hashは `f44a29feff9f852c2013fc22dd96dd386a6a07273798aa2541d92d363ed7f342` となった。生成buildのpackagingは正確なcommitted input blob照合を含め8/8成功。描画source不変でもキット統合により本番build全体のhashは変わるため、旧 `f5da66ee…` の画面をこの新buildの撮影結果とは扱わない。最新headの全CI・性能は次のreceiptで記録する。

## 引き継ぎ後の仕上げと性能計測の完了条件

チェックポイント `cb31036aa92e8b3d541dbf56f4c468562d7b7af1` のValidate run `38124281831` は、10 jobs成功・診断1 job skipで完了した。visual run `38124281897` は変更前・変更後ともwarmup失敗で終了したが、最新main `d6753646…` と本番content hash `f44a29fe…` の48組の画面を取得している。再開時にartifactを取得し、48組のカメラ・native弾状態・6シナリオの発射後乱数を再照合して一致、174原画像/cropのSHA-256一致、両側GLエラー0を確認した。旧キット統合前の画像を新buildと呼び替えたものではない。性能未測定の失敗runを完了扱いにはしない。

再開後の低画質Chromium/SwiftShader診断では、従来の携帯viewport `390×844` が本番のportrait guardを作動させ、offlineの物理更新・発射を停止することを再現した。携帯計測を対応する横画面 `844×390` へ変更し、ガードを維持した。また、本番Turfのローカルプレイヤーとcontroller、`G.mode`、Matchの同一性まで起動条件に含め、起動失敗時の観測状態を保存する。設定の既定difficultyはnormalであり、従来の「easy」という撮影metadataをnormalへ訂正した。

従来のhost側6秒待機は遅いsoftware rendererでは1〜5フレームしか測れず、ウォームアップ終了後のキュー待ちも計測終了へ混入していた。新しい計測は実ゲームのframe終了で境界を確定し、**実時間6秒以上かつnative frame/render/rAF各12標本以上**まで継続する。120秒で不成立なら失敗し、実測時間・60Hzゲーム時計の進行量・失敗時の生配列を保存する。手動の物理step、Timerの置換、描画省略、インク補給、発射頻度の変更は行わない。高負荷下の`simulatedSeconds`は実時間と異なるので、原receiptの両方を参照する。

性能行には発射・非空物理更新・**実描画に渡された非空の弾geometry**が必要である。新backendの`syncVisuals`のCPU時間、描画body/vertex分布も記録し、`Projectiles.update`の時間だけで描画mesh生成費用を代表させない。GPU timerが未公開またはdisjointなら有効なGPU時間として集計しない。FPS/CPU/GPU/heap/GC/draw/triangleの実数は、端末・画質・viewport・実時間・ゲーム時間と一緒に後続CI artifactへ保存する。

`scripts/compare-inkwave-projectile-captures.py --require-complete`をCIへ組み込み、両run成功、48組の物理一致、6発射の乱数証明、desktop/携帯横画面の有効な連射行、全原PNG/crop hashを要求する。14種類のカメラ・乱数・接触・retirement・塗り等の比較負例/正例と、失敗/空/1-frame/発射0/描画0/縦画面/画像破損等のadmission試験を追加した。スクリーンショットだけ成功した過去runは、この完了gateでは明示的に拒否される。

描画runtimeはSHA-256 `46df9b632c65dbaef57d92e4803c06c9a867362b41ae9d7bd773915969329155`のままで、本番描画・ゲームロジックの変更は加えていない。完了gateの成功はINKWAVEの実装・計測の成立を示す。NintendoのEmitter/mesh/shader同一性、統制Splatoon 3 11.3.0比較、Android実GPUの検証は引き続き別の未確認項目であり、CI成功からそれらの一致や無悪化を宣言しない。

## 2026-10-13 latest-main re-composition (pending CI)

Candidate baseline is official main `f63c0af9c2ee991810ea792fe6976a44ed17610e` after #1263 sub/special and #1276 Mini/Nautilus adoption. Retain every current-main byte outside four scoped build/runtime files: `scripts/inkwave-source-composition.mjs`, `scripts/lib/inkwave-build-only-modules.mjs`, `scripts/check-inkwave-patches.mjs`, and `patches/splatoon3/runtime/main-weapon-catalog.mjs`. The additional projectile visual observer runs **after** all existing source transformers; catalog physics records actual 60Hz positions without changing shot state, collision, damage, ownership or network. The 17 new source/test/provenance files are copied from the reviewed VFX PR by Git blob SHA. The dedicated comparison now uses the immutable f63 baseline, not the older d675 source. Controlled current-main vs candidate full browser visual/performance checks and exact-head CI are **not yet accepted**; the authored mesh and assumed Nintendo topology remain approximations, not extracted 11.3.0 assets.


## 2026-10-15 current-main ownership and comparison correction

Merged immutable main `01aa5cc61c842a8616ab38ff5fb541b6becf1395`. The candidate now yields to main's adopted S3 silhouette owner for Shooter/Brella/Stringer/Splatana and classified derivatives, and to installed horizontal-Roller volume packs. The history batch retains its remaining families, including vertical Roller, without allocating histories or detached tails for S3-owned rounds. Main's shape runtime and its tests remain unchanged. The combined source ownership/S3 contracts pass 26/26; actual emitted ownership/S3/packaging pass 36/36, without skips, at content hash `5dd37d9b1c95993122e167306d7541d5a8045b29333e0aad37e758e2ba368456`.

The volume browser checker accepts vertical Roller's actual uploaded history geometry with positive triangle/draw-range checks and no simultaneous legacy volume; native volume owners still require their original positive volume assertions. No firing, collider, paint, resource or packet values are changed. Workflow/intro contracts pass 22/22 and capture comparator contracts pass 3/3.

The old exact-head paired artifact genuinely failed: every screenshot had unequal drawing buffers (1280×720 versus1120×630), and Slosher births differed against its obsolete f63 baseline. The dedicated before build is now pinned to the same main01aa snapshot; after ordinary startup/freeze, both screenshot contexts reset the existing dynamic scale to1. Live performance windows resume ordinary dynamic resolution. No mismatch fields or comparator thresholds are waived. A fresh real range probe reaches the ordinary playing state; an earlier loaded-host volume run timed out before readiness. Final all-case volume, paired browser/SW-warm startup CI and hardware/retail visual qualification remain pending. Historical acceptance holds above remain valid.


### Concurrent recipe fix retained

During publication another owner advanced the same branch to `e37795ce9fae7503a4a391de32b2dcca16d0e2e6`. It was fetched and merged normally. Its registered native VTF recipe ownership and camera terminal-pass regression are retained alongside adopted S3-shape priority. A stale horizontal-only guard was removed from the runtime wrapper, so ready vertical Roller and other registered recipes also prevent duplicate history allocation. The late-load/missing-pack test now exercises vertical ownership through the actual wrapper. This supersedes the earlier paragraph describing vertical Roller as necessarily history-owned. Rebuilt emitted ownership/S3/packaging contracts pass37/37 without skips; all previous build receipts remain historical. Two local software-host volume readiness attempts timed out, while the standalone real range probe reached playing; full current-head volume/startup/paired CI remains required.
