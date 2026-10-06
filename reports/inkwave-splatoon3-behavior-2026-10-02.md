# INKWAVE とスプラトゥーン3の挙動比較

公開版 INKWAVE の操作とゲームロジックを調査した。イカロール、イカノボリ、チャージキープ、ローラーの縦振りなどに機能上の差分がある。歩行・泳ぎは加減速と旋回を測定したが、本家の実機データがない項目は一致・不一致を確定していない。

## 比較対象と証拠

- 調査日：2026年10月2日。
- INKWAVE：`inkwave-public/`、調査時 HEAD `8cb3787ff5ac041a02dcf5d6bbc6979f44af1a6d`。公開ワークフロー `.github/workflows/pages-inkwave.yml:48` がこのソースをビルドする。実際に配信中のサイトのバージョンは今回確認していない。
- 本家：スプラトゥーン3 Ver.11.3.0 を今回の参照版とする。[任天堂の更新内容](https://support.nintendo.com/jp/switch/software_support/av5ja/1130.html)で確認した。常に最新版と一致するとの主張ではない。
- `game/` は別の INKGORGE 試作版。その `KNOWN_DIFFERENCES.md` や移動速度表を、公開版の差分や本家の実測値として転用しない。
- ソースを変更せずに `Actor` と `WeaponRunner` を実行したロジック測定を [測定結果](inkwave-behavior-probe-2026-10-02.json) に記録した。描画、衝突、ネットワーク、アニメーション、本家の実機は測定していない。
- 再現スクリプトと公式ページの取得原本は `/mnt/workspace/.dev-state/agent-work/evidence/inkwave-behavior-20261002/` に保存した。対象 JS の SHA-256 も測定結果に含む。
- 移動と戦闘を別々に監査した結果を同ディレクトリの `movement.md` と `combat.md` に保存し、採用する指摘は親エージェントがコードで再確認した。監査結果の数値推測や未実証の再現例を、そのまま確定差分に採用していない。

## 根拠を確認できた機能差分

「確定」は公式資料とコードに基づく機能差分を意味する。ブラウザと Switch を同時に操作して比較済み、という意味ではない。優先度は移動・戦闘への影響をもとにした判断である。

| ID | 優先度 | 本家の挙動と根拠 | INKWAVE の実装と差分 | 再現操作と影響 |
|---|---|---|---|---|
| D01 | 高 | 泳ぎながら反転とジャンプを入力するとイカロールができ、発動直後のダメージを軽減する。[任天堂の操作説明](https://www.nintendo.com/jp/topics/article/af825de6-16d5-4653-ba00-a7e775cc54b9) | `src/game/actor.js:280` は通常ジャンプのみ。反転とジャンプを組み合わせた状態・軽減判定がない。`actor.js:159` の防御は復活・スーパージャンプの無敵とスペシャルの装甲。 | 自インク内で泳ぎ、逆方向とジャンプを同時入力。ロジック測定では通常の泳ぎジャンプになり、防御状態も付かなかった。ボムを避ける移動と防御が再現されない。マニューバーのスライドは別機能。 |
| D02 | 高 | イカノボリにはチャージがあり、アクション強化でその時間が変わる。[任天堂の説明](https://www.nintendo.com/jp/switch/av5ja/report/index.html) | `src/game/actor.js:611` はスティック入力による壁登り。壁上のジャンプ長押し・チャージ・解放の処理がなく、通常ジャンプは `!this.climbing` が条件。頂上の `_ledgePop` は自動の乗り越え。 | 自インクの壁でジャンプを長押しして離す。チャージ後の急上昇を選択できない。普通に壁を泳げることはイカノボリの再現を意味しない。 |
| D03 | 高 | 対応するチャージャーはフルチャージを保持して移動できる。[任天堂のブキ説明](https://www.nintendo.com/jp/character/splatoon/en/fashion/index.html) | `src/game/weapons.js:50` はチャージ中を busy とし、`src/game/actor.js:255` が潜るのを阻止する。射撃入力を離すと `weapons.js:162` で発射し、チャージを消す。保存状態・保持タイマーがない。 | フルチャージ→射撃を押したまま潜る：ヒトのまま。射撃を離す：発射してチャージが0になり、次のフレームに潜る。チャージを保持した位置変更ができない。すべての本家チャージャーが保持対応という意味ではない。 |
| D04 | 高 | ローラーには横振りと、遠くに届く縦振りがある。[任天堂のブキ説明](https://www.nintendo.com/jp/character/splatoon/en/fashion/index.html) | `src/game/weapons.js:176` は振り方を区別しない。`weapons.js:926` は常に横方向の扇状に9個の弾を出す。`src/config.js:106` に縦振り用の射程・硬直・消費量もない。 | 地上の振りと、ジャンプしてからの振りを比べる。空中でも同じ扇状の弾を出す。狭く遠い塗り・高所への攻撃が選択できない。 |
| D05 | 中 | 通常のマニューバーではスライド後、移動しない間は強化された射撃を続けられる。[任天堂のブキ説明](https://www.nintendo.com/jp/character/splatoon/en/fashion/index.html) | `src/game/weapons.js:264` で lockT を0.5秒に設定し、射撃を続けても `weapons.js:267` で0へ減らす。射撃間隔の0.07秒と狭い拡散は lockT > 0 の間だけ。その後は0.083秒に戻る。 | スライド後、移動入力を入れず射撃を続ける。測定では約0.5秒後に通常の射撃間隔へ戻った。硬直の終了と、その場で続ける射撃強化が同じタイマーにまとめられている。 |
| D06 | 高 | ギアパワーが移動速度、インク消費などを変える。[任天堂のギア説明](https://www.nintendo.com/jp/ichikara/av5ja/02.html) | `src/config.js:21` の固定値と `src/game/weapons.js:52` のブキ状態で速度を決める。`src/game/actor.js:51` の style は CharacterClass に渡す外見情報で、速度・消費量のギア補正はない。 | ギア構成で歩行・泳ぎ・消費量を変える比較ができない。本家の測定ではブキとギアを固定する必要がある。衣装の有無を比較した結果ではない。 |
| D07 | 高 | Ver.11.0.0以降のイカフローには、移動や敵インク耐性などの強化と足元の塗りがある。[任天堂の更新内容](https://support.nintendo.com/jp/switch/software_support/av5ja/1100.html) | `src/game/actor.js:186`、`:364`、`src/config.js:21` にフロー状態・発動判定・効果時間・移動補正がない。公開版のゲームロジック全体も関連処理を検索した。 | 相手を連続して倒す等の状況でもフローによる性能変化がない。発動条件の詳細な数値は未確認なので、独自の連続撃破数や時間を本家仕様として置かない。 |
| D08 | 中 | ナワバリバトルは3分間の地面の塗り面積で勝敗が決まる。[任天堂のルール説明](https://www.nintendo.com/jp/switch/av5ja/battle-nawabari/index.html) | `src/world/paint.js:277` は面ごとにセル数を丸めるが、`:690` はセルの実面積による重みを付けず個数を数える。GPU上だけの微小飛沫もある（`:481`）。`src/game/match.js:226` はこの値で判定する。 | 面積の異なるセルを同じ個数だけ塗ると同じ得点比になる。塗りの見た目・実面積と集計がずれる可能性がある。今回、実際のステージで勝者が変わる例は測定していない。 |
| D09 | 高 | 標準ナワバリバトルの制限時間は3分。[任天堂のルール説明](https://www.nintendo.com/jp/switch/av5ja/battle-nawabari/index.html) | `src/main.js:961` で経過時間を1/24秒以下に切り捨て、`:1026` と `src/game/match.js:169` はその時間で進む。描画が遅いと試合時間・移動・回復も遅くなる。固定60Hzの蓄積方式ではない。 | 毎秒20回のフレームを与えると、実時間1秒でシミュレーションは約0.833秒しか進まない。180秒は計算上216秒になる。これは時間更新の数式の検証であり、実端末を20fpsにして測定した結果ではない。 |

## 歩行と泳ぎの測定

以下は INKWAVE の `_horizontal` をそのまま実行した結果。平地で衝突なし、射撃なし、最大入力から2秒移動し、その後の停止・90度旋回・反転を別々に測定した。距離の単位は INKWAVE 内の m。本家の距離単位を同じ m に換算した結果ではない。

| 条件 | 最高速度 | 最高速度の90%まで | 入力解放から停止まで | 停止距離 | 90度旋回まで | 反転して元方向の速度が0を下回るまで |
|---|---|---|---|---|---|---|
| 歩行 30Hz | 6.0m/s | 0.100秒 | 0.133秒 | 0.213m | 0.133秒 | 0.100秒 |
| 歩行 60Hz | 6.0m/s | 0.100秒 | 0.133秒 | 0.266m | 0.117秒 | 0.083秒 |
| 歩行 120Hz | 6.0m/s | 0.100秒 | 0.125秒 | 0.294m | 0.108秒 | 0.100秒 |
| 自インク泳ぎ 30Hz | 11.8m/s | 0.200秒 | 0.333秒 | 1.487m | 0.167秒 | 0.167秒 |
| 自インク泳ぎ 60Hz | 11.8m/s | 0.183秒 | 0.317秒 | 1.591m | 0.150秒 | 0.183秒 |
| 自インク泳ぎ 120Hz | 11.8m/s | 0.183秒 | 0.325秒 | 1.645m | 0.150秒 | 0.167秒 |

同じコードでも時間刻みで停止距離や反転時間が変わる。歩行の停止距離は30Hz→120Hzで約38%違った。30fps描画時の実装はActorを2回更新するので、この30Hz単独行がそのまま30fps実動作を表すわけではない。60Hzと120Hzは通常の更新方式に対応する刻みだが、入力、接地、描画を含む結果は別途確認が必要。

歩行の仕様は `src/game/actor.js:364` と `src/config.js:54` にある。`config.js:52` のコメントに書かれた旧測定ツールは今回の公開ツリーに存在しないため、測定根拠として扱っていない。

- スティックの大きさに応じて目標速度が変わる。25%入力は測定で1.5m/sになった。
- 加速は速度帯に応じて変わり、停止時の減速も低速で弱くなる。
- 90度の入力変更では速度方向を徐々に回す。約126度以上の変更では別の反転用減速に切り替わる。
- 通常のシューターは歩行6.0m/s、射撃中4.6m/s。射撃をやめて0.2秒後も `firingT` により4.6m/sだった。最大0.35秒の射撃姿勢タイマーが移動速度にも使われる（`src/game/weapons.js:63`、`:126`）。
- 敵インク内の目標速度上限は1.9m/s、ジャンプ初速は通常の72%（`src/config.js:29`、`src/game/actor.js:285`）。

この加減速・旋回・減速の形が本家と異なる程度は、同じブキ・ギア・入力で実機計測して確定する。別試作版の4.8m/sという値から「公開版は25%速すぎる」とは判定しない。

## 実機比較が必要な項目

以下は INKWAVE 側の処理を確認した比較候補。本家の未取得数値や例外条件があるため、機能差分の確定件数に含めない。

| ID | 比較項目 | INKWAVE で確認した処理 | 同じ条件で確認する操作 |
|---|---|---|---|
| P01 | 歩行の加速・停止・旋回 | 上の測定値。歩行と射撃姿勢に独自の速度曲線がある。 | 微入力、最大入力、停止、左右90度、180度反転。距離は共通の身体寸法や試し撃ちラインで正規化する。 |
| P02 | 足運びと姿勢 | `src/game/character.js:1371` 以降に接地位置を固定する手続き的な足運び・IKがある。移動ロジックと足の見え方は別。 | 横歩き、後退、反転、停止の一歩、射撃姿勢、坂道を同じ画角で比較し、歩幅・足の滑り・上半身の追従を測る。 |
| P03 | 泳ぎの慣性・乾いた地面・敵インク | 自インク11.8m/s、乾いた地面のイカ2.9m/s、敵インク上限1.9m/s。接地面を1セルで判定する。 | 塗りの境界を横切る、細い塗りを通る、微入力で泳ぐ、敵インク上で潜る。 |
| P04 | ジャンプと落下 | 0.13秒の入力先行受付、0.12秒の崖落ち後受付、頂点の弱い重力、下降時の強い重力。11.5m/sを超える着地で、最大0.16秒・目標歩行速度最大28%の減速がある（`src/config.js:64`、`:69`、`src/game/actor.js:241`、`:393`、`:458`、`:586`）。 | 入力の長短、崖から出る直前・直後、段差、高所から着地した直後の歩行・射撃。 |
| P05 | 回復の待ち時間 | 自インクに潜ると、射撃後の時間によらず毎秒42%を補充する。空から満タンの理論時間は約2.381秒。ヒトは射撃後0.9秒待つ。乾いた地面などの潜伏できないイカ状態も毎秒4.5%を補充する。今回の単独測定でも lastFire=1/60秒で0.7%補充された（`src/game/actor.js:315`、`:317`）。 | ブキごとに1発・連射・ボム後に潜り、補充開始フレームと満タンまでを測る。自インク・未塗装・敵インクを分ける。 |
| P06 | 体力回復と敵インク | 回復開始1.3秒、通常22HP/s、潜伏60HP/s。敵インク20HP/s、接触中の蓄積上限40、残りHPは最低1を保つ（`src/config.js:42`、`src/game/actor.js:299`）。 | 被弾→潜伏・停止、敵インクへの再侵入、敵インクと射撃の組み合わせ。 |
| P07 | 射撃の散らばり・威力減衰 | シューターは連射で bloom が増加し、最初も拡散0ではない。通常のシューター弾は飛距離によらず damage=36のまま（`src/game/weapons.js:68`、`:770`、`:1179`）。 | 最初の弾、連射、ジャンプ直後、射程端・落下弾の命中とダメージ。既存試作版のブレ・減衰表を流用しない。 |
| P08 | チャージャーの貫通と照準 | `src/game/weapons.js:956` は手前の相手1人を選び、そこでビームを終える。 | 対応ブキを固定し、縦に並んだ2人にフルチャージと半チャージを撃つ。貫通の本家一次資料・実機確認を追加する。 |
| P09 | 照準補助とカメラ | タッチ・パッドは既定で照準補助が有効。減速と敵の角運動の42%を追従する処理がある（`src/game/player.js:47`、`:103`）。さらに`:200`以降では、照準が敵に重なると弾の目標を身体の中心軸に寄せる。この処理には補助設定や操作端末の条件がない。パッドには0.16秒後からの旋回加速もある（`:81`）。 | 補助オン・オフ、マウス・パッド・タッチ・ジャイロを分け、敵が横切る時の視点と実際の着弾を測る。本家に同じ補助がないとは今回断定しない。ジャイロ感度が「本家と同じ」というコメントも数値検証が必要。 |
| P10 | スーパージャンプと復活 | ジャンプ準備は約0.75秒で、飛行開始時に飛行時間+0.2秒の無敵を付ける。着地時は1.4m半径を塗る。復活タイマー5.5秒後、高さ4.5mから落ちる（`src/game/actor.js:712`、`:727`、`:754`、`:143`）。 | 準備・飛行・着地の被弾、着地塗り、移動可能になるまでの時間。ギア条件も固定する。 |
| P11 | サブとスペシャル | ボムは面の法線yが0.6を超える接触時に0.95秒の導火線を開始する。その条件を満たす接触がなければ開始しない（`src/game/weapons.js:1302`）。飛び上がって落下爆発するスペシャルには被ダメージを25%にする装甲があり、着地後にも0.3秒の無敵がある（`src/game/actor.js:162`、`:774`、`:819`）。 | 斜面・壁でのボム、発動前後の被弾、爆発の遮蔽・範囲・段差。見た目の似た本家スペシャルを、対応確認なしに同一仕様と扱わない。 |
| P12 | 金網と細い足場 | ヒトは金網に接地するが、イカ状態の接地・身体衝突では金網を除外する（`src/game/physics.js:207`、`src/game/actor.js:536`、`:548`、`:561`）。細い手すりにはヒト用の足位置補正もある。 | 金網上で変身する、ジャンプ中に変身する、手すりを歩く。各状態の通過・接地・塗りを実機と照合する。 |

## 継続比較の手順

1. 変更に関係する挙動を選び、本家の参照版・ブキ・ギア・入力・地形を固定する。
2. 公式説明と本家の実機映像・計測を記録する。値が未取得なら「要実測」のままにする。
3. INKWAVE で同じ操作を再現し、最初に挙動が分かれる時点を記録する。歩行では足の動きと実際の位置移動を両方見る。
4. コードの該当箇所、数値、影響、確認状態をこの差分表に追記する。ロジック測定とブラウザ実測を混同しない。
5. 修正した場合は同じ操作を再確認して差分の状態を更新する。本家の数値が不明なまま「一致」としない。

上記は実装前の公開版を対象にした調査記録。以下に、独立したパッチを適用した後の状態を追記する。


## 独立パッチ適用後の状態（2026-10-02）

本体 `inkwave-public/` は変更せず、`patches/splatoon3/` に接続・挙動・数値を分離した。ビルド時にだけ出力へ適用する。接続先の変更は互換性チェックで止め、候補の実コードで検証してからロックを更新する。詳しい手順は `patches/splatoon3/README.md`。

| ID | パッチでの変更 | 残る確認 |
| --- | --- | --- |
| D01 | 反転入力とジャンプによるイカロール、連続発動、被弾の吸収・超過分を処理する | 発動閾値、連続時の条件、装甲とモーションの実機一致 |
| D02 | 壁で溜め、解放してイカノボリを行う。壁を失うと溜めを取り消す | 溜め基点 45 F は抽出値。射出速度・防御・部分溜めと段差の実機一致 |
| D03 | フルチャージを潜伏中に 75 F 保持する。期限切れ・復帰時の入力・リセットを処理する | 他チャージャー、変身・射撃待ちと例外条件の実機一致 |
| D04 | 空中で開始したローラー振りを縦振りにする（着地後も保持）。ヨコ振り7F・タテ振り22Fの塗り進み移行時間を分離し、低空着地時のタテ振り早期塗り進み（7F相当）を解消する | ジャンプ受付の細かい境界、飛沫分布、威力曲線とアニメーション |
| D05 | スライド後の静止射撃の連射間隔・拡散を保持し、移動等で解除する | 個別マニューバーの受付、後隙・連続スライドの実機一致 |
| D06 | 3 部位・12 スロット、10/3 AP、ギア効果曲線、保存・選択を追加する | 全ギア種類、ブキごとの全適用規則・復活の全経路 |
| D07 | フローの発動、30 秒の有効期間、キル・アシストの延長、強化・塗りを実装する | 発動ポイント・延長秒数・強化倍率は暫定値。公式値として認定していない |
| D08 | 壁・隠れた面を除き、床セルの実面積で塗り割合を求める | 本家とのステージ面積・塗り形状の一致 |
| D09 | 描画と 60 Hz 更新を分離し、遅いフレームの経過時間を保持する | ネットワークと実端末での長時間試験 |

P05 は泳ぎ 180 F・ヒト 600 F の回復基点とブキ別の待ち時間を扱う構成へ変更した。既定値が抽出資料にない待ち時間は暫定値として残す。P07 は弾齢による威力減衰、P08 はフルチャージの敵貫通と壁での停止を追加した。P09 は敵への視点追従、弾の身体中心への補正、弾道の自動持ち上げを取り除いたが、操作感・ジャイロとの一致は未確認。

歩行の基本速度等も参照値で校正したため、実装前の P01–P12 の数値をパッチ後の測定値として扱わない。加減速・停止距離・足運び・着地といった本家の未取得値は、引き続き要実測とする。

数値は `reference/curated-numbers.json` の一次抽出値と `profile.json.bindings` の換算対応を照合する。各設定値の確認状態は `reference/numeric-status.json`、実機未確認事項は `profile.json.calibration.unverified` に保存した。回帰試験とブラウザの実動作確認は、本家の実機比較とは区別する。

移動・回復の追加監査は[条件別台帳と測定手順](inkwave-movement-resources-2026-10-02.md)に記録した。移動後の塗り境界・離陸・着地で接触条件を再計算し、敵インク猶予の区間積算、連続ロール係数の二重適用、壁衝突後の速度復活を修正した。スーパージャンプの独自着地後保護を外し、公式9.3.0の修正に合わせて復活保護も着地前に終了する。HP回復の既定値、装甲の耐久と貫通、空中制御、復活・地形・カメラ・ジャイロ・通信の未確認項目は、実機の確認なしに解消済みにしていない。

## 歩行・ローラーの洗練と未確認項目の再調査

歩行は実キャラクターの骨と表示を測り、過大な足の持ち上げ、上体の揺れ、低速入力、着地後の踵/つま先角度の跳び、急停止・方向転換での足戻しを `runtime/walk.mjs` で校正した。遊脚が骨盤を引き下げる処理も接地状態に合わせた。本体・モデル・速度を編集せず、表示だけに適用する。公式紹介映像は目視の比較資料で、歩幅や関節曲線をVer.11.3.0実機から測ったものではない。[歩行の参照と回帰](../patches/splatoon3/reference/walk-motion-2026-10-02.md)に確認範囲を記録した。

ローラーは公式縦振り映像と比べ、頭上への振りかぶり、縦の振り下ろし、着地後の回復を加えた。ゲーム側の横21F/縦26Fの射出時刻に、骨格・持ち手・ドラム回転を同期する。表示確認で見つかった縦回復中の床貫通も修正した。正確なジャンプ受付や原作の全関節曲線・硬直は未確認。[ローラー比較](../patches/splatoon3/roller-behavior.md)に詳細を残した。

さらにスプラトゥーン3 Ver.11.3.0実測値に基づくローラーの塗り進み移行時間（ヨコ振り7F vs タテ振り22F）を反映した（#517）。公開版の `WeaponRunner._roller` は共通の `cooldown <= 0.25` により、タテ振り後に接地してZRを維持した場合もヨコ振りと同様に発射後約7Fで塗り進み（接触判定・塗り・SE）に入っていた。修正後は確定した攻撃モード（`state.vertical`）に応じた明示的な発射後経過時間（ヨコ7F／タテ22F）を満たすまで塗り進み移行を抑止し、タテ振り発射後の22F遅延中における早期接触ダメージ・塗り線発生を防止した。姿勢更新（`wRoll`）も同一の確定ローリング状態に同期して滑らかに移行する。


自律担当が未確認項目を再調査し、ソースと実行結果で確定した不具合を修正した。移動・回復では塗り境界と離着陸後の判定、ロールの速度係数の重複・衝突後の速度復元、敵インク猶予の部分tick、スーパージャンプの追加着地保護を直した。[移動・回復の全比較と実機測定手順](inkwave-movement-resources-2026-10-02.md)に残る23条件を記録した。

ブキ・ギアではスピナー射撃中速度の専用曲線とブラスターの地上拡散/アクション強化を接続し、ボム60F境界の浮動小数点残差を補正した。Flowは公式説明に合わせ、塗り/アシストで蓄積して相手を倒した時に発動を判定し、発動/延長時にだけ足元を塗る。[ブキ・ギア・Flowの調査](../patches/splatoon3/reference/weapons-gear-flow-audit-2026-10-02.md)に、既定値・保存チャージ・重量区分・弾道・未対応ギア・Flow数値の不足を保存した。

独立担当の調査を含め、未取得値を「本家一致」と認定していない。Switch11.3.0の同条件入力・高フレームレート録画、全斜面と装備、ジャイロ・通信・iOSの確認は必要である。`scripts/check-inkwave-motion.mjs` は実Three.jsで描画する平面fixtureの回帰試験であり、通常ゲームの起動・入力・配信ファイル確認は別の `check-inkwave-browser.mjs` が担う。CIは同一コミットの同じ生成アーティファクトを両方で検証する。

## タッチボタン配置編集（2026-10-02）

スマホ／タブレットの画面ボタン配置と個別サイズの編集をビルドに組み込んだ。再配置した浮動／固定スティックの入力経路、編集時のゲーム入力抑止、保存・キャンセル・回転の比較範囲は [タッチ配置編集の記録](inkwave-touch-layout-2026-10-02.md) を参照。P01/P04/P09 の本家実機との未確認事項は維持する。


## 入力配送・対戦処理の寿命（2026-10-02）

[入力と対戦進行の追加監査](inkwave-reliability-2026-10-02.md)では、更新間隔の間に完了したタッチ入力、右側で開始した視点ドラッグ、射撃しながらの照準操作、部屋・試合変更後の古い処理の干渉を修正した。入力リセットで残るジャンプ先も取り消す。これらは INKWAVE の実コードを対象にした修正であり、Switch Ver.11.3.0 の同条件実機・ブキ・ギア・感度との一致は未確認。P01/P04/P09、ジャイロ、通信、実 iPad について既存の未確認項目を維持する。

再開後はジャイロの遅延許可が最新設定を上書きする競合と、高リフレッシュレートのメニューパッド押下再利用、オンラインのポーズ中に自分の入力が続く不具合を修正した。パッチ473件と Chromium/WebKit の生成物24項目で確認した。センサー計算と感度値は維持し、本家の同条件実機一致・物理iPad・実リレーの未確認項目は解消済みとしない。

## 全モーションの追加と統合再確認（2026-10-03）

更新される OSS 本体を編集せず、表示ロジックを独立パッチとして実装し、全 14 種類を本番インストーラーに接続した。各比較記録は公式任天堂の映像・公開説明、保持した原資料のハッシュと映像の時刻、実エンジンの検証、未取得の本家数値を区別する。

| 動作 | 独立パッチと比較記録 |
|---|---|
| 通常ジャンプ | [ジャンプ](../patches/splatoon3/reference/jump-motion-comparison-2026-10-03.md) |
| 着地・吸収・復帰 | [着地](../patches/splatoon3/reference/landing-motion-comparison-2026-10-03.md) |
| 泳ぎ・旋回・停止 | [泳ぎ](../patches/splatoon3/reference/swim-motion-comparison-2026-10-03.md) |
| 壁上り・イカノボリ準備 | [壁](../patches/splatoon3/reference/wall-motion-comparison-2026-10-03.md) |
| ヒト／イカの変身 | [変身](../patches/splatoon3/reference/form-motion-comparison-2026-10-03.md) |
| マニューバーのロール・固定姿勢 | [マニューバー](../patches/splatoon3/reference/dualies-motion-comparison-2026-10-03.md) |
| ローラーの追加細部 | [ローラー細部](../patches/splatoon3/reference/roller-detail-motion-comparison-2026-10-03.md) |
| スーパージャンプ | [スーパージャンプ](../patches/splatoon3/reference/superjump-motion-comparison-2026-10-03.md) |
| イカロール | [イカロール](../patches/splatoon3/reference/squidroll-motion-comparison-2026-10-03.md) |
| 被弾・復活の表示 | [被弾・復活](../patches/splatoon3/reference/hit-spawn-motion-comparison-2026-10-03.md) |
| 待機 | [待機](../patches/splatoon3/reference/idle-motion-comparison-2026-10-03.md) |
| エモート・表示の復帰 | [エモート](../patches/splatoon3/reference/emotes-motion-comparison-2026-10-03.md) |
| 既存スペシャルの表示 | [スペシャル](../patches/splatoon3/reference/special-motion-comparison-2026-10-03.md) |
| 表情・視線 | [表情](../patches/splatoon3/reference/face-motion-comparison-2026-10-03.md) |

歩行は、接地脚に遊脚用の短い到達制限を適用して足首を浮かせていた処理を修正した。実際の靴の踵／つま先支点、native 脚 IK、低速・走行・後退・横歩きを検証する。シューターの支持手は公式映像の両手持ちに合わせ、native の持ち手定義と IK を使用する[独立 carry パッチ](../patches/splatoon3/reference/carry-motion-comparison-2026-10-03.md)で補正し、サブや投げ動作は手を離せる。

統合再確認では、短い非表示後のジャンプ・着地の再演、スーパージャンプの中断トークン再取得、Storm をボム回復として上書きする競合、低い天井で一刻みに終わる Slam の native 衝撃、実際のブキ持ち手到達、初回復活時の所有者未取得、別 realm の状態参照、エモート／ロールの優先順位を修正した。Slam 表示が終わっても旧タイマーで歩行を止める箇所も、独立モーションの所有状態に接続した。無効化・不完全な通信状態・プレビューでは native 判定を保つ。

Flow の外殻・粒・リボンが GTAO の法線／深度パスに不透明な遮蔽物として描かれる問題は、独立 geometry view に修正し、実 WebGL／GTAOPass と GL バッファの割当・解放で検証する。共有 native geometry、頂点、index と native GPU バッファを保持する。

統合候補の全体確認は継続中。個別の CPU／GPU 回帰が通ったことを、全体の Actions 合格、本家ハードウェア比較、公開配信の完了と混同しない。未公開の関節曲線、映像撮影時の装備・入力・実行版、本家の全モーション数値は未取得であり、任意の校正値を公式値として記載しない。

実終了後の合成回帰も修正した。Slam完了から旧native表示タイマー期限までの間でも待機姿勢と新規ローラー横／縦振りが復帰する。walk-special-contact、idle、roller-detailのfocused検証23項目を通過した。これは統合中のCPU証拠で、最終候補のexact-SHA描画ゲートとは区別する。

共有移動フックの別realm二重登録と終了後の残留状態を修正した（review-shared source 33507ccc）。凍結SHAの実GTAO/WebGL10ケースではglint可視性・nonuniform transform・描画override・GPU解放を確認し、native99buffersを維持した。catalogの27ケースとwall10ケースは統合候補で再実行する。保存された旧catalogは失敗診断であり、合格証拠に数えない。

勝利variant2では実腕spanを超えた目標をnative IKへ渡していた。追加emotesモジュールで実肩とarm.a+arm.bの範囲内へ限定し、手を保持したまま終了・fadeへ接続する。variant1のtwirlは手首原点と握り軸が異なるため、catalogの握り測定をnative FIST_OFFSET/GRIP_HOLE_Lとauthoring inHand変換から計算する実握り軸へ修正した。元のbone-origin誤差は診断に残し、実武器socket変位の検出を回帰に含める。任天堂の未公開関節軌道を確認した変更ではない。

描画比較はnative shaderを保持した明示的なsingle-sample sRGB/RGBA8 framebufferへ固定した。実リセット後の肌・coatingの微小な色差がFlow外側の残留と混同されていたため、外側の比較ではnative頂点shaderと体のdepth遮蔽を残し、体のcolorWriteだけを一時的に無効化する。元の全画面差分も診断に保存する。既存のピクセル許容値、表示中エフェクトの検出数、即時resetと終了の0差分条件は維持する。focused GPUでは表示中4万以上の外側pixelsを検出し、reset110/111Fと終了200/239Fの外側RGB差分0を確認した。

終了時に残っていた1textureはnative THREEの共有DFG_LUTで、compiled dfgLUT uniformから所有元を確認した。隔離された描画fixtureの終了時に実GL handleの存在と解放を測り、geometry/textureの残留0を確認する。ゲーム本体や共有shaderの実装変更ではなく、検証fixtureの管理対象を明示する修正である。これらのfocused診断は最終候補の全ケースCIを代用しない。

停止姿勢の全画面beauty再描画では、実際の時計・骨・座標が同一でもnative fragmentの数pixelの色差が反復描画ごとに変化する。停止のモーション検証は、そのbeauty画像を両方保存したうえで、最終描画色だけを固定した別materialによる実GPU比較へ分けた。実際にコンパイルされたnative／比較側vertex shaderのSHA256一致、骨行列・pose・全node world行列・ゲーム時計の不変性、固定色画像の既存0差分条件を必須とする。各ケースで実rootを0.03動かす反例も描き、16pixel以上の変化を検出できない比較器は合格にしない。通常の全339描画ペア、Flow／壁のGTAO、表示中・中断・解放の検査はnative beauty shaderのままであり、この停止の比較を本家の画像一致の証拠にはしない。


## Action reliability workstream (2026-10-04)

入力位相によるDualies dodge消失を既存build-only reliability ownerで修正した。物理jump edgeのActorへの転送、gamepad action edge、sub優先、pointer-loss取消を実コードregressionで確認した。速度・距離・duration設定・poseは変更していない。roll終了比較の浮動小数点誤差による1tick残留だけを補正した。本家11.3.0実機の受付タイミング一致は未確認。分母・before/after・ownership・browser/CIの確認範囲は [action-reliability-report.md](action-reliability-report.md) を参照。

## Network replication の修復（2026-10-04）

ローラー横／縦振りの owner physics を packet 化する順序を修正し、remote の trajectory と projectile に紐付く curtain の時間軸を一致させた。基準射程・威力・spread・local physics・animation pose の変更はない。全武器の native replay、二人の WebSocket arena、遅延／重複／退出回帰の詳細は [Network replication report](network-replication-report.md) に記録する。これは INKWAVE 内の同期比較であり、本家の実機比較、原作の射程校正、physical iOS 検証の未確認項目を解消したという意味ではない。

## 練習場（2026-10-03）

ブランチ `inkwave/practice-range` に、既存システムを測るためのソロ練習場を独立パッチ `patches/practice-range/` として追加した（[練習場レポート](practice-range-report.md)）。歩行・泳ぎ・射撃・塗り・ボム・スペシャル・被弾の数値とロジックは変更していない。練習場の目盛りはワールド座標（1 m = 1 ワールド単位）で、本家の距離単位との対応は引き続き未確認（`distanceScale` は推定）。この記録の既存の差分・未確認項目は、練習場の追加によって解消済みとしない。

挙動に関わる変更は1点だけ：上流 `hud.js` の `isJa` の import 漏れにより、ローカルプレイヤーが相手を倒すたびに `splatted` イベント内で ReferenceError が起き、後続のリスナーと `Actor.splat` の呼び出し元の処理が中断していた（全モード）。import を補ってこの中断を解消した。本家との比較項目ではなく、INKWAVE 自身の不具合修正である。

練習場のロジック測定で、スプラッシュボムを水平に投げると約 48.8 m 先で爆発することを記録した（`profile.json` の初速 67.2・重力 57.6、ロジック単独、描画・実機なし）。シューター射程 12.9 m の約 3.8 倍。本家の投擲距離との比較は単位対応が未確立のため未確認とし、値は変更していない。

## Batch C の着地と通信状態の確認（2026-10-04）

比較条件は公開INKWAVE、既存Splatoon 3 Ver.11.3.0参照、通常装備・通常着地。
[#90](https://github.com/rhgrive3/actions/issues/90)は着地の全体scaleが剛体ブキまで変形させる問題を扱う。
着地専用のscale impulseを除き、膝・骨盤・腕・頭・ブキanchorの既存応答と時刻を保持する。
ゲームの移動、接触、ジャンプ、攻撃時刻や塗り量の変更ではない。
30/60/120Hzの実Character検査と生成module/ブラウザの検査は、Switch実機の関節曲線・画像一致と区別する。
本家の同入力・同装備の実機比較は引き続き未確認。

[#394](https://github.com/rhgrive3/actions/issues/394)と
[#379](https://github.com/rhgrive3/actions/issues/379)はINKWAVE内部のauthoritative owner整合性の問題。
前lifeのhitによる復活後damageと、remote killによる塗り/SP加点欠落を検証する。
Nintendoの非公開protocolや通信時刻を推定して本家一致とはしない。
実装範囲、既存PR重複監査と確定した検証結果は
[batch C記録](inkwave-batch-c-issues.md)に記録する。

## 2026-10-04 B: モバイル入力の欠落 (#389 / #288)

開始mainは `17602ab094da6efb663d872934458e818ae3c93e`。公開対象は `inkwave-public/` とそのビルド時overlayであり、旧Game試作版は対象外。既存の本家比較基準 `11.3.0`、ブキ・ギア・移動・射撃・ジャイロ感度の数値は変更しない。本家の実機計測を追加した変更ではない。ここではブラウザのイベント所有権による入力欠落を扱い、実機比較とブラウザ検証を区別する。

- #389: キーボード／パッドから戻る最初のtouchは、非表示だったoverlayの兄弟canvasがイベント対象になる。window captureでoverlayを表示しても元の経路は変わらず、FIRE/JUMP/移動/照準が欠落する。canvasへ届いた元のtouchを、操作可能なときだけ既存MobileInputルーターへ渡す。以後の移動・解除も既存ルーターで扱い、capture移譲失敗時は所有中のcanvas pointerのみ補完する。UI・map・editor・非表示・破棄後は対象外。
- #288: 同じ向きのviewport resizeでも全pointerを解除し、保持中の指が再取得できなくなる。resize時のlayout更新と実際の回転時のneutralizeを分け、保持入力を継続させる。rAFの重複・破棄後の残留・キーボードによる縦横比変化・固定stickの座標変化も回帰対象とする。

基準ビルドではChromium native-CDP touchとWebKit DOM PointerEventで最初のFIRE欠落を再現した。最終統合候補の合格証拠はbatch PRと正確なcommitのActions artifactに記録する。Linux WebKit／DOMイベント検証を物理iPadの証拠とは扱わない。PWA配信、実機のブラウザバー操作、熱・電力測定はこの変更で検証済みとはしない。


## チャージ保持の ZR 解放（#390、2026-10-04）

潜伏中のチャージ保持は「ZR を押したまま」という保持条件に紐づいており、ZL を離す前に ZR を離すとチャージは解除される。Issue #390 で、この解放時キャンセルを `patches/splatoon3/runtime/weapons.mjs` の `WeaponRunner.prototype._charger` に実装した。

| 項目 | 内容 |
|---|---|
| 本家の根拠 | [S3 チャージ保持の操作ガイド](https://sigablog.com/entry/2022/11/22/163000)（2022-11-22）。本文に「ZL ボタンから指を離す前に ZR ボタンを離してしまうとチャージが解除されてしまいます」と明記。公式の数値資料ではなく一般公開の攻略ガイド記載であり |
| INKWAVE の実装箇所 | `runtime/weapons.mjs:66-99`。保持の成立・継続には正準の `a.intent.fire` を読む。`actor.js:321-328` が潜伏中と emergeDelay 中に `inp.fire` を false に伏せるため、`inp.fire` では「ZR を押したまま」と「ZR を離した」を区別できない |
| 再現操作 | フルチャージ→ZR を押したまま自インクへ潜伏（保持成立）→潜伏のまま ZR を解放→その 1 tick で保持が解除される。浮上後の emergeDelay 中の解放も同様に解除される |
| プレイへの影響 | ZR を離した後もフルチャージを保留し、後から 1 度の押下で復元して射撃できていた。保持が解除されると該当の store は無くなり、後続の ZR 押下は通常のチャージ開始になる |
| 確認状態 | **ロジック確認済み**（source-fixture、実 Actor.tick、1/60 tick 基準、30/60/120 Hz）。**本家実機（Switch Ver.11.3.0）でのフレーム単位の実測比較は未確認**。保持時間 75F と 25F/31F の各タイマーは従来どおり独立した条項として扱い、変更していない |

別PR #63 が扱う保持寿命・浮上タイミングの変更は、この解放キャンセルとは独立している。本コミットでは `_charger` の保持**寿命**ロジックには手を触れていない。既存の合成回帰 `integration.test.mjs` / `movement-resources.test.mjs`、および表示回帰 `weapon-motion.test.mjs` / `weapon-detail-motion.test.mjs` は、修正前の「ZR を離したままでも store が生き残る」入力組み立てを前提にしていたため、正しい保持入力（ZR を押したまま）へ更新した。表示・姿勢の検証内容は変えていない。


2026-10-04のgameplay batch Aは、チャージ開始時の速度上限、床／壁共有イカロール連続判定、潜伏中ZR解除によるチャージキープ取消を修正する。根拠・再現操作・影響・未確認事項は[比較記録](inkwave-batch-a-gameplay-2026-10-04.md)に記載した。約90Fはコミュニティ検証の校正値であり、実機の正確な境界やWU換算の確認済み判定へ昇格させない。固定tickのCPU回帰とCIブラウザ検証を、Switch/iOS実機比較の代用にしない。


C batch 02 (#433/#419/#415): 未使用Online資源とMinimap OFFの描画バッファを必要時まで遅延し、敵インク接触時の回復待機は0へリセットする。既存の全体回復時間・武器調整・authoritative paintは変更しない。詳細は [batch 02 report](inkwave-batch-c-02-resources.md)。資源差分はINKWAVEのコード・native経路検証に基づくもので、Switch実機の数値校正済みとはしない。

## 2026-10-04: inactive music and world/resource lifecycle

Four current-public defects #366/#370 (one duplicate pair), #375, #384, #395 are addressed by the local-quality idle adapter. Music=0 parks only music scheduling; LOW/touch cloud color payload is 2.5 MiB; leaving marina disposes its far cubemap; offline pause presents one invalidation-driven frozen backdrop. These are browser resource policies, not Nintendo memory measurements. Gameplay timing, attacks, scoring and match durations are unchanged. See [implementation, sources, regression evidence and remaining physical-device limits](idle-resource-batch-2026-10-04.md). New full-app WebGL/Web Audio acceptance runs in Actions; do not infer success from CPU mocks.

## 2026-10-04 weapon edge-case supplement

See [weapon edge-case comparison](inkwave-weapon-edgecases-2026-10-04.md) for #354/#356/#357/#361: stable-human Dualies3F first emission; Splatling separate ground1.6° pitch envelope; terrain Blaster35HP cap; horizontal Roller12+1 gameplay units. The report separates actual source/minified/composed-code tests from S3 probability/position/falloff and released-tap calibration still pending. No native source or deployed main is changed by the draft.

## マニューバーのスライド前隙（#477、2026-10-04、2026-10-05 補正完了）

スプラトゥーン3（Ver. 11.3.0）のマニューバー（スプラマニューバー等）では、移動入力とB（ジャンプ）ボタンによるスライド（dodge roll）入力の認識後、直ちに移動を開始するのではなく、約4Fの前隙（pre-roll startup / 予備動作時間）が存在し、その後に12Fのロール移動が行われる。
INKWAVE の公開版実装では、`tryDodge` が成功した直後の tick 1 から `dodgeVel` が水平速度を占有し、12Fの移動を開始していたため、4Fの前隙が存在しなかった。
Issue #477 では、ビルド時アダプター `patches/splatoon3/issue-477-adapter.mjs` を通じて、入力認識直後の 4F startup 期間と、その後の 12F roll 移動のシーケンスを実装し、以下の受け入れギャップを補正した。

1. **リモートレプリケーションのサイドカー同期化と再生クロック進行（Gap A）**: オーナーパケット間（20Hz / 50ms 間隔）およびバッファ枯渇時の外挿（dry buffer extrapolation）において、`peer.playback tr`（既存ネイティブオーナー時計）から受け入れパケット時刻（`origT`）を差し引いた phase age（0.18秒外挿上限）により startup 残余時間および roll 移動時計を純粋関数として導出。オーナーパケット間の Hermite 中間サンプリング（4F startup の確実な消化）および外挿時の自律的 roll 移行を実現し、同一 `tr` での重複進行を防止。Hermite サンプリングでは先代スナップショットの離散ロール状態を保持し未来トークンの早期露出を防止。
2. **所有者・ライフエポック限定のトークン承認とクリーンアップ（Gap B）**: `lastRollToken` をグローバルアクター共有から「現在の所有者 + 承認スナップショットライフ（`netLife`）」に厳格にスコープ化。ホスト移行・ハンドオフ、リスポーン（新ライフ）、および `_adopt` / `reset()` でロール承認状態を整合的にリセットし、新所有者／新ライフでの token 1 を正当に受け入れ、旧所有者／旧ライフの遅延パケットは既存ネットワーク承認で確実に破棄。非負有界な有限スカラー値のみを検証し、不正・レガシーデータは `lastRollToken` を汚染せず安全にフォールバック。
3. **ブロードキャスト境界での非破壊サイドカー合成（Gap C）**: `_sendTick()` においてメッセージ再構築を行わず、固有の `this._send` / broadcast 境界で `msg.rl` を付加。PR495 #484（named `sc`）、reliability（named `l`）、予約スロット 21 / フラグ 20 との双方向合成（477→484、484→477 のいずれの順序でも互換）を確保。必要に応じてオーソリテーティブな `_dodgeDir` を安全に伝達し、リモートでの独立物理シミュレーションを排除。
4. **`_startSpecial` の Dualies 限定キャンセルと包括リセット廃止**: `_startSpecial` における `weaponRunner.reset()` によるシューターのクールダウンやスピナーのチャージ消去を廃止。スペシャル承認成功時のみ現在のアクティブな Dualies の dodge だけを解除し、他ブキ状態およびスペシャル発動失敗時の状態を完全に温存。不要なランタイム代替インストーラー API を全面削除しソースアダプター単一経路に統一。
5. **startup 予備動作での有界ネイティブ tuck ポーズ適用**: `_poseDodge` が roll 以外で即時復帰していた問題を修正し、startup 期間中に物理移動・tumble 回転・ゲームプレイ影響を伴わずに既存リグの校正済み tuck ポーズ（`turnStart * dodgeDur`）を適用。ベースライン idle・startup・moving roll の各状態でネイティブ姿勢チャンネル/ボーン（SPINE, CHEST 等）が明確に区別されることを検証。実機の正確な関節角度は `physicalNintendoanglesunmeasured`（未測定）として明記。

| 項目 | 内容 |
|---|---|
| 本家の根拠 | スプラトゥーン3 Ver. 11.3.0、スプラマニューバー（Splat Dualies）。コミュニティ検証シーケンス：入力認識 → 4F pre-roll startup → 12F roll 移動 → 32F ポストロール射撃固定（タレット状態）。公式資料上の明示フレーム値は非公開のため、4Fはフレーム単位検証に基づくコミュニティ確立値。 |
| INKWAVE の実装箇所 | `patches/splatoon3/issue-477-adapter.mjs`（`adaptIssue477Weapons`, `adaptIssue477Actor`, `adaptIssue477DualiesMotion`, `adaptIssue477Net`）。`weapons.js:tryDodge` で 4/60s の startup およびロールトークンを付与し歩行初速を停止。`weapons.js:dodgeVel` は startup 中に false を返し水平速度を占有しない。`weapons.js:_dualies` は startup をカウントダウンした後に 12F の移動時計を進める。`dualies-motion.mjs` は startup 中の phase を 'startup' とし、tumble=0 かつ移動なしで校正済み tuck ポーズを適用。`netmatch.js` は OPTIONAL NAMED サイドカー `rl` を介してオーソリテーティブなロールトークン・フェーズ・時間・方向を同期し、`peer.tr` に基づく再生時計進行と所有者/ライフ限定承認を適用。`actor.js:_startSpecial` はスペシャル承認成功時のみ現在 dodge を解除し、`actor.js:reset` および `netmatch.js:_adopt` でロール承認をリセット。 |
| 再現操作 | マニューバー装備・地上で射撃キーを押しながら任意の移動方向とジャンプキーを入力（スライド発動）。未適用版では tick 1 からロール移動速度が発生し移動変位が生じる。適用後は ticks 1..4 の間、水平変位が 0 に保たれ、tick 5 から 12F の移動変位が開始する。リモートクライアントでもパケット間 Hermite 中間、外挿進行、所有者ハンドオフ、新ライフ、遅延・連続ロール・通常進行が正確に同期される。 |
| プレイへの影響 | スライド入力から実際に移動が発生するまでの 4F のタメ（前隙）が再現され、即座に移動が始まることによる射撃回避タイミングのズレが解消される。ロールの総移動距離（w.rollDist = 2.8m）および 12F の移動時間は不変。他ブキのスペシャル発動でクールダウンやチャージが不当にリセットされる副作用を防止。ネットワーク再生中の startup 凍結・ハンドオフ時のトークン拒否・PR484 とのパッチ競合を解消。 |
| 確認状態 | **ロジック・テスト確認済み**（`patches/splatoon3/tests/issue-477.test.mjs` による 14 項目受け入れ検証：固定 60Hz 4F 変位ゼロ、tick 5 移動開始、12F 移動期間、総変位量、startup tuck ポーズと実ボーン値検証、タレット後の 4F 射撃ゲート（lockInterval）、2 連続ロールでの各 startup 保持、30/60/120Hz 描画境界一致、ネイティブ NetMatch トランスポート、Gap A（Hermite中間進行・外挿・同一TR冪等性・未来トークン隠蔽）、Gap B（所有者ハンドオフ・新ライフ承認・旧パケット破棄・`_adopt`/`reset`リセット・不正スカラーフォールバック）、Gap C（PR495 #484 との双方向合成テスト）、スペシャル発動時の他ブキ/失敗時状態保持のネガティブ検証、デス/スペシャル/変身/ブキ変更によるキャンセル、非マニューバー等無効入力拒否。回帰テスト `dualies-motion.test.mjs` 9/9、`combat-life.test.mjs` 10/10 全通過）。**Switch Ver. 11.3.0 実機における正確な関節姿勢（physicalNintendoanglesunmeasured）・ミリ秒単位の物理変位曲線は未確認**として残す。 |

## 連続キルのFlow加点が一律+1でS3の23→45fp連続ボーナスを再現しない不整合（#481、2026-10-05）

開始 main は `866fd45992be33c51966a8acc55596bb5bac15a8`。対象は `inkwave-public/` とそのパッチ層（`patches/splatoon3/`）であり、旧 Game 試作版は対象外。本家参照版は Splatoon 3 Ver. 11.3.0（2026-08-19）。

| 項目 | 内容 |
|---|---|
| 本家の根拠 | [任天堂サポート更新履歴（Ver. 11.3.0）](https://support.nintendo.com/jp/switch/software_support/av5ja/1130.html)、[イカフロー検証（wikiwiki）](https://wikiwiki.jp/splatoon3mix/%E6%A4%9C%E8%A8%BC/%E3%82%A4%E3%82%AB%E3%83%95%E3%83%AD%E3%83%BC)。S3の検証済み100 fpモデルにおいて、発動閾値は100 fpでありキルによってのみ発動する。75 fp未満では単発キルが +23 fp、直前のキルから5秒以内の連続キルが +45 fp（加点比率 45/23 ≒ 1.9565倍）。蓄積が75 fp以上の高スコア帯では単発 +15 fp、5秒以内の連続キルが +35 fp（加点比率 35/15 ≒ 2.3333倍）となる。5秒を超過したキルは単発加点（+23 fp / +15 fp）へ戻る。 |
| INKWAVE の実装箇所 | `patches/splatoon3/runtime/flow.mjs:13`、`:50`。キル時に常に固定で `award(attacker, 'splat', 1)`（正規化閾値 3.0 に対して一律 +1.0）が加算されており、攻撃者の直前キル時刻を追跡する状態が存在せず、単発と連続キルの加点比率が 1.0 のままだった。 |
| 再現操作 | 75 fp未満の初期状態で、2つの同一条件のActor A, Bを用意。Aには単発キルを付与し、Bには直前キルから5秒以内（例: 2〜3秒後）に2回目のキルを付与する。未修正版ではA・Bともに一律 +1.0（比率 1.0）しか加算されない。修正版（`patches/splatoon3/issue-481-adapter.mjs`）ではAに +23 fp（0.69）、Bに +45 fp（1.35）が加算され、45/23（約1.96倍）の比率が再現される。 |
| プレイへの影響 | マルチキルや連射ブキによる迅速な連続撃破を行った際のFlow発動インセンティブが大幅に低く見積もられ、発動タイミングが著しく遅延していた。修正により、連続撃破によって迅速にFlow Auraへ突入する本来のゲームリズムが復元される。 |
| 確認状態 | **ロジック・Node VM確認済み**（`patches/splatoon3/tests/issue-481.test.mjs`、30/60/120 Hz固定ステップ、75 fp未満 23/45 fp、75 fp以上 15/35 fp、5.0s以内と5.001s超過の境界、Actorローカル性、キル時のみの発動ゲート、Actorリセット/死亡/復活/Flow失効によるストリーク破棄、被弾後4秒以内の正当な環境死（水没・転落）キル認定維持・無帰属水没除外、遠隔被弾者ライフエポック認識によるdedup（NetMatch `_remoteRespawn` 2度撃破検証、同一ライフ重複除外・新ライフ受理）、PR #489 両方向合成および撃破ペナルティ・死亡後Flow維持・アイドル減衰との実動VM連携、14/14 pass）。**Switch実機での通信遅延下におけるキル確定パケット到着猶予の厳密な公式フレーム値は未確認**として残し、ゲーム内シミュレーション時計 `G.time` を基準とした 5.0 秒境界と Actor ローカルな状態遷移のみを整合。 |


## #483: owned native hair geometry lifecycle (2026-10-05 correction)

The native `_hair` and `_inv` Maps retained appearance/LOD/quality geometries for the module lifetime. Refcounts around the cached getter alone did not remove those CPU roots. The build-only character-geo transform exposes the same native hair builder without entering either Map; Character owns shared live entries through the refcount helper, releases quality epochs and teardown, and disposes each final geometry once. Legacy public cached getters remain intact for other callers; no global cache flush disposes live shared geometry. Real native tests verify zero owned entries and zero native cache insertions across teardown, repeated appearances, multiple casts and quality changes, game-tier anatomy without unused hero builds, and native rest/bone parity. The final production wire is the existing quality dispatcher after gameplay/touch/reliability.

## ブラスター初弾起動のフォーム差（#465、2026-10-05）

Splatoon 3 Ver.11.3.0 の標準ブラスターは初弾（ZR エッジ→弾/反動の放出）を姿勢で使い分ける。人型は **14F**、イカ（潜伏）から则是 **24F**、連射間隔は **50F**、発射後のスイム/サブ不可は **22F**（別 issue #214）。従来の INKWAVE は `profile.json` の `preDelay = 10/60s` を人型の完全な起動とみなして 10F で放出し、イカからは汎用の emergeDelay（約5F）＋10F で約 15F に留まり、14F/24F の対が再現できていなかった。

| 項目 | 内容 |
|---|---|
| 本家の根拠 | [Inkipedia — Blaster](https://splatoonwiki.org/wiki/Blaster)（現行 S3 データ）: humanoid→first shot 14f、swim→first shot 24f、sustained repeat 50f、firing→swim/sub 22f。Acceptance 基準は Ver.11.3.0。数値は issue #465 に記載の pinned 値を使用し、実機フレームの再計測は未実施 |
| INKWAVE の実装箇所 | `patches/splatoon3/runtime/issue-465-blaster-startup.mjs`（純関数 `blasterStartupWindup`、14F/24F 定数）＋ `patches/splatoon3/runtime/weapons.mjs` の `WeaponRunner.prototype._auto` ブラスター分支。人型は新規エッジ（`firePressed`）で 14F、native ZR edge時の形態を保持し、swim-originの場合だけ既存emerge経過を差し引いて24F、保持再開は従来どおり `preDelay`。放出時に `cooldown=0` へ正規化し、`fireInterval-preDelay`(40F)＋10F 巻き上げで 50F 間隔を回復。受理済みの起動は従来のbuffered tapを維持し、未受理の押下・空弾は放出しない |
| 再現操作 | 人型・弾充分・cooldown<=0 で新規 ZR→14 tick 目に `fireBlaster`/`trigger('shoot')`。イカで ZR→人型化後の初回解放は edge から 24 tick 目。保持で 50F 間隔。空弾/クールダウン中に押して離した未受理の入力は弾も反動も出ない |
| プレイへの影響 | 人型は約4F、イカのピーク出しは約9F 早く弾が出ていたのが S3 遊びに同期。起動タイマー（`s3BlasterWindup`）と発射後クールダウン（`cooldown`）は独立したまま、`PLAYER.emergeDelay` と 22F ポストショット（#214）には手を触れない。shooter/slosher/charger/roller の起動は `_auto` の `kind!=='blaster'` 分岐で不変 |
| 確認状態 | **ロジック確認済み**（source-fixture、実 Actor.tick、1/60 固定、30/60/120 Hz 同一 tick、owner の反動=1回）。**本家実機（Switch Ver.11.3.0）でのフレーム単位の実測比較は未確認**。14F/24F は pinned 引用値であり実機再計測では未確定。22F ポストショットは #214 の別条項として未変更 |
## 2026-10-04: first-allocation mobile resource budget

A cold-boot follow-up for #375/#395 uses the already-published G.mobile profile
until G.game exists. The established touch budget now applies on the first
cloud/Halyard cube allocation at default high settings, not only after later
runtime refresh. Existing formats, appearance policy and gameplay stay intact.
These are project resource dimensions, not Nintendo/Switch memory values.
See [the cold-boot budget report](inkwave-cold-boot-budgets-2026-10-04.md).

## 2026-10-05: stage-aware texture library generation (#542)

Cold boot generation for non-pack stages (Tidewater/Kelpline) allocates and compiles only the 25 shared surface layers, deferring stage-pack layers (e.g. 3 Cargo layers) until a stage with registered stage surfaces is selected.

| 項目 | 内容 |
|---|---|
| 本家の根拠 | スプラトゥーン3では現在選択されていないステージの専用マテリアル・テクスチャはメモリ上に事前確保・保持されない。ステージ遷移時にのみ必要なアセットが読み込まれ、前のステージ固有アセットは破棄される |
| INKWAVE の実装箇所 | `patches/local-quality/texlib.mjs` (`stagePackFor`, `syncWorldTexlib`, `updateLobbyTexlib`), `patches/local-quality/texlib-adapter.mjs` (`src/world/texlib.js`, `src/world/levelMaterial.js`, `src/game/lobbySet-mats.js`, `src/main.js`) |
| 再現操作 | 1. Tidewater でコールドブート起動（共有25層のみ生成、pack identity: null）。<br>2. 最初の `_buildWorld` で再生成せずコールドブート資源を再利用。<br>3. Kelpline への遷移で再生成ゼロで継続利用。<br>4. Cargo への遷移で28層（共有25+Cargo3）を生成し、旧ライブラリをコミット後に破棄。<br>5. Tidewater/Kelpline への復帰で共有25層へ遷移し、Cargoライブラリを破棄 |
| プレイへの影響 | コールドブート時のテクスチャ容量削減（256解像度で約3.3 MiB、512解像度で約13.1 MiB節約）。ステージ遷移時のメモリ単調増加を抑止。シェーダーの32スロット間接参照（`TL_SLOTS: 32`）およびマテリアル名を維持し、シェーダー再コンパイルやスロット不整合なし。LobbySetマテリアルの事前・事後コンパイルuniform更新により破棄済みテクスチャのサンプリングを防止 |
| メモリ占有ライフサイクル | 遷移完了後の定常状態は常にライブラリ1つ（residency = 1）。生成中のみ旧ライブラリと新ライブラリが一時的に並行存在（transient residency = 2）。旧レベル・マテリアル参照が破棄された直後に旧ライブラリをdispose |
| 確認状態 | **ロジック・ネイティブ結合確認済み** (`patches/local-quality/tests/texlib-stage-pack.test.mjs` 10テスト全通過、`scripts/check-inkwave-patches.mjs --quick` 合格)。**本家実機（Switch Ver.11.3.0）でのGPU実物理メモリ・フレームヒッチ実測は未確認**。記載のMiB値はThree.js DataArrayRenderTargetのフォーマット（RGBA8×3MRT+mips）に基づく計算アセット予算であり、ドライバ物理VRAM測定値ではない |


The stage-pack integration also tests the actual published module URLs and the default native factory, without an injected factory. Native composed `_buildWorld` commits Cargo28 layers then Kelpline25 layers and disposes prior libraries. A negative control restores the former misplaced runtime-relative import and proves it fails. Generator tests construct real Three targets and native shader callbacks with a headless renderer; these are not physical GPU memory or timing measurements.

## Gamepad lifecycle axes and disconnect camera filters — #681 / #676 (2026-10-05)

Baseline main: b4d5c31e33258a0b6f874e42234448e404eec2d4. Owner comments were posted after checking all comments, timelines and open PR scopes. #654/#655 are excluded because existing PR536 already normalizes trigger rebase; #701 owns the separate Map look-filter interval.

The existing accepted non-standard pad fallback can expose extra axes. The W3C Gamepad API distinguishes raw input layout from standard mapping (https://w3c.github.io/gamepad/#dom-gamepad-mapping and https://w3c.github.io/gamepad/#dom-gamepad-axes). INKWAVE currently consumes axes0/1 and2/3 for movement/look. Its lifecycle neutral gate now tests only those four consumed axes, retaining its existing .14 threshold and held-input suppression. A fifth axis resting at -1/+1 no longer permanently disables both sticks. No raw-controller mapping is invented.

When no pad is selected, the PlayerController now zeros only padLook x/y and edgeT before its enabled gate. A disconnect therefore cannot preserve filtered camera velocity and replay it on centered reconnect. Mouse look remains live; a new deliberate stick movement is admitted on the next update. The connected-pad response curve and #701 Map filter remain separate.

Verification:16 behavioral regressions fail on unchanged baseline and pass after the two bounded production changes. Source focused input/pause/boundary tests:47/47. Minified module VM plus exact PR701 map-look adapter:18/18, including both adapter orders and Map→disconnect→neutral reconnect→close. Native raw input/player/actor/weapons hashes were verified equal to the baseline despite shared read-only fixture storage. Authentic full build succeeded with content hash22e12a31f49b6b76b2f1a65ddaef030dfca47068b06134cf4b051afe63d3d5da;10 additional VM cases against its actual emitted Input/PlayerController/platform modules passed (extra axes, held axes0..3, disconnect at30/60/120/144Hz). Full aggregate and browser CI remain for batch acceptance. No physical Android/iPadOS controller, Switch timing/latency or full device parity is claimed; no S3 numerical parameter was added or retuned.

### UI Actor lifetime: #616 / #672 / #685

Page-lifetime HUD and Diorama state now releases its matching Match's Actor references at disposal; closed/stale map pins cannot call an old Actor. Minimap jump FX uses weakly correlated scalar tokens while preserving native landing fade. This is JavaScript lifecycle ownership, with no Nintendo numerical calibration or gameplay change. Source/minified/production-target regressions and explicit Node GC pass; physical heap/long-soak remains unverified. See [the focused report](inkwave-ui-actor-lifetime-2026-10-05.md).

## 2026-10-05 teammate map information: #718

HUD beacon/legend and full-scene Diorama previously exposed another teammate's exact respawn seconds. Both now show only dead (×), busy or available state; the HUD transport no longer reads the ally timer. Own countdown, Actor timing, enemy tracking and jump admission are unchanged. Source/minified/actual emitted8 each passed at30/60/120Hz, both teams and local/remote-flagged Actor inputs, including a timer getter that rejects any presentation read. Real-device pixels and online end-to-end behavior remain unverified. See [map teammate status report](inkwave-map-teammate-status-718.md).

## 2026-10-05 UI follow-up: #720 / #715

- #720: Judd bar now retains the same whole-stage denominator as its authoritative percentage labels;48.9/43.1 leaves8% neutral. Unclaimed track is not covered by the old decorative cap/clash art. Winner/score owners are unchanged. Existing reveal overshoot/racing animation remains; final settled values are the guarantee.
- #715: authoritative squid form hides only the aiming reticle while its weapon/charge state keeps updating; humanoid restores the current reticle. Ink/shield/sub-aim and hit-feedback children are unchanged.
- Source/minified/actual emitted8 each passed across30/60/120Hz and7weapons; negative controls reproduce both old outputs. This is code/DOM-state evidence, not physical Splatoon3 or screenshot equivalence. Details: [UI score/reticle report](inkwave-ui-score-reticle-2026-10-05.md).
## Gyro one-stream dropout ownership — #618 / #621 (2026-10-05)

See `reports/inkwave-gyro-dropout-618-621.md` for the baseline, numeric negative controls, timestamped quaternion boundary, exact observed scope and unobserved-path limitations. The existing native sensitivity, player-space projection and Android source choice are unchanged. This candidate removes recorded interval loss/duplication; it does not claim zero sensor-outage latency, arbitrary unseen trajectory reconstruction, or physical Switch/iOS/Android parity. Existing #524 and #697 owners remain explicitly accounted for.

## Pointer lock and hybrid touch takeover — #662 / duplicate #663 (2026-10-05)

Base main37ab02fcb7314eee8a6b3e6e8e6b0593610e7bff. Claims6004243856/6004246612 followed a fresh all-comment/timeline/Open-PR audit. The actual Input/MobileInput negative control starts locked kbm, adopts one FIRE touch, then loses that pointer/hold to a1px locked mousemove. No frame or Nintendo value was changed.

A build-only Input adapter reconciles pointer lock on touch takeover: pending mouse holds/deltas are cleared, logical locked-mouse admission ends immediately, and the browser lock is released. Asynchronous/queued mouse events cannot reclaim ownership while the touch is live. The touch-triggered unlock is distinguished from a genuine later mouse Escape; normal onUnlock now requires an observed logical locked→unlocked edge, so two queued acquire/exit notifications that both see the current null target cannot spuriously pause the match. This queued-notification case was independently reproduced before the correction.

After all fingers release, an explicit mouse pointerdown on the canvas can reclaim kbm and request lock during live play. It does not request lock in menus, paused/finish/attract state, or while an unlock notification remains outstanding. A gesture arriving before that acknowledgement can retry with the next explicit gesture; no delayed automatic lock request is invented. Late lock acquisition while touch owns input is released again. Native first-touch routing still receives the original event once; existing keyboard/gamepad/gyro owners remain separate.

Evidence:source focused66/66 (new13 plus existing input/pause/touch/first-touch),20 actual-method touch↔mouse cycles with stable listener count, FIRE/stick/look across synchronous/asynchronous/throwing exit, late acquisition, queued notifications, fresh mouse/Escape, and non-live lock rejection. Authentic full build and actual emitted13/13 are recorded in the completion handoff. VM browser-API timing surfaces are controlled fixtures; actual trusted Pointer Lock/browser hardware interaction remains for batch browser acceptance. Existing Main Map _relock can also request on the same mouse gesture; no functional failure was found and that independent owner is not rewritten here.

The W3C Pointer Lock API explicitly separates lock-target state from queued pointerlockchange notification (https://www.w3.org/TR/pointerlock-2/); Pointer Events define the distinct touch/pointer lifetime (https://www.w3.org/TR/pointerevents3/). The target is coherent control ownership during play, not a claim of measured Switch/iPad/Android latency or hardware equivalence.
## Touch-owned device gyro admission — #633 / duplicate #634 (2026-10-05)

Base main37ab02fcb7314eee8a6b3e6e8e6b0593610e7bff. Main claim633/comment6004554856 explicitly covers duplicate634. A second duplicate owner comment was not posted; the primary scope identifies both IDs.

Actual Input/PlayerController admitted mobile gyro yaw0.25/pitch0.1 after native keyboard or pad takeover, although touch no longer owned input. The chosen policy is the issue's touch-owned mobile gyro contribution: non-touch updates discard its queued delta, and only usingTouch consumes it into the camera. This is not a new gamepad-local motion sensor or hybrid-gyro mode. MobileInput.onDeviceChange discards and resyncs in the same input task, so a later fresh touch-owned sample survives its first controller update. Native resync alone does not universally clear accumulated yaw/pitch; both existing operations are used explicitly.

Saved gyro settings, _gyroWanted, permission and enabled/listening state are preserved. This is camera admission, not a claim of sensor power savings. Existing #276 composition must run before this new adapter; its phone-gyro pitch exclusivity is made touch-owned too, preventing hidden mobile gyro from disabling the currently active pad's vertical stick. Source mapping, screen frame, sensitivity and Nintendo numerical values are unchanged.

Evidence:source focused70/70 including new8; exact existing controls adapter before this owner passes the new8 in a private composition; authentic buildc2d924d70435 and actual emitted4 cases pass (keyboard/pad suppression and first fresh return, both pad axes,20 round trips). Independent review additionally connects fixed5604ddf's actual Gyro to actual Input/MobileInput/PlayerController:kbm/pad×four screen angles, pre-switch pending attitude queue, non-touch sensor updates, seed-only touch return and next full delta pass8 cases. These are VM boundary proofs, not physical sensors or a complete composed browser build.

When adopting older #325/#536 tests, assertions that intentionally combine a non-owning phone gyro with pad look must be updated to this explicit ownership policy; the new tests retain pad X/Y response and pure-touch gyro. Existing first-touch, keyboard contact and Map owners are not reimplemented. Browser/physical iPad/Android/console acceptance remains pending with the integration batch.
## 2026-10-05 — #721 selected-gamepad identity handoff

Base: main `37ab02fc`. Actual Input/PlayerController reproduction: two connected controllers, A selected and B already holding buttons 3/11; removing A with B still connected produced `padPressed=[3,11]` and `intent.special=true`. This bypassed the existing no-pad cleanup.

A new reliability adapter tracks selected index/id/mapping and the browser's disconnect notification. A direct identity change discards the former button/menu history, seeds currently held B buttons into a neutral-until-release mask, and gates consumed stick axes until centered. A gated stick cannot claim touch ownership; neutral followed by fresh stick input still can. Triggers use the existing value > 0.3 admission, including when the browser reports pressed=false. A controller epoch clears Player padLook/edgeT before its enabled early return. Same-device snapshot object replacement does not count as a new controller. An observed disconnect notification handles same-index/same-id replacement even without an intervening empty poll. The normal no-pad reconnect path preserves its existing first-edge semantics.

The browser's [Gamepad index](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad/index) is the identity coordinate; object reference equality is not used. If a platform supplies neither a changed index/id/mapping nor a disconnect notification for an identical replacement, that event is not observable and this patch does not invent a device boundary. This is input correctness, not a change to Splatoon 3 numerical tuning.

Validation: dedicated 12/12 plus existing pause 23/23, clock 9/9 and neighboring input/action/touch/quality 50/50. The fixed clock restores buffered pad edges only when the captured controller epoch still matches after polling; an old-clock negative control replays A's pending Special into B, while the new boundary preserves the ready gauge. Actual Actor with a ready special stays ready through the held takeover at 30/60/120 Hz and activates only after release and a fresh press. Raw/standard pads, jump/sub/special/trigger masks, menu ownership, disabled-controller filter retirement, extra axes, index reuse, normal reconnect and simultaneous lifecycle rebase are covered. The pause fixture now follows the actual dispatcher order, rather than moving pause behind every later adapter. No new full build, separate source PR or CI was launched; emitted integration and physical multi-controller browser tests remain pending. Existing #676 no-pad filter cleanup and #701 Map camera ownership are separate changes, to retain during integration.
## 2026-10-05 — #722 required gyro sensor policy

Base: main `37ab02fc`. On the actual permission module, a policy allowing gyroscope but denying accelerometer previously returned `supported=true`, `allowed=true`. A browser embed could accept GYRO even though its required relative orientation/motion delivery was prohibited.

The [W3C Device Orientation and Motion permissions section](https://www.w3.org/TR/orientation-event/#permissions), checked 2026-10-05, requires accelerometer and gyroscope for these relative streams. The capability owner now queries both independently and rejects either explicit false. A throwing/absent policy query remains unknown; it cannot hide a separate explicit denial. Magnetometer is not added as a requirement. Existing permission requests and runtime sensor probing remain the fallback when policy introspection is unavailable.

Verification: dedicated 4/4 and focused 32/32 source tests. The actual Gyro and MobileInput modules, with production quality/platform installers, reject activation with zero sensor listeners for each denied feature; the allowed control starts both listeners. Legacy featurePolicy, absent/throwing queries, and a throw on one feature paired with denial of the other are covered. Existing permission grant/deny/retry/cancellation checks pass. These are deterministic VM/DOM fixtures, not actual restricted-iframe or physical iOS/Android measurements. No new full build or separate CI run was launched; combined emitted/browser acceptance belongs to the integration batch.

This is web capability correctness, not a Splatoon 3 sensitivity or hardware timing claim. Android source selection, calibration, gyro intent ownership, and dropout mathematics are unchanged.

## 2026-10-05 — #746 optional gamepad API failure

This is a follow-on delta after #721 at `33aa331`, itself based on main `37ab02fc`. The actual Input → fixed simulation route previously threw SecurityError with zero match updates and G.time still zero. The [Gamepad specification](https://www.w3.org/TR/gamepad/#dom-navigator-getgamepads), read 2026-10-05, defines this error for denied gamepad policy; optional controller access must not prevent touch play.

Only the navigator.getGamepads capability read is caught. A failed read supplies the existing no-pad cleanup path and advances the existing #721 pad epoch, so a render-pending old controller edge and its Player filter cannot survive the failure. The polling API is tried again on subsequent frames, allowing recovery without a new permission request or environment setting change. Match/controller/render errors are not caught here. No automatic input-mode switch, gyro setting, sensitivity, or game tuning changes.

Dedicated source 6/6: 300 render frames at each 30/60/120Hz continue with keyboard movement; 300 touch frames retain native stick/button ownership, swipe and actual Gyro.consume delivery. A previously held pad loses all gameplay/menu edges and filtered look, and cannot consume a ready special through a buffered edge. Mouse, absent API, normal pad recovery and unrelated controller exception propagation are positive/negative controls. Combined input/pause/clock regressions are recorded with the completed patch. These are VM input/runtime tests, not a physical restricted iframe/WebView test or a Splatoon 3 hardware comparison. Combined emitted/browser acceptance remains with the integration batch; no separate PR/CI/build was started.


### Live Turf lead / Danger (#99, duplicate #748)

The quality adapter now supplies read-only physical-team lead/danger flags from total-stage coverage, preserves native Bravo HUD ordering and clears state below a 10-percentage-point gap or outside live Turf. Per-player status remains independent. Source/minified/emitted each pass 13 focused checks (including two verifier-negative checks); the prepared existing active-game probe covers both viewers, two viewport widths and controlled finish/Range suppression. Browser PNG/computed-style acceptance remains pending the consolidated CI. The 1.08 icon emphasis is a local layout value, not an exact Splatoon measurement. Full scope and reference caveats: `inkwave-live-turf-lead-99-748.md`.

## 2026-10-05 final-minute BGM timing: #742

Main now requests the existing zero-fade/no-bar-wait path only for the non-Boss one-minute event. Normal1.2-second transitions remain unchanged. Actual MusicEngine/Player tests at8bar phases show request+60ms incoming start, with existing30ms gain fade and50ms outgoing scheduling stop; native Match/FixedClock controls pass at30/60/90/120Hz. Source/minified/actual emitted9 each pass. This is scheduling-state evidence, not physical audio/Switch or multiplayer network latency measurement. [Details and limits](inkwave-final-minute-music-742.md).

## 2026-10-06 — #780 visible blur cannot regain gamepad authority

Base main `a3993f37a00cc2f0a7b01d954591b98fb6ae97e3`. The actual Input/PlayerController and PlatformGame/Lifecycle connection reproduced the Issue: visible blur, one neutral poll, then fresh stick and button input produced yaw -0.031207394862975805, pitch -0.013003081192906586, movement magnitude 0.8148148148148149, all five action intents true and lastDevice=pad while focused=false and lifecycle state=ACTIVE. This is a browser input-authority correction, not a change to Splatoon numerical tuning or a console-fidelity claim.

InputPlatform now reads the existing page focus owner before polling. A new blur generation retires pending controller edges through the existing pad epoch. Polling cannot expose gameplay/menu pad state while unfocused. On focus return, the first available device goes through the existing direct-takeover owner, preserving consumed-stick neutral gates and canonical trigger thresholds; held buttons need physical release. It does not add a lifecycle subscriber/listener, broad simulation pause, permission request, sensor setting change or a second device-ownership mechanism. A no-pad interval preserves the pending rebase until a device is observable.

Dedicated actual-module source tests 7/7 passed, with 30/60/120Hz schedules, whole blurred intervals, focus held/fresh boundaries, blur/focus between polls, render-pending special, analog triggers, direct replacement, absent pads and twenty lifecycle cycles. Adjacent input/pause/pad/clock/gyro tests passed 65/65. Authentic build `1ebf9cb1ac2037278d1116594dc0c359e58a90d5b9dc7e6b590f4c0028f16f22` passed. Actual emitted input/platform modules passed three 30/60/120Hz focus cases plus the existing combined policy boundary case (4/4). Independent review also passed four first-poll/held-return/keyboard-mouse/epoch cases. Physical browser focus dispatch and real Bluetooth/USB controllers remain unmeasured.

Main advanced to `3d8a48d37ea5d6206e4f4185fa4a8229ae1c6977` during completion; its only new files are the separate Bomb contact fuse adapter/test/report (#723), with no overlap here. This local delta is held for a combined next batch; no individual source PR or CI run is started.

## ScreenFX pending-damage reset — #772

Reset now clears the pending damage attacker and angle together with the cancelled timer. This closes the pause→quit retainer without altering the native60ms burst, direction or paused visual clock. Source/minified9 each pass, including an isolated Node forced-GC baseline/fix comparison; physical full-game heap/GPU measurements are not claimed. See [scope and evidence](inkwave-screenfx-damage-reset-772.md).

## 2026-10-06: reticle state / visible-vs-authoritative footprint (#711 #709 #757)

チャージャー HUD の射程内判定を、フルチャージ固定から現在のチャージ量に応じた飛行距離（`chargerReach`）へ変更し、ブラスターの拡散拡大を外周リングのみに限定した（内側リングは静止サイズ）。インクストームの塗り位置を、その tick の見た目の雨半径と同じ範囲から選ぶようにした（#757）。弾道・数値・半径は不変。いずれも**ロジックのみ確認**で、ブラウザの実表示と Switch 実機との比較は**未確認**。本家の根拠・実装箇所・再現操作・影響は[詳細](inkwave-reticle-state-2026-10-06.md)を参照。

## 2026-10-06 — Dualies wall-drop (#604) and composed-runtime guards

Base main `67fec182`. Splat Dualies wall impacts now enter the existing sourced wall-drop state using the pinned 11.3.0 top-level `WallDropMoveParam`/`WallDropCollisionPaintParam` (shock 1.3, fall 0.65, ground 0.6; 20–40F + 10F + 15–35F at 0.06). Previously the round died on the contact frame after one generic impact. Damage is unchanged. Shooter (#385) and Charger (#625/#268) are excluded: Shooter is owned elsewhere, and the Charger record omits three period fields. #770, #777, #638/#637, #644/#643 and #556 were already correct after adapter composition (the reports read raw source). They are now pinned by composed-runtime tests. This is logic-level and emitted-verifier evidence; a Switch visual/frame comparison is still 未確認. Details: [inkwave-wall-drop-dualies-guards-2026-10-06.md](inkwave-wall-drop-dualies-guards-2026-10-06.md).

## 2026-10-06 — PR786 / #477 current-movement startup connection proposal

Fixed source: PR786 `de257a1501ff34c3072cfa979b3d09812999844d`. This local integration proposal preserves the existing #477 four-frame startup clock and the current Movement Physics roll-distance/recovery owners. It does not implement another timer or change the configured roll distance, duration, lock duration, ink cost, admission, or network representation.

The native Actor integrates movement before updating the runner. Current `integrateMovement` calls `writeDodgeVelocity` directly, bypassing the old runner-only startup gate. During the four held-clock ticks this previously reapplied the first roll interval. The existing #477 build adapter now connects both shared helper entrypoints: during startup, the velocity query does not own the velocity, and Actor integration delegates to the ordinary native collision/gravity step. Initial roll admission already arrests previous walking; later external velocity, gravity and wall collision remain governed by native physics. Modern runner anchors preserve the current `MOVEMENT_EPSILON` end boundary and recovery carry; the legacy native route remains supported.

Focused source acceptance: 10/10, using actual Actor update, WeaponRunner, Level and Physics with display/audio/paint fixtures. 30/60/120Hz rendering through the fixed clock retains four zero-propulsion ticks even with pre-entry velocity (3,0,4) and held movement; tick5 resumes the existing curve, tick16 completes 2.8 units, and the existing 32F lock ends at tick48. A negative control omitting only the helper connection moves over0.3 units on the first startup tick while its roll age remains0. Gravity/falling, externally supplied horizontal velocity, native wall clipping, chained rolls, death/reset/weapon change, successful special cancellation, and direct velocity-query ownership are separately checked. Missing/duplicated helper anchors fail closed.

This is a narrow source-level connection proposal for the existing owner. Full PR786 build/CI, remote presentation, the whole #477 acceptance set and PR787's final #738/#741 closure are not established by these tests. No physical Switch comparison was performed; the pre-existing timing constants and their documented source limits remain unchanged. The shared owner branch and public PR heads were not edited.
