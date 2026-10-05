# INKWAVE — Loading / Cache / PWA Startup report

**判定: ローカル修正・静的検証・模擬回帰は実施。native browser / PWA / 実機での受入検証は未完了。リリース可と判定していない。**

作業日: 2026-10-04 JST。対象branch: `inkwave/astra-loading-cache`。GitHubへのpush・PR・merge・Pages更新は行っていない。通常のゲームループ、戦闘物理、gyro権限、background lifecycleは対象外。

## 1. Baseline、再現性、測定の制約

| 項目 | 値 |
|---|---|
| Repository | `rhgrive3/actions` |
| 開始時に確認したmain SHA | `5e28dbd16f7829aebd88052ff5f7fdf71f39fdad` |
| Baseline revision | `ff4ef2a893d73bdf9e4a0f9c1120cc69a4727ccf14d2e98ee612c9a46fa9cb41` |
| 修正後replay revision | `144a67d52206869da5632ca06cc0fe23069a48169d7021653ff02284198e6575` |
| 修正後replay contentHash | `864bc85e0d683e272d92b755a5e4c5d90dbdd2d6a8ccc2125d9d469d0e7785ec` |
| Baseline配信成果物 | Actions run `37124943939`, artifact `11273759557` |
| Source SHAの照合用成果物 | run `37124943932`, artifact `11275370335` |
| ローカルcommit | このレポートを収録するbranchのHEAD。別添handoffにもSHAを記録 |

直接cloneはDNS/通信制限で失敗した。GitHub connectorの読み取りで、実際のmain commitのpayload・signature・treeを取得し、Git object SHAを照合した。変更対象の既存3ファイルもGit blob SHAを照合した。未取得のtree/objectは元のSHA参照を保持する**部分的なobject checkout**であり、完全cloneや通常のclean checkoutだと主張しない。他branchの成果は参照していない。

baseline配信成果物の全artifact hashを検証し、minify後・revision付与前のstageを復元すると、元のrevisionが正確に再現した。そのstageへproduction buildと同じloading adapterを適用し、独立した2回のreplayで374 artifactが一致した。ただし **esbuildによるfresh source buildと、全upstream入力を含む完全なexact-source browser attestationは未実施**。replay manifestにもその区別を記録する。[provenance](loading-cache/provenance.json)、[replay](loading-cache/replay.json)、[determinism](loading-cache/determinism.json)を参照。

実ブラウザ試験はChromium `144.0.7559.96` で試みたが、管理policyの `URLBlocklist` によりlocalhostのHTTPSも `net::ERR_BLOCKED_BY_ADMINISTRATOR` となった。WebGLもこの環境では利用できない。policyを変更・回避していない。実ゲームページはロードできていないため、cold/warmの起動秒数、実転送量、native Cache Storage容量、GPU時間を作って記入していない。[実行記録](loading-cache/native/results.json)の失敗サンプルはエラー画面を含み得るため、ゲームの転送量として集計しない。

## 2. 結論 — 「初回が重い」と「毎回繰り返す」を分離

**毎回繰り返す経路として確認したもの**は、従来SWのキャッシュ命中後の再fetch・cache.putである。実際のbaseline workerを動かす契約fixtureで、アセット140リクエストのwarm workloadを3回繰り返し、毎回140 fetch呼び出し・138 cache.put・3,642,014 bytesの本文再コピーを再現した。修正後は追加entry分を含む141リクエストに対して、その3項目がいずれもゼロになった。これは**SW内部の重複処理削減**であり、140回の外部通信削減や3.64MBの実転送削減を意味しない。旧fetchにもHTTP cacheが効く場合がある。

**初回・再起動の両方に残る構造**は、約3MBのJS graphと、メニュー表示前の手続き生成・全world/attract scene・shader warmupである。cache hitはこの処理を消さない。ここはnative CPU/GPU計測が成立せず、各処理の寄与率やユーザーの待ち時間への支配性を定量的に確定できていない。安全な根拠なしで131本のpreloadを削ったり、全sceneをbattle開始へ押し付けたりはしていない。

固定のready待ち250msを0msのtask yieldへ変更し、最初のshellと失敗時のUIを追加した。ただしentry側には描画機会確保の最大2フレーム／100ms上限のyieldがある。**実測のnet 250ms短縮、あるいは何%高速化という結論にはしていない。**

## 3. Current boot sequence とcritical path

