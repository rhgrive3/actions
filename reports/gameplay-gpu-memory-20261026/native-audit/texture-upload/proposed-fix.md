# Exact selected-mip native texture repair

Owned application file: `patches/native-stages/runtime/native-load.mjs`; focused new test: `patches/native-stages/tests/native-compressed-mip-legality.test.mjs`. No commit was created; integration belongs to root. Source is frozen at SHA-256 `5d799c22a006f5f20283f7aa0ce9183f792a2aa66df995c5a9424e378ec8df57` for root's bundled build.

The actual Scorch KTX2 normal slice has universal Basis `vkFormat=0`, Zstd supercompression,800×60 and10mips; its SHA-256 is `dbba919cb6c79a477294ea5b83541e9eb972bb4dbb7810a351ddaad1d92ec27b`, matching the authenticated manifest. Mobile HIGH selects mip1 at400×30 under its512 normal cap. BC7's base block restriction rejects that height.

The repair leaves every legal compressed path intact. Only a BC-family format with an incompatible selected base uses a retry of the same universal source through the existing KTX2Loader RGBA32 target. The retry source is copied before transferable-buffer detachment, only when advertised capped dimensions can require it. The invalid compressed texture is disposed. The temporary RGBA loader has one worker and is disposed on actual completion; an abort settles the operation immediately but keeps that worker alive until its late callback can dispose its texture safely. Normal compressed worker configuration remains unchanged. Publication verifies the retry's selected mip dimensions match the original selection exactly.

There is no coarser/higher mip, cap change, global compression disable or PNG resize in this successful path. The existing ordinary KTX2/PNG error behavior and ordinary hardware-uncompressed fallback remain intact. The internal WeakSet permits this narrowly verified exact-mip RGBA result through the existing relieved-budget check; it does not admit arbitrary uncompressed transcodes.

`rgba-integrated-probe.json` is the actual changed `loadNativeTextures` source running with real Three/KTX2Loader and real WebGL. Only unused source-data dependencies and the authenticated pack-fetch transport are stubbed for a one-texture fixture; it does not reimplement the loader path. The full KTX2 slice is the real authenticated asset. A separate RGBA32 parse supplies the selected-mip pixel oracle. Source-byte access for PNG is a throwing stub.

Results: legacy BC7 upload reports1282; repaired upload0/draw0,400×30,mip1,nine retained mips, **all48,000 RGBA bytes read from the GPU equal the independent source-RGBA32 oracle**. Browser closed cleanly. This is correctness evidence, not timing/FPS evidence.

RGBA32 requires more bytes than BC7 at the same resolution: selected mip48,000B versus12,800B; full retained mip chain63,588B versus17,232B. This localized representation cost is explicit; no global GPU-memory saving is claimed. The API and512 role cap retain the same selected dimensions.

The console's legacy negative-control GL errors are separated from Three's advisory about overlapping KTX2Loader instances. A temporary exceptional RGBA worker can trigger that advisory while the ordinary compressed loader exists; it is not a GL error. The probe also recorded an unrelated favicon404. The temporary worker's once-only disposal and abort lifetime have targeted assertions.

Validation logs: `unit-mip.log` has17/17 passing (four new focused tests plus existing prebuilt coverage); `unit-neighbors.log` has45/45 passing across cancellation, cleanup, profile reuse and normal readback. Existing assertions/thresholds were unchanged. `git diff --check` passed. Root still needs a normal bundled build and actual full native entry requiring all candidate checkpoints to reportGL0; this tiny diagnostic consumes/isolates errors and is not that acceptance run.
