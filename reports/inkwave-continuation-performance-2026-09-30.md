# INKWAVE 継続監査：入力・通信・毎フレーム処理

- 日付：2026-09-30（日本時間）
- 対象：`rhgrive3/actions/inkwave-public`
- 継続元：[Q07〜Q11の実装結果](inkwave-quality-preserving-implementation-2026-09-30.md)
- 条件：画質、演出、入力感度、補間遅延、更新頻度を下げず、同じ出力へ至る不要な作業を除く。

## 第1回の反映：Q12〜Q14

| ID | 修正 | 確認した効果と出力 |
|---|---|---|
| Q12 | [`core/mobile.js`](../inkwave-public/src/core/mobile.js)：使っていない`getCoalescedEvents()`取得を削除 | 照準の移動処理は既存の`clientX/Y`差分をそのまま使用。取得値`evs`は`void evs`以外で使われていなかった。ブラウザに依頼して捨てていた連続イベント一覧の生成を省く。 |
| Q13 | [`core/gyro.js`](../inkwave-public/src/core/gyro.js)：rotationRate配列の再利用、校正用2配列の除去、画面回転のsin/cosと感度gainを入力値ごとに保持 | 2,500サンプルごとの6ケースで内部状態・consumeしたyaw/pitchが一致。各ケースの感度換算2,503→11回、sin/cos各10,003→7,505回。motionのあるケースのrate配列2,500→3個。校正配列120〜1,598→0個。 |
| Q14 | [`net/netmatch.js`](../inkwave-public/src/net/netmatch.js)：受信統計の百分位に相手ごとの作業配列を再利用 | 7相手・6,000フレーム・13,995受信で一時配列27,990→0個。相手ごとに最大60要素の作業配列を1つ保持。遅延・再生速度・補間/外挿・テレポート後のactorサンプル・イベント待ち列が毎フレーム一致。 |

Q12は取得結果が元々捨てられていたことをコードの参照関係で確認し、構文検査した。イベントの合成方法や送信間隔は変更していない。

Q13はori、校正不成立、rrA/rrBのdegree/radianの6ケースを使用。画面の0/90/180/270度回転、感度・反転変更、resync、stop/start、重複/不完全サンプルを含む。設定を直接変更した場合もキーの比較により再計算する。数式の順序は維持した。保持するキャッシュは1インスタンスあたり数個の数値だけで、センサーの受信数・フィルタ・積分・感度曲線は変えていない。

Q14では時間順のlate/gap配列を並べ替えず、作業配列にコピーしてから従来と同じ数値順でsortする。ギャップの上下限、百分位の選択位置、60サンプルの窓、遅延の計算式は同じ。空配列・重複・非有限値などの百分位20ケースも一致。作業配列は最大7×60個の数値参照をNetMatch内に保持し、試合終了後はそのインスタンスとともに回収される。

## 再現方法・測定の範囲

[比較用コード](inkwave-input-network-probe-2026-09-30.mjs)と[証拠JSON](inkwave-input-network-evidence-2026-09-30.json)を保存した。

```sh
node reports/inkwave-input-network-probe-2026-09-30.mjs
node --check inkwave-public/src/core/mobile.js
node --check inkwave-public/src/core/gyro.js
node --check inkwave-public/src/net/netmatch.js
```

元版は`d5d54d1d37274dfa82467b37b9b8009719783ed3`の該当ファイルを使用し、継続開始時main `43539687b87070c3a950ce55b18a679423c5413f`と同じblobであることを検査。Node子プロセスが制限される環境では、同コミットのファイルをディレクトリ構造ごと書き出し、`INKWAVE_BASELINE_DIR`に指定できる。今回の実行もこの経路を用いた。

実際のGyro/NetMatchクラスをNode VMで読み、合成したセンサー・受信イベントで比較。Three.jsはリポジトリ同梱版を使用。割当数は除去対象のソース上の配列生成数であり、エンジン内部の全割当やGC時間を測った値ではない。実機ブラウザ、スマホのFPS、電池、実WebSocketの通信時間は未測定。スマホ全体での改善率や、全端末で副作用がないことを保証する数値ではない。

## 続けて確認する範囲

入力・通信の確認後も、描画・HUD・起動処理の監査を継続する。追加を確認できた時点でこのレポートへ追記する。
