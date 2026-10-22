# 残課題の追補: #1767 / #1430 / #1165

比較元は main `26a4db4123d23162a3dbf8a12150b1b5bc6ccf64`。前回の集約 PR #1795 はマージ済みのため、新しい追補 PR にまとめる。

## #1767: 遅延処理された初回 tick の時計アンカー

`validOwnerTickAdvance` の5秒許容は変更しない。新クライアントが `relayClock=1` を要求し、新リレーが welcome で対応を通知した場合だけ、リレーが `m|認証済み送信者|@転送時刻ms|元JSON` を付ける。tick の経過時間検査は、その送信者の前回採用したリレー時刻との差を使う。補間・証明履歴のローカル受信時計は従来どおり。未対応リレーでは従来のローカル時計検査に戻る。

時刻は送信者の JSON から取得しない。Transport 内部の WeakMap に同期 dispatch 中だけ保存し、送信者照合、例外時の破棄、接続終了・再接続、入れ子 dispatch を検査した。認証、有限値、単調増加、再送、life/epoch、hit/paint の検査は維持。リレーの capability は hibernation 復元にも保持する。

再現は issue の `124.04 → 175.665` 秒、ローカル経過37.3秒。旧経路は拒否し、新経路は実 Actor の位置履歴を2→7へ更新する。30/60/120 Hz で補間を確認し、未来・過去・再送・偽 JSON 時刻を拒否した後も次の正当な更新が入る。

`scripts/check-inkwave-startup-clock.mjs` はビルド済み Actor / NetSession / NetMatch / Transport と本番 Worker の admission を通るローカルリレーを使う。Chromium / WebKit 各2クライアントで最初の転送を6.2秒保留し、次の更新と続けて渡す。ブラウザ・リレー時計は置換しない。両エンジンで新経路は2件採用、旧時計を選ぶ対照は1件採用のまま位置2に停止。実デバイス上の元障害の発生頻度や、送信前・リレー到着前に発生する遅延の解決までは主張しない。

**運用条件:** クライアントと `server/src/index.js` のリレー両方の公開が必要。この作業では本番 Worker をデプロイしていない。旧リレーだけでは #1767 の改善は有効にならない。

## #1430: タッチ長押し解除・再押下の検証

現在の main には既にタッチの押下表示と hitbox の補正がある。今回、本番入力処理の新たな原因修正は行っていない。既存 reliability lab の実 Actor / Runner / Character を使い、30/60/120 Hz で押下位置の hitbox、ポインター所有権、最初の1回、解除後の2回目、最終解除・ポインター解放を検査する。元の `actual === 2` と解除アサーションは維持した。独立した試行の間だけ fixture のインクを初期化する。

Chromium / WebKit の全 reliability 検査は成功した。別試行では WebKit の独立した map presentation の ready 判定が失敗したため、全試行成功とは扱わない。#1430 の歴史的な断続的失敗の原因確定・実機入力の証明としては閉じない。

## #1165: Roller の CPU/GPU と最終 Judd

CPU/GPU の共有輪郭と回転時の走査範囲の修正は既に main に存在する。今回の変更は検証拡張。30/60/120/144 Hz、半径 .3/.62/1、必須の π/60 を含む6 seed、4方向、2チームで576ケース、589,824セルを WebGL readback と比較した。既存 AA 許容式は維持し、実測の不一致・AA例外はともに0。432組の比較で CPU ownership は更新間隔に依存しない。

各更新間隔で敵の全面塗りから211本の重なる Roller stroke を描き、GPU の全1,024セル、`sampleWorld`、`regionStats`、`coverage` と実 Match._judge を比較した。全て515対509セル、50.29296875%対49.70703125%、team0 勝利で一致した。既存の即時 body、Dualies 幅12ケース、非表示中6100 stamp の replay、チャージャー銃口・照準検査も残す。ビルド manifest の全 artifact を SHA-256 で検証し、CI の同一 build receipt に追加した。

これは制御された水平面と実 WebGL の整合性検査。Splatoon 3 実機の塗り形状や全ステージでの一致とは区別する。

## 検証と残る制約

- 関連する snapshot / transport / reliability / relay の90テスト成功。
- `npm test` 成功（main更新前の作業ツリー）。最新 main のカタログ変更は別途取り込み済み。
- network 全体検査では既存の `combat-pvp-cap-queue.metadata.test.mjs` の Kraken fallback fixture が失敗。変更を含まない main `26a4db412` の独立 worktree でも同じ失敗を確認した。assertion や本番 admission は緩和していない。全 network suite の成功は主張しない。
- ブラウザの成功 receipt はまず contentHash `55cb3e9387d56aee2644f5c6ffa02e77593e707678c8cc8b6ec7e36bd9aa43d5` で取得。最新 main 取り込み後の build と同一 PR HEAD も CI で検査する。
- Linux Playwright WebKit は実エンジン。physical iPad / Nintendo 本家の計測ではない。
- #1671 / #1757 / #845 / #1434 などの実機性能、#1789 / #287 / #725 / #532 などの未校正物理・入力、#1708 / #1565 / #1097 / #1116 などの本家アセット・アニメーション根拠を必要とする残課題は未完のまま。根拠のない数値調整や issue の一括 close はしない。
