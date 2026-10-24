# Ink Vac cosmetic muzzle alignment

Private candidate based on e9ba42d. No public/frozen source, upstream input, workflow, pin, model geometry/color, shader, audio, camera, gameplay or birth-observer change.

## Diagnosis

The kit's `originOf` authors `actor.pos + (0, breathOriginHeight, 0)` for both intake and native countershot. `createInkVac` already authors its separate nozzle socket `(0,.02,.31)` in the fitted held model. `inkVacShot` copied projectile.start, a gameplay coordinate, into both cosmetic muzzle and shock-shell spawners.

Independent actual-code CPU probe with actor `(0,2,0)` produced native birth `(0,3,0)` versus model nozzle `(-.0780168,2.8943036,.4955897)`. The VFX primitive itself does not add a location offset. This explains a roughly0.5-world-unit disagreement without asserting a source-derived retail-frame match.

## Narrow patch

`inkVacPresentationMuzzle(character,out)` returns true only for the exact visible held InkVac model currently owned by that character, checks ancestor visibility and valid world coordinates, then reads the existing model socket. The VFX caller additionally requires that character.actor is the exact projectile owner, so a stale character alias cannot borrow a foreign live actor’s nozzle. It never calls or replaces getMuzzle/getAimMuzzle, changes a transform, or touches a gameplay coordinate. A false result is always followed by the original projectile birth fallback.

The native release path sets its state phase to done and clears specialActive before it authors a projectile. It retires/deletes that state only after the synchronous `_push` returns. The accessor recognizes this bounded local, unretired release window so the actual owner release does not fall back incorrectly. Afterwards, and for cancelled/ended replicas without ownership, the still-cached model cannot be used.

The existing accepted local/ghost birth wrappers, rejection gates, WeakSet dedup, pool-reset ownership, clearing semantics and HOLD behavior are unchanged.

## Verification

Final validation uses explicit Node22.23.3 (`/workspace/shared/portable-rainmaker-peer-20261022/node22/node_modules/node/bin/node`); esbuild0.28.2. Earlier pre-review validation also passed under Node24.19.0. New fully composed production installer/native Character/native Projectiles suite plus earlier InkVac tests:16/16 source and16/16 with both changed production modules transformed through production esbuild options and compactModuleStrings. Neighbor projectile/Inkjet/area/support/zero-drag regressions:20/20. The new suite has seven TAP cases and includes:

- Twelve full 3D aim/yaw combinations, each a local and an accepted native ghost birth, independently comparing flash/shell positions to the real fitted model socket.
- Native coordinates/velocity/damage/lifetime and recorded wire origin remain unchanged; duplicate observations and pool reuse still emit once per accepted generation.
- Missing character/presentation, wrong/ended token, hidden model/kid/ancestor, disabled/nonkid/dead owner, detached model and invalid matrix preserve the native fallback. Ghost-specific absent/ended/hidden/detached/disabled fallbacks are also covered.
- Real production Actor activation→exhale HOLD→release at30/60/120Hz, including the synchronous cleared-token window, unchanged native release origin, normal state retirement and refusal of the stale post-release model.
- Explicit local and ghost regressions alias an eligible foreign live InkVac character. Both accepted births retain their own native/wire origin. Removing only the new caller identity guard makes that regression fail while all six other integration cases pass.
- Targeted negative control restores only the old `p.start` flash selection: expected positional failures occur, while fallback checks remain valid. No native gameplay implementation is replaced by a test copy.

Commands (from source):

    node --experimental-vm-modules --experimental-global-webcrypto --test patches/splatoon3/tests/ink-vac-model-muzzle.test.mjs patches/splatoon3/tests/ink-vac-shot-vfx.test.mjs
    SPECIAL_VFX_ESBUILD=/workspace/shared/permitted35-full-build/source/node_modules/esbuild/lib/main.js node --experimental-vm-modules --experimental-global-webcrypto --test patches/splatoon3/tests/ink-vac-model-muzzle.test.mjs patches/splatoon3/tests/ink-vac-shot-vfx.test.mjs
    INK_VAC_MUZZLE_OWNER_NEGATIVE=1 node --experimental-vm-modules --experimental-global-webcrypto --test patches/splatoon3/tests/ink-vac-model-muzzle.test.mjs
    INK_VAC_MUZZLE_NEGATIVE=1 node --experimental-vm-modules --experimental-global-webcrypto --test patches/splatoon3/tests/ink-vac-model-muzzle.test.mjs

For exact Node22 reproduction, replace node in these commands with the explicit binary above. The esbuild path is a local verification dependency, not a production import. Optional source clips are disposed in the CPU test; the actual native procedural pose/fitted model remains enabled. Only muzzle/shell cosmetic sinks are spied. No renderer is launched.

## Unverified

No browser/GPU, screenshot, full-site build/budget, hosted CI, visual motion-frame or paired-retail acceptance is claimed. A moving actor may update its pose after native birth in the same frame; actual rendered-frame verification must inspect that ordering. Late ghost births without a still-owned rendered model intentionally fall back to the transported native origin rather than reading stale geometry. Original retail-version/input/FPS uncertainties remain.
