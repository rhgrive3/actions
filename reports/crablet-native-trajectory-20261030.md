# Crabletの受信側弾道検査（2026-10-30）

PR #1925の最初の中心向きLOSは、実Physicsで2つの部分遮蔽反例を起こした。実弾が壁に当たるのに中心が見える場合と、中心が隠れていても弾が球の端へ届く場合がある。この候補は中心へのLOSを撤去し、受信したnative projectileの軌道とfield衝突半径を使う。対象はhost BossのShooter/Dualies/Splatling/Chargerによるcrablet claim。Boss本体・PvP・範囲攻撃・sub/Specialの既存方針は変えない。

受信済みbirthを既存のnative parser/initializerで非描画probeへ復元し、実際のInkFlight・fidelity・catalogue integratorを呼ぶ。既存のCharger fire eventは実際の有限飛行とsource半径へ接続する。ghostの空き、乱数、Actor更新、塗り、描画、damage callbackを必要としない。native projectile IDにより、同時刻・同じmuzzleの別弾を区別し、再送で軌道を差し替えない。match/Boss/Actor/lifeの境界で失効する。

接触点はnative `Boss._segCrabs`と同じ、各60Hz segment上の最近点（中心y+.35、半径.55+native pad）である。解析的な球の入口に置き換えると既存のterrainとの前後関係が変わるため、それも行わない。実world sphere sweepで接触までの経路を確認し、terrainを先に当たった弾は後段で復活させない。拒否時はproof使用回数とtargetを消費しない。worldは再照会するため、障害物が消えた後の合法retryは可能。

受信側だけが観測した同じcrablet objectの位置を最大1.2秒保持する。64 sampleのring、scene上限48、peerあたりbirth160、flight上限210 step/3.5秒で保持と探索を制限する。未知のtarget、life変更、再利用ID、古い履歴、異常なworld応答は許可しない。経路外のclaimはworld全区間をsweepしない。受信済みfire poseをmuzzle検査に用い、発射後に攻撃者が移動しても新しい位置へ弾を曲げない。

検証は通常の合成済みソースで実行した。実producer/serializer/native decoderを使い、native3 familyとcatalogue4 familyの位置・速度を実ghost飛行と照合した。legacy Chargerの短押し・半チャージ・fullも実飛行と一致。2つの実Physics反例、移動と履歴失効、再送・別life・壊れたworld・cosmetic枯渇、実NetMatchの同時刻2発→native Boss HPの2回だけの変化を含む。関連武器検証256件は全成功。限定combat群94件、追加metadata群73件も成功した（重複範囲あり）。広いnetwork群と配信コードの最終確認は後続記録へ追加する。

既存の正例fixtureには、y=1.05の弾に対して中心y=.35のcrabletを置いたものがあった。正例を実際のnative軌道上へ置き直し、弾のspreadを固定軸へ置き換えない。過去のscan比較は凍結ソースを変更せず、後から追加したreceiver trace metadataだけを比較対象から外す。metadata sandboxには新helperの実装を能力監査付きで読み込む。

これは任天堂のBoss実装の再現でも、入力・インク・全targetのtrusted simulationでもない。ownerが有効なbirthを偽造できる問題、全接触の時刻や最初のActor/Boss body/kit-defenseとの競合、実機・実ネットワーク遅延の完全な検証は別に残る。#1665/#1666を解決済みとはしない。Splatoon 3 Ver.11.3.0のパラメータ、公開版の通常飛行、wire形式、locked upstream sourceを変更しない。
