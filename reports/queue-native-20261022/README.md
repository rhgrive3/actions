# Native queue repair batch, 2026-10-22

Base: `c0938a3f84768474df91713f7b372f9d7f8fe96a`.

This batch retains source vertex/index order, collision object ordinal identity,
source hash authentication, texture policy thresholds, and public hit-vector
ownership. It changes allocation/loop work rather than retail reference values.

- OBJ: fixed-width lazy reusable builders, token scanning, per-line authenticated
  UTF-8 byte decoding, the lazy semantics cache from PR #1780, full-capacity
  collision buffers, exact-sized typed BVH nodes and shared node-bound scratch.
- Native level: one initial spatial hash, Uint32 query stamp rollover, lazy
  per-mode band arrays, pooled ground query outputs, exact stable native atlas
  packing, and static face-restricted splat candidate lookup.
- Physics: source-hit-bounded dynamic rays, empty dynamic actor/projectile paths
  with unchanged contact resets, monotone nearest-hit OBB slab rejection,
  point-contact specialization, sphere invariant hoisting and final-only public
  hit allocation.
- Rendering/load: drop construction-only tile indices, scalar tile keys,
  constant ink color/light UV via Three default attributes, exact object
  bounding spheres from authenticated source bounds, minimap query scratch and
  initial image/canvas reuse, worker-side inactive display compaction with
  source workload thresholds retained for texture caps, active-slot cache
  access coalescing, sibling failure stops fresh texture decode jobs.
- Ownership: release offscreen sky-only materials and cloud triangle geometry.

Validation performed:

- `node --test .../source-queue-conversion.test.mjs`: 4 passed. Frozen parser
  output parity covers strings/UTF-8/BOM/CRLF, multi-object polygons, malformed
  indices/attributes/numbers; exact BVH node/order buffers include random,
  equal-center and degenerate sizes through 9,000 triangles.
- `node --experimental-vm-modules --test .../source-sweep-queue-parity.test.mjs`:
  2 passed, including 10,000 frozen point contacts and 1,500 sphere sweeps.
- `.../native-queue-behaviour.test.mjs`: 4 passed; 120 atlas fixtures, stamp
  rollover, 180 actual CPU splats against the broadphase control, 80 exact
  Three sphere/shadow threshold fixtures.
- `.../source-worker-compaction.test.mjs`: 2 passed, preserving collision IDs,
  active vertex/index bytes, exact buffer capacity and original texture caps.
- Existing semantics/collision: 8 passed. Existing texture cancellation: 15
  passed, including bounded worker failure and once-only bitmap cleanup.
- Selected existing geometry/sweep/ink tests: 35 passed, 10 authentic-asset
  skips. Existing ground/contact tests pass at 30/60/120 Hz.
- One broad native-suite run: 379 passed, 128 skipped, 2 failed (509 tests).
  The Tidewater initial-spawn fixture still fails when both changed legacy
  Level/query logic and OBB slab predicate are restored to the base control;
  its `squidSpawn` remains in phase `aim`. Python/worker paint mask comparison
  cannot import `numba` in the available Python environment. Neither is silently
  reclassified as passed. This broad run preceded the final additional focused
  tests and is not exact-commit full acceptance.
- `node scripts/check-inkwave-patches.mjs --quick`: passed.

No physical iPad/Safari, authentic native five-stage asset suite, GPU screenshots,
full browser native-play acceptance or real FPS/RSS/GC improvement is claimed.
Constant native ink attributes remove exactly 20 bytes per vertex of typed-array
payload; this is an allocation formula, not a measured frame-rate improvement.

## Follow-up: exact OBJ destination buffers and individual leaf rejection

The parser now counts its identical accepted line grammar first and writes each
object into exact final interleaved/index slices. It no longer retains a complete
`geometry[]`/`indexChunks[]` representation during final merge. Frozen parser,
classification, collision and BVH tests: 12 passed. One controlled synthetic
3,206,678-byte / 30,000-object run produced 3,240,000 final buffer bytes in both
versions; original parser 1335.7 ms, candidate 316.2 ms. This single desktop Node
run is not a device benchmark or a statistical performance guarantee. The known
simultaneous duplicate chunk payload for that fixture changes from 3,240,000
bytes to zero; raw per-object attribute scratch still exists.

Individual scalar triangle bounds now reject provably disjoint candidates just
before exact sphere/body/contact narrowphase. Public `queryBox` enumeration is
unchanged. Contact bounds use the current, already-corrected capsule at each
candidate; fit bounds accommodate negative margins and non-finite bounds fall
back. Frozen sweep/contact/native geometry regressions: 27 passed, 8 authentic
asset skips. The isolated twelve-triangle leaf fixture retains the exact hit
while exact sphere tests change from 12 to 1; this is a synthetic operation count,
not a stage-wide improvement ratio. The quick patch check passes again.

The available `$CODEX_PRIMARY_RUNTIME_PYTHON` also cannot import `numba`.

## Follow-up: viewer-team minimap support rotation

Only the canonical Minimap world-coordinate projection enables this cache.
A pure team flip rotates existing height/block/cell samples in place and reverses
stored normal signs. A one-byte-per-pixel hit mask distinguishes untouched miss
zeros from signed zero normals, including odd-sized maps. Ink/flash canvas state,
image bytes, owner state and base drawing are refreshed by the same build path.

