# INKWAVE 全Issue・PR・CI調査と修正 — 2026-10-28

対象: `rhgrive3/actions`。開始main: `031426fcb9373d91e74e933e1507e9af395aa1c9`。開始時点Open Issue 29件、Open PR #1906/#1907/#1908、更新日2026-10-26以降のPR #1882〜#1908（27件）を取得。#401は取得後の修正・操作対象から除外した。現時点のmainマージ許可は確認されていないため、PRでレビュー可能な成果を反映する。PR固有の過去の許可やマージ済みという状態を、今回のmainマージ許可へ読み替えない。

## 実行構成と難易度

変更規模・原因特定・依存関係・アルゴリズム・回帰リスクを評価し、番号順で分配しなかった。下記は実際のspawn指定値。作業は個別worktreeで行い、共通source composition・workflow・最終比較記録は統合担当が管理する。

| 順位 | 担当 | 実モデル/Thinking | 担当と依存 |
| --- | --- | --- | --- |
| 1 | Agent1 | gpt-6.1-sol / xhigh | #1665/#1666/#1767、通信権限・receipt順序。wireを維持 |
| 2 | Agent2 | gpt-6.1-sol / xhigh | #1906/#1908合成、DAG・gate・retarget、#1907最適化との統合 |
| 3 | Agent3 | gpt-6.1-sol / xhigh | 武器/物理12Issue、Wiper自然終了、Agent1変更の独立レビュー |
| 4 | Agent4 | gpt-6.1-terra / xhigh | 性能6Issue、prebuilt取消/整合性、census、native所有権 |
| 5 | Agent5 | gpt-6.1-terra / xhigh | 音声/モーション6Issue、historical/counterfactual試験、27PRレビュー |
| 6 | Agent6 | gpt-6.1-terra / xhigh | 入力2Issue、responsive lane終了、全PRのページング済CI履歴 |

早期完了後は独立作業を継続した。CI/最適化統合・権限レビューはSol、ブラウザ環境・レビュー照合・履歴分割取得はTerraへ再割当した。同じファイルを並行して上書きしない。

## 再現した原因と変更

| 原因 | 修正/再利用 | 原コミット |
| --- | --- | --- |
| retarget quaternion最適化と後段adapterのanchor不一致が多くのbuildを停止 | #1906の合成互換修正を再利用。完全な3部品のみ再利用し、部分/重複状態を拒否。二重初期化も修正 | `dd64fefb`, `666ccea7` |
| admission・8shard・最終fan-in契約が現workflowに不一致 | #1906/#1908を履歴ごと合成し、mutation controlsでfail-closedを検証 | `dd64fefb` |
| prebuilt digest中の取消を取りこぼす/不正targetでもfetch開始 | fetch前・digest後のabortとsizeを検証。metadataにも回帰 | `add31d9f` |
| scene-censusの負のfixtureがgate到達前にTypeError | populated categoryで正常admission→census drift拒否を検証 | `add31d9f` |
| Normal/Lite chargedのlazy wetSlashVが早期returnで残留 | 全6actionの自然終了、quiet tail、30/60/120Hz、同一meshを検証してcount/visibilityを解放 | `8d5dc8d0` |
| 無効PvP/Boss claimが証拠を消費し、後続の正当命中を拒否 | final-nativeの読み取り専用life/replay/nonce policyを先に適用。FIFOでも再確認 | `5805805e` |
| responsiveの片lane失敗で他lane完了を待たない | 双方の終了後に失敗を伝播。14case/2workerの検証を維持 | `3071eba1` |
| touch gyro説明だけが既存の合成後gainと不一致 | 既存の翻訳済profile説明を両UIで共有 | `1aff4fd5` |
| historical sourceと後段adapterが比較fixtureで欠落 | pinned hash・正確な逆変換・後段compositionを維持して修正 | `8e36f4f1` |

テスト削除・CI無効化・無条件skipは行わない。#1906由来のsandbox routeファイル修正は完全に重複した同一moduleの2個目だけを除去し、全assertionを残す。古い失敗履歴は削除しない。

## Issue全件の現在地

下表は閉じるための理由ではなく、実装確認と未達条件の記録。原典値を推測で確定せず、実機計測が必要な項目をロジック試験から認定しない。

