# 閉鎖を最短で進める不足証拠リスト

2026-10-10 JST。すべて **現在OpenのRefs Issue** のみを対象にした優先調査。以下は「実装が全くない」とは限らない。現在のソースと既存テストで分かる事実、必要な独立検証、参照先を分けた。数値ソースは [SOURCES.md](./SOURCES.md) を優先。

## 優先A — 原典の正解値が既にある。テストを強化すれば比較的早くclose審査できる

| Issue / 主PR | 現時点で確保した材料 | 不足している証明／追加すべき実行テスト |
|---|---|---|
| [#675](https://github.com/rhgrive3/actions/issues/675) / [#1190](https://github.com/rhgrive3/actions/pull/1190) | S3 1130 WeaponChargerNormalの **InkConsumeMinCharge=0.0225、FullCharge=0.18**。現PRの [4テスト](https://github.com/rhgrive3/actions/blob/b7d898eefdddfeffeb42239873e25ee43a8fb9fe/patches/splatoon3/tests/issue-675-charger-ink-consumption.test.mjs) は実Actorで8F=2.25%、フル=18%と単調増加、負インク拒否を検査。 | **Ink Saver Main 0/10/57AP**、初回最小放出直前/直後、30/60/120Hzの独立サンプリング、ソース由来の途中チャージカーブと単なる自作線形補間の区別。4件合格を全条件合格と言い換えない。 |
| [#875](https://github.com/rhgrive3/actions/issues/875) / [#1190](https://github.com/rhgrive3/actions/pull/1190) | [frame-step helper 2テスト](https://github.com/rhgrive3/actions/blob/b7d898eefdddfeffeb42239873e25ee43a8fb9fe/patches/splatoon3/tests/issue-875-frame-stepped-falloff.test.mjs) はShooter/Dualiesの整数Fの段差を検査。 | Issueの主条件は **Heavy Splatling 30→15HP、11→19F、1Fあたり1.875HP** と swept impactT=0.1/0.9 の同一固定tickの非連続性。現在のテストはそこを実行していない。実Projectile衝突/着弾ルート＋render 30/60/120Hzも必要。 |
| [#774](https://github.com/rhgrive3/actions/issues/774) / [#1190](https://github.com/rhgrive3/actions/pull/1190) | [LOS unit 2テスト](https://github.com/rhgrive3/actions/blob/b7d898eefdddfeffeb42239873e25ee43a8fb9fe/patches/splatoon3/tests/issue-774-roller-wall-los.test.mjs) はブロック線分/壁内部を確認。 | テストのphysics.segmentは**模擬関数**。本物のLevel+Physics+ローラー接触を使い、薄壁、横平行、角、壁なし125ダメージ復帰、グレーチング、固定tickで正負対照が必要。 |
| [#538](https://github.com/rhgrive3/actions/issues/538) / [#1190](https://github.com/rhgrive3/actions/pull/1190) | PRの[2テスト](https://github.com/rhgrive3/actions/blob/b7d898eefdddfeffeb42239873e25ee43a8fb9fe/patches/splatoon3/tests/issue-538-squid-roll-steering.test.mjs)は直接Actor._horizontalで横加速/中立減速。mainにも[実ロールの#224回帰](https://github.com/rhgrive3/actions/blob/main/patches/splatoon3/tests/roll-surge-batch.test.mjs)がある。 | **自然に成立した15F Squid Roll**の開始→90°・逆入力→衝突/着地までの全フレーム、被弾/シールド/チェーン非重複、送受信後にステアが二度加算されない負対照。現PRの直接ステート注入は全受入証拠ではない。 |
| [#927](https://github.com/rhgrive3/actions/issues/927) / [#1182](https://github.com/rhgrive3/actions/pull/1182) | 任天堂Ver.6.1.0の回復改善、[S3検証Wikiの通常→潜伏相当の回復への切替](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/アメフラシ)、[complete-bootstrap 6ケース](https://github.com/rhgrive3/actions/blob/a8bead03d222deacf0d59d98d6a4945edf128fbf/patches/splatoon3/tests/issue-927-recovery-law-evidence.test.mjs)で59/60F、重複雲/退出/敵雲/水中/30/60/120Hzを検査。 | 実ゲームの雨雲範囲・遮蔽/屋根と**味方owner/guestの一回だけの治癒**を、2clientと実Levelで確認する。数値12.6 HP/sは通常非潜伏回復であり味方Storm下の速度そのものと混同しない。 |
| [#1011](https://github.com/rhgrive3/actions/issues/1011) / [#1182](https://github.com/rhgrive3/actions/pull/1182) | S3 1130 Slosher 4+5のUnit別PaintParam、[9実弾のnear/far検証](https://github.com/rhgrive3/actions/blob/a8bead03d222deacf0d59d98d6a4945edf128fbf/patches/splatoon3/tests/issue-1011-slosher-impact-composition.test.mjs)と[旧0.2二重縮小の原因報告](https://github.com/rhgrive3/actions/blob/a8bead03d222deacf0d59d98d6a4945edf128fbf/reports/inkwave-weapon-evidence-recheck-2026-10-09.md)がある。 | Issue指定の **DistanceXZ近遠区間の本家補間意味**、CPU/GPU輪郭、各4+5弾の床・壁・高所全経路。現行9実弾回帰のフィクスチャは一部Physicsとpaint sinkを制御しているため、画面描画同等ではない。 |

## 優先B — 実装済みだが完了を阻むブラウザ・ネットワーク・アクション全体の証拠

| Issue / 担当PR | 確保した現状と残作業 |
|---|---|
| [#907](https://github.com/rhgrive3/actions/issues/907) / [#1191](https://github.com/rhgrive3/actions/pull/1191) | main表示条件/MinimapのVMテストはある。デスクトップTAB、Pad、Touch MAPで**実CameraRig/HUDが開く**こと、閉鎖後のFIRE/SUB復帰、minimap OFFの実ラスタと味方へのスーパージャンプ確定まで本番ビルドChromiumで確認。 |
| [#1164](https://github.com/rhgrive3/actions/issues/1164) / #1191 | Trizookaの活性化前、発射直前、有限床の[局所テスト](https://github.com/rhgrive3/actions/blob/c079b31cf9c020a490fb917d5e311b950943521b/patches/splatoon3/tests/trizooka-enemy-ink.test.mjs)がある。未発射/チャージ/発射途中の全phase、hitch・30/60/120Hz、ghost/所有者の**死1回、死後発射0、assist誤加算0**の実通信テストを追加。 |
| [#512](https://github.com/rhgrive3/actions/issues/512) / [#1192](https://github.com/rhgrive3/actions/pull/1192) | BOTの別々の着地点は新実装。**人間4名それぞれが開幕で選択する地点、GO発進、二端末に同じ目標/軌道、enemy区域の拒否**が残る。しかもPR1192はPR1183側をbaseとするスタックで、単独マージはmainへの到達を意味しない。 |
| [#1178](https://github.com/rhgrive3/actions/issues/1178) / [#1182](https://github.com/rhgrive3/actions/pull/1182) | snapshot数値/スキーマ guard はあるが、**2client real transportで無効なowner行→次の合法行**を送信し、全速度/描画レートと復帰・OwnerID/生命・replay拒否を証明。VMのみでブラウザAcceptanceを置換しない。 |
| [#1179](https://github.com/rhgrive3/actions/issues/1179) / #1182 | Boss/crabletの正数・生存者・所有者・match・sequenceに実装の根拠あり。Issue要求のhost/guest browser+relay双方の範囲外hit/不正damage/偽sender/再送/通常hitを通す。 |
| [#878](https://github.com/rhgrive3/actions/issues/878) / #1182 | hidden host deadline/resultのソース/生成後テストはある。browser background timer throttling、WebSocket遅延、hostの一時非表示/復帰、途中dispose/再接続の同一result到達を実通信で確認。 |
| [#522](https://github.com/rhgrive3/actions/issues/522) / #1182 | overflow seed/half-float/非数の拒否は実装済み。**送信者が本当にそのActor/Actionで生んだ塗りなのか**というprovenance検証は別。合法payloadを装った敵チーム色の偽paintによりCPU turf/勝敗が変わらないことを2clientで証明。 |
| [#1184](https://github.com/rhgrive3/actions/issues/1184) / #1182 | 失敗したoffline試合開始の画面復帰を、実ブラウザで読込error/async-failure/再試行・disposal中断・戻ったメニューの操作可能性まで通す。 |
| [#351](https://github.com/rhgrive3/actions/issues/351) / #1182 | Hauntのaccepted owner/life順序とrespawn後のtracking repairあり。遅延tradeと装備例外、見え方の対戦同等を検証。 |

## 優先C — Nintendo側の関数形/画像/形状が未確定。元資料から確定した部分とモデルを分離

| Issue群 | 現時点で確定した内容 | 不足する原典・客観比較 |
|---|---|---|
| [#292](https://github.com/rhgrive3/actions/issues/292) / PR1183 | [Inkipedia Drop Roller](https://splatoonwiki.org/wiki/Drop_Roller)でクツメインと+30AP/3秒、通常着地との差は裏付けられる。 | 実装内0.3秒の移動曲線・距離はローカルモデル。S3側のフレーム別位置・見かけ速度を測る資料または対応する非推定の数式が必要。 |
| [#952](https://github.com/rhgrive3/actions/issues/952) / PR1188 | Spinner 1130に MoveSpeed_Charge=.062、VelGnd_Bias_Charge=.9、VelGnd_DownRt_Charge=.05。 | 現行実装の5%/F減速はモデル。S3のCharge開始の速度対フレーム曲線・0.9の解釈が必要。 |
| [#940](https://github.com/rhgrive3/actions/issues/940)、[#891](https://github.com/rhgrive3/actions/issues/891)、[#198](https://github.com/rhgrive3/actions/issues/198) / PR1188 | 各表のBias/最大角と発射状態は検査可能。 | 2次元着弾方向の確率密度PDFをパラメータ値と誤解せず、S3の乱数変換規則または統計的測定分布を独立oracleにする。 |
| [#258](https://github.com/rhgrive3/actions/issues/258)、[#1140](https://github.com/rhgrive3/actions/issues/1140) / PR1182 | Slosher unitの0+4+5、1/2FとDepthScaleFall=.7は確定。 | RandomRotateYBias=.65の実分布、着弾hitboxと塗り領域の高さ別差、GPU輪郭を未確定モデルから分ける。 |
| [#264](https://github.com/rhgrive3/actions/issues/264) / PR1182・1188 | 既存のGPU本体輪郭の零交差一致とlate turf ownerの回帰はある。 | GPUの衛星飛沫・壁だれが**authoritative inkとして塗られて見える**位置までCPU所有・スコアに反映するか、明確なcosmetic layerへ分離。競合色順とJudd覆面も検証。 |
| [#1100](https://github.com/rhgrive3/actions/issues/1100) / PR1190 | Splatling corner reticle実装テストがある。 | 本家11.3.0の実際の四隅マーカー間隔/サイズ/展開の**画像・ピクセル比較**。Shooterの#871の画像から流用不可。 |
| [#647](https://github.com/rhgrive3/actions/issues/647)、[#469](https://github.com/rhgrive3/actions/issues/469) / PR1182 | Stormのgauge-lock 480F、Splashdown Rise_NoDamageStartFrame等が参照できる。 | 必要なのは**権威ゲージそのもの**の発動tick→着地→残1セグメント→ゼロ→再チャージ、被撃墜時Special SaverとHUDの同一状態。ローカル近似補間を本家関数と呼ばない。 |
| [#966](https://github.com/rhgrive3/actions/issues/966)、[#912](https://github.com/rhgrive3/actions/issues/912) / PR1181 | 70F着地と2拳＋本体爆発のテストは存在するが一部が代替メソッド/合成world。 | 実Actor._startSpecial→_updateSpecial→_slamImpactと実ダメージ・塗り・FX・拳、100+オーバーラップ領域、超ジャンプ時拳なしを**同一時計**で検証。 |
| [#366](https://github.com/rhgrive3/actions/issues/366) / PR1182 | Music0時のscheduler抑止にソース修正あり。 | **foreground mobile/browser Performance trace**で25ms timer 40回/秒が消えること、SFXは残り、再開・切替・各BGMの重複が0であることを測る。 |

## 閉鎖リンクが既に存在するIssueのレビュー順

PR #1182: #382 #412 #919 #904 #949 #950 #951 #999 #1089 #1102 #1186 #1187。
PR #1183: #203 #305 #967 #1033。
PR #1188: #387 #1107。
PR #1189: #372 #434。

**合計20件の自動クローズ予定**。ただしリンクにより受入条件が自動的に満たされることはない。上記と[全Issue台帳](./README.md)の原文条件を照合して審査する。PR #1190に残る #646/#437 の参照はmainで completed にした歴史的証跡であり、Open Issue数には入れない。

## 推奨の最小検証順

1. #675・#875・#774・#538を一組のsource-only回帰強化として追加し、発射/命中/Physics/通信を分離。
2. #927・#1011を本番衝突・地域／チーム・CPU/GPU／遠隔の組み合わせで検証。
3. #907・#1164・#512・#1178・#1179・#878を実ブラウザ/実WebSocketで順次回し、ゲーム内証明と外部OS観測を混同しない。
4. 推定モデル/#292/#952/#940/#264/#1100と特殊メーターの外部ソース収集へ進む。Nintendo側式がなくても受入のうち客観的に検証できる部分は先に終了させる。
