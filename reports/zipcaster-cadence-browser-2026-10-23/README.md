# Zipcaster: minified build / controlled browser evidence (2026-10-23)

**Buildは合格。制御ブラウザの確認は完了しましたが、動的なまとまり方と取消境界の完全一致は未解消です。実時間FPS・本家一致・main反映の合格ではありません。**

基準 `726e338ac256ba9609086ce65e25a68ddd99df85`、候補 `66a271f8fe5d91fc108f1f2a8a3d13860bff410e` を固定。候補runtime・基準source・親PR1854は変更していません。この差分は報告・再現補助・自作画面のみです。

## 先に結果

両方を標準 `scripts/build-inkwave.mjs` / esbuild 0.28.2でminify。各1,420入力と2,110 artifactsを `verifyRuntimeBuild` で固定commitへ照合し、startup/dependency/容量検査も合格しました。build入力差分は `patch/runtime/special-vfx.mjs` だけ。minified runtimeは65,142→65,374 bytes、precache増分232 bytes。候補の実emittedモジュールを使う17 testsは全件合格です。

通常の試し撃ち場・既存カベ・通常追従カメラ・実Game/Actor/Physics/Character/FX/rendererを使いました。6試行の**264 native tickすべてで位置・phase・native timerが完全一致**、native stepは常に1/60秒。page error / console error / `gl.getError()` / context loss / Director errors は0です。

| 名目FX配信間隔 | 完走する最初のzip: 基準→候補 | 取消を含む全区間: 基準→候補 |
|---|---:|---:|
| 30 Hz | 78→156 | 134→268 |
| 60 Hz | 156→156 | 268→268 |
| 120 Hz | 312→156 | 532→264 |

全区間は4.4秒のsimulation timeです。coatは全6試行で20粒。短い取消zipが120 Hzでは各54粒、30/60 Hzでは各56粒で、候補の総数に4粒差が残ります。新規trackの半tick carryが次の発生機会より前の取消で消える境界差です。**取消を含めた粒数の完全一致とは報告しません。**

30 Hz候補ではhookの同一callback・同一原点ペアが5組、zipは1 callback最大4粒でした。60 Hz候補はhook最大1粒、zip最大2粒です。30 Hzの2発生機会が同じ現在poseを使う制約は数値上確認でき、密度だけから「団子状に見えない」とは判定できません。追加runtime変更は行っていません。

通常のhook終了で両側ともline alpha=0・active ribbon=0。取消後は旧点が本来の寿命で減衰します。最終時、基準は点数0の未終了handleを2件保持、候補は0件でした。**空handleの差であり、基準に見えるtrailが永久残留するとは主張しません。** 再発動したzipも実描画で確認しました。

## 元60 Hzのfresh-page対照

先行30 Hz試行のpaint/RNG履歴を外すため、両側をfresh pageで60 Hz / 2秒だけ比較しました。両側とも120 native ticks、hook=5 / zip=156 / coat=12、peak=59/208。zip・coatの出生記録は完全一致し、hookの発生frame・速度・寿命・個数も一致しました。

hookの出生位置5件には最大 0.033376 world unitsの差があります。独立起動した通常Characterの手アンカー入力がこのfixtureでは揃っておらず、これを候補runtimeの回帰と切り分ける確認はしていません。全pose／pixelの厳密一致とは言いません。通常カメラの静止画に新しい大きな崩れは見当たりませんでした。

| 自作画面 | 基準 | 候補 |
|---|---|---|
| 30 Hz moving hook | [before](before-30-hook.jpg) | [after](after-30-hook.jpg) |
| 30 Hz moving zip | [before](before-30-zip.jpg) | [after](after-30-zip.jpg) |
| fresh 60 Hz moving zip | [before](before-60-control-zip.jpg) | [after](after-60-control-zip.jpg) |

## 計測条件と未完項目

名目30/60/120 Hzは手動 `Game._frame(1/hz)` のFX配信間隔であり、実時間FPSではありません。既存 `PlatformFrameDriver.stop()` で自動配信だけを止め、FixedClockや物理実装は変更していません。入力は既存debug keyとnative `spawnAt` によるlife resetです。物理controller入力の検証ではありません。

GPU描画は短いmoving hook/zip区間と一致時刻の静止画へ限定し、他の区間もFX/native更新は同じ配信間隔で進めました。各試行の実描画は22/41/78 frames。壁時間に対する描画呼出しは約0.76–1.09回/秒ですが、IPC・静止画取得・描画省略区間を含むdriver throughputであり、GPU FPSや実表示FPSの測定ではありません。滑らかな実時間30/60/120 FPSでのclumping・frame pacing合格は未確認です。

既存 `/usr/bin/chromium` と、リポジトリの既存4 launch argsをそのまま使い、GPU flagを追加していません。品質low・960×540・puff cap208・Zipcaster一人です。既知の最低quality 182-pool / 8 actors overloadを解消したとは言わず、この段階では人数・品質matrixを増やしていません。任天堂の映像・抽出素材は追加しておらず、本家完全一致を主張しません。

## 失敗・除外・再現資料

- 初回補助はcanonical-kit objectを配列と誤認して停止。実ブラウザの起動自体は成功しており、補助だけ修正しました。
- 初回全描画30/60 Hzは完了、120 Hzは確認時間を抑えるため途中停止。成功扱いにせず元データを私有保存しました。
- 初回sampled 120 Hzは228 tickしか進まず除外。freeze中の自動platform driverがtimer-gap rebaseで半tick carryを消す経路があり、既存stop APIで手動配信に一本化して再測定しました。最終6試行は264 tickで完全一致です。
- emitted VM fixtureに既存のoptional source-motion dynamic-import警告がありますが17 assertionsは合格、実ブラウザのsourceMotionはreadyでした。

詳細・ハッシュ・全6試行の数値は [summary.json](summary.json)、実行した環境専用の再現補助は [browser.mjs](browser.mjs) にあります。通常matrixはsourceごと30→60→120の順で、paintと私有VFX RNG履歴を跨いでいます。cross-rateのpixel parityは評価せず、fresh60対照を別に取りました。build出力・元の私有成果・失敗ログ・全画面captureは保持しています。公開候補への追加修正やPR1854への書込みはありません。
