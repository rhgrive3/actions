# INKWAVE runtime performance / UI responsiveness

UI targetを入力task内で更新し、非表示menuの仕事とdisposed menuのlistener/observerを解放した。high-quality実gameの3 repeated windowsで不要なbattle menu tick/cursorが各30→0、gameplay snapshotとrendererのdraw/resource snapshotは一致。全INKWAVE browser regressionsと51 focused testsが合格。全体FPS改善は主張しない。

## Baseline・scope・identity

- 開始時main: `5e28dbd16f7829aebd88052ff5f7fdf71f39fdad`。
- 専用branch: `inkwave/runtime-performance-ui`。
- 検証対象branch code source: `2a103fcfa60680b46304e56767bb65b8d92d96a1`。
- 実際のPR merge-tree source: `740568b41b0f28735d05d1d442f01e044d6d3bbc`。parentsはmain `0859bf4fab08edc74c25fcb790e662a748a91ec9` と上記branch code source。run.headShaと配信されたSOURCE_SHAを取り違えず、Git tree/blobと全build artifactを検証した。このreport commitはdocumentationのみ。最終PR sourceの検証receipt/runはPRにも記録する。
- production build contentHash: `f44130bdafdb17735dd03c68130e851f7acc1e58f15d5bd504f33c7f2c1e9fbc`。
- native rendererの配信SHA256はbefore/afterとも `608c0c9b06f601c36554eb85ca634725684530c2f81d6fb76bd958cec87bf1ce`。rendererのproduction変更は最終diffから除いた。
- `inkwave-public/`、Movement/Network/Weapon、初回・2回目ロード、SW/PWA・asset cache、build scriptは変更していない。品質・解像度・simulation/network Hz・physics・animation・particle数・visible effectも変更していない。
- 作業中mainが `0859bf4fab08edc74c25fcb790e662a748a91ec9` へ進んだ。読み取り専用比較では今回のruntime/UI・harness・workflow範囲に重複変更なし。開始時baselineを維持し、mainや他部門working treeは変更していない。

## 原因とproduction fix

### UI selection → outline

native `_setFocus` は選択stateを即時変更するが、geometry・outline targetは次のowner tickで初めて更新していた。focus/input mode変更時、同じJS task内でnative cursorへ正しいtargetを渡す。touchの独自row highlight中もlogical target elementとrectangleを更新する。新しいrAFは追加せず、選択stateを遅らせない。selection state→menu focus→synchronous getBoundingClientRect→native Spring target→inline transform/size→computed styleまで同taskで追跡し、その後のpaint/compositeはbrowserに渡す。async DOM measurementや二重rAFをtarget更新経路へ足していない。input-mode callbackが同じfocus elementをreflowする場合もcacheをinvalidateして、x/y/width/heightのtargetを同taskに更新する。追加negative controlは修正前にx=3のまま残り、正しいx=93との不一致を再現した。

mode切り替えはnavigationより先に呼ばれる。旧targetでspring clockを消費すると、新選択への最初のvisual stepが次frameに遅れる。またtouch→keyboard/pad時に旧focusへ枠が先にsnapする問題もnegative testsで再現した。mode更新ではspring時間を使わず、最初に枠が表示される際のsnapを実際のnavigationまで保留する。自然なCSS入場animation完了後の4 mode-switch probesで確認する。

springはold visual positionからnew targetへ動く。input taskで進めたelapsed分を次のcursor tickから差し引き、二重進行を防ぐ。同一clockの連続入力、snap、frozen、deselect、screen変更をregressionで確認する。

さらにnativeの180ms opacity transitionにより、logical off後もpaint済みの古い枠が残っていた。paintをprimeしたnegative controlで3/3再現した。logical off時は即時 `visibility:hidden` にし、native fade-inと移動springを維持する。

### 非表示menu・duplicate ownership

external ownerはscreenがないbattle中にもnative menu `_tick` と `_updateCursor` を呼んでいた。非active・hidden document・disposed時は停止する。fallback watchdog/RAFも停止し、screen再表示・visible復帰時は既存のowner handoffで再開する。

