# INKWAVE 既存 PR 1878 への統合候補と検証状況

## 結論

#1867–#1877 の変更を、採用範囲を明示して既存の [#1878](https://github.com/rhgrive3/actions/pull/1878) へ集約するローカル候補を作成した。**この候補はまだ公開していない。** 公開済み参照 head は `e3a8c3b06d13d5e34eb31e18cbb247cc6a9b9199`、tree は `6f4cd192508dc9e82dd15f2c9b808b232fe77701`。全 PR の全差分採用、全件テスト成功、配備完了、main マージを意味しない。

新しい PR を増やさず #1878 を唯一の集約先とする。元 PR とブランチは保持し、まだ閉じない。中央の大型 journal `reports/inkwave-splatoon3-behavior-2026-10-02.md` はこの報告作業では変更していない。この文書は 2026-10-25 10:30 UTC 更新の公開前ローカル証跡スナップショットであり、下記の未完了ゲートを残す。

## 採用と保留の範囲

| 元 PR | 集約方針 | 境界 |
|---|---|---|
| #1867 | main CI 回帰修正を現行の実コード・fixture・workflow と整合 | 後続 PR と重複するため、元 PR の全ファイル exact 採用とは数えない |
| #1868 | 事前変換・KTX2 と認証済み fallback の既存経路を保持 | この環境では実 23 stage の LFS body 不足。全 stage の実描画受入ではない |
| #1869 | 合成本番コードと検査を現行候補へ調整 | 古い fixture や strict gate を削除して緑にする方式は採らない |
| #1870 | queue、audio、network、ranked、world、CI の選択差分を採用・合成 | 停止済み hair/body/outfit 作業と `queue-extra-motion-adapter.mjs` は再開しない。worker protocol387 と converter invalidation を保留 |
| #1871 | イカ切替修正の出所として保持 | 最終の採用方針は #1873 に置換。両方を独立機能として二重計上しない |
| #1872 | 10/25 の入力・モーション・塗り・Kraken・音声・照準修正を既存修正と合成 | 元 PR の過去画像・browser 結果は、この新 aggregate の browser 成功を証明しない |
| #1873 | #1871 を置換する squid-toggle idle/pose の連続性と scoped source gate | アニメーション／入力の連続性。新しい髪・身体・服・武器ジオメトリの作成ではない |
| #1874 | Circle 設定、GitHub 側分担、fail-closed exact-SHA gate を統合 | global offload 設定は有効化していない。最終 aggregate head の Circle 実行結果は無い |
| #1875 | pause/menu/portrait/showcase/audio 終了時の参照・資源保持削減を統合 | 既存 HUD の正しい scheduling を保存し、危険な paused RAF 置換は採用しない |
| #1876 | special の軌跡・姿勢・塗り計画の軽量化を既存経路と合成 | 元 workload・scalar helper・pool owner・ghost lifecycle の検査を維持 |
| #1877 | native の描画・CPU・保持削減を prebuilt/KTX2 経路と合成 | converter の UTF8/normal 最適化は実 prebuilt 再生成・認証と一体で行う必要があるため保留 |

beam の危険な再利用、HUD の unsafe scheduling、jumpout/climb/bubble/sizzle の cadence 正規化は除外した。Charger の防御 probe は既にレビューした non-reusing 実装を保持する。`older-adoption.json` の採用一覧はその時点の取込み記録であり、後続の修復や保留を打ち消さない。`circle-merge.json`、`additional-merge.json`、`extra-merge.json` の `CONFLICT` / `adopt exact` も履歴ラベルで、現在の競合数や最終 coverage ではない。

converter SHA256 は `2c8ac61161f48c483c55e7c1b9cbd071f8b13e1cf6c6b7de615a64e9cad242af` を保持。`source-convert.mjs` blob `0f4ee29067b9bfdfb74b5f8bb5137c57f94b8e5c` と `source-worker.mjs` blob `98bcb82742e0f1249d03c63d44f270b837b8399f` は manifest の公開参照と同一。fingerprint check の迂回は行っていない。

## 現候補に対する焦点検証

次の数値は**重複する suite・再実行を含むため合算しない**。source、synthetic、minified fixture、実 browser は別の受入レベルである。

