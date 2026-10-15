# Bounded negotiated codec: fixed production A/B

Run 38162332113; probe 3bf8514b; baseline bf38901475fa857016cf06bcc98cd764898795d0; candidate 688fe4ba59aa6aca74db3bec76e21043126b7c30.
Artifacts: 11711602729 (single) and 11711312265 (aggregate/legacy). All 30 runs succeeded. Each profile uses AB/BA/AB on one runner; the two groups use different runners. SwiftShader controlled paint workload, not whole-game FPS. Final grids and canvas PNG hashes are identical within each profile. Every decoded event matches its own queued pre-send row. The measured candidate includes encoder/decoder envelope-budget symmetry.

## aggregate
Payload mean change: -18.0027%.
before: bytes/4s [488089, 488170]; compressed [0, 0, 0]; retained heap+backing [17367384, 17373480]; workload p50 [31.0, 32] ms; p95 [52.4, 53.3] ms.
80 send transactions total/4s: [58.5, 70.1, 82.7] ms; receive decode totals [7.9, 4.9, 8.1] ms.
after: bytes/4s [400214, 400264]; compressed [53, 53, 53]; retained heap+backing [17452075, 17458235]; workload p50 [32.1, 33.5] ms; p95 [52.4, 54] ms.
80 send transactions total/4s: [119.9, 122.2, 124.4] ms; receive decode totals [21.1, 21.7, 22.5] ms.
Initial control observations: [{"messages": 4, "clientOutboundJsonBytes": 306, "peerOutboundJsonBytes": 306, "elapsedMs": 2.2000000000116415}, {"messages": 4, "clientOutboundJsonBytes": 306, "peerOutboundJsonBytes": 306, "elapsedMs": 2.2000000000116415}, {"messages": 4, "clientOutboundJsonBytes": 306, "peerOutboundJsonBytes": 306, "elapsedMs": 2.199999999953434}]

## single_legacy
Payload mean change: -0.0134%.
before: bytes/4s [66928, 66933]; compressed [0, 0, 0]; retained heap+backing [16435746, 16436942]; workload p50 [6.1, 6.6] ms; p95 [10, 10.6] ms.
80 send transactions total/4s: [23.3, 21.4, 24.6] ms; receive decode totals [2.5, 2.1, 2.1] ms.
after: bytes/4s [66912, 66929]; compressed [0, 0, 0]; retained heap+backing [16458949, 16467057]; workload p50 [6.1, 6.4] ms; p95 [10.2, 10.3] ms.
80 send transactions total/4s: [20.1, 18.4, 29.7] ms; receive decode totals [1.3, 2.0, 4.9] ms.
Initial control observations: [{"messages": 5, "clientOutboundJsonBytes": 459, "peerOutboundJsonBytes": 306, "elapsedMs": 1.8000000000465661}, {"messages": 5, "clientOutboundJsonBytes": 459, "peerOutboundJsonBytes": 306, "elapsedMs": 2.4000000001396984}, {"messages": 5, "clientOutboundJsonBytes": 459, "peerOutboundJsonBytes": 306, "elapsedMs": 2}]

## single_continuous
Payload mean change: -0.004%.
before: bytes/4s [66938, 66942]; compressed [0, 0, 0]; retained heap+backing [16438724, 16440036]; workload p50 [5.9, 6.1] ms; p95 [9.6, 9.7] ms.
80 send transactions total/4s: [25.1, 25.9, 22.0] ms; receive decode totals [1.9, 2.1, 4.0] ms.
after: bytes/4s [66927, 66943]; compressed [0, 0, 0]; retained heap+backing [16481803, 16482379]; workload p50 [6, 6.2] ms; p95 [9.7, 10.1] ms.
80 send transactions total/4s: [30.5, 25.2, 35.5] ms; receive decode totals [1.7, 1.6, 1.0] ms.
Initial control observations: [{"messages": 4, "clientOutboundJsonBytes": 306, "peerOutboundJsonBytes": 306, "elapsedMs": 1.900000000023283}, {"messages": 4, "clientOutboundJsonBytes": 306, "peerOutboundJsonBytes": 306, "elapsedMs": 2.099999999976717}, {"messages": 4, "clientOutboundJsonBytes": 306, "peerOutboundJsonBytes": 306, "elapsedMs": 2.0999999998603016}]

## single_idle
Payload mean change: 0.004%.
before: bytes/4s [33123, 33125]; compressed [0, 0, 0]; retained heap+backing [14495918, 14496738]; workload p50 [0.2, 0.2] ms; p95 [0.4, 0.4] ms.
80 send transactions total/4s: [9.5, 9.4, 8.3] ms; receive decode totals [1.3, 1.2, 1.1] ms.
after: bytes/4s [33124, 33127]; compressed [0, 0, 0]; retained heap+backing [14524809, 14525685]; workload p50 [0.2, 0.2] ms; p95 [0.4, 0.4] ms.
80 send transactions total/4s: [10.2, 10.0, 9.8] ms; receive decode totals [0.6, 0.9, 0.9] ms.
Initial control observations: [{"messages": 4, "clientOutboundJsonBytes": 306, "peerOutboundJsonBytes": 306, "elapsedMs": 2.2000000000116415}, {"messages": 4, "clientOutboundJsonBytes": 306, "peerOutboundJsonBytes": 306, "elapsedMs": 2.099999999976717}, {"messages": 4, "clientOutboundJsonBytes": 306, "peerOutboundJsonBytes": 306, "elapsedMs": 2}]

## single_mixed
Payload mean change: -0.0037%.
before: bytes/4s [44519, 44523]; compressed [0, 0, 0]; retained heap+backing [16209699, 16210811]; workload p50 [2, 2.1] ms; p95 [5, 5.3] ms.
80 send transactions total/4s: [17.2, 20.9, 19.0] ms; receive decode totals [2.4, 1.8, 2.0] ms.
after: bytes/4s [44511, 44527]; compressed [0, 0, 0]; retained heap+backing [16251090, 16252978]; workload p50 [2, 2.4] ms; p95 [5, 5.4] ms.
80 send transactions total/4s: [27.8, 29.3, 24.6] ms; receive decode totals [1.3, 2.5, 3.9] ms.
Initial control observations: [{"messages": 4, "clientOutboundJsonBytes": 306, "peerOutboundJsonBytes": 306, "elapsedMs": 2.2999999998137355}, {"messages": 4, "clientOutboundJsonBytes": 306, "peerOutboundJsonBytes": 306, "elapsedMs": 2.0999999998603016}, {"messages": 4, "clientOutboundJsonBytes": 306, "peerOutboundJsonBytes": 306, "elapsedMs": 2.1000000000931323}]

Initial supported negotiation: 306 application JSON bytes from each endpoint, 612 combined. A legacy peer adds one unanswered 153-byte hello. No steady control advertisement. Native performance.now timestamps vary between runs; total-byte microdifferences were not attributed from full packet transcripts. Uncompressed ticks retain their original objects. Broadcast uplink is one copy; recipient fan-out is relay egress. The 8-Actor case is one sender aggregating eight same-weapon local actors. Full-page screenshot capture was unavailable; only WebGL canvas equality is established. The observed 18% aggregate bandwidth saving adds CPU and retained memory. No general frame-rate improvement claim.
