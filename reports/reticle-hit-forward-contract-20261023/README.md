# Remote非致死hit転送：受入範囲の訂正

**ACK変更は実装しない。既存hit経路を保持する `c74a2d6011777eae7e001297c018ffcecaa263e7` のHUD表示修正として扱う。** 通常の有効なremote非致死hitは後続owner tickからマークが1回出た。正常プレイ相当でACKだけが受理され表示が永久に欠落するケース、または明確な異常遅延は今回再現していない。前の調査の「ACK時0」は先行段階の観察であり、「remote命中が常に表示されない」という判定ではない。前報告のACK bridge案は未採用の検討履歴で、実装へ進む根拠にしない。

原候補/PR1859 head `c74a2d`、main7e合成成功の証拠commit `e9f837d0c22191cb522907797a9af3c506fbaef2`、それぞれの既存reportを変更していない。main・PR1854・他PRへのmerge、network protocol/authority/damage、local-references checkerの変更もない。

## Sourceで追った通常経路

1. 実 `Projectiles.applyHit` の所有側処理で正のHP減少が成立すると、native `hit` が同期emitされる。drop / pending / invulnerableはこの表示成功にはならない。
2. NetMatchの `FORWARD` に `hit` が含まれる。`_onLocalEvent` はそのvictimが現NetMatchの所有Actor（非remote）であることを確認し、非致死hitを `_rec` する。これは正当なACKを作る処理と同じ受信要求内で起き、ACK受理を待つ条件ではない。
3. `_rec` はowner event sequenceとsimulation tickを付け、`queueOutboundEvent` に記録する。通常 `_sendTick` の周期は1/20秒。`sendOutboundTick` は先頭から最大256 rowsを送信し、`Transport.broadcast(...) === true` になるまではそのprefixを消さない。正常送信後も同時追加分は保持する。
4. `Transport.broadcast` → WebSocket `b|JSON` → relay `server/src/index.js` のbroadcast処理で、接続中の他memberへ `m|sender|JSON` が送られる。relayはhitをACKに置き換えたりhitだけを除去したりしない。受信Transport → `NetSession._message` →現NetMatchの `onMessage/_tick` に進む。
5. `_tick` はowner clock、payload、simulation tick、event sequenceを検査してowner FIFOへ入れる。`_playEvents` はそのownerの再生時計が到達した時点で処理する。`_play` は現在のremote victimと送信ownerの一致、再生済みsequenceを検査する。同じtick/eventの再送は2回目の表示を作らない。
6. `_playEvent('hit')` がActor参照を復元して既存 `hit` をemitし、composed mainのlocal attacker用listenerが `hud.hitMarker('hit', {damage})` を1回呼ぶ。

主な読取箇所: `patches/network-replication/adapter.mjs`（FORWARD / `_onLocalEvent` / `_rec` / `_tick` / `_play` / `_hitAck` の合成）、`outbound-prefix.mjs`、`snapshot-guard.mjs`、`inkwave-public/src/net/{netmatch,transport,session}.js`、`server/src/index.js`、composed `src/main.js` / HUD。実際の検証はraw snapshotだけでなく本番compositionを使う。

## 終了した最小再現

`scripts/trace-reticle-hit-forward-contract.mjs` / `replay.json` / `replay.log`。実際のcomposed NetMatch / Actor / Projectilesをsource VMで二端末分起動し、native main birthを転送する。受信ownerのHP100→90後に発行されたACKを送信側のonMessageに渡し、その後の通常owner tickも渡す。markerは実HUD busとcomposed mainの実listenerを使い、dispatch呼出しをspyで数える。

| 観測 | 結果 |
| --- | --- |
| 未受理pending / 未認証owner・別match・別life・別attacker ACK | marker 0 |
| 正当な非致死ACK受理とその再送 | combat:confirmed 1、marker 0 |
| 通常owner hit転送と再生 | hit 1、marker 1 |
| 再生前の同一tick再送 | queued hit 1→1 |
| 再生後の同一tick再送 | marker 1のまま、再生済みsequence 2のまま |
| 正常な送信受理後のowner送信queue | 0 rows、hit payloadを含むtickを確認 |
| 任意に破棄したpacket | 0 |

既存 `outbound-prefix.test.mjs` も42/42成功。これにはローカル送信拒否時のprefix維持、部分送信後の重複排除、上限時の明示的abortが含まれる。これらの負の対照を「実プレイで命中表示が欠落した」とは数えない。

## 契約の条件と未検証範囲

sourceが保証するのは、現match・正しいowner/life・有効なpacketとevent・接続継続・受付成功・有界queue内での送信/再生経路である。`outbound-prefix.mjs` 自体もlocal send acceptanceでありrelay ACKではないと明記している。送信512 rows / 512KiB、packet256 rows / 64KiB、受信FIFO512 rows、切断・session交代・owner/life交代・過負荷拒否などの境界があり、任意の通信状態で全hitが必ずendpointへ届くという無条件のend-to-end保証はsourceからは主張できない。

今回はその通常条件の経路と表示1回を確認した。境界状態を任意に飽和させたりpacketを捨てたりして、不具合や新しいHUD経路の必要性を作っていない。再生時計を進めてFIFOをdrainした診断であり、そのための1秒のclock advanceは異常遅延の測定値ではない。

受理済みACKと通常転送をsource/runtimeで検証したが、**本物のlive transport、配備済みrelay、remote browserのマーク描画は未検証**。source VMのbounded transport sinkを、それらの受入へ読み替えない。したがって受入範囲は、原候補の照準・命中マークの見た目修正と、ここに示す通常remote転送のsource dispatch確認である。ACKを追加購読する改変は行わず、独立したnative異常の実証がある場合に限り別途検討する。

main7eとの合成・menu/locker/phoneの可視性・3解像度15点・実遮蔽の成功証拠は前の `reticle-main7e027-acceptance-20261023` に保存したまま。本家映像403は迂回していない。retail動的忠実度、実GPU/Safari/Switch、全remote CI合格という主張は引き続き行わない。
