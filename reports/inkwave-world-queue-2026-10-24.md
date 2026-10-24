# World and native optimization queue — 2026-10-24

Baseline: `7f863ea2d65671abd1453fdae1b61de00f1d10e2` (Drive manifest identity matched before implementation).

## Outcome

37 queue rows: 28 implemented (including one duplicate sphere request), 4 already effective in the complete source composition, 5 proposals declined with concrete correctness or evidence constraints. No unmeasured browser speedup is claimed.

## Verification

- Native batch: 175 tests, 170 passed, 5 optional external-fixture skips, 0 failed.
- Legacy construction batch: 195 tests passed, 0 failed or skipped. A further packed-cache corruption regression passed after that batch.
- Five legacy layouts retain exact frozen navigation nodes/edges/components and exact props vertices, normals, colors, UVs, indices, bounds, colliders, instances and shadow flags.
- Worker spheres match THREE from final Float32 buffers. Normal reconstruction controls exhaust both normal encodings across 131,072 byte pairs.
- Paint follow-up: 13 tests passed, every one of the 24 raw upstream hashes matches, and moving the range change into the terminal adapter preserved the exact composed source.
- Failure paths cover prepared-file tampering/extras/symlinks, cache metadata corruption, cancellation and detached ownership. External browser/GPU/device qualification is separate.

## Splatoon 3 behavior comparison record

The work changes construction scheduling, memory ownership and CI-independent preparation. It does not alter reference weapon/gear constants or claim new retail-device parity. Geometry/navigation comparisons are against the existing INKWAVE baseline, not measurements of Nintendo software. Collision selection, paint CPU/version semantics, source face membership and first-shot pack availability retain their existing behavior. Retail reference version, hardware timing and rendered native-stage GPU A/B remain unmeasured.

## Per-item disposition

### native-nav-lazy-allocate-optional-transition-candidate-lists

Status: **implemented**. Optional jump, drop and surge candidate lists allocate only for occupied cells. Candidate and edge iteration order stays exact.

Source/evidence: `patches/native-stages/runtime/native-nav.mjs`.

### native-obj-write-direct-to-presized-vertex-index-buffers

Status: **implemented**. Two passes retain final material classification and compact inactive offsets while writing exact final typed arrays without per-object builders.

Source/evidence: `patches/native-stages/runtime/source-convert.mjs`.

### native-display-precompute-exact-bounding-spheres-in-worker

Status: **implemented**. Worker computes the exact THREE box-center/max-distance sphere from the final Float32 positions; main validates center/radius and falls back for legacy prepared data.

Source/evidence: `patches/native-stages/runtime/source-worker.mjs`, `patches/native-stages/runtime/native-render.mjs`.

### native-band-hash-deduplicate-cached-height-scalars

Status: **implemented**. Immutable height scalars belong to each block rather than every spatial bucket. Hash replacement invalidates the arrays, and dynamic blocks retain their prior conservative path.

Source/evidence: `patches/native-stages/runtime/native-level.mjs`.

### ink-volume-stream-decompression-direct-sized-buffer

Status: **implemented**. Decode writes streaming chunks into one manifest-sized output, rejects oversize/truncation and cancels the stream on failure. No changed VTF sample values.

Source/evidence: `patches/local-quality/ink-volume/pack.mjs`.

### defer-unneeded-roller-ink-volume-pack-at-boot

Status: **not-adopted**. Not adopted: roller/brush and several slosher recipes share the pack, attract mode selects a random eight-weapon roster synchronously, later ghost births and instant practice weapon swaps can introduce new consumers. Removing the existing warmup barrier without migrating all these readiness boundaries risks first-shot fallback and midmatch decompression. Direct sized decompression was adopted without changing first-shot presentation.

Source/evidence: `patches/local-quality/ink-volume-adapter.mjs`, `patches/local-quality/ink-volume/recipes.mjs`, `inkwave-public/src/main.js`.

### native-display-spatial-batch-static-opaque-objects

Status: **not-adopted**. Not adopted: current object geometry uses zero-copy typed views, stable per-object identities and per-object culling/shadows. Merging disjoint objects requires new vertex/index storage and changes culling boundaries. The queue explicitly requires representative rendered/GPU/peak-memory A/B before adoption; that evidence is absent. Exact worker spheres were implemented as the behavior-preserving alternative.

Source/evidence: `patches/native-stages/runtime/native-render.mjs`, `patches/native-stages/runtime/source-worker.mjs`.

### native-prepared-stage-bound-concurrent-binary-fetches

Status: **implemented**. Prepared binary requests use 3 desktop / 2 constrained workers with linked abort, first-error admission stop and all-settled cleanup.

Source/evidence: `patches/native-stages/runtime/native-load.mjs`.

### native-source-stream-over64mib-avoid-chunks-join-peak

Status: **implemented**. The authenticated exact-length preallocation range now covers the pinned ~126 MB OBJ (bounded at 256 MiB); unknown lengths retain fallback semantics.

Source/evidence: `patches/native-stages/runtime/source-cache.mjs`.

