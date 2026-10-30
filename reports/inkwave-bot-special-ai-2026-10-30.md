# INKWAVE 全19スペシャル AI 改善と本家比較

調査日: 2026-10-30 UTC。変更前の比較基準: `rhgrive3/actions` main `5d6480b`。

全19種のWiki参照、旧ロジック監査、3カテゴリの実装と独立レビューを実施した。最終コード `96c4ba9399283d4259dff5165696cac6f5c90a4f` で統合CPU 83件、追加回帰227件、Chromiumの配信コード4ケースが成功。以下の旧実装表は比較基準の記録であり、採用した変更は「実装と独立レビュー」に記す。PR [#1942](https://github.com/rhgrive3/actions/pull/1942) のCIはこの記録時点でqueuedであり、CI完了・main反映済みとは扱わない。

対象は `inkwave-public/` に build-time adapters と runtime を合成する公開版。未合成 `inkwave-public/src/config.js` の slam/storm だけを全種類と誤認しない。19種の ID/日本語名は `patches/splatoon3/runtime/catalogue.mjs:13` の `SPECIAL_NAMES` に存在する。`game/` 試作版は参照していない。

本家条件: 対人バトル、ギアによる性能強化を前提にしない定性的な操作・用途の比較。各 Wiki 個別頁を web tool で実際に open し、仕様・運用部を参照した。ページの基礎性能に記された版を以下に併記する。Wiki は基礎表/追記/補正で版が混在するため、表の版を全記事の統一版とは扱わない。実機計測、Switch 実動作の確認、変更後ゲームのブラウザ再現はこのメモの時点では未実施。以下の不具合はコード入力契約の静的確認であり、距離の数値は INKWAVE 内の既存定数を記す場合に限る。Wiki の試し撃ちラインを未確認の変換でゲーム距離に換算しない。

## 優先して直す入力契約

- `canonical-kits.mjs:13-30 driveCanonicalBotSpecial` は 15 種を扱い、発動は敵の生存/チーム/距離だけ、発動中は主に時刻 pulse。敵消失後にも同じ入力を送る。`weapon-catalog-adapter.mjs:103-106` は BotBrain の通常判断の後、aim spring の前にこれを挿入する。
- **テイオウ**: `canonical-kits.mjs:29` が fire を離さず jump=pulse。`all-specials.mjs:2305-2318 activeStep` は充電完了後の `edges.fireUp` でしか dash に入らない。したがって近接の必要もない時にジャンプし、突進を出さず低速 charge を継続する。敵不在なら攻撃入力を解除し、継続中 charge は誤射突進にならないよう state/charge 条件も見る。近接かつ到達可能なら回転、少し離れた同一床面の狙った敵には charge→release を明示する。攻撃用周期ジャンプを除去し、active special中のジャンプは専用の安全判断に従う。
- **トリプルトルネード/ホップソナー/スミナガシート**: `canonical-kits.mjs:30` は fire=pulse/sub=false。`all-specials.mjs:2220,2328,2333` は `edges.subUp` が必須なので構えるだけで投擲しない。
- **エナジースタンド**: 同じ else が sub=false。`kit-support.mjs:323-335` の subHeld→release が必須なので設置しない。
- **カニ**: `canonical-kits.mjs:24` の pulse カノンは `all-specials.mjs:2144-2150` の砲撃で shot cadence/spinup を繰り返しリセットする。毎回両射撃を混ぜず、連射を維持する機会と遮蔽際の爆風を選ぶ。全 special 共通の `intent.squid=false` (:21) は球体を使う防御/移動も封じる。
- **メイン依存**: `bots.js:137-189` の lead、射撃距離、charge/release は通常メインを基準とする。special では独自射程/弾速/入力契約を採用すべき。target は `_perceive` (:340-371) で LOS を失っても約2.5秒保持されるため、`target.alive` だけで「現在見えている」と判断しない。逆にミサイル/メガホン/ソナーまで一律 LOS 必須にすると本来の障害物越し用途を奪う。

## 種類ごとの用途と AI 評価

表の「維持」は記載した操作/実装の維持候補で、全戦術が最適という意味ではない。安全な限定改善は Actor が受理する intent を送ることで行い、ゲージ付与・位置瞬間移動・直撃必中・敵全情報による無条件自動照準は追加しない。

| 種類 / 基礎表の版 / 本家参照 | 本家の用途・距離・狙い・障害物・支援・隙/回避（要約） | 既存 AI / runtime と改善判断 |
| --- | --- | --- |
| ウルトラショット `trizooka` / 11.3.0 / [Wiki](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ウルトラショット) | 中長距離の相手や高台後衛を狙い、少ない弾を狙って当てる。泳ぎ移動可。螺旋弾は遮蔽際を通ることもあるが、壁全貫通ではない。発動・射撃の隙を考慮する。 | 発動 `kit-rescue-adapter.mjs:25` dist<24。canonical :17で対象外。`kit-trizooka.mjs:419-458 stepTrizooka` は fire hold による既定間隔の連射を許可する（維持候補）。通常AIのメイン射程外で発動だけして撃たない場合があるため、special 用の距離/照準条件でfireを判断する。native 発射・移動・ゲージ owner は維持。 |
| グレートバリア `bubbler` / 8.0.0 / [Wiki](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/グレートバリア) | 前線の味方と場所を守る設置型。敵本体の侵入や内部からの攻撃を防げない。展開前の隙があり、密着してからの緊急無敵扱いは不適切。弱点や天井/敵の接近に注意。 | `kit-rescue-adapter.mjs:25` dist<12だけで起動。味方/地点/床面/既存バリアを見ない。設置の native owner は既に自動で動くので、発動後に pulse を加える必要なし（維持候補）。起動だけを敵近接、味方近傍、地面、重複状態で改善する。 |
| ショクワンダー `zipcaster` / 11.2.0 / [Wiki](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ショクワンダー) | 壁/床を掴んで後衛や高台へ奇襲し、到着後メインで攻撃。触腕の移動・待ち時間と燃料を考慮。床到着は隙を晒しやすく、発動地点への帰還は着地狩りの危険。 | canonical :23 は fire=true/sub=pulse。`all-specials.mjs:2072-2094` は raycast 実表面の命中が必須で空間の敵を狙っても hook できない。無意味な hook 反復/燃料消費を避け、有効な地形を選び、到着/ready で射撃。帰還・hook 拒否・通常 main runner は維持。 |
| マルチミサイル `tentaMissiles` / 5.1.0 / [Wiki](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/マルチミサイル) | 安全な位置で複数の相手を照準内に入れて発射。ロックは距離/壁に遮られない。発射中に無防備になるため接敵間際に構えない。ロック中の泳ぎは可能。 | canonical :27 の .5秒後pulseはロック可能かを見ない。`all-specials.mjs:1156-1191 selectTargets/prepareMissiles` は実照準内に敵がいなければ発射しない。ロック成立と安全を見て fire edge、敵不在では安全移動を保つ。ネイティブ lock/実弾発射は維持。遠距離発動は通常 BotBrain の認知範囲に別途制限される。 |
| ジェットパック `inkjet` / 4.1.0 / [Wiki](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ジェットパック) | 長射程爆発弾を上空から狙う。足元/地形への爆風も有効。長射程の射線や接近に弱く、ジャンプ上昇/イカ下降で照準をずらせる。発動位置に戻るので帰還地点も重要。 | canonical :26 は無条件fire、:21で下降不可。`all-specials.mjs:1938-1960` は照準が向く所へ毎秒発射するため、メインの弾速/照準距離を流用せず専用条件にする。被弾時の boost/下降、狙えない時の移動を使う。自動帰還と弾の owner は維持。 |
| アメフラシ `storm` / 10.1.0 / [Wiki](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/アメフラシ) | 進行方向へ雲を流し、敵を退かせながら自分/味方が追撃。即死用ではない。傷ついた味方の回復支援もある。装置は最初に地形へ当たった所で展開するため投擲の遮蔽を考える。発動隙は比較的小さく、設置後は自由。 | `bots.js:208-209` dist<16、非交戦ではランダム発動(:243-245)。`storm-effects-adapter.mjs:19` は hold中に明示sub press→release を送るので**この入力方式は改善不要候補**。起動/投げ先は敵や前線/味方のいる有効床面へ改善余地。`storm-effects.mjs:59-75` の投擲受付を維持。 |
| ナイスダマ `booyahBomb` / 10.0.0 / [Wiki](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ナイスダマ) | その場に浮いて charge、ナイス連打/味方の応援で加速、満充電後に投げる。一定範囲を退かせ、味方の攻撃と合わせる。アーマーがあっても発動直後/集中砲火に注意。 | canonical :22 の booyah pulse と sub pulse は契約上有効。しかし固定2.2秒で ready/投げ先を見ない。`all-specials.mjs:1963-1988` の `state.charge>=1` / `edges.subUp` を参照し、readyになって有効な床面に狙いがある時に投げる。ナイスの rising edge、満充電未満の投擲拒否、armor owner は維持。 |
| ウルトラハンコ `ultraStamp` / 11.1.0 / [Wiki](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ウルトラハンコ) | 接近した相手への連続スタンプ、段差/近接のジャンプ振り、遠い相手への投げを使い分ける。完全無敵ではなく背後/上の相手や振り上げ中に弱い。投げは壁に当たると爆発する。 | canonical :25はfire保持のみ。敵不在でも鈍速スタンプを続け、遠方/高台へ投げない。`all-specials.mjs:1991-2027` には jumpSwing と sub release throw が実装済み。近接/高さ/遠距離/敵喪失で使い分ける。連続攻撃の長押しそのものは正しいので維持。 |
| メガホンレーザー5.1ch `killerWail` / 5.1.0 / [Wiki](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/メガホンレーザー5.1ch) | 地形越しの追尾で退避強要し、自分/味方の攻撃と同時使用。複数へ分けるか重要対象へ集中する判断。単独で回避専念相手を倒す効果は限定的。発動後は通常行動を続ける。 | canonical :30で main/subを上書きしない点は維持候補。ただし :21の一律squid=falseは不必要に機動力を落とす。`all-specials.mjs:2103-2119` は回復後 native main/subを呼び、:1035 lockWailPair は照準内1人を選ぶ。少なくとも valid targetに向き、通常行動/泳ぎを保持する。無制限自動索敵を追加しない。 |
| キューインキ `inkVac` / 11.3.0 / [Wiki](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/キューインキ) | 味方を吸引範囲に覆い敵の射撃を吸う。自分の側背面は弱く、密着近接の完全防御ではない。反撃モードへの移行と照準を用意する。吸引/反撃の隙がある。 | canonical :17で対象外。発動は kit-rescue :25 dist<15。`kit-ink-vac.mjs:972-988` の吸引は intent.fire&&!squid、通常AIがメイン射程や低インクでfireを止めると吸わない。:1003以降の反撃は新press/releaseが必要でholdし続けは不十分。支援方向へheld suction、exhaleの入力edgeを明示する。native吸引/移行/反撃 owner は維持。 |
| カニタンク `crabTank` / 11.2.0 / [Wiki](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/カニタンク) | 中長射程の連射と遮蔽際のカノン。連射は継続で速度が上がる。鈍足/旋回/側背面に注意し、球体で防御/移動。装甲発生前と終了後に隙。 | canonical :24 fire=true/sub=pulseで頻繁なカノン、:21で球体不可。`all-specials.mjs:2144-2167` のカノンは fireStart/nextShotをreset。単純pulseが連射を妨げる。敵を正面に保ち、見通しが通るなら連射維持、遮蔽/特定間合いでカノン、危険時squid球体。装甲/終了処理は維持。 |
| サメライド `reefslider` / 11.0.0 / [Wiki](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/サメライド) | 途中で向きを変えられず、突進経路/終点の敵と地形が重要。壁で止まり、穴/水へ落ちる危険。味方と交戦中など避けにくい相手へ使い、前後の隙に注意。 | canonical :28の時刻 .8秒pulseは敵距離・接触・経路を見ず早止め。`all-specials.mjs:2180-2214` は dashでfresh fireを受けbrakeへ移る。起動前に向き/床の連続/崖を検査し、近接爆発圏/終点までの距離に応じてpress。レール方向を途中で変える能力や無敵を追加しない。 |
| トリプルトルネード `tripleInkstrike` / 10.0.0 / [Wiki](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/トリプルトルネード) | 3個の投擲装置で高台後衛/防衛地点を退かす。ばらす/時間差で進路封鎖し味方と追撃。装置は障害物で着弾、上方への攻撃もある。構えている間はイカ不可、近距離の反応キル用ではない。 | canonical :30がsub=falseで**未投擲**。`all-specials.mjs:2218-2233` は3回のsubUp、marker cooldown/throw遅延を持つ。各投擲をstate.shots/phaseに同期し、同じ無人点への連投を避ける。native遅延/装置飛行/3発制限を維持。 |
| エナジースタンド `tacticooler` / 5.0.0 / [Wiki](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/エナジースタンド) | 攻撃でなく機動力/復帰力の支援。味方が前線を下げずにヒト状態で取れる位置へ置く。敵距離は主条件ではない。装置は盾にもなるが攻撃を受けない無敵ではない。設置後は通常行動。 | canonical :18は敵<=20のみ、:30はsub=falseで**未設置**。`kit-support.mjs:323-335` はhold/release必須。味方の近傍/進行位置と既存stand/drink状態を見て安全な近い床へthrow、本人も受け取れる位置を維持。支援効果/取得/ゲージを直接書き換えない。 |
| デコイチラシ `superChump` / 8.1.0 / [Wiki](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/デコイチラシ) | 味方の交戦点や後衛へ範囲を送り、注意を割かせ攻める。遅効性で単独即死用ではない。相手に破壊されるため圧力と併用。地上で設置し、塗れない床/場外に注意。 | canonical :30 fire pulseは `all-specials.mjs:2236-2240` のfire edge+grounded契約を満たすので入力方式は維持候補。`chumpLandingPlan` (:1390付近) が実照準から散布点を決めるため、単純距離で起動せず有効床/交戦範囲へ合わせて1回確認射出。 |
| テイオウイカ `krakenRoyale` / 8.1.0 / [Wiki](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/テイオウイカ) | 敵を退かせる/近接で回転、間合いがあればcharge突進。常時イカで移動塗り、敵不在の移動に攻撃ジャンプは不要。金網は抜け、塗れない床で低速。前後の隙とノックバックによる落下を考える。 | canonical :29はfire永続/周期jump。`all-specials.mjs:2242-2323` にcharge→release dashと地形追従がある。敵不在の攻撃jumpを止め、最短の近接spinか届く安全な同一床面へのdashを選ぶ。残り時間短い時は強引な追跡より安全床へ。移動/塗り/金網/armorを改変しない。 |
| スミナガシート `splattercolorScreen` / 11.2.0 / [Wiki](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/スミナガシート) | 味方の移動を隠す/敵を分断する視覚妨害。弾を防がず、展開後は地形を通って水平前進する。展開装置を水/奈落へ投げると不発。シートの高さ/方向と追撃を考える。 | canonical :30がsub=falseで**未展開**。`all-specials.mjs:2326-2329` はsubUpでdeploy。狙う方向に適切な着地点を作り、明示hold/release。投擲後の通常行動を保つ。シートを弾防御と誤認した突進をしない。 |
| ホップソナー `waveBreaker` / 10.0.0 / [Wiki](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ホップソナー) | 地面へ設置し3回の低い波でマーキング/削り/ジャンプ強要。壁/穴で波は止まらないが高低差上限があり、装置は敵の眼前ですぐ壊されやすい。味方の攻撃と波を合わせる。 | canonical :30がsub=falseで**未設置**。`all-specials.mjs:2331-2334` はsubUp、:1458 deployWaveが装置飛行を作る。狙える床と周辺敵の高さを見て安全寄りに設置。対波回避を追加する場合は現波のradius/位置/敵teamから接近時だけjumpし、周期ジャンプを流用しない。native波/高低差判定は維持。 |
| ウルトラチャクチ `tripleSplashdown` / 11.3.0 / [Wiki](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ウルトラチャクチ) | 本体と前方2拳の近距離範囲。拳を向ける方向を狙い、逃げる猶予/発動直後の被撃墜を考慮。高台発動で範囲は増えず、相打ち拳が残る。スパジャン時は拳なし。 | canonical :18はdist<=9だけ、:30は発動後に無意味なfire pulse。`catalogue.mjs:332-350` は起動時のactor.aimYawで拳配置を固定し、その後は自動落下。起動前に現在向きと対象/床/上下差を確認する。**発動後は専用攻撃入力の追加不要候補**。通常移動AIやpanic発動の距離だけに依存しない。 |

## 具体的な確認ケース

1. 全19種で同一kit/十分なゲージ/同じactor入力経路を使い、発動数だけでなく攻撃・投擲・設置オブジェクトを確認する。既存 `canonical-kits.test.mjs:50-59` は3秒step後「ゲージが有限」までしか検査せず、設置しない4種も成功扱いになり得る。
2. テイオウ: 視認可能な同一床の敵を置いて発動→敵を削除/死亡/遠方/遮蔽へ移動。攻撃jumpがなくなり、保持chargeを安全に解除すること。近接spinがある、離れた敵に35F以上充電してrelease/dashがある、戻り隙は既存owner通り。敵不在のナビ用jump/崖避けと攻撃jumpを区別する。
3. sub-release4種: 有効な床へhold→releaseし、それぞれ stand / wave / screen / marker×3 が生まれること。低ゲージ、remote、death、pause dt=0、match終了で出ないこと。
4. カニ: 遮蔽なし標的に連射速度上昇を妨げない、遮蔽際だけカノン、危険時球体。ジェッパ: target死亡後無意味な空射を継続しない、有効targetへ再照準、帰還処理維持。
5. ウルショ/キューインキ: メイン射程の短いkitでspecial射程内かつメイン射程外の敵。ウルショのhold/repeatによる実volley、キューインキ吸引と反撃入力を実owner経由で確認する。
6. ミサイル/メガホンは遮蔽越しでもロックが成立するケースを残す。近接specialは厚い壁/別の階/奈落越しで起動しない。投擲は近い壁に当たる/下に床がない場合を含める。
7. エナスタは敵がいなくても味方が取れる床があれば設置する。既存の有効味方standがすぐ近い場合や全員drink中の重複を避ける。敵不在でも塗り/支援目的で使える special を一律「敵必須」にしない。
8. 少なくとも30/60/120Hzで、edge動作・state遷移・回数/不成立条件の意味が保たれること。CPU測定とブラウザの実表示/実衝突を別記し、本家実機比較済みとは書かない。

## スコープ上残す項目

Wikiの定性的な戦術をそのまま「AI改善完了」とは認定できない。全ステージ経路探索、味方との連携、帰還地点の着地狩り予測、スペシャル相性全表、特殊オブジェクトへの自動攻撃まで一度に追加する必要はない。まず入力契約不一致、敵不在の攻撃、メイン依存の不適切な発射、明白な床/射線/味方支援を限定的に直す。Bubbler/Storm/Chump/Splashdown の既存入力・自動effectは上記の維持候補とし、調べた根拠なしに別ownerへ置き換えない。


## 実装と独立レビュー

2026-10-30の実装を下記の関数で照合した。関数の静的レビュー、CPUでの動作、配信コードのブラウザー実行はそれぞれ確認範囲を区別する。

| 所有関数 / 接続 | 採用した判断 | 維持した既存動作・限界 |
| --- | --- | --- |
| `createBotSpecialContext` / `resetBotSpecialMemory` (`runtime/bot-special-context.mjs`)、`driveCanonicalBotSpecial` (`runtime/canonical-kits.mjs`) | 生存・チーム・Bot自身の認知・現在のLOSを確認。武器/生存世代/active token交換で短期記憶を更新し、通常の照準springへ要求角を渡す。未充填時は通常main判断を保持。 | 非Bot・remote・不正dtを操作しない。敵消失後の現在座標を渡さない。壁越し攻撃の新規全知索敵は追加しない。 |
| `adaptWeaponCatalog` / `adaptKitRescue` / `adaptStormEffects` | 通常戦・Bossの最後のBotBrain tailで一つのpolicyに接続し、ランダム発動と競合する旧発動箇所を除去。後段のナビ用ジャンプがactive specialの攻撃jumpを上書きしないようにする。 | aim spring、通常移動、Actorの受理・消費・威力・発射/投擲・物理は既存の所有者を通す。 |
| `driveMeleeSpecial` (`runtime/bot-special-melee.mjs`) | テイオウの無人時攻撃停止、近接spin、見えていて安全な相手へのcharge/release。ハンコの近接/投擲、サメの固定経路と早止め、チャクチの発動前照準。 | 完了したテイオウchargeは敵喪失時にholdして盲目的な突進を防ぐ。サメの途中旋回やruntimeの受付前倒しはしない。自動落下のチャクチへ不要な攻撃pulseを加えない。 |
| `driveRangedSpecial` (`runtime/bot-special-ranged.mjs`) | ウルショ・ジェッパ・カニ・ショクワンダーを独自射程/操作で扱い、ナイスchargeと満充電投擲、キューインキの吸引/反撃、ミサイルの実lock preview、メガホンの通常main併用を使う。 | ウルショの既存hold repeat、カニの実spinup、hook実表面/移動待ち、既存armor・帰還処理は保持。ショクワンダーは安全に選べる床への移動が中心で、全ての壁奇襲は実装しない。 |
| `driveSupportSpecial` (`runtime/bot-special-support.mjs`) | 7種の用途に応じた床/目標/味方/重複検査。4種で欠けていたsub hold/releaseを作り、3投を状態に同期。エナスタは敵不在でも近い未強化の味方を使う。 | Stormの正しいpress/release方式を共有側へ移す。Bubbler/Chumpの既存設置方式を使う。投擲軌道の近似は命中保証や動的地形の連続安全証明ではない。 |

独立レビューでテイオウ経路検査の重複を発見した。初期案は12WU経路に対し3本の経路×27段×3列×9本のgroundProbe rayで最大2187本のsupport rayを呼び得た。修正では経路の左右幅を1回の呼び出しへまとめ、テイオウの各列を単一の下向きrayにした。同条件は81本となり、charge途中は局所だけ、全経路は開始/解放前に再確認する。これは呼び出し数の上限計算であり、実ゲームFPSや速度改善率の測定ではない。

独立レビューではミサイルの既存runtimeにも表示カメラ依存を確認した。`all-specials.mjs:selectTargets` がBotのlockまで人間の `G.camera` へ投影していたため、Bot正面18WUの同じ敵・同じBot照準でも、cameraなしで1件、逆向きのPerspectiveCameraでは0件になった。`dbd69f9` でBotだけ自身のaim coneを使うよう修正。逆向きcameraでもBotは1件、人間扱いでは従来通り0件を独立した実fixtureで再確認した。既に見た敵の短い位置記憶をメガホン/ミサイルが利用する場合も、隠れた相手の最新座標を新たに取得するものとは区別する。

各領域の詳細: [近接系の実Actor検証](inkwave-bot-special-melee-2026-10-30.md)、[射撃系の照準・入力検証](inkwave-bot-special-ranged-2026-10-30.md)、[支援系の設置・投擲検証](inkwave-bot-special-support-2026-10-30.md)。

## 変更後の検証

| 項目 | 状態 | 証跡 / 限界 |
| --- | --- | --- |
| 全19種の個別Wikiページ閲覧 | 完了 | 上記各行の直接リンク。仕様・操作・用途を参照、基礎表の版を明記。 |
| 旧AIと実Actor入力契約の静的照合 | 完了 | 上記基準コミット、関数/行を記録。4種のsub-release欠落、テイオウfire保持、メイン依存を確認。 |
| 実装/統合・独立レビュー | 完了 | 上記3カテゴリと共有contextを統合。経路probe重複、ミサイルcamera依存を修正し、既知review blockerを解消。コード基準は上記SHA。 |
| 最終統合CPU | 83/83成功 | fail 0 / cancelled 0 / skipped 0、67,722ms。共有context、実BotBrain入力経路、3カテゴリ、canonical kit、ranked統合を含む。 |
| 追加の既存runtime回帰 | 227/227成功 | fail 0 / cancelled 0 / skipped 0、116,997ms。下記8ファイル。83件とは重なる範囲があり合算しない。 |
| 本番相当ビルド・配信物検査 | 成功 | esbuild 0.28.2による最適化ビルド、composition preflight、source migration audit、startup budgetを統合担当が実行。ブラウザーcheckerでmanifestの全artifact hashも照合。 |
| Chromiumでの配信コード実行 | 4/4成功 | Storm / Booyah / Triple Inkstrikeのhold→release→effect、Krakenのcharge→release→dashと敵喪失後の無駄jump抑止。実BotBrain/Actor/Physics/NavGraph/Projectilesを使う制御された平面fixture。CPU paintで描画を省いており、実ステージ映像や全19種のブラウザー確認ではない。 |
| PR #1942 CI | queued | この記録では完了と認定しない。 |
| Switch本家の実機比較 | 未確認 | Wiki参照とソース/ブラウザー検証は本家実機測定ではない。 |

起動間合い、再判断時間、回避開始時刻、照準許容角、床検査の間隔などAI側の閾値はINKWAVE用heuristicであり、本家内部値・任天堂AI・本家の推奨距離と同定しない。既存special runtimeに根拠付きのframe値がある場合も、その値とAIの戦術パラメータは別に記録する。


検証コード: `patches/splatoon3/tests/bot-special-{core,integration,melee,ranged,support}.test.mjs`、`scripts/check-inkwave-bot-specials.mjs`。追加回帰は `all-specials`、`kit-trizooka`、`kit-ink-vac`、`support-kit-recon-cooler`、`special-crab-kraken-source-1130`、`special-reefslider-source-1130`、`special-zipcaster-input-1130`、`bot-special-ranged` の各 `.test.mjs`。実行コマンドは `node --experimental-vm-modules --test <対象ファイル...>`、配信コードは `node scripts/check-inkwave-bot-specials.mjs --site _site --evidence-dir .browser-evidence/bot-special-final`。

保持したログは `/workspace/scratch/bot-special-final-tests.log`、`/workspace/scratch/bot-special-regressions.log`、`/workspace/scratch/bot-special-final-budget.json`、`.browser-evidence/bot-special-final/browser.json`。最終配信物のrevisionは `1bb8e8b454bf8ca565985a165e195a8531fa14e496dec732bbcc519918b610eb`、contentHashは `4f7fca247e463c157882e2625e8e4cdaca66c038145e509c912da9f4aaf80db7`。これらはコードSHAと別の識別子。startup budgetは初期JS 1,832,414 bytes、146 requests / 145 preloadsで成功したが、実ブラウザーの起動時間・FPS測定ではない。

旧版の配信物へ同じ確認を行った反例では、トリプルトルネードの投擲が発生せず、テイオウのcharge解放/dashがなく敵不在jumpも残った。`.browser-evidence/bot-special-baseline/browser.json` に失敗を保持した。失敗した途中候補の記録を最終成功結果へ読み替えず、上記の最終revision/hashを採用する。

残る未確認は、実ステージの動的地形・複雑な遮蔽での戦術品質、全19種のレンダリング、対人勝率、Switch/iPad実機および本家実機との操作比較。新規に認知していない壁裏の敵を探す行為は追加せず、発動済み遠隔specialの短い既知位置記憶に限定した。全種類を監査したことと、全状況で最適な戦術を実装したことを区別する。
