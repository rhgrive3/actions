> Evidence correction (2026-10-11 16:31 UTC): earlier codec-specific “source/built40/40” labels below refer to repeated source-composition tests because that robustness fixture ignored INKWAVE_BUILT_SITE. Production browser/AB evidence remains valid. The later handshake candidate adds explicit actual-built loading and manifest output. PR1243 head41552bb is not adopted: real one-Actor18-run measurements increased traffic7.4–17.2%, with no compressed messages. Historical measurements below remain for traceability.

# Lossless paint dictionary candidate (local transport integration, unpublished)

Base updated to adopted main b49de995, exact tree9ec80ba07ff059b8a600a211cfa53b22df245390. Local candidate installs two narrow NetMatch send/receive hooks; it remains unpublished and unadopted.

The codec factors common paint fields into at most64 dictionary entries, preserving exact numeric/string values, original ordering, every paint event, HLC strings, ticks and sequence numbers. It never skips same-team ink. Unsupported/inefficient outgoing sets retain original rows. Decode fails closed before expansion:512 rows,64 dictionary entries,65536 traversed nodes,8 levels,1024-character strings,finite bounded numbers; invalid indexes, unknown versions, prototype keys and ambiguous simultaneous compressed/legacy event sets are rejected.

Negotiation prototype binds support to the relay-provided membership and current match identity. All current peers must advertise the exact version. Joining or unknown peers force legacy output; membership removal and new-match reset discard old support. Host role grants no special codec authority. On decode, the actual transport sender must still be passed unchanged into existing NetMatch sender/life/HLC/score admission. Capability is only an encoding compatibility statement.

## Evidence
-24 pure codec/negotiation regressions pass, including mixed/unknown peers, join/leave/new-match, bounded malformed input and exact JSON roundtrip.
-3 actual NetMatch/PaintSystem tests pass: delayed/opposite same-time paint, duplicate events, forged owner team rejection, real _sendTick JSON and unchanged grid/count/coverage/score. The additional third test exercises installed _sendTick/onMessage negotiation, new legacy peer fallback, host-role change, authenticated sender rejection and exact grid/score parity. Native array-only annotations are omitted exactly as JSON does; gg/gc/SuperJump sidecars survive unchanged.
-80-tick/4-second captured wall-drop workload:964,914 original JSON bytes→677,778 encoded (29.76% reduction), every decoded packet deepEqual. This trace predates current main; it is volume evidence, not a live production speed claim.
-Node24 synthetic1600-tick repeated costs:
  - Legacy send p95 .129–.148ms; codec .436–.505ms.
  - Legacy receive p95 .104–.110ms; codec .151–.187ms.
  - Observed JS heap rise during sample8.44–16.87MB legacy vs8.48–8.57MB codec; GC timing makes these sampled maxima noisy, not a strict peak bound.
  - GC retained delta31–86KB in these loops; full gameplay/relay memory still unmeasured.

## Required next gate
Review the installed narrow NetMatch tick wrapper that reads trusted relay membership; generic paint admission, HLC, ownership, scoring and sender identity are unchanged. Add real mixed-peer session/host-adoption tests and a same-runner browser workload comparison including sender/receiver CPU, bytes and memory before any main adoption. Remaining wall-drop cost is not solved by this prototype; its event count remains identical.

Source network suite initially found24 failures solely from two method-extraction test harnesses missing the newly imported helper. Both now inject the real acceptPaintTick function (no mock bypass); focused hit/adoption26/26 and match-boundary2/2 pass. Full network suite rerun:451/451 pass. Production build5f4cb1cc51bd and 27/27 codec tests pass (24 pure +3 actual transport).

Separate local composition with PR1242 head2104d8cc verifies compressed paint + gg identity sidecar through actual JSON receive and host adoption:57AP retained. This PR1242 code is not included in the codec candidate.

## Real browser evidence (initial head b5c19ce)
Run38147605578/artifact11705700736, fixed main b49de995 versus b5c19ce, EPYC7763/4cores/Chromium151 SwiftShader, AB/BA/AB. All6runs preserve1440events,185830quads,229draws,wall2340/floor1528grid and identical PNG.53/80ticks use compression. JSON431820–431868→346328–346351bytes/4s (~19.79% reduction). One client uplink~108→86.6KB/s;7receiver relay egress~756→606KB/s; transport overhead excluded. stepAndWire p50 30.4–32.4→30.8–32.5ms and p95 49.9–50.8→49.8–51.3 overlap. Send-tick-only median .4→.5ms; receiver decode p95 .1–.2→.3ms. GC used+backing after workload17.291–17.296→17.359–17.364MB (~70KB extra). Bandwidth improves; no overall speed improvement claim.

## Review hardening
Dictionary COMMON values are immutable numeric scalars, native kind0 or its9 permitted string names, instant0/1, and tag/match strings. Mutable arrays/objects are rejected before expansion, preventing cross-row aliases. Native onLeave retires capability immediately, including leave+same-ID rejoin between sends and host migration; a fresh legacy peer receives legacy rows until its own new exact-version advertisement. These hardening changes require new exact-head CI; the preceding browser measurement remains scoped to b5c19ce.

The first hardening browser rerun38149126581 failed its compression-active gate: numeric-only kind validation rejected legitimate native drop strings, so packets safely fell back to legacy. Corrected to the existing exact PAINT_EVENT_KINDS contract; all10native kind forms have compress+decode equality tests, and actual transport/rejoin tests now use drop. Mutable fields remain rejected. The failed run is not performance evidence.
