# 非ローラー攻撃モーション比較 — 2026-10-02

対象は公開版 `inkwave-public` と独立パッチ。比較基準のゲーム値は Ver.11.3.0、原作の関節曲線は未抽出。Nintendo 紹介映像のソフト版番号・入力履歴・ギア AP は公開されていないため、映像から 11.3.0 のフレーム値を確定していない。以下の関節曲線、回転速度、輝度は **calibration**。ゲーム値と区別する。

永続証拠: `/mnt/workspace/.dev-state/agent-work/evidence/inkwave-motion-compare-20261002/weapons/`。`official-pages.json` に公式 URL と HTML hash、`official-videos.json` に embed/master/最大解像度 playlist/全 segment URL と動画 SHA256、`official-frame-sequences.json` にフレーム列を保存。全ブキ映像は 1920×1080・60 fps。TS の PTS 開始値ではなく、デコードした先頭を n=0 とする。公式カメラは各クリップ内で切り替わるので、同一の姿勢と判断するにはブキ・変身状態・射撃段階も合わせる。

## Inventory と確認結果

| 対象 | 公開版に既存のモーション | 今回の追加・修正接続 | 公式比較、条件、未確認境界 |
| --- | --- | --- | --- |
| マニューバー | `trigger('dodge')` → `_poseDodge` の肩越し回転、両手ピストル、着地後の lock stance | `runner.s3Turret` を Character だけの読み取り view に接続。`lockT=0` 後も停止射撃を維持し、移動・解除で通常姿勢へ戻る。浅すぎた停止姿勢を脚長比で深く校正 | [公式ブキ紹介](https://www.nintendo.com/jp/character/splatoon/en/fashion/index.html) media `0PQkeAEk294`。通常 Splat Dualies のスライド後に膝を深く曲げ、両手を前に固定して射撃継続。n=93–108 付近はスライド、2.0–8.5 s は停止射撃を異なるカメラから表示。元コードは約 0.5 s 後に lock 姿勢を失う。回転 easing、入力からスライドまでの exact frame、足幅の実機値は未測定。Tetra/Gloogga の別挙動は混用していない |
| チャージャー | runner の charge と `charge_release` → 関節反動・発光 coil、kid/squid 変身 | gameplay reset で見た目の charge/flash を消去。既存 charge/store/release 接続を実 rig で検証 | 同公式 media `1O2DPpbDvdL` と `12xDMOzl5Y8`。Splat Charger の溜め・射出・潜伏保持・再出現を確認。charge-3 n=335–370 は潜伏へ入り保持する区間、8.0–9.5 s は再出現/射出。保持中の根拠は公式説明にもある。ギア・ZR/ZL の入力履歴と正確な保持時の手首角度は不明。潜伏中に ZR を離してから再出現する gameplay 条件は別ロジックの未確認境界 |
| スピナー | `_poseWeapon` が実 runner.charging/streaming を読んで brace、`animateWeapon` が実 barrel geometry と coil meter を回転/更新 | reset とブキ交換で cached barrel/charge/stream を消去。新しい銃身回転曲線は追加していない | 同公式 media `vgGl1goD7rb`。Heavy Splatling の溜め→連射を確認。2.0–2.5 s は溜め、n=145–177 付近は射撃移行。実 geometry で meter=charge/burstFrac、銃身回転、潜伏 cancel、再出現を検証。原作の銃身 rad/s、回転の減速曲線、関節震えは未校正。Nautilus の保持機能や Ballpoint の切替を現在の Heavy に追加していない |
| シューター | actual shot trigger → 右手/ブキ反動、bolt/can geometry、射撃中の既存歩行 | 新規の反動係数なし。reset/解除/歩行・空中で接続を検証 | 親の同公式 shooter-2 media `9LnjRgbl2Ng` と Nintendo の shooter-1/3。ブキごとに持ち方が異なるので一般化しない。射撃中歩行の校正は親の担当。反動角、左右腕の形、ギア・照準の厳密比較は未測定 |
| ブラスター | 実 projectile 発生後 `shoot` → 関節反動と pump/support hand | 新規の pump stroke 曲線なし。実 preDelay→射出 event、地上/空中、解除を検証 | 同公式 media `3RVDozgk6XQ`。通常 Blaster、n=24–55 付近の射出/反動を確認。S-BLAST のジャンプ切替ではない。pump ストローク/手の戻りは本作品の既存意匠で、原作と同一の機構とは扱わない |
| スロッシャー | `slosh` → 既存 `_poseSlosh` の bucket heave/support-hand release、実 bucket lip/liquid geometry | 既存の release=.13 s/settle=.66 s 曲線を **実 runner.slosh、実 weapon.windup=.2 s、実 fireInterval=29/60 s** に対応させる。放出後の戻りも次の実攻撃周期へ接続 | 同公式 media `xnGkyA7kgWr`。通常 Slosher、n=70–78 は bucket windup、n≈80–82 にインクの波が見え、その後戻す。これは visible motion の区間で、入力時刻の実機測定ではない。旧曲線はゲームの .2 s 放出前に heave を終え、保持リピートの settle も遅い。joint quaternion/液面の原作減衰は未校正。地上/空中、繰り返し、reset、変身後を実 rig で確認 |
| ボム | `aimingSub` → 左手 bomb-held/マニューバー左ブキ退避、`throw` → 投擲曲線 | reset/ブキ交換で古い held/throw を消す。投擲関節曲線自体は維持 | [公式基本操作](https://www.nintendo.com/jp/games/feature/splatoonqa/guide_basic/index.html) が動画 `ZNcLehKqvhI` を参照。YouTube HTML は `LOGIN_REQUIRED`（bot 確認）でフレームを取得できなかった。source は projectile を release event と同時に生成し、旧曲線に直後の cock/whip がある。原作の放出時の腕、保持している手、hold→throw の frame 列を取得してから再校正する必要がある。取得失敗を一致判定に変えていない |
| Flow | ゲーム state/塗り/HUD はあるが、Character の glow は special-ready にしか接続されていない | `actor.s3.flow.active` → 既存のチーム色 hair/squid glow shader を接続。special-ready `wGlow` や gameplay は変更しない | [公式極秘レポート](https://www.nintendo.com/jp/switch/av5ja/report/index.html) media `xovjK0Ll8Nz`。n=207–238 付近で発動、4.0–8.5 s にチーム色の光/外周 aura を確認。`official-flow-video.json` SHA256 `c7d15d31294c12f20dda8a22e7fc47823ea7e29d62b1bfda9c217f1052482d95`。hair/squid emission の接続は修正したが、公式の外周粒子は未実装。既存輝度/1.6 Hz pulse は calibration、原作測定値ではない |
| INKWAVE original Slam | actor rise/hang/fall → `special_leap`/`special_slam` → 武器を振り下ろす impact | このモーションは今回変更していない | [Nintendo の Triple Splashdown 紹介](https://www.nintendo.com/jp/topics/article/fa3d0720-7dae-476d-badd-24a738ef8dac) はプレイヤーと二つのインクの拳を説明。本作の武器を叩きつける単独 Slam と対応する証拠はない。Triple Splashdown と同一扱いしていない。新 Special 全面実装は対象外 |

## 実装と回帰の意味

`runtime/weapon-motion.mjs` は actual Character prototype へ install する独立モジュール。ゲーム runner を変更するために lockT を書き戻さない。turret 表示だけ読み取り Proxy に positive sentinel を与え、actual gameplay lock は 0 のまま。既存姿勢の追加 crouch は **実 rig の hip-to-ankle 高さの 0.30 倍、spine 0.12 rad** の視覚校正。両ピストルの IK anchor は低くした胸に追従する。これらを Nintendo の距離や角度として登録していない。

Slosher は trigger ごとの actual windup/interval を保存し、winding 中は runner の時計を読み、放出した tick は既存曲線の .13 s に合わせる。spring impulse の判定に渡す dt も同じ曲線で変換し、重複 impulse を避ける。潜伏、reset、ブキ交換で owned attack state を破棄する。reset の shot/throw/dodge timer cleanup には **adapter の exact exported indices** を使い、private array の位置を推測しない。親へ `adapter-delta.json` で T_SHOOT/T_SHOOTL/T_THROW/T_SLOSH/T_REL の export と install 接続を提案した。lane 単独の旧 adapter では追加の五つの timer cleanup は未接続、親統合時の再テストが必要。

`tests/weapon-motion.test.mjs` は source fixture の actual Actor/WeaponRunner と実 full Character を接続し、actual `Actor._finishFrame` が状態を渡して、実 bones / weapon parts / getMuzzle に反映する。衝突・音・hit/paint を stub にする。30/60/120 Hz、地上・空中、form-return、繰り返し、reset、移動射撃を検証。個体単位の opt-out を反事実比較に使い、旧版が turret を失うことと Slosher が早く heave することを同じ実 rig で再現する。これは Switch と値が完全一致したことの証明ではない。

`browser-weapon-motion.mjs` は canonical build の manifest と受信した active module hash を照合し、actual Actor._finishFrame、WeaponRunner、Character、実 Three.js/WebGL を使う。8 対象×修正前/後、各 210 ticks・60 Hz、96 枚の描画と frame trace を保存。地面は平坦、gear=0 AP、カメラは同じ orthographic front-side。公開版の本来の関節/ブキ geometry を描画し、原作映像と同じカメラ条件だと偽っていない。`browser/weapon-motion-result.json` に build revision/contentHash/loaded modules/条件、before-after contact sheet と各 PNG に可視差を保存。最終 exact commit の receipt は lane `done.json` に記録する。

## 次に必要な測定

- 同じ Splat Dualies・0 AP・固定カメラで、スライド開始/着地/停止射撃/移動解除の入力付き 60 fps キャプチャ。normalize した head/hip/ankle の位置と両銃口方向を追う。
- 同じ Slosher の ZR edge、bucket lip、最初の wave を同じ frame 列で測る。release-sync の角度と29F周期の戻りを合わせ、カメラ移動と投影差を分離する。
- Charger の ZR/ZL edge と保持再出現、Splatling の第一/第二 charge 境界、部分 burst、潜伏 cancel の barrel coast を固定条件で測る。
- ボムの公式フレームを取得し、持つ手、projectile 発生、whip、歩行/空中/変身後を比較する。現在の block は上記 YouTube 応答で保存済み。
- Flow 外周 aura 粒子、発動/解除 transition、原作輝度・周期を測る。現接続は body emission の部分対応であり原作 aura の完全実装ではない。

原作 joint animation・distance scale・入力/ギア不明の映像から既定値を捏造して未知を解消しない。Slam の原作対応が不明な点も維持する。

## Slosher の実放出時計 — 追加修正

親の production install `98f7c1e` を一つの VM / Three / G に統合した独立レビューで、押しっぱなしの actual `Projectiles.fireSlosh` が tick `[104,135,166,197]` に発生し、31F 周期へ伸びることが判明した。開始 tick 91 で `slosh=0` となるので初射まで13F。native の `12*(1/60) < .2` と、17F recovery の正の丸め残差が各1F増やす。見た目の retiming だけでは、この gameplay の放出遅延を修正できない。

2026-10-02 に [抽出本人の pinned 原本](https://raw.githubusercontent.com/Leanny/splat3/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSlosherStrong.game__GameParameterTable.json) を再取得した。commit `7280ff9cde8bb1c5dcef46c700c326471584d2e6`、Ver.11.3.0、SHA256 `1d20043ad7efaf2831801afbce601fb1e14bfd11947063903c6fadd6c98f5298` は既存 raw evidence と一致。`/GameParameters/WeaponParam/SwingLiftFrame=12` と `RepeatFrame=29` を使用し、profile の `.2` 秒と `29/60` 秒を変更していない。[Nintendo の Slosher 映像](https://www.nintendo.com/jp/character/splatoon/en/fashion/index.html) も再確認したが、映像には入力 edge / AP /版が無く、入力から放出までの数値根拠は抽出原本であり映像から確定した値ではない。

`runtime/weapons.mjs` の actual `WeaponRunner._slosher` override は、windup と cooldown に `1e-10` 秒の浮動小数境界を使う。秒 dt の windup 超過と、継続入力中の cooldown 超過を次の段階へ持ち越し、不規則な更新でも周期誤差を累積させない。トリガー解除後の idle 負 cooldown は持ち越さず、次の入力は新しい windup を開始する。既存の ink admission / consume / fireFacing / 音 / slosh trigger、解除しても進行中の一投を完了する動作を維持する。reset / death / ブキ交換は残時間所有を消す。整数フレームへ量子化していない。

`tests/slosher-timing.test.mjs` は旧 actual Runner で失敗する初射/連射/解除/ink/reset 回帰を含む。修正後は入力開始 tick 1 に対して放出 `[13,42,71,100]`（開始から12F、以後29F）。固定60Hz gameplay tick を30/60/120Hz描画時計で進めた full runner trace は同一。直接の30/60/120Hz秒 dt、不規則 `.037/.009/.023/.011` 秒、dt=0と小さい残時間、解除/再入力/empty retry/現在の gear 後 ink cost/reset/death/ブキ交換を検証する。別の one-VM production install harness で、親候補の歩行・イカ移動・ブキ姿勢を接続した実 full Character / bones / muzzle / hair impulse の放出同期も検証する。証拠と exact SHA は lane `done-timing.json` に保存する。

## バケツ内部の未確認接続

実際の投擲を追加確認したところ、独自の液面減少・レバー曲線は時計が未接続だった。`_animWeapon` は `T_SHOOT` を参照するが、バケツの trigger は `T_SLOSH` をリセットする。実3放出では液面減少とレバー回転は0、液面の傾き・通常の揺れは動いた。診断用に時計を操作すると既存曲線が動くため、この欠落を原作の動作として認定しない。

公式動画 `xnGkyA7kgWr` の1080/60fps・デコード74/76/78/80/90には内部のインクと放出する波が見える。一方、既存の減少量・回復曲線・レバー機構に対応する原作測定はない。単に時計をつなぐと本作固有の曲線が有効になるため、今回の忠実性修正では接続を保留し、液面減少・回復とレバーは原作対応未確認として残す。入力時刻の分かる同じ通常型の近接映像で、放出との同期を測る必要がある。証拠は永続laneの `bucket-surface-independent-review.json` に保存した。
