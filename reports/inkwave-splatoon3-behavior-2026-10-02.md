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
| D04 | 空中で開始したローラー振りを縦振りにする。着地後も選択を保持する | ジャンプ受付の細かい境界、飛沫分布、威力曲線とアニメーション |
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

## 公開 issue 群6（76/86/91/180）の追記（2026-10-04、公開版のみ）

`game/` は公開版ではなく、PR #185 のマージで削除済み。以下は `inkwave-public/` を `patches/splatoon3/adapter.mjs` と実ランタイムで合成したロジック測定であり、ブラウザ実動作・Switch 実機比較ではない。詳細は `reports/issue-freebuff-6-20261004.md`、回帰は `patches/splatoon3/tests/public-issues-6.test.mjs`、証拠は `evidence/actions-freebuff-20261004/freebuff-6/`。

| issue | 対象 | 本家参照（Ver.11.3.0） | INKWAVE の状態 | 確認状態 |
|---|---|---|---|---|
| 180 | 壁ジャンプ（イカノボリ） | 壁でジャンプ長押し→チャージ、離して上昇。長いほど強く、上限あり（Inkipedia Mobility） | `runtime/movement.mjs` の `beforeActions` がチャージ/バーストを実装済み。合成 Actor で充填・静止・離し上昇・単調増加・乾き/敵インク/非登攀の拒否・通常登攀維持を回帰確認 | 合成で確認。`surge.velocity`等は校正値で本家未確認 |
| 86 | スーパージャンプ | 準備80F=1.3333s、移動138F=2.300s、クイックスーパージャンプで短縮 | adapter が `s3.jumpChargeTime`/`jumpFlightTime` を使用。AP0 で80/138 tick、AP最大で短縮を合成確認 | 妖精形開始の約21F追加は未実装（検証済み数値なし） |
| 91 | 通常splatの復活時間 | 通常約8.5s、溺死約7.0s、場外約5.5s（Inkipedia、報告の二次資料） | `profile.respawn` と adapter の死因分岐を追加。通常8.5s/水7.0sを合成確認。Quick Respawn は補正後の基準から減算 | 数値は二次資料で公式未確認。`reference.respawn.total` は unknown。遠隔splatは単一値のまま |
| 76 | スペシャル使用時のインク | 発動でインクタンク全回復 | `runtime/resources.mjs` が `_startSpecial` を包み、成功時のみ1回回復。slam/storm・未発動・継続中の非再回復・次弾消費を合成確認 | 合成で確認 |

compare 対象の変更点は `patches/splatoon3/profile.json` の `player.respawnTime`/`respawn`、`runtime/resources.mjs`、`adapter.mjs` の respawn フックのみ。武器キットや他ファイルは変更していない。未確認の数値を公式値として確定しない。
## サブウェポン実装（2026-10-04、issue 177、lane freebuff-2）

公開版のサブは `WeaponRunner.update` の `const bomb = SUB.bomb` にあり、投射物は `Projectiles.throwBomb` が生成し、`_updateBombs` が飛行と導火線、`_explodeBomb` が塗り・ダメージ・被弾を所有する。公開版に `Actor._throwSub` は存在しない。初稿が 이를仮定していたため、実ソースで修正した。

本家 11.3.0 の一次データ（Leanny/splat3 @ 7280ff9cde8bb1c5dcef46c700c326471584d2e6、data/parameter/1130、SHA256 および生バイトを証拠として保存）を変換して取り込んだ。Suction Bomb は `InkRecoverStop` 60F=1.0s、`SpawnSpeedZSpecUp.Low` 1.12→67.2、`PaintRadius` 5.0、`DistanceDamage` 1800@4.6/300@8.0 → 180HP/30HP。Curling Bomb は `InkConsume` 0.65→65、`MaxChargeFrame` 60F→1.0s、`BurstFrame` 210F→3.5s、`SpawnSpeedZSpecUp.Low` 0.40→24.0 と `SpawnSpeedZMaxCharge` 0.20→12.0、`FlyGravity` 0.016→57.6、MinCharge/MaxCharge の `PaintRadius` 2.133 と 5.0。

