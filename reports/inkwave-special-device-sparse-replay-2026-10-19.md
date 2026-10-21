# Wave Breaker / Screen: self-contained device birth and replay lifecycle (#1606)

## Scope and source

- Original reproduction baseline: main `2dfcaa5915aca8957e7414f0bc1ddf0de49b4243`. Integration acceptance baseline: `4395d4bc843e75cfe2ef8392194ac40a0aba0dfa` on `integrate/inkwave-prs-20261019`. Runtime owner: `patches/splatoon3/runtime/all-specials.mjs`.
- [Issue #1606](https://github.com/rhgrive3/actions/issues/1606) identified sparse `device` / `screen` companions after the complete `deploy` event. Its original report was static evidence and did not claim a live two-client failure.
- Existing gameplay calibration is the repository's pinned [Splatoon 3 11.3.0 source reference](https://github.com/Leanny/splat3/tree/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon). AP0/AP57 Wave radius20/27 and per-wave160/216 source frames, the generator390F lifetime, and Screen680F lifetime are retained. Existing serializer quantization (Screen11.333seconds) is unchanged. No new retail networking, motion, collision or timing measurement is claimed.

## Reproduction and change

Actual composed Actor input emits a complete birth followed by a sparse companion. Real NetMatch recording, JSON serialization and remote playback create one object, but companion-first delivery used fallback duration1, AP0, and Wave radius array `[20,24,27]`. A later complete deploy did not repair these fields.

The candidate emits both independently admissible birth rows with the existing `emitObject` serializer. Their packet count, identity, gameplay values and owner simulation are unchanged. The companion now has its own increasing object-event tick. Both first-row variants initialize flight phase and velocity. Old sparse companion rows wait for their full deploy instead of creating a malformed ghost.

A delayed sibling must not rewind an already progressing Wave/Screen. Only the initial device birth applies initial phase/age; `land` / `active` retain their authoritative correction path. Device replay lookup and replay identity are scoped to the actor's accepted life. A small identity marker in the existing bounded384-entry per-actor replay ledger prevents a previously missing sibling from reviving an expired, cleared or explicitly retired device. This is bounded replay retention, not an unbounded promise against arbitrarily old traffic. Other specials' object creation and correction paths retain their existing behavior.

## Evidence distinctions

1. Direct validated recipient playback covers normal/reversed/companion-only pairs, AP0/AP57, duplicate object/effect suppression and exact canonical state.
2. Socket-free real `_sendTick -> JSON -> onMessage -> _playEvents` probes show that reversing rows inside the same complete batch is already ordered correctly. Deliberately removing the canonical deploy exposes the sparse-companion bug. The repaired companion follows the same trajectory, lifetime and three Wave pulses at30/60/120Hz, without ghost paint or damage authority.
3. Delay probes preserve the original event row's sender, life, tick and sequence but deliberately repackage it into a later-timestamp batch after2/30/90 simulated frames. They exercise the receiver's late-sibling resilience; they are not evidence that ordinary transport performs this repackage. Existing-state phase/age cannot rewind.
4. Lifecycle probes cover invalid sender/life, duplicate delivery after retirement, a missing sibling after expiry/clear/terminal-before-birth, accepted new-life regeneration, and land/active correction. Synthetic identity-reuse rows are explicitly envelope-level probes.
5. Source regressions and mutation controls are recorded in the local review manifest. Final exact-head CI, emitted modules and browser/network behavior remain separate acceptance gates.

## Boundaries

The change does not edit relay/session negotiation, paint ownership, packet codecs, models, movement, special damage, status timing or source data. It is separate from PR1627 and #1654. There is no live two-client or Switch/network capture in this source-only review. Terminal replay protection remains bounded by the existing ledger capacity. Visual parity, latency tuning and the repository's other documented calibration gaps remain open.

## Source acceptance at the frozen candidate

- New actual-consumer regressions:12/12, skip0. The same12 on unmodified main:2pass/10fail.
- Existing8 test files (including imported Kraken controls):134/134, skip0. Thus146 passing source checks total, without weakening existing assertions.
- Six isolated mutants fail their intended assertions: sparse Wave, sparse Screen, missing flight initialization, delayed birth rewind, retired sibling resurrection, and missing life-specific replay key.
- AP0/AP57 initial owner snapshots and canonical deploy packets are exactly unchanged. The companion remains one row; serialized row cost grows by292–306bytes in these four cases (after422–464bytes), below the existing4096-byte payload cap. No added per-frame update or independent replay map.
- The existing special-model fixture prints its optional source-motion VM dynamic-import warning while all five model checks pass. This source fixture is not a native renderer/source-animation acceptance.

The frozen integration target retains the same `all-specials.mjs` baseline blob as main2df. The runtime and regression test are byte-identical to the146-pass source candidate. The central note is inserted into the existing Batch C section without changing any other integration-report byte. The emitted sub/special fidelity command gains the same regression file beside `special-device-flight.test.mjs`, reusing its existing production build. Integration source results are recorded separately below; emitted/native results still require exact-head CI.

## Frozen integration source check

The exact4395d4bc integration baseline plus this runtime/test passes the12 new checks and134 existing checks again (146/146, skip0). All consumed source bytes are checked against that official Git tree plus the two owned runtime/test exceptions. The main2df negatives and six mutation controls above remain distinct preserved evidence, not new integration executions.

A separate pure-baseline `adaptBuildSource('src/main.js')` check fails at the native-stage adapter's mandatory `_updateAttract(dt)` call-site replacement. This known integration conflict occurs before the #1606 path and also without this candidate. The Actor/NetMatch source tests do not import that application entry, so their success is not a successful full application build. The independent native adapter repair and a complete composed build remain prerequisites; this candidate does not include or weaken that repair. Exact-head emitted execution remains pending.
