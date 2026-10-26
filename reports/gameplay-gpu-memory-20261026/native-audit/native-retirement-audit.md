# Native world retirement: actual GC/heap diagnostic

Candidate source `e4bb8f934db08c14abedd41845f0799c33d936e7`, content hash `7fdcf7b17ee32caf9341a1fd4a470d6060f99398eae37a2bd0311aae91d8aed2`. The actual game ran Scorch → Tidewater under normal RAF, low quality, mobile 480×300/DPR 1, two cycles with five seconds sampled combat. This is a retirement diagnostic, not a performance claim.

Only WeakRefs were saved to the first Scorch NativeLevel/data/physics/nativeWorld and triangles/nodes/mask/faces. No geometry inventory hook, listener or per-frame weak polling was installed. A GC followed Tidewater publication after a later task. Final idle was followed by three further independent 250/250/1000ms waits and GCs.

All four captures agree: the old nativeWorld object was collected, but NativeLevel/data/physics and every watched large payload remained. A heap snapshot was then taken before obtaining any strong CDP target handles. Snapshot IDs were resolved from the WeakRefs afterward and their object group released.

## Actual root

`Window.__inkwave.input.canvas → webglcontextlost EventListener → watchNativeContextLoss callback.isNative → buildNativeWorld predicate context → data`

The same context also retains paint/level/nativeNav/physics. Source `native-world.mjs:151` passes `()=>!!G.level?.native` from the per-load try scope. Source `native-gpu-budget.mjs:152-156` installs a single persistent canvas listener and retains that first predicate. Although the predicate does not explicitly read the old payload, V8's shared lexical environment retains it.

Exact emitted engine callback locations are zero-based line 2, column 67009 (`Fn(X.renderer.domElement,()=>!!X.level?.native)`) and line 2, column 57880 (`addEventListener("webglcontextlost",()=>{if(!t())return;...})`). This is application code, not the diagnostic observer. The strong root path does not require weak or ephemeron table-value edges.

This is one retained first-native graph per canvas, not an arbitrary stage-ID cache. It nevertheless keeps at least 11,077,610 bytes of original collision/BVH/mask typed-array payload plus unquantified face/block/nav/paint graphs. It can explain a material part of the native reentry memory increase; this diagnostic does not calculate exact retained bytes or attribute the whole measured heap delta.

A minimal fix can pass a module-scope current-native predicate by reference, preserving one-listener/current-state behavior while avoiding any per-load context. Validate the emitted/minified game with this same WeakRef control; a source-only assertion is insufficient for this engine-level lifetime bug. No fix was applied by this audit.

`native-retirement-audit.json` includes complete numeric receipts, source/content hashes, callback locations, target IDs, root paths and all artifact hashes. The 459,723,222-byte heap stays local and must not be committed. The diagnostic browser is closed.