### native-source-paint-charts-transfer-packed-triangle-ids

Status: **implemented**. Face memberships share one Uint32 backing buffer and are transferred once; derived-cache seal hashes packed bytes and view ranges without per-ID JSON object expansion.

Source/evidence: `patches/native-stages/runtime/source-worker.mjs`, `patches/native-stages/runtime/source-cache.mjs`.

### native-stage-overlap-navigation-with-texture-network-waits

Status: **implemented**. Unconstrained desktop overlaps detached navigation with texture work, with shared cancellation and rejection observation. Low-memory/touch and unknown test environments remain serial.

Source/evidence: `patches/native-stages/runtime/native-world.mjs`.

### native-minimap-slice-first-support-raster-before-visibility

Status: **implemented**. The same minimap generator serves sync and 4 ms async callers; detached world preparation awaits the initial raster before publication, with cancellation.

Source/evidence: `patches/native-stages/runtime/native-minimap.mjs`, `patches/native-stages/runtime/native-world.mjs`, `patches/native-stages/runtime/engine.mjs`.

### legacy-nav-slice-synchronous-stage-construction

Status: **implemented**. A generator slices sampling, edges and component pruning; production awaits the detached graph before replacing the visible world. Sync API remains available and five layouts match frozen graph/cell/component order.

Source/evidence: `inkwave-public/src/core/buildSlices.js`, `inkwave-public/src/game/nav.js`, `patches/local-quality/queue-world-20261024-adapter.mjs`.

### native-png-release-temporary-inference-canvas

Status: **implemented**. Temporary inference canvas/context live inside an outer finally; its dimensions are zeroed and references dropped on every exit.

Source/evidence: `patches/native-stages/runtime/native-load.mjs`.

### native-paintchart-hoist-triangle-sat-extrema-from-pixel-loop

Status: **implemented**. Triangle SAT extrema, projections and margins are calculated once per triangle before the texel loop while retaining the original overlap predicates.

Source/evidence: `patches/native-stages/runtime/source-convert.mjs`.

### native-png-cache-verified-channel-inference-on-stage-reentry

Status: **implemented**. A bounded 256-entry scalar cache uses authenticated bytes, role, requested/actual dimensions and algorithm version. Every request still verifies bytes; no pixels, canvas, material or world resources are retained.

Source/evidence: `patches/native-stages/runtime/native-load.mjs`.

### native-source-retention-reseal-ledger-after-corrupt-cache-delete

Status: **implemented**. The locked delete transaction reads the latest sealed ledger, marks uncertainty, deletes the body, removes known-file metadata and reseals while preserving high-water history; unknown files remain uncertain.

Source/evidence: `patches/native-stages/runtime/source-retention.mjs`.

### native-pinned-inventory-avoid-repeat-worker-tree-revalidation

Status: **implemented**. Only worker-verified scalar inventory proof is memoized in a bounded page-local map keyed by runtime pin and stage. New workers can reuse that proof when the stage tree still matches.

Source/evidence: `patches/native-stages/runtime/source-worker.mjs`, `patches/native-stages/runtime/source-data.mjs`.

### legacy-propkit-slice-synchronous-placement-and-merge

Status: **implemented**. Placement, static merge, exact bounds and mesh publication yield only at safe points; each suspended merge owns its normal matrix. Five layouts retain exact collider/attribute/index/bounds/instance/shadow state and rebuild parity.

Source/evidence: `inkwave-public/src/core/buildSlices.js`, `inkwave-public/src/world/props-core.js`, `patches/local-quality/queue-world-20261024-adapter.mjs`.

### legacy-propkit-failure-cleanup-and-collider-rollback

Status: **already-effective**. Already effective in the composed baseline: detached prop acquisition disposes failed ownership and rolls colliders back to length zero before any world publication. Raw main alone hides this adapter.

Source/evidence: `patches/reliability/start-adapter.mjs`.

### legacy-texlib-restore-renderer-state-and-release-on-failed-generation

Status: **already-effective**. Already effective in the composed texlib: incremental acquisition is inside try/finally, renderer target/autoClear/XR state is restored, owned output is disposed on failure and ownership transfers only on success.

Source/evidence: `patches/local-quality/texlib-adapter.mjs`.

### legacy-lightmap-cache-validated-metadata-on-stage-reentry

Status: **already-effective**. Already effective: Game owns a bounded four-layout immutable metadata cache with layout-hash validation and stale refetch. GPU lightmaps remain freshly acquired and world-owned.

Source/evidence: `patches/local-quality/runtime-frame-scratch-adapter.mjs`.

### legacy-stage-swap-skip-discarded-paint-target-clear

Status: **implemented**. After final map fallback resolution, a changed legacy destination skips clearing the outgoing atlas that will be disposed. Same-world restarts and native rollback paths still clear it; new PaintSystem initialization remains.

Source/evidence: `patches/local-quality/queue-world-20261024-adapter.mjs`.

### native-ink-tile-membership-use-guarded-uint16

Status: **implemented**. Tile-membership IDs select Uint16 only for at most 65,536 chunks, otherwise Uint32; offset/range arrays remain Uint32.

