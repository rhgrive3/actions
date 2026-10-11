# Flat ancillary coefficient candidate (unadopted)

Parent: local70b17c7 / PR1238 head0fc5a49, including main3fe64. This isolated candidate does not contain later powered-envelope integration or the wall-drop feature. PR1238 remains unadopted.

Replace per-ray/satellite/drip objects and separate arrays by a single Float64Array per cached face basis. Keep double precision, original arithmetic ordering, pool and face identity guards, every cell visit, HLC comparison and emitted paint event. Floor faces allocate no wall-drip coefficients. No new persistent map or network format.

## Local evidence
- Frozen native oracle4608 combinations, pool/face mutations, alternate satellite/spatter contracts3/3 bit-exact.
- Focused oracle/visibility/network regressions18/18 (built environment supplied where the fixture supports it; pure oracle imports source).
- Node24 --expose-gc synthetic10,000 retained growth records, ABBA, identical checksum1448145.6780666243.
  - Object cache: retained JS heap20,851,320–20,851,392 bytes, ArrayBuffers0.
  - Flat cache: retained JS heap6,600,536–6,600,616 plus ArrayBuffers3,279,984 bytes.
  - Cold construction: object62.1–72.4ms; flat53.5–54.8ms.
  - Hot100,000 calls: object109.3–159.4ms; flat144.8–148.6ms. No stable hot-speed benefit established.
- Measurement code retained in local .ci-scratch/cache-retention.mjs; no real browser performance conclusion.

This is a reduced-retention candidate, not evidence that the whole-game or cold-render regression is solved. Same-runner real WebGL workload with memory samples is required before adoption. Do not conflate this result with PR1236's prior object-cache browser data.
