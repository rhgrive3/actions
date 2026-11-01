# #1975 native transfer / cancellation regression acceptance

Fixed reviewed head: `3df9007587e1b8e9609b701921ac85abd35eff71`; base `df8a4b8f8c29bf68a3480e8be14624c82f6d5190`.

No concrete runtime defect was found in this scoped pass. Existing implementations are retained, not duplicated. Two tests extend `source-cache-write.test.mjs`; four resource-owner tests are added in `native-work-ownership.test.mjs`.

## Added acceptance

- Actual worker handler, actual converter and actual derived-cache writer/read path are connected with synthetic authenticated ingress and the existing DB-opening mock. Actual structured-clone transfers all 11 geometry/packed-chart buffers; sender columns and shared face views detach, while receiver view aliases and contents remain intact.
- A cold staged write survives transfer before commit. Mutating a received renderer-owned packed buffer or vertex buffer cannot mutate the durable cache; the next worker hits the cache without downloading or converting. Optional commit failure leaves the published stage usable, then a retry reconverts and a later load hits the recovered cache.
- Actual asynchronous `nativeDisplay.create` is cancelled by signal, generation replacement and yield-task failure after resource allocation. Geometry and material are each disposed once; unpublished textures remain with their caller. A clean retry succeeds and transfers ownership, with exactly one eventual texture close/dispose. An already-cancelled call allocates nothing.

## Results and limits

The seven pinned existing lifecycle/converter files passed **86/86** before additions. The same set plus the six new tests passes **92/92**, zero failures/skips. The scopes overlap and must not be added together.

Negative controls are scratch-only: dropping the packed buffer from the worker transfer list fails both new transfer tests; abandoning the suspended generator without `return()` fails all three allocated-resource cancellation cases. Neither mutation is in this change.

These are source-owner/Node VM fixtures with real structured-clone and controlled DB/ingress boundaries. They do not qualify real browser Worker/IndexedDB scheduling, emitted output, GPU rendering, hardware/FPS performance, all #1975 changes, or Nintendo retail parity. No Character/hair/model changes, images, gameplay/scoring edits or workflow changes are included.

Run with:

```sh
node --experimental-vm-modules --test patches/native-stages/tests/source-cache-write.test.mjs patches/native-stages/tests/native-work-ownership.test.mjs
```

The 86-test baseline selects the first seven files below, with the original
`source-cache-write.test.mjs`. The 92-test result selects those seven after the
two additions, plus `native-work-ownership.test.mjs`. It is not a whole-directory
wildcard run:

```sh
node --experimental-vm-modules --test \
  patches/native-stages/tests/source-cache-write.test.mjs \
  patches/native-stages/tests/source-worker-overlap.test.mjs \
  patches/native-stages/tests/source-slot-singleflight-20261030.test.mjs \
  patches/native-stages/tests/native-source-data-lifecycle.test.mjs \
  patches/native-stages/tests/source-retention.test.mjs \
  patches/native-stages/tests/source-tree-cache.test.mjs \
  patches/native-stages/tests/queue-native-converter-20261026.test.mjs \
  patches/native-stages/tests/native-work-ownership.test.mjs
```
