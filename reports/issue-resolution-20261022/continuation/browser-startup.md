# Browser/startup継続受入（2026-10-22）

## #1608: 同一公開deploymentの独立boot反復

実公開URLは `https://rhgrive3.github.io/actions/`、source epochは `c0938a3f84768474df91713f7b372f9d7f8fe96a`。contentHashは `e57bdcd82f9b82b0f1ede4491017c3683822ea98ae4e11684b646599822b93e5`、inputHashは `2908ffec19aadcce22ee17db290ca19f553addd8c4b07addd10c06f44c9ac97e`。1357宣言input＋build scriptの1358blobをGitの同一source SHAと全照合した。最新main26a4dbとは39input差があり、これは最新mainの公開受入ではない。

新CLI `scripts/check-inkwave-ranked-public-boot.mjs` は、そのmanifestに固定し、新しいcontextからbootを3回実行する。reload・自動retry・response差替え・game状態変更はない。既存 `observeRankedBoot` の180秒readiness、250ms timer、critical HTTP/script/pageerror/crash/close・loader failureを保持する。helper自体は公開source c0938a3と全byte同一。各contextでdocument/JavaScriptの482responseのbyteをartifact hashと照合し、前後8回のmanifest同一を確認した。Chromium143、3/3 ready、errors/failures0。完全なRanked gameplayや物理端末性能をこのprobeで受入したとは扱わない。c0938a3の既存公式公開offline四mode受入は前回報告に保存されている。専用Ranked全suite成功はb324の別HEADであり、c0938a3のrequired suite成功とは数えない。今回は独立boot3回と、その公開source c093に固定したrequired dedicated Ranked suiteを新たに完遂した。

原HTTP503は既存traceで `runtime/audio/weapon-recipes.mjs` に局在し、既存mainのfail-fast観測/loader failureとtimer pollingで、明示配信エラーを180秒boot待ちに変換する問題を修正済み。インターネット配信で将来の503が絶対起きないとは主張しない。#1608は原因・対応・同一deployment反復が揃った。同一HEADのrequired dedicated Ranked suiteも今回完遂した。隔離c093 worktreeからproduction buildを作成し、publicと同じinputHash/contentHash/revision、全2006artifactと1357宣言inputの完全一致を追加確認した。source suiteは384MiB制限によるV8 OOM/90秒の人工timeout試行も保存し、未完・OOM・requiredReferenceでskipのfileだけ1024MiBで再開し、47 Ranked＋原boot/sequencingの49fileすべて成功、計495assertion、skip0、source byte不変を確認した。emitted3境界も同じc093 buildで54assertion成功・skip0・manifest不変を確認した。元c093の専用scriptを変更せず、local offline4＋実2browserのonline4room、Rainmaker実weapon/wall・Clam void・terminalも318.26秒で全成功した。context2/2 ready、errors0、relay200ms、manifest不変。[required suite全体](c093-required-suite.json)、[source全495assertion](c093-source-tests.json)、[dedicated全mode生JSON/command/画像trace hash](c093-full-browser.json)。

環境差は隠さない。原workflowはNode22、local source/build/emitted/dedicatedはNode24.19.0、esbuild0.28.2、Playwright1.62.1/Chromium151.0.7922.34。公開独立bootはPlaywright1.57/Chromium143.0.7499.4だった。同一source/公開artifactを照合したが、全c093 Validateやmain-weapon jobがgreenとは主張せず、対象は元 `.github/workflows/validate-inkwave-ranked.yml` の専用suiteと公開boot。

最初の追加probeはboot-readyまで成功したが、optionalの大きなsource-bank/media bodyまでinspectorから採録しようとしてcache evictionでharness失敗となった。元boot条件は変えず、追加byte attestationを本来のcritical HTML/JSに限定して完全3反復を再実行した。初回失敗も別ディレクトリへ保持した。

17/17の既存・追加source regression成功。source漂流（同じ出力byteでもsourceが違う）、manifest改変/escape、実response改変を拒否する。詳細は [public-boot.json](public-boot.json)。raw JSON/ZIPは `.browser-evidence/continuation-20261022/public-boot` に保存し、サイズとSHA256をreceiptに列挙した。

## #1432 / #1711

