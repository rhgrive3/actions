# 距離＋contact候補：GP0/GP57の連続描画2条件

**保存済みの距離＋contact候補で、GP0水平60Hz・GP57水平60Hzの両方が、発動から雲生成・代表撮影まで通常描画付きで完了した。** これは新しい2条件の描画検証。既存90trace・180replayは再計算せず、数値の照合だけに用いた。推定gravity/drag校正案の検証であり、本家ver11.3.0の正式な対戦既定値・完全再現・runtime採用を意味しない。

基準commitはreport-onlyの `d47e0ac9e257a37f290f68fbf67362854139734a`。実行したのは既存の私有bothビルド `dc206bf16f11ed63a56d11d9053f4048e640d534e7ec048cd0312c687dd1f2d0`。kit-subs SHA256 `d96dcaa7b458119d16db54fb42d11dad5610fa913836b18e0569c0b6d19dbea3`、contact adapter `4c8ab7df9306cbcdb3ac40057256cf559d465a50c7981a1014d029768be9adbc` と全emitted artifactを照合した。候補や比較元・既存証拠は編集していない。

## 条件・入力・描画

既存Chromium 154.0.8037.57、既存の同じflags/SwiftShader/低quality設定。1つのブラウザで、GP0を終端・撮影まで実行しcontextを閉じてから、GP57を新contextで実行した。実練習場の既定scene・照明をそのまま使い、光源や材質の追加/変更はない。

足元(6,0,0)、静止、yaw0/pitch0、通常Q→Sub押下/解放。実gear equip経路でGP0または57を確認し、発射snapshotのduration8/10秒・throwScale1/1.5を取得。発射時ordinary aimingSub=falseで、予告線の強制表示はない。発射後は基準と同じ通常followカメラpitch−0.35。物理dtと配信dtは1/60秒で、実時間60FPSの保証ではない。

1回のpage.evaluateでGame._frameを1回だけ呼び、発射後は8回ごとと終端でGPU完了を確認。Q/Sub各tickも描画とGPU完了を採取した。1条件はsettle1＋発動3＋発射後34配信の**38描画**、2条件計76描画。全てrender抑制なしをassert。正常発射・160tick内終端のassert、1操作30秒のstep/撮影上限も維持した。初期playing待ちの既存240秒設定は別途そのまま。新しいflags・backend・権限・debug port・取得経路は使っていない。

## 缶・接触・雲の位置

単位は実際の練習場に表示されるm。1表示m=1WU、床と看板は5m刻み。距離は足元からの水平距離で、雲初期位置と描画時位置を分けた。

| 項目 | GP0 | GP57 |
| --- | ---: | ---: |
| 原点(X,Y,Z) | (6,1.45,0) | (6,1.45,0) |
| 初速(X,Y,Z)、表示m/秒 | (0,14.4,67.2) | (0,14.4,100.8) |
| 接触tick / age | 35 / 0.583333秒 | 35 / 0.583333秒 |
| 接触前の積分終点Z | 15.806620m | 23.709930m |
| sweep hit.point Z | 15.709586m | 23.564379m |
| 缶release位置Z / 雲入力Z | 15.709586m | 23.564379m |
| 雲の初期位置(X,Y,Z) | (6,4.6,15.709586) | (6,4.6,23.564379) |
| 最初の描画フレームの雲Z | 15.727919m | 23.582712m |
| 代表撮影 | 368ms | 304ms |

両方ともhit.point=(6,0,Z)が雲入力と一致し、接触点でのreleaseを確認。雲生成と同じGame._frame内に既存の雲更新も1tick進むため、描画時のZは初期値から0.018333m進んだ。動く雲の描画位置を接触距離に混ぜない。飛行ageは発射と同じtickの最初の積分を含み、発射後34配信＋発射tickで35tickになる。

GP0/GP57とも保存済み90traceの同版・同条件と、初期雲位置、雲入力、終端の缶速度、ageが一致した。以前のlogic/replay成功を連続描画成功に読み替えたものではない。

## 実画面・状態と範囲

[GP0 通常レーン・水平60Hz](evidence/inkwave-storm-candidate-render-2026-10-23/GP0-horizontal-60Hz.png)、[GP57 通常レーン・水平60Hz](evidence/inkwave-storm-candidate-render-2026-10-23/GP57-horizontal-60Hz.png)。両方を実際に閲覧し、同じ通常カメラ・射撃線から0.0mのHUDと5m刻みの表示を確認した。画像上で0.1mを精密判定するものではなく、距離の数値は実Projectile/Physicsの観測に基づく。画像は自作ゲームの代表画面のみ。

pageerror、resource取得失敗、context-lostは観測0、撮影前glErrorは両方0。終端は両方geometry260 / texture31 / live program142、render calls71。新たなCPU profileは採取していない（継承したsampling開始点の40フレームへ届く前に雲が生成された）。この2ケースだけで全ステージ・全角度・全Hzの負荷や安定性を保証しない。

2ケースとも1操作30秒内で完了したため停止条件には達していない。残り18条件の再実行、30/120Hzや上向き・壁・天井の連続描画補完は行わず、依頼された2条件のみで終了。runtimeや距離/contact/境界の追加編集・採用はない。既知の拒否済みURLとLibraryを再試行していない。対戦用の正式gravity/drag根拠と実機比較は未確定。実通信admission・実際の途中参加も今回の範囲外で、別担当の修復と区別する。

[入力・全step・缶/雲・capture時間・hash](inkwave-storm-candidate-render-2026-10-23.json)、[GP0関数イベント](evidence/inkwave-storm-candidate-render-2026-10-23/GP0-function-events.jsonl)、[GP57関数イベント](evidence/inkwave-storm-candidate-render-2026-10-23/GP57-function-events.jsonl)、[実行probe](evidence/inkwave-storm-candidate-render-2026-10-23/probe.txt)。生の診断JSON・イベント・stdoutは私有保存し、hashを公開JSONに残した。