| Issue | 担当 | 現行確認と残件 |
| --- | --- | --- |
| [#1823](https://github.com/rhgrive3/actions/issues/1823) | Agent5 | 持続チャージ音のS3原音・SLINKイベント・上昇曲線が未取得。開始クリックの既存修正は別機能。原音・権利・実音比較なしに合成音を本家相当として追加しない。 |
| [#1814](https://github.com/rhgrive3/actions/issues/1814) | Agent3 | 10項目の既存修正を再利用。65武器すべての原典動作・発射位置・地形・実機比較は未完了。 |
| [#1813](https://github.com/rhgrive3/actions/issues/1813) | Agent3 | UnitDamageRateの既存権限処理と実弾テスト3件を確認。Nintendoのzero/sentinel意味と孤立した副弾の実機ダメージ検証が不足。 |
| [#1789](https://github.com/rhgrive3/actions/issues/1789) | Agent3 | 反射の既存修正を維持。速度制限の法線/総速度、疎な既定値、坂判定・係数順序は原典トレースが必要。 |
| [#1767](https://github.com/rhgrive3/actions/issues/1767) | Agent1 | mainにnonce/fixed-origin/startup queue/catalog admission実装あり。source27件、現行buildの実native cold/rematch/socket再接続の3局面・全6方向が成功。元PR単体は未マージで後続統合由来。必要なCIの成功確認が残る。Issue本文にない配備要件を追加しない。 |
| [#1757](https://github.com/rhgrive3/actions/issues/1757) | Agent4 | iPad mini 6の通常Turfで一致条件のCPU/GPU/GC計測と複数回A/Bが未取得。過去の最適化をFPS解決の証明にしない。 |
| [#1708](https://github.com/rhgrive3/actions/issues/1708) | Agent5 | 2022年以降11武器の正しい11.3.0原音・イベント・利用権の証拠が不足。既存の借用対応表は暫定。 |
| [#1671](https://github.com/rhgrive3/actions/issues/1671) | Agent4 | 既存paint/CPU最適化と#1907を保持。物理iPad Safariの8人対戦p50/p95/p99、安定性、60FPS達成は未確認。 |
| [#1666](https://github.com/rhgrive3/actions/issues/1666) | Agent1 | Boss不正life/nonceが攻撃証拠を消費する順序不具合を修正。正当owner自体による入力・命中捏造を防ぐ信頼された全武器/Boss再構築は未実装。 |
| [#1665](https://github.com/rhgrive3/actions/issues/1665) | Agent1 | PvP不正life/replayが証拠・接触枠を消費し後続正当命中を落とす不具合を修正。owner作成の発射・命中ペアを完全に検証する権限設計と多端末実リレー受入が残る。 |
| [#1607](https://github.com/rhgrive3/actions/issues/1607) | Agent3 | 45Fとsource20Fの差は維持し、実Actor境界試験成功。失敗travel/retreat/recoveryのどの区間か原典で確定するまで20Fへ置換しない。 |
| [#1565](https://github.com/rhgrive3/actions/issues/1565) | Agent4 | 段階導入計画。既存gait/IK/inkを保持。全体性能と物理端末の非劣化、原典歩行比較が必要。 |
| [#1434](https://github.com/rhgrive3/actions/issues/1434) | Agent4 | 反復した校正済みABBA/BAAB、8人の等価負荷、GPU readback/pixel一致・分布が不足。SwiftShaderを実GPU計測に読み替えない。 |
| [#1431](https://github.com/rhgrive3/actions/issues/1431) | Agent3 | 同tick姿勢/発射位置・Explosher lip等の既存修正を保持。Quadの最初の左手/原典開口と全aim方向の校正が不足。 |
| [#1116](https://github.com/rhgrive3/actions/issues/1116) | Agent5 | source bank所有時に多くの武器がgeneric Jump_Nrml。fallbackの家族別設定は原典の武器別通常ジャンプを完成しない。S3 track/selector比較が必要。 |
| [#1097](https://github.com/rhgrive3/actions/issues/1097) | Agent5 | source-loaded被弾ownerの既存修正あり。実際のS3武器別selector/joint曲線・実機比較は未取得。 |
| [#997](https://github.com/rhgrive3/actions/issues/997) | Agent5 | 弱入力斜め歩行のcadence/stride/pelvis/feetを一致条件で撮影した原典基準が不足。現在の局所調整をparity認定しない。 |
| [#992](https://github.com/rhgrive3/actions/issues/992) | Agent3 | live native Dualiesの独立droplet/CPU turfテスト4件成功。7phase、foot paint、疎な既定値、高さ合成、DU/WU校正は原典確認が必要。 |
| [#956](https://github.com/rhgrive3/actions/issues/956) | Agent3 | 物理的な靴item/sole入力がない。少なくとも2足のsource model/foot transformと被覆境界比較が必要。ability gearから高さを捏造しない。 |
| [#952](https://github.com/rhgrive3/actions/issues/952) | Agent5 | DownRtの比例減速は既存。Biasの意味とS3 ground-deceleration速度曲線が未確定。 |
| [#890](https://github.com/rhgrive3/actions/issues/890) | Agent3 | B離しで低くなる既存近似とterrain/cadence6試験成功。暫定5F/0.7はNintendoのhold境界や全状態での頂点比較ではない。 |
| [#845](https://github.com/rhgrive3/actions/issues/845) | Agent4 | offscreen visual予算は既存。gameplay所有のmuzzle/pelvis処理、再表示の正確さ、実端末での時間差確認が残る。 |
| [#735](https://github.com/rhgrive3/actions/issues/735) | Agent3 | 無限高さは既にbounded。3試験成功。既存12WU trace/14WU足位置境界は原典の垂直到達距離ではなく、実機・座標校正が必要。 |
| [#725](https://github.com/rhgrive3/actions/issues/725) | Agent6 | 既存1/1.8/3の暫定bridgeを再確認し、古い132/110/278度の説明を修正。中間曲線と実センサー/本家比較は未測定。 |
| [#642](https://github.com/rhgrive3/actions/issues/642) | Agent4 | inactive composer解放・条件付きpacked targetは既存。効果/resize/context復帰の同等画素・物理GPU memory/安定性が未確認。 |
| [#532](https://github.com/rhgrive3/actions/issues/532) | Agent3 | 既存4+1WU/12+4Fとterrain/cadence8試験成功。DU/WU、core/glide easing、疎な既定値と空中校正が残る。 |
| [#287](https://github.com/rhgrive3/actions/issues/287) | Agent6 | 既存−5…+5 UI、暫定写像、移行・resetを確認。実S3 turn-rate未測定、旧0.5未満/2超のclamp、上位yaw設定の飽和が残る。 |
| [#226](https://github.com/rhgrive3/actions/issues/226) | Agent3 | RainNum72は172paint呼出と1対1とは未確認。ledger/cadence4試験成功。生成/再利用/地面接触/塗りの原典ライフサイクルが必要。 |
| [#79](https://github.com/rhgrive3/actions/issues/79) | Agent3 | live Splattershotのnear/far/angle/wall実装と3試験成功。原典selector、疎な既定値、面積/形状、DU/WU・画素比較が残る。 |

## 検証と実機の境界

初回限定検証: CI/gate78件、offload/admission60件、CI-config24件、workflow YAML81本、verifier648成功/既存のbuilt-site依存1skip。権限133件、新規9件は旧main8失敗/正当positive1成功→修正後9成功。clock/catalog27件、native prebuilt31件・census/video55件、Wiper10件・source-loaded scheduler18件、武器既存39件、historical/audio/counterfactual36件、input27件、responsive35件を確認した。これらは重なる検証があり単純合計しない。

最終統合ソースのbuild・source/emitted・hosted CIの結果は対応PR本文/チェックと追加ledgerを正とする。この初回記録自体は全CI成功・本番配備・実機parityの証明ではない。ローカルNode24の個別結果と、最終Node22.23.4の検証を区別する。

Playwright Chromium/WebKitのblank-page起動は確認。WebKitの一部system libraryはローカルに展開したもので、blank-page起動だけではゲーム全体・実iPad/Safariを検証したことにならない。native-prebuilt LFS payloadのないbuildはbrowser conversionを使用し、LFS実体の受入を主張しない。

27PRのinline threadsは6件あり全てresolved。submitted reviewsは#1883/#1885/#1886の21件で全てCOMMENTED。会話に残るWiper/Hissen/long-fire/実機/波形の受入条件は、過去のmerged状態を根拠に解消扱いにしない。#1883 native-RAF lifecycleを専用workflowへ追加する提案は既存必須checkではなく、現時点で自動化されていない範囲として残す。

## 追加統合と継続バッチ

作業中にmainが`a7bca8a27cd039506019f597ea1cba5b3947cdf8`へ更新された。3ファイルを比較して`b7e165c5`へ取り込み、同じretarget修正を二重適用せず、ranked Pagesの新しいsetup/全fan-in条件と既存の強いmutation controlsを保持した。20件の限定試験成功。

追加の通信受理修正は`6bb151c8`と`d20b5544`。native FIFOで拒否された発射event、拒否されたactor row、raw duplicate poseから証拠を作る経路を再現し、既存のreceiver-local受理receiptとその時点のposeコピーだけを使用する。rankedの外側observerとcombatの内側observerは同じnative呼出のscopeを共有し、rankedで必要なactor参照のidentityを維持。従来合法のevent-only packetは、明示的に拒否されたrowと区別し、既存native snapshot/receiver spawn位置を使用する。life/replay/nonceの既存判定・wireを変更しない。追加の17caseと既存のFIFO/metadata/event-only境界を検証する。ownerがnativeにも受理されるfresh actionを捏造する残件は変わらない。

Agent1の追加ターンは自動審査が「サイバーセキュリティ上のリスクの可能性」で停止した。停止前に保存された再現試験と設計を統合担当が確認し、通常のゲーム受理処理の整合性修正を実装した。Agent3の独立レビュー・ranked実wrapper試験を実行し、Agent1が追加実装を完了したとは扱わない。

全27PR/26branchの8,890runから、取消4,619runも全件照会し、失敗job1,002件の[ledger](ci-history.json.gz)と[履歴の確認範囲](ci-history.md)を保存した。過去の赤を消したり全件解消と数えたりしない。初回未分類35件を全logで再確認し、34件は観測された原因・signatureを追記した。残る1件はlog自体が取得不能。1件の過去logはGitHub BlobNotFound、19件はjobのないinvalid workflow。成功single-attempt内のcontinue-on-errorは全件調査していない。

最終準備の5重点レーンはNode22.23.4でcontracts305/pointerlock34/motion38/world18/audio33の428件が成功、skipなし。修正後ソースの広域ローカル検証は945成功・観測失敗0の時点で未完走のまま停止し、重複するunsharded全件実行を最終8shard CIへ移す。これを全ソース成功とは報告しない。独立した関連ネットワーク全件と失敗caseの再検証は別記する。

`ca30ae1f5ebcc1d56e6e1c4c636c5a1ef626bec4`でproduction buildとstartup budgetは成功したが、strict sandbox Chromium151/SwiftShaderのWiper受入は初期main menu待ち120秒でtimeoutし、frame capture前に終了した。pageerrorは未観測、browser/server cleanupは成功。CDP pauseではpaint-native-mip-guardの同期readPixelsとGPU stallを観測したが、全120秒の単独原因とは確定していない。pixel-equivalence guardやtimeout条件を弱めず、実画素受入は未確認とする。

追加17case・既存event-only/metadata/FIFOを含む29件はNode22で全成功。通信全件の最初の実行で見つかった3失敗を原因別に修正した（metadataの新しい依存境界、native event-only正当packetの保持）。この実行中に修正を進めたため、最終headの不変な全件成功とは扱わず、最終8shard CIの結果を正とする。

## Hosted CIからの追加修正（18:25 UTC時点）

`ec7b3c15` / `3a8e6f57`をGitHubへ反映し、重点CI成功後に両PRをReadyへ移した。Draft時のValidate成功はadmissionのみであり、共有build・core・8shard・browser・seven-claims・最終fan-inの成功とは数えない。Readyのfull runは#1908 `40742606355`、#1907 `40742614329`。この記録時点では共有buildにランナー待ちがあり、全CI合格は未確定。

#1907のterminal recovery run `40741994389`は、実emitted native physicsがimportする`WALKABLE`をsynthetic externalが提供していないため、publication fixtureが16/17失敗した。実製品のphysics exportは存在し、後続のブラウザ回復stepは成功していた。Agent6の`6950b7dc`（共有候補へ`baa9e97c`として適用）は、検証済みemitted physicsそのものから値を取得する。閾値のハードコード、未知のimportの許可、失敗assertionの削除はしない。

旧fixtureの16失敗を再現後、修正fixtureは両emitted候補で18/18成功。export欠落・閾値の変更・未知importの負の対照を含む。source回復suite295/295、修正commitをbuildしたChromium151/SwiftShaderでnative stageのrecoverable/rollback-fatalと実context loss/restorationの各browser laneが成功、page errorは0。これは物理iPadやnative LFS deliveryの受入ではない。

同じhosted候補でCrab/Torpedoの実WebGL buffer/pixel比較、Explosher飛沫、squid heading/input、lobby CSSOM、audio integrationは成功した。native stage contractsは648成功・128skipで、23個のnative prebuilt実体が不在と明示されるため、synthetic/fallbackの成功として扱う。paired projectileのafter側はbuild-only export分類で停止した。Agent2の`ae3fb305`は、adapter内部の`.toString()`注入だけが使う2個のhelperをprivateにし、唯一の外部APIを`adaptRenderTransfers`へ戻した。strictなbuild-only一覧・export whitelistは変えていない。private API/ring5件と、正常minified buildの全packaging10件が成功。注入されたruntimeは変更前とbyte単位で同一（SHA-256 `dc43ceb0d390b96d909f0572563e52b587b626aff45938cb0b1b0137e2458a9e`）。paired画素/物理の同等性はまだ認定しない。

各修正のIssue/PR、原commit・統合commit、実際の変更ファイル、検証結果の対応は[`fixes.json`](fixes.json)に記録する。件数は重なるためテスト数を合算しない。独立character QAのReady run2本は、step開始前にGitHub側でcancelledとなった（annotationは`@rhgrive3`による取消、理由不明）。当作業の旧head限定取消ledgerには含まれず、成功とも意図したskipとも数えない。修正バッチ反映後の新しいheadで受入を確認する。

## #1906最終headの再照合とclock受入の継続

最初の統合は#1906の`90bf9ad4`を含んでいたが、その後の最終merge commit `14be5645`は祖先でなかった。再照合でこの不足を確認し、Agent2の`a4164ffe`で最終headの両履歴を取り込んだ。13ファイルを全比較し、4ファイルは現行と同じ、4ファイルは最終PRの厳しい実装/試験をそのまま再利用、5ファイルは両方の独立対照・強い回帰を保持して合成した。実際の差分は9個のCI/testファイルのみ。Wiperの6action・21tick quiet tail・30/60/120Hz試験を保持し、最終PRの追加240tick自然終了試験も成功。証拠保存ではsymlinkを追わず、容量超過時も失敗Wiper receiptとリンクされたPNGを優先して残し、失敗を成功へ変えない。

限定検証: 競合部の独立guard7/7、evidence/Pages/source32/32、CI-config36/36、composition preflight119/74、YAML81本成功。統合後も1,521入力ファイル＋build scriptと2,229artifactをGitから再読出しし、`8c7f27a2`の検証済みゲーム配布物と完全に一致した。元PRの古い失敗や中止を消したり、新headのCI成功に読み替えたりしない。

#1767は、保存済みと同じ`check-inkwave-native-online.mjs --owner-clock`を現行`8c7f27a2`の実production buildに実行した。ゲームやclock/peer状態を変えず、起動用scratch preloadで既存のsandbox browser policyを適用し、Chromium151を選択した。2隔離context、実Game/Match/Actor/Character・実WebSocket・production Worker relayでcold/rematch/socket reconnectの3局面・6方向すべて成功。実際の各timestamp対は旧guardでは拒否され、新guardではfreshness originが不変のままsnapshot/buffer/playingが進む。page/console errorは0、終了後に当該browser/server processが残らないことも確認した。必要なhosted CIの結果待ちであり、まだIssueをCloseしていない。

[現行clock受入の6方向・条件・実timestamp](owner-clock-current.md)と[機械可読receipt](owner-clock-current.json)、実行時launcherを保存した。raw/PNG archiveのhashも同資料に記録する。

## 全体CIで見つかった独立fixtureの修正（19:25 UTC）

現行head `472c85fa` / `7e968611`のfull CIは両production buildに成功した。core2jobの共通失敗は`inkwave-combat-provenance.test.mjs`のmodeled receiverがnative受理receiptを発行せず、正当な入力にも4要素の無効actor rowを使っていたこと。元のcore3ファイル71caseをNode22で再現すると46成功・25失敗。Agent1の`ab8863a8`は実際と同じ`commitOwnerTick` module instance、合法21要素rowとlife sidecarを使い、元の全期待値を維持する。無効短rowとlife欠落の負の対照3件を追加し、source74/74・実配布module mode74/74が成功した。Agent3も独立に同じ結果を確認。sourceから生成したmodeled policyであり、native HP/physics/browserの受入とは呼ばない。

Agent2の`1d8f90a9`は、この2ファイルのsource60caseをadmissionへ追加した。約1秒で完了し、Node標準機能と既存sparse checkoutだけで動く。古いsourceは同じcommandで25失敗し、修正後は通常・sparseとも60/60成功。full coreの元の試験を残し、重いbuild・8shard・browser開始前に同種のAPI driftを拒否する。DAG/source/Pages31、CI-config36、YAML81本も成功。

root shard0の別失敗はKrakenの`attacker-life-change-keeps-committed-hit`。fixtureがlife2のactivation受理前にattackerをlife3へ進めており、まだcommitted hitがない状態だった。Agent2の`3f855091`は受理済みsnapshotと未消費Special proofを先に確認し、その後life3へ進めて同じ命中1回・最終HP=-20（100から120damage）を検証する。受理前にlifeを変える負の対照はproofなし・0damage・HP100を検証する。file全32caseがsource/emittedとも成功。製品のlife guardや物理・HP期待値は変更していない。

同じruntimeの実native network browser job `123034976276`は成功。2player軌道/FX、100ms ordered delay、Chromium/WebKit paint masks、fixed owner clock、実Actorの命中上限/証拠/hit-IDを含む。root UIとresponsive viewport/mobile遷移も成功。これらをmodeled fixtureの成功と混同せず、次のsource headの正式CI成功へも読み替えない。新しい修正バッチのhosted CIは別途確認する。

中止されたcharacter QAと同じ受入を、元の20分上限のまま両候補でローカル実行した。各24scenario・10解放cycleが成功し、前後の全入力/artifact hashを確認した。[条件と限界](character-local.md)、圧縮済み[root](character-local-root.json.gz)/[最適化側](character-local-opt.json.gz)receiptを保存する。isolated expanded Three coreのsynthetic fixtureであり、実character・production-core GLTFLoader・retail/実端末parityの証明ではない。rootの中止jobだけは原因確認とローカル成功後に1回再実行した。取消の過去履歴は残し、繰返しretryしない。

そのroot character再実行は`472c85fa`のrun `40747849317` attempt2 / job `123035846433`で成功した。所要12分37秒、browser24scenario・10cycle合格、既存20分上限を変更していない。成功artifactは`12844621418`（旧cancelled attemptの小さなartifactとは区別する）。Kraken修正もAgent3が独立にsource32/32・emitted32/32、skip0で確認し、blocking指摘はなかった。

#1767のmain条件は[履歴と28箇所の等価性](owner-clock-main-inclusion.md) / [hash一覧](owner-clock-main-inclusion.json)で確認した。実際にはmerged PR #1843 (`726e338a`) がclock/catalogをmainへ届け、#1882 (`6e61cfcc`) が後続のscan cacheを導入している。個別の旧PR #1842/#1846が未マージであることを、mainに未実装と誤認しない。必要なfull CIがまだ成功していないため、IssueはOpenのままとする。

## 固定base/headのprojectile比較とスコープ保留

#1907のrun `40747856762`は、base `e67c636b` とhead `7e968611`をそれぞれ通常buildした元のcaptureで、比較job `123043229422`まで成功した。[原artifact・52pair・hash・比較条件](projectile-pair-7e968611.md)と[機械可読receipt](projectile-pair-7e968611.json)を保存する。独立した原ZIP再検証でも52/52の物理状態・native発射後RNG、全workload、両側各94枚の原PNG hash、GL error 0を確認した。画素のbefore/after同一性、Wiper catalog、全武器/全stage、物理端末の性能は認定しない。baseにも既存最適化が含まれるため、最適化on/off単独比較とは呼ばない。

19:03 UTCの[ownerのスコープ記録](https://github.com/rhgrive3/actions/pull/1907#issuecomment-6478009679)は、`MOV-08b`のcharacter-model最適化を含む間は#1907全体をマージ保留とし、元PRと部分作業の保持を求めている。これを不具合認定やマージ許可に読み替えず、#1908の独立CI修正を続行する。両PRへの修正反映と検証はmainへのマージとは別であり、当作業はmainをマージしていない。

19:40 UTC時点ではrootの全8shardが完了し、0/5だけが同じKraken fixtureで失敗、ほか6shardは成功。catalog以外のbrowser6系統、resource、seven-claimsも成功した。catalogのWiperは実行中で、全体の成功を主張しない。[新規失敗のjob別対応表](new-ci-failures.json)は初回の過去1,002失敗jobと区別する。次の反映バッチはfixture・admission・記録のみで、製品入力と配布byteを変更しない。

19:42 UTC追記: 固定headのcatalog/Wiperは両側とも成功（root job `123034976366`、最適化 job `123035443236`）。Wiper step48はそれぞれ19:41:26 / 19:41:24 UTCに完了した。最適化shard5 `123035443313`の唯一の失敗も同じKraken fixtureであり、同じ共有修正を再利用する。新headの正式CI受入とは区別する。

## 後続core/sourceへ進んだ追加バッチ（20:29 UTC）

`54465a5d` / `0706b35a`へ反映後、両admission・production buildと、両character QAが成功した。characterは各24scenario/10cycle（root9分45秒、最適化5分59秒）。現行最適化のbase/head projectileも両captureと比較job `123078063423`が成功。全体Validateはまだ成功していない。

後続coreの共通pointer-lock成功系fixtureは、native `pointerlockerror`を発生させないままfallbackを期待して17/38失敗した。`d192a654`を共通`07e03c7d`へ取り込み、全38caseと期待値を維持し、正当nativeイベントと不在/前回/遅延イベントの対照を明示した。source、両actual emitted、両compactionで各38/38、7個のguard mutantは意図したassertionで失敗。Agent6が独立承認。vendorを持たないsparse admissionへ依存を追加せず、既存のfull-checkout focused pointerlock laneに同じcommandを追加した。

最適化shard6のGPU22は、通常版の文字列call形に固定した古いassertionが原因。`a460cd46`を共通`0568bef8`へ取り込み、実composed ring方法・実THREE attributeの2静的slot、birth/current値、steady quietnessを実行して確認する。両側10/10、4種類のmutationは失敗し、既存shell条件を維持。Agent2が独立承認。runtimeは変更しない。

CIのhurtbox stepは、fixtureが読む`INKWAVE_EDGECASE_SITE`を設定せずsourceを選んでいた。`7f7b2851`で本来のemitted siteを指定し、実emitted2case成功を確認した。期待値の緩和ではなく未実行だった経路の検証である。

次のpush前に、[後続coreの関連する一度だけのローカル検証](emitted-core-sweep.md)、[通信のselector/command/hash](emitted-network-sweep.json)、[武器/物理のcommand/hash/skip境界](emitted-weapon-sweep.json)を確認した。新規失敗job・元source・対応commitは[`new-ci-failures.json`](new-ci-failures.json)に追記し、正式な次head CIとは区別する。最適化側のscratch名・broadphase後のcall-listについても隔離worktreeで修正・独立レビュー中。Issueは形式的にCloseせず、#1767も必要な全体CIまでOpenを維持する。

## #1907のCharger fixture後続修正

最適化側の後続2件はテストだけを修正した。`c8ae9404`（統合`87b289b0`）は古いmodule-global名のassertionを、実installerのwarm再利用・depth別/installation別所有権・nested/exception・remote/custom callbackの検証に置き換える。元の6個のbroadphase/performance条件を維持し、source16/16・実最適化emitted16/16、4種類のmutationが意図したassertionで拒否される。Agent1が独立に再実行・承認した。[scratchの条件・hash・確認範囲](optimized-charger-scratch.json)。

`606d6b14`（統合`73a78997`）は全8候補へのnarrowphase呼出を必須にしていたfixtureを修正する。残る候補のidentity/順序・relative endpoint・entryを元の完全scanと厳密比較し、省略された全候補が実capsule solverでnullになることを確認する。source936条件では21,816回から17,016回へ減った4,800回すべてがmissで、報告hit3,766件・stop/seen/event/lease状態が一致した。初期/終端半径、境界epsilon/equality、coherent/不連続/古いmotion、ghost、zero/NaN/short/range-clipped shot、full/partialとworld/defense stopを含み、5種類の不正cull/time対照を拒否する。

全fileはsource10/10・最適化emitted選択suite10/10で成功し、Agent4が独立再実行・承認した。936条件のgeometry matrixは明示的にsourceを読む。emitted選択は元からあるreal-composed Charger helper caseに適用されるため、936件の実emitted検証とは扱わない。[比較方法・command・対象hash・限界](optimized-charger-broadphase.json)。両修正は#1907だけへ適用し、通常版のroot branchや製品runtimeを変更しない。新headの必須hosted CI成功は引き続き別途確認する。
