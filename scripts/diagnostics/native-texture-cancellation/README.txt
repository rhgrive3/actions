Real-browser native texture cancellation acceptance, prepared for Chromium CI.

Unmodified baseline/candidate native-load modules and the unchanged real source-cache module are served under a single content-hash revision, together with pinned real Three module/core bytes. Only the registry/build-config/source-data boundaries are synthetic: eight loopback PNGs, browser-direct mode, and no geometry requests. This is not a full production build/import graph qualification.

Each of ten cases uses a fresh browser context and private CacheStorage. Eight 16x8 PNGs are generated through native OffscreenCanvas. The loader invokes native createImageBitmap and real Three.Texture. Instrumentation delegates each native close/dispose/cache-match/update call and restores descriptors in finally. It checks native drawImage liveness before caller cleanup and InvalidStateError after real close, exact RGBA, successful returned ownership, and exact call/cleanup signatures.

Scenarios: normal completion; abort before loading; abort at two started cache matches; abort at two started native decode calls with controlled completion delivery; abort after the first native Texture update immediately before synchronous map ownership transfer. The decode barrier establishes abort while loader decode promises are outstanding; it does not measure the decoder's internal execution time or claim an interruptible native decoder.

Baseline cancellation deliberately still processes eight images. The candidate must stop future work and close every acquired bitmap exactly once, without prematurely disposing normally returned textures. Unexpected errors, blank receipts, duplicate cases and ownership leaks fail the gate. Current local controls are synthetic receipt/binding tests, not browser results.

No stage/model assets, real user cache, external network transport, WebGL upload, RSS reduction, iPad/Safari hardware or crash-cause qualification. No local Chromium launch is used. Hosted source head/tree must be frozen before publication; a missing plan pin fails closed. Source/runtime is not modified by this diagnostic.
