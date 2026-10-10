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

## #845: 画面外 Actor の presentation work（2026年10月8日）

- 本家参照版：スプラトゥーン3 Ver.11.3.0。[任天堂の更新履歴](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/kw/Splatoon%203)には武器追加・調整などが公開されているが、画面外キャラクターのポーズ、足 IK、髪の更新頻度や CPU 予算は記載されていない。Switch 上の該当挙動は未確認。
- 比較条件：ブキ・ギア・操作入力の変更ではなく表示専用 CPU 作業を対象にするため、ブキ・ギア条件は該当しない。INKWAVE では遠隔 Actor をカメラ外に置き、描画フレームを進めず native Actor frame を120回実行した。
- INKWAVE の変更前：`Actor._finishFrame` から `Character.update` に入り、`root.visible` だけで姿勢更新を判断していた。実際の frustum 外でも120回の足・姿勢構築・姿勢適用、129回の足 IK raycast、110回の髪更新が続いた。これは6層の build adapter と本番 runtime installer を通したロジック測定で、ブラウザや端末のプロファイル値ではない。
- INKWAVE の変更：`patches/local-quality/offscreen-visual-budget.mjs` を bootstrap の `installQuality` から接続。native `_camHook` の実描画フレームを使い、保守的な perspective-camera 判定で画面外が続く遠隔 Character のみ表示更新を抑える。判定でモデル化していない shifted/zoom/filmOffset/parented/custom camera は通常更新に戻す。カメラ更新が Actor update の後になる場合に備え、最初の mesh `onBeforeRender` で既存 `_camHook` の前に保留 pose を反映する。ローカル Actor、Practice Range、未知カメラは抑制しない。
- ゲームへの影響：足 IK と装飾 pose/hair の表示用作業を、画面外の遠隔 Character に限って減らす。Actor の移動、衝突、武器、ダメージ、通信、AI、シミュレーション時計は変更しない。30/60/120 Hz のロジック確認と初回可視描画順の native regression は通過したが、端末 CPU 時間、FPS、電力、Switch との同等性は未計測・未確認。

## #1160: 頭上クリアランスのない段差上り（2026年10月9日）

- 本家参照版：スプラトゥーン3 Ver.11.3.0。任天堂の[更新履歴](https://support.nintendo.com/jp/switch/software_support/av5ja/1130.html)で版を確認した。公式の基本説明はイカ状態で自分の色のインクを泳ぎ、壁やフェンスを通ることを説明するが、段差・天井の当たり判定寸法や歩行時のステップ許可条件は公開していない。[更新履歴](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/kw/Splatoon%203)、[公式ゲーム説明](https://splatoon.nintendo.com/ca/gameplay/)。この条件の Switch 実機確認は未実施で、本家と同じ挙動とは判定しない。
- 比較条件：本家は実機未計測のため、ステージ・ブキ・ギアの条件は未確定。INKWAVE fixture は weapon=`shooter`、ヒト状態、ギア効果なし、前方移動、射撃・サブ・スペシャルなし。歩行ケースはジャンプなし。追加のジャンプ着地ケースは z=-1.20 m から固定 simulation 18 tick 前進後にジャンプ入力を行う。地形は高さ 0.30 m の curb、上面の下面が y=1.50 m の天井。現行設定の `stepUp=0.35 m`、`height=1.45 m` では curb 上の candidate は頭部が天井へ 0.25 m 入る。数値は INKWAVE fixture 値であり、本家の寸法値ではない。
- 変更前の最初の差：歩行では full production adapter composition と全 runtime installer の Actor/Level/Physics で、z=0.402 m の固定 tick に足プローブが y=0.30 m の curb を選び、Actor の y が 0 から 0.30 m へ上がった。さらにこの修正の read-only review で、着地側に fit gate がない経路を確認した。18 tick 前進後のジャンプでは tick 19 に y=0.0499、z=0.306 m、grounded=false、tick 20 に y=0.3000、z=0.402 m、grounded=true となり、tick 21 には y=0、z=0.2078 m へ押し戻された。レビュー receipt `codex4-review-r781.json` に記録済み。この一 tick の snap も candidate の全身 fit を確認していなかった。
- INKWAVE の変更：`patches/splatoon3/movement-physics-adapter.mjs` が build 時の `Actor._resolve` で、上方の足支持 candidate を form 別 terrain radius・lift・height・grate 除外条件で `Physics.bodyFits` に照会する。歩行中は不適合 candidate へ snap せず、lift を足元まで下げた `collideBody` で curb 側を押し戻す。着地時も同じ fit を確認し、不適合なら candidate より下で横方向 `collideBody` を適用して側面速度を除き、足元を再 probe してから接地を判定する。比較対象の `inkwave-public/src/game/actor.js` は変更していない。実機由来でない寸法や補正量は追加していない。
- 再現と確認：`patches/splatoon3/tests/issue-1160-step-clearance.test.mjs` は `source-fixture` の全 production adapter chain と `fullRuntime` installer を使い、実 Actor/Level/Physics と `FixedClock` の 30/60/120 Hz 描画刻みで確認する。変更後、roof 下の jump は y=0.30 m へ grounded snap せず curb 側面に当たり、open curb の jump は上面に着地する。既存の歩行 clearance、open curb、ramp、step-down、kid の grate 接地、squid の grate 通過も維持される。これはロジック fixture の結果であり、ブラウザ描画・Character の足運び・端末実測・本家実機比較ではない。
- 遊びへの影響と状態：変更前は低い天井の下へ歩行またはジャンプ着地で足だけが先に乗り、身体が地形へ食い込む可能性があった。変更後、適合しない上方 support は接地に使わず curb 側面で止まり、open curb のジャンプ着地は維持される。INKWAVE の full production composition 回帰は確認済み。本家での同一操作、足運び、頭部接触、ブキ・ギア別条件は未確認のまま残す。

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

## 2026-10-06 — #204 メニュー attract の更新予算

公開 INKWAVE の `patches/splatoon3/runtime/clock.mjs` は通常 menu attract 中も 60 Hz 固定 tick ごとに Match/controller/projectile/8-bot attract を進め、`patches/local-quality/idle-adapter.mjs` は各 render frame で world presentation を更新・描画していた。touch または LOW 品質の通常 title/settings menu に限り、それらを20 Hzへまとめる。固定時計、入力/menu、network pump、showcase は render cadence を維持し、live match と desktop HIGH は変更しない。

比較参照は本書冒頭の Splatoon 3 Ver.11.3.0。メニュー attract の更新頻度を定める公開数値は確認できず、ブキ・ギア・battle state は対象外。したがって20 Hzは INKWAVE の端末向け presentation budget であり、本家との同 cadence や gameplay fidelity を主張しない。再現操作は INKWAVE で title/settings を開き、touch 端末または LOW 品質で通常の背景 demo を表示すること。match/gameplay の simulation は変えない。ブラウザ実表示・物理端末の frame/GPU 計測と本家実機比較は未確認で、解消済みにしない。差分、回帰範囲、open PR 重複監査は [#204 の実装記録](inkwave-idle-attract-budget-204-2026-10-06.md) を参照。

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


## 2026-10-04: 成績・XP・戦闘情報 #236 / #256 / #295 / #220 / #231

比較基準はmain `0859bf4fab08edc74c25fcb790e662a748a91ec9` とSplatoon 3 Ver.11.3.0。通常Turf、倍率なしの3分完走、HP100、索敵効果なしを基準とする。公開経路は全adapter→runtimeの合成で、元の `inkwave-public/` は変更しない。#282で誤認された面積重み付きcoverageは既存scoring実装のまま維持する。

- #236: [検証Wikiの表彰](https://wikiwiki.jp/splatoon3mix/表彰)で、バトル数はトドメ＋アシスト、トドメ統計は別と確認。[結果画面の解説](https://gamewith.jp/splatoon3/366896)も合算表示を確認する。`runtime/flow.mjs` の既存被ダメージ履歴を共通のアシスト判定にし、`stats.assists`、HUDカード、Flowが同じhelper集合を使用する。ネットのvictim-authoritative splattedイベントにhelper IDを同梱し、remote死亡を一度だけ再生して結果データへ保存。直接キル `stats.splats` は変更せず、通常Turfの結果だけ合算値と内訳を渡す。認定時間は既存Flowの5秒を共用したもので、本家の実測値を新しく確定したものではない。
- #256: [検証WikiのSP説明](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン#od9f2413)にある垂直壁0点に従い、native `_cpuSplat` のpoint対象を `f.turf && !dead` へ限定する。壁セルの塗りとversion更新は残す。床の新規/塗り返しのみ加点、同色再塗りは0。
- #295: [検証Wikiのランク表](https://wikiwiki.jp/splatoon3mix/ランク#fa0ad4e0)に基づき、通常Turfのrank XPをtime300＋100p刻みの塗り上限500＋勝利600にする。保存/level更新/結果内訳が同じ関数を使い、キル数による加点を除く。Bossモードの報酬、個人塗り点、coverage、カタログは変更しない。
- #220: [検証Wikiのダメージ表](https://wikiwiki.jp/splatoon3mix/システム詳細仕様#b08834e6)の18.0ダメージ境界でマップ敵表示を決める。フォームだけで敵を出さず、ダメージがある潜伏敵を消さない。ネットHPを小数2桁で保持し、17.9が丸めで18にならないようにする。味方/自分/ジャンプ対象は既存導線を保つ。
- #231: [Nintendo Ver.11.0.0の記事](https://www.nintendo.com/au/news-and-articles/whats-new-in-the-splatoon-3-version-11-update/)と[公式更新履歴](https://www.nintendo.com/en-gb/Support/Nintendo-Switch/Game-Updates/How-to-Update-Splatoon-3-2266003.html)に沿い、味方の被ダメージと敵の被弾後3秒・遮蔽/潜伏条件を別のhealth markerへ接続。敵名や正確なHP数値は追加しない。明示的なteam別reveal期限だけ遮蔽/潜伏の例外にでき、死亡/復活でリセット。索敵サブ/ギアそのものの実装を新たに追加したわけではない。remote HP減少も表示時計へ反映する。

`tests/score-hud.test.mjs` は実Actor/Flow/NetMatchのイベントと結果配送、実CPU塗り、実Game `_judge` の保存/level更新、実Game `_updateHud` のframe、health DOM更新を検証。0/99/100/199/200/499/500/1000p×勝敗×0/1/10キル、17.9/18.0/18.1/20ダメージ、表示窓/視線/潜伏/画面外を区別する。minify済み生成物のgameplay・runtimeにも同じ試験を行う（main/HUDメソッド抽出は合成sourceを使用）。音/renderer/DOM fixtureは実ブラウザ目視の代わりではない。

未確認: 現行Switch同条件映像とUI外観の比較、遅延付き2peer実機計測。approximate health barの形/寸法はINKWAVE側デザインでありNintendoの寸法として主張しない。
# 2026-10-04: Conditional gear / sub defense (#342–345)

Last Ditch, Comeback, Sub Resistance and Opening Gambit now connect native gear
selection to actor-local effective AP and actual consumption/movement/damage.
The90/180-second match choices remain unchanged. Comeback's residual effect after
an environmental death and the exact respawn-animation start frame remain explicitly
unverified; the implementation uses a bounded clear-on-death policy. See
[sources, reproduction, reviewed multi-PR composition and limitations](inkwave-conditional-gear-2026-10-04.md).
# 2026-10-04: Flow temporary ability effects (#181 / #222)

One shared defect now connects Flow's sourced +30 AP (cap57) to existing Run/Swim,
Ink Resistance and Intensify Action curves. Permanent gear and actor/weapon clocks
are preserved; legacy speed multipliers no longer double-apply. Main's Flow
activation/lifetime/death policy is unchanged. Grace/quantization acceptance depends
on PR315; reviewed PR315/323/327 composition passes54 source regressions and11
emitted-graph cases. See [sources, reproduction, limits and merge resolutions](inkwave-flow-effects-2026-10-04.md).


## Action reliability workstream (2026-10-04)

入力位相によるDualies dodge消失を既存build-only reliability ownerで修正した。物理jump edgeのActorへの転送、gamepad action edge、sub優先、pointer-loss取消を実コードregressionで確認した。速度・距離・duration設定・poseは変更していない。roll終了比較の浮動小数点誤差による1tick残留だけを補正した。本家11.3.0実機の受付タイミング一致は未確認。分母・before/after・ownership・browser/CIの確認範囲は [action-reliability-report.md](action-reliability-report.md) を参照。

## Network replication の修復（2026-10-04）

ローラー横／縦振りの owner physics を packet 化する順序を修正し、remote の trajectory と projectile に紐付く curtain の時間軸を一致させた。基準射程・威力・spread・local physics・animation pose の変更はない。全武器の native replay、二人の WebSocket arena、遅延／重複／退出回帰の詳細は [Network replication report](network-replication-report.md) に記録する。これは INKWAVE 内の同期比較であり、本家の実機比較、原作の射程校正、physical iOS 検証の未確認項目を解消したという意味ではない。

## Remote Dualies 固定姿勢の同期（#1156、2026-10-09）

対象は Splatoon 3 Ver.11.3.0 を比較基準とする公開版 INKWAVE の owner / remote 表示整合。任天堂の [ブキの基本説明](https://splatoon.nintendo.com/en/news/beginner-basics-for-splatoon-3-choosing-the-right-weapons/) は Dualies の dodge roll を案内しているが、remote pose protocol と正確な切替フレームは示していない。今回の修正は INKWAVE owner がすでに持つ受理済み姿勢を remote に渡す。Nintendo の joint curve、姿勢切替フレーム、実機通信挙動を校正・検証したという主張はしない。

公開版 INKWAVE では owner の `WeaponRunner.s3Turret` が固定射撃姿勢を所有し、既存 `Character` pose adapter がこれを描く一方、`NetMatch.packActor` の 20 Hz snapshot は `lockT` などを送っても `s3Turret` を含めず、`applyRemote` も再構成していなかった。Issue [#1156](https://github.com/rhgrive3/actions/issues/1156) の修正は既存 snapshot flag の予約 bit に Dualies 姿勢を載せ、remote 側では受理済み sample の既存 sender playback clock から Character 限定の pose view を復元する。remote の `WeaponRunner` は変更せず、射撃、ink、damage、collision、cadence に姿勢 bit を使わない。death、respawn 待機、weapon switch、ownership adoption では古い姿勢を解除する。旧 tuple 長は維持し、bit がない旧 sender は解除状態として読む。bit27 を使用し、bit20–26 の泳ぎ・Roller・復活 armor・gear・special readiness と衝突しないことを全 adapter 構成で検証する。

再現は現行 production `install(profile)`、native `Actor` / `Character` / `NetMatch` を読み込む VM fixture と、全 source adapter を重ねる別の native composition 回帰 で、Dualies roll 後 90 frame fire、20 Hz 送信、受信側 playback sample、実 skeleton と indexed geometry を通す。修正前は owner が `s3Turret=true` のままでも remote は false で、turret pose の geometry 差が出なかった。修正後は remote の plant channel と実 geometry が切り替わり、30/60/120 Hz sample、初期 playback delay、duplicate/out-of-order/stale snapshot、旧 tuple、death/respawn、weapon switch、ownership handoff の回帰が通る。これは source VM の engine regression であり、ブラウザ上の実通信と Splatoon 3 実機の同期挙動は未確認。

## 遅延した remote splat と復活 life（#599、2026-10-06）

比較条件は Splatoon 3 Ver.11.3.0、オンラインの Regular Battle / Turf War、シューター、標準ギア、相手の splat 後に復活する状態。任天堂の [オンライン対戦案内](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59459/p/897) と [公式ゲーム紹介](https://splatoon.nintendo.com/en/gameplay/) はオンライン対戦と Turf War を案内しているが、remote death event の順序・送信者権限・life epoch は説明していない。この内部同期の本家比較は未確認であり、Switch 実機や稼働中のオンライン対戦での再現はしていない。

INKWAVE の `patches/reliability/combat-credit-adapter.mjs` は owner と event の life を検証した後、遅延した terminal event の元 paint credit を一度だけ反映する。今回の修正では、その credit 処理の後で、death presentation を最新の owner snapshot `net.lastLife` と再生中 sample `net.cur.life` の両方が event life と一致する場合だけ通す。NetMatch の packet shape、paint の生成・geometry、通常の hit / respawn timing は変更しない。

再現回帰は native `Actor` の hit → splat event → `NetMatch._sendTick` → remote `_tick` / `_advance` / sample / `_playEvents` を使う。20Hz の固定 clock で life 4 の terminal event を保留中に、owner が life 5 の生存 snapshot と respawn event を送る。再生中 sample は life 4、最新 owner snapshot は alive/life 5 であることを確かめ、古い terminal は撃破表示と死亡状態を変えず、元の塗りと attacker reward を一度だけ反映し、その後の respawn event は通常どおり再生する。重複 terminal と forged owner も拒否する。これは source VM のロジック検証であり、ブラウザ実動作・実ネットワーク・本家実機との比較は未確認。

## 練習場（2026-10-03）

ブランチ `inkwave/practice-range` に、既存システムを測るためのソロ練習場を独立パッチ `patches/practice-range/` として追加した（[練習場レポート](practice-range-report.md)）。歩行・泳ぎ・射撃・塗り・ボム・スペシャル・被弾の数値とロジックは変更していない。練習場の目盛りはワールド座標（1 m = 1 ワールド単位）で、本家の距離単位との対応は引き続き未確認（`distanceScale` は推定）。この記録の既存の差分・未確認項目は、練習場の追加によって解消済みとしない。

挙動に関わる変更は1点だけ：上流 `hud.js` の `isJa` の import 漏れにより、ローカルプレイヤーが相手を倒すたびに `splatted` イベント内で ReferenceError が起き、後続のリスナーと `Actor.splat` の呼び出し元の処理が中断していた（全モード）。import を補ってこの中断を解消した。本家との比較項目ではなく、INKWAVE 自身の不具合修正である。

練習場のロジック測定で、スプラッシュボムを水平に投げると約 48.8 m 先で爆発することを記録した（`profile.json` の初速 67.2・重力 57.6、ロジック単独、描画・実機なし）。シューター射程 12.9 m の約 3.8 倍。本家の投擲距離との比較は単位対応が未確立のため未確認とし、値は変更していない。

#### 2026-10-08: #947 練習場のブキ変更と Ink Vac の所有権

比較条件は公開 INKWAVE、参照プロフィールの Splatoon 3 Ver.11.3.0、`charger` の Ink Vac 吸入中、練習場のローカル Actor、既定テスト装備。操作は `RangeSession.setWeapon()` による有効な異ブキ選択。本家との対応は未確認：この INKWAVE 練習場パッド操作に対応する本家の同一試合中ブキ切替を、公式資料または Switch 実機で確認していない。したがってスペシャル中の本家ブキ変更挙動や数値は主張しない。

INKWAVE の差分は、成功した異ブキ切替後も `installKitInkVac()` が所有する旧吸入状態が残り、次の射撃入力を取り込み続けることだった。`patches/practice-range/runtime/session.mjs` は `Actor.setWeapon()` の成功と実際の ID 変更を確認してから既存 `disposeInkVac()` を呼ぶ。同ブキ選択、無効 ID、例外で失敗した切替では保持状態を変えない。既存の dispose イベントがネットワーク複製へ送られ、既発射 blast、消費済みゲージ、通常対戦の `Actor.setWeapon()` は変更しない。影響は練習場の異ブキ選択後も旧スペシャルが入力を所有する点の解消。

確認状態：完全な6層アダプター合成でインストールした実 Actor と実 `RangeSession.setWeapon()` を使用する focused lifecycle 7/7。これはロジック確認であり、ブラウザ実動作・本家実機比較ではない。Nintendo の新しい数値は追加していない。
2026-10-08 追記（cl5 r635）: 統合基準（main `9271e6c2`、完全な6層アダプター合成）で上記 focused の `a released blast and spent gauge survive a later weapon change` のみが `the real native projectile path launched its blast` で失敗することを、同一 worktree でのベース再現と parent 基準ログの双方で確認した（他6サブテストは成功）。原因はテスト装備のライフサイクル仮定で、旧装備は `tick(30)`（0.5 秒）後に一度 ZR を押すだけで終えていた。実キットは設定どおり 360F/6.0 秒の吸入を保持してから `exhale` に入り、そこで初めて ZR 押し→離しのエッジ（または 150F の exhale タイムアウト）が release を発火して blast を実発射する（`kit-ink-vac.mjs` の `beginExhale`/`release`、`#1120` のアーム規則どおり）。つまり session.mjs の所有権処理ではなく装備側の birth 前提が誤りだった。装備は `INK_VAC_CALIBRATION.inhaleDurationSeconds` から算出した既知の設定タイミング内で `exhale` 到達フレームを測定し、独立した実入力エッジ（1押し1離し）で release を1回、`authored` の実発射をちょうど1 blastとして検証したうえで、後続の異ブキ切替後も blast と消費済みゲージの保持を確認する。武器の値・ワールド権限・スペシャル調整は変更していない。装備の修正であり挙動変更ではない。これはソース VM のロジック確認であり、ブラウザ実動作・本家実機比較は未確認。


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
## 2026-10-04 Heavy Splatling player radius / charge-walk

[#403/#470 comparison](inkwave-splatling-radius-charge-2026-10-04.md) records the sourced `.225/.285` relative player-collider correction and the active-charge3.72 target. Visual/field dimensions, Actor acceleration, and charge/stream timing are preserved. The report distinguishes native/minified-module regressions, negative controls, and actual PR64 composition from unverified absolute Switch distance and real-device parity.

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

## 2026-10-04 Flow progress and respawn continuity

[#468/#471/#306 comparison](inkwave-flow-progress-lifecycle-2026-10-04.md) records inactive decay, cause-sensitive death losses, preserved active/inactive Flow through native respawn, and full-reset clearing. The existing synthetic award scale is retained with explicit fp-loss normalization; community verification is distinguished from official/pinned numerical data. Real-character regressions require the aura to hide on death and resume without replaying activation.

## 2026-10-04 weapon edge-case supplement

See [weapon edge-case comparison](inkwave-weapon-edgecases-2026-10-04.md) for #354/#356/#357/#361: stable-human Dualies3F first emission; Splatling separate ground1.6° pitch envelope; terrain Blaster35HP cap; horizontal Roller12+1 gameplay units. The report separates actual source/minified/composed-code tests from S3 probability/position/falloff and released-tap calibration still pending. No native source or deployed main is changed by the draft.

## 2026-10-04 — touch/gyro pitch and connected gamepad ownership (#474, #475)

- Base: `17602ab094da6efb663d872934458e818ae3c93e`; target remains published `inkwave-public/` composed with gameplay, touch-layout and reliability adapters. Upstream source and gyro gain/filter math are unchanged.
- #474 / S3 Ver.11.3.0 comparison: motion controls own pitch while the stick surrogate keeps horizontal turning. This is a mobile mapping rule, not a claim that Nintendo supports touch-swipe aiming. See [issue #474](https://github.com/rhgrive3/actions/issues/474) for its Nintendo/Options reference sources. The new reliability adapter gates vertical swipe production for look/FIRE/SQUID/SUB together and gates consumption while gyro is active. A shared gyro-state synchronizer clears queued vertical input before the first new OFF swipe, preserving that new swipe instead of swallowing it. Gyro pitch and horizontal swipe remain independent.
- #475 / hybrid input: continuous pad axes and held gameplay buttons now require actual `lastDevice === 'pad'`. Physical polling still acquires pad ownership on deliberate movement/button edges. Leaving pad clears pending gameplay button edges and the controller's filtered look/edge boost; existing menu hold masking is preserved. This is an input ownership correction, without claiming Nintendo dead-zone equivalence or changing the current 0.3 acquisition threshold or stick response curves.
- Focused production-module tests: 20 passing, including ten-second neutral-owner drift traces at 30/60/120/144 Hz, deliberate acquisition, held-button suppression, pad→touch filter reset, gyro pitch with swipe yaw, stale transition clearing, and first fresh OFF swipe for four drag paths at sensitivity -5/0/+5.
- Final reliability suite: 373 passing; existing pause/menu-owned gamepad edge/hold coverage retained. Upstream/reference quick compatibility check passed. All 85 transformed public JS modules syntax-checked. Existing #325 controls adapter composes in its intended position after reliability.
- Complete serial gameplay+reliability suite result recorded in the corresponding PR after completion. Browser rendering, physical Android Chromium/iPadOS Safari with Bluetooth controllers, real drifting hardware, and comparison on Nintendo hardware were not performed in this constrained cloud run; #475 hardware acceptance remains unverified. No deployment or quality reductions.

## 2026-10-04: 標準コントローラー・マップ・ジャイロの入力所有権（#197 / #265 / #276 / #309）

公開 main `0859bf4fab08edc74c25fcb790e662a748a91ec9` の全 adapter 合成を対象とする。比較版は Splatoon 3 Ver.11.3.0。対象はブラウザの `mapping === "standard"` ゲームパッドと、既存の DeviceMotion ジャイロ。Nintendo コントローラー独自の motion API は追加しない。

### 出典

- [Nintendo S3 ジャイロ設定](https://www.nintendo.com/jp/games/feature/splatoonqa/other/gyro/index.html): ON/OFF と、OFF では Rスティックで照準を合わせる説明。
- [Nintendo S2 公式基本操作](https://support-jp.nintendo.com/app/answers/detail/a_id/34693): Yカメラリセット、Xマップ、右スティック押込みスペシャル、ジャイロON時の右スティック左右操作。S2資料をS3固有フレーム値の根拠にはしない。
- [S3検証Wiki 操作方法](https://wikiwiki.jp/splatoon3mix/操作方法): 同じS3ボタン割当、X再押下でマップを閉じる、ジャイロON時の右スティック上下無効、マップ表示中もプレイヤー操作可能。
- [Inkipedia Options](https://splatoonwiki.org/wiki/Options): S3の右スティック左右反転と上下反転の独立設定、motion ON時の上下無効。
- [W3C Gamepad §14](https://www.w3.org/TR/gamepad/#remapping): standard index 2=右側十字の左、3=上、8=中央左、11=右スティック押込み。raw mapping の配列順序は推測しない。
- [しりゅ*本人の射撃練習記事](https://note.com/yukkurisiryu/n/n3be81c8de943): 「フリック操作はしていないのに当たらない場合」に、マップを開いたままRブラスターで連続直撃を練習する記述。本人の経験であり、任天堂の仕様公表や実機フレーム計測ではない。

### 修正と再現

`patches/reliability/controls-adapter.mjs` を既存の入力edge・pause処理の後に適用し、物理Inputやメニューのボタン順序は変更せず、PlayerControllerのゲーム内消費先を修正した。

- #197: standard の top face（Nintendo X / index3）でマップを切り替え、Specialは右stick押込み（index11）に限定。left face（Nintendo Y / index2）を新しい単一 `resetCamera()` へ一度だけ配送。Actorのheading・neutral pitchへ戻し、filtered stick/gyro滞留量を破棄する。raw/nonstandardは従来割当を保持。操作ガイドも標準物理位置を明示し、キーボード・タッチ・Pauseメニューの割当は維持。成功したSJではpadマップも閉じる。
- #265: マップ選択のマウスクリックは引き続きメインに渡さず、独立したpad ZRを保持する。チャージャー30tick保持→XまたはTabでマップ→保持継続では発射0、実際にZR解放した時だけ1発。シューターは通常のインク・間隔で継続する。サブ/特殊行動の制限やマップ中のカメラ操作は一括解除しない。
- #276: 実際のgyro enabled状態を縦lookの唯一の所有権条件にし、ON時は右stickのfiltered Yとpitch加算を止める。Xの反応曲線・速度はそのまま。ON/OFF切替時に古いYを消し、OFF復帰時の惰性入力を防ぐ。gyroとtouch swipe自身の符号・感度は維持。
- #309: persisted `padInvertX=false` と独立toggleを追加し、pad yawだけを反転。縦反転との4組合せ、mouse/touch/gyroに影響しないこと、native saveJSON/loadJSONによる再読込を確認。

未計測事項: #197のカメラリセットはこのエンジンのneutral pitchを使う。Nintendoの物理姿勢ごとの正確なcamera/gyro再基準化曲線、各機種のraw mapping、実Pro Controller/Joy-Conセンサー、実iOS/Androidの体感遅延やGPU表示は未検証。#287の−5〜+5感度を未測定倍率へ単に貼り替える修正はしていない。既存の「D-padで即SJ」やマップカメラの独自仕様も本バッチで完全S3一致とはしない。

重複除外: #303は既存 `pause-adapter.mjs` が `menuBlocked` を保持し Match.updateControllerで判定するため、raw sourceだけを読んだ報告と判断。#271も本番 `runtime/install.mjs` が defaults.aimAssist=0 と `_assistTarget=()=>null` を適用済み。正しい公開挙動を再修正しない。PR #60（platform lifecycle）/#62（物理edge配送）/#184（menu performance）の最新差分を読み、この4件の重複実装を除外した。

受入では実Input.pollPad、PlayerController、Actor、WeaponRunnerとnative保存関数を使用。UI/センサー/描画のみをfixture化し、30/60/120Hzから同じ60Hz tickのmap/charge/fire履歴を比較。PR #62 の正確な input-adapter/touch-edge-adapter を一時合成した35試験も成功。CPU負例はcontrols adapterだけを実dispatcher順序から外し、4件の故障を検出する。GPU/実機成功とは別扱い。

最終ローカル検証: 全体754/754（失敗/skipなし）、controls受入12/12、公開minify出力12/12、負例は2pass/10fail、既存pauseとの専用合計35/35。PR #62 `683957332748ea173fa49408b1df2dca42f16265` の正確な物理edge処理を合成して35/35、PR #63 `bfae5fd133c1e4682d0def2d87c5321929cb449d` のprofile/weapons/resourcesを合成して12/12。別PRの全変更を統合済みとはしない。local-quality8/8、motion/workflowゲート10/10、raw upstream差分なし。exact-head GitHub browser CIはPRで追跡する。
## 2026-10-04: authoritative HUD follow-up (#425 / #381)

The build-only quality layer replaces the continuous special percentage with
23 visible segments and forwards the authoritative match winner to Judd.
Points/costs/charge rates, roster readiness and match rules are unchanged.
Close non-ties no longer become presentation-only ties; exact-tie gameplay
#158 remains outside this batch. Sources, negative controls, full native-method
checks and unverified browser/physical-device limits are recorded in
[the scoped HUD report](inkwave-authoritative-hud-2026-10-04.md).

## 2026-10-04: first-allocation mobile resource budget

A cold-boot follow-up for #375/#395 uses the already-published G.mobile profile
until G.game exists. The established touch budget now applies on the first
cloud/Halyard cube allocation at default high settings, not only after later
runtime refresh. Existing formats, appearance policy and gameplay stay intact.
These are project resource dimensions, not Nintendo/Switch memory values.
See [the cold-boot budget report](inkwave-cold-boot-budgets-2026-10-04.md).

## 2026-10-04 — Run Speed Up の通常空中ターゲット分離 (#467)

- 対象は公開 `inkwave-public/` の実 Actor/WeaponRunner と既存 S3 gear wrapper。比較基準は Splatoon 3 Ver.11.3.0 の Run Speed Up「地上ヒト移動を強化し、通常ジャンプ距離を増やさない」という範囲。参照リンクと条件は [#467](https://github.com/rhgrive3/actions/issues/467)。Nintendo の距離単位と WU の一致は仮定しない。
- 非攻撃・非構え・非特殊行動のヒト空中状態だけで、通常走行用 `runSpeed` AP 倍率をターゲット速度へ掛けない。地上速度、既に得た踏切時の水平速度、武器攻撃・チャージ・ローラー・サブ構え・特殊行動・イカ状態の倍率は従来経路を維持。速度ベクトルを直接書き換える補正ではない。既存の独立 Flow 倍率もこの修正では再設計しない。
- 新規 10 試験は実 Actor の `_horizontal` / `_integrate` / `_resolve` / 着地処理を使用。衝突面だけを平面fixtureとし、7ブキ×初速0/3/8.64×描画30/60/120/144Hzで同じ60Hz固定clockを進める。0APと57APの同初期状態の全空中軌跡・着地座標が一致。地上では引き続き速度差があり、別々の踏切初速を与えた場合は慣性差を保持する。
- 同じ新規試験を未修正mainのgear wrapperに戻した反例は 9/10 不合格、修正後は10/10合格。これはロジック/接触fixtureの検証で、Nintendo実機やブラウザ描画の比較を代用しない。

## 2026-10-04 — pad map confirmation and shared touch camera reset (#391, #421)

Dependency: existing controls PR #325. This batch reuses its standard mapping and
`PlayerController.resetCamera`; it does not recreate or claim that prior work.
Initial reference head `af41abe1`, reconciled against integration head `c5be5666`.
Public imported upstream remains unchanged; only build-time navigation connections
and bounded regression/browser checks are added.

- #391: standard D-pad selects a stable actor identity (or spawn), without jumping.
  A fresh right-face A press confirms; holding A while newly selecting a direction
  also confirms. Invalid/dead/removed targets never redirect to another teammate.
  Close, input-owner change and disabled play clear selection. Existing native HUD
  beacon, legend and jump-line rendering display the selected target. Mouse/touch
  direct selection and unknown/raw-pad behavior remain separate.
- W3C standard mapping explicitly identifies right-face button1, top-face3,
  left-face2, and directional buttons12–15: https://w3c.github.io/gamepad/#remapping .
  This extends the Nintendo-position mapping already implemented in #325; no raw
  device-specific mapping is guessed. S3 map-confirm references and acceptance
  conditions are retained in https://github.com/rhgrive3/actions/issues/391 .
- #421: a dedicated camera-reset icon is added beside gyro/pause, including Japanese
  accessible names and an independent saved/resizable layout entry. It consumes
  one touch press through the same shared reset function as standard Y, without
  toggling gyro. Reset clears swipe/pending sensor/tracking state and resynchronizes
  attitude so the next sample starts a new baseline. Exact Nintendo reset-angle
  calibration remains unclaimed; existing #325 heading/neutral-pitch semantics
  are retained. Reference scope: https://github.com/rhgrive3/actions/issues/421 .
- New production-module tests cover all four targets, confirmation/hold, cancel,
  removed/dead targets, roster reorder, input ownership, menu-held confirmation,
  raw/keyboard/touch parity, actual HUD selection output and actual gyro rebaseline.
  The fixed-clock path covers30/60/120/144Hz render input. A negative control excludes
  only the navigation adapter; every new case detects the missing behavior.
- Existing Chromium/WebKit gates are extended with native reset taps, actual sensor
  rebaseline, native HUD highlight/screenshots, and reset-control layout save/reload.
  These browser results are reported by exact-head CI; physical Switch/iOS/Android
  hardware comparison and unmeasured Nintendo motion-reset constants are not claimed.
## 2026-10-04: deterministic assigned-Alpha Turf ties (#158)

The native Turf judge now preserves the lobby/roster's Alpha team0 assignment
on exact equality instead of drawing a new random winner. Non-ties, Boss and
actual coverage are unchanged. It composes with PR486's authoritative Judd
presentation, including a host/local player on Bravo. The historical 0.1%
display-bonus note is not treated as a newly calibrated S3 parameter.
See [the scoped tie-policy report](inkwave-alpha-tie-2026-10-04.md) for source
provenance, native roster/packet checks and remaining physical-device limits.
## 2026-10-04 Charger paint / Dualies and Roller launch dependency

[#407/#420/#414/#431 comparison](inkwave-weapon-paint-inertia-2026-10-04.md) separates Charger impact and line-spacing endpoint ratios from absolute distance calibration, and adds the sourced player-forward launch dependency at final projectile publication. Native/minified regressions are distinguished from still-unverified Nintendo internal basis/clamps and Switch/browser physical acceptance.
## 2026-10-05: Tenacity passive-charge implementation

The owner-side live Turf path now represents head-main Tenacity and its
active-team deficit source. Effective/base special-cost conversion preserves
SCU-independent normalized fill. See [scope and verification](inkwave-tenacity-2026-10-05.md)
for native/emitted negative controls and unverified hardware/network conditions.
## 2026-10-05 Roller flick target (#373)

The [Roller movement comparison](inkwave-roller-flick-movement-2026-10-05.md) replaces the native windup-progress slowdown with the already sourced2.88 WU/s attack target for horizontal/vertical swings. Release timing, ink, pose, gear ownership and rolling/post-release branches stay separate; absolute physical scale and Switch acceptance remain unverified.
## 2026-10-05: offline Turf gear-change continuation

An explicit result→existing loadout→continue path preserves native equipment
saving, Back/locker history, and the previous result/podium. Repeated or obsolete
callbacks cannot start another round. See [the scoped continuation report](inkwave-result-continuation-2026-10-05.md).
Online per-player continuation and physical Switch timing remain unresolved.

## 2026-10-05 Heavy Splatling accounting / natural-end recovery

The [#543/#501 report](inkwave-splatling-accounting-recovery-2026-10-05.md) unifies whole-round reservations with ink spending, and replaces the generic0.22-second natural stream recovery with the independently sourced4F field. Partial-duration rounding is explicitly an internal consistency choice; Nintendo quantization and physical-device comparison remain unverified.

## 2026-10-05 Dualies reticle lifetime

The [#518 comparison](inkwave-dualies-reticle-state-2026-10-05.md) makes HUD post-roll state follow the same s3Turret owner as concentrated firing after the separate movement-lock timer expires. Existing visual geometry and exact Nintendo pixel matching remain outside this state-lifetime repair.

## Death-time Turf Map navigation (#409)

[Respawn navigation comparison](inkwave-respawn-navigation-2026-10-05.md) separates live map/target selection from disabled dead-body input. Deferred requests remain cancellable and wait for actual respawn grounding; shared HUD/diorama routing preserves the standard-pad A-confirmation owner. Exact physical Squid Spawn timing and the separate #273/#362 behaviors remain independently tracked.

## 2026-10-05 Controller disable look state

The [#521 comparison](inkwave-controller-disable-look-2026-10-05.md) clears transient pad filter/boost once when the controller becomes disabled, preventing stale neutral-stick camera motion after pause or respawn. Current physical input, weapon/gameplay values and gyro/mouse mappings remain independent.
## 2026-10-05 Held-axis touch ownership

The [#497 comparison](inkwave-touch-pad-arbitration-2026-10-05.md) keeps a live touch pointer/stick gesture from being canceled by repeated samples of an already-deflected pad axis. Final-contact release restores the existing pad acquisition rule; input math, thresholds and actual ownership-reset semantics remain separate.
## 2026-10-05: non-battle studio shadow budget

Showcase now uses the native effective shadowSize with its historical2048 ceiling,
releases old targets on quality changes/dispose, and preserves animated per-frame
and portrait refresh. [Scope and native/emitted checks](inkwave-showcase-shadow-2026-10-05.md)
separate resource dimensions from unmeasured physical-device performance.
## 2026-10-05: #540 team WIPEOUT producer and HUD ownership

The all-dead check is moved from local final-killer credit into ordinary 4v4 Match life transitions. Both teams publish one identity-scoped event per wipe; respawn rearms it. HUD preserves kill/assist/streak bookkeeping, prioritizes own-team danger on simultaneous wipes, and distinguishes own/enemy text and existing sounds. Flow #505 remains separate. See reports/inkwave-team-wipeout-2026-10-05.md for primary announcement, native/minified regressions and unverified device/network/audio limits. No physical S3 equivalence is claimed.
### #409 follow-up: held pad axes versus a fresh navigation owner

A real touch pin's deferred request survives unchanged held-axis repolling.
Navigation-only provenance retains explicit owner-change cancellation for new
button/key/touch input and native-threshold axis transitions, without changing
general device acquisition. Source/emitted 31/31; negative baseline reproduced;
new native-browser acceptance remains pending the combined batch. See
`inkwave-respawn-navigation-2026-10-05.md` for scope and analog ambiguity.

## Issue #523: corner map is an explicit custom aid, not the default information model

- Baseline: Splatoon 3 comparison remains 11.3.0. Nintendo-hosted GameWith guide https://www.nintendo.com/jp/ichikara/av5ja/03_en.html (guide information dated 2024-04-01) describes pressing X to open the map and inspect territory. This establishes the explicit-map model; it is not a new 11.3.0 frame-value source or Switch measurement.
- Before: native DEFAULT_SETTINGS enabled a constantly visible corner map, giving fresh/default players map information without choosing to open the full map. After: build adapter defaults that option to false and labels it “Corner map (non-S3 aid)” with English/Japanese explanation. Existing explicit saved true remains an opt-in custom aid; partial, absent, invalid, or null saved settings inherit false through the unchanged native loadJSON.
- Scope: default/configuration and settings explanation only. Full Turf Map, touch/controller/keyboard map controls, dead-map selection, pending respawn Super Jump, and explicit opt-in corner map are retained. No weapon, movement, sensor, camera, or hair file changes.
- Validation: actual config and actual loadJSON source cover persistence cases; actual native Game._updateHud executes 120 default hidden-map frames, then opt-in and opt-out. Emitted config is tested separately. Existing actual controller/respawn navigation suite exercises full-map access with the new default false. No browser screenshot or Switch side-by-side validation is claimed.
- Results: full patch suite 955 pass / 0 fail / 2 skip (957 total; started before the final additional HUD test); final focused policy + actual respawn-navigation suite 28/28 including emitted config and HUD test; local-quality/gates 132 pass / 0 fail / 3 skip (135 total). Canonical browser verifier already explicitly initializes minimap=false, then enables true for its opt-in check; no implicit true browser-fixture requirement was found. Actual browser rendering is still pending integration acceptance.
- Review follow-up for #523: a separate actual emitted Game._updateHud + emitted Match.teamSummary test now uses emitted DEFAULT_SETTINGS. On the composed #510 mutable HUD transport,120 default-off frames invoke only tickHidden and produce map=null; explicit opt-in resumes the real map payload. All6 policy tests pass both on the standalone emitted build and the four-change combined build. Game's rendering constructor/boot is not run in this CPU module test.

## Issue #527: distinguish Roller raw swing frames from complete release/repeat phases

The pinned raw vertical SwingFrame26 is a component, while published verification gives kid31F, squid44F, repeat56F. Previous profile incorrectly used26/47F. New vertical timing is31/56F; a Roller-only13F native actor admission delay gives squid44F and horizontal34F, preserving horizontal kid21/repeat42. Buffered taps survive that interval; subsequent explicit squid input, death/reset cancel normally. Original public raw files remain unchanged. See `patches/splatoon3/reference/roller-startup-phases-527.md` for exact sources/derivation and limitations.

Native Actor→WeaponRunner tests cover held/tap × kid/squid × horizontal/vertical, elapsed0 convention, consecutive56/42F releases, and identical30/60/120/144Hz render schedules. Actual Character bones/drum assertions are retimed to the same authoritative31F release. Existing .18 movement recovery, post-shot sub/swim admission, vertical roll-transition22F, and physical Nintendo/mobile validation remain separate and unverified; this is an Addresses patch, not closure of all broader acceptance points.

Validation: final full gameplay/reliability976 pass/0fail/1 optional skip (977 total); quality/gates155 pass/0fail/4 optional skips (159 total); production emitted startup+movement9/9, final emitted startup including unchanged non-Roller admission5/5; actual Character geometry10/10. Previous emitted baseline fails the new startup/repeat endpoint tests (2 failures,3 invariant/cancellation controls pass). Pinned reference verifier:11 files/146 extracted/14 unknown, unchanged. Source31/56/13 are derived from the ver11.0.0 verification table; continuity to11.3.0 is an inference from the absence of a corresponding update-history change, not an11.3.0 physical measurement.
- Review follow-up for #527: mode selection occurs at runner admission, not at the input edge; the eight startup conditions keep ground/air state fixed. Four additional actual Actor/runner cases record land/leave at8F versus20F around the13F wait (34/44F outcomes), and pass in the emitted build. Ground flags are controlled rather than physical landings. Nintendo's dynamic emergence/mode-recognition boundary and future PR49625F freefall-threshold crossing remain unverified, with no speculative mode-snapshot change. See the added reference section.

## Issue #410: judge Turf from the TIME UP boundary

- Root at the current integration base: Match enters finish at time0, then the global projectile system continues painting while the native judge waits2.6s. A deterministic actual Match reproduction captured51:49 at0:00 and later judged40:60/winner1. This is a result-integrity correction; no Nintendo numerical timing, weapon strength, physics coefficient, or new world scale is inferred. The source timer/fixed-step boundary ordering is preserved.
- The host now copies two coverage scalars before the playing→finish state event and before the remainder of that tick. Delayed `_judge` copies those frozen values into its normal result and uses the existing assigned-Alpha tie policy. Duplicate finish does not resnapshot; intro/playing resets the snapshot for a new cycle. Boss judging bypasses this path. Followers continue accepting the normal host result packet and do not judge their local paint. New host-election/migration consensus is not added.
- At the same Turf transition, local current/previous fire/sub/jump/squid/special inputs and buffers are neutralized together. Clearing current sub alone would synthesize a release in the following Actor update; matching previous state avoids that unintended bomb throw.
- Real native and emitted Match/NetMatch/Projectiles tests execute delayed judging, synchronous finish listeners, actual bomb splash calls and actual cloud rain calls against a deterministic paint fixture, host packet/follower receipt, repeated/new match state, Boss exclusion, actual Actor input-edge handling, and30/60/120/144Hz render partitions. The fixture measures result ownership, not GPU ink rasterization or a live remote transport session.
- Finish presentation and projectile/paint simulation continue. Only coverage/winner is frozen: personal Turf statistics, late damage statistics, visuals, and network paint convergence are not certified or frozen by this change. Physical Splatoon3/iOS/Android comparison remains unmeasured. This implements the Issue's stated minimum snapshot invariant without claiming all post-time simulation effects have been removed.
- Final validation: full gameplay/reliability978 pass/0fail/1 optional skip (979 total); quality/gates155 pass/0fail/4 optional skips (159 total); actual emitted new result tests7/7, emitted/result-tie combination15pass/1 optional skip. Previous emitted baseline fails6 new deadline/input tests while Boss control passes. Initial adapter-order diagnostic mismatch was fixed by retaining the original Alpha-tie hook as the first fail-closed check; the final full suite passes without weakening that test.

## 2026-10-05: #508 Heavy Splatling staged HUD

The two-ring reticle reads the current weapon's48F/72F charge boundary. Streaming maps authoritative remaining burst time to the two stages instead of treating each partial release's normalized remaining fraction as full charge. This changes presentation only. See reports/inkwave-splatling-reticle-2026-10-05.md for native/minified tests and unmeasured Nintendo pixel/hardware limits.

### #533: DeviceMotion reaches the Super Jump map cursor

Map-owned gyro deltas now move the actual Diorama cursor instead of being thrown
away. The battle camera is frozen, each delta is consumed once, and boundary/OFF/
reset cleanup prevents aim replay. Existing A confirmation and explicit D-pad
priority remain; dead choices use #409's landing queue. Source/emitted 39/39;
alive/dead negative controls fail without this adapter. Native browser acceptance
awaits the next combined CI. `inkwave-map-gyro-2026-10-05.md` records the reference
behavior and unverified physical sensitivity/FOV limits.

### #505: a team WIPEOUT contributes the separate Flow bonus

The shared #540 Match event now awards the sourced10 fp to each inactive member
of the other team, including teammates waiting to respawn. Current-match and
sequence guards prevent repeats; existing splat/assist activation and active
extension remain independent. Native/emitted7/7 and #540/#48920/20 pass;
#549's real #481 scoring adapter composes as23+10 on the final attacker. The old
runtime negative gives0 instead of10. See `inkwave-flow-wipeout-2026-10-05.md`
for producer scope and unmeasured physical/order limits. Browser acceptance
awaits combined CI.

### #504: active Flow extensions use10 seconds, capped at30

The authoritative profile now matches the sourced10-second extension. Native
local splat/assist and600-tick cadence tests pass; source17/17 and emitted Flow
10/10 preserve #505's non-extending team bonus. Actual online attacker-owner
credit is still blocked by the separately owned #427 / PR #494 dependency on
this base, verified by a failing two-owner wire probe. The duration correction
must not be described as complete online acceptance; see the dedicated report.

#505 integration review clarification: the passed Match/bus tests do not prove
cross-peer owner/proxy agreement under delayed or reordered full-roster updates.
That online acceptance remains open; no team-event transport was introduced.

#505 follow-up: native two-owner replay now confirms false and missed bonuses
under delayed/coalesced natural-respawn snapshots. The consumer is consequently
limited to offline matches (G.netm absent); online remains unresolved.

## Issues #520 / #500: separate turf progress from incomplete damage assistance

- Reference: [Nintendo's11.0.0 overview](https://www.nintendo.com/au/news-and-articles/whats-new-in-the-splatoon-3-version-11-update/) describes turf and assistance making a later splat activation easier; it does not publish fp coefficients. The [original community Flow verification](https://wikiwiki.jp/splatoon3mix/検証/イカフロー), read2026-10-05, lists100fp threshold,0.8fp per10 Turf points, and damage-assist gain upon a qualifying assist. Neither new value is claimed as a direct Nintendo parameter extraction or our own Switch measurement. Acceptance baseline remains11.3.0, with the same evidence limits as the existing community-derived Flow rules.
- #520: retain threshold3 and the existing native Actor.addTurf point stream; weight0.003→0.0024 yields10 displayed Turf units→0.8fp and100→8fp. Native point totals and special charge still receive the full original amount. The current area-to-displayed-point mapping and continuous fractional accrual are preserved; this does not independently calibrate Nintendo physical paint units or prove10p quantum timing. Anarchy is not implemented, so no unsupported0.6 mode is fabricated. Custom Boss continues inheriting the global Flow profile and is not an S3 mode-equivalence claim.
- #500: weightdamage0.003→0 stops immediate progress from merely hitting an enemy and stops those zero gains from resetting idle decay. The damage-credit map remains intact: a later teammate splat still reaches the existing assist handler. Splat gating, assist coefficient, streak rules, active extension, death/decay and reset logic are not rewritten. In particular, #544's14/4 assist-category split remains separate.
- Real native/emitted Actor event tests verify10/100/fractional Turf gains, unchanged stats/special, actual PaintSystem._cpuSplat ownership/repaint zero, turf-alone nonactivation, accepted HP damage with zero immediate fp and unchanged idle clock, retained damage-assist credit, and existing active-assist extension. This is CPU/native-module validation, not live network consensus or physical console measurement.
- Final checks: full gameplay/reliability977 pass/0fail/1 optional skip (978 total); quality/gates155 pass/0fail/4 optional skips (159 total); new actual emitted tests6/6. Previous emitted baseline fails5 new assertions with1 active-extension control passing. The earlier decay test now explicitly includes positive damage as a zero-gain case and uses positive turf for its reset assertion. A dedicated local composition with movement #504/#505 headb567566 retains its10s extension/offline-only WIPEOUT policy:37 source Flow/motion tests and25 focused tests including emitted new point rules plus movement WIPEOUT/extension tests pass, build02ca0fc89f3e. That composition is not included in this source branch.

## Gyro entry, Android stationary guard, and raw handoff on current main — 2026-10-05

Recomposed #551 (#376/#404/#364/#368), #187, and #524 onto the reviewed main/PR536 foundation at 5a2350f. The new main retains screenChanged, createTouchRelayout ownership, and the diagnostic long press; the superseded relayout rewrite is excluded. Waiting for sensor data does not claim gyro is active; a no-data timeout switches the preference off until explicit retry. Startup grants remain scoped to their original owner. Android fresh exact-zero rotationRate may reject attitude-reference drift within the existing 75 ms trust interval; iOS ori-to-raw adoption starts at the last accepted orientation timestamp. No gains, nonzero bias threshold, permission policy, or Android raw-source adoption changed.

Full gameplay aggregate 1028 pass / 0 fail / 1 optional emitted-mode test. Source focused 50/50, source quality/platform/workflow 204 pass with 4 optional emitted-mode tests, actual emitted gyro 38/38. The Android stationary runs also assert source stays ori and rawStart stays null; the raw handoff cases cover 64 frequency/order/axis traces. Build cdf2b9b38929 succeeded. Browser startup probes are carried forward for integration CI; physical-device drift calibration, biased/non-reporting sensors, and hardware gyro feel remain unverified.

## 2026-10-05: #142 portrait guard ownership

The existing mandatory rotate UI now suppresses hidden-control pointer routing and offline fixed simulation until landscape returns. Online keeps world time running and blocks only local control. Rotation does not mutate manual pause or menu/history ownership, and resumes with neutral input/zero elapsed time. See reports/inkwave-portrait-guard-2026-10-05.md for native/full-emitted regression boundaries and unverified physical-device/peer limits.
## 2026-10-05 main/sub action ownership (#530)

Bomb aim/release now owns the final native dispatcher, cancels interruptible main state without a release shot, and clears a buffered emergence attack. Committed windup/Dodge clocks complete before new sub admission. Existing PR302 Splatling refund and PR318 post-shot gates retain ownership; their mechanics are not duplicated. Source/emitted21/21, fixed cadence and actual Actor/Character checks passed. Independent review also corrected cooldown debt, stale Roller visual release, actual sub-payment recovery attribution and retained Dualies fire suppression. Full evidence and pending browser/device limits: [sub action report](inkwave-sub-action-ownership-2026-10-05.md).

## 2026-10-05 special movement spawn boundary (#582)

Slam and Storm movement now apply the existing enemy spawn clamp once after native collision resolution; Slam does so before authoritative impact. Original radius, height condition, velocity response, phase timers and damage/paint rules are retained. Source/emitted10/10 and full1101/0 pass; all4 current map spawn settings, fixed cadence, ordinary movement and native owner/remote packet position are covered. [Evidence and limits](inkwave-special-spawn-boundary-2026-10-05.md).


## PR587 integration: preserve startup preload budget (2026-10-05)

The new main-weapon fidelity graph adds `weapons-fidelity.mjs`,
`weapons-collision.mjs`, and `weapons-charger-flight.mjs`. Their eager HTML
modulepreload hints raised core requests from 131 to 134. Extend the existing
preload-only deferral list by these three modules; `prepareLoading(BUILD, order)`
still receives the full graph. All three remain immutable, digest-verified
Service Worker precache dependencies. No weapon or gameplay values change.

On the dedicated main fc057af + PR536 composition snapshot, the unchanged
startup checker rejects the prior build's core request count and accepts the
corrected build: 131 core + 14 range hints, 199 precache entries, 4,586,825
precache bytes. Static dependency closure and every revision asset digest pass.
Only index.html and sw.js differ among non-versioned output artifacts.
Loading adapter regressions pass 7/7 using actual compiled pre-loading Main;
worker regressions pass 28/28, with the optional historical worker fixture
unavailable. Native browser startup/offline timing and Switch hardware behavior
remain unverified locally; browser CI is required for the new composition.

### #592: water death during special-owned movement

Storm's early return no longer bypasses the existing water hazard. Ordinary and special paths share the unchanged sea-threshold/dry-dock/attribution predicate, and special activation also checks before publishing its finishing frame. Native owner packets carry the death; accepted remote event playback applies it. Tidal Slam movement was checked through the same helper; Super Jump remained outside the historical #592 correction and is covered separately by the later #1050 entry below. See [the #592 record](inkwave-special-water-hazard-592.md) for evidence and original-game/browser limitations.

### #588: visible blur rejects gyro input until focus restoration

Sensor admission now observes lifecycle focus as well as visibility/activity. Focus restoration rebaselines and rejects queued pre-focus samples; an unfinished startup probe is paused during blur so the remembered gyro request survives. Permission and hidden/freeze owners remain unchanged. Source quality 236/0 with 5 existing optional skips and actual emitted focus/startup/handoff 20/20 passed. Browser address-bar transfers and physical hardware remain unverified; see [the #588 record](inkwave-gyro-focus-588.md).

### #571: deliberate keyboard/pad takeover clears the touch map latch

A touch map is closed through native `setMap(false)` when the existing explicit navigation owner changes away from touch. Held-axis presentation repolls preserve #550 touch intent; fresh input still works when the displayed owner was already pad. Same-touch pointer cleanup and each new device's map controls retain their existing behavior. Source 57/57 and emitted 37/37 passed; physical hybrid-input devices remain unverified. See [the #571 record](inkwave-touch-map-takeover-571.md).

### #567: keyboard keydown preserves live touch contacts

Keyboard events continue through existing key/edge/menu handlers while a physically owned touch gesture retains its device owner. The next fresh keyboard event after all contacts end can acquire keyboard ownership normally. No synthetic pointer or deferred action queue is introduced. Source focused16/16, exact #571 adapter composition16/16 and emitted47/47 passed; physical hybrid-device verification remains pending. See [the #567 record](inkwave-touch-keyboard-contact-567.md).

### #595: remove the zero-rate discontinuity in calibrated gyro trust

The existing absolute disagreement floor now applies at zero attitude speed as well as nearby nonzero speed. No threshold is added, Android remains attitude-only, and the existing raw handoff owner is preserved. Source trust/handoff16/16, emitted trust/viability21/21 and exact #588 focus composition19/19 passed. This preserves calibration continuity; it does not remove physical residual bias. See [the #595 record](inkwave-gyro-stationary-trust-595.md).

## Issue 560: projected HUD spread ownership (2026-10-05)

Remove the HUD's independent recoil/shot additions from already-projected weapon accuracy. Clear stale decorative `--bl` on switching into an accuracy reticle. Native and actual emitted HUD regressions each pass 9/9; old emitted output fails the two new cases. The new computed-style browser probe remains pending combined CI. No Nintendo pixel or hardware-equivalence claim is made. See `reports/inkwave-hud-spread-560-2026-10-05.md` for exact scope and evidence.

## Issue 564: Boss audio lifetime (2026-10-05)

Release the audio director's matching Boss reference on judge/results and before native Match.dispose tears down the model. Cancel its positional interval immediately and keep the singleton installation. Source/emitted lifecycle3/3 each, old emitted3 failures, runtime/WIPEOUT10/10. Physical heap/audio/long-soak remain unverified; HULLBREAKER is an INKWAVE-specific mode. Details: `reports/inkwave-boss-audio-564-2026-10-05.md`.

## Issue 593: Turf personal streak ribbons (2026-10-05)

Turf direct kills retain ordinary splat cards and bookkeeping but no longer emit FIRST/multi/revenge/shutdown/personal-streak ribbons. Team WIPEOUT keeps its independent producer; Flow scoring is unchanged. Native and emitted full Match/HUD tests10/10 each, with an old-source failure. Browser visual acceptance remains pending. Details: `reports/inkwave-turf-callouts-593-2026-10-05.md`.

## Issue 589: Range signage backing budget (2026-10-05)

At signage construction, LOW or touch uses1024² backing pixels while desktop non-LOW retains2048². Logical packing/UV/world geometry stay identical; ready fonts avoid redundant redraw. Native/emitted2/2, old-emitted negative2 failures, Range suite28/28. Phone/tablet label readability and new browser atlas/disposal probes remain pending CI. No actual GPU-memory/FPS or Nintendo-equivalence claim. Details: `reports/inkwave-range-signage-589-2026-10-05.md`.

## Issue 565: winner-only Turf showcase (2026-10-05)

Normal judge and offline gear-Back restoration select authoritative winner team/colour/victory choreography. Local win/XP/audio/table stay local-relative. Native/emitted Game tests3/3 each and old-source2 failures; existing result lifetime/continuation checks remain successful. Browser/physical visual acceptance remains pending. Details: `reports/inkwave-winner-podium-565-2026-10-05.md`.

### #555 FxHooks actor cache lifetime

Actor state and Roller flick caches are weakly keyed and explicitly retire only the actor/Match supplied by existing lifecycle events. This removes boot-long strong ownership without altering projectile stamp collection or live respawn effects. Native and minified lifecycle/explicit-GC cases pass; see [the focused report](inkwave-fx-actor-lifetime-555.md). #564 supplies the existing disposal event. Browser heap and unrelated system ownership are not claimed.

## 2026-10-05: Ink Storm rain lifetime (#563)

Pinned11.3.0 RainyFrame480の終了境界をvisual fadeから分離。実main60Hzでは462回/184.8 rawHPだった雨damageを480回/192 rawHPへ戻し、cloudの終了を480tickに揃えた。DPS・半径・durationは変更しない。source/実emitted各5ケースで末尾tick、owner/ghost、対象/LOS、30/60/120/144Hzを検証。固定60Hzの契約であり、実機・任意variable-dt・未統合PR322の回復helperまでは認定しない。[差分と根拠](inkwave-storm-lifetime-2026-10-05.md)。

## 2026-10-05: Dualies swim startup (#590)

Fresh fire recognized in swim form uses an independent total13-counted-frame startup (12 elapsed 60Hz intervals). It overlaps the native generic emergence gate and cancels stale buffered taps. Stable human3F, continuous5F and existing turret4F remain separate. The13F target is a community reference, not a raw-table extraction or measured physical latency. See [timing and cancellation evidence](inkwave-dualies-swim-590-2026-10-05.md).

## 2026-10-05: fresh Charger emergence (#566)

Fresh Charger progression now waits for native kidT to reach6 elapsed simulation frames after form exit, rather than the generic5-frame threshold. This gate skips charging and stored-charge states, preserving their owners. Source6/6, emitted6/6 and existing Charger18/18 pass; actual PR600 source composition7/7 separately covers min8F, rates and stored readiness. Community observation boundaries and unmeasured physical latency remain explicit in [the report](inkwave-charger-start-566-2026-10-05.md).

## 2026-10-05: Slosher release presentation (#596)

The actual 12F release now maps to the existing native raised/forward .25 key rather than its low/back .13 key. Accepted remote weapon:fire advances the same presentation despite a stale slosh flag; gameplay remains 12F/29F. Pose-derived muzzle origins consequently move; an actual full-segment Slosher muzzle guard closes the native LOS endpoint-sliver regression found by the wall tests. This is not a claim of unchanged launch geometry or exact Nintendo animation. See [scope and evidence](inkwave-slosher-release-596-2026-10-05.md).

## 2026-10-05: weapon four × published input/water five

Five new differential source tests pass over published ef712f89-equivalent9543e3e. They cover water-death/cloud lifetime, action reset, hybrid input/Map startup, focused gyro ownership, and guarded Slosher birth replication. No additional production fix was required. See [the bounded composition evidence](inkwave-weapon-fixed-five-composition-2026-10-05.md).

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

## 2026-10-07 — #648 Tidal Slam gauge lifecycle

Reference: Splatoon 3 Ver. 11.3.0 is the issue's comparison version. The related special is [Triple Splashdown](https://splatoonwiki.org/wiki/Triple_Splashdown), while INKWAVE's Tidal Slam remains a distinct action. [Nintendo's update history](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/) establishes the game version but does not publish this gauge curve or a per-frame meter value. The issue links a [Japanese Triple Splashdown guide](https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%82%B9%E3%83%9A%E3%82%B7%E3%83%A3%E3%83%AB%E3%82%A6%E3%82%A7%E3%83%9D%E3%83%B3/%E3%82%A6%E3%83%AB%E3%83%88%E3%83%A9%E3%83%81%E3%83%A3%E3%82%AF%E3%83%81) and [Special Gauge reference](https://splatoonwiki.org/wiki/Special_Gauge); these community sources describe the qualitative lifecycle and 23 visual segments, not Nintendo-published timing. Exact Nintendo gauge timing and a physical Switch comparison remain **未確認**. No Triple Splashdown armor, damage, movement, or 50F/70F timing value was imported.

INKWAVE source before this change: `inkwave-public/src/game/actor.js` `_startSpecial()` set `special` to zero for every special; `_updateSpecial()` advanced `rise → hang → fall` and invoked `_slamImpact()` on ground contact or its existing `s.t > 1.2` fall bound, without updating the meter. `specialFrac()` is the existing HUD fraction. `patches/splatoon3/runtime/gear.mjs` captures the current `special` before death and applies the existing Special Saver multiplier. Thus a mid-action death had no remaining Slam gauge to preserve.

The #648 adapter retains the filled meter at activation and recalculates the remaining local fixed-step action duration from the live rise/hang/fall phase and native landing support. Only a fall-phase ground contact or the existing 1.2-second fall timeout completes the projection; early grounded contacts during rise or hang do not end the gauge forecast. The projection uses the same `G.physics.groundProbe` and rail support used by Actor landing. It drains to 1/23 at predicted native contact, keeps that segment through the Actor's existing `hardLand` recovery, and consumes it only when that recovery ends. The completion helper snaps to one segment only within a numerical epsilon. Replicated `{ net: true }` special states continue to mirror the owner's packet gauge without running local forecast math. Reset and splat still clear the pending finish so the existing Special Saver wrapper sees the remaining gauge. This is INKWAVE logic; no Nintendo frame rate or timing is inferred. Storm's immediate-consume behavior and the separate #573 armor transition are unchanged.

Current-MAIN reproduction: baseline `f31f5da439134fe49bb89018dad5557671a49c67` was composed through the active production adapters in `scripts/build-inkwave.mjs`. A Shooter/Tidal Slam activation produced `special=0`, `specialFrac=0`, and a live Slam in `rise`; the complete composition did not restore the meter. The reproduction is preserved at `/mnt/workspace/inkwave-batch-c/evidence/additional-100/648-corrective-r123/main-composition-red.log`. The full-composition baseline fixture output was checked before this correction; it is not a substitute for native stage geometry.

Native geometry uncovered a gap in the first adapter correction (`19ccab72060f3ac3aa1bab5eefa4613898334cec`). With the actual native `Level`, `Physics`, and `Actor`, a low ceiling caused `grounded=true` during `rise`; the stored trace records a one-tick gauge drop of `153.435495` to `8.26087` (one of 23 segments) at tick 20, before the fall impact. This is the reason the initial fixture-only pass is not full acceptance. See `/mnt/workspace/inkwave-batch-c/evidence/additional-100/C648-cl5-native-physics-before.json` and its raw trace log.

The correction phase-gates the forecast end to native fall contact or timeout and holds the final segment through real landing recovery. Tests compose all six production source adapters and install the native S3 runtime. Native `Level`, `Physics`, `Actor`, and `Character` cover flat floor, slopes, stepped floor, air drop, low ceiling, walls, rail, and no-ground timeout in the historical `1f4214c3` composition. Current main adds native water-hazard checks during special movement: a void fall now dies before the old timeout instead of creating a phantom impact. The current water case checks the actual partially depleted remainder through Special Saver and native respawn, then verifies that explicit reset clears it; grounded cases retain their original phase/contact checks. The low-ceiling case can traverse hang→fall→resolve→impact inside one native Actor update, so the assertion checks the emitted impact phase and the actual gauge state instead of assuming the pre-update phase was already fall. No premature segment collapse occurs; the last segment survives the real recovery before the gauge reaches zero. Physics methods remain native; wrappers only count probes. Actor updates and Character triggers run, while separate pose/render ticks are omitted.

Verification: 21/21 gauge and native-geometry tests passed in the combined 55-test run at `1f4214c30e61262089a177d88f2a03875dad9996`, together with Roller contact/flick/network regressions and Practice Range isolation. Exact-head receipts and canonical build output are retained under `/mnt/workspace/inkwave-batch-c/evidence/additional-100/`. Browser gameplay at the final combined source is checked separately in CI. Physical Switch comparison and exact Splatoon 3 gauge timing remain **未確認**. For Splatoon 3 Ver. 11.3.0, Triple Splashdown is only a qualitative comparison: Nintendo's published update history does not specify this gauge curve, and INKWAVE's Tidal Slam is a distinct action. No per-frame Nintendo parity is claimed.

## 2026-10-07 — Roller drum support and no-stick gating (#847)

Comparison target: Splatoon 3 Ver.11.3.0 Splat Roller, with no ability gear effects, ZR held, and Left Stick movement present or released. The pinned 11.3.0 `WeaponRollerNormal` parameter extraction records `Radius=0.4` and `WidthHalf=1.4` ([source at commit 7280ff9c](https://raw.githubusercontent.com/Leanny/splat3/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponRollerNormal.game__GameParameterTable.json); also recorded in [weapons-fidelity-reference.json](../patches/splatoon3/reference/weapons-fidelity-reference.json)). This is a pinned public datamine, not an official Nintendo parameter publication; engine shape semantics and game-to-world scale remain unverified. The comparison remains limited to Ver.11.3.0.

The complete production source-adapter chain and native runtime reproduced three uncovered cases from main `f31f5da4`: rolling was admitted with grounded feet while the drum was over a ledge, airborne contact with a wall was rejected, and residual actor displacement with Left Stick released still caused Roller damage, ink drain, and paint. The current controlled baseline replay substitutes the exact `roller.mjs` from `7ab20b44` while retaining the complete six-adapter composition and native runtime; it preserves the newly merged roll-stop, release, and authoritative-hit owners. The separate Tidal Slam additions in this batch do not run on this Roller path; this is a targeted source substitution, not a claim that the whole combined tree equals main. The controlled no-stick case held ZR, set move input to zero, retained horizontal velocity, and moved the actor 0.35 units in one 1/60 s runner update. These are deterministic native-logic fixtures, not physical Switch measurements.

`patches/splatoon3/runtime/roller.mjs` now queries the existing level OBBs and checks a horizontal capsule using the pinned radius and half-width, centered at the runner's existing 0.75 forward offset. The parameter values do not establish the original engine's exact collision primitive or world scale. Floor/wall classification follows the native Physics 0.6 normal bands. Rolling requires floor or wall contact by that volume; wall admission temporarily exposes grounded state only while the native Roller runner executes, then restores airborne state without saving or rewriting velocity. When owner Left Stick magnitude is at or below the existing 0.01 steering deadzone, fire is withheld from the native roll path before it can apply contact damage, drain ink, or paint from residual displacement. Flick windup/release remains ungated. Owner and remote poses produce the same contact result; native NetMatch still drops remote-owned damage. No paint footprint, damage range, flick cadence, or network fields were tuned.

Reproduction states include a grounded floor roller with ZR+stick, a grounded actor at a ledge with its drum over void, an airborne actor whose drum is just outside and then touching a wall, and a moving roller after stick release. The current-main baseline replay uses the native Actor, WeaponRunner, Level, Physics, PaintSystem, Projectiles, and NetMatch through all six production adapters (Splat 3, touch-layout, reliability, local-quality, network-replication, practice-range). Candidate and baseline checks: `issue-847-roller-drum-support.test.mjs` 7/7. Adjacent roller flick, dry-input, grip/shape, and wall-replay regressions: `roller.test.mjs`, `roller-flick-movement.test.mjs`, and `roller-wall-replay-unit.test.mjs`, 20/20, including existing 21F/26F flick timing at 30/60/120 Hz. Roll-transition fixtures now provide explicit Left Stick input.

This confirms composed source logic and native contact behavior in controlled fixtures. Browser gameplay, real stage edge cases, physical controller response, and Splatoon 3 console contact/timing remain 未確認; the datamined dimensions do not establish exact in-engine collision geometry.

## 2026-10-07 — #915 Blaster 毎ショットのレバー＋スプリング前部機構

| 項目 | 内容 |
| --- | --- |
| 本家の根拠 | [Inkipedia の Blaster 項目](https://splatoonwiki.org/wiki/Blaster)とそこに掲載された[ゲーム内動画](https://splatoonwiki.org/wiki/File:Blaster_lever.mkv)（2026-10-07閲覧）。説明は、左側レバーが下降し中央スプリングが前部セクションを前方へ振る2つの武器アニメーションを記載し、どちらも**毎ショット**起こるとしている。公開された関節の exact curve は未確認。 |
| INKWAVE の実装箇所 | `patches/splatoon3/runtime/blaster-mechanism.mjs`（周期トポロジーと内部 rig 校正、engine 非依存）、`blaster-mechanism-model.mjs`（`adapter.mjs` が `character-weapons.js` の builder をラップし `lever`/`front` パーツを追加、Parts と同じ attribute contract で far LOD の at-rest body に merge）、`weapon-detail-motion.mjs`（native `WeaponRunner._auto` 中に `Projectiles._push` が実 `blast` projectile を登録した場合だけ local `trigger('shoot')` を機構へ渡す。remote は `NetMatch._play` の matching `p:blast`＋`tr:shoot` を一度だけ許可。`_updateStates` の sim dt だけ age を加算し、`_animWeapon` で変換、`clear` でレスト復帰）。generic recoil は `withRecoil` のまま加算、pump 抑制は据え置き。 |
| 再現操作 | 通常 Blaster で静止し単発タップ→サイド画角で左レバーが下降→レスト、前部カラーラが前進→レスト。連射で1発1サイクル。ZR保持のみ・空撃ち・イカ形態・死亡・武器交代・reset・詳細モーション無効では動かない。remote プレイヤーでも同じ trigger リプレイで同じ周期。 |
| プレイへの影響 | 実発射に同期してブキ自体が「撃つ」機構動作が読みやすくなり、50F 間隔の連射ビートと ZR離脱のピークが復活する。弾・発射間隔・ダメージ・インク・移動・当たり判定は不変。 |
| 確認状態 | **構成テスト確認済み**（production adapter 構成 VM、実 `Character`/`WeaponRunner`/`Projectiles`/`NetMatch`）: 30/60/120Hz の accepted projectile 1発につき機構1サイクル。idle/windup/dry fire/ink不足/form/death/swap/reset/opt-out と、projectile を伴わない local trigger・trigger-only remote packet はレスト。重複した stale `p`/`tr` は再生せず、valid pair でも squid proxy は動かない。実 indexed geometry で左レバーの下向き、spring-front collar のバレル方向（+Z）移動、far LOD の at-rest body を確認。projectile birth/lifetime/straight phase/speed/collision radius/damage、発射時 ink と cadence は現行 production composition の値を維持。remote `NetMatch` local/remote trace は frame-by-frame 一致、FixedClock の描画分割も一致。**公開された任天堂の exact curve は未確認**で、数値は内部 rig 校正。Switch 実機（Ver.11.3.0）の frame-by-frame 比較は未確認のまま。#308 の winding/recovery と bullet/actor parity は変更していない。 |


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

## 2026-10-06: Turf War 全局テキスト kill feed の除去 (#614)

通常対戦の HUD 情報契約の差分。移動・射撃・ダメージ・インク・スコアの各タイミングは変更しない表示・情報経路の修正として扱う。

| 項目 | 内容 |
|---|---|
| 本家の根拠 | [Inkipedia — Splat (occurrence)](https://splatoonwiki.org/wiki/Splat_(occurrence))：スプラット通知は撃破に credit された本人に届き、S2/S3 の助攻者は通知を受けない。S3 の通常 HUD は上部ロスターの alive/splatted と `WIPEOUT!` で全体状態を伝え、全戦場の「攻撃者/被撃者名」を並べる従来型テキスト kill feed を持たない（Issue #614 の Reference behavior）。実機の画面上表示は未計測 |
| INKWAVE の実装箇所 | `inkwave-public/src/main.js` の `on('splatted')` がローカル関与・可視性の gate なしで `hud.feed` に `{victim} was splatted by {attacker}` / `{attacker} splatted {victim}`（kind `death`/`ally`、最大5件・各4.2秒）を送っていた。`patches/splatoon3/adapter.mjs` の `src/main.js` 分岐がこの2つの feed 放送を合成ツリーで除去。upstream-lock 対象の本体ファイルは未変更（全35 Open/Draft PR と同じ overlay 方式） |
| 再現操作 | 4v4 Turf War でローカルから離れた場所に置いたまま遠方で味方が敵を撃破（逆も）。修正前は両者名の feed pill が最大5件積まれ、修正後は feed に何も出ない。ally_splatted 音・ロスター・WIPEOUT!・ローカル撃破確認・自分の死亡表示は従来どおり |
| プレイへの影響 | 遠隔戦闘の攻撃者/被撃者を即時に得られなくなり、push/撤退/Super Jump の判断材料がロスターとローカル知覚のみに減る。assist 表示は #561 として独立、オンライン/オフラインで同じ handler を通るため同一契約 |
| 確認状態 | **ロジック確認済み**：`patches/splatoon3/tests/splat-feed-routing.test.mjs`（構成済み `src/main.js` の実 handler を実行、修正前に3件失敗→修正後8件合格）、`adapter.test.mjs` 10件合格、`review-inkwave-upstream.mjs` 全17接続 unchanged/compatible。**ブラウザ実動作と Switch 実機の HUD 表示比較は未確認**。遠隔 audio cue の本家一致も未確認（音は変更しない） |

## 2026-10-05: Turf Map enemy reveal (#220) — Orchestrator C lane fb8

S3の全体マップは、直近で18ダメージ以上を受けた相手だけを位置表示し、潜伏/壁センプク/ヒトの形態は表示条件ではない。公開版 `main.js` `_updateHud()` は逆に「`anim.form === 'swim'` の相手だけ隠す」形態判定で、無傷のヒト/壁イカは常時表示、20ダメージの潜伏敵は非表示になっていた。`patches/splatoon3/adapter.mjs` で同条件を `enemyRevealedOnMap(o, PLAYER.hp)`（`runtime/map-reveal.mjs`）へ差し替え、被ダメージ閾値（17.9→非表示 / 18.0以上→表示）と明示的索敵フック（`s3.revealed`、本ビルドでは未付与）で管理する。味方/自分のドットとスーパージャンプ対象表示、authoritativeな移動・ダメージ・武器・インクは不変更。回帰は `patches/splatoon3/tests/map-reveal.test.mjs`（差分適用前は2件fail、適用後7件pass）。18という詳細閾値は検証Wiki由来で公式公開表ではなく、現行Switchでの新規実測は未実施。

## 2026-10-06: スロシャー照準の弾道図除去 (#652)

`src/ui/hud.js::_buildReticle()` の `kind === 'slosher'` 特別分岐は照準点の上に
弾道アーチ（`M-24 6 Q0 -26 24 6`）、下に着弾バケット括弧を描いていた。`styles/hud.css`
の `.iw-ret--slosher .iw-ret__arch` と `_updCrosshair` の `--kk` 書き込みが発射毎に
そのアーチを引き伸ばす。Splatoon 3 Ver. 11.3.0 の定番スロシャー照準はコンパクトな
円形マーカーと周囲ティックであり、弾道予測図を描かない（Game8 の試し撃ち画面参照。
半径・線長などの正確な寸法は参考画像の計測が必要で未確認のまま）。

upstream は `upstream-lock.json` で固定しているためバイト列を変更せず、splatoon3 の
ビルド専用アダプターが該当分岐と `--kk` 書き込みを除去し、スロシャーを標準照準
（ドット＋細い円＋四方ティック、シューターと同一構造）へフォールスルーさせる。
合成後ソースは `iw-ret__arch` 要素を生成しないため CSS のアーチ規則は描画されない。
他のブキの照準、スロシャーの投射物理・威力・射撃間隔・リカバリーは変更していない。
入力端末（マウス／パッド／タッチ／ジャイロ）は同一の `_buildReticle` を共有する。
回帰は `patches/splatoon3/tests/hud-slosher-reticle.test.mjs`（合成後コードを実行）。
本家実機での同一照準確認は未確認項目として残す。

## スーパージャンプ着地塗りと加点の分離（#645 / #646、2026-10-06）

Splatoon 3 Ver. 11.3.0 において通常のスーパージャンプは移動手段であり、着地時にインク塗りを残さず、塗り面積による個人ポイント加算やスペシャルゲージ増加も生じない。INKWAVE 公開版の `Actor._updateSuperJump()` では着地時に無条件で `G.paint.splat(..., 1.4, ...)` と `this.addTurf(...)` を呼び出しており、未塗装や敵インクへのジャンプで不当な塗り・スコア・SP加点が発生していた。

| 項目 | 内容 |
|---|---|
| 本家の根拠 | Issue #645 に記載の公開資料（[Nintendo Support Splatoon 3 更新履歴](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/)、[Inkipedia: Super Jump](https://splatoonwiki.org/wiki/Super_Jump)、[SmashWiki: Super Jump](https://www.ssbwiki.com/Super_Jump)）。S3 通常スーパージャンプは移動アクションであり着地ダメージや地面塗りを伴わない（着地爆発・塗りはテイオウイカやウルトラチャクチ等のスペシャル効果による別挙動）。Switch実機の内部物理測定や未公開内部値は主張しない。 |
| INKWAVE の実装箇所 | `inkwave-public/src/game/actor.js:754` の `this.addTurf(G.paint.splat(_v.copy(this.pos).setY(this.pos.y + 0.3), 1.4, this.team, { seed: Math.random() }));`。ビルド時アダプタ `patches/splatoon3/adapter.mjs` で該当呼び出しを除去。 |
| 再現操作 | 敵インクまたは未塗装地点に味方へ向けて通常スーパージャンプを行う。着地tickで半径1.4mの自色塗りと個人Turf・SPゲージ加算が発生していた。 |
| プレイへの影響 | 安全な通常ジャンプを繰り返すだけでナワバリ面積やSPゲージを不当に稼ぐことができていた。修正後は着地時のゲームプレイ塗り・Turf加算・SP加算が0になる。 |
| 確認状態 | **ネイティブオーナー／リモートロジック確認済み**（`patches/splatoon3/tests/superjump-gameplay.test.mjs` でオーナー・ネイティブリモート双方において着地時の塗り呼び出し0、Turf加算0、SP加算0、着地VFXバースト演出および `superjump:land` イベントの維持を確認。リモート着地ではローカル画面揺れが除外されることも確認）。スペシャル固有の `_slamImpact` 着地爆発・塗りは10回のsplat呼び出しとTurf加算（SP加算なし）が維持されていることを確認。実ネットワーク転送層（パケット遅延・揺らぎ・WebRTC/WebSocket同期）および物理音響機器での発音検証は別工程とし本修正では確認対象外。Switch実機による物理キャプチャ検証は未実施。 |

## 2026-10-06: floor Squid Roll の方向閾値 (#307)

インクウェーブ側の実装箇所は `patches/splatoon3/profile.json` の `movement.roll.minimumAngle`（`pi/2` → `pi/3`）と、それを消費する `patches/splatoon3/runtime/movement.mjs::rollEligible`。修正はスティック方向と現在の移動方向の角度比較のみで、最低速度・スティック深度・10F猶予・wall-roll 判定（`wallRollMinimumInput`）には触れていない。

| 項目 | 内容 |
| --- | --- |
| 本家の根拠 | Splatoon 3 Ver.11.3.0 の床イカロールはスティックを進行方向から60°以上に倒す条件。[splatoon3mix システム詳細仕様](https://wikiwiki.jp/splatoon3mix/%E3%82%B7%E3%82%B9%E3%83%86%E3%83%A0%E8%A9%B3%E7%B4%B0%E4%BB%95%E6%A7%98) と検証動画（進行方向に対して60°以上）を照合。Nintendo 公式は角度閾値を公開していない。 |
| INKWAVE の実装箇所 | `profile.json` roll.minimumAngle、`runtime/movement.mjs::rollEligible`。`installMovement` が `profile.movement` をそのまま `cfg` に渡し、実ランタイムと同じ関数を回帰テストが評価する。 |
| 再現操作 | 自インクの平地面で速度条件を満たして泳ぎ、速度方向から59/60/75/89/90/180°の方向へフル深度でスティックを倒して B（ジャンプ）。修正前は60°以上90°未満が不成立。 |
| プレイへの影響 | 60°以上90°未満の斜め前・斜め横イカロールが復活し、進行を保った回避が本家寄りになる。90°以上の挙動は不変。 |
| 確認状態 | `movement.test.mjs` の実profile回帰が修正前 fail(90°)/修正後 pass(pi/3)。`roll-chain-window`/`squidroll-motion` 36件も pass。Community検証の校正値であり、Switch実機での角度境界やWU換算の確認済みにはしない。 |

## 2026-10-06 — CPU turf ownership precedes Roller body visibility (#570)

**本家参照:** Splatoon 3 Ver. 11.3.0 (released 19 August 2026), Splat Roller in a normal Turf War, horizontal rolling on a flat paintable floor, with no gear ability effects assumed. Nintendo's [public update notes](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/p/1076/c/950) list weapon and multiplayer balance changes but do not specify frame-by-frame paint spreading or CPU/GPU ownership timing. That is a documentation-scope observation, not evidence of the Switch's internal implementation; direct Switch comparison remains 未確認.

**INKWAVE root and correction:** `inkwave-public/src/world/paint.js::PaintSystem.splat()` updates `_cpuSplat()` synchronously, then queues a non-instant record in `growing`; the shader body is first submitted by `flush()` using the record's partial age. For a Roller, the checked-in shader grows the band from its initial fraction toward full size. The disposable build adapter now sends an immediate body-only draw of that same native shape at full size, while retaining the queued record for its existing spread, droplets, spatter, and wall-drip lifecycle. No CPU grid, claimed area, turf count, or score calculation changes. This closes an INKWAVE interval where a gameplay query could claim a Roller cell before the rendered body reached it.

**Reproduction and acceptance:** The focused native-source fixture uses the public `PaintSystem`, its real CPU grid and quad submission, the installed adapter, and the bundled Three.js vectors. A Roller splat of radius 0.62 m is queried at 0.58R along its centerline. Before the adapter, the query returns team 0 immediately, no body quad is submitted on landing, and the first partial body remains short of the queried grid-cell center at 30/60/120 Hz. With the adapter, the landing submission carries `tn=3` and body-only mode; the later ordinary growth submission still occurs, and claimed area, grid query, and team counts match the unadapted native method. Regression: [issue-570-paint-ownership-visibility.test.mjs](../patches/splatoon3/tests/issue-570-paint-ownership-visibility.test.mjs).

**確認範囲と限界:** Native logic and emitted quad attributes are verified only; the fixture does not run a WebGL renderer or inspect pixels. Browser presentation, actual atlas blending, and Switch behavior remain unmeasured. The accepted result is limited to INKWAVE's CPU-query versus body-submission timing; it does not assert Nintendo paint timings or hidden parameters.

## 2026-10-06 — #312 Splattershot player-forward spawn velocity

Base main `f31f5da439134fe49bb89018dad5557671a49c67`. Splattershot (`kind === 'shooter'`) の発射初速に、pinned Splatoon 3 Ver. 11.3.0 `WeaponShooterNormal` の `spl__SpawnBulletAdditionMovePlayerParam.ZRate = 2.0`（`patches/splatoon3/profile.json` の `weaponsFidelityCompletion.weapons.shooter`）に基づくプレイヤー前進速度の加算を適用。

- **本家の根拠**: Splatoon 3 Ver. 11.3.0 `WeaponShooterNormal` pinned extraction `Leanny/splat3@7280ff9cde8bb1c5dcef46c700c326471584d2e6` の `spl__SpawnBulletAdditionMovePlayerParam.ZRate = 2.0`。公称スケールは `2 × MoveSpeed 0.072 = 0.144` raw units/frame（60Hz換算で `2 × 4.32 = 8.64` world units/s、静止時初速 `2.266 u/f = 135.96 u/s` に対し約6.35%）。
- **INKWAVEの実装箇所**: `patches/splatoon3/runtime/weapons-fidelity.mjs`。`Projectiles.prototype._push` にて `applyShooterSpawnVelocity(p)` を呼び出し、shooter弾（`p.type === 'shot'` かつ `w.kind === 'shooter'`）に対して、プレイヤーのyaw基準ローカル前進軸方向の速度成分 `(a.vel.x * sin(yaw) + a.vel.z * cos(yaw)) * ZRate` を射出初速に1度のみ加算。
- **再現操作と影響**: 同一の muzzle、aimDir、ゼロ拡散で、静止時（vel = 0）、前進時（vel = 4.32）、後退時（vel = -4.32）、横移動時（strafe vel = 4.32）に射撃。旧実装では移動状態によらずすべて同一の初速 `135.96` だった。修正後は前進時 `135.96 + 8.64 = 144.60`、後退時 `135.96 - 8.64 = 127.32` となり、横移動および鉛直移動による未定義の加算はゼロ。静止時初速（135.96）、4Fブレーキ/射程（#191）、拡散（#198）、ダメージ、半径、および他ブキ種（Dualies, Splatling等）は完全に維持される。
- **ネットワークとリモート再生**: Authoritative gameplay owner 側で `_push` 内のネットワーク記録前に加算され、wire packet は事後速度（`vel`）を保持して送信（パケット長 32 不変）。リモート側の `ghostProjectile` は wire 速度を直接再生し、ゴーストやリモート所有者での二重加算を防止。
- **確認状態**: 同期spawn時点のロジックと実配線のbirth packet再生を確認済み（render cadence比較は未実施）（`patches/splatoon3/tests/shooter-spawn-velocity.test.mjs`, `patches/network-replication/tests/shooter-spawn-replay.test.mjs`）。Switch実機との直接フレーム映像比較は未確認。


## 2026-10-06 — #626 roller roll-stop action interruption (main 16F / sub 5F / squid 6F)

Base: main `3d8a48d3`. Reference: Splatoon 3 Ver. 11.3.0, and the S3 verification table `検証/メインウェポン/前隙・後隙`, 塗り進み (rolling) interruption row. These are community frame measurements, not pinned 11.3.0 parameter-table fields, and they are a different quantity from both the horizontal/vertical swing post-lag and the rolling ink-recovery lock (#176).

**Source status, stated plainly.** The cited page returned HTTP 403 on the 2026-10-06 re-fetch, so this entry does not claim the three numbers were independently re-verified. They are recorded with their source URL, their `/60` frame conversion and their endpoint convention, and the profile `calibration.unverified` list now says so. They are the same kind of community-frame calibration as the existing `rollBaseSpeed` / `rollDashTime`, not a stronger claim.

The root was real and in the installed path. `WeaponRunner._roller()` cleared `rolling` to false and armed nothing; `busy()` contains only `charging || flick >= 0 || slosh >= 0 || streaming || dodge || lockT > 0`; and the Actor form gate reads only that `busy()` set. After a roll longer than 1.5 s the swing cooldown has already run negative and `firingT` has expired, so main, sub and squid all became admissible on the next fixed tick. None of the three windows existed.

An explicit roll-stop interruption now arms on the authoritative `rolling` true-to-false transition and holds three independent absolute deadlines. Main admission is filtered on the roller runner's own input, so a buffered press survives but cannot become authoritative early; the sub gate likewise filters `sub` and `subReleased`; squid admission is filtered at the locked Actor form decision. Deadlines are absolute rather than decremented, so the boundaries do not drift with the render rate, and the comparison carries the same `EPS` the movement clocks already use, because `G.time` accumulates float error across fixed ticks and an unguarded `now < deadline` made the boundary tick itself wait one frame more.

**Endpoint convention, documented as the acceptance criteria require:** the roll-end tick is frame 0; frame N is the Nth fixed tick after it; the action is first admitted on frame N. So main is admitted on frame 16, sub on frame 5 and squid on frame 6.

**What deliberately does not arm.** A dry roll (ink exhausted, #541) does not arm it: since the #541 correction the established roll persists with no ink, so there is no roll stop at depletion at all, and a later dry release still carries no ink-gated stop. A roll released directly into a flick does not arm it either, because that is the existing roll-to-swing transition rather than a roll stop. A roll that ends because the actor left the ground also does not arm it; that transition has no source in this record and is listed as unconfirmed below.

Verified by dedicated 9/9 over the real composed modules. The sourced windows are asserted as three distinct constants and the pure predicate is checked directly at 0, 5F, 6F and 16F. The roll-end tick arms exactly one interruption with all three deadlines one `/60` unit apart from their own tick. A buffered press held through the window starts no swing and restarts no roll before frame 16 and starts the swing exactly on frame 16; the sub does not arm before frame 5; squid is not entered before frame 6. A dry roll and a roll released into a flick arm nothing. Roll speed, dash timing, both swing winds and intervals, both swing ink costs, roll ink per meter, near-swing damage bands and vertical damage bands are all unchanged while gated, and `reset()` clears the interruption. Ownership is per runner: a remote opponent on the same path gates its own actions on the same 5F sub window, the gate does not reassign or re-team the actor, and a gated remote actor neither arms nor blocks the local one. 30/60/120 Hz render schedules produce the same trace, and the boundary is asserted to be the sourced 16 fixed ticks at each rate rather than merely self-consistent between them.

With the gating itself disabled while the exports remain, the same suite fails 7 of 9 and exits 1, so the suite measures this behaviour rather than restating it. Four test-only defects were found and corrected while building it, not worked around: a tick index read as `clock.ticks - 1` inside a `FixedClock` callback that increments after invoking it, a roll-end timestamp captured one tick early, an initial `flickFrame` helper that the strengthened 30/60/120 assertion replaced, and a first draft of the remote assertion that read `owner` off the runner when it belongs to the actor and is only populated by the network layer. None indicated a product defect. Existing roller, weapon-edgecase, integration and movement-composition suites remain at 74/74 with the owned file included. These are VM tests over the real composed modules, not a browser session, a human play session, or a hardware Splatoon 3 comparison.

Unconfirmed: whether S3 applies the same windows when a roll ends by jumping or by any other non-deliberate route; whether the three numbers are unchanged in 11.1.0 through 11.3.0, since the update notes for those versions list no roller roll-interruption change but absence is not confirmation; and the exact endpoint convention of the source table, which this implementation fixes as roll-end-tick-is-frame-0. Rain-paint and damage volume were not revisited.

## 2026-10-06 — #626 correction: the roll-stop window must own the stop frame itself

Base: `dc736e19` (the entry above). Reference: the same community frame table and the same three numbers; nothing about the sourced values changed, and they stay unverified exactly as recorded above. What changed is the tick on which the window starts owning.

**The defect.** The first #626 change armed the interruption inside `WeaponRunner.prototype.update`, after it had already run. The real `Actor.update` picks its form first (`wantSquid = intent.squid && !fireWins && !this.weaponRunner.busy()`) and only calls `this.weaponRunner.update(...)` much later in the same tick, so on the roll-end tick the Actor wrapper checked `runner.s3RollStop` while it was still `null`, and the runner's own sub filter checked it at entry while it was still `null` too. Releasing fire and pressing swim on that same tick therefore entered squid on the spot, and releasing fire and pressing sub on that same tick armed the sub on the spot. The nine existing tests drove the runner directly with an empty stop tick between the release and the request, so they described a frame that a real player never produces; they passed against a gate that does not hold in the composed path.

Reproduction, over the real `Actor` and the real `installRollerLogic`, in the installed worktree before the fix: 220 fixed ticks of an established roll, then one tick carrying release+swim gives `form: "squid"`, and release+sub gives `aimingSub: true`, both with `s3RollStop` armed at `sub 3.7666… / squid 3.7833…` against `G.time 3.6833…`, i.e. both windows still open.

**The correction.** The stop is now detected ahead of the tick instead of after it. The runner arms before its own update, and the Actor arms before its own update too, so the form decision already sees the lock. The estimate is only the same `canRoll` terms `_roller` recomputes (`rolling === true`, no `fire`, `grounded`, `ink > 0.5`, `flick < 0`), and it is discarded again after the real update whenever the roll survived, so it never decides the roll. A tick that armed the lock is deliberately not filtered on `fire`: its own `inp.fire` is what stopped the roll, and filtering there would make the prediction self-fulfilling. The Actor reads the same estimate from `intent.fire || fireBuffer > 0`, the raw terms its own fire construction uses, rather than re-deriving that construction.

Unchanged on purpose: the 16F / 5F / 6F boundary definition and its roll-end-tick-is-frame-0 endpoint convention, the dry-roll (#541) and roll-into-swing exceptions, `reset()`, per-runner ownership and remote isolation, the gameplay values, `busy()`, ink recovery and physics. `busy()` was not extended; it would also have paused ink recovery and entangled this root with #176.

**Coverage added.** Four tests, bringing the owned file to 13. Release+sub on the stop tick arms nothing on that tick and arms exactly on frame 5, through the real `Actor` and again straight through the runner with no `Actor` above it. Release+swim on the stop tick keeps `form: "kid"` and enters exactly on frame 6. The negative control: a buffered pop-out shot on the release tick still carries fire, runs into the existing swing and arms nothing, which is what stops the estimate from arming on a tick that is not a stop. And the same-tick boundaries are asserted to be exactly 5 and 6 fixed ticks after the stop tick at 30, 60 and 120 Hz, through the real `Actor`, not merely self-consistent between the rates. With the corrected `roller.mjs` reverted and the exports left in place, those three fail and the suite exits 1, so they measure this behaviour rather than restating it; the negative control passes either way, as a negative control should.

Two test-only defects were found and corrected while writing them, and neither indicated a product defect: a first draft of the buffered negative control that expected the roll to survive, when the real `Actor` turns the buffered press into `firePressed` and therefore into the existing roll-into-swing transition, and a roll-end detector that recorded tick 0 because the roll had not started yet. Neighbour suites `roller.test.mjs` and `weapon-edgecases.test.mjs` stay at 27/27. These are VM tests over the real composed modules, not a browser session, a human play session, or a hardware Splatoon 3 comparison.

Still unconfirmed, unchanged from above: the three numbers themselves, whether S3 applies the same windows when a roll ends by jumping or any other non-deliberate route, and the source table's own endpoint convention. Not verified here: that a player pressing swim on the exact frame the roll ends is common practice at all — the correction follows this entry's own frame-0 convention, and if the real endpoint is instead the frame after the release, both the pre-fix and post-fix admission would shift by one frame.

## 2026-10-06 — #735 Ink Storm lower vertical damage cutoff (partial skip, not implemented)

Base: main `3d8a48d3`. The root is real and was confirmed in the installed path. `Projectiles._updateClouds()` filters a victim by horizontal radius, by an upper bound only (`e.pos.y > c.group.position.y`) and by `G.physics.los`. There is no lower vertical test, while the rain-paint path directly above it raycasts only 12 world units downward. A victim therefore keeps taking 24 HP/s however far below the cloud it stands, wherever LOS stays clear. That is a downward-unbounded damage cylinder instead of a vertically bounded rain volume, and it changes HP, splat credit, regeneration timing and route denial.

It is not implemented in this round because the numeric lower cutoff has no source. The pinned Ver. 11.3.0 `WeaponSpInkStorm` table as curated in this repository exposes exactly two `CloudParam` fields, `RainyFrame.Low` 480 and `DamageRadius` 10.0; no vertical reach field is present, and `profile.specials.storm` carries only `duration` and `radius`. The `GameParameterTable.json` original is not cached in this repository and was not re-fetched this round. The report itself states that it deliberately invents no world-unit value and that the cutoff must be pinned from 11.3.0 data or reproducible current-version measurement first, and it explicitly forbids reusing the existing 12-world-unit paint ray as the damage cutoff without evidence.

Adding an unsourced calibration number would satisfy the numeric provenance check mechanically while fabricating a Splatoon 3 value, so it was not done. The issue was deliberately not claimed, so another lane may take it once a source exists. No open or draft PR resolves this root either: PR 668 works on rain-damage arbitration (stacking storms, ghost and remote ownership) and PR 760 on storm paint radius (#757); both are different roots. This entry stays recorded as unconfirmed and unowned.

## 2026-10-06 — #363 / #367 persistent right-shoulder framing

Base: main `c9b1c022`. Both issues carry identical titles with zero comments and zero assignees, so this is one root with two IDs. Both were claimed (owner C) before editing and implemented once; the claim comments are issuecomment-6008543111 (#363) and issuecomment-6008543427 (#367).

**S3 basis.** In Splatoon 3 the gameplay camera is framed over the character's right shoulder during ordinary play: the character's head sits left of the centre crosshair and the visible area extends to the right, which is what makes the right-hand flank coverable while aiming. That qualitative framing is observable in play and is not a naming, palette or character-appearance difference. **No official numeric shoulder offset is published, and none is pinned in this repository** — `patches/splatoon3/reference/curated-numbers.json` carries only `camera.gyro`, with `status: unknown` and no sourceId, and a web search for an authoritative offset returned nothing usable. The magnitude below is therefore explicitly **unquantified** and must not be read as a Nintendo constant. Splatoon 3 is referenced at version 11.3.0 in this repository's own profile, not captured from hardware here.

**INKWAVE implementation.** `inkwave-public/src/game/cameraRig.js` `_follow()` derived the shift from `closeK = clamp((2.8 - curDist) / 1.8, 0, 1)` and `shT = 0.55 * closeK * closeK * (3 - 2 * closeK)`. `closeK` reaches 0 at `curDist >= 2.8`, and an unobstructed boom settles at `this.dist = 4.5`, so in normal play the term was identically zero and the lens sat on the pivot's vertical centre line. The over-the-shoulder code existed, but only as a wall-proximity nudge. The fix is a fail-closed `replaceOnce` in `patches/local-quality/adapter.mjs` (`rel === 'src/game/cameraRig.js'`) adding a persistent baseline `SH0 = 0.28` while keeping the obstruction-driven term at its full original range: `shT = SH0 + (0.55 - SH0) * closeK * closeK * (3 - 2 * closeK)`. `inkwave-public/` stays byte-locked: the worktree blob equals `HEAD:inkwave-public/src/game/cameraRig.js` = `4aa0afe836d5e178002cbc08239727fd3868b9f4`.

**Repro.** Normal follow at any heading with nothing behind the player: before, `rig.shoulder === 0` and the head projects onto the crosshair axis; after, `rig.shoulder === 0.28` and the head sits 0.28 m to the camera-left of that axis, i.e. you look over its right side. Squid, swim, climb, super-jump flight and a moving remote actor all behave the same way.

**Gameplay impact.** Rendering only; movement, collision, damage, weapon timings, ink and the authoritative aim direction are untouched. The offset is a *parallel* translation: the lens and the look-at target move by the same camera-right vector, so `lookAt` still orients down the rig's aim. This is measured fact, not claim. Across 10 scenarios (idle, steep look up, looking down, both strafes, squid, swim, super jump, Charger, wall) the adapted and raw builds have identical `pivot`, `pivotY`, `curDist`, `wantDist`, `zoom`, `fovKick`, `kick`, `trauma`, `lensLift`, `side`, `hgt`, `boom`, `sx`/`sy`/`sz` and FOV on every settled frame; the rendered view directions agree to `|dot| > 1 - 1e-9` on every frame; and each frame's lens lands on the exact documented decomposition `pivot - fwd*curDist + (0, 0.15 + lensLift, 0) + _right*shoulder` with residual < 1e-9 for both builds, so the shoulder is the only term that moved. Explicitly preserved: muzzle-to-target parallax (the lens-to-player ray stays non-parallel to the aim, with the lateral term equal to the shoulder, rather than collapsing onto the lens); right-side obstacle avoidance (a wall 0.30 m out still clamps the lens to stop 0.25 m clear, and an out-of-reach wall leaves it alone); input axes (`rig.yaw`/`rig.pitch` remain input-owned outside super-jump flight, and the offset stays in the camera-right plane at every heading); and the Charger zoom profile (`zoom` reaches 14, boom 3.9, FOV unchanged, partial-charge `charge*6` ramp identical to upstream). The fully obstructed boom still reaches the original `0.55` endpoint, so the pre-existing wall-proximity behaviour is preserved exactly, and the monotonic ordering clear < mid < tight is retained.

**Confirmation status.** 17 native tests in `patches/local-quality/tests/camera-shoulder.test.mjs`, green (exit 0), driving the shipped rig through the exact production adapter chain `adaptRange(adaptNetworkSource(adaptQualitySource(adaptReliability(adaptTouchLayout(adaptSource(...))))))` against a real `THREE.PerspectiveCamera`, with the rendered direction read off the camera quaternion rather than re-derived locally. Baseline-negative control: reverting only `patches/local-quality/adapter.mjs` and keeping the tests makes **12 of 17 fail (exit 1)**; the 5 that still pass are exactly the invariants that must hold both before and after (aim exactness, the preserved 0.55 obstruction endpoint, upstream being vertically centred). The offset was verified frame-rate independent at 1/30, 1/60, 1/120 and 1/144 s. Owned focused suite `patches/local-quality/tests/*.test.mjs`: 175 tests, 173 pass, 0 fail, 2 pre-existing skips (exit 0). Practice Range 27/27, loading-cache 31/31. `scripts/check-inkwave-patches.mjs --quick` exit 0, reference 11.3.0. A real `scripts/build-inkwave.mjs` build succeeded (exit 0) and `scripts/check-inkwave-startup-budget.mjs _site` passed (exit 0; 190 precached modules, 4 565 239 precache bytes), with the emitted `src/game/cameraRig.js` containing both the persistent baseline and the preserved 0.55 endpoint.

**Not confirmed.** No Nintendo console capture and no browser run were performed: these are VM logic fixtures plus a deterministic static build budget, not a physical Splatoon 3 comparison, and the AGENTS.md requirement to check the behaviour at different frame intervals was met by the 30/60/120/144 Hz logic runs rather than by real hardware. The exact Splatoon 3 offset, and whether it varies with player state or camera state, remain unmeasured. No new ground rules, full-suite rerun or separate CI run was launched; combined emitted and browser acceptance belongs to the integration batch.

## 2026-10-06 — #724 Roller reticle from pinned official imagery

Replace the obsolete unconditional 160px wide bracket/lower-arc SVG with a compact ring plus four diagonal strokes in the existing 80-unit canvas. Official Nintendo Roller image `https://www.nintendo.com/jp/ichikara/av5ja/photo/01/027.jpg`, 1280x720, sha256 `349f7c9f8fba19d074adbbbc873fbd9db0b0f46d2ac863a24240b982d0183750`: pinned center(649,333), ~13px ring, four strokes at(+/-45.2,+/-22.7)px. The adapter preserves relative placement normalized to the ring; it does not assert present-version Switch pixel equality, opacity/weight, or any unsourced transient flick state. DOM regression executes the installed HUD and rejects obsolete geometry; other weapon silhouettes and gameplay values remain unchanged.

The first source-agent CV verdict missed the gray semi-transparent reticle with a near-white threshold. Parent directly inspected the pinned image; the corrected measurement and relative-geometry implementation supersede that verdict. Original source/evidence remains preserved outside this PR, with `superseded_analysis` in the reference manifest. No speculative Roller paint/protocol changes are integrated. See `patches/splatoon3/reference/roller-reticle-presentation-2026-10-06.md`.

## 2026-10-06 — PR787 partial Dualies recovery connections on PR818

Refs #738 and #741 only. Fixed target PR818 7045fb238eaeed09d5e04161de88d5b01ab9bca1 (tree 52e07765bfb32d08be4e90b88fa03eca6896d291); source PR787 d0e7854f00803219b8940d190d45893a7d3094a5. The two existing local fixes are ported as narrow hunks: failed extra dodge cannot fall through to humanoid jump while dodge/lock owns movement, and held ZR no longer prevents roll resource refill after that owner ends. Existing successful chained dodge, squid/other-weapon jumping, ink ownership and turret state remain covered by the original 12 source cases.

The target's newer post-roll firing owner is preserved: s3DodgeShotPending still suppresses firing for four ticks, and actual Projectiles.fireDualies still establishes the independent four-tick s3DualiesPostShot busy gate. The refill is added after the target's roll-completion block without replacing its pending countdown, early return, cancellation or shot wrapper. No numerical parameter changes. Six added source cases cover 30/60/120 Hz fixed schedules, first shot at pending tick four, refill at existing lock expiry, actual projectile-induced postshot countdown, release/sub/reset cancellation, and separate old-jump/old-refill negative controls. Original tests 12/12, added tests 6/6. Source fixtures execute native Actor/WeaponRunner/Projectiles with display/collision surfaces bounded; this is not emitted-browser or physical-device acceptance. No new build or CI was run for this candidate.

The complete Splat Dualies 4F startup + 12F roll + 32F recovery comparison remains dependent on #477. PR786 416f7eb20cc635e85de3a0bd6f8c9454319eb282 has not incorporated startup bridge 067180486b58f8e0f524c1a46720999ba66a238b. Neither that 47-file batch nor the bridge is included here. The existing reference's measured version and physical v11.3.0 limitations remain; this connection does not certify total 48F fidelity or fully resolve/automatically close either Issue.

## 2026-10-06 — Online Splat Bomb damage owner (#355)

| 比較項目 | 記録 |
| --- | --- |
| 本家参照 | Splatoon 3 Ver.3.0.0 を対象にした、プライベートマッチのさんぽ中に被弾側を一時停止する実機検証では、スプラッシュボム近爆風180／遠爆風30のダメージ判定を被弾側としている。[検証方法と表](https://smssmooth.hatenablog.com/entry/2023/03/05/151247) は非公式の実機検証で、任天堂の公開仕様ではない。記事にはブキ以外のギア条件が記されていないため、ギア条件は不明。Ver.11.3.0実機で同じ判定試験を行ったとは扱わない。 |
| INKWAVE 基準・実装 | main `f31f5da439134fe49bb89018dad5557671a49c67`。locked `inkwave-public/` は変更せず、Network adapter が `src/game/weapons.js` の `applyHit/_explodeBomb`、`src/net/netmatch.js` の `shouldApplyHit/_hit`、`src/game/actor.js` の `spawnAt` に接続する。damageBands、爆風半径、LOS式、塗り権限は変更しない。 |
| 再現条件 | 現行の公開ランタイムを adapter-compose した二つのVM fixture。通常対戦、ギア／armor／spawn無敵なし、攻撃側のremote被害者へのbomb routeを抑止し、被弾側自身の距離9（範囲外）／5（範囲内）を比較。完全な逆向き二台対戦の組み合わせではない。別のfocused testで実Projectilesの爆発距離・LOS、ordered birth重複、life遷移を確認する。ロジック測定であり、遅延を入れた二台ブラウザやSwitch実機ではない。 |
| main での差分と影響 | `shouldApplyHit` は従来、攻撃側の `remote` 位置でボムも判定し、攻撃者が送るdamage値を被害者ownerが適用していた。被害者側ghostはdamageをdropしていたため、視点のずれで爆風外の被害者が減る／爆風内なのに減らない。修正後は被害者ownerのghost爆発だけがそのowner配下のactor位置とLOSを使う。攻撃側のボムhitは送らず、旧形式のボムhit packetも無視する。既存のordered event sequenceをbomb birth IDに使い、爆発時刻より後に始まった被害者lifeへの遅延damageを落とす。通常弾の攻撃者判定、Storm、owner paintは別経路のまま。 |
| 確認状態 | 逆向きの5／9視点再現は `codex3-r27-network-range/issue-355-current-main-repro.json` に修正前の結果を保存。修正後は専用fixture 3/3を通過。二台の本番relay動作、ネットワーク時計offsetの実機誤差、Ver.11.3.0 Switch比較は未確認。非致死bomb hit markerは複製しない。kill confirmationは既存splatted経路を使う。 |
## 2026-10-06 — #160 enemy-ground Swim form

**Reference.** Compare against Splatoon 3 Ver. 11.3.0. Nintendo's [official update history](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/p/1076/c/950) lists Ver. 11.3.0 as released on August 19, 2026. Nintendo's [official gameplay guide](https://splatoon.nintendo.com/en/gameplay/) describes Swim Form as movement through the player's own ink and identifies own-ink wall climbing, fence traversal, and ink refill as Swim uses. The published official guide does not give a transform-frame value or spell out enemy-ground exit timing; those remain unmeasured on Nintendo hardware for this entry. Conditions compared here: Inkling actor, Shooter, default profile with no added gear modifier, grounded on a flat enemy-painted floor while Swim remains held. No Nintendo speed, HP, or timing number is inferred.

**Published INKWAVE path and fix.** At main `f31f5da439134fe49bb89018dad5557671a49c67`, `inkwave-public/src/game/actor.js` selected `isSquid` from held Swim before refreshing the current ground surface. A grounded enemy-ink result therefore left `form === 'squid'`; the selected form flowed into `_horizontal`, `_integrate`, and `_resolve`, including squid body height and grate-skip collision. The build adapter in `patches/splatoon3/adapter.mjs` now refreshes `_surface()` before form selection and gates ordinary Swim entry only when `grounded && groundTeam === 2 && !climbing`. Existing Fire ordering, weapon-busy handling, and ability-owned early-return paths remain in place. `patches/splatoon3/runtime/resources.mjs` continues to classify the post-movement surface and apply its existing enemy-ink speed/damage/recovery rules without changing form.

**Native geometry lifecycle and reproduction.** The native ground hit describes the last resolved actor position at the start of a tick. When movement crosses an own/enemy paint boundary, that crossing tick finishes with the prior own-ground form and the native physics step it had already selected; post-movement resource sampling records the new enemy surface. On the next grounded Actor tick, `_surface()` observes that hit and the adapter selects kid form before movement and collision. Reproduce with the native `Actor` and `Physics`: hold Swim on own ink, move across a flat paint boundary, continue holding on enemy ink, then return to own ink. A sampled enemy surface selects kid form. Own ink admits submerged Swim; neutral ground permits dry squid form. The source regression also checks the humanoid body/grate admission arguments, contact damage, no repeating emerge sound, own-wall climbing, jump-to-air behavior, newer Fire priority, weapon-busy admission, and Super Jump form ownership.

**Confirmation.** `patches/splatoon3/tests/issue-160-enemy-ink-form.test.mjs` executes raw-main and installed native Actors against real `Physics` floor geometry in the source fixture. Raw main retains squid collision on enemy ground; the pre-fix installed acceptance assertion failed (`'squid' !== 'kid'`, exit 1). The fixed focused file passes 6/6, including own/enemy boundary entry and return at 30/60/120 Hz, remote Actor collision, and death/respawn lifecycle. Related contact, refill, and native-grating controls in `movement-resources.test.mjs` pass 3/3 when selected by name. The full neighboring file is 22/23; its remaining pure `rollLaunchSpeed` assertion fails independently (actual 20, expected 17), and neither its helper nor expected formula is changed here. `scripts/check-inkwave-patches.mjs --quick` stops at the existing numeric-status-stale check on the task base; profile and numeric-status inputs are unchanged by this task. This is source-level logic evidence; a browser build/run and Switch capture were not performed. The one actor tick between crossing the paint edge and consuming the new grounded sample is recorded rather than treated as a measured Splatoon transform duration. Numeric movement, HP, slip-damage, transform, and ink-distribution tuning is unchanged.


## 2026-10-06: Restore PR761 collision/Charger gaps (#606/#617/#680)

Against PR868 2e81e219, restore only these three missing roots from PR761 afdba0d7. Collision scratch retains geometric contacts while avoiding per-query collections (three regressions). Launch speed maps the minimum legal charge coordinate 1/6 to the extracted minimum, preserving the full endpoint, current flight damage snapshot, feet paint and 16F recovery writer. The minimum shot is eight charge ticks after the current fresh 1F startup.

The 1F release gap latches already-paid charge without reinstating old release-only ink accounting. Reset, sub-minimum release, submergence and intervening special ownership retire it. The current outer weapon gate recognizes the pending release and keeps rechargeDelay authoritative. Existing idle resource-phase recovery during the gap is retained. Motion detail requires frame81 after frame80 release, rejecting both same-tick and extra-tick counterexamples.

Validation: collision3, actual finite-flight launch3, actual Actor release/cancel/clock9 and motion-detail semantic gate1 pass. Related source fixture edits preserve current short-tap cancellation and progressive payment; complete production install/CI remains a separate acceptance step. No new coefficient, GPU capture or hardware claim. Other PR761 roots remain a separate handoff.


## 2026-10-08 — Remote Squid Roll presentation (#1062)

| 比較項目 | 記録 |
| --- | --- |
| 本家参照 | Splatoon 3 Ver.11.3.0（任天堂の更新履歴で2026-08-19公開）。[任天堂の更新履歴](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/)、[公式ゲームプレイ案内](https://splatoon.nintendo.com/en/gameplay/)、[公式の基礎指南](https://splatoon.nintendo.com/en/news/beginner-basics-for-splatoon-3-tips-for-improving-in-battle/) を参照。ゲームプレイ案内はインク内を泳ぎながら反対方向へ素早く跳ぶ動作を説明し、基礎指南は泳ぎ中に左スティックを逆方向へはじき、インクが跳ねた時にBを押す入力と、実行直後のダメージ軽減を説明する。継続時間、関節角度、通信方式のフレーム値は公開されていない。ブキ・ギア条件を伴う実機比較は未実施で、公開資料から数値を推定していない。 |
| INKWAVE 基準・実装 | main `c2c938b9af5b6cce2a7bdbecf0415c7c3836cadb` の公開ソースに変更なし。フル production adapter composition では所有側 `movement.mjs` が実際のRoll行動を判定し、Network adapter が既存22要素actor rowとは別の任意 `sq` sidecar に action identity・残り時間・launch vector を載せる。受信側はその値を `remoteSquidrollVisual` に保持し、`movement-motion.mjs` がCharacter frameのremote-only actionとして読み、`squidroll-motion.mjs` が既存pose経路で描く。sidecarは `s3.actions.roll` に書き戻さず、Roll入場、armor、damage、速度、衝突には使用しない。 |
| 再現条件 | `patches/network-replication/tests/issue-1062-remote-squidroll.test.mjs` は公開 `Actor`、`Character`、`NetMatch` とS3 runtimeを、Splatoon 3・Touch Layout・Reliability・Local Quality・Network Replication・Practice Range の6 adapter合成で実行する。平坦な自インク上でOwnerがイカ状態になり、INKWAVE harness内の水平速度11.52、逆方向+B、60Hzの実更新でRollを起動。20Hz snapshotをRemoteに渡し、30Hz/120Hzの更新刻み、遅れて参加したobserver、連続Rollを確認。Shooter harness・追加gear modifierなし。本家の速度値を表す条件ではない。 |
| 差分とプレイへの影響 | 修正前は一度だけ届く `squidroll` trigger event の後、次のCharacter frameに持続actionがないため、RemoteのRoll poseが消えた。修正後は同じidentityをもつowner snapshotをRoll中に補間し、受信済み残り時間からposeを開始するので、遅延参加でも毎回最大時間から始めない。新しいRollは別identityになり、stale tick・重複eventは既存のpacket timestamp/event sequence gateにより年齢を巻き戻さない。legacy row / metadataなしも受理し、旧peerに新しいaction authorityを要求しない。 |
| 確認状態 | フル合成VM regressionでowner admission、remote `_receive`→sample→`applyRemote`→`_finishFrame`、launch direction、持続、late join、chain、invalid/legacy metadata、cancel/form/death/respawn/ownership/disconnect、ordinary jumpを確認。armor flag と既存 ownership handoff のfocused controlも実行対象。ブラウザ実動作、遅延を含む二台通信、Nintendo実機・captureは未確認。公開映像から厳密なjoint curveやdurationが分かるとは判定していない。 |

この結果は、INKWAVEのネットワークpresentationが同じowner Rollを継続表示することの確認であり、ローカルRoll admissionや任天堂実機との時間・pose一致を証明するものではない。


## 2026-10-06: Restore fidelity centerline convergence (#608)

PR #761's missing convergence delta is restored against `2e81e2197faf0995ec2f55f2ba36ffd562f3fb41`. The target already disabled the legacy `_ballistic()` lift, so its zero-spread, stationary grounded Shooter fired along the camera-derived ray and crossed a level target 10.5 INKWAVE units from the muzzle 0.160198 units low. The two Shooter/Dualies/Splatling launch call sites now call `fidelityAimConvergence()` before spread. It predicts through the existing `advanceFidelityProjectile()` law, uses the existing `fidelityMoveFor()` record owner, and retains the production 1.2-second lifetime and bounded pitch search from #761. Collision and teammate pass-through ownership are untouched.

The existing Shooter/Splatling and per-hand Dualies guides now use the same deterministic convergence before their `ShotGuideFrame` prediction. A direct port without these call-throughs left the Shooter guide 0.169533 units from the actual converged round at +8F for the reachable 10.5-unit target; the new guide-parity regression covers all three families and both Dualies hands. Existing out-of-range guide cases did not exercise that mismatch.

Reference conditions remain Splatoon 3 Ver. 11.3.0, Splattershot/Splat Dualies/Heavy Splatling, no gear effects, grounded humanoid, stationary, zero spread, and default uncharged Splatling. The inherited [#761 source-field reference](../patches/splatoon3/reference/weapons-fidelity-reference.json) and [pinned weapon parameters](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponShooterNormal.game__GameParameterTable.json) are unchanged. Focused production-module tests verify target crossing within 0.02 world units at 30/60/120 Hz rendering, changed movement-record sensitivity, finite unreachable-target fallback, and guide parity. This establishes INKWAVE model consistency only: Nintendo camera compensation, Switch trajectories, device behavior, and uncertain brake/free-flight defaults remain unverified.

### Additional completed source roots in this fixed set

Restore PR761 #622 pool-owner retirement and #679/#686 six-frame Splatling interruption through the dedicated cancellation/refund owner; all normal/ghost recycling sites route through owner-null retirement. The current whole-round reservation, only-once unused-ink refund, charge boundaries and uninterrupted cadence remain authoritative. Restore PR782 #707 offline-pause clock guard. These are the only additions to the fixed #606/#617/#608/#680 set. Source roots #744/#728 and new #870 are deliberately held outside it.

Evidence retained: lifetime3 (network composition requires the separately owned Kit bomb-life connection); interruption16 plus explicit refund-once1; pause5. The complete eight-root set remains a focused source acceptance, not an emitted/browser/full-CI claim. PR781/784 shared kit, Storm and dedicated weapon ownership is retained rather than overwritten.


## 2026-10-06: Restore Super Jump charge resources and remote-support guards (#744/#728)

PR782's missing charge-phase resource connection runs the existing resource owner once on each tick that starts in charge while alive. Flight keeps its existing skip. Current humanoid startup22F plus charge80F, enemy-ink grace reset, invulnerability and current damage precision remain unchanged. No new timing or resource coefficient is introduced.

The source remote-support guard tests are restored without an additional remote runtime rewrite: actual NetMatch playback keeps the newest supported ground point, excludes airborne/climb/flight samples, clears it on remote respawn, and requires a new supported sample before reuse.

Five full composed-source cases pass on the fixed ready composition (782-current-source-final.log,74.27s): three charge resource/admission/fixed-cadence cases and two actual remote playback/respawn cases. This relies on the separately owned current Map/Aim/427/482/484 and other accepted composition connections; they are not duplicated in this delta. No complete browser or emitted acceptance is claimed. Offline pause707 was handed off separately and is not added again.

## 2026-10-06: Partial Charger teammate obstruction (#870)

Targeted against PR868 `aa094850fdd60b3b70adfdaad54b3e3837cb1402`, whose Charger flight blob is `109e106f1aa36de1e5b875ab2fc8b1327e5338cf`. The actual installed finite-flight solver previously excluded every same-team actor before capsule testing. With the shooter at z=0, ally at z=3 and enemy at z=6, charge0.5 invoked the enemy-hit callback with60 damage through the ally. Full charge invoked160 as its intended piercing control.

Partial flights now include living allied capsules except the firing Actor itself. They use the existing continuous capsule query, existing pinned player radius0.125 and earliest-contact / actor-ID tie ordering. An allied contact consumes the non-piercing flight without calling friendly damage or publishing that ally as an enemy-hit victim. Full shots retain teammate pass-through and enemy piercing; ghost flight remains visual-only. No radius, charge threshold, damage, payment, cadence, flight distance, network packet or source-authority rule is changed.

Seven focused production-module tests cover blocked partial, off-ray control, the existing .999 full threshold, both sides of the .125 contact-radius boundary, wall / actor ordering and actor enumeration reversal, ghost non-authority, and30/60/120Hz rendering over fixed steps. They instantiate native Actor/Projectiles and Physics; the hit callback is recorded at the solver boundary. This is not a full recipient HP/network acceptance test or a Switch measurement. The behavior requirement follows Issue870's current-series teammate-bodyblock evidence and the existing partial/full distinction; the questionable .999 threshold remains explicitly unchanged. Full build/browser/CI acceptance belongs to the next integration batch.

## 2026-10-08: online actor-state adoption (#1018/#1029/#1059/#1063)

**本家参照と条件。** 比較対象は Splatoon 3 Ver.11.3.0。[任天堂の更新履歴](https://support.nintendo.com/jp/switch/software_support/av5ja/1130.html)と[公式ゲームガイド](https://splatoon.nintendo.com/en/gameplay/)を参照し、スーパージャンプの初期フォーム・チャージ・飛行の数値は既存 #708 記録の通り公開コミュニティ検証値として扱う。今回の状態確認条件は、ギア追加なしのヒト状態からのスーパージャンプ、シューター被弾後のHP回復、受理済み致死被弾、フルチャージ Heavy Splatling の連射中。プレイヤー離脱後にホストが操作を引き継ぐ通信規則は INKWAVE 固有で、Ver.11.3.0 の公開資料に同等の bot 所有移行規則は見当たらない。したがってこの修正や VM 結果を本家の通信挙動一致とは判定しない。

| Issue | 公開版 INKWAVE の差分と実装 | 再現操作とプレイへの影響 |
|---|---|---|
| #1018 | `src/net/netmatch.js` の離脱時 adoption は位置を表示状態に合わせる一方、`weaponRunner.reset()` と `superJumpState = null` で受理済み飛行状態を消す。`patches/network-replication/adapter.mjs` は飛行相・経過時間・飛行時間・始点・終点を追加送信し、ホストの `_adopt` 後にネイティブ軌道を復元する。S3 の既存飛行中ダメージガードは維持。 | ヒト状態で固定地点へ発進し、相手側が飛行中の snapshot を受信してからその peer を離脱させる。ホスト bot は受け取った終点へ残り軌道を継続し、通常のネイティブ着地を行う。イベントの行先ヒントを除いた packet でも終点を維持する。 |
| #1029 | HP 値は既存行で送るが、`Actor.lastDamage` の経過時間は送られず、adoption 後に古い回復時計が残る。追加状態は送信時刻に対する回復年齢を持ち、受信・サンプル・引継ぎで同じ年齢を保つ。非有限値は送信時に60秒へ上限化し、受信側も有限範囲を検証する。既存のHP減少後の回復判定は変更しない。 | シューターでHPを減らした直後、回復待ち中、待ち時間経過後、非常に大きい有限年齢の各行を受信させる。早い hit は引継ぎ直後に回復せず、既に待ち時間を過ぎた hit は既存レートで回復を続ける。回復定数は変更しない。 |
| #1059 | 致死判定は通常 `damage-timing.mjs` の内部 pending map に1固定 tick保持され、Actor行に含まれないため、その間に所有権が変わると受理済みhitの原因・攻撃者・sequenceが失われる。`[life, sequence, attackerNid, cause]` を転送し、同じlifeとhit identityの pending splat として一度だけ復元する。 | HPが0以下になったがまだ alive な victim を含む snapshot を受信して離脱させる。ホストの次固定tickで原因を保って1回だけ splat し、deaths/splats と first-splat authority を一度だけ更新する。古いowner、新life不一致、古いsequence、重複時刻、NaN行は拒否する。 |
| #1063 | Splatling runner は全連射分を先に引き落とし、未消費額と連射進行を `s3Spin` が持つ。通常の遠隔 Actor 行にはその予約がなく、adoption reset 後に未消費インクを復元できない。追加状態で予約額・残額・経過・発射数・総数・残り時間・実インクを運び、今回の移行では未消費分を正確に返金してstreamを終了する。 | フルチャージ後に連射を開始し複数弾を発射してから所有者を離脱させる。ホストは発射済み分の料金を維持し、未発射分のみ返金する。追加の弾・hit・paint・二重返金を起こさない。 |

**Wire schema と統合境界。** 既存 actor field `0–20` は保持し、現在の special-use count `row[21]` も保持する。新しい独立slot `row[22]` は `['inkwave-adoption-v1', life, sequence, tick, recoveryAge, jump, lethal, splatling]`。`jump` は16値で phase/elapsed/duration/from/to/marker/startForm/target kind・ID・座標、`lethal` は4値、`splatling` は8値。owner life sidecar、outer timestamp replay gate、既存 event sequence / event・projectile・actor field は変更しない。旧21/22値行を受け入れ、新23値行は tag・life・sequence・値域が不正なら採用せず、他の長さも拒否する。#1062 の visual Roll 拡張は別所有のslot/helperを前提にしており、このlaneではその表示状態・`movement-motion.mjs` を編集していない。統合時に二つの任意拡張を別tagのまま再配置・検証する必要がある。

**確認。** `patches/network-replication/tests/adoption-state.test.mjs` は六段の本番source adapter compositionを通し、native `Actor` / `WeaponRunner` / `Projectiles` / `NetMatch` と実際の movement、gear、resources、Flow runtime owner を使って5つの新しい手渡しケースを通した。Super Jump の残り軌道は30/60/120Hz描画グループでも同じ60Hz固定ロジックで元所有者と一致し、合法着地まで到達。選択した ownership、Super Jump/recovery、damage、Splatling対照を含む1回の実行は42/42 passing。実機 Switch、実 relay、ブラウザ生成物、物理描画時間の比較は未実施。固定床fixture上のnativeロジック検証であり、未確認の本家フレーム値や通信一致を主張しない。issue-94 baselineは再実行していない。


## 2026-10-08: Shooter-family main projectile / paint-drop separation

Reference is Splatoon 3 11.3.0 parameter data from Leanny/splat3 at `7280ff9cde8bb1c5dcef46c700c326471584d2e6`: WeaponShooterNormal (Splattershot), WeaponManeuverNormal (Splat Dualies), and WeaponSpinnerStandard (Heavy Splatling). Published parameter values are kept separate from reconstruction choices; unresolved internal ordering and VFX details remain marked as unverified rather than promoted to measured facts.

The previous public source represented Shooter-family travel with one generic projectile path, visual satellite blobs attached behind the damage projectile, and `trailEvery` downward raycasts that painted the floor directly at repeated distance intervals. The new source separates the damage-carrying head from finite paint-only drops. Shooter, Dualies, and Splatling each carry their own motion and splash profile. The head advances on a 60 Hz source-state model (straight phase, brake phase, free-fall phase); rendering/update rates feed that fixed model rather than changing the source-frame transition. Paint drops are born only after their planned source distance is reached, have independent position/velocity/lifetime, cannot damage players or bosses, and paint only when their own swept flight reaches a surface.

Splattershot's fractional splash budget is represented as the observed 1/2 alternating slot count from SpawnNum 1.5, with the 8-shot cycle and nearest/feet slot on rounds 4 and 8. Collision now chooses the earliest swept contact among world/actor/boss candidates and uses a finite projectile radius. Impact paint is bound to the struck face so a large paint sphere does not accidentally claim a second surface behind a thin roof. Replicated visual projectiles carry the flight protocol/profile, shot index and deterministic seed but remain non-authoritative for damage/turf.

Verification is intentionally split by evidence type. A loader-free 10-case source-model test is checked into `tests/ink-flight/model.test.mjs` and runs in validate CI; it covers per-weapon pinned facts, source-frame phase transitions, damage clock separation, fractional/feet splash scheduling, deterministic jitter, paint-shape interpolation, Splatling charge-speed behavior, and aim prediction using the same fixed-flight solver. The local reconstruction package additionally passed 47 Node tests covering collision, paint-surface ownership, paint-drop independence, network replay and 30/60/120/mixed update agreement. Those local tests are not a substitute for the repository's production patch-composition CI.

Still unverified against real Splatoon 3 hardware/video: the exact splash-pattern permutation, whether the nearest/feet drop is replacement versus an additional drop in every internal case, precise drop velocity inheritance/force distribution and lifetime, Heavy Splatling velocity RNG distribution, visual mesh/opacity/texture, and absolute unit calibration. Browser/WebGL visual validation was unavailable in the local execution environment, so visual parity and mobile FPS are not marked resolved. The PR's repository CI is responsible for detecting conflicts with the existing `patches/` build composition before merge.

## 2026-10-07 — issue 30 件の修正バッチ

#941 #934 #918 #939 #933 #922 #937 #926 #911 #924 #917 #930 #906 #905 #928 #936 #925 #920 #903 #938 #932 #908 #914 #913 を修正。#896 は対応済みの固定、#931 #910 は現行 main で再現せず (ガードテストのみ)、#927 #890 は固定データ不足で見送り。#923 はレビューで、TIME UP時の全projectile一律破棄がS3の一部終端塗りと不一致になり得るため見送り、Issueをopenのまま残した。すべて**ロジック中心の確認**で、ブラウザ実動作と Switch 実機との比較は特記がない限り**未確認**。各 issue の本家根拠・実装箇所・再現・影響・確認状態は[詳細](inkwave-issue-batch-2026-10-07.md)。

## 2026-10-07: C30-C39 composition repair — mouse owner while map/editor is open (#859)

Reference: Splatoon 3 Ver. 11.3.0; the browser touch/mouse hybrid has no measured Switch counterpart. No frame, speed, weapon or network value is inferred.

The composed `touch-pointerlock-adapter.mjs` rejected map/editor targets before a physical mouse could set `lastDevice` to KBM. This left touch-primary state stuck although no touch pointer was held. Mouse acquisition now accepts the existing canvas/control surfaces, including edit/rotate controls, while Pointer Lock still rejects map/editor, those edit/rotate targets, menus, pause, finished and attract play. A held physical touch still owns input; unrelated outside targets do not acquire it. Existing #800/#859 production-composition assertions retain their KBM and zero-lock oracles. Local VM results and exact candidate browser CI are recorded separately; native device timing is unmeasured.

A pending Pointer Lock request admitted before touch can also complete after a blocked map/editor handoff. The completion handler now retires that late lock using the captured handoff admission state and the current map/editor state. A fresh eligible mouse gesture restores normal acquisition. The regression uses the real composed Input with a deferred request Promise and confirms retirement causes no pause; this is local module evidence, not a browser or Switch timing measurement.


### C30–C39 final living integration correction (2026-10-07)

On Splatoon 3 Ver. 11.3.0 reference conditions, the composed first-splat owner now uses the existing authoritative network life as its terminal identity. A focused full-production-composition counterexample showed that adopting a remote actor in the same life could otherwise grant a second terminal award when local death bookkeeping differed. The regression rejects that repeated award and still admits a genuinely new life. Offline actors retain their normalized death fallback. This changes no packet schema, damage, movement, ink amount or weapon timing.

The camera fixtures account for the separately owned shoulder translation and transient collision-probe cadence while preserving per-frame aim/pivot and settled rig assertions. Countdown fixtures supply the existing team-wipe sampling hook. Remote attacker proxies are asserted to have no local Flow progress. Slosher replay compares zero residual delay after an actual delayed birth; trajectory, lifetime, paint and packet parity assertions remain. These are composed test/harness corrections, not newly measured Switch behavior; hardware timing and pixel parity remain unmeasured.

## 2026-10-07 — Heavy Splatling jump spread (#850)

比較対象は Splatoon 3 Ver. 11.3.0 の Heavy Splatling (`WeaponSpinnerStandard`)。根拠は [Nintendo の更新履歴](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/) と、固定した [Leanny 11.3.0 raw parameter table](https://raw.githubusercontent.com/Leanny/splat3/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpinnerStandard.game__GameParameterTable.json) (`7280ff9cde8bb1c5dcef46c700c326471584d2e6`)。同表の `Stand_DegSwerve=3.3`、`Jump_DegSwerve=7.0`、`Jump_DegBiasDecreaseStartFrame=25`、`Jump_DegBiasEndFrame=70`、`Jump_DegBiasMax=0.3`、`PitchDegSwerve=1.6`、`PitchDegBias=0.4` を保持する。Inkipedia の [Heavy Splatling 説明](https://splatoonwiki.org/wiki/Heavy_Splatling) は外側レティクルの選択率と回復の説明として扱う。`0.3` / `0.4` は角度加算や角度スケールに変換していない。

条件は通常のヒト形態でチャージを保持し、ジャンプして着地する操作。native regression の装備にはギア補正を加えていない。本家 Switch 実機での同一ギア・入力フレーム計測は今回行っていないため、数値一致や非公開カーブの一致は主張しない。

開始 main `f31f5da439134fe49bb89018dad5557671a49c67` では `inkwave-public/src/game/weapons.js::WeaponRunner._spreadDeg()` が毎 tick `a.grounded ? spreadGround : spreadAir` を選び、ジャンプ経過時間を読まない。親の保存済み全6 adapter / native `Actor`・`WeaponRunner` trace は、空中から最初の grounded tick で runner spread が即 ground 値に切り替わることを確認した。これは HUD 表示にも `main.js::_updateHud()` の同じ `weaponRunner.spread` にも、`_splatling()` から投射物へ渡す値にも現れる。

overlay の `runtime/splatling-jump-spread.mjs` は `actor:jump` で age 0 を開始し、native fixed simulation の `dt * 60` で進める。25F までは air 値を保持し、25F から70Fまでは既存 air/ground endpoint 間を単調な線形重みで補間する。raw table は開始・終了 frame を示すだけで中間カーブを公開していないため、線形部分は**INKWAVE 内部の未検証近似であり、Nintendo の正確なカーブとは呼ばない**。着地しても age は続くので初回 landing で ground spread に snap しない。ground pitch も同じ age に接続し、既存の `PitchDegSwerve` endpoint へ着地 tick だけで切り替わらない。air 側では既存 INKWAVE sampler の `0.55` pitch factorをそのまま端点として使う。これは現行実装の値であり、Nintendo の係数ではない。HUD の横 spread scalar と native projectile の横 spread は runner の同じ `spread` を使う。

age は actor に保持する。再ジャンプは age を再開し、death/reset は消去、weapon/form 変更では現在のジャンプ age を継続、`dt=0` は進めない。network protocol や gameplay authority は変更していない。owner projectile の wire velocity をそのまま remote ghost の軌道へ使い、ghost は damage 0 の表示物として残る。

確認は complete production adapter composition (`adaptSource` → `adaptTouchLayout` → `adaptReliability` → `adaptQualitySource` → `adaptNetworkSource` → `adaptRange`) と native runtime で行った。`splatling-jump-spread-native.test.mjs` は 4/4。30/60/120Hz 描画で同一の60Hz trace、25F hold、70F endpoint、両 landing の非 snap、pitch の landing 境界、repeat jump/death/reset/weapon/form/pause を確認する。owner shot と remote reconstruction では HUD runner scalar、damage、flight endpoints、ballistics、4回の既存 RNG draw、wire velocity、ghost の zero-damage / 非再送を確認した。既存 Splatling charge/ink/stream/cancel、pitch と network timing の focused checks は 6/6。

追加した native composition regression は seed `0x1a2b3c4d` の grounded partial Splatling range fixtureで、測定用の水平 spread scalar と pitch endpoint を0にした場合も既存の4 RNG drawsを保ち、塗りが `maxZ=15.625`、`area=7.8125`、125 cellsになることを確認する。修正前の850 pitch samplerは水平 scalarが0のとき早期 returnし、spread用の2 drawsを省いて後続の projectile seed / paint footprintを変えていた。ground shotとそのRNG列を保つようにし、25–70F jump pitch blendは維持した。exact `b34a8aaf` built siteの canonical weapons verifierは修正前からpass、C42 built siteは修正前に失敗し、この修正後のbuilt siteでは15 cases、3 network modes、6 wall-drop casesすべてpassした。これはCPU/native fixtureとproduction buildの確認であり、Switch実機比較ではない。

未確認: Switch 実機の同条件 spread・pitch と gear 条件、非公開の25–70F中間曲線、`Jump_DegBiasMax` の実際の shot-selection 挙動。これらを本変更で解決済みにしない。全体 build / batch / CI は親側の検証に委ねる。

## 2026-10-09 — Splat Dualies jump spread (#887)

比較対象は Splatoon 3 Ver. 11.3.0 の Splat Dualies (`WeaponManeuverNormal`)。根拠は [Nintendo の更新履歴](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/) と、固定した [Leanny 11.3.0 raw parameter table](https://raw.githubusercontent.com/Leanny/splat3/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponManeuverNormal.game__GameParameterTable.json) (`7280ff9cde8bb1c5dcef46c700c326471584d2e6`)。2026-10-09 に同 raw を再取得し、`WeaponParam` が `Stand_DegSwerve=2`、`Jump_DegSwerve=7.5`、`Jump_DegBiasDecreaseStartFrame=25`、`Jump_DegBiasEndFrame=70`、`Jump_DegBiasMax=0.4`、`LapOver_DegSwerve=0`、`RepeatFrame=5` であることを確認した。frame 値は既存の単位変換 `/60` で秒に直し、`25/60=0.4166…s`、`70/60=1.1666…s` とする。角度は profile が既に同じ raw 由来の度で保持している。`Jump_DegBiasMax` は角度加算・角度スケールに変換していない。

条件は通常のヒト形態、追加ギアなし。ジャンプ入力は射撃方向移動なし（射撃中でも `tryDodge` は移動入力が無ければ成立しない）ので通常ジャンプになり、`s3JumpSerial` と `actor:jump` が発生する。本家 Switch 実機での同一ギア・入力フレーム計測は今回行っていない。

開始 main `2195d5244408a9632bfbbb3b106f2cfdf1fa6d77` では `inkwave-public/src/game/weapons.js::WeaponRunner._spreadDeg()` の dualies 分岐が `a.grounded ? spreadGround : spreadAir` を選び、ジャンプ経過時間を読まない。complete production adapter composition の repro は、空中 frame 36 の runner spread `3.75`（=7.5×`spreadFirst`0.5）が、着地した frame 37 で `1.0`（=2×0.5）へ即座に落ちることを確認した。この値は HUD 表示 (`main.js` が `a.weaponRunner.spread` を投影)・`_dualies()` から投射物へ渡す cone の両方に現れる。post-roll の `LapOver_DegSwerve=0` turret cone は別状態であり本件の対象外。

再起動時に current main `5d0be6b7fdebfd07e696e75497aaa97aa5ff5648` を再確認した。公開 source と production adapter に同じ grounded 二択が残り、jump recovery clock はなかったため issue root は main で未修正だった。今回の修正は公開 source を変えず `patches/splatoon3/runtime/weapons.mjs` に current jump-bias owner を接続した。

実装は `runtime/splatling-jump-spread.mjs`（#850 の Splatling 専用のまま）ではなく、`patches/splatoon3/runtime/weapons.mjs` 内で、既に sourced として導入済みの Blaster jump-bias owner（`s3BlasterJumpState`）と同じ形にした。Inkipedia の [Data Explanation](https://splatoonwiki.org/wiki/User:XarrotD/Data_Explanation) は `DegSwerve` を「弾が中心から外れうる最大角」、`DegBias` を「弾がどれだけ外れるかを決める隠れ確率変数」と説明し、偏差を `y = s · x^(log_0.5 b)`（`s`=swerve、`b`=bias）とする。したがって `Jump_DegBiasDecreaseStartFrame`/`Jump_DegBiasEndFrame` は angle lerp ではなく **outer-reticle 確率（bias）の回復窓** である。`_spreadDeg()` は jump clock が有効な間 `spreadAir=7.5` の outer envelope を publish し、fire 時に `Jump_DegBiasMax=0.4` から 25F–70F で 0 へ下がる bias を `Math.random()` でサンプルして `Jump_DegSwerve=7.5` か `Stand_DegSwerve=2` のどちらかへ撃ち分ける。角度は補間しない。

raw table は開始・終了 frame のみを公開し、25F–70F の正確な確率回復カーブ形状は未公開である。本実装は Blaster/shooter と同じ既存の単調線形回復をそのまま用いる **INKWAVE 内部の近似であり、Nintendo の正確なカーブとは呼ばない**。着地しても clock は続くので初回 grounded tick で ground endpoint に snap しない。70F に達した時点で、空中か着地後かを問わず clock を消去する（末尾の #887 追補を参照）。再ジャンプは clock を再開、death/reset は消去、`dt=0` は進めない。post-roll `LapOver_DegSwerve=0` turret cone は独立。`RepeatFrame=5`（`fireInterval=5/60`）、ink、damage、wire、owner/remote authority は変更していない。bloom は独立層として `spreadFirst` factor に残した。HUD (`a.weaponRunner.spread`, outer envelope) と `spreadWeaponRound` の投射物 cone は同じ `s3DualiesJumpState` を読む。

確認は complete production adapter composition (`adaptSource` → `adaptTouchLayout` → `adaptReliability` → `adaptQualitySource` → `adaptNetworkSource` → `adaptRange`) と native `Actor`・`WeaponRunner` で行った。再起動後の focused run は `patches/splatoon3/tests/dualies-jump-spread-native.test.mjs` が 10/10、隣接する `splatling-jump-spread-native.test.mjs` が 4/4 pass。sourced 境界（25F/70F/`Jump_DegBiasMax`0.4/7.5/2/`spreadLock`0/5F）、stable grounded の 2 endpoint と非ジャンプ落下の 7.5 envelope、`Jump_DegBiasMax` 0.4 hold → 25F 非回復 → 70F で 0 到達、landing 非 snap、fire 時 bias が deviation 比 `7.5:2` を再現すること、HUD scalar と projectile cone の一致、turret cone の独立、reset/death/`dt=0` lifecycle、5F cadence・ink・emission frame 不変、30/60/120Hz render が同一の fixed 60Hz trace になることを確認する。

未確認 / blocker: 非公開の 25F–70F 確率回復カーブ形状、`Stand_DegBiasKf`/`Stand_DegBiasDecrease`/`Stand_DegBiasMin` による standing bias の連射蓄積（Dualies には `Stand_DegBiasMax` が published されないためモデル化せず）、jump bias と standing bias の合成則（wiki は "needs verification"）、Action Intensify の `ReduceJumpSwerveRate` による jump 増分そのものの低減、Switch 実機の同条件計測。これらを本変更で解決済みにしない。全体 build / batch / CI は親側の検証に委ねる。

## 2026-10-07: Locker portrait queue staging and character reuse (#834)

### Splatoon 3 reference conditions

The compared states are changing player appearance through Player Settings and previewing gear in the shop. Nintendo's [appearance FAQ](https://www.nintendo.com/jp/games/feature/splatoonqa/other/character_creation/index.html) documents changing Inkling/Octoling appearance and hair; its [developer interview](https://www.nintendo.com/en-ca/whatsnew/ask-the-developer-vol-7-splatoon-3-part-4/) describes hair and eyebrow customization. Nintendo's update history also documents a gear shop trying-on animation fix.

Those sources do not describe thumbnail generation, character pooling, or a per-frame portrait work budget. This is an INKWAVE menu scheduling change; it makes no claim that its portrait pipeline matches Splatoon 3's internal implementation. No battle inputs, movement, weapon behavior, actor state, or game RNG changed.

### INKWAVE production behavior and fix

On current main `b34a8aaf606594be61cfbd4c21e9f09afd685ad7`, the complete production adapter build's cold three-style probe observed three per-tile Character constructions, 42 Character updates all inside RAF callbacks, three studio renders, three tone-map resolves, and three async readbacks. The browser trace is retained at `history/codex2/c834-r212/current-main-cold-probe.json`.

The quality adapter now retains the existing Showcase warm-up Character as the portrait pool, resets its native style, tone, weapon, uniforms, rig, and seeded animation state for each request, and performs the same 14 native pose updates one at a time through idle callbacks. The existing framing, studio render, resolve, async readback, and synchronous fallback remain in the native render path. The active idle job is released after render submission, retaining the existing limit of two reads in flight. Canceled no-waiter jobs are skipped; callbacks and epoch-aware cache insertion keep their prior ownership rules.

The final three-style Chromium trace observed zero per-tile Character constructions, 42 updates outside RAF and zero inside RAF, three studio renders, three resolves, three async readbacks, and zero synchronous readbacks. All three requests reached the renderer with their expected style, color, weapon, skin material, size, and kind. Their alpha-pixel counts matched the current-main trace exactly (bust 7,737; face 21,021; body 6,990), with the same image dimensions. Output PNGs and the operation trace are retained at `history/codex2/c834-r212/post-fix-*.png` and `history/codex2/c834-r212/post-fix-cold-probe.json`.

Eleven focused tests pass: four staged-work tests cover reuse across three distinct style/color/weapon requests, one animation-state object for the 14 steps, queued and active cancellation, pool disposal, callback copies, and late readback after epoch change; seven existing resource tests cover the native cache/readback path and production adapter composition.

A same-build native-versus-pooled bust control differed in two channel values by at most 3; the alpha mask and crop matched. Exact color/shadow/pose parity for every hairstyle and gear combination was not measured. All 14 updates still occur per cold tile, and the existing menu still queues non-visible portrait tiles; this change bounds where that work runs and removes per-tile Character construction rather than reducing total pose simulation or GPU readback work. No device frame-time, mobile hardware, or Switch measurement is claimed.

### Independent review correction (2026-10-07)

The final review found two lifecycle gaps in the staged portrait path. `_portraitObjects` now uses weak object keys, so detached meshes from repeated style-rig refreshes cannot be held alive by the snapshot cache; live objects still restore their saved transforms. Before each idle callback and again before render submission, the work rechecks the same Results and outgoing-Results guard as native `Showcase._portraitStep`. A blocked job returns to the front of the queue without scheduling more idle work, keeps its original cache epoch, and starts again when a safe mode is rendered. The native two-read flight cap, no-waiter cancellation, callback copies, async readback, stale-epoch release, and disposal behavior remain covered.

The focused regression constructs the actual public `Character` and uses the installed public `Showcase` with the `adaptSource` → `adaptTouchLayout` → `adaptReliability` → `adaptQualitySource` test composition. It alternates two styles through 39 native rig refreshes and verifies weak-key storage plus transform restoration without relying on garbage collection. It also switches locker work into Results before preparation, during pose work, and before render; it checks outgoing-Results protection, idle-queue silence while protected, safe-mode resumption, two-flight blocking, and callback delivery after cache-epoch invalidation. The focused portrait-work and resource-budget command passes 14/14. This is a source/adapter logic regression, not a new six-adapter browser reproduction or a Nintendo hardware comparison; the existing full-composition current-main baseline remains the parent-verified evidence above, and public Splatoon 3 materials still do not establish an equivalent thumbnail scheduler.


## 2026-10-07: Independent Dualies hand aim centers (#575)

**Reference and conditions.** Base current main is `b34a8aaf606594be61cfbd4c21e9f09afd685ad7`; the relevant public/runtime adapter inputs match the previously qualified `7ab20b44bbc00d497a50cbbbdb43b4da823b0a82` source set. Compare Splat Dualies in Splatoon 3 Ver. 11.3.0, humanoid normal fire while grounded and airborne, and the actual post-roll turret state. The qualitative Dualies/post-roll behavior and version scope are already recorded in [the #518 comparison](inkwave-dualies-reticle-state-2026-10-05.md). That reference does not provide numeric hand-reticle angles or target-plane spacing; Switch capture and device measurements remain unconfirmed. The public duty comment at [Issue #575](https://github.com/rhgrive3/actions/issues/575#issuecomment-6031509984) remains the existing shared claim.

**Current-main finding.** The complete six-adapter native fixture reproduced the uncovered launch path: actual `WeaponRunner` shots leave the distinct native hand muzzles, but both normal-fire launch directions and guides converged on `actor.aimPoint`. The result is a single shared target-plane coordinate in grounded and airborne centerline runs. The independent `s3Turret` state already owns the post-roll merged guide and remains the only state that selects the shared target.

**Implementation.** `patches/splatoon3/weapons-adapter.mjs` passes the native hand index into the shared launch method and lets `_aimFrom` accept its existing default aim point or an explicit target. `patches/splatoon3/runtime/weapons-fidelity.mjs` derives each normal-fire target from the two final `_muzzleHand` origins: it projects each hand's signed lateral offset onto the current aim-plane right axis and applies that offset to the center aim point. The same helper drives the real launch and the installed Dualies guide; existing `fidelityAimConvergence()` still solves the vertical ballistic correction before the unchanged spread sampler. When `weaponRunner.s3Turret` is actually true after roll, both launch targets use the center point and the two guide points merge. No profile tuning, speed, damage, fidelity motion, cadence, spread law, RNG call, projectile identity, owner rule, or wire field was added or changed. The fixture's measured 0.317 INKWAVE-unit muzzle separation is source rig geometry only, not a Nintendo world-space calibration.

**Verification.** `patches/splatoon3/tests/issue-575-dualies-independent-aim.test.mjs` applies all six production adapters to native public/runtime modules and uses the real `Actor`, `Character`, `WeaponRunner`, `Projectiles`, `Physics`, `NetMatch`, and fidelity integrator. Grounded and airborne normal shots have symmetric nonzero target-plane separation; guides consume no RNG and match their own fired trajectories at `ShotGuideFrame`. A native `tryDodge()` plus fixed `WeaponRunner.update()` ticks enters the actual post-roll state, where launch hits share one target and the merged guide equals the center of both real flight predictions; releasing fire restores split guides. The test also checks alternating hand order, normal cadence, existing per-shot RNG draw counts, projectile wire IDs/field count, owner `weapon:fire` payload shape, and remote ghost/event playback without duplicate projectile creation. Results: #575 native regression 2/2; #608 fidelity aim baseline 5/5; Dualies gate-owner composition 3/3; existing muzzle/grate safety and cadence 7/7. These are native logic and adapter-composition checks, not browser reticle-pixel or Nintendo-device comparisons.

### 2026-10-08 current-main correction: Dualies guide launch plan

At correction base `fa97541870507744bb81badded4cf7e71d685f5d`, the complete six-adapter native fixture reproduced a remaining presentation mismatch: emitted per-hand rounds already used `profileFor` / `launchSpeed` / `correctInkAim` and the installed fidelity integrator, while `s3DualiesGuides()` still used `fidelityAimConvergence()` with `w.projSpeed`. The normal-fire test first failed at grounded hand 1 before reaching its airborne iteration; the separate post-roll merged-guide assertion also failed. An off-path guide could mislead a player about the predicted flight, while the emitted shot path and independent hand-target geometry were already present.

`fidelityDualiesLaunchPlan()` now supplies the same public `inkFlight.js` profile lookup, speed, and correction to both the adapted live `_fireRound()` path and each guide hand. The guide still advances through `advanceFidelityProjectile()` at its existing fixed step, preserves two normal hand targets and the actual post-roll `s3Turret` merged target, and returns no guide if a production ink profile is unavailable. The live launch values and draw order remain unchanged; projectile integration, collision, damage, timing, ink/RNG, ownership, fire-event order, and the current 36-field birth packet with net ID at index 32 are covered by the native regression.

The full Issue 575 file now passes 2/2, including grounded/airborne guide-to-round equality, hand separation, turret merge/restore, unchanged RNG draw counts, and remote wire/event playback. The focused shot-guide and source-adapter files pass 25/25. A nearby #608 run in this worktree produced three failures (Splatling 30 Hz centerline, copied speed-cap control, and Shooter guide parity); those non-Dualies cases were not baseline-run here and are not claimed as caused or fixed by this correction. The Nintendo comparison remains Splatoon 3 Ver. 11.3.0; official/public material and this logic test do not establish Switch guide pixels, numeric hand spacing, or device-level parity, so those remain unconfirmed. The public Issue #575 duty comment at https://github.com/rhgrive3/actions/issues/575#issuecomment-6031509984 remains the shared claim.

### 2026-10-08 deployment and allocation closure

The production build emits upstream modules under `_site/src/game`, not `_site/inkwave-public/src/game`. The earlier source-tree import therefore did not resolve in the deployed module graph. The native source adapter now injects its existing `profileFor`, `launchSpeed`, `correctInkAim`, and `referenceReach` helpers once into each `Projectiles` instance; the fidelity runtime has no source-layout-dependent InkFlight import. The #575 native fixture accepts `INKWAVE_BUILT_SITE` and resolves its `Character` and `NetMatch` exports from that same emitted tree. `fidelityDualiesLaunchPlan()` now reuses a single mutable launch-plan record owned by the existing `Projectiles` instance across both guide hands and live shots. This removes the added per-hand result-object allocation after first use without changing the source profile lookup, charge calculation, speed, correction, trajectory, RNG, or packet behavior.

The production build and installed-site #575 fixture were run after this correction; the latter exercises the same native grounded/airborne, post-roll, RNG, and network assertions through the emitted modules. A direct built-path check confirms that emitted `src/game/weapons.js` owns the native `./inkFlight.js` import and installs the shared helpers used by the fidelity runtime. The source VM fixture remains useful for source adapter baselines but is not a substitute for this installed-site route check. This closes deployment and allocation issues only; no Nintendo device or browser pixel comparison was made, so the report's hardware comparison limitations above still apply. The shared claim and public duty comment URL remain unchanged.

## 2026-10-07 — Steady form snapshots and stationary audio listener (#954, #962)

Current-main control is `b34a8aaf606594be61cfbd4c21e9f09afd685ad7`. All six production adapters and the real Actor/Character form update observed five shape-snapshot allocations across five steady updates. The wrapper now keeps distinct reusable previous, reversal-start and blend records. Native form/pose, actor/timer and zero-dt/reversal/disabled-state traces are compared with the byte-verified frozen b34 subject. The frozen source is a tracked test fixture, so a shallow checkout does not need unavailable historical Git objects. No movement, animation calibration, combat or random distribution is changed.

The composed native AudioEngine scheduled eighteen listener ramps across two identical transforms. The quality overlay now caches exact position/forward/up scalars per engine/context/listener; identical transforms schedule zero new ramps. Tiny finite changes, listener/context replacement, resume, invalid input, default-up and legacy setter controls preserve existing target values and the0.01-second smoothing constant. Four author full-composition tests and its production build passed; parent final combined-head results are recorded in the PR. This establishes fewer allocations/schedules in the code path; browser GC, frame time, battery and audio-thread costs were not measured.

## 2026-10-07 — C40 current-main integration (#648, #847, #915)

Initial task baseline was `f31f5da439134fe49bb89018dad5557671a49c67`; publication reconciles main `b34a8aaf606594be61cfbd4c21e9f09afd685ad7` (including runtime merge #868 and CI topology #946). The native gauge regression now uses the actual Slosher/Tidal Slam kit (175 base cost), because current Shooter and Blaster kits are Trizooka and Storm. Production tests transform both native modules and runtime imports through all six adapters. The composed special barrier still executes exactly once before Slam impact; existing splat cleanup, free-fall state selection, post-release gates, and hit admission remain connected.

Independent review found that rejected remote Blaster projectile packets were queued before native NetMatch admission. The correction queues only a newly admitted visual ghost after the actual native owner/sequence/projectile-ID checks return. Full-composition tests include malformed coordinates, repeated projectile IDs, wrong owners, stale events, valid owner/remote cycle parity, and actual accepted submerged packets without mechanism motion. No protocol field, damage, ink cost, cadence, authoritative movement, or projectile tuning is added by the Blaster presentation. Current combined source/build results and exact CI identities are recorded separately in the batch PR; earlier-head receipts above retain their stated scope. No Switch frame or physical-device equivalence is claimed.

## 2026-10-07 — Roller flick foot paint (#358)

Reference: Splatoon 3 Ver. 11.3.0, normal Splat Roller, horizontal ground flick and airborne vertical flick. The gear setup is not specified by the pinned parameter extract. Values come from the [pinned Roller parameter extraction](https://raw.githubusercontent.com/Leanny/splat3/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponRollerNormal.game__GameParameterTable.json); the [parameter semantics reference](https://wikiwiki.jp/splatoon3mix/%E6%A4%9C%E8%A8%BC/%E3%83%91%E3%83%A9%E3%83%A1%E3%83%BC%E3%82%BF%E6%83%85%E5%A0%B1/%E3%83%A1%E3%82%A4%E3%83%B3) identifies `SplashNearestParam` as foot paint and describes `PaintDepthScale` as forward length and `PaintWidthHalf` as half-width. This source is an extracted parameter table, not Nintendo-published implementation code.

The horizontal source record has `MaxHeight=0.2`, `Offset=(0,-2,0.5)`, and `PaintDepthScale=PaintWidthHalf=1.5`; vertical has the same height/offset and both paint dimensions are `1.462`. The runtime derives these values from `weaponsFidelityCompletion` using the existing `calibration.distanceScale.factor=1` (status: inferred). The value remains in INKWAVE world scale; it is not a metre calibration or a claim of Switch footprint size. Since each mode's forward depth and half-width match, the existing circular `PaintSystem.splat` radius represents both dimensions without a guessed stretch conversion.

Before the change, a full production composition reproduction loaded `adaptSource`, installed `patches/splatoon3/runtime/install.mjs`, and called the native `Projectiles.fireFlick` before stepping projectiles. Horizontal emitted 12 main globs plus the existing near unit (13 total), vertical emitted 5, and both had zero paint calls at release. Projectile trail and impact paint occurred later and did not represent the separate source foot-paint event.

`weapon-edgecases-adapter.mjs` now invokes `paintRollerReleaseFootprint` at the accepted `fireFlick` release point after the main glob loop and before the existing horizontal near unit. It does not add a projectile or alter runner admission. The helper rotates source X/Z offsets by actor yaw, maps `Offset.Y` to the downward reach and `MaxHeight` to the upward margin of the existing `Physics.groundProbe`, requires its existing walkable-ground threshold, and applies the existing 0.1 ground-normal paint offset. This maps the 2-unit downward reach from the source into INKWAVE's ground query; the mapping is implementation-specific and is not asserted as Nintendo's internal algorithm. Vertical flicks can paint while airborne when ground remains within that reach; a higher release with no ground contact is skipped.

The owner calls `PaintSystem.splat` once and uses the seed of the last already-created main glob, preserving random draws. The paint system records the normal `s` event; remote actors skip this release paint, and `NetMatch` replays the one paint event while projectile packets create visual ghosts. Only Roller receives the derived profile field; no Practice Range special case, global paint tuning, projectile trail, damage, launch, cooldown, or ink cost was changed.

The composed-runtime regression covers horizontal and airborne vertical release before stepping, source dimensions/offsets, bounded ground contact, owner paint event count, remote `NetMatch` replay, dead/remote exclusions, and accepted/rejected runner paths. Baseline fingerprints still match 13/5 projectiles, 124/30 random draws, launch data, velocity, lifetime, damage, and the shared damage group; the runner retains its single 8.5 ink payment and release cooldown. The focused test passes 7/7; existing roller near-unit, packet, and release regressions pass 3/3. These are logic/runtime tests on a flat collision fixture. A rendered Practice Range turf-cell check, browser play session, two-device timing check, and same-input Splatoon 3 Switch comparison remain 未確認.

## 2026-10-07 — Splat Roller hinge/fold state (#916)

Reference target: Splatoon 3 Ver. 11.3.0, Splat Roller. Nintendo's [update history](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/) identifies the target release; Nintendo's [current weapon guide](https://www.nintendo.com/jp/character/splatoon/fashion/index.html) and [beginner guide](https://splatoon.nintendo.com/en/news/beginner-basics-for-splatoon-3-choosing-the-right-weapons/) distinguish the horizontal and vertical swings. For primary visual evidence, the 2026-10-03 capture reused the public Nintendo Roller clips `NablZy7jqxO` (SHA-256 `4bb9e8f212b83f45d80696b6ddd87217403c570fd60d62a85c32f16a3576cc60`) and `AZLlvZRlJpm` (SHA-256 `67824fb5111383609e045c035cac345b398ef3688bf8a521d10ef50773a08bda`), both 1920×1080 at 60 fps. The footage version, gear, input edge, stick amount and FOV are not disclosed. Its decoded frame times are source-video times, not button-relative timings.

The official clips show the carry/shoulder pose, a horizontal lift and swing into a low drum/release, the folded vertical jump/swing/landing sequence, and rolling with the drum deployed. In the paint-progress clip the carry-to-horizontal sequence is visible at n54–60 / 2.969833–3.069833s, the raised swing at n66–78 / 3.169833–3.369833s, and the low drum/release at n84–108 / 3.469833–3.869833s; the drum is lifted back toward carry at n528–552. The regular Roller clip shows the jump/lift at n408–420, vertical swing at n426–438 and landing/return at n444–456. The retained source frames are `roller-side.png`, `roller-hflick.png`, `roller-vflick.png` and `roller-roll.png` in the persistent `inkwave-motion-fidelity-20261004/official/agy-frames/` evidence folder. This establishes the observable phase order and the distinct carry, horizontal, vertical and rolling configurations. It cannot establish an exact controller-press-to-hinge latency or Nintendo hinge curve.

Before the patch, `buildRoller()` merged the shaft, yoke and reservoir into static geometry and the vertical flick only moved the whole weapon. The build adapter now separates the roller-side body and ink overlay into hinge children, and the Character render layer rotates that group from the existing Roller attack mode or rolling state. Neutral/carry and vertical attacks fold; horizontal attacks and rolling unfold. The drum remains a spinning child of the hinge. The hinge angle and exponential curve are explicit INKWAVE visual calibration, not values extracted from Nintendo. No weapon firing, cadence, muzzle, projectile, ink, paint, collision, roll-contact or damage implementation is changed.

Final focused acceptance used the current complete production adapter build plus the native public `Actor`/`Character` in Chromium WebGL/SwiftShader, on a flat y=0 scene. The final build content hash is `ffd95526357f6fe9b665c4a12cba2493e9f5cee4d8f07557e2eff8ae2542daeb` (revision `a587a2ccceed54b0d867308ddfbd03fa524ac12aa6ce26e914c086f700616237`; 147 preloaded modules). At rest/carry the hinge was fully folded (`foldT=1`); after 12 frames the horizontal pose was open (`foldT=0.00248`), the vertical pose remained folded (`0.99753`), and rolling was open (`0`). This matches the reference phase order and puts the horizontal unfold ahead of INKWAVE's existing 21F release. The current INKWAVE rate is 30/s: its formula reaches 95% of a changed target in about 0.10s (six 60Hz frames) and leaves less than 0.003 of the previous fold after 12 frames. That transition fits inside the official clip's 24-frame (0.4s at 60 fps) drum-lift-back-to-carry sequence at n528–552. The video does not expose the input edge, so this validates the observable phase/window alignment, not an exact S3 press-relative latency.

The current large-drummed native geometry was measured in that browser run. Minimum transformed weapon-vertex floor clearances (carry / horizontal / vertical / rolling / vertical-spin, in model world units) were `0.6079 / 0.9164 / 0.8224 / 0.0400 / 0.8373`. Sampled roller-side-to-body signed clearances were `+0.0411 / +0.3550 / +0.1757 / +0.3932 / +0.1780`; carry, horizontal, vertical and vertical-spin each tested 568 actual transformed roller-side vertices against the nearby rendered body triangles, with no sampled vertex inside. Rolling's `+0.3932` is the positive lower bound between disjoint transformed geometry AABBs because no body triangles are within the nearby-body threshold. These are geometry samples for the captured poses, not a continuous collision proof. The drum was a child of the hinge in all five captures; in vertical spin it rotated `4.0848 rad` across the 12-frame sample. Metrics and screenshots are retained at `/mnt/workspace/inkwave-batch-c/evidence/additional-100/C916-final-acceptance-r188/`.

The owner/remote check now follows the actual production `NetMatch._sendTick` → wire snapshot → `onMessage` → `applyRemote` path. The network adapter sends the owner Roller attack/vertical bit, applies it to the remote runner, and the render hook treats an applied remote snapshot as authoritative even when stale remote presentation fields conflict. The focused regression passed for horizontal and vertical packets and checked unchanged render/gameplay snapshots and zero new projectile calls. This is native network-composition evidence, not a live relay session. The adapter changes no projectile origin, paint, damage, ink-consumption or roll-contact code.

A separate INKWAVE ownership-handoff edge was reproduced through that same six-adapter native composition: the former owner sends a horizontal attack, the receiver applies its proxy snapshot, then `NetMatch.onLeave`/`_adopt` makes the actor local and resets its current attack. The old remote-only `s3RollerFoldAttack={vertical:false}` remains on the runner. Before correction, the nonremote render fallback consumed it, and the new idle owner stayed fully unfolded after 30 render frames (`foldT=0`; local carry expects `foldT=1`). The fold reader now consumes that snapshot only while the actor remains remote. Post-fix native checks retain remote horizontal/vertical snapshot authority and return the adopted idle actor to folded carry, with unchanged gameplay state and no new projectile calls. The handoff itself is an INKWAVE networking lifecycle, not an additional Nintendo mechanic; the expected carry configuration is grounded in the official carry/shoulder footage above. This does not establish Nintendo ownership-transfer behavior or exact input-relative transition timing.

The complete production-composition main reproduction remains the retained baseline at main `f31f5da439134fe49bb89018dad5557671a49c67` (`evidence/additional-100/cl7-916-main-reproduction-BASELINE-f31f5da4.log`); it reproduces the rigid-frame behavior before this hinge implementation. The current browser run had no page errors. Exact Nintendo input timing/version/gear, exact-angle calibration and a physical Switch comparison remain unverified; sampled clearances do not prove every animation frame or hardware presentation.


## 2026-10-07 — Current-main ten-issue integration

Baseline main `c2c938b9af5b6cce2a7bdbecf0415c7c3836cadb` already contains the C30–C39 core changes from #985/#986. The remaining ten issues from #987/#995 are combined with those owners. Roller free-fall selection retains the one-shot grounded full-cancel override while drum-support admission gates only rolling. Flick release foot paint remains owner-applied once; remote projectiles remain visual ghosts. Existing static runtime imports and complete precache remain active while the additional eager preload hints are deferred under the unchanged core/Practice Range request budgets.

The local combined native/network/Practice Range check passed 121 tests on `eae787ce8a2708202dd3c4c5d0a922f54def0d71`. That source separately failed canonical build because moving-main composition reintroduced the Charger FX cache adapter twice. The existing sight-cache regression reproduced the same error before this correction; the FX transform is restored to one application. This is a build-layer composition correction and changes no Nintendo-derived timing or gameplay tuning. Final source build and exact browser CI are recorded in PR #988; earlier component/head receipts retain their own scope.

The combined asset manifest also exceeded the existing 64 KiB worker ceiling after whitespace-only compaction. Build-only local identifier compaction preserves top-level worker bindings and stamps the complete JSON manifest afterward. An integration-sized manifest negative control exceeds the unchanged ceiling before compaction and fits afterward; the real compacted worker retains offline revision replay and rejects corrupted assets. No cache member, digest, runtime protocol, gameplay value or budget is removed or relaxed.

## 2026-10-08 — #915 motion-detail bomb capture timing reconciliation

Reference conditions: Splatoon 3 Ver. 11.3.0; bomb, gear and controller timing for this capture are not established. The correction measures INKWAVE's installed native runtime only: a Shooter configured with the selected Suction sub, SUB held on frames 0–29, release input on frame 30, fixed 1/60 s ticks, and the complete six-adapter composition. Both the native `WeaponRunner.update` control and the actual `Actor.update` owner path allocate the real Three `Group` on frame 31 after the runtime's measured `useStartup=1/60 s`.

The motion-detail probe retains frame 30 for the release-input pose and adds the first observed native `throwBomb` birth frame to its render denominator. It requires exactly one native throw/release record, the measured frame delay to match the configured startup, the actual owner and mesh group to exist, and the released-bomb geometry to be captured at that birth frame. Existing grip, origin, velocity, and geometry thresholds remain in force. This changes capture timing only; no game runtime values or Nintendo timing are inferred. Browser rendering remains with parent CI, and Switch comparison is 未確認.


## 2026-10-07: Input-boundary cancellation of deferred shots and touch holds (#991, #990)

Reference conditions: Splatoon 3 Ver. 11.3.0, Splattershot / Splat Charger / Heavy Splatling, no gear effects, stable humanoid, stationary. Splatoon 3 itself has no browser focus, app-switch or touch/gamepad hybrid ownership, so there is no first-party source that fixes the original behaviour at these boundaries. The only reference-side claim used is the existing INKWAVE contract: an attack is admitted by a physical player input, not by a platform neutralization. The Switch behaviour at a HOME-menu / controller-handoff boundary is **not measured** and no frame value is asserted.

| | #991 deferred shots survive input neutralization | #990 fresh pad button releases a held touch FIRE/SUB |
|---|---|---|
| INKWAVE implementation | `patches/local-quality/platform-input.mjs` `resetPlatformInput()` | `patches/splatoon3/adapter.mjs` (`_liveTouchContact`, shared with the #497 axis guard) and `patches/reliability/pause-adapter.mjs` (button-edge ownership) |
| Repro | FIRE pressed, blur / suspend / screen reset before the 3F humanoid or 12F swim first shot, then ticks continue | Touch-hold Charger FIRE or SUB, keep the finger down, press an unrelated gamepad button (standard button 0) |
| Before | `s3ShooterPendingFirst` / `s3SwimFireQueued` survive the reset and inject `fire:true`; the shot is emitted without a new FIRE input | Edge sets `lastDevice='pad'`; the losing-device reset clears the touch hold; the next tick reads FIRE/SUB false as a release and fires the Charger / throws the bomb |
| After | The reset also calls the existing `WeaponRunner.cancelPendingInput()`; recovery, cooldown, accepted projectiles and Dodge history are untouched | While a finger is physically down, the button edge is still recorded in `padPressed` but does not take ownership; after the last contact ends a fresh edge takes ownership normally. Held-axis behaviour from #497 is unchanged |
| Play impact | Unintended discharge, ink spend and position reveal while the page is unfocused or right after an app switch | Unintended Charger shot, Splatling stream start or bomb throw from an unrelated controller button on hybrid touch + pad setups |
| Verification state | Logic-only: production adapters at fixed 60 Hz; browser / Switch not measured | Logic-only: production Input / MobileInput / PlayerController; Android / iPad Bluetooth-controller hardware not measured |

Known residual: while a finger is down, a pad **menu** press does not take ownership until the finger lifts.

## 2026-10-08 — Mobile 60 Hz frame scheduler wakeups (#1004)

**Reference and conditions.** No Nintendo version, weapon, gear, actor state or Switch capture was used for this host-scheduler check. Browser RAF/timer behavior remains unverified against Splatoon 3; no Nintendo frame cadence, hardware power saving or display-vsync result is inferred. Gameplay conditions are unchanged.

**INKWAVE path and difference.** `patches/local-quality/platform-game.mjs` keeps the existing live cap rule: `display` uses host cadence, an explicit 60 setting uses the 60 Hz work cap, and mobile touch defaults to 60 Hz. Before this change, the installed `PlatformFrameDriver` requested another RAF before every callback, so a touch device on a 90/120/144 Hz host woke at host cadence while admitting only 60 composed game/network/input passes. The driver now waits on a one-shot timer aligned to an absolute 60 Hz deadline, then requests one RAF. The existing game admission accumulator, fixed clock, network/input ordering, and gesture gate remain in place. Late presentation deadlines are skipped without shortening ordinary elapsed frame deltas; the existing bounded long-gap handling remains unchanged.

**Reproduction and impact.** On main `c2c938b9af5b6cce2a7bdbecf0415c7c3836cadb`, a controlled timer/RAF queue drove the ordered six-adapter production `Game._frame`, `installPlatformGame`, and native fixed clock for 0–<1 second at host 90/120/144 Hz. Before the change, the driver woke 90/120/144 times while the game/network/input wrapper admitted 60 passes. After the change, the same queue reports 60 driver callbacks and 60 wrapper admissions at each host cadence; the fixed Match update and input `endFrame` remain 59 over those startup-inclusive windows. RAF interval spacing varies to land on discrete host-vsync slots, so this verifies the controlled callback schedule, not physical presentation cadence or power use.

**Confirmation and remaining comparison.** `patches/local-quality/tests/platform-60-cap.test.mjs` covers the full-composed cadence at 90/120/144 Hz, uncapped display mode, explicit desktop 60 mode, a live setting change, gesture ownership, lifecycle cancellation, stale callback rejection and zero-delta resume. This is a native source fixture, not a browser run or Nintendo measurement. Splatoon 3 presentation timing and physical-device callback/power behavior remain unverified.
## 2026-10-08 — Heavy Splatling charge/stream to sub 5F interruption (#1006/#1021)

Reference conditions: Splatoon 3 Ver. 10.0.1 measurement, Heavy Splatling, 60 fps capture, active charge or continuous-fire stream, interrupted with R; gear and exact held state are not separately stated by the source. Issues [#1006](https://github.com/rhgrive3/actions/issues/1006) and [#1021](https://github.com/rhgrive3/actions/issues/1021) cite the [original interruption table](https://wikiwiki.jp/splatoon3mix/%E6%A4%9C%E8%A8%BC/%E3%83%A1%E3%82%A4%E3%83%B3%E3%82%A6%E3%82%A7%E3%83%9D%E3%83%B3/%E5%89%8D%E9%9A%99%E3%83%BB%E5%BE%8C%E9%9A%99). Its preface defines the frame-count endpoints; the Heavy Splatling row records 5F to sub and 6F to squid for both stream and charge interruption. Nintendo's [official Ver. 10.0.1 notes](https://support.nintendo.com/jp/switch/software_support/av5ja/1001.html) identify the version and release date but do not document this timing. INKWAVE's parameter profile remains pinned to Ver. 11.3.0; the table is not a fresh Ver. 11.3.0 console measurement. No new console capture was performed, so hardware timing remains unverified. The existing 6F squid interruption remains a separate destination.

On current main `c2c938b9af5b6cce2a7bdbecf0415c7c3836cadb`, the complete six-source-adapter production composition plus `installWeapons`/`installSplatling` and `installGear`/`installSubReady` admitted `s3SubReady` at age 0 and `aimingSub` on the first R update for both an active stream and an active charge. The candidate implementation held the action during the delay, but initialized its five-frame timer without consuming the initiating update; it therefore handed off on fixed update six. This review corrected the timer so the initiating R update counts as frame one: frames 1–4 keep an active stream or unpaid charge with no `aimingSub`, sub-ready clock, or sub projectile; on frame 5 the native Splatling cancellation path retires the main action and normal sub-ready starts at age 0. If ZR is released with R during a charge, the pending gate keeps the unpaid charge alive so it does not become a paid burst first. A paid stream continues its main burst during the delay, then refunds its exact remaining unspent-round balance once at the boundary.

The focused full-composition tests use the public `Actor` and installed runtime and verify both destinations at 60 Hz, plus matching fixed-step histories under 30/60/120 Hz render schedules. The same focused command passed 36/36 tests, including the charger 5F gate, #679/#686 squid interruption, and #501 natural stream completion/cadence controls. The existing current-main baseline was not repeated; its pre-implementation receipt already records the one-time main run. No browser or Switch capture, full build, CI run, network playback, or separate Practice Range scenario was performed. The implementation does not modify network, movement, profile, or public-game source.

Seven focused production-module tests cover blocked partial, off-ray control, the authoritative full boundary (charge 1, ding-aligned per #840), both sides of the .125 contact-radius boundary, wall / actor ordering and actor enumeration reversal, ghost non-authority, and30/60/120Hz rendering over fixed steps. They instantiate native Actor/Projectiles and Physics; the hit callback is recorded at the solver boundary. This is not a full recipient HP/network acceptance test or a Switch measurement. The behavior requirement follows Issue870's current-series teammate-bodyblock evidence and the existing partial/full distinction. Full build/browser/CI acceptance belongs to the next integration batch.

## 2026-10-08: Charger near-full partial no longer promoted to full (#840)

Base: main `c2c938b9af5b6cce2a7bdbecf0415c7c3836cadb`. The base Charger ding fires only at `charge >= 1` (`inkwave-public/src/game/weapons.js:157`), but the installed adapters promoted q=0.999 (reachable as a near-full partial) to every discrete full-only effect: 160 damage, opponent piercing, squid charge-keep storage (`s3Stored`), and the exact FullCharge range/speed/paint endpoints. Parent full-production native fire probe at `C840-parent-r396/native-fire.log` showed q=0.999 firing full (damage 160, speed 288). A current-MAIN full-composition probe (adapted public modules + `runtime/install()`, real Projectiles) reproduced the same: q=0.999/0.9999 fired full while q=0.9989 stayed partial.

The fix introduces one authoritative predicate, `isChargerFullCharge()` in `patches/splatoon3/runtime/weapons.mjs` (finite charge >= 1, exactly matching the native ding with no epsilon), and applies it in `patches/splatoon3/runtime/weapons-charger-flight.mjs` (`chargerPartialCharge` clamp removed, `chargerPaintParameters` full flag, `reachFor`, `begin` full/damage/speed), `patches/splatoon3/runtime/weapons.mjs` (squid store gate and `fireCharger` piercing wrapper), and `patches/splatoon3/runtime/resources.mjs` (charge-interrupt guard). Partial paint/range/speed now interpolate toward the pinned MaxCharge endpoints; only charge 1 takes the FullCharge step. Genuine full (160 + piercing + keep eligibility + exact full endpoints + ding) is preserved; minimum-charge, low-ink rate, ink accounting and post-shot timing are untouched, and #775 progressive charge spending is not rewritten. The focused boundary probe covers 0.9989/0.999/0.9999/1.0 through the full production composition at 30/60/120Hz; the native teammate-bodyblock regression also rejects the former epsilon counterexample, 0.9999999995.

Reference data: pinned Splat Charger completion values only (damage 40/80/160, update-history split; extracted MoveParam/PaintParam/Splash endpoints; Ver. 11.3.0 profile). No new Switch measurement is claimed; device/frame comparison with Splatoon 3 hardware remains unmeasured.

The four targeted files passed 56/56 after correction. Tests run through the public `Actor` and installed runtime verify negative controls at frames 1–4, exact retirement/refund on frame 5, sub-ready age zero, and matching fixed-step histories under 30/60/120 Hz render schedules. Existing Splatling owner and refund regressions now check the same boundary while retaining no-double-refund, no-old-burst-resurrection, special, weapon-switch, reset, and death controls. The C2 baseline evidence and CI candidate report are reused; this change does not repeat the current-main run. No browser or Switch capture, full build, CI run, network playback, or separate Practice Range scenario was performed. The implementation does not modify network, movement, profile, or public-game source.

### #840 native-CI full-clock correction

The exact candidate head `bf9da6756efde257cb9d98e202756a5d7d298ae7` later reproduced one remaining failure in native CI at `charger-store-359.test.mjs:188`. A local reproduction through the full source-adapter chain and installed runtime used full-ink grounded Splat Charger, held ZR, the existing #726 `1/60 s` startup, then the profile's `1 s` charge clock. With direct `Actor.update(dt)` calls at 30 Hz, the thirty charge updates ended at `chargeT=0.9999999999999999`; the strict #840 predicate correctly rejected the owner state and no valid keep was stored. This was owner-side elapsed progress rounding, not a near-full wire packet.

The wrapper now keeps a compensated elapsed-seconds clock for each owner charge and hands exact `chargeT=1` to the native charge endpoint only when that clock reaches the configured duration. Existing ink-limited progress remains capped, and `isChargerFullCharge()` remains finite `q >= 1` with no epsilon. Near-full packets and presentation values such as `0.9999999995` remain partial. Charge rates, minimum charge, the 1/60 startup, ink accounting, damage, launch speed, range, and geometry are unchanged.

The comparison target is Splatoon 3 Ver. 11.3.0 Splat Charger, grounded with full ink and held ZR, using base weapon parameters and no explicit gear modifiers in the fixture. INKWAVE's executable public-side proxy (`inkwave-public/src/game/weapons.js:157`) triggers its native full event only at `charge >= 1`; this task does not treat that project source as an official Nintendo frame-value source. Exact Switch frame-by-frame parity remains unmeasured. Focused tests establish the INKWAVE owner clock/store behavior and preserve strict partial controls, not physical-device equivalence.

The native-CI corrective selection passed 22/22 focused tests: the #359 complete-composition store path, the #840 exact full-clock/store boundary at 30/60/120 Hz, damage and strict near-full boundary controls, live HUD range at `0.9999999995`, teammate body-block, stored-charge keep delay/reset, and unchanged 30/60/120 Hz charge-speed cadence. The archived native CI failure on `bf9da675` remains historical evidence; this corrective lane did not dispatch CI or claim a full-green workflow.

## 2026-10-08: Split Joy-Con input aggregation (#877)

Reference conditions remain Splatoon 3 Ver. 11.3.0, as recorded above; controller setup is a left and right Joy-Con in the two-handed grip configuration. Nintendo's [Joy-Con overview](https://www.nintendo.com/au/support/articles/joy-con-overview/) documents the grip as one controller, and its [Splatoon 3 beginner guide](https://splatoon.nintendo.com/en/news/beginner-basics-for-splatoon-3-tips-for-improving-in-battle/) describes the Joy-Con Grip setup. In that layout, the left stick moves, the right stick aims, ZL swims and ZR fires. This change only assembles input sources; it changes no gameplay movement, aim sensitivity, timing or weapon values.

At INKWAVE public-source baseline `c2c938b9`, `Input.pollPad()` selected the first standard-mapped Gamepad and `PlayerController` read its movement, camera and action controls. At candidate base `1b1426fba40c`, the complete production six-adapter composition still selected only that first Gamepad when supplied Chromium's documented 17-button/2-axis standalone shape: the candidate's 22/4 pair gate rejected both halves, so the second unit's right-stick axes and ZR were unreachable. This reproduces the uncovered failure through the production source composition rather than through the raw input module or one adapter in isolation.

The source check uses Chromium revisions pinned in the links below. Chromium's Windows standard-mapping table lists Nintendo products `2006` (L) and `2007` (R) as `MapperSwitchJoyCon`. That mapper passes through the 17 standard button slots and exposes exactly two axes; `MapperSwitchComposite` instead exposes 22 buttons and four axes. Chromium's Nintendo controller maps a standalone half into horizontal Gamepad positions, while its Nintendo data fetcher associates connected left/right devices and makes one composite device. Thus a native-fetcher path that already combines both halves reaches JavaScript as the composite (product `200e`) and must remain a single pad; separate-half aggregation applies only when the browser path actually exposes both `2006`/`2007` Gamepads.

The reliability overlay in `patches/reliability/joycon-pair-adapter.mjs` now composes only one unambiguous pair with Chromium's documented standard mapping, exact `17 buttons / 2 axes` shape, and Nintendo IDs `057e:2006` plus `057e:2007`. It reverses the standalone horizontal button/axis remap into one 22-button/four-axis grip layout. The `200e` composite stays as-is, ordinary standard controllers retain priority, and unknown IDs, malformed shapes, or ambiguous pairs do not activate composition. `patches/reliability/pad-handoff-adapter.mjs` continues to rebase held controls on pair connect, member disconnect and reconnect so those transitions do not create fresh press edges.

The focused full-composition test drives the composed `Input.pollPad()` and `PlayerController` with connected 17/2 L/R Gamepads in either list order. It checks movement, right-stick camera yaw/pitch, ZL/ZR, horizontal face/d-pad/shoulder/capture restoration, a native-shaped 200e composite, ordinary-pad priority, unsupported and ambiguous inputs, disconnect/reconnect held edges, touch gyro ownership and keyboard input. Before the fix, this 17/2 composition failed to reach the pair path; the old synthetic 22/4 standalone fixture passed and is no longer used. This is a source/runtime-logic check with native-shaped Gamepad objects, not a physical-device or live-browser measurement. No physical Joy-Con or Splatoon 3 hardware comparison was performed. On a Chromium path where `NintendoDataFetcher` automatically combines the pair, JavaScript already receives one `200e` Gamepad and this aggregation change has no work to do on that path. Whether a particular installed browser/OS exposes separate 17/2 halves remains unverified.

Pinned Chromium primary sources: [Windows product mapping at revision 413fd160](https://chromium.googlesource.com/chromium/src/+/413fd1606bc99bb77bae372b1a8103594806c4cc/device/gamepad/gamepad_standard_mappings_win.cc), [17/2 standalone and 22/4 composite shapes at revision dcf719ea](https://chromium.googlesource.com/chromium/src/+/dcf719eabeb25d9efee139d0294fee2d5976c0f2/device/gamepad/gamepad_standard_mappings.cc), [horizontal Nintendo controller remapping at pinned Chromium source revision](https://chromium.googlesource.com/chromium/src/+/a5547854f1e8cb6bd3/device/gamepad/nintendo_controller.cc), and [NintendoDataFetcher pair association at revision a2b8f859](https://chromium.googlesource.com/chromium/src.git/+/a2b8f859dd2d77ce60686a10a1a5160f20e38efe/device/gamepad/nintendo_data_fetcher.cc).

## 2026-10-08: Squid Surge owner/remote presentation parity (#1088)

| 比較項目 | 記録 |
| --- | --- |
| 本家参照 | Splatoon 3 Ver. 11.3.0。条件は Inkling、Shooter、ギア能力補正なし、インク中の壁をイカで登り、ジャンプを押してチャージ後に離す操作。[Nintendo の公式 gameplay guide](https://splatoon.nintendo.com/en/gameplay/) はイカノボリを壁上でチャージして上へ飛び出す操作として説明する。[公式 Ver.11.3.0 更新履歴](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/p/1076/c/950)。公開資料は Nintendo の正確な pose 曲線・frame 値を示さない。 |
| INKWAVE の基準・再現 | 対象 main は `c2c938b9af5b6cce2a7bdbecf0415c7c3836cadb`。修正前に production composition の全6 adapter と実 NetMatch / Actor / Character を使い、owner Character が `surge-charge`、remote Character が pose なしとなる状態を再現した。修正前の送信 row に C1088 presentation tag がないことは [`baseline-before-fix.log`](/mnt/workspace/inkwave-batch-c/evidence/additional-100/codex5-c1088-r444/baseline-before-fix.log) に保存。raw `inkwave-public/` 単独や adapter 単体の結果ではない。 |
| 実装箇所・変更 | `patches/network-replication/issue-1088-surge-presentation.mjs` と `issue-1088-surge-adapter.mjs` が tag `inkwave.s3.surge.v1` と optional sidecar を追加する。owner の actor life、action epoch、phase、有限 charge/time と sample age を載せ、現在の NetMatch sample timestamp / playback cursor から remote pose の経過を復元する。現行 main `4a3cc811` の24列 actor rowでは既存 `stats.specials` slot 22 と `inkwave-adoption-v1` slot 23 を保ち、C1088 sidecar を slot 24 に追加する。remote state は `Actor.s3.actions` から分離し、`movement-motion.mjs` / `wall-motion.mjs` は presentation だけを読む。現行 authoritative profile の値を再利用する。移動、armor、collision、speed、ink、damage、credit、既存 event 順序と gameplay field は変更せず、optional sidecar の追加に限定する。paint ordering の経路も変更しない。 |
| 再現操作・影響 | 二つの実 NetMatch と実 Character を production composition で接続し、owner の壁登り charge → burst → end を送り、各 pose sample を remote 側で再生する。owner action / remote snapshot の間隔を 30/60/120 Hz で進める。修正前は local だけがチャージ・バースト pose を持ち、remote では動きの連続性が失われる。修正後は charge / burst 中の movement・wall pose と進捗が一致し、end で消える。再接続時の途中 burst reconstruction、重複・古い snapshot、古い epoch / life、malformed・legacy row、未認可 sender、respawn と ownership adoption の cleanup も確認する。remote sidecar は action / armor state を作らない。 |
| 確認状態・限界 | 当初修正の確認は [`issue-1088-surge-presentation.test.mjs`](../patches/network-replication/tests/issue-1088-surge-presentation.test.mjs) の full-six composition / 実 NetMatch / 実 Character による 30/60/120 Hz state sequence と lifecycle controls（1/1）。現行 main `4a3cc811` で同じ full-six test を再確認し、24列 core row、slot 22/23 の既存値・tag、slot 24 の C1088 sidecar、22列 legacy row の受け入れを含む 2/2 が成功した。テスト用の合成 snapshot は新しい adoption sequence を使い、once-only gate を維持する。Practice Range の isolation / wall recovery controls は `isolation.test.mjs` と `issue-179-wall-recovery.test.mjs` が 8/8（[receipt](/mnt/workspace/inkwave-batch-c/evidence/additional-100/codex5-c1088-r444/range-controls.log)）。pose 曲線は既存 profile の内部 calibration であり、Nintendo 完全一致の主張ではない。ブラウザ描画、二台の実機通信、Nintendo Switch 実機比較は未実施。Nintendo が公開していない frame 値・速度は推定していない。 |

## 2026-10-08 — Super Jump cannot bypass lethal-water ownership (#1050)

**Reference and conditions.** [Issue #1050](https://github.com/rhgrive3/actions/issues/1050) describes admission and jump-owned movement bypassing INKWAVE's established lethal-water rule. The profile remains pinned to Splatoon 3 v11.3.0. Native tests use a live owner, ordinary weapon, controlled wet/no-ground and dry-ground fixtures, jump admission/wall/flight states and unchanged profile values. This correction reuses the existing water predicate; no new Nintendo threshold, charge/flight timing or pose numeric is sourced or inferred. Original-game Switch timing and physical-device comparison remain unverified.

**INKWAVE path and change.** On main `c2c938b9af5b6cce2a7bdbecf0415c7c3836cadb`, all six production adapters leave the admission, wall-supported charge return and flight branch able to bypass the existing owner water-death helper. `patches/splatoon3/adapter.mjs` invokes that helper before creating a jump and before/after jump-owned motion, then returns once its existing death commit has made the actor dead. The already-correct unsupported falling-charge branch remains covered. Ordinary hazard effects, attacker attribution, dry-ground exemption, trajectory, timers, resources and protocol remain owned by the existing code.

**Reproduction and impact.** The native main differential had two passing controls and six failures; a live actor below the lethal boundary could start/continue jumping instead of committing water death. The permanent wall fixture now splats at admission before a wall-supported jump is entered. In the full six-adapter Actor/NetMatch test, an owner below the water boundary cannot admit a jump; the receiver consumes its accepted death once, ignores duplicate/late alive packets and emits no echoed gameplay death. This prevents jump rescue of an already-lethal position without making remote visual playback authoritative.

**Verification and limits.** `patches/splatoon3/tests/issue-1050-superjump-water.test.mjs` passes nine cases; the final product source `3132ec1` passes 52 combined network/Range/kit tests, production build and the unchanged startup budgets. The later final-review UI diagnostics change only the verifier and preserve product/build/startup Git identity. Controlled native logic and peer playback are verified; rendered browser, two physical clients and Nintendo Switch fidelity/timing are not. Native batch CI remains pending, and the earlier third-round UI ring failure remains unclassified. See [the updated water record](inkwave-special-water-hazard-592.md).
## 2026-10-08: time-coherent flight projectile hits (#1040)

**Reference and conditions.** Splatoon 3 Ver. 11.3.0, Turf War, Shooter / Dualies / Splatling / Blaster flight projectiles, ordinary actor movement and no gear modifiers. Nintendo's [official update history](https://support.nintendo.com/jp/switch/software_support/av5ja/1130.html) identifies the reference release; its [official weapon guide](https://splatoon.nintendo.com/en/news/beginner-basics-for-splatoon-3-choosing-the-right-weapons/) identifies the weapon classes, but public materials do not specify moving-target collision timing, network teleport sample semantics, or per-frame collision values. The control procedure for this INKWAVE check is local movement and a remote NetMatch sample applied during the fixed simulation tick. No Switch hardware comparison was performed, so Splatoon 3 parity for this internal collision detail remains unconfirmed.

**INKWAVE implementation and reproduction.** `patches/splatoon3/runtime/clock.mjs` captures actor position and form before the composed actor update. Generic fidelity projectiles use `weapons-fidelity.mjs::fidelityProjectileTargets()`; source-guided Shooter / Dualies / Splatling rounds instead use native `InkFlightRuntime.stepHead()`, which is connected by `patches/splatoon3/adapter.mjs` to the same-tick relative-motion sweep. That path keeps InkFlight's per-weapon round radius and uses `player-hurtbox.mjs::hurtboxRadius()` / `hurtboxHeight()` for the current actor form. `actor-motion.mjs` rejects intervals when actor form, lifecycle epoch, or the real remote sample's `tp` identity changes, then retains the current-pose collision fallback. There is no distance threshold. Reproduce with `node --experimental-vm-modules --test patches/splatoon3/tests/issue-1040-time-coherent-projectiles.test.mjs`: the tests exercise the installed six-adapter composition through `runSimulation`, real local `Actor.update` for Dualies dodge and Splatling movement, all four admitted round families, and continuous remote samples at 24/30/60/120 Hz plus a simulated render hitch. The shot fixture starts outside the native capsule; its internal velocity and position only define test geometry. The short remote teleport is a test fixture identity change, not a Nintendo movement value.

**Player impact and confirmation.** Continuous actor motion is tested at its contact time so a target that enters the path after a round passes is not hit and a target that occupies the path at pass time is not missed. A marked spawn or NetMatch teleport is not swept through intermediate positions; the target's current pose keeps the legacy static fallback. Focused full-composition confirmation: 11/11 pass, including once-only damage, nearest-target selection, terrain ordering, local and remote cases, four render cadences, and the hitch control. Charger hitscan, bombs, special blasts, and reticle targeting remain separate collision roots and are not covered by this flight-projectile comparison. Fixture velocities and relocation distances are internal test data only; they do not assert Splatoon 3 numeric values.

## 2026-10-08 — #358 roller foot-paint current reconciliation (test-only)

Reference: Splatoon 3 Ver. 11.3.0 Splat Roller, no gear effects. INKWAVE scope is
`patches/splatoon3/tests/roller-foot-paint-composition.test.mjs` through the complete
six-adapter production composition plus installed native runtime. Raw `inkwave-public`
alone is not a reproduction. Parent evidence `EV/C358-current-native-root-cl3-r576.json`
accepts the actual root: only the vertical projectile-physics hash differs
(`647ddc60...` vs stale `e0845aaa...`); grounded and airborne payloads stay invariant,
horizontal golden unchanged, height 2.21 source bound still yields no paint.

Change (test-only, no Roller runtime tuning): the vertical assertion no longer compares
against the stale a628-tuned golden. It runs one independent SAME current-production
grounded control (`y=0`, grounded) and requires airborne `y=1.8` physics to equal that
control field-for-field, with height-origin normalization `[1.8, 1.3, 1.3, 0.3, 0.3]`,
unchanged seed/counts/RNG (`30` draws)/life/velocity/damage/radii, and intentional
`trailEvery=0` primary-trail-owner expectation (`roller-vertical-paint.mjs:23`, #423;
legacy `1.8` stays disabled to prevent double paint). Stale hashes remain only as
provenance comments. Owner/proxy release-paint replay still runs once. Neighboring
`issue-423` (4 fail) and `issue-847` final b34 case (missing `rollerContactCandidate`
export) fail identically before this edit and are out of scope.

## 2026-10-08 — Empty-ink Roller keeps Roller-down as a dry roll (#541)

**本家参照:** Splatoon 3 Ver. 11.3.0, Splat Roller. The current Splat Roller reference notes a mechanical clunking sound while rolling when out of ink, applying to all rollers — i.e. running out of ink does not immediately cease the Roller-down/rolling state itself. Source-primary verification limits (2026-10-08): both splatoonwiki.org fetches (Splat Roller page, Version 11.3.0 page) returned HTTP 403 and the Nintendo support answer returned HTTP 406, so no dry-roll passage was independently re-verified in this lane; the structural persistence point is carried from the issue's recorded reference and the earlier root audit. The pinned Leanny/splat3 extraction `7280ff9` contains no dry/clunk parameters, and the comparison-record measurement-version limitation stands: exact S3 dry-roll movement speed/acceleration and the clunk audio are **unconfirmed**, and no values for them are invented here.

**INKWAVE root and correction:** `inkwave-public/src/game/weapons.js::_roller()` gated the rolling state itself on ink (`canRoll = inp.fire && a.grounded && a.ink > 0.5 && ...`), so the first update at `ink <= 0.5` forced `rolling=false`, `rollT=0`, stopped the roll loop, and dropped out of the rolling branch of `moveSpeed()` even with ZR held. The owned S3 overlay `patches/splatoon3/runtime/roller.mjs::installRollerLogic` now snapshots the hold before the native call and, only for an already-Roller-down roll with ZR held, grounded, no flick in flight, and paid-ink history (`s3RollerWasDry` or pre-tick ink above the threshold), restores `rolling=true` after the native teardown and continues `rollT` from its entry value (dash timing stays continuous). It re-anchors both `lastRollPos` and the #537 `lastRollInkPos`, then resets `rollInkChargedDistance` with the fresh paint interval so refill cannot bill dry travel. This keeps the existing grounded/native admission guard: it does not cold-start at zero ink or broaden restoration to an airborne, unadmitted roll. Paint, contact damage, and further ink spend stay native-gated on the zeroed tank (verified zero new hits/paints in the focused suite). Dry audio stays as the native teardown leaves it (loop stopped); the S3 dry clunk is explicitly unmodelled. The existing #626 interruption still requires ink (`armsInterruption` unchanged), so depletion arms nothing and a later dry release arms nothing either.

**Reproduction and acceptance:** Before the original fix, the composed fixture (`fixture()` + production `installRollerLogic`) showed `rolling true→false, rollT 2.883→0` on the zero-ink tick and natural depletion (`ink 0.335`) clearing the roll on the next tick. The later #537 integration exposed a refill gap: with six dry steps of 0.02 units at 1.2 units/s, the first paid tick charged 0.10606% instead of its 0.02% minimum-floor charge because `lastRollInkPos` remained behind. After re-anchoring both positions and resetting the interval ledger, the complete six-adapter composition charges only that paid tick's floor amount. Dry holds still paint/hit/spend nothing; ZR release exits with `rollT=0` and no #626 arm; mid-hold refill resumes with continuous dash timing; cold start at zero ink stays down. Regression: `patches/splatoon3/tests/issue-541-roller-dry-roll.test.mjs` (7/7), `issue-537-roller-roll-ink-floor.test.mjs` (7/7), and `issue-626-roller-stop-interruption.test.mjs` (13/13). These are deterministic VM/native-composition checks; no browser session or Switch re-measurement was performed.

**Player impact and confirmation.** Continuous actor motion is tested at its contact time so a target that enters the path after a round passes is not hit and a target that occupies the path at pass time is not missed. A marked spawn, form change, or NetMatch teleport is not swept through intermediate positions; the target's current pose keeps the legacy static fallback. Focused full-composition confirmation: 11/11 pass, including once-only damage, nearest-target selection, terrain ordering, local and remote cases, four render cadences, form-change invalidation, and the hitch control. Charger hitscan, bombs, special blasts, and reticle targeting remain separate collision roots and are not covered by this flight-projectile comparison. Fixture velocities and relocation distances are internal test data only; they do not assert Splatoon 3 numeric values.
## 2026-10-08 — Roller rolling ink minimum floor (#537)

Reference: Splatoon 3 Ver. 11.3.0, Splat Roller, with no gear for the baseline. The pinned `WeaponRollParam` data gives `InkConsumeMinPerFrame=0.0002`, `InkConsumeMaxPerFrame=0.001`, `SpeedInkConsumeMin=0.02`, and `SpeedInkConsumeMax=0.132`; the linked parameter glossary converts the rate values to percent per second with `value × 6000`. The existing INKWAVE world-speed conversion multiplies source speeds by 60, so the endpoints map to 1.2 and 7.92 world units/second, and the rates map to 1.2%/s and 6.0%/s. Sources: [pinned Ver. 11.3.0 Roller parameters](https://raw.githubusercontent.com/Leanny/splat3/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponRollerNormal.game__GameParameterTable.json), [parameter glossary](https://wikiwiki.jp/splatoon3mix/%E6%A4%9C%E8%A8%BC/%E3%83%91%E3%83%A9%E3%83%A1%E3%83%BC%E3%82%BF%E3%83%BC%E6%83%85%E5%A0%B1/%E3%83%A1%E3%82%A4%E3%83%B3).

On main `c2c938b9`, the S3 adapter composed through touch layout, reliability, local quality, network replication, and practice range still left the public `WeaponRunner` drain in the 0.28-unit paint batch: it deducted `rollInkPerMeter × moved`. At 1.2 units/second that yields about 0.9091%/s and delays each tank update until a paint batch is committed, although the full-speed distance rule reaches 6%/s. The adapter now charges ink each simulation update independently of the paint batch. At and above the sourced minimum speed it retains the existing per-distance rate and raises that update's charge only when needed to meet the sourced 1.2%/s minimum; it does not infer an intermediate rate curve from the endpoint fields. At the 7.92 units/second cap, the unchanged distance rule still gives 6%/s. Ink Saver (Main) scales both the distance rule and minimum floor through the existing gear modifier. Existing 6.48/7.92 roll caps and the 90-frame dash transition are unchanged.

Below `SpeedInkConsumeMin` and while stationary, the extracted fields do not establish native behavior. Those cases retain the previous distance-based rule and are not claimed as a Splatoon 3 match. Focused tests exercise the six-adapter source composition at the minimum and maximum, verify the preexisting distance policy at an interior speed above the floor, and preserve below-threshold, stationary, gear-scaled, paint-batch-independent, and 30/60/120 Hz behavior; an existing full-composition Roller baseline also passed. The #541 refill integration also runs that composition through six dry steps at the minimum speed and verifies that the first paid tick charges one floor tick instead of retroactively charging dry distance; it does not alter the sourced floor values. The intermediate-speed policy is retained from INKWAVE and remains unverified against Nintendo hardware. This verifies the INKWAVE composition and deterministic rate model, not a Switch capture or the exact native intermediate curve.
## 2026-10-08 — Current integration lobby adapter reconciliation

Current integration `4a3cc811` introduced host-owned team confirmation (#1039)
before reliability source adapters. This invalidated three exact source anchors
used by the existing #1003 minimum-human and #1103 ready-invalidation gates;
the production build stopped before generating a deployable site. The adapters
now preserve the host-confirmation predicate and method-local lobby revisions
while still requiring two human players for Turf and invalidating ready after
weapon or launch-critical settings change. Boss solo admission remains distinct.
`host-teams-start-composition.test.mjs` exercises the complete production source
composition and the actual native method bodies for both admission and mutation.
This is an INKWAVE integration repair; no Nintendo balance value or protocol is
changed. Existing upstream claims remain with their owners.

The current merged module graph also produced 160 eager core HTML hints, above
its unchanged 131-request gate. The build now bounds only those eager hints in
existing deterministic graph order. It preserves every runtime import and the
complete immutable service-worker graph; the unchanged startup gate checks all
transitive imports, cache bytes, digests, and artifact identity. This is file and
dependency evidence, not a measured browser startup-time improvement.

Current master encodes cache assets as `[bytes, sha256]`, while navigation index
metadata remains `{bytes, sha256}`. The worker rejected that index during every
cold install; the existing exact worker-install test reproduced the rejection.
Integrity verification now validates both encodings strictly. Artifact gates
normalize descriptors before applying their original byte/digest/closure checks;
all budget limits remain unchanged. Negative descriptor tests reject missing,
malformed, non-finite and incorrectly typed metadata instead of allowing `NaN`
to mask budget evidence. This compatibility repair does not claim a new Issue.

## 2026-10-09 — #642 mobile HDR composer storage and lifecycle

**本家参照と条件。** 比較対象は Splatoon 3 Ver. 11.3.0（[任天堂の公式更新履歴](https://support.nintendo.com/jp/switch/software_support/av5ja/1130.html)）。この作業は post-processing target の形式・寿命・解像度だけを変え、ブキ、ギア、移動、被弾、インク、入力、simulation とゲーム内状態を変更しない。武器・ギア・操作条件が関係する変更ではない。任天堂の公開資料にブラウザ post-processing の形式や GPU 確保量はなく、この作業では Splatoon 3 の Switch 出力を新たに撮影・比較していない。よって S3 の視覚的一致、GPU メモリ、frame timing は未確認。

**INKWAVE の対象と変更。** `inkwave-public/src/core/renderer.js:15-89,145-192` の shipped Grade shader と FXAA shader、pass order（Render → Grade → ScreenFX → Output → FXAA）、`:213-236` の dynamic-scale/resize を対象にした。`inkwave-public/src/fx/screenfx.js:32-235,361-396,541-575` の ScreenFX shader と 64×72 LensInk field も実行した。Three r186 `inkwave-public/vendor/three/jsm/postprocessing/EffectComposer.js:52-81,317-348` は constructor 中に renderTarget を clone し、pixel ratio と logical size から二枚を resize する。Build adapter は composer pair の作成を最初の visible render まで遅らせ、hidden 時の on-screen pair を release し、再表示時に同じ HalfFloat/sample/size 条件で作り直す。hidden 中の明示的 offscreen render は維持する。実動的 scale で `1.2 × 0.75` の浮動小数点積が物理 target 寸法を整数の直前にするケースがあったため、adapter は pixel ratio を 1e-6 単位へ正規化して整数 backing size を保つ。これは表示密度に最大 0.0000005 の差を許す処理で、ゲーム値には触れない。

`patches/local-quality/composer-format-adapter.mjs:36-160` は WebGL2、`EXT_color_buffer_float`、実際に作成・bind した 1×1 FBO の complete 状態、Grade が負の RGB を出さない条件をすべて満たす mobile profile だけで Grade 出力を `THREE.RGBFormat + THREE.UnsignedInt101111Type`（R11F_G11F_B10F）にする。scene/read target、ScreenFX の書き戻し target、LensInk field は `RGBAFormat + HalfFloatType`（RGBA16F）のまま。WebGL2/extension/FBO/Grade 条件を満たさない場合、MSAA/AO/bloom が有効な場合、または desktop では RGBA16F に fallback する。desktop High は要求 MSAA 4、RGBA16F HDR を保持する。`patches/local-quality/composer-target-adapter.mjs:7-80,130-168` が遅延生成と一回ずつの resize/dispose を実装する。

**実 WebGL format と allocation。** Chromium/Chrome for Testing 153.0.8010.12、WebGL 2.0 / GLSL ES 3.00、`EXT_color_buffer_float=true`、renderer `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)` で実行した。これは実際に WebGL context と FBO を使う browser/software GPU 検証であり、物理 GPU ではない。CSS viewport 320×180、DPR 1.2 の出力は 384×216。両 reference target は RGBA16F、16/16/16/16 attachment bits、8 B/texel、complete FBO。選択時 target 1 は R11F_G11F_B10F、11/11/10/0 bits、4 B/texel、complete FBO。target 2 は RGBA16F、16/16/16/16 bits、8 B/texel、complete FBO。二枚の color attachment 合計は 16→12 B/pixel、25%減（384×216 で 1.265625→0.94921875 MiB）。これは attachment bits から算出した color-only 値で、depth/stencil、driver padding、resident process/GPU overhead を含まない。LensInk field は RGBA16F 64×72 のまま。Desktop High selection は RGBA16F。negative Grade input は RGBA16F fallback となった。

**実画像比較。** Harness は shipped Three r186 EffectComposer、RenderPass、GradeShader、実 ScreenFX class/shaders、OutputPass、FXAAShader を同一 source image・同一 effect state で reference RGBA16F と選択 target に通し、384×216 final framebuffer の RGB8 readback を比較した。各ケース 82,944 pixels / 248,832 RGB channel samples。許容値は channel code 0–255 の mean absolute difference ≤1.25、P99 ≤3、alpha mismatch pixels = 0。全9ケースがこの基準を通過した。`max` は別途全チャンネルの最大差として記録し、3 code の許容値と混同していない。

| shipped path | mean | P99 | P99.99 | max |
| --- | ---: | ---: | ---: | ---: |
| Grade + FXAA | 0.522 | 2 | 11 | 36 |
| Damage ScreenFX + FXAA | 1.067 | 3 | 6 | 13 |
| Lens splat ScreenFX + FXAA | 1.069 | 3 | 12 | 36 |
| Low-health damage ScreenFX + FXAA | 1.010 | 3 | 10 | 21 |
| Swim ScreenFX + FXAA | 1.056 | 3 | 5 | 14 |
| Special aura ScreenFX + FXAA | 1.072 | 3 | 14 | 36 |
| Flood ScreenFX + FXAA | 0.476 | 2 | 3 | 3 |
| Respawn reveal ScreenFX + FXAA | 0.725 | 3 | 8 | 12 |
| Combined damage/swim/aura/flood + FXAA | 0.477 | 2 | 3 | 3 |

全ケースで alpha mismatch は 0。差 16 code 超は 38 RGB samples、差 32 code 超は 14 samples、最大差は 36 code（Grade 3、lens 4、special aura 7 samples）だった。これらは 248,832 RGB samples 中の tail values であり、最大差をゼロや閾値内とは扱わない。PNG reference/selected pairs と per-case histograms は `/mnt/workspace/.dev-state/agent-work/evidence/inkwave-c-resume-20261009/codex2-642-currentmain/webgl-acceptance/` に保存した。

**resize/dynamic-resolution lifecycle と確認。** Initial CSS 320×180 / PR 1.2 では両 target 384×216。production `setDynamicScale(0.75)` 相当、normalized PR 0.9 では両 target 288×162。orientation resize 180×320 では両 target 162×288。各 scale/resize で前 pair の dispose event は正確に2件、generation は1のまま、final dispose は残る2件を一度だけ破棄し、各 FBO は complete。8 focused native tests (`composer-residual-642.test.mjs`, `composer-target-adapter.test.mjs`) pass。Browser comparison JSON の `failures=[]`、context error 0、context loss false、page errors 0。`node scripts/build-inkwave.mjs` は build identity `714afd2ed4b8` で成功し、JS/CSS minification と 139-module preload composition を完了した。actual run command/log, target bit probes, and all 18 PNGs are under `/mnt/workspace/.dev-state/agent-work/evidence/inkwave-c-resume-20261009/codex2-642-currentmain/webgl-acceptance/`。

**プレイへの影響と未完了 acceptance。** Gameplay behavior, post shader source, target pass order, desktop HDR, and unsupported-device fallback stay intact; this only reduces the mobile Grade-output target from RGBA16F to the tested packed HDR format while retaining the RGBA16F scene target. The real-browser comparison demonstrates this checkout's SwiftShader result only. Physical iOS/Android GPUs and Switch are not measured; vendor-specific FBO support, actual resident allocation including driver padding/depth, device performance, and hardware image parity remain unverified. Nintendo source evidence does not specify post-stack color storage or comparable pixel tolerances, so no Splatoon 3 pixel-parity claim is made.

## 2026-10-08 — Roller depleted paint footprint (#305)

Reference: Splatoon 3 Ver. 11.3.0 Splat Roller, using the pinned `WeaponRollerNormal` table linked in the issue context. Its horizontal and vertical per-unit `PaintParam.DepletionDepthWidthRate` values are 0.5. The field describes the depleted projectile paint footprint; it does not replace collision radius, damage reach, or the sourced damage/speed parameters. The reduced fan's angular distribution is not specified by the available fields and remains unknown.

INKWAVE's production adapter composition now carries the paid depletion state at projectile birth and applies the mapped 0.5 scale only to depleted Roller paint footprints along flight and at impact. Missing per-unit paint data keeps the native default; normal swings use scale 1. This comparison is limited to deterministic installed-runtime tests, not Switch hardware or browser rendering.

PR1175 integration follow-up (2026-10-09): the native 4-ink horizontal swing emitted three main globs at paint scale 0.5 but left the appended nearest glob at the projectile pool's scale 1, even though its own pinned PaintParam also specifies 0.5. Shared Roller projectile initialization now reads DepletionDepthWidthRate after resolving the actual unit, covering the separate near-glob birth path. The native-composition regression checks every emitted depleted unit at 30/60/120 Hz, full-ink controls, each horizontal unit's impact width/depth, and depleted/full/depleted pool reuse. Synthetic per-unit rate and missing/invalid-field probes verify source ownership and fallback without changing the production profile. Release timing, ink spend, collision, speed, damage, and the full-ink footprint remain covered by their existing controls. No Switch measurement or browser pixel equivalence is claimed.

## 2026-10-08 — Paint-mask ownership and canonical ordering integration (#264)

**Reference and operating condition.** Comparison target: Splatoon 3 Ver. 11.3.0, ordinary match turf painting, with the ancillary splat and wall-paint ownership context from duty #264; no gear modifier or weapon-stat value is changed by this integration. Nintendo’s [official update notes](https://support.nintendo.com/jp/switch/software_support/av5ja/index.html) identify Ver. 11.3.0 (2026-08-20), but do not publish the GPU mask, per-cell ownership, or exact wall-paint pixel rules. The reference version is recorded; native frame timing, mask values, and hardware pixel output remain unmeasured.

**INKWAVE root and correction.** In the complete production adapter composition, a splat’s body cells are applied immediately while its shader growth contributes later. Local late growth and network replay previously had no single per-cell owner/order authority. Separate paint paths could therefore credit a delayed event after newer turf had claimed the same cell. patches/splatoon3/runtime/paint-ownership.mjs now keeps one persistent CPU cell-order mask and one compact event-order registry. The native CPU splat and late ancillary-mask path arbitrate through the same canonical local/network order; network records use the existing tick, sender, and event-sequence metadata while legacy-width records remain accepted. Shader submissions are clipped to contiguous runs of cells still owned by that event. Fixed simulation ticks advance ownership with the paint growth clock. Cosmetic remote splats still render through native GPU growth and do not alter local CPU turf or credit.

**Reproduction and confirmation.** Both focused tests use the real inkwave-public PaintSystem/weapon/projectile sources through all six active production adapters. The focused issue-264 test passes 7/7, including a contract fixture that parses the GLSL kindShape rows, checks the CPU table and zero-shaped fallback, and verifies owned CPU cells remain within submitted shader runs. It also exercises actual local weapon-origin credit, late growth, and 30/60/120 Hz render delivery. The canonical-order test passes 5/5 for opposing owner predictions, reverse delivery, delayed/duplicate and legacy records, mixed-event sequence handling, recreated sessions, and former-owner handoff. The offline practice range remains unowned. These are deterministic native-composition and CPU-contract checks; they do not measure a real GPU driver or a Switch capture.

**Player impact and status.** Overlapping growth events now converge on one canonical cell owner, so late delivery cannot transfer already-newer cells or award stale turf credit. Existing source-width units, packet layout, and gameplay timing values are unchanged. This comparison does not establish Splatoon 3 pixel parity: exact GPU-driver pixels, Switch wall-contact paint behavior, and native per-frame ownership are **UNKNOWN / unverified**. No claim that the charger's native wall-drop timing or pixel footprint was measured or resolved is made here.

## 2026-10-08 — Charger初弾8F射程の下端アンカー (#514, requalified on 03cf)

**本家比較条件:** Splatoon 3 Ver. 11.3.0、Splat Charger、ギア効果なし、通常フィールド上の地上射撃。pinned primary 11.3.0パラメータ `WeaponChargerNormal.game__GameParameterTable.json#/GameParameters/MoveParam`（commit `7280ff9`、2026-10-08に一次URLを再取得して確認）は `DistanceMinCharge=9.033`、`DistanceMaxCharge/DistanceFullCharge=24.037` の両端点のみを示し、charge-frame→distanceの中間写像フィールドを含まない。単位解釈・エンジンスケール・中間曲線は **UNKNOWN** のまま残す。

**INKWAVEの差分:** base `03cf55db` の `patches/splatoon3/runtime/weapons-charger-flight.mjs` の `reachFor` は `DistanceMinCharge+(DistanceMaxCharge-DistanceMinCharge)*charge` と汎用eased chargeを直結していた。native runner（`inkwave-public/src/game/weapons.js` のS-curve＋`chargeTime=1.0`）は最初の法的8Fで `chargeT=8/60`、`charge=1/6` となるため、完全なproduction adapter composition＋installed native runtimeで再現した初弾の法的射程は `lerp(9.033,24.037,1/6)=11.5337` だった。本修正は `reachFor` の生charge入力を `chargerRangeCharge`（既存 `chargerPartialCharge` の[1/6,1]->[0,1] bandのalias、`<=1/6` は下端clamp、fullは現行mainの `isChargerFullCharge`＝exact-1 gateを維持）に置き換え、初弾8Fを `9.033`、フルを `24.037` に固定する。HUD `chargerReach` とflight jobは同一の `reachFor` を共有するため同時に揃う。1–7F発射gate（#304）、chargeTime、damage（#506）、launch speed、ink、laser sight、paint律、中間区間の線形remap（本家未確定のため既存律を温存）は変更していない。公開版 `inkwave-public/` は変更していない。

**確認状態:** `charger-min-range.test.mjs` 7/7（band unit、native 8F birth、flight job min/full、HUD共有、単調性、非charger、ghost wire-len override）を実行し、修正前はRED（export欠落＋11.5337再現）、修正後GREENを確認。回帰として `charger-damage-curve` 4/4、`charger-launch-speed` 3/3、`issue-620 paint` 3/3＋`charger-keep-cancel` 12/12、`charger-hud-reach`（#711 8/8含む；#858 Splatlingのみbase既存失敗で別rootのため不変）を実行。これはlogic/runtime測定であり、ブラウザ描画やSwitch実機との一致証拠ではない。

## 2026-10-08 — Hot Blaster direct projectile vs Big Bubbler source-side object multiplier (#1161)

**本家比較条件:** Splatoon 3、ブキ=ホットブラスター（英語名 Blaster、この公開版では唯一の `kind:'blaster'` メインウェポン、直撃125/爆風70→50）。スペシャル=グレートバリア。ギア=なし、および（参考値として）ギアパワー「オブジェクトシェイカー」あり。参照はコミュニティ計測（wikiwiki ブキ/ホットブラスター および ブキ/スペシャルウェポン/グレートバリア、版数来歴 11.2.0 / 3.1.1 が明記）。Nintendo 11.3.0 での実機計測ではなく、11.3.0 でこの表が変化した証拠もない。

**本家の値:** 直撃弾のグレートバリアに対するソース側倍率は **1.9×**（pre-target 換算 125 → 237.5、相対 52.63% → 100%）。オブジェクトシェイカー装着時は同ソース倍率が **2.09×**（1.9×1.1）で、これは一度だけ適用される。汎用の別エントリ「ブラスター」は 2.1× であり、1.9× を全ブラスター亜種へ一律適用してはならない。INKWAVE の `tuning.rawPerDamageUnit = 100` は宣言済み・未校正（#1051）であり、これから割れる数や絶対バリア HP を導出しない。

**INKWAVE の実装箇所と変更:** base `0af3b959` の `patches/splatoon3/runtime/kit-big-bubbler.mjs` は `kitBarrierCandidate()` で `damageAtContact(p, point, t) * tuning.rawPerDamageUnit` を計算し、その後 outer barrier にのみ `raw.damageRatio` (0.64) を掛ける。`damageAtContact` は Roller 直撃に 1.8× を持つ一方、Blaster 直撃は `p.damage` をそのまま返し、1.9× が欠けていた。本修正は `damageAtContact` に、`p.type === 'blast' && weapon.kind === 'blaster'` のときだけ効くソース側倍率 `BLASTER_OBJECT_MULTIPLIER = 1.9` を追加する。これは `type:'blast'` の直撃弾のみ（爆風 `_blastBurst` はこのクエリに来ない）、かつ唯一の stock `kind:'blaster'` のみを対象とし、shooter・Roller・Trizooka（`kind:'trizooka'` で `type:'blast'`）・未掲載亜種を増幅しない。倍率はソース側で一度だけ掛かり、リモート提案は乗算後・ratio 後の量を運び、ホストの `adjudicateBigBubblerDamage` は再乗算しない。#1051 の canopy 0.64、#1046 の Roller 1.8、直撃125・爆風70→50 は不変。`inkwave-public/` は変更していない。

**再現と確認:** `node --experimental-vm-modules --test patches/splatoon3/tests/kit-big-bubbler-blaster-contact.test.mjs` は実 production composition（`kit-composed-fixture` の adapted inkwave-public + `installKitBigBubbler` + `installKitDefense`）で 4/4 通過。修正前は full-adapter 実測で dome delta が 8000（=125×100×0.64）となり RED、修正後 15200（=125×1.9×100×0.64）で GREEN。テストは (1) 実際の `Projectiles.update → fidelity _step → kitDefenseCandidate` 経路で耐久減少量、(2) source damage 125・object 1.9・rawUnit 100・target ratio 0.64 の分離、(3) shooter/非stock blast が 1.00× のまま、(4) authoritative local spend 1回・remote proposal が同一 canonical 量・host adjudication が一度だけ適用（再送は duplicate）を確認する。回帰: `kit-big-bubbler.test.mjs` 47中46、`kit-big-bubbler-drop-falloff.test.mjs` 6中5、`kit-defense.test.mjs` 8中6、`blaster-*` は全通過。

**プレイへの影響と限界（2026-10-08時点）:** ホットブラスター直撃がグレートバリアの耐久へ与えるダメージが本家のソース倍率どおり約1.9倍になる。対物攻撃力アップは当時未実装で、2.09× の受入条件は未充足だった。`kit-defense.test.mjs` の2件（"actual Bubbler mechanics…", "native blast shielding…"）と `kit-big-bubbler.test.mjs` の #1013 Special Power、`kit-big-bubbler-drop-falloff.test.mjs` の #1046 Roller は exact base `0af3b959` で本修正の有無にかかわらず同一値で失敗する既存失敗であり、#1161 の回帰ではない。実機/Nintendo 11.3.0 比較、絶対バリア HP、割れる弾数は **UNKNOWN / unverified**。

### 2026-10-09 — #1161 対物攻撃力アップの残差

**本家参照と条件:** Splatoon 3 Ver. 11.3.0、ホットブラスターの直撃をグレートバリアの外側バリア／露出弱点に当てる条件。ピン留めした [Leanny 11.3.0 damage-rate table](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/misc/spl__DamageRateInfoConfig.pp__CombinationDataTableData.json) の `Blaster_BlasterMiddle___GreatBarrier_Barrier` と `..._WeakPoint` はともに 1.9、汎用 `Blaster___GreatBarrier_*` は 2.1 である。[`WeaponInfoMain`](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/mush/1130/WeaponInfoMain.json) の `BlasterMiddle` がこのホットブラスターに対応する。ピン留め [GearSkillTraitsParam](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/misc/spl__GearSkillTraitsParam.spl__GearSkillTraitsParam.json) では `ObjectEffect_Up` の装備制限が Shoes で、[靴装備データ](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/mush/1130/GearInfoShoes.json) にも同能力がある。倍率の機構根拠はコミュニティ検証の[グレートバリア倍率表](https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%82%B9%E3%83%9A%E3%82%B7%E3%83%A3%E3%83%AB%E3%82%A6%E3%82%A7%E3%83%9D%E3%83%B3/%E3%82%B0%E3%83%AC%E3%83%BC%E3%83%88%E3%83%90%E3%83%AA%E3%82%A2)（表の版数表記は 11.2.0）で、対物なし 1.9× と対物あり 2.09×（追加 1.1×）を外側・弱点の双方に示す。[Nintendo の更新履歴](https://www.nintendo.com/en-gb/Support/Nintendo-Switch/Game-Updates/How-to-Update-Splatoon-3-2266003.html) は 11.3.0 の配信を確認する資料であり、この係数の実機確認資料ではない。

**実装差分:** この作業の基点 `5d0be6b` には既に 1.9× の直撃ソース倍率があったため、それは維持し、追加係数 1.1× だけを `patches/splatoon3/runtime/kit-big-bubbler.mjs` に追加した。`patches/splatoon3/runtime/gear.mjs` は対物能力を靴メインに制限し、装備 actor 自身の `s3.modifiers.objectShredder` に解決する。Bubbler の問い合わせでは `type:'blast'` かつ stock `kind:'blaster'` の direct round にだけ `1.9 × (対物装備時 1.1)` をソース側で一度掛け、raw-unit 換算の後に canopy の 0.64 を適用する。露出弱点には canopy 比を掛けない。爆風は direct-contact query に入らず、neutral round は visual-only、Practice Range の敵 Actor への直撃は 125 のまま。リモート提案は確定済み amount を運び、ホストで係数を再適用しない。公開版 `inkwave-public/` は変更していない。

**確認:** `node --experimental-vm-modules --test patches/splatoon3/tests/kit-big-bubbler-blaster-contact.test.mjs` は 8/8 通過。対物なし 1.9 と装備時 2.09 の双方、Shoes main 限定・actor-local 解決、外側 0.64 と弱点 1.0 の分離、Stock 以外/通常射撃の対照、local/remote host の一回適用、実 production composition の直撃接触、爆風・neutral・Practice Range の非漏出を確認する。実弾の flight fidelity を調べるテストではなく、production `_push` 後の移動を固定して接触経路を測っている。

**残る確認事項:** 1.1×／2.09× の機構係数は 11.2.0 表記のコミュニティ測定であり、Nintendo 公開資料や 11.3.0 実機での再計測は未確認。Leanny 11.3.0 の primary table は素の 1.9× 行と能力の Shoes 制限を裏付けるが、追加 1.1× 自体は記録しない。`rawPerDamageUnit=100` は宣言値のままで、絶対バリア HP・必要弾数・Switch/browser/オンライン実動作の一致は未校正または未測定（#1051 の範囲を含む）。

### 2026-10-08 PR1083 CI composition repair

- Practice Range is an untimed training session, so its immediate-control start and ordinary respawn must not acquire Turf's FIRE-confirmed Squid Spawn owner. `runtime/respawn-lifecycle.mjs` now excludes `opts.range`; the new regression checks initial position, control ownership and post-death respawn. This preserves the training-session contract and does not claim a new S3 frame measurement.
- Super Jump checks the existing lethal-water boundary before acquiring charge ownership, and the reliability adapter preserves `_checkFallDeath()`'s boolean return. Existing #1050 regressions cover lethal request admission, ordinary flight, walls, owner/proxy playback and 30/60/120 Hz. The matching remote clothing lookup now fails closed before its first authenticated equipment snapshot.
- Fixtures now use the actual playing state, isolate the newly sourced low-ink Charger refill in the unpaid-shot negative control, include the existing player hurtbox dependency and account for the independent 1F Bomb use-startup and Super Jump clock tuple field. No test gate or threshold was disabled. Browser acceptance remains subject to exact-head CI; no new Switch measurement is claimed.

### 2026-10-08 PR1083 subsequent composition checks

- The current actor wire keeps the Super Jump elapsed clock before the special count and tagged adoption record; the current projectile wire keeps InkFlight metadata before Kit/unit/footer fields. Regression fixtures now test those actual columns and explicitly remove the added metadata when constructing legacy controls. Authenticated identity and malformed-packet rejection remain enabled.
- The source-guided InkFlight head returns before the generic projectile terminal path. Network composition now publishes the same owner terminal for that path, ignores non-authoritative remote actor collision geometry, and replays the confirmed actor-impact FX once. All 146 network regression tests passed locally, and a direct owner-head terminal regression was added and passed. This is deterministic runtime verification, not a physical Switch comparison.
- Motion diagnostics retain completed PNGs even when a semantic gate fails, so the remaining browser-render failure can be inspected without dropping the pixel gate. Current CI remains the acceptance condition.


### 2026-10-08 PR1083 CI composition repair, second verification pass

- InkFlight remains the source-guided head/detached-drop authority. Its composed actor sweep now uses the same source player radius/height and authoritative position as other main weapons (no render `smoothY`), and the owner-selected Dualies turret collider survives after roll recovery. Splatling consumes the dedicated charge/speed sampler's result once. HUD guides and Splatling nominal reach now use the same read-only canonical InkFlight solver. Existing world-before-player, teammate, ghost, deterministic wire and input regressions remain enabled.
- Shooter cancellation retains its separately sourced 3F sub interruption instead of inheriting the simultaneous shot's 4F squid gate. Enemy-ink same-tick movement prediction now observes native first-shot startup instead of treating pending presentation as emission. Roller rejects sub preparation inside the post-flick gate while retaining the separate 1F use-startup.
- Big Bubbler construction now retains the provided `MaxHP`-backed target maximum for Special Power Up while `MaxFieldHP` remains independent. The redundant outer Blaster paint wrapper was removed: the already-composed native burst owns its sourced paint and deferred terrain queue, preventing paint in the contact tick before the N+1 burst.
- Visual-only repairs: the Muzzle cue invalidates on actual geometry generation and collection length; Slosher guide caching includes forward actor velocity and retains the shared weapon record; admitted vertical Roller roll uses the grounded drum contact pose; gait catch admission uses actual leg reach so the source-directed cadence is not repeatedly restarted by lateral stance width. These remain INKWAVE regression/calibration checks, not new Nintendo/Switch timing or curve measurements.
- Tests now distinguish detached drop/head impact owners and source-pinned 3F keep recovery/1F sub startup, use genuine backing floor geometry, initialize current wire state, and compare height/draw-only changes with full-composition counterfactuals where an old pre-integration golden is obsolete. No suite is skipped and no acceptance pixel gate is lowered.
- The browser diagnostic's frozen Slosher heads obscured the rig in all 14 sampled frames. Its same-frame visible/hidden rig pair now excludes that unrelated frozen instanced head draw while retaining the strict pixel and unchanged-state gates. Touch rematch return and keyboard handoff separately require the native visible focus-aligned ring on ordinary buttons; touch rows/tabs retain their own highlight (corrected by the exact-tree follow-up below). Exact-head Actions is still required before merge; local Chromium could not launch due to the environment's Unix socket restriction.


### PR1083 CI: composed quality contracts (2026-10-08)

- Charger refill bots now retain the already-admitted puddle charge when progressive ink payment crosses the 3% start threshold, and keep Fire released through the existing one-fixed-frame release owner. Previously the fallback dropped out while paying the minimum, repeatedly cancelled partial charges, and never painted a refill puddle. The 0.25 s bot decision bound is an INKWAVE AI policy, not a sourced Nintendo value. Regression uses the real Actor/WeaponRunner at 30/60/120 Hz with a held-Fire-only counterfactual; release, paint, refill and exit are required. S3 minimum charge/payment/release owners and their sourced values are unchanged; physical S3 bot equivalence remains unverified.
- Offline worker integrity now reads both asset tuple metadata and the generated index object (`bytes`, `sha256`), validating both before publishing a cache. This repairs valid install/restart without accepting malformed or mismatched content. No gameplay parity claim.
- Pooled HUD transformation now parses and checks frame/crosshair ownership before replacing the source literal. Unknown, duplicate, computed or spread owners fail closed instead of being silently dropped. Existing gear/sub, shot guide, health marker and Charger reach ownership remain covered in both composition orders.
- Quality fixtures import current pure config/camera dependencies and isolate only their own negative-control change. Charger zoom fixtures identify a Charger; private-network results preserve their existing zero-reward profile policy; Ink Vac tests await the native inhale clock before releasing. Gyro stationary drift compares sensor-space onset independently of the composed provisional camera gain, retaining convergence and intentional-motion limits. None of these updates establishes unmeasured Nintendo numeric equivalence.


### PR1083 build acceptance receipts (2026-10-08)

- The integration added exactly 29 eager module hints absent from main `c2c938b9af5b6cce2a7bdbecf0415c7c3836cadb`. These follow the existing build's hint-only deferral policy, retaining every static import and immutable precache entry. Update-news cards (not shown on the title screen) also use ordinary import discovery rather than a separate critical-HTML priority hint. The unchanged 131-core/14-range, 3.2 MiB initial-JS and 5 MiB precache limits are enforced; actual browser cold/warm/offline timing remains a separate required check.
- The startup budget verifier now validates/decodes the emitted `[bytes, sha256]` asset descriptors before counting bytes or checking hashes. Its old named-property reads could not inspect the compact manifest correctly. Worker activation timeout now covers the never-resolving `serviceWorker.ready` failure state so CI saves evidence instead of hanging until its job limit.
- Built-weapons deterministic world/grid receipts were reconciled with the integrated native InkFlight player hurtbox and source-guided Shooter/Dualies/Splatling trailing paint, Roller maximum/impact paint and Slosher intermediate drops. Exact 0.1-unit hit sweep and 0.25-unit scoring-cell assertions are retained; these are INKWAVE regression measurements, not physical Splatoon 3 range measurements. The checker additionally compares the built boundary damage and paint bounds to the current unminified composed source graph, and validates the existing 36-field record including the native InkFlight metadata slot. Source parameter mirror/hash checks remain separate and unchanged.

### PR1083 exact-tree browser follow-up (2026-10-09)

- The full installed browser rig's abrupt, fixed-facing 90-degree turn exceeded the unchanged 0.11-unit pelvis-travel guard (0.112764). The broad horizontal catch bound had incorrectly used nearly the whole leg length, although that leg must also span the pelvis height. Catch admission now measures extension from each foot's lateral stance and retains the existing 0.3-unit travel allowance. The same built-rig logic probe falls to 0.058987-unit pelvis travel; original gait alternation/reversal controls and new full-install 30/60/120 Hz contact/reach bounds pass. Actual WebGL remains gated on the new CI head. This is an INKWAVE visual regression fix; S3 Ver.11.3.0 gait curves and physical-device timing remain unmeasured, and gameplay speed/collision is unchanged.
- Walking browser failures now preserve completed native samples and PNGs before applying semantic gates. The failure receipt stays bounded and no pixel, contact, reach or pelvis threshold changes.
- Publication was reconciled against every tracked blob in the tested local commit, rather than only the prepared delta. This restores eleven omitted files from the earlier CI composition repair, including Range's immediate-control respawn exclusion and its test, lethal-water return ownership, remote clothing admission and current fixture dependencies. Source and test assertions are the same ones already validated locally. Only a fully matching remote tree and its fresh Actions results qualify for acceptance.

- Latest exact-tree UI evidence (run 37865808562) exposed a verifier-only mismatch: native touch input hides the ring for rows/tabs, but ordinary main-menu buttons retain it. The earlier universal hidden-ring assertion incorrectly passed only before the next throttled UI frame. Rematch now waits for actual native placement plus computed CSS visibility/opacity and requires the same focus geometry for touch return and keyboard handoff. New native/patched repeated-return and negative visibility/geometry controls cover the distinction. No gameplay/UI behavior or numerical threshold is changed, and physical S3 interface equivalence is not claimed.

### 2026-10-09: Big Bubbler map Super Jump destinations (#1153)

Reference is Splatoon 3 Ver. 11.3.0, the latest version listed by [Nintendo Support](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461). The community-maintained [Super Jump reference](https://splatoonwiki.org/wiki/Super_Jump) describes Big Bubbler as a jump target while its special remains active and permits repeat jumps during that duration; Nintendo's published update notes do not specify the exact target marker, landing offset, or a special Super Jump timing for the dome. The pinned [11.3.0 Big Bubbler parameter table](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpGreatBarrier.game__GameParameterTable.json) has dome fields including `DroneParam.AscendFrame = 30`, `AscendHeight = 8.5`, `IgnitionFrame = 15`, and `FieldCollisionRadius = 0.4`; those are dome parameters, not a Bubbler-jump landing/timing specification. This change adds no conversion or new numeric jump tuning: it resolves the live structure's recorded world position through INKWAVE's existing native ground probe, then uses the existing coordinate-target Super Jump charge and flight.

At the frozen main baseline `2195d5244408a9632bfbbb3b106f2cfdf1fa6d77`, the public input path handled map digits 1–3 for allies and 4 for base, while HUD and Diorama exposed only three ally slots plus base. There was no Bubbler target identity in either map path. The existing Bubbler authority/replay runtime did not provide a map jump admission path. Both overlays now add one separate live marker per friendly activation, including colocated activations; keyboard digits 5–9 target the first five, and standard pads use LB/RB to cycle any live dome then A to confirm. Touch, click, and map cursor choices use the same validated route. A slot at index 4 or above is never sent through the base-pad restart path.

Admission resolves `(dome id, activation serial, team)` against the current local-authority and replayed-remote dome lists, rejects enemy, stale, collapsed, expired, blocked, or unsupported-ground targets, and does not require the owner to remain alive or stationary while the structure itself remains live. Charge revalidates the activation and cancels safely if it ends before takeoff. Once flight begins, the ordinary Super Jump commits the legal static structure point and does not follow the owner's movement or later dome expiry. Owner death and dome expiry continue to be owned by the existing Bubbler lifecycle. No special gauge, Bubbler durability, turf, ink, damage, or landing timing is added or spent by the destination selection.

The focused test `node --experimental-vm-modules --test patches/splatoon3/tests/issue-1153-bubbler-superjump.test.mjs` passed 4/4 through the production source-adapter composition with the real INKWAVE Actor, Physics, map UI classes, FixedClock, and NetMatch paths. It covers separate colocated activations in HUD and Diorama, keyboard and standard-pad selection, owner movement/death, expired targets queued through respawn, charge cancellation, static committed flight, host-sender remote deploy replay, guest-owned flight event output, and identical fixed-step rows under 30/60/120 Hz render schedules. This is composed source/runtime verification using synthetic stage geometry and native-shaped NetMatch events. No installed-browser interaction, physical Switch comparison, or live two-client transport run was performed; exact Nintendo landing safety/offset behavior remains unmeasured.
## 2026-10-09 — Remote Dualies accepted-action pose clock (#1163)

**Reference and conditions.** Compare Splat Dualies in Splatoon 3 Ver. 11.3.0, grounded humanoid, same owner-approved roll input and no active sub/special. Nintendo's [current update history](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/kw/Splatoon%203) lists Ver. 11.3.0, and its [Dualies overview](https://splatoon.nintendo.com/en/news/beginner-basics-for-splatoon-3-choosing-the-right-weapons/) describes the class as allowing a speedy Dodge Roll. The [pinned public datamine table](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponManeuverNormal.game__GameParameterTable.json) is version 11.3.0 and its SHA-256 (`55e37c4d8db92b63d48f281015a30a9aaccd1ff838edf88ae4103124c365eb07`) matches the repository's pin. It records `SideStepParam.MoveFrame=12` and `UnrelaxFrameMove=32`; at the repository's 60 Hz reference these convert to `12/60=0.2 s` and `32/60=0.533333… s`. The current `profile.json` records the same `rollTime=0.2 s` and `lockTime=32/60 s`, while `reference/numeric-status.json` marks them calibration/derived with no raw binding; in particular, the table has several `UnrelaxFrame*` fields, so this comparison does not claim that one field alone proves all recovery semantics. The correction reads the accepted owner's existing `startupDur`, `dur`, and weapon `lockTime` in seconds and introduces no S3 timing value. The INKWAVE 20 Hz snapshot interval is `1/20 s = 0.05 s`, equal to three 60 Hz ticks. No Nintendo joint curve, input-to-motion frame count, or physical scale is inferred.

**Divergence and reproduction.** At frozen main `2195d5244408a9632bfbbb3b106f2cfdf1fa6d77`, `NetMatch` already timestamps `Character.trigger('dodge')` on the owner playback timeline, but the remote dualies pose uses `F.dodge` and a locally incremented synthetic runner timer. The trigger can arrive before the next 20 Hz state sample while `dualies-motion.mjs` still sees no remote roll clock. The pre-fix production-composition reproduction is saved at [`issue-1163-before.log`](/mnt/workspace/.dev-state/agent-work/evidence/inkwave-c-resume-20261009/codex2/issue-1163-before.log): the event was present while the remote phase remained null. The regression brackets the boundary with accepted starts one and two 60 Hz ticks after a prior snapshot.

**Correction and player effect.** The network adapter stamps the event metadata with the same sender timestamp already placed on the trigger row and carries its monotonic roll token, life, teleport counter, startup, duration, lock duration and direction. Timestamped spawn triggers advance the presentation clock's known lifecycle before the next state sample. The optional `rl` sidecar repeats the exact start/lifecycle identity so a missed trigger can recover its original action age. `remote-dodge-clock.mjs` keeps this presentation clock outside `WeaponRunner`; the remote `dualies-motion.mjs` uses it for startup, roll progress and timed plant. A bare dodge flag cannot start or restart a roll. Reordered/duplicate events and stale life, teleport or owner identities cannot rewind it. Death, respawn, interruption, weapon change, removal, disposal, and ownership transfer clear the clock while retaining the same-owner action watermark across lifecycle interruptions. Existing remote lock/turret plant state remains a separate path after the accepted-action clock; authoritative movement, damage, ink, collision, owner cadence and roll physics are unchanged. Players observing a remote Dualies roll now see its pose begin at the accepted sender playback epoch rather than at the next coarse snapshot.

**Verification and limits.** `patches/network-replication/tests/issue-1163-remote-dodge-clock.test.mjs` composes the production source adapters and exercises separate owner/proxy actors through the actual `NetMatch`, `Actor`, `Character`, and runtime pose path. It covers both snapshot-boundary starts, event-only onset, exact sidecar recovery after a dropped trigger, a bit-only negative control, duplicate/reordered events, stale life/teleport metadata after death/respawn, weapon change, owner handoff, unchanged owner dodge state, and identical sender-time progress at 30/60/120 Hz. Command: `node --experimental-vm-modules --test --test-concurrency=1 patches/network-replication/tests/issue-1163-remote-dodge-clock.test.mjs` — **1/1 passed**. This is deterministic composed-runtime evidence, including packet omission/reordering at the native boundary; it is not an actual network session, browser capture, Switch measurement, or validation of unpublished Nintendo pose curves.

**Combined regression follow-up.** A valid remote presentation epoch also owns the visual admission clock consumed by native aim, stance, and foot contact. Letting the native Character dodge timer take over made those results depend on a proxy's unrelated local timer age even while the accepted sender clock remained in startup. The production-transport control compares proxies with different native timer ages and the same accepted event metadata. The #477 transport fixture now advances sender `G.time` and its monotonic clock together and uses accepted trigger/sidecar epochs; its former synthetic packet timestamps were inconsistent with the event start and did not describe a valid late-arriving action. A bare `F.dodge` bit remains a negative control and does not establish an accepted clock. These deterministic local regressions do not add browser, physical-device, or Nintendo pose-curve evidence.

### C batch integration — imported source and remote action boundaries

The #1153 map/controller/CSS connections now run through `bubbler-map-adapter.mjs`; imported `inkwave-public/` files and upstream locks remain byte-identical to baseline `2195d5244408a9632bfbbb3b106f2cfdf1fa6d77`. Each connection fails closed on a missing or duplicate anchor. The native #1153 probe also checks imported-source compatibility before exercising the composed runtime. Initial candidate CI stopped on the direct-source hash mismatch; that failure is retained as a failed attempt, not passing evidence.

Parent review corrected #1163 recovery-phase comparisons to use absolute sender playback time against absolute phase endpoints. A regression exercises startup, roll, plant and expiry at sender epochs 0, 10 and 10000 and 30/60/120 Hz. Owner gameplay state remains untouched. Full browser/combined gate evidence is pending the final exact-SHA Actions run; native passing tests do not establish Switch pose fidelity.
### 2026-10-09 #888 Heavy Splatling のチャージ中ジャンプ初速

**本家の根拠（Ver.11.3.0）。** [S3 Wiki ギア/ギアパワー/分割2 の「相手インク影響軽減」④ジャンプ初速](https://wikiwiki.jp/splatoon3mix/%E3%82%AE%E3%82%A2/%E3%82%AE%E3%82%A2%E3%83%91%E3%83%AF%E3%83%BC/%E5%88%86%E5%89%B22)（最終更新 2026-09-21、取得 2026-10-09。直接取得は Cloudflare 403 のため翻訳プロキシ経由）は次を明記する。

- 通常ジャンプ初速は 1.100 DU/f。相手インク上は GP0 で 0.800 DU/f、GP57 で 1.100 DU/f。
- スプラスピナー・クーゲルシュライバー・イグザミナー・R-PEN/5H のチャージ中ジャンプ初速は 1.0 DU/f。
- **その他のスピナー属**（バレルスピナーを含む）とチャージャーのチャージ中（チャージャーは正確にはフルチャージ時）のジャンプ初速は **0.7 DU/f**。GP0 の敵インクの 0.8 DU/f より低いため、敵インク上でも常に 0.7 が採用され、このギアパワーは効果を発揮しない。

文法上「チャージャーの場合は正確にはフルチャ時」とだけ限定されるので、スピナー属は**チャージ状態の全期間**で低い値を使う。

**換算（独自校正）。** 既存の速度換算は raw×60（DU/f×6）で、`OpInk_JumpVel` raw 0.08 m/F（0.8 DU/f）→4.8 WU/s、チャージャーのピン留め `JumpHeightFullCharge` 0.07→4.2 WU/s に使われている。同じ校正で 0.7 DU/f→**4.2 WU/s**。したがってバレルスピナーのチャージ中ジャンプは `weapons.splatling.chargeJumpVelocity = 4.2` とした（`profile.json.bindings` には入れず、`calibration.unverified` に校正として記録）。

**実装箇所。** `patches/splatoon3/runtime/movement.mjs` の `normalJumpVelocity` を拡張し、`weapon.kind === 'splatling'` かつ `weaponRunner.charging` のとき `Math.min(velocity, weapon.chargeJumpVelocity)` を返す。`adapter.mjs` の `this.vel.y = normalJumpVelocity(this, jv)` の順序（敵インク／Ink Resistance の後）はそのままなので、武器のチャージ状態値が敵インク結果の上限として優先される。値は武器ごとのデータなので 1.0 DU/f の例外スピナーを後から追加できる。チャージャーの #251 ロジック（`charge >= 1` のときだけ `fullChargeJumpVelocity`）は変更していない。

**実測（固定60Hz、`probe-888.mjs`、実 Actor/WeaponRunner）。**

| 状態 | 変更前 | 変更後 |
|---|---:|---:|
| バレルスピナー 非チャージ | 8.4 | 8.4 |
| バレルスピナー チャージ30F | 8.4 | 4.2 |
| バレルスピナー チャージ72F | 8.4 | 4.2 |
| 敵インク 非チャージ（GP0） | 4.8 | 4.8 |
| 敵インク チャージ30F（GP0） | 4.8 | 4.2 |
| シューター 非チャージ | 8.4 | 8.4 |

**回帰。** `patches/splatoon3/tests/issue-888-splatling-charge-jump.test.mjs`（7件）を追加。早期チャージ／第1リング境界（`firstChargeTime/chargeTime`=0.8/1.2）／フルチャージがすべて同じ 4.2 になること、ストリーム解放後は通常 8.4 に戻ること、敵インク GP0/3/10/57 で 4.2 のままであること（同ギアで非チャージ敵インクは 6.6 まで上がるので上限が武器値であること）、例外スピナー値をデータで差し替えられること、通常ジャンプ／イカジャンプ／イカロール／チャージャー／マニューバーが不変であること、実 production 6-adapter 合成で 4.2 になること、30/60/120Hz の描画で同じ低い apex になることを確認する。修正前のこのファイルは 6件中5件が失敗し（`prefix-regression.log`）、修正後は全件成功。

`patches/splatoon3/tests/splatling-jump-spread-native.test.mjs`（#1045）はチャージ中に2回ジャンプして滞空回復を調べるが、#888 でチャージ中ジャンプの滞空が約37F→約19Fに短くなったため、2回目の着地が25Fホールド内になり、シナリオ前提の2つのアサーション（最終フレームが partial、着地 age>25）を新しい弾道に合わせて更新した。25F ホールド自体は frame 25 で引き続き直接検査しており、frame-by-frame の合成一致・spread 値の検査はそのまま。他のスイート（armor-charger-batch, splatling-startup-phases, issue-679, splatling-post-stream, splatling-batch, movement-resources, air-run-speed, enemy-ink-batch, splatling-owner-composition, issue-890-jump-hold, dualies-jump-lock, adapter, movement-motion, issue-160-enemy-ink-form, weapon-edgecases）は 197/197 成功。`scripts/check-inkwave-patches.mjs --quick` 成功。

**未確認の限界。** 0.7 DU/f はコミュニティ検証 Wiki の値で、Switch 実機での再計測はしていない。ピン留めの 11.3.0 `WeaponSpinnerStandard` は `JumpGnd_Charge = 0.08` を持ち、Wiki の 0.7 と 0.1 差があるが、このフィールドがジャンプ初速そのものかは確定していない（Inkipedia の S2 テンプレートは「フルチャージ時のジャンプ値」と説明する）。差の根拠を推測で確定しない。`weapons.splatling.chargeJumpVelocity` は校正値であって抽出値ではない。実機の操作感・0.7/1.1 の相対比が INKWAVE の 4.2/8.4 と一致するかは未測定。例外スピナー（1.0 DU/f）はブキ自体が未実装のため値のみデータ対応。
## 2026-10-09 — Remote Roller horizontal/vertical swing presentation replication (#1155)

**本家参照と条件:** Splatoon 3 Ver. 11.3.0、Splat Roller、通常フィールド。地上ZR=水平スイング（コイル→振り→戻り）、空中ZR=垂直スイングという入力依存の姿勢分岐が本家の公開資料（Inkipedia Roller、Nintendo weapon basics）で支持される。Nintendo の正確な姿勢曲線・関節フレーム値は公開されておらず未確認であり、INKWAVE の姿勢カーブは視覚校正であって本家の数値一致を主張しない。ローカル視点とオンライン観測者は送信者タイムライン上の同じ視覚アクション段階を選ぶべき、という点だけを比較対象とする。

**INKWAVE の差分:** 公開版は所有者側で `WeaponRunner.s3RollerAttack` と `Character.s3RollerFlick` を作るが、リモート代理アクターは承認済みスイングの状態を持たず、後段の detail wrapper で姿勢チャンネルが抑止されていた。既存の splatoon3 adapter は垂直モードのみ `flickVertical` フラグで複製していたため、真の残差は水平の姿勢提示とアクション epoch の伝搬だった。`patches/network-replication/roller-presentation.mjs` がプレゼンテーション専用 sidecar（tag/life/epoch/active/vertical/elapsed/windup/interval/released/rolling/tick）を `rf` に詰め、`applyRemoteRollerPresentation()` が送信者タイムライン上で visual-only な `character.s3RollerFlick` を構築する。authoritative な `WeaponRunner.s3RollerAttack` は生成しない。elapsed は 1 フレーム 1 回だけ適用し、同一 epoch/life の再受信は進展のみ、古い epoch/tick/life は巻き戻さない。life 変化（splat/respawn）、owner 交代、adopt/remove/dispose、武器スワップ、死亡で提示状態をクリアする。

**再現と確認:** `node --experimental-vm-modules --test patches/network-replication/tests/roller-presentation.test.mjs` は実 production composition（fullRuntime + productionComposition、実 NetMatch/Actor/Character）で 1/1。水平・垂直の両モード、epoch 前進、20Hz スナップショット中の elapsed 単調増加、重複・古い epoch/不正送信者の拒否、死亡/リスポーン/武器スワップでのクリアを確認する。`roller-vertical-state.test.mjs` は 2/2 で、実際の jump からの垂直選択がランディング後も維持されること（`#1056` の 5F 変換ウィンドウ通過後）、および復帰まで垂直が保持されることを確認する。owner 側の `#1056` ルールは不変である（`issues-1056-1075-1105-1111.test.mjs` の該当 2 ケースは通過）。

**プレイへの影響と限界:** 観測者側で水平/垂直のスイング姿勢が本家と同じアクション段階で提示される。ゲームプレイ上の速度・衝突・インク・弾道・ダメージ・ネット権限は変更しない。Nintendo の正確な関節フレーム、実機/二クライアントの 60fps 目視比較、ブラウザ描画は未確認。既存の network-replication テストの pre-existing 失敗は本変更の前後で不変。


## 2026-10-08 — PR1171 CI and seven-issue completion pass

The existing batch is #1098, #982, #1158, #1159, #1162, #1165 and #1166.
All seven have existing ownership comments; this continuation does not claim
other active work. Changes are on `fix/1098-stored-charge-muzzle-local-pos`.

- **#982:** the 50% firing-vibration gate now uses normalized `chargeT`.
  The native presentation/range curve reaches 0.5 at only 7/15 actual progress;
  using that curve admitted vibration early. Tests cover the legal minimum,
  25%, 7/15, just below 50%, 50%, full, missing progress and remote/ghost paths.
  Exact Nintendo vibration amplitudes remain uncalibrated.
- **#1158:** actual built HUD/CSS presents two ordinary rings, one centered
  post-roll ring, then restores two; the old diamond remains hidden.
- **#1159:** reliability owns room generation, transport identity and the GO
  deadline together. Leave, failure, socket closure, round replacement and end
  retire the timer. Queued old callbacks cannot launch or clear a new timer.
  A new round gets its full native 12-second fallback; this is an INKWAVE value.
- **#1162:** 500 marina/non-marina samples remain bit-identical, without the
  per-call footprint wrapper Array. No device FPS/GC improvement is claimed.
- **#1165:** built native PaintSystem/WebGL tests compare 4,000 cell samples,
  five seeds, four directions and both paint teams over enemy ink. The published
  pi/60 witness is corrected; two near-edge samples fall within the explicit
  two-atlas-texel AA tolerance. Coverage agrees with CPU ownership counts.
- **#1166:** the visual gate composes with offline pause and menu cadence.
  Actual hidden atlas overflow queues 6,100 strokes with zero render calls,
  updates CPU ownership immediately, and replays in order on visibility return.
  Clear/dispose retire deferred commands. Fixed online clock/network work is
  preserved in the composed frame regression. Physical battery savings and
  browser-specific hidden-RAF scheduling are not inferred from these tests.
- **#1098:** kept-shot identity, ordinary-shot isolation, obstruction fallback
  and owner/network/ghost origin agreement pass. The existing barrel-tip-based
  source-to-procedural-model scale is still provisional. Nintendo skeleton-space
  calibration is not established, so this issue must not be declared fully
  fidelity-complete or auto-closed on the strength of these tests.

CI run 37797422797 failed before these tests on an idle composition anchor and
a gait assertion comparing phase .21 against phase .28. The former now retains
both visibility and pause predicates; the latter compares equal phases across
both signs of all four directions. Subsequent production-build conflicts in
room timer/team-ready adapters were composed while preserving their behaviors.
Native `inkwave-public/` stays unchanged. Broader integration regressions remain
separate from this focused acceptance; a passing focused suite is not a claim
that the entire integration workflow or Nintendo hardware comparison is green.


### PR1171 integration-base differential and slide-width follow-up

Rebased only PR1171 onto `69add0203d127b790f009e3502f7110212262066`.
The unchanged full patch gate produced 128 failing tests on that base and
133 at `3c207b20`; comparison of the full failure-name sets found exactly five
new failures. The shared Roller outline widened Dualies slide paint because
its radius conversion still used the removed CPU-only inset. It now accounts
for the band, corner rounding and maximum two-wave displacement, preserving
the pinned 1.8 half-width. Native grid tests cover nine seed/heading cases;
the built WebGL check covers twelve and keeps the same two-texel AA bound.
The three RESULT-frame harness failures now supply a visible document fixture,
and the first-frame paint-presentation A/B uses the same #1165 ownership
geometry on both sides while preserving its original delayed-draw negative
control. All five new failure cases pass after these corrections (11/11 in
their three complete files); the earlier focused selection is 95/95.
The base's 128 failures remain unresolved. No integration-base, #1083 or #401
branch was modified and no PR was merged. CI run 37833984659 passed the original
idle/build and gait failure points plus the new focused and rendered checks,
but its later weapon-detail browser gate failed; full CI is not claimed green.


### PR1171 / #1098 independent model-anchor calibration and exact-head CI

The old `modelMuzzle.z / keepAnchor.Z` scale normalized the subject coordinate
against itself: changing only source Z could not change the resolved Z. Replace
it with an independently extracted ordinary-model muzzle reference. Source:
[Splatoon 3 Splat Charger, Models Resource asset 342258](https://models.spriters-resource.com/nintendo_switch/splatoon3/asset/342258/),
Centrixe the Dodo extraction, published 2023-02-27. Both included Collada exports
have `Root` → `Muzzle` joint-local translation `(0, 0.1781852, 1.717447)`.
The current `Wmn_Charger_NormalT.dae` SHA-256 is
`7914851c0cd0c1cf30970774b22362ae7e01969ed084c95d94ad87605c951626`;
the Previous Ver. file is
`9d1167de7d734f79cad6bd234eca937bc8b2f6404553d178b292517094730e3a`.
`python scripts/check-inkwave-charger-calibration.py /path/to/342258.zip`
reproduces the extraction and rejects unknown file revisions. No model or
texture is redistributed in this repository.

This is a documented **INKWAVE model retarget**, with the following explicit
conventions: retain joint-local +Y up / +Z barrel forward, match the ordinary
muzzle anchors, and scale offsets uniformly by the ratio of forward barrel
coordinates. The exporter's scene-root 90-degree rotation and declared inches
are not Nintendo game-unit evidence and are not applied to game parameters.
Let `r=(0,.1781852,1.717447)`, live INKWAVE model muzzle `m=(0,.058,.686)`,
and pinned S3 11.3.0 keep parameter `k=(-.314,.2105,2.0176)`. Then
`s=m.z/r.z=0.39943008430536725`, and `local=m+s*(k-r)` yields
`(-.12542104647188532,.07090750328831108,.8058901380945089)`.
The live native `weapon.off.localToWorld` transform carries this point through
the hand and character hierarchy. Each source-axis perturbation now has an
independent nonzero effect, and the source ordinary anchor maps exactly to the
INKWAVE ordinary anchor. Existing native finite/distance/LOS guards retain the
safe generic fallback. Fresh shots, charge-keep lifetime and release gates are
unchanged; `weapon:fire.muzzle` and remote ghosts use the authoritative point.

**Validation:** source extraction agrees in both included exports; native
regressions cover all three independent axes, invalid inputs, full-charge →
store → surface → native 1F release identity and reset, ordinary isolation,
packet/ghost agreement and obstruction fallback. The production-build browser
probe uses real Character weapon nodes, Projectiles beam meshes and Physics /
swept-world collision in six yaw/pitch poses. A close-cover edge hits from the
stored origin and misses from the ordinary origin; moving cover across the
chest-to-anchor segment forces the safe fallback. The existing rendered
reticle, 4,000-cell Roller parity, 12 Dualies widths and 6,100-hidden-stroke
checks also pass.

**Remaining evidence limit:** the 2023 extracted model is not proven unchanged
in 11.3.0, and a weapon model does not establish which Nintendo runtime frame
owns `WeaponKeepChargeParam.MuzzleLocalPos`. The supplied Drive research bundle
explicitly excludes Splatoon 3 RomFS; its S1 rig cannot establish S3 charge-keep
behavior. Thus model-derived retargeting and INKWAVE regression acceptance are
measured, but Nintendo keep-frame binding / console spatial equivalence remain
unverified. Do not auto-close #1098 or represent this as recovered Nintendo
engine calibration. Required closing evidence is the S3 keep-charge coordinate
frame/binding (or a measured stored/fresh muzzle comparison with known scale,
weapon, version, pose and cover). This supersedes only the old self-normalized
barrel calibration above, not that outstanding fidelity requirement.

The integration workflow now chooses explicit dispatch SHA, otherwise immutable
PR head SHA, otherwise push SHA. Every checkout and artifact name uses the same
`SOURCE_SHA`; existing checkout, rebuilt-site and browser report identity gates
remain active, and the workflow regression itself joins the focused CI step.
No inherited acceptance gate is removed or marked allowed-to-fail. The base
failures remain owned by #1083; neither #1083 nor #401 is changed or merged.

## 2026-10-08 — next seven claims; room startup and gyro recovery PR

Ownership was checked against open issue assignees/comments and open/closed PR
coverage immediately before posting claims on #1167, #1157, #1154, #1152, #1151,
#1150 and #1149. This first new PR finishes the room/gyro implementation below;
claiming the seven does not mean all seven are resolved. It is stacked on
#1171 at `04e4547c053f99ed9db0019c4bc98003d19b108e`, preserving the integration
composition and its existing fixes. #1083 and #401 are untouched; no merge.

| Issue | Change / status | Executed evidence or remaining work |
| --- | --- | --- |
| #1167 | Reuse existing connection-generation cancellation and timer cleanup; add acceptance coverage, no duplicate runtime fix. | Four create/join cancellation/retry combinations, a queued obsolete deadline, repeated cancellation, and browser retry after withheld welcome and the original 8-second deadline. |
| #1157 | Permanently reject binding a disposed NetMatch; make duplicate bind/dispose inert. Preserve existing Game startup cancellation guards. | Native composed NetMatch subscription ownership; 77 selected real startup-method deferred-boundary/reentry tests; browser socket closure during controlled warmup followed by reconnect and late completion. |
| #1154 | Queue authenticated GO for the exact cfg.id until local setup completes; consume once and invalidate on room termination/rematch. | Deferred lobby/world/warmup, obsolete/duplicate GO, canceled queued GO; native browser NetSession/Transport/NetMatch and production relay, one READY packet per successful round. |
| #1151 | Separate stale sensor health from permission and saved preference; revalidate focus/visibility/screen transitions and explicit retry. | 30/60/120 Hz streams, repeated silence/recovery, zero first-sample aim spike, single listener/permission ownership, existing initial no-data behavior. Synthetic orientation events in built Chromium modules also pass. |
| #1152 | Claimed follow-up; existing allocation suppression is retained. | Remaining true-birth packet delay and complete multi-peer emission acceptance are not implemented in this PR. |
| #1150 | Claimed follow-up; existing explicit string volley-ID transport is retained. | Complete native emitter-to-victim-owner acceptance and fractional cumulative-damage quantization audit remain; no new damage fix is claimed here. |
| #1149 | Claimed follow-up; no speculative drain/slow constants added. | Pinned 11.3.0 InhaleParam has ReceiveDamageForPlayer=15 and PoisonMistForPlayer, but sparse parameter tables omit the inherited drain/speed defaults. Actor suppression implementation and measured drain/slow calibration remain. |

The #1151 watchdog uses a conservative **15-second engineering threshold** on
monotonic receipt time. A silent stream becomes `supported-stale`, shows a retry
message, and retains permission, saved ON preference and its listener. Silence
alone cannot distinguish a stationary change-only provider from sensor failure.
A resumed sample recovers the health state and rebases the existing quaternion
path before motion is integrated. Focus, visibility and actual screen-angle
changes rearm the existing 2-second probe; after prior successful data this is
also a soft warning. Initial activation with no valid data still takes the
existing unavailable/OFF path. No Android drift calibration constants change.

Reproduction: delay guest lobby launch or setup; send host GO while the promise
is pending, then resolve it. Session remains starting until setup is complete
and begins once. Close the guest socket during warmup, reconnect, and resolve
the old promise: the new lobby/menu and disposed network object remain intact.
For gyro, enable, send valid orientation, stop events beyond 15 seconds, then
resume from a different pose: warning clears, first sample produces no turn,
and the next sample produces normal movement.

Comparison scope remains the issue-reported Splatoon 3 11.3.0 interaction
baseline: communication recovery must not revive abandoned play, and motion
input should resume without an old-pose jump. Browser GO sequencing, 12-second
host wait, 2-second initial probe and 15-second stale warning are INKWAVE
engineering behavior, not Nintendo engine measurements. No gear/weapon damage
or movement values change in this PR. No console/Android/iOS hardware or full
three-minute round comparison is claimed; device-specific sensor delivery and
retail timing remain unverified.

Validation commands: the focused workflow room/gyro set plus workflow contracts
passes 77/77; the selected startup ownership set passes 77/77. Production build
content hash is `7672846b9918ec84c604cc8f251d43e464fad2db0f054cbcbc9fbedc9e321a69`.
`node scripts/check-inkwave-room-gyro.mjs <built-site>` passes in Chromium using
real WebSocket transport and `RoomDurableObject.handleSession`; scene setup is
controlled, sensors are synthetic. CI runs this same probe with Chromium and
WebKit before the existing UI gates, at the immutable PR head. All inherited
full gates remain enabled. The broader gyro matrix has the same 11 failures on
base and candidate (base 83/94; candidate plus room/new tests 131/142), including
#524/#615/#678; those inherited failures are not repaired or hidden here.

## PR #1172 remaining claims: #1152, #1150, #1149 (2026-10-08)

This section supersedes the earlier pending-implementation status for these three claims. Stacked base remains `04e4547c053f99ed9db0019c4bc98003d19b108e` / #1171; inherited base and Bucket repeat work belongs to #1083. #401 is outside this work. No merge.

### #1152 — Slosher birth replication

Splatoon 3 reference: 11.3.0 Bucket Slosher, no gear, grounded/airborne transitions and moving muzzle. Existing source schedule remains 0,1,2,3,4,6,8,10,12 frames. Existing allocation suppression is reused. The one record at true birth now carries zero remaining delay and the flattened source-unit index in the existing family-unit slot. Receivers reconstruct collision/movement/draw parameters from that index; legacy packets retain the delay inference fallback. Pool allocation clears the new field. No Bucket repeat/cooldown change.

Tests drive real emission/recorder/replay at 30/60/120 Hz, two/three clients, moving muzzle, ground/air transitions, duplicate/late packets and invalidated owner epochs. Exactly nine births, no allocation records and no ghost records. Existing timing contracts were updated to assert the birth tick plus zero remaining delay, not reapply the elapsed source delay.

### #1150 — one Slosher damage maximum per victim/volley

Existing authenticated native hit forwarding, victim life, retry, adoption and bounded volley admission remain the owners of those concerns. A missing or invalid Slosher group now fails closed. The emitted string volley identity reaches final post-defense quantization; local incremental admission uses a scoped rounding group, and remote maximum admission forwards that same group. This avoids quantizing each fractional increment separately.

Actual emitted native volleys through Projectiles → NetMatch → victim Actor produce identical local/online results for 70/70, 50/70, 70/50 and 30.39/34.31 (34.3 total). Duplicate, reordered, forged sender, rejected invulnerability, fresh volley, respawn and reset paths are covered. The existing combat-life protocol is reused, not duplicated.

### #1149 — hostile actor contact with Ink Vac

Reference: S3 11.3.0 Splat Charger / Ink Vac, no gear, live non-firing enemy in the existing 3D vortex, unobstructed LOS. Pinned primary extraction: [WeaponSpBlower, Leanny/splat3 @7280ff9c](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpBlower.game__GameParameterTable.json). `GameParameters.InhaleParam.ReceiveDamageForPlayer=15`: repository raw /10 conversion gives 1.5 damage-equivalent per 60 Hz frame, 90/s. Thirty eligible ticks add 45/1100 charge, separately from projectile count. Enemy HP is not touched.

The Vac owner scans live hostile actors, deduplicates actor identities and authors only its gauge. Each local victim uses authenticated replica/local cone geometry plus solid LOS to author its own tank and movement. Ghosts never drain a remote tank or author gauge. Allies, dead actors, behind/outside/elevated targets and occluded targets are excluded. Exit, release, death and reset clear eligibility immediately; there is no persistent debuff field. Native movement is capped after acceleration and at the movement collision entry, while refill cannot cancel eligible tank drain.

**Calibration still unverified:** the sparse extraction's `PoisonMistForPlayer` lists EffectFrame/Level/SideStepInkConsumeRate but omits ordinary tank-drain and movement defaults. The implementation explicitly labels **12% tank/s and 60% movement-speed cap as INKWAVE engineering calibration**, not extracted Nintendo values. Progressive Toxic Mist levels, post-contact linger and exact retail magnitudes are not claimed matched. Existing frustum field interpretation remains calibration too. These limits are not marked resolved by automated tests.

### Verification and remaining base failures

- Focused native acceptance: 72/72 pass, plus 3/3 updated wire contracts. Existing Ink Vac projectile/LOS/replay/tombstone coverage and final-damage regression coverage remain enabled.
- Built Chromium, three isolated clients using real Actor, Projectiles, NetSession, NetMatch, WebSocket Transport and production RoomDurableObject: nine true births with explicit units and zero delay; 34.3 cumulative damage on victim owner; 45 contact charge, tank 100→94 in 30 ticks, HP 100, slowdown/exit and zero replica authority. Display/audio/collision surfaces are controlled; no retail or physical device claim.
- Workflow adds the same native gates and the built three-client probe in Chromium/WebKit on the immutable PR source SHA. Existing full gates remain enabled.
- Broader network source suite: 31 failures reproduce on immutable base `04e4547`; no repairs here. The initial candidate additionally exposed two intentionally changed Slosher-delay expectations and a newly required dependency in the extracted-method test harness; those three contract updates pass. Base fixture/protocol-layout/movement failures stay with #1083.
- Exact pushed SHA and CI results are recorded on PR #1172 after the remote run, rather than claiming the pre-push tree was CI-green.

## Seven-issue follow-up — 2026-10-08 (#1045, #1065, #971, #961, #958, #534, #202)

Ownership: issue state, assignees, comments, all eight open PR descriptions and
relevant implementation diffs were checked before posting takeover claims. These
seven reports had only abandoned claims older than 24 hours and retained concrete
unfixed paths. Work is stacked on PR1172 `5e0af85cec522de53b128587a2fd7d2e961cf748`.
The integration/base and bucket-repeat work, PR1169 and PR401 are excluded.

Reference conditions: Splatoon 3 Ver.11.3.0, Splat Charger / Heavy Splatling /
Bucket Slosher, no gear unless a control explicitly adds it, ordinary human or
swim form, fixed 60 Hz simulation with 30/60/120 Hz outer rendering. The pinned
parameter source remains Leanny/splat3 `7280ff9cde8bb1c5dcef46c700c326471584d2e6`
(`data/parameter/1130/weapon/WeaponChargerNormal.game__GameParameterTable.json`,
`WeaponSpinnerStandard.game__GameParameterTable.json`,
`WeaponSlosherStrong.game__GameParameterTable.json`). Behavioral interpretation
and form-size measurements are the evidence linked in the corresponding issues;
this work does not turn extracted endpoints or engine tests into retail footage.

| Issue | Remaining cause and correction | Reproduction / acceptance evidence |
| --- | --- | --- |
| #971 | The Charger applied airborne 1/3 speed from charge entry. A crossing update now splits at the sourced 8F minimum; low-ink slowdown remains independent. | Funded air charge reaches minimum in 8 charge frames and full in 164, excluding the existing 1F fresh-start admission. Ground/air transition, a 2F crossing update, dry tank and 30/60/120 Hz agree. Only one-ULP clock completion error is normalized; the strict full-charge predicate for received/ink-limited partial states is unchanged. |
| #961 | Native `_charger` still transformed chargeT through an early-boost curve before audio, presentation and release. The build overlay now uses linear progress. Paint and launch-speed minimum coordinates move from the obsolete 1/6 to 8/60. | Real native charge, loop pitch and full ding agree at every frame; 8F spends 2.25% and full spends 18%. Actual finite-flight tests retain minimum/full speed and paint endpoints, sourced damage, stored-charge origin and release gaps. No range-calibration formula from another PR is duplicated. |
| #1045 | Air and jump recovery routed Splatling pitch through `horizontal * .55`. The independent 1.6-degree pitch axis now remains active in all those states. | Actual emitted edge samples at air/ground and jump ages 0/25/40/70 stay at 1.6 degrees while horizontal spread retains its own state. Existing two-draw radial sampler/RNG order remains. The full Nintendo PDF, inner/outer bias and IA correlation are still unverified. |
| #1065 | Slosher fall damage charged initially downward 2F straight descent against the falloff budget. The true-birth velocity selects a separate phase-aware fall anchor. | A steep shot dropping over 2 units during straight flight stays at 70 HP. After that phase, descent starts at the sourced 1.5 baseline and reaches 50 over the remaining 6.125 units. Upward/horizontal controls, unit envelopes, pooled reuse and fixed-clock cadence are covered. This does not change bucket repeat, birth delays, movement integration or volley accounting. |
| #958 | Adoption converted the visual binary invulnerability/armor indicators into gameplay state. A tagged protection payload now accompanies the already life/sequence-validated adoption state. | Actual NetMatch send/receive/adopt retains 1.6s finite invulnerability, then expires on native ticks. Breakable armor HP, remaining duration and existing break delay resume from the newest accepted owner state; an old interpolated sample cannot restore expired armor. Invalid, stale and foreign rows are rejected. Old numeric recovery-age payloads remain readable but cannot supply missing protection clocks. The payload uses the recovery-age slot, leaving the outer row and the separate Slam extension slot untouched. It transfers finite protection; it does not reconstruct an absent infinite Squid Spawn aim phase. |
| #534 | A full 2048-square mural atlas and Halyard fallback were allocated even for stages using only shared strips. Shared-only layouts now use 2048x1024; Halyard/Cargo/Range stage rows allocate on demand. | Built Chromium uses actual Canvas2D and WebGL texture upload across nine stage changes. Shared pixels survive resize exactly; original stage pixels and UV/placement tables compare exactly with the same canvas raster backend. Exactly one GPU texture remains allocated across changes and zero after disposal. Canvas backing falls from 16 to 8 MiB; nominal RGBA8 mip storage falls from 21.33 to 10.67 MiB (about 18.67 MiB total reduction). Byte figures are dimension/format accounting, not driver process-memory measurements. Mobile device thermals/long-session eviction remain unmeasured. |
| #202 | The common weapon hurtbox helper still returned legacy terrain radius .38 in swim form, despite the separate .35 humanoid hurt radius. A separate .675 swim hurt radius now feeds the same helper. | Real continuous main-projectile and finite Charger graze tests resolve .35 versus .675, retaining the referenced 1.9286 form ratio in the existing project scale. Terrain radius, body dimensions, grate behavior and projectile radii are unchanged. Exact Nintendo-to-project world scaling remains the pre-existing calibration. |

Validation distinguishes native engine logic, emitted Chromium/WebKit browser
execution, and retail/device measurement. The added `seven_claims` CI job checks
out and verifies `SOURCE_SHA`, runs the focused native regressions, builds that
checkout, checks every emitted artifact hash, then tests Chromium and WebKit.
The older broad suite remains enabled. Seven unrelated failures reproduced on
the unchanged PR1172 base: Splatling HUD lifetime, Charger sight-cache source
anchor, Splatling jump-test lifetime/range fixtures, Dualies allocation/sub gate,
and generic floor-impact expectation. Existing adoption tests also assert an
obsolete outer packet index; this change adds current-wire round-trip tests
instead of repairing that inherited base work here. No merge is performed.


## 2026-10-08 — PR #1173 Charger regression follow-up

Compared exact heads `5e0af85cec522de53b128587a2fd7d2e961cf748` (#1172, run 37846910846) and `cad164b97b40ddbd48a9955cb4d0b330d1f0211f` (#1173, run 37851118110). The validate failure-name delta is exactly four tests: #1007/#1052 feet-versus-line paint, airborne Charger charge, #407 impact paint, and #420 line paint. No inherited failures were edited.

The #961 linear charge owner moves the first legal release coordinate from the retired 1/6 to 8/60. Three native-projectile fixtures still passed 1/6 while expecting minimum-charge paint. They now sample 8/60 and the same independent min/mid/near-full/full endpoint fractions, retaining exact radius/spacing/nearest-footprint assertions. #971 preserves the first eight airborne charge frames at normal rate; the landing-continuation test now verifies (8 + 52/3)/60 progress after 60 charge frames, the remaining partial state after 34 grounded frames, and full charge on the 35th.

Validation: all four targeted tests passed on #1172 before this change and on the corrected #1173 tree. The #1173 focused seven_claims CI job now explicitly runs all four. These are native/composed JavaScript checks, not new Nintendo hardware measurements. Sources, gear-free Splat Charger assumptions, full-charge threshold, and production damage/paint implementations are unchanged. Exact-head CI for the pushed follow-up is required; #1083/#1169/#401 remain untouched and no merge is authorized.

## 2026-10-08 — Next seven: resources, projectile retirement, online continuation and wall launch

Scope: #1054, #955, #505, #478, #568, #625, #573. Ownership/assignees, issue comments/timelines and all nine open/draft PR scopes were checked before claiming and refreshed before publication. Claims are posted on every selected issue. #289 was withdrawn after finding its physical-drop behavior already implemented; #568 replaces it. This branch is stacked on PR1173 `e20bc772e4257c94401bd83543e9a6454b89b696`. No changes to PR1083, PR1169 or PR401, no merges, and no duplicated base/bucket-repeat repairs.

Reference remains Splatoon 3 Ver. 11.3.0. Native/composed tests and Chromium measurements below are INKWAVE evidence, not Switch captures. Equipped modifiers, charge, surface and action state are explicit in the regressions.

| Issue | Reproduction and changed owner | Result and evidence limits |
| --- | --- | --- |
| #1054 | Splattershot/Trizooka activation, active ticks and expiration while standing in enemy ink; zero AP and 3 AP Ink Resistance controls. Actor adapter now calls the ordinary resource update once, with matching special-water composition anchors. | Ordinary .3 HP/F contact progression and 40 HP cap, equipped grace/rate/cap, surface reset, invulnerability, and off-ink recovery pass; 30/60/120 Hz schedules agree. Resource values are reused, not rederived. |
| #955 | Fire every one of the seven main families, then disconnect its owner while rounds remain alive. `disconnect-fidelity.mjs` retires main heads, independent InkFlight droplets, finite Charger jobs/beams, detached/timed/Charger wall paint, and queued Blaster impacts. Network ghost retirement uses the same helper. | Implements the issue's explicitly permitted cancellation policy, consistent with the existing no-bot human-disconnect rule. Does not promote ghosts to damage authority. Other owners survive; duplicate leave cannot double-release; stale birth/paint messages stay rejected. This is a deterministic reconciliation policy, not a claim about Nintendo's network implementation. |
| #505 | Four enemy deaths, including death/respawn transitions coalesced into one packet. NetMatch reports owner-authenticated life histories and frame watermarks; the host confirms disjoint wipe transitions once. Flow receives a separate confirmed event. | +10 fp uses the existing profile conversion and cap for every teammate, including dead teammates; active Flow is neither activated nor extended. Replays, outsider/stale packets, delayed owner reports, non-overlapping death intervals, later wipes, duplicate listeners and host migration are covered. Histories use monotonic owner-reported match-countdown frames; transport timing is INKWAVE's protocol, not retail network parity. |
| #478 | Online Turf results → Change Gear → native loadout/gear panel → Back or Keep Going. Existing offline continuation remains. | Removes only Turf's forced 12-second return. Authenticated per-player keep/change choices survive host election; the host returns the room only once all remaining human participants choose keep. Existing setMe/save paths retain equipment; endMatch carries explicit readiness. The existing room still owns host start/team confirmation. Stop uses the existing Leave Room confirmation. This does not implement Nintendo matchmaking. |
| #568 | Charge Surge for 1/15/45F; release B on the inked wall, delay exit by 2/8/12/40F, then take the native ledge or accepted ink-gap launch. | B release reserves eligibility; the native wall launch starts the existing .75s/30 HP armor exactly once. Damage on the wall remains ordinary. Launch tick is not prematurely deducted; cancellation/death/form/reset cannot revive a pending shield. Existing partial eligibility and movement values remain. Fixed 30/60/120 Hz traces agree. No PR1169 adoption-row changes. |
| #625 | Minimum 8/60, intermediate and full-charge Splat Charger shots into a high wall. Finite contact now creates charge-dependent shock plus descending gameplay paint, with a distinct splash-wall record. | Main shock radii 1.2→1.8 and fall .8→1.2; splash shock .6→.9, fall .45→.675 and explicit ground .4 use the pinned records. Source defaults resolve first/last bounds and gravity. Full-charge ground-impact #407 and line-spacing #420 remain separately tested. Seed selection, interpolation/integration and stamp spacing are local calibration. The omitted main ground radius and exact retail intermediate-charge wall silhouette are still unverified; no fabricated fallback ground radius is used. |
| #573 | Ordinary Tidal Slam at 0/10/30/49F, then 50/51F, landing recovery and a separately owned invulnerability timer. | Removes immediate quarter-damage armor. Player protection begins at the pinned 50F player field and rejects damage rather than reducing it. Native damage admission, owner hit rejection and outgoing invulnerability flag agree. Existing body/gauge landing completion ends this protection; independent invulnerability survives. Exact retail post-landing duration remains a capture gap; PR1169 Slam adoption is untouched. |

Source details:

- [Nintendo Flow overview](https://www.nintendo.com/au/news-and-articles/whats-new-in-the-splatoon-3-version-11-update/) describes activation/extension; the existing +10 fp value is retained from the issue's [original Flow verification](https://wikiwiki.jp/splatoon3mix/検証/イカフロー) and current profile, not attributed to the Nintendo overview. This change repairs online delivery rather than recalibrating Flow.
- [Nintendo update history](https://en-americas-support.nintendo.com/app/answers/detail/a_id/61257/) documents Keep Going / Change Gear, Then Go and a bug where changed gear incorrectly appeared on the previous battle's result screen. Native result identity and old roster data remain unchanged across preview/back.
- [Original current controls verification](https://wikiwiki.jp/splatoon3mix/操作方法) is the Surge wall-launch reference. No new armor HP/duration claim is introduced.
- Pinned extraction revision `7280ff9cde8bb1c5dcef46c700c326471584d2e6`: [WeaponChargerNormal](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponChargerNormal.game__GameParameterTable.json), blob `176e465690d25219a8df12ae594d3d8d536abef2`; missing wall-movement type defaults are from [XarrotD's original parameter table](https://splatoonwiki.org/wiki/User%3AXarrotD/paramtable). Explicit main first min 15/last max 30, resolved first max 30/last min 15/second 10, speeds .04/.05 and gravity .008 are recorded separately from unverified calibration.
- [WeaponSpPogo](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpPogo.game__GameParameterTable.json), blob `f8e210da97f8f1bf4fca07dba015b74a5439d5ef`: `spl__WeaponSpPogoParam.Rise_NoDamageStartFrame=50`. The fist's `BulletParam.StartInvincibleFrame=55` and the older SuperLanding file are not the player's timing source.

Validation before publication:

- Focused source: 92 passes, 0 failures; one emitted-only optional test skipped there and explicitly run below. Includes prior partial-Surge, automatic continuation, offline continuation and roll/surge controls.
- Emitted/composed verification: 61 passes, 0 failures, 0 skips. The seven claimed roots are covered by focused regressions; owner-wire tests use the complete adapter composition.
- Production build succeeds with immutable artifact checks; cache worker 65,461 bytes, under the unchanged 65,536-byte limit. New helpers are kept in their existing lifecycle/flight modules to avoid extra precache manifest entries.
- `scripts/check-inkwave-batch4.mjs`: isolated native NetSession/NetMatch and Menus contexts exchange controlled packets in Chromium, for both desktop clicks and touch (390×844). Both peers receive one wipe bonus, Change Gear blocks the host's early keep, Roller + Swim Speed persist across Back, old results remain unchanged, and both players become ready after exactly one room return. No page errors. This is browser evidence with controlled transport, not a physical-device or public-relay test. Chromium/WebKit is required by the new exact-head CI job.
- The four PR1173 regression tests also pass on this branch. PR1173's exact-head follow-up run `37854570747` has 128 native failures, identical by name to PR1172 run `37846910846` (zero added/removed), and its `seven_claims` job is green. Its overall CI remains red: active/browser and UI failures are reported separately; the UI selection-ring failure is not assumed to belong to a base owner without evidence.

Full Switch captures remain outstanding for wall-paint shape/default ground behavior, post-Slam landing timing and network latency equivalence. The implementation and tests do not mark those measurement gaps as verified.

### Same-batch CI compatibility follow-up

The first PR1174 head `c5eb685f17a3cd077fed511afcee0f21e9479372`, run `37857488610`, passes both focused jobs, including 61 emitted/composed tests and all four Chromium/WebKit × desktop/touch browser cases. Runtime build revision is `ac4a8bfb83af0c67f28b56499bbaed85747950882db984bb2079c2b069145820`.

A targeted scan of the existing Surge suite found five passing-on-parent tests whose fixtures still started armor on B release. These are this batch's compatibility regressions, not base failures. `movement-resources`, `movement-motion` (two cases), `armor-charger-batch` and `roller-freefall` now assert reserved eligibility on the wall and use the native ledge launch before shield assertions. The independent 45F test advances the game clock for its direct action updates. Existing charge, pose, timer, damage and Roller mode assertions remain. All five corrected cases pass and are added to the exact-head focused CI job. This follow-up changes tests/workflow/report only; production runtime and build bytes are unchanged. The inherited #208 ceiling-contact failure is outside this follow-up and remains with the base owner.

The next exact-head run `37858171962` (`6f7fe087f9365bf0ff8021fea4ac6d6f5335938d`) completed the full native gate with 130 failures versus the parent's 128. The only two added failures were the production wall opt-out and 30/60/120 Hz wall-geometry comparisons: the new absolute armor-birth timestamp leaked into serialized actor state. Armor scheduling now stores this marker in a private WeakMap, retaining launch-tick protection without adding clock-dependent actor/adoption state. The original wall comparisons are unchanged and all 33 wall-motion, Surge-launch, partial-armor and timer-allocation tests pass locally. The full wall-motion suite is now also an explicit focused CI step. Exact-head CI results for this correction are recorded on PR1174 after publication.

### 2026-10-08 PR1169: Roller contact, paint-age endpoints and Shooter corners

**Reference and scope.** The parameter profile remains pinned to Splatoon 3 Ver. 11.3.0. Comparison conditions are ordinary Splat Roller body contact, horizontal/vertical flick projectiles and default Shooter spread markers, with no gear modifiers in the native fixtures. Issues [#839](https://github.com/rhgrive3/actions/issues/839), [#498](https://github.com/rhgrive3/actions/issues/498) and [#871](https://github.com/rhgrive3/actions/issues/871) provide the requirements. No new console capture or Nintendo pixel/curve measurement was made. Per the requested branch ownership, broader CI repairs from this work were withdrawn; the pending base publication owns that work.

**Contact cadence (#839).** The build adapter and `runtime/roller.mjs` use the existing sourced `rollContactInterval = 0.4` seconds (24 fixed updates) for ordinary actor, Boss and special-object contact. Nullish ledger fallback preserves a valid first-contact timestamp of zero. The actor/Boss regressions produce accepted-contact sequences `[0,24,48,72,96]` at 30/60/120 Hz render schedules and retain the 125 damage value. A custom 12F interval controls both paths without delaying the first hit. These are native logic checks, not Switch timing measurements.

**Paint endpoints (#498).** `runtime/roller-impact-paint.mjs` reads each emitted unit's own `UnitParam.PaintParam` and scales only paint width. Horizontal units remain at full width through 20F, vertical units through 30F, and both reach the recorded 0.6 multiplier at 50F. The installed native `_impact` path is now checked for all 13 horizontal and 5 vertical units at 30/60/120 Hz, sampling 19/20/49/50F or 29/30/49/50F while holding geometry fixed. Each sample makes one authoritative landing-paint call and leaves stored collision, size, velocity and damage fields unchanged. Existing controls cover each unit's near/far anchor, ghost and other-weapon exclusion, trail composition, and #402 collision-radius boundaries. The separate vertical intermediate-paint owner remains separate. The 49F assertion only bounds the current provisional transition: it does **not** establish the original game's interpolation curve or frame rounding. Linear interpolation remains explicitly provisional, so #498 is not complete and must not be closed on this evidence.

**Shooter corners (#871).** Shooter-only build CSS places the four existing outer ticks at rectangular corners using the existing `--sp` spread signal. Inner dot/ring and the other weapon reticle paths remain present. The test DOM now implements the insertion operation used by the composed HUD, so the regression exercises that method without failing on an incomplete fixture. The diagonal 12px base and 0.707 spread factor preserve the project's approximate prior radial envelope; the bracket dimensions reuse project styling. These are not Nintendo-measured final pixel dimensions. Exact visual calibration and #871 acceptance remain open.

**Verification.** The four focused files (`roller-contact-cadence`, `issue-498-roller-paint-age-endpoints`, `issue-871-shooter-reticle-corners`, `issue-402-roller-radius-checkpoints`) pass 18/18 tests under `node --experimental-vm-modules --test`. The production build and quick upstream/numeric-provenance gate also pass. Public upstream files remain unchanged. Full branch CI still depends on the base repair publication; this focused receipt does not certify the whole workflow, a rendered browser comparison, or Nintendo hardware parity.

**Branch-owned CI fixture correction.** CI at `17b8bb2` exposed older #1169 Ink Vac test edits that incorrectly treated a fresh exhale press as a suction-held ZR. The fixture now carries ZR through suction for held-release tests and retains a separate fresh-press immediate-fire control, matching the existing runtime. Its absorption expectation also preserves the authenticated weapon cap on partial incoming damage. No Ink Vac runtime or base-branch repair was changed. The complete failing CI selection (`kit-ink-vac`, `kit-subs`, `issue-1008-1020-1037-1053`) passes 82/82 locally after this fixture correction. Combined with the 18 own-scope checks above, 100 focused tests pass; full workflow acceptance remains pending.

### 2026-10-08 PR1169 follow-up: four claimed issues, measured Shooter corners and Range diagnosis

**Ownership.** #960, #963, #964 and #953 have no assignee and no implementation PR; each had only the Local Batch 4/5 claim from 2026-10-07 06:25 UTC. After rechecking their threads and PR search, this branch posted takeover comments on all four. This makes the seven-issue scope #839/#498/#871/#960/#963/#964/#953. No changes to #1083, #401 or the pending base repair are included, and no merge is performed.

**Map and pause (#960/#963/#964).** `reliability/map-toggle-adapter.mjs` gives keyboard Tab/M, standard-pad X, raw-pad View and touch one controller-owned map latch. Release keeps it open; another map press, Nintendo B, Escape or a successful jump closes it. Touch-owner handoff still closes a touch-origin map on deliberate unrelated keyboard/pad input, but an explicit map edge toggles only once. Navigation while dead, deferred jump selection and the gyro cursor read the same latch. The guide and native browser fixtures now use press-to-toggle semantics. The issue's explicit FIRE/SUB suppression supersedes the older #265 test that allowed held ZR to continue through the map; cancellation never becomes a release shot and fresh physical input rearms normally. Movement/navigation retain their existing owners.

Offline pause now cancels the interrupted runner before freezing Match. Both pause and map cancel charge/sub holds as well as pending one-frame Charger releases; the native Splatling cancellation owner retains its existing reservation/refund rules. The touch callback runs before pointer neutralization, covering an open/close within one simulation tick. Native Charger, Splatling and SUB cases cover 30/60/120Hz hold → takeover → release → resume, then a deliberate fresh action. This is an INKWAVE UI lifecycle contract, not a claim about Switch HOME-menu behavior or a Nintendo frame constant.

**Slam adoption (#953).** The existing life/sequence-validated adoption tuple gains an optional tenth field for the native Slam phase/time, exact pose/velocity, armor flag and gauge reservation. Eight/nine-field legacy tuples still decode without inventing missing authority. The host resumes the latest accepted live action, not an older interpolated presentation state; a later completed/dead sample cannot resurrect it. This preserves the existing INKWAVE trajectory, impact damage/paint and gauge law rather than asserting new Triple Splashdown timings. Native owner/host tests cover rise/hang/fall at 30/60/120Hz, repeated leave, malformed/wrong-life payloads and later completion. Each transfer follows the uninterrupted native trajectory/gauge and produces exactly one damage/paint impact. Legacy clients lacking the new state cannot recover an unknown old Slam; no cross-version guarantee is claimed.

**Measured geometry (#871).** The prior provisional L-shaped square brackets are replaced by diagonal strokes at rectangular corners. Primary reference: Nintendo's [weapon-selection guide](https://www.nintendo.com/jp/ichikara/av5ja/index.html), explicitly dated 2024-04-01, and its original 1280×720 images [005](https://www.nintendo.com/jp/ichikara/av5ja/photo/01/005.jpg) and [021](https://www.nintendo.com/jp/ichikara/av5ja/photo/01/021.jpg). Original JPEG hashes, ROIs, threshold/connected-component method, centroids and pixel bounds are recorded in `patches/splatoon3/reference/shooter-reticle-reference.json`. Image 021 has corner core centroids near (601.19,303.05), (698.50,303.00), (601.21,351.35), (698.34,351.34): about 48.3px vertical span. Image 005 retains about 48px vertical span with a larger horizontal span. Measured diagonal stroke bounds support a 14px length and 3px width (roughly one-pixel JPEG/edge uncertainty). CSS uses ±24px vertically and ±(24px + existing projected spread) horizontally, with opposite ±45° strokes. The zero-spread square and horizontal expansion retain the existing accuracy/ShotGuide owners; inner feedback and other weapon reticles are unchanged. These are measurements of historical official material, not a new Ver.11.3.0 hardware capture or proof of current spread-angle calibration. A new Chromium/WebKit native HUD probe checks actual computed corner transforms at spread 0 → 20 → 0.

**Recheck of #498.** All 13 horizontal and five vertical native emitted units retain verified 20F/30F start, 50F end and 0.6 width endpoints against the pinned 11.3.0 extraction. An additional source search found the original parameter research table still labels the `ChangeFrameWidthRate`/`ChangeWidthStartFrame` semantics unknown. No evidence established intermediate interpolation or frame rounding. The linear transition therefore remains provisional and #498 must remain open; endpoint tests are not represented as full acceptance.

**Range CI.** Run 37839169267 hit the actual target for 36 damage in all three browsers but reported 11.271202242884296m. That equals sqrt(10² + 5.2²): `travel('gallery')` uses x=-6.8 while the 10m target is at x=-12. The verifier now enters via native travel, aligns with the target's actual firing-line column, synchronizes the character/root/rig and waits for real physics. A new 10m±0.05 setup check detects displacement before firing; the existing hit distance tolerance remains 10m±0.6. Projectile collision, damage, stage geometry and Range runtime are unchanged.

**Local receipts.** 81/81 focused tests pass (new input and Slam cases, existing pause/cooldown controls and all prior Roller/Shooter checks). The adjacent source input/navigation selection passes 123 with two emitted-only cases skipped; all 75 tests in its actual minified build mode pass with zero skips. Production build `fd9920f952e7` succeeds, and the quick raw-upstream/numeric 11.3.0 gate passes. Locked `inkwave-public/` is unchanged. Exact-head GitHub browser CI remains the next gate; base-owned full-suite failures are deliberately not repaired here. Physical hardware equivalence remains unmeasured.

**Own CI follow-up at 72bfcd8.** Run 37847528611 passed both network browser lanes (ordinary and 100ms ordered delay). Its validate failure was the prior 8/9-field adoption source assertion, now updated to require the backward-compatible 8/9/10-field decoder. Its UI failure was the hybrid touch-map fixture after temporary controller probes: the fixture had replaced `G.match` with a stub lacking its active controller, so MobileInput could target the last temporary controller. The browser fixture now retains production's active Match/controller relation. A new composed native regression constructs a temporary controller and proves touch map changes still reach only the active Match controller. The adjacent map tests now supply actual press edges, the shared latch API and complete standard-pad button arrays; the Joy-Con module fixture includes the new cancellation import. All 42 tests in this follow-up selection pass. These are fixture corrections and one added ownership regression, not changes to base runtime repairs. The prior Chromium job reached and passed the computed Shooter-corner probe before its later map fixture failure; complete Chromium/WebKit and Range receipts remain pending.

**Broad-CI separation and final map corrections.** Run 37848542367 at `4fdc9b9` passed Range in Chromium desktop/phone and WebKit tablet, plus UI, network, motion-catalog, active-renderer and responsive browser shards. The input/HUD probe passed 74 checks across Chromium and WebKit, with content hash `fd9920f952e7`. Broad native validation reported 146 failures; its long-standing base failures remain outside this branch. Comparing failure names and stacks exposed two additional branch regressions: a new map callback dereferenced null input in aim-only controllers, and map cancellation erased an already-paid Slosher heave. The callback now tolerates absent input, and map cancellation preserves that admitted native Slosher windup while still cancelling pending release-triggered holds. The existing paid-heave regression passes. The 49-case map/aim selection now passes 46 with only its three previously recorded base failures (#858 reach and two #94 presentation/cache checks). The existing 8/9-field adoption packet compatibility was also exercised without granting missing Slam authority, and those two cases join the #953 regression file. These follow-up results do not claim that the pending base CI repair is published or that all native tests pass.


### PR1175 reconciliation of PR1168 against current main (2026-10-09)

- PR1168 source `eadc3fdf5a063bd492587ac8f7cfb9ba2cd083d9` was compared with its original base `69add0203d127b790f009e3502f7110212262066` and PR1175 `20d49d2d807a8d1d595b5278b039f33e005f2281`. The 52 independently staged paths remain in place; shared gameplay, network and diagnostic paths are three-way composed rather than replaced with the older source branch. PR1171–PR1174/PR1169 report appendices dropped by the final main merge are restored from `92fb642e1ce856abdfcea819a7b5c1f34ebde521`, alongside current main's exact-tree browser follow-up.
- Charger minimum-range mapping retains the newer #961 linear first-legal coordinate of 8/60. The PR1168 report and source fixture's historical eased 1/6 coordinate are superseded by that current shared law; the sourced minimum/full distance endpoints are unchanged. Paint ownership also composes with the retained Charger wall-drop owner.
- The new Dualies native launch helper composes with the existing one-sample Splatling speed owner. Time-coherent actor sweeps retain the shared per-form hurtbox and omit render-only smoothing. Roller depletion, dry-roll continuity, ink-floor charging and temporal/canonical paint ownership retain current unit paint, trail width, Slosher reset and projectile authority behavior.
- Network Roller transport remains visual-only and preserves the current 24-field actor and 36-field projectile protocols, including tagged protection/adoption fields, Slosher authority and source-guided terminal events. Fixture adaptations exercise actual native start rejection, tagged recovery values, real Roller reset retirement and recycled disconnected ghosts; no admission gate is weakened.
- Bomb detail diagnostics capture the actual native release event and mesh while preserving all current pixel/contact and frozen-state guards. Range positioning uses native spawn/reset to clear interpolation while retaining controller-owned aim and the exact 10-unit target-distance guard.
- #416 partial Charger ZL cancellation now publishes an explicit one-shot event to the #737 resource owner before it clears charging, retaining independent 6F swim and 19F refill boundaries. Cancellation matches native enemy-ground and simultaneous newer Fire/sub admission; exact charge >= 1 full predicate keeps near-full partial values partial. Full production Actor/WeaponRunner regression verifies 30/60/120Hz, no paid-ink refund, no new keep/charge during recovery, and the exact refill boundary; native edge controls cover near-full, enemy paint changed this tick, Fire tie, and full keep/reset. Community timing provenance is unchanged; no new Nintendo hardware claim. This repair is delivered separately from the PR1168 source reconciliation.
- Acceptance remains partial: these are source-composition and deterministic CPU/geometry regressions. Exact-head aggregate CI, emitted browser behavior and physical Splatoon 3 Ver.11.3.0 comparison remain separate requirements. Neither incomplete retail measurements nor unmeasured pose/frame values are reclassified as verified. No `inkwave-public/` source or PR401 change is included.

- Separate PR1175 build reconciliation: the unchanged 64 KiB worker failure came from build-only source transformers being packaged as runtime assets. An explicit audited 64-transformer exclusion retains mixed runtime helpers, every static import, all 293 runtime precache entries, and existing hash/integrity/offline checks. Hint selection enforces the unchanged 131-core-request and 3.2 MiB initial-byte ceilings against final instrumented bytes without deleting runtime modules. Numeric status covers the final 551-field profile, retaining the current Shooter fields and PR1168 Roller additions. Pre-combination build/worker-contract checks pass; this is deterministic packaging validation, not native-browser performance proof.

- PR1168 reconciliation receipts: source-feature suites 159/159, full network 176/176, and final complete affected fixture/roller-depletion group 57/57 pass with no skipped cases. All 402 composed native and non-test patch modules parse. These scoped local results do not replace the required final combined-branch aggregate/browser CI or physical reference comparison. The separately delivered #416/#737 Charger repair also passes its parent-owned 19-case focused run.

### PR1175 final integration fixture ownership (2026-10-09)

- #914's hold-to-fire control now accounts for the independently introduced #305 depleted Roller swing. A positive low tank admits and pays the native swing once; crossing the existing bot 3% fallback threshold drops Fire while the latched 21F swing still releases. The regression retains baseline/subject input equivalence, checks payment and absence of a second debit, and follows the real WeaponRunner emission through the fixture's paint/refill model until refill mode exits. The 17-case bot-refill suite passes, including existing Charger/Splatling negative controls and 30/60/120 Hz release checks. No bot or gameplay implementation was changed; this does not measure retail bot skill or browser paint rendering.
- #528 integration: the later sub-ready owner cancelled every Super Jump state, suppressing PR1170's imported late-descent hold. Only the existing native humanoid window (>0.82 flight progress, not a Nintendo-measured frame) now permits staging. Flight releases cancel and never queue an airborne throw; actual landing releases retain the existing 5F humanoid preparation and separate 1F use-startup, debit ink once, and clear on death/reset/input cancellation. Native composed regressions cover 30/60/120 Hz fixed-clock cadence, short holds, early release, and malformed/early phases. No new retail/hardware parity or timing measurement is claimed. This production repair is delivered separately by the integration owner. Its 14-case focused run passes, including native main-only #218 and explicit R-over-ZR priority controls; two legacy simultaneous-input expectations were corrected and pass independently.
- The portrait-map negative control now sends an actual fresh Tab pressed edge and ends the frame. Its former held-only input never opened the current map; comparing undefined with zero incorrectly admitted that setup. The fixture now requires the exact queued yaw/pitch and confirms removal of the subject hook before testing native offline/online and alive/dead controls. All five cases pass without a production change.
- The built-weapons receipt is reconciled with an independent unminified six-adapter source measurement after the #514/#961 Charger range composition. The 15F/30F/45F sampled hit boundaries are 11.8/16.1/20.4; corresponding paint maxZ is 14.875/18.875/23.375, and full-charge paint maxZ is 26.875. Source and emitted rows match exactly. These are deterministic 0.1-unit hit-grid and 0.25-unit paint-cell receipts, not revised Nintendo measurements. The strict 1e-7 expected-value tolerance, source/build equivalence, native wire shape and duplicate-burst negative controls are retained; recorder fixtures initialize the current session-owned sequence state.

### PR1175 native temporal paint authority (2026-10-09)

- The native source-guided `InkFlightRuntime.paint` path used by Shooter, Dualies and Splatling previously credited only the immediate body, while later ray/drop cells grew turf without crediting their emitter. The build-only adapter now passes the originating Actor into the existing temporal paint owner, including native head, detached-drop and feet-trail kinds. The independent Shooter nearest-foot stamp also carries its actual owner. Existing immediate credit, remote/ghost exclusion, network metadata stripping and chronological ownership remain unchanged.
- The fixed paint clock previously advanced during an offline pause even though gameplay time and projectiles were stopped. It now uses the same offline-pause predicate as gameplay time, consumes paused fixed-clock ticks without paint catch-up debt, and continues normal online-menu and attract simulation. Resume and zero-tick render behavior are verified at 30/60/120 Hz.
- Production-composed native regressions fire all three real weapon paths and verify actual head/drop contacts, local ownership metadata, immediate-plus-late cell-area credit exactly once, special credit, remote/adopted ownership boundaries, and paused grid/order/growth/credit stability. These are deterministic native JavaScript/CPU observations against the existing Ver.11.3.0 reference scope, not a new retail timing or GPU-mask parity measurement; physical Splatoon 3 comparison remains unverified. Locked `inkwave-public/` is unchanged.

### PR1175 composed regression follow-up (2026-10-09)

- #189 maximum-speed Roller side bands now derive their radius from the actual #979 CPU/GLSL visible-edge envelope (`BAND_W + BAND_R + .03 + .018`), preserving the pinned 5.6 world-unit maximum width. The obsolete .69-radius inset overstated the width after wavy CPU/GPU parity was integrated. Native grid tests retain the existing bound, seams, floor-only projection and low-speed controls, and add 12 seeded phases in both axes. This is source/composition verification, not a new retail measurement or an inferred interior speed-width curve.
- Older Charger keep and clothing-wire fixtures now exercise the composed 6F cancellation and accepted native Roller sidecar, retaining strict no-shot, no remote gameplay authority and independent clothing-mask assertions (28 checks pass). The #1050 dry trench control now contains an actual exposed low platform instead of overlapping it with the default full-width upper floor; real capsule/landing geometry and water-death controls remain active.
- The subsequent emitter audit connects the previously bypassed Actor/weapons ownership adapter before their early returns and reconciles its final composed anchors. All identified scoring emissions in the active Roller release/trail, Slosher nearest/intermediate, Charger wall-drop, Suction/Curling and Blaster flight/timed/collision/detached paths now retain the emitting owner. Native death bursts preserve the attacker through the reliability adapter. Slam and Big Bubbler ignition retain the explicit no-special ledger; intentionally unowned Flow/Range paint is unchanged.
- Follow-up receipts: the 106-case native authority/clock/canonical-order/kit/weapon/Slam selection and 55-case wall/Bubbler/Slosher-flight/Blaster-flight selection pass without skips. Nine added production-composed audit cases include real Charger and Blaster wall contacts, native falling paint, and an actual charged Big Bubbler ignition. Removing the follow-up production metadata repair causes those nine new cases to fail. These results verify local ownership/credit integration, not retail parameter parity or the separately reviewed GPU-mask contract.
### PR1175 ancillary CPU/GPU paint identity repair (2026-10-09)

The build overlay now gives authoritative ancillary ownership and GLSL rays/satellites/spatter/drips one exact bounded-integer hash, with the CPU-packed seed transported in the unused growth attribute. The earlier polynomial CPU/sine GPU mismatch is removed without changing native body paint, cosmetic tone, sourced calibration, or locked upstream. Exhaustive seed/float32 and native quad regressions accompany a mandatory exact-head source/emitted WebGL mask probe with reverted-sine negative controls. Local Chromium is socket-permission blocked, so browser acceptance remains pending CI; no retail Ver.11.3.0 shape/timing parity is inferred. Detailed scope and evidence are in `reports/pr1175-ancillary-paint-hash-2026-10-09.md`.
### PR1175 network paint chronology integration (2026-10-09)

- Full production composition reproduced two INKWAVE defects: paint from a client open for 120 seconds incorrectly outranked a causally later repaint by a 10-second-old client, and reversing two opposing paint deliveries produced different final turf after growth. Application uptime remains an owner-local playback/physics clock; a match-scoped Lamport paint stamp now advances on authenticated reception and each local emission. Concurrent stamps use a stable peer/sequence tie-break. The tagged wire record carries match identity and instant-growth policy; same-match recreation retains observed time and applied sender watermarks, while a new match starts a separate clock. Legacy-width rows remain readable below current causal stamps and do not provide the new protocol's cross-version causality guarantees.
- Online splats no longer force-finish one another according to arrival order. Each stamp retains its fixed-step ancillary growth history, including an older stamp whose entire immediate body is already covered but whose peripheral ink remains visible. CPU ownership and the existing GPU cell-owner mask still reject older paint on newer-owned cells. Offline paint retains its previous completion behavior. Native victim-owned attacker-color death bursts and host-owned enemy Boss paint remain legal; sender team color is not treated as actor authority.
- New native regressions cover 120/10-second and 1e9/0-second uptime differences, bidirectional observed repaint, queued-before-presentation causality, concurrent/reverse/fully-settled-late deliveries, 30/60/120 Hz render schedules, floor ancillary paint and wall drips, duplicate deadline application, recreation, wrong-match/malformed records, departed owners and instant paint. The original aa813d43 source fails the observed-repaint and arrival-order growth negative controls. These are deterministic INKWAVE network/paint integration checks against the existing Splatoon 3 Ver.11.3.0 comparison scope; no Nintendo networking algorithm, hardware frame timing or rendered pixel parity is inferred from them.

### PR1175 temporal scoring boundary correction (2026-10-09)

- On combined head `061f2b95`, the temporal mask credited wall and occluded-floor cells even though the composed native body scorer correctly excluded them. A native wall-only impact accumulated 11.75 points and a fully occluded floor impact 2.25 points over their first 120 growth ticks, with no eligible Turf coverage. Ancillary scoring now shares the body's `face.turf && !dead` gate. Grid ownership and chronological records still grow on excluded surfaces, and a separate mutation flag advances the paint version even when no points are awarded.
- Native regressions cover wall-only and initialized occlusion masks through the complete body/drip lifetime, verify zero turf/special credit, preserve positive actual grid/order mutation and cache invalidation, and reject further version changes after growth finishes. Charger/Blaster wall-contact checks now compare credit to newly claimed eligible floor area rather than treating wall growth as scorable.
- With the shared deterministic CPU/GPU hash, the three sampled native Slosher volleys produce no fresh ancillary cells on the 0.25-unit grid after overlapping bodies. The owner-metadata checks remain strict and zero late credit is checked against the actual grid delta. A separate real Slosher release/flight scenario at the supported 0.125-unit grid interleaves native projectile and paint clocks, produces positive late floor coverage, and checks exact per-step cell-area credit. This corrects a coarse-sampling fixture assumption without changing weapon parameters or claiming additional retail/GPU parity.
- Counter-boundary follow-up: a valid remote clock at `Number.MAX_SAFE_INTEGER - 1` could formerly make the next local clock unreceivable and the following emission throw. Paint clocks now retain numeric encoding through the safe-integer boundary and carry larger values as canonical decimal strings, using exact comparison/increment. Native JSON replay checks both that boundary and a 50-digit carry, successful subsequent repaints, unchanged concurrent peer tie-breaking, and rejection of unsafe numeric/ambiguous string encodings. This does not clamp an accepted clock or impose an arrival-dependent reset, and ordinary wire values remain numeric.


### PR1175 complete validation scheduling (2026-10-09)

The combined canonical diagnostic now covers more than 3,500 tests and required about 23 minutes locally before the remaining network, quality, reference and built-weapon gates. The validate job deadline is extended from 30 to 45 minutes so the complete enlarged sequence can finish. No test is removed, skipped or made conditional by this change, and no gameplay, visual, numeric, worker, startup or performance acceptance threshold changes.

## 2026-10-09: #433 LOW/mobile Online LobbySet atlas backing

- 比較対象は Splatoon 3 Ver.11.3.0 の Online lobby 表示。ブキ・ギア・操作条件は資源所有経路のため対象外。S3側の atlas 寸法や GPU 常駐量は今回計測していないため、メモリ実装の一致や数値 parity は主張しない。
- 再現手順: touch 端末で Online hub または room を開くと、`issue-472-adapter.mjs` が raw quality 設定から native LOW LobbySet を選び、`_lobLoad()` が LobbySet と4枚の atlas を生成する。Online を離れて offline main に戻ると、`_updateSet()` の1.5秒 release path から `_lobRelease()`、`LobbySet.dispose()` に進む。通常 play 入力や対戦状態は不要。
- main `5d0be6b7` では元の menu preload fix は既に含まれるが、別ブランチの `9cf2d92c` atlas cap は main の祖先ではなかった。4 atlas はすべて Online presentation に使われる一方、LOW/mobile でも desktop backing のまま作成されていた。build adapter は LOW の width/height を各1/2にし、canvas context の描画座標と UV/layout を維持する。HIGH/MEDIUM は native dimensions のまま。
- 資源計算: decal 2048²、lit 2048×1024、skyline 2048×1024、ground mask 1024×2048 は計10,485,760 px / RGBA換算40 MiB、full mip chain 約53.34 MiB。LOW はそれぞれ1024²、1024×512、1024×512、512×1024で計2,621,440 px / 10 MiB、mip chain は14 MiB未満。これは4 atlasに限った寸法/format計算で、Canvas/GPU driver overhead、他のscene資源、端末常駐量を含まない。
- `patches/local-quality/tests/lobby-resources.test.mjs` と `issue-472-lobby.test.mjs` は10/10。テストは native atlas builder source を Canvas2D stub で実行して backing寸法/pixel countを数え、native release/dispose owner pathを30/60/120 Hzで2周期ずつ実行する。これは source/lifecycle call evidence であり、実 browser upload、Safari/WebKit、iOS/Android GPU reclaim、Switch parity の代用ではない。
- プレイへの影響は LOW LobbySet の atlas raster detail の低下に限る。UV、geometry、menu/Online lifecycle、input、gameplay logic は変更しない。実機画面の可読性レビューと browser/GPU profiling は未確認のまま残す。
## 2026-10-09 — #272 Stealth Jump shoes-main gear-panel residual

### 本家の根拠

- Splatoon 3 Ver. 11.3.0 pinned `spl__GearSkillTraitsParam` at Leanny `splat3@7280ff9cde8bb1c5dcef46c700c326471584d2e6`: `Traits.SuperJumpSign_Hide.KindLimit` is `Shoes`. The recovered JSON is retained with SHA-256 `853f8eb25077ec5d7017a7ec1da3b9cddf4b0ddba5f7c361f2fd51f7a12d0a57` in the task evidence.
- The same pinned set's `SplPlayer.game__GameParameterTable.json` records the existing Ver. 11.0.0 Stealth Jump flight extension parameters. It does not specify an INKWAVE map's anchors or conversion into the S3 front/back distance coordinate; the mapping remains unknown.

### INKWAVE の実装箇所

`patches/splatoon3/runtime/gear.mjs` already restricts `stealthJump` to shoes main in `abilityAllowed`, normalizes that slot, and sets the equipped modifier. `gearPanel()` then filtered out abilities without an AP curve in `tuning.gear`; Stealth Jump is a fixed ability without that curve, so it was missing even from shoes main. The panel now gives it the same fixed-main exemption as `ninjaSquid`. It keeps the existing shoes-main-only predicate. No `inkwave-public/`, flight, charge, network, owner/remote presentation, or Practice Range source was changed.

### 再現操作と結果

The focused panel test invokes the production `gearPanel()` function with bounded DOM/storage stand-ins. It checks all 12 controls, confirms Stealth Jump appears only in `クツ メイン`, selects it, and observes the existing loadout storage handler persist that choice. The gear regression also checks the non-local Actor retains its shoes-main loadout and modifier. The separate #272 test confirms all head/clothing mains and secondary slots remain rejected, while the existing no-foci gate still returns zero when ordinary spawn/home points are supplied. A static scan of `patches/practice-range/` finds no Stealth Jump or Super Jump penalty hook; no Range path is part of this change.

### プレイへの影響と未確認事項

Players can now equip Stealth Jump from the production loadout panel, only in the shoes primary slot. The flight modifier remains governed by the existing explicit `level.stealthJumpFoci` gate. No shipped-level anchor or coordinate conversion was inferred from `spawnPads` or `homeSuperJumpPoints`; the flight penalty therefore still fails closed where calibrated foci are absent. No Switch measurement or cross-device browser network check was performed. This is the gear-panel residual only; #272's flight-coordinate mapping remains open.

The owner/remote arrival-cue concealment gap recorded in the recovered prior result remains separate and unchanged: this panel edit adds no stealth field to the remote `superjump` event and changes neither flight branch's cue behavior. Range behavior is likewise outside the changed paths; these are source-scope checks, not new cross-device or Range browser acceptance.

### 確認状態

- `node --test patches/local-quality/tests/continuation-gear-flow.test.mjs` — 4/4, including the actual production-panel slot/persistence case.
- `node --experimental-vm-modules --test patches/splatoon3/tests/gear-sub-batch.test.mjs` — 16/16, including the #272 non-local Actor gear case.
- `node --experimental-vm-modules --test patches/splatoon3/tests/issue-272-stealth-jump.test.mjs` — 4/4, including shoes-only normalization and fail-closed uncalibrated foci.
- A first `gear-sub-batch` invocation without `--experimental-vm-modules` failed before assertions because `vm.SourceTextModule` was unavailable; the flagged rerun passed.
- Physical Ver. 11.3.0 behavior and live-browser/cross-device acceptance remain unverified.
## #292: Drop Roller の Super Jump 着地（2026年10月9日）

- 本家参照版：スプラトゥーン3 Ver.11.3.0。任天堂の[現行更新履歴](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/kw/Splatoon%203)は2026年8月19日公開の Ver.11.3.0 を最新としている。[Leanny/splat3 の固定 Ver.11.3.0 抽出データ](https://github.com/Leanny/splat3/commit/7280ff9cde8bb1c5dcef46c700c326471584d2e6)では `SomersaultLanding` が Drop Roller に対応し、保持した Ability Index の説明文は Super Jump 中の Left Stick 入力方向への着地ロールを示す。[Splatoon 3 Wiki* の検証ページ](https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%82%B9%E3%83%97%E3%83%A9%E3%83%AD%E3%83%BC%E3%83%A9%E3%83%BC) と [Drop Roller の項目](https://splatoonwiki.org/wiki/Drop_Roller) はクツ専用、着地前入力方向、成功後約3秒の Run Speed Up / Swim Speed Up / Ink Resistance Up 各30 APを記述する。後者はコミュニティ資料であり、任天堂の更新履歴がこの能力や数値を説明しているわけではない。
- 本家の未公開値：固定版 [Leanny `params.json`](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/misc/params.json) で見つかる該当名は `Somersault_MoveVelKd` のみ（値 `[1.0, 0.925, 0.85]`）。別の Drop Roller 固有の速度・距離・動作フレーム曲線は確認できない。現行 INKWAVE の `profile.json` はこの値を Squid Roll chain retention に結び付けており、Drop Roller へ転用していない。Switch 実機計測もしていないため、ロールの速度・距離・正確な動作時間は未確認であり、本家ハードウェアとの一致を主張しない。
- 比較条件：本家側は Ver.11.3.0、ブキ・ギアの他スロット・ステージ・入力フレームを揃えた実機試験を未実施。INKWAVE の着地方向確認は通常 Actor、Super Jump、クツ主ギア Drop Roller、移動以外の入力なし。方向は飛行開始時ではなく、着地直前の固定シミュレーション tick で変更する。射撃回帰は着地後に Shooter の fire 入力を入れる別 fixture。
- INKWAVE の変更：`patches/splatoon3/adapter.mjs` は native Super Jump が地面を解決した着地分岐で Left Stick 相当の `intent.move` を読む。`patches/splatoon3/runtime/gear.mjs` は Drop Roller をクツの主ギア限定にし、公開版 `inkwave-public/src/game/actor.js:380` が接地移動を許可する `Math.hypot(move.x, move.z) > 0.01` と同じ境界で方向入力を判定する。パッドの raw radial dead zone 0.14 (`inkwave-public/src/core/input.js:115`) やタッチスティックの8% dead zone (`inkwave-public/src/core/mobile.js:389`) より後の production movement 値を読む。発動中は選んだ方向へ通常の地上移動入力を固定して `dodge` の着地ポーズを表示する。ローカル制御ポーズ窓は INKWAVE 内だけの0.3秒であり、本家の移動フレーム値や軌道ではない。正常終了後は3秒間、移動速度・泳ぎ速度・相手インク耐性の派生値に各30 AP相当を足す。装備 AP の正規状態は変更せず、Flow の派生値再計算にもこの一時 AP を含める。戦闘中に得た buff は Practice Range の最初の Actor update 前に消し、死亡・リスポーン・reset でも action と buff を消す。新しいジャンプ・変身・スペシャルは進行中のロールだけを中断する。
- 通信：`patches/network-replication/adapter.mjs` は owner の Drop Roller pose を検証付き sidecar として送る。remote 側はCharacterのポーズだけを再生し、ゲームプレイ action / buff / APを作らない。同じ action ID の後続 snapshot は再生を再開しない。Drop Roller は Squid Roll の action state・chain と独立し、通常 Super Jump、ニュートラル入力、Practice Range では発動しない。
- 射撃の根拠と限界：[Inkipedia の Drop Roller 説明](https://splatoonwiki.org/wiki/Drop_Roller)は、着地ロールが敵の射撃を避け、反撃の機会を作り得るとする。この記述を根拠に INKWAVE 側へロール中の武器使用禁止を独自追加せず、`superjump-gameplay.test.mjs` は通常の Shooter projectile/fire event と実際のインク減少が INKWAVE の0.3秒制御窓内に起きることを確認する。一方、同コミュニティ資料は発射がロール姿勢中のどのフレームに可能か、各ブキの消費量を説明していない。ロール中の本家実射・インク消費は未確認であり、本家挙動の断定には使わない。
- 再現と確認：`patches/splatoon3/tests/superjump-gameplay.test.mjs` は shoes slot、着地直前の方向、0.01 deadzone の両側、無入力、装備なし、Range 移行、+30 AP相当、3秒 expiry、通常射撃とインク消費、実際の open-water fall death、splat/respawn、割り込み、reset、30/60/120 Hz 固定クロックを確認する。`patches/network-replication/tests/issue-292-drop-roller.test.mjs` は owner snapshot、remote pose 1回だけの再生、sidecar 継続・取消し、remote に gameplay buff が付かないことを確認する。いずれも INKWAVE のロジック・Character trigger fixture であり、ブラウザ描画品質、Switch、ネット遅延下の実機動作の証明ではない。
- 遊びへの影響と未完了 acceptance：現状は方向入力・着地ポーズ・一時ギア効果とネットワーク表示を接続した。INKWAVE は通常の地上加速を使うローカル0.3秒の方向／ポーズ窓を実装しているが、これは INKWAVE 内の暫定制御で、本家のロール曲線やハードウェア同等性を示さない。Drop Roller 専用の速度・距離・動作時間は未実装・未照合であり、Issue が求める本家同等のロール移動 acceptance は Switch 計測または信頼できる抽出値が得られるまで未完了とする。Inkjet / Zipcaster の帰還処理は公開版に存在しないため今回の対象外。

## 2026-10-09 — Roller depleted collision radius (#305 residual)

Reference: Splatoon 3 Ver. 11.3.0 Splat Roller, using the pinned `WeaponRollerNormal` table at Leanny `splat3@7280ff9` linked in the issue. Every one of the five Splat Roller units (2 wide + 3 vertical) carries `UnitParam.CollisionParam.DepletionRate = 0.5` alongside its own `InitRadiusFor{Player,Field}`, `EndRadiusFor{Player,Field}`, `ChangeFrameFor{Player,Field}` and `FriendThroughFrameForPlayer`. The field scales the depleted round's hit magnitudes; it does not replace the growth chronology, the teammate window, or the sourced damage/speed/paint parameters. Units: wide init 0.12/0.1 → end 1.02/0.6 over 4F/2F; vertical unit 0/1 init 0.116/0.1 → end 0.87/0.75 over 4F/3F; vertical unit 2 init 0.116/0.1 → end 0.82/0.55 over 4F/2F; friend-through 3F on all five. Per-frame native radius behavior on hardware remains unmeasured.

INKWAVE ancestry and remaining root: pre-residual main `59041049` already admitted the low-ink swing and applied the reduced volley, `DepletionSpeedRate`, `DepletionDamageRate` and paint `DepletionDepthWidthRate`. The sourced owner collision-radius repair is commit `ee5d51af`, merged by PR #1177 at `5d0be6b7`; this checkout already contains it. The older candidates `568e0129` and `67a517fb` are not main ancestors and duplicate that repair. Their radius behavior is not reimplemented here. The remaining gap was in network birth reconstruction: the owner set `s3DepletionRound`, but the projectile packet omitted it, so remote presentation ghosts rebuilt the full player/field radii. The merged radius test also skipped the appended horizontal nearest glob even though the production near-unit path had its own depletion mark.

INKWAVE change: the network adapter adds one optional boolean only to an explicitly depletion-marked projectile birth, after its Roller unit and before the existing owner tick/sequence. A shared preparation step validates the flag's exact position, removes it once, and passes that same normalized array through receiver identity checks into native `ghostProjectile`; this keeps base, `inkMeta`, kit, and powered-kit offsets tied to the established layout. In particular, a depleted no-kit `inkMeta` packet normalizes from 35 to 34 fields before kit detection, so it is not mistaken for a kit birth. Malformed placements and non-Roller flags are denied before identity advances. Ordinary packets, including powered-kit forms, and legacy layouts keep their previous shapes. `ghostProjectile` restores the prepared mark before `initialize` rebuilds the per-unit record. Owner hit radius still comes from PR #1177: `setCollision` multiplies only player/field `initRadius` and `endRadius` by finite sourced `DepletionRate` in (0, 1], leaving `changeTime`, `FriendThroughFrameForPlayer`, and unmarked records unchanged. No files under frozen `inkwave-public/` changed.

Reproduction and confirmation: `issue-305-roller-depletion.test.mjs` uses the actual low-ink Roller runner and real `Projectiles`; all 11 cases pass, including horizontal/vertical release at 30/60/120 Hz, sourced counts/cost/speed/damage, per-unit paint, and per-unit player/field radius checks for every projectile, including the appended near glob. It also confirms the reduced volley retains one grouped-hit owner. `issue-305-depletion-collision.test.mjs` passes 4/4 radius chronology, full-volley, unmarked-count and empty-tank controls. The focused `roller-unit-replication.test.mjs` passes 11/11: normal and depleted base/`inkMeta`/kit forms pass through the real receiver; powered-kit controls stay valid; malformed and non-Roller depletion flags are denied; tick, sequence, identity, mode, seed and unit survive normalization; and the real target-collision boundary matches between owner and ghost with an unscaled negative control. The focused Practice Range regression hits a real gallery target through the live target/session path. Adjacent Roller group and #999 spawn-armor controls pass 7/7.

Player impact and limits: owner hit volumes use the 11.3.0 per-unit 0.5 depletion scale, and remote presentation ghosts now reconstruct the same records without gaining actor-hit authority. The actual owner path, production packet path, and Practice Range target path are covered by deterministic composed logic tests; no browser rendering or two-device gameplay session was run. The retail per-frame radius curve and physical Switch comparison remain unverified; no unpublished frame values are inferred.
### INKWAVE #1033 victim disconnect during hit handoff (2026-10-09)

Comparison scope: Splatoon 3 Ver.11.3.0, ordinary online battle, the same shooter, victim and victim life. Nintendo's [online battle guide](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59459/p/897) documents online play but not packet ACKs, victim ownership, relay NACKs or disconnect handoff. This is an INKWAVE reliability repair; it does not claim parity with Nintendo's private networking behavior.

In the locked public source, `inkwave-public/src/net/netmatch.js` sends each accepted hit to the current victim owner and retains the existing packet for a relay `hit_nack`. The composed adapters also have a life-bound ACK/confirmation receipt. The seam could lose that receipt when NACK arrived before the ordered leave, and could not follow multiple owner changes. The build-only patch in `patches/network-replication/adapter.mjs` keeps the exact hit packet and sender identity, holds a relay NACK until the ordered leave changes the target owner, and retries only to that actor's current owner while its life still matches. ACKs settle only from owner IDs to which this exact hit was routed, with matching hit, actor and life fields. Existing attacker-owner authentication and hit life validation remain in `_hit`; duplicate ACKs cannot confirm combat twice. Death, respawn, Range/noBots removal and match rebinding retire both delivery and combat-confirmation records. Delivery retries remain capped at 64 and combat receipts at 120: a new send is rejected before it gets an identity when either queue is full, and neither queue evicts an older accepted hit. The composed `Projectiles.applyHit()` path observes `sendHit()` rejection and does not publish accepted-hit feedback. A transport refusal retires only that unsent attempt. The hit receiver keeps exact IDs in a 65,536-sequence recent window so a reordered retry is admissible and an already accepted ID cannot apply damage twice. Per-sequence modulo slots prune one aged identity when a slot is reused; ordinary hits do not scan the retained Set. `inkwave-public/` remains unchanged.

The composed transport regression covers NACK-before-leave, host adoption, a second host-to-owner transfer, exact packet reuse, delayed ACK from the original destination, duplicate hit/ACK, stale victim life and Practice Range removal. It also covers both an initially guest-owned victim and an initially host-owned victim, an accepted lethal hit through guest handoff with exactly one splat, and the same NACK → leave → retry → ACK order scheduled at 30/60/120 Hz frame boundaries. Queue checks fill the 64-entry limit, preserve the oldest accepted hit while rejecting the next admission, reject a transport refusal without a half-record, exercise production `mapNoBots('cargo')`, and run composed bind/dispose plus `NetSession` close cleanup. Dedupe checks cover the exact 65,536-ID boundary and forbid iteration over the retained Set on an ordinary high-water hit. This continuation passes 13/13 composed handoff cases, 5/5 composed hit-packet cases, 1/1 legacy source-composed NACK case, and 1/1 relay case (20/20). The frame-rate check is a deterministic logic schedule, not browser rendering. Receipts are under `/mnt/workspace/.dev-state/agent-work/evidence/inkwave-c-resume-20261009/codex5-1033-reboot5/`.

Not verified: a live WebSocket disconnect race, browser reconnect lifecycle, physical Switch comparison, or Nintendo's ownership/retransmission behavior. The source-composed `bind`, `dispose`, `NetSession.leave`, and `NetSession._closed` methods were exercised with deterministic transport sinks; these tests do not constitute a live socket/browser reconnect replay. Packet identities at or below `highHit - 65,536` are rejected as stale; the bounded recent-ID Set retains at most 65,536 slots. Queue saturation explicitly refuses a new hit while preserving accepted entries. The 30/60/120 Hz check verifies identical INKWAVE logic outcomes for an identical callback order, not physical frame timing or Splatoon 3 parity. Nintendo's online guide provides no public ACK, ownership, relay-NACK or handoff specification, so retail hardware fidelity for this race remains unknown; browser play and live online play were not performed.

#### Roller contact cadence and Thermal Ink ACK ownership follow-up

Source-VM reproduction: put a grounded local Roller in contact with a living remote victim, deliver the first request twice to the owner, remove the sender transport at the 24F retry boundary, restore it at the next 24F boundary, and deliver the delayed first ACK after the newer request. Separately, send a direct Thermal Ink hit receipt from the current victim owner, replay it, then change the victim owner before delivering the old-owner receipt.

Comparison conditions are Splatoon 3 Ver.11.3.0, Splat Roller contact during an ordinary online battle, local attacker against a remote victim; the private-tracking check uses a direct Blaster hit with Thermal Ink in the main clothing slot. The existing INKWAVE Roller profile uses the community-table 24F (0.4s) repeated-contact interval documented in profile.json; this repair changes no Roller damage, reach, or interval. Nintendo's public online guide does not document hit ACKs, packet loss, or owner changes, so those network behaviors remain unverified against retail Splatoon 3.

In the locked INKWAVE source, native _roller stamps rollHits before Projectiles.applyHit. A local sendHit refusal had gone through the same Roller cleanup as an owner rejection, causing the caller to erase that timestamp and retry before the existing interval. The composed caller now keeps the native timestamp and retires ambiguous ACK correlation when local admission or transport fails; it emits no accepted-hit feedback. An explicit owner hit:rejected still clears the timestamp for a retry. The network packet and owner-authoritative damage path are unchanged. Thermal Ink's request metadata stays private. The later #1033 confirmation repair below admits an authenticated same-life receipt from an exact delivered predecessor owner as well as the current owner; both settle accepted damage and may grant the eligible shooter's private mark.

The focused patches/reliability/tests/roller-contact-admission.test.mjs and patches/splatoon3/tests/private-tracking.test.mjs pass 15/15 together on the source-composed VM. They cover the 24F boundary, absent transport and recovery, owner rejection and acceptance, duplicate hit delivery, late ACK suppression, once-only owner damage/feedback, and Thermal Ink's validated, replayed, armor-only, and superseded-owner receipts. The fixtures return the same boolean status as production Transport.sendTo. This verifies INKWAVE logic and event playback only; browser networking, live WebSocket loss, physical Switch behavior, and Splatoon 3's private networking are not measured.

## 2026-10-09 — #845 offline-bot visual budget and evidence

**Splatoon 3 comparison.** The named reference is Splatoon 3 Ver. 11.3.0, identified in Nintendo's [official update history](https://support.nintendo.com/jp/switch/software_support/av5ja/index.html). Nintendo does not publish frustum-culling policy, Character pose dependencies, foot-IK raycasts, hair cadence, or CPU timings. Retail camera-away/re-entry, weapon/gear and hardware measurements remain unverified; no Nintendo frame value or gameplay equivalence is inferred. The INKWAVE regressions use offline grounded kid-form bots with the default Shooter and Dualies weapon configurations (no equipped gear or human input in muzzle comparisons); movement/collision parity is checked separately with the native Actor update.

**Why the weapon pose stays live.** `Actor._finishFrame` calls `Character.update` each simulation tick (`inkwave-public/src/game/actor.js:895-940`, `character.js:1183-1189`). Authoritative `WeaponRunner` firing reads the current world transform through `Character.getMuzzle` / `getMuzzleHand` (`character.js:1069-1077`, `weapons.js:710-720, 812-815, 849-858`). Skipping the full pose would stale the weapon bone used for projectile origins. The build adapter therefore retains `_buildPose` and the `_applyPose` path through current pelvis, torso, arm IK, weapon animation, sway, recoil, and muzzle transforms. It skips only the stable grounded leg-joint solve and the later face/hair/tank/jiggle/finger/foot-display tail. Pelvis and planted-foot targets are still calculated before the leg solve; those transforms can influence the muzzle and remain live.

For eligible stable-foot ticks, `_ground` substitutes the same vertical ray (`root.y + 0.55`, length `1.25`) against the level's queried oriented solid blocks. It preserves the native slab intersection, nearest-hit choice, normal and height filters, and root/up-normal no-hit fallback used by `Physics.raycast` plus `Character._ground` (`physics.js:34-66`, `character.js:1373-1387`). Airborne, replanting, invalid-foot, non-kid, local, remote, attract, Range, and forced-LOD states stay full-rate. The first returning mesh's pre-render hook replants/rebuilds at zero delta and refreshes deferred material state before the native submission hook; hair advances only for the current simulation tick (`patches/local-quality/offline-offscreen-budget.mjs`, `adapter.mjs`).

**Native regression evidence.** The focused suite passes 9/9. It covers 30/60/120 Hz clock continuity, scope guards, unchanged native Actor movement/body/ground-collision histories, first-visible recovery, and projectile-origin comparison with the continuously posed control. Shooter world muzzle origins match within `1e-8` on level, sloped, and stepped fixtures; the Dualies left-hand muzzle also matches within `1e-8` (`patches/local-quality/tests/offline-offscreen-budget.test.mjs`). These are deterministic composed-source checks, not a Switch measurement.

**Real-browser camera-away/re-entry workload.** A production build (`5667385728b8`) ran in Headless Chromium 153, WebGL2/SwiftShader, on Tidewater Turf with 8 offline actors (7 bots). The camera was actually pointed away for a 10-second control window and a 10-second budget window. During treatment all 7 bots' `_camFrame` values stayed at 276 while renderer frames advanced; treatment exercised 272 budget ticks, skipped 290 foot queries, 221 decorative pose tails, 247 hair updates, and 272 material updates. Across the measured stable/transition states, Character ground calls produced 605/605 physics raycasts in control versus 55/345 in treatment (84.1% fewer rays per ground call). Treatment `_applyPose` time per call was 0.145 ms versus 0.182 ms, hair integration 0.037 ms versus 0.102 ms per call, and material update 0.0052 ms versus 0.0117 ms per call. The dynamic live-match `Character.update` total was 0.858 ms/call in treatment versus 0.529 ms/call in control; those actor forms/actions and update counts diverged, so this run does not support a whole-match CPU reduction claim.

A paired in-page same-state microbenchmark isolates the visual path: two identical stationary Shooter actors received 30 matched priming ticks and 240 matched 1/60-second ticks, one continuously current and one budgeted. Across all 270 timed calls, `Character.update` averaged 0.590 ms versus 0.424 ms (28.1% lower); `_applyPose` was 54.1 ms versus 24.1 ms, hair 19.8 ms versus 2.9 ms, and materials 3.4 ms versus 0.7 ms. At the subsequent actual return, Inky Vee was rendered with the camera aimed at the actor; the pre-draw catch-up count increased from 0 to 1, `_camFrame` advanced, and the actor was no longer budgeted. Its feet were airborne at capture, so `feetValid` was false; the airborne path remains native/full-rate. This is local software-browser timing, not FPS, power, or device-hardware proof. Detailed counters and setup are retained in `evidence/inkwave-c-resume-20261009/codex1-845-currentmain/offscreen-workload.json` and `scripts/check-inkwave-offscreen-workload.mjs`.

**Remaining verification.** Mobile Performance traces on iPhone/iPad/Android/PWA and a physical Splatoon 3 Ver. 11.3.0 comparison remain unmeasured; no mobile, FPS, wattage, or retail-parity claim is made. Parent-owned broad CI is outside this scoped run. The 30-renderer-frame grace is an INKWAVE policy, not a Nintendo timing value.

## 2026-10-09: Joy-Con / Pro Controller motion input path (#71)

- **S3比較条件と既知範囲:** 対象プロファイルは `patches/splatoon3/profile.json` の Ver. 11.3.0。任天堂の公開Q&Aは、ジャイロ感度を下げると画面の動きが抑えられること、ジャイロをOFFにするとRスティックだけで照準を合わせる操作になることを説明している。公開資料で確認できたのはこの設定上の挙動まで。S3の数値応答曲線、コントローラーごとのセンサー軸・符号・融合方法、入力失効時間は未公開または未確認であり、本実装の一致を主張しない。
- **プロトコル根拠:**
  1. [WICG WebHID](https://wicg.github.io/webhid/index.html): `HIDInputReportEvent.reportId` はレポートID、`data` はIDバイトを除いた `DataView`。`requestDevice()` は transient activation がない場合に拒否される。
  2. [dekuNukem IMU notes](https://github.com/dekuNukem/Nintendo_Switch_Reverse_Engineering/blob/master/imu_sensor_notes.md): IMU frame、LSM6DS3の公称 `0.070 dps/LSB` と `936 / (cal_gyro_coeff - signed(cal_gyro_offset))` の個体別変換式を記載する。
  3. [dekuNukem SPI flash notes](https://github.com/dekuNukem/Nintendo_Switch_Reverse_Engineering/blob/master/spi_flash_notes.md): factory IMU recordは `0x6020..0x6037`、user recordはmagic `B2 A1` が `0x8026..0x8027`、校正値が `0x8028..0x803F`。各24-byte recordのgyro offsetはbyte 12..17、gyro coefficientはbyte 18..23。
  4. [Linux hid-nintendo.c](https://github.com/torvalds/linux/blob/master/drivers/hid/hid-nintendo.c): `0x8026` magicでuser校正を選び、`0x10` SPI read replyからrecordを読み、offsetを引き、scale-offset divisorが0の時は保護する実装を確認した。deku notesの係数式でrad/sへ変換する。
  5. [dekuNukem subcommand notes](https://github.com/dekuNukem/Nintendo_Switch_Reverse_Engineering/blob/master/bluetooth_hid_subcommands_notes.md): output report `0x01` のサブコマンド `0x40` + `[0x01]` でIMU有効化、`0x03` + `[0x30]` で標準フル入力モードを指定。
  6. [任天堂「ジャイロ設定の変更」](https://www.nintendo.com/jp/games/feature/splatoonqa/other/gyro/index.html): 感度を下げた際の画面の動きと、OFF時のRスティック操作を説明。S3の数値曲線やセンサー軸の根拠には使わない。
- **INKWAVE実装と差分:** `patches/splatoon3/runtime/controller-motion.mjs`、`patches/splatoon3/adapter.mjs`。`decodeSwitchMotionReport` はWebHID event contractとDataViewの `byteOffset`/`byteLength`を保ち、wire capture fallbackでは空・短いpayloadを拒否する。`0x30`..`0x33`のみをモーションとして受け付け、`0x21`は校正読み取り用の一時listenerだけが処理する。校正は `0x8026` からmarker+user recordの26 bytesを読み、markerがなければ `0x6020` からfactory record 24 bytesを読む。gyro offset/scaleはsigned little-endianで解析し、各軸を `(raw - offset) * 936 / (scale - offset)` dpsからrad/sへ変換する。不在・NACK・timeout・不正係数ではzero-offsetの公称 `0.070 dps/LSB` へ明示的にfallbackし、toastにも公称fallbackを表示する。現行のGyro 1→pitch、反転したGyro 3→yawは実装上の暫定軸規約で、物理Joy-Con/Pro ControllerやS3との一致は未確認。35 rad/sの上限は公称±2000 dpsセンサー範囲に沿う入力健全性ガードであり、S3値ではない。既定の100ms expiryもINKWAVEの安全上限で、S3値ではない。
- **取得・初期化・ライフサイクル:** Settings > Controls の `_connectMotion` acceptは `api.connectControllerMotion()` → `input.requestWebHID()` → `navigator.hid.requestDevice()` を同じclick handler内で、UI音再生より先に同期的に呼ぶ。出力はWebHID `sendReport(0x01, payload)` 契約に従い、payload byte 0がpacket counter、1..8がneutral rumble、9がsubcommand、10以降が引数。`0x40/[0x01]`、続いて `0x03/[0x30]` を送り、その後はreply `0x21` のack・subcommand ID・echo address/lengthを照合してSPI校正を取得する。open、IMU enable、report-mode send失敗時は既存どおり `initialization-failed` としreaderを公開しない。校正SPIだけ失敗した場合はreaderを有効に保ってnominal fallbackを返す。deviceごとのgenerationに加えpending SPI readをdisconnect/detachでabortし、遅延完了readerを公開しない。再接続では新しい初期化とreaderを作る。接続toastはuser/factory/nominal校正元を表示する。
- **入力所有権と再現操作:** padが接続中で `lastDevice === 'pad'`、マップが閉じている時だけbridge sampleをPlayerControllerへ渡す。正常sampleを適用したtickはstick pitchを二重適用せず、水平stickとgyro yawをINKWAVE内で合成する。touch/keyboard-mouse所有時はreaderを消費しない。操作は Controls の接続リンクからWebHID chooserを開く、選んだdeviceのIMU reportを流す、停止後100msを超えて古いsampleを拒否する、disconnect/reconnectする。現状確認は実際のブラウザ・コントローラーではなく、適用済みmenu accept式とtransient-activation sentinelを使うheadless mockである。
- **プレイへの影響と確認状態:** `controller-motion-source.test.mjs` 14/14 pass。user/factory selector、SPI reply offset、DataView view offset、signed per-axis offset/coefficient、invalid/NACK/timeout fallback、open/enable/report-mode failures、disconnect中のpending read abort、UI fallback toastをsynthetic WebHID mockで確認した。WebHID対応環境向けのINKWAVE motion input pathを追加したが、R stick/gyroの軸所有、感度曲線、静止時bias除去、物理コントローラー操作感についてS3 parityは未確認。headless logic testsは実ブラウザやSwitch実機比較の代用ではない。`inkwave-public/` は未変更。Issue #71は継続中で、全体受入や完了を主張しない。

### #93 Squid Spawn landing target validation (2026-10-09, codex6)

**本家の根拠:** 比較対象は任天堂が現行版として掲載するSplatoon 3 Ver.11.3.0（[公式更新履歴](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/)）。[公式 gameplay page](https://splatoon.nintendo.com/en/gameplay/) はSquid Spawnで発射前にaimし、landing spotを選べることを説明する。任天堂の旧版更新履歴はVer.9.2.0でLemuria Hubのstage edgeを選べた不具合を、Ver.9.3.0でSuper Jump直後のarmor状態がそのSuper Jumpの着地前に終わる不具合を修正したと記録している（[update history](https://en-americas-support.nintendo.com/app/answers/detail/a_id/61257/)）。これらは着地点選択とarmor相の区別を支持するが、現行版の着地物理、armorのHP・持続時間・開始frame、塗りfootprintは公開していない。本修正では小売版の未出典数値を追加・推測しない。

**INKWAVE の実装箇所:** `patches/splatoon3/runtime/respawn-lifecycle.mjs` は目標点を `groundHeight` だけで判定せず、複製したActor状態に公開 `Actor._resolve` を実行して `ground.hit` と位置解決を確認する。これにより、高さ照会は有限値を返すがnative resolverが支持しない急斜面をaim・launch・flight steering候補から除く。touchdownも実Actorの `_resolve` と接地結果を必須とし、外れた場合は偽の着地完了を発行せずnative gravity/collisionへ戻る。landingではarmor timerを新規作成・リセットしない。`#1005`の現行main実装どおり既存profileのamount/durationをlaunch時に開始し、飛行中も同じactor clockで減算する。paint処理は変更せず、着地時の追加paint/scoreも行わない。公開 `inkwave-public/` は凍結。

**再現操作:** テスト用の急斜面は `Level.groundHeight` が有限の高さを返す一方、実際のActor `_resolve` は `Physics.WALKABLE` によって接地を拒否する。#93回帰はこのnative false endpointを直接再現し、aimが前回の支持済み地点を保ち、launch後もその地点を保持することを確認する。別のstale-endpointケースではflight終端で同じnative resolverを実行し、空中のままlanding/paintを確定せず、armorを再開始しないことを確認する。支持済み着地は30/60/120Hzでnative collisionを通す。#1005はlaunch時のprofile値とtouchdown後の未消費時間、networkはlaunch中と着地後のowner armor flagおよびproxyのpresentation-only状態、Rangeは既存の即時respawn経路を確認する。#999のRoller累積penetrationテストも別途維持・実行。

**プレイへの影響:** native足元resolverが支持しない地点への照準や、stale endpointによってlanding扱いになる経路を抑える。launch起点armorの量・残り時間・break条件とpaint/turf creditはこの変更では変わらない。

**確認状態:** 現行main sourceおよびissue #1005の最新コメントを確認し、launch起点のprofile armorを維持する。ロジックとnetwork snapshotのテストはブラウザ描画・Switch実機挙動・オンライン端末間の実測の代用ではない。現行Ver.11.3.0の正確なlanding timing/steering/range、armorの実機数値、Squid Spawn着地paint footprint、full acceptanceは未確認のまま残す。

### #93 Squid Spawn owner handoff (2026-10-09, codex3; integrated with codex6; blocker repair codex2)

**S3 reference and limits:** The Nintendo reference is Splatoon 3 Ver.11.3.0, listed as the latest update on the official support page on 2026-10-09. Nintendo's gameplay page says Squid Spawn lets players aim before entering and choose a landing spot; its update history distinguishes the Squid Spawn armor phase by fixing a case where that armor should end before a following Super Jump lands. These public sources do not describe network-owner handoff or serialize a Squid Spawn phase. No retail multiplayer handoff was measured, so this repair claims consistency with INKWAVE's own #93 lifecycle, not equivalence to unpublished S3 networking. [Nintendo gameplay](https://splatoon.nintendo.com/en/gameplay/), [Ver.11.3.0 update listing](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/), [update history](https://en-americas-support.nintendo.com/app/answers/detail/a_id/61257/).

**INKWAVE implementation and repair:** The pre-first-snapshot repair remains: if `alive=true` and `net.spawnPending=true`, adoption presents that event as a synchronous post-death transition only for ordinary Turf and enters the existing lifecycle, preserving the finalized special gauge. After the first accepted owner snapshot, the existing adoption row carries its tagged `inkwave-squidspawn-v1` extension for the active phase, supported aim/flight target, remaining flight clock, finalized gauge, and JSON-safe infinite aim/landing invulnerability. All supported adoption-row lengths (8–11) now require the sidecar tick to equal its outer owner tick and advance monotonically for the same sending owner. The life and sequence floors remain across a new life and ownership transfer; a newly authoritative owner starts its own tick epoch. Flight remaining is bounded by `SQUID_SPAWN_FLIGHT_DURATION` from the installed lifecycle (60 frames at 60 Hz = 1 second), and flight invulnerability by its installed launch value (1 second + 1e-6); the flight and protection invulnerability fields must agree. These are INKWAVE runtime values, not measured Splatoon 3 values. Adoption restores position, velocity, phase, invulnerability, and the existing armor/protection clock from one newest accepted owner snapshot. The receiver's authoritative owner tick is capped at the newest accepted tick, while displayed position retains NetMatch's existing bounded interpolation/extrapolation. Elapsed time after the last owner packet is unknown, so adoption keeps the clocks frozen at that snapshot rather than aging an unobserved interval; the new owner then advances the installed lifecycle. The remote proxy remains presentation-only. No wire field, protocol shape, public source, profile tuning, or Range/non-Turf path changed; humans-only Range/Cargo disconnects still remove the actor.

**Reproduction, impact, and confirmation:** Reference conditions are an ordinary Turf post-splat human respawn, default fixture gear, and the Shooter fixture weapon; disconnect transfers authority to the remaining CPU owner. The official sources above describe player landing selection and the armor phase, not network transfer. `patches/network-replication/tests/issue-93-squidspawn-handoff.test.mjs` uses the production-composed `NetMatch` and `Actor`, emitted owner snapshots, the receiver's actual update/sampling path, and native stage collision. Aim, flight, and landing continuation pass at 30/60/120 Hz (12/12 total). Controls reject duplicate and late packets with row lengths 8–11, malformed and unsupported endpoints, and impossible 30-second flight/10-second invulnerability; they also accept a real next life and a new owner's lower tick epoch while retaining sequence monotonicity. Flight and landing adoption keep the packet pose and phase/protection clocks together; landing completes through native collision without a second launch, respawn, splat, or armor reset. `patches/network-replication/tests/issue-93-pending-respawn-adoption.test.mjs` and the selected Range/lifecycle tests pass 9/9, including Practice Range and non-Turf controls. The practical change is that owner handoff after a post-respawn snapshot resumes the same INKWAVE Squid Spawn life using its latest known authoritative state.

**Remaining unknowns:** Nintendo's cited official gameplay and update-history pages establish landing selection and distinguish the Squid Spawn armor phase, but do not document multiplayer ownership transfer. If the owner disconnects after its last packet, exact elapsed time between that packet and transfer is not available to the receiver; the implementation freezes lifecycle clocks at the last accepted owner sample and does not claim to age that unobserved interval. The 30/60/120 Hz checks are deterministic source-composition tests, not live browser/peer-network or Switch-console comparisons. Exact current-version armor values, flight frames, and retail handoff behavior remain unmeasured; existing INKWAVE profile values remain project calibration rather than Nintendo measurements.

### #93 Squid Spawn gear continuity (2026-10-09, codex3)

**S3 reference and limits:** The comparison target remains Splatoon 3 Ver.11.3.0. The official gameplay and update-history sources above describe pre-launch landing selection and distinguish the Squid Spawn armor phase; they do not document Quick Respawn history across this respawn route or publish the gear timing curve used here. This correction restores INKWAVE gear-state ownership and makes no new Nintendo gear-parity or frame-value claim.

**INKWAVE route comparison:** At latest main `5d0be6b7`, `patches/splatoon3/runtime/gear.mjs` preserved `quickRespawnHistory` and `splatsThisLife` around native `Actor.respawn()` / `spawnAt()` reset. The #93 Turf `begin()` path called the captured native `spawnAt()` directly, bypassing that wrapper; it restored the finalized special gauge but let `reset()` clear the no-splat history. `begin()` now carries both existing gear fields only for a post-death Turf spawn. Initial spawn and explicit reset still clear them. Special Saver and Quick Respawn formulas, timer values, network fields, flags and public source are unchanged.

**CI failure classification and reproduction:** The clothing tests reused an adoption row at the same simulation tick, then manually raised only its sequence; the receiver correctly rejected it under the owner-tick gate and kept the last accepted clothing bit. They now request a fresh owner `_sendTick()` on the next simulation tick before checking bit 25 separately from Roller bit 24. The respawn tests manually changed gear modifiers on a local actor while the fixture had no saved local loadout, so the real gear wrapper reloaded an empty loadout. The corrected cases use equipped in-memory loadouts and retain strict checks against the actual computed multipliers. For the production regression, conditions are an ordinary Turf human using a Shooter fixture and 10 AP Quick Respawn: take an enemy splat, enter Squid Spawn, FIRE-launch and land through native collision, then take a second enemy splat without a credited splat in between. The existing gear wrapper's reduction remains on authoritative `actor.respawnTimer`, which the HUD samples. This is deterministic source-composition evidence, not a physical Switch comparison.

**Confirmation:** The two exact clothing/network-flag witnesses pass 2/2; retained-gauge, legacy HUD, and the new Squid Spawn gear/timer regression pass 3/3. The focused lifecycle selection (local launch, supported/unsupported touchdown, 30/60/120 Hz timers, armor, HUD and Practice Range) passes 17/17. The #93 owner-handoff and pending-respawn network files pass 15/15. Live browser presentation, retail Quick Respawn timing, and Switch comparison remain unverified.

## 2026-10-09 — Integrated bilateral walking foot clearance (#1176)

Reference conditions: Splatoon 3 Ver.11.3.0 ordinary humanoid walking, weak diagonal input and direction reversals. Nintendo's public update history does not specify joint clearance, shoe-spacing curves or the pairwise solver; these INKWAVE rig calibrations remain unverified against retail hardware. The externally appended #1176 source computes both current-frame feet before one symmetric clearance solve (`runtime/walk-foot-clearance.mjs`, called from `runtime/walk.mjs`). The previous sequential solve could read one foot from the previous frame, causing order-dependent lateral jitter when the shoes crossed. Reproduce through ordinary weak diagonals and reversals with the installed rig; the focused test compares swapped foot order and reflected poses. The correction changes rendered shoe separation only and writes no movement, collision, projectile, ink or weapon clocks. Native rig tests do not establish S3 gait/pose parity or physical-device rendering.

## 2026-10-09 — Combined profile packaging

The newly integrated runtime pushed precache bytes to5,258,543, beyond the existing5,242,880-byte ceiling. The builder now serializes the same parsed `profile.json` without source indentation. All parameters, metadata and source hashes are preserved; emitted assets are independently content-hashed, and the entire profile and runtime graph remain precached. The emitted regression compares every source/emitted JSON field and retains the existing5MiB precache and64KiB worker limits. This is packaging only, with no S3 tuning or gameplay change.
## 2026-10-09 — #1116 weapon-family ordinary jump presentation

**Reference and conditions.** Comparison target: Splatoon 3 Ver. 11.3.0 profile; current INKWAVE kinds: Shooter, Roller, Dualies, Slosher, Splatling, Charger and Blaster. Intended state: ordinary humanoid jump, no sub aim or action timer active. Local test actors use default style with no configured gear modifier; the public shooter clip's gear setup is unknown. Hold/charge presentation is also checked independently. The public animation-name index pinned at [Flexlion/flexlion.github.io @7740d29](https://github.com/Flexlion/flexlion.github.io/blob/7740d29fdded2899a7633e50647736e3723c5e9a/assets/animations.txt) contains `Jump_Shtr00`, `Jump_Rllr00`, `Jump_Mnvr00`, `Jump_Slsh00`, `Jump_Spnr00`, `Jump_Nrml00`, separate `JumpShoot_*` names and `_St`/`_Ed` name forms. The 11.3.0 [WeaponInfoMain class metadata at Leanny/splat3 @7280ff9](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/mush/1130/WeaponInfoMain.json) is used only to cross-check weapon classes. Resource names and class metadata do not establish which retail clip plays in a given input condition or reveal its FSKA/bone curves. The animation-name index lacks family-specific ordinary-jump names for Charger and Blaster; both therefore route to `Jump_Nrml00` as a candidate. Stringer, Brella and Splatana candidates are not selected because those kinds are absent from the current INKWAVE weapon profile.

**INKWAVE implementation.** `patches/splatoon3/runtime/jump-motion.mjs` now snapshots the weapon kind on `trigger('jump')` and selects an actual ordinary-air pose profile in the `_poseAir` presentation layer: Shooter, Roller, Dualies, Slosher, Splatling or a shared Normal fallback for Charger/Blaster. These are distinct local INKWAVE kid-rig foot calibrations. Candidate clip names are diagnostics only; no Nintendo clip is loaded and no per-family Nintendo curve is claimed. The shared takeoff/rise/apex/descent/ground-reach envelopes remain unchanged. Only foot channels are authored by this hook; native weapon carry/hold/charge posing stays with `_poseWeapon`. Existing weapon changes, forms, specials, action timers, death, hiding and landing cancel the private presentation. Local and remote Character playback select the same captured family on the same timeline.

**Reproduction and impact.** `node --experimental-vm-modules --test --test-name-pattern='#1116|ordinary input-driven jump' patches/splatoon3/tests/jump-motion.test.mjs` passes 5/5. The selected checks cover all seven current kinds in non-firing air, six distinct local profiles, the Charger/Blaster shared fallback, weapon hold/charge isolation, action cancellation/no stale pose resume, local/remote parity for Roller and Charger, native IK/grip/muzzle checks, and 30/60/120 Hz gameplay-state controls. The pose changes only presentation: no movement, collision, jump timing, damage, ink, weapon admission/cooldown or packet behavior changed. CPU tests establish local selection and ownership only. Browser/GPU rendering, real S3 runtime resource selection, per-family joint curves, gear variants and Switch hardware parity remain **unverified**. Detailed comparison and limits: [`patches/splatoon3/reference/jump-motion-comparison-2026-10-03.md`](../patches/splatoon3/reference/jump-motion-comparison-2026-10-03.md).

## 2026-10-09 — #1033 Thermal Ink receipt owner after retained-hit routing

Independent production-composition review of9224ee65 found a new-owner ACK could settle one real10HP hit while losing the attacker-private Thermal Ink mark. Send-time owner identity is not the receipt's authority after routing. The tracking wrapper now scopes the actual receipt sender around the existing validated `_hitAck` callback: receipts from an authenticated exact delivered owner may stamp after actor/life/match checks, including a predecessor that applied the same-life hit before transfer. No private tracking field is transmitted. Permanent tests execute production send/NACK rerouting, owner `_hit`/Actor.damage, generated ACK and duplicate receipt handling for both owners; additional controls reject forged senders, zero-damage and stale-life receipts. This is INKWAVE protocol regression evidence; Nintendo's multiplayer protocol and physical two-device timing remain unpublished/unmeasured.

## 2026-10-09 — #1033 ACK-before-snapshot handoff HP

**Reference and conditions.** The project comparison profile is Splatoon 3 Ver. 11.3.0. The composed reproduction uses the Shooter cause label, a 36-point accepted hit, no gear modifier, victim life 5, and owner V leaving after applying and ACKing the hit but before its next 20 Hz actor snapshot. Those are INKWAVE fixture conditions; they do not establish a retail weapon damage value or Nintendo's disconnect/owner-transfer semantics. Retail network behavior for this edge is unpublished and unmeasured.

**INKWAVE implementation.** `patches/network-replication/adapter.mjs` adds victim HP and an owner-local revision to the existing `hit_ack` and actor snapshot row. A handoff starts a distinct revision epoch and carries the departing owner's last same-life `(owner, revision, time, HP)` checkpoint. A delayed ACK from that departing owner merges only the HP change since the checkpoint; a current-owner ACK or snapshot carries its parent checkpoint so either delivery order preserves both owners' accepted damage. Revision and time are compared only within the same owner epoch. Partial or invalid authority metadata is rejected before it can retire the hit receipt, while legacy ACKs with no authority extension keep their existing receipt path. A lethal receipt transfers death without replaying damage; exact hit/life dedupe, NACK retry, death, respawn and Range removal keep their existing owners. No match ID or public source change is introduced.

**Reproduction and impact.** `node --experimental-vm-modules --test --test-concurrency=1 patches/network-replication/tests/issue-1033-handoff-hit.test.mjs patches/network-replication/tests/issue-1033-thermal-handoff.test.mjs patches/network-replication/tests/composed-hit-unit-packet.test.mjs` passes 29/29 composed cases. The new owner-epoch regression applies a 36-point hit under V (revision 1, HP 64), adopts the stale HP 100 snapshot under H, applies another 36-point hit under H (its own revision 1, HP 64), then delivers V's delayed ACK in either order and reaches HP 28. Snapshot reconciliation retains that delayed damage and accepts later HP recovery; an additional handoff case keeps HP recovered after the departing owner's latest accepted-hit watermark. A malformed `hp: 101` ACK leaves both pending receipt records intact and emits no combat confirmation until the valid ACK arrives. These cases also cover exact hit/life dedupe, lethal transfer, respawn, Range removal and once-only Thermal Ink. The selected adjacent `issue-93-squidspawn-handoff` and `issue-93-pending-respawn-adoption` suites pass 15/15, including one-shot Turf Squid Spawn and Range/noBots behavior. All checks use production source composition and in-memory peer fixtures, not live browser peers or a physical Switch comparison. Retail behavior and live transport timing remain **unverified**.

The #1161/#272 combined production gear panel retains both fixed shoes-main abilities. Its isolated DOM/storage fixture now supplies the actual exported shoes-ability list used by the production panel; no assertions or controls are removed.
## #203: ユノハナ大渓谷（Scorch Gorge）ステージ実装（2026年10月9日）

- 本家参照版：スプラトゥーン3 Ver.11.3.0（Ver.8.0.0改修後のナワバリバトル地形）。Inkipediaのコミュニティマップ画像（`wiki-scorch-gorge-turf-war-8.0.jpg`、1280x720）および俯瞰参照（`scorch-overhead.jpg`）を参照。Inkipediaのステージメタデータは2,145p。ただし本家の実機抽出ポリゴンメッシュや正確なCAD座標を本作業では取得していないため、寸法・座標の完全一致は主張しない。
- 比較条件：INKWAVE 座標系における180度点対称ブロックアウト（幅52m × 全長100m、バウンディングボックス [-26, 26] × [-50, 50]）。リスポーン高台（y=3.2）、リスポーンバリア（y=4.2）、自陣広場（y=1.8）、自陣広場中央坂道（z=-22〜-16、y=1.8〜0.0）、左低地ルート（y=0.0）、右高台・狙撃台（y=2.6）、中央谷底床（z=-16〜16、x=-16〜16、y=0.0）、中央タワー（y=2.6、塗れる側面と障害物ブロック）、金網キャットウォーク（y=3.2、grate: true）、谷底側面の落下死境界（既存 PLAYER.fallDeathY=-1.45、変更なし）。
- INKWAVE の変更前：公開版 INKWAVE（`inkwave-public/`）には `tidewater`、`kelpline`、`halyard`、`cargo` の4ステージのみ存在し、`scorch`（ユノハナ大渓谷）は未実装でステージ選択やロジック上に存在しなかった。
- INKWAVE の変更：
  - `patches/splatoon3/stage/scorch-layout.mjs`：Ver.8.0.0改修地形を反映した点対称ステージブロックアウトを作成。足場、坂道、金網（`grate: true`、`paint: false`）、障害物、リスポーン安全バリアを定義。自陣広場中央坂道（z=-22〜-16）と中央谷底床（z=-16〜16、y=0.0）を連続接続し、段差や落下死の隙間が生じないよう構成。
  - `patches/splatoon3/scorch-gorge-adapter.mjs`：ビルド時に `src/world/maps.js` へ `MAP_LAYOUTS.scorch` を追加し（Practice Range アダプタ `adaptRange` の検索フック文字列を壊さないよう追記形式を採用）、`src/config.js` の `MAPS` / `OFFLINE_MAPS` および `src/i18n.js` の日本語ステージ名（`ユノハナ大渓谷`）を登録。
  - `patches/splatoon3/adapter.mjs`：`adaptSource` パイプラインに `adaptScorchGorge` を統合。
  - `scripts/lib/inkwave-build-only-modules.mjs`：ビルドアダプタをランタイム配布から除外するよう設定。
- 再現と確認：
  - 親候補 099a5e09 において、坂道下端（z=-16）と谷底床（z=-14〜14）の間に2単位の隙間があり、(0, 1.8, -24) から +Z 方向へ歩行した実 native Actor が中央谷底直前の (0, -1.4756, -14.3501) で奈落へ落下死する結合不備があった。谷底床を z=-16〜16 に修正して連続接続を確立。
  - `source-fixture.make` のインスタンス自身が持つスタブ `_integrate`（プロトタイプの物理移動を隠蔽）を削除した上で、実 Actor / Physics によるリスポーン地点から中央手前までの全経路走行を Team Alpha（+Z）および Team Bravo（-Z）の双方で 30/60/120 Hz で検証。常時生存・常時接地・点対称性を確認する恒久回帰テストを追加。
  - `patches/splatoon3/tests/scorch-gorge-stage.test.mjs` により 10 項目（ビルドアダプタ冪等性、ステージ・UI 登録、リスポーン安全率、Level 地形標高、谷底落下死、金網仕様、ナワバリ面積、Practice Range 隔離維持、坂道-谷底隙間落下死回帰、両陣営30/60/120Hz実走回帰）を検証し、全10件パス。
  - `patches/practice-range/tests/isolation.test.mjs`（7/7 パス）により Practice Range の排他性・非公開性が損なわれていないことを確認。
  - `scripts/check-inkwave-patches.mjs --quick`（パス）により `inkwave-public/` 凍結と upstream 互換性を確認。
- 遊びへの影響と状態：ステージ選択画面およびローカル/ネットワーク対戦で「ユノハナ大渓谷」が選択可能になり、Ver.8.0.0改修後の高低差・中央タワー・金網ルート・低地迂回路を活用した立ち回りが可能となった。坂道から谷底への移動が途切れることなく安全に進行でき、金網上のインク透過や谷底側面への落下死など基本ルールが機能する。本家の実機 CAD 寸法や細部の装飾メッシュとの完全同一性は未確認（ローカル座標系による誠実なブロックアウト実装）として残す。

## 2026-10-09 — #1033 chained owner ACK reconciliation

**Splatoon 3 comparison.** Reference conditions remain Splatoon 3 Ver. 11.3.0, ordinary online battle, same shooter/victim/life, with the fixture's Shooter cause and no gear modifier. Nintendo's public [online battle guide](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59459/p/897) documents online play but does not describe ACKs, authority transfer or retransmission. This change repairs INKWAVE's owner handoff; it does not claim equivalence to Nintendo's private network protocol or an unmeasured Switch result.

**INKWAVE change.** `patches/network-replication/adapter.mjs` retains up to eight ordered, same-life predecessor checkpoints across transfers. A single predecessor keeps the existing five-field tuple; longer chains use an optional tagged value in the same ACK/snapshot extension. Authenticated predecessor ACKs advance only their matching owner checkpoint and apply only the HP delta since that checkpoint. Current-owner ACKs and snapshots reconcile every checkpoint they carry, preserving locally newer predecessor changes without replacing current HP blindly. Missing legacy metadata keeps its prior path. New-life respawn, Range/removal, bind and dispose clear the retained chain. Thermal Ink stamps once for a matching validated same-life receipt from an exact delivered current or predecessor authority; forged, zero-damage, stale-life and replayed receipts cannot grant or refresh a mark.

**Reproduction and impact.** The production-composed regressions reproduce V→H→C, deliver V's real accepted 36-damage ACK after both transfers, and confirm HP 64 at C and S while settling the combat receipt once. Concurrent V/C hits, packed owner-state snapshots, both ACK orders, stale snapshot replay and duplicated delivery converge to HP 28; cumulative 60+50 damage splats once in either order. The eight-checkpoint bound and legacy tuple parsing are covered. Focused local results: `issue-1033-handoff-hit.test.mjs` 26/26, `composed-hit-unit-packet.test.mjs` 6/6, and `issue-1033-thermal-handoff.test.mjs` 2/2 (34 total). These are deterministic source-composition checks, not live WebSocket or browser reconnection runs. Physical Switch comparison, retail owner-transfer behavior, live transport races, and mixed-version clients that cannot send the new chain remain **unverified**.

## 2026-10-08: HUD look compared with a Splatoon 3 recording

A user-supplied Splatoon 3 recording (Splat Zones, 1280x720 game area) was measured frame by frame.
The special gauge has **23** radial teeth at ~11.9 deg pitch on an arc from 12 o'clock clockwise
to ~272 deg; the upper-left quarter has no teeth. Lit teeth are a fixed yellow-orange (#fac337 centre,
#b56a00 edge), not the team ink. The 23-segment count of the 2026-10-04 entry is confirmed; only the
layout changed from a full ring to the measured arc. (A first pass assumed a full ring and drew 30 teeth;
re-measuring the unlit teeth corrected it.) Quantization and readiness keep their single authority.
The roster uses squid silhouettes, dark splatted icons under a grey X and a flat timer plate; the splat
notice is a bottom bar reading "<name> をたおした！". Touch keeps the SP button as the gauge with the same
position, size and hit area. Presentation only: no special points, costs, timer or match rules change.
In-match type now uses original condensed chamfered timer numerals and an OFL Rounded M+ 1c Black
subset for Japanese HUD text; roster squids get a masked ink shading. Full-gauge appearance, other team colours and Turf War-specific HUD remain unconfirmed. Details:
[the HUD look report](inkwave-s3-hud-look-2026-10-08.md).

## 2026-10-09: squid-form look from Nintendo's official clips

Compared against Nintendo's official clips (`ikahito_pc.mp4`, `s3_howtoplay_move01/02/03.mp4`, hashes in
[the HUD look report](inkwave-s3-hud-look-2026-10-08.md)). The local swimmer in own ink now shows a glossy ink
mound instead of a see-through squid; the drawn squid travels mantle-first with its face trailing (the
third-person camera sees the eyes); on dry ground it lies flat with the eyes up; arms are short and bundled
with two long feelers ending in dark clubs. Presentation only: speeds, acceleration, hop timing, swim
visibility rules and damage are unchanged. No ripped game model or animation data is used. Mound size/wobble
and the dry lift angle are visual calibration; Switch parity remains unverified.

## 2026-10-10: Trizooka lethal water death (#1164)

- 本家の根拠: Splatoon 3 Ver. 11.3.0 (Nintendo, 2026-08-19 NA) の更新内容は Trizooka の弾速（約13%）のみに触れ、Ultra Shot・水没・復活の変更は記載なし。Splatoonwiki の Water は、水に入ったイカ・タコが即座に倒されると記す（シリーズ全体の記述）。特殊による水没免除の記載はない。公開された Ultra Shot の水没判定のフレーム値は未確認。
- INKWAVE 実装箇所: `patches/reliability/special-water-adapter.mjs`（移動後の `_checkWaterHazard`、発射前・発動前の水没判定。PR #1191 で合流済み）、`patches/splatoon3/runtime/kit-trizooka.mjs` の `stepTrizooka`（同一 tick で `stepMovement` より前に volley を出す既存順序）。
- 再現操作: 支持された床で Trizooka を発動し、床のない水域（`groundHeight` が -Infinity）へ `fallDeathY` 未満まで移動する。発射未入力、発射待ちの buffered shot あり、発射中の 3 パターン。`patches/splatoon3/tests/trizooka-water-crossing.test.mjs` で再現。
- プレイへの影響: この項目では挙動を変更していない。試験で既存挙動を固定した。30/60/120Hz と rendering hitch で、水没は最初の固定 tick に 1 回だけ起き、死亡 tick の後に volley は出ない。owner の packet は remote で 1 回だけ適用され、水没によるキル credit は発生しない。
- 確認状態: 自動試験（production composition、FixedClock、ロジック単独）で確認。ブラウザ実動作、実機、複数端末の同期は未確認。境界を跨ぐ tick で移動後判定より前に volley が出る既存順序は、本家の根拠が見つからないため未確認のまま残し、変更していない。Issue #1164 は Open のまま。
## #935: TIME UP で held Charger / Splatling / SUB が release 扱いにならない（2026-10-10）

- 本家の根拠: **未確認**。2026-10-10 に一般 Web 検索（「Splatoon 3 time up held charger splatling release」）を行ったが、試合終了時の held 入力の扱いを示す資料は見つからなかった。Google Drive 検索でも関連ノートは見つからず、ビルド圧縮ファイルのみだった。任天堂公式資料と Inkipedia の試合終了ルールは未確認。Charger / Splatling の通常 release の仕様は、既存の各ブキ項目の範囲に限る。
- INKWAVE 実装箇所: `patches/splatoon3/runtime/turf-finish.mjs` の `captureTurfFinish` が `playing→finish` の一回の境界で `weaponRunner.cancelPendingInput()` を呼び、`neutralizeTurfInput` が現在の intent と前回の `_prevIntent` の fire / sub / jump / squid / special を両方 false にする。変更は commit `04d862c`（PR #868、main の `7ab20b4` に収容）。
- 再現操作（修正前）: オンライン・オフラインの Turf War で FIRE を保持したまま残り時間 0 を跨ぐ。Charger は発射、Heavy Splatling は streaming に入った（`reports/inkwave-finish935-input.md` の旧 runtime 再現）。issue 本文は SUB を保持したままの Splat Bomb の投擲も挙げるが、#410 の current / previous 入力の同時クリアで既に防がれており、本件では対照として扱う。
- 再現操作（修正後）: 同じ操作で、TIME UP 直後に新たな発射・stream・投擲は起きない。通常の playing 中の release は各 1 回。既存の弾・ボム・雲は保持され、クールダウン・ロール状態は変わらない。
- 試験: `patches/reliability/tests/finish935-input.test.mjs` 9 件、合格。30 / 60 / 120 Hz の固定ステップ、オフラインと NetMatch ホスト。加えて、一時停止中に保持した Charger / Splatling / SUB が偽の release を生まず、再開後の実際の release で 1 回だけ作用することを確認（この追加分は保持の確認であり、修正前の失敗を示すものではない）。隣接試験（`turf-finish`、`platform-pending-input`、`charger-cancel-sub`、`charger-squid-cancel-recovery`、`issues-1092-1114-finish-mobile-adoption`）も合格。
- プレイへの影響: TIME UP 後の新たな攻撃は発生しない。一時停止の保持は解放されない。観測のみの点: 一時停止中に実際に指を離した場合、Charger / Splatling の発射と SUB のボム投擲は再開時に行われる。これが本家の仕様と一致するかは未確認。
- 確認状態: ロジックの組み立て試験のみ（VM 上の Match / Actor / WeaponRunner と NetMatch オブジェクト）。実ブラウザ、実機、本家との比較は未実施。CI の最終結果と main への merge は未確認。Issue #935 の close は、本家根拠と CI の確認まで行わない。フォロワー（オンライン guest）の遅延は #838、弾・雲の継続描画は #410 の範囲で別管理。メニュー遷移とフォーカス喪失時の held 保持は、この追加試験では未検証（フォーカス喪失の pending 取消は既存の `platform-pending-input` 試験、#991）。
## 2026-10-10: #907 explicit Turf Map drives the live camera

- Splatoon 3 basis: Nintendo's Turf War guide says to press X to open the map and see each team's ink coverage
  ([Nintendo guide](https://www.nintendo.com/jp/ichikara/av5ja/03_en.html); baseline Ver. 11.3.0). Map open/close
  timing, the map layout and whether movement is locked while the map is held are not published here, so they are not compared.
- INKWAVE implementation: `inkwave-public/src/main.js` `_frame` calls `rig.setMap(...)` from `controller.mapHeld`
  while playing with no menu (upstream line 1057). With the corner minimap OFF, `patches/local-quality/minimap-resource-adapter.mjs`
  keeps the live raster, actor markers and an `expanded: true` HUD frame only while the explicit map is held (PR #1191, merged).
- Regression: `patches/local-quality/tests/explicit-map-rig-907.test.mjs` runs the composed `Game._frame` and checks that held
  Tab/M, pad button 8 and touch MAP (all via `mapHeld`) open `rig.mapOpen`, release closes it, minimap on and off. Menu,
  pause and attract do not open it. Mutation check: removing the `rig.setMap` wiring fails the four held/release cases.
- Reproduction: hold the map control in live Turf War; the camera should swoop overhead. With the corner minimap OFF the
  expanded map should show the current ink raster and teammate markers.
- Play impact: the same held state suppresses FIRE/SUB and enables teammate Super Jump hotkeys, so the map view must match it.
- Confirmation state: source and composed-fixture level only. INKWAVE's easing (0.42 s open, 0.34 s close in `cameraRig.js`) is
  an INKWAVE constant, not a Splatoon 3 value, and is unverified. Real browser on keyboard, pad and touch, and Switch/mobile parity
  remain 未確認. A separate report (#907 comment, 2026-10-07) says movement intent continues while the map is held; it was not
  reproduced here and is not changed by this entry.
## 2026-10-10 — #1178 通常の20Hz owner snapshotの補間（24/30/60/120/144Hz）

- 本家の根拠: なし。Splatoon 3 の通信仕様と遠隔プレイヤーの補間フレーム値は公開されていない。本件はINKWAVE受信側の防御範囲で、移動速度・加速・停止距離などのゲーム数値は変えない。Nintendo 公式資料の数値は使っていない。
- INKWAVE 実装箇所: `inkwave-public/src/net/netmatch.js` の `_tick`（受信とバッファ）、`update` → `_advance` / `_sample`、`applyRemote`。`patches/network-replication/adapter.mjs` で合成。
- 再現操作（試験）: `patches/network-replication/tests/issue-1178-owner-rate-matrix.test.mjs`。所有者が +x へ 2 単位/秒で動き、20Hz（50ms 間隔）・片道遅延 80ms で snapshot を送る。受信側は 24/30/60/120/144Hz で 4 秒進め、1.5 秒後から遠隔 Actor の x を標本化する。結果は 5/5 合格（main 基点の worktree、Node VM fixture）。
- プレイへの影響: 相手の移動表示が描画フレーム数に依らず一定の速度で補間され、後退や停止が起きないことを受信経路の単体試験で確認した。不正な snapshot（`vx: "bad"` など）の拒否は PR #1182 の snapshot guard が担当し、main には未統合。
- 確認状態: 単独の Node 試験。実ブラウザ二端末、relay、Switch 実機の通信は未確認。2 クライアント相当で「不正 snapshot の後に正常 snapshot」を流す試験は、#1182 の guard に依存するため本エントリでは未実施（未確認のまま）。#1178 は解決扱いにしない。
## 2026-10-10: #835 Respawn Punisher and the Tacticooler exception

Reference: Splatoon 3 Ver. 11.3.0 is the acceptance baseline. The Tacticooler rule was checked against Nintendo's
primary source for Ver. 2.1.0 (released 2023-01-17): <https://en-americas-support.nintendo.com/app/answers/detail/a_id/61257>.
Its Special Weapon section says Tacticooler's "Quick Respawn and Special Saver effects will no longer be totally
negated by gear abilities Respawn Punisher and Haunt. The increase in respawn time/special-gauge spawn penalty
effects from Respawn Punisher and Haunt will still occur, to a degree." Inkipedia's paraphrase ("no longer
prevents") is stronger than the primary text and is not used as the basis for any value. Respawn Punisher's
85% Quick Respawn reduction is from Inkipedia, and the Nintendo Ver. 7.2.0 fix that stops Respawn Punisher
applying to a victim who falls or drowns after an RP splat is the basis for the environmental exclusion.

- **Main today (INKWAVE):** Respawn Punisher is a recognised clothing-main ability (`runtime/clothing-gear.mjs`
  `CLOTHING_ABILITIES`, `clothingAbilityAllowed`). `deathGearPenalty` applies the wearer and victim frames and
  Special loss, scales incoming Quick Respawn AP by 0.15 (85% reduction) and incoming Special Saver AP by 0.7,
  and excludes water/fall/out/bounds/void deaths. `tests/clothing-gear.test.mjs` covers the branch, environment,
  Quick Respawn and assist cases; `clothing-gear.test.mjs` plus `haunt.test.mjs` pass 29/29 on this worktree.
- **Tacticooler on main:** the kit is not in the shipped weapon set. `runtime/haunt.mjs:85-87` reads a
  `drink` / `tacticooler` / `cooler` marker and gives that victim full Special Saver AP in the Haunt penalty.
  No gameplay path on main sets the marker; `tests/haunt.test.mjs` #351 sets it directly. `deathGearPenalty`
  has no Tacticooler clause at all.
- **Draft PR #1195 (unmerged, CI pending):** adds an optional `?supportKit=1` Tacticooler with an independent
  57 AP Quick Respawn / Special Saver buff and Respawn Punisher / Haunt composition. It is not on main, and this
  entry does not treat it as verified.
- **Player impact on main:** none in the current public weapon set, because Tacticooler cannot be equipped.
  The only reachable path is the test-only marker.
- **Status:** PARTIAL. Respawn Punisher itself is present on main. The Tacticooler exception is not on main and
  is not applicable in play there. Not verified: the degree of partial negation ("to a degree" is unquantified),
  whether the Ver. 2.1.0 text still holds through 11.3.0 (only excerpts were read), whether the Haunt marker's
  full-AP exemption matches the source (it may be over-exempt), and real-console behavior. No fix was made,
  because any number for the retained fraction would be invented.
## 2026-10-10: #1108 Roller drum-to-wall contact paint while the stick is held

- **Splatoon 3 evidence (Ver. 11.3.0):** The issue cites the wikiwiki system detail page, which says Roller
  contact paint occurs when the weapon physically touches a floor or wall, and that wall paint occurs with
  Left Stick neutral; stick input gates contact damage. The wikiwiki pages returned HTTP 403 to the fetch
  tool in this session, so the wording was not re-read here. The moving-contact paint rule is 未確認.
- **INKWAVE implementation:** `patches/splatoon3/runtime/roller.mjs`. `paintStillWall` now runs whenever ZR is
  held and the drum is supported by a paintable wall (`drumWallTouch`), with or without stick. Stick still
  selects the native stripe and roll-contact damage path. The no-stick case (`stillWall`) still zeroes
  horizontal speed during the native call, so no-stick contact cannot deal damage. The splat lands on the
  wall face (contact point offset 0.025 along the normal), not on a ground projection.
- **Reproduction:** Equip Splat Roller, face a paintable vertical wall, lower the drum against it, hold ZR,
  then (a) keep the stick neutral, or (b) push the stick into the wall. Before this change (a) painted the
  wall, while (b) produced only the ground stripe at drum height (y 0.35) and no wall-face splat. Both now
  produce wall-face splats. Regression tests: `patches/splatoon3/tests/issue-1108-roller-wall-contact-runtime.test.mjs`.
- **Play impact:** Pushing into a wall with stick now paints the wall face. Ink use is unchanged: the native
  displacement cost and the stationary rule still apply, and direct wall contact paint spends no extra ink.
  Whether S3 charges ink for this contact paint is 未確認.
- **Verification status:** Logic-level tests on the production Level, Physics raycast, WeaponRunner and
  `G.paint.splat` hooks. Stationary wall, moving wall, floor rolling and no-contact/remote controls pass.
  Removing the wall paint call fails the stationary and moving tests. Restoring the no-stick-only gate fails
  the moving test. Not verified: S3 moving-contact parity, ink cost per wall splat, wall-surface sampling
  against the original console, drum width and shape against S3 footage, and real-device behavior. Speed-dependent
  side paint is not covered by the new file. Draft PR #1195 carries a stationary-only test for the same issue;
  this change does not modify that PR.
## 2026-10-10 — #992 Splat Dualies 通常発射の塗り（native 所有の確認と回帰）

- **本家の根拠:** 参照版 Ver. 11.3.0、Leanny/splat3 `7280ff9cde8bb1c5dcef46c700c326471584d2e6` の Splat Dualies。PaintParam は WidthHalfNear 1.71 / Middle 1.71 / Far 1.66、DistanceMiddle 1.1、DepthScaleMax 2.24 / Min 1.31、BreakFree 2.24 / 1.12。SplashSpawnParam は SpawnNum 1、SpawnNearestLength 1、SpawnBetweenLength 14、SplitNum 7。SplashPaintParam は WidthHalf 1.55825、WidthHalfNearest 2.18155、DepthMaxDropHeight 3、DepthMinDropHeight 10、DepthScaleMin 1。pinned の PaintParam には DistanceNear/Far と角度・落下高さの閾値フィールドが無い（WebFetch で確認。取得結果は武器名を明示しなかったため、値の一致で同定した）。
- **INKWAVE 実装箇所:** `inkwave-public/src/config.js` の dualies（`inkFlightProfile: 'dualies'`）→ `weapons.js` `_fireRound` → `_configureInkRound` → `inkFlightRuntime.js`。通常発射は native が所有し `trailEvery` は 0 になる。塗り形状は `inkFlight.js` の `paintShape` / `splashPlan` / `splashShape`。Issue 本文の generic trail（trailRadius×0.8〜1.2）は、この native 所有により通常発射では通らない。`weapons-fidelity.mjs` の `fidelityFlightPaintRadius` の dualies 分岐も、同じ理由で通常発射では通らない。
- **再現操作:** 本回帰は論理単独の確認である。fixture 上で `fireDualies` を発射し、`paintShape` / `splashPlan` / `splashShape` を直接評価した。ブラウザの実動作と実機比較は未実施。
- **回帰:** `patches/splatoon3/tests/issue-992-dualies-normal-paint.test.mjs`（7 件）。pinned 値の配線、near 1.71 と far 1.66 の端点、DepthScale の pre-fall / fall 端点、ドロップレットの 1 発 1 滴・14 間隔・7 分割での feet、半径 1.55825 / 2.18155、実発射の native 所有を確認する。
- **プレイへの影響:** 通常発射の塗り幅・深さ・ドロップレットの値は既存の native 実装から変更していない。回帰の追加のみで、塗りの挙動は変えていない。
- **確認状態:** 未確認。以下は pinned データにも INKWAVE 側にも出典が無いため、解消済みとしない。far anchor 20、角度閾値 10〜35、飛行中の高さ閾値 1.5〜10、splash の DepthScaleMax 1.2、7 パターン位相、粒子動力学、break-free 高さ合成。回帰はこれらの未出典値に依存する端点を避けている。PR #1182（a8bead03）の Refs #992 も同じ residual を残す。Issue #992 は OPEN のまま。
## 2026-10-10: wall-start Super Jump charge keeps the wall pose (#904)

- **Reference evidence:** Inkipedia's Super Jump article (community wiki, not version-specific) says an Inkling or Octoling "can also Super Jump while swimming on a wall" and will "stop in place to charge, then jump as normal." Nintendo's Splatoon 3 Ver. 11.3.0 notes (released 2026-08-19) list no Super Jump or wall-charge change; the only wall-related fix is a Squid Surge input issue. No numeric charge time or joint angle is published, so none was taken from a source.
- **INKWAVE implementation:** `patches/splatoon3/adapter.mjs` captures `wallSupport` at admission and `runtime/superjump.mjs::prepareSuperJump()` holds the actor still while the captured own-ink wall is still valid. Native `Actor.superJump()` clears `climbing`, so `anim.form` becomes `squid`. `runtime/superjump-motion.mjs` (`C.update`) now borrows the native `climb` basis with the captured normal for that one update call during a supported charge, then restores `s.form`, `s.wallNormal` and `character.form`. Position, speed, charge time and the support test are unchanged.
- **Reproduction:** ink a vertical wall, enter wall swim, admit a Super Jump while still attached, then sample each fixed tick while `superJumpState.phase === 'charge'`. On HEAD the squid pivot's world orientation rotated 0.00826 rad from the pre-admission wall-cling pose at 30 Hz (INKWAVE's own deviation, not a reference value).
- **Play impact:** before the fix the squid visibly turned away from the wall at admission while the actor was still held against it; with the fix the wall basis holds through the supported charge and releases when support is lost or on launch.
- **Confirmation status:** logic regression only (`patches/splatoon3/tests/issue-904-wall-superjump-charge.test.mjs`, real Actor/Character, fixed clock at 30/60/120 Hz). The 30 Hz pose test fails on HEAD and passes with the fix; the support-loss test is a guard and passes on HEAD too. Neighbouring super jump and wall suites pass. **Unverified:** the official Switch joint curve and angle at admission, the blend frame at charge-to-flight against a clip, live two-browser remote timing (remote uses the existing climb flag and normal; no packet field was added), and support loss during live play.
## #1149 follow-up: Dualies dodge roll inside a hostile Ink Vac cone (2026-10-10)

Reference: Splatoon 3 Ver. 11.3.0, Splat Charger / Ink Vac, Dualies dodge roll (sidestep), no gear, a live
non-firing enemy inside the existing 3D vortex with unobstructed LOS. Primary extraction, pinned to
Leanny/splat3 @7280ff9c: [WeaponSpBlower](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpBlower.game__GameParameterTable.json).
`GameParameters.InhaleParam.PoisonMistForPlayer.SideStepInkConsumeRate = 3.5` (fetched 2026-10-10). The same
extraction has no ordinary tank-drain or movement field inside `PoisonMistForPlayer`.

INKWAVE: `patches/splatoon3/runtime/kit-ink-vac.mjs` `inkVacSideStepScale` and the `WeaponRunner.prototype.tryDodge`
wrapper in `installKitInkVac`. A Dualies owner that is inside a live hostile cone (`inkVacActorContact`: hostile,
alive, not remote, unobstructed) pays `rollInk x 3.5` at dodge admission. The check and payment are both raised by
the surcharge, and ink is restored on refusal. Outside the cone, for allies, behind solid cover, after release, and
for non-Dualies victims, the cost stays at `rollInk` (7 in the public config).

Reproduction: Charger with Ink Vac aims at a stationary Dualies enemy in the cone for 30 ticks, at 30/60/120 Hz
outer frames. The victim has 24.4 ink: the dodge is refused. At 24.5 it is accepted and ink becomes 0. Regression:
`patches/splatoon3/tests/issue-1149-sidestep-vortex.test.mjs`. Before this change, 24.4 ink was accepted (normal cost).

Interpretation and status: the 3.5 rate is sourced. Mapping it onto the INKWAVE Dualies dodge roll is an INKWAVE
interpretation of the field name. It is applied once at admission, matching the existing one-time `rollInk` payment.
Retail behaviour is unverified for: whether the rate is continuous or admission-only, the mist linger after leaving the
cone, and progressive levels. Drain of 12% tank/s and the 60% movement cap remain INKWAVE engineering calibration
(`actorSuppressionStatus` in the calibration object), not Nintendo magnitudes. Contact-charge 1.5/frame (90/s)
remains supported by `ReceiveDamageForPlayer = 15`. Nothing here is a physical-device or retail match claim.
## 2026-10-10: #366 effective-zero music idle (Master=0 residual)

- Reference: none. This is audio resource policy, not a Splatoon 3 gameplay or operation behavior, so no Nintendo value is claimed or compared.
- INKWAVE: `patches/local-quality/idle-adapter.mjs` now calls `setMusicEnabled(master > 0 && music > 0)` in `setVolumes` and in the pre-init path. Before this, only `music > 0` was checked, so Master=0 with Music>0 kept the procedural player, the 25 ms worker, and the interval running behind a silent bus.
- Reproduction (logic level): Master=0, Music=0.5, SFX=1 with a track playing. Expected: 0 players, 0 workers, 0 intervals; `a.play('jump')` does not suspend the context; raising Master resumes the latest track with one worker. Persisted Master=0 starts no track after unlock.
- Evidence: `patches/local-quality/tests/idle-resources.test.mjs` (two `#366` tests; both failed before the change). The local-quality suite has 791 tests, 783 pass, 0 fail, 8 skipped.
- Remaining 未確認: real browser audio, mobile battery/CPU figures, and the Worker/Blob URL cleanup after a synchronous Worker failure (not part of this change).
## 2026-10-10 — Charger 8F〜59F 中間射程の回帰固定 (#514, 残件; Issue は Open のまま)

**本家比較条件:** Splatoon 3 Ver. 11.3.0、Splat Charger（WeaponChargerNormal）、ギア効果なし、通常フィールドの地上射撃。一次資料は pinned commit `7280ff9` の `DistanceMinCharge=9.033`、`DistanceMaxCharge`／`DistanceFullCharge=24.037` の両端点のみ。charge-frame→distance の中間写像フィールドは一次資料に無く、中間曲線は **UNKNOWN**。PR #1195 が引用する wikiwiki の (chargeF-8)/(60-8) 式は二次資料で、本セッションでは HTTP 403 のため取得・照合できなかった。

**INKWAVE の実装箇所:** `patches/splatoon3/runtime/weapons-charger-flight.mjs` の `chargerRangeCharge`（`chargerPartialCharge`、[8/60,1]→[0,1] の線形 band）と `reachFor`。main は既に 8F→9.033、フル→24.037 を満たす（`charger-min-range.test.mjs`）。本変更では実装コードを変えず、中間フレームの回帰試験 `patches/splatoon3/tests/charger-range-frame-samples.test.mjs` を追加した。

**再現操作:** 60Hz 固定クロックで charger を保持し、native `chargeT` が f/60（f = 8, 9, 12, 16, 23, 34, 48, 59）に達した時点で離す。flight job の `range` は `9.033 + 15.004 × (f−8)/52`。同じ式は旧 eased 律（`t<0.2 ? t×1.25 : 0.25+(t−0.2)×0.9375`）と全サンプルで 0.05 以上異なる。

**確認状態:** logic／runtime 測定であり、実機比較ではない。runtime の `chargerRangeCharge` を raw charge に戻すと、既存の 8F 関連試験 4 件と新試験の native 2 件が失敗することを確認し、元に戻した。固定 60Hz シミュレーションのみで確認し、表示レートを変えた試験は追加していない。中間式の本家一次確認、wikiwiki 式の照合、Switch 実機での弾道一致は **未確認**。PR #1195 の中間 source-pin は未マージ（mergeable_state dirty）のため取り込んでいない。全受入条件は満たしていないため #514 は Open のまま。
## 2026-10-10: #878 hidden online host and Turf War clock (Refs, not closed)

Reference: Splatoon 3 Ver. 11.3.0. Sources as cited in #878 (not re-fetched in this run): Turf War timer counts
down from three minutes to zero ([Inkipedia, Turf War](https://splatoonwiki.org/wiki/Turf_War)); disconnect
handling, including the six-second first-minute no-contest case, is in
([Inkipedia, Communication error](https://splatoonwiki.org/wiki/Communication_error)). No disconnect threshold is
used in this change.

INKWAVE: `patches/local-quality/platform-game.mjs` and `platform-lifecycle.mjs` extend the hidden-host clock to
suspend ordering and post-deadline results. The host's hidden deadline (`hiddenHostDeadline`) sets `finish`, then
the native finish delay (`Match.finishDelay()`, the existing 2.6 s or the boss finish value, from
`patches/splatoon3/adapter.mjs`) advances on a timer so the host sends its result without Actor, projectile or
`G.time` catch-up. A visibility notice still reaches the clock when WebGL, freeze or pagehide already owns the
suspend. Both regressions use the real Match/NetSession/NetMatch and an in-process relay.

Reproduction: online Turf War, host tab hidden at about 10 s left for 14 s or 120 s, visible guest. Expected:
host and guest both reach `judge` with the same result, and nothing resumes on show. Before this change, the
hidden host stalled at `finish` with no result, and a host already suspended by WebGL loss stayed `playing`.

Confirmed in harness only: 29/29 hidden-host tests; neighbouring lifecycle, input, clock and finish suites pass.
Unverified: real browser background throttling, OS sleep timing, live relay, Switch disconnect and no-contest
timing, and the policy for a permanently hidden guest. The Turf War result packet timing is not measured against
hardware. Issue #878 remains open.
## 2026-10-10: #846 Squid Surge automatic climb lifetime

Scope: the wall climb after B release only. Charge, armor timing and roll are unchanged. Reference version Splatoon 3 Ver. 11.3.0.

- Splatoon 3 basis: [GameWith](https://gamewith.jp/splatoon3/362219), fetched 2026-10-10, says releasing B starts an automatic climb on the wall, that holding the left stick down cancels it, and that down+B derives into Squid Roll. It gives no duration, speed or top/ink-end rule. The claim that the rush runs to the ledge and bursts there comes from the Gamepur page cited in the issue. Gamepur returned HTTP 403 on fetch, so that claim is not verified here.
- INKWAVE before: the boost countdown (`surge.duration` 0.3 s times charge, 18F at full charge) ended the burst while the actor was still attached to a continuous own-ink wall. Partial repair c9283ef (Refs #846) switched to a native-speed `auto-climb` phase instead.
- INKWAVE now: `patches/splatoon3/runtime/movement.mjs`. While attached, the burst keeps `surge.speed` (charge-scaled; existing values unchanged) and the countdown no longer ends it. The countdown still ends an airborne burst. Arriving at the ledge during the burst fires `squidsurge_top` and the launch. The ink-end launch no longer requires remaining countdown. A held B after the countdown has elapsed still restarts the charge, as before. The `auto-climb` phase is removed.
- Reproduction (fixed 60 Hz fixture, own-ink wall taller than 18F): full charge at 0 AP, release B. At 18F and beyond the actor stays climbing with climbV 15. Reaching the top fires `squidsurge_top` and arms the launch shield.
- Play impact: a full Surge on a tall inked wall keeps its boost up to the ledge instead of dropping to wall-swim speed at 18F.
- Verification status:
  - Logic only: `patches/splatoon3/tests/surge-auto-continuation.test.mjs`. All 10 tests pass with the change; 5 of them fail on main's `movement.mjs`. Raycast and paint are stubbed. No browser run and no real device.
  - 未確認: whether the Ver. 11.3.0 rush keeps the same speed over long walls (constant boost speed to the top is the behavior the issue requests, not a measured curve); the Gamepur top/ink-end statements; whether INKWAVE's away-push detach corresponds to the game's stick-down cancel; real-device feel on tall walls; Switch parity.
  - Not separately tested: the down-stick cancel input mapping (covered only through the native away-push detach).
  - Not on this branch: local commit 97e3e6c (PR #1182 integration) is absent from this worktree. Reconcile at integration.
  - #846 is not closed by this change.
## 2026-10-10: Turf Map enemy disclosure without a team/expiry check (#710)

- 本家の根拠: Inkipedia [Point Sensor](https://splatoonwiki.org/wiki/Point_Sensor) は S2/S3 について「マーク対象の位置を自チーム全員に知らせる」と記載し、マーク（追跡）は約8秒、SP強化時は最大16秒と記す（数値はこのページの記述であり、S3 11.3.0 の実機確認ではない）。同ページは、マーク対象が Turf Map に出るかは記載していない。Inkipedia [Map](https://splatoonwiki.org/wiki/Map) は、敵アイコンが「一定量のダメージ」または「マーキング」で一時的に現れることだけを記し、閾値・期間は書いていない。18ダメージ閾値は既存記録（2026-10-05 項、検証Wiki由来）のままで、今回 wikiwiki は HTTP 403 で再照合できず未確認。
- INKWAVE 実装箇所: `patches/splatoon3/runtime/map-reveal.mjs` の `enemyRevealedOnMap` から、無条件の `s3.revealed === true` 分岐を削除（修正前は、チームも期限も見ずに敵を地図へ載せていた）。`adapter.mjs` の合成ゲート（`mapActorVisible || enemyRevealedOnMap`）と、チーム別・期限付きの `s3.revealedUntil[team]`（`runtime/combat-info.mjs` の `mapActorVisible`）は変更なし。
- 再現（修正前）: `enemyRevealedOnMap({alive:true,hp:100,s3:{revealed:true}},100)` が `true`。main 上で `s3.revealed` や `revealedUntil` を書く経路は見当たらず、実プレイでの露出は確認されていない（潜在的な経路）。
- 修正後の地図表示条件: 味方は常時。敵は (a) 直近の被ダメージで合計18以上（閾値は上記の未確認値）、または (b) マーク側が自チームに設定し、期限内の `revealedUntil[team]`。非生存・リスポーン時は両方とも消える。
- プレイへの影響: 現行 main では、通常プレイの敵表示は変化しない。変化は、将来の索敵実装が無条件フラグを書いた場合に両陣営へ位置が漏れるのを防ぐことだけ。
- 確認状態（ロジック単独）: `patches/splatoon3/tests/map-reveal.test.mjs` 8/8 pass。新規の無条件フラグ試験は、修正前の HEAD 版の `enemyRevealedOnMap` で `true` を返すことを別途確認（fail する）。`score-hud`・`sub-hud`・`private-tracking` 26/26 pass、`hud-snapshots` 8 pass / 1 skip（既存の SKIP）、`check-inkwave-patches --quick` OK。
- 未確認（解消していない）: 本家でマークされた敵が Turf Map に出るか、表示の期間・チーム範囲の実機照合。18ダメージ閾値の公式・実機照合。ポイントセンサー等の発生源（main 未実装。未マージ Draft PR #1195 の内容は main の実装事実として扱わない）。オンライン複製（マーク状態の送受信と非漏洩）。ブラウザでの実動作、本家実機との比較。Issue #710 は開いたままとする。
## 2026-10-10: #258 Slosher sweep angle by group interval

- Reference basis: Leanny/splat3 11.3.0 `WeaponSlosherStrong` at commit `7280ff9cde8bb1c5dcef46c700c326471584d2e6`, `UnitGroupParam`. Group 1 has BulletNum 4, AfterOffsetDelayFrame 1, UnitDelayFrame 0. Group 2 has BulletNum 5, AfterOffsetDelayFrame 2, UnitDelayFrame 4. The sweep law is not in the parameter table. It comes from the public Wiki (splatoon3mix, Slosher family, 薙ぎ払いについて), which the issue read on 2026-10-04 and 2026-10-08. The Wiki returned HTTP 403 to this session, so its wording was not re-read here. As the Wiki describes it, the yaw difference over the last two frames before the swing is accumulated per group firing interval, capped at 10 degrees per 60 Hz tick. Its 130 degree figure is a calculation example, not a measurement.
- INKWAVE implementation: `patches/splatoon3/runtime/weapons-fidelity.mjs`, `Projectiles._push` for slosh bullets. The sweep coefficient is the running sum of each bullet's group AfterOffsetDelayFrame, giving steps 0,1,2,3,5,7,9,11,13. The previous coefficient was the birth frame, 0,1,2,3,4,6,8,10,12. Birth delays, the 4+5 counts, 70/50 damage, speeds and paint are unchanged. Regression: `patches/splatoon3/tests/issue-258-slosher-sweep.test.mjs`. Its new assertions fail on the previous runtime.
- Reproduction: aim turning at the 10 degree per tick cap through the tick before a volley, then fire. The tail group's first bullet now sits 50 degrees from the final aim (was 40), and the last bullet 130 degrees (was 120). Stationary aim still has no sweep. Remote volleys keep turnDelta 0 and receive no reconstructed sweep; this is unchanged.
- Play impact: on a turn, the tail group fans wider. The angular gap across the volley now follows each group's firing interval instead of its birth frame.
- Verification status: Node VM tests only, using the installed WeaponRunner and patched Projectiles at fixed 60 Hz with 30 and 120 Hz render partitions. The angle law (group-interval accumulation and the 10 degree cap) is 未確認 against Nintendo and Switch capture. Browser behaviour and physical Switch comparison are not verified. RandomRotateYBias 0.65 and RandomRotateYDegree 4.5 remain separate 未確認 items (#1022). #258 stays open as a reference and is not auto-closed.
## 2026-10-10: #129 Splattershot flight droplets (takeover, issue #129)

- 本家の根拠: Leanny/splat3 @7280ff9cde8bb1c5dcef46c700c326471584d2e6 `data/parameter/1130/weapon/WeaponShooterNormal.game__GameParameterTable.json` の `SplashSpawnParam` は SpawnNum 1.5、SpawnBetweenLength 9.2、SpawnNearestLength 1.2、SplitNum 8、ForceSpawnNearestAddNumArray [4]。WebFetch で確認（gh API は本セッションで Leanny に未許可）。
- 出典の注意: 同ファイルに `DropSplashNumMax` は見当たらなかった（WebFetch の全文検索要約）。Issue 本文と PR #1190 の「S3 WeaponShooterNormal の DropSplashNumMax = 2」は、この pinned ファイルからは確認できない。1 発 1 個または 2 個は SpawnNum 1.5 の累積からの導出であり、「最大 2 個」の本家側の直接根拠は未確認。
- 本家の参照条件: Splattershot、Ver. 11.3.0、通常弾、射撃者は静止、地形なし（`floor: false`）、発射高 y=40。
- INKWAVE 実装箇所（upstream 固定、変更なし）: `inkwave-public/src/game/inkFlight.js` の `splashPlan`（発数は 1.5 の累積、スロットは first + k×spacing、8 スロット、ordinal 4 は forceNearest）、`inkFlightRuntime.js` の `emitAlong` / `spawnDrop`（飛行の移動距離上で発生）。`patches/splatoon3/weapons-adapter.mjs` の上限 2 は inkProfile が無い場合のフォールバックのみ。
- 再現操作: 通常弾を 8 発連続で発射し、各発の飛沫数と位置を記録する。速度を ×0.5 / ×1 / ×1.5 に変えても同じ。
- プレイへの影響: 1 発あたりの飛沫は 1 個または 2 個、2 個目は 9.2 WU 後ろ。速度を変えても位置は変わらず、出る時刻だけが変わる。
- 確認状態:
  - ロジック単独測定（fixture、`floor: false`）: 8 スロットの発数 [1,2,1,2,1,2,1,2]、移動距離上の位置 first+k×9.2 が 3 つの速度で一致。移動距離は約 52〜62 WU。テスト `patches/splatoon3/tests/issue-129-droplet-cap.test.mjs` の 5 件（新規 1 件を追加）と隣接テスト 21 件が通過。
  - 本家の実機比較: 未実施。飛沫の配置、8 パターンの順序、first の並びは Nintendo 側で未確認。
  - 着弾ペイント（#79）は対象外。
## 2026-10-10 — #1100 Heavy Splatling outer reticle corners

- 本家の根拠: Game8 のバレルスピナー記事のトレーニング場スクリーンショット（768x432、第三者キャプチャ、SHA-256 `150069970f14…`）。外側の集弾マーカーは中央のリングの外側に、水平・垂直の辺を持つ4隅のブラケットとして並ぶ。Inkipedia は外側レティクルが跳躍で広がり回復する集弾表示であると説明する。Nintendo 公式の高解像度画像は未取得。
- 参照値: `patches/splatoon3/reference/splatling-reticle-reference.json`。リング（追跡半径 10.5px）に対する外隅のオフセットは平均 (±29, ±20) px。
- INKWAVE 実装箇所: `patches/splatoon3/adapter.mjs` の `styles/hud.css` 差し替え（Heavy Splatling 用、#871 のシューター用ブロックとは別）。`inkwave-public/src/ui/hud.js` の4本 tick（PR #1190 の成果、`--a` は 45/135/225/315°）は保持する。
- 変更前の差分: 4本の tick が `rotate(var(--a))` で回転したまま配置されるため、L字の角が斜め外向きでなく上下左右を向いた。sp=0 の位置は半径 17px で、チャージリング（半径 21px）の内側かつ斜めの区分 (r 17〜25) と重なっていた。
- 変更後: 4隅のL字を回転させず、外隅を (±(58 + 0.7071·sp), ±(40 + 0.7071·sp)) px に置く（リングに対する比は参照キャプチャ由来、スプレッドの半径方向の速度 1px/単位は既存値のまま）。内側の辺はリングと区分の外側に収まる。
- 再現操作: Heavy Splatling を装備し、接地と跳躍・射撃で集弾値を変えてレティクル DOM を見る。
- プレイへの影響: 外側マーカーの向きと位置（サイズは大きくなる）が変わる。チャージ表示、射撃・集弾の値、塗りは変わらない。
- 確認状態: 単独測定（CSS 変換の数式、回帰テスト `patches/splatoon3/tests/issue-1100-splatling-reticle.test.mjs`）のみ。ブラウザでの描画と本家の実機比較は未実施。未確認: 参照キャプチャの集弾状態（sp との対応）、sp=0 の絶対寸法、ブラケットの線幅と角の丸み、リング半径の本家との対応付け、Nintendo 公式画像による検証。
## 2026-10-10: Slosher 着弾塗りの本家パラメータ対応（#1011）

- 本家の根拠: Splatoon 3 Ver. 11.3.0、Leanny/splat3 コミット `7280ff9cde8bb1c5dcef46c700c326471584d2e6` の `data/parameter/1130/weapon/WeaponSlosherStrong.game__GameParameterTable.json` を直接取得して確認した。Unit 1（BulletNum 4）は先頭 PaintParam で DistanceXZ 5/15、WidthHalf 4.44/3.84、DepthScale 1/1、後続 AfterPaintParam で 8.5/12、1.44/1.92、1.3/1.2。Unit 2（BulletNum 5）は先頭で 2/8、1.2/1.2、1.4/1.4、後続で 2/8、0.96/1.14、1.4/1.4。Unit 0 は BulletNum 0 で発射されない。
- INKWAVE 実装箇所: `patches/splatoon3/weapons-adapter.mjs` の Slosher 着弾分岐が `patches/splatoon3/runtime/weapons-fidelity.mjs` の `fidelitySlosherImpactPaint` で単位・弾順・距離区分の塗り半径と奥行きを選ぶ。今回、同じ最初の `G.paint.splat` を固定 0.2 倍で置換し高低差縮小を消していた二重の `Projectiles.prototype._impact` ラッパーと、未使用になった `slosherImpactPaintSource` を削除した。
- 再現操作: Bucket Slosher を発射し、各弾を平らな地面・始点と同じ高さで、始点から DistanceXZNear と DistanceXZFar の距離（`worldUnitsPerSourceUnit` 1）に着弾させる。修正前は Unit 1 先頭弾の近距離で半径 0.768（3.84 × 0.2、遠距離値）となり、本家値 4.44 にならなかった。修正後は全 9 弾が near/far の本家値に一致する。
- プレイへの影響: 1 発ごとの塗り半径と奥行きが変わるため、塗り面積、泳げる地面、Turf War の得点、スペシャル増加に影響する。ダメージ、当たり判定、弾の軌道は変更していない。
- 確認状態: ロジック単独のヘッドレス回帰（production composition、固定乱数、`patches/splatoon3/tests/issue-1011-slosher-impact-source.test.mjs`）で確認した。修正前は失敗（0.768 != 4.44）、修正後は合格。ブラウザでの実動作と本家の実機比較は未実施。未確認: DistanceXZ の near/far 区間の補間式（現行は線形の近似）、`worldUnitsPerSourceUnit` 1 の換算、高低差縮小の本家側の対応。#978 の足元塗り、中間スプラッシュ、#554 の壁経路は別経路のまま変更していない。
## 2026-10-10: #675 Splat Charger ink debit at the 8F first legal release

- 参照条件: Splatoon 3 Ver.11.3.0、Splat Charger（WeaponChargerNormal）、ギアなし、地上ヒト状態、十分なインク、チャージして release。
- 本家の根拠: Leanny/splat3 固定コミット `7280ff9cde8bb1c5dcef46c700c326471584d2e6` の `WeaponChargerNormal` の `InkConsumeMinCharge` 0.0225（2.25%）と `InkConsumeFullCharge` 0.18（18%）。最初の合法 release は 8F、フル充填は 60F（[Inkipedia Splat Charger](https://splatoonwiki.org/wiki/Splat_Charger) は 8F、2.25%、18% を記載するが、中間の消費曲線は記載しない）。
- 差分（修正前）: 8F の射撃は `max(2.25, 18 × 1/6)` = 3.00% を消費し、本家の最小値より 0.75 タンク%多かった。
- INKWAVE の実装箇所: `patches/splatoon3/runtime/weapons.mjs` の `chargerInkCost`（8F 以前は 2.25%、8F〜60F は経過時間の線形補間、60F で 18%）。`patches/splatoon3/adapter.mjs` のチャージ消費置換（`a.ink - chargerInkCost(w, c, this.chargeT)`）。`patches/splatoon3/profile.json` の `charger.inkMin` / `inkFull`。PR #1190（main `a60306e3`）で導入済み。
- 再現操作: 満タンのチャージャーで主射撃を固定 60 Hz で 8 tick 保持して離す。60F 保持なら 18.0%。Ink Saver (Main) の係数は既存のギア曲線を通して両端に掛かる。
- プレイへの影響: 最速の合法 release の消費が 3.00% から 2.25% になる。タップ撃ち 5 発は 15.0% から 11.25% になる。
- 確認状態:
  - ロジックのみ確認: `patches/splatoon3/tests/issue-675-charger-ink-consumption.test.mjs` 7 件（8F/60F の端点、単調増加、中点、Ink Saver 0/10/57 AP、低インクで負値にならない、8F 未満の release は拒否、30/60/120 Hz で同一）が main で 7/7 pass。
  - 未確認: 8F〜60F の中間曲線が S3 の検証済みパラメータに基づくこと。線形補間は INKWAVE の選択で、本家と一致する根拠はない。Ink Saver の係数値そのものの本家照合も未確認。
  - 未確認: 本家実機での中間消費量の計測、ブラウザ表示、実機比較。本記録はロジック確認であり、実機比較の代用ではない。
## 2026-10-10 — #469 Ink Storm 使用済みゲージの表示（上書き担当）

| 項目 | 内容 |
| --- | --- |
| 本家の根拠 | Inkipedia Special Gauge（コミュニティWiki）: 「使用中は反時計回りに空になるまで減る」、Ink Storm は投擲後にゲージが減り切るまで次のスペシャルを溜められないと記す。どちらも時間・フレーム数は示さない。Ver.11.3.0 の公式更新履歴は本件のゲージ挙動を記述していない（未確認）。 |
| 参照条件 | スプラトゥーン3 Ver.11.3.0、ブキ Ink Storm、ギアなし、Special Power 無し（延長は既存 wrapper の値）。 |
| 480F の出典 | 既存コメント「S3 検証 Wiki, GP0」の一次照合は今回到達できず **未確認**。発動 tick では lock を変えず、投擲後の既存 lock をそのまま投影する。 |
| INKWAVE 実装箇所 | `patches/splatoon3/runtime/storm-effects.mjs` の `stormGaugeFraction()`（lock の残り比率、保持中は満量、リモートは対象外）と `updateStormHold()` の `stormGaugeDuration` 捕捉（投擲後の lock 長）。`patches/local-quality/hud-snapshots.mjs` の `hudFrameSnapshot()` が `frame.special` / `frame.specialActive` に投影し、モバイル転送も同じ値を受ける。既存 lock は `storm-effects.mjs` / `storm-effects-adapter.mjs`（時計と再蓄積禁止）、`storm-power.mjs`（延長）。 |
| 再現操作 | 満タンの Storm を発動。発動 tick は `a.special`=0 のまま、表示は満量（保持中）。投擲後 240 tick で表示 0.5、対照として `specialFrac()`=0。480 tick で表示が消え、充電が再開する。死亡・reset では lock と表示比率が跳ねない。 |
| プレイへの影響 | 発動直後に HUD / モバイルの SP ゲージが空にならず、投擲後の使用中表示が既存 lock に沿って減る。充電量・`specialReady`・ネット送信 charge は変更しない。 |
| 確認状態 | **ロジック確認済み**（実 Actor / Projectiles、fixture、`hudFrameSnapshot` 直接呼び出し）。`patches/splatoon3/tests/issue-469-storm-gauge-display.test.mjs` 4/4 pass。HUD 試験は旧 `hud-snapshots.mjs` で fail を確認。隣接 storm / HUD 試験 pass、`check-inkwave-patches --quick` OK。ブラウザ実動作、2端末通信、Switch 実機での表示曲線・セグメント遷移は **未確認**。 |

未確認・残差:

- 480F の lock 値、表示の比例曲線、セグメント遷移は本家実機と照合していない。表示は既存 INKWAVE lock の投影であり、本家の計測値ではない。
- `actor.special` は発動 tick に 0 のまま（使用済み値を充電値に戻さない設計）。Issue の「発動 tick に gauge を 0 にしない」を権威的な `special` の意味で読む場合は未達で、オーナー判断が必要。
- リモート actor は複製された使用後の時計を持たないため、表示は従来どおり 0 のまま。
- 死亡時の通常ゲージ減少規則と使用後ドレインの関係は、本家実機で未確認。試験では lock と表示が死亡・reset をまたいで継続することだけを確認した。
- 関連 Issue: #322 系の lock、#76（ink tank refill）、#177、#192 は別件として扱い、本記録では変更していない。
## 2026-10-10: #226 Ink Storm rain accounting (calibration only, no gameplay change)

- 本家の根拠: Ver. 11.3.0 の Leanny 抽出値 `CloudParam.RainNum=72`、`RainyFrame.Low=480`（[抽出表](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpInkStorm.game__GameParameterTable.json)）。72 が生成総数、同時管理数、再利用、地面到達、塗り呼出のどれに対応するかは未確認。
- INKWAVE 実装箇所: 計測のみ。`patches/splatoon3/tests/storm-rain-calibration-harness.mjs`、`scripts/measure-inkwave-storm-rain.mjs`。公開版 `inkwave-public/src/game/weapons.js` の `_updateClouds` は残り 0.3 秒の時点で雨の生成を止める。
- 再現操作: 単独の非ゴースト雲（チーム0、(0,5,0) WU、平坦な 64 WU 平面、8 秒）を 30/60/120 Hz の描画刻みで実行。
- 結果（論理計測、描画スタブ、実機ではない）: `production`（adapter 込み、60 Hz 固定時計）は 30/60/120 Hz すべて候補レイ 178。`public-source`（未改変の公開モジュール、描画フレームごとに 1 回の更新）は 172 / 172 / 171。
- プレイへの影響: なし。雨の処理、塗り、数値は変更していない。
- 確認状態: 未確認。実機 11.3.0 での粒子の生成・再利用・地面接触の時刻、対応する塗り分布が必要。`RainNum=72` を候補レイ、塗り呼出、CPU 塗りの必要数とは扱わない。詳細: [雨の会計報告](inkwave-storm-rain-calibration-2026-10-09.md)。
## #647: Tidal Slam の着地確定前にゲージが再充填・再発動できる問題（2026-10-10）

- 本家の根拠: Nintendo の Splatoon 3 Ver. 11.3.0 更新履歴（https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/）は、Triple Splashdown の無敵開始を約 1/6 秒早めたことのみ記載し、ゲージ挙動は記載なし。Inkipedia（https://splatoonwiki.org/wiki/Triple_Splashdown）は、発動中に被弾した場合に満タンゲージの一部が残ることのみ記載し、減少曲線・着地時の残量・ゼロ到達時点は記載なし。Issue #647 本文が引用する攻略 Wiki の検証（発動後に徐々に減少、着地時に 1 セグメント、着地動作の終了でゼロ）は、今回の確認では取得できず未確認。
- INKWAVE 実装箇所: `patches/splatoon3/tidal-slam-gauge-adapter.mjs`（`addTurf` の回復ゲートと `specialReady` に `!this.s3TidalSlamGaugeFinish` を追加）、`patches/splatoon3/issue-484-adapter.mjs`（リモート準備判定の既定分岐にも同じ条件を維持）。着地確定処理は既存の `patches/splatoon3/runtime/tidal-slam-gauge.mjs`（`finishTidalSlamGauge`）。
- 再現操作（修正前の main）: Slam を発動し、インパクトで `specialActive` が解除された後、着地動作中（`hardLand > 0`、`s3TidalSlamGaugeFinish` が残る間）に塗りを加える。使用中の残量が増え、満タンで `specialReady()` が真になり、スペシャル入力で 2 回目の Slam が開始された（`patches/splatoon3/tests/issue-647-landing-gauge-admission.test.mjs` の負例で再現）。
- 修正後: 着地確定までは塗りの統計・イベントは通常どおり加算されるが、残量の回復、準備完了イベント、再発動はいずれも行われない。着地確定後は通常どおり回復・準備完了が起きる。地面のないタイムアウト（void）着地も同じ保持を保ち、被弾時は元の残量だけが特殊節約の対象になる。
- プレイへの影響: 着地の隙に塗っても、Slam の残量が未確定の間は次のスペシャルを撃てない。
- 確認状態: 単独測定のみ（composed Actor を固定 60 Hz で駆動する Node テスト、30/60/120 Hz で同一の回復判定トレース）。本家の実機比較、ブラウザ実動作は未実施。減少曲線、1 セグメントの量（`SPECIAL_GAUGE_SEGMENTS = 23` の解釈）、インパクト時間（Issue 本文が引用する 70F 表記）、着地動作の終了時間、Special Saver の数値は未確認のまま変更していない。#573（無敵タイミング）、#577、#582 は範囲外。
## 2026-10-10: #890 ordinary-jump B hold/release residuals

**本家の根拠.** Splatoon 3 Ver. 11.3.0 では通常ジャンプに B 長押しによる大ジャンプと、小ジャンプ（早い離し）の区別がある。Issue #890 本文が引く Nintendo サポートの更新履歴（a_id/59461）と Squiffer α 検証ページを出典とする。本セッションでは両ページを再取得していない。離しの閾値フレームと上昇曲線は公開されておらず、`patches/splatoon3/reference/curated-numbers.json` にも通常ジャンプの B 長押し閾値・上昇曲線のキーはない（武器別 `JumpHeightFullCharge`、`OpInk_JumpVel` 等のみ）。

**INKWAVE 実装箇所.** `patches/splatoon3/runtime/normal-jump-hold.mjs`。`LEGACY_JUMP_FEEL`（`holdFrames:5`、`releaseRate:0.7`、`provenance:'legacy-approximation'`）は Splatoon (Wii U) `Player00_anim.szs` の 5F 開始クリップに由来する INKWAVE の暫定 game-feel 値で、Nintendo の閾値や物理値ではない。残差の修正は二点。(1) 入場時の離し判定を `released:false` で未消費にし、着地前に 1F だけ押した B の離しを次の上昇 tick で観測する。(2) 人型入場の判定を更新前の form ではなく、更新後に成立したジャンプの serial と form で行う（スクイッドから同一 tick で人型ジャンプが成立した場合を含む）。待機・泳ぎ form の入場と reset は hold 状態を作らない。

**再現操作.** (a) 着地直前（ジャンプバッファ 0.13 s 内）に B を 1F だけ押して離す。(b) スクイッド状態で ZL を離し、同じ tick に B を押す。修正前は (a) の離しが入場時に消費され、(b) では hold 状態が作られず、どちらも長押しと同じ高い軌道になる。

**プレイへの影響.** 通常の 1F タップが、バッファ入場やイカからヒトへの変形直後に長押しと同じ軌道になり、段差・敵インク越えのタイミングに影響する。

**確認状態.** ロジック単独（実 Actor/Physics と full installer、固定 30/60/120 Hz の trace 比較）。修正前の main で新規の native 試験のうち 3 件（バッファ 1F タップ、ヒト化直後の 30/60/120 Hz、同 tick 人型化の hold 状態を検査する試験）が失敗し、修正後は全件成功した。ブラウザ実動作と Switch 実機比較は未実施。S3 の小/大ジャンプの閾値フレーム・上昇曲線は**未確認**のまま。`holdFrames=5` / `releaseRate=0.7` は INKWAVE 暫定値であり、本家値と一致したとは扱わない。敵インク・自インク・武器別ジャンプ上限・コヨーテ 0.12 s の独立試験は本件では未追加で、**未確認**。
Player impact and limits: a depleted Roller round's hit volume (owner capsule via `fidelityPlayerCollision` and world sweep via `fidelityFieldCollision`) now matches the sourced 0.5 scale instead of the full volley's, while its growth timing stays the existing sourced chronology. Normal swings are byte-identical. Remaining limits are recorded, not guessed: the exact per-frame native radius chronology on hardware is unverified; the appended near unit scales only where a composition supplies its birth mark; packet-reconstructed remote rounds without the mark keep the sourced record — remote globs are presentation and the network authority path is unchanged. No browser rendering, two-device network run or Switch capture was performed for this residual.

## 2026-10-09 — Roller break/free impact paint height (#713)

- **Reference and conditions:** Splatoon 3 Ver. 11.3.0, Splat Roller horizontal and vertical flick unit records. Nintendo's [official update history](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/) identifies Ver. 11.3.0 as released on 2026-08-19. Numeric paint fields below come from the pinned [Leanny/splat3 `WeaponRollerNormal` 11.3.0 extraction](https://raw.githubusercontent.com/Leanny/splat3/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponRollerNormal.game__GameParameterTable.json) (SHA-256 `5b423eb35d4cac268a1e4085ec8321d27639ddbfc8f3775bb65696af5c2449c7`, re-fetched live for this record and byte-identical to the retained evidence copy), not Nintendo-published implementation code. Wide units 0/1 carry height fields 1.5 and 10 with break/free depth scales 2.4 and 1.2; vertical units 0/1/2 carry the same raw height fields with scales 1.76 and 1.32, and each copied record in `profile.json` (`weaponsFidelityCompletion.sourceCommit` `7280ff9…`) matches the primary extraction field-for-field. The extraction gives these as raw numeric fields; this record does not convert them to meters or claim a retail world-scale calibration. Gear modifiers were not part of the data comparison.
- **INKWAVE implementation:** the active Roller `UnitParam.PaintParam` stays attached to each projectile. `advanceFidelityProjectile()` and the installed live `_step()` wrapper retain the flight apex (`fidelityMaxY`); `rollerImpactHeight()` maps it to the selector as `max(0, apex − hit.point.y)`, mirroring the frozen public projectile source's `max(0, inkPeak − hit.point.y)` height input (`inkwave-public/src/game/inkFlightRuntime.js::impact()`). Units are resolved per the pinned project scale: `worldUnitsPerSourceUnit=1` (`profile.json`, `calibration.distanceScale` status `inferred`), so the raw anchors compare 1:1 with world Y — an inferred project scale, not an SI-metre claim. Wall-like faces (`|normal.y| < 0.5`) return no height law, matching the public source's fixed wall radius branch, so break/free depth there falls back to the #674 angle selector; explicit fixture/replay heights are gated the same way. Break/free impacts linearly map the raw 1.5→10 anchors to each unit's `DepthScaleMaxBreakFree`→`DepthScaleMinBreakFree`, then combine that reduction with the #674 angle reduction via `max(height, angle)`. **Unsourced laws, stated explicitly:** the linear interpolation curve and the `max` combination are not in any pinned source or measurement — the public shooter-family law instead nests height into the fall low end before mixing by angle (`inkFlight.js::paintShape`), which at shallow incidence would produce no height effect at all; retail Roller composition is unmeasured and Switch capture is required. The change affects only the first impact paint's `stretchAmt`; the #611 phase choice, #674 angle selector, damage, collision record, launch distribution, projectile motion and every non-roller weapon stay as before.
- **Reproduction:** `patches/splatoon3/tests/issue-713-roller-height-depth.test.mjs` covers the raw anchor boundaries and midpoint for both unit records, phase/incidence/height composition without replacing #611/#674, impact-only paint replacement with unchanged damage/collision/position/velocity/size, live `_step()` apex retention, 30/60/120 Hz apex tracking, the wall gate, low/high drop impacts driven through the real trajectory at 30/60/120 Hz — asserted on the fixed-clock CPU mask footprint (low drop wider than high drop) and on the paint-shader input contract (radius/stretch/stretchAmt/seed identical across rates, no browser or GPU render executed here) — and non-roller isolation (a real Splattershot round keeps the native 0.7 stretch and native random radius band while the roller selectors stay inert). A manual Ver. 11.3.0 comparison would use one Splat Roller unit and unchanged gear/surface/impact angle, then compare low- and high-flight break/free landings. No Switch capture was performed here, and the raw thresholds are not translated into physical distances for that procedure.
- **Play impact:** the model produces a longer fore/aft footprint at the low-height end and a shorter footprint at the high-height end; horizontal and vertical units retain their different sourced ranges, and wall impacts keep their pre-#713 angle-only depth. Its exact in-game footprint is not established.
- **Verification state:** re-run on the #713 takeover branch (2026-10-10, Node with `--experimental-vm-modules`): `issue-713-roller-height-depth.test.mjs` passes 9/9; a 14-file Roller neighbor run (`issue-611`, `issue-674`, `issue-411`, `issue-498`, `issue-402`, `issue-423`, `issue-305-depletion-collision`, `weapons-fidelity-source`, `roller`, `projectile-paint-radius`, `roller-wall-replay-unit`, `issue-774-roller-wall-los`, `issue-1108-roller-wall-contact-runtime`) passes 77/77; `scripts/check-inkwave-patches.mjs --quick` reports OK. Against the pre-#713 runtime, the #713 test file fails to load (missing `rollerBreakFreeHeightUnit` export), so it does not pass without the change. A non-Roller `BulletShooterPaintParam` record (`profile.json`, Spinner bullet, `HeightUseDepthScaleMaxBreakFree` 3, no Min anchor) is outside this issue and stays unconsumed. These are deterministic INKWAVE logic checks, not browser-rendering or Nintendo hardware tests. **Switch Ver. 11.3.0 height definition, raw-value unit calibration, interpolation curve, selector-combination behavior and Roller wall-impact paint remain unverified.**
## 2026-10-10 — #735 Ink Storm lower reach: internal bound tested, Splatoon 3 cutoff unconfirmed

- 本家の根拠: Splatoon 3 Ver. 11.3.0 の固定データ（Leanny/splat3 `7280ff9c`、`data/parameter/1130/weapon/WeaponSpInkStorm.game__GameParameterTable.json`、1397 bytes、SHA-256 `86be8a104a6194523223a976c8dd91506bb02e6526465e48ecce6f189001ea0b`）を本セッションで再取得した。`CloudParam` は `DamageRadius` 10.0、`RainyFrame` Low/Mid/High 480/540/600、`RainNum` 72 のみ。落下粒子の `RainParam` は `FreeGravity` 0.02、`FreeAirResist` 0.07、プレイヤー判定半径 `InitRadiusForPlayer` / `EndRadiusForPlayer` 0.0 を持つが、垂直到達距離と粒子寿命の項目はない。Inkipedia（Ink_Storm）の「too far below it」の記述は `Splatoon_2` 節の中にあり、S3 の数値下限は確認できない。
- INKWAVE 実装箇所: `patches/splatoon3/adapter.mjs`（`src/game/weapons.js` の `_updateClouds`）。`inkWaveRainReach = 12` をペイントのレイ長と被弾の下限ゲート `e.pos.y + 1.2 < cloudY - 0.8 - inkWaveRainReach`（cloudY - 14 より下を除外、境界は含む）の両方に使う。これは INKWAVE 内部の整合値で、S3 の数値ではない。回帰テストは `patches/splatoon3/tests/storm-vertical-cutoff-735.test.mjs`（新規）。
- 再現操作（テスト条件）: 雲を全拡大（t=1）、雲中心 y=100、被弾者を水平中心直下に置く。y=86.001（内側）、86（境界）、85.999（外側）。LOS は通過とする。1 tick、または 30/60/120 Hz の描画間隔で 2 秒進める。ゲート行を無効化すると y=40 の被弾者にも被弾する（負の対照）。
- プレイへの影響: この記録の変更でゲームの挙動は変わらない（テストのみ）。現行 main では、雲の中心から 14 INKWAVE 単位より下の相手には storm ダメージが入らない。その 14 単位が S3 の実際の下限かは不明であり、本家との一致は主張しない。
- 確認状態:
  - ロジック確認済み（INKWAVE 内部、ブラウザ・実機ではない）: 新規テスト 3 件（境界、負の対照、30/60/120 Hz の対象判定と積分 24 HP/s）が通過。隣接する storm 回帰 4 ファイル 30 件も通過。
  - 2026-10-06 の既存記録（base `3d8a48d3`、「未実装」）は、現行 main の内部下限ゲートに照らすと古い。履歴として残し、本記録で現況を補う。
  - 未確認: Splatoon 3 の垂直下限の数値。S3 世界単位と INKWAVE 座標の対応（1:1 は仮定）。粒子寿命や落下停止の規則（`FreeGravity` / `FreeAirResist` からは到達距離を導けない）。雲の拡大・消滅に伴う下限の変化（現行ゲートは雲の大きさに連動しない）。実機（Switch）での比較。
  - 未提出ブランチ `inkwave/c-735-codex2-impl12-20261009`（a7a30cd0）と `inkwave/c-735-cl8-work6-20261009`（e375fe08）は docs のみで、コードは含まない。
## 2026-10-10: #952 Heavy Splatling charge-entry ground braking (partial, 未確認)

- **本家の根拠**: Splatoon 3 Ver. 11.3.0 (参照版)。Leanny/splat3 固定 commit `7280ff9c` の `data/parameter/1130/weapon/WeaponSpinnerStandard.game__GameParameterTable.json` の WeaponParam で、`MoveSpeed_Charge` 0.062、`VelGnd_Bias_Charge` 0.9、`VelGnd_DownRt_Charge` 0.05 を確認（raw 取得）。フィールド名は意味を示さない。Splatoon 2 v1.4.0 のパラメータ表（mirayxs/SplatHeX）は `VelGnd_Bias_Charge` を「減速カーブ」、`VelGnd_DownRt_Charge` を「減速遅延」と記す。この表は S2 の世代資料であり、S3 の式の定義ではない。
- **INKWAVE 実装箇所**: `inkwave-public/src/game/actor.js` の `_horizontal` は地上で一般の `PLAYER.runDecel` を使う（変更なし）。`patches/splatoon3/runtime/splatling.mjs` の `installSplatling` が、チャージ中・接地・非ストリーム・非回避・敵インク外の条件でだけ、速度を毎 60 Hz 基準フレームで 0.05 の比例で減らし、`MoveSpeed_Charge × 入力量` を下回らないようにする（#952 takeover、Draft PR #1188 A05 の移植）。`profile.json` の `weaponsFidelityCompletion.weapons.splatling.WeaponParam` から値を読む。
- **再現操作**: 平地・敵インクなし・インク十分。一定の最大入力で走行を安定させ、入力を変えずに ZR を押し続ける。チャージ開始から安定するまでの毎 tick の水平速度を記録する。修正前は一般の走行ブレーキで減速していた。
- **プレイへの影響**: 走りからチャージへ入るときの減速量と開始距離が変わる。角待ち・後退しながらのチャージに影響する。
- **確認状態**: 未確認。(1) 5%/フレームの比例減速は INKWAVE のモデルであり、S3 の式ではない。S2 の「減速遅延」の表記とも一致は確認できていない。(2) `VelGnd_Bias_Charge`（0.9）は定義が公開されておらず未マップ。(3) S3 の 60 Hz 実機速度トレースは未取得のため、本家との一致は主張しない。(4) 確認したのは Node の単独測定（30/60/120 Hz で同一、固定時計の trace）であり、ブラウザ実動作・実機比較ではない。
## 2026-10-10 — #1097 武器クラス別の被弾リアクション（上書き担当による移植）

- **本家の根拠。** 比較対象は Splatoon 3 Ver. 11.3.0（[Nintendo 公式更新履歴](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/)）。公開アニメーション名 corpus（Flexlion `7740d29f`、1387 行、sha256 `8bfe978d…`）には `Damage_Chrg / Mnvr / Rllr / Sber / Shlt / Shtr / Slsh / Spnr / SpnrDownpour / Strn`、`WaitDamage_*`、`WalkDamage_*`（`Blower` を含む）がある。bare `Damage` と `Damage_Blower` の基底項目は無い。武器クラスとサフィックスの対応は命名集合からの推定。ここから確定できるのは名前の分割だけで、抽選規則・関節曲線・フレーム・ブレンドは未確認。Google Drive の関連メモからは #1097 固有の計測は見つからなかった。
- **INKWAVE 実装箇所。** `patches/splatoon3/runtime/weapon-hit-reaction.mjs`（新規）、`patches/splatoon3/adapter.mjs`（`CHARACTER_TIMERS` に `T_HIT` を追加）、`patches/splatoon3/runtime/install.mjs`（composed pose / muzzle adapter の後に配線）、`patches/splatoon3/tests/issue-1097-hit-reaction.test.mjs`、比較記録 [`weapon-hit-reaction-comparison-2026-10-09.md`](../patches/splatoon3/reference/weapon-hit-reaction-comparison-2026-10-09.md)。被弾トリガーのインパルス、`T_HIT`、ダメージ・ノックバック・HP は変更しない。`SHAPES` の値は INKWAVE の局所校正値で、本家からサンプリングした値ではない。
- **再現操作。** 平地で静止・歩行中に同一方向・同一量の非致死被弾を Shooter / Charger / Roller / Dualies に与える。武器クラス間で体幹の差分が共通カーブに潰れないことを fixture で確認する。射撃は layer on/off で muzzle・発射元・乱数消費が一致することを Shooter / Charger / Dualies の 30 / 60 / 120 Hz で確認する。
- **プレイへの影響。** 被弾中の構えが武器クラスごとに異なる。ただし値は INKWAVE 局所であり、本家の被弾姿勢とは一致しない。ダメージ、HP、ノックバック、衝突、射撃タイミング、乱数は変えていない。
- **確認状態。** 確認済み（fixture 層）: 移植後の `issue-1097-hit-reaction.test.mjs` 9/9、`check-inkwave-patches.mjs --quick` 通過、canonical build 成功（precache 5,029,285 / 5,242,880 bytes、余り 213,595 bytes、hit モジュール 5,402 bytes）、近傍の運動・導入試験 7 ファイル（`full-motion-install`、`hit-spawn-motion`、`idle-motion`、`dualies-motion`、`carry-motion`、`charger-postshot-flight`、`form-motion`）50/50 pass。未確認: 本家の damage 選択規則と関節曲線、onset / peak / recovery のタイミング、Blaster の基底クラス、Splatana / Brella / Stringer などのサフィックス対応、死亡（splat）の分離、リモート表示、ブラウザ描画、実機比較。ROMFS・実機キャプチャは本作業では未実施。
## 2026-10-10: projectile falloff frame state (#875)

- 本家の根拠: Leanny/splat3 commit `7280ff9c` の `WeaponSpinnerStandard` DamageParam は ReduceStartFrame 11、ReduceEndFrame 19、ValueMax 300、ValueMin 150（0.1 HP 単位）。この run で raw JSON から再確認した。端点だけで、衝突前後のどちらの年齢を使うかは含まれない。Nintendo 公式更新履歴の確認はこの差分では未実施。wikiwiki の減衰表は HTTP 403 のため再確認できず、版表記は未確認。
- INKWAVE 実装箇所: `patches/splatoon3/adapter.mjs`（インク飛翔の接触ダメージを完了 tick の `p.age` で評価）、`patches/splatoon3/runtime/weapons-fidelity.mjs` の `fidelityDamage`（shooter/dualies/splatling は `floor(age*60)` の完了フレーム。以前の `Math.round` は 7.5F で段階が変わっていた）。
- 再現操作: 静止した 100 HP の対象に Heavy Splatling を発射し、同じ 1F 内で接触位置（swept fraction）を 0.1 / 0.5 / 0.9 に変える。PR #868 時点では 11→12F で 29.8125 / 29.0625 / 28.3125 HP となり、接触位置で値が変わった（#875 の報告値）。修正後は 28.125 HP に固定。
- プレイへの影響: 1F 内の接触位置だけで 1 回の命中値が変わる問題は除かれる。段階の側（完了 tick か衝突前の年齢か）を誤ると 11→12F と 18→19F の命中で 1.875 HP ずれる。
- 確認状態: 単独ロジック試験のみ（実発射 Projectiles から InkFlightRuntime までの回帰、30/60/120 Hz の固定クロック一致）。本家実機との比較は未実施。未確認: (1) 衝突時に完了 tick と前 tick のどちらを使うか、(2) wikiwiki 表の版表記、(3) 生値の 0.1 HP 切り捨ては #261 の別件。対象外として残すもの: roller の DamageRejectRate は `impactT` による連続補間のまま（#875 の範囲外、未修正）。
## #771: Roller horizontal flick and S3 `SwerveRateBySpeed` (2026-10-10)

- 本家の根拠: Splatoon 3 Ver. 11.3.0 の Splat Roller `WideSwingUnitGroupParam`。`SwerveRateBySpeed` は主グロブ 0.05、近傍グロブ 0.1 で、固定版 [Leanny `WeaponRollerNormal`](https://raw.githubusercontent.com/Leanny/splat3/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponRollerNormal.game__GameParameterTable.json) と [Splatalyzer の抽出データ](https://github.com/cengelbart39/Splatalyzer/blob/58568413df7c8bbd3b8d73d377e56ae29785ba18/Sources/Splatalyzer/Resources/weapon-json/WeaponRollerNormal.game__GameParameterTable.json) で一致する。変換則（単位・符号・速度との式）は確認した公開資料には見つからなかった。Splatalyzer のモデル定義は同名のプロパティを宣言するだけで、解説は確認していない。
- INKWAVE 実装箇所: `patches/splatoon3/profile.json` の両 Unit に値はあるが、`patches/splatoon3/runtime/weapons-fidelity.mjs` `configureFidelityFlick()` の横振り分岐（`fan*SpawnWideDegree` の決定的な扇）は `SwerveRateBySpeed` を読まない。基底発射 `inkwave-public/src/game/weapons.js:961` の `(Math.random() - 0.5) * 0.05` は、fidelity 層で上書きされたまま。
- 再現操作: 固定 yaw で全インクの横振りを多数回行い、同じ弾インデックスの発射角を記録する。main では発射角は各インデックスで一定、初速と位置だけが乱数になる（fb6 記録の再現では yaw unique=1、speed unique=6）。
- 検討した実装（未採用）: `719485b3`（rate×(速度−SpawnSpeedBase)、ラジアン）と `8dc17992`（rate×正規化速度偏差、ラジアン）。どちらも INKWAVE の推測則で、本家の変換則ではない。`5a328147` はこの推測則を「未公表の変換則」として巻き戻している。main へは移植しない。
- プレイへの影響: 未確認。推測則を入れると主グロブで最大約 1°（0.05×0.36 rad）の発射角変化が生じるが、符号・単位・式が本家と一致する根拠がない。扇の角度分布、近距離の当たり・塗りの再現性への影響も判定できない。
- 確認状態: **未確認（コード変更なし）**。`SwerveRateBySpeed` の変換則は実機計測（Ver. 11.3.0 で同一 yaw の横振りを多数回発射し、各弾の初速と発射角の相関を記録）が必要。「各インデックスの発射角が一定」が本家でも正しいかは未判定。Roller 横振りの扇そのもの（`SpawnWideDegree`、`SpawnPositionWidth`、`SpawnSpeedRandom`）は既存の挙動を変えていない。
## 2026-10-10: #841 Ink Storm throw HP recovery

- **本家の根拠**: Issue 本文が引用する Wikiwiki「システム詳細仕様」のダメージ回復節（参照版 Ver. 11.3.0 とされる）。被ダメージ後 60F 待機、非潜伏時 0.21 HP/F（12.6 HP/s）、潜伏・味方アメフラシ範囲 100 HP/s、投擲中に回復が止まるという記載はない。この環境では Wikiwiki への WebFetch が 403 となり、数値は再確認できていない。一般 wiki（splatoonwiki.org の HP ページ）は humanoid 12.5 HP/s、潜伏 100 HP/s と記す（S3 固有ではない）。12.6 と 12.5 の差は未解決。Issue の「1.75 HP/F = 100 HP/s」は 60 Hz で 105 HP/s となり内部で食い違うため、味方雨の値は未確認のまま。
- **INKWAVE 実装箇所**: `patches/splatoon3/adapter.mjs` の Actor.update の specialActive 分岐と activation 分岐。Storm では `updateResources()`（`runtime/resources.mjs`）を呼ぶ。HP 回復は `updateHealthRecovery()` が担う。数値は `profile.json` の `resources.regenRate` 12.6、`regenRateSwim` 100。base `5d0be6b7` の時点で投擲窓は既に `updateResources()` を呼ぶ。
- **投擲窓の既存挙動（変更しない）**: `updateResources()` のため、投擲中はインク補充と敵インク接触ダメージも働く。ロジック単独測定では、味方床・インク 50 の 21F で 50.5 → 54.0 に補充し、敵インク上では 21F に約 7.2 HP の接触ダメージを確認。`patches/splatoon3/tests/storm-throwlock-resources.test.mjs`（#624）がこの挙動を固定している。一度 HP のみに狭めて検証したが同テストの 4 件が失敗したため、取り下げた。
- **受け入れ基準との食い違い**: Issue の「投擲中にインク補充・敵地面接触ダメージを追加しない」は、現行 main の #624 挙動と文字どおりには一致しない。どちらを正とするかは本セッションでは決めず、オーナー判断事項として未確認に残す。
- **再現操作**: Storm を発動し、R を離して投擲する。HP 50、被ダメージ後 60F 経過、味方床。21F で +4.41 HP（0.21 HP/F）。`patches/splatoon3/tests/issue-841-inkstorm-hp-recovery.test.mjs` は 30/60/120 Hz の固定 0.3 s 窓での同等性、activation / exit の各 tick が 0.21 HP を 1 回だけ加えること、味方雨で 100 HP/s が重複しないことを検査する。
- **プレイへの影響**: 本変更では挙動を変えない。HP 回復の時間同等性と境界 tick の 1 回適用を回帰テストで固定する。
- **確認状態**: ロジック単独（source fixture と native Actor）のみ。本家の実機比較は未実施。12.6 HP/s の一次資料での再確認、味方雨の 1.75 / 100 の不一致、投擲中のインク補充と敵インク接触ダメージの本家挙動は未確認。
## 2026-10-10: Ink Storm friendly recovery area (#927)

**本家の根拠.** Nintendo の Splatoon 3 Ver. 6.1.0（2024-01-24）公式ノート: 「Damage taken while within the area of effect of your own team's Ink Storm will recover more quickly」、「even when not submerged in ink」。[Ver. 6.1.0 ノート](https://en-americas-support.nintendo.com/app/answers/detail/a_id/61257/) を 2026-10-10 に取得して確認した。参照版は Ver. 11.3.0。回復倍率、雨の成長・fade 曲線、12単位トレースの世界単位換算は公開情報で確定していない。検証Wiki（アメフラシ仕様節）は本セッションで 403 となり再取得できなかったため、Issue #927 のコメント記録に依存する。

**INKWAVE 実装箇所.** 味方の雨での回復率（`regenRateSwim`、潜伏時と同じ）は既存の `runtime/resources.mjs` の `updateHealthRecovery` にある。本件では `runtime/storm-effects.mjs` の味方回復判定 `cloudCoversActor` を、ネイティブ雨と同じ `stormRainContains` / `stormRainScale`（成長・fade の半径、雨の上限、既存の12単位トレース）に揃え、期限は `dur - 0.3` ではなく雨の失効までとした。`adapter.mjs` の native 接触判定も同じ関数を使う。判定則は従来と同一のため、ダメージの挙動は変わらない。

**再現操作（修正前）.** 味方の雨を作り、被弾後の通常の待機時間を過ぎてから、立ったままの味方（潜伏なし）を計測する。成長初期（有効半径 3）の外側、雨のトレースより下、期限前 0.3 秒の位置で、雨がない時の回復率（`regenRate`）ではなく潜伏時の `regenRateSwim` が出ていた。修正後は、ネイティブ接触と同じ半径で判定し、期限まで継続し、トレースより下では止まる。30/60/120 Hz の同一トレースは修正前後とも成立する。

**プレイへの影響.** 味方が雨の外縁（成長・消滅中）や雨の下にいる時の加速が出なくなる。雨の最後の 0.3 秒の加速は残る。敵の雨による回復阻害も同じ範囲になる。ダメージ、塗り、雨の寿命の挙動は変更していない。

**確認状態.** Node の production 合成テスト `patches/splatoon3/tests/issue-927-storm-recovery-area.test.mjs` 5件。修正前の main では 3件が失敗し、修正後は 5件とも成功する。隣接する 15 ファイル（storm・superjump・movement・reliability・local-quality）の 124件も成功。`check-inkwave-patches --quick` は OK。splatoon3 全体のテストは本 session では完走していない（統合後に実行予定）。未確認: Nintendo の回復倍率と成長曲線、12単位トレースの世界単位、ネイティブ雨ダメージが `dur - 0.3` で止まる件（#563 の範囲で未変更）、実機とブラウザでの比較。
## 2026-10-10 — #887 追補: 空中で 70F を超えた Splat Dualies の clock 消去

比較対象は上記 2026-10-09 の #887 entry と同じ Splatoon 3 Ver. 11.3.0 の `WeaponManeuverNormal`（`Jump_DegBiasDecreaseStartFrame=25`、`Jump_DegBiasEndFrame=70`、`Jump_DegBiasMax=0.4`、`Stand_DegSwerve=2`、`Jump_DegSwerve=7.5`）。根拠は固定 Leanny コミット `7280ff9c` の raw table のみで、公開データには空中で 70F を超えた後の挙動が無い。

**旧来の不具合（INKWAVE 側）**: 2026-10-09 の実装は jump bias clock を `grounded` のときだけ消去していた。そのため空中に 70F 以上留まると `Jump_DegBiasMax` から 0 へ下がった bias が残り、fire 時に `Math.random() < 0` が成立せず常に `spreadGround=2` の endpoint を選んでいた。`_spreadDeg()` は clock が有効な間 outer envelope を返すので、HUD（7.5 系）と投射物（2 系）が食い違う経路だった。通常の空中 Dualies は 7.5 endpoint を保つべきという本 Issue の受け入れ条件に反する。

**本追補の変更**: `patches/splatoon3/runtime/weapons.mjs` の clock 消去条件を `grounded` 判定なしで `jumpT >= 70F` に統一した。70F に達した clock は空中でも着地後でも消える。空中で 70F を超えた後は通常の空中 endpoint（`spreadAir=7.5` × bloom）が `_spreadDeg()` と `fireDualies` の両方で使われる。着地後に 70F 未満で着地した場合の clock 継続（初回 grounded tick で 2 に snap しない）は変えていない。同じ形の `s3BlasterJumpT` の消去条件（`grounded` 付き）は Blaster の別 owner のため本追補では変更していない。別途確認が必要。

**再現操作（修正前）**: 通常ジャンプ後に空中に約 70F（約 1.17 秒）以上留まる（高所からの落下など）→ 空中で射撃。修正前は fire 時に 2 endpoint の cone が選ばれた（コード読解による。実機未計測）。修正後は空中で 7.5 endpoint。回帰試験 `patches/splatoon3/tests/dualies-jump-spread-native.test.mjs` の `#887 an airborne actor past 70F ...` は、修正を外すと失敗することを確認した。

**プレイへの影響**: 長い滞空の空中射撃が、修正前は 2° 相当の cone で撃たれていた。修正後は空中で広い cone（7.5 endpoint）のまま。INKWAVE 内で実際にどれだけの滞空が 70F を超えるかは未計測。

**確認状態**: production composed adapter と native Actor / WeaponRunner による固定 60Hz のロジック試験のみ。本家 Switch 実機との比較はしていない。

**未確認（解消済みとしない）**: 空中で 70F を超えた後の本家の bias と endpoint（本追補は INKWAVE 側の整合性として 7.5 endpoint を選んだ。本家仕様ではない）、25F–70F の確率回復カーブ形状、clock の起点が跳躍開始か着地か（INKWAVE は Blaster 既存実装と同じ跳躍開始起点）、jump bias と standing bias の合成則、Action Intensify による `Jump_DegSwerve` 増分の低減、Blaster 側の同種の消去条件の扱い、30/60/120Hz 以外の実機フレーム間隔での見え方。
## 2026-10-10: #512 remote human opening Squid Spawn (Turf War start)

- **本家の根拠**: Inkipedia "Spawner" の Mechanics 節（https://splatoonwiki.org/wiki/Spawner）。出撃前にスポナーで着地点を狙え、開始時に ZR で位置を固定するとスポナーが自動で発射する。飛行中は操作で着地点を変えられる。Nintendo 公式 gameplay ページ（https://splatoon.nintendo.com/en/gameplay/）は取得時 HTTP 503 のため一次確認できず、未確認。参照版は Ver.11.3.0（Issue 記載どおり）。ブキ・ギア・操作条件は個別に記録していない。
- **INKWAVE 実装箇所**: `patches/splatoon3/runtime/respawn-lifecycle.mjs` の `begin()` は、オンラインの remote 人間の初期出撃を即発射せず、オーナーの複製を待つ（`ownerReplicated`）。`syncRemoteInitialSquidSpawn()` はオーナーのスナップショットに載る aim 目標・発射目標・残り飛行時間を受信側へ写し、発射イベントは一度だけ出す。`patches/network-replication/adapter.mjs` は `applyRemote` からこの同期を呼ぶ。Bot の決定的発射は変更していない。
- **再現操作（修正前）**: 2 人以上のオンライン Turf War を開始する。受信側では、他プレイヤーが開始直後に中央前方 7.5 m の仮目標へ発射されてしまい、オーナー側の照準・発射目標と一致しない。
- **論理テスト**: `patches/network-replication/tests/issue-512-remote-initial-squidspawn.test.mjs`（30/60/120 Hz、オーナーと受信側の二端末）。受信側はオーナーの発射まで待ち、照準目標と発射目標を一致して写し、発射イベントは 1 回だけ出る。飛行中の受信側位置はオーナーの発射線上（約 0.002 m）にあり、旧仮目標の線からは約 2.4〜2.9 m 離れる。着地後の位置はオーナーの着地点と一致する（1e-3 m 以内。既存の位置補正が収束した後）。
- **プレイへの影響**: 受信側に見える他プレイヤーの開始位置・発射目標・発射タイミングが、オーナーの操作と揃う。Bot の初期発射は変わらない。
- **確認状態**: 上記は二端末のロジックテストによる単独測定であり、実機同期の代用ではない。オンラインの遅延・欠損下の同期、本家の Bot AI 角度、本家との操作感の比較は未確認のまま残す。Nintendo 公式ページの一次確認も未了。
## 2026-10-10: Haunt (リベンジ) arm lost on ordinary online post-respawn replay (#351)

- 本家の根拠: 既存の #351 記録と同じ。任天堂公式更新履歴（Ver.2.1.0 の復活ペナルティ、Ver.3.0.0 の Haunt 透過表示）と、Splatoon3攻略＆検証Wiki・リベンジの「本人が対象を倒した場合に +45F・SP減少 +15パーセントポイント、味方撃破では追跡解除のみ」。参照版 Ver.11.3.0。新しい本家数値は導入していない。数値は既存の `haunt.mjs` の既定値（45F / 0.15）のまま。
- INKWAVE 実装箇所: `patches/splatoon3/runtime/haunt.mjs`（`networkLife` は受理済みの remote owner life を優先し、`acceptRemoteState` は `haunt:arm` を受理済み life と照合）。元の検証は `Actor.netLife` と比べていた。`inkwave-public/src/main.js:1029` の `G.net.update` → `NetMatch._playEvents`（`netmatch.js:180`）が、`inkwave-public/src/game/match.js:194` の `applyRemote`（`Actor.netLife` を更新）より先に動くため、復活直後の正規 arm が旧 life と照合されて捨てられていた。
- 再現操作: 同一プロセスの二つの NetMatch（JSON 往復）。A のメインをフクのリベンジにし、B が A を倒す → A が復活 → A が生存中の B を倒す。修正前は被害側（B）が SP 100→50、追加復活時間なし。修正後は期待値の SP 35 と +45F（45/60 秒）。
- プレイへの影響: 通常のオンライン対戦（NetMatch 経路）で、復活後にリベンジ発動が成立した被害側の SP 減少と復活時間が欠落していた。ローカル/CPU 戦の挙動は変更しない。
- 適用元: PR #1182 の commit `46e12a8`（head `b08a3abd` は回帰テストの fixture 追随のみ）。`source-fixture.mjs` は installer 戻り値の `installedRuntime` を返すよう更新した（追加プロパティのみ）。
- 確認状態: 回帰 `patches/splatoon3/tests/issue-351-haunt-network-life.test.mjs` 4/4 pass（修正前 0/4）。30/60/120Hz の送信位相、二回復活の backlog（異なる killer）、偽装・未来・過去 mark の拒否、rendered-life のみの対照で arm 欠落を確認。隣接の haunt・respawn・gear・combat-life・network 系の既存テストも pass。ただし、これは同一プロセスの固定クロックによるロジック試験であり、ブラウザ実動作・Switch 実機・本家実機との比較は未実施。
- 未確認（従来どおり留保）: 相打ち・死後弾の発動開始時刻、特殊ギア/ドリンク併用、近距離・潜伏時の透過抑制の校正、本家の総復活時間（#91 の範囲）。
## #1186: same-name ally markers borrowed another actor's weapon and Special readiness

- **本家の根拠（参照版 Splatoon 3 Ver.11.3.0）**: Inkipedia の [Special gauge](https://splatoonwiki.org/wiki/Special_gauge) の検索抜粋では、特殊ゲージは満タンで光り、Right Stick で発動できる。同じ検索で得た Inkipedia の競技ガイド（`Competitive:` 系ページの抜粋。出典ページは特定していない）は、相手の特殊準備を HUD で確認することに言及する。どちらも全文取得はしていない（検索抜粋のみ）。味方マーカーに武器アイコンや準備の光を出す表示そのものの仕様は確認できず、**未確認**。今回の比較は「表示の所有者が正しいか」に限り、数値や枠の校正は対象外。
- **INKWAVE 実装箇所**: `inkwave-public/src/main.js` の味方マーカー投影（`mk.weapon`、`mk.specialReady`）、`patches/local-quality/hud-snapshots-adapter.mjs`（`src/ui/hud.js` の `_updMarkers`）。HUD は投影された値を優先し、武器を描画とアイコン更新の無効化条件に含める。表示名による全 Actor の Map 参照は、旧入力（メタデータなし、Lab）の fallback に限る。
- **再現操作**: 表示名が同じ `Player` の味方 2 人を置く。一方は Charger で特殊準備完了、もう一方は Roller で未準備。同名の敵 Blaster は準備完了。修正前は両方の味方マーカーが Blaster・準備完了として描画された。味方が死亡・復活してマーカースロットが別の同名味方に再利用されると、武器アイコンが古いまま残った。
- **プレイへの影響**: 同名のプレイヤーがいる場合（既定名 `Player` を含む）、味方マーカーの武器アイコンと特殊準備の光が、そのマーカーの味方本人のものになる。ゲームロジック、特殊の数値、タイミング、判定、プールの仕組みは変わらない。Actor の参照は転送されない。
- **確認状態**: ソース合成テスト（本家コードを 6 段の変換後に実行し、Actor と DOM の stand-in、実 THREE で投影）。`marker-owner-metadata.test.mjs` は 5 件中、修正前に 2 件（同名の借用、死亡・復活の再利用）が失敗し、修正後は 5 件すべて成功（旧メタデータ欠落のネガティブコントロールを含む）。隣接テスト（hud-snapshots、ui-actor-lifetime、respawn-navigation、ally-down-marker、hud-sub-snapshots、low-ink-snapshots）は計 74 件成功、2 件スキップ（発出箇所の確認）、失敗 0。ブラウザ、オンライン中継、Switch 実機、本家の味方マーカーの見た目との一致は**未確認**。詳細: [marker owner report](inkwave-marker-owner-1186.md)。
## 2026-10-10: #1090 Ink Vac absorption keeps the attack's own damage across the network

- 本家の根拠: Ver. 11.3.0 の Ink Vac 吸収はダメージ比例（容量は近似 1100 ダメージ相当、Ver.11.3.0 確認記録の値。本セッションでは再取得していない）。Splat/Suction Bomb の 180 は repo に固定した抽出値（`kit-subs.mjs` の WeaponBombSuction DamageMax 1800 raw、sha256 `a64c24c3…`、および `profile.json` の bomb.damageMax 180）。Trizooka の直撃 220 は `kit-trizooka.mjs` の DirectHitDamage 2200 raw。Shooter 本体 36 は既存の武器データ。
- INKWAVE 実装箇所: `patches/splatoon3/runtime/kit-ink-vac.mjs` の `proposeAbsorption`（送信側が sub / special の識別子を付与）と `proposalDamageLimit`（受信側は認証済みの装備 sub / special と既存レジストリの上限だけで判定）。`replayInkVac` の吸収提案の処理で、`sub` / `special` を持たない旧提案は従来どおり本体武器の上限を使う。
- 再現操作: 全 production 組み込みで Suction Bomb（または Splat Bomb）を Ink Vac の吸収範囲に当てる。ネイティブの吸収は 180 を保持するが、修正前の受信側は本体の 36 に切り詰めて加算していた。Trizooka と Ink Vac の放出弾も 220 が本体上限に切り詰められていた。
- プレイへの影響: 他プレイヤーの爆弾・特殊弾による吸収量が、ローカル側と一致するようになる。不正・不一致な識別子、二重指定、未知の特殊は鍵を消費する前に拒否する。吸収容量 1100 と Ink Vac の時間・半径・射撃値は変更していない。
- 確認状態: 回帰試験 `patches/splatoon3/tests/issue-1090-bomb-absorption-authority.test.mjs` 8/8 合格。修正を戻した main の Ink Vac 実装では 7/8 が失敗（1 件は旧経路のハーネス検査）。隣接する kit / Ink Vac / Special のテスト計 105 件が合格、quick の上流・数値確認も合格。30 / 60 / 120 Hz の固定更新で結果は一致。ブラウザ、live relay、Nintendo 実機、Switch との比較は未実施で、容量 1100 の近似値は未確認のまま残る。
## 2026-10-10: Held pad FIRE/SUB across an input-owner change (#1187)

Reference conditions: Splatoon 3 Ver. 11.3.0, Splat Charger / Heavy Splatling / Splat Bomb with SUB aim, no gear effects, stable humanoid, stationary. No first-party Splatoon 3 source describes switching the active input owner mid-charge or mid-aim, so there is no Splatoon 3 behaviour to compare against at this boundary (the browser-side owner model is INKWAVE's own). The reference-side facts used are the existing INKWAVE contract that a platform cancel is not a deliberate release (see #903 / #990 / #991 above) and the W3C Standard Gamepad layout (index 5 = RB for SUB, index 7 = RT for FIRE), which `patches/splatoon3` `player.js` uses as `padButton(5)` and `padValue(7) > 0.3`.

| | Connected pad still holding FIRE / SUB when the active owner moves to keyboard/mouse or touch |
|---|---|
| INKWAVE implementation | `patches/reliability/input-ownership-adapter.mjs` (`_dev` setter records the old pad's held FIRE / SUB in the existing `_holdCancelled` set); the existing `hold-cancel-adapter.mjs` `_cancelHolds` evaluates it in `PlayerController` after the new source's final intent is computed |
| Repro | Hold RT with Charger or Splatling, or hold RB aiming SUB, keep the pad connected, press a key or touch the screen, advance two fixed ticks |
| Before | The owner mask turns the still-held button into a release: Charger fires one shot, Splatling starts its stream and emits one shot, SUB throws one bomb (`pad-owner-cancel.test.mjs` negative control reproduces this) |
| After | The held action is dropped without a shot, bomb, ink spend or cooldown change; cooldown, lock and already-accepted projectiles are retained. A real pad release still fires once. A new mouse hold on the same button continues the action, and its later real release fires once. Pad reacquisition works normally. Outcome is identical at 30 / 60 / 120 Hz fixed-step |
| Play impact | An unintended Charger shot, Splatling stream or bomb throw when the player switches from pad to keyboard/mouse or touch while the trigger or SUB button is still down |
| Verification state | Logic-only: production `Input` / `PlayerController` / `Actor` / `WeaponRunner` composed through the source fixture on the fixed clock (7 cases in `patches/reliability/tests/pad-owner-cancel.test.mjs`). Neighbouring ownership, hold-cancel, pad-handoff and touch tests pass; the 4 emitted-build tests in `input-policy-emitted.test.mjs` are skipped because no `_site` build exists in this worktree. Browser run, Bluetooth/USB controllers, Android/iPad Safari and Switch are not measured |

Known residual: the same-tick check uses the new source's final intent, so a new source that is already holding the same button is treated as continuing. A pad trigger that is physically still down while a touch tap takes ownership is cancelled, not continued, which follows the issue's hold-cancel contract. Pad disconnect and replacement (#1024) are a separate boundary and are not covered here.
## 2026-10-10: #1039 Private Battle host READY after team confirmation

- 本家の根拠: Nintendo Support「How to Start a Local or Online Multiplayer Game」(Splatoon 3, https://en-americas-support.nintendo.com/app/answers/detail/a_id/59459/ , 2026-10-10 取得)。手順は (1) 全員が参加したらプレイヤー1が Ready を選ぶ、(2) プレイヤー1が各プレイヤーのチームを選び「Looks good」で確定、(3) 各プレイヤーが「Ready」を再度選んで対戦を開始。記事は「each player」と書くのみで、ホストが (3) を行うかは明示されていない。ホストを含むという読みは推測として扱い、未確認。参照版は Ver. 11.3.0 (リポジトリの基準)。
- INKWAVE 実装箇所: `patches/splatoon3/lobby-host-team-adapter.mjs` (ホストだけがチームを割り当て・確定、ゲストの team 書き込みを拒否、Turf の `canStart()` は確定済みかつ全員 ready、ホスト自身を含む)。#1039 の残差として `inkwave-public/src/ui/menus.js` の `toggleReady` / `barItems` / 右移動 / `renderBar` の READY 表示を同アダプターで修正。`inkwave-public/styles/ui.css:2159` がホストの READY を非表示にするため、インラインの `display` で Turf のホストだけ表示する。
- 修正前の問題: Turf のホストには READY 操作がなく (CSS で非表示、バーはホストに START のみ、READY キーは `tryStart()` へ転送)、`canStart()` はホスト自身の ready を要求するため、確認済み・全ゲスト Ready でも START が有効にならない。
- 修正後: Turf ではホストが確定後に READY を選べる。確定前の READY はホストもゲストも拒否し、案内を出す。START は `canStart()` を満たすときだけ開始する。Boss は変更なし。
- 再現操作: Turf のオンライン部屋 (2 クライアント)。ホストが部屋を作り、ゲストが参加。ホストが各プレイヤーの A/B を割り当てて CONFIRM TEAMS。ゲストが READY。ホストが READY を選ぶ (修正前は不可)。START。
- プレイへの影響: Turf のプライベート部屋の開始手順。修正前はホストが開始できない。ゲストのチーム変更不可、ホストの割当は既存どおり。
- 確認状態: 自動テスト (`patches/splatoon3/tests/issue-1039-private-host-teams.test.mjs` 4/4、`patches/reliability/tests/` の composition 8/8、`check-inkwave-patches --quick` OK) のみ。ブラウザの実 2 クライアント操作、ボタン配置と見た目、実機での Splatoon 3 との一致は未確認。`scripts/check-inkwave-network-browser.mjs` は未実行。ホストが最終 Ready を行うかどうかは未確認 (記事の文言からの推測)。

## 2026-10-10: teammate already in a Super Jump is a target, and the chain inherits its destination (#412)

- 本家の根拠: Inkipedia「Super Jump」の Multiplayer matches 節に「Jumping to a player that is in the middle of a Super Jump makes the destination match the other player's destination.」とある（2026-10-10 取得）。Nintendo の Ver. 11.3.0 公式パッチノート（https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/）には Super Jump と味方への言及がない。この規則が 11.3.0 で成立するかは未確認。
- INKWAVE 実装箇所: `patches/splatoon3/runtime/superjump.mjs` の `superJumpTarget`（味方が Super Jump 中なら、有限な確定行先 `superJumpState.to` のみを継承。地面スナップショットと空中の `pos` は使わない）、`patches/splatoon3/adapter.mjs` の Actor 受付（`target.superJumpState` の一律拒否を削除）、`patches/reliability/superjump-chain-adapter.mjs`（`player.js` のマップ選択・確認・航法、`hud.js` と `diorama.js` の確認経路、`bots.js` の復活後選択）、`patches/splatoon3/runtime/superjump-destination.mjs`（確定行先の判定）。
- 再現操作: 味方 B が生存したまま Super Jump の溜め中または飛行中に、A が Tab マップ、1〜3 キー、パッド、タッチのいずれかで B を選ぶ。修正前は B が拒否され、修正後は A の行先が B の確定行先と一致する。
- プレイへの影響: 生存中の Super Jump 中の味方を選べるようになる。死亡、敵、自分自身、未確定・不正な座標、確定行先のない旧形式の状態は引き続き拒否する。通常の味方選択と、#362 の通常目標のスナップショットは変更しない。Bot の復活後選択は既存の 50% 判定と順位付けを保つ。
- 確認状態: 実ソースを合成したロジック単独の試験（Actor、PlayerController、HUD、diorama、Bot、30/60/120 Hz の固定刻み）で確認。修正前は新規 11 件中 9 件が失敗。ブラウザでの実動作と本家の実機比較は未確認。溜め中に選べる点は「Super Jump の途中」からの推定で、本家の仕様文はこの区別を書いていない（未確認）。オンラインの遠隔味方は確定行先を受理済みの状態から復元できる場合だけ使い、復元できない場合は拒否のまま（未確認）。
## 2026-10-10: #649 Roller rolling paint width follows ground speed

- Splatoon 3 reference (Ver. 11.3.0): `WeaponRollerNormal` `BodyParam.PaintParam` has `SpeedMax` 0.132 and `WidthHalfMax` 2.8; `WeaponRollParam` has `SpeedNormal` 0.108 and `SpeedDash` 0.132 (Leanny/splat3 at `7280ff9c`, re-fetched and matched). The statement that rolling paint widens with speed and that side splashes paint floor only comes from the issue's cited wikiwiki page, which returned HTTP 403 to this session, so it is not re-verified here. No intermediate speed-to-width curve or numeric value was found in the pinned data or in a web search.
- INKWAVE implementation: `patches/splatoon3/runtime/roller-max-paint.mjs` adds two floor-only `rollFloor` bands whose outer lateral boundary moves linearly from the native body edge at speed 0 to `WidthHalfMax*scale` at `SpeedMax*60*scale`, clamped there (above it, the #189 maximum applies). `patches/splatoon3/runtime/weapons-fidelity.mjs` passes `completion.referenceHz`. The three body bands (`kind:'roll'`, radius 0.62) are unchanged. Roll speeds, dash timing, contact damage width (1.9) and ink-consumption code are not touched.
- Reproduction (logic only, deterministic paint calls): roll on a flat floor at 0.108 (normal), just before the 90F dash, and at 0.132 (dash); compare the outer lateral boundary of the `rollFloor` calls. Expected from this change: low < normal < dash, saturating at the #189 maximum. Stopped and low-ink rolls keep the body-only footprint.
- Play impact: normal-speed rolling now paints side floor splashes; main painted none below `SpeedMax`. The linear shape between the endpoints is an INKWAVE approximation, not Nintendo's curve.
- Status: 未確認. Logic-only regression tests (`issue-649-roller-speed-width`, `issue-189-roller-max-width`, `issue-857-roller-heading`) are the only evidence; this is not a Switch comparison and not a browser run. Still 未確認: the intermediate curve, the zero-speed endpoint (whether any side splash exists at rest), and the retail speed-to-width values. This also changes #189's earlier stance of not guessing a sub-maximum curve (#650): the #189 test now expects five paint calls at 1, 6.48 and 7.8 instead of three. The change follows the owner's #649 takeover directive and is recorded as a choice, not as a resolved difference.
## 2026-10-10: #287 右スティック感度のリセット経路（−5…+5 の既定値）

- 参照条件: Splatoon 3 Ver. 11.3.0、Standard Gamepad の右スティック、TV/Tabletop と Handheld の独立 profile。
- 本家の根拠: Inkipedia の Options 項目（splatoonwiki.org/wiki/Options、oldid=729360、2026-08-23 更新確認）に、Right Stick Sensitivity が「−5 から 5」と記載。既定値、ゲイン曲線、度/秒の値は記載なし。Nintendo サポートの Ver. 11.3.0 ページは今回再取得していない。
- INKWAVE 実装箇所: 設定 UI は `patches/local-quality/aim-profile-adapter.mjs`（−5…+5、0.5 刻み）。係数は `patches/splatoon3/runtime/pad-sensitivity.mjs` の `s3PadMultiplier = 2^(v/5)`（暫定、本家の曲線は未抽出）。既存設定の移行は `patches/splatoon3/pad-sensitivity-adapter.mjs`。
- 残っていた不具合: 初回起動の移行後に「RESET TO DEFAULTS」を二回押すと、legacy 既定値 `1.0` が S3 設定 `+1` として active profile に保存された（handheld は 0 のまま、再読込でも戻らない）。暫定曲線では `2^(1/5)` 倍の本来と異なる感度になる。修正は `inkwave-public/src/ui/menus.js` の `setSettings({ ...DEFAULT_SETTINGS })` 境界で legacy 値を `legacyPadToS3` で変換し、`padSensitivityScale: 's3'` を書き込むこと。`inkwave-public/` は変更しない。
- 再現操作: 初回起動 → 設定 → コントロール → RESET TO DEFAULTS を二回押す → 右スティック感度の表示と保存値を確認 → 再読込。
- プレイへの影響: 既定に戻した直後の右スティック旋回が、設定 0 ではなく +1 相当になる（暫定曲線での差）。
- 確認状態: 回帰試験 `patches/splatoon3/tests/issue-287-settings-reset.test.mjs` は修正前に 2 件とも失敗（`1 !== 0`）、修正後に成功。`pad-sensitivity` 5/5、`aim-profile` ほか隣接 22/22、`check-inkwave-patches --quick` OK。ただし、S3 の実ゲイン曲線、設定 0 の校正、−5/0/+5 の旋回速度トレースの一致、実機・ブラウザでの操作感は未確認で、#287 は閉じない。

## 2026-10-10: #384 paused quality change redraws the invalidated sun shadow once

- 本家の根拠: 比較対象外。影の更新や描画負荷について、Splatoon 3 の検証済みの実装・数値は確認していない（ブラウザ側の描画資源の欠陥で、ゲームの挙動・ロジックには当たらない。本家の影更新を推測しない）。
- INKWAVE 実装箇所: `patches/local-quality/idle-adapter.mjs` の `Game._frame` の一時停止時の描画。一時停止中に無効化を受けた描画の直前だけ `sm.needsUpdate = true` にし、描画後に `false` に戻す。`applyRuntimeWorldQuality`（`world-quality.mjs`）が破棄した太陽光シャドウを、その一回の描画で再作成する。
- 再現操作: オフラインの対戦を一時停止し、設定で画質または影を変更する。修正前は、無効化された太陽光シャドウが再作成されず `sun.shadow.map` が null のまま残る。
- プレイへの影響: 一時停止中に画質・影を変えると、影はその時の一回の描画で更新される。無変更の一時停止では描画を止めたままで、ゲームの時間・判定・数値は変わらない。オンライン一時停止は変更しない。
- 確認状態: Node のテスト。本家コードを変換して実行し、同梱の実 THREE の `WebGLShadowMap` と ShadowCache の非 WebGL2 経路を使う（描画の状態は stand-in）。`idle-attract-budget.test.mjs` の #384 試験は修正前に 30 Hz / cache=false で失敗し、修正後は 5/5 合格。隣接する 5 ファイル計 64 件は 63 合格、1 件 skip。未確認: 実 WebGL2 の深度描画、ブラウザの実画面、GPU 負荷、iOS / Android の実機での発熱と電池消費。Issue #384 は open のまま。
## 2026-10-10: network paint admission (#522)

Network-integrity guard, not a Splatoon 3 numeric comparison. No Nintendo or Leanny value is used.

- Splatoon 3 basis: none. The radius ceiling is INKWAVE's own largest splat producer, Tidal Slam centre `5.2 * 0.72 = 3.744` (`inkwave-public/src/config.js`, `actor.js` `_slamImpact`). It is a sanity bound, not a balance claim. 未確認 against Splatoon 3.
- INKWAVE implementation: `patches/network-replication/adapter.mjs` `readPaintOrder` and `paintTeamAdmitted` (`PAINT_RADIUS_MAX`, `PAINT_VICTIM_BURST_RADIUS`).
- Reproduction: a remote `s` row with radius above 3.744, a non-finite Float32 value, an unknown kind, or an invalid face selector used to paint. A non-host row whose team differs from every squid the sender owns used to paint. Now both are dropped before sender sequence or causal clock is reserved.
- Admitted foreign-team case: only the victim death burst (radius 1.7, no kind, stretch or face). The host is not team-checked, since it owns Boss ink.
- Play impact: legitimate producers in `issue-522-paint-numeric-admission.test.mjs` are still admitted. A member can still forge the death-burst signature, and no action provenance exists, so #522 stays open.
- Confirmation: logic and fixture-network tests only (`issue-522-paint-numeric-admission.test.mjs`, 7 tests). Not browser play, GPU output, or live multiplayer. Action provenance for every paint producer and the life/session epoch remain 未解決.

## 2026-10-10: #253 Neutral inked-wall cling descent

- **Splatoon 3 evidence (Ver. 11.3.0 reference):** The issue cites a player's 2023 wall-control explainer (note.com, のらまに「今週のスプラ豆知識：壁の活用方法！」), which says that while clinging to a wall with no stick input the squid keeps sliding down and emits no spray. This session did not re-open that page, and the search did not surface it. The qualitative "descends with no input" claim stays as cited by the issue. No measured speed, acceleration or start delay exists in any source found here. Leanny/splat3 at `7280ff9c`, `data/parameter/1130/misc/SplPlayer.game__GameParameterTable.json`, showed no climb or wall-slide key in a summarised fetch, only the `WallJumpChargeFrm_*` wall-jump charge entries; a raw-table check is still open. A Google Drive search returned no wall-descent measurement. Speed curve, start delay and the terminal value are 未確認.
- **Correction to the earlier takeover basis:** the PR #1190 comment said the descent followed "S3 wall-cling spec" with -0.9 WU/s. That value had no source. The code comment already labelled it provisional, so the basis is now stated as provisional calibration.
- **INKWAVE implementation:** `patches/splatoon3/runtime/movement.mjs`, the `_updateClimb` wrapper's `neutralCling` block. The terminal speed and acceleration moved from literals to `profile.json` `movement.neutralWallSlide` (`terminalSpeed` 0.9 WU/s, `acceleration` 3.6 WU/s^2), registered in `reference/numeric-status.json` and in the `calibration.unverified` list. The timer caps at `terminalSpeed / acceleration`, so 60 Hz results are unchanged. The descent is also suppressed while `state.roll` (wall roll) is active.
- **Reproduction:** own-ink vertical wall, ZL held, stick neutral, B not held. Fixture numbers in INKWAVE internal units, with no floor in the mock: vertical speed -0.06 at tick 1, -0.9 at tick 15 (0.25 s), height 5.0 to 4.88 at 15F, 4.21 at 60F, 3.31 at 120F. Cling stays on. Held B, stick input, wall roll, top-edge exit and paint loss do not receive the neutral descent.
- **Play impact:** a neutral wall cling now slides down at the provisional speed instead of freezing. Release of ZL, stick input and B charge are unchanged. The descent speed and start delay will differ from Switch until measured.
- **Verification status:** Node VM fixture tests only, `patches/splatoon3/tests/issue-253-wall-climb-descent.test.mjs` (6 tests). Coverage: real coordinate descent through `_integrate`, identical results at 30/60/120 Hz via `FixedClock`, wall-roll guard (fails without it), and charge, top-edge and paint-loss exclusions. Browser run and Switch 11.3.0 comparison are not done. The terminal speed 0.9 WU/s, acceleration 3.6 WU/s^2 and the start delay are 未確認. #253 stays open and is not auto-closed.
## 2026-10-10: Heavy Splatling brake and free states after 8F (#378)

- 本家の根拠: Ver.11.3.0 の Heavy Splatling の一次データは Leanny/splat3 固定コミット `7280ff9` の `WeaponSpinnerStandard`
  の `MoveParam` で、`GoStraightToBrakeStateFrame` 8、`GoStraightStateEndMaxSpeed` 1.5105、`SpawnSpeed` 1.05 を確認した。
  同ファイルの `MoveParam` には `BrakeAirResist`、`BrakeGravity`、`FreeAirResist`、`FreeGravity`、`BrakeToFreeVelocityY`、
  `BrakeToFreeStateFrame` が見当たらない（WebFetch による抽出のため、字句検索による再確認は未実施）。ブレーキ減衰 0.36、
  ブレーキ重力 252 u/s²、自由抗力 0.02、BrakeToFreeVelocityY -9 は Issue 本文の引用と既存の INKWAVE 既定値（`inkFlight.js` の `motionDefaults`）に依拠しており、
  Ver.11.3.0 の値としては未確認。
- INKWAVE 実装箇所: 実飛行は `inkwave-public/src/game/inkFlight.js` の `advanceInkFrame`（`p.inkPhase`）が進める。
  `patches/splatoon3/runtime/weapons-fidelity.mjs` の `advanceFidelityProjectile`（`p.fidelityPhase`）は、
  この弾では呼ばれない。`fidelityMove` は離散到達判定（`simulateSplatlingReach`）と `profile.json` 由来の値で共有される。
- 修正: 生存中の Heavy Splatling 弾の `_step` 後に `p.fidelityPhase` を `p.inkPhase` へ同期した。実飛行の挙動は変えていない。
- 再現操作（60 Hz、最小チャージ、初速 1.05 u/f、水平、障害物なし）: 1〜8F は 1.05 u/f の直進。9F で 0.672 u/f（x 0.64）、
  12F で vy < -9 u/s となりブレーキから自由へ遷移（この条件は 12F で成立し、前回分類の 13F とは異なる）。13F は自由状態。
  充電最大（2.1 u/f）は 9F で 1.5105 u/f に抑えられてから 0.96672 u/f になる。30 Hz と 120 Hz は 60 Hz と同じ値を
  8F・10F・12F 等の境界で示す（`patches/splatoon3/tests/issue-378-splatling-brake-state.test.mjs`）。
- 基準コミット `404c66c` の Issue 本文が述べる 9F の 1.036 u/f（汎用ドラッグ）は、main では再現しなかった（単独試験で 0.672 u/f）。
  main の実飛行は `inkFlight` のブレーキ状態で既に動いており、残差は `fidelityPhase` 状態の不整合が中心。
- プレイへの影響: 実飛行の速度と軌道は変えていない。`fidelityPhase` を読むのはローラーの着弾深さだけで、
  Heavy Splatling 弾の見た目や当たりは変わらない（実機記録との比較は未実施）。
- 確認状態: 単独の固定ステップ試験（ロジック単独）で確認。実機（Switch）の同じ操作による比較は未確認。
  ブレーキ減衰、ブレーキ重力、BrakeToFree 条件、自由抗力は本家パラメータで確認できなかったため未確認のまま。
  充電依存・乱数の初速（#252）と直進 8F の判定は本件の対象外。
## 2026-10-10: #1179 online Boss hit admission (Refs #1179)

- 本家の根拠: なし。Boss 戦はINKWAVE独自のオンライン機能で、スプラトゥーン3に対応する仕様はない。本家との比較は対象外とし、数値も本家から導出していない。
- INKWAVE 実装箇所: `patches/local-quality/boss-hit-adapter.mjs`。`src/boss/boss.js` の `remoteHit` / `applyDamage` / `_hitCrab` に、有限・正値・2000以下の内部不変条件、攻撃者の生存、対戦状態の検査を追加。`src/net/netmatch.js` の `_acceptBossHit` は攻撃者の生存を確認してから replay 番号を消費する。crablet 分岐の shell 判定は本体への命中だけに限定。
- 再現操作: ゲストが `bhit` の `d` に -20、0、`"-Infinity"`、NaN、2500 を送る。死亡した攻撃者の正規の値も送る。修正前は 2500 が 2000 に丸めて適用され、死亡攻撃者の値はリプレイ番号を消費していた。
- 2000 の根拠: 旧 `remoteHit` の `Math.min(…, 2000)` を上限として維持した。コード内で宣言された最大ダメージ定数は 180 で、1回の最大は 180 × 2.5（weak）× 1.25（stunned）= 562.5 と算出される。これはINKWAVE内のコードからの算出で、スプラトゥーン3の数値ではない。
- プレイへの影響: 正規のホストとゲストの間では値は変わらない想定。改造クライアントの不正な値は拒否され、Boss とクラブレットの HP が無限・負にならない。Boss の数値、武器倍率、ダメージ計算は変更していない。
- 確認状態: ノード VM 試験（`boss-hit.test.mjs` 9件、`boss-crablet-shell-admission.test.mjs` 4件、計13件）PASS。修正を外した対照では 10/13 が FAIL。周辺 local-quality 試験 36件 PASS。未確認: ホストとゲストのブラウザー＋リレー統合、実際の2端末での通信。
## 2026-10-10: #433 LOW/mobile neon halo canvases

- 本家の根拠: なし。描画資源の解像度と寿命だけを変更し、スプラトゥーン3の挙動・操作・数値の比較対象ではない。Ver.11.3.0 の Online lobby の見た目も今回は計測していない。
- INKWAVE 実装箇所: `patches/local-quality/lobby-resource-adapter.mjs` の `adaptLobbySet()`。公開版 `inkwave-public/src/game/lobbySet.js` の `_neon()` が作る neon halo 2枚（INK & SKATE、squid sign）は `this.halos` に入り、LobbySet の寿命中保持される。`lobbySet-tex.js` の `neonHalo()` は未変更。
- 問題: 前回の LOW atlas 上限（15c19ac8）は4 atlas だけを対象にしていた。halo 2枚は LOW/mobile でも既定の 180 px/m のまま作られ、Online を離れるまで保持される。
- 変更: LOW のみ `pxPerM` を 90 にする。halo の blur、線幅、canvas 寸法は pxPerM に比例するため、解像度の比例縮小になる。rect（メートル単位の幾何）は不変。HIGH/MEDIUM は既定値（180）のまま。
- 再現操作（手順のみ、今回の実行はなし）: LOW 設定または touch 端末で Online hub を開き、`__inkwave.showcase.lob.set.halos` の texture の image 寸法を確認する。修正前は LOW でも HIGH と同寸法。
- プレイへの影響: LOW の Online lobby の看板グローの解像度だけが下がる。看板の形・位置・点灯、ゲームの挙動は変えない。
- 確認状態: `patches/local-quality/tests/lobby-resources.test.mjs` 7/7、`issue-472-lobby.test.mjs` と `texlib-stage-pack.test.mjs` 計18/18。試験は native `neonHalo` を Canvas2D stub で実行し、寸法式と LOW の約1/4画素を確認した。合成ストロークの寸法を使っており、実際の sign の寸法は未計測。実ブラウザ描画、反復 Online の GPU 常駐量、LOW/mobile の実機予算、メモリ回収、看板の見え方の実機レビューは未確認のまま残す。`drawGraffiti` の一時 canvas（矩形サイズ、描画中のみ確保）は変更していない。
## 2026-10-10 — #272 Stealth Jump 超ジャンプ標識の隠蔽（上書き担当）

### 本家の根拠

- Ver. 11.0.0 の Stealth Jump 飛行延長（距離依存、飛行のみ、最大約1秒）は Issue 本文が引用する Nintendo の更新履歴・解説に基づく。本セッションでは一次資料を再取得していない。
- 固定版 Leanny `splat3@7280ff9c` の `SplPlayer` は `ExtraMove_FrmMax = 60`、`ExtraMove_DistXZMax = 100`。`SuperJumpSign_Hide` の KindLimit は Shoes と 2026-10-09 の記録にある（今回は再照合していない）。Issue 本文の headgear 記載は、この記録に従い shoes main を正とする。
- 標識を敵から隠す効果は trait 名 `SuperJumpSign_Hide` に基づく。隠れる範囲（リング・カウントダウン・目的地のどこまでか）は未確認。

### INKWAVE の実装箇所

- `patches/splatoon3/issue-460-marker.mjs`: `superJumpSignHiddenFrom(jumper, viewer)` を追加。Stealth Jump 装備者の標識は対立チームの視聴者に隠す。視聴者が不明な場合も隠す（目的地を漏らさない保守的選択）。本人と味方には隠さない。
- `patches/splatoon3/issue-460-adapter.mjs`: 公開版 `src/game/actor.js` の所有者側飛行で、着地リングをこの判定で抑止し、カウントダウンの `concealed` に同じ判定を渡す。
- `patches/splatoon3/runtime/superjump.mjs`: 飛行延長の 60 / 100 unit 閾値と線形曲線を「検証済み」から「未確認」へ訂正（挙動は不変）。

### 再現操作と結果

1. オフラインまたは Bot 戦で、クツ メインの Stealth Jump 装備者が超ジャンプし、対立チームの視点で着地標識を見る。修正後は標識とカウントダウンを出さない（ロジック単独テスト。実機未確認）。
2. 同じ着地を味方の視点で見る、または本人が見る。修正後も標識は出る。
3. ネット対戦で遠隔の Stealth Jump 使用者の標識は隠れない。遠隔 Actor に loadout が複製されないため判定できず、`netmatch.js` の着地リングは未変更。

### プレイへの影響と未確認事項

- オフライン・Bot 戦の所有者側の標識隠蔽のみ配線した。ネット対戦の敵視点では目的地が漏れる（未対応）。
- 飛行延長は `level.stealthJumpFoci` が無い限り 0 のまま（fail-closed）。距離座標アンカーは未公開で、推定で埋めない。
- 60 / 100 unit 閾値と線形曲線は未検証。60F の上限のみ固定版データに対応する。
- 隠蔽の見た目の範囲、Switch 実機、対戦での時間比較は未確認。

### 確認状態

- `node --experimental-vm-modules --test patches/splatoon3/tests/issue-272-sign-concealment.test.mjs` — 5/5（新規）。
- `node --experimental-vm-modules --test patches/splatoon3/tests/issue-460-marker.test.mjs patches/splatoon3/tests/issue-460-gauge.test.mjs patches/splatoon3/tests/issue-272-stealth-jump.test.mjs patches/splatoon3/tests/superjump-hp-recovery.test.mjs` — 22/22。
- ブラウザ実動作、ネット対戦、本家実機比較は未実施。
## #999: Roller grouped damage and Squid Spawn armor (2026-10-10)

- 本家の根拠: Splat Roller の中心フリックは 150 ダメージ（攻略Wiki のスプラローラー項）。Squid Spawn アーマーは耐久 30、単発 100 超の攻撃で `damage - 100` が貫通、接地敵インクは素通し（攻略Wiki のアーマー仕様項、Nintendo Ver. 11.3.0 更新履歴）。Issue 本文の出典URLを引用した。この会話では出典ページを再取得していない。
- 数値の状態: `reference/numeric-status.json` の `spawnArmor.hp` / `maxAbsorb` / `breakDelay` は「calibration or derived value」で、本家の確定値として扱わない。`profile.json` の該当箇所は、破壊後 20F の遅延について「別の公開資料は最大 0.5 秒と記す」と未解決を残している。
- INKWAVE の実装箇所: `patches/splatoon3/runtime/weapons.mjs` `applyGroupedProjectileHit`（通常弾）と `runtime/weapons-fidelity.mjs` `applyFidelityProjectileHit`（fidelity 接触）。invulnerable により拒否された Roller 寄与は group の最大値を消費しない。`runtime/respawn-lifecycle.mjs` `absorbSpawnDamage` は main の `bd9b65b4` で導入済みで、同一 group の貫通を 1 回だけ数える。
- 再現操作: 無敵中の 90 接触を拒否させ、無敵解除後に 150 接触を与える。修正前は group が 90 を保持し、150 接触が 60 として吸収されて HP 100 のまま。修正後は HP 50（貫通 50、アーマー HP 0、破壊後 20F）。
- プレイへの影響: 復帰直後の Roller 中心フリックが、無敵中の接触を挟むと貫通 50 を失う経路を塞ぐ。
- 確認状態: ロジック単独のヘッドレス測定（30/60/120Hz の fidelity 接触と、実 projectile 経路の掃引接触を含む `tests/issue-999-rejected-roller-group.test.mjs` 6/6、`weapons.test.mjs` / `issue-999-roller-spawn-armor.test.mjs` / `respawn-lifecycle.test.mjs` / `weapons-fidelity-source.test.mjs` / `batch-b-final-damage.test.mjs` / `issue-608-fidelity-aim.test.mjs` 合計 44 件成功）。修正を外すと拒否寄与の 2 試験が失敗することを確認。
- 未確認: 本家の実機での 150 フリックとアーマーの同時接触の挙動、20F の破壊遅延、30/60/120Hz 以外の端末。ブラウザ・Switch 実機比較は未実施。
- 未移植（残差）: 同一 Actor の owner 交代（remote handoff）後に、旧 owner と新 owner の group 番号が armor 台帳で混ざる経路。コメントで報告されたが、この時点の PR #1182 head（`7a58339e`）と統合ブランチには対応する変更が無く、3 クライアント試験の成果物も参照できなかったため、実装していない。Issue は Open のまま。
## 2026-10-10: menu delayed-navigation ownership (#950)

- 本家の根拠: 本件は本家との数値・挙動の比較ではなく、INKWAVE 内部の UI 画面ライフタイムの不具合である。本家のタイトル確定から次画面までの遷移時間は公開資料で確認しておらず、ここでは確定しない。200ms（タイトル確定）、260ms（Mode 選択確定、reduced-motion は 0ms）、350ms（タイトル入力ガード）は INKWAVE の既存値として `inkwave-public/src/ui/menus.js`（`_titleGo`、`_scr_mode`、入力ガード）から維持し、本家一致は主張しない。参照版は Ver. 11.3.0。
- INKWAVE 実装箇所: `patches/local-quality/menu-navigation-timer-adapter.mjs`（build-only 変換、`patches/local-quality/adapter.mjs` の `adaptQualitySource` で `menus.js` に適用）、`patches/local-quality/menu.mjs`（退役済み instance の `show` を無視）、`scripts/lib/inkwave-build-only-modules.mjs`（登録）。試験は `patches/local-quality/tests/menu-navigation-timer.test.mjs`、`menu-title-ownership.test.mjs`、`menu-navigation-fixture.mjs`。
- 再現操作: (1) タイトルで確定後 200ms 以内に設定を開く、または無効な画面要求を出す。(2) タイトルで確定を連打、または確定後にメインへ戻って再度タイトルに入る。(3) Mode で選択後 260ms 以内にメインへ戻り、再度 Mode に入る。(4) タイトル確定後、ワイプ途中で画面を破棄する。
- プレイへの影響: 遅延中の新しい画面操作を古い遷移が上書きしない。Mode の古い選択が後の訪問で Setup へ進まない。破棄後に古い画面が再生成されず、画面変更通知も出ない。通常の 200ms / 260ms 遷移、reduced-motion の 0ms、ワイプ、入力ガード、設定値は変更しない。
- 確認状態: 合成 Menus（実メソッド、DOM・時刻は有界な fake）の回帰試験のみ。修正を接続しない状態では新規試験 26 件中 17 件が失敗し、接続後は 26/26 成功。関連する menu・result・packaging の試験は 26 成功、3 skip（build 成果物が必要なため）。`scripts/check-inkwave-patches.mjs --quick` は成功。ブラウザでの実動作、実機の入力や割り込みのタイミングは未確認（本セッションではブラウザを起動していない）。draft PR #1182 に同じ修正があり、統合時に重複を一本化する必要がある。
## #1184: オフライン試合開始の読込失敗後に黒い画面から戻れない問題（2026年10月10日）

- 本家参照版：該当なし。スプラトゥーン3には、ブラウザでのモジュール読込失敗後の画面遷移に関する公開仕様がない。本件は本家との挙動比較の対象外で、本家の数値・タイミング・演出は推定していない。
- 比較条件：オフラインの試合開始中に Boss モジュールの読込、ワールド構築、キャラクター事前描画のいずれかが reject した場合。
- INKWAVE の変更前：メニューの `startMatch` が返す Promise を `safeCall` が消費せず、reject 後にメニューへ戻す処理がなかった。`_loadBoss` は失敗した import を `_bossMod` に残し、再試行でも同じ reject を再利用した。
- INKWAVE の変更：
  - `patches/reliability/start-adapter.mjs`：メニュー用の `_startMenuMatch` を追加した。現在の開始操作だけが `quitToMenu` で復帰し、短いエラーを一度表示する。古い操作の reject は復帰を起こさない。core `startMatch` は明示 flow を受け取れるが、通常呼び出しの例外契約は変えない。`quitToMenu` は復帰した attract 試合を返す。`_loadBoss` は失敗した自分の取得だけキャッシュを解除する。
  - `patches/reliability/tests/start.test.mjs`：実メニュー API、開始と復帰の所有権、古い reject、成功、失敗後の再試行、反復失敗の回帰試験（#1184 の 10 件）を追加した。
  - `patches/reliability/tests/attract.test.mjs`：start 試験の composed fixture が参照する `adaptBuildSource` を sandbox に渡すよう補正した。
- 再現と確認：
  - `patches/reliability/start-adapter.mjs` を変更前に戻すと、#1184 の 10 件が失敗する（129 pass / 10 fail）。変更後は `patches/reliability/tests/start.test.mjs` が 139/139 pass。
  - `patches/reliability/tests/attract.test.mjs` 13/13 pass。`hud`、`menu-raf`、`loading-cache` adapter、`practice-range` isolation は同時実行で 35 pass / 0 fail / 4 skip。`practice-range` untimed は単独実行で 3/3 pass（143 秒）。
  - これらは Node の VM 上で実 adapter から組み立てたメソッドを動かす単独検証であり、ブラウザや WebGL の実動作、Switch の実機確認ではない。
- 遊びへの影響と状態：オフラインで Boss、ワールド、キャラクターの読込が失敗しても、黒い画面で止まらずメニューへ戻り、再試行できる（コード上の状態遷移の確認）。
- 未確認：ブラウザでの実際のモジュール読込失敗、ライブ WebGL のシェーダー拒否、フェードの画素、実機・Switch での表示。新しいエラー文言は `t()` を通すが、日本語訳は公開版の `inkwave-public/src/i18n.js` に無く、本作業では追加していない（日本語モードでも英語表示のまま）。
#716: Ver.11.0+ 残HP表示（敵の被弾後の残HPバー、味方の被弾表示、遮蔽・潜伏・索敵の例外）。
- 本家の根拠: Nintendo Ver.11.0.0 の記事（敵の残HPは被弾後「数秒」表示され、本体が遮蔽・潜伏中は隠れる。味方の被弾も表示）と、参照版 Ver.11.3.0 の公式更新履歴。記事は「数秒」としており、3秒の厳密値は公式には確認していない。
- INKWAVE 実装箇所: `patches/splatoon3/runtime/combat-info.mjs` の `healthHitAge`（HP の実減少を観測した時刻から計る表示専用の時計）と `healthActorDecision`。描画は既存の `updateHealthBars`（`ui.mjs`）の単一経路。
- 修正前の不具合: 敵の3秒窓が `actor.lastDamage` を使っていた。これは回復待ちの共有タイマーで、`issue-415-adapter.mjs`（`adapter.mjs` で適用）の `resetEnemyInkRecovery` が敵インク上で0に戻すため、HPが減っていない敵でも敵インク上にいる間はバーが消えなかった（単独再現、stubbed projection: 被弾後4.5秒で敵バー1本。被弾のみの対照は0本）。
- 修正後: 窓は HP の実減少からのみ始まり、敵インク接触だけでは延長しない。味方は被弾していれば表示（従来どおり）。死亡で記録を消し、復活時の HP を新しい基準にする。リモートは複製された HP の減少を同じ規則で観測する。
- 再現操作: 敵を1回被弾させる（HP減少）→ その敵が自チームのインク上に立つ（HP減少なし）→ 3秒を超えるまで観察。修正後は約3秒で敵バーが消える。新しい被弾で窓が更新される。
- プレイへの影響: 修正前は、被弾済みの敵が敵インク上にいる間ずっと残HPバーが出ていた。修正後はバーの寿命が HP 減少時刻に従う。
- 確認状態: 単独試験のみ。`patches/splatoon3/tests/health-window.test.mjs`（5件）、`score-hud.test.mjs`（12件）、`sub-hud.test.mjs`（4件）、`patches/local-quality/tests/hud-snapshots.test.mjs`（8件、環境変数で有効化される1件はskip）が通過。既存の試験は、HP を直接変える前提に合わせて、HP 減少の時刻を観測させる形に書き換えた。
- 未確認: 3秒の厳密値、敵インクの継続ダメージを本家が「被弾」として窓を更新するか、残HP表示の形と寸法、遮蔽・潜伏判定の本家との一致、ブラウザ実動作、実機比較。PR #1182 の HUD 重複オーバーレイ修正（e61db6fe 系）は main に該当コードがなく、本修正には移植していない。
## #268: Splat Charger wall-drop drip lifetime (main `97ae3fec`)

- Reference: Splatoon 3 Ver. 11.3.0, pinned `WeaponChargerNormal` in Leanny/splat3 `7280ff9c…`. Gameplay wall-drop path = first (15–30 frames) + second (10, XarrotD default) + last (15–30 frames), i.e. 40–70 frames (0.67–1.17 s). Charge-dependent fall/shock radii (1.5× min→max) are already implemented and tested in `runtime/weapons-charger-flight.mjs`.
- INKWAVE: `inkwave-public/src/world/paint.js` line 464 gives every wall stamp `dripDur = 1.1 + min(2.2, radius × 1.5)`; the Charger fall stamps (r 0.8–1.2) therefore keep their drip for 2.3–2.9 s and the shock stamp (r 1.8) for 3.3 s, longer than the gameplay path.
- Status: **not resolved**. The drip-lifetime fix (set the Charger stamp's drip to the remaining path time) was tried and reverted: in the fixture the Charger wall-drop splats return area 0 and are never added to `paint.growing`, so the change could not be exercised by a test. The next step is to confirm, on a real wall with paint surfaces, whether these splats reach `paint.growing` through the #264 and #570 wrappers, then set the drip lifetime there.
- Unverified: the second-frame and last-min defaults (XarrotD paramtable, medium confidence), the unit of the target speeds, and Switch timing and pixel parity. None of these are resolved by this entry.
## 2026-10-10 — Sub-cell fine-spatter ownership (#264)

**本家の根拠（未公開の範囲）:** Splatoon 3 Ver. 11.3.0 の公開資料（[Nintendo 更新履歴](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/kw/Splatoon%203)）は、インクの GPU マスク、セル単位の所有、スパッタの幾何を公開していない。したがって本件の本家比較は「描かれた同チーム色のインクは、移動・補充・ターフ計上に使う権威的な所有と一致しなければならない」という内部整合性の基準に限る。Splatoon 3 のスパッタ形状や数値は一切使っておらず、本家の実測値は **UNKNOWN / unverified**。

**INKWAVE の差分（修正前）:** `inkwave-public/src/world/paint.js` の GLSL は、通常の着弾に対して `h1×2π` の角度、距離 `R×(1.3+1.2·h2)`、半径 `max(R×(0.011+0.02·h3)×fall, texel×0.9)` の細かいスパッタを同チーム色で描く。CPU 所有は `patches/splatoon3/runtime/paint-ownership.mjs` の `cellIsSolidlyVisible` で、セル中心と内側4点の5サンプルのみを判定していた。本番の CPU セルは 0.25 m であり、半径 0.03〜0.08 m のドットは5サンプルの間に入り込んで所有されなかった。

**再現操作（一時 probe、未コミット）:** 本番の `PaintSystem`（セル 0.25、`fixture` の production composition）で、平らな床に `kind: 'bomb'`、`seed: 0.5`、`R: 2.7` を着弾させ、成長完了（31 tick、`growing` が空）まで進める。bomb の行 `[10,12,14,5]` の14個のスパッタについて、ドット中心のセルを確認した。修正前は、14個すべてでドット中心のセルが同チーム所有ではなかった。セルを 0.125 m にすると所有セルが現れ、欠落が解像度依存であることを確認した。

**修正:** `cellIsSolidlyVisible` に、`sa <= 0` かつ半径が半セル（`max(cu, cv)/2`）未満の type-1 スパッタに限り、中心を含むセルを所有とする規則を追加した。大きいドットと引き伸ばし（`sa > 0`）の種類は従来の5サンプル規則のまま。ターフ計上は所有セル1つにつき `cu×cv`（0.0625 m²）増える。`inkwave-public/` は変更していない。

**確認状態:** `patches/splatoon3/tests/issue-264-subcell-spatter-owner.test.mjs` 2/2 通過。規則を一時的に無効にすると、1件目（14個のスパッタ中心セルがすべて所有されること）が失敗することを確認した（その後復元）。既存の近傍試験15ファイル（issue-264 の temporal/authority/score-boundaries/additional/hash/wall、turf-projected-area、projectile-paint-radius、issue-289、issue-803、issue-979、roller-foot、weapon-paint-inertia、network paint-canonical-order）は計90件すべて通過。これらはロジック単独の測定であり、ブラウザの WebGL 実描画、物理 GPU、Switch の画素一致の証拠ではない。

**未解決・残件（未確認）:** (1) サテライト（type 2、楕円）と引き伸ばし（`sa > 0`）の極小ドットは、従来の5サンプル規則のまま。(2) 既存の browser probe（`paint-mask-browser-fixture.mjs`）は「CPU所有セル ⊆ GPU可視」の向きのみを検証し、今回の中心セル規則とは厳密には食い違う可能性があるが、ブラウザ実行はこの環境で未実施。「GPU可視 ⊆ CPU所有」の向きの追加検証も未実施。(3) 物理 GPU、ブラウザの実描画、Switch でのピクセル一致は **UNKNOWN / unverified**。
### #949 Boss rejected hits and Slosher volley budget (2026-10-10, takeover)

**本家の根拠:** 直接の比較対象はINKWAVE独自のBossモードであり、Splatoon 3の公式仕様や実機の同等挙動とは同一視しない（PR #1182 の既存記録と同じ扱い）。本修正は、既存のSlosher volley最大値（プレイヤー側 `applySlosherVolleyHit`、#627/#628系）と同じ「同一volley内で同一対象に対し最大値を超えた分だけ適用する」INKWAVE内部契約を、Boss側でも受理後に確定させる修正である。新しいS3数値・ダメージ値は追加していない。Splatoon 3側のSlosher volley最大値規則そのものは今回再確認していないため未確認。

**INKWAVE の実装箇所:** `patches/splatoon3/runtime/weapons-fidelity.mjs` の `bossVolleyAdmission`（新規）と `Projectiles.prototype._bossImpact`。生存・非無敵・可視・playing・有効なattacker・生存クラブレットの受理時だけ `groupDamage` で予算を確定して `Boss.hit` を呼ぶ。無敵・非表示の拒否で、local/host の攻撃者かつ本体（クラブレットではない）の場合だけ、既存の `Boss.hit` の blocked 通知（IMMUNE表示）を残すため、予算を確定せず未消費差分のみを渡す。`inkwave-public/src/boss/boss.js` は変更していない。

**再現操作:** 実 Projectiles で Slosher の9 glob volley を発射し、最初の glob を無敵の Boss に当てる。その後、無敵を解除して同じ volley の次の glob を当てる。修正前は HP1000 のまま group 最大値70だけが残る。修正後は HP930 が1回だけ適用される。guest は拒否された命中を送信しない。

**プレイへの影響:** 無敵・非表示中の命中が、同じ volley の後続の正当な命中の予算を奪わなくなる。無敵中の IMMUNE 表示は従来どおり出る。死亡・remote・ghost・終了後・攻撃者欠落では新たな送信や表示は増えない。

**確認状態:** 実 Projectiles → Boss.hit/applyDamage/_hitCrab/BossHud._hit の Node 回帰（`issue-949-boss-blocked-feedback.test.mjs` 7件、`boss-volley-admission.test.mjs` 2件、隣接する Slosher・Boss の回帰を含む）で確認。修正前の main では 949 回帰7件が失敗することを確認した。ブラウザ描画、実通信、Nintendo 実機比較は未確認。Boss側の Splatoon 3 対応は未確認。
## 2026-10-10 — Refill during a dry Roller hold re-enters the roll loop (#541)

**本家参照:** Splatoon 3 Ver. 11.3.0, Splat Roller. The issue-recorded Splat Roller statement stands: out-of-ink rolling persists with a clunk, and the structural persistence point is unchanged from the 2026-10-08 entry. This lane did not re-fetch a dry-roll passage from a primary source. One community-wiki snippet (`splatoonwiki.org` Splat Roller, found by search) lists 0.96 units/frame for rolling "with a depleted ink tank" against 1.2 for normal rolling. The same page's wording points to Splatoon 2, so it is recorded as an unconfirmed lead and **not** used as an S3 value. No source for the clunk sound was found. Dry-roll movement speed/acceleration, the clunk audio, and whether Splatoon 3 restarts the roll sound on a mid-hold refill all remain **未確認**.

**INKWAVE root and correction:** After the 2026-10-08 change, a dry hold keeps `rolling` true, so the native `_roller` edge (`canRoll !== rolling`) never fires on a refill. The normal roll-start side effects (roll loop start, `lastRollPos` and `rollDist` reset) were skipped, and the roll loop stayed silent until ZR release. `patches/splatoon3/runtime/roller.mjs::installRollerLogic` now clears `rolling` for that one call when a paid dry roll sees ink above 0.5, so native re-enters the roll through its own transition: one loop, anchored at the refill position. Dash timing (`rollT`), paint, contact damage, and ink charging are unchanged.

**Reproduction (fixture, logic only):** Hold ZR on a grounded Roller until the tank empties, keep ZR held (dry hold), then refill to 50 ink while ZR stays held. Before the change, `rolling` stays true but zero roll loops are active after 30 further ticks. After the change, exactly one new loop starts on the refill tick and no duplicate is created. Regression: `patches/splatoon3/tests/issue-541-roller-dry-roll.test.mjs` (new case "refill mid-hold re-enters the normal roll loop exactly once" failed before the change). That file now passes 8/8; neighbouring roller tests (issue-626, issue-537, issue-305 x2, roller-freefall, roller-foot-paint-composition, dry-ink) pass 64/64.

**Player impact:** A roll that is still held when ink returns above 0.5 gets its roll sound back immediately instead of waiting for a release. No movement, paint, damage, or dash change. Browser and Switch behaviour were not observed; this is a fixture-level logic check, not a comparison against Splatoon 3 hardware, so the sound parity claim remains unconfirmed.
## #387: Splat Roller body-contact knockback (2026-10-10)

- 本家の根拠: Ver. 11.3.0 の `WeaponRollerNormal` `BodyParam.CollisionParam`（Leanny/splat3 `7280ff9c`、sha256 先頭 16 桁 `5b423eb35d4cac26`）。`KnockBackOpponent` {AccelMin 420, AccelMax 800, MyVelocityRate 30, OpponentVelocityRate 4800}、`KnockBackRollerPlayerDamageOn` {410, 550, 4800, 30}、`KnockBackRollerPlayerDamageOff` {280, 280, 4800, 30}。`Damage` は 1250 で別フィールド。
- INKWAVE 実装箇所: `patches/splatoon3/runtime/roller-body-knockback.mjs`（`Projectiles.applyHit` の後段で、ローラーの回転接触かつ生存・非致死・敵味方の場合に限る）、`patches/splatoon3/runtime/install.mjs`、`scripts/weapons-fixture.mjs`（fidelity 時に同じ順序で導入）。試験は `patches/splatoon3/tests/issue-387-roller-body-knockback.test.mjs`。
- 再現操作: 平地で敵の正面 0.9 WU に回転中のローラーを置き、ダメージ適用後の双方の速度を比較する。無敵の敵では被弾が拒否され、ローラー側は DamageOff の反動になる。
- プレイへの影響: 生存する回転接触で、敵は離れる向きに、ローラーは逆向きに速度を受ける。致死接触、回転していない接触、ドラム外の接触は変えない。ダメージ値と接触判定は変更しない。リモートのローラーは、複製された回転フラグ（`character.s3RollerFlick.rolling`）で判定し、その持ち主のクライアントだけが自分の体を動かす。
- 確認状態: **未確認**。加速度の単位（DU/s² と仮定）、速度係数の単位、結合式（`AccelMin + MyVelocityRate*自分の接近速度 + OpponentVelocityRate*相手の接近速度` を `AccelMin..AccelMax` に丸める）は、公開資料にも一次計測にもない。速度変化には既存の #535 換算（splatBombKnockbackDelta）を暫定モデルとして使っている。ロジック単独の試験のみで、ブラウザの実動作、ネットワーク越しの実機比較、本家の押し量・反動量の実測は行っていない。実機で押し量と反動量を比べるまで、Splat 3 と一致したとは扱わない。
## #919: teammate special activation signal (HUD)

- 本家の根拠: 未確認。Nintendo 公式の Ver. 11.3.0 パッチノート（2026-08-19）には味方のスペシャル発動表示の記載がない。攻略Wiki（wikiwiki, スペシャルウェポン）は 403 で本文を取得できず、Issue本文が引く記述は確認できていない。Splatoonwiki の Special ページには味方発動の表示記述がない。Google Drive 上の関連ノートは本文未確認。
- INKWAVE 実装箇所: `patches/local-quality/team-special-signal-adapter.mjs`（`src/ui/hud.js` の native feed に味方発動の行を追加）、`patches/local-quality/adapter.mjs`（登録）。`src/main.js` の local-only バナーは変更していない。
- 挙動: 同じチームの非local actor が受理済みの `special:use` を発動したとき、その actor の special id に対応するアイコンを feed に 1 行出す。敵、local 自身、attract/menu/非 playing/paused、非表示・finish・dispose 時は出さない。オンラインは `NetMatch._playEvent` 末尾の `emit(name, e)` で既に bus に流れるため、二重注入はしない。Issue 本文の「音声のみ」という前提は現 main では不正確だった。
- 再現操作: 同チームの味方 bot または remote 味方が特殊を発動する。現 main では表示されず、修正後は feed に行が出る。
- プレイへの影響: HUD 表示のみ。ゲームプレイ、ゲージ、ダメージ、スペシャル時間は変更しない。
- 表示時間: 既存の feed 失効（4.2 秒）を流用。INKWAVE の既存値であり、本家の表示時間の実測ではない。
- 確認状態: 限定 source 回帰 6 件で、実 Actor の発動、HUD 行、アイコン、敵・自分の除外、重複受信の抑止、退役を確認（ロジック単独の測定）。本家の表示有無、位置、見た目、時間、積み方は未確認。ブラウザ実動作と本家実機比較は未実施。
## #278: Roller vertical flick spawn heights per unit group (2026-10-10 JST)

- 本家の根拠: Splatoon 3 Ver. 11.3.0 (Leanny/splat3 `7280ff9cde8bb1c5dcef46c700c326471584d2e6`, `data/parameter/1130/weapon/WeaponRollerNormal.game__GameParameterTable.json`, `VerticalSwingUnitGroupParam.Unit`). Three groups: Unit 0 (1 glob, `SpawnPositionOffsetHeight` 0.5), Unit 1 (`BulletNum` 2, `SpawnPositionHeight` 0.25 + `SpawnPositionOffsetHeight` -0.25), Unit 2 (`BulletNum` 2, `SpawnPositionHeight` 0.25 + `SpawnPositionOffsetHeight` -1.25). The table has no field descriptions, units or semantics.
- INKWAVE実装箇所: `patches/splatoon3/runtime/weapons-fidelity.mjs` `configureFidelityFlick` (per-unit `p.pos.y` offsets, applied before `_push` in the adapter, so the offsets are present at birth); `patches/splatoon3/profile.json` `models.rollerVerticalSpawnHeight`; test `patches/splatoon3/tests/issue-278-vertical-spawn-origin.test.mjs`.
- 再現操作: airborne vertical flick with Roller; the five globs start at y offsets +0.5 (Unit 0, 1 glob), 0 (Unit 1, 2 globs) and -1.0 (Unit 2, 2 globs) relative to the native muzzle anchor, not one shared origin. The issue body's "all five share one origin" describes the 0859bf4f baseline, which main no longer matches.
- プレイへの影響: near-weapon sheet shape and the first frames of glob separation now follow the 1+2+2 height groups. Timing, ink cost, damage, gravity/drag and landing paint are unchanged.
- 確認状態: 未確認. The additive combination of `SpawnPositionHeight` and `SpawnPositionOffsetHeight`, the per-field engine meaning, and the raw-unit scale (1 world unit per table unit, no SI claim) have no sourced basis; the search for a semantics source found none. Recorded as unverified rather than resolved. Nintendo-side measurement and real-hardware comparison are not done. The fix branch `fix/inkwave-10-issues-20261009` (commits 99d372cf, c676b72f, 8564a1e1) duplicates these origin offsets and is not ported to avoid double application.
## 2026-10-10: Splat Roller dash turn-break (#466)

- 本家の参照: Splatoon 3 Ver.11.3.0。Leanny/splat3 固定コミット `7280ff9cde8bb1c5dcef46c700c326471584d2e6` の `data/parameter/1130/weapon/WeaponRollerNormal.game__GameParameterTable.json` の `WeaponRollParam`: `SpeedNormal` 0.108、`SpeedDash` 0.132、`DashFrame` 90、`SpeedDashTurnBreak` 0.108（`/frame`）。同ファイルを WebFetch（要約モデル経由、逐語照合ではない）で読み、repo の抽出値と一致することを確認。
- 解説ページ（Splatoon Wiki の Splat Roller 記事と Splatoon 3 ローラーのデータテンプレート）は、通常 0.108、ダッシュ 0.132、1.5 秒後にダッシュ、の数値を載せるが、ダッシュ中の方向転換・反転時の速度は記述していない。wikiwiki のパラメータ解説は HTTP 403 で読めず、`SpeedDashTurnBreak` の発動条件の記述は未確認。
- INKWAVE の実装箇所: `patches/splatoon3/runtime/movement-physics.mjs` の `rollingMovementSpeed` と新規の `dashTurnBreakActive`。`profile.json` の `roller.rollDashTurnBreakSpeed` = 6.48（0.108 × 60、既存の速度換算と同じ。換算自体は未確認）。`reference/curated-numbers.json` に `SpeedDashTurnBreak` 0.108 を抽出値として登録し、`reference/numeric-status.json` に値を記録。
- 差分と修正: 修正前は 90F 以降の転がりが回転方向によらず 7.92 を目標にしていた。修正後は、ダッシュ（rollT ≥ 1.5 秒）中で、入力と現在の進行方向（ワールド座標）の内積が負（入力が進行方向から 90 度超）のとき目標を 6.48 に抑える。入力が 0.01 以下、または速度が 0.01 以下なら発動しない。反転が解けた最初のフレームで 7.92 に戻し、ダッシュ状態（rollT）はリセットしない。
- 未確認（本家の根拠なし）: 反転の閾値 90 度、反転判定の時刻、回復の時間と曲線、反転中の減速の形（現行の `Actor._horizontal` の反転ブレーキ、約 126 度以上の plant-and-reverse はそのまま）、6.48 のワールド単位換算、ローラーの実機での感触。
- 再現操作: ZR を押したままローラーで平地を 1.5 秒以上直進（ダッシュ）→ 反対方向へ急に入力する。修正前は目標が 7.92 のまま、修正後は反転中のみ 6.48 になる。
- プレイへの影響: 反転・急旋回中のローラーの速度が落ちる。通常の転がり（6.48）、直進ダッシュ（7.92）、スクイッド、フリック、被弾、塗りは変わらない。
- 確認状態: `patches/splatoon3/tests/issue-466-roller-dash-turn-break.test.mjs`（6 件、実 WeaponRunner と Actor のフィクスチャ）で、通常・直進ダッシュ・反転・90 度・無入力・反転後の回復を確認。隣接する roller / movement の試験（issue-743, roller-flick-movement, issue-eight-followup, air-run-speed, charger-movement-start, issue-189, roller, issue-626, integration）と `scripts/check-inkwave-patches.mjs --quick` が通過。単独のロジック測定であり、本家の実機比較ではない。実機での反転の見た目と速度の一致は未確認。
## 2026-10-10: Blaster swerve after walking off a ledge (#1102)

Compared with Splatoon 3 Ver. 11.3.0, standard Blaster (`WeaponBlasterMiddle`), fixed 60 Hz logic tests.

- 本家の根拠: the pinned Ver. 11.3.0 extract (Leanny/splat3 `7280ff9cde8bb1c5dcef46c700c326471584d2e6`, `data/parameter/1130/weapon/WeaponBlasterMiddle.game__GameParameterTable.json`, values re-read this session) gives `Stand_DegSwerve` 0, `Jump_DegSwerve` 10, `Jump_DegBiasMax` 0.5, `Jump_DegBiasDecreaseStartFrame` 25, `Jump_DegBiasEndFrame` 70. The community explainer [Inkipedia User:XarrotD/Data Explanation](https://splatoonwiki.org/wiki/User:XarrotD/Data_Explanation) states that swerve increases on a jump and that a player can fall off a ledge without jumping and keep normal swerve. This is an unofficial explanation, not an official Nintendo source.
- INKWAVE 実装箇所: `patches/splatoon3/runtime/weapons.mjs`, `s3BlasterJumpState` and the blaster branch of `_spreadDeg`. The jump state starts only on the native jump serial (`s3JumpSerial`, already on main). This change makes the inactive supported state return the grounded cone (`state.ground`, 0 degrees) instead of `spreadAir` (10 degrees) for an airborne frame. Unsupported parameter sets keep the earlier fallback.
- 再現操作: stand on the ground for two or more frames, walk off a ledge without any jump input, then fire during the fall. Before the change, `_spreadDeg` returned 10 during the fall. After the change it returns 0, and a real jump from the same spot still starts the 10 degree / 0.5 bias state with the 25F to 70F recovery.
- プレイへの影響: before the change, a shot fired while falling off a ledge used the jump-accuracy envelope and bias. After the change, the fall uses the normal grounded cone. Intensify Action still scales only the real jump envelope.
- 確認状態: logic tests only (`blaster-jump-accuracy.test.mjs`, `weapons-gear-flow.test.mjs`, 30/60/120 Hz, gear on and off, shot path). The fall-without-jump rule has no official Nintendo source here, so it stays 未確認 for real hardware. Browser behaviour and a live Ver. 11.3.0 comparison are not done. The intermediate recovery curve between 25F and 70F is not a sourced value and stays 未確認. The same hunk is in PR #1182 commit e6c0107d. The integration branch `ccr-bfa73df8-u3uhvi` and main still have the fallback until this commit is merged.
## 2026-10-10 — #1162 water-height footprint scan (takeover)

- **本家の根拠:** なし。性能項目で、スプラトゥーン3の挙動・数値を比較する対象ではない。本家との比較ではなく、INKWAVE 内部の波高が従来と同じ値を返すことだけを確認する。
- **INKWAVE 実装箇所:** `inkwave-public/src/world/environment.js` の `waterHeightAt()`。上流は変更せず、`patches/splatoon3/issue-batch-1171-adapter.mjs`（`adaptSource` 経由）が毎回の一時配列を作らないループに置換する。試験は `patches/splatoon3/tests/issue-batch-1171.test.mjs`。
- **再現操作:** 同一の環境オブジェクトで、マリーナ on/off、`footprint` と `bounds` の差し替えを 6 段階行い、各段階 120 点で従来実装と値を比較する。
- **プレイへの影響:** 波高・浮遊物の位置は変えない（試験上は従来と完全一致）。フレームごとの一時配列の削減による FPS・GC の改善は測っておらず、主張しない。
- **確認状態:** ロジック単独の回帰試験のみ。ソース上で配列生成の式が残っていないことは文字列検査で確認（実行時のアロケーション計測ではない）。テーマ・seaState は `waterHeightAt` の入力ではないことをソースで確認。浮遊物・反射・環境破棄のブラウザ動作、実機のアロケーション数・GC・FPS は未確認。
## 2026-10-10 — #1116 action-state catalog selection

**本家の根拠.** Flexlion animation-name index @7740d29 (re-fetched 2026-10-10) lists `JumpShoot_Shtr00`–`02`, `JumpShoot_Rllr00`, `JumpShoot_Spnr00` and `JumpShoot_Chrg00`–`02`. No `JumpShoot_*` name appears for Dualies, Slosher or Normal. Names alone do not prove playback or joint curves.
**INKWAVE実装箇所.** `patches/splatoon3/runtime/jump-motion.mjs` (`JUMP_SHOOT_REFERENCE_CANDIDATES`, `jumpMotionSnapshot` の `actionState` / `selectedCatalogCandidates`). Tests: the last two cases in `patches/splatoon3/tests/jump-motion.test.mjs`.
**再現操作.** Flat ground, ordinary jump with ZR released, then press ZR (fire or charge) mid-air, for each of the seven kinds. The CPU rig reports `actionState` `firing` and the JumpShoot candidate for Shooter, Roller, Splatling and Charger; `ordinary` for Dualies, Slosher and Blaster.
**プレイへの影響.** None to the pose, physics, timing, damage, ink or weapon admission. Only the named catalog candidate in the snapshot changes.
**確認状態.** CPU tests only: `jump-motion.test.mjs` 12/12, neighbouring motion tests 62/62. Which clip actually plays, the variant mapping (Shtr/Chrg), Blaster's firing clip, joint curves, and browser/GPU/Switch parity remain **未確認**.
## 2026-10-10 (#1185): old-match hit and ACK packets in a reused room

- Splatoon 3 side: no public source describes how a delayed hit packet from one match is handled in the next match. This is INKWAVE's own online-sync integrity, not a Splatoon 3 behaviour being matched. No parity is claimed.
- INKWAVE implementation: `patches/network-replication/adapter.mjs`. `sendHit` stamps `m: cfg.id` on `hit`; `_hit` rejects any packet whose `m` is missing or differs from the current match before HP, hit sequences, or authority change; `hit_ack` echoes `m` and `_hitAck` rejects a mismatched ACK before receipts or authority merge.
- Reproduction (deterministic injection): match A sends hit `h:1` to a victim owner. Match B reuses nids 1/2 and victim life 1. Before the fix the old packet reached damage (victim HP 100 to 64), and the first valid match B hit with `h:1` was dropped as a duplicate. A stale ACK consumed match B's pending receipt. After the fix, both are rejected and the current match's own hit and ACK settle once.
- Play impact: a delayed packet from an earlier round can no longer damage or confirm a kill in the next round. Same-match delivery, duplicates and ownership handoff are unchanged.
- Confirmation: `patches/network-replication/tests/issue-1185-match-boundary-hit.test.mjs` runs the composed production NetMatch methods in a VM with transport and damage sinks. The packet delay is injected, not measured on a relay. No browser, real network latency or Switch measurement is claimed. Real-device verification remains unconfirmed.
## 2026-10-10: #574 standard Blaster air-burst knockback (上書き担当)

- 本家の根拠: Splatoon 3 Ver. 11.3.0 の標準ブラスター `BlastParam`（Leanny/splat3 コミット `7280ff9c` の `WeaponBlasterMiddle.game__GameParameterTable.json`）。`DamageAttackerPriority: true`、`DistanceDamage` 700 @1.025 / 500 @3.385、`KnockBackParam` Accel 700 / Bias 0.8 / Distance 3.5。内部の積分式は公開されていない。
- INKWAVE 実装箇所: `patches/splatoon3/runtime/sub-special-fidelity.mjs`（`BLASTER_KNOCKBACK`、`applyBlasterBlastContact`、`applyBlasterKnockback`、Actor 側の 1 ステップ保持）、`patches/splatoon3/adapter.mjs`（`_blastBurst` の半径と接触、`adaptKitRescue` の後段）、`patches/network-replication/adapter.mjs`（送信時の `kb` 付与と受信側の一回適用）、`patches/reliability/net-hit-payload-adapter.mjs`（ダメージ 0 は `kb` 付きの場合のみ通す）。
- 変換: #535 の爆弾校正式（`duPerWorldUnit` 10、`referenceHz` 60、減衰 `(1 - d/3.5)^bias`）を再利用。Accel と Bias の内部式ではない。
- 再現操作: 空中の標準ブラスター爆風を、標的の横 1.0〜3.5 の位置で（直撃なし、LOS あり）発生させる。HP は 70→50 の帯だけ減り、3.385 を超え 3.5 未満では HP を減らさずに爆風の外向きへ押す。
- プレイへの影響: 間接爆風で相手が押し出される。ダメージ帯、爆風半径、塗り、FX は変わらない。
- 確認状態: 自動テストのみ（論理単独測定と VM fixture）。`issue-574-blaster-knockback` 6/6、`blaster-knockback-authority`（ネットワーク）4/4、隣接回帰 59/59 と 39/39、`check-inkwave-patches --quick` 合格。未確認: Accel/Bias の本家内部式と INKWAVE 単位への換算、直撃時の扱い（DamageAttackerPriority）、地形爆風へのノックバック（現状は付与しない）、壁越し・段差後の挙動、2 クライアントの実通信、本家実機との比較。
## #539: Splat Charger partial-charge walking speed

- **本家の根拠**: Issue #539 本文が引用する wikiwiki「スプラチャージャー」の検証表（Ver.11.3.0 向け）では、チャージ中の移動が 0.96（最小側）から 0.21（最大部分側）へ、完全充填で 0.20。Leanny/splat3 の固定コミット `7280ff9` の `WeaponChargerNormal` には完全充填の `MoveSpeedFullCharge` 0.02 のみがあり、部分チャージ移動の項目はない。wikiwiki は本セッションの取得が HTTP 403 だったため、0.96/0.21 は未確認のまま扱う。
- **INKWAVE 実装箇所**: `patches/splatoon3/runtime/weapons.mjs` の `chargerPartialMoveSpeed` と `WeaponRunner.prototype.moveSpeed` の charger 分岐。`patches/splatoon3/profile.json` の `partialChargeMoveStart` 5.76 / `partialChargeMoveEnd` 1.26、完全充填は `moveSpeedFiring` 1.2。
- **変更前**: 充填中は全段階で 1.2 u/s に固定されていた。
- **変更後**: 進行量は時間正規化の `chargeT` を使う（ダメージ用の非線形カーブ `charge` は使わない）。8F 未満は 5.76 u/s、8F 以降は 5.76 から 1.26 へ線形補間、真の完全充填で 1.2 u/s。
- **再現操作**: チャージャーを装備し、ジャンプせず地上で ZR を押して充填。充填時間の段階ごとに移動速度を確認する。
- **プレイへの影響**: 短い部分チャージでの移動が速くなる。完全充填時の速度は変わらない。ダメージ、射程、インク、チャージ維持、塗り、Run Speed Up (#243)、完全充填ジャンプ (#251) は変更しない。
- **確認状態**: 未確認。(1) 5.76 と 1.26 の出典は wikiwiki 検証表で、固定抽出データでは確認できていない。(2) 両端点の間の補間形（線形）と Nintendo の実際の曲線は未確認。(3) 30/60/120Hz の結果は論理テストでのみ確認。(4) 実機での比較は未実施。論理テストは実機比較の代わりにはならない。
## #940 Heavy Splatling standing outer-reticle share (2026-10-10)

- 参照: Splatoon 3 Ver. 11.3.0、Heavy Splatling (`WeaponSpinnerStandard`)、接地・非ジャンプ・連続射撃。
- 本家の根拠: Leanny/splat3 固定コミット `7280ff9c` の `Stand_DegBiasMax = 0.3`、`Stand_DegSwerve = 3.3`（`patches/splatoon3/profile.json` に既存）。二択30%の読みは [Inkipedia Heavy Splatling](https://splatoonwiki.org/wiki/Heavy_Splatling) の Splatoon 3 データ節（"30% chance to shoot towards the outer reticle instead of the inner reticle"、3.3°/7.0° の記載）。公式資料では確認できていない。
- 反対の資料: [User:XarrotD/Data_Explanation](https://splatoonwiki.org/wiki/User:XarrotD/Data_Explanation) は bias を連続的な偏差則（`y = s·x·log0.5(b)` と表記、0 で偏差なし、0.5 で swerve 内に一様）として説明し、Heavy Splatling には触れていない。二択30%の形は本記録では未確認。
- INKWAVE 実装箇所: `patches/splatoon3/runtime/splatling.mjs` の `Projectiles.prototype.fireSplatling` ラッパー。接地・#850 ジャンプ回復の外で、発射ごとに `Math.random() < 0.3` なら外側 envelope `spreadGround`（3.3°）、そうでなければ公開中の内側cone（`spreadGround × spreadFirst`、約1.98°）を使う。公開される `_spreadDeg` と HUD の値は変更していない。
- 前の状態（main 97ae3fec）: 接地の公開cone は 1.98° の固定値で、3.3° の envelope に到達する発射は無かった。generic bloom は Splatling では発生していない（bloom は常に0）。
- 再現操作: 接地で ZR を満充填して離す。連続発射の各弾の偏差角を記録する。修正前は全弾 1.98°、修正後は約30%が 3.3°。
- プレイへの影響: 接地の連続射撃で、外側へ逸れる弾が時々出る。#850 の空中・着地回復中の挙動、チャージ、インク、4F cadence は変えていない。
- テスト: `patches/splatoon3/tests/splatling-standing-outer-share.test.mjs`（300発で外側90発、30%を決定的に確認）。`splatling-jump-spread-native.test.mjs` の描画乱数の順番を、接地発射の選択1回ぶん更新。
- 確認状態: 単独の決定的テストのみ。内側kernelの角度（1.98° は INKWAVE の既存値で S3 の実測ではない）、外側確率の形（二択か連続か）、最終PDF、HUDの外側リング表示、リモート対戦での同期、30/60/120 Hz での実機比較、実機比較は **未確認**。

## 2026-10-10 — #719 airborne Splat Dualies dodge roll

**Reference and conditions.** Comparison target: Splatoon 3 Ver. 11.3.0, as cited in #719 (Nintendo Ver. 11.3.0 update notes; Inkipedia Dualies and Mobility pages). These sources were not re-fetched in this session. Condition: Splat Dualies, firing with a movement direction, jump pressed while not on the ground. The airborne vertical velocity, acceleration and trajectory shape are not published and are not pinned here.

**INKWAVE implementation.** The Actor's jump-buffer dodge admission in `inkwave-public/src/game/actor.js` (`Actor.update`) was gated by `this.grounded`. `patches/splatoon3/issue-719-dodge-adapter.mjs`, wired in `patches/splatoon3/adapter.mjs` `adaptSource`, removes that gate. `WeaponRunner.tryDodge` (`weapons.js`) still owns the weapon, fire, direction, roll-count and ink checks. An admitted airborne roll is marked `dodge.airborne = true` and its vertical velocity is set to `max(-maxFall, min(vel.y, -gravity * rollTime))` with INKWAVE's own `gravity` and `maxFall` (`config.js`). This is an INKWAVE-derived descent, not a Splatoon 3 constant. A jump inside the coyote window after leaving a ledge keeps the ordinary jump; this precedence is an INKWAVE choice and is not sourced from Splatoon 3.

**Reproduction and impact.** Equip Splat Dualies, step off a ledge, hold fire and a direction, then press jump. Before the fix nothing rolls. After the fix one roll starts, pays the normal roll ink once and descends. Ordinary airborne jumps without fire, direction, rolls or ink are unchanged. Grounded rolls are unchanged. Ground contact during the roll neither starts a second roll nor double-charges; roll count refills on ground contact as before.

**Test status.** `node --experimental-vm-modules --test patches/splatoon3/tests/issue-719-dualies-airborne-roll.test.mjs` passes 5/5. Two of the five (airborne admission and ground-contact continuity) fail with the adapter call disabled. Seven neighbouring Dualies and adapter files (`adapter`, `dualies-jump-lock`, `dualies-roll-recovery`, `issue-477`, `issue-eight-followup`, `action-admission`, `integration`) pass 80/80. `scripts/check-inkwave-patches.mjs --quick` passes.

**Unconfirmed.**
- The Splatoon 3 airborne downward speed, acceleration and trajectory are 未確認. The INKWAVE descent above is a provisional, engine-derived choice.
- The 30/60/120 Hz identity of admission and landing ticks is 未確認; this change's tests do not vary the render rate.
- Air tumble presentation in the procedural Character is 未確認 in a browser. `dualies-motion.mjs` does not read `dodge.airborne` yet.
- A real floor landing mid-roll is 未確認; the test sets only the grounded flag because the fixture has no floor.
- The coyote-window precedence is an INKWAVE choice and is 未確認 against Splatoon 3.
- #477 (4F startup) and #532 (distance calibration) are separate and are not resolved by this entry.
## 2026-10-10 — #1165 Roller band: CPU ownership vs GPU body (verification record)

- 対象: ローラーの本体（kind=roll）の塗り境界。CPU の所有判定（`_cpuSplat`）と GPU の本体 SDF の一致。INKWAVE 内部の CPU/GPU 不一致であり、本家との比較ではない。
- 本家の根拠: なし。本家のローラー塗り形状との一致は**未確認**（本件では本家の数値を使っていない）。
- 参照版・条件: 本家参照版 Ver.11.3.0（patches/splatoon3/README.md）。ブキ・ギアは対象外（Roller 本体の形状のみ）。
- INKWAVE 実装箇所: `patches/splatoon3/issue-batch-1171-adapter.mjs` の `#1165` 節。CPU 判定に GPU と同じ seed 依存の幅ゆらぎ（0.03 / 0.018 の振幅）を入れ、`-0.03 * r` の inset を外す。`adapter.mjs` 経由で適用（b7179419 由来、PR #1171 は closed・未マージ）。`runtime/dualies-slide-paint.mjs` の `ROLL_LATERAL_HALF` は同じ境界に合わせ、Dualies スライドの 1.8 m 半幅を維持する。`runtime/roller-max-paint.mjs` の bandHalfMax も同じ境界の最大値と一致。
- 再現操作: 半径 r=1、seed=π/60、方向 (1,0)、中心から (0, 0.73r) のセル。未修正の CPU 式は sd=+0.01r で塗らず、GPU 式は sd=-0.0298r で塗る。修正後は両方が塗る。
- プレイへの影響: 通常のローラー線の縁付近で、ターフ所有、被覆率、潜り・補充・敵インクの判定、Judd の値に影響しうる。影響量は未計測。
- 確認状態:
  - 自動テスト（ネイティブ）`patches/splatoon3/tests/issue-1165-roller-band-grid.test.mjs`: 合成済み paint.js の GLSL/CPU 式を照合し、半径 0.3 / 0.62 / 1.0、seed 5 種（π/60 を含む）、方向 4、グリッド中心の 238,140 セルで不一致 0 件。未加工の upstream では 3/3 失敗、合成後は 3/3 成功。
  - 隣接テスト 21/21 成功（issue-1165, issue-batch-1171, issue-979, issue-570, issue-189）。
  - 未確認（テストなし、実機・実ブラウザ計測が必要）: 実ブラウザの WebGL atlas readback による比較（PR #1171 ブランチの headless 4,000 セル比較は main に未取り込み）、30/60/120/144 Hz の描画差、既存の敵インク上への重ね塗り、bot の判断、決勝 Judd の差、実機での見え方。
  - 所有判定は 60 Hz 固定のシミュレーションで行われるため、描画フレームレートによる差は設計上想定しないが、このテストでは確認していない。
## 2026-10-10 — #1089 Dualies: Special 開始時に post-roll 射撃状態を破棄する

**本家の根拠（未確認の部分を含む）.** Inkipedia「Splat Dualies」は、ローリング後の 4F 発射待ち、ローリング後の照準統合を記載するが、Special と post-roll 射撃状態の関係には触れていない（閲覧日 2026-10-10、先頭 100,000 文字）。Drive の `INKWAVE-weapon-audit-20261009.md` も Dualies の Special 相互作用を扱っていない。Nintendo 公式 Ver. 11.3.0 の更新履歴は本件では未照合。Special が post-roll 状態を破棄するという S3 の内部規則は、本件では**未確認**であり、このエントリで本家一致とは認定しない。

**INKWAVE 実装箇所.** 修正は PR #1182 系 commit `e6c0107d`（`origin/pr-1182-head` 等）にのみあり、main（`97ae3fec`）には存在しなかった。移植先は `patches/splatoon3/runtime/weapons.mjs` の `installWeapons` 内 `special:use` 購読。成功した特殊開始（`inkwave-public/src/game/actor.js` の `_startSpecial` の `emit('special:use')`、および Storm・Trizooka・Ink Vac 等の kit 経路）のみで、Dualies の自機について `s3Turret`、`s3DodgeShotPending`、`s3GateDodgeShotPending`、`s3DodgeShotRemaining` を破棄する。リモート actor と他ブキは対象外。不成立の特殊入力では発火しない。ink・ロール回数・移動/回復クロック・クールダウンは変更しない。

**再現操作.** 練習場で Dualies を使い、有効な Dodge Roll を行い、4F 発射待ち後に turret 発射を 1 回以上行う（`s3Turret === true`）。静止したまま ZR を押し続けて特殊を発動し、終了まで待つ。修正前は特殊終了後の最初の発射が `lockInterval = 4F` かつ `spreadLock = 0` のまま出る。修正後は ZR の保持・解除にかかわらず通常の 5F・非零拡散に戻る。4F gate 中の特殊発動では、保留中の旧射撃が特殊後に再開しない。

**プレイへの影響.** 修正前は、ZR を押し続けたまま特殊を使うと、新しい Dodge Roll なしで turret の 4F 連射と 0° 拡散が特殊後にも残った。修正後は特殊が post-roll 状態を終える。通常の 4F turret 連射、0° 拡散、Dodge の距離とタイミングは変更していない。

**確認状態.**
- 自動テスト: `patches/splatoon3/tests/issue-1089-dualies-special-interruption.test.mjs` 7/7 pass。修正を外した同条件の対照（negative control）で旧挙動の残留を再現。修正前の main では 7 件中 5 件が失敗（うち 1 件は negative control の前提確認。修正前は listener が無いためネガティブ対照を組めない）。残りの 2 件（新規 Dodge 後の turret 再成立、拒否された特殊入力と kit 不成立の保持）は既存挙動の回帰確認として通過。
- 回帰: 近傍テスト 12 ファイルを実行。前半 5 ファイル（`issue-1008-1020-1037-1053`、`issues-1041-1047-action-windows`、`dualies-reticle-state`、`dualies-recovery-pending`、`dualies-gate-owner-composition`）25/25 pass。後半 7 ファイル（`dualies-roll-recovery`、`weapon-gates-batch`、`weapon-edgecases`、`issue-575-dualies-independent-aim`、`issue-477`、`action-admission`、`issue-883-dualies-scalar-spread`）82/82 pass。
- ローカル論理検査のみ。ブラウザ実動作、Nintendo 実機比較、S3 の Special 中の挙動は**未確認**。特殊中の状態が S3 でどう扱われるかは未確認のまま残す。
## 2026-10-10: Squid Surge after an away-stick detach (#951)

**Splatoon 3 basis.** Issue #951 cites the wikiwiki.jp controls page (操作方法) for "away push cancels Squid Surge while charging or climbing the Surge" under Ver. 11.3.0. That page returned HTTP 403 to both WebFetch and curl, so the claim is **未確認**. Inkipedia's [Squid Surge page](https://splatoonwiki.org/wiki/Squid_Surge) (no version or date stated for these lines) says the Surge can be cancelled into a Squid Roll by pressing B and flicking the Left Stick away from the wall at the same time, and into weapon attacks by the attack button. It does not say a plain away push without B cancels the Surge. Inkipedia's armor text covers only the Squid Roll. No Surge frame values are used here.

**INKWAVE implementation.** `patches/splatoon3/runtime/movement.mjs`, `retireAwaySurge()`, called from the `Actor.prototype._updateClimb` wrapper right after the native `climb.apply`. It acts only when the ordinary detach ran this tick (was climbing, now not; `climbExit` 0.3; `vel.y` 3.2; `into < climbDetachDot` (-0.45 in `inkwave-public/src/config.js`); move length above 0.01, matching the native `mh > 0.01` gate). It clears the burst `s3.surge`, `s3.actions.surge`, the burst's pending or running armor, and the synced alias. Ledge launches, ink-support loss, charge-phase cancels and the existing wall Roll priority (#714) are not changed.

**Reproduction.** Wall-climb as squid, hold B to a 25/50/75/100% charge, release B while still on the wall (burst starts), then on the next fixed tick push the Left Stick away from the wall without B. Before the fix `s3.surge` stays in `burst`; after it, `s3.surge` and `s3.actions.surge` are null on that same tick. A 30/60/120 Hz render schedule produces an identical fixed-tick trace. Wall-top launch keeps the burst and its armor, and ink loss without away input keeps the burst.

**Gameplay impact.** Only the stale Surge object after a plain away cancel is removed. Speeds, boost duration (`surge.duration`), armor values and the wall-Roll (B + flick) path are unchanged.

**Confirmation.** Node logic tests only: `patches/splatoon3/tests/issue-951-surge-away-cancel.test.mjs` (8 production-composed cases, failing 5/8 on unpatched main before the fix) and 10 neighbouring Surge/wall tests pass. Browser rendering and Switch comparison are not done. Still 未確認: whether Splatoon 3 cancels a Surge on a plain away push with no B, and the armor-after-cancel claim from the issue (the test on unpatched main stopped at the Surge-state assertion, so it did not isolate armor). The wrapper already clears `armorPending` on detach, so armor is not separately confirmed as stale.

## 2026-10-10 (#725): gyro sensitivity endpoints

- 本家の根拠: DamianS-eng/GTuner-TitanTwo の README 注記2（https://github.com/DamianS-eng/GTuner-TitanTwo ）は、Splatoon 3 の本家モーション設定のみで出力:入力比が最低 約1:1、既定 約1.8:1、最高 3:1 と述べる。ゲーム版・計測環境は記載がなく、第三者計測であり Nintendo 公式資料ではない。中間の設定値は公開されておらず **未確認**。
- INKWAVE実装箇所: `patches/splatoon3/adapter.mjs` が `inkwave-public/src/core/gyro.js` の `GYRO_DEG` を `[[-5,360],[0,200],[5,120]]` に置換する（main の `8c351574`）。中間は端点間の線形補間、利得は `360 / gyroTurnDeg(sens)`。公開版の表 `278/178/132/119/110` では -5 が 1.295x、+5 が 3.273x だった。
- 再現操作: 感度 -5 / 0 / +5、端末を立てた状態で 90 度/秒の偏向を 2 秒、ジャイロ入力の `_sample` 出力を物理 180 度と比べる。
- プレイへの影響: 既定値（0）の利得が公開版の 2.73x から 1.8x へ下がる。物理 90 度の旋回は -5 で 90 度、+5 で 270 度になる（公開版は約 116.5 度、約 294.5 度）。操作感が大きく変わるため、実機確認までは本家一致とは扱わない。
- 確認状態: 論理試験のみ。`patches/splatoon3/tests/gyro-sensitivity-endpoints.test.mjs` 4/4 が通る。30 / 60 / 120 Hz の一定角速度でも積分結果は一致する。低速の平滑化・引き締め（約 3〜10 度/秒の境界）は試験していないため、フレーム間隔依存は **未確認**。未確認: Ver.11.3.0 の同条件実機計測、-2.5 / +2.5 など中間設定、Joy-Con / Pro Controller 実機入力、iOS / Android の DeviceOrientation 実動作。Issue #725 の中間値と実機一致の受け入れ項目は未達のまま。
## 2026-10-10 — #498 Roller age-width recheck (no code change)

- 本家の根拠: 固定した Leanny/splat3 `7280ff9cde8bb1c5dcef46c700c326471584d2e6` の Ver. 11.3.0 Roller `PaintParam` では、横は `ChangeWidthStartFrame=20`、縦は `30`、どちらも `ChangeWidthEndFrame=50`、`ChangeFrameWidthRate=0.6`。パラメータ解説は倍率の最小値・開始・終了の意味だけを示し、開始から終了までの補間形と丸めは示さない。Web 検索と Google Drive 検索でも中間曲線の一次根拠は見つからなかった。
- INKWAVE 実装箇所: `patches/splatoon3/runtime/roller-impact-paint.mjs`（`rollerPaintAgeMultiplier` は線形の暫定補間）、`patches/splatoon3/adapter.mjs`（Roller trail への配線）、着弾 paint は `withRollerImpactPaint`。
- 再現条件: `patches/splatoon3/tests/issue-498-roller-paint-age-endpoints.test.mjs` は 30/60/120 Hz で横 13 種・縦 5 種の全ユニットを、境界 19/20/49/50F（縦は 29/30/49/50F）で確認し、6/6 件合格。
- プレイへの影響: 20F/30F の開始と 50F の 0.6 倍という端点は source とテストで一致。20F〜50F の幅の減り方と、フレーム丸めは未確認のまま。
- 確認状態: 端点はテスト確認済み（ロジック単独の測定であり、実機比較ではない）。中間曲線とフレーム丸めは未確認で、実機のフレーム計測が必要。#498 は Open のまま。
## #912 Tidal Slam の地上 Triple Splashdown 拳2つ（2026-10-10、上書き担当）

- 本家の根拠: Splatoon 3 Ver. 11.3.0 の Triple Splashdown（通常発動）は本人の爆発に加え、インクの拳2つがそれぞれ爆発する。Splatoon Wiki「Triple Splashdown」（v11.3.0: 拳の移動 6 → 6.54、±30°、220ダメージ半径 7 → 6.4、60ダメージ半径 10.5 → 9.6、拳の遅延 0.25秒、拳の爆発 220 近距離 / 60 遠距離。Super Jump 時は拳なし）。Nintendo 11.3.0 注記は Issue 本文の引用で、ページは今回再取得していない。Leanny 抽出（commit `7280ff9c`）に拳のパラメータはない。
- INKWAVE 実装箇所: `patches/splatoon3/runtime/triple-slam-fists.mjs`（新規）、`patches/splatoon3/runtime/install.mjs`（`installTripleSlamFists(api, profile)`）。テスト: `patches/splatoon3/tests/issue-912-triple-slam-fists.test.mjs`。地上の `_startSpecial` で拳を登録し、本体の `_slamImpact` から 15F 後（固定 60 Hz）に拳2つを独立に判定する。Super Jump Slam は `_startSpecial` を通らないため拳を作らない。
- 再現操作: 地上で Tidal Slam を発動して着地する。本人正面 ±30° の 6.54 地点（x=±3.27, z=5.66 付近）の敵は、本人の爆発半径（5.2）の外でも拳爆発で被弾する（6.4 以内 220、9.6 で 60）。拳の重なり域は両方が加算される（例: 2 つの拳の中点で 440）。着地の 15F 前には拳のダメージがない。
- プレイへの影響: 変更前は拳の範囲が 0 ダメージだった。変更後は前方に追加の爆発域が増え、重なり域で加算ダメージが出る。拳の塗りは個人ターフのみに加算し、スペシャルゲージは増えない（本人の爆発と同じ扱い）。
- 確認状態:
  - 論理テスト 9 件（合成 Actor の 7 件、本番インストーラーの合成 Slam 1 件、配線の確認 1 件）と近接する Slam テスト（28 件・68 件）は通過。固定 60 Hz の 15F 遅延、1/120 s 刻みでも 0.25 s で発火すること、壁による拳の遮断、Super Jump と remote で拳を作らないこと（コード経路と合成試験）を確認。ブラウザ実動作、Switch 実機比較は未実施。
  - 意図的な差分（Draft PR #1181 からの変更）: 拳は `special:slam` を発火しない。boss.js の 180/55 splash が拳ごとに追加で当たるのを避けるため（拳の表示は local のみ）。本体が着地前に死亡した場合は拳を打ち切る（本家の挙動は未確認。Wiki は拳が本人の着地後に爆発すると記載）。塗りは `claimMode: 'no-special'` で本人の爆発と同じ扱い。
  - 未確認: 拳の床追従・段差・短い壁の乗り越え（LOS 遮断は近似）、220 から 60 への減衰形（直線補間は INKWAVE の選択）、拳のメッシュ・VFX・SFX、拳の塗り半径 10（Wiki のインク飛沫半径 v9.3.0 を流用）、拳の表示のリモート同期（未実装）、本家の数値の一次資料による確認。
## 2026-10-10 — #573: enemy-ink contact during Tidal Slam protection

Reference: Splatoon 3 Ver. 11.3.0. Nintendo's [11.3.0 notes](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/) (fetched 2026-10-10) say that after activation players "become invulnerable to damage approximately 1/6th of a second faster than before". The notes do not mention enemy ink. The 50F player boundary is the pinned Leanny `WeaponSpPogo` value already recorded in the 2026-10-08 entry (`spl__WeaponSpPogoParam.Rise_NoDamageStartFrame=50`).

- Gap: `slamProtected` (`patches/splatoon3/runtime/tidal-slam-gauge.mjs`) gated weapon damage admission, but the enemy-ink branch of `updateResources` (`patches/splatoon3/runtime/resources.mjs`) checked only `a.invuln <= 0` and then wrote `a.hp -= damage` directly.
- Fix: that branch now also requires `!slamProtected(a)`, the same admission as weapon damage. This covers both the 50F+ action window and the landing owner's protection until `finishTidalSlamGauge`. Enemy-ink progression before 50F is unchanged.
- Reproduction: activate Tidal Slam on ground, step to 49F, then 50F and 51F while standing on enemy ink (profile: 18 HP/s, cap 40, grace 0). Before the fix, one 1/60 s tick at 50F lowered HP from 99.7 to 99.4. After the fix it is rejected; after landing and `hardLand`, it is rejected until the landing owner clears; then it resumes.
- Play impact: enemy ink no longer bleeds through Slam's full-invulnerability window, so it matches the weapon-damage rule for the same window.
- Tests: `tests/slam-damage-state.test.mjs` new case `#573 enemy ink contact ...` fails before the fix and passes after; the file is 6/6. Neighbouring `movement-resources`, `issue-731-sub-ready-enemy-ink`, `issue-160-enemy-ink-form` and `tidal-slam-damage` pass 45/45.
- Unverified (未確認): whether retail Triple Splashdown invulnerability blocks enemy-ink contact is not stated by Nintendo and was not measured; this INKWAVE rule follows the issue's "ink/environmental damage follows the verified special rule" criterion and is not a retail capture. The post-landing protection duration remains a capture gap, unchanged. No device or Switch comparison was run.
## 2026-10-10 — #532 Splat Dualies dodge-roll displacement (5.0 units instead of the inherited 2.8)

- 本家の根拠（比較基準 Splatoon 3 Ver.11.3.0。移動距離の公式値は未確認）:
  - Splatoon Wiki "Splat Dualies" の Dodge Roll: 「ロールアニメ中に 4.0 units、その後のスライドで 1.0 units」、合計 5.0 units。4f の startup、12f のアニメーション、アニメ後 4f でショット再開。
  - Splatoon Wiki "User:XarrotD/newdata"（oldid 575090、2024-05-05 版の利用者作業ページ）: 5.0DU、4f startup、12f roll、4f shot cooldown。一次資料ではない。
  - Splatoon Wiki "DU": 距離単位の m 換算は非公式（conjectural タグ付き）。wiki は DU と WU の対応を示さない。
  - Leanny/splat3 `7280ff9c`: `WeaponManeuverNormal` の `SideStepParam.MoveFrame = 12`。距離フィールドは抽出されていないため、5.0 は抽出値ではない。
- INKWAVE 実装箇所: `patches/splatoon3/profile.json` の `dualies.rollDist = 5`（従来は汎用の 2.8 が S3 build に継承）。`dodgeVel` は `rollDist` を `movement-physics.mjs` の `dodgeIntervalDistance` で 12F に積分する。`reference/numeric-status.json` に `weapons.dualies.rollDist` を記録。
- 再現操作: Splat Dualies、平坦で障害物なし、静止から 1 回ロール。前後左右の 4 方向で、ロール移動フェーズ（12F）の水平変位を積分する。
- 差分: 修正前の総量は 2.8、本家の 5.0 に対して 56%。修正後は 5.0 を既存の前傾積分（`1.5 × rollDist / rollTime × (1 − u²)`）で配分する。ロールの時間、ink 7%、4F 射撃ゲートは変更しない。
- プレイへの影響: 1 回の回避の移動量が約 1.8 倍になる（DU と WU を 1:1 とみなす場合）。連続 2 回のロールの総量も同じ比率で増える。
- 出典の経路: 未マージの `fix/inkwave-10-issues-20261009` の e48cbc9f（profile）、ec0f43b2（試験）、ac9af891（numeric-status の rollDist 部分のみ）を main に移植した。`issue-477.test.mjs` の期待値コメントを 5.0 に更新。
- テスト: `patches/splatoon3/tests/issue-532-dualies-dodge-distance.test.mjs`（5 件）。rollDist を 2.8 に戻すと 5 件とも失敗することを確認。関連する dualies / roll の targeted tests 10 ファイルと `check-inkwave-patches.mjs --quick` は失敗 0。
- 確認状態:
  - 確認済み（公開版 Actor 上の決定的な単独テスト。60Hz 固定刻み）: 4 方向で総量 5.0、12F のダッシュ所有フェーズ。
  - 未確認: S3 DU から INKWAVE world unit への物理スケール（1:1 は既存の raw 値運用に従った仮定。wiki は m 換算を非公式とする）。
  - 未確認: 4.0（アニメ中）と 1.0（スライド）の分配。今回は分配を新設せず、12F の積分で総量だけを合わせた。
  - 未テスト: 2 連続ロールの総量、壁衝突での打ち切り、30/120 Hz 描画での終点一致、坂や段差上のロール。
  - 本家の実機比較は未実施。上記の単独テストは実機比較の代用にならない。
## #905: Ink Storm after its owner disconnects (2026-10-10, partial)

- 本家の根拠: 切断時の扱いは、コメント記録の Splatoon Wiki「Communication error」（no-bot 切断の参照）のみ。本セッションでは未再取得。切断後の Ink Storm の持続・塗り・ダメージの一次根拠（Nintendo 公式、実機）は未確認。
- INKWAVE 実装箇所: `patches/splatoon3/runtime/disconnect-fidelity.mjs` の `retireDisconnectedStorms`（退場した持ち主の雲と Storm 投擲を全 peer で回収。ライブ経路 `deactivateDisconnectedActor` と未開始経路 `onLeave` の両方）。`_tick` / `_play` の退場済み持ち主の遅延パケット遮断。採用（adoption）による権限移譲は行わない（現行の no-bot 退場方針）。
- 再現操作: 通常のオンライン Turf War で持ち主が Storm を発動し、雲が塗り範囲にある間に切断する。残りの雲・投擲は全 peer で消え、塗り・得点・ダメージは以後発生しない。
- プレイへの影響: 切断直後から Storm の雨が止まり、切断前に受信済みの持ち主の塗りは保持される（履歴の得点は残る）。
- 確認状態: 回帰試験 `issue-six-followup-network-paint.test.mjs` の #905 の 2 件（ホスト・非ホストの退場、遅延パケットの遮断、30/60/120 Hz の固定更新での回収結果の一致）でロジックのみ確認。実際のマルチクライアント、本家の実機比較は未実行。
- 未確認・未対応: 退場時に各 peer で未再生の切断前スプラットを `peer.events` から破棄するため、peer 間で再生済み／未再生の境界が一致するかは未確認。切断後の Storm の残り時間・塗りの本家の挙動は未確認。採用・権限移譲の受け入れ条件は現行の退場方針により対象外。
### #1022 — Bucket Slosher random-yaw bias (RandomRotateYBias)

Splatoon 3 reference: Ver. 11.3.0 Bucket Slosher, pinned source record `WeaponSlosherStrong.game__GameParameterTable.json` at Leanny/splat3 `7280ff9c`. Unit 1 (`RandomRotateYOffOrderNum` [0]: bullet 0 exempt) and Unit 2 carry `RandomRotateYDegree` 4.5 and `RandomRotateYBias` 0.65. The native sampling law of the bias field is 未確認: no official or community definition was found, so the source-backed meaning is not asserted.

INKWAVE implementation: `slosherYawOffset()` in `patches/splatoon3/runtime/weapons-fidelity.mjs`, called from the launch yaw. Exempt bullets consume no random number; every other bullet consumes exactly one. The normalised draw x in [-1, 1] maps to sign(x)·|x|^(1+bias)·4.5°. Bias 0 is the uniform control. This curve is an INKWAVE calibration, not a Nintendo distribution. The unused parallel `biasedSourceYaw`, whose "deviation law" attribution was unverified and whose parameter direction differed from the live law, was removed.

Reproduction (logic only): with a fixed RNG draw of 0.75, Unit 2 bullet 0 gives a launch yaw delta of about 1.43° at bias 0.65 and 2.25° at bias 0 (uniform). Unit 1 bullet 0 gives 0° and consumes no draw. Regression tests: `patches/splatoon3/tests/issue-1022-slosher-yaw-bias.test.mjs` and `weapons-fidelity-source.test.mjs`.

Play impact: the lateral spread of Slosher globs (edge hits, cover contact, lane shape, turf placement) may differ from the native game. Relative to uniform, the calibration concentrates globs nearer the aim line. The magnitude is not measured on Switch.

確認状態: 未確認. The bias sampling law, native distribution parity, and deterministic replay/network reproduction of the yaw are not verified. The numbers above are calculations from the calibration formula, not Nintendo or device measurements. Fixed on logic only: the bias field is consumed, exemption draws and the 4.5° range are covered by tests.
## 2026-10-10: Blaster normal timed airburst paint (#1107)

- 本家の根拠: Ver. 11.3.0 の標準ブラスターは `spl__BulletBlasterBurstParam` の既定値を省略する疎な JSON で、`SplashPaintRadius = 2.0`、`SplashDropPaintRadius = 3.2`、`SplashDropOn = true` が既定として残る（Issue 本文の出典: sendou.ink/params/blaster、Inkipedia の既定表、Leanny/splat3 `7280ff9c`）。出典の数値は既存の `BLASTER_BURST_PARAM_DEFAULTS` で解決済み。ショット衝突の `SplashDropPaintShotColHitRadius = 2.5` は #1001 の別経路。
- INKWAVE 実装箇所: `patches/splatoon3/runtime/weapons-fidelity.mjs` の `applyFidelityBlasterBurstPaint`、非衝突（通常の時限爆発）分岐。既定値の解決は `resolvedBlasterBurstParam` / `blasterPaintContract`。
- 前の状態: 通常爆発の床塗りが、爆発点から 3.5 下の下向きレイキャストで床の交点に半径 2.0 を置いていた。爆発が床の上 2.0 を超える高さでも床を塗り、3D の球としては届かない床を塗っていた。
- 修正後: 爆発点中心に `SplashPaintRadius` (2.0) の `paint.splat` を置く。`inkwave-public/src/world/paint.js` の splat は面ごとに中心からの平面距離 `dn` が半径以内の面だけを、半径 `sqrt(r²-dn²)` で塗る。下向きの床スタンプは使わない。落下する飛沫（`SplashDropPaintRadius` 3.2）は既存の固定 60 Hz の `queueTimedBlasterDrop` を使う。
- 再現操作: 標準ブラスターで空中の 13F 時限爆発を、床の上 2.5 前後の高さで起こす。修正前は床の交点に半径 2.0 の塗り、修正後は爆発点から半径 2.0 の球の届く範囲だけが塗られる。
- プレイへの影響: 通常爆発の床塗り範囲が、爆発の高さに応じて小さくなる（床が球の外なら塗られない）。飛沫の半径と数値は変えない。
- 確認状態: 回帰試験 `patches/splatoon3/tests/issue-1107-timed-burst-centre.test.mjs`（ソース束縛と `paint.js` の球の幾何）と既存の #1107 系試験は通過。ブラウザ・実機での塗り範囲の比較は未確認。
- 未確認: 落下飛沫の重力は `api.PLAYER.gravity`（フォールバック 20）のままで、Blaster の出典付き値には接続していない。飛沫の初速と重力の本家値は未確認。30/60/120 Hz での不変性はクロックが固定 60 Hz である設計で説明されるが、この項目の専用試験は無い。フライト飛沫との二重計上の確認も未了。PR #1188 の球・`spawnSplashDrop` 方式は本ブランチに移植していない。
## 2026-10-10 — #997 ordinary weak-diagonal walking gait (PARTIAL, no behavior change)

本家の根拠: 基準は Splatoon 3 Ver. 11.3.0（Issue #997 記載の Nintendo サポート情報）。本セッションでは S3 の歩行クリップ、フレーム値、実機キャプチャを参照していない。リポジトリ内の公式映像（`s3_howtoplay_move01–03`、上記 HUD 記録の参照）は歩行の計測に使っていない。

INKWAVE 実装箇所（main 97ae3fec を読んだ範囲）:
- `patches/splatoon3/runtime/walk.mjs` 211–219: 歩行の時計は移動速度で一つ。方向による歩幅の縮小（旧 sideStrideCut）は外れている（c8aa54d3 のコメント）。
- 同 39–47: 骨盤ひねり `strafeTwist` は手調整の連続式のまま。S3 の基準がなく未確認。
- 同 226–230: 足の目標は手調整の横幅・速度の式で作る。未確認。
- `patches/splatoon3/runtime/legacy-walk-curves.mjs`: 向き別の歩容は Splatoon（Wii U）`Player00_anim.szs` 由来（歩行 40F、走行 32F、`calibratedRuntimeRate: false`）。ファイル冒頭の注記どおり S3 のデータではない。
- 同 318 `weakDiagonalWalkTrace`: 斜め歩行の再現用トレース（`s3CurveVerified: false`）。未マージ枝 `inkwave/gpt6-seven-next-20261008-71` の e774ec73 と同内容で、main には c8aa54d3 経由で入っている。

既存テスト: `patches/splatoon3/tests/legacy-walk-reference.test.mjs`（方向別 4 クリップ、弱い斜めの歩行時計が前進と一致、トレースの出典の境界）と `walk-gait-phase.test.mjs` の計 30 件が合格。

再現操作: Issue #997 の手順（0.25–0.5 の弱い斜め入力、30/45/60°、横歩き）は未実施。実ブラウザでの比較も未実施。

プレイへの影響: 本エントリでは挙動を変更していない。弱い斜め歩行の歩幅・足運び・骨盤の見た目は、S1 由来の形と手調整の式のまま。

確認状態: 未確認。S3 の基準キャプチャ（60 fps、速度・方向の行列）と、歩行から走行への切替の計測が必要。ロジック単独の試験は実機比較の代わりにはならない。
## 2026-10-10 — #79 Splattershot floor-impact paint footprint

- 本家の根拠: Leanny/splat3 コミット `7280ff9cde8bb1c5dcef46c700c326471584d2e6` の `data/parameter/1130/weapon/WeaponShooterNormal.game__GameParameterTable.json`（SHA-256 `dfca9f45…4cb9` を取得時に照合、`reference/curated-numbers.json` の記録と一致）の `GameParameters.PaintParam`（参照版 Ver. 11.3.0）: WidthHalfNear 1.93, WidthHalfMiddle 1.93, WidthHalfFar 1.71, DistanceMiddle 1.1, DepthScaleMax 2.24, DepthScaleMin 1.31, DepthScaleMaxBreakFree 2.24, DepthScaleMinBreakFree 1.12。床着弾の角度閾値・遠距離の端点・壁着弾の専用値は記録に無い。Splatoon Wiki の検索では Splattershot 本弾の床・壁着弾値は得られず（Blaster 系のみ）、公式パッチノートにも該当値は無い。
- INKWAVE 実装: `patches/splatoon3/runtime/shooter-impact-paint.mjs`（新規）。`runtime/weapons-fidelity.mjs` の `installWeaponsFidelity` が `WEAPONS.shooter.impactPaint` を凍結（欠落・不正値は fail closed）、`Projectiles.prototype._impact` が kind `shooter`、type `shot`、床法線 `normal.y >= 0.4`（nearest splash と同じ閾値）の着弾のみ置換。対象の `shooter` は config の表示名 Spritzer。`inkwave-public/` は未変更。
- 変更: 床着弾の塗り半径を `radius × (0.85〜1.15)` の乱数から、距離帯の決定的な値に置換。距離 ≤ DistanceMiddle で WidthHalfNear、それ以降は WidthHalfMiddle→WidthHalfFar を射程（`w.range`）まで線形補間。伸び（`stretchAmt` = DepthScale − 1）は着弾角度 10°〜35° の線形補間で、straight 位相は DepthScaleMax/Min、brake・free は BreakFree 側。FX・音・乱数の消費順は従来どおり。換算は既存の `worldUnitsPerSourceUnit = 1`（flight paint・nearest splash と同じ）。
- 再現操作（単独測定、fixture 上で `_impact` を直接呼ぶ）: 床の近距離 0.8 で、角度 5° / phase 0 → 半径 1.93、伸び 1.24。角度 60° / phase 0 → 伸び 0.31。角度 60° / phase 1 → 伸び 0.12。シード 1・42・87654 で同一。壁法線の着弾は従来経路のまま（半径 0.72〜0.98）。
- プレイへの影響: 床の本弾塗りが従来の約 0.72〜0.98 から 1.93 へ拡大し（約 2〜2.7 倍）、浅い角度ほど伸びる。ターフ面積と敵インクの見た目に影響する。飛沫（#873 の flight paint 経路）と nearest splash は変更なし。
- 確認状態: ロジック単独の測定と既存試験 91 件（#873、#94、#674、#411、#498、#1011 ほか）と新規 6 件のみ。ブラウザの実動作および本家の実機比較は未実施。未確認（根拠なく解消済みにしない）: (1) 遠距離帯の端点（暫定で射程を使用）、(2) 角度閾値 10°/35°（Shooter 記録に無く、Splat Roller の既定値を暫定流用）、(3) 位相→envelope の対応（Roller #611 の規則を暫定流用）、(4) 壁着弾の専用フットプリント（未変更）、(5) 換算スケール 1 による面積の妥当性、(6) Splattershot の床塗り形状と面積の実機計測。
## 2026-10-10: Turf War guest input after the host end (#838)

- 本家の根拠: Play Nintendo の Splatoon 3 tips（https://play.nintendo.com/news-tips/tips-tricks/splatoon-3-tips-and-tricks/）は、Turf War を「three-minute, 4-vs-4 battle」と記載（本セッションで確認）。参照版は Ver. 11.3.0（Issue 本文の Nintendo Support 記載、本セッションでは未取得）。終了判定後の入力受付、通信遅延下での終了境界は公式資料で確認できず、未確認。
- INKWAVE 実装箇所: pin 版 `inkwave-public/src/net/netmatch.js` の `_hostClock` は変更せず、`patches/splatoon3/adapter.mjs` の netmatch ブロックで `recordHostDeadline` を接続。`patches/splatoon3/runtime/turf-finish.mjs` の `recordHostDeadline`（残り時間から中継 RTT を引き、0〜0.5 s に制限）と `blockExpiredGuestInput(match, dt)`（ホスト期限を tick ごとに減算し、尽きたら入力を閉じる）。`match.js` の `updateController` から `dt` を渡す。
- 再現操作（ロジック単独・決定的 fixture）: ゲストのローカル時計 0.45 s、ホストの `c` が「残り 0.5 s、RTT 400 ms」で届く。ホスト終了は受信後 0.1 s。従来は約 0.35 s 後のローカル 0 まで撃てたが、修正後は 0.1 s 後に入力が閉じる。100/250/500 ms の finish パケット遅延でも、finish 到着までに撃てない。
- プレイへの影響: 修正はゲストの入力受付のみを変える。HUD の時間表示、塗り判定、finish 状態への遷移（ホストの `st:finish` を待つ）は変えない。ローカル時計が 0.2 s 超ずれる場合の半補正は既存のまま。
- 確認状態: 単独の決定的試験のみ。`reliability/tests/guest-deadline-input.test.mjs` 13 件 pass（新規 2 件は hook を外すと 2 件 fail）、隣接 5 試験ファイル pass、`check-inkwave-patches --quick` OK。実機・ブラウザ・実ネットワーク遅延での比較は未実施で、この結果を実機比較の代用にしない。
- 未確認として残すもの: 片道遅延は中継 RTT からの推定（ホスト側の経路は未計測、対称と仮定）。`c` は 0.5 s ごとに届くため、古い標本は受信後の経過時間を減算して扱う（回線が止まると最後の標本の期限で入力が閉じる）。終了時刻の共通エポック化（プロトコル変更）、ホスト側での所有者イベントのタイムスタンプ拒否は未実装。#410 の射出済み弾・塗り、#878 の永久 hidden host は別件。Drive の "INKWAVE" + "Splatoon" 検索では遅延・終了計測の資料は見つからず（題名ベース、未読）。
- Issue #838 は閉じない。
## 2026-10-10: #891 Splat Dualies normal-fire outer-reticle bias

- **本家の根拠 (Ver. 11.3.0):** pinned Leanny/splat3 `7280ff9c` `WeaponManeuverNormal` WeaponParam (mirrored in `profile.json` `weaponsFidelityCompletion.weapons.dualies.WeaponParam`): `Stand_DegBiasMin` 0.01, `Stand_DegBiasKf` 0.01 (+1 point per admitted normal shot), `Stand_DegBiasDecrease` 0.005 per frame, `RepeatFrame` 5 (recovery hold after the last successful shot), `Jump_DegBiasMax` 0.4. `Stand_DegSwerve` 2 and `Jump_DegSwerve` 7.5 are the angular envelope endpoints. The 25% cap is not in the pinned table; it is the Inkipedia Splat Dualies value.
- **INKWAVE implementation:** `patches/splatoon3/runtime/dualies-accuracy.mjs` (new `DualiesAccuracy`), `patches/splatoon3/runtime/weapons.mjs` (per-runner `s3DualiesAccuracy`, fixed-step `advance(dt)`, outer-chance sample in the `Projectiles.fireDualies` wrapper, only for shots admitted by the runner's own fire loop; direct `fireDualies` calls keep the cone they are given). `profile.json` is unchanged. The per-shot native RNG budget pinned by `tests/issue-575-dualies-independent-aim.test.mjs` rises from 3 to 4 draws for admitted normal shots (one outer-reticle draw before the spread draws); this is a deliberate change for owner review.
- **Before:** `_spreadDeg` scaled the cone radius by the generic bloom (+0.25 per shot, full after 4 shots, 0.28 s-scale decay with no hold).
- **After:** each admitted normal shot draws the outer-reticle chance (1% start, +1% per shot, 25% cap, 40% while airborne). Recovery waits 5 frames after the last admitted shot, then falls 0.5 points per frame. The inner-shot kernel is 0.45 x envelope (the existing provisional ratio). Envelope 2 deg grounded / 7.5 deg air and turret `spreadLock` 0 are unchanged. Empty clicks do not advance the state.
- **Reproduction:** grounded Dualies from a standstill, hold ZR, count admitted shots (shot 1 = 1%, shot 25 = 25%); release ZR and observe recovery starting at frame 6 after the last shot; repeat airborne (40%).
- **Player impact:** sustained fire reaches the maximum outer chance after 24 admitted shots instead of 4; accuracy recovers only after the 5F hold.
- **確認状態:** logic-level regression `patches/splatoon3/tests/dualies-bias-891.test.mjs` (fails on the HEAD `weapons.mjs`), run in node at 60 Hz fixed steps; the recovery boundary is checked at 30/60/120 Hz cadence. Targeted node runs passed for 15 Dualies and shooter files (`dualies-bias-891`, `issue-883-dualies-scalar-spread`, `shooter-accuracy`, `dualies-reticle-state`, `dualies-jump-lock`, `dualies-gate-owner-composition`, `dualies-recovery-pending`, `dualies-roll-recovery`, `dualies-teammate-block`, `dualies-radius-owner`, `issue-575-dualies-independent-aim`, `issue-424-dualies-brake-checkpoints`, `wall-drop-dualies-guards`, `catalog-dualies-clock`, `dualies-swim-start`). `dualies-motion` and the full suite were not run in this session. Not verified: browser play, Switch measurement. **未確認:** the 25% cap in primary data; the inner-kernel distribution; whether airborne shots advance the grounded state; the landing transition of the bias; remote-owner sampling; the HUD reticle still reads the generic bloom cone. Draft PR #1188 models the same state as a median-angle gamma quantile rather than an outer-reticle chance; that conflict is unresolved here and the outer-reticle reading follows the issue text.
## 2026-10-10: Android gyro drift under an effectively zero rate (#187)

- **本家の根拠**: Nintendo 公式の設定は Motion-Control Sensitivity（-5〜5、傾けたときのカメラ回転量）のみで、静止判定や不感帯の数値は公開されていない（[Inkipedia Options](https://splatoonwiki.org/wiki/Options)）。ジャイロ入力の内部処理（角速度入力か否か、不感帯）は未確認。単位の一般仕様は W3C Device Orientation and Motion の rotationRate が deg/s、姿勢の基準座標は実装依存（[W3C](https://www.w3.org/TR/orientation-event/)）。
- **INKWAVE 実装箇所**: `patches/local-quality/gyro.mjs` の `STILL_DEG = 0.35`（deg/s、#615 の静止定義と共有する工学値）。Android では rotationRate の大きさが STILL_DEG 以下のとき、姿勢基準は更新しつつ視点差分を積まない。従来は3軸が厳密に0のときだけ適用されていた。iOS は変更なし。
- **再現操作**: Android UA、ジャイロ有効、姿勢の向きを 1 deg/s で 10 秒ドリフトさせ、rotationRate の大きさを 1e-4 / 0.01 / 0.35 deg/s にする（ローカル probe）。変更前は 1e-4 deg/s で視点が約 0.31 rad 累積し、厳密な0のみ 0。変更後は 30/60/90/120 Hz すべて 0。
- **プレイへの影響**: Android で静止中の視点の流れが抑えられる。代わりに STILL_DEG 未満のゆっくりした実回転（0.35 deg/s 未満）は視点へ反映されない。1 deg/s 以上の実回転と閾値超えの rate は従来どおり反映される（回帰試験あり）。
- **確認状態**: 単体試験（`patches/local-quality/tests/android-stationary-tolerance.test.mjs`、既存の `android-stationary.test.mjs` と隣接する gyro 試験、計 112 件）のみ。実 Android 機、rotationRate のノイズとバイアスの分布、端末ごとの単位・符号の差、閾値の妥当性、本家との視点挙動の比較は未確認。終了後の視点の尾（平滑化の窓）と、静止中に平滑化を 0 にする既存処理の影響も未確認。