変更前の配信済みmainを追った順序は次の通り。細かい22 await境界とsource fragmentは [boot-sequence.json](loading-cache/boot-sequence.json) に保存した。start/end/CPU/compile/転送/parsed bytesの未観測値は `null` とし、ファイルサイズから推測して埋めていない。

| 段階 | 処理と保存先 | menuを阻むか | first battleとの関係 / lazy候補 |
|---|---|---|---|
| HTML / CSS | revision base、import map、styles。HTTP cacheまたはSW | CSSはrender-blocking。HTMLだけで即描画とは限らない | Tier 0。CSS依存を壊す削減はしない |
| module graph / patch bootstrap | 131 modulepreload、Three、patch installer、profile JSON、main import | main評価前にgraph解決・instantiate/evaluateが必要 | patch identityを維持。UI/battle境界の再設計候補 |
| profile / settings | 小さなlocalStorage JSON。MAPS全件のlayout SVG thumbnailを手続き生成 | boot先頭で実行 | 全stage画像のdownloadと混同しない |
| loading UI | Menus、HUD、Dioramaを生成しloadingを表示 | titleではなくloading | UIだけの先行初期化候補だが全面分離は未実装 |
| renderer / input | WebGL renderer、scene、camera、input、shadow cache | 現状menu前 | battleでは必要。通常loopやgyro処理は変更なし |
| module loading | character / FX / environment / audio / music / props | awaitされる | audioファイルのdecode実測とは別 |
| murals / texture library | font待ち、canvas生成、procedural GPU texture、render/readback | awaitされる | 永続化は未導入。再生成時間は未計測 |
| stage / world | selected layout、level、paint atlas、props、nav、minimap、lightmap JSON/PNG | menu前に構築 | 選択stage確定後へ分離する候補。stutter比較未実施 |
| environment / systems | environment map、projectiles、FX、camera rig、showcase、network session | menu前 | 一律lazy化していない |
| attract / warmup | attract match、warm meshes、compileAsync、3フレーム | menu前 | shader warmupを削除していない |
| ready / menu | 旧250ms timer、title/main、loop開始 | この終了まで通常menu操作を待つ | timerだけ0ms task yieldへ |
| first actual battle | startMatchの非attract完了と描画機会 | menuとは別 | separate mark。native battle regressionは未実施 |

修正後は `HTML shell → startup entry → 既存bootstrap → 上記engine boot → title/main → menu idle時にSW登録`。読み込みUIが実際にmountされるまでshellを維持し、boot失敗時は消さず手動再試行を示す。boot専用の不透明fadeをUI引き継ぎ時に解除するが、以後のbattle transition処理は変えていない。

### 指標の意味

`T_shell` はshellを作った時点と次フレームのproxy、`T_menu_interactive` はtitle/mainのDOM状態を確認した後の描画機会proxy、`T_first_battle_ready` は非attractのstartMatch完了と次フレームproxyとして分離した。**DOM mountは実画面paintや入力遅延の保証ではない**。native harnessではFCP、Navigation Timing、CDP、long task、実際のstartMatchを別に収集する。初期loading画面やattractをmenu/battle-readyとして数えない。

詳細profilerは `?startupProfile` で有効化。最大256 phase、512 resource、512 long task、120秒の観測期限を設ける。通常実行では詳細計測を行わず、wrapperは元の戻り値・Promise・例外を保つ。phaseのwall durationとCPU timeは同じではない。resource decodedBodySizeも、実際にparserが処理したbytesではない。公開APIで取れない値はtrace/独立計測が必要であり、ゼロに置き換えない。

## 4. Dependency graph / asset inventory / tier

[解析レポート](loading-cache/dependency-graph-report.md)、[before graph](loading-cache/before/dependency-graph.json)、[after graph](loading-cache/after/dependency-graph.json)にstatic import、literal dynamic import、loadModule候補、解決できない動的式を別種のedgeとして残した。static依存のmissingは0。非literalな2箇所のdynamic importは「解決済み」と偽装せず、既存のoptional mode loaderとして残す。

buildの131 preloadは静的graphに加えliteralのboot loadを辿る。bootに必要なmoduleまでまとめて削るとwaterfall化やbattle待ちへ移る可能性があり、native A/Bがない今回は維持した。`ui/menus.js` の静的closureは14ファイル・329,683 bytesでThreeを含まないが、これは**将来の分離境界の候補**であり、現行API依存を含め完全なmenuが単独動作すると実証したわけではない。