| 対象 | 結果 | 一次証跡と制限 |
|---|---|---|
| CI focused 最終 | 356/356 pass、skip 0 | `ci-final-all-high.tap`、30 files。Circle/AST、fan-in 128 combinations、exact checkout、special batch 等。`ci-bash-syntax-high.json` は YAML 103 files、shell 674 steps を検査し failures 0。実 Circle 最終 head 実行ではない |
| Native focused | 220/220 pass、skip 0 | `native-merge-high-v5.tap`。source-data 7 件を含む。synthetic admission、KTX2 loader、abort/fallback 等 |
| Native associated | 46 pass / 0 fail / 5 skip | `native-associated-high-v2.tap`。prepared-copy の拒否ゲート修復後。5 skip は下記の実 geometry 不足 |
| Native identity | 48/48 pass | `native-final-identity-high.tap`。20 definitions＋23 inventories の 43 file Git SHA を公開参照と照合 |
| Native converter fixture | 4/4 pass | `native-conversion-high.tap`。既存の厳密な parser/BVH fixture を復元して実行 |
| Native copy gate | 41/41 pass、skip 0 | `native-copy-gate-extended-high.tap`。extra/symlink/modified-body/modified-inventory の元 4 rejection failures を修復後に受入 |
| Gameplay focused | 79/79 pass、skip 0 | `gameplay-acceptance-result-high.json`。42＋34＋3 件を別 run で受入。runtime/payload 編集なし、source/composition の範囲であり full aggregate/emitted ではない |
| 既存 shipped audio provenance | 29/29 pass、skip 0 | `shipped-audio-provenance-high.{md,json,tap}`。389 tracked MP3 の blob SHA を e3a8c3b と照合。source-only 復元、payload への新 asset 追加なし |
| Audio/network focused | 79/79 pass、skip 0 | `audio-network-focused-final-high.tap`。PCM hashes/DSP、LRU、checksum/index/lifetime、cancellation、authority/combat/clock |
| Kit と Slosher の isolated 全ケース | 56/56 pass | `audio-network-isolated-high/results.json` と各 TAP。Kit 17＋Slosher 39、38 processes。テスト名単位で分離し元 assertions は変更しない |
| その他 composed network | 30/30 pass | `audio-network-composed-high.tap` の合格した残り 6 files。全 run 自体は下記の resource failure を保持 |
| UI と native cadence | 最終 25/25 pass、skip 0 | `ui-cadence-acceptance/final.tap` と `SUMMARY.json`。runtime 変更なし。レビュー済み e3a8c3b composed baseline の fixture を使用 |
| QA tools no-render | 27/27 pass、9 files、fail/skip 0 | `qa-tools-final-high-results.json`、`qa-contract-tools-final-high.tap`。syntax 24/24、source/code SHA readback clean、lighting dependency 解消。実 browser／モデル render の検査ではない |
| UI mutation controls | 危険な変更 4 種すべて拒否 | paused RAF、world pause、reentry delete、native cadence normalization の各 mutation TAP は意図どおり失敗 |
| 返却された validation-only 12 leaves | source 129/129、minified fixture 62/62、browser script syntax 4/4 | `validation-returned/verification.json`、`focused-v2.tap`、`minified-v1.tap`、`browser-syntax.log`。実 aggregate browser は未実行 |

### 後着の修復・診断証跡（final-head 受入とは別）

以下は上表後の候補修復に対する focused 結果であり、以前の全 suite がこの最終候補で再実行されたという意味ではない。各件数は重複するため合算しない。

