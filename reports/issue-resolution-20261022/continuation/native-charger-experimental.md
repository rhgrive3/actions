# Native Charger受信側replayの実験記録

**本番へ統合・配備していない。#1665 / #1666はOpen。対象は65 mainのうちnative Splat Chargerの着地済みspawn fixtureであり、実Turfの初回lifeには未対応。必須damage gateへも未接続。**

本家の比較基準はSplatoon 3 11.3.0、native Splat Charger、通常およびインク効率・回復gear。INKWAVEの実Actor / Physics / resource / WeaponRunnerを再利用し、Nintendoの未公開値は補っていない。CPU/source検証と実ブラウザ・Switch・物理端末測定を区別する。

## 実装した境界

- 実source入力を正確なdt・time・life serialとともに有限の`ci2` sidecarへ記録し、transportが受理したprefixだけを確定する。
- 受信側の実Match spawnからprivate Actorを作り、受信側経過時間を上限としてsourceの移動・インク・チャージを再実行する。ownerのink / charge / groundedは初期化に使わず、body / form / effective inputは照合用のwitnessとする。
- 同一owner内の塗り・泳ぎ・発射のFIFO順序、入力より先に届くbirthの有限待機、1回限りのnative launch receipt、life / owner / world失効を接続する。
- 実Worker relayを通す通常8 actorの30/60/120Hz対照は、各4,800入力frame / 200 packet / 10秒、最大142,835 wire bytes/秒で既存256KiB/秒上限内。32 actorは通常編成ではなく防御上限のstressで、既存quotaの1008切断を明示的に確認した。

## 検証範囲

source checkpointはlocal `a0d140f1a7f3d59f17fbf460497e5c2973a61405`、公開同一treeは`9d8efc505352e161beed3cd56632f39a5b40d31e`。production形式の[build照合](native-charger-lab-build.json)は全1,369宣言inputと2,030 artifactを確認し、content hashは`3623de2ff704d38ebce7f2be35c9dc0adfd3404bab821c900d78d8f044e36f75`。

coherent source113件＋outbound42件、独立receiver / relay / producer / replay54件が成功した。全125 network test fileの初回実行は865件中839件成功・26件失敗、source / test148 fileのhashは実行前後で一致した。失敗は旧26列期待21件、表示Yと物理Yの混同3件、synthetic metadata fixture不足2件へ分類した。初回rawは保存し、移行後のfocused実行を別集計にする。全125 fileの再実行成功とは扱わない。

以前の「stored keepはRでも残る」という期待は誤りだった。sourceの内側の`mainSubOwns -> cancelMainForSub`はstored keepを消す。発射直後9Fで泳ぎを期待したfixtureも誤りで、sourceとcloneはともにkid、inkも同値だった。24Fまで進めた正例で双方のsquid移行を確認した。過去ログの成功数を現在の意味へ読み替えない。

## 必須damage gateへ切り替える前に残る条件

実Turfの初回Squid Spawnではaim / wait / flightがresource / WeaponRunnerより前にreturnし、captureのresource phaseは0・effective inputはnullになる。現replayは別action ownerとして拒否し、そのlifeの新しいproofを停止する。cloneのspawnAtだけではinitial / phase / target / playWaitを復元しない。着地後のowner snapshotから100 inkを再付与するfallbackも設けていない。

他ownerを含む過去の塗りとworldの順序、実contactに基づくpush / knockback、獲得済みSpecial credit、SuperJump、条件付きgear / support、loading / latejoin / migrationの信頼できるcheckpointが必要。残る64 main ownerのsource action / collisionも未実装。従来capture ledgerのink残差も解消していない。通常ゲーム全体の不正命中対策が完成したとは主張しない。

正確な条件と有限上限は[replay contract](../../../patches/network-replication/native-charger-replay-contract.md)。この段階のbrowser / GPU / Switch測定は行っていない。

## 最終のtest migrationと証拠

12ファイルをまとめた最後の実行は88/88成功（135.364秒、fail / skip / cancel 0）。独立したmigration reviewも40件成功し、実行後にruntime17 / test12 / contract1の全30 SHA256を再照合した。これは初回full125ファイルの再実行ではない。途中のfixture修正試行72件中68成功・4失敗、39件中37成功・2失敗、修正対象26件の成功もそのまま保存した。独立reviewerの384MiB上限での追加adoption実行はV8 heap OOMで、768MiBの限定再実行は成功した。元の全件実行は通常heapで完走している。

[最終receipt・全member SHA256](native-charger-receiver-review.json) / [raw41member archive](native-charger-receiver-review-20261022.tar.gz) / [最終30file freeze](native-charger-lab-qa-freeze.json)。元のcoherent155件・独立54件・初回全件839成功/26失敗・最終migration88件・独立40件を合算した単一suiteとは称さない。
