# Crab照準solverの回帰修正

基準は実main `0136cc8aadef23a92680f80486439a6fbd590541`。CI shard0のCrab表示2件はfixture期待値の古さではなく、#1592で変更された共通solverの退行だった。元の表示テストの入力・期待方向・`1e-8`境界を変更せず修正した。

## 所有者と原因

固定更新では`Player.computeAim(true)`が現在の入力に追従するsimulation cameraからworld targetの`aimPoint`を作り、`Actor.update`が現在の`aimYaw/aimPitch`から`aimDir`を作る。Crabの射撃と表示は共に`crabTankShotGeometry`のsocket/方向対を消費する。body yawは遅れてよく、砲身の+Zが発射軸、モデルは+Y up。既存の本家Crab source監査や、INKWAVEの左右pod/銃口の校正値を変更していない。

1. 新solverは旧`crabTankAimDirection(..., muzzle)`の`fromFeet>1e-12`を継承しなかった。`Actor`の初期`pos/aimPoint`はともにゼロで、足元と同じtargetは従来から「まだ照準targetなし」として扱う。下向き・横向きのcannonで足元を誤目標にして、正しい入力vectorから砲身を回していた。
2. 新solverは二乗方向残差`1e-12`で止まり、方向誤差約`1e-6`を残した。元のsocket/axis契約`1e-8`より粗く、12m先の正当targetでも不一致になる。これはモデルの軸変更やcameraの期待値更新で解消する問題ではない。

## 修正と負対照

- 既存helperと同じ足元sentinel guardを復元。無target・NaN・背面target等の有効な入力vector維持も確認する。
- 近距離の旧fixed-point二周期を防ぐhalf-stepは保持。元の二乗残差`1e-20`へ戻し、damped solverの有界上限を48にする。通常のqueryは収束時点で終了する。
- 元のproduction表示8件はそのまま維持。実Actor/Character、左右socket、4方位・上下pitch、body旋回、実発射・recoil・remote eventを実行する。
- 追加testでは実sourceをcompileし、sentinel guard削除、粗い精度への復帰、damping削除の3変異が、それぞれ独立入力vector／最終socket→world target／近接targetのoracleで失敗することを確認する。期待方向は実solverの出力やstale scalar値から作らない。

元mainの表示テストは8件中6成功・2失敗。修正後は元表示8件＋追加2件・既存Crab paint/aim12件・critical14件の合計36/36で、fail/cancel/skipは0。

独立の200条件では96 fallbackと104 reachable targetを検査し、候補の失敗0、最大最終方向残差`9.903e-11`。元1592 solverはfallback2件・精度104件で失敗した。旧undamped solverも近距離を含め48件で失敗するため、単純な旧版復帰ではない。0.5/1.2高さ、1.2/1.5/2/5/12m、両mode、body lag、4方位・上下pitchを含む。これらはINKWAVEが持つrig幾何の整合性であり、本家11.3.0の銃口寸法・収束規則の追加認定ではない。

独立counter観測でも200条件の未計装pos/dirと完全一致を確認した。候補のnear48条件は反復9〜27（中央値15.5）、far56条件は25〜29（中央値29）、fallback96条件は0〜1。48上限へ達したケースは0。これは今回のgridに対する観測であり、全ての任意world targetの収束保証ではない。

## 性能と検証の境界

同process・順序交互のNode helper測定中央値（µs/call）は、元1592→候補でnear `4.00→6.61`、far `6.92→10.92`、sentinel `.937→.456`。farで両gun約`+.008ms/query pair`。共有ホスト・helperのみの診断で、ブラウザFPSやhardware GPUの数値ではない。方向精度を下げて計算を省略しない。新しいper-query vector/arrayやworld stateを追加していない。

production build、minified実行と新mainの受領は親検証で別途固定する。旧705/423、0136の合格、音響だけの限定同等性を、本runtime修正後へ無条件に読み替えない。外部rawは`crab-presentation-before.log`、`crab-presentation-expanded-green.log`、`crab-aim-candidate-review.json`に保持する。
