# Roller30/60Hz: 共有RNGとcosmetic phaseのproducer診断

2026-10-23。motion/runtimeの修正ではなく、保存済み30Hz証跡6a6535の未解消差を調べた追加観測。公開PR1856のhead433299と、private QA候補e3758490f65f2e288acd8124561c3e08d8551a70は変更していない。この診断branchをPRのコード後継として扱わない。

## 実際に完了したrun

元checkerの事前LCG closure、seed123、avatar/gear/geometry/palette/camera、入力、native66ticks、6ケース順序、fresh browserのmain7e30→candidate30→candidate60を維持し、18ケースを各1回実行。1188 native ticks／792 actual WebGL draws。既存flags、800×600、screenshot60000ms、playing待機180000msを保持し、120Hzや参照403は再試行していない。毎回のPaintSystem.flushと粒子描画も保持した。

観測器はLCGの実before/after、producer／call-stack、FX update前後、clear前後、warmup後のphaseを記録する。native FX state／audio state／phaseを追加resetしない。全18件で記録call数と実draw counterが一致した。後で通常ケースのfirst-case prefixをfresh30／fresh60／空間key付きfresh60で各1回観測し、AudioContext.currentTime・played/dropped・乱数差を取得した。元18件の繰返しではなく、追加3件の限定probeとして別保存した。

rawは[18件＋3prefix](raw)、実行log・source hash・同じflags/deadlineは[checks](checks/observer-source-identity.json)。231 screenshotsの原本はworkspaceに保護し、全SHAを[manifest](checks/screenshots-manifest.json)に保存。代表39tick画像6枚だけを[images](images)へ同梱した。観測器の同期処理はwall-timeを変え得るので、元のAudioContext時刻を再現したとは主張しない。

## phase差はclearを越えて残る

今回の開始phaseはmain30=1、candidate30=0、candidate60=0。全roleで各caseのclear後・120tick warmup後にも同じ値が残る。各caseのFX updateは66回で3の倍数なので、このoffsetはケース間でも残った。元ログにはphaseが無かったため、これらを旧runの直接観測値へ付け替えない。

通常34tickのFX update直前、dP/dV/dA/dK/dCの全配列はmain/candidateで厳密一致、drop41個、RNGも342 drawsで一致した。既存`shouldDeferCosmeticDrop`をその配列へ適用すると、使用phase0のmainは36 checks、使用phase2のcandidateは32 checksとなり、実測と一致。deferred indexも[analysis](analysis.json)に保存した。変わるdKの更新位置と、その後の接触探索差がここから始まる。

このphaseは`firefight-tier-budget.mjs`がFX._updateDropsへ挿入する既存3-phase処理で、FX.clearは初期化しない。今回phaseを揃える変更はしていない。34tickでは乱数消費差が無いため、後述の12 draw差とは原因を分ける。

## 共有RNGのproducerは衝突音

実stackはnative `fireFlick`と、`Projectiles._impact → AudioEngine.play → splat_small.build → V.r/noise/plips`が同じ事前LCG closureを消費することを示す。FXだけの私有乱数ではない。

productionの`audio-adapter.mjs`は、同音制限を `音名:emitterKey` で管理する。`audioEmitterKey`は位置の2m cell等から決まる。`AudioEngine.play`はsimulation elapsedではなくAudioContext.currentTimeを使い、splat_smallのminGap=.03秒より近い同keyの再生をdropする。受理時は音高jitter、noise offset、plip数／形状が共有RNGを消費する。

key付きfresh60 probeでは、34tickの `splat_small:cell:0:0:2` のlast=44.98285714285714、35tickのcontextTime=45.008979591836734。差.02612244897959215秒で実際にdropされ、RNG消費0、lastも不変だった。48tickの別cellでは音声が受理され12 callsを消費した。[key付きraw](raw/audio-key-prefix-60.json.gz)は完全なlast-mapも記録している。先行2probeの音名だけのlast欄はproductionの空間keyを参照していないため、gateの証明には使わない。そちらの時刻・returnedVoice・counts・RNGはそのまま保持した。

## 旧12 draw差との対応と限界

元のcandidate30/60は35tickで409/421 draws、state1080072278/3980743378。旧recordの追加drop seedは最初の3個が両側draw349/356/362で一致し、次は369/381へ分かれる。対応する現在30Hzの音声呼出し境界はdraw363、state1708090120である。この位置の音声受理／拒否が、保存差の位置と整合する。

実際のemitted AudioEngine.play/SFX/Vを、hash検証したimmutable siteから読み、mock WebAudio nodeで独立再生した。実productionのkey `splat_small:local` を使い、gap.01なら0 calls、gap.04なら12 calls。呼出し境界state1708090120→4087241188を再現した。[境界再生](checks/emitted-audio-call-boundary-replay.json)。またstate1080072278からの12 callsで旧終端state3980743378を再現した。[終端再生](checks/emitted-audio-replay-final.json)。これはemittedコードの分岐再生で、元browserの実時刻を補完するものではない。

今回のfull60 runは旧runと同じ差分時刻にはならず、通常33tickから差が出た。実audio stackは通常33/34/35/48tickで29/12/17/17 calls、対する30Hzは17/17/0/12 callsだった。新early46にもRNG差があり、旧「最初の1ケースだけ」を一般化できない。実時刻に依存する音声受理と、それに続くFXの乱数分岐がRNG列を変えるproducerとして局所化できたが、**旧runの35tick AudioContext時刻そのものは未記録**であり、旧音声受理の直接traceを得たとは言わない。

## acceptanceは分離して保持

元の解析器を変更せず今回18件へ実行し、native canonical、physical paint／CPU grid、31tick初発生・release／56tick消去、描画pose、無入力0paintの必須検査が通った。published rawからの再解析もbyte一致した。[解析結果](checks/matched-18-analysis.json)。一方で今回のstrict RNG/FX失敗は**9件**で、元6a6535の**7件は原本のまま**保持している。全画像／全RNG一致へ変更していない。

このfixtureは各caseで元からLCGをresetする単発攻撃であり、その後の連続攻撃でnative武器乱数まで同一だと証明していない。nativeと共有するため、音声消費差を無害として扱わない。motion helperは通常48tick以降で、今回の33–35tick差より後である。

観測器のLCG結果・cached identity/reset・producerのthis/return値・native clear/phase・実空間key observerのpassthroughは[3テスト](checks/observer-tests.tap)で確認。runtime修正、音声mute、phase/last map reset、clock変更、motion tuning、PR/main更新は行っていない。候補の最終visual／retail／120Hz／hosted CI acceptanceは引き続き別gate。

```sh
node scripts/check-inkwave-roller-rng-trace.mjs <immutable-main7e-site> <out-main7e30> 30
node scripts/check-inkwave-roller-rng-trace.mjs <immutable433299-site> <out-candidate30> 30
node scripts/check-inkwave-roller-rng-trace.mjs <immutable433299-site> <out-candidate60> 60
node scripts/analyze-inkwave-roller-30hz.mjs reports/roller-fx-rng-20261023 <out.json> --published
node --experimental-vm-modules scripts/replay-inkwave-splat-audio-rng.mjs <immutable433299-site> 1708090120
node --test scripts/tests/inkwave-roller-rng-producer-trace.test.mjs
```

独立emitted再生helperの初期loader/key設定エラー4件もworkspace原logを残した。上の最終結果はcycle linking／import.meta URL／production emitter keyを修正したmock harnessであり、実browser失敗を消したものではない。