The cache compares exact dimension/bounds/scale values and source world/data/
array/face/paint-mask ownership references. It recomputes actual navigation
reachability and compares node coordinates, reachable flags and cell membership
values with `Object.is`, without a weak hash or duplicate terrain raster. Source
triangles/masks are read-only for a NativeLevel lifetime; diagnostics deliberately
changing them in place must call `level.invalidateMinimapSupport()` (ordinary
world replacement already has a new identity). Unknown/custom projections and
changed dependencies retain the full ray build.

`native-minimap-flip-cache.test.mjs` and existing Undertow tests: 10 passed,
1 authentic-stage skip. Fresh-rebuild controls include slopes, holes, zero
normals, odd/even/1x1 maps, repeated flips, navigation coordinate/reachability
changes, scale changes, mask replacement, explicit source dirty revision and
custom projection fallback. All support arrays match exactly; flip-only tests
issue zero BVH queries while retaining presentation resets. Quick patch check
passes. Real stage GPU pixels and physical device timings remain unmeasured.

## Follow-up: pinned local source metadata inventories

Fetched the public recursive Git tree metadata for all 23 catalog-pinned stage
trees, without downloading models, images or audio. The update tool reconstructs
every root and nested Git tree object with Node crypto; runtime validation uses
WebCrypto SHA1 and byte-pinned SHA256 JSON. Git `hash-object -t tree` independently
checks fixtures covering nested/empty trees, UTF8 names, symlinks, executable
modes, submodules and file/directory prefix ordering. Root SHA alone is not used
as an unauthenticated echo: descendant listings must reproduce their tree IDs.

All 8,331 entries have the exact original API path, mode, type, blob size and SHA.
The compact JSONs total 775,671 bytes versus 2,018,979 bytes for the fetched API
JSON representations (61.6% fewer uncompressed bytes in this snapshot). This is
an exact byte count, not measured network compression or loading latency. A known
stage now fetches only its same-origin inventory and makes zero GitHub metadata
requests. Unknown future tree pins retain the prior API/cache path. Missing or
corrupt known inventories fail closed instead of silently bypassing integrity.
Body pins also authenticate sizes, which Git tree SHA alone does not bind.

The 23 stage files stay separate from the worker bundle and initial PWA precache.
Production build checks verify byte-identical packaging and source/build identity
receipts for every inventory; the worker contains just its small digest index and
validator. Original asset size/SHA verification, discovery and conversion remain
unchanged. `source-inventory`, prior source-cache/device-budget, worker-compaction
and texture-cancellation suites: 72 passed. Native source-input identity tests:
3 passed. Quick patch checks and the production build passed. Device timings,
physical iPad behavior and all source asset offline availability are unmeasured.

After the environment installed `numba`, the Python/worker partial-polygon mask
oracle was rerun: all 3 source paint coverage tests pass. The earlier missing
module result above records the original environment rather than a code failure.

## Follow-up: legacy foot probe batched hash columns

Canonical legacy Physics borrows each vertical ray's original single-cell bucket
through one Level batch call. A footprint inside one cell shares that bucket;
cell seams retain the original per-ray candidate order exactly. There is no
larger union candidate list or narrowed collision set. Each probe recomputes the
columns and releases references after use, so moving support/hash rebuilds cannot
use stale lists. Custom raycast/query overrides, subclasses and native Physics
retain their existing route. Non-finite positions/reach retain the prior route.

20,000 deterministic probes compare every GroundHit field against the original
nine-query algorithm, covering hash seams, sloped randomized OBBs, grates, ledges,
negative foot radius, equal-height ties and a moving floor/hash rebuild. The
operation count is 180,000 original queryBlocks calls versus 20,000 batch lookups
and zero per-ray query/candidate-copy calls. Narrowphase retains exact candidate
order/count. Collision/capsule suites: 8 passed; quick patch check passed. Physical
device CPU/FPS and full actor landing replay measurements are not claimed.

## Follow-up: bounded read-only ImageData and measured resize rejection

The same full-dimension Canvas and identical `drawImage(bitmap,0,0)` still perform
the original color/alpha conversion. Read-only alpha/channel/normal statistics
read at most 64 rows per ImageData, in the original row/pixel accumulation order.
Albedo alpha can stop on its first proven threshold hit. Reconstructed normal
textures still lazily obtain the full owned destination buffer. Canvas backing
allocation is unchanged; this bounds JS readback dimensions, not OS/GPU residency.

74 texture/index/cancellation/cleanup tests pass. The 42 additional controls cover
1x1 and 63/64/65/129/257 rows, exact threshold cases, shared roles, RGB and signed/
unorm reconstructed normals; full normal pixels match frozen controls. SHA digest
completion is deterministic in the synthetic index test to exclude unrelated
WebCrypto worker completion races from the multiply-shared role fixture.

Actual Chromium 153 executes both the frozen and current loaders on 18 generated
PNG fixtures up to 1024² with transparency, odd sizes, RG and RGB channels. Every
material field, final bitmap pixel hash and normal DataTexture byte hash matches.
The receipt is `texture-pixels-chromium.json`; the reproducible tool takes
`CHROMIUM_PATH`, `FONTCONFIG_PATH` and optional `PLAYWRIGHT_MODULE`. Quick patch
checks pass. No WebKit or physical device measurements are claimed.

The same browser experiment tested direct Blob decode+resize against the current
two-step ImageBitmap route. It disproves byte equivalence for the transparent
413x257→128 fixture: one channel differs by one byte (both hashes in the receipt).
1024²→128 and 4096x512→256 fixtures match. Therefore the two-stage resize queue
remains blocked by a concrete output difference, and the existing route remains.
