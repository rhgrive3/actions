# CI・起動 issue の証拠照合（2026-10-22）

対象: `rhgrive3/actions`。調査開始時HEAD `26a4db4123d23162a3dbf8a12150b1b5bc6ccf64`、公開source commit `f9d744eba5cbd86ef9a4a77e9a4dbd61c48d4d90`（ローカル `0fc2fa5` と同一tree）。検証器へWebKit選択を追加し、固定buildで追加受入を実行した。CI・起動担当agent自身によるremote変更・新規CI起動はない。親agentが公開source branchを作成し、最終buildの照合とreliability再受入を追補した。生ログから抜粋した識別情報と検証結果は [ci-startup.json](ci-startup.json)。

| Issue | 現在の実装と証拠 | 残条件・提案 |
| --- | --- | --- |
| [#1432](https://github.com/rhgrive3/actions/issues/1432) | [#1771](https://github.com/rhgrive3/actions/pull/1771) がmain統合済み。CSS opacity transition待ちをメニュー所有tickのfadeへ移した。PR固定HEADと統合後mainで厳格なChromium 3round rematchがそれぞれ成功。今回WebKit選択を検証器へ追加し、固定buildでWebKitの3round＋Range＋次Turf隔離が成功。 | 同一buildのChromiumは120秒、300秒とも外側上限で未完。300秒実行はround2成功まで進んだが全受入成功ではない。完全な同一build両engine受入までOpen推奨。 |
| [#1430](https://github.com/rhgrive3/actions/issues/1430) | #1293のleft/top修正と#1771の押下中心guardがmainに存在。両公式UI jobでChromium/WebKit計78check成功。今回同一buildで標準reliabilityを3回反復し、さらに最終公開sourceと一致する最終buildでも3回反復、各buildで両engine計234check成功。PRでは負の対照が旧0/2を再現。 | 未完だった同一source両engine反復は最終buildで満了。Close提案。実機iPad確認やCI全体成功とは扱わない。 |
| [#1608](https://github.com/rhgrive3/actions/issues/1608) | [#1729](https://github.com/rhgrive3/actions/pull/1729) の250ms timer pollingと即時HTTP/JS/crash failureはmainに存在。180秒上限は維持。固定HEAD Ranked成功、main c0938a3のPages公開後同一build公開URL四モード成功。 | 四モードは同じboot済みpageを再使用する。3回独立bootや複数runの証拠として数えない。公開同一deployment反復までOpen。 |
| [#1711](https://github.com/rhgrive3/actions/issues/1711) | 既存3head36sampleでwarm遅延はHTML応答後→DOM interactive前に局在。本体bootMsの増加ではない。 | renderer/GPU/process traceと順序対照が不足。原因未確定のためOpen。測定を増やさずに既存JSONだけでこの欠落を解消することはできない。 |

## 公式受入記録

- [PR #1771固定HEAD UI job](https://github.com/rhgrive3/actions/actions/runs/39703943400/job/119579431053): `907d04471f245ec94f0194d75069ed137e8255a5`、contentHash `76965408e33bdb0054cf7f20886bbc17daed4842e4a4d51f9f44fc906ae0b2f2`。Chromium151/WebKit26.5 reliability 2case78check、Chromium rematch3round、source/hash receipt成功。[artifact12395163277](https://github.com/rhgrive3/actions/actions/runs/39703943400/artifacts/12395163277)。
- [統合main UI job](https://github.com/rhgrive3/actions/actions/runs/39717130145/job/119622230494): `c0938a3f84768474df91713f7b372f9d7f8fe96a`、contentHash `e57bdcd82f9b82b0f1ede4491017c3683822ea98ae4e11684b646599822b93e5`。同じ78checkと3round成功。[artifact12400311365](https://github.com/rhgrive3/actions/actions/runs/39717130145/artifacts/12400311365)。
- [#1729固定HEAD Ranked run](https://github.com/rhgrive3/actions/actions/runs/39551864507): `b324e989ae6dee78ddd4b6c97f437bd7408deb67`、専用Ranked成功。
- [main c0938a3 Pages job](https://github.com/rhgrive3/actions/actions/runs/39717130161/job/119621814132): deployと公開URL四モード検証が成功。[artifact12400711001](https://github.com/rhgrive3/actions/actions/runs/39717130161/artifacts/12400711001)、ZIP SHA256 `98fc6cdead01589e6095eccd8d449a5607e3eec11d31c95e505c2aed4760c4f3`（ログ記載値。binary未downloadのため独立digest照合とは扱わない）。

両UI runのworkflow全体には別の失敗があり、上記を全体greenとは扱わない。最新26a4dbのPages/Validateは照合時点でqueued/pendingであり、c0938a3の成功を最新HEADへ転用しない。

## ローカル検証

Node24.19.0、source/fixture関連8ファイルの既存regression **51/51成功、skip0、fail0**。正確なコマンドをJSONに保持。実ブラウザや実機の代用ではない。

## 今回の検証器修正と追加ブラウザ受入

`scripts/check-inkwave-rematch-lifecycle.mjs` に `--engine chromium|webkit` を追加した。既定のChromium・タブレット条件・180msの既存fade・30秒のstrict ring判定・全round/Range条件を維持し、選択engineを結果JSONへ記録する。WebKitにはChromium専用flagsやexecutableを渡さず、profileも分離する。起動失敗時もengine付きfailed JSONを残し、HTTP serverを閉じる。引数・launch設定・両engine起動失敗cleanupを含む関連regressionは **23/23成功**。

追加ブラウザの固定contentHashは `dd84f9593a20aefedd0f497ece4d57b8aa59a20a25f4e63c331fd80f10a054ce`。各supervisorは前後manifest SHA256が不変であることを確認した。

- 標準reliabilityは同じbuildで **3/3反復成功**。毎回Chromium39check＋WebKit39check、合計234check。`pressed-touch-buttons-keep-visible-center-on-hitbox` と `native-taps-and-DOM-touch-repress-reach-actual-Actor-Runner-Character-once` を含む。`--focused-touch-transitions` は該当部分をskipするため使っていない。[反復receipt](reliability-repeated/supervisor-result.json)。
- WebKit full rematchは **3round＋Range＋次Turf隔離成功**、208.6秒、failures/errors空。[receipt](rematch-bounded/webkit-ready/supervisor-result.json)。
- Chromium追加実行は **300秒上限で未完**。round1/2のtouch→keyboard ring判定は成功し、round3のbattle開始待ちで上限に達した。3round/Range全体は完了していない。browserのprocess groupを終了し、失敗receiptを保持する。[receipt](rematch-bounded/chromium-ready/supervisor-result.json)。最初の120秒timeoutを取り消したり、完全成功へ読み替えたりしない。
- 最初のWebKit1.51実行はhost library不足で起動失敗し、Chromium120秒実行はresults待ちで外側deadlineに達した。いずれも証拠を保持する。後続WebKitはPlaywright1.57とローカル展開libraryで実engineを起動した。`PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` はldconfigベースのhost検出のみをskipし、実engineの起動やQA判定はskipしていない。

全1363宣言inputとbuild scriptを照合し、最終commit `0fc2fa5` との差分は `offline-offscreen-budget.mjs` と `range-hitch-tracer.mjs` の2個だった。UI/touch/reliabilityを含む他1361inputは一致する。[照合結果](ci-startup-build-vs-head.json)。このbrowser結果は固定buildの受入であり、最終全treeのbrowser/CI成功とは扱わない。実機iPad/iOS Safariの代用でもない。

browser画像は公開差分へ混ぜず `.browser-evidence/issue-resolution-20261022/` に保持し、[SHA256と元→保持path一覧](ci-startup-browser-artifacts.json) を残した。元のresult JSONにある画像pathはこの一覧で対応付ける。

## 最終sourceによる #1430 受入（親agent追補）

[最終build照合](final-build.json) は公開commit `f9d744eba5cbd86ef9a4a77e9a4dbd61c48d4d90` とローカル `0fc2fa5` の同一tree `9aa183e43a45516344c81a064470c5913cd8a06b` を確認し、最終buildの宣言input1362個＋build script、artifact2016個を照合した。contentHashは `46e01879c9e4facd3ef99bdeb095b5962098036021ff6dd1a4685f44b8a0a3c4`。

[最終reliability反復](final-reliability.json) はこの最終buildで標準verifierを3回実行し、全てChromium39check＋WebKit39check、計234check成功、errors空、manifest前後不変を記録している。これを #1430 の同一source両engine反復の閉鎖根拠とする。旧snapshotの部分結果を最終sourceの完全受入へ転用したものではない。#1432の3round/Range全体や、実機iPad・公開deployment・CI全体の成功は別条件であり、このreliability成功から主張しない。

## #1711で欠けている診断

必要なのはnavigation要求→DOMContentLoadedまでのChromium CDP traceとrenderer/GPU/process CPUの同時記録。reload、同じcacheを使うnew-page、cache保持browser再起動をABBA等の順序対照で比較し、元のsource/hash、low/viewport/cache条件と180秒等の既存gateを維持する。traceは観測負荷を持つため通常の性能receiptと分ける。既存sampleへの後付けtraceは取得できず、現時点では原因確定もruntime最適化も行わない。本家ゲームロジックを変える作業ではなく、実機性能値の主張もしない。

