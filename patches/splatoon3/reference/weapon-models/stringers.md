# ストリンガー系 3D モデルと動作（参照: Splatoon 3 Ver.11.3.0）

実装: `patches/splatoon3/runtime/weapon-models/stringers.mjs`（`modelKind` は charger、挙動 family は stringer）。
テスト: `patches/splatoon3/tests/weapon-models-stringers-splatanas.test.mjs`、`weapon-models-all.test.mjs`。

共通の構造（武器座標: +Z=矢の方向、+Y=リム軸、リムは後ろ(-Z)へ反る）:
リム 2 本、ライザー、ピストルグリップ（gripR）、ボディ（リール／カートリッジ）、バレル、弦（`string` 上半 / `stringL` 下半、チップを支点に毎フレーム回転・伸縮）、`nock`、`arrow`（矢軸）、
チャージ光のコイル（`d.glow`、後→前で点灯）。弦・インク部は team ink（`mat: 'ink'` / ink Pieces）。

動き（`catalogState` ではなく native charger レイヤーの `st.charge` / `st.sinceRelease` を読むだけ）:
チャージで弦を最大 0.17 m 引き、矢軸が伸び、ノックが追従。リリースで前へ戻り、減衰振動（約 0.4 秒）。
地上では `FAMILY_POSE` が弓を矢軸まわりに約 1.25 rad ロールして（リムをほぼ水平に）持たせ、空中では 0（リム垂直）に戻す。

| 武器 ID | 内部モデル名 | 参照資料 | IoU 前→後 | 動き | 残る差分（確認状態） |
|---|---|---|---|---|---|
| s3-stringer-normal（トライストリンガー） | Wmn_Stringer_Normal | 公式 3D 画像、Inkipedia「S3 Tri-Stringer model rotating.mp4」、「S3 Inkling Tri-Stringer Render.png」、「S3 promo screenshot Tri-Stringer 00 / 01.jpg」 | 0.203→0.255 | 弦ドロー/リリース、矢軸伸縮、地上ロール | 銀リール胴の巻き糸・両側バレルの角度と太さは目視近似（画像から推定）。リム断面は円（実物は扁平） |
| s3-stringer-short（LACT-450） | Wmn_Stringer_Short | 公式 3D 画像、Inkipedia「S3 REEF-LUX 450 model rotating.mp4」系の回転シート | 0.217→0.173 | 同上（滑車ホイール付き） | 滑車の弦巻き掛け、クロスケーブル本数、ボディのハザードラベルは簡略（画像から推定） |
| s3-stringer-explosion（フルイドV） | Wmn_Stringer_Explosion | 公式 3D 画像、回転シート | 0.249→0.245 | 同上 | C 字フレームの穴・ボルト、ホースの形、ネームプレート刻印は簡略。リムは板（slab）で近似 |

IoU は公式 3D 画像が斜め（約 30–45°）の見下ろしで、横面シルエットと向きが揃わないため参考値（低くて正常）。≥0.6 は未達。

## 未確認
- 地上のロール角と向き（左右どちらのリムが上か）: プロモ画像 2 枚（地上=リム水平、空中=リム垂直）からの推定。実機計測が必要（未確認）。
- 弦のドロー距離 0.17 m、リリース振動の周期・減衰は INKWAVE の調整値で、実機のフレーム値は未確認（実機計測が必要）。
- リムのしなり（ドローに伴う曲がり）は未実装。ブキ全体の寸法はグリップ 0.11 m 基準の目測。
- ブラウザでの実動作は iterate.sh のレンダリング（静止画）とロジックテストのみ。本家実機との比較は未実施。