Source/evidence: `patches/native-stages/runtime/native-ink-chunks.mjs`.

### native-source-inventory-pack-git-tree-hash-without-per-child-chunks

Status: **implemented**. Each Git tree payload uses one exact final buffer, one UTF-8 encoded name per child, and direct mode/name/SHA writes; byte ordering and tree identity remain exact.

Source/evidence: `patches/native-stages/runtime/source-inventory.mjs`.

### native-local-prepared-assets-copy-unlisted-and-unhashed

Status: **implemented**. Prepared manifests and every listed body are verified before use and again at copy; symlinks, extras, traversal and changed bodies fail closed. Each verified buffer is copied once with output-hash verification. Parent moves this copy before build identity generation.

Source/evidence: `scripts/lib/inkwave-native-stages.mjs`.

### native-source-obj-token-whitespace-fastpath

Status: **implemented**. ASCII whitespace uses char codes while Unicode whitespace retains the regular-expression fallback and original token boundaries.

Source/evidence: `patches/native-stages/runtime/source-convert.mjs`.

### native-source-paintchart-avoid-per-triangle-string-keys

Status: **implemented**. Paint-chart grouping uses integer hash buckets plus full component equality, retaining first-seen group order and collision correctness without triangle string keys.

Source/evidence: `patches/native-stages/runtime/source-convert.mjs`.

### native-display-precompute-object-sphere-in-source-worker

Status: **implemented**. Covered by the same exact worker sphere implementation as native-display-precompute-exact-bounding-spheres-in-worker; no duplicate transformation or approximation.

Source/evidence: `patches/native-stages/runtime/source-worker.mjs`, `patches/native-stages/runtime/native-render.mjs`.

### native-minimap-reuse-support-raster-buffers-across-rebuilds

Status: **implemented**. Same-sized support/normal/pixel/owner/hit arrays are retained and explicitly refilled; owner changes, dimensions and source mutations still invalidate the existing support cache.

Source/evidence: `patches/native-stages/runtime/native-minimap.mjs`.

### native-collider-object-spatial-index-for-physics-and-inside-tests

Status: **not-adopted**. Not adopted: source faces and collidable static objects are already inside staticBlockCount. queryDynamicBlocks/pointInside scan only later dynamic blocks, and NativePhysics skips those scans with no dynamic blocks. The proposed 400-static-object scan is not the production path; static triangles already use a BVH. A mutable dynamic index adds retention/invalidation work without a demonstrated workload benefit.

Source/evidence: `patches/native-stages/runtime/native-level.mjs`, `patches/native-stages/runtime/native-physics.mjs`.

### paint-atlas-reuse-bufferattribute-update-range-records

Status: **implemented**. Each GPU BufferAttribute retains one update-range record whose count is updated and reused after clearUpdateRanges; CPU grid mutation/version behavior is unchanged.

Source/evidence: `patches/local-quality/queue-world-20261024-adapter.mjs`, `inkwave-public/src/world/paint.js` (pinned input unchanged).

### native-minimap-reuse-validated-reachable-nav-layers-on-rebuild

Status: **not-adopted**. Not adopted: graph nodes/edges are public mutable and existing tests change node.x and nb.push without a revision. Reusing reachable layers by reference/version would be stale. An exact per-node/per-edge snapshot still requires O(V+E) validation and retained memory, so the safe support-buffer reuse was adopted while reachability remains freshly computed.

Source/evidence: `patches/native-stages/runtime/native-minimap.mjs`, `patches/native-stages/tests/native-minimap-flip-cache.test.mjs`.

### physics-segment-capsule-compare-squared-distances

Status: **already-effective**. Already effective in collision-hotpath adapter: squared comparisons retain a sqrt fallback for boundary rounding ties, preserving capsule hit choice.

Source/evidence: `patches/local-quality/collision-hotpath-adapter.mjs`.

### native-normal-map-conditional-length-check

Status: **implemented**. Lengths strictly below the clamp threshold bypass Math.hypot; the threshold band uses the original function to retain rounding and output bytes. Exhaustive normal-byte controls cover both encodings.

Source/evidence: `patches/native-stages/runtime/native-load.mjs`.

### native-bvh-memoize-nodecount-prepass

Status: **implemented**. Subtree node counts are memoized by primitive count for both static and source BVH builders; split topology, output buffers and traversal order are unchanged.

Source/evidence: `patches/native-stages/runtime/source-convert.mjs`.

### defer-unselected-stage-descriptor-and-mural-modules

Status: **not-adopted**. Remaining proposal not adopted: stage data, murals and range prop packs are already lazily prepared. Remaining Cargo/Range/Scorch descriptors feed the complete synchronous MAP_LAYOUTS API and cached synchronous thumbnail getter used by game/tools/headless callers. Removing those exports requires a separate async API or authored thumbnail migration; do not claim the already-lazy portion resolves that contract change.

Source/evidence: `inkwave-public/src/world/maps.js`, `inkwave-public/src/main.js`, `patches/loading-cache/adapter.mjs`.

