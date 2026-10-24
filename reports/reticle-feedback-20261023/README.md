# 照準・命中表示の候補（2026-10-23）

`main 726e338ac256ba9609086ce65e25a68ddd99df85` からのHUD限定候補。**本家との動的な視覚的一致、実GPU・Switch受入、公開HEADの必須CI完了は未確認。merge不可のDraftとして扱う。**

実装は `patches/local-quality/s3-hud-look-adapter.mjs` のみ。新しいブランチ `fix/inkwave-reticle-feedback-20261023` で作業した。`inkwave-public/` はロックされた原本であり、別の `game/` 試作は参照しない。

## 読んだ本番経路と再現

`scripts/build-inkwave.mjs` → `scripts/inkwave-source-composition.mjs` → splatoon3 / reliability / local-quality / network / range 等の合成 → `src/main.js` の `Game._updateHud` / accepted `hit` listener → `src/ui/hud.js` の `HUD._updCrosshair` / `hitMarker`。実行時 `runtime/ui.mjs` はHUDのhealth表示とtank repaintを包む。照準位置は既存 `weapons-fidelity.mjs: applyShotGuide`、ブキ別の拡散・チャージ状態も既存producerが所有する。

通常のPLAY→PRACTICE RANGEを、デスクトップではtrusted click、タッチではtrusted tapで開いた。スプラシューター、5mの的、プレイヤー位置 `[-14.6,0,0]`、yaw `0`、pitch `-0.12`、乱数seed `0x52455449`。実弾が的に命中し、36 / 36 / 36ダメージの3発目が撃破を確定する。命中イベントを直接emitする通常画面の代用品は使っていない。別記のHUD component診断だけは、合成済みの実HUDメソッドへ指定frameを渡すfixtureである。

修正前には、照準のガイドはデスクトップで約 `(-1.2,+36.5)px` 動く一方、命中マークは画面中央に残る。敵を狙うだけでも照準全体は1.14倍になり、確定命中はさらに照準を跳ねさせ、連続命中はマークの大きさ・移動幅・色を累積変化させた。これらは正しい拡散信号とは別の装飾である。既存の #560 で射撃時の二重bloomは既に除かれていたので、そこを重ねて変更していない。

## 最終変更

- accepted `hit` のdamageをそのまま表示呼出しへ渡す。他のイベントproducer、damage適用、通信契約は変更しない。
- マークは通知時に表示されていた照準位置へ置く。その後の標的切替・カメラ変更に追従して別標的へ移動しない。既存イベントにimpact座標が無いため「衝突地点の投影」とは主張しない。
- 通常ダメージは同じ白い4本のtickで再始動し、最大4個のWeb Animationを再利用する。連続命中による拡大・着色・飛距離増加を廃止する。マークの4本形状、標準36ダメージ時のscale 1.20、240msのease-out、10→18pxの移動は既存INKWAVE値を保持する。
- 照準そのものの標的取得zoom・hit/killの拡大／回転を除く。Shooter / Dualies / Splatlingの拡散tickは、runnerが回復させたconeへ直接従い、追加の60ms CSS追従を掛けない。ブキ別markup、charge stages、Dualiesの双銃／turret、Blaster外周の独立表示は保持する。
- 通常hitとsplatを分ける。正当なdamage=0のnetwork / Storm kill確定ではkill cueのみ。通常damage=0、負値、非有限値は新たなhitを作らない。Bossの明示heavy/weak-point CSS表示経路を保持する。
- 武器切替、HUD非表示、死亡、復活、match reset、disposeでpulseを取り消す。入力感度、gyro/touch、カメラ、spread/origin、range、collision、painting、network authorityに変更はない。

ビルド入力差分はこの1ファイルだけ。合成 `main.js` の差分は `hitMarker(..., { damage })` の1呼出しだけである。`build-readback.json` で前後各1420 inputs / 2110 artifactsを記録し、全artifactのSHA256とmanifest digestを再読した。root出力のvolume manifest 2本の差はrevision URLのみで、binary・geometry・parametersは同一。builder、workflow、shader、character/hair meshは変更していない。

## 参照と未確認範囲