| Tier | 本来の役割 | 現在の扱い |
|---|---|---|
| 0 | HTML、shell、最低限のUI styles | inline system-font shellを追加。既存blocking CSSは維持 |
| 1 | title/menu、設定、必要なUI data | 現engineと結合が残る。先行interactive化未完 |
| 2 | 初戦のscene、render、collision、paint、shader、selected stage | warmupを維持。SWはcoreを確実に保存 |
| 3 | 特定mode / stage / optional表示だけのcode・画像 | 既存lazy経路を維持。未訪問optional内容のoffline保証なし |
| 4 | menu操作中に低優先度で準備できるもの | SW core installはmenu idleから二並列。既存lobby preloadは維持 |

完全な全asset一覧は [before inventory](loading-cache/before/asset-inventory.md) と [after inventory](loading-cache/after/asset-inventory.md)、機械可読版は同ディレクトリのJSON。各ファイルのraw/gzip9/brotli6、hash、予想phase/tier、cache方針を含む。圧縮値はローカル算出であり実ホストのContent-Encoding/転送量ではない。

| baseline種別 | logical file数 | raw bytes | 主なfirst-use |
|---|---:|---:|---|
| JS / MJS | 145 | 3,234,714 | boot graph、残りはoptional / worker |
| CSS | 4 | 388,110 | UI。HUDのCSS importもcore対象 |
| fonts | 2 | 46,056 | UI / muralのfont待ち。shellはsystem font |
| images | 25 | 3,666,174 | lightmap、stage選択カード、news、PWA icon等。全件boot downloadとは限らない |
| JSON | 8 | 189,774 | profile、lightmap、manifest、未読のreference/developer dataも含む |
| HTML | 1 | 12,354 | navigation |
| Web manifest | 1 | 800 | PWA metadata |

独立したmodel/audio binaryはinventoryにない。shaderは主にJS中、geometry/texture/audioは手続き生成経路を含む。既存audio/musicに `decodeAudioData` 呼び出しは見当たらず、大量audio binary decodeが起動主因だとする証拠はない。これは実機audio再生の回帰合格を意味しない。

## 5. Before / after benchmark

### 5.1 静的byte / graph — 実ファイルから算出

| 指標 | before | after | 判断 |
|---|---:|---:|---|
| modulepreload hints | 131 | 131 | A/B根拠なしで削除していない |
| initial JS URL数（entryとhintsの和集合） | 131 | 132 | 小さなstartup entryが1本増える |
| initial JS raw bytes | 3,058,513 | 3,070,663 | +12,150 bytes、約0.40%増 |
| 同JSのローカルgzip9合計 | 1,032,607 | 1,036,704 | 実転送量ではない |
| critical HTML bytes | 12,354 | 13,748 | shell追加と登録整理 |
| logical files | 186 | 187 | duplicated revision tree、identity等を除いた比較 |
| logical raw bytes | 7,537,982 | 7,590,510 | 総payload縮小を成果としない |
| logical gzip bytes | 4,875,762 | 4,895,376 | 同上 |
| tree-shaken Three module bytes | 607,373 | 607,373 | 既存最適化は維持 |

証拠: inventories、[budget.json](loading-cache/budget.json)。**request countが全体として減った、initial JSが小さくなったという修正ではない。**

### 5.2 SW warm contract workload — 各3回、同じ結果

実baseline/candidateのbyte列を読み込み、Node VM上のworker + Cache API契約fixtureへ、preload graph、4 styles、2 fonts、profile、選択stageのlightmap JSON/PNGを投入した。navigationはこの表に含めない。[生データ](loading-cache/cache-model.json)には全URLとdestinationを収録。

| 1回のwarm workload | before | after |
|---|---:|---:|
| page asset lookup数 | 140 | 141 |
| fetch呼び出し数 | 140 | **0** |
| うちscript fetch呼び出し | 131 | **0** |
| cache.put呼び出し数 | 138 | **0** |
| Cache Storageへ再コピーする本文bytes | 3,642,014 | **0** |
| fixture内保存本文bytes | 3,654,368 | 4,173,822 |

モデルはHTTP cache、圧縮、native SW lifecycle scheduling、ブラウザDB overhead、wire transfers、GPUを再現しない。数値は契約実装の比較であってブラウザ回線の計測ではない。初回の新core installが旧HTML-only installより多く保存するtradeoffも表に残す。

