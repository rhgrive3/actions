# スプラナ（ワイパー）系 3D モデルと動作（参照: Splatoon 3 Ver.11.3.0）

実装: `patches/splatoon3/runtime/weapon-models/splatanas.mjs`（`modelKind` は shooter、挙動 family は splatana）。
テスト: `patches/splatoon3/tests/weapon-models-stringers-splatanas.test.mjs`、`weapon-models-all.test.mjs`。

共通: ハンドルとブレードは +Z に直列（ブレード広面は Y–Z 面）。ブレードの刃先側（-Y）に team ink の帯。右手のみ（`twoAim`/`twoCarry` 0、`IKL` 0）。
`gripL` はハンドル後端に定義するが一方持ち（IKL=0）のため使われない。

動き: `FAMILY_TRIGGER` が `'shoot'` を消費（シューターの反動なし）。`FAMILY_POSE` が `catalogState`（pending / melee）と `runner.charge` を読むだけで、
チャージ中は右肩上へ構え（チャージ量に比例）、タップは右→左の水平斬り、フルチャージは構えから縦の振り下ろし。
スイング長は 11.3.0 パラメータの WeakSwingFrame / ChargeSwingFrame（Stamper 26/22F、Wiper 16/22F、Decavitator 30/32F）、曲線は INKWAVE の調整値。

| 武器 ID | 内部モデル名 | 参照資料 | IoU 前→後 | 残る差分（確認状態） |
|---|---|---|---|---|
| s3-saber-normal（ジムワイパー） | Wmn_Saber_Normal | 公式 3D 画像（斜め配置） | 0.229→0.173 | 青ハンドル、灰色ホルダー、黒い車輪、白いブレードと歯状リブ。ホルダーの肉抜き・刻印は無し（画像から推定） |
| s3-saber-lite（ドライブワイパー） | Wmn_Saber_Light | 公式 3D 画像 | 0.156→0.084 | 黒ロッド、コイルばね、細長いブレードと枠、ワイヤーベイル。ワイヤーのループ形状は簡略（画像から推定） |
| s3-saber-heavy（デンタルワイパーミント） | Wmn_Saber_Heavy | 公式 3D 画像 | 0.203→0.158 | 歯磨きチューブ型ブレード、ラベル（プリントの青帯。実物の文字は再現しない）、青キャップ、水色の襟、指リング。インク帯の位置は目視（画像から推定） |

IoU: 公式 3D 画像はブレードを斜めに置いた構図で、武器座標の水平配置とは向きが一致しない。数値は参考値で、前後比較としては意味が弱い（≥0.6 は未達）。

## 未確認
- 水平斬り・縦斬りの軌道、ブレードの面の向き（水平斬りで刃が寝るか立つか）、踏み込み時の体の傾き: 実機計測が必要（未確認）。公式のアニメーションフレーム値は非公開。
- 持ち方（片手持ち）: プロモ画像等からの推定で、握りの角度は未検証。構えの carry は暫定値。
- ブレード先端の判定（muzzle）はブレード先端に置いたが、実際の斬撃判定幅との対応は未検証。
- ブラウザの実動作確認はレンダリング静止画とロジックテストのみ。本家実機との比較は未実施。
