# 公開INKWAVE：接触・爆風・回復4件

対象は #73 / #176 / #200 / #221。main `404c66c858cfea14e81225fb6364febcf2c9c528` の公開 `inkwave-public/` とactive patchに対する独立バッチ。旧試作版を変更しない。

## 出典と範囲

- [S3 Wiki スプラローラー](https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%82%B9%E3%83%97%E3%83%A9%E3%83%AD%E3%83%BC%E3%83%A9%E3%83%BC)：v11.0.0表で轢き125HP、転がし回復停止20F、横振り43F、縦振り58F。転がし欄の「20F（0.167秒）」には秒換算の不整合があるため、秒部分を採用せず20F=1/3秒を使う。
- [固定11.3.0 Roller原典](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponRollerNormal.game__GameParameterTable.json)：BodyParam.Damage=1250（HPへ0.1倍）、WeaponRollParam.InkRecoverStop=20、WeaponWideSwingParam.InkRecoverStop=43、WeaponVerticalSwingParam.InkRecoverStop=58。単位/動作別のフィールドを混同しない。
- [固定11.3.0 Blaster原典](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponBlasterMiddle.game__GameParameterTable.json)：BlasterBurstParam.ShotCollisionHitRadiusRate=.4234。[sendouの同ブキparameter表示](https://sendou.ink/params/blaster)の索引も同値を返す。
- [任天堂更新履歴](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/)：11.0.1の地形/物体着弾時の対人爆風判定が過大だった修正と、比較版11.3.0を確認。倍率自体の一次公表ではない。内部rawはコミュニティ抽出として扱う。
- [Splat Roller](https://splatoonwiki.org/wiki/Splat_Roller)：直接の轢き接触で攻撃するブキであることの補助説明。地形を越える接触ダメージを認める資料はなく、#73は既存contact候補に遮蔽確認が欠ける実装不具合として扱う。rawのドラム形状やノックバックの完全再現を本件で主張しない。

## #73 ローラーの固体遮蔽

既存の前方/側方/高低差/速度の候補判定を維持し、最寄りのドラム横位置を通る owner→drum→target の2区間を実Physics.segmentで確認する。solid OBBへの接触があればdamageとrollHits登録を行わない。raycastが始点内包を無視する仕様に対し、ドラムだけ壁の向こうから始めないようowner→drumも検査し、利用可能ならpointInsideで各点の内包も拒否する。

空地・薄壁・回転壁・角の露出/遮蔽を同じ実候補で比較。壁を除去した同位置では125HPの接触を戻す。フレンドリー/死者/射程外除外と0.5秒再接触抑制を維持する。

これはnative contact volumeに対する保守的なstage visibilityモデル。S3のドラムvolume/押し戻し/あらゆる角の接触形状の一致は未校正。ボス専用rollHit経路は遮蔽判定の対象に広げない。

## #200 轢きダメージ

profileへrollDamage=125を明示。raw1250×.1、Wiki125の両方を照合し、actual _roller→applyHitの引数も125。既存body表現で標準100HPを1回で倒す結果は変わらない。ローラー基本/疾走速度、90F疾走待ち、flickダメージ等は変更しない。ボスがこのmain基礎値を読む場合も125になり、別の実機ボス倍率を認定するわけではない。

## #176 転がしの回復

gearの実インク減少検出で、sub使用を優先し、rollerのactive rollingによる消費なら専用20FをrecoverStopRemainingへ設定する。それ以外の横振り43F/縦振り58Fを残す。resource側が常に武器43Fを再適用して20Fを無効化しないよう、直近が転がし消費のときだけ独立countdownを使う。lastFireは静止中もrollingがリセットするため、その時計を転がし専用経過と取り違えない。

アクティブrolling中は回復させず、最後の実消費から停止後20Fで最初の回復を認める。先行した振り/サブの長い未完了停止はMath.maxで保ち、20Fへ短縮しない。次の実インク使用とresetで分類を更新する。既存の追加inkRecoverStopやbusy/保存チャージの制限も維持する。静止したままZR保持中の本家回復挙動、インク不足不発の別停止(#241)は本件で変更しない。

## #221 地形爆風の対人半径

Projectiles._impactの呼出スコープだけworld/terrainフラグを付け、_blastBurstの対人半径判定へ.4234を掛ける。通常の寿命爆発、プレイヤー直撃、ボス直撃は別経路なので縮めない。finallyでフラグを戻し、再利用projectileや例外後に状態を漏らさない。

現半径3.385WUに対する切詰め半径は1.433209WU。比較対象は同一ブキの無次元倍率で、絶対の実機↔WU換算ではない。対人候補を切るだけで、塗り、FX、ボス専用splash半径、ダメージ帯の未検証な倍率を同時に変えない。既存LOSを維持。接触normalを床/壁/斜面に変えた実_impact経路で境界直内/直外を検査し、通常空中爆発の元半径も別に検査する。

## 重複/統合

2026-10-04にopen/closed対象Issueと現在open PRを確認。PR63/64/186/324/329にこれら4件の実装はない。PR186の新しいghost paint authority早期returnも_impactの内側なので、本cause wrapperはフラグのfinally所有権を維持できる。PR64の段階弾道も_impactと_BlastBurstを呼ぶが、同時統合の全回帰は別途必要。

PR327のサブコストactor-local化と、本PRのgear回復モード選択は同じupdate付近のテキストが重なる。統合で共有SUBへの変更を復活させず、サブ優先回復と本roll分類を両方残す。Storm担当のresources変更も落とさない。個別green CIは無条件merge保証ではない。

## 検証

専用10件が実Actor/WeaponRunner/Projectiles/Physics OBB経路を使用し、固定60Hzの経過を30/60/120Hz描画で比較する。敵やカメラ/塗り装置など必要な表示/接触はfixtureで固定する。GPU描画・Switch/実スマートフォンの一致をCPU試験で認定しない。全回帰、公開minify build、raw照合、Actionsの結果をheadごとに記録する。

最終ローカル結果：全752/752、専用source10/10・公開minify build10/10、local-quality8/8、motion/workflow gates10/10。原典11ファイル・抽出129値の照合成功。contentHash `d7134eb4002a7dfd2392baff626c6592ce7c70f47c8565f4a769910048fb3c7a`。最後にpaint/FX保持assertを補強し、専用・公開build・全回帰を再実行した。ローカルChromiumのUnix socket制約は残るため、Actionsのブラウザー結果は別に追跡する。


## 関連5件目 #350：Roller振り上げ中のヒト速ギア分類

拡張前head `1212486effa1b6421f6564971ba14fea31d08113` は[Actions 37193436767](https://github.com/rhgrive3/actions/actions/runs/37193436767)のvalidate/active/catalog/uiが全て成功（2026-10-04確認）。このcheckpointを保持し、追加後のheadは別に検証する。

公開gearのattacking判定に `flick >= 0` を加える。実際の振り上げ状態を参照し、短押しでZRを離していても射撃用のヒト速曲線を選ぶ。rolling中の1倍、通常歩行用の最大1.5倍、基礎速度/振り時間/塗り/ダメージは維持する。

### 根拠・数値の意味

- [S3 Wiki スプラローラー](https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%82%B9%E3%83%97%E3%83%A9%E3%83%AD%E3%83%BC%E3%83%A9%E3%83%BC#abilitypower)（表11.0.0、2026-10-04再閲覧）は射撃時0/57 GPで0.480/0.600 DU/f、通常歩行は0.960/1.44。コロコロはヒト速で上がらない。
- [固定11.3.0 Roller](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponRollerNormal.game__GameParameterTable.json) はヨコ/タテのSwingMoveSpeed=.048。[共通ギア表](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/misc/params.json)のMoveVelRt_ShotはHigh/Mid/Low=1.25/1.125/1。既存gearCurveを一回適用する。
- 同じflick時刻の無装備比を比較し、3/10/57 APは各射撃curveの1.0241425/1.07575/1.25。通常歩行curveの1.048285/1.1515/1.5を振り上げへ掛けない。無次元倍率の修正で、絶対WUの校正とは切り分ける。
- nativeの振り上げ中lerpで基礎速度を最大0.45倍へ落とす処理自体は本件の校正対象外。これを本家一致と新たに認定しない。

### 実装検証

専用追加4件で、0/3/10/57 AP×ヨコ/タテ×短押し/保持の実Runnerを130tick進め、初回/2回目のwindupと発射後、rolling無効、通常歩行、前回firingT残量差、装備更新/reset、別Actor、敵インクclamp、他ブキ切替、30/60/120Hzの実水平速度traceを確認する。実インク消費や弾の挙動は既存回帰で維持する。

PR341 head `f81652b6fb478241a54c3676d33d3c030a186133` の正確なgear/flow/flow-effects runtimeとprofile.flowへ、今回のflick判定1項だけを手動合成した追加1試験（0/27/57 AP）も実施。実イベントで発動したFlowの+30 APと57上限が、振り上げの全位相で射撃curveを一回だけ使い、weapon/runner同一性を保持し、reset後に通常装備値へ戻る。条件付きギア新PR全体の統合や実機描画検証と同義ではない。

#350追加後：全回帰756/756、専用source14/14、公開minify出力14/14、Flow実runtime合成1/1、local-quality8/8、motion/workflow gates10/10、固定11ファイル129値一致（未知14維持）。contentHash `28df82e4d9ba74bdf14509217f6692c858994e9989f9005a11c3ac2eddbfb158`。追加後headのActionsを別途確認し、この5件でscopeを固定する。
