# ネットワーク・戦闘信頼境界の修正と残件（2026-10-22）

基点: `26a4db4123d23162a3dbf8a12150b1b5bc6ccf64`。対象は公開 `inkwave-public/` と本番adapter合成。#1665 / #1666 / #1767 の本文、全コメント、関連PRと現行実装を確認した。3件とも、受入条件全体を満たす証拠はなくOPENを維持する。

## #1767: bind前の時計汚染を修正

`NetSession._begin` は `NetMatch` を公開してから `G.game.startNetMatch` をawaitする。既存 `_tick` は実Matchへのbind前でも `lastTs` / `lastReceiveAt` / 補間時計を作っていた。未準備の間に遅れたsnapshotを受理すると、その古い時計基準が準備後のlive snapshotを永久に未来判定する経路がある。

`patches/network-replication/adapter.mjs` のowner clock admission前へ `if (!this.match) return;` を追加した。bind前のtickは受理せず、既存peer identityやreplay stateは消さない。`snapshot-guard.mjs` の5秒許容値、単調増加、未来判定は変更していない。未準備中に存在しないactorへ宛てたtickから時刻だけ先行確定することを防ぐ変更で、本家の武器数値・移動・照準・発射物理を変更しない。

本番合成の新規3テストで、issueに残る時計値を使ったpre-bind汚染の防止、既存peer identity保持、bind後の14秒未来・極端未来・stale・replay・owner保護を確認した。原本adapterを使う独立symlink作業木では2失敗/1成功、修正後は3成功。隣接snapshot-clock/queue-hardeningを含め12/12成功。Node v24.19.0、serial、384 MiB heap。実ログは `network-security-before.log` / `network-security-after.log`。

これは既知のライフサイクル経路を塞ぐ部分修正である。元のnative runは、遅延した初回基準がどのstartup区間で作られたかまで確定していない。すでにbind済みの受信キュー遅延による時計乖離は残る。実ブラウザ2台のcold-start/reconnectは未実行であり、#1767を解消済みにしない。

完全修正では、準備完了境界でfreshnessを確認するnonce challenge/response、または信頼できるrelay到着時刻を使って初期clock originを定義する。owner申告だけでは「古い初回packetが遅延した」と「次packetを未来へ偽造した」を区別できない。一定回数拒否しただけの自動rebaseや許容幅拡大は採用しない。epoch/reconnect・event/life/paint/hitの既存境界を維持し、遅延初回・後続catch-up・通常jitter・未来攻撃・stale・実2-peer startupを検証する必要がある。

## #1665: PvP ownerによるactionとhitの同時偽造は未解消

現行 `combat-provenance.mjs` にはowner/match/life、先行shot proof、装備cause/ダメージ上限、射程・遮蔽、被害者単位の一回使用・queue期限の防御がある。統合済み #1732 / #1736 はこれらの部分対処で、issue最新コメントも継続を明記している。

残る信頼境界は、正当ownerがaction record自体とhit claimを同時に捏造できること。trusted receiver/hostが入力・発射間隔・charge・ink履歴から攻撃を認可し、その実発射物/beam/areaと被害者履歴・地形から接触を復元する必要がある。直線弾だけでなくballistic、爆風、複数globs、継続special、0 damage knockback、migration/retryを保持する。新しい自己申告fieldを追加するだけでは解決しない。live multi-clientのHP・splat・統計・結果の正規対照が必要。

## #1666: Bossのowner-authored hitも同じauthority設計が必要

現行には先行proof、装備/ceiling、Boss weakpoint、crablet状態、range/visibility検査がある。古いコメントにあったBoss負値/0でproofを先に消費する最小問題は、現行 `combatAdmission` 冒頭のfinite/正値検査と `enqueue` のBoss0拒否で既に対処済み。重複変更は加えていない。

ただしownerがactionと`bhit`を同時に作る場合の実接触はhostで証明されない。hostが装備・入力・ink・cooldownから攻撃を確定し、Boss/crabletの実geometry・移動/animation履歴・weak/invulnerable状態から接触とdamageを決める必要がある。拒否claimでproofやcontact cooldownを消費せず、正規shot/継続specialとhost migration/reliable deliveryを保つ。実機や実複数browserでの完成検証は行っていない。

## 調査根拠

- https://github.com/rhgrive3/actions/issues/1767
- https://github.com/rhgrive3/actions/issues/1665#issuecomment-6306065280
- https://github.com/rhgrive3/actions/issues/1666#issuecomment-6306066081
- https://github.com/rhgrive3/actions/issues/1666#issuecomment-6314801248
- https://github.com/rhgrive3/actions/pull/1732
- https://github.com/rhgrive3/actions/pull/1736

remote更新、issue close、PR/commit作成は行っていない。構造化一覧は `network-security.json`。