| 対象 | 結果 | 一次証跡・境界 |
|---|---|---|
| Relay security cleanup | serial 98/98、fail/skip 0 | `security-cleanup-fix-high.json`、`security-cleanup-fixed-serial-high.tap`。同期 close 再入を queue で排出し、送信失敗 member を除去して再選出。cleanup block は donor/base と exact、前方 bytes と既存 tests は不変。初回 targeted 0 pass/2 fail → 2/2。parallel run の 80 pass/2 SIGKILL は資源失敗履歴として保持 |
| Ranked recovery checker | 87/87、fail/skip 0、syntax pass | `ranked-recovery-sequencing-high.json` と `.tap`。native 接地・実 remote live loop の再受入を待ってから bounded movement pulse。失敗時は restoration 前の actor/remote/wire を観測し元失敗を保持。runtime 変更なし。実 two-browser recovery は未再実行で exact final-head official CI 待ち |
| Circle REST status boundary | 27/27、fail/skip 0 | `circle-status-boundary-high-results.json`、`.tap`。実 REST-shaped fixture を fetch boundary で exact source identity に bind。wrong-source/repository/endpoint、SHA/URL矛盾、新しい failed/pending run を fail-closed に検査。provider/full-DAG 条件を免除しない。実 Circle run や global offload 有効化の証明ではない |
| Native ownership＋copy materialized | 55/55、fail/skip 0 | `native-ownership-copy-materialized-high.tap`。throwaway materialized copy 上で authored helper の terrain validation と integrity 前後関係を実行。validator削除・到達不能化・hash bypass・未認証manifest使用の4 negative mutationsを拒否。`native-ownership-no-vm-high.tap` 単独14/14とも重複。Node18相当の `import.meta.dirname` 不在を模擬した検査で、実23stage資産・全Node18実行の証明ではない |
| Combat scenario boundary | 85/85、fail/skip 0 | `combat-trust-diagnostic-high/focused-final.tap`（単独回帰1/1は `focused-regression-final.tap`）。`before.json` は旧 reset で scenario C の deferred hit h3 が D へ流入し HP28、`after.json` は旧 scene のまま claim 排出後に reset し D の h4 だけで HP64。exact checker reset を in-process browser-boundary shim と実 Session/Actor/Projectile/ACK で検証。runtime の damage/security 許容値は変更しない。実 browser/GPU の fresh 合格ではない |

後着コードの固定 blob は `server/src/index.js`=`121abfe7666d24693fde13930c5da44e710dbfcb`、ranked checker=`08bd163d26ab4f362e71212a3e50b034e19cde49`、ranked test=`b6a32df52be26760c4f59f08785cb791a4294871`、Circle gate=`c00113a2ed48daec2c7ac22cbdd28cb4b4684b22`、Circle test=`cae11c414c9bc47d7b012d78419dff21286d68fd`、ownership test=`bcf06cab4d8ad94313df595604a1a3c07cf36f68`、combat checker=`469570bc2996f10e035d3228d2208e2953304825`、新 combat regression=`9916005ad67b1348a04ed19b16dd263570fa2a85`。これらは reconciliation snapshot の候補 bytes の識別子で、公開済み final commit の識別子ではない。

Audio 修復は、同期 abort handler の再入が新 generation の staging LRU を奪うケースに post-cancel generation guard を追加し、回帰テストを追加したもの。PCM や発音 fidelity を変更して通したものではない。UI では raw source と既にレビュー済み composed source の違いを fixture へ固定し、元の HUD pause/judge/reentry 修正を維持した。bubble gate はレビュー元から dormant であり、gate の同値性は live emission の証明ではない。

## 消していない失敗と未充足条件

- 旧広域 `older-tests.tap` は 65 pass / 13 fail、`ci-all-high.tap` は 252 pass / 18 fail、`ci-all-high-v2.tap` は 266 pass / 3 fail。後続 focused pass で上書きせず、修復過程として残す。広域全体の再実行成功はまだ無い。
- Native は初回 154/158、v2 212/213、v3 219/220 から v4・最終 v5 220/220 になった。`native-associated-high.tap` は 38 pass / 5 fail / 5 skip の履歴。parser fixture の 1 failure は上記 4/4、prepared-copy の 4 rejection failures は正規検証済み copy gate の修復後に associated v2 の 46 pass / 0 fail / 5 skip で再受入した。実 asset 全体の成功ではない。
- Native の 5 skip は実 source geometry 不足によるもの（scorch、hagglefish、inkblot、mako、brinewater）。全 23 stage の実 prebuilt chunk/texture LFS body もローカルに無い。inventory の 23 stages・8,331 entries・775,671 bytes の認証と、実 asset body の完全受入を混同しない。
- `audio-network-final-high.tap` は **履歴として 223 pass / 4 fail** を保持する。当時の ENOENT は `s3-real/Wp_ShooterLong_Shot_00.mp3`、`s3-real/HitEf_CriticalHit_00.mp3`、`s3-real/HitEf_InkHit_Focused_Normal_00.mp3` と `s3-real/` enumeration。初回 charger 検証にも `inkwave-public/assets/audio/charger-first-splatune2-reference.mp3` 不足があった。**この 5 provenance gaps は後続の 29/29 focused run で解消済み。** 既存 donor から tracked MP3 389 files（s3-real 388＋charger 1）を復元し、公開 e3a8c3b の全 expected blob SHA と照合した。復元は `source` のみで、donor/original を保存し、payload への音声 binary・権利情報・runtime の追加や変更は無い。元 227-test 全体を fresh rerun して緑にしたという主張ではない。
- `audio-network-composed-high.tap` は全体 30 pass / 2 fail のまま保存。Kit は SIGKILL、Slosher は heap exhaustion/SIGABRT。後続 isolated 56/56 で各 named case を検証したが、一括実行自体を成功へ書き換えない。
- UI は元 23/24、返却 validation source は元 128/129 の失敗をそれぞれ `before.tap` と `focused-v1.tap` に保持。後者は #1876 の実 `specialCirclePoints` 依存を fixture に含め、assertions を維持して 129/129 にした。