実装した挙動差分（名称や見た目ではなく状態遷移）：Suction Bomb は壁と天井に貼り付き、接触法線方向へ 0.21 オフセットして速度をゼロにし導火線を発火する。既存 Splat Bomb は `hit.normal.y > 0.6` の時だけ発火するため、この判定を全体ではなく individual bomb ごとの状態に移した。Curling Bomb は保持時間でチャージし、SpawnSpeedZSpecUp の Mid/High はギア用なのでチャージ曲線には使わず、明示的な SpawnSpeedZMaxCharge まで 24.0→12.0 で落とす。壁反射は ContactJumpPanel の係数と MaxBoundNum=3 の上限を使い、接地で転がり開始し、各フレーム実 `G.paint.splat` で paintRadiusMinCharge/MaxCharge（1.075→1.29）の軌跡を塗って所有者に addTurf する。導火線切れ時は native の `_explodeBomb` と除去経路を呼ぶ。

未確認のまま残す項目：Suction の `BurstFrame`・`InkConsume`・`FlyGravity` は 11.3.0 の表に省略されているため `null` / `unknown-omitted` とし、Splat Bomb の値を複製して一次ソース扱いしていない。発火に有限値が必要な場合のみ INKWAVE 既存の fuse と一致する 1.0 を `calibrated` として明示した。Curling のチャージから速度への曲線は表が端点のみ给出のため線形補間を `calibrated` とする。壁・天井接着は 11.3.0 に接着パラメータが存在しないため機能校正であり、公式値ではない。ネットワークは `recBomb` が `b.kind` を送出するため remote 側の sub 識別に必要なパケット変更と、`gear.mjs` の gear snapshot（`SUB.bomb` 固定）を選択 sub へ広げる作業は親が所有する。ブラウザ実動作、Switch／iPad／2台実機のパリティは未検証であり、単独測定を実機比較の代用にしない。

詳細は `reports/public-kit-2-20261004.md`。親接続前のため、実ブラウザ合成と GitHub Actions による exact-SHA 描画ゲートは未完。
## freebuff-4 の修理差分（75102bd / 7d672d4、2026-10-04）

対象は `inkwave-public/` に `patches/splatoon3/adapter.mjs` を適用して合成した公開版で、`game/` は使用していない。以下の測定はすべて合成モジュール上のもので、ブラウザ実動作でも本家実機比較でもない。「確認状態」は本家一致を意味しない。詳細と証拠は `evidence/actions-freebuff-20261004/freebuff-4/{audit.md,REPAIR-FINAL.json}`、回帰は `patches/splatoon3/tests/audit-regression-4.test.mjs`。

