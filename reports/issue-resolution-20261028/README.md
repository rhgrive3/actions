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
| [#1767](https://github.com/rhgrive3/actions/issues/1767) | Agent1 | mainにnonce/fixed-origin/startup queue/catalog admission実装あり。現行ソース27件成功。元PR単体は未マージで後続統合由来。現行headでのcold/rematch/reconnectブラウザ・CI・配備確認が残る。 |
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
