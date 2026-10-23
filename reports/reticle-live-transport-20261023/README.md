# f72：小型2ブラウザー transport / 実HUD証拠

記録済みrun-5を公開するreport-only追記。対象head **f72ccdb4b11cb76b01dd0567975924cbd6d83c60**、対象tree **2b1fe89dcf4ffa078ee7d91cdd95292cdcf20756**。新しい計測・build・runtime変更・ACK購読追加はない。PR1859/mainは更新しない。

| ケース | owner HP | 攻撃者HUD呼出し | damage pulse開始 | kill cue開始 |
| --- | --- | --- | --- | --- |
| miss | 100→100 | 0 | 0 | 0 |
| 非致死 | 100→64 | 1 | 1 | 0 |
| ACK＋owner tickを同一bytesで重複配送 | 64→28 | 1 | 1 | 0 |
| 致死 | 28→0、alive=false | 1 | 0 | 1 |

被弾側の命中マークは全ケース0。非致死はownerの実HP減少→native hit record→通常owner tick→既存main listener→実HUDへ進む。致死は通常Actor.updateがpending-lethalを確定し、splatted転送からdamage=0のkill表示を1回出す。既存source/outbound-prefix **42/42**（commit364409f1c699eb1269153419f4591ef2844521a2）とは別の**4 browser cases**で、合算しない。

独立Chromium context2個（同じbrowser process）と実WebSocketで、通常create/join/confirmTeams/双方ready/start/ready/goを使用。既存Node platform adapter経由で本番Worker fetch / RoomDurableObjectを通した。owner/life/clock認証を手製にせず、ACKとtickはWorkerが出した元フレームをそのまま再配送した。正規minify生成物の実HUDと4個のWeb Animationを使用し、通常UI CSSのcomputed opacityでhit/killの可視性も確認した。実際に読んだ394生成物をmanifestと照合している。

**フルゲーム受入ではない。** mainはproduction compositionのhit登録だけを抽出し、同じ実busと実audio classifierへ接続した。静止2 Actor、小型Character display、flat/no-wall collision doubleを使い、位置積分・spawn barrier・character finishを省略した。通常Actor.update / Projectiles / NetSession / Transportは動く。host攻撃者→guest ownerの一方向だけ。配備済みCloudflare relay、hibernation、実回線・実GPU・Safari・Switch・端末frame pacingは未検証。本家映像403も別gateのまま。

- [result.json](result.json): 最終runのcase/event/Animation/style receiptと元Workerフレーム6本。394 loaded-artifact一覧だけを省略し、全原本のSHA256をprovenanceへ残した。時刻は同一sender browser内のローカル観測で、retail tick定数や一般的な遅延分布ではない。
- [probe.mjs](probe.mjs): 実行したrun-5 script。公開時の差は「出力directoryを必須にし、既存directoryなら停止する」起動ガードだけ。計測・判定部分は同じで、公開版のbrowser再実行はしていない。
- [main-hit-registration.js.txt](main-hit-registration.js.txt): 実際に抽出したmain listener原文。
- [provenance.json](provenance.json): 原本・ZIP・公開ファイルのSHA256と保存先。失敗/中間runを含む全原本とZIPは `/workspace/scratch/reticle-live-transport-20261023/` に保持し、このbranchには全ZIPや全PNGを載せない。

再現scriptはユーザーの保存済みactions環境の絶対pathを使う。`/workspace/reticle-final-main7e027` のtreeが対象treeと一致すること、既存buildとNode dependencies、`/usr/bin/chromium` が必要。例: `node reports/reticle-live-transport-20261023/probe.mjs /workspace/scratch/reticle-live-transport-review-new`。既存directoryを渡すと停止する。別環境への移植・実行は今回の公開作業には含めない。

途中run-1はteam confirmation/双方ready不足、run-2はrunner回復更新不足、run-3はpending-lethalを確定するActor.update不足で停止した。run-4はdispatch4ケースpassだが共有CSS tokens/reticle初期化不足があり、可視性の根拠には使わない。通常依存を戻したrun-5が最終結果で、assertionを削って通していない。
