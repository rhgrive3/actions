# Integrated paint optimizations: PR1254 includes PR1258

Base: adopted mainaca88a4899e1f497f9aa3d6514ae3934979eed75. All weapon-model, Fast acceleration, direct-sub resistance and mark-lifetime changes remain. No held wall-drop1235, cache1238 or codec1245 code is included.

## Runtime changes
1. Coalesce immediately consecutive owned clip rectangles only when their horizontal bounds exactly match and vertical edges touch. The union is unchanged; no holes or foreign ownership are included. Existing scratch arrays are reused.
2. Omit local-only deduplication Map keys which have no read path. Keep every order record, sequence, grid ID and network-key deduplication. Both stores still clear normally; total match memory is not globally bounded by this change.

## Independent evidence retained
- Rectangle head95d395bf: real GPU source/built atlas equality for6floor/wall cases; same-runner12-run production workload versusd1ad48. Single-Actor quads24277→21863 and8local-Actor185830→160925. Exact final grid/canvas/event rows and draw calls match. Single p50 ranges2.0–3.0→2.2–2.6ms;8Actor17.3–19.5→19.1–19.8ms. Submission reduction is established; whole-workload CPU/FPS improvement is not consistent. Run38173843288, artifacts11714792706/11714994542.
- Rectangle head62cc04f9 on Fast main: actual source/built GPU masks remain byte-identical. Artifact11718257189, build68f7ffa48d9ef9f0a7c6119e9350dca78d40d938ee575ee7db6e34c423a24796.
- Local Map synthetic6isolated Node processes:50000local IDs retain6.30MB old versus2.85–2.87MB candidate afterGC. Record50001 remains in both, Map50000→0. This component measurement is not a measured game-wide memory percentage.
- Map headc2ec92c9 on Fast main: real-browser source/built each verifies10000local IDs, one deduplicated network key,10002records,clear and new-match restart. Artifact11718299010, build08479559f6d9d6101f8dc78e8e09a2ff11c5b640222d9bd3b25f060111d7fa1e.
- Older Map9069 had one first-round touch-cursor UI failure with CSS transition startTime:null; later rounds succeeded. The UI test was not relaxed; latestc2ec passed the same UI job.

## Final composition
Local combined actual-built69/69 covers both optimizations, hidden simulation, temporal ownership and adopted mark/receipt/observer behavior. Buildf3fa2947cce6b4c2cbebc934117328235d0238adcca637f53a8ea91829a588fd before the engine-verifier-only extension. Both built gates and both fixture probes are preserved.

The mandatory paint-mask verifier now runs the same strict source/built/GPU/clear checks in Chromium and WebKit. Chromium-specific launch flags do not leak into WebKit. No error tolerance or ownership assertion is relaxed. Engine selection contract2/2 passes locally; actual final combined engine execution and all required CI remain pending until their receipts are read back. Old-head success does not substitute for that evidence.

Local validation checkouts omit267documentation images for storage efficiency. Published trees use the official complete main tree and preserve every image blob; complete expected tree hashes are independently reconstructed from official recursive entries.
