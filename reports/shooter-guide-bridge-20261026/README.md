# Unowned Physics bridge guide fallback

Incremental base: `7955ee32d2fbd9fbab677f1f57da5c8aaebde0b9`, including the already-accepted impact/marker fix. The only runtime change is two revision reads in the existing guide-cache module: Shooter and Dualies require `physics.level.collisionRevision`, rather than borrowing `G.level.collisionRevision`. The existing nonnegative-safe-integer admission and supported-world keys/reuse remain unchanged. No other consumer, producer, physics, visibility or timing rule changes.

The minimal regression delegates `los`, `raycast` and `segment` to real Physics but exposes no `.level`. `G.level` is a separate, valid production Level. Moving the real collision floor from0 to-2 and calling its actual `markCollisionChanged()` updates the hidden owner's revision while the unrelated `G.level` revision remains unchanged. Actor, muzzle, aim and time are held fixed. This is a limited unsupported-adapter case, not the normal Physics/NativePhysics route.

| Guide | Before | Old cached result after floor movement | Fresh solver / fixed result |
| --- | --- | --- | --- |
| Shooter | Y=0 | Y=0 | Y=-2 |
| Dualies hands | Y=0 /0 | Y=0 /0 | Y=-2 /-2 |

The pre-fix regression fails as expected. Impact and marker already observe-2 through their previously fixed unsupported-owner paths. After this fix the bridge guide also follows-2 immediately; an unchanged bridge call recomputes (one Shooter sweep, two Dualies sweeps). Ordinary exposed Level/NativePhysics owners still reuse: existing30/60/120Hz traces have zero additional sweeps across120 unchanged calls, and Dualies' existing ten-second cache checks pass.

Validation:

- `node --experimental-vm-modules --test patches/splatoon3/tests/shooter-shot-guide-cache.test.mjs patches/splatoon3/tests/issue-970-guide-cache.test.mjs`: **11/11** source.
- The same command with `INKWAVE_BUILT_SITE=/tmp/inkwave-shooter-guide-bridge-20261026`: **11/11** actual optimized emitted runtime.
- Normal production build, quick compatibility and startup/all-artifact digest gates: passed. The modified source input and emitted artifact match the build manifest; hashes and both bridge traces are in `verification.json`. Complete negative/source/emitted/build/gate logs are retained as gzip.

The CPU fixture's optional dynamic source motion is unavailable, so native Character fallback is explicit. This does not establish natural-input HUD behavior, device performance or Nintendo inner-marker appearance. No original-game media, new test framework, unrelated cache expansion, PR or manual CI is included.