Chromiumの最初の600秒full rematchはCPU競合条件で2roundの厳格なring/opacity/alignment判定が成功した後、3roundのresults待ちで外側timeout。application assertion failureとして数えず、未完試行として保存した。CPUを専有する枠で一度だけ再実行し、同じfinal build（contentHash `46e01879c9e4facd3ef99bdeb095b5962098036021ff6dd1a4685f44b8a0a3c4`、source `f9d744eba5cbd86ef9a4a77e9a4dbd61c48d4d90`）で3round＋Rangeを494.94秒で完全成功した。600秒外側上限、strict ring 30秒条件はそのまま、errors/failures0。raw receiptは `.browser-evidence/continuation-20261022/rematch-chromium-exclusive/`。同じfinal buildのWebKit26も3round＋Range＋次Turf隔離を198.74秒で成功、errors/failures0、同じmanifest SHA256不変を確認した。これで同一source・同一buildで両engineのfull受入が揃った。[両engine receipt](rematch-final.json)。旧WebKit予備build dd84の成功を最終buildへ転用したものではない。

#1711の追加harnessは同一HTTP-cache contextでABBA/BAABのreloadと旧pageを閉じたcached-new-pageを対照にする。page close/new-page作成の時間と前後process CPUも別記し、navigation外に移動したcleanup時間を省いて改善したとは扱わない。CDPのrenderer/GPU-process CPU countersとnative traceを取得し、HTML responseEnd→domInteractiveの区間をNavigationStartに結び付ける。nested trace recordsはunionし二重加算を避け、recorded intervalをCPU利用率や因果証明とは呼ばない。4/4のtrace-summary境界/時計/重複/実script URL保持回帰は成功。元issueのsource `856a269afd61c5e3059418f4712d64ebec35b4c6` を隔離buildし、既存公式のcontentHash `d3604606f2c693eb26e599a3001f404e2e78c211fd75e04dc9800ffd34ee71b9` を完全再現した。公式同版Playwright1.62.1/Chromium151.0.7922.34で10/10 navigation成功、520.74秒、manifest不変、trace dataLossなし。[原build trace診断](startup-reload.json)。


HTTP cacheのHTML応答後→DOM interactive中央値は、cold2回が129.65ms、reload4回が14.153秒、cached-new-page4回が224ms。reload全4回でGPU Processの `GpuChannel::OnDestroyCommandBuffer` が同区間の76.4–98.0%を占めた。代表例ではrenderer mainの `content.mojom.NavigationClient` が14.772秒wall / 22ms thread CPU、重なるGPU破棄が13.886秒wall / 504ms thread CPU、その完了後にHTML本文処理が進む。これはnative teardown待ちの実観測であり、長いwall区間をCPU使用時間とは呼ばない。全warmのHTTP body0も維持した。URLを伴うscript traceも保存し、単にゲーム本体bootの増加やネット転送量へ置き換えた説明はしていない。

cached-new-pageはnavigationだけ見ると速いが、page作成中央値13.039秒に旧pageの整理が移る。これを含めたmenu総時間中央値48.756秒はreload51.049秒に近く、実際にruntimeを高速化した受入ではない。ABBA/BAABで順序を反転してもreloadの長いnative破棄を再現した。最初のorder中にはsource/emitted CPU regressionが並走し、BAABのreload時には終了済。環境receiptに時刻を残し、絶対時間や物理端末性能へ外挿しない。

最初の追加observerはcold boot自体成功後、menuまで不要なGPU traceを続けて64MiB保護上限に達した。これをfailedで保存し、観測を本来のHTML→DOM interactive区間で停止するようharnessを修正した。menu-ready180秒gate自体はその後も完遂する。さらに同じ元856/d360・Chromium151でfresh persistent profileから自然installを行い、current-revision CacheStorage486entriesとcontrollerを確認した。cold＋controlled SW reload2回の3/3が151.80秒で成功、trace dataLossなし、manifest不変。2reloadともmain Document fromServiceWorker=true、HTTP body0で、HTML→interactive13.827/15.014秒にGPU command-buffer破棄12.689/12.802秒が重なる（91.77%/85.27%）。[独立SW native trace](startup-sw.json)。HTTP/SW両方で旧GPU資源整理を伴うnative navigation待ちの局在を確認した。persistent browser restart自体の新native traceはなく、以前の成功記録のみ。runtime変更・実端末高速化・driver内部の全待ち原因まで確定したとは扱わない。
