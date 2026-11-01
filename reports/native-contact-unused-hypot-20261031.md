# Native contact: omit an unused horizontal norm

Refs #1671; no automatic closure. Base: main `df8a4b8f8c29bf68a3480e8be14624c82f6d5190`.

`NativePhysics._nativeContacts` computed `Math.hypot(dir.x,dir.z)` for every accepted contact even when `horizontal` was falsy. Its result is used only under the existing `horizontal && ...` branch. One runtime line now computes it only for truthy `horizontal`; source triangles, distance/normal calculation, candidate order, correction order, iterations, block mapping and dynamic owners are unchanged. Truthiness is retained rather than narrowing the API to `horizontal === true`.

Local source-owner regression:

```sh
node --experimental-vm-modules --test patches/native-stages/tests/native-contact-unused-hypot.test.mjs
```

All four tests pass. The frozen df8 preimage and actual `Physics` / `NativePhysics` / `TriangleWorld` run on synthetic ground, walls, ceilings, slopes, grates and degenerate triangles, including dynamic/custom owners. Across the seeded 968-case set, exact position, contacts, scratch and callback order match. Counted `Math.hypot` calls change from 1821 to 411; all 244 truthy non-capsule cases retain their count. Separate tests reject always-zero/strict-boolean mutations, preserve throwing callback identity/partial state, and retain signed-zero/nonfinite/extreme-input output semantics.

The earlier independent local review compared 1238 cases (including the 968-case set), plus four throwing callback cases, and accepted the exact runtime candidate SHA-256 `31e2caa68252ee2f170d71ae1c67f9b3aa84c9e15ae9272bf006ae8bff164a21`. These overlapping scopes are not added together. Large local raw artifacts are intentionally not part of this branch.

This establishes source-fixture equivalence and fewer unused operations, **not measured CPU-time/FPS improvement**, emitted-build/browser/hardware acceptance or complete #1671 resolution. No Character/hair, scoring, roof, gameplay coefficients or workflow changes are included. The separate paint-goal memo experiment was rejected and is not included.

The branch is based directly on df8, not another pending PR. Publication preflight checked all 85 df8 workflow definitions: none accepts this branch/path push, and none has a `create` or `workflow_run` trigger. No skip-CI marker, PR creation, workflow dispatch, main update, merge or deploy is requested here.