- 公式記事: [任天堂「あなたに合ったブキ選び編」](https://www.nintendo.com/jp/ichikara/av5ja/index.html)。本文は取得できた。記載時点は2024-04-01で、Switchの正確なアプリversion・gear・照準stateは示されていない。
- 既存 `patches/splatoon3/reference/shooter-reticle-reference.json` は上記公式の1280×720静止画 `photo/01/005.jpg` / `021.jpg` の2026-10-08計測記録。今回は画像取得不可。既存corner形状を維持するための履歴として扱い、新規観察・動きの根拠にはしない。
- 既存 `splatling-reticle-reference.json` はGame8の768×432第三者JPEG計測。記録に11.3.0 Heavy Splatlingとあるが、今回はversion・spread状態を新たに確認していない。既存family形状を維持した。
- 端末から公式ページへの取得は `Tunnel connection failed: 403 Forbidden`。web経路でも公式gameplayページは502、上記画像は取得不可だった。制限を回避する再取得、Nintendoメディアの保存・公開は行っていない。
- **不足**: ブキ・gear・状態・カメラ・照準の一致したSplatoon 3映像を入手して、spread settling / target tracking / occlusion cue / hit shape・scale・duration・fade・repeated-hitを照合すること。現在の240ms等をretail定数とは呼ばない。候補の視覚的改善はINKWAVE内部の不整合修正としての確認であり、retail一致の認定ではない。

ゲーム側のcharge/shot-guide時計は既存60Hz tick。HUD componentは30/60/120/144Hz、Web Animationはブラウザtimelineの経過msで検証する。各sample frameのmsをreceiptに保存し、240msを跨いだsampleでopacity=0を確かめる。今回の成果物はPNGとJSONであり、符号化動画frameの計測ではない。通常hitのreceiptの `ticks:3` は0始まりのloop index（4回の `_frame(1/60)` 呼出し）で、本家のnative tick数ではない。

## 検証と証拠

最終結果は、source 50/50、guide/occlusion 37/37、ownership/小画面 38/38、実minify fixture 12/12。前ビルドの同じ12件は5 pass / 7 fail。通常ブラウザは前後ともdesktop/touch phoneで実弾36/36/36（3発目kill）とmiss=0が一致した。`matched-comparison.json` でcamera/position（1e-9以内）、aim、seed、probe SHA、damage列の一致を検証した。連続マークscaleは1.63→1.20となり、終了後の旧CSS animation残存4→0も確認した。source/component、実ブラウザ、実GPUの判定は分ける。

- `source-acceptance.tap.gz`: 合成HUD、既存family reticle・charge・Dualies・score/visibilityの回帰。
- `source-reset-2-final.tap.gz`: 最終専用fixture（武器の実際の切替、死亡／復活／非表示／reset／disposeを含む）。
- `guide-and-occlusion.tap.gz`: 既存shot-guide・impact agreement・idle lifecycle、37 pass。
- `ownership-and-small-viewport.tap.gz`: upstream/source identity、既存小画面tank、trusted range menu、38 pass。
- `emitted-reset-final.tap.gz`: 実minify生成物の最終専用fixture。単なる再minifyではない。
- `failing-before-reset-final.tap.gz`: 同じ最終fixtureを修正前の実minifyビルドへ適用した否定対照。既に正しかった拡散・Boss表示はpassのまま、位置・累積・非hit・zero-damage splat・cleanup・payload/resetがfailする。
- `before-browser-final/` / `after-browser-final/`: 同じ検証器のsnapshotとSHA、同じseed・cameraの通常画面。1280×720 desktop / 844×390 touch phoneで、実弾のhit・repeated hit・kill・miss/recoveryを記録する。別途componentで30/60/120/144Hzの単調fade、target switching、固定位置、4個の再利用を調べる。
- `phone-portrait-rotation-guard.png`: 390×844では既存の「Rotate to landscape」が出る。portraitを操作可能と装ってguardを外さない。
- `before-build-identity.json` / `after-build-identity.json` / `build-readback.json`: 通常production buildの入力／生成物identity。`after-build-3.log` が最終runtimeのbuild。
- `patch-check.log`: quick patch compatibility pass。`startup-budget.log`: deterministic startup budget pass。端末FPSの測定ではない。

Chromiumは `/usr/bin/chromium`、WebGLはSwiftShader。通常アプリを操作して描画したブラウザ証拠であるが、native GPU、iPhone/iPad Safari、Switch、配備済みrelayのacceptanceではない。全必須remote CIも別gateであり、この候補のローカルpassで代用しない。

componentのtarget scale取得はclass変更直後なので、修正前のCSS transitionの開始値1が記録される場合がある。定常1.14の根拠は元CSSと最初の `before-browser/receipt.json` の定常sampleで、最終probeの瞬時sampleを1.14の定常計測と読み替えない。

通常画面の比較: [修正前の実hit](before-browser-final/desktop-normal-hit.png) / [修正後の実hit](after-browser-final/desktop-normal-hit.png)、[phoneの実kill](after-browser-final/phone-normal-kill.png)。これらはINKWAVEの画面で、本家の参照映像ではない。

## 初回／中間の失敗を保持

`source-tests*.tap.gz`、`focused-tests.tap.gz`、初期 `failing-before.tap.gz` はfixture構築中の不足（selectedSub / contains / reset用の無関係HUD依存）、一度のsyntax誤り、VM flag無しの実行などを含み、最終acceptanceには数えない。assertionを削除して通したのではなく、DOM doubleや無関係なreset表示のstubを補った。正当なzero-damage killを調べた後の修正、BossのCSS ring維持も中間buildとして保存した。

`before-browser/` はdesktopの実hitを再現したがphone portraitのrotation guardでhitが出ず失敗。`before-browser-matched/` はSwiftShader起動が90s予算を超過。既存range entry helperの標準240s予算を使い、最後の比較をserialで実施する。これらの失敗のPNG / JSON / logは残す。`after-browser-matched/` はその中間QA版でdesktop/phone passだが、追加のsustained/miss/fadeを含む最終probeとは区別する。

## 所有と公開gate

公式mainとopen PRを作業開始時に確認し、包装前にも再確認。special #1854 は `2e8d90b8afb6aac057edfbb988fae789ef36cfd3` のまま。#1852 / #1854 / Tri-Slosher #1855 / Roller #1856とのphysical path overlapは共有の `reports/inkwave-splatoon3-behavior-2026-10-02.md` の追記だけで、runtimeの重複はない。Shooter/Splatling splash担当のファイルは変更しない。後の統合では共有reportの追記を保存する必要がある。

公開後は新ブランチのref、PR head、tree、changed blobを公式から読み戻す。main merge、force push、他PRの編集は行わない。公開操作とremote CIの最終状態は親への最終報告を正とし、未実行・pending・failedをpassと数えない。

Raw TAPは末尾空白を含む元出力を変更せず `.tap.gz` に可逆圧縮して保存した。各展開bytesのSHA256は `raw-tap-identity.json`。テキストを整形して成功・失敗ログを書き換えていない。