既存のoffscreen preview停止・hidden world/showcase guardは維持した。visibleなtitle/settings背景のattract/demoは表示内容に必要なsimulationを続ける。今回のtitle/settings scenarioではmatch/env/showcase更新を削減対象にしていない。full-frame showcaseがarenaを覆うケースの既存simulation/hidden-world suspensionは維持した。menu idleを理由に表示中の背景やeffectは削除しない。

### lifetime

native `Menus.dispose()` はfont listener・ResizeObserver・pending fit callbackを解放せず、screen destroyも省略していた。これらのownershipを解放し、遅延 `fonts.ready` がdisposed menuで新しい仕事をscheduleしないようguardする。

## 補助測定: actual menu DOM/CSS

同じ最新harnessをbaselineとcandidateの実buildへ適用した。WebGL/game ownerを含まないfixtureで、padはnative `Menus.nav` entry。物理deviceやHID-to-photon測定ではない。

環境: Linux、Xeon Platinum 8269CY 2.50GHz、16 logical CPUs、Node v24.20.0、Chromium 151.0.7922.34、960×600、DPR 1。

| Probe | Before | After |
| --- | ---: | ---: |
| 同じtask内のstale target: keyboard/pad/touch各12 | 36/36 | 0/36 |
| 非active menu: 各3×600 external updatesのnative tick | 600 | 0 |
| hidden document: 各3×600 external updatesのnative tick | 600 | 0 |
| paint済みringのretirement ghost: 3 probes | 3/3 | 0/3 |
| screen再表示後のtick | 1 | 1 |
| font listeners: 20 / 40 / 60 disposals後 | 20 / 40 / 60 | 0 / 0 / 0 |
| observed ResizeObserver owners: 同条件 | 20 / 40 / 60 | 0 / 0 / 0 |
| input dispatch+target measurement ms: median / p95 / max | 4.20 / 7.50 / 8.30 | 6.10 / 51.70 / 51.90 |

補助測定のmeanはbefore 4.62ms、after 11.47ms。各12入力の3方式を含む36 samplesであり、51 focused testsとは別の実browser測定。`paint-prepared-menu-before/after/runtime-result.json` とcomparisonに保存した。candidate receiptは2a103fcで、Git blob verificationを通した。同一harnessを双方に適用した。

mode-switch前は実paintをscreenshotで完了したうえで自然なCSS入場animationで2行ともopacity≥.9へ到達したことをreceiptに残す。入場中にnativeがringを隠す仕様を除外する準備であり、測定開始後のselectionを待たせない。4 pairsはいずれも同task targetError=0、visible切替2 pairsはvisualStarted=true、touchからの2 pairsはfirstAppearanceError=0。

prime済み実DOM screenshotもparentが比較し、menuの配置・色・文字・row highlightの外観を確認した。previewの空欄はrendererを持たないfixtureの範囲であり、preview品質の根拠には使わない。

このinput測定は次tick依存の除去を示す。handler自体の高速化率は主張しない。必要なlayout readはinput taskに移った。共有hostのtiming変動がある。observer tracker自体も参照を保持するため、release呼び出しの確認をheap削減率へ換算しない。

## 実game benchmark・全browser regression

