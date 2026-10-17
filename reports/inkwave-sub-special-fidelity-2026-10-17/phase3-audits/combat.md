> 担当別の調査・再現・局所検証の記録。途中の失敗・後続修正も残している。最終配布物の成功件数・hash・確認範囲は[第3弾の統合記録](../../inkwave-sub-special-fidelity-phase3-2026-10-17.md)を参照。

# 第3監査・戦闘スペシャル（親集約用）

比較: Splatoon 3 PvP Ver.11.3.0、GP0を基本、各HP/攻撃テストでは明示したHPとSource Damage Groupを使用。INKWAVE branch `fix/sub-special-deep-fidelity-20261017` / main base e6a2700。変更はpatchesのみ、Crabの性能分岐は変更していない。単独runtime/JSON transport検証であり、Nintendo実機フレーム比較ではない。

## 修正と根拠

- **current Triple Splashdown remote本体**: `patches/network-replication/adapter.mjs` と新規 `runtime/splashdown-network.mjs`。legacy `wp` はslamだけに残し、任意 `pg[nid]=[life,activation,phase(1rise/2drop),age,superJump]` を追加。所有者・受信済みsnapshot life・alive/special flag・装備を通したclockのみ採用。age上限2.5s、activation/life/phase不一致は補間しない。remote tokenにage/dropを復元するだけで座標・拳を作らない。50F以降/スーパージャンプの無敵を既存F.invulnへ送る。従来は拳だけcurrent replay、bodyはnet:trueのみでclockなし。ローカルage/phaseとの整合修正で新しい本家数値ではない。50F根拠は既存11.3原典 `WeaponSpPogo.Rise_NoDamageStartFrame`、https://support.nintendo.com/jp/switch/software_support/av5ja/1130.html と https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ウルトラチャクチ 。
- **固定爆風帯**: `all-specials.mjs damageBandRadius` の対人/対物双方を半径の段階値へ。Reef220/70、Stamp投擲220/60、Jetpack50/30、Tenta150/50/30。中間距離をlinear補間していた。Crabは元から単帯なので同値。Wiki個別基礎性能表と原典DistanceDamageを照合。https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/サメライド 、https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ウルトラハンコ 、https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ジェットパック 、https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/マルチミサイル。Reef実爆発で遠帯70、Wave対物補正×5で350を確認。
- **Kraken**: `all-specials activeStep` のkid移動とdash毎tick vel.y=0を排しnative squid surface/climb/integrate(true)を使用。金網で実際に落下し、空中dashは120を保持せず60回転へ。ジャンプ回転は離陸1tickだけでなく空中接触中、同じ攻撃は各victim一度まで。既存30件のnative wall/LOS/remote authority試験は_integrate fixture stubを除去して新native経路で継続。終了後のsquid移動も可能にした。https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/テイオウイカ 本文64/76/77/80/93/119。原典 https://raw.githubusercontent.com/Leanny/splat3/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpCastle.game__GameParameterTable.json BodyParam.DamageJumpValue600, CollisionJumpRadiusForPlayer2.65。移動cap5.5/21は既存較正維持、新しい本家確定速度ではない。
- **潜伏共通/Jetpack**: `moveActor` のuseSquidをnative surface/climb/squid integrationへ委譲。Wail/Zip/Chump/Stampにも適用し、ヒトへ戻る際はclimb解除。Crabは全呼出squid:falseのため不変。Jetpack非潜伏はclimbを解除してhoverへ戻る。Jetpack空中/壁発動時のrecall originは既存native `superJumpGround`（最後の支持座標）を使用。https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ジェットパック 本文62–63（ZL、潜伏、壁登り）、75（空中/壁発動で最後の地面へ戻る）。exact hover/return曲線は較正のまま。
- **Wail追尾/寿命**: 0.2秒較正+20個ring（120Hzで1/6秒）から0.5秒time-based履歴＋補間へ。https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/メガホンレーザー5.1ch 本文254/287。死亡時には既発射pairのみ `Projectiles._s3WailTails=[{actor,owner,state}]` へdetach、60Hzで各180F/5F=36tickを完遂し未発射pairは作らない。clear/owner変更/remote化で削除。本文149/292（死亡で後続だけ中止）。originはpair.origins固定、親presentation/VFXが同じlist/laser eventを表示。
- **Wail Super Jump/gauge**: 本文151–152が発動中jump可能・選択時に後続中止・着地時残gauge0と明記。Wail限定canSuperJumpの同期native predicateをunmask、native.superJump成功後にendSpecialし既発射をtailへ。native destination/water/match/lifeチェックは保持。invalid targetではstateを維持。Wail限定cost→0の継続消費を戻し、jump中も同じclockを進め着地で0、deathではclockを捨て通常Special Saverが残量を処理。Crab jump拒否は維持。
- **Wail target life**: pairにtargetLife/targetRetiredを保持し、死んだ後同Actorがrespawnしても古いpairが新spawnへ追尾しない。任天堂1.2 https://support.nintendo.com/jp/switch/software_support/av5ja/120.html は倒されたtargetで装置位置が移動する不具合を修正。本家の死亡後の照射方向やfadeの正確な法則まではこの文で確定できないため、その点は未確認として残す。
- **Stamp**: 既に空中でZRを押したときにも8F空中振りを選択。地上B+ZRだけだった。地上スタンプの次回発動はgroundedに限定。idle/初撃windup/解除/throw構えで永久正面盾を作らない。remote guardもaccepted swing/jumpSwing/swingEndに追従。https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ウルトラハンコ 本文119–126（攻撃中のみ盾）、137–139（空中ZR）。盾の振り上げ/下げごとのexact位相は未計測、既存hitbox較正のまま。
- **Booyah armor**: 残armorHP超過をそのまま本体に漏らしていた処理を単発100threshold/80capへ。Source Damage Groupの53+167など最大値差分も1回のthreshold/capにまとめる。投擲後65Ftailにも同じgroup ledgerを渡す。https://wikiwiki.jp/splatoon3mix/システム詳細仕様#he35f781 （一般armor100差引）、https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ナイスダマ 補足アーマー（80と記載）。system詳細個別表の上限には80?と不確かさがある点を維持し、break graceやSub Resistanceの未知値は追加しない。Crabは従来残HP超過方式のまま維持。

