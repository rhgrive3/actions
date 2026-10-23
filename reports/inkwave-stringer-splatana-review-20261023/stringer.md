# 弓（ストリンガー）の個別レビュー — 2026-10-23

基準: main `26a4db4123d23162a3dbf8a12150b1b5bc6ccf64`。対象は公開版 `inkwave-public/` を production composition したコード。比較版は Splatoon 3 Ver.11.3.0、通常バトル、ギアなしを基本とし、既存のギア・低インク・キープ試験も再実行した。実機の全挙動との一致を認定するレビューではない。

## 根拠

- [任天堂 Ver.11.3.0 更新履歴](https://support.nintendo.com/jp/switch/software_support/av5ja/1130.html)。トライの落下飛沫塗り変更を含む参照版の確認。
- [Leanny 11.3.0 一次抽出データ](https://github.com/Leanny/splat3/tree/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon)。固定コミットの3ファイルのハッシュと保持パラメーターを既存 `stringer-source-1130.test.mjs` が照合する。任天堂の実行コード・省略既定値とは区別する。
- [攻略＆検証Wiki・ストリンガー属](https://wikiwiki.jp/splatoon3mix/ブキ/ストリンガー属)、2026-10-23閲覧。「ヨコ射ちとタテ射ちの細かい仕様」の観察は、スーパージャンプを含む空中状態・非構え時にも回転が続くことを示す。今回の修正の状態条件の根拠はこのコミュニティ観察で、回転速度そのものは抽出データを使う。
- [前回の個別監査](../new-families-1130-20261018/stringer.md)、[65武器のソース監査](../inkwave-s3-1130-65-main-behavior-source-audit-20261022.md)を引き継ぐ。

## 今回修正した差

`runtime/main-weapon-catalog.mjs` の弓傾斜は `WeaponRunner.update` の通常分岐だけが進めていた。Actorはスペシャル中とスーパージャンプ前半にRunnerを呼ばず、後半に呼んでもRunner側の `superJumpState` guardより前でreturnする。直前の傾斜が残り、飛行後の構え・次の矢の扇面が経過した接地/空中時間に追従しなかった。

Actor更新前後でRunnerの傾斜更新serialを比較し、そのtickで未更新の場合だけ同じ原典速度の時計を補う。通常移動後の接地判定を使う既存経路、上限90度、ground reverse -12/-12/-9度/F、air forward 9度/Fは保持する。Remoteと死亡Actorには加算しない。通常Runner経路とfallbackによる二重進行も防ぐ。

再現: 各弓で傾斜0からスーパージャンプ。従来は離地しても0度のまま。修正後は9度/Fで90度へ進み、着地後は各ブキの逆回転速度で戻る。実際の `Actor.superJump` の受付・charge・flight・landingを30/60/120HzのFixedClockから検査した。スペシャルについては実Actorのdispatchを保ち、body trajectoryを固定した条件で独立に確認した。

## ブキごとの確認

| ベース（派生を含む） | チャージ Min/Mid/Full | 矢数・直撃ダメージ | 能力と確認対象 |
| --- | --- | --- | --- |
| トライ、コラボ、燈 | 9/30/72F | 3本、30/35/35 | Mid/Fullの45F導火、各30ダメージ、Y+0.6の爆風中心、ジャンプ上限 |
| LACT、デコ、MILK | 6/12/34F | 3本、30/45/45 | 全段階で非爆発、75Fキープ、部分/低インク時の非昇格、10.5→5→0.5度の扇角 |
| フルイド、カスタム | 12/40/80F | 5本、24/24/35 | Mid/Fullの45F導火、交差する扇角、着地時の逆回転-9度/F |

数値は原典端点であり、内部の段階間補間を任天堂エンジンの確定仕様としない。全8キットが同一ベースrecordを継承すること、実発射、通信メタデータ、モデルの傾斜読み取りを確認する既存試験も対象にした。

| 領域 | レビュー・検証内容 | 状態 |
| --- | --- | --- |
| 入力/資源 | 最低チャージ、Min/Mid/Fullの消費・硬直、低インク、次弾受付、LACTキープの期限と再精算 | 既存production composition試験を再実行 |
| 弾道/接触 | 原典初速・扇角・ArrowMargin、弾の状態遷移、分離nockの障害物guard | 実装確認・既存回帰。実機軌道の再計測なし |
| 攻撃 | 直撃、凍結、45F導火、Y補正、LOS、複数爆発、対物、ghost非権威 | 既存回帰を再実行 |
| 塗り | 独立落下飛沫、床/壁の着弾、導火後の別塗り、30/60/120Hzの所有権 | 既存CPU paint試験を再実行 |
| 状態 | ヒト/イカ、ジャンプ、サブ/スペシャル、死亡、スーパージャンプ | 非構え時の傾斜停止を修正。全8キットのブラウザjumpも確認 |
| モデル/通信 | 弦のdraw/release、発射傾斜のsnapshot、旧5値packetと不正値拒否 | 既存回帰＋今回の描画確認。原典の骨軌道再現は未立証 |

## 継続する未確認事項

`BowTiltKeepFrame` / `BowTiltResetSpeed` の発動条件、LACTの `KeepChargePreDelayFrame` / `_Pre` の厳密な復帰受付、フルイドの `MoveJumpDownBias` の適用則、7発周期の矢ごとの飛沫割当と省略既定値は未回収である。今回の傾斜補完はこれらを推測で確定しない。CPU/GPUの塗り面積・実音波形・実機の骨軌道・実通信遅延を完全一致と扱わない。

検証結果と実行条件は [validation.json](validation.json)、ワイパー側は [splatana.md](splatana.md)。
