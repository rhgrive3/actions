# 戦闘 HUD の CSS アニメーション再開（2026-10-30）

基準は `84453765039f040cb937f6beb7fdb58d54f169dd`。変更先は
`inkwave-public/src/ui/hud.js` の turf ticker と low-ink 警告だけ。
ゲームのイベント条件・頻度・警告時間、表示内容、CSS/keyframes は変更しない。
スプラトゥーン3との新たな挙動一致や実機性能を認定する変更ではない。

## 対象の根拠

親作業の実8 actor / shooter / Tidewater / high / 900 tick の CPU profile では、
Game._frame 以下12,875個の非加重サンプルのうち `_restart` のselfが256個。
呼び出し元は `_turfPop` 122、lowinkイベント107、`_updSpecial` 16、`_updSquads` 11。
元のprofileには負のtime deltaが22個あるため、これらは候補選定のサンプル数だけであり、
CPU時間・FPS・改善率へ換算しない。

rawと `adaptBuildSource` 後を両方確認した。hitMarkerは既に限定WAAPI再利用を持つ。
今回その処理、ゲージ、squadや汎用 `_restart` は変更しない。

## 変更

`_restartCssAnimation` は初回に既存 `_restart` を呼び、対象要素のCSSAnimationを保持する。
同じclass、target、animationName、通常playbackRateのrunning/finishedに限り
`currentTime = 0` で同じCSS由来のeffectを再開する。

- turf: `.iw-turf > i` の `iw-turf-tick`。
- lowink: `.iw-tank` 自身の `iw-shake`。

paused、idle/cancel、class解除、DOM差し替え、切断、CSSによる無効化、別animationName、
playbackRate変更では従来経路を使う。swim時に優先される `iw-s3-tank-in` や他のglowを再開しない。
キャッシュはHUDごとのWeakMapで対象要素をkeyとする。

CSSAnimationへ `play()` / `pause()` は呼ばない。
`play()` はCSSのanimation-play-stateを上書きし、後のworld pauseを壊すため、負例で検出する。
終了したCSS effectは `currentTime = 0` だけで再開できることを実ブラウザで確認した。

本体 `setWorldPaused` はCSSAnimationをCSS pauseに任せ、それ以外の有限WAAPI/transitionを
明示的にpause/resumeする。今回保持するものはCSSAnimationであり、この区分を変えない。
paused時は常に従来class切替を使い、静止中のgeometry observerも同じmutationを観測できる。

running/finishedをseekしたときのDOM animationstart/animationcancelの個数は従来と同一ではない。
対象pulse自身にはそれらの個数に依存したcleanupがなく、turfの新規spanのanimationend削除は維持する。
`LayoutSample.begin` はdocumentの現在のanimation集合を読み、再開したCSS effectをactiveとして扱う。
pausedでactiveがないケースではclass mutationによりrectを再取得することも実ブラウザで検証する。

## 検証と再現

親作業が競合する計測を止めて直列実行した正式結果:

- 関連unit: 61件中60 pass、1件は既存のemitted artifact指定時だけ実行する条件付きskip。
- Chromium `154.0.8037.57` / headless / 1280×720: 通常とreduced motionの厳密検証は両方pass。
  [記録](inkwave-battle-hud-restart-20261030/browser-result.json)のerrors/diagnosticsは空。
- `--negative-play`: 両条件で各7項目が期待通りfail。CSS pause停止、再開位相、静止observerの
  回帰を検出した。[負例記録](inkwave-battle-hud-restart-20261030/negative-play-result.json)。
- 人工burstは下表のとおり。全10 sampleでtickerの4要素上限と警告時間0.45を維持。
  [全sample](inkwave-battle-hud-restart-20261030/event-bench.json)。

| 500組の連発処理の中央値 | 基準 | 変更後 |
| --- | ---: | ---: |
| 処理時間 | 1041.0 ms | 43.9 ms |
| `offsetWidth` 読取り | 1000 | 0 |
| CDP LayoutCount | 1001 | 1 |
| CDP RecalcStyleCount | 1001 | 501 |

この処理時間は短時間に500組を連発する人工fixtureの値であり、バトルFPSやゲーム全体の改善率ではない。
初期試行や他作業と重なった測定は正式結果に含めていない。

```sh
node --experimental-vm-modules --test \
  patches/local-quality/tests/hud-css-restart.test.mjs \
  patches/local-quality/tests/reticle-feedback.test.mjs \
  patches/local-quality/tests/low-ink-snapshots.test.mjs \
  patches/local-quality/tests/hud-authority.test.mjs \
  patches/local-quality/tests/queue-remaining-ui-network-20261026.test.mjs

CHROMIUM_PATH=/usr/bin/chromium node scripts/check-inkwave-hud-css-restart.mjs \
  --evidence-dir .browser-evidence/hud-css-restart

# 失敗を期待する負例: finished後のplay()を検証用メソッドだけへ再導入。
CHROMIUM_PATH=/usr/bin/chromium node scripts/check-inkwave-hud-css-restart.mjs \
  --evidence-dir .browser-evidence/hud-css-restart-negative --negative-play

# 人工的なイベント連発の診断。ゲームのフレーム性能とは別。
CHROMIUM_PATH=/usr/bin/chromium node scripts/benchmark-inkwave-hud-css-restart.mjs \
  --baseline 84453765039f040cb937f6beb7fdb58d54f169dd \
  --evidence-dir .browser-evidence/hud-css-restart-bench
```

厳密ブラウザ検証は通常/reduced motionで、0/20/70/140/210/280/349/350/400msの
computed style、CSS由来keyframes/timing、自然終了からの再開、world pause相当CSSの停止/再開位相、
hidden/reveal、DOM差し替え、CSS無効化/復元、swim override、geometry observerを確認する。
swim/CSS無効化は、変更後に外部のstyle読取りを挟まずcandidateを最初に呼ぶケースも含む。
CSS pauseのready promiseが解決してからactive=falseの観測を確認する。

人工burstは同じ合成済み `_turfPop` とlowink listenerを各500回、20回warmup後に5回交互実行する。
各回の時間、offsetWidth読取り、CDP LayoutCount/RecalcStyleCount、ticker上限4、警告時間0.45を保存する。
いずれも合成ソースの独立DOM fixtureであり、全ゲームの描画画像比較、実機GPU、全CIの代用ではない。

raw HUDのSHA256は、基準
`34e81090a1d97b4a419aaf205baef2b1ed29b8d61ac0fbc1d258b040112b4448`、変更後
`09ca679484002b90c1158759bcc57903c16b871f293343d8fd5a27aae6c005cf`。
upstream-lockの対応する1項目は親の統合作業で更新した。