| # | 対象 | 本家根拠（Ver.11.3.0） | INKWAVE の実装箇所 | 再現操作 | プレイへの影響 | 確認状態 |
|---|---|---|---|---|---|---|
| F2 | 死亡時のギア（スペシャル減少・復活時間短縮）の到達経路 | 本家に対応する gear / AP の概念が無く、照合対象が存在しない。INKWAVE 独自のシステムであり本家一致を主張しない | `patches/splatoon3/runtime/gear.mjs` の `applyDeathGear()`（22〜36行）を単一入口にする。所有者側は `Actor.prototype.splat` のラッパ（142〜150行）、遠隔側は `adapter.mjs` が `netmatch.js` の `victim.stats.deaths++;`（569行）の直後へ挿入したフック。同一性は `a.stats.deaths` を native の加算後に読んで決まる | 同一死因で自作の死亡と遠隔 splat を1回ずつ発生させ、スペシャル値が一致すること、重複パケットでは1回だけ適用されること、2度目の命で同じ値へ到達すること | 所有者画面と観客側で途中のスペシャル値表示がずれない | 合成 Actor / NetMatch で確認（自前テスト20件、旧実装に戻すと4件が失敗）。本家参照は該当なし |
| F3 | チャージャーの足元塗り | 発射時に足元へ小面積のインクが着弾すること自体は既知の挙動だが、半径・順序・線状描画との独立性の公式値は未取得 | `patches/splatoon3/runtime/weapons.mjs` の `feetSplash()`（162〜170行）。`kind` は `'trail'` で、これは `inkwave-public/src/world/paint.js:36` の K テーブルが実際に持つ native kind であり、`netmatch.js:106-110` の `recSplat` が通信へ載せる値と `paint.js:385` の `_kind()` が解決する値が一致する | partial / full のチャージを1回ずつ撃ち、その送信パケットを実 `_play` で再生して送信側と受信側が同じセルを指すことを確認 | 観客にも足元インクが現れる。従来の `'chargerFeet'` は K に無かったため、送信側と受信側の両方で半径ヒューリスティックへ静かに劣化していた | 実 Level / PaintSystem / NetMatch で確認（CPUグリッド）。**GPUアトラス出力は未検証**（スタブレンダラ）。本家の半径と順序は未確認 |
| F6 | 発射後のインク回復開始遅延 | 発射直後しばらく回復が止まることは公開資料で一般的だが、武器別フレーム値の公式資料は未取得 | `patches/splatoon3/runtime/resources.mjs` の回復ゲート（67行・72行）。旧式は回復ゲートに `weaponDelay` と未代入の `a.s3?.inkRecoverStop` の大きい方を掛けていたが、後者には代入先が無く不活性だったため削除 | partial / full 双方で、発射直後の回復開始境界を測る | **挙動差分なし**。サブとフリックの停止は `recoverStopRemaining` が従来どおり独立して効く | 20f の境界が両形態で不変であることを合成で確認。本家の境界値そのものは未確認 |
| F1 | スーパージャンプ中と壁登攀中の回復 | 回復処理の位置自体が本家挙動として未確認 | 変更なし。`actor.js:248` の早期 return が ink/hp ブロック（`actor.js:299`）より前にあるのは 0859bf4 / 045deb5 / 97b99bf でも既にそうだった（上流既存の挙動） | スーパージャンプ中と壁登攀中で回復を測る（今回は未実施） | 回復が1 tick 遅れる可能性。候補由来の挙動ではない | **未確認**。参照値が得られておらず回復処理は追加していない |
| F5 | スナイパー弾の遮蔽判定 | 本家実機との比較をしていない | 変更なし。`weapons.mjs:182` の最近接判定は上流自身の幾何 | 壁の向こうに立つ敵に対して射線を生成する（`repair/scripts/f5-occlusion-repro.mjs`） | 完全に遮蔽された敵は正しく除外される。実際の差は、どの壁の背後でも 0.52 m の見通せる帯が残ること | **未確認**（幾何再現のみ） |

未確認の項目を確定済みとして扱わない。ブラウザ、WebKit、実機での確認と、本家実機の計測は別物であり、この節のいずれの行もそれらを代替しない。

親統合補足: F5 の監査対象は旧候補 063286d3。現候補は 14ce1e6 で最近接点順から解析的なカプセル初回接触順へ修正済み。元の接触半径 0.52 は維持し、本家実機の遮蔽寛容幅を確認したとは扱わない。

公開 #177 親統合追記: キューインキの実 installer・NetMatch の5イベント・送信元の所有者照合・通常弾とチャージャーの防御接触順を追加した。半チャージ／貫通ビームは防御より奥の敵に届かず、貫通では手前の敵への命中を維持する。native NetMatch の bind/pack/JSON/play、キューインキへの実 swept projectile、ghost の充填不変を合成回帰で測定した。3キット全体の割当と最新SHAのブラウザ検証は未完了であり、本家の物理距離や実機一致は未確認。

## cline-2 のサブネットワーク修理差分（2026-10-04）

対象は `inkwave-public/` に `patches/splatoon3/adapter.mjs` を適用した合成公開版で、`game/` は使用していない。以下の確認はすべて合成モジュール上の focused テストによるもので、ブラウザ実動作でも本家実機比較でもない。「確認状態」は本家一致を意味しない。