### 5.3 New version contract workload

candidateのcore bytesから1moduleだけ変更した**合成revision**で検証した。実deploy、実source commit、native updateではない。152 coreのうち151ファイルを新版hash照合後に再利用し、fetch呼び出しはindexと変更JSの2回。cache.putは155回、コピー本文4,160,308 bytes。旧・新snapshotとmetadataの本文合計8,334,021 bytes、cache数3（snapshot2 + state1）。更新時copy/hashのCPU負荷は残る。

### 5.4 JS parse相当の限定測定

Node `v22.16.0` / V8 `12.4.254.21-node.26` の新規processを各5回起動し、同じinitial graphから `vm.SourceTextModule` を構築した。link/evaluateはしない。GPU、ブラウザcode cache、実ゲーム初期化も含まない。

| 指標 | before median | after median |
|---|---:|---:|
| ESM object construction | 72.260588 ms | 63.320578 ms |
| profile JSON parse | 0.121315 ms | 0.118517 ms |

beforeの範囲は62.194142〜74.492710ms、afterは61.947750〜64.531344msで重なり、測定順序やホスト変動もある。JSが減ったわけでもない。**この差をアプリの12%高速化と解釈しない。** [cpu-before](loading-cache/cpu-before.json)、[cpu-after](loading-cache/cpu-after.json)。

### 5.5 Native cold / warm / PWA / update matrix

| 必須シナリオ | harness / 検証範囲 | 実測結果 |
|---|---|---|
| Cold（HTTP/SWなし） | native起動を試行 | 管理policyで遮断 |
| Warm HTTP / 通常reload | route interceptionなしで同contextをreloadする実装 | 未実施 |
| Hard reload | CDP bypass相当を区別する実装 | 未実施 |
| Installed / SW warm | install・prime・controller・reloadを区別する実装 | native未実施、契約fixtureのみpass |
| Offline | context offline、snapshot coherence、message確認を実装 | native未実施、契約fixtureのみpass |
| SW update / new deploy | 同originで旧→新、waiting、旧client終了、自然activationを確認する実装 | native未実施、合成update fixtureのみpass |
| 通常Chrome / Safari | Chromeは遮断、Safariなし | 未検証 |
| PWA standalone起動 | 実Home Screen/OS process起動が必要 | 未検証。viewportやUA変更を代用しない |
| ブラウザ完全終了後の2回目起動 | disk HTTP/code cache、process再生成を別途測る必要 | 未実装・未検証。reloadと同一視しない |
| 4G / slow network、4x/6x CPU | CDP設定のrunnerを実装 | 未実施。実機性能とは呼ばない |

このため、nativeのtransferred bytes、request/cache hit数、DOMContentLoaded、FCP、各T指標、JS execution、long tasks、memory、storage estimateはbefore/afterとも **N/A**。[native-scenario-matrix.json](loading-cache/native-scenario-matrix.json)は未測定をnullで保持する。

runnerはローカルHTTPS HTTP/1.1とgzip6、revision側 `max-age=600`、root `no-cache` を両版同条件で使う。これを実GitHub Pagesのheaderと称しない。worker内部fetchへのCDP network shaping適用は保証されず、worker全体の帯域試験は許可された環境のOS側shaping等でも確認が必要。harnessはsyntax・server機能を検証したが、**end-to-end runner自身の正常完走も未検証**である。

## 6. 18原因候補の判定

