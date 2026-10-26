# Shooter/Dualies guide reuse

Base: `90bb98c2ffbbe0fdaf959001808d6dd43e085f90`. Required collision-producer dependency: `fee0c005ffe129e8248c2122c41f5fad6612130d`, fast-forwarded locally without resetting the worker's existing edits. Consumer commit: `2eeed372d` (full SHA in `verification.json`). Source ownership is limited to `runtime/weapons-fidelity.mjs` and the existing `runtime/dualies-guide-cache.mjs`; producer files are unchanged by this consumer commit.

The introduced Shooter floor clipping replayed eight exact sphere sweeps on every unchanged horizontal `computeAim` call. On the exact base, the worker's negative counter regression measured **960 extra sweeps for 120 identical horizontal calls**, then failed as expected. The independent review also reported 120 downward sweeps; this worker's original pre-fix test stopped on its first horizontal assertion, so that downward baseline is not represented as a second worker measurement.

## Final behavior and boundaries

The native launch path still runs before reuse, including real muzzle observation, its safety LOS/fallback, convergence and source spawn-velocity addition. The cache compares the resulting deterministic position/velocity/profile plus owner, weapon/mode, aim, camera and collision-query identities. It caches only the numeric world guide point; the controller receives its own copied record and projection still uses the current camera. No pose quantization, TTL or smoothing is used. Moving or animated muzzles invalidate exactly.

Reuse requires a valid unchanged `Number.isSafeInteger(level.collisionRevision) && level.collisionRevision >= 0`, published by the actual Level/NativeLevel/Tower writers in the dependency. World/Physics/query methods and `triangleWorld` identities remain keys. Query-dedup `_stamp`/`blockStamp` and unused `collisionGeneration`/`geometryGeneration` fields are not treated as revisions. Unknown or exhausted/unversioned worlds recompute. Per the producer contract, arbitrary external raw collider/triangle edits must notify `markCollisionChanged()` or rebuild the collision index; the cache does not invent certification for them.

Dualies' existing reuse now consumes the same actual revision and world/query/source-triangle identities, plus velocity/profile inputs. The previous generation-only test fixture is replaced with the canonical production-composed Level. The floor edit fixture updates coherent collider bounds, calls the real notification method, retains the existing displacement assertion, and additionally checks both hand guides lie on the new physical floor.

Cache storage is a single reusable point and input array per Projectiles instance, with no per-call cache array/point allocation or collider-table traversal. Native `clear()` releases its owner/world key references while retaining reusable storage. This bounds the added admission work; it is not a whole-frame allocation or device-FPS claim.

## Measurements and regression evidence

Real, fully composed Actor/Character/Level/Physics and installed InkFlight execute the CPU tests. The VM cannot load optional dynamic source motion, so Character fallback is explicit. No renderer or Nintendo-device comparison is implied.

| Pitch | Simulated interval | First guide sweeps | Extra sweeps over 120 identical calls, source and emitted |
| --- | --- | --- | --- |
| 0 | 30 / 60 / 120Hz | 8 each | 0 each |
| -.8 | 30 / 60 / 120Hz | 1 each | 0 each |

The focused regressions also verify immediate replay on muzzle, velocity, aim, owner, weapon/mode, camera and query-owner changes; unchanged target selection still runs every camera-aim call. Real Level append/hash rebuild and a notified solid-disable change the physical guide. Actual Tower movement/removal invalidates a stationary guide, while a no-op Tower update does not. A real NativeLevel `triangleWorld` replacement changes the guide to its new triangle height without relying on a block-array or revision change. Unsupported custom worlds remain uncached and expose same-array floor movement immediately. Clear releases references, reuses storage and restores the same guide. Existing downward actual-head contact, both Dualies hands, nominal frame laws and spawn-velocity behavior remain covered.

Commands and results:

- `node --experimental-vm-modules --test patches/splatoon3/tests/shooter-shot-guide-cache.test.mjs patches/splatoon3/tests/issue-970-guide-cache.test.mjs patches/splatoon3/tests/shooter-dualies-projection.test.mjs`: expanded source run 12/13; the single old fixture failure used an unproduced geometry-generation field. Its correction is described above and its full intermediate log is retained, not hidden.
- `node --experimental-vm-modules --test patches/splatoon3/tests/shooter-dualies-projection.test.mjs patches/splatoon3/tests/shot-guide-frame.test.mjs patches/splatoon3/tests/prediction-cache-lifetime.test.mjs`: **32/32** after the fixture correction. Together with the unchanged nine passing cache cases in the expanded run, **41 distinct final source cases pass**.
- With `INKWAVE_BUILT_SITE=/tmp/inkwave-shooter-guide-cache-20261026`, the first three-file command executes the actual final optimized build: **13/13**.
- `node scripts/build-inkwave.mjs inkwave-public /tmp/inkwave-shooter-guide-cache-20261026`: passed, normal esbuild-minified production composition.
- `node scripts/check-inkwave-patches.mjs --quick`: passed. `node scripts/check-inkwave-startup-budget.mjs /tmp/inkwave-shooter-guide-cache-20261026`: passed, including complete artifact digest readback and unchanged request budgets.

`verification.json` records exact source hashes, final build identity, four source-input/four emitted-artifact readbacks and the unchanged raw upstream input count. Gzipped logs preserve the negative, intermediate fixture failure, corrected source compatibility, emitted, build, startup and quick checks. No required remote CI was launched by this worker.

## Original-game boundary

This change removes repeated CPU work while preserving the measured world points. It adds no inner-marker admission rule and changes no projectile physics, nominal guide semantics, floor/wall contact ownership, dodge/turret authority, hit feedback, audio or input. Original Splatoon 3 inner-marker/parallax/late-floor behavior remains unverified. Prior software Chromium's natural firing limitation is not relabelled as a successful flight capture. No new browser/GPU/retail acceptance or Nintendo media is included here.