## 検証

コマンド: `node --max-old-space-size=2048 --experimental-vm-modules --test --test-concurrency=1 ...`。

- 新 `triple-splashdown-network.test.mjs` 3件: currentID actual JSON send/receive/native sample、30/60/120、legacywp、invalid sidecar/life/owner、phase時計の境界。
- 新 `combat-special-terrain.test.mjs`（最終15件）: Kraken late contact/grate、Jetpack actual native floor/wall、native airborne recall origin、Reef遠帯/対物、Stamp air input/idle盾/remote attack end、Booyahgroup/lowremainingarmor/80 cap。
- 新 `killer-wail-trace-lifecycle.test.mjs`（最終13件）: 30/60/120Hz trace、死亡後既発射36tick、clear/handoff、native jump/gauge/death/respawn target境界。
- 既存 `kraken-dash-occlusion.test.mjs`30件をnative squid integrationへ接続し保持。
- 直前組合せ53/53成功 `/workspace/scratch/combat-third-targeted-final.log`。remoteStamp追加後14/14成功。Jetpackoriginのdisplay fixture修正後＋Wail追加前22/22成功 `/workspace/scratch/combat-third-current.log`。Wailjump/target life＋terrain 27/27成功。hexorigins新規を加え最終13/13成功 `/workspace/scratch/wail-third-final.log`。 `/workspace/scratch/combat-third-final-lifecycle.log`。
- 共有編集中にwater hazard / Ranked shield adapter anchor mismatchでboot停止が2回あった。両方とも親/担当へ報告済み、個別assert失敗とは区別。
- syntax/diff-check成功。実ブラウザ/CI全suite/本家実機比較は親担当。

## 未確認・残る較正

Kraken専用roll/surge完全委譲、壁dash、knockback、塗れない床速度/attack末尾のexact位相。Jetpack hover servo/boost height/return charge-flight全曲線、Wailtarget死亡後照射fade、Stamp intracycle guard、Booyahbreak grace/Sub Resistance、Splashdownホスト離脱時の完全な継続引継ぎ。これらをpublic固定値で確認済みとは報告しない。Tenta既存track/flight曲線も較正と明示済みで新根拠なしの置換はしていない。

