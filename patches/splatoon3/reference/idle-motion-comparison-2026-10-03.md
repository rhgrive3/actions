# 試合中のヒト待機モーション — 2026-10-03

対象は公開 `inkwave-public/src/game/character.js` の実 Character、実 Actor / WeaponRunner、スキンドメッシュと解析 IK。独立パッチは `runtime/idle-motion.mjs`、接続 API は `installIdleMotion(api, profile)`。メニュー・勝利・敗北ダンス、移動中の歩調・接地の実装は変更しない。

## 新しく取得した一次資料と限界

任天堂公式の[ブキ紹介](https://www.nintendo.com/jp/character/splatoon/fashion/index.html)を取得し、ページ内 `js-media-shooter-1` の media ID `y7Zl26Zl12n` を確認した。[公開 HLS](https://media-assets.apps-jp.nintendo.com/media/splatoonbase/0000855_a2868da3ca53c4932216c02d46ac688a_1080.m3u8) の両セグメントも再取得した。連結動画 SHA-256 は `6fd20313b229072b55aca46805afc943cc22c3358620b37ed7dceee674ee76b7`。以前の保持済み動画とバイト一致することを確認した。

1920×1080、60/1 fps、デコードした最初のフレームを n=0 とする。n=588/600/612/624/636/648/660、相対時刻 9.8/10.0/10.2/10.4/10.6/10.8/11.0 秒、実 PTS 11.869833〜13.069833 秒を確認した。射撃が終わり、ブキを下げて両手で保持する短い区間が見える。膝は曲がり、足は離れている。待機中に大きなブキ回転は見えないが、**この短い映像は長時間の待機ジェスチャーが存在しないことを証明しない**。

[公式ブキ選びの説明](https://www.nintendo.com/jp/ichikara/av5ja/index.html)と、その[サブ配置後の画面 007](https://www.nintendo.com/jp/ichikara/av5ja/photo/01/007.jpg)・[スペシャル使用画面 008](https://www.nintendo.com/jp/ichikara/av5ja/photo/01/008.jpg)も新しく取得した。007 はスプラッシュシールド、008 はメガホンレーザーで、**どちらもボムを保持する関節曲線の証拠ではない**。静止画から、待機との切替時間や腕曲線は測れない。サブを構えた手を待機ジェスチャーが奪うことへの修正は、公開本体のレイヤー順と実際の出力姿勢で確認したエンジンの不具合修正として扱う。

公式動画はシューター紹介素材であり、ブキの正確な型番は media metadata に明記されていない。ステージ上の kid、射撃後の短い静止区間、同一カメラ内の比較を条件とした。収録版・入力履歴・ギア能力は不明。ブキ選び記事は 2024-04-01 時点、Joy-Con 2 本持ち / Switch Pro コントローラーでの説明と明記されるが、動画をその操作・版に特定する根拠にはしない。パッチの gameplay profile は Ver.11.3.0 を対象とするが、この映像の待機曲線を Ver.11.3.0 実機の測定値として扱わない。全ブキ固有の待機、関節角、呼吸周期、歩き始めのフレーム数は未確認。

証拠は `/mnt/workspace/.dev-state/agent-work/evidence/inkwave-motion-detail-20261002/terminal-idle/`。`fresh-source-fetch-*.json` と `fresh-source-sub-images.json` に URL・取得時刻・bytes・hash、`official-shooter-pts.json` に PTS、`official-frame-selection.json` に抽出条件、`official-idle-tail-sheet.png` に目視資料を保持した。旧 embed URL の 403、存在しない URL の 404 と証明書エラーも保存し、制限を迂回していない。

## 実装差分、再現と影響

| 項目 | 原作の根拠 / 確認範囲 | 公開本体の実装・再現 | 修正 / プレイへの影響 / 確認状態 |
| --- | --- | --- | --- |
| サブ保持中の待機割込み | 公式のサブ / special の区別。ボム保持関節曲線・切替時間は未確認 | `_updateStates` の `idleNow` は `wSub` / `bombHeld` を見ない。`_buildPose` は `_poseSubAim` の後に `_poseFidget`。静止してサブを保持し、native goggles fidget が発生すると左手目標が上書きされる | サブ保持・投擲回復中は待機レイヤーを適用しない。実リグで手の変位が 0.414061467 → 0.000331778 INKWAVE 単位。arm IK error は双方 0。これが修正済みの実装不具合。Nintendo の数値ではない |
| ブキを構えた静かな待機 | shooter n=612〜660 の下げた保持姿勢。長時間の全ジェスチャーは不明 | `_poseFidget` の twirl / stretch / tank / goggles / bounce / shake が持ち手、ブキ回転、つま先、髪・タンクの spring impulse を大きく変える | 試合中の静かな待機には native look のみ残し、他の大きな演技を抑制。これは **視覚校正**。全 7 ブキで実描画対象の indexed geometry と native IK を確認したが、7 種類の原作固有待機を認定した意味ではない |
| 呼吸と重心移動 | 短い静止区間のため原作の呼吸周期を分離できない | `_breathe`、`brPh`、`S_SHIFT`、姿勢 FK / head stabilisation が既に存在 | native 呼吸・重心移動を保持。実胸骨の quaternion が変化すること、root 座標を変えないことを確認。原作と等しい周期・振幅とは判定しない |
| 小さな足の調整 | 正確な原作の頻度・接地位置は未測定 | `stVar` / `shufT` が小さな stance 変更を出し、native `_updateFeet` / 独立 walk layer が実 replant と脚 IK を担当 | 足時計・接地・歩調を変更しない。native shuffle の expiration を再現し、実足の移動→再接地を確認。原作の数値へ変換しない |
| 見回し・その場旋回 | 公式 clip のブキ保持の向きは安定。原作 gaze selection は不明 | native look fidget は head と同時に spine / chest も回し、胸追従のブキを振る。通常 `_poseLook` は視線・ターンに対応 | native look gesture の head / eye delta を 0.20 倍に校正し、その gesture の胸・背骨 yaw は保持前に戻す。ブキ向きを保った小さな視線変化を実頭骨で確認。通常の `_poseLook`、周囲への native glance / turn-in-place はそのまま。0.20 は Nintendo の係数ではない |
| idle → walk | original 入力時刻と完全な移行曲線は不明 | native fidget は移動開始時に消えるため、極端な weapon flourish からの戻りも瞬間的だった | 大きな待機ジェスチャーを抑え、歩き始めへ持ち越さない。動き始め以後の native pose、hand、IK、gameplay trace が opt-out と一致することを確認。active walk の cadence / contact / shared file は変更しない。原作の移行曲線認定ではない |
| 行動の割込み | 射撃→保持の短い戻りを公式 clip で観察。被弾・復活・空中の原作時間はこの資料では不明 | 待機 eligibility はすべての special / sub / action 状態を見ない | 射撃・チャージ・ローラー・サブ・変身・空中・復活・special・superjump・被弾では idle fidget が先行レイヤーを上書きしない。Actor / Runner の時計・入力・ink / hp / physics は変更しない |

既知の残存差分: 公式のシューター静止保持は両手だが、公開本体 `HOLD.shooter.twoCarry=0` は非射撃時に左手を解放する。このモジュールは active walk の持ち方や遷移へ介入しないため、その差分を「解消済み」にしていない。idle だけで IKL を即時 1 にすると歩き始めに左手を落とす新しい段差が生じる。親の歩行所有範囲で carry support の連続性を合わせて検討するため、具体的な接続要求を `integration-handoff.json` に残した。

## パッチ構成と検証

production installer の既存 walk / weapon hooks の後に `installIdleMotion(api, profile)` を一度追加する。既存 adapter の named timer/channel exports だけを使い、新たな source-text hook は不要。`Symbol.for('inkwave.s3.idle-motion.install.v1')` により別 module realm からの重複インストールも無害。`s3IdleMotionEnabled=false` は同じ実ソースの反事実比較用 opt-out。`idleMotionSnapshot(ch)` は診断専用で、ゲーム状態を生成しない。

`tests/idle-motion.test.mjs` は production `install(profile)` を一つの VM realm で実行し、実 Actor `_finishFrame` → 実 Character → 実 THREE の full rig を使用する。world collision / projectile effects は fixture に置き換えるが、Character、骨格、Pose application、WeaponRunner、解析 IK は置き換えない。cheap focused command は `node --experimental-vm-modules --test patches/splatoon3/tests/idle-motion.test.mjs`。

実 bone transforms、native arm/leg IK error、現在表示されている indexed mesh の三角形頂点を記録する。オプションの `INKWAVE_IDLE_TRACE_PATH` は永続 evidence 内へ解決する場合だけ受け付け、native CPU skinning の全表示 mesh を OBJ にも保存する。AABB や target への代入のみの証拠は使わない。CPU OBJ は material の vertex shader / face deformation を実行した GPU screenshot ではない。

検証項目は actual production composition、別 realm を含む二重 install、nullable preview、dt=0 の停止、reset / death / weapon changes / form / sub / action interruption、native breathing / shuffle / turn、全 7 ブキの静止保持、active walk と action の実出力不変、30/60/120 Hz display clock の固定 gameplay ticks 上での実骨・geometry 同一性、dispose の一回性。新しい geometry / material / scene object は生成しない。browser / build / exact-SHA CI と Switch 実機比較は親担当であり、focused VM 成功で代用しない。
