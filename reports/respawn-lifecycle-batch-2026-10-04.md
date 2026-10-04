# 死亡・復活の状態所有者（2026-10-04）

対象: #192 / #286 / #313 / #162 の4件。base main `404c66c858cfea14e81225fb6364febcf2c9c528`。
直前の `0859bf4` からのmain差分は `tools/inkwave-modeler` の10ファイルだけとGitHub/Git両方で確認。これらを保持し、公開上流 `inkwave-public/` は変更しない。

## 重複・範囲

- PR63は通常HP回復/原因別復活時間等、PR186は別の公開武器・移動・キット群、PR59は移動物理。今回のSP保持、死亡HUD、再arm、有限spawn防御の修正ではない。
- #323のQR資格/両カメラ短縮、#319のroll/surge armorは未マージの独立変更。コピーせず、後日の合成箇所を以下に記す。
- #273の狙えるSquid Spawn、#308の初回バトルlaunchは未実装。本件は既存の正常respawn境界に有限防御を付ける。
- 90秒選択、既存match時間、原因別復活時間、ギア短縮式、未確認の復活ペナルティを変更しない。

## #192: retained special

`Actor.splat`＋gear wrapperが確定した残量を、死者の `respawn -> spawnAt -> reset` の間だけ保持し、同じrespawnイベントを出す前に戻す。
通常reset/新規spawnAtは0。HP/ink/weapon/移動状態は従来resetを通る。
160×0.5=80、100×0.8=80、0×1=0を実Actorで検証。連続死亡はその時点の残量へ一度だけ減算。
この修正は新しいS3減少率の推測ではなく、既存profileのSpecial Saver/死亡規則で選択された値の破棄を防ぐもの。