- **Wail six origins**: 新 `runtime/wail-speakers.mjs` の WAIL_SPEAKER_POSITIONS / wailSpeakerOrigin(THREE,actor,index) をruntime/presentation共用。raw MicroLaser LaunchParam center(0,1.7,-.6), radius1.3を使用し全6基を別座標へ、lock時yaw回転してworld固定。角度/ペア順序は公式六角形デモに合わせる較正。原典 https://raw.githubusercontent.com/Leanny/splat3/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpMicroLaser.game__GameParameterTable.json 。従来は3pairが全て同じ2座標に重なっていた。

## 最終freeze
自担当sourceは2026-10-17にfreeze。最終combat terrain15 + Wail13 + current Splashdown net3 +既存Kraken30 =61件（組合せ直前の53成功後、追加分を個別/2fileで成功確認）。Wail13最終約2.65秒、terrain+Wail旧版27約4.77秒。親の巨大suiteへ4 test filesを含める。

## 他担当flight独立レビュー
`special-device-flight.mjs` と all-specialsの4種投擲/地形接触/age-landedAt/replayをread-only確認。固定60Hz source飛翔、対人/壁/床のauthority区別、ghost paint/damage禁止、land時のphase補正を確認。Screen初回target未設定を疑ったがemitObjectのscreen専用normalターゲット分岐で初回から確定していたため指摘を撤回。テストは多くが制御terrain平面のstandalone _updateSpecial/Projectiles.updateであり、全実機曲線の確定には使えない。親実ブラウザ/production Actorでの操作連結と区別が必要。現時点の具体P1なし。

## Cooler / defense独立レビュー

- `support-cooler-collision.mjs`、kit-defense、kit-support、adapter InkFlight、Ranked比較をread-only確認。stand実体は既存support arrayのみ、clear後levelFor再構築で残留なし。両team native projectile sphere、pedestal gap、native actor横constraint、squid/dodge/glide例外は実field/既存sweepと接続。sweepFill.out.pointは表面点なのでactor補正+radiusは二重膨張ではない。
- **発見した具体差分**: all-subs custom投擲(type sub)までshared defenseに捕まりgeneric removeObjectで消える。native bomb反射試験だけでは未検証だった。担当audit_special_kitsがprojectileCandidateでtype subを除外し、custom ownerのworld接触へ統一。research_subsへFizzy/LineMarker/ghostなど専用回帰を依頼。QuickBombの個別反射法則は一般Wiki文より先に断定していない。
- native InkFlightはdefenseがterrain/Ranked barrierより近い時だけworld.kitDefenseへ。beginFidelityWallDrop冒頭でkitDefenseを除外し、手前actor/bossが選ばれた場合callbackを実行しない。敵味方のブロックとHP/turf非著作を確認。新しい追加P1は未発見。
- 残較正: model AABB、glass下端、stand上面support無し、爆風のpartial遮蔽無し、反射係数。Crab全姿passは既存Crab性能維持制約を含む。これらを本家完全再現としない。
- 根拠web確認: https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/エナジースタンド （スタンドの当たり判定: 両team shot遮蔽、イカ/スライド/Wail通過、ボム反射、Suction/Sprinkler非吸着、pedestal gap）。

## native gauge / 爆風別経路の追加監査

