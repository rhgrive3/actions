# #384: one-off paused redraw must refresh an invalidated sun shadow

## Scope and references

- Target: current production-composed INKWAVE, PR #1182 local base `4c90da98` (plus unrelated #287 settings-reset commit `3099b51e`). Frozen `inkwave-public/` remains unchanged.
- [#384](https://github.com/rhgrive3/actions/issues/384) already has its original repeated offline-pause rendering fix. This is a residual in that fix's necessary-redraw path, not a duplicate of the original optimization.
- Claim: https://github.com/rhgrive3/actions/issues/384#issuecomment-6080182775
- Concrete source owners: `patches/local-quality/idle-adapter.mjs`, `idle-resources.mjs`, `world-quality.mjs`; native `src/core/shadowcache.js`; bundled Three `vendor/three/build/three.module.js` (`WebGLShadowMap.render`).
- Condition: a true offline paused match, Settings Quality change, shadows enabled. Online pause is intentionally live and remains separate.
- Splatoon 3 comparison: this browser-only renderer resource defect has no corresponding verified Nintendo shadow-update implementation. No Nintendo timing, GPU budget or render algorithm is inferred. Previously documented gameplay/reference values are unchanged.

## Failure and repair

`applyRuntimeWorldQuality` disposes the old sun target and sets the light's `shadow.needsUpdate = true`. During offline pause, `Game._frame` correctly skips continuous world work and only requests a backdrop redraw after invalidation. However, its global renderer `shadowMap.autoUpdate` is false and `shadowMap.needsUpdate` remains false. Both native ShadowCache and actual Three shadow entry honor the global early-return before looking at the light. The necessary redraw therefore leaves `sun.shadow.map === null` even though the quality owner invalidated it.

The required one-off paused redraw now sets the enabled global shadow gate just before the world render, then retires it and commits the paused backdrop. Unchanged paused frames still render neither world nor shadows. Hidden/skipped frames do not commit the pending redraw, and disabled shadows do not allocate.

## Verification

- Before fix: new native regression fails because `sun.shadow.map` remains null after the paused quality redraw.
- After fix: 19/19 tests pass (0 failures, 0 skips) across idle-attract-budget, idle-resources and world-quality test entries.
- The added case executes the production-composed `Game._frame`, real quality resource owner, bundled Three `WebGLShadowMap`, actual DirectionalLight/Shadow/RenderTarget classes and native ShadowCache wrapper. It exercises 30/60/120 Hz, with/without the wrapper, real old-target disposal, new 1024 target creation, repeated unchanged frames, hidden/skipped frames, disabled shadows, and re-enabling at 4096.
- Existing neighboring cases preserve offline idle budgets, live online pause, context restore invalidation, menu UI cadence and world-update suppression.
- Native Three allocations and gate flow are checked without a WebGL context: renderer draw/state calls are stand-ins and ShadowCache uses its existing non-WebGL2 fallback. These are not GPU pixel, browser screenshot, memory-residency, power or Switch measurements.
- `git diff --check` and adapter/test syntax checks pass. The browser restriction documented under #1039 remains; no browser success is claimed. Keep Refs #384 / Issue open.