| # | 候補 | 観測・反証・残る課題 |
|---|---|---|
| 1 | SWが毎回大量fetch | baselineコードと3回の契約実行で確認。warm hitのfetch/putを除去。wire量は未測定 |
| 2 | cache-busting URL変化 | selected lightmapだけ重複queryを確認・除去。random timestampが全URLに付く根拠はない |
| 3 | 毎build全revision変化 | 内容が変わればtree全URLが変わる設計。任意timestamp由来とは確認していない。同一入力replay2回は一致 |
| 4 | index過剰preload | 131本を確認。過剰度・native contentionのA/Bがないため維持 |
| 5 | hit後も大量JS parse | initial raw約3.06MB。Node constructionを別測定。browser code cache / compile寄与は未測定 |
| 6 | procedural generation | thumbnails、murals、textures等の経路を確認。寄与時間は未測定 |
| 7 | texture decode | selected lightmap/image経路あり。decode時間とproceduralGPU生成時間は未分離 |
| 8 | audio decode | binary audio/decodeAudioDataのboot経路を見いださず。procedural audioのCPU寄与と再生回帰は未検証 |
| 9 | shader compile | menu前compileAsync + warmupを確認。削除せず維持、native compile時間未測定 |
| 10 | WebGL warmup | 3frameとwarm meshesあり。後のstutterを避けるため維持 |
| 11 | stage construction | menu前 `_buildWorld` を確認。layout/paint/props/navの寄与は未測定 |
| 12 | large JSON parse | profile約40KB。inventory中の大きいreference JSONを起動読込と誤認しない。Node profile parseは限定測定 |
| 13 | unnecessary systems init | gameplay系がmenu前に存在。不要性の単独実証なし、全面lazy化未実施 |
| 14 | PWA SW update check | 登録をengine/menu idle後へ。ブラウザ自身のupdate checkコストは未測定 |
| 15 | Cache Storage copy | 旧warm時3.64MB本文再コピーをモデル確認・除去。新versionのhash/copyは残る |
| 16 | duplicate initialization | 新entry/登録は一所有者・fixtureで重複防止。従来ゲーム全体の重複生成を完全反証してはいない |
| 17 | full battle scene before menu | attract/world/FX等を確認。現revisionでも残る、重要な未解消項目 |
| 18 | eager models/textures | standalone model binaryなし。procedural character/texture等はeager。全面分離未実施 |

## 7. Production変更とcache correctness

### Immutable treeを維持するSW

root HTMLはnetwork revalidationを行い、4秒deadline/通信失敗/5xxでは完全な保存snapshotへfallbackする。current revisionのallowlist assetはcache-first。URL命中時のfetch・digest・storage再コピーをしない。初回missはSHA-256とbytesを検証し、同時missをまとめる。JSONの空destinationも対象にする。

installは `candidate → index検証 → coreを二並列で検証/保存 → complete marker` のtransaction。失敗時は並列処理の終了を待って候補だけを削除する。旧完全版を破壊しない。completeの判定はmarkerだけでなく必須keyの存在も見る。storage state読み取り失敗・metadata喪失時に旧版を誤削除せず、active navigationで修復できるようにした。

旧revisionのmoduleを新revisionの同名moduleへ置き換えない。新版indexを旧snapshotへ書き込まない。hash一致した本文を新版のURLへ再利用することと、同URLの意味を変えることを区別する。worker自身はrootに一つ配置し、既存のversion tree / base / import mapを維持する。

`skipWaiting` と自動reloadは使わない。waiting中は通知を維持し、既存client終了後の自然activationに任せる。旧legacy cacheの削除は新workerのactivation後、当アプリのentryだけに限定する。URLのscopeはrevision baseでなく実navigation URLから算出する。詳細は [cache-policy.md](loading-cache/cache-policy.md)。

### Startup / build / identity

Acorn ASTで実際のminify後mainの形を検査し、期待したGame/boot/await/warmup/lightmap構造がずれたbuildはfail-closedにする。単純な全体文字置換で他workstreamのゲームロジックを変えない。full sourceの互換性checkやThree tree shakingは変更しない。

loading adapter・runtime・SW・shell・Acorn/licenseをinput identityへ追加し、既存exact-source checkerのnamespaceを拡張した。manifest内hashを偽造してもHEADのGit blobと一致しなければ拒否する回帰テストを行った。Acornはbuild/test用で配信assetに含めない。

## 8. Cache budget / performance gates

| deterministic gate | 上限 / 現値 |
|---|---|
| existing modulepreloads | 最大131 / 131 |
| initial JS raw | 最大3.2MiB / 3,070,663 bytes |
| new startup entry | 最大12KiB / 上限内 |
| critical HTML | 最大24KiB / 13,748 bytes |
| core precache | 最大5MiB / 152 files・4,138,658 bytes |
| stamped root SW | 最大64KiB / 40,478 bytes |
| revision asset body + index | 最大12MiB / 7,547,610 bytes |
| revision保持 | 最大2snapshot + 小さなstate cache |

CIで呼び出せる `scripts/check-inkwave-startup-budget.mjs` を追加。graph、CSS @import、descriptor hash、revision/index整合、single SW ownerも検証する。GitHub workflowやCI設定への書き込みはしていない。

