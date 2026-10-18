# INKWAVE / ZEVANT: direct-source migration

Status: **in progress on** `refactor/inkwave-direct-source-migration`. The game still uses build-time adapters for features not migrated here. This branch is not the production release.

## Decision

Use `inkwave-public/src/` as the readable, authoritative implementation for migrated gameplay features, and keep normal ES modules for shared runtime helpers. Retire one-off source string replacement adapters feature by feature. Preserve the exact emitted code and tested behavior before removing an adapter. Git diffs and deliberate compatibility layers remain valid tools; this effort targets production build-time code rewriting.

* Baseline main SHA: `6d3b8b5089bdb34d9cbf2f63ed54240a2cbb641c`.
* Build owner: `scripts/build-inkwave.mjs`, via `adaptBuildSource`.
* Current compatibility gate: `patches/splatoon3/upstream-lock.json`; keep it strict for unmigrated pinned upstream files.
* The mirrored `FETCH_MANIFEST.json` reports historical downloaded bytes and is **not** the source of truth for edited files.
* Do not republish a newly fetched public website over committed source files. Upstream updates must be separately reviewed and merged.
* Do not modify gameplay constants or claim additional 11.3.0 parity as part of a mechanical source migration.

## Completed slice: navigation source ownership

Source: `inkwave-public/src/game/nav.js`, class `NavGraph`.

The complete `NavGraph` source used in production is now tracked directly in `inkwave-public/src/game/nav.js`. Its output is no longer rewritten by the gameplay, quality, or native-stage adapter layers. Five substitutions formerly made by `patches/local-quality/nav-heuristic-adapter.mjs` are now part of the tracked source:
1. Maintain the per-graph Float64 heuristic buffer alongside `_g`.
2. Alias the buffer in each route calculation.
3. Store the start-node heuristic once.
4. Store the heuristic on the first visit to each node.
5. Reuse cached values in queue priorities without changing cost, tie or edge-filter semantics.

In addition, the prior S3 source rewrites for reusable A* heap storage and spawn-zone admission, and the native-stage source rewrites for `buildNativeNav()` and `acceptEdge`, are directly incorporated into `NavGraph`. All three NavGraph-specific source adapter blocks and the obsolete heuristic adapter file, quality identity entry and build-only exclusion are removed.

The navigation regression tests require `adaptBuildSource('src/game/nav.js', source)` to equal the tracked file byte-for-byte, preventing reintroduction of hidden build-time rewriting. No `src/game/nav.js` SHA is pinned in `upstream-lock.json`; other pinned files are unchanged. The source fixture and route-parity tests remain in `patches/local-quality/tests/nav-heuristic.test.mjs`.

Validation targets:
```sh
node --test scripts/tests/inkwave-direct-source-ownership.test.mjs
node --experimental-vm-modules --test patches/local-quality/tests/nav-heuristic.test.mjs
node --test patches/local-quality/tests/prop-atlas.test.mjs patches/local-quality/tests/prop-retention.test.mjs
node --experimental-vm-modules --test patches/local-quality/tests/bot-navigation.test.mjs
node scripts/check-inkwave-patches.mjs --quick
node --experimental-vm-modules scripts/check-inkwave-patches.mjs
node scripts/build-inkwave.mjs inkwave-public _site
```
The full production composition and browser checks must pass before a merge. Passing Node tests alone is not equivalent to an in-browser frame-time measurement. Record actual test results rather than assuming success.

## Completed slice: stage mural atlas and world title

The five `src/world/murals.js` transformations previously applied by `patches/local-quality/mural-atlas-adapter.mjs`, and the three final `INKWAVE` to `ZEVANT` text replacements in `scripts/inkwave-source-composition.mjs`, have moved to `inkwave-public/src/world/murals.js` itself. The adapter is retained **only** for its still-required `src/main.js` selected-stage hook. The final `applyZevantDisplayName` map no longer rewrites murals. Direct source and the old composed murals were independently compared and matched exactly before this cleanup.

`inkwave-direct-source-ownership.test.mjs` requires the composed mural output to equal the directly tracked source. No visual layout, painted geometry, text or memory policy is intentionally changed.

## Completed slice: 3D world lettering, lobby text and logo default

The final build-time ZEVANT string-replacement map has been retired for `src/world/props.js`, `src/world/props-marina-vessels.js`, `src/game/lobbySet-tex.js` and `src/ui/ui-icons.js`. Their displayed names now live in the actual source modules; `src/ui/ui-icons.js` still receives unrelated weapon/icon adapters, so it is not claimed to be fully source-owned yet. `src/world/props.js` initially retained independent atlas and retention adapters, but those have **now been migrated into the directly authored `PropKit` implementation** (see the dedicated slice below). It is required to pass direct-source composition identity alongside `props-marina-vessels.js` and `lobbySet-tex.js`. `ui-icons.js` still has unrelated adapters.

The runtime UI string translation key has also moved to `patches/splatoon3/runtime/ui-strings.mjs` directly. Only **four** final display-name substitutions remain, all for locked/unmigrated upstream files: `index.html`, `src/config.js`, `src/ui/menus.js`, and `src/i18n.js`. Do not silently invalidate SHA-256 upstream locks during their migration.

## Completed slice: level classification and home Super Jump stage data

The original Splatoon3 source adapter blocks for `src/world/level.js`, `src/world/maps.js` and `src/world/stages/cargo/layout.js` have been removed. The readable game sources now own `squidReturner` classification and all four stage-specific home Super Jump destinations. The current direct sources were independently reconstructed from the base snapshot with the exact removed replacements, with **byte-for-byte equal outputs for all three files**.

