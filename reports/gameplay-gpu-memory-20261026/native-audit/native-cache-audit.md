# Native stage CPU/cache lifetime audit

Source examined: `e4bb8f934db08c14abedd41845f0799c33d936e7`. Read-only; no browser, heavy test or download was run.

No module-level Map retaining completed stage payloads by stage ID was found. Prebuilt loading builds fresh arrays for each entry; the current NativeLevel/nativeWorld own the active data, with an old/current world and detached candidate overlapping during loading. This source policy alone does not prove collection if another owner still references an old world.

## Meaning of `nativeSource.cached`

`prebuilt-load.mjs:55` always sets `cached:false`. A true flag comes only from fallback `source-worker.mjs:33` reading a derived IndexedDB entry. It does not indicate RAM caching or ordinary HTTP-cache reuse. Touch/constrained fallback explicitly skips derived reads and writes (`source-worker.mjs:24-33,60-63`). Scorch's existing completed windows all have `prebuilt:true,cached:false`.

## Scorch known CPU buffers

The expanded local Scorch metadata is 174,831 bytes, SHA-256 `1aaf93de6dd84bb9e2c47b8b5d16159691945e37d82b2f135b73afa6e655da06`, matching the prebuilt build entry. This is an integrity pin, not a digital signature.

| Declared typed-array category | Bytes | Lifetime |
| --- | ---: | --- |
| All 14 fetched array buffers |34, 136,418|Loading input total|
| Display vertices and indices |13,563,204|`data` pointers nulled on publication; display CPU views nulled on GPU upload|
| Four face-unpack columns |9,495,604|Deleted after unpacking 45,171 JS face objects|
| Remaining eight collision/BVH/mask arrays |11,077,610|Owned by active native data|

JS face arrays/objects, NativeLevel blocks/vectors, navigation, paint buffers and decoded/transcoded texture storage are additional; 11.077 MB is not total native CPU memory. See `prebuilt-load.mjs:26-57`, `native-world.mjs:159-162`, `native-render.mjs:63,86-89`, `prebuilt-format.mjs:9-19`, and `native-level.mjs:17-50`.

Only Scorch metadata is expanded locally. The other 22 stage metadata files are LFS pointers. Their decoded/physics byte sizes cannot be inventoried from local metadata, and no additional files were fetched. The catalogue has 23 logical native stage IDs.

## Texture and decoder ownership

`native-load.mjs:7-24` stores provenance in a texture-keyed WeakMap. Per-load job/alias/pack Maps are local. Pack buffers are removed after their final slice and `release()` (`61-73,238`). PNG bitmaps close on upload; reconstructed-normal DataTexture CPU pixels become null (`226-235`). CompressedTexture mip CPU arrays remain owned by the texture until collection; there is no equivalent post-upload CPU mip release in this path.

`native-render.mjs:120-126` disposes replaced textures, closes images and clears the live texture map. `native-world.mjs:135-141` cancels quality work and disposes its display; quality operations also remove listeners and dispose uncommitted texture results (`native-quality.mjs:55-82`). These are ownership cleanup paths, not a measured guarantee that no other object holds an old texture/world.

A single KTX2 loader is kept for the renderer (`native-load.mjs:47-59`). Its task cache is a WeakMap, and its WorkerPool defaults to a maximum of 4; native capped texture jobs have 2 concurrent decode pipelines. Transcoder/worker resources can retain high-water memory until renderer replacement/disposal. This is not a per-stage payload cache, and actual worker residency was not measured.

## Disk cache limits

- Raw fallback source CacheStorage: ordinary fallback keeps active plus one cold stage (`source-cache.mjs:35-55`). Managed retention permits extra smaller stages within a budget bounded by the two largest observed source-body sizes, also reserving one largest stage of quota headroom (`source-retention.mjs:35-42`). Accounting stores small metadata. A single active-slot Cache wrapper is reused for 5 seconds. Prebuilt loading instead uses normal HTTP caching, whose disk quota belongs to the browser.
- Derived IndexedDB: at most 2 entries, keyed by recipe/runtime/source identity. Eviction follows most-recent writes; reads do not update timestamps (`source-cache.mjs:146-158`). Touch/constrained conversion bypasses this cache. The conversion worker terminates on completion or abort (`source-data.mjs:12-17`).

## Existing measurement boundary

Completed baseline native sequence: Scorch → Tidewater → Scorch, high quality, mobile 1133×744 viewport at DPR 2, native RAF. Native GPU texture count fell 261→32 on exit and returned 261 on reentry; all Scorch cached flags were false. Post-GC JS heap was 129.5 MB, 136.9 MB, 212.4 MB at the three released windows and 209.3 MB at final. These broader-game heap figures do not identify retained stage arrays or establish their collection. No many-distinct-native-stage memory census was performed. Candidate final validation is separate root evidence.

`native-cache-audit.json` records source hashes, exact metadata categories, the 22 unavailable IDs and selected existing measurement rows. No cache-policy fix is proposed from this finite catalogue/source inspection alone.
