# Gyro entry preference, startup ownership and sensor viability

## Scope / existing owners

Baseline: platform/lifecycle Draft #60 at `25797fb0bc70f8690a66cf75fbd581f40ba7037b`. This stack addresses three remaining roots across #376, #404 and duplicate pair #364/#368. It preserves #60's orientation-required capability check, permission generations and page owner instead of adding a second sensor mapping. No changes to quaternion/rate math, sensitivity constants, Android rate rejection, camera axes, movement, combat or network state.

## Reference

Splatoon 3 reference baseline is Ver. 11.3.0. [Gamepur's motion-controls guide](https://www.gamepur.com/guides/how-to-turn-off-motion-controls-in-splatoon-3) and [Samurai Gamers' guide](https://samurai-gamers.com/splatoon-3/how-to-turn-off-motion-controls/) document motion-on for a fresh profile/tutorial and the user's ability to disable it afterward. These launch-era gameplay guides establish the default direction; they are not official Nintendo numerical calibration or new Switch measurements. Current physical iOS permission, standalone PWA and sensor delivery remain unverified.

## #404: first-run preference

The actual Game.boot now asks its existing deviceProfile first and uses an orientation-capable touch-primary default in the existing loadJSON merge. Saved true/false values override it. Desktop/non-touch, insecure or missing required orientation stay default-off. No permission call occurs at boot, and shared config gains no device dependency. The existing Start activation stack remains the permission entry point. Missing samples fall back without changing the user's stored preference.

## #364 / #368: START request ownership

The native Start request is still invoked synchronously. A bounded startup record retains the MobileInput instance, current intent, lifecycle epoch and (once armed) exact match. Grant-before-start and start-before-grant converge on one listener start with no duplicate prompt. Deny, OFF, destruction/replacement, menu or match replacement, and suspension cannot revive the old continuation. Repeated start cannot retarget an old armed permission to a new match. Permission-only preparation removes its sensor-resume intent while preserving the granted session.

## #376: no-sample state

#60 already rejects DeviceMotion-only capability. Its remaining no-data watchdog now stops native listeners and clears live/wanted/ON state instead of only displaying a notice. Waiting is displayed as busy, not as working gyro. Only a valid orientation sample marks the control active. Permission and the retryable no-data reason remain distinct. Explicit retry clears the old failure before notifying the new intent; otherwise that old status would cancel the retry. Movement, held touch actions and swipe deltas are preserved.

The setGyro Promise continues to report preference/permission admission; actual sensor readiness is separately represented by availability and the ON indicator. No independent uncalibrated rotationRate fallback is introduced.

## Evidence and remaining acceptance

Tests execute actual composed Gyro/MobileInput and startup helpers, native persisted-settings merging, deferred request Promises, sensor events and timers. Source and emitted/minified modes cover the same state cases. Baseline #60 reproduces both no-data false-ON cases, fresh-mobile default-OFF, and late-grant/no-listener startup. Canonical Chromium/WebKit checks load the emitted modules and exercise no-data stop, explicit retry, delayed START grant and default selection using fixture session grants; they never request an OS prompt.

Full aggregate, native/emitted, quality/lifecycle and browser CI results are recorded on the PR after completion. Physical-device success and exact Nintendo gyro response are not claimed. Main merging and issue closing are left out of this source PR.

The inherited #60 head had already switched its workflow to three independent browser shards, but retained the old test requiring two shards and the old matrix syntax. This stack carries the current-main workflow contract test unchanged, preserving/strengthening source identity, all browser families, negative gates and success-receipt checks. The workflow itself is not changed.
