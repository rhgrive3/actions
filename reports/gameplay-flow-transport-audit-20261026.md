# Gameplay measurement flow-result transport

The first normal-RAF baseline's large menu transition peaks are confounded by a harness return-value boundary. They must not be reported as established runtime memory leaks or mobile GPU residency. The old harness used `page.evaluate(() => __inkwave.quitToMenu())`, which returns the resolved operation result through Playwright even when the caller ignores it.

Source evidence at baseline `e0072a749df0ec8c2d368e383bdf337baa7b44ad`:

- `patches/reliability/start-adapter.mjs:104` inserts `return this.match` into successful `quitToMenu`. This return is part of the application's recovery flow contract and must remain unchanged.
- `scripts/inkwave-source-composition.mjs` applies that adapter through the reliability stage. The composed `quitToMenu` calls `_startAttract({ staticMenu: true })`, shows the main menu, and returns its Match.
- `inkwave-public/src/game/match.js:14` stores `opts`, including the shared rig and input supplied by `_startAttract` in `inkwave-public/src/main.js:594`.
- `patches/local-quality/adapter.mjs:536` creates the rig's enumerable `_inkwaveCameraProbeCache` containing the target actor, level and physics. Mode changes invalidate that cache in a subsequent camera update (`adapter.mjs:504`), while the composed static menu frame branch intentionally skips world camera updates. This supplies a concrete route from a returned Match to large object/geometry graphs. A bounded browser graph inventory can establish the exact graph present at each transition without returning it.
- The installed Playwright browser serializer (`node_modules/playwright-core/lib/coreBundle.js`, `typedArrayToBase64` and `innerSerialize`) recursively visits enumerable object properties. Its typed-array fallback uses `Array.from(Uint8Array).map(String.fromCharCode).join('')` followed by base64, creating large intermediate JS arrays/strings. Typed-array conversion occurs before its ordinary visited-object check. This behavior is additional measurement work, absent from normal UI clicks.

The corrected harness awaits the operation inside an async callback and returns undefined. It does the same for `startMatch`, defensively preventing flow-result transport there. This changes no application method, rendering cadence or GC schedule. It is distinct from the earlier manual-frame fence checker issue.

`scripts/tests/inkwave-gameplay-flow-transport.test.mjs` extracts the actual two `page.evaluate` expressions, runs them against an asynchronously completed cyclic Match whose enumeration throws, and verifies that completion is awaited, start options are preserved and the boundary receives undefined without reading the Match graph. Both tests pass with the corrected harness. A negative control restoring the two original expression callbacks fails both tests with `Match graph must stay in the page`.

```sh
node --test scripts/tests/inkwave-gameplay-flow-transport.test.mjs
```

No browser or GPU work was run for this read-only audit and regression. A fresh baseline/candidate pair using the same corrected harness is needed before attributing transition peaks to runtime behavior. The earlier 3 GiB renderer peak remains an observed process sample from a confounded run, not a proven mobile application peak or proven saved memory amount.