- 新 `runtime/active-special-gauge.mjs` はBooyah/Stamp/Jet/Kraken/Inkstrike/Zipと既存Wailの正準stateからnative `Actor.special` を継続同期する。time系は `1-state.t/state.duration`、Zipは `state.inkFuel/150`。HUD担当も同じpure fractionをreadする。current native specialCostの単位変更時もfractionを維持し、HUDからロジックへ値を書き戻さない。
- splat前に正準残量を置き、通常gear/native splatの既存死亡減少・Special Saverを適用する。死亡後は消費時計を破棄し保存残量を減らさない。通常の早期投擲/全弾使用/timeout/objective/reset/clearは0。CrabとReefの消費方式は変更せず、Vacはretained担当が所有。
- private recordは同一state/owner/max(netLife,net.lastLife)/match/local/aliveを検証する。runnerがspecialActiveを一時的にnullにしていても正準recordがcharge抑止を所有し、turf（scoreは維持）/両Tenacity/Ranked host+follower/Booyah cheeringのgainを拒否する。使用中に拒否したcheer identityを先に消費し、終了後duplicateで後払いしない。Wave/ScreenのstartHeldSpecialGauge開始callだけHUD担当の契約に従いmakeStateへ追加。
- 根拠: https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン の「スペシャルゲージの減少」L102–117（一定速度、通常早期終了0、死亡で自動消費停止後死亡減少、消費中はいかなる手段も充填禁止）。https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ナイスダマ#z003a700 は10秒消費・投擲で即0・死亡時の順序。原典公開parameterに存在しない曲線は追加していない。
- native弾の別経路でもfixed bandを統一。`adapter.mjs` native `_blastBurst` の対人 `distanceDamage`、`all-specials._blastBurst` specialObjectRadius、`kit-defense` explosion context（Bubbler遮蔽）を同じstepへ。通常blasterは既存補間、Crabは単帯で同値。実入力でJet/Tenta/Stamp/Crabの実native弾を生成し各境界直前/境界/直後および帯中間の実 `_blastBurst` を検証。Jet far30、Tenta150/50/30、Stamp220/60、Crab30。object multiplierは既存原典table経路を維持。ghostのactor/device非著作も確認。
- Wail teardown修正: 練習場resetPaintはProjectiles.clearだけでActor.resetしない。clear内でprivate所有者集合（rosterから除外済みも含む）の正当canonical actionを`endSpecial('reset')`として先に退役し、次Actor tickから旧pairをtailに戻さない。owner/life/match失効時にはendSpecialを通さずexact old token/stateだけquiet retireし、foreign token/form/gauge/end event/tailに触れない。既にdetach済みのtailにもmatch identityを付け、別matchへ持ち越さない。nativeSJ着地tickのpaintまでcharge抑止を保つ。

## Zipcaster reserve寿命の訂正

- 旧実装は`inkFuel<=0 || t>=9`で終了し、GP0でも10%残量、GP57なら28%残量で強制帰還していた。9秒はraw `SpecialTotalFrame540` をactive最大時間として読んだものだった。
- 原典1130 `WeaponSpSuperHook` `WeaponParam.InkCapacityRt1.5`、`InkConsume_PerSec.Low/Mid/High=.15/.1305/.12`、`InkConsume_Hook=.04/.025/.015`。raw `SpecialTotalFrame540` 自体は実在するが**実際の用途は未確認**であり、別の具体意味を付けていない。 https://raw.githubusercontent.com/Leanny/splat3/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpSuperHook.game__GameParameterTable.json
- Wiki現行Ver11.2表はGP0/10/30/57の自動消費10/9.05/8.33/8%/sec、GP0で10秒、GP10約11秒、GP30約12秒。capacity150/drain15=10秒、150/12=12.5秒と整合し、固定9秒をmaxとする解釈には矛盾する。 https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ショクワンダー#n398b9ff L440–458。独立に https://splatoonwiki.org/wiki/Zipcaster L52/L66/L82 がbase10秒・tankがduration・15→12で時間延長を確認。
- fixed cutoffを除去し実reserve0が終了を所有。ALL_SPECIALS.durationはAP0の10秒、state.durationは`150/inkDrainPerSecond`（無操作時のAP別目安）、activation eventもstate値を送る。HUD/VFXはfuelを使う。未知540の用途を確定扱いしない。
- 最後のhookはhookcost未満の正残量でも発動でき、fuelを0でclampする。hookFlight/player zipは0でも移動を完了し、arrival blastを1回起こしてからrecallする。到着blastを12F操作回復待ちから分離し、実到着時に発生させる。 https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ショクワンダー#q14bf52c L97–112（tank/gauge一致、低ink hook可、移動途中0でも到着まで継続）、同 #v802afab L165（到着時爆風）。既存hookWait12F/19units/s pull/1.35s snap等の較正は原典確定とせず維持。
- 既存all-specials Zip end fixtureとspecial-zipcaster-armor end fixtureのduration短縮による人工終了を、実ink0→到着→recallへ変更した。防御の生死/remote/owner/life負例は維持。