[run 37186816052](https://github.com/rhgrive3/actions/actions/runs/37186816052) はsuccess。validate、active、catalog、UIの全jobが合格し、diagnostic-only jobは対象外。activeは既存5 checks + before/after + strict comparator、catalogは全motion、UIはChromium/WebKitの5 checks。全3 suite receiptsで同じ40文字source SHA・contentHash・run ID・runtimePerformance=trueを確認した。18本の実CPU profileとbefore/after/comparison JSONを永続保存し、parentが再検証した。

artifact IDs: site `11297840093`、catalog `11297536143`、UI `11298435087`、独立baseline `11298505257`、active `11299470300`。site全374 filesをOS temporaryを使わず取得し、manifestの全配信artifact hashとGit source inputを確認した。summary・validation logは `ci-37186816052-summary.json` / `ci-37186816052-validation.log`。

旧37183890547は既存checksとbaseline全9 windows後、mode入場準備の5秒timerで失敗した。candidateを実行していないので不採用。新harnessはhostから実screenshotを完了して自然なopacity readyを待つ。timed inputとは分離し900秒でbounded、detached rowsを拒否し、入力36件と各mode結果をcheckpoint保存する。fake compositorのpaint前/detached negative regressionも追加。small low-quality診断はhigh acceptanceへ流用せず、GPU原因を断定しなかった。

同じActions jobでpinned baselineとcandidateをbuildする。high quality、960×600、DPR 1、dynamic scale 1、seed 20261004を固定し、各固定stepの開始時にstep indexをWeyl mixしたseedでRNGをresetする。battleはgame/camera時計を0へ、camera shake phaseをseed値へ固定し、initial phase receiptを検証する。bootのlive frameはdebug hook完成前からfreezeする。title/settingsは30 simulation-only+30実render frames、battleは270 simulation-only+30実render framesをwarmupする。実render warmupはfiring/FX有効後に行い、GPU finishはprofile開始前に置く。audioは独立したseeded RNGを使用し、wall-clock voice制限によるprocedural noiseの乱数消費がgameplayのfixture RNGをずらさないようにする。これはbenchmarkだけの条件設定で、production audio処理を省略しない。battleはTidewater/easy/turf/180秒、1 scripted shooter+7 stationary bots、`playing`到達後に測定する。

各scenarioを連続する3×30 frames、実 `Game._frame(1/60)` で測る。simulation/Character/projectiles/paint/FX/env/decor/props/renderer/HUD/minimap/menuの実ownerをinstrumentする。CDP CPU profiles、TaskDuration/ScriptDuration/LayoutDuration/RecalcStyleDuration、long tasks、JS heap、draw calls/triangles、geometries/textures/programs、owner timingのmedian/p95/maxを保存する。fixed transactionの外でfallback ownerが実行してもnative動作を保持し、宣言した30-frame windowのcountには混ぜない。各repeatはfresh matchではなく同じscenarioの連続windowであり、同じrepeat indexのbefore/afterを比較する。draw/resourcesは最後のframeのsnapshotで、window全体のdraw合計ではない。medianは偶数sample時に中央2値の平均を取り、mean/p95/maxも保存する。固定frame測定なのでlive FPSとは呼ばない。実行順序はbefore→afterで、cross-over順序の独立runsは行っていない。software driverのshader/command待ちとshared runner負荷の交絡を残すため、frame時間差をproduction最適化の因果的speedupへ換算しない。

run 37174609255では全既存browser testsを通過したが、audio/global RNG交絡によるcoverage/projectile差と、未呼出ownerのcount key欠落を検出した。比較を合格扱いせず、audio RNG分離・probe登録記録・未呼出count=0の明示・4D有限geometry/state/mode検証のnegative regressionsを追加した。native AudioEngine constructor/playを使う追加testでも、実時間gap=.001では1 voice生成+1 drop、gap=.1では2 voice生成となり、共有RNGだと次のgameplay乱数が変わるnegative controlを再現した。actual harness callbackを適用するとaudio生成数を減らさずgameplay乱数が一致する。実AudioEngineに設定したreceiptも必須にした。ただしaudio-onlyを使った実game CPU-only診断はbattle coverage/projectile不一致が3/3残り、十分な原因解決ではなかった。これを合格扱いせず、per-step RNG/初期clock・camera phaseの固定と、各stepのrandom消費・camera/aim/projectile traceを追加してCPU-only診断では3/3のgameplay snapshotと330/360/390 stepsのrandom/camera/aim/projectile traceが完全一致した。low/no-render診断はfull high-quality performance合格の代用にはしない。

final comparatorは全3repetitionsで以下を要求する:

- rendererの配信バイト一致、world-scene traversal回数一致。
- battleの非表示menu `_tick` / cursorがbaseline各30→candidate各0。
- frame/quality/scale/warmup後のplaying条件一致。
- simulation・各runtime ownerのupdate回数一致。
- game time・8 actorsのposition/HP/ink/alive/weapon・paint coverage・projectile数のsnapshot完全一致。
- 実game entryからのkeyboard/pad/touch各12入力で同taskにx/y/width/height target更新、有限誤差、target elementの一致。padはfake Gamepadから実 `Input.pollPad→Game._padMenus` を通す。
- prime済みring retirement 3 probes、hidden menu/document 3×600 updates、再開1 tick、20/40/60 dispose後のlistener/observer解放。

pinned歴史baselineとのruntime比較は当PRまたは明示的runtime_performance dispatchだけで必須にし、将来のMovement/Weapon workstreamをこのbaselineへ固定しない。当PRではcomparisonを省略できない。

既存active game・motion/detail・Flow/GTAO・wall/GTAO・全motion catalog・Chromium/WebKit touch/layout・reliability・forged identity negative・responsive suitesを省略しない。過去sourceの合格を最新sourceの合格へ流用しない。

## 同条件before/after結果

環境はAMD EPYC 7763 64-Core Processor、4 logical CPUs、Linux、Node v22.23.3、Chromium 151.0.7922.34、SwiftShader、high、960×600、DPR 1。各cellはbefore→after、時間単位ms。各rowは30 framesで、同じscenarioの連続3 windows。spikeは除外せずmaxへ残した。

| Scenario / window | Mean | Median | p95 | Max | JS heap snapshot MiB |
| --- | ---: | ---: | ---: | ---: | ---: |
| title / 1 | 4121.48 → 4123.43 | 18.55 → 19.05 | 5192.60 → 11533.10 | 82785.80 → 83745.40 | 110.29 → 110.59 |
| title / 2 | 2790.62 → 2758.91 | 10.85 → 12.85 | 1051.60 → 487.10 | 82263.30 → 81733.10 | 112.71 → 112.63 |
| title / 3 | 5561.12 → 5401.98 | 14.55 → 28.65 | 48709.20 → 48430.70 | 77440.00 → 76231.00 | 112.53 → 112.22 |
| settings / 1 | 3863.95 → 3809.05 | 15.90 → 12.25 | 4328.30 → 20.40 | 111113.30 → 113891.30 | 115.73 → 112.92 |
| settings / 2 | 4087.06 → 4158.95 | 11.80 → 15.15 | 33.70 → 2680.80 | 122152.50 → 121636.70 | 116.52 → 113.90 |
| settings / 3 | 4215.16 → 4138.73 | 19.05 → 12.30 | 37.20 → 38.00 | 125922.70 → 123770.40 | 117.74 → 113.18 |
| battle / 1 | 5230.58 → 5273.38 | 4209.70 → 4058.85 | 6495.90 → 6721.00 | 76366.20 → 75052.50 | 126.76 → 126.85 |
| battle / 2 | 5394.39 → 5285.27 | 4094.30 → 4050.20 | 7331.60 → 7118.90 | 78697.10 → 78172.90 | 127.81 → 127.74 |
| battle / 3 | 5259.70 → 5255.46 | 4068.40 → 4115.65 | 6630.40 → 6543.10 | 74143.30 → 73799.40 | 127.80 → 128.09 |

時間差からspeedup率を主張しない。巨視的frame時間はWebGL/SwiftShader内の待ち時間に支配されている。

| Scenario / window | TaskDuration | ScriptDuration | LayoutDuration | RecalcStyleDuration |
| --- | ---: | ---: | ---: | ---: | ---: |
| title / 1 | 124142.67 → 124830.86 | 0.39 → 3.04 | 0.05 → 0.11 | 0.50 → 1.03 |
| title / 2 | 83877.13 → 82951.77 | 0.20 → 0.24 | 0.06 → 0.06 | 0.54 → 0.52 |
| title / 3 | 167011.20 → 162258.82 | 0.23 → 0.16 | 0.13 → 0.07 | 1.07 → 0.68 |
| settings / 1 | 116119.22 → 114484.69 | 0.24 → 2.17 | 0.20 → 0.17 | 7.05 → 8.91 |
| settings / 2 | 122839.74 → 124976.62 | 0.18 → 0.17 | 0.11 → 0.09 | 5.55 → 5.75 |
| settings / 3 | 126743.91 → 124325.25 | 0.75 → 0.21 | 0.09 → 0.11 | 5.39 → 5.57 |
| battle / 1 | 157318.24 → 158705.69 | 11.75 → 16.05 | 6.95 → 7.03 | 14.15 → 16.62 |
| battle / 2 | 162134.69 → 159012.74 | 11.30 → 18.25 | 5.89 → 3.28 | 11.94 → 16.45 |
| battle / 3 | 158134.53 → 157976.86 | 10.74 → 6.64 | 2.45 → 2.17 | 11.82 → 12.27 |

上記CDP durationは30-frame transaction前後の差分で、owner timingの総和でもpure CPU/GPU分離値でもない。long-task observerはbaseline全9 windowsでn=0。candidateはtitle window 1で1件743ms、battle window 2で1件52ms、残る7 windowsでn=0。CDP固定transactionの観測結果であり、live画面のlong-task不在やsmooth FPSを証明しない。

| Acceptance / memory | Before | After |
| --- | ---: | ---: |
| Battle menu tick / cursor: 各3×30-frame windows | 各30 / 30 | 各0 / 0 |
| Battle Character / match / projectiles / paint / renderer / HUD / minimap: 各window | 240 / 30 / 30 / 30 / 30 / 30 / 30 | 同じ |
| World scene traversal: 全9 windows各30 frames | 各60 | 各60 |
| Exact battle gameplay snapshots | 3 windows | 3/3一致 |
| Last-frame draw/triangles/geometry/texture/program snapshots | 9 windows | 9/9一致 |
| Actual game entry: stale target、kbm/pad/touch各12 | 36/36 | 0/36 |
| Ring retirement ghosts: paint prime済み | 3/3 | 0/3 |
| Hidden menu/document: 各3×600 external updates | 各600 native ticks | 各0、rAF=0 |
| Hidden menu/document resume | 1 / 1 ticks | 1 / 1 ticks |
| Font listener / ResizeObserver owners: 20 / 40 / 60 disposals | 各20 / 40 / 60 | 各0 / 0 / 0 |

実gameの4 mode-switch pairsはtarget owner/4D geometryを同taskに更新。visible mode間はvisualStarted=true、touchからのfirst appearanceはerror=0。実game入力36件のdispatch+target measurementはmean 5.49→6.54、median 3.80→5.40、p95 18.60→11.50、max 21.80→33.00ms。これをhandler高速化やphoton latencyへ換算しない。

BattleのGC sampled時間は3 windowsでbefore 19.80 / 13.62 / 12.52ms、after 21.55 / 11.57 / 16.94ms。heap/GCの削減率は主張しない。battle resource snapshotは各side geometries=188、textures=51、programs=164、calls=330で一致。title/settingsはgeometries=141、textures=51、programs=173で一致。listener/observer ownershipの解放を実測したが、長時間GPU-resource lifetime/heap slopeは未検証。

Parentは実gameのprime済みsettings screenshotsで配置・文字・色・previewとringの外観を確認した。背景の動的animationやtimerを含む画像全体のpixel parityは主張しない。rendererの配信バイト、品質設定、draw/resource snapshotは一致し、既存rendered behavior/GTAO browser regressionsも全合格。

## 撤回したrender candidateと診断

beauty/GTAO/reflection間のworld matrix再計算を1回へまとめるcandidateは、過去の実game profileでscene updateが全9 windowsにおいて60→30回になった。しかしfresh-transformのRGBA parityを確証できず、最終production diffから撤回した。品質低下でgateを通していない。

frozen simulation・同じcomposer buffers・同じshadow rebuild pathでも、native/nativeとoptimized/optimizedの自己反復画像が違った。uniform変更はなく、WebGL errorも0。diagnostic 37172080195の自己反復差は通常52 channels、full native shadows40、GTAOなし39、bloomなし38で、単一経路へ原因を確定できなかった。pass切替はdiagnosticのみで、production設定には採用していない。未解明のpixel差を許容してrender変更を残すことはしなかった。

今回の完了baseline（37186816052）はAMD EPYC 7763、4 logical CPUs、Node v22.23.3、Chromium 151.0.7922.34のSwiftShaderで実行した。CDP sampleの最大要因はWebGL `texParameteri` / `getProgramParameter` / `uniformMatrix4fv` / `drawElements` 等の同期呼出し内の待ち時間だった。これはpure CPU時間とGPU処理を分離したtimer queryではない。baseline battleのGC sampled時間は3 windowsで19.80 / 13.62 / 12.52ms。GC sampleはallocation byte数や長時間heap slopeの証拠ではない。baseline単独の数値はpaired改善率として使わない。

旧baseline CPU profileでは30-frame battleに82–149秒のSwiftShader環境でのWebGL呼出し内待ち時間があり、主にWebGL uniform/draw/state calls内だった。world-matrix updateのsampled inclusive時間は約33/47/44msだった。これはhardware GPU測定・全体speedup率ではない。最終成果のbattle削減は非表示menu仕事の除去であり、GTAO/bloom/shadow/draw-call削減やFPS向上は主張しない。

## Agent結果・parent review

許可された6 wrapper lanesとOpenCode 1環境のみ使用した。Cline/Freebuffは引数なし起動。models refreshでOpenCodeの正確なID `opencode/muse-spark-1.3-contributor-free` を確認してauto指定した。

- Cline-7: UI timeline/static investigation完了。parentがactual input/target/ring probesで検証した。
- Cline-8: 部分的battle frame-map/harnessを保存。DeepSeek quota後のMuseがstallし、confirmed exit後parentが引き継いだ。部分結果はbenchmark合格証拠ではない。
- Cline-9: substantive成果前に停止。confirmed exit後Freebuff-7へmemory調査をhand offした。
- Freebuff-7: menu harnessとmemory/lifetime audit完了。parentがlistener/observer fixを実装・実測した。
- Freebuff-8: battle scenario/harness完了。laneのboot timeoutは測定成功として扱わず、parentが実game profileを行った。
- Freebuff-9: account suspended。parentがUI benchmarkを引き継いだ。
- OpenCode: broad runtime audit、独立review、render repeatability診断を返した。final-review-4/5は完了、final-review-6はmode geometry・4D target・audio RNG分離のcodeを確認した。audio-onlyで問題解消としたagentの推論は実測で反証された。final-review-7はper-step fixtureを独立確認した。review8で最新mode/owner-window/CI scope/statisticsを独立確認し、36/36 tests合格。committed primedOpacity deltaはreview9で補足確認し、36/36 testsも合格。実paint準備の新deltaはreview10で独立確認し、隣接する3 suitesの37/37 testsが合格。コード上の追加blockerなし。full高品質paired acceptanceはparentが上述artifactで確認した。parentが実diffと実DOM結果を確認した。51件のfocused regressionはparentが実行・確認した。production最終判断はparentが行う。

sky cache・HUD/minimap・paint drying・shadow cache等の既存guardを調べた。Vector pooling、temporary object削除、HUD geometry cache、shadow quality、shader/model変更など、測定で必要性を確認していない候補は追加しなかった。各agentの完了主張はdiff/test/artifactの代わりにしない。

## 永続storage・未確認項目

worktree/evidence/checkpoints/cache/scratchは `/mnt/workspace/.dev-state/agent-work/` 以下のtask専用directory。resolved destinationを確認し、OS temporaryへfallbackしない。Chromium/Playwright内部temporaryもimport前に短いphysical cache `/mnt/workspace/.dev-state/agent-work/cache/iwrui` へ設定する。Unix socketパス長を検証し、実Chromium smokeでSingletonSocketのphysical pathがそのcache内であることを確認した。過去の補助測定でbrowser内部temporaryがOS領域を使うケースを検出したため、上記pre-import設定と実socket検証を追加した。旧補助run・長過ぎるsocket pathの失敗は最終storageの証拠として使わず、重要なcode/log/checkpointは一貫して永続領域に保持した。各completed benchmark window/CPU profileをatomic rename+fsyncで保存する。baselineはcandidate実行前に独立artifactとして保存する。`runtime-progress.json` やfailed/cancelled runを合格証拠へ昇格しない。completed commitsは専用remote branchへnon-force pushした。

詳細evidence: `evidence/inkwave-runtime-performance-ui/` 以下のCI artifact reports・CPU profiles・menu negative controls・lane reports・test logs。checkpoint/rosterも同task directoryに保持する。

PRに同時起動した別workflow `CXX OpenTTD projection diagnostic` は最新merge sourceに対するrun 37186816038でfailure。INKWAVEとは別の未変更範囲の検証で、今回そのcode/workflowを変更していない。全GitHub checksがgreenという主張には含めない。

未確認: physical keyboard/gamepad/touchのHID-to-photon、hardware GPU timer/FPS、長時間soak/heap slope、全stageのreflection再現性、multiplayer traffic、settings scrolling/preview on-offの独立performance比較。本家Splatoon3の実機frame値は推測していない。今回simulation/Movement/Network/Weapon behaviorは変更していない。

## 最終レビュー

parentがproduction全diff、harness/comparator/library/tests/workflow、全artifact source/identity、上記測定値をレビューした。独立review10の隣接37 testsも合格。51/51 focused regressionsと全browser regressionを実確認し、render matrix candidateと未計測micro optimizationsは最終diffへ残していない。simulation・renderer・Game/Character/projectile/paint/Movement/Network/Weapon sourceは変更なし。report commitとremote backup後、PRをレビュー可能な状態へ更新する。mainへのpush/mergeは行わない。

## 再現方法

当PRのCIは既存browser suitesと同じjob環境で、pinned baselineとcandidateの同条件比較を必須実行する。明示的に再実行する場合は、その時点の40文字SHAを取得してworkflowへ渡す:

```sh
gh workflow run validate-inkwave-update.yml --ref inkwave/runtime-performance-ui \
  -f source_sha="$(git rev-parse HEAD)" -f runtime_performance=true
```

実game harnessは `scripts/check-inkwave-runtime-performance.mjs --fixed-only --quality high`、比較は `scripts/compare-inkwave-runtime-performance.mjs`。build site、40文字source SHA、Playwright module、永続evidence directoryを明示する。両sideで同じharnessを使い、benchmark専用のseed/clock/audio条件をreceiptで確認する。`--menu-only`・`--input-only`・`--parity-only`は診断用で、full acceptanceを代替しない。

## 変更ファイル

| File | Purpose |
| --- | --- |
| `patches/local-quality/adapter.mjs` | native cursor target bookkeeping、fit/listener/observer/screen dispose ownership |
| `patches/local-quality/menu.mjs` | input-task retarget、spring clock credit、ring retirement、hidden owner stop/resume |
| `patches/local-quality/tests/runtime-ui.test.mjs` | native stale-target negative control、3 input modes、spring/snap/frozen/reflow regression |
| `patches/local-quality/tests/runtime-menu.test.mjs` | no-screen/hidden/document/dispose ownership and resume |
| `patches/local-quality/tests/runtime-lifetime.test.mjs` | native leak negative control、fonts/observer/late readiness release |
| `scripts/check-inkwave-runtime-performance.mjs` | actual-game/menu instrumentation、3 repeated windows、input/paint/lifetime probes、persistent evidence |
| `scripts/compare-inkwave-runtime-performance.mjs` | exact-source/environment/quality/gameplay/renderer/owner/input acceptance |
| `scripts/lib/inkwave-runtime-evidence.mjs` | physical persistent storage、Git/blob/build verification、statistics |
| `scripts/tests/inkwave-runtime-evidence.test.mjs` | forged/incomplete receipts、native audio RNG、step seed and clock negative regressions |
| `scripts/tests/inkwave-integration-workflow.test.mjs` | existing browser gate retention、bounded runs、exact receipts/storage/warmup/diagnostic separation |
| `.github/workflows/validate-inkwave-update.yml` | existing suites + exact baseline/candidate profile、completed evidence preservation、new library-only変更もCI trigger |
| `reports/runtime-performance-ui-report.md` | result・root cause・limits・parent review |