[実行経路の基準ソース](https://github.com/rhgrive3/actions/blob/404c66c858cfea14e81225fb6364febcf2c9c528/inkwave-public/src/game/actor.js#L126-L211)

## #286: death HUD

mainがlocal victim自身をHUDへ渡し、HUDのFX callbackが毎描画frameでそのActorの最終 `respawnTimer` を参照する。
`splatted` はgear wrapperの補正前に発火するため、その瞬間の値を最終時刻として固定しない。
数値とSVG ringの両方を同じ残秒から更新し、独立CSS/FX時刻による先行・遅れを防ぐ。Actorなしのpreviewは従来の時刻方式を維持。
最初の表示sampleはイベント呼出stack完了後のrAFで行うため、最終gear補正を含む。死亡イベントの順序・音・killfeedは変えない。

基準profileのGP57相当ではイベント開始時5.5秒→wrapper後約2.5秒を同じHUDが追う。別PRで基礎時間やQR式が変わってもHUDに数値の二重定義はない。

[HUD基準](https://github.com/rhgrive3/actions/blob/404c66c858cfea14e81225fb6364febcf2c9c528/inkwave-public/src/ui/hud.js#L355-L393)

## #313: death-boundary input

- resetで前世代 `_prevIntent` とfire/squid順序時刻を初期化。
- 人間の死亡後respawnに限り、held fire/jump/sub/special/squidは一度物理releaseを観測するまで受け付けない。
- releaseはcontrollerの実入力をsampleし、マップ等がintentをfalseにしただけではreleaseと扱わない。Actor処理中だけ該当intentを抑制し、呼出後は元値を戻す。
- botとremoteに人間のrelease待ちを持ち込まない。初期spawnや通常weapon変更へも拡張しない。
- CPU実Actorで保持中60ticksでもローラーのflick/rolling/ink消費なし。release→再pressは実runnerのflickと8.5ink支払いへ入る。偽の初回空中flickを作らない。

これはIssueで許容された明示的な再arm方針。すべての物理キーに関するNintendo実機のrelease仕様を測定したという主張ではない。#273のspawn選択でZRを消費する将来実装とは改めて統合する。

## #162: finite spawn armor

### 参照

- [S3攻略＆検証Wiki・アーマー](https://wikiwiki.jp/splatoon3mix/%E3%82%B7%E3%82%B9%E3%83%86%E3%83%A0%E8%A9%B3%E7%B4%B0%E4%BB%95%E6%A7%98#s4656810): 耐久30、持続235F（射出から）、破壊遅延20F。一般節は単発100超の超過ダメージ、敵インクは本体へ通ると記載。節内にVer2.1.0と過去検証注記がある。
- [mashita「スポーンアーマーについて」2025-02-21](https://mashita.cloudfree.jp/spawn_armor/): 耐久30、単発100軽減、100超は直ちに破壊して超過分が本体へ入る。破壊遅延は「最大0.5秒」と記載しており、Wikiの20Fと一致した確定値としては扱えない。
- 数値を公式一次資料やVer11.3.0の抽出JSON値と偽らず、profile/numeric-statusの校正項目として記録。寿命基準235Fの既存垂直dropへの接続も、本来の照準付きlaunchとの同等性は未証明。

### 実装

既存respawn時にinvuln=0とし、Actor-localな `{hp, remaining, breakRemaining}` を作る。初回matchの `spawnAt; invuln=0` を密かに別launchへ変更しない。
- 30HP耐久、100単発閾値、100超の超過に上限なし。
- 100以下で耐久を使い切ると20Fの破壊待ち（資料差を残したWiki準拠値）。待機中の追加100以下hitは防ぐ。100超は待ち中でも即破壊＋超過。
- 寿命235F。待機時間と寿命の短い方で終了。HP回復等でshieldは再生しない。
- inkは本体へ通し耐久を使わない。死亡/resetで消去。既存Super Jump等の別invulnは保持。
- 既存movementのdamage入口でspawn/roll/surgeの適用を一択にし、同一hitで軽減を二重計上しない。
- 既存native shader coatingが新しい残防御時間を読む。remoteは未使用bit23で防御表示だけを受け取り、既存binary invuln flagや21値tuple長は変更しない。victim-ownerの損傷権威は維持。

### 未確認

20Fと最大0.5秒の資料差、235Fの真のlaunch起点、イカスポーン飛行中の無敵/操作開始、同時多段命中の同期、実機同等性は未解消。有限モデルの改善を完全なS3 spawn再現や#273/#308の解決と呼ばない。

## 検証方法・現状

- 専用11件: SP保持、30/100/235F/20Fの境界、ink、reset、実roller再arm、実controllerのmap保持、nativeHUD関数、real NetMatch送信/適用、重複armor拒否、30/60/120Hz固定tick。
- 新検証の基準版対照: 最初の10ケースで1 pass / 9 fail。passは独立したcountdown sample helperだけ。実HUD/Actor/Controller/NetMatchの旧経路は失敗を検出。
- 既存full-production Hit/Spawn描画/IK/材料の9テストも有限防御の時計へ接続。一般invulnのnative flashと新規spawnAtのpreviewは維持。
- catalogのhit-spawn scenarioを235F寿命が観測できる300frameへ拡張。既存画像/IK/zero-dt/cleanupの検査は維持し、native armor clockを明示的に進める。
- actual-browser gateに本物のmatch Actor/Controller/HUDでdeath timer→SP保持→held65ticks→fresh flick→160hitの60超過を追加。PNGと機械判定を既存のSHA拘束済みbrowser証跡へ記録する。
- ブラウザはこのPRのCI待ち。ローカルChromiumの起動制限は迂回しない。Switch/iOS実機や二台通信の合格は未主張。

## 統合時の注意

#323のrespawn wrapperはQR履歴を、ここはSPを別々に保持する。両方を残す。#319のroll/surge damage計算は本件のelse枝へ合成し、spawn優先分岐を残す。#300のtuple末尾special数は変更せず、bit23の表示と共存させる。#325のcontroller map/gyro処理を保持し、物理再armのsampleと混同しない。これらはコードのマージだけで完了扱いせず、合成後の全テスト/実ブラウザを再実行する。

最終ローカル結果: full patch 753 pass / 0 fail / 0 skip、専用11件、Hit/Spawn+catalog検証器を合わせたfocused 63件、local-quality8件、motion/workflow10件が成功。Ver11.3.0固定11files/126抽出値の照合、公開ビルド `72b4bb546a5c`（132 preloads）、全入力/artifact hash照合、`git diff --check` が成功。これらはCIの実ブラウザ結果を先取りするものではない。


## CI検証の補修（run37193444109）

- catalogの235F期限直前はframe250に実到達する。旧probe246は保護中だったため250を追加し、実Actor/Characterのphaseと検証器probeの一致を回帰テスト化。期限切れRGB受入条件は保持。
- active検証のHUD失敗は複合条件を観測値付きへ分解。CSS animation shorthandの文字列全体ではなく、computed animation-nameがnoneであることを要求し、独立CSS時計が止まる意味を検査する。新headの実ブラウザ再実行までは原因・成功未確定。
- 凍結シミュレーションがreal-time introより先へ進むfixtureではHUDを明示表示して描画し、fade完了と数字の可視性を待って証跡を取る。通常introの実機体験を確認したという主張ではない。
- UIはWebKit小型portraitの回転直後floating-stickで失敗。PR315で実CI成功済みのnative resize/orientation +2rAF待機3ファイルだけを再利用し、ゲームの操作条件を弱めない。PR315の敵インクロジックは取り込まない。


### CSSOM数値の受入精度

run37195545808で、actor参照・実タイマー・数字・computed animation-nameの検査は通過し、半周リングの1e-10比率比較で失敗した。CSSはJS doubleをそのまま往復せず、[CSSOM数値serialization](https://drafts.csswg.org/cssom/#serialize-a-css-component-value)に丸め規則がある。検証器だけを0.001 SVG user unit以下の絶対差へ改め、値・期待値を記録する。100単位viewBoxの1pixelより十分小さく、1%ずれ・NaN・空文字・%指定を負例で拒否する。ゲームのtimer/描画計算は変更しない。実CI再確認までは成功未確定。
