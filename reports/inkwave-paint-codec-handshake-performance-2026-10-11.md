# Transition-only codec: exact browser A/B evidence

Baseline main9e865ddbe08c7b4dcde56f87cdfcadf13c175da1; candidate5245fdf7eedeb3ffce420c0630008ba6d5e990e3 (PR1245). Probe5cbae5ed8dedd093ee696d92c6979faf51e3b83e (PR1236), run38156638661. Artifacts11709391610 (single profiles) and11708852381 (aggregate/legacy). All30runs succeeded. Each profile uses AB/BA/AB on one runner; the two profile groups use separate runners, so absolute timing across groups is not comparable. SwiftShader software WebGL; controlled production paint workload, not full-game FPS.

All six runs within every profile have identical CPU paint-grid and WebGL canvas PNG hashes. Canvas-only equality does not establish all-UI screenshot equality. No paint row is removed. No recurring pc or handshake controls occurred in the measured steady-state interval.

## aggregate
Environment: {'cpu': 'AMD EPYC 9V74 80-Core Processor', 'cores': 4, 'node': 'v22.23.3', 'platform': 'linux', 'renderer': 'SwiftShader software WebGL', 'browser': '151.0.7922.34'}
JSON bytes/4s: [488050, 488166] → [400216, 400353]; mean change -17.9937%.
Compressed messages: [53, 53, 53]; setup {'messages': 4, 'clientOutboundJsonBytes': 306, 'peerOutboundJsonBytes': 306, 'elapsedMs': 1.6999999999534339}.
stepAndWire p50 ms: [22.4, 25.1] → [23.2, 24.9]; p95: [39.8, 40.8] → [39.7, 41.1].
Post-GC used+backing storage bytes: [17350300, 17356004] → [17433072, 17441228].
Actual80send-tick total ms: [59.2, 53.0, 56.6] → [86.0, 84.7, 88.0].

## single_legacy
Environment: {'cpu': 'AMD EPYC 9V74 80-Core Processor', 'cores': 4, 'node': 'v22.23.3', 'platform': 'linux', 'renderer': 'SwiftShader software WebGL', 'browser': '151.0.7922.34'}
JSON bytes/4s: [66918, 66920] → [66908, 66934]; mean change 0.0045%.
Compressed messages: [0, 0, 0]; setup {'messages': 5, 'clientOutboundJsonBytes': 459, 'peerOutboundJsonBytes': 306, 'elapsedMs': 1.4000000001396984}.
stepAndWire p50 ms: [5.1, 5.3] → [5.1, 5.2]; p95: [8.3, 8.6] → [8.5, 8.6].
Post-GC used+backing storage bytes: [16420106, 16420814] → [16439986, 16442498].
Actual80send-tick total ms: [30.4, 27.9, 25.5] → [23.7, 26.5, 20.5].

## single_continuous
Environment: {'cpu': 'AMD EPYC 9V45 96-Core Processor', 'cores': 4, 'node': 'v22.23.3', 'platform': 'linux', 'renderer': 'SwiftShader software WebGL', 'browser': '151.0.7922.34'}
JSON bytes/4s: [66896, 66901] → [66893, 66939]; mean change 0.0349%.
Compressed messages: [0, 0, 0]; setup {'messages': 4, 'clientOutboundJsonBytes': 306, 'peerOutboundJsonBytes': 306, 'elapsedMs': 1.2000000000116415}.
stepAndWire p50 ms: [3.6, 4] → [3.3, 4]; p95: [6.4, 7] → [6.7, 7.3].
Post-GC used+backing storage bytes: [16420152, 16425236] → [16463864, 16468464].
Actual80send-tick total ms: [19.1, 19.6, 28.1] → [21.0, 32.5, 40.5].

## single_idle
Environment: {'cpu': 'AMD EPYC 9V45 96-Core Processor', 'cores': 4, 'node': 'v22.23.3', 'platform': 'linux', 'renderer': 'SwiftShader software WebGL', 'browser': '151.0.7922.34'}
JSON bytes/4s: [33120, 33123] → [33121, 33123]; mean change 0.002%.
Compressed messages: [0, 0, 0]; setup {'messages': 4, 'clientOutboundJsonBytes': 306, 'peerOutboundJsonBytes': 306, 'elapsedMs': 1.2999999999883585}.
stepAndWire p50 ms: [0.1, 0.1] → [0.1, 0.2]; p95: [0.3, 0.3] → [0.3, 0.3].
Post-GC used+backing storage bytes: [14480294, 14480814] → [14509010, 14509478].
Actual80send-tick total ms: [6.2, 5.8, 5.9] → [7.1, 7.3, 6.7].

## single_mixed
Environment: {'cpu': 'AMD EPYC 9V45 96-Core Processor', 'cores': 4, 'node': 'v22.23.3', 'platform': 'linux', 'renderer': 'SwiftShader software WebGL', 'browser': '151.0.7922.34'}
JSON bytes/4s: [44496, 44521] → [44493, 44521]; mean change 0.003%.
Compressed messages: [0, 0, 0]; setup {'messages': 4, 'clientOutboundJsonBytes': 306, 'peerOutboundJsonBytes': 306, 'elapsedMs': 1.3000000000465661}.
stepAndWire p50 ms: [1.4, 1.5] → [1.5, 1.5]; p95: [4.4, 4.6] → [4.4, 4.5].
Post-GC used+backing storage bytes: [16193147, 16193915] → [16236055, 16236623].
Actual80send-tick total ms: [17.6, 14.8, 14.9] → [19.4, 21.4, 22.9].

## Interpretation
Eight-local-Actor aggregate paint payload falls about18.0%, while combined whole-workload timing ranges overlap. Send/receive transaction CPU and retained memory rise. The usual one-Actor samples never compress, but recurring advertising cost has been removed; complete payload totals show small cross-run variations. Native wall-clock timestamps can vary; full wire transcripts were not retained, so the exact field-by-field cause of the variation is unverified. The code-level gate proves an individual uncompressed tick is returned unchanged, and compression is accepted only when complete UTF-8 payload bytes decrease. Raw cross-run payload totals must not be described as bit-identical.

Initial handshake costs are application JSON:306bytes outbound from each supported endpoint (612total for the pair). One extra legacy endpoint adds one153-byte unanswered hello, giving459client-outbound+306peer-outbound=765total. There are no retries during steady state. Relay transport prefixes and WebSocket/IP framing are excluded. Ordinary broadcast sends one client uplink copy; the relay performs fan-out to each other peer. Do not multiply the client uplink by recipient count.

This is a bandwidth/CPU/memory tradeoff, not a general frame-rate optimization or completion of retail ink-shape fidelity. PR1235 wall-drop and1238 cache remain separately held. PR1243 old advertisement-based candidate remains unadopted. Main adoption of PR1245 still requires exact CI and parent review.