native計測の基準が成立していないため、`T_menu_interactive` に見せかけの合格秒数は設定しない。次の受入条件は、同じ品質・stage・CPU/network条件の複数回native比較で、menu改善とfirst battleの非悪化を確認した上で時間目標を固定すること。現在のbyte gatesは肥大化防止であり、現状の約3MBが理想的という承認ではない。

24MiBは管理対象2revisionの**アセット本文**上限で、HTTP cache、legacy移行分、DB overhead、headers、他アプリを含むorigin総使用量の絶対上限ではない。quota/evictionが起きてもonline応答を壊さず、offline可能と誤表示しない。巨大binaryをlocalStorageに保存する変更はない。

## 9. Regression / 最終レビュー

| 実施した確認 | 結果 | 限界 |
|---|---|---|
| Node adapter / SW tests | **35 pass, 0 fail, 0 skip** | SWは契約モデル、実workerではない |
| Python harness infrastructure | **4 pass** | runner全体のnative成功ではない |
| Native DOM fixture | **12 checks pass** | about:blank、bootstrapを置換、一部fake SW。full gameではない |
| byte/dependency/identity budget | pass | 実download404判定の代わりではない |
| 2回の独立replay | 374 artifacts一致 | fresh esbuild/source rebuildではない |
| warm workload反復 | 3回一致 | 内部呼び出し数/本文コピーのモデル |
| native gameplay / PWA / offline | **blocked / not run** | 出荷受入の残項目 |

Nodeでは変更mainから計測wrapper等を除いてASTを比較し、明示したready timerとlightmapのcache/query以外がbaselineと同じことを確認した。`boot` / `startMatch` / `_loadLightmap` 以外のmethodsはbyte同一。shader warmupをbattleへ繰り延べていない。

失敗ケースは404、digest mismatch、quota、partial eviction、metadata喪失、state read失敗、concurrent miss、many waiting candidates、query/range、cross-origin、mutable root、other-app cache、Vary応答、旧版fallbackを含む。coreにHUDのimported CSSとempty-destination JSONが欠ける問題、lightmapのprecache key不一致、install競合による削除後の再作成、早いPlay操作後のSW登録、すでにinstalling中のlistener取り逃がしもレビューして修正した。

ただし、初回のcore保存は追加のread/hash/writeを発生させ、安定したoffline snapshotと引き換えに初回IOを増やす。menu idle・二並列で制限したが、slow mobileでの実CPU/IO contentionとユーザーがすぐbattleへ入った後のinstall競合は未計測。巨大なpersist layerや無制限runtime cacheは導入していない一方、SWコードの複雑さが増した点はtradeoffとして残す。

## 10. iOS / Safariと未完了項目

2026-10-04 JSTにWebKitの公式storage policyを再確認した。公開説明ではHome Screen Web Appもbrowser相当のquota枠だが、best-effort保存の消失はあり得て、quotaは容量保証ではない。Cache APIとHTTP cacheを同じ保存層だとは扱わない。本実装はquota failure・snapshot消失を処理するが、Safari/standaloneでの実互換性とeviction後復旧は未検証である。根拠は [WebKit: Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/)（2023-08-10公開、上記日に内容確認）。

SW lifecycleは [Service Workers Editor’s Draft](https://w3c.github.io/ServiceWorker/)（2026-09-17版）と照合した。Editor’s Draftを全browserの実装保証として扱わない。特定iOS版の実測数値は持っていない。

**残る受入条件:** 完全source checkoutでのfresh buildとexact-source browser validation、Chrome/Safari/Android/iOS standalone、cold/warm/reload/hard-reload/process再起動、offline menu、実deploy相当update、assets/fonts/audio/stage/dynamic importsの404と画面・操作、lightmap indexの実ホストredirect/header挙動、profile付きcritical path、CPU/network throttle、first-battle stutter/memory/storageの複数回比較。加えて、menuと全scene生成の分離、131 preloadの根拠あるA/Bは未完了。

本branchの成果は**反復キャッシュ処理の修正、coherent offline/update architecture、起動状態の可視化、再現可能な測定・回帰一式**である。ユーザーが感じる毎回の待ち時間を実機で何秒短縮したかの最終証明までは達していない。実行手順と証拠の読み方は [loading-cache/README.md](loading-cache/README.md) にまとめた。