## 追加回帰の状況

- 新 `active-special-gauge.test.mjs` 最終12件: 30/60/120Hz×6種×通常/Saver、実main+hook debit、GP0/57の無操作10/12.5秒、最後の低inkhook0→flight/pull/arrival実damage→recall、turf/両Tenacity/Ranked両経路/cheer後払い、remote/owner/life/match、通常早期終了、objective/reset/clear、nativecost単位変更。
- 新 `combat-special-native-bands.test.mjs` 6件成功: 各実SPnative弾→actor/device blast境界4種、native Bubbler遮蔽のfar30、ghost非著作。 `/workspace/scratch/combat-special-native-bands-first.log`。
- `killer-wail-trace-lifecycle.test.mjs` 最終15件: nativejump中と着地paintの充填禁止、clearのみ→次nativeActor/Projectilesでlaser0、owner/life/snapshotlife/match失効→旧beam0/foreigntoken保持を追加。gauge9+nativebands6+Wail15の30件は `/workspace/scratch/combat-gauge-bands-ownership-final.log` で成功（Zip寿命3件追加前）。
- 全自担当78件の再試験では75成功、terrain3件だけが新しいclear契約に反するfixture（grate差替えのためworldclearしてから同actorの技継続）で失敗。terrain差替えをmatch/projectileclearから分離し、nativePhysicsを差し替えるだけに修正、同15件全成功 `/workspace/scratch/phase3-combat-terrain-post-clear.log`。実runtimeを緩めていない。
- Zip寿命追加のactivegauge12件＋既存armor12＋ink/screen5の**29/29成功**（36.9秒）を `/workspace/scratch/combat-zipcaster-lifetime-final.log` で確認。最終syntax/diff-check成功。全自担当はactive12 + nativebands6 + Wail15 + terrain15 + net3 + Kraken30 = **81件**で、最終変更に関係する分を上記run群で確認した（81一括runとは区別）。親がall-specials/全配布物を最終一括実行する。

## emitted最終回帰・旧Burst/Booyah fixture

- 親のfinal artifact回帰から`burst-contact-resistance.test.mjs`の旧Booyah body32期待を調査。release site `/workspace/scratch/subspecial-phase3-release-site`、contentHash `11e83aa370160918a6cfbf88e047afb344fa735236315c4c6a8ad7fc494ca0d2` で **actual21 / expected32** を再現、同条件Crab30は成功。 `/workspace/scratch/burst-booyah-armor-emitted-before.log`。
- 旧32はarmor10HPを超えた直撃25の残りも本体へ流す旧式（`(25-10/1.5)*.6 +35*.6 =32`）による。一般100 threshold規則では直撃25によるarmor破壊時の本体damageは0、次native phase raw35だけSub Resistance57APの.6を受けて21。テストのraw25→35そのものは変更しない。
- fixtureのみをphase別body `[0,21]`へ更新、Crabは従来 `[9,30]` / total30を保持。さらにpinned `Bomb_DirectHit→NiceBall` ×1.5よりarmor37.5ぴったりと37.5001の対照を追加。first25後のarmor0/0.0001を検査し、next35のbody21/0を確認する。armor残HPが正である限りbreaking35も全吸収する境界を直接検証する。**runtimeには変更を加えていない。**
- 根拠再読: https://wikiwiki.jp/splatoon3mix/システム詳細仕様#he35f781 L591–608（単発100超過から100を差し引く）、#wfeccc33 L651–658（Booyahのbreak grace/Sub Resistanceは未確定の記載を維持）。このfixtureは既に実装したthresholdと既存break時点の整合確認であり、未計測break graceを本家確定とするものではない。
- release artifactを使用した選択10件（AP0/57×30/60/120のnative raw25+35、Booyah21、Crab30、追加armor境界、actual NetMatch/duplicate）**10/10成功、24.65秒**。 `/workspace/scratch/burst-booyah-armor-emitted-fixed.log`。`node --check` と `git diff --check` 成功。編集freezeを親へ通知、commit/最終全回帰は親が所有。
- 65 catalog実ブラウザにも旧armorHP超過式が残っていたため、`scripts/check-inkwave-catalog-browser.mjs` のBooyah100raw/armor50時の本体HPを100へ訂正した。Object Shredder有無それぞれでraw25/100/120/180/220に対する本体damage0/0/20/80/80とraw armor debitを同じ実damage loopで検査する。Crab既存spill式は保持。runtime変更なし、syntax/diff-check成功。実browser再実行は親担当。release manifest11e83のfiles/artifactsに同scriptは無くbuild inputではないため、このoracle編集自体による再ビルドは不要。

