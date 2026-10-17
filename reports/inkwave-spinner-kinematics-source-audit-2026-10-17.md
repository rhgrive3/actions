# スピナー初速・構え始め減速の出典再監査と接続修正

対象: 公開 INKWAVE の `patches/splatoon3/`、作業開始 main `bf9a8a9270b349a3b20c9550ff6ed78a61c9e729`。比較資料は Splatoon 3 Ver.11.3.0、ギア補正なし。旧 `game/` は対象外。

## 変更した動作

バレルの `SpawnSpeedRandomRate=.12` を無次元の割合として扱い、チャージ量別の基準初速に乗じる。従来は `.12×60=7.2 WU/s` の絶対半幅をすべてのチャージ量に足していた。追加5スピナーは既に割合で計算していたため、同じ `sampleSplatlingSpeed` に統一し、抽選回数と各モードの値を維持した。

構え始めの地上減速は、バレルだけに通っていた処理を、追加5スピナーの各 `catalogRecord.parameters.WeaponParam` に接続した。速度目標は各ブキの `MoveSpeed_Charge` と既存ギア補正・入力強度から取得する。異なるブキ種や未抽出のレコードにバレル値を代入しない。空中、敵インク、潜伏、スティック解放、射撃中、非チャージ時は既存の移動処理を使用する。

**接続の修正は完了したが、本家の減速曲線を復元したとはしない。** `.9` の「減速カーブ」というラベルと `.05` の「減速遅延」というラベルを確認した。両者を組み合わせる実行式は、利用できる一次資料・内部資料からは取得できなかった。既存の5%/60Hzモデルを明記したまま全6種へ適用し、未取得の `.9` を根拠なく指数や補間係数に置き換えていない。

## 初速の絶対幅と割合が衝突した理由

