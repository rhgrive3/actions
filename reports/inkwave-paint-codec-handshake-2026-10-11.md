# Separate candidate: transition-only paint capability negotiation

Base: adopted main 9e865ddbe08c7b4dcde56f87cdfcadf13c175da1, including static gear adoption. PR1243's old head41552bb remains unadopted and unchanged: its one-Actor idle/continuous/mixed browser benchmark increased traffic17.2%/7.4%/11.9%, with zero compressed messages. Its eight-local-Actor aggregate result saved19.8%, but is not a one-human-client result.

This candidate removes every-tick capability advertisements. A dedicated `paint-codec` hello/ack travels through actual NetSession._message default routing and existing Transport.sendTo. Each membership epoch has a cryptographic random generation; each peer also has a fresh challenge. Acks must echo that peer's challenge, match, version, and known generation. Same-ID leave/rejoin and match changes retire state. Peer generation changes renew only the necessary challenge. Unknown versions block encoding until a valid capability transition. Missing crypto or failed/dropped hello/ack leaves legacy traffic. No timer retries or recurring advertisements are added.

Relay contract: Transport._raw returns true after WebSocket.send, not an application delivery receipt. server/src/index.js catches recipient send failures without a generic acknowledgement. Therefore only the codec's matching ack confirms capability. Failed negotiation can remain legacy for the membership epoch. This is a safe missed optimization, not a delivery guarantee.

Each compressed tick includes its sender generation, and the receiver checks it against the negotiated peer. Plain ticks are unchanged. The decision compares UTF-8 byte length of the complete candidate packet, including the generation and all other sidecars. Sender identity, paint births, life, HLC ordering, event limits, ownership, score and duplicate admission remain downstream unchanged. No paint row is removed or quantized.

Tests cover hello/ack loss, send failure, one-direction acknowledgement, reversed hello/ack order, stale nonce, other match/sender, duplicate hello, same-ID rejoin, host role changes, departure mid-negotiation, capability changes, non-ASCII names/order strings, zero steady-state plain-tick byte increase and actual NetSession→NetMatch JSON ownership/score equivalence.

Validation correction: the earlier codec-specific40-test invocation with INKWAVE_BUILT_SITE silently used the network robustness fixture's source-composition path. It is source-composed evidence, not actual-built evidence. Existing CI browser/AB artifacts did use production builds and remain valid. This candidate adds an explicit built fixture mode that reads the production manifest, loads published src and runtime files directly and disables source adapters; dedicated codec unit imports also use the built module. Counterfactual source suites continue using source mode by default.

No adoption claim yet. Actual browser one-Actor and eight-Actor repeated A/B measurements must confirm steady-state bytes, initial handshake cost, send/receive CPU, retained memory and canvas/grid equality. These results must not be substituted with PR1243's old fixed-head results.

Parent review caught a candidate-only receive-continuity bug before publication: resetting all peer states on an unrelated member joining could reject correctly sent paint already in flight. Membership updates now preserve non-departing peers' receive generations and existing capabilities; only the new peer is unnegotiated, so outgoing broadcast falls back to legacy. A departure removes only that peer. Full resets are limited to local identity/match changes. Actual Session join/leave-before-delayed-paint tests preserve the final grid and credit. Same-ID departure/rejoin rejects the old packet both before and after a fresh negotiation.

Connection lifecycle inspection: NetSession._connect first calls leave(true), which disposes and clears the old match. NetSession._begin always constructs a new NetMatch. _closed also disposes and clears it. No normal reconnect path reuses NetMatch. The relay itself generates a fresh random ID, but the test deliberately reuses the ID and proves the newly constructed endpoint has a different codec generation. A stale generation is rejected before the unchanged owner-admission handler.

## Fixed-head performance and integration evidence

PR1245 head5245fdf7eedeb3ffce420c0630008ba6d5e990e3 passed all required CI (Validate38156538610 and numerical/reopened workflows). The fixed main9e865→5245 browser comparison passed all30runs: run38156638661, artifacts11709391610/11708852381. Full details, including ordinary one-Actor CPU and memory costs, are in `inkwave-paint-codec-handshake-performance-2026-10-11.md`. This result remains tied to those two exact SHAs, not a later integrated main.

PR1244 merged as main bf38901475fa857016cf06bcc98cd764898795d0. Its official Git tree e8b79e9cf7ecd037f58700dd99930cab1ad00b63 matches the local integration base. Both static/conditional gear adapters are retained. The composed actual-built suite passed77/77 with contentHash5515132b671bbb7addad71ff0db09e66aaf5baba1d1968d79ac012960e26c2b4. An additional actual JSON test asserts pe is present, gg/gc survive, Comeback remaining time goes12→10 after takeover→0, and its speed effect expires. This is integration evidence; the final combined exact-head CI still must run after main alignment.

## Encoder/decoder envelope symmetry review

A same-realm boundary test found that a legacy event object nested five or six
levels deep could pass the original row budget but exceed the decoder's depth
budget after the dictionary envelope added wrappers. A 508-row mixed packet
also reproduced node-budget overflow caused only by those wrappers. Such
packets must remain legacy, rather than be encoded and rejected remotely.
The encoder now validates its generated payload with the unchanged decoder
budget before choosing compression. Depth, node-count, string and UTF-8
profitability boundary regressions cover the fallback. Receiver bounds and
sender/HLC admission are unchanged. Earlier performance runs predate this
extra bounded traversal; new exact-head measurements are required.

Separately, VM transport fixtures now parse wire JSON in the receiving realm.
Passing Node-created event objects directly into a VM had triggered the
codec's intended plain-object rejection. Same-realm death/respawn and mixed
paint playback succeed; the runtime safety check has not been relaxed.
