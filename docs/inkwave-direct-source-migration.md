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
node --experimental-vm-modules --test patches/local-quality/tests/nav-heuristic.test.mjs
node --experimental-vm-modules --test patches/local-quality/tests/bot-navigation.test.mjs
node scripts/check-inkwave-patches.mjs --quick
node --experimental-vm-modules scripts/check-inkwave-patches.mjs
node scripts/build-inkwave.mjs inkwave-public _site
```
The full production composition and browser checks must pass before a merge. Passing Node tests alone is not equivalent to an in-browser frame-time measurement. Record actual test results rather than assuming success.

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
