# Native Charger証明の追加補強（実験・本番未統合）

最終runtimeは`b5c49fa58e657a4476e22968016facedbf3056c0`。初回spawn実験の継続で、最新mainの全変更を取り込んだ配備候補ではありません。**#1665/#1666の全体解消でも、必須damage gateでもありません。**

今回修正した点:

- 本当に撃ったChargerでも、wireの方向だけを書き換えると以前のoptional birth proofは通りました。修正前の実2peer回帰は1件失敗。private native launch時のaim point/directionを不変に保存し、同じ`Projectiles._aimFrom`で方向を照合します。遠方・近傍・背後fallbackと、発射後に照準を変える正常例が成功。losslessな既存Charger wireを使い、独自照準モデルは導入しません。旧17-field入力は資源再実行には残しますが、欠落aim pointを権限に使いません。
- 前回の初回spawn追加にはctx→replay→composed respawn lifecycle→native engine→minimap→ctxという初期化循環がありました。変更前a8da7f29でも接触試験のmodule初期化が失敗することを再現。installerからnative spawn callbackを渡し、逆向きstatic importを除去しました。event bus先行初期化、fixtureのfake化、adapter bypassは使いません。
- 照合済proofの有効期限を受信側時計にも適用。送信側が入力を止めても、既存pendingと同じ1.4秒を超えたproofを使えません。照合後のevent改変と、同じ発射を指す別要求の消費後aliasも拒否します。修正前の3負例はすべて失敗、修正後は成功。

| 対象source | 検証 | 結果 |
|---|---|---|
| 4d09927a（方向・初期化修復後、寿命補強前） | 全network125ファイル | **901/901、fail/skip/cancel 0** |
| 4d09927a | 5対象file / 通常minify生成物3file | 108/108 / 89/89 |
| 4d09927a | 実Chromium・native Game/Match/Actor/Character・WS・production Workerローカル実行 | 起動・再戦・再接続3条件、双方向6経路成功 |
| b5c49fa5（寿命補強後の最終source） | 5対象file / 新しい通常minify生成物3file | **111/111 / 92/92、skipなし** |

901件の実行中は別worktreeで寿命補強を進め、元のtracked treeが4d09927aのままであることを終了後に確認してから統合しました。**901件はb5c49fa5での全体再実行とは称しません。** source111件はreceiver、native driver、input producer、実Worker quota、既存PvP/Boss接触authorityを含みます。89/92件はreceiver・driver・接触の生成物検証です。ブラウザは起動と時計同期の受入で、攻撃方向・damage admissionを実ブラウザで証明したものではありません。

両通常buildのGit入力1370・生成物2030を照合。最終contentHashは`36ef05963db4d8b776be097b238bb7e43086dc054372788f86316da88e36ab4e`。全networkはNode22.23.4、3072MiB heap、test-concurrency1で実行。他の機能検証も同時に走ったため、実行時間は性能比較には使いません。

[verification](verification.json)、[rawログ20件](raw-evidence.tar.gz)、[member hash](raw-hashes.json)。最初のdirection反例、69pass/1file初期化失敗、変更前baselineの同じ循環、寿命3反例も保持。画像はlocalのみで[hash一覧](local-images.json)。ブラウザprofileや外部asset本体は含めません。

[現在の契約](../../../patches/network-replication/native-charger-replay-contract.md)。残件は、必須damage handoff、他64mainとsub/special、信頼できる過去Match/world順序、外力・後続life・latejoin/owner移管、実複数clientのdamage/stat/result受入です。現在のCharger proofはoptionalであり、既存capture-ledgerの資源/grounded推定を本番の完成authorityとして扱いません。原作比較はSplatoon3 11.3.0、追加Nintendo値はなし。実機/物理GPUの比較ではありません。