| 資料 | 確認した内容 | 根拠の位置づけ |
|---|---|---|
| [かなもじ・研究 #10](https://note.com/kanamoji_1027/n/n4de8b03535de) | 基準速度に一定の割合のブレ。最終式は `v0 × (1 + rs × signedBiasedDraw)` | 著者自身のS3研究。Nintendo実行コードの抽出ではない |
| [SplatHeX S2 v1.4.0 パラメータ](https://mirayxs.github.io/SplatHeX/param/parameter_splatling_jp_140.html) | `InitVelSpeedRateRandom=.12` の日本語ラベルが「速度ブレ率最大」、偏りが `.2` | 抽出パラメータ名・日本語ラベルの確認。S3の実行式そのものではない |
| [Leanny/splat3 固定1130データ](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpinnerStandard.game__GameParameterTable.json) | `SpawnSpeed=1.05`、`SpawnSpeedFirstLastAndSecond=2.1`、`SpawnSpeedRandomRate=.12`、`SpawnSpeedRandomBias=.2` | S3抽出データ。フィールド値を固定可能 |
| [独立再現実装 splatoonsweps](https://github.com/zerokizo/splatoonsweps/blob/a74592726f38f26fd1d3a15ed315701068283847/lua/weapons/weapon_splatoonsweps_splatling/shared.lua) | `GetInitVelocity` は `1 + frac × mInitVelSpeedRateRandom` をチャージ量別基準初速に乗じる | 独立した一次コード。S1系の再現でありS3ネイティブ実装ではない |
| [S3 Wiki バレル表](https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%83%90%E3%83%AC%E3%83%AB%E3%82%B9%E3%83%94%E3%83%8A%E3%83%BC) | フルチャージ初速19.8〜22.2 DU/Fという表 | 旧実装の絶対幅解釈の根拠。ただし下記用語集・原研究式と両立しない |
| [同Wiki パラメータ情報](https://wikiwiki.jp/splatoon3mix/%E6%A4%9C%E8%A8%BC/%E3%83%91%E3%83%A9%E3%83%A1%E3%83%BC%E3%82%BF%E6%83%85%E5%A0%B1/%E3%83%A1%E3%82%A4%E3%83%B3) | `SpawnSpeedRandomRate` を初速に掛ける最大誤差として説明 | 同じWiki内にも解釈の不整合があることを確認 |

添付v3 PDFの物理ページ21（本文ページ20）の初速ブレ式も割合である。ただし今回の判断はPDFだけに依存せず、原記事・抽出ラベル・固定S3値・独立実装を照合した。表の19.8〜22.2をS3実機測定の確定区間として扱うと原記事式とは矛盾するため、両方に一致したとは記録しない。

採用する研究モデルは、一様乱数 `u∈[0,1]` に対して次式である。

```text
q = sign(2u−1) × |2u−1|^(log(.2)/log(.5))
v = v0 × (1 + r × q)
```

従ってバレルは最小チャージ基準63 WU/sで55.44〜70.56 WU/s、1周以降基準126 WU/sで110.88〜141.12 WU/sとなる。フルチャージの25%・75%分位は122.976・129.024 WU/sで、中心偏り `.2` を維持する。旧絶対幅による118.8〜133.2 WU/sを正しい範囲とする検査を削除し、独立に計算した割合分位へ置き換えた。基準速度の補間自体は既存の1周まで線形・以後一定というモデルを維持している。

## 6種・7モードの固定値

| ブキ/モード | フル初速 raw WU/F | 初速ブレ率 | 初速偏り | チャージ移動 raw WU/F | INKWAVE移動 WU/s |
|---|---:|---:|---:|---:|---:|
| バレル | 2.1 | .12 | .2 | .062 | 3.72 |
| スプラスピナー | 1.5 | .10 | .2 | .072 | 4.32 |
| ハイドラント | 2.4 | .14 | .2 | .044 | 2.64 |
| クーゲル短射程 | 1.1 | .12 | .2 | .086 | 5.16 |
| クーゲル長射程 | 2.21915 | .03 | .2 | 同上 | 同上 |
| ノーチラス | 4.4333 | .11 | .2 | .040 | 2.40 |
| イグザミナー | 1.8 | .05 | .2 | .072 | 4.32 |

全6 `WeaponParam` の `VelGnd_DownRt_Charge=.05`、`VelGnd_Bias_Charge=.9` は共通。完全元ファイルのGit blob ID・SHA256と抜粋値を `reference/spinner-kinematics-1130.json` に固定した。2026-10-17に6元ファイルを個別取得し、元バイトのGit blob SHA1をGitHub応答と照合、SHA256を既存カタログの出典SHA256と照合した。

主な元ファイルは `WeaponSpinnerStandard / Quick / Hyper / Downpour / Serein / HyperShort.game__GameParameterTable.json`。参照コミットは全て `7280ff9cde8bb1c5dcef46c700c326471584d2e6`。

## 減速曲線の調査結果と実装範囲

SplatHeXの日本語抽出ラベルでは `.9` が減速カーブ、`.05` が減速遅延であり、弾速の偏り `.2` やヒト速ギア補正とは別のフィールドである。ただしラベルだけでは `v×.95`、`target + (v−target)×.9`、特定の指数関数のどれも確定しない。S3 Wikiの該当2フィールドの説明欄も空欄である。

利用可能な内部資料フォルダーの `SOURCE_INFO.txt`、Dexx-io/Splatoon-Decomp `9ef403d96f1a370bdd70434ce158a0c29879bfcf`、YoshiCrystal9/Blitz_MasterVer22-Decomp `6e6f8ebb1a3d8ebac518ba47b881ec5d3740baac` の公開ソース構成も確認した。前者は本件のゲームプレイ関数本体を含まず、後者にもスピナー地上減速の復元済み関数を確認できなかった。sdlfoundation側の空ファイルの事情は既存 `inkwave-splatling-pdf-source-audit-2026-10-09.md` も参照。独立再現実装の移動はチャージ率による線形補間であり、`.9/.05` を消費していないため本家式の証明には使用しない。

今回接続した既存INKWAVEモデルは `max(target, before × (1−.05)^(60dt))`。地上で移動入力がありチャージ速度を超えている間だけ、通常移動処理が決めた方向にこの速度ノルムを適用する。固定クロックのActor移動がRunnerのチャージ受理より先という規約を維持する。減速の診断値は適用しないフレームに消し、前のチャージから残さない。

再現操作は各ブキでギアなし・平地・全入力歩行を1秒続けてからZRを保持。全入力と15%入力で各ブキのチャージ移動へ落ち着くことを確認する。停止、90度旋回、反転、空中、敵インク、射撃・中断状態は個別の回帰で確認する。坂・段差の衝突積分は変更していない。Switch実機の減速距離・時間曲線との比較は未実施。

## 検証

`spinner-kinematics-source.test.mjs` は6元レコードとの一致、7モードの独立した端点・中央値・四分位、速度抽選1回、各実装所有者から生まれる実弾の初速を検査する。`spinner-charge-family.test.mjs` は本番installer経由の6種について全入力・微入力・各状態・30/60/120Hz描画間隔を検査する。

既存 `splatling-speed-owner` はチャージ0/.25/2⁄3/1の実弾分位、故意の二重抽選で期待範囲から外れる対照、送信速度の保存とghost非再抽選を検査する。`splatling-batch`、`splatling-charge-decel-1188`、`splatling-owner-composition` のチャージ時刻・予約インク・中断返却も継続して検査する。

単独ロジックの結果: 上記6テストファイルを `node --experimental-vm-modules --test --test-isolation=none` で実行し、**47件成功・失敗0件**。

本番ビルド: 省略されていた26アセットを基点のGit blob SHA1と一致確認して補完し、`node scripts/build-inkwave.mjs inkwave-public /workspace/scratch/98817b337fc5/tmp/inkwave-spinner-site` が成功。contentHashは `c04c4d3a81901a65f81cd327cb2a95b1abeb49bb2cba51921673d1e691a17f71`。新runtimeモジュールは追加していない。

同じ配布ビルドを `INKWAVE_BUILT_SITE` と `INKWAVE_SPEED_SITE` に指定し、`spinner-kinematics-source`、`spinner-charge-family`、`splatling-speed-owner` の **11件成功・失敗0件**。圧縮後も同じ独立初速分位、全6種の固定クロック減速、送信・ghost速度保持を満たした。公開CIの結果は統合担当が共通記録へ追記する。ロジック単独・配布コードの結果をブラウザ描画やSwitch実機一致とは扱わない。本家実機比較は未実施。