## 旧 94 の独立検証と今回候補の区別

[旧 94 の作者最終報告](https://github.com/rhgrive3/actions/blob/e862f4cb3c43a17eb39b9db1447b3bc10b54c4b5/reports/integration-validation-354f1c5/FINAL.md) の対象コードは `94b035efca9e86fbb6431c568086426790536c00`、tree `bedb7a622685427293581037f1e788bfefa22a21`。この報告を immutable commit から読み直した。作者は正規 LFS による Node22 production build、実入力、cosmetics 実描画、独立した loading cancellation component、idle-resource 等について、それぞれの範囲での成功を記録している。

ただし同報告の whole-source は **9,013 pass / 30 fail / 23 skip** の診断結果を保持し、fixture 修復後の final-head fresh 全件 run は未実行。正規 native-lifecycle 全体は FAIL（integrity error から source fallback 後、外部 fetch failure となるため元 oracle を満たさず）、後段 mobile 5 stages は未到達。再試合 10/10 の証跡も先行 artifact であり最終 artifact の exact-head 受入ではない。非公開内部 module の emitted setup に ENOENT/404 も残る。

したがって旧 94 の成功結果を、新しい #1874–#1877 等を重ねた本候補の build/browser/GPU 成功として流用しない。返却したのは 8 test modules＋4 browser scripts の検証用差分であり、旧 94 のコード全体をそのまま採用したものではない。新たな cloud/Codex 起動・再開は行っていない。

## historical special owner ルートの限定検証

`materialized-delta-high/RESULTS.json` と `FINDINGS.md` の bounded historical fixture は **39 executed / 37 pass / 2 fail / skip 0**。コピーと donor の SHA256 を照合した source-symlink なしの fixture だが、full aggregate の admission・build・browser ではない。357-leaf closure、56 controls、17 build guards の負例を含む。2 failures は、disposable linked worktree 作成時の ENOSPC と、旧 suite が direct `run: node --test` を期待する一方、現 workflow が owner-only の `case` route 内で呼び出す registration 不一致。元 assertions・workflow・pins を緩めていない。成功扱いにはせず、元ログを保持する。

この suite は default aggregate PR route では実行されず、同一 repo の `inkwave/special-reviewed-main726-20261023` に限る historical special-owner route のもの。したがって今回の default aggregate CI を阻む未充足ゲートとは扱わない。一方、aggregate は選択した historical leaves の 92 件と相違または欠落があり、historical four-delta pair として admission 済みとも主張しない。担当は記録保存後、自分の throwaway copies だけを cleanup し、original donors・aggregate source・payload・Git metadata は変更していない。

## 公開と受入に残るゲート

1. `coverage-audit/MATRIX.md` と `per-pr-adoption-matrix.json` は全 PR の差分を分類し、説明のない absent path は 0。ただし nonexact の同値性までは認証していない。`candidate-leaves.json` の 09:25 時点の 46 stale paths は、root が 09:29 に再生成した。その時点の payload 301 files / changed leaves 280 / virtual leaves 8,382 は旧 snapshot。後着差分を含む `manifest-reconciliation-audit.json` は payload 306 files / changed leaves 285 / virtual leaves 8,383、baseline leaves 8,284、explicit deletion 0 を記録し、stage→payload・payload→candidate・旧stage全pathのpayload存在・candidate変更全pathのpayload存在の4整合検査はすべて true。stage added 5 / changed 4 / removed 0（報告を含む9 path）で、これは本報告の今回更新前の snapshot。本報告の blob 更新を反映して最終 bytes を再 seal・読戻しする。監査は元 manifest を保存し、source/payload 編集・外部 write を行っていない。#1870 の `tools/squid-heading-qa/run.mjs` と `tools/swim-entry-qa/run.mjs` に見つかった source-only の substantive verification fixes は root が正規 bytes と突合して payload へ整合した。`source-drift-latest.json` は空配列で、初期 5 drift findings は解消済み。大型 journal の参照も公開 blob `1942ab67ad0686e219c63c0797ee4d0640723b0d` に一致する。実際の候補 bytes に対して未解消の composed/import dependency がないことを確認する。最終 `coverage-audit/FINDINGS.md` の AST closure は 3,463 JS/MJS files / 6,862 imports、残る 6 edges は raw browser page relative 2 と未使用の unchanged baseline fixture 4 に分類された。literal URL の fixture・browser evaluate・意図的負例を runtime unresolved と誤集計しない。production composed scan は upstream 140 files / transformed 71 / relative imports 615、errors 0 / unresolved 0。ただし全 repo browser の代替ではない。
2. prepared native copy rejection、special batch と headgear tool 入力の focused 受入は完了。special workflow は公式 #1870 blob `b30a437bc96f679d85c58ff73d4ffb787b906760` に整合し、22 protocol/native cases を保持。QA tools の missing axes/helper と lighting dependency は正規 bytes で解消し、9 files / 27 tests、fail/skip 0、syntax 24/24、source/code SHA readback clean を確認した。reviewed-special-delta の bounded historical fixture は前節の別 scope として扱い、default aggregate の残ゲートには数えない。
3. 音声 provenance は既存の exact tracked MP3 の source-only 復元と 29/29 で解消済み。残る native の exact LFS 資産を正規経路で materialize し、実 23 stages を再検証する。converter 最適化の保留解除には整合する prebuilt 再生成・qualification が必要。
4. final aggregate の materialized tree、full source、production build と対象 browser/GPU 検査を実行する。旧 94 の native-lifecycle FAIL と emitted setup 不成立を、許容値変更・source fallback の偽装・private module コピーで隠さない。
5. #1878 へ公開する時は final commit/tree を読み戻し、その exact head の GitHub/Circle 必須結果を取得する。Circle global offload 有効化と設定の統合は別の操作・判定であり、設定統合だけで offload 済みとは言わない。

現在報告された焦点 local scope には、上記 historical owner-only failures を除いて未解消の blocking local assertion は残っていない。ただし全 mandatory CI が green という判定ではなく、full build/emitted/browser と公開後 exact-head GitHub/Circle の結果は未取得。

この文書の作成担当は外部 write、commit、push、PR close、main merge をしていない。元 branch と証拠を保持し、この文書と draft PR body 以外は編集しない。

## 差分カバレッジのスナップショット

`coverage-audit/MATRIX.md` の exact は Git blob の同一性だけを表す。nonexact は統合または保持された path で、挙動同値の自動認定ではない。同じ path が複数 PR に現れるため、この表も合算しない。元 manifest に無かった #1867/#1869 の delta は、既知の immutable head に対応する公式 PR files API から監査担当が補完した。

| PR | Delta paths | Exact | Nonexact 統合／保持 | Deferred | Replaced | Report nonexact | 説明のない欠落 |
|---|---:|---:|---:|---:|---:|---:|---:|
| #1867 | 29 | 8 | 21 | 0 | 0 | 0 | 0 |
| #1868 | 490 | 464 | 25 | 0 | 0 | 1 | 0 |
| #1869 | 61 | 44 | 16 | 0 | 0 | 1 | 0 |
| #1870 | 321 | 167 | 101 | 11 | 0 | 42 | 0 |
| #1871 | 34 | 8 | 25 | 0 | 0 | 1 | 0 |
| #1872 | 96 | 52 | 42 | 0 | 1 | 1 | 0 |
| #1873 | 35 | 11 | 23 | 0 | 0 | 1 | 0 |
| #1874 | 14 | 8 | 6 | 0 | 0 | 0 | 0 |
| #1875 | 18 | 11 | 3 | 0 | 0 | 4 | 0 |
| #1876 | 50 | 25 | 5 | 0 | 0 | 20 | 0 |
| #1877 | 13 | 7 | 2 | 2 | 0 | 2 | 0 |

native-prebuilt 405 files は overlay write せず、すべて #1868 の exact bytes を参照する。ただし LFS pointer の同一性は body 全体の取得・描画を証明しない。source drift は解消済み。候補 manifest は再生成済みだが、最終報告更新を含む bytes の seal・readback は別に必要。

## 限定された追加承認と公開状態

`manifest-reconciliation-audit.json` の `blocked` 3件は監査時点の履歴であり、2026-10-25 10:29 UTC にユーザーから次の3ファイルに限る承認を受けた: `patches/splatoon3/runtime/special-motion.mjs`、`patches/splatoon3/runtime/special-vfx.mjs`、`patches/splatoon3/tests/trizooka-lobe-vfx.test.mjs`。対象は特殊武器の重複計算削減と回帰テストで、キャラに付随する特殊武器の表示処理を含む。**髪・キャラ形状を変更しない条件と hair/body/outfit 作業全体の停止は維持**する。承認は当該3ファイルの反映に限り、他の停止・権限・範囲へ拡大しない。承認受領は upload/commit 成功の証拠ではない。

`special-permission-proofs.json` の候補 blob は順に `ebe2ffb3cf9b3e34d80109e82ecefc4c39f03b94`、`84ee58f057c3b91306e86af38f838fd25258fbb7`、`b6498348db14799cca59273d90de0d54d025444e`。公開済み参照 head は依然 `e3a8c3b06d13d5e34eb31e18cbb247cc6a9b9199`。この報告の作成時点では新 aggregate の公開・exact commit/tree readback・その head の必須CI/browser受入は未確認。新たな Codex/cloud Work の起動・再開は行っていない。

## 固定した元ソース

採用判断の出所は以下の immutable commit。PR の可変 head を後から読み替えない。

| PR | 元 commit |
|---|---|
| #1867 | [`4a0149b06d9b21eb114069305b7d330a5aed926b`](https://github.com/rhgrive3/actions/commit/4a0149b06d9b21eb114069305b7d330a5aed926b) |
| #1868 | [`58ce39b2efa352ef31131918c57d221cfcf388f1`](https://github.com/rhgrive3/actions/commit/58ce39b2efa352ef31131918c57d221cfcf388f1) |
| #1869 | [`b57ccf044c42ffb7016664ee45599942c19e74c4`](https://github.com/rhgrive3/actions/commit/b57ccf044c42ffb7016664ee45599942c19e74c4) |
| #1870 | [`1d0dc3b242113bba28752003917f3d6f4998803f`](https://github.com/rhgrive3/actions/commit/1d0dc3b242113bba28752003917f3d6f4998803f) |
| #1871 | [`12d9ac76c679bdc423d597a33a5fb4ec88c3a545`](https://github.com/rhgrive3/actions/commit/12d9ac76c679bdc423d597a33a5fb4ec88c3a545) |
| #1872 | [`2cdee65931e0b5cc095f736dcb325e3d7493695a`](https://github.com/rhgrive3/actions/commit/2cdee65931e0b5cc095f736dcb325e3d7493695a) |
| #1873 | [`01c3d55494c840888270dd1aae7bada5c07cd48b`](https://github.com/rhgrive3/actions/commit/01c3d55494c840888270dd1aae7bada5c07cd48b) |
| #1874 | [`2087594b73b45ebad177cb1a8a7d1e8b06c69d2f`](https://github.com/rhgrive3/actions/commit/2087594b73b45ebad177cb1a8a7d1e8b06c69d2f) |
| #1875 | [`2f74994a961d276d7f7bdba02c1eff2605de0b5b`](https://github.com/rhgrive3/actions/commit/2f74994a961d276d7f7bdba02c1eff2605de0b5b) |
| #1876 | [`c691323e9322cc345f39aa9959b749af35f4f41a`](https://github.com/rhgrive3/actions/commit/c691323e9322cc345f39aa9959b749af35f4f41a) |
| #1877 | [`7a291fa345a675238332975e9d6fd5c355ad0303`](https://github.com/rhgrive3/actions/commit/7a291fa345a675238332975e9d6fd5c355ad0303) |

公開済み #1878 の参照は [`e3a8c3b06d13d5e34eb31e18cbb247cc6a9b9199`](https://github.com/rhgrive3/actions/commit/e3a8c3b06d13d5e34eb31e18cbb247cc6a9b9199)。旧 94 の返却差分 base は `ebe716900acca44e26dd61839ea4bfe7a7805161`、head は `94b035efca9e86fbb6431c568086426790536c00`。

ローカル一次証跡 root は `/tmp/all-pr-aggregate-0834/`。`manifest.json`、`older-adoption.json`、`native-high-review.json`、`coverage-audit/`、`ui-cadence-acceptance/SUMMARY.json`、`validation-returned/verification.json` と各実行ログを併読する。ローカル snapshot のパスは公開済み remote artifact link ではない。
