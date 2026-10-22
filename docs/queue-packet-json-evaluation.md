# Rejected packet JSON guard prototype

The queue proposal `reuse-bounded-network-packet-serialization` was evaluated on
2026-10-22. Reusing the codec's selected JSON must preserve nested getters,
`toJSON`, typed arrays, and wrappers that modify packets before native broadcast.
A prototype used an attempt-local descriptor plus a recursive plain-data guard.
It passed 122 outbound/codec/queue regression tests, then was rejected on cost.
No prepared-JSON sender or guard is enabled in production.

Reproduce the isolated synthetic V8 comparison:

```sh
node scripts/benchmarks/rejected-packet-json-guard.mjs
```

The fixture has eight actor rows and forty compressed paint rows. After 1,000
warmups it measures 10,000 iterations. One run measured 172 ms for the existing
`JSON.stringify` and 2,315 ms for the hook-safe descriptor guard (13.5 times its
cost); an earlier run measured 85 ms and 1,605 ms. These are synthetic CPU costs,
not browser frame times or device performance. The benchmark prints its own
current measurements and `adopted:false`.

The original safe serializer, exact UTF-8 frame limit, backpressure checks and
retry behavior are retained. A future candidate needs a narrower producer-owned
materialization contract that proves safe reuse without rescanning the packet,
plus byte-for-byte parity and measured cost improvement. This report rejects
one candidate; it does not establish that every possible reuse design is slower.
