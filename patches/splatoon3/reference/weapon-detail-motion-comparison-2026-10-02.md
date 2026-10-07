# 非ローラーの細部モーション校正 — 2026-10-02

対象は foundation `87e6429c91bcb14e9d450eb57374ab6826cc29d8` の公開版 `inkwave-public` と独立パッチ。ゲーム値の参照は Ver.11.3.0。Nintendo の関節アニメーションは未抽出であり、この追加モジュールの角度、減衰、液面深さは **この実 rig の calibration**。公式動画はソフト版・入力 edge・AP・カメラパラメータを公開していない。Switch の関節値との完全一致とは判定しない。

## 一次資料とフレーム比較

出典は [Nintendo Splatoon Base の公式ブキ紹介](https://www.nintendo.com/jp/character/splatoon/en/fashion/index.html)。2026-10-02 にページを再確認し、先行 lane の保持済み 1080p / 60 fps 原本を SHA256 照合してから再デコードした。証拠の所在は `/mnt/workspace/.dev-state/agent-work/evidence/inkwave-motion-detail-20261002/weapon-curves/`。`retained-primary-verified.json` は URL・動画原本・hash、`official-detail-frame-selections.json` は元フレームと crop、各 `*-close-sequence.png` は可視比較。番号は TS の PTS ではなくデコード先頭 n=0。

| 対象 | 公式 media / 比較フレーム | 観察と実装の差分 | 状態と未確認境界 |
| --- | --- | --- | --- |
| 通常 Slosher | `xnGkyA7kgWr`、n=70/74/76/78/80/82/90/96/100/104/108/110 | n=74–78 は内部のインクを保ち、n=80 に波の開始、n=82 は波が内部を遮蔽する。両手は heave 前後も bucket に残る。公開版は support IK を外し、液面時計には `T_SHOOT` を渡す一方、攻撃は `T_SLOSH` だけを reset する。新モジュールは actual runner の release を検出してから modest な drawdown/refill を適用し、support IK を保つ | 波・release 同期と保持姿勢は observation。深さ 0.012、最大 drawdown まで3F、残り recovery での refill は calibration。遮蔽中の原作深さ/refill と frame-by-frame joint angle は未測定。原作と異なる native 下側 grip / handle geometry は維持し、同一の持ち位置とは扱わない |
| 通常 Blaster | `3RVDozgk6XQ`、n=40–80 を2Fずつ | n=40 の低い carry から n=42–44 に持ち上げ、n=54 まで projectile がなく、n=56 では射出している。以後 support hand はブキに残り、短い kick の後ほぼ同じ aim 姿勢に戻る。公開版の36 mm・遅延 pump stroke はこの機構に対応しない。pump を静止し、actual preDelay に沿う low-to-level、短い native recoil と grounded brace を校正 | preDelay gameplay は変更しない。pitch kick .24、back .045、5.2 Hz、damping .85、early low pitch .10、追加 hip drop は脚長の .12 倍。すべて calibration。native needle / bulb は独自意匠として残り、原作機構への対応を認定しない |
| Splat Charger | `1O2DPpbDvdL`、n=222–254 を2Fずつ。保持は `12xDMOzl5Y8` の既存 n=335–370 | n=222–228 の full-charge aim から n=230–238 に muzzle kick、n=244–254 に weapon を下げる。公開版は弱い recoil と lastShot .5s / aim damping による長い cheek aim。新モジュールは actual `charge_release` の native recoil を強く短くし、.10–.38s に carry へ戻す。新しい charge / stored charge はこの return を解除する | kick .36、back .047、5.6 Hz、damping .84、return .10–.38s は calibration。actual charge/store/release と projectile は維持。scope / bolt の native art、full-charge tremble の正確な原作値は未測定 |
| Heavy Splatling | `vgGl1goD7rb`、既存 n=145–177 と追加 n=215–269 を3Fずつ | cluster を低く保ち、stream 中は両腕を brace する。最後の rounds の n=251–254 後、n=257–269 の barrel holes は同じ配置へ落ち着く。公開版は charge 開始の .42rad sweep と1.6/s coastにより、終了後も秒単位で回り続ける。sweep を .30rad 分減らし、cluster を .045 下げ、stream brace、18/s coast と微小速度 cutoff を校正 | 原作 rad/s は6-fold barrel symmetry・blur・unknown inputのため未抽出。drive target14+46×charge / stream64 と active drive のnative rate5は維持。coast18/s、stop .15rad/s は短い stop の校正。Nautilus 保持や Ballpoint 切替は追加しない |
| Shooter | `y7Zl26Zl12n`、n=18–48 を2Fずつ。`9LnjRgbl2Ng` は移動の補助比較 | 最初の clip の carry→aim→連射は強い一発ずつの muzzle climb より、小さい戻りを反復する。actual native recoil が連射中にも gun/body を振り続ける差を、小さい速い recoil へ校正。shot ticks / gameplay aim rulesは維持 | kick .045、back .022、11 Hz、damping .93 は calibration。日本語ページは class 紹介でブキ名を映像ごとに明記しない。英語 [Nintendo Weapons Guide](https://splatoon.nintendo.com/base/en/fashion/weapons/?weapon=0) の検索 excerpt は Splattershot を示すが、同一 asset の本文照合は取得失敗しており variant の断定根拠にはしない。別 clip の機構/速度/固有 recoil を混用しない |

公式 Slosher の original fill visibility は release 前までしか追えない。新しい refill は outgoing wave と native rig の静的 fill を矛盾なく接続する視覚校正であり、original liquid simulation の再現ではない。thumb lever は公式に対応する証拠がなく0へ固定する。元の generic liquid curve / lever を `T_SLOSH` に単純接続して一致扱いしない。

## 実装境界

`runtime/weapon-detail-motion.mjs` の `installWeaponDetailMotion(api, profile)` を production `installWeaponMotion` の後に一回 install する。`installWalkMotion` の前を親へ提案した。既存の exact `CHARACTER_CHANNELS` と `CHARACTER_TIMERS.T_SLOSH` だけを使い、private pose / spring / timer indices を複製しない。チャンネルを通じる姿勢差分と actual source `_recoil` のパラメータ校正なので、既存の arm solver / grip / secondary springs は一つのまま。

Slosher の release は trigger 時点の actual weapon.windup / fireInterval と actual runner.slosh の遷移に基づく。drawdown は windup では0、release 後に開始し、次の実 attack までに0へ戻る。静的 fill の mesh も bottom を固定して縮めるため、動く surface だけが fill 内に埋もれる修正ではない。fill の範囲は **実 index buffer と drawRange が参照する頂点** から求める。geometry AABB / unused vertices は使わない。native near/far fill の両方を扱う。

元の Slosher windup は down .22 / back .34 の大きい translation を持つ。既存 retiming / rotation / torso / hair impulse を保ち、translational heaveだけ X .8 / Y .45 / Z .6倍へ縮める。これは waistに近い原作 hand位置と本作の短い腕に合わせた calibration。不規則 dt / 移動 / 空中 / steep aim / sub の診断では、native Slosher の最大 raw reach .21312 は sub時の部分IK左手だったが、別フレームで完全保持の右手も .20962 の reach 超過を持つ。native error と実 IK weight、actual bone-to-grip distance の両方を記録し、部分 IK と完全保持を区別する。Slosherの両手保持を戻すのはsub inactive時だけにし、Blaster/Slosherのdetached sub handの前フレームraw errorが次のgun-shoulder reachを増やさないようfeedbackを抑える。描画 muzzle の位置・姿勢も自然に変わるが、actor position / charge / ink / projectile数 / gameplay aim rules は書き換えない。

Slosher / Heavy / Blaster の完全保持右手 target は actual right-shoulder と actual `(arm.a + arm.b) × .9995 − .002` の reach sphere 内へ投影する。support IK が .99 を超え、明示 target がない時だけ、actual left shoulder と rotated native grip 差分から作る第二 sphere も加え、8回の alternating projection で共有 weapon frame を両腕の範囲へ収める。detached throw hand はこの二手制約へ含めない。最終 limb rotation は unchanged native `_solveLimb` が一回実行し、native residual をそのまま測る。腕の長さ・hand geometry は変えず、Slam/leap の exact timer / special active 時はこの補正を外す。Bomb の transactional native pose sample は `_dt=0` なので scratch vector だけを再利用し、weapon visual track / gripCorrection を作成・進行させない。これは rig feasibility の校正であり、Nintendo の関節曲線そのものではない。

Heavy の angle は新 velocity×dt の Euler 近似をやめ、同じ exponential motor の速度と角度を解析積分する。30/60/120Hzと不規則 dt、dt=0 で同じ積分結果。native Character の最大 .1s tick と production fixed clock は維持する。native drive values の original 同一性は未認定。

WeaponRunner reset / death、weapon swap、hidden、squid form、dance、dispose で owned tracks と part transforms を戻す。opt-out の character に owned state がなければ part reset を行わない。charge store・12F初射 / 29F反復・一放出一hair impulse・dual-turret・roller・INKWAVE original Slam・gameplay consumption/projectile logicは維持。Slam を Triple Splashdown に対応づけない。

## 実 full rig の比較と回帰

`tests/weapon-detail-motion.test.mjs` は単一 VM 内で unchanged production installer を一回だけ実行し、新 installer も同じ realm で install する。`Symbol.for` の own-prototype guard を Character と Runner reset に別々に持ち、別 realm から同じ実クラスへの重複 install も wrapper identity が変わらない回帰を含む。actual Actor._finishFrame → actual WeaponRunner → full Character → actual bones / indexed weapon mesh を測る。衝突/audio/paint/hit は pose test 用 stub であり、Switch / WebGL 動作証明の代用ではない。

- Grounded / airborne Slosher、30/60/120Hz、release前 fill維持、release後の drawn fill top / bottom と surface、refill、static lever、support IK、一wave一hair impulse、reset。
- 30/60/120Hz render から同じ60Hz simulation tickを進め、full pose / native IK / muzzle / liquid snapshot / hair countが同じ。初射tick `[13,42,71,100]`、開始から12F / 以後29Fを維持。
- Blaster before / after の native recoil peak **.25973→.13228rad**、pump **1→0**、native arm reach error **.000305→0**。hand target を設定できたことだけで reach 達成とは判定しない。
- Shooter before / after の peak **.05053→.02328rad**、shots `[91,97,103,109,115,121,127,133,139,145]` が同じ。
- Charger full charge→squid store→kid return→actual release、coilとprojectile charge維持、return時のnative arm reach、次chargeによる前のfollow-through解除。
- Heavy actual stream→coast、pause、hidden/form/swap/death/reset。native reach と actual indexed cluster height の before / after を保持。
- Nullable `Character.update(dt, null/undefined)`、opt-out reset、walking / airborne / steep aim / sub-throw / formの有限遷移。同一 native pre-history から始める unique native Slam preview の full pose / actual hand transforms は before / after で同一。zero-time native throw pose評価でも weapon tracks / grip diagnosticsは不変。

追加の60Hz full-rig before / afterでは、Charger release peak **.17239→.23849rad**、release後.5sの aim weight **.92774→0**、native arm reach **.000404→0**、shot count **1→1**。Heavy の full-charge indexed cluster Y spanは **[.71049,.78491]→[.68918,.76720]**（kid space）。release後4sの barrel speedは **7.58028→0rad/s**、native arm reach **.000468→0**、shot count **40→40**。これらは本作の actual rig の比較値であり、Nintendo world scale としない。

混在動作の actual fully-held native reach residual は5種すべて0。maximum full-grip bone-to-weapon distance は Slosher **.16342→.00200**、Blaster **.03625→.00251**、Heavy **.00267→.00250**。steep aim / continuous fire の最大 grip projection は Slosher .25347、Heavy .08738、Blaster .04645（kid space、この rig の reach 校正）。そのフレームの actual bone fist-hole と authored weapon grip の差は roundoff 以下、nearest drawn indexed handle vertex は .00786–.03082（world units）。これは authoring geometry と actual bone の整合であり、Nintendo の手位置・finger contact の一致は認定しない。detached sub-hand の raw error は Blaster **.03332→.06467**、Slosher **.21312→.24230** と増えるため、全 raw IK error を改善したとは判定しない。部分 IK 左手はこの時点で foregrip を目指しておらず、Bomb lane と親の final composition で外観を確認する境界を残す。

exact lane commit のテスト receipt、量的比較、source/evidence SHA256 inventory は永続 lane の `done.json` と `evidence-manifest.json`。親が canonical build / actual WebGL / final integration gate を独立検証する。lane の node fixture が完了したことと統合 product の完了は分けて扱う。

残る実機測定は、同じ named weapon・0AP・fixed camera・入力 edge を付けたキャプチャでの original joint angles、bucket interiorの遮蔽中の fill、barrel phase/rad/s、moving/steep aimのgrip/contact。今回の observations と calibration でこれらの unknown を解消済みにしない。

## 統合productionの独立再レビュー — 2026-10-03

基盤は14個の追加installerを含む `d846b5b8fadd6cef86e7d02699cf9b3b7356b80e`。別realmの重複installはwrapperを増やさなかったが、snapshotはそのrealmの空WeakMapを読んでおり、実SlosherのwindupとChargerのreleaseを失った。prototypeのSymbol.for記録へ実tracksを保持し、snapshotは元のinstallationを参照するよう修正した。実Actor/Runnerで開始した攻撃とresetの両方を別realmから照合する回帰を追加した。関節値、profile、native IK、ゲーム時計は変更しない。

親browserの `flow-kid` support-contact失敗は、idle shooterに対する無条件の左手接触assertionだった。実native `HOLD.shooter.twoCarry=0`、`twoAim=1`、idle時の `IKL=0`、`IKR=1`、`LTW=0` を確認した。同じ240-frame操作のCPU/indexed描画頂点ではframe21の左手最短距離が約0.43660、右のnative grip誤差はroundoff以下。Flow中も意図した片手carryであり、これだけではheld-hand不具合ではない。射撃で実support weightが.99を超える全frameは、両手のauthored native grip距離<.005、native IK residual<.0005、左手のindexed geometry距離<.035を要求する。真に保持された手の条件を弱めていない。

共有browser probeの修正は親へ `review-weapons/integration-handoff.json` で引き継ぐ。実IK weight/明示target/dual bombSwapとauthored grip/socketを記録し、free FKとheld gripを区別すること。単に全武器メッシュへ近いだけでは正しい握りを証明できない。現在の再現はCPU証拠であり、修正後のGPU gateの合格ではない。Nintendoの現在の一次ページを再確認し、保持済み公式動画hashを検証・再観察したが、原作非公開曲線・実機操作条件の未確認は維持する。

## Managed action admission follow-up — 2026-10-03

At complete production base `f125ed9`, old leap/slam ages still suppressed this module's Heavy brace and native arm reach correction after the installed Special owner relinquished its pose. `activeSpecial` now uses the shared general `specialMotionAllowsAction` contract, preserving disabled/unmapped/detached native fallback and mapped active Storm exclusion. A real Slam followed by real Heavy charging reproduces the old exact pose-array difference; the corrected zero-dt counterfactual differs only in obsolete leap/slam ages and matches the exact pose, authored grips, native solver diagnostics and actual indexed barrel output (native iterative geometry convergence bounded at `1e-8` scene units). No weapon mechanism, joint calibration or gameplay clock changes.

The old Flow test's free support-hand premise preceded the parent's official-source-supported carry hook. It now validates both actually held hands through quiet carry/Flow/aim using authored grip sockets, native IK and indexed contact, without disabling or forcing the parent's carry policy. The bare-trigger native Slam test explicitly selects native Special opt-out; a trigger alone is not a mapped managed action. Fixtures now use actual native Physics. Prior weapon volley counters remain bounded event evidence, not projectile collision/network attestation.

The current official Nintendo page and verified Heavy/Dualies footage were inspected before changes; exact original input/build/gear and numeric curves remain unknown. See `action-admission-comparison-2026-10-03.md` and durable `review-admission/` findings, source/test receipts and parent integration handoff. Parent retains canonical build, actual GPU and complete exact-SHA Actions.

The required lifetime check also reproduced track resurrection after disposal through a zero-time native state delegation. The installed shared registry now stamps disposed rigs, so both realms' helpers report disabled and earlier/native delegation cannot recreate this module's tracks. Native disposal/reset/event delegation still runs. The regression records actual indexed cluster/native IK before disposal and checks tracks/clocks afterward; it does not claim a disposed mesh is rendered.

## S3 ブラスター毎ショット機構 — #915, 2026-10-07

通常 Blaster の S3 appearance は [Inkipedia](https://splatoonwiki.org/wiki/Blaster)（2026-10-07閲覧）に「左側レバーが下降」「中央スプリングが前部セクションを前方へ振る」という2つの新しい武器アニメーションが**毎ショット**起こるとある。任天堂は関節曲線を公開していないので、以下の値はすべて **この rig の内部校正**であり、Switch のフレーム値とは一致扱いしない。

- `runtime/blaster-mechanism.mjs`: トポロジーと校正。レバー peak .55rad（回転軸は前進軸、下方向）、front peak .014（+Z）、周期は rise/hold/fall の smoothstep、settle .30s（50F 間隔の次のショットより前にレストへ完全回復、age は exact 0 のまま消える）。
- `runtime/blaster-mechanism-model.mjs`: builder ラップで `lever`（左側・＋X、hinge pivot）と `front`（バレル中間のカラーラ、fin と muzzle lip の間）の2パーツを追加。attribute contract は `Parts.add` と同じで far LOD の at-rest body に merge される。
- `weapon-detail-motion.mjs`: `trigger('shoot')` を実発射イベントとして所有（空撃ち・ZR保持・windup・イカ・死亡では発生しない。remote は NetMatch の `tr` リプレイで同じ trigger を受ける）。age は `_updateStates` の sim dt だけ加算し、変換は `_animWeapon` で適用。generic recoil（`withRecoil`）は加算のまま、pump 抑制は据え置き。`clear`（form/death/hide/swap/reset/dispose）で全チャンネルレスト復帰。

確認は `weapon-detail-motion.test.mjs` の production adapter 構成: 30/60/120Hz で実発射1回につき機構1サイクル、idle・空撃ち・イカ・死亡・交代・reset・opt-out ではレスト、実 NetMatch の `_setupActor`/`_play` リプレイで local/remote の trace 完全一致、FixedClock の30/60/120Hz 描画分割で trace 完全一致。**発射タイミング・弾・当たり・インク・移動は変更しておらず、#308 の winding/recovery と bullet/actor parity も維持する。実機（Switch Ver.11.3.0）での frame-by-frame 比較は引き続き未確認とする。**
