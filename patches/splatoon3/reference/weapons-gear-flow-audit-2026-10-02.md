# 非ローラー・ギア・Flow の比較記録

対象は公開版 `inkwave-public` に独立適用するパッチ、比較版は **Splatoon 3 Ver.11.3.0**。本家の実機映像をこのレーンで新しく測定していない。以下の試験は公開版の実コードを adapter で接続したロジック試験であり、Switch 実機一致の証明ではない。距離換算 factor=1 は未校正のまま保持する。

一次抽出元は [Leanny/splat3 の固定コミット](https://github.com/Leanny/splat3/tree/7280ff9cde8bb1c5dcef46c700c326471584d2e6)。対応ブキの同定は `data/mush/1130/WeaponInfoMain.json` の `Label` / `SpecActor` で確認した。順にスプラシューター、スプラチャージャー、バレルスピナー、バケットスロッシャー、ホットブラスター、スプラマニューバーである。これで本家の全キット・サブ・スペシャルが公開版と一致することにはならない。

永続証拠は `/mnt/workspace/.dev-state/agent-work/evidence/inkwave-walk-20261002/weapons-gear-flow/`。`source-manifest.json` に URL / SHA-256 / bytes、`raw/` に完全な抽出 JSON、`nintendo-{0,1,2}.html` に公式本文を保持する。数値を追加した6 bindingsは従来の120 bindingsを変更せず追加し、`numeric-status.json` は sync script から生成する。

## 根拠付き修正

| 差分と影響 | 一次根拠・条件 | 修正 / 公開版実コード回帰 |
| --- | --- | --- |
| バレルスピナーの射撃中ヒト速が、共通曲線の最大1.25倍になっていた | `WeaponSpinnerStandard...json#/GameParameters/MainWeaponSetting/Overwrite_MoveVelRt_Shot_{Low,Mid,High}` = 1 / 1.175 / 1.35 | equipped weapon ごとの曲線を接続。0、10、57 APと別ブキの装備隔離を試験。歩行速度のweight分類は別の未確認事項 |
| ブラスター地上拡散0が未接続。upstreamは `w.spread` を参照し1.2度へ戻っていた | `WeaponBlasterMiddle...json#/GameParameters/WeaponParam/Stand_DegSwerve` = 0、`Jump_DegSwerve` = 10 | grounded の `spreadGround` を実際の射撃経路へ接続し、地上/空中で試験 |
| ブラスターのアク強が共通 Mid=.75 を使っていた | 同 JSON の `spl__PlayerGearSkillParam_ActionSpecUp_ReduceJumpSwerveRate/Mid` = .5。High1 / Low0 は `params.json#/ReduceJumpSwerveRate` と抽出者 [ability.html](https://leanny.github.io/splat3/ability.html) の専用テーブル [1,.5,0] で照合 | ブキ専用曲線を接続。10 APの値が共通曲線と異なること、57 APの空中ブレが地上値へ達することを試験。着地後の経過フレーム別ブレは未確認 |
| Flowを塗りや非致死ダメージだけで発動でき、発動中ずっと10Hzで足元を塗っていた | [公式更新履歴11.0.0](https://support.nintendo.com/jp/switch/software_support/av5ja/1100.html) / [公式レポート](https://www.nintendo.com/jp/switch/av5ja/report/index.html) は、塗り/assist蓄積で相手を倒した時に入りやすくなり、発動または延長時に足元が塗られると説明 | 発動判定をsplatイベントへ限定し、塗りを発動/延長イベントだけへ移す。通常updateで再び塗られないこと、敵へのダメージcreditでassist延長が生じることを試験。閾値と倍率は依然暫定 |
| ボムが60Fの減算後に浮動小数点残差で次フレームまで残る | `WeaponBombSplash...json#/GameParameters/MoveParam/BurstFrame` = 60 | 0境界に数値誤差許容を加え、空中では未起動、着地後60回の固定tickで一度だけ爆発する回帰。着地tickを含む数え方を本家で比較した証明はない |

## 調べた全項目と未確認事項

| 項目 | 確認できたこと / 現行パッチ | 未確認の理由・次の計測 |
| --- | --- | --- |
| Shooterの省略既定 fire/recovery | 1130の`WeaponParam`に RepeatFrame / InkRecoverStop がない。設定6F/20Fは既存calibration。ダメージ360→180、弾齢8→40F、インク.0092は抽出値 | 固定repoの全1130parameter treeにtype既定値schemaが見つからず、別版で埋めない。11.3.0、スプラシューター、0APで持続射撃の初弾/間隔、最後の射撃からタンク回復開始を60fps録画 |
| Charger charge/recovery/repeat | Full18 / Min2.25 tank points、40→80部分/160フル、keep75F、keep pre-delay23F/18F、FreezeFrameFull/Min1Fは抽出値。chargeTime60F/recovery20Fは省略既定で未確認。upstreamの部分S曲線とrelease cooldown.28sも本家根拠なし | フルまでの入力frame、tap/50%/99%消費、空インクcap、partial連続ZR、23F/18Fの開始条件を計測。`FreezeFrame`を射撃周期と同一視しない |
| チャージ保持 | 現行はfullのみ潜伏保存75F。潜伏中ZRを離しても勝手に撃たず、出てZR押下→離すと射撃する | 潜伏中だけ残り時間を減らすため、浮上後ZRを押さないと保存が長く続く。保持時の移動、浮上時charge表示、再潜伏、潜伏中消費/回復、保持期限の開始/停止は実機未比較。ブキごとのkeep可否は現在chargerのみ |
| Splatlingの第1/第248F/72F | 抽出はFirst48 / Second72 / ShootingFirst80 / Second160。現行は72Fを累積、境界48/72、piecewise stream、同式の逆算inkcapにする | 抽出typeに実行コードがなく、72F累積か48+72Fかを**確定できない**。48F/72F/120F保持後の2つのcharge輪とshot数を11.3.0で比較。partial burstの丸め/最小shotも未確認 |
| Splatlingのpartial / cancel ink | 現行はcharge時に支払わず、release時にburst比率で一括消費、stream中各弾無料。潜伏cancelはcharge中なら無料、streamなら残り前払額を返さない | `InkConsume=.225`だけでは精算時点を証明できない。24/48/60/72Fで潜伏、burst中0/1/10発後潜伏、0/半/満タン、main saver0/57APで前後タンクを測定 |
| Splatling発射速度/後隙 | SpawnSpeed1.05、SpawnSpeedFirstLastAndSecond2.1、RandomRate.12/Bias.2、PostDelay4F / PreDelaySquid4Fがある。現行は一律63unit/s、末尾cooldown.22s | charge段階と速度の対応/乱数分布をfield名だけで断定しない。24/48/72F chargeの各shot軌跡、初射出delay、stream終了→再chargeを測定 |
| Slosher windup / projectile | バケットRepeat29F / SwingLift12F / Ink.076 / Recover40Fは抽出。現行は8個の放物線blobへhead70/tail50を割り当てる。実際のraw70→50はUnitの落下距離による減衰端点でありhead/tailの区分を証明しない | 本家のUnitGroupParam/Unit配列のmove/collision/paintはupstream8blob modelとは異なる。shared groupDamageを持つが先行p.volのfirst-hit抑止もあり、最大hit集約を証明したとは言えない。blob列数/遅延/重力/同target複数groupを11.3.0の弾軌跡・ダメージ表示で測る |
| Blaster windup / recovery / burst | human windup10F、squid15F、Repeat50F、Recover57F、直撃125、爆風70→50、radius1.025→3.385は抽出。現在windupはhuman10Fのみ。移動/変身のsquid windup条件は未接続 | 浮上初弾、人状態初弾、射撃継続/離す/再押し、壁直撃での爆風縮小を比較。ShotCollisionHitRadiusRate.4234、gravity.016/straight9Fは現行直進blastへ未反映 |
| Dualies | interval5F/lock4F、roll12F、lock32F、roll ink.07、lock spread0は抽出。実コードで静止turret保持/移動解除の既存回帰がある | rollDist2.8、初速、左右muzzle、2hand発射と拡散bias、本家の後隙32F内キャンセル条件は未比較。レーン外の移動/roll本体は変更しない |
| 全弾の制動/減衰/拡散 | Shooter/Dualies/Spinnerのdamage age endpointsは接続済み。抽出のGoStraightStateEndMaxSpeed、Init/EndRadiusForPlayer/Field、jump bias25→70F、paint幅/長さ、splash生成数が存在 | upstreamの一定drag.8、固定size.15、capsule閾値、random cone、circle paint/linear trailsには省略brake-state defaultとgeometry差が残る。初速だけで射程一致としない。平地、静止、0AP、camera angle固定で1/4/8/19/40Fの軌跡・当たり距離・床塗り輪郭を測り、最初の不一致を特定 |
| weight / charge movement | `params.json`にはNormal/Light/Heavyのrun/swim曲線、Spinner shot overrideがある。現在全ブキはNormalを使い、Charger charge/roller rollにrun gearを掛けない | **2026-10-10 追記：weight割当は解決。** 固定11.3.0のweapon tableは`MainWeaponSetting.WeaponSpeedType`を既定値以外の時だけ持つ（ShooterShort/ShooterBlaze/ManeuverShort=`Fast`、RollerHeavy/SpinnerHyper/ChargerLong=`Slow`）。現行7種の固定ファイル（台帳のSHA-256と一致）は同フィールドを持たず=Normal。[Inkipedia Weight](https://splatoonwiki.org/wiki/Weight)も7種をNormal、Fast/Slowを走+8.3%/泳+5%・走−8.3%/泳−10%とし、`MoveVel_*_Fast/Slow`の比と一致する。以下は未解決のまま：各ブキの0/10/57APでwalk/swim/shot/charge全段階を測定。chargerのcharge量lerpとSpinnerの.75run→chargeSpeed lerpも未証明 |
| gear曲線/57AP | slots=main10×3+sub3×9=57。配列順High/Mid/Lowと3.3AP−.027AP²、非線形middle interpolationは抽出者の計算コードに一致。既存run/swim/main saver/sub saver/recovery/resistance/special charge/saver/QR/QSJ/sub power/actionは作用経路がある | 各weaponのmain saver override、bomb sub saver Lv0〜4割当は既定が省略。現在選べる能力が本家ギア全機能を網羅したという意味ではない。in-game description全件を同時取得し未対応を下記に列挙 |
| Quick Respawn条件 | `data/language/JPja.json#/CommonMsg~1Gear~1GearPowerExp/RespawnTime_Save` の連続死亡かつ無splat条件を現行は保持。assistをkill扱いしない実コード回帰を追加 | camera Chase270→90FとAround90→30Fの両曲線があるが現在Chaseだけ短縮。全復帰時間、camera切替、試合境界reset、敵Flowに倒された時の復活効果は未測定。復活レーンと共有済み |
| Sub Power / Sub Resistance | Splat Bomb Z速度Low1.12/Mid1.4/High1.68はgear×baseの一回換算で到達する。公式はsub resistanceが爆風等を軽減と説明。DamageRt_BombH=[1,.75,.5], BombL=[1,.75,.6]もrawにある | BombH/Lは**ブキfamily名か威力band名か**をrawだけで確定できない。現在Sub Resistanceは未提供。Band180に減衰を掛ける推測実装はしない。Splat Bomb0/3/10/57AP、near180/outer30とそれぞれの受ダメを実機で測る。未対応sub用マーキング/毒等は現公開版にない |
| Splat Bomb導火線/着地/遮蔽/威力/塗り/消費 | in-game説明は着地後の爆発。60Ffuse、gravity.016、bands180/30 at3.6/7、Recover60Fを接続。遮蔽/味方除外/威力band/着地起動の回帰を追加 | 現行arming normal.y>.6、generic throw aimPitch+.28、upward+1.5、carry.4、bounce/friction、paint radius2.7/5satelliteは未校正。raw SpawnSpeedY.24、move carryX1.6/Y4、splashAround15等とは違うモデル。InkCost70は原WeaponParam省略で未知。平地/壁/斜面/金網/空中投げ、footprintと投擲後タンクを測る |
| Flow points / assist / extend / buffs | 公式は発動/延長塗り、4種gear相当、約30秒、敵Flowを倒すと入りやすいことを説明。発動triggerと塗り時点だけ修正。damage creditが味方のkill時assistを出す | threshold3、weights、score忘却時間、assistWindow5s、extension5s/cap30、run/swim1.2/enemy1.5、footprint.6はすべて暫定。action bonus未接続、装備APとの合成未実装、death即解除も未確認。Flow相手killbonusがない。0/1/2/3連killを時間別・turf/assist量別・Flow敵別に測り、27/57APのgear値と比較 |
| Slam / Triple Splashdown | [公式2023冬](https://www.nintendo.com/jp/topics/article/fa3d0720-7dae-476d-badd-24a738ef8dac)のウルトラチャクチは本人＋2つのインクの拳。公開版Tidal Slamは本人のみ単一shockwaveで、2拳がない | 元のTidal Slamを本家のウルトラチャクチと同一視しない。`WeaponSpSuperLanding`は本家hero側の別対応候補で、Versusの`SpPogo`と同じではない。升降/無敵/威力/範囲は移植せず元の値を維持。将来対応先を指定してから3体の寿命/被弾/爆発を測る |

未対応の本家ギアは Special Power Up、Opening Gambit、Last-Ditch Effort、Tenacity、Comeback、Ninja Squid、Haunt、Thermal Ink、Respawn Punisher、Ability Doubler、Stealth Jump、Object Shredder、Drop Roller。gearの名前だけを追加して効果実装済みとはしない。Sub Resistanceも前記の理由で保留している。こうした能力の導入は現行7ブキの未確認数値を埋めることとは別に、発動条件/slot制約/作用対象を伴う仕様が必要である。

ロジック試験で可能な証明は「パッチがこの一次値/条件を実際に使用する」「境界と隔離を守る」まで。全ゲームの動作一致、未校正距離の一致、実ブラウザ/実機確認、統合headのCI、公開サイトのactive buildは親の統合証拠と区別する。