These changes only migrate previously established behavior. Other adapters can still modify these modules for unrelated features; do not treat `level.js` or `maps.js` as globally adapter-free until they pass full identity composition.

## Completed slice: PropKit static memory and mobile atlas

Previously `patches/local-quality/prop-retention-adapter.mjs` rewrote the native `PropKit` constructor, placement builder, merge, clear and same-instance rebuild logic. `prop-atlas-adapter.mjs` resized the textures and **wrapped prototype methods at module evaluation time**. Those runtime ownership paths now live as directly readable methods in `inkwave-public/src/world/props.js`.

- The existing `_placements` / `_released` bookkeeping and deterministic same-instance replay live next to `PropKit.add/build/clear`.
- Atlas scale and GPU allocation release live in `propAtlasDimension`, `syncPropAtlas`, `_makeMaterials`, `build`, `update` and `dispose`. The prior prototype overrides have been replaced by regular method calls and a `finally` cleanup, preserving the existing lifecycle order.
- Both legacy adapters have been deleted and removed from quality composition, quality identity and build-only exclusions.
- The exact `PropKit` source immediately before migration, including the already-migrated ZEVANT text, is retained in `patches/local-quality/tests/fixtures/props-before-direct-migration.js.txt` **only as a negative-control fixture**. The test loader maps that fixture to the original `src/world/props.js` URL so its relative imports remain valid.
- Existing `prop-atlas.test.mjs` and `prop-retention.test.mjs` continue comparing the real directly authored `PropKit` against the pre-migration behavior for geometry, memory, redraw, GPU disposal, quality changes and repeated rebuilds.
- The source ownership test rejects reintroduced build-time transformations and prototype monkey-patching.

Mechanical code migration does not itself prove a faster frame rate or lower peak memory. Keep geometry, UV and gameplay equivalence as release gates.

## Completed slice: canonical stage registry

`inkwave-public/src/world/maps.js` now owns Scorch Gorge registration and native-stage layout overrides using normal imports and an explicit exported registry. The two old source rewrites in `scorch-gorge-adapter.mjs` and `native-stages/adapter.mjs` have been removed. The Scorch adapter still manages the locked `src/config.js` and `src/i18n.js` entries; those remain intentionally unmigrated. Native layout override order stays after the ordinary and Scorch entries.

## Completed slice: ink collision and catalogue sweep

The real `inkwave-public/src/game/inkCollision.js` owns both the native triangle-world swept-sphere bridge and the existing 3D AABB early-out for its OBB and capsule collision checks. Its source-rewrite blocks have been removed from `local-quality/adapter.mjs` and `native-stages/adapter.mjs`. A separate normal runtime module, `patches/splatoon3/runtime/weapons-collision.mjs`, now directly owns native catalogue projectile sweep dispatch.

`inkCollision.js` was independently reconstructed from the pinned migration base plus all three previously applied transformations, and its resulting source matched the historical emitted code **byte-for-byte**. Keep the existing native projectile/paint, boundary and 30/60/120Hz regressions as release gates.

## Residual adapter inventory (read-only)

Run `node scripts/inkwave-source-migration-audit.mjs --all` to enumerate how many `inkwave-public/src/**/*.js`, CSS files, `index.html` and the native catalogue collision entrypoint are still rewritten by the actual production composition. The script calls `adaptBuildSource` for each candidate and asserts that declared source-owned modules are emitted unchanged. It never edits code, runs builds or changes deployment. The displayed source-file count is **not** a count of the remaining individual patch adapters, and no benchmark improvement is inferred from it.

## CI incident: isolate native collision helpers for Node

The October 18 head (`58466a1`) failed multiple GitHub Actions checks with `ERR_MODULE_NOT_FOUND: Cannot find package 'three' imported from native-level.mjs`. The direct `weapons-collision.mjs` import had unintentionally pulled the entire native-stage `engine.mjs` re-export graph into Node during build and test setup, whereas the old build-only injection had not. Both `weapons-collision.mjs` and `inkCollision.js` now import the narrow `native-projectile-sweep.mjs` helper instead. That helper uses the caller's Vector3 constructor for two scratch buffers, rather than introducing a second Three.js import or the full engine dependency. Dedicated Node regression coverage checks both catalogue and native swept collision without installing the `three` package. Browser geometry and performance parity still require full CI verification; static import changes are not automatically assumed to preserve runtime behavior.

## Next migration batches

1. Audit and migrate simple performance and UI adapters with isolated upstream anchors. Keep each change small enough to compare composed output against the previous behavior.
2. Migrate camera and input ownership together, including gyro, FOV and muzzle/aim snapshots, with the real controller and browser regressions.
3. Migrate weapon flight, paint, physical collision and networking by authoritative simulation owner, never piecemeal across a shared event/step.
4. Migrate motion, render, audio and menu integrations; remove their build-time adapter registrations only when their source owners and tests are established.
5. Simplify the build composition after the last adapter has been retired. Remove obsolete source-locks only when no longer needed.

## Guardrails

- Preserve the old source on main and perform work on this branch; no force update of main.
- Convert implementation code, not merely rename `patches/` paths; retain reusable runtime modules as conventional imports.
- Require source syntax, existing native graph parity, boot/build, and browser behavior, including 30/60/120 Hz cases where applicable.
- Stop at the faulty migration slice and fix it rather than masking failures with optional fallbacks or weakening compatibility validation.
- The fetch workflow stages external data under `RUNNER_TEMP`, emits a read-only compatibility report, and uploads a candidate archive. It never removes or commits over `inkwave-public/` automatically.