| # | 対象 | 本家根拠（Ver.11.3.0） | INKWAVE の実装箇所 | 再現操作 | プレイへの影響 | 確認状態 |
|---|---|---|---|---|---|---|
| S1 | リモート爆弾のサブ識別と保持チャージの再現 | 本家はオンライン通信の仕様を公開していない。参照するのは INKWAVE 自身が持つ権威分離の構造である（`paint.js` の ghost は塗らない、`netmatch.js` の `shouldApplyHit` が remote 攻撃者を drop、mute 中は `recSplat` を抑止）。 | `netmatch.js` の `recBomb` に後続2項目（サブ ID、保持チャージ 0..1）を**追記**し、`_play` の `case 'b'` が `e[10]`/`e[11]` を native `ghostBomb` へ渡す。受信側は `kitGhostBombAttach()` が `s3GhostResolved` に**表示専用**の解決を置く | 実 `NetMatch.recBomb` → `_rec` → JSON 往復 → 実 `_play` → 実 native `ghostBomb`。Curling 満继续保持で identity と charge が残り、飛翔時 57.6、接地後 5.76、BurstFrame 3.5 の導火線区間で転がって爆発することを確認 | 他家のサブが汎用 Splat Bomb のまま飛ぶ状態と、Suction が壁に貼り付かない状態を解消した | 合成 NetMatch と native Projectiles で確認（focused 27件）。ブラウザ実動作と本家実機は未検証。旧形式パケット（追記項目なし）は generic ghost のままフォールバックすることを確認 |
| S2 | ghost が権威を得ないこと | 本家根拠なし。INKWAVE 既存の ghost 非権威設計の維持である。 | 権限解決 `resolvedOf()` は `!b.ghost && b.s3Resolved` のまま維持。表示解決 `presentedOf()` を追加し、gravity / contact / fuse / fx 半径だけが ghost の値を読む。paint 半径、ダメージ帯、ダメージ半径、boss splash、turf、直撃ダメージは `resolvedOf()` を通り、ghost では native 値へフォールバックする | ghost の転がり中に `PaintSystem` へ到達せず、親統合では爆発時も ghost 自身の判定で paint / actor hit / boss splash / turf を拒否する。通信破棄・owner adoption 後も爆発表示だけを継続する回帰を追加し、native mute への依存を除去した | 観客側のサブがローカルと同じ挙動に見えながら、ローカル盤面、体力、スコア統計を一切汚さない | 実 `PaintSystem.splat` と実 `NetMatch` で確認（CPU グリッド）。**GPU アトラス出力は未検証**（スタブ レンダラ）。本家参照は該当なし |
| S3 | ghost 生成時の記録と再進入 | 本家根拠なし。`netmatch.js` の `!a.remote` が唯一の防壁であり、`_adopt` で remote が外れた瞬間この防壁は外れる。 | `ghostBomb` の内部 throw を `withGhostBombSpawn()` で囲み、その窓では `kitBombAttach` が権限付与を拒否し、`kitBombPacket` は null を返す（= 記録しない）。`Projectiles.prototype.throwBomb` の hold 消費は remote と ghost 窓の両方でスキップする | remote を外した（採用済み）actor のパケットを実 `_play` で再生し、`nm.out` に `'b'` が増えないこと、attach が拒否されて `s3GhostResolved` だけが付くこと、遠隔 actor の保持チャージ 0.5 が残ることを確認 | 誰かのサブが adoption 後に自分の ghost を記録して相互増幅する経路を閉じた | 合成 NetMatch で確認。旧実装に戻すと 4 件が失敗する。本家参照は該当なし |
| S4 | パケット境界の検証 | 本家根拠なし。`netmatch.js` の `r2`/`r3` 丸め以一种で peer 由来の値を扱う既存方針に従う。 | `kitBombPacket()` と `kitGhostBombAttach()` は 2 件の許可リスト（`suction` / `curling`）、長さ 16 以下、数値のみ、0..1 クランプで受理し、`''` または null を返して native 経路へ戻す。`SUB` をキーに使うのは許可リストを通過した ID のみ。 | `'__proto__'`、`'constructor'`、`'suctionX'`、64 文字、非文字列、負値、5、NaN、文字列の `'1'` を投入し、いずれも拒否されて generic にフォールバックすることを確認 | 異常な peer がローカルレジストリや NaN を爆弾パラメータとして差し込む余地を塞いだ | focused テストで確認。**Transport への敵対入力は未実施**。検証は packet 境界の関数を直接叩く形である |

未確認の項目を確定済みとして扱わない。ブラウザ、WebKit、実機での確認と、本家実機の計測は別物であり、この節のいずれの行もそれらを代替しない。ブラウザ実動作、GitHub Actions の exact-SHA 描画ゲート、2 台実機のパリティはいずれも未検証である。

親の追加検証: Cline2の再生テストは元のローカルactorを同じwire nidからproxyへ置き換えず、一部で別owner/teamを検証していた。実パケットのnidを維持してproxyに置き換えた上で再検証した。接続破棄後のghost爆弾が6回の塗り呼び出しと1回のturf加算を発生させる旧動作を再現し、ghost固有のpaint/actor/boss拒否で修正した。表示用のFXは維持する。native packet追記2項目と親のKIT_FORWARD/送信者束縛は両方維持している。


