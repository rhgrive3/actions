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


## Action reliability workstream (2026-10-04)

入力位相によるDualies dodge消失を既存build-only reliability ownerで修正した。物理jump edgeのActorへの転送、gamepad action edge、sub優先、pointer-loss取消を実コードregressionで確認した。速度・距離・duration設定・poseは変更していない。roll終了比較の浮動小数点誤差による1tick残留だけを補正した。本家11.3.0実機の受付タイミング一致は未確認。分母・before/after・ownership・browser/CIの確認範囲は [action-reliability-report.md](action-reliability-report.md) を参照。

## Network replication の修復（2026-10-04）

ローラー横／縦振りの owner physics を packet 化する順序を修正し、remote の trajectory と projectile に紐付く curtain の時間軸を一致させた。基準射程・威力・spread・local physics・animation pose の変更はない。全武器の native replay、二人の WebSocket arena、遅延／重複／退出回帰の詳細は [Network replication report](network-replication-report.md) に記録する。これは INKWAVE 内の同期比較であり、本家の実機比較、原作の射程校正、physical iOS 検証の未確認項目を解消したという意味ではない。

## 遅延した remote splat と復活 life（#599、2026-10-06）

比較条件は Splatoon 3 Ver.11.3.0、オンラインの Regular Battle / Turf War、シューター、標準ギア、相手の splat 後に復活する状態。任天堂の [オンライン対戦案内](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59459/p/897) と [公式ゲーム紹介](https://splatoon.nintendo.com/en/gameplay/) はオンライン対戦と Turf War を案内しているが、remote death event の順序・送信者権限・life epoch は説明していない。この内部同期の本家比較は未確認であり、Switch 実機や稼働中のオンライン対戦での再現はしていない。

INKWAVE の `patches/reliability/combat-credit-adapter.mjs` は owner と event の life を検証した後、遅延した terminal event の元 paint credit を一度だけ反映する。今回の修正では、その credit 処理の後で、death presentation を最新の owner snapshot `net.lastLife` と再生中 sample `net.cur.life` の両方が event life と一致する場合だけ通す。NetMatch の packet shape、paint の生成・geometry、通常の hit / respawn timing は変更しない。

再現回帰は native `Actor` の hit → splat event → `NetMatch._sendTick` → remote `_tick` / `_advance` / sample / `_playEvents` を使う。20Hz の固定 clock で life 4 の terminal event を保留中に、owner が life 5 の生存 snapshot と respawn event を送る。再生中 sample は life 4、最新 owner snapshot は alive/life 5 であることを確かめ、古い terminal は撃破表示と死亡状態を変えず、元の塗りと attacker reward を一度だけ反映し、その後の respawn event は通常どおり再生する。重複 terminal と forged owner も拒否する。これは source VM のロジック検証であり、ブラウザ実動作・実ネットワーク・本家実機との比較は未確認。

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

## 2026-10-04: first-allocation mobile resource budget

A cold-boot follow-up for #375/#395 uses the already-published G.mobile profile
until G.game exists. The established touch budget now applies on the first
cloud/Halyard cube allocation at default high settings, not only after later
runtime refresh. Existing formats, appearance policy and gameplay stay intact.
These are project resource dimensions, not Nintendo/Switch memory values.
See [the cold-boot budget report](inkwave-cold-boot-budgets-2026-10-04.md).

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



## Slosher 2F teammate-through grace window (#717, 2026-10-06)

Splatoon 3 Ver. 11.3.0 Standard Slosher (バケットスロッシャー) projectile collision
parameters explicitly define `FriendThroughFrameForPlayer = 2` for all three
projectile units:
- UnitGroupParam.Unit[0].CollisionParam.FriendThroughFrameForPlayer = 2
- UnitGroupParam.Unit[1].CollisionParam.FriendThroughFrameForPlayer = 2
- UnitGroupParam.Unit[2].CollisionParam.FriendThroughFrameForPlayer = 2

本家の根拠: Leanny Splatoon 3 Ver. 11.3.0 パラメータテーブル (`WeaponSlosherStrong.game__GameParameterTable.json`)
および検証Wiki（味方を貫通する時間: 2フレーム）。シューター等の未使用設定とは異なり、スロッシャーでは
有効なパラメータとして定義されている。

INKWAVE の実装箇所:
`patches/splatoon3/runtime/weapons-fidelity.mjs`
- `collisionRecord()`: `FriendThroughFrameForPlayer` を保持。
- `setCollision()`: `p.fidelityFriendThrough` を設定（#717 受入範囲である C17 は Slosher 2F、統合 C22 の #801 は Roller 3F に限定。シューター #656 は親 PR #765 が所有するため、Shooter/Dualies/Splatling/Blaster は native main の味方透過挙動のまま維持）。
- `fidelityProjectileTargets()`: 味方アクター（発射者 owner を除く）の capsuleEntry を判定し、
  スイープ内の接触時刻における projectile age が `p.fidelityFriendThrough`（2F = 2/60秒）未満の場合は透過（pass-through）、
  2F 以上の場合は衝突遮蔽（obstruction）として最短候補に含める。
- `fidelityVolleyDamage()`, `applyFidelityProjectileHit()`, `applyFidelitySlosherSplash()`:
  味方接触による消費時はフレンドリーダメージ 0、キル判定なし、飛沫スプラッシュを遮蔽味方の後方に発生させない。
`patches/splatoon3/weapons-adapter.mjs`:
- `weapons.js` 内の生の `e.team === p.team` スキップをアダプタで除去し、`fidelityProjectileTargets` の時限判定に委譲。
- 味方消費時の sloshSplash 発生を抑止。

再現操作:
1. スロッシャーを装備し、直線上の味方 B、その直後の敵 C を配置。
2. B が発射点から 2F 到達以降の距離（例: z = 4.5）にある場合、修正前はスロッシャー弾が味方を永久透過して敵 C に命中（ダメージ 70）。
3. 修正後は、味方 B との接触時刻が 2F 到達以降であれば味方 B の身体で弾が消費・遮蔽され、味方 B はノーダメージ、背後の敵 C にも命中しない。
4. 味方 B が 2F 未満の至近距離（例: z = 1.0）にある場合は、2F 猶予期間内として透過し、背後の敵 C に命中する。
5. 1ステップ内で 2F 境界をまたぐ場合（例: 1.5F から 2.5F の移動）、ステップ終端時刻ではなく候補接触時刻（contact age）で判定され、2F 未満接触なら透過、2F 以上接触なら遮蔽される。

プレイへの影響:
- 狭い通路や味方の密集時に、2F 猶予後（中遠距離）の味方による弾の遮蔽（ボディブロック）が本家同様に機能する。
- 発射直後（<2F）の味方誤射による無駄な弾消えは防がれつつ、遠くの味方を貫通して敵に当たる不具合が解消される。
- 他ブキ（Shooter, Dualies, Splatling, Blaster など）の透過挙動は変更されず、Slosher の 2F 窓のみが正しく適用される。シューターは >5F でもネイティブ main の透過を維持する。

確認状態:
- 固定 60 Hz ロジックおよびリグレッション検証 (`patches/splatoon3/tests/slosher-teammate-through.test.mjs` 12項目):
  Unit 0/1/2 の値保持、<2F 透過、>=2F 遮蔽、味方ノーダメージ、背後敵ノーダメージ、接触時刻ベースの境界判定、
  発射者自身の透過、敵先行時の判定順序、ゴースト弾の単一消費、プール再利用時の初期化、
  他ブキ対照（Shooter >5F 透過、Dualies/Splatling/Blaster 透過）の確認、30/60/120 Hz での同一挙動、最大ボレーダメージ制限の維持、地形遮蔽優先。
- 未確認: Switch 実機での精密なピクセル・フレーム同期比較、Roller 3F 窓の Switch 実機比較（C22 の #801 は pinned source と実 runtime で確認）、チャージャー・ボム等の味方接触挙動。

## 2026-10-06: RESULT frame work (#53)

| 比較項目 | 本家 Splatoon 3 | 公開版 INKWAVE と確認 |
|---|---|---|
| 条件・根拠 | Ver.11.3.0、Turf War、ジャッジ後の結果表示。結果画面に移った後の武器・ギア入力はなし。任天堂の[公式更新資料](https://support.nintendo.com/jp/switch/software_support/av5ja/1130.html)はこの状態の内部 actor/projectile/描画 scheduler を公表していない。 | 公開版 `inkwave-public/src/main.js` の `_loop` → build adapter 後の `_frame` と `patches/splatoon3/runtime/clock.mjs::runSimulation` を追跡。 |
| 再現操作 | 本家 Switch で通常の Turf War を終え、結果表示中の更新量を計測する必要がある。 | PLAYING → `state === 'results'` → Match.dispose → 新規 PLAYING を、固定時計・native `Match.update` / `Actor.update` のカウンターと1本の RAF callbackで再現。 |
| 差分・影響 | 内部更新量は公開資料から確定できず、同じ／異なるとは判定しない。 | RESULT 中は native Match/controller/Actor と `Projectiles.update`、paint flush、gameplay FX・FX hooks・swim wake を止める。結果の `diorama`、showcase/score UI、ScreenFX、背景描画、音楽経路は継続。オンラインでは network pump と remote snapshot の適用を維持し、local Actor/projectile simulation は進めない。Practice Range と paused PLAYING は通常経路を維持する。 |
| 確認状態 | Switch 実機の更新量、描画負荷、音楽・スコア演出の比較は **未確認**。 | 実 adapter composition / `_loop` / `_frame` と native Actor・Match のカウンター回帰は確認対象。これはロジック・callback数の検査で、ブラウザ実動作のGPU負荷や本家実機比較の代用ではない。 |

この修正は結果画面の背後で続く INKWAVE の作業量を抑えるもので、勝敗・塗り・ブキ挙動の変更や本家の内部実装との一致を主張しない。結果曲と得点表示アニメーションを止めない。

## ローラー横振りの Inside/Outside 判定を実際のヒット幾何へ（#734、2026-10-06）

Issue #734: `patches/splatoon3/runtime/weapons-fidelity.mjs` の `fidelityDamage()` は
Inside/Outside を射撃時に保存した `p.fidelityYaw`（ファン launch yaw）で判定していた。
Splat Roller の命中判定は各弾の**spawn 位置から実際のヒット位置**への XZ ベクトル基準で
評価されるため、重なった large collision volume の間で同じ幾何が table によって分裂していた。

| 項目 | 内容 |
|---|---|
| 本家の根拠 | Issue #734 が引用する[S3 ゲーム詳細](https://wikiwiki.jp/splatoon3mix/%E3%82%B7%E3%82%B9%E3%83%86%E3%83%A0%E8%A9%B3%E7%B4%B0%E4%BB%95%E6%A7%98)「ローラーは弾ごとに発生位置からの左右の角度と飛距離で判定」および[S3 メインワポン検証表](https://wikiwiki.jp/splatoon3mix/%E6%A4%9C%E8%A8%BC/%E3%83%91%E3%83%A9%E3%83%A1%E3%83%BC%E3%82%BF%E6%83%85%E5%A0%B1/%E3%83%A1%E3%82%A4%E3%83%B3)。基準は Splatoon 3 Ver. 11.3.0。pinned 値は `WideSwing DamageParam.Inside.Degree = 16` / `InsideDistanceXZ = 1.2`。**Switch 実機での角度計測は行っていない** |
| INKWAVE の実装箇所 | `patches/splatoon3/runtime/weapons-fidelity.mjs`: `configureFidelityFlick()` が launch 時に `p.fidelitySectorYaw = actor.yaw`（swing forward）を保存、`rollerHitAngle()` を新設、`fidelityDamage()` が `p.start → 実際のヒット点` の XZ 角度を `Inside.Degree` 判定に使用、`Projectiles.prototype._new` が reset に追加。`patches/splatoon3/runtime/weapon-edgecases.mjs` の near unit（`appendRollerNearUnit`）にも同じ sector 基準を設定 |
| 再現操作 | 独立ジオメトリの fixture: spawn `(0,0,0)`・sector 0° で ±15.99° は Inside、±16.01° と 180° は Outside。同じヒット点 `(0,0,4)` に対して spawn `(0,0,0)` は Inside、lateral spawn `(6,0,0)` は Outside、mirrored `(-6,0,0)` は角度符号が反転し同 table。sector を `-90°`（-X 向き）にすると 14° オフが Inside になるが、同じ座標を世界 +Z 基準で読むと 76° になる。issue の overlap 例（`fidelityYaw=+18°` で正面ヒット `xz=2`）は Inside、inner launch が 20° オフへ到達すると Outside。`fidelityYaw` を ±18°/0° で振っても結果は不変 |
| プレイへの影響 | 重なり領域で ±16° 境界付近のダメージが「どちらの弾が勝ったか」ではなく実際のヒット幾何で決まる。距離減衰・ダメージ帯・1 挥ぎ 1 最大命中・vertical 帯・near unit・pool reset・ghost の無ダメージは変更しない。sector 基準を持たない弾（remote ghost）は Inside のまま保持し、packet 拡張はしない |
| 確認状態 | **ロジック確認済み**（`patches/splatoon3/tests/issue-734-roller-hit-sector.test.mjs` 7/7、baseline `a3993f37` では 0/7 failing→修正後 7/7。Roller/weapons focused 7 ファイル 53/53）。**本家実機（Switch Ver.11.3.0）での ±16° 境界・overlap 実測は未確認**。描画間隔（30/60/120 Hz）依存は角度判定に無く固定 tick の決定性のみを直接証明。#611（straight/free 選択）・#674（入射角深度）・#58 は別 root のまま |

## 2026-10-06 — #731 sub-weapon ready state on the enemy-ink attack/ready curve

Base: main `a3993f3`. Reference: Splatoon 3 Ver. 11.3.0, the release this profile pins. The Pinned 11.3.0 `misc/params.json` keeps two separate enemy-ink movement curves, `OpInk_MoveVel` (0.024 / 0.0557 / 0.0768) and `OpInk_MoveVel_Shot` (0.012 / 0.0330 / 0.0420); both are already bound in `profile.json`, so neither is an inferred value. Nintendo's Splatoon 2 Ver. 1.4.0 notes list "moving while preparing to throw a bomb or sub weapon" among the states Ink Resistance Up must apply, and the current Splatoon 3 ability documentation states it works the same way as in Splatoon 2. At 0 AP the attack/ready value is exactly half the ordinary value.

The live path is `patches/splatoon3/runtime/gear.mjs`, whose `Actor._horizontal` wrapper selected between the two curves from `intent.fire` alone. A held throwable sub never set that flag, so aiming a bomb kept the actor on the ordinary walk curve. Measured through the real Actor and the real `installGear` at a fixed 60 Hz, grounded Inkling, standing in enemy ink, no Flow: 0 AP settled 1.440000 (0.024x60) while a sub was held instead of 0.720000 (0.012x60), a factor of 2.00; at 57 AP it settled 4.608000 instead of 2.520000, a factor of 1.829; at 10 AP, 2.755523 instead of 1.693726. The Ink Resistance gear formula and both parameter curves are unchanged.

State ownership now reads the weapon's own ready state, `weaponRunner.aimingSub`, rather than the raw button, so release and cancel frames cannot leak the ordinary curve. `Actor._horizontal` runs before `WeaponRunner.update` in the same tick, so the ready state is one authoritative tick old, exactly like the main-fire flag it sits beside; that is the existing input pipeline, not a new delay. The selection is a small exported predicate, `enemyInkAttackReady`, so a later owner of the surrounding weapon-kind classification can reuse it.

Verified: dedicated 10/10. Ordinary walking still selects `OpInk_MoveVel` and main fire still selects `OpInk_MoveVel_Shot` at 0, 10 and 57 AP; a held sub selects the attack/ready curve for every tick of the ready state; the state is entered once and left once with no ordinary-curve tick after readiness begins and none before the release; squid form never enters a sub ready state and keeps the ordinary curve; 30/60/120 Hz render schedules produce the same fixed-tick selection; a reset clears the ready state so the reset tick falls back to the ordinary curve before the still-held sub re-arms; a remote opponent selects the same curve as the local player, because remote actors really move; presentation-only channels (`character.wSub`, `character.bombHeld`, a visual sub-aim flag) cannot select the gameplay curve; the scoped write is restored afterwards and never reaches another actor's equipment. The assertions are computed from the profile's own gear curves rather than hard-coded world values, so no INKWAVE world scale is assumed. Against the pre-fix source the same suite fails 6 of 10. These are VM tests over the real composed modules, not a browser session, a human play session, or a hardware Splatoon 3 comparison.

Unconfirmed: whether S3 applies `OpInk_MoveVel_Shot` to any further ready states beyond a held sub (charger wind-up, splatling stream, dualies turret, special charging) is not established by the sources cited here, so only the sub ready state is owned. Sub weapon bomb hold duration (`#245`, PR 758) is a separate root and is untouched. Open PRs 688, 692, 699 and 758 rewrite the same selection line with weapon-kind classification; none of them carries a sub ready predicate, so this residual was unclaimed before this change and the merge order is left to the integration review.

## 2026-10-06 — #743 roller rolling target at the S3 frame boundaries

Base: main `a3993f3`. Reference: Splatoon 3 Ver. 11.3.0 `WeaponRollerNormal` `WeaponRollParam`, which supplies exactly three fields: `SpeedNormal` 0.108, `SpeedDash` 0.132, `DashFrame` 90. The profile carries them at its own 6x scale as `rollBaseSpeed` 6.48, `rollSpeed` 7.92, `rollDashTime` 1.5.

The report located its root in `inkwave-public/src/game/weapons.js`, which is hash-locked raw upstream. That file is not the live target: the build replaces the roller branch via `patches/splatoon3/movement-physics-adapter.mjs`, connecting `rollingMovementSpeed` from `runtime/movement-physics.mjs`, which already consumes both fields. Measured on the real Actor and the real build connection at a fixed 60 Hz, `moveSpeed()` returns 6.480000 at 0F, 1F, 30F, 60F and 89F, and 7.920000 at 90F, 91F and 120F. The reported 3.96 base and 27F ramp never occur. Acceptance items 1, 2 and 4 were already satisfied before this change.

No ramp was added. The pinned table has no interpolation parameter between the normal and dash speeds, so the sourced model is the step that reaches maximum exactly at 90F; introducing a ramp shape would be an invented curve. What remains unconfirmed is the true in-game shape between 6.48 and 7.92 if it is not a step, which requires a controlled hardware measurement and is not settled here.

The real gap was the two unchecked acceptance items. Verified by dedicated 7/7 on the real composed modules: the roll parameters still resolve to the profile values and to the 1.08/1.32 ratio and 90F dash frame; the target is 6.48 through 89F and 7.92 from 90F and never produces the discarded 0.5x base at any frame; the boundary is the 90th frame, not the 27th; a played roll never exceeds its frame's target, reaches the normal roll speed inside the 72 WU/s^2 attack/aim acceleration budget, and reaches the dash speed no earlier than 90F and no more than one frame later; the Run Speed gear ability cannot reshape the rolling target, verified against an ordinary roller where the same ability does raise its speed; the target is released in the sub ready, airborne, stick-released and reset cases; 30/60/120 Hz render schedules produce the same trace. Injecting the legacy 0.5x / 0.45 s curve into the composed owner fails 5 of the 7. These are VM tests over the real composed modules, not a browser session, a human play session, or a hardware Splatoon 3 comparison.

Separately observed and left unchanged because no source settles it: the Flow `runMultiplier` 1.2 is applied outside the locked-roll guard, so an active Flow multiplies the rolling target (6.48 becomes 7.776). Whether S3 Flow affects roll speed is not established by any record in this repository. Inking consumption, paint width, contact damage, flick and recovery, dash turn braking (`#466`) and the 0.7 s animation limit are unchanged. No gameplay scalar changed for this issue.

## 2026-10-06 — #732 / #745 Heavy Splatling startup phases (humanoid 1F / squid 6F)

Base main `a3993f37a00cc2f0a7b01d954591b98fb6ae97e3`.

- 参照本家バージョン: スプラトゥーン3 Ver. 11.3.0（[メインウェポン前隙・後隙検証表](https://wikiwiki.jp/splatoon3mix/%E6%A4%9C%E8%A8%BC/%E3%83%A1%E3%82%A4%E3%83%B3%E3%82%A6%E3%82%A7%E3%83%9D%E3%83%B3/%E5%89%8D%E9%9A%99%E3%83%BB%E5%BE%8C%E9%9A%99) 引用）。
- 対象ブキ: バレルスピナー (Heavy Splatling)。ギアなし、平地・自インク。
- 状態・操作条件:
  1. 安定人型姿勢からの新規 ZR 入力（fresh ZR edge）。
  2. イカ潜伏（自インク潜伏中）からの ZR 押下によるヒト化・チャージ開始。
- 本家の根拠:
  - バレルスピナーのチャージ前隙は「ヒト: 1F」「イカ: 6F」。
  - チャージ時間: フルチャージ 72F（第1段階 48F）。発射隙 1F、連射 4F。
  - S3 の定義では、起動前隙（startup）はチャージ進行（chargeT の増加）が始まる前のフレーム数であり、チャージ所要時間（72F）とは別枠。
- INKWAVE の実装箇所と差分:
  - 実装箇所: `patches/splatoon3/runtime/weapons.mjs` の `WeaponRunner.prototype._splatling` および `reset`。
  - 修正前差分:
    - 人型: 新規 ZR 押下フレームにおいて直ちに `charging === true` かつ `chargeT === 1/60` となり、1F の起動前隙が抜け落ちていた（0F startup、1フレーム早くチャージ進行）。
    - イカ: 汎用 `PLAYER.emergeDelay (0.07s)` の 5 フレーム経過後（tick 6）、`_splatling` が直ちに `chargeT === 1/60` を加算しており、6F 起動前隙が完了する前にチャージ進行が始まっていた（1フレーム早くチャージ進行）。
  - 修正内容:
    - `WeaponRunner.prototype._splatling` にて、イカ潜伏からの浮上時（`s3SplatlingEmerging`）に 6F（0.10s）の起動前隙を管理し、tick 1〜6 の間 `chargeT === 0` および `charging === false` を保持。tick 7 よりチャージ進行を開始。
    - 安定人型姿勢からの新規 ZR 入力時、1F（1/60s）の起動前隙を管理し、初フレームでは `chargeT === 0` および `charging === false` を保持。翌フレームよりチャージ進行を開始。
    - チャージ進行中の継続入力や再チャージ経路では余計な起動前隙を挟まない。
    - グローバルな `PLAYER.emergeDelay` や連射速度（4F）、弾丸弾道、インク消費量、中断復旧（#679/#686）には手を加えない。
- プレイへの影響:
  - バレルスピナーのバレル回転開始（`spinW` / parts.barrels rotation）、構え姿勢（`_poseWeapon`）、HUD レティクルのチャージ表示が本家 S3 の入力タイミングと正しく一致。
  - チャージ開始が 1 フレーム先行していた不整合が解消され、人型・イカ発進の双方で第1段階 48F / フルチャージ 72F のマイルストーンが入力基点から忠実に同期。
- 確認状態:
  - **ロジック確認済み**: `patches/splatoon3/tests/splatling-startup-phases.test.mjs` にて、人型 1F 起動前隙（tick 1: chargeT=0, tick 2: chargeT=1/60, tick 49: 48F first circle, tick 73: 72F full charge）、イカ 6F 起動前隙（tick 1〜6: chargeT=0, tick 7: chargeT=1/60）、連続チャージの隙間なし、FixedClock 30/60/120Hz の同一 tick 進行を確認。
  - **本家実機（Switch Ver.11.3.0）での実機計測比較は未確認**: 本検証表の数値（ヒト 1F / イカ 6F）に基づくロジック同期であり、実機キャプチャとのフレーム単位の直接照合は未確定。


## 2026-10-06 Splattershot wall-drop ink — #385

本家（スプラトゥーン3）の根拠: 固定済みの S3 11.3.0 データミラー `patches/splatoon3/profile.json` の `weaponsFidelityCompletion.weapons.shooter`（`sourceCommit` `7280ff9cde8bb1c5dcef46c700c326471584d2e6`）が `spl__BulletWallDropMoveParam` と `spl__BulletWallDropCollisionPaintParam` を保持している。値は初期間 20-40F @ 0.06、第2期間 10F @ 0.06、最終期間 15-35F、塗装 shock 1.56 / fall 0.65 / ground 0.6。任天堂の公式資料は壁落ちのフレーム値を直接公開していないため、これらの値はデータミラー由来であり Switch/iOS 実機での一致は未確認のまま扱う。曲線や補間値は追加で導入していない。

INKWAVE の実装箇所: `patches/splatoon3/runtime/weapons-fidelity.mjs` の `wallDropSource()` のファミリー許可のみ。`patches/splatoon3/weapons-adapter.mjs` は全壁接触で既に `beginFidelityWallDrop` を呼んでいたため、Shooter がソース記録を取り出せないことが根源だった。既存の 벽接触経路・落下ライフサイクルはそのまま再利用し、Blaster/Splatling/Roller/charger の値とタイミング、他のブキの射程・ダメージ・移動・当たり判定、通信プロトコルはいずれも変更していない。

再現操作: Splattershot で壁に撃つ。接触フレームで `p.fidelityWallDrop` が生成され、接触点に shock 半径 1.56 の塗装が1回、落下中に 0.65、接地または終了時に 0.6 が塗られる。床・非壁への接触は従来どおり1回のネイティブ終端インパクトのまま。床のように法線yが0.55以上の接触は共通判定で既に拒否されるため、許可の取り違えは起こらない。

プレイへの影響: Splattershot の壁際塗りが壁落ち用地磚になり、既存の確認済み3ファミリーと同じ塗り形状・順序になる。Proj TTL を超えるため ghosts には既存の catch-up バジェット拡張が効く。Rollers/Blasters/Splatlings の既存挙動と、Shooter の床・敵への命中は不変。

確認状態: native の単体テストのみ（実 OBB 壁・床と実 `Physics`、30/60/120Hz を含む）。ブラウザの実動作、実機（Switch/iOS）との比較は未実施で、CI ブラウザ受理は統合バッチの担当。`scripts/check-inkwave-weapons-fidelity.mjs` の 3ファミリー壁落ち検証は built site を要求するため未実行であり、Shooter のケースは追加していない。


## 2026-10-06: ブラスター着弾爆風の1フレーム遅延（#729）

本家のスプラトゥーン3 Ver.11.3.0 では、着弾で爆発する攻撃の爆風は着弾の1フレーム後に解決される（着弾 tick N → 爆風 tick N+1。用語集の対戦関連用語「着弾時に爆発する攻撃は着弾から1フレーム後に爆発」）。公開版 INKWAVE は `src/game/weapons.js` の `_step` が世界との衝突で `_impact()` を同じ更新のまま即時呼び出し、その中の `_blastBurst()` が同じ固定tickで放射判定・ダメージ・爆発FXを解決していたため、地形着弾の爆風が1固定フレーム（60Hzで約16.667ms）早かった。

`patches/splatoon3/runtime/weapon-edgecases.mjs` で、`s3TerrainBurst` マーカー付きで上げられる爆風だけをキューに積み、`Projectiles.update` の先頭で次tickに解決するようにした。マーカーは `_impact` のラッパーとソース由来の壁落下遷移（`beginFidelityWallDrop`）の2か所だけが着弾中に立てるので、直撃・ボス・寿命による空中爆発は対象外で現在のtickのまま。爆風は連絡点（共有の物理スクラッチHit）のクローンと owner/team/武器/地形フラグのスナップショットで保持し、`_impact` の終了時にプールへ戻る弾の再利用やリセットを受け付けない。壁落下の遷移そのもの（接地点・絵の具・状態遷移）はtick Nで行い、爆風だけがN+1で解決する。また、`Projectiles.clear()` をラップして `s3BlastQueue` を未解決のまま破棄することで、試合境界（リマッチ・練習場リセット・破棄）をまたいで古い Actor 参照や前の試合の爆風ダメージ・塗りが持ち越されないようにした（試合中の相討ち・発射後死亡セマンティクスは維持）。

変更しないもの: 直撃ダメージとその排除、ボスへの爆風、寿命による自然爆発（13Fの空中爆発を含む）、地形の半径・ダメージ補正（35/30/25の帯）、リモート幽霊の視覚爆発1回、ネットワークのプロトコル形状、練習場とアトラクトの隔離。

確認は `patches/splatoon3/tests/issue-729-blast-impact-delay.test.mjs`（原本の Projectiles を thinwall/地面ワールドで固定60Hzでステップし、着弾tickではダメージなし・R+1でちょうど1フレーム後にダメージと爆発FX、境界をまたぐ被弾者はN+1時点で評価、直撃と寿命爆発は従来通り同一tick、30/60/120Hzで固定tick順が不変、さらに `clear()` でキューが破棄され次tickで古い爆風・塗りが解決されず Actor 参照も保持されないこと、および直後の新規射撃が正しく次 tick N+1 で爆発することを確認。新規6件）と、既存 `weapon-edgecases.test.mjs`（地形ダメージの数値は不変、フラッシュ位置だけ更新。新規6件と合わせて22/22）、構成後194ファイルの構文ゲート、`check-inkwave-patches.mjs --quick`（upstream compatible）。

未確認: 1フレーム遅延は公式資料・用語集のルールに基づくもので、実機のフレーム計測ではない。壁落下を含む経路ごとの実機での爆発時刻、ブラウザでの実音・実弾確認は未実施。壁落下経由の爆風も同じN+1則で処理するが、壁落下自体の挙動は #597 の範囲として数値を変えていない。

### Live Turf lead / Danger (#99, duplicate #748)

The quality adapter now supplies read-only physical-team lead/danger flags from total-stage coverage, preserves native Bravo HUD ordering and clears state below a 10-percentage-point gap or outside live Turf. Per-player status remains independent. Source/minified/emitted each pass 13 focused checks (including two verifier-negative checks); the prepared existing active-game probe covers both viewers, two viewport widths and controlled finish/Range suppression. Browser PNG/computed-style acceptance remains pending the consolidated CI. The 1.08 icon emphasis is a local layout value, not an exact Splatoon measurement. Full scope and reference caveats: `inkwave-live-turf-lead-99-748.md`.

## 2026-10-05 final-minute BGM timing: #742

Main now requests the existing zero-fade/no-bar-wait path only for the non-Boss one-minute event. Normal1.2-second transitions remain unchanged. Actual MusicEngine/Player tests at8bar phases show request+60ms incoming start, with existing30ms gain fade and50ms outgoing scheduling stop; native Match/FixedClock controls pass at30/60/90/120Hz. Source/minified/actual emitted9 each pass. This is scheduling-state evidence, not physical audio/Switch or multiplayer network latency measurement. [Details and limits](inkwave-final-minute-music-742.md).


## 2026-10-06 — #726 / #737 Charger action start delays

実装ベース: dedicated branch の `a3993f37a00cc2f0a7b01d954591b98fb6ae97e3`。作業時の `origin/main` は `3d8a48d37ea5d6206e4f4185fa4a8229ae1c6977`。両 Issue とも同じ S3 コミュニティ検証表の「前隙／後隙」行を根拠とする独立タイマーとして、`patches/splatoon3/runtime/` 内で1つのコミットにまとめた。

### #726 ヒト起動 1F（fresh humanoid startup）

| 項目 | 内容 |
| --- | --- |
| 本家の根拠 | [S3メインウェポン前隙・後隙の検証表](https://wikiwiki.jp/splatoon3mix/%E6%A4%9C%E8%A8%BC/%E3%83%A1%E3%82%A4%E3%83%B3%E3%82%A6%E3%82%A7%E3%83%9D%E3%83%B3/%E5%89%8D%E9%9A%99%E3%83%BB%E5%BE%8C%E9%9A%99)（表見出し v10.0.1、2026-10-06 再閲覧）。Splat Charger (FC): ヒト前隙 1F／イカ前隙 6F／充填 60F／最初の発射隙 1F／チャージ中断後のインク回復 19F。表が対象にしたゲームパッチ版は不明。コミュニティ検証値であり Switch 実機の再計測ではない |
| INKWAVE の実装箇所 | `patches/splatoon3/runtime/weapons.mjs` の `WeaponRunner.prototype._charger` に前隙状態を追加（`s3ChargerStartupT` = 1/60、`s3ChargerHeldGate`、`s3ChargerRepeat`、`reset` で消去）。安定ヒト状態の新規 ZR edge はその1 tick で `charging`/`chargeT` を進めず、次の tick で `charging` 入りと `chargeT=1/60`。フルは edge から 1F+60F=61 tick 目 |
| 再現操作 | ヒト状態で ZR を押す→1 tick 目は charging false / chargeT 0、2 tick 目で charging true / chargeT=1/60、61 tick 目でフル。起動中に離すと射撃なし。射撃後の再チャージは前隙なし（repeat 式）。イカから浮上時に ZR を保持した開始は emerging gate 開き tick で即 charge（前隙を挟まない＝#566 の独立性を維持） |
| プレイへの影響 | フルチャージまでの入力起点が edge から 61 tick（従来 60）。射撃中速度 1.2 の適用は charging 入り（tick 2）から。チャージ音・表示・弾速/威力/塗りのエンドポイントと chargeTime 60F は不変。1F=16.667ms |
| 確認状態 | 固定 60Hz の native WeaponRunner テストで edge境界・60F・入力順・30/60/120Hz 等価を確認（`issue-726-charger-startup.test.mjs`）。前隙中の移動速度（run のままと解釈）と前隙中の解放（射撃なし）は本家実機未計測の派生挙動として未確認。#304 の 8F 最小、#680 の解放 gap、#290 の連射周期は未変更の別 Issue |

### #737 チャージ中断 → インク回復 19F

| 項目 | 内容 |
| --- | --- |
| 本家の根拠 | [S3メインウェポン前隙・後隙の検証表](https://wikiwiki.jp/splatoon3mix/%E6%A4%9C%E8%A8%BC/%E3%83%A1%E3%82%A4%E3%83%B3%E3%82%A6%E3%82%A7%E3%83%9D%E3%83%B3/%E5%89%8D%E9%9A%99%E3%83%BB%E5%BE%8C%E9%9A%99)の Splat Charger 中断回復: サブ 5F／イカ 6F／**インク回復 19F**。コミュニティ検証表であり Switch 実機の再計測ではない |
| INKWAVE の実装箇所 | `patches/splatoon3/runtime/resources.mjs` の `updateResources` に `a.s3.chargerInterruptRecover` を追加。resource pass は `_charger` が `charging` を消す前に走るため、中断 tick 自身を検出でロック（`charging && form==='squid' && kind==='charger' && charge < .999`）。`canRefill` では現在のブキが Charger の間だけ残量 0 を要求し、cancel tick +19F で解除。`patches/splatoon3/runtime/gear.mjs` の `Actor.reset` で消去 |
| 再現操作 | 自インクのヒトで部分チャージ→ZL（ newer edge）で変身・チャージ解除→cancel tick の resource pass で ink 増減なし、以降 19 固定 tick 非回復、20 tick 目（cancel+19F）で泳ぎ回復が再開。フル保持（`s3Stored`）と通常の射撃後回復は経路なし |
| プレイへの影響 | 部分チャージの peek/cancel を連打した際のインク回復が最大 19F ≒ 316.7ms 遅れる（泳ぎ回復 33.33/s で約 10.56 相当）。#416 の 6F 変身復帰・通常の射撃後 `inkRecoverStop`・ドライ/敵インクの無回復は独立 |
| 確認状態 | `issue-737-charger-cancel-refill.test.mjs` で 19F 境界・入力順・保持/射撃経路なし・ドライ/敵インク・別ブキへのタイマー非干渉・life reset・30/60/120Hz 等価を確認。中断→再押下の前隙要否、実機のインクゲージ境界は未計測。ネットワークは共有 sim 経路のみ（専用再検証なし）、ブラウザ統合 acceptance は parent バッチ待ち |

両 Issue とも Open/Draft の全 PR diff（PR536=#566 イカ起動、PR788/751=#304 最小解放、PR761=#680 R+1 解放・#679 スプラトリング中断、PR701=#416 変身復帰、PR784/668/755=cooldown ラッパ、PR758=射撃後スイム）と重複しないことを確認して実装した。PR536 の `stable human begins on first update` は 0F ヒト起動を固定するため本修正と矛盾し、統合時に親が同テストの調整を行う必要がある。


## 2026-10-06 — #708 Super Jump initial-form startup (21F humanoid penalty)

Delta on main `3d8a48d3` (PR #766). The [Splatoon 3 main-weapon verification table](https://wikiwiki.jp/splatoon3mix/%E6%A4%9C%E8%A8%BC/%E3%82%AE%E3%82%A2%E3%83%91%E3%83%AF%E3%83%BC), checked 2026-10-06, measures the start of a 0 AP Super Jump as an initial-form term in front of the charge wait and the flight: **X = 1F when the destination is confirmed while already in swim form, X = 22F when it is confirmed in humanoid form**, with a 0 AP charge wait of 80F and a flight of 138F. That is 219F from swim form and 240F from humanoid form, a **21F (~0.35s)** difference. Nintendo does not publish the frame value; this is a community measurement and is recorded as such in `calibration.unverified`.

### 本家 の根拠

Super Jump starts are form-dependent in Splatoon 3: confirming the destination while already swimming is materially faster than confirming it from humanoid form, and the humanoid path carries an extra pre-charge transformation cost that is separate from the Quick Super Jump-scaled charge and flight terms.

### INKWAVE の実装箇所

`Actor.superJump()` wrote `this.superJumpState = { phase: 'charge', ... }` and then forced `this.form = 'squid'` without recording the admission form, and `prepareSuperJump()` forces `a.form = 'squid'` on every charge tick. The S3 gate injected by `patches/splatoon3/adapter.mjs` was `if (supported && s.t + 1e-10 >= this.s3.jumpChargeTime)`, so both admission forms entered the identical 80F path and the humanoid-start penalty did not exist at all.

The admission form is now captured as `startForm` on the jump state before it is forced, `patches/splatoon3/runtime/superjump.mjs` exports `superJumpStartupTime(a)`, and the gate became `this.s3.jumpChargeTime + superJumpStartupTime(this)`. The two frame values are profile terms `superJump.startupSwimF` (1) and `superJump.startupHumanoidF` (22), installed actor-locally by `runtime/gear.mjs` next to the existing `jumpChargeTime`/`jumpFlightTime`. Quick Super Jump scaling still touches only charge and flight; the initial-form term is form-dependent, not equipment-dependent.

### 再現操作と結果

Native owned regression `patches/splatoon3/tests/superjump-startup-form.test.mjs`, 7/7 on the composed source: 0 AP launch is 81F from swim form and 102F from humanoid form (difference exactly 21F); confirmation-to-landing totals are 219F and 240F; every added humanoid startup frame is still vulnerable to weapons and flight-only authority still begins at launch; ally-targeted, spawn-return and remote-peer jumps each get exactly one form-dependent term; 30/60/120Hz reach flight within one step of the same 1.35s / 1.70s wall-clock target.

Re-equipping the same Actor with Quick Super Jump mains lowers `jumpChargeTime` and `jumpFlightTime` while `jumpStartupSwimF`/`jumpStartupHumanoidF` stay at 1/22, so the new term is form-dependent and not equipment-dependent. Reverting only the production files to `3d8a48d3` fails all 7 (swim launched at 80F, total 218F, `startForm` undefined). Two mutations were also checked: dropping the startup term from the gate fails 5/7, and capturing the form after the forced squid fails 6/7.

### プレイへの影響

A Super Jump confirmed from humanoid form is now ~0.35s slower than the same jump confirmed from swim form, so the decision to enter swim form before jumping is real again, and an opponent has the added window to finish a splat during a humanoid start. This is a timing correction only: charge vulnerability, committed destinations, flight-only invulnerability, pre-landing main-weapon actions and online authority are unchanged, and the 60F-relative charge/flight calibration was not retuned.

### 確認状態

**未確認（実機）** — the 1F/22F initial-form term has not been measured on hardware against Ver. 11.3.0; the numbers come from a published community measurement. **未確認（描画）** — during the added startup frames the actor is still rendered through the normal squid charge presentation, so the S3 human-to-squid transformation animation itself is not reproduced here; only its duration is. Deterministic VM fixtures, not a device or browser-render comparison.


## 2026-10-06 — #780 visible blur cannot regain gamepad authority

Base main `a3993f37a00cc2f0a7b01d954591b98fb6ae97e3`. The actual Input/PlayerController and PlatformGame/Lifecycle connection reproduced the Issue: visible blur, one neutral poll, then fresh stick and button input produced yaw -0.031207394862975805, pitch -0.013003081192906586, movement magnitude 0.8148148148148149, all five action intents true and lastDevice=pad while focused=false and lifecycle state=ACTIVE. This is a browser input-authority correction, not a change to Splatoon numerical tuning or a console-fidelity claim.

InputPlatform now reads the existing page focus owner before polling. A new blur generation retires pending controller edges through the existing pad epoch. Polling cannot expose gameplay/menu pad state while unfocused. On focus return, the first available device goes through the existing direct-takeover owner, preserving consumed-stick neutral gates and canonical trigger thresholds; held buttons need physical release. It does not add a lifecycle subscriber/listener, broad simulation pause, permission request, sensor setting change or a second device-ownership mechanism. A no-pad interval preserves the pending rebase until a device is observable.

Dedicated actual-module source tests 7/7 passed, with 30/60/120Hz schedules, whole blurred intervals, focus held/fresh boundaries, blur/focus between polls, render-pending special, analog triggers, direct replacement, absent pads and twenty lifecycle cycles. Adjacent input/pause/pad/clock/gyro tests passed 65/65. Authentic build `1ebf9cb1ac2037278d1116594dc0c359e58a90d5b9dc7e6b590f4c0028f16f22` passed. Actual emitted input/platform modules passed three 30/60/120Hz focus cases plus the existing combined policy boundary case (4/4). Independent review also passed four first-poll/held-return/keyboard-mouse/epoch cases. Physical browser focus dispatch and real Bluetooth/USB controllers remain unmeasured.

Main advanced to `3d8a48d37ea5d6206e4f4185fa4a8229ae1c6977` during completion; its only new files are the separate Bomb contact fuse adapter/test/report (#723), with no overlap here. This local delta is held for a combined next batch; no individual source PR or CI run is started.

## ScreenFX pending-damage reset — #772

Reset now clears the pending damage attacker and angle together with the cancelled timer. This closes the pause→quit retainer without altering the n

## 2026-10-06 — #678 gyro axis mapping: World Orientation, not player space

Base: main `67fec182b3e82e2e4473dfb08e47c6fe3c2c016b`, branch `inkwave/c-add100-fb6-r9`. Claim already held by lane C; continuation comment issuecomment-6008915912 was posted before any edit. This entry supersedes the earlier round-7 note on this Issue, which recorded a **partial** result.

**S3 basis.** Splatoon 3's motion aim is documented as a **World Orientation** mapping: camera yaw is the component of device angular velocity aligned with real-world vertical, and pitch is derived relative to the world-horizontal plane rather than preserving local device pitch at every roll angle. References checked 2026-10-06: Damian's Splatoon-Motion-Controls-Explained (identifies Splatoon's implementation as World Orientation, and distinguishes Y-camera reset from calibration) and Jibb Smart's Player Space Gyro (and Alternatives) Explained (documents player space as a deliberately *different* construction, citing Splatoon 2 for world space). Authoritative acceptance baseline Splatoon 3 Ver. 11.3.0, released 2026-08-19/20. **Nintendo's filter constants, gravity-estimator coefficients and behaviour at singular orientations are not public and are not asserted here.**

**Previous partial, honestly recorded.** Round 7 (`b4daa0b`) restored only the missing `gx*px` term in the yaw projection. That alone does **not** fix this Issue: `gyro.js:211` still carried the player-space `1.41` magnitude relax capped by `hypot(py, pz)`, and `gyro.js:212` still carried `pitch = px`. Those two defects were the ones the Issue names, so that round's acceptance was **partial**, not complete. The partial source is withheld from C18 and is archived as failed-acceptance evidence at `evidence/additional-100/history/fb6/completed-before-r9-690af334ec264442a1ca6000677e6f23/`, not relabelled as never having existed.

**INKWAVE implementation.** One fail-closed `replaceOnce` in `patches/local-quality/adapter.mjs` for `rel === 'src/core/gyro.js'`, replacing the whole player-space block:
- `yaw` = the complete projection of screen-space ω onto world vertical: `-(px*ux + py*uy + pz*uz)` with `u` the unit earth-down in screen space. The `gx*px` term is retained because it falls out of the correct complete projection, not as a cherry-picked partial. The `1.41` relax, the `hypot(py, pz)` cap and `yawAxes` are removed.
- `pitch` = ω projected onto the world-horizontal axis obtained by removing gravity from the device pitch axis (screen-right), i.e. `e_x − (e_x·u)u` normalised. This is exactly `px` while gravity is perpendicular to screen-right (flat, and upright portrait) and reduces/mixes correctly as the device banks.
- **Singular band, documented uncertainty.** When gravity lies along screen-right the screen plane is vertical, the device pitch axis has no world-horizontal component, and gravity alone cannot define the camera pitch axis. A deterministic documented fallback (screen-up with gravity removed) is used. Splatoon 3 publishes nothing here, so this band is explicitly **UNQUANTIFIED** and is not a Nintendo constant.

Axis/sign conventions verified for normal, banked (45°/70°), pitched+rolled, portrait and landscape, and screen rotations 0/90/180/270. Both DeviceOrientation and validated DeviceMotion `rotationRate` already funnel through this single `_sample` with the same `_down`, so fallback consistency is structural and is asserted through the real `_motion` handler rather than by assumption.

**Gameplay impact.** Aiming only, and only for touch/mobile gyro. Movement, collision, damage, weapon timings and ink are untouched. Sensitivity (`sens`, `gyroTurnDeg`, `_gain`, the measured −5…+5 curve), inversion `invX`/`invY`, every smoothing and filter coefficient (`sp < 0.8` tightening, the 3/7 `direct` ramp, the 0.06 s `k`), `_calibrate`/`_rrScale` and the resync/dropout/bias lifecycle are byte-identical: the source from the smoothing tier onward is asserted byte-equal to the published file. `resync()` semantics (forget attitude, clear smoothing, leave the pending delta to `discard()`) are asserted unchanged rather than "fixed".

**Confirmation status.** 12 owned native tests in `patches/local-quality/tests/gyro-world-orientation.test.mjs`, exit 0, driving the real shipped `Gyro` with independent quaternion ground truth: poses are W3C Euler triples, a world-frame ω is pushed into the device frame as `Rᵀ·W`, and device-frame earth-down is `Rᵀ·(0,0,-1)`. The suite asserts physical identities rather than restating the formula — a rotation purely about world vertical gives `yaw = +Ω, pitch = 0` at every attitude; a rotation purely about world horizontal gives `yaw = 0` **exactly**; device roll about the gravity axis gives no camera motion; flat/upright keep the local pitch while banking reduces it; 0/90/180/270 screen rotations are invariant; the two sensor sources map identically; 30/60/120 Hz integration is cadence-independent. Baseline-negative control: reverting only `patches/local-quality/adapter.mjs` and keeping the tests makes **8 of 12 fail (exit 1)**; the 4 that survive are exactly the invariants that hold before and after (upright device roll, a gravity-orthogonal vector whose omitted `gx` term is irrelevant, cadence independence, and the negative control itself). The narrow `patches/reliability/tests/gyro.test.mjs` contract — including `permission overlay leaves sensitivity and sensor processing byte-identical with equal numeric output`, which a previous attempt in this lane broke by putting the change in the wrong adapter — passes 20/20, exit 0. `scripts/check-inkwave-patches.mjs --quick` exit 0, reference 11.3.0. `inkwave-public/` byte-locked: `core/gyro.js` = `c1b17e3e62cffd86ab81f4f96002c67ad719348a` in both worktree and HEAD.

**Not confirmed.** No Nintendo console capture, no phone/tablet and no browser run: this is VM logic with synthetic orientation vectors, not a physical Splatoon 3 comparison. The singular-gravity band is a documented deterministic convention, not a measured Nintendo behaviour. The world-horizontal camera pitch axis is anchored to screen-right by continuity (so flat behaviour is unchanged); whether Splatoon 3 anchors it identically is unverified. Per the round-9 instruction, no whole quality/Range/loading suite, full build, startup or browser run was repeated — combined acceptance and CI belong to the integration batch.ative60ms burst, direction or paused visual clock. Source/minified9 each pass, including an isolated Node forced-GC baseline/fix comparison; physical full-game heap/GPU measurements are not claimed. See [scope and evidence](inkwave-screenfx-damage-reset-772.md).

## Wall Squid Roll lateral heading — #767

Base: `67fec182`. Reference: Splatoon 3 Ver. 11.3.0, plus the public wall-kick guides the issue cites for directional adjustment ("flick the stick in the direction you want to jump off"). The frame numbers, speeds and the admission threshold are unchanged by this entry; none of them is re-sourced here.

**Root.** `patches/splatoon3/runtime/movement.mjs` launched an admitted wall Squid Roll with `const direction = wallRoll ? a.wallN : a.intent.move`. Admission is a real cone — `dot(intent.move, wallN) >= cfg.wallRollMinimumInput` — so the stick angle was already being evaluated and then discarded at launch: `launch()` normalises whatever direction it is given, and it was handed the wall normal. Every admitted stick angle therefore produced one identical heading. That is the reported "within the legal outward 45° cone the lateral heading is lost", reproduced natively: a stick held 20° and one held 35° off the normal both launched at 0°.

**Correction.** The launch direction is `a.intent.move`, the same vector the own-ink roll path already used. Nothing else moves: admission still tests the same dot product against the same `cfg.wallRollMinimumInput`, speed still comes from `rollLaunchSpeed(...)` over the pre-brake velocity, the vertical term is still `cfg.roll.jumpVelocity`, and `state.chain`, `state.roll` and `state.surge` are untouched. No curve, blend weight or new profile value was introduced, so nothing here is an invented S3 quantity.

**Verified.** Owned suite 4/4 over the real composed modules: 0°, 20° and 40° sticks launch at 0°, 20° and 40°, and the three headings are distinct, which is precisely what the pinned normal made impossible; the lateral component keeps its sign on both halves of the cone; admission, launch speed, vertical component, chain increment, armour window and action duration are identical between a normal-aligned and a 40° launch; a stick facing into the wall and a stick short of the threshold are both still refused; the own-ink roll path and a held-wall non-jump frame are unchanged. Reverting the runtime to `67fec182` with the tests kept turns the two heading tests red with `a 20 degree stick must launch at 20 degrees, got 0` and `expected a 35 degree heading, got 0`, exit 1, while the two preservation tests stay green, so they assert invariants rather than restating the fix. `wall-motion.test.mjs` 9/9 and `--quick` exit 0. VM tests over the real composed modules; no browser session, build, CI, Switch or device comparison.

**Unconfirmed.** The issue's own admission cone is 45°, but `cfg.wallRollMinimumInput` is 0.3, i.e. a much wider cone. That threshold was deliberately left alone because the acceptance criteria for this root cover the heading only; reconciling the admission angle against a source is a separate, unsourced question and is not claimed here. Whether S3 clamps, biases or passes the stick angle through unchanged is likewise not measured on hardware.

## 2026-10-06 S3 ShotGuideFrame reticle guide: #769 / #459

### 参照値（本家 Splatoon 3 Ver. 11.3.0）

- 参照：`Leanny/splat3` 固定コミット `7280ff9cde8bb1c5dcef46c700c326471584d2e6` の 11.3.0 パラメータテーブル。`WeaponSpinnerStandard` に `ShotGuideFrame = 11`、`WeaponShooterNormal` に `ShotGuideFrame = 8`。
- ブキと状態：Splattershot は shooters `| 直進 4F → brake → free`、`ShotGuideFrame = 8`。Heavy Splatling は spinners、チャージ依存の初速（最小 1.05 u/f、ファーストサークル以上で 2.10 u/f）、直進 8F、`ShotGuideFrame = 11`。
- 参照ページ：<https://wikiwiki.jp/splatoon3mix/検証/パラメータ情報/メイン>（`ShotGuideFrame` の意味）、<https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/>（Ver. 11.3.0）。
- 未確定：本家の native な初速補間・ランダム速度バイアス分布、画面外ガイドのクランプ幅、ガイドの点滅表現は公開されていない。確定扱いにしていない。

### INKWAVE の実装箇所（main `c9b1c022`）

- `patches/splatoon3/profile.json`：`weaponsFidelityCompletion.weapons.{shooter,splatling}.WeaponParam.ShotGuideFrame` には 8 / 11 が既にミラーされていたが、live `weapons.*` に昇格されておらず、`shotGuideFrame` を持つ経路がなかった。
- `inkwave-public/src/game/player.js::computeAim()`：camera 中心 ray から `aimPoint` を作るだけで、projectile state の guide 計算は無い。
- `inkwave-public/src/main.js::_updateHud()`：`crosshair` は `spread` / `onTarget` / `inRange` のみ。
- `inkwave-public/src/ui/hud.js::_updCrosshair()`：charge / spread class の表示のみで、projectile state の画面投影なし。
- 差分：reticle が汎用 screen-center anchor に固定され、projectile model と guide が乖離していた。

### 修正

- `patches/splatoon3/runtime/shot-guide.mjs`（新規）。live `shotGuideFrame` は pinned mirror の値と一致しなければ install 時に fail closed。guide は installed muzzle（`_muzzle`）・installed launch direction（`_aimFrom`）・installed launch speed（`splatlingLaunchSpeed`）・installed projectile motion（`advanceFidelityProjectile` + `fidelityMoveFor`）を使い、ちょうど `ShotGuideFrame` 回の固定 1/60 ステップを計算する pure dry prediction。`_spread` と `SpawnSpeedRandomRate` のランダム項は読まない。第2の projectile engine、PRNG 消費なし。
- 接続は build-time adapter のみ（`patches/splatoon3/adapter.mjs`）。`inkwave-public/` は未変更で、`upstream-lock.json` の hash も動いていない。
- 権威側の camera aim / `aimPoint` / `onTarget` / `inRange` / launch 方向 / damage / trajectory / RNG は無変更。guide は HUD 表示専用で、projectile を画面中心へ寄せない。
- 本 pair が追加する predictor は shooter と splatling のみ。dualies（pinned 7）は未昇格。最新 main #820 の blaster は live 13F の既存 per-family guide を維持し、Bucket も既存 guide を使う。projected guide がない時は inline translate を解除して既存 --gx/--gy の CSS に戻す。

### 検証（所有 suite: `patches/splatoon3/tests/shot-guide-frame.test.mjs`, 18 tests）

- Splattershot の guide が、実 launch した round を 8F 進めた位置と 1e-9 以内で一致（muzzle から `endSpeed` brake までの実 phase を含む）。
- Heavy Splatling の guide が、同様に実 round を 11F 進めた位置と一致。
- minimum charge と first-circle で guide が分離し、分離量が pinned の 1.05/2.10 u/f endpoint から導かれる値と一致。ファーストサークル以上は既存の saturate law に従い同一 guide。
- age サンプリングで直進 4F（等速）→ 5F 目から brake/gravity への遷移と、重力による低下を guide 自体で確認。
- RNG を 0 / 0.25 / 0.5 / 0.999999 に変えても guide point は同一。`Math.random` を throw に置き換えても guide 計算は完了する（0 draw）。
- camera 投影：中心・左右・上下・カメラ後方・画面外をすべて viewport 内に収める（re-entry）。カメラ姿勢を変えても guide の world point は不変、screen 位置のみ変化。
- owner/remote 分離：local と remote の owner は互いの weapon / charge / flight round を参照せず、独立の guide を維持（controller 状態の局所化）。
- HUD サブピクセル更新抑制：0.05px 以下の微小ジッターでは毎フレームの DOM style 再代入を行わない。
- 30/60/120 Hz の render clock で同一 tick 数・同一 guide 列。pad / mouse / touch / gyro は同じ guide path。
- weapon switch で guide が消え、中央へ戻る re-entry。
- adapter 3 接続は anchor 重複・欠落で fail closed。
- mutation gate 8 系統（frame オフバイワン、RNG 消費、guide 無しでも reticle が動く、pinned 照合無効、y clamp の width 誤用、launch 方向の独自化、charge 無視、straight phase 無視）はすべて検出。1 系統（direction の等価書き換え）は同値 mutant のため別系統に置き換え。

### 影響と残す未確認

- 射撃判定・ダメージ・弾速は不変。#508 の charge gauge、#560 の HUD spread、#594 の idle reticle、#94 の near-cover obstruction、#413 の magnetism、#198 の outer-reticle、#98 の jump-spread、#280 の effective range はいずれも独立に検証可能なまま。
- ブラウザ実動作での目視確認と、本家実機との比較はこの実行では行っていない（この環境に Chrome がない）。screen clamp の 40px は既存の ally marker と同じ INKWAVE 側の値で、本家の画面ピクセル値ではない。
- `#560` の spread は guide の周囲に重なるため、guide が動くと spread ring も一緒に動く。これは reference の「gauge と spread を guide 周りに重ねる」指示に沿う。

### C21: shot-guide の startup integration 補修と stale HUD の実証

- 起動時の core preload request 上限（`scripts/check-inkwave-startup-budget.mjs` の core preload 131 件）が、独立モジュール `patches/splatoon3/runtime/shot-guide.mjs` を 1 件追加したことでのみ超過していた（`evidence/add100-b21-final-startup.log`）。上限の引き上げや、preload graph から必須の静的 import を外すことはしていない。
- 対処: shot-guide の helper を、既に core preload graph にある `patches/splatoon3/runtime/weapons-fidelity.mjs` へそのまま移設し、専用モジュールを削除した。guide は全 helper が既存の projectile motion law（`advanceFidelityProjectile` / `fidelityMoveFor` / `splatlingLaunchSpeed`）の純粋な関数なので、追加の物理エンジンは無い。install 順への依存を避けるため内部 api 参照は `api` と別の `guideApi` とした（`installShotGuide` は `installWeaponsFidelity` の前後どちらでも成立する）。
- 移設で変えたのは配置と 3 箇所の import path（`src/game/player.js` / `src/main.js` / `src/ui/hud.js`）、`install.mjs` の import、test fixture の re-export、以及 8/11 の pinned 照合・0 RNG・owner 局所化・true aim・HUD のみの各性質はすべて据え置き。19 本の owned guide test が green。
- stale HUD は実在の不具合として確認した。`PlayerController.update()` は `!this.enabled` で先に return するため、`this.inRange` の直後に挿入した `updateShotGuide(this)` に到達せず、`controller.shotGuide` に最終有効値が残る。一方 HUD 投影は `m.controller?.shotGuide` を無条件に読んでいたため、controller 無効中（`main.js:783` の spectate 遷移など）に古い guide を描画し得た。
- 対処は投影箇所の表示のみに限定: `guide: projectShotGuide(m.controller?.enabled && m.controller?.a?.alive ? m.controller.shotGuide : null, cam, W, H)`。`updateShotGuide` 側も `a.alive === false` で-guide をクリアする。authoritative な `onTarget` / `inRange`、カメラ aim、`aimPoint`、射撃・ダメージ・軌道は変更していない。
- 検証: 適応後の main.js から実際の gate 式を拔き出して評価する negative control を追加。controller 無効時・actor 死亡時とも、最後の有効 guide state が保持されている（= 描画され得る）状態でも投影が null を返し、reticle が中央 anchor へ戻ることを確認。guide module を直接 import する static edge は repo 内に残っていない。
Reset now clears the pending damage attacker and angle together with the cancelled timer. This closes the pause→quit retainer without altering the native60ms burst, direction or paused visual clock. Source/minified9 each pass, including an isolated Node forced-GC baseline/fix comparison; physical full-game heap/GPU measurements are not claimed. See [scope and evidence](inkwave-screenfx-damage-reset-772.md).

## 2026-10-06 — #624 アメフラシ投擲待機中の相手インク受動ダメージ欠落の解消

開始mainは `c9b1c022ad4dfa0ce437698e697952deca4d94cb`。公開対象は `inkwave-public/` と有効な `patches/splatoon3/` であり、旧 `game/` は対象外。

| 項目 | 内容 |
|---|---|
| 本家の根拠 | スプラトゥーン3 Ver.11.3.0 ([任天堂更新履歴](https://support.nintendo.com/jp/switch/software_support/av5ja/1130.html))。アメフラシ (Ink Storm) 発動中はアーマーを持たない脆弱状態（非無敵）であり、相手インクとの接触時は相手インク影響軽減ギアの仕様通り受動ダメージ（0 AP で毎秒 18 HP / 60Hz あたり 0.3 HP/tick）を受ける。 |
| INKWAVE の実装箇所 | `patches/splatoon3/adapter.mjs` の `src/game/actor.js` アダプタで、active-special branch は更新前に Storm ID を保持し、Storm かつ生存中だけ既存 `updateResources(this, dt)` を一度実行する。今回、`specialPressed && specialReady()` branch も `_startSpecial()` 後に `this.alive && this.specialActive?.id === 'storm'` の場合だけ同じ関数を一度実行するよう追加。通常更新は既存の一回の resource pass を維持し、Slam の発動・rise branch は対象外。 |
| 再現操作 | 0 AP 相手インク影響軽減、ゲージ満タン、敵インク上に接地して Storm を発動。修正前の active tick 修正では発動 tick の `specialPressed` 早期 return だけが残り、HP と `s3.enemyInkTime` がその一 tick 分止まっていた。修正後は発動・最初の active・最後の active・終了後最初の通常 tick を通じ、各 60 Hz simulation tick で一度だけ 0.3 HP と 1/60 秒を積算する。grace、damage cap、invulnerability gate は既存 `updateResources()` に委譲する。 |
| プレイへの影響 | Storm 発動操作による敵インク受動ダメージの一 tick 分の猶予を解消。Storm の armor=false、投擲・lock 時間・ゲージ挙動・通常武器被弾を維持し、Slam に HP 回復や ink refill を新たに与えない。水没判定 (#592) は独立。 |
| 確認状態 | **ロジック確認済み**（公開版 `Actor.update()` / `_startSpecial()` / `_updateSpecial()` と適用 adapter、既存 `updateResources()` を通る専用回帰 `patches/splatoon3/tests/storm-throwlock-resources.test.mjs` 8/8。ground probe / paint surface は fixture で固定し、60 Hz simulation の tick 列は 30/60/120 Hz render cadence で一致。**ブラウザ実動作と Switch Ver.11.3.0 実機の精密フレーム測定は未確認**）。 |

## 2026-10-06 — Enemy-ink ground and ordinary airborne acceleration (#773 / #562)

**Baseline:** public `inkwave-public/` at main `c9b1c022ad4dfa0ce437698e697952deca4d94cb`; reference Splatoon 3 Ver. 11.3.0, confirmed against [Nintendo's update history](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/). The public community verification page reports ordinary acceleration of 0.01 m/F² (0.1 DU/F²), independent of human/squid form, weapon weight and movement-speed AP; neutral release and reverse input use that same magnitude. It reports 0.02 m/F² while firing or during sub/special attack and ready states, including when squid, but does not separately measure airborne acceleration. The pinned 11.3.0 reverse-engineered [parameter data](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/misc/params.json) exposes opponent-ink movement-speed, jump and damage fields, not a distinct opponent-ink acceleration field; this supports retaining the base rate but does not establish transient Switch behavior. These are community / reverse-engineered references, not an official Nintendo parameter table or our Switch measurement. No conversion from those units to INKWAVE profile values is asserted. [Community acceleration reference](https://wikiwiki.jp/splatoon3mix/%E3%82%B7%E3%82%B9%E3%83%86%E3%83%A0%E8%A9%B3%E7%B4%B0%E4%BB%95%E6%A7%98#xb946c7b).

| Root | Splatoon 3 comparison and evidence | INKWAVE implementation and reproduction | Player effect and status |
|---|---|---|---|
| #773 — grounded on enemy ink | General community measurements support ordinary 1× and firing/sub/special attack or ready 2× acceleration/deceleration. The cited reverse-engineered data has opponent-ink speed/jump/damage fields and no separate acceleration field, but cannot establish transient behavior by itself. Exact Switch behavior on enemy ink remains unmeasured. | The installed movement adapter selected existing profile rates 36/72, then incorrectly clamped either rate to the legacy `enemyInkAccel: 30`. It now leaves the selected rate intact and retains the existing enemy-ink target-speed cap and actor gear selection. On a flat native `Level`/`Physics` floor, test Shooter at 0/3/10/57 Ink Resistance AP; humanoid/squid form; clean/enemy ink; normal, main fire, sub-ready, and special; full input, 0.1 micro input, release, reverse, and 90° turn. | Enemy ink no longer slows the acceleration ramp as a second effect on top of its selected target-speed limit. This matches the cited base-rate relationship as an evidence-based inference; enemy-ink acceleration parity with Switch remains **unverified**. Existing enemy target caps remain independently tested at 1.44 and 4.608 for 0 and 57 AP. |
| #562 — ordinary airborne acceleration and braking | The community source says ordinary acceleration is form-independent and release/reverse use the same magnitude, but does not identify an airborne-specific rate or establish whether its 2× action rule applies in air. Applying the ordinary rate to air is therefore an inference to be checked on hardware, not a direct airborne measurement. | The public actor config had `airAccel/airDecel = 20/4` and `squidAirAccel/squidAirDecel = 14/3`; the installed adapter had left the form split in place. The adapter now uses the existing humanoid `airAccel` calibration for ordinary input, release, and reverse in both forms, while preserving each form's target-speed calculation. No ground 2× rate is added to air. Native public Actor/Level/Physics checks use Shooter and Splatling, humanoid/squid, normal/main/sub-ready/special state, starts below target speed, release/reverse, and a 60 Hz fixed simulation under 30/60/120 Hz render schedules. | Humanoid and squid ordinary airborne velocity changes now share one rate and braking magnitude. The 2× airborne action rule remains deliberately **unconfirmed**; state tests ensure the grounded multiplier is not inferred for air. Switch airborne frame measurements remain **unverified**. |

The checks use the current INKWAVE profile's existing values and actual public `Actor`, installed collision integration, `Level`, `Physics`, and `NetMatch`; `PracticeRange` is not a distinct public mode in this source tree. Most movement steps use Shooter with 0 AP; the ground enemy-ink cases vary Ink Resistance across 0/3/10/57 AP, and the airborne weapon control adds Splatling. The local ground profile remains 36/72 (2:1), while airborne ordinary calibration remains 20; none is claimed to equal an SI/DU conversion. Owner movement receives one acceleration step, remote snapshots retain authoritative velocity without local re-acceleration, and actor-scoped speed modifiers restore after movement. FixedClock traces match at each 60 Hz gameplay tick for 30/60/120 Hz render schedules.

The C17 / #731 sub-ready enemy target-speed selector is a separate root and is not modified here: no change is made to `runtime/gear.mjs`, `intent.sub` speed selection, weapon-specific speed profiles, collision, ink distribution, or top-speed calibration. Focused local regression: `node --experimental-vm-modules --test patches/splatoon3/tests/movement-acceleration.test.mjs` — 3/3 passed. This is logic and local collision evidence only; no browser-session or Switch hardware comparison was run.


### #624 integration isolation correction

Parent native negative control found the initial all-special resource pass also enabled Slam rise HP/ink recovery (80→80.3667 HP, 50→50.1667 ink in one tick). Admission now captures Storm identity before `_updateSpecial`, preserving the last Storm tick when it clears its state and excluding every unrelated special phase. The real Actor regression pins unchanged Slam resources. Original source and failure probe are retained; this correction narrows scope without changing passive-damage constants.


The follow-up at current main `0aafab8127957a3211322a63f71364f718ddf492` found one remaining native `Actor.update()` exit: the activation tick calls `_startSpecial(); _finishFrame(dt); return;` before the active-state resource branch. The adapter now runs the same resource function once after activation only when the actor is alive and the resulting special is Storm. The focused trace covers activation, first and last active ticks, and the first ordinary tick after the lock at 30/60/120 Hz render cadence. The 18 HP/s rate, 40 HP cap, 0 AP grace, and resource implementation are unchanged; controller hardware timing remains unverified.

## 2026-10-06: reticle state / visible-vs-authoritative footprint (#711 #709 #757)

チャージャー HUD の射程内判定を、フルチャージ固定から現在のチャージ量に応じた飛行距離（`chargerReach`）へ変更し、ブラスターの拡散拡大を外周リングのみに限定した（内側リングは静止サイズ）。インクストームの塗り位置を、その tick の見た目の雨半径と同じ範囲から選ぶようにした（#757）。弾道・数値・半径は不変。いずれも**ロジックのみ確認**で、ブラウザの実表示と Switch 実機との比較は**未確認**。本家の根拠・実装箇所・再現操作・影響は[詳細](inkwave-reticle-state-2026-10-06.md)を参照。

## 2026-10-06 — Dualies wall-drop (#604) and composed-runtime guards

Base main `67fec182`. Splat Dualies wall impacts now enter the existing sourced wall-drop state using the pinned 11.3.0 top-level `WallDropMoveParam`/`WallDropCollisionPaintParam` (shock 1.3, fall 0.65, ground 0.6; 20–40F + 10F + 15–35F at 0.06). Previously the round died on the contact frame after one generic impact. Damage is unchanged. Shooter (#385) and Charger (#625/#268) are excluded: Shooter is owned elsewhere, and the Charger record omits three period fields. #770, #777, #638/#637, #644/#643 and #556 were already correct after adapter composition (the reports read raw source). They are now pinned by composed-runtime tests. This is logic-level and emitted-verifier evidence; a Switch visual/frame comparison is still 未確認. Details: [inkwave-wall-drop-dualies-guards-2026-10-06.md](inkwave-wall-drop-dualies-guards-2026-10-06.md).


## 2026-10-06 — #627 Slosher accepted volley admission

Base: main `3d8a48d37ea5d6206e4f4185fa4a8229ae1c6977`. The reference target is Splatoon 3 Ver. 11.3.0, Splat Bucket, neutral gear, 60 Hz. The pinned weapon source records the Slosher unit damage and release delays in [`weapons-fidelity-reference.json`](../patches/splatoon3/reference/weapons-fidelity-reference.json); no new hit timing or damage value was inferred here.

For #627, reproduce by letting an early glob contact a live player while `Actor.invuln > 0`, then let a later glob from that same throw contact after protection ends. The real INKWAVE Actor rejected the first damage call, but the installed projectile helper had already stored 70 in the shared group; the later vulnerable hit therefore had zero delta. The helper now commits the per-victim maximum only after accepted HP damage. For online victims the sender carries an optional volley identity to the victim owner, which applies and records the group there; rejected hits leave it available, accepted hits deduplicate later contacts, and pooled projectiles clear the identity. The native fixture verifies this state path and its gameplay effect. Exact Nintendo boundary timing and the same scenario on a Switch remain unmeasured, so hardware parity is unconfirmed.

The #627 follow-up checks a separate handoff case under the same reference conditions: old owner A sends an accepted Splat Bucket volley (NID 1, client counter 1) to victim owner C; A leaves, host B adopts the same Actor through `NetMatch.onLeave/_adopt`, and B emits its own counter-1 volley. The native `combatWorld` path confirms both clients emit `1:1`; the old accepted budget used to suppress B's otherwise valid 30 damage. The owner ledger now includes the Actor's current owner as well as NID and volley ID, keeps victim budgets in weak-key maps, and still deduplicates repeat hits from either owner. Protected-hit retry and native projectile-clear controls are included in the [focused #627 tests](../patches/splatoon3/tests/issue-627-slosher-volley-admission.test.mjs). This corrects INKWAVE's peer-owner handoff bookkeeping; the test does not establish that Splatoon 3 uses this ownership protocol or verify Switch behavior, so that comparison remains unconfirmed.

## 2026-10-06 — Splat Charger partial-damage curve (#506)

参照条件は Splatoon 3 Ver.11.3.0 の Splat Charger。ギアなし、地上ヒト状態、十分なインク、特殊状態なしでチャージして release する。Nintendo Support は Ver.11.3.0 を現行版としている。11.3.0 の武器調整一覧に Splat Charger の通常威力変更はなく、11.3.0 固定パラメータから通常ノーチャージ 40、partial 上限 80、full 160 を抽出した。

部分威力の時間カーブは community measurement として [Splat Charger 検証表](https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%82%B9%E3%83%97%E3%83%A9%E3%83%81%E3%83%A3%E3%83%BC%E3%82%B8%E3%83%A3%E3%83%BC)を参照する。表の武器別性能は Ver.11.0.0 現在と明記され、最短チャージ 8F、partial 40.0–79.9、威力増加 138.46 damage/s、full charge 60F と記載。11.3.0 までの Nintendo update notes を確認したが、その後 Charger の基礎威力変更は列挙されていない。これは表の値を 11.3.0 に適用する根拠であり、Switch 実機での再計測ではない。raw parameter の partial endpoint は 80.0。0.1単位の丸め・境界は未確認のため、INKWAVE は raw cap 80.0 を保持する。

INKWAVE の native `inkwave-public/src/game/weapons.js` と source adapter には専用 `chargerDamage` mapping があるが、実行時の合成では `installWeaponsFidelity()` が `Projectiles.fireCharger` を `installChargerFlight()` で置き換える。この active flight job は generic S-curve の `charge` だけを保存し、その値から hit damage を計算していたため、native-only mapping は実際の owner hit に届かなかった。8F (`chargeT=8/60`, generic `charge=1/6`) は46.6667 damage、30F (`chargeT=30/60`, generic `charge=0.53125`) は61.25 damage になっていた。

#506 の修正では active `weapons-charger-flight.mjs` が release call 中に runner の `chargeT` を snapshot し、既存の source-driven `chargerDamage` mapping に渡して計算した damage を飛行 job に保存する。partial hit はその保存値を使い、full shot は raw full endpoint 160 を維持する。generic nonlinear `job.charge` は現在の range、launch speed、paint にそのまま使う。ghost job の damage は0で、owner だけが `applyHit` を呼ぶ。native release の `charge` / `chargeT` reset と main #819 の16F post-shot busy/reset 定義は変更していない。7F以下の発射 admission、射程、インク消費、弾速、移動にも変更はない。

再現・影響: 実 `runtime/install()` で native `Actor`、`WeaponRunner`、`Projectiles` を合成し、通常 shot を8F / 9F / 30F / full60Fでreleaseして実 target capsule hit を確認する。30/60/120 Hz rendering cadence の各ケースで owner hit は1回。期待値は8F=40、9F=`40 + (1/60)*138.46`、30F=partial raw cap80、60F=160。rangeは元の generic nonlinear chargeから計算される値と同じ。baseline negative control は active flight の damage snapshot を外して旧補間を戻し、8F=46.6667、30F=61.25を再現し、同じ acceptance assertion が失敗することを確認する。source-fixture-only test はこの active composition を含まなかったため、この実 runtime 回帰に置き換えた。これはロジック確認であり browser gameplay と Switch 実機比較は未実施。Ver.11.0.0 community 表を11.3.0へ適用する根拠は Nintendo update notes の比較であり Switch 再計測ではない。damage の per-frame 端数処理、最大 partial の表示79.9とraw80.0の差は未確認として残し、79.9への変換や推測による丸めはしていない。
## 2026-10-06: reticle state / visible-vs-authoritative footprint (#711 #709 #757)

チャージャー HUD の射程内判定を、フルチャージ固定から現在のチャージ量に応じた飛行距離（`chargerReach`）へ変更し、ブラスターの拡散拡大を外周リングのみに限定した（内側リングは静止サイズ）。インクストームの塗り位置を、その tick の見た目の雨半径と同じ範囲から選ぶようにした（#757）。弾道・数値・半径は不変。いずれも**ロジックのみ確認**で、ブラウザの実表示と Switch 実機との比較は**未確認**。本家の根拠・実装箇所・再現操作・影響は[詳細](inkwave-reticle-state-2026-10-06.md)を参照。

## 2026-10-06 — Charger charge-keep squid→humanoid reset (#810)

S3（Ver.11.3.0、`WeaponKeepChargeParam.KeepChargeFullFrame = 75`）では、イカ→ヒトへの有効な遷移でチャージ保持の残り時間がリフレッシュされ、再潜伏で次の保持サイクルがフル 75F / 1.25 s から始まる。`patches/splatoon3/runtime/weapons.mjs` の `WeaponRunner.prototype._charger` は従来、潜伏中のみ同一レコードを減算し、浮上時は減算分岐に入らないだけで残量を戻さなかったため、60F 消費後の再潜伏は約 15F で失効していた。今回、ZR 保持中の有効な squid→kid エッジで `s3Stored.remaining` を `w.keepChargeTime` に戻す（edge-triggered の `s3WasSquid`、レコードの再生成なし）。この変更は既存レコードのタイマーのみを書き換え、#359 の初回保持可否ルールは変更しない。focused reset test は実 Actor の `submerged === true` を事前条件として確認する。#390 の ZR 解放キャンセル、#291/#101 の浮上後射撃/レーザー遅延（emergeDelay 経路）は既存経路のままで、火力・射程・速度・塗り・インク消費も変更しない。別の focused boundary checks では、dry/enemy squid と保持中のインク補充抑止、および ZR キャンセル後の補充再開を確認した。これらは #359 の dry/enemy/air 初回保持可否を検証したものではない。

| 項目 | 内容 |
|---|---|
| 本家の根拠 | Splatoon 3 Ver.11.3.0 の更新履歴（最新 11.3.0）と、Splat Charger の `KeepChargeFullFrame = 75`（pinned 11.3.0 パラメータ）、チャージャー属の検証表（イカ→ヒト遷移で保持時間がリセットし、再潜伏で再保持できる旨）。フレーム値の実機再計測はしていない |
| INKWAVE の実装箇所 | `runtime/weapons.mjs` の `_charger`＋`reset`（`s3WasSquid` 追加）。`actor.js` の form/emergeDelay 経路は変更しない |
| 再現操作 | フルチャージ→ZR 保持のまま自インク潜伏（保持成立）→60 tick 保持（残約 15F）→ZR 保持のまま浮上（ヒト tick で残量が 1.25 s に戻る）→発射前に再潜伏→フル 75F の保持が 1 tick 減算から始まり、75F で失効。ZR 解放は従来どおり即キャンセル |
| プレイへの影響 | 浮上/再潜伏の繰り返しで保持ショットを 75F 超えて維持できる正規テクニックが復活する。単発の連続保持寿命・射撃/レーザーの遅延・ダメージ/塗りには影響しない |
| 確認状態 | **ロジック確認済み**（source-fixture が公開 Actor/WeaponRunner と現行 adapter を読み込み、実 Actor.tick、1/60 tick 基準、30/120 Hz 境界）。**本家実機（Switch Ver.11.3.0）でのフレーム単位の実測比較は未確認**。dry/enemy refill gate とキャンセル後 refill は関連 focused tests で確認。#359 の dry/enemy/air 初回保持可否、ネットワーク専用再検証、ブラウザ統合 acceptance は未確認（parent バッチ待ち） |

## 2026-10-06 — Dualies wall-drop (#604) and composed-runtime guards

Base main `67fec182`. Splat Dualies wall impacts now enter the existing sourced wall-drop state using the pinned 11.3.0 top-level `WallDropMoveParam`/`WallDropCollisionPaintParam` (shock 1.3, fall 0.65, ground 0.6; 20–40F + 10F + 15–35F at 0.06). Previously the round died on the contact frame after one generic impact. Damage is unchanged. Shooter (#385) and Charger (#625/#268) are excluded: Shooter is owned elsewhere, and the Charger record omits three period fields. #770, #777, #638/#637, #644/#643 and #556 were already correct after adapter composition (the reports read raw source). They are now pinned by composed-runtime tests. This is logic-level and emitted-verifier evidence; a Switch visual/frame comparison is still 未確認. Details: [inkwave-wall-drop-dualies-guards-2026-10-06.md](inkwave-wall-drop-dualies-guards-2026-10-06.md).

## 2026-10-06 — Bomb trajectory preview collision budget (#798)

Base main `0aafab81`. `Projectiles.updateArc` (`inkwave-public/src/game/weapons.js:1410`) recomputed its full ballistic + collision path on every render frame while the sub guide was held: the exact-value pos/vel cache invalidates on any aim/move change, forcing up to `(arcN - 1) * 2 = 126 Physics.segment()` queries per frame (about 7.5k/s at 60 FPS). The guide is presentation-only; the actual bomb uses `throwBomb()` + `_updateBombs()` and never reads the preview buffers.

Continuation review used current main `f31f5da439134fe49bb89018dad5557671a49c67` and stopped source `19f929eaa2f40fda4cf41b2e758958bf8aafba3f`. The original 0.05 m position epsilon does not suppress an ordinary 4.32 m/s walk sampled at 60 Hz (0.072 m per render), and accumulated normal aim change can also cross the velocity epsilon before 1/30 s. The existing installed `patches/splatoon3/runtime/weapons.mjs` now lets continuous movement/aim reuse the cached trajectory until the next local 1/30 s presentation refresh. A per-render position jump over 0.5 m or throw-velocity jump over 4 m/s forces an immediate native refresh; throw-speed changes over 0.05, hide/show, actor/physics changes, unknown inputs, missing/stale cache and clock reset retain their native-path guards. The 0.5 m, 4 m/s and 30 Hz values are local scheduling choices, not Splatoon 3 gameplay values. Cached frames continue to refresh colors, visibility and ring pulse. The native integrator, collision routine, drawn path and landing marker remain authoritative at each refresh; the line can be up to the 30 Hz refresh interval plus one render sample stale during smooth input. Actual `throwBomb()` / `_updateBombs()` paths are untouched, and `inkwave-public/` is not edited.

Focused production-installer instrumentation counted actual `Physics.segment()` calls during separate one-second 4.32 m/s walking and 1.2 rad/s aim traces at 30/60/120/144 render Hz. Each trace refreshed 15/30/30/29 times and used 1,890/3,780/3,780/3,654 queries respectively (126 per native pass). Maximum sampled cache age was 0.03333/0.01667/0.025/0.02778 s; every sample stayed within the 30 Hz refresh interval plus one render sample. The cumulative sum of sampled cache ages was 0.5/0.5/1.5/1.9861 s over the one-second traces. Focused verification passes (3/3 selected tests): two Issue #798 cases cover live color/ring refresh, teleport, hide/show, actor, physics and throw-speed invalidations plus actual bomb spawn; the existing 126-tick native bomb trajectory case confirms velocity, fuse, age and path remain independent of preview caching. This is logic-level evidence only. Comparison basis: the pinned Splatoon 3 11.3.0 source profile, Splat Bomb preview while a local actor is alive and the sub aim is held; gear was not varied because the budget controls local presentation scheduling. The continuous movement/aim trace is synthetic, not real controller input. Switch visual/trajectory comparison, mobile CPU/frame-time measurement and browser render-frame profiling remain 未確認; 30 Hz is not asserted as a Nintendo value.


## 2026-10-06 — PaintSystem splat buffer lifetime (#803)

Baseline: main `f31f5da439134fe49bb89018dad5557671a49c67`. The installed `src/world/paint.js` adapter previously created a face-entry array on every splat and a growth record on every paintable splat. Per-instance pools now retain at most 64 arrays and 64 growth records; arrays covering more than 256 faces are released without retention after every face has been processed. Each reentrant call owns its lease. Entries remain attached through complete spread/drip emission, and clear/dispose release active leases and scrub face references. No radius, seed, geometry, ownership, damage, movement, weapon timing or ink-distribution value changes.

The reference context is the existing pinned Splatoon 3 Ver.11.3.0 profile; buffer reuse is an INKWAVE implementation choice, not a Nintendo allocation policy. Six native-module tests on the combined batch preserve seeded CPU area/ownership/counts/version, Actor turf/special credit, newer-over-older growth ordering, owner network recording, complete 257-face emission, drip completion and reentrant/clear/dispose lifetime. A deterministic 5-second warm-up plus 60 simulated seconds at 100 splats/s (6,500 calls) used 19 arrays and 19 growth records, reused each 6,481 times, and created none of the targeted objects after warm-up. The unadapted control created 6,500 of each. These counters cover only the two targeted construction sites; the sustained probe stubs rendering emissions and uses a synthetic 80x80 face with real PaintSystem.splat/_cpuSplat. Browser allocation bytes, GC time, mobile frame time, WebGL atlas-pixel equivalence and Switch/real-match comparison remain unverified. The exact-source integration CI covers the real installed browser/Range/network/render paths separately.

## 2026-10-05: iPad ジャイロ軸・選択枠・チャージャー射程線・練習場タイマー・再戦ライフサイクル

開始 main は `fc057af9baac421ec707504f4637e2ed8824a444`。対象は `inkwave-public/` とビルド時 overlay（`patches/local-quality/`、`patches/practice-range/`）で、旧 `game/` 試作版は対象外。本家の参照版 Ver.11.3.0、ブキ・ギア・感度・射程・弾速などの数値は変更していない。ここで扱うのはブラウザ上の座標系・描画順序・画面寿命の不具合であり、本家の実機計測を追加した変更ではない。

| 項目 | 本家の根拠 | INKWAVE の実装箇所 | 再現操作 | プレイへの影響 | 確認状態 |
|---|---|---|---|---|---|
| iPad ジャイロ軸 | 本家のジャイロ照準は本体を回した向き・軸どおりに視点が回る前提の操作（軸変換の公式記述は今回取得していない。感度曲線は既存値のまま）。 | `src/core/gyro.js` の画面回転角が `src/core/device.js:screenAngle()` 由来。iPadOS Safari（デスクトップ表示）は `window.orientation` を出さず `screen.orientation.angle` に落ちるが、WebKit は iPad の natural orientation を landscape-primary と定義する（`WebCore/page/ScreenOrientationType.h`）ため、横向きで 0、縦で 90 を返す。CoreMotion の軸は常に縦基準。`patches/local-quality/screen-angle.mjs` で Apple 端末は `screen.orientation.type` を縦基準のセンサー角へ写像する。 | iPad を横持ちで左右に向きを変える → 視点が上下に動く（yaw→pitch の交差）。 | 横持ち iPad でジャイロ照準が成立しない。 | ロジック確認済み（実 gyro.js / device.js / 権限・寿命 overlay を通した姿勢→DeviceOrientation/Motion 生成シミュレーション、iPad 4向き・iPhone・Android 縦 natural / 横 natural、rotationRate への切替後も含む）。**物理 iPad・iOS Safari・ホーム画面 PWA での実測は未確認**。iPadOS 16.4 未満（`screen.orientation` なし）は従来どおり。 |
| 選択枠の追従 | 本家メニューのカーソルは入力した項目へ即座に移る（実機フレーム計測は未取得）。 | `src/ui/menus.js:_updateCursor` が枠要素の位置を不足減衰ばね（k 560, c 34、収束 約0.2 s）で補間していた。`patches/local-quality/menu.mjs` で枠の位置・寸法を常に選択項目の実寸へ同じ入力タスク内で合わせる。出現時のフェードと CSS パルスは維持。 | キー／パッド／タッチで連続して項目を移動 → 枠が後ろから追いかける。 | 選択と表示が一致しない。 | ロジック確認済み（実 menus.js の該当メソッド、各入力種別・1/240〜1/10 s 間隔）。実機フレーム比較は未確認。 |
| チャージャー射程線 | 照準線は現在の照準方向を示す（本家の線の描画フレームは未計測）。 | `src/game/weapons.js:_updateBeams` が 60 Hz ティック内（カメラ更新前、前フレームのカメラ由来の `aimPoint`）で線を置いていた。ティックの無い描画フレームでは更新もされない。`patches/local-quality/frame-order-adapter.mjs` で配置を `_placeSight` に一本化し、`_frame` の `rig.update → computeAim` の直後に `syncSights()` で再配置する。射撃と同じ `_muzzle` → `_aimFrom` を使う。 | チャージ中に視点を素早く振る → 線が 1 フレーム以上遅れて付いてくる（120 Hz 表示では更に遅れる）。 | 狙いと線がずれて見える。 | ロジック確認済み（実 Actor/WeaponRunner/Projectiles/Physics、カメラ移動直後・120 Hz・15 FPS、発射方向との一致）。#572 の 5F チャージ UI と保持ロジックは変更していない。実機比較は未確認。 |
| 練習場の時間切れ | 本家の試し撃ち場に制限時間はない。 | 練習場も `startMatch` で `settings.matchLength`（90/180 s）を受け取り、`Match.update` のカウントダウン → finish → judge → results に流れていた。`patches/practice-range/install.mjs` で練習場の Match だけ時計を持たない（`Infinity`）。 | 練習場に 90 s（既定設定では 180 s）留まる → TIME UP と判定・リザルトへ遷移。 | 練習が強制終了する。 | ロジック確認済み（実 Match で 200 s 進めても playing、同じ 90 s の Turf War は 90 s で finish → judge）。ブラウザでも 95 s 分の Match.update を確認する回帰を追加。 |
| 試合後→メニュー→再戦の UI | — （INKWAVE の画面寿命の不具合） | Chromium（タッチ・iPad UA、デスクトップ、CPU 4倍スロットル、API 経由／実タップ／連打）で battle → results → main → battle を繰り返し、HUD・メニュー層・タッチ操作 root・DOM id・window/document/screen リスナー・interval・コントローラ・カメラ・シーン子要素の増殖や残留は修正前から無いことを確認した（持続的な破損は再現せず）。この経路で確定した不具合は2つ: (1) 選択枠のばね補間（上の行）で、メニューへ戻るたびに枠が項目から遅れる。(2) wipe 付き遷移（results→null/main 等）では `show()` が論理画面を先に切り替え、旧画面の差し替えは wipe 中間点まで遅れるため、閉じたリザルト画面がパッド／タップ入力を受け付け、次に mount された画面も入場アニメで不可視の項目がタップで起動できた（Chromium で連打時に LOADOUT へ誤遷移する例を観測、タイミング依存）。`patches/local-quality/menu.mjs` で保留中の画面を `inert` にしてナビ入力を止め、同じ生きた画面で始まった押下かつ可視の項目だけ click を通す。 | リザルトで MAIN MENU を素早く連打、またはメインメニューの入場中にタップ。 | 意図しない画面遷移・REMATCH、選択表示の不一致。 | ロジック確認済み（実 menus.js の show/_swap/_nav）。10 周の実ブラウザ回帰を追加。**物理 iPad の WebKit での症状再現と修正確認は未確認**。 |

ブラウザ回帰 `scripts/check-inkwave-rematch-lifecycle.mjs` は Chromium/SwiftShader の実ビルドを使う。WebKit・物理 iPad・PWA の代用にはしない。
