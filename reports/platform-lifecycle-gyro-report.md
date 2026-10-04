# INKWAVE Platform Lifecycle / Gyro — Draft integration report

## Baseline

- main: `5e28dbd16f7829aebd88052ff5f7fdf71f39fdad`
- source workstream commit: `8ad888d32a8884f7a2efc09417d3fbb79c5941ad`
- source package: `INKWAVE-platform-lifecycle-local.zip`

The source workstream kept `inkwave-public/` unchanged and extended the existing build-only `patches/local-quality` layer.

## Root causes addressed

1. **iOS-style motion permission was requested too early.**
   The mobile GYRO path originated from pointerdown. The new path requests permission synchronously from a valid pointerup/click activation stack.

2. **Permission state was over-simplified.**
   Orientation is the required quaternion source; optional motion/rotation-rate permission no longer overrides orientation denial. Unsupported, denied, pending, timeout/no-data and unknown-error are separated.

3. **The UI could direct users to a setting that may not exist.**
   Status text now reports the actual runtime capability/permission state instead of hardcoding Safari-settings guidance.

4. **Page lifecycle ownership was fragmented.**
   Game frame scheduling, menu lease, input boundary reset, gyro, audio/music and transport now subscribe to one `PlatformLifecycle` owner.

5. **Background gaps could leak stale time/input/sensor state.**
   Resume rebases clocks/accumulators, clears stale input edges and gyro deltas, and schedules one game rAF. It intentionally does not reset active cooldowns/projectiles/dodge/roll state.

## Source-workstream evidence

The supplied package reported:

- Node platform state/permission/audio/transport/input/frame/adapter/gyro: 36/36
- Chromium memory-loaded runtime: 11/11
- 20 suspend/resume cycles with one game rAF and no listener growth
- first frame after each resume: dt=0
- 30-second wall-clock gap: first frame dt=0
- Android quaternion path retained; stationary biased rotationRate produced no yaw/pitch drift

Our independent package check verified all SHA256 entries and syntax-checked all JS/MJS/Python files. In this environment the extracted Node suite ran 31 pass / 5 skip; the five skipped cases require the baseline artifact/source fixture that is not present inside the changes-only package.

## Important limits

This Draft does **not** claim real-device completion:

- iPhone Safari permission flow: not physically verified
- iOS Home Screen Web App: not physically verified
- Android sensor hardware: not physically verified
- real WebGL battle context loss/restoration: not verified
- native OS process kill/cold launch: not recoverable without a separate persistent battle/rejoin design
- full source build/browser suite must still run in repository CI

The workstream deliberately does not add a new rejoin protocol. If the server destroys a room while backgrounded, same-battle recovery is not guaranteed.

## Scope boundary

Unchanged by design:

- weapon range/damage/spread
- normal movement numbers
- character/roller animation
- projectile replication protocol
- loading/cache strategy
- ordinary action buffering

## Review status

Strong Draft integration candidate. Release acceptance requires CI plus the real-device checklist.


## Final finishing review (2026-10-04)

- The optional `DeviceMotionEvent.requestPermission()` completion now has the same lifecycle-epoch ownership guard as the required orientation permission. An obsolete result from a prior lifecycle epoch cannot overwrite `motionPermission`; the regression test resolves both stale browser promises after the epoch change and requires the optional state to remain `prompt`.
- Automated acceptance on this branch requires 24 hide/show suspend-resume cycles with one frame owner and stable listener/subscriber counts, plus a 30-second wall-clock discontinuity whose first simulation frame is rebased to `dt=0`.
- Suspend/resume clears stale keyboard, mouse, touch, gamepad edges and gyro deltas while preserving authoritative gameplay state such as cooldown, an active dodge/roll object, and projectile age.
- Physical iPhone/iPad Safari and especially installed Home Screen Web App gyro behavior remain **real-device pending**. Chromium/WebKit automation is compatibility evidence, not a substitute for the OS permission/lifecycle path.