## 公開キットの親統合補足（2026-10-04）

| 対象 | 本家の根拠 | 実装箇所 | 再現と影響 | 確認状態 |
|---|---|---|---|---|
| ロビーの現在のサブ表示 | Ver.11.3.0 の抽出済み基本キットは shooter=Suction / roller=Curling / charger=Splat Bomb。対応表の数値出典は curated-numbers と kit-composition に固定。 | adapter の Menus._sub と CURRENT LOADOUT アイコン接続 | 選択したブキの sub レジストリを取得する。上流の共通ボム名・アイコンを引き継ぐ不一致を除去。 | 実 adapted メソッドの回帰は旧コードで失敗、新コードで成功。キット割当と最終ブラウザ表示検証は未完了。 |
| バリアへのローラードロップの距離減衰 | 本家実機でバリアの減衰は未確認。INKWAVE 自身の native actor/boss 接触時の damageNear→damageFar、7単位の距離式に揃える内部整合修正。 | kit-big-bubbler の damageAtContact / kitBarrierCandidate | 発射位置から実バリア接触点までの距離を使い、通常弾は変更しない。遠距離の150→35ダメージにより、不適切な即破壊から耐久9097の維持へ変化。 | 旧コードで新規5件中4件失敗、修正後は親統合の54件成功。クエリは副作用なし、提案ダメージも同じ値。ブラウザ実動作と本家一致は未確認。 |

これらは bca373d の rolling 統合結果であり、未完了のトリズーカや全キットの実行を確認済みとは扱わない。


### Public kit composition and Trizooka native integration (2026-10-04)

The production installer now registers real Suction/Curling, Trizooka, Big Bubbler and Ink Vac mechanics before composing Shooter_Normal_00 (Suction/Trizooka 200p), Roller_Normal_00 (Curling/Big Bubbler 180p), and Charger_Normal_00 (Splat Bomb/Ink Vac 190p). These identities/costs are sourced from the pinned 11.3.0 rows recorded in `patches/splatoon3/reference.json`; actor-local gear, bot selection, lobby, loadout and HUD use the same registry. Four remaining mains explicitly retain Original INKWAVE kits. Kit identity verification does not establish full Nintendo gameplay parity.

Trizooka uses the existing native projectile list and one force/integration pass. Brake/free gravity and drag now apply each tick, transitions apply once on entering a stage, and its growing actor sphere replaces the render shell in collision reach. The growing world sphere queries radius-expanded block bounds, skips grates, and reports the earliest rounded-OBB contact with an outward normal and surface point. Only the authoritative carrier writes the per-volley hit ledger or paints; remote Trizooka/Ink Vac ghosts remain presentation-only even after transport disposal. Paint credits turf once through the native owner call, preserving the native gauge policy. Two fields appended to the main projectile packet preserve lobe/action identity without changing native field positions or bomb packets.

Reproduction: select each of the three base mains in the actual loadout, inspect sub/special names, icons and costs, enter a match and activate at its gauge threshold. Hold primary for Trizooka's three shots; deploy Big Bubbler; absorb a native opposing shot with Ink Vac and release the countershot. New canonical browser probes exercise this sequence in the loaded revision, including rendered frames. Composed-source focused tests verify force deltas, collision, authority and packet reconstruction; final exact-head Actions/browser results remain required before declaring acceptance.

Unconfirmed against Nintendo hardware: orbit start radius/turn rate, unit conversion and drag calibration, end delay, special gauge accumulation after the token ends, and frame-exact device parity. The separate Trizooka report records extracted values and calibrations. No Switch/iPad observation is claimed by the synthetic or Chromium checks.

Independent review PN-01: remote respawn previously retained Squid Surge charge and roll armor because it bypasses owner `reset()`. Both paths now call the same movement-action reset; an actual Actor charge followed by native NetMatch death/respawn is covered by a failing-before/passing-after regression. This confirms previous-life state isolation, not a Nintendo timing measurement.

Parent fan regression: immutable native aim direction now feeds all three lobes; the two visual lobes use equal/opposite calibrated offsets bounded by the declared fan. The carrier retains the exact camera ray. The previous code aliased the first projectile velocity and placed both side lobes on one side. This fixes internal calibration consistency; Nintendo orbit/spread precision remains unmeasured.