## post-main CI ranked / armor fixture追補

対象branch `fix/sub-special-fidelity-ci-20261017`、base main `d197cc5`。CIログ `/workspace/scratch/phase3-pr-ranked-failed.log` のranked284件中3失敗を、source狭い回帰で同じく3件再現した（`ranked-special-oracles-before.log`）。runtime修正は不要だった。

- `ranked-integration.test.mjs`: 旧Stamp fixtureは発動だけでZR入力なし、idleで永久guardを期待していた。Wikiウルトラハンコの攻撃中防御と現runtimeのswing開始条件に従い、ZR→native swing eventを実際に待つactive caseと、idle時に実ホコ弾がguard無しで命中・爆発するcaseを対照化。swingの事前攻撃でshooterを傷つけないようshot準備中だけ射程外へ置き、発射時に元位置へ戻す。native kitDefenseCandidateの実選択kindも観測する。
- 同fileのNiceBall2件は実30F armor phaseでraw60 contactとraw180 blastを通す。100 thresholdによりbody0→80、HP20が正準で、旧HP100期待は完全免疫の旧式だった。単にHP期待を変更せず、実`Gachihoko_Bullet` / `Gachihoko_BombCore`のcause、raw60/180、各armor debit（Object Shredder有無で×1/1.1）、body0/80、攻撃後も正armor残量、cause scope復元を確認する。
- `sub-direct-resistance.test.mjs`: armor100へraw40でarmor60/body0を先に検査し、object debitにはvictim57AP Sub Resistanceが掛からないことを直接確認。その後armor10にraw40でBooyah body0、Crab従来body15、さらに空armorでraw40→body20を検査し通常の抵抗も保持する。
- `object-shredder-1130.test.mjs`: Booyah100raw/armor50でbody0へ訂正。120→20/220→80もgear有無で実damageに通し、armor300からの正しいobject row/debitとarmorが残っていても貫通することを検査する。Crabの従来overflow式は維持する。他のraw source row・JSON・shredder assertionsは削除していない。
- 根拠web再読: https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ウルトラハンコ 本文119–132（攻撃中の防御、振り上げ中は攻撃を受ける）、https://wikiwiki.jp/splatoon3mix/システム詳細仕様#he35f781 （単発100超過分）、同#wfeccc33（Booyah30F開始/個別未確認点）。今回もexact intracycle guardや未知break graceを本家確定扱いしていない。
- syntax/diff-check成功。狭いsource回帰は**12/12成功、13.8秒** `/workspace/scratch/ranked-armor-oracles-targeted.log`。対象3file全sourceは**84件中83pass/0fail/1skip、161.2秒** `/workspace/scratch/ranked-armor-oracles-source-full.log`。同3file全emittedも**84件中83pass/0fail/1skip、120.6秒** `/workspace/scratch/ranked-armor-oracles-emitted-full.log`（`INKWAVE_BUILT_SITE=/workspace/scratch/subspecial-phase3-main-site`、contentHash `11e83aa370160918a6cfbf88e047afb344fa735236315c4c6a8ad7fc494ca0d2`）。両方2GB/concurrency1で逐次実行。skipは既存の外部raw damage table receipt用環境変数未指定による任意検査で、今回の回帰をskipしていない。対象3fixtureをfreezeし親へcommit可能と通知、runtime/上流/commit操作はなし。
