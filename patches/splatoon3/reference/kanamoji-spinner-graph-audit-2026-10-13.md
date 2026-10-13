# かなもじ氏 note スピナー原著グラフと INKWAVE 弾道の照合

対象：Splatoon 3 Ver.11.3.0 / INKWAVE 65メインブキ（うち追加スピナー5種）。
原著2024年のシミュレーションと Ver.11.3.0 の抽出パラメータを混同しない。

## 原著の検証に使った記事

| 原著 | 明示されている条件 | 読み取れる結論 |
| --- | --- | --- |
| [#9 概要](https://note.com/kanamoji_1027/n/ne46ad34d3a43) | スピナーごとに各10,000発の飛距離分布（射角2°/5°）、1,000発の着弾点プロット | 左右・上下・初速のランダム変動で飛距離がばらつく。2024-11-02に銃口位置を考慮した図へ訂正 |
| [#10 物理モデル](https://note.com/kanamoji_1027/n/n4de8b03535de) | 左右と上下の独立ブレ、および初速の符号付き変動、約8F直進→減速→自由落下 | 速度は `v0 * (1 + sign(2u - 1) * rate * abs(2u - 1) ** log_0.5(b))`。Spin連射時の初弾精度変化なし |
| [#11 当たり判定](https://note.com/kanamoji_1027/n/n49961c878a61) | 敵は高さ13.7DUの近似円柱、弾道の各フレーム間を線分補間 | 論文側の近似判定。Nintendoの真の当たり判定半径・形状としては採用しない |
| [#12 射程と着弾点](https://note.com/kanamoji_1027/n/n20cb3c3fb251) | 射角別飛距離、スピナー個別の着弾点、クーゲル長射の二峰性 | 減速→自由落下の**離散状態遷移の閾値**で、0.1°の射角差が約1m（0.2ライン）の着弾差になる場合がある |
| [#13 命中率・キル速](https://note.com/kanamoji_1027/n/n8b0f350315a9) | 距離別命中率、地上・ジャンプとAction Intensify GP別、平均キル速 | 射程端の命中率が縦ブレ・初速ブレで低下。複数弾の平均キル速度とキル速度分散は別概念 |

## INKWAVE の**実実装**で再現した離散遷移（Switch実測ではない）

`runtime/main-weapon-catalog.mjs` の生の `advance(p)` 本体を
main からそのまま抽出し、Ver.11.3.0カタログの
`Spinner_Downpour_00 / VariableMoveParam` と
現行 `profile.weaponsFidelity` を使い、60Hz、発射高度1.05 WU、
初速中央値2.21915 source units/frame、ランダム偏差0で着地を計算した。

| Pitch | 着弾までの水平距離 (INKWAVE WU) | brake→free の境界 |
| ---: | ---: | ---: |
| 2.0° | 22.068532 | 14F |
| 5.0° | 22.593350 | 14F |
| 11.7° | 23.170481 | 14F |
| 11.8° | 22.402136 | 15F |

0.1°で **0.768345 WU** の段差がある。境界は記事#12の挙動と
**定性的に一致**し、既存実装に brake/free の状態変更があるため
「閾値未実装」と判断して不要な変更を加えてはいけない。

`tests/main-weapon-catalog.test.mjs` に、本物の追加Ballpoint Projectile
を発射・取得して同じ状態遷移を測る**回帰テスト**を追加した。
反対に境界から離れた2.0°と2.1°の連続性も検査する。

### 完全一致を主張できない理由

- 原著のグラフの画像URLはWebページ本文から特定できたが、
  CDN画像の直接取得が失敗したため、**グラフ画像の軸・全凡例・ピクセルを実見していない**。
  本表は原著画像から転記した測定点ではない。
- **1 WU = 1 m ではない**。本家の「0.2ライン=約1m」をこの数値へ直接代入しない。
- `GoStraightToBrakeStateFrame`, `GoStraightStateEndMaxSpeed`,
  `SpawnSpeedRandomRate`, `SpawnSpeedRandomBias` は
  pinned 11.3.0 カタログ値を使用したが、
  `BrakeAirResist=0.36`, `BrakeGravity`, `BrakeToFreeVelocityY`,
  `FreeGravity` などは `profile.weaponsFidelity.defaultProvenance` が
  `XarrotD/paramtable; not version-pinned 11.3.0 datamine` と明示する校正値である。
- #11の円柱ヒットモデル、#13の理論命中率と実ゲームの当たり判定を一致認定しない。
- 原著#12の0.1°条件は例示であり、11.7°/11.8°が原著の描画時と
  同一条件だったという証拠はない。

## 本家との次の比較条件

各ブキ・モードの同一射撃口、高さ、ピッチ、乱数シードで、
2〜5°、閾値近傍と10〜20°を1F刻みで比較し、
(1) brake/free 遷移F、(2) 停止位置、(3) 世界スケール、
(4) 距離別命中率、(5) 着弾位置分散をそれぞれ独立して記録する。
未取得のグラフ値を「観測済みの一致結果」に昇格しない。
