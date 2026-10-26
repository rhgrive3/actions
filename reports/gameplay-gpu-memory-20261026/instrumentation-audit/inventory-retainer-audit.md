# Inventory observer retention audit

The original inventory observer retained historical Actors through its geometry disposal callback. This was distinct from the Crab ball mesh leak. The factory-only diagnostic allowed the historical Actor to be collected; a separate InkFlight pool and ScreenFX pointer still retained the latest Actor.

## Conditions and controls

Both full-game controls used candidate build source `3513ea0d5bb569c9882fe940d8412bacaf96362b`, content hash `e2253c3794f81ee9ac198107bdeb5f07a58223f0b98afe61ab4d0e0d3a6a62c2`, two cycles, five seconds of sampled combat, low quality, a 480×300 mobile viewport, seed 20261026 and native RAF. They did not freeze or manually step gameplay. Polling was disabled after final idle; three GC captures followed later tasks (250 ms, 250 ms, 1000 ms). The factory control also performed a numeric pool census and a fourth later-task GC.

| Control | Historical cycle 0 Actor | Latest cycle 1 Actor | Crab meshes |
| --- | --- | --- | --- |
| Original inventory callback | Retained through all stopped-poll GCs | Retained | Collected; one geometry/material disposal each |
| Factory-created callback | Collected by released1, before weak polling stopped; remains collected through GC 4 | Retained | Collected; one geometry/material disposal each |

A separate Chromium blank-page control collected a WeakRef-only object on the first forced GC while polling it every RAF. Thus RAF polling by itself is not an adequate explanation for all historical Actor retention in this environment.

## Heap evidence

The snapshot was taken after polling stopped and later-task GCs. No strong CDP Actor handle existed during collection/snapshot. Only afterward were the two WeakRef targets resolved to heap IDs and their temporary object group released.

Historical Actor heap ID 1082957 had this path when weak edges and WeakMap table-value edges were excluded:

`Window.__inkwave.shadowCache._skippedOut[7] → Mesh.geometry → geometry._listeners.dispose[1] → callback context.previous.object → Mesh.onBeforeRender → Character.actor → Actor`

The callback location is script 550, zero-based line 8, column 80: line 9 of the original inventory observer, `geometry.addEventListener('dispose',()=>rec.disposed++)`. Its creation inside the render wrapper retains the wrapper parameter context, including `object`; that wrapper uses `native.apply(this, arguments)`. The scratch correction calls a listener factory defined outside this wrapper, so the callback receives only the numeric/WeakRef record.

Latest Actor heap ID 1336259 has the direct path `Window.__inkwave.screenfx._local → Actor`. Source normally assigns `_local=null` outside matches, while hidden menu idle gating can skip the update that would clear it.

BFS caveat: excluding all ephemeron table-value edges can also hide legitimate paths whose WeakMap keys are rooted. Do not use graph unreachability alone as proof of collection. The factory control's actual historical-Actor collection is the decisive observation.

## Numeric pool census after clear

| Pool | Records | Records with owner | Distinct owners | Retired owner records | Watched cycles |
| --- | ---: | ---: | ---: | ---: | --- |
| Generic Projectiles |16|0|0|0|None|
| InkFlight detached drops |2|2|1|2|1|
| Charger drops |0|0|0|0|None|

Only numbers and cycle IDs were returned. The temporary Sets used for counting stayed inside the page evaluation and were followed by another later-task GC. The InkFlight observation establishes stale retired-owner retention in this run; it does not establish unbounded growth. Source inspection and a production-composed one-drop fixture independently reproduced `InkFlightRuntime.clear()` preserving the pooled drop's owner. Generic projectile owner cleanup already exists in production adapters.

## Artifacts and limits

All exact paths, SHA-256 values, raw numeric control windows, census rows and caveats are in `inventory-retainer-audit.json`. Original and corrected scratch observer modules are preserved separately. The heap is 151 MiB and remains local; do not commit it. Neither raw models nor image artifacts belong in this audit package.

The original inventory six-cycle Actor flags must not be treated as application leak evidence. Root's canonical low/native-high runs without inventory are unaffected by this observer artifact. Final no-inventory Crab reruns and subsequent validation of root commit `61dbb48` are separate evidence. These short Chromium/SwiftShader controls do not establish hardware GPU residency, retail behavior or long-run boundedness.
