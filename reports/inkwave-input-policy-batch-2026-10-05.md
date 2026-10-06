# Input policy and controller ownership batch

Fixed scope: #633/#634 (one duplicate root), #721, #722, #746. Original standalone base: main `fdc2806c0464813baa5af1d9b2c16044ca03d0a9`. The current candidate applies the same five-Issue delta on PR763 `c46164844bd42324c7ac5662b0fcd3b02e1e7d26`, tree `e6cd397901eebf3e8c545d3228238688e4f1113e`. That base contains main `ecfdd268f70bb7041f81138736b26e42306b630d` with merged PR762/756, plus the separately owned UI/weapon five-Issue batch. The comparison retains only the input-policy five Issues. The four production corrections are composed in one draft to share CI. #738 and #741 are not included.

## Behavior

- Phone gyro contributes to the camera only while touch owns input. Device transitions discard and resync queued deltas while preserving saved intent, permission and sensor enable state. The optional older Controls adapter must precede this owner so a hidden phone gyro cannot suppress gamepad vertical look.
- A direct controller identity change owns new button and stick history. Held controls are blocked until neutral, controller filters retire, and the fixed clock cannot reinsert the old controller's render-pending edge. Explicit disconnect notification handles reused index/id; snapshot object identity is not used.
- Gyro capability checks both relative-sensor policy features. Explicit accelerometer or gyroscope denial blocks activation; each query is independent and an exception cannot hide the other feature's explicit denial. Magnetometer is not required.
- Optional getGamepads failures use the existing no-pad cleanup and advance the controller epoch. Touch/KBM/gyro and game frames continue; unrelated controller/game errors still propagate.

## Composition and duplicate audit

Local reviewed source changes: 1abd82c (633/634), bb35ae0 + 33aa331 (721), e3f91b1 (722), 4f02be1 (746, following 721). Existing main705 fixes remain present. Conflicts were only appended report text and the reliability adapter registration/identity lists; both owners are retained in source order.

Before publication, all comments on the five Issues and related open PR heads were read. Runtime adapter/permission/clock files were checked at PR536@3707abc, 697@a90d94f, 699@fec8e38, 751@51a9f34, 752@d933ced, 755@267395a and 758@a0eec54. None contains these new gyro-owner, direct-pad-identity, pending-epoch or capability corrections. PR762 owns the separate gyro-dropout/pointer-lock four-Issue batch and is now merged into the explicit main base; this draft retains only the five-Issue delta in its comparison.

## Validation

Original standalone production build: `7d1719dc0be5dd938c6668adafa2fb18477d2a735e28a573843599bb8dc656c6`. PR762 composition build: `c86968635d77577960f8720527858dcb74cd117034538dff6c0bb1bff7a8825a`. Final PR763 composition build: `3ea716179cf24b2159c38044f9fd96a7bce4e40452055ba3a986cf3c83fc6780`.

On the original standalone tree, quality suite: 105 passed, zero failed, two optional modes then explicitly completed (GC lifetime and emitted Tenacity). The committed emitted input-policy test also passed against that build: keyboard/pad gyro takeover and fresh touch return, both sensor policy denials, held direct controller swap then fresh input, and 300 fixed ticks after Gamepad SecurityError with stale Special/filter removal and live keyboard movement. Its fixture reads the emitted modules without running build adapters again.

On the original standalone tree, full gameplay/reliability aggregate: 963 passed, two persistent-storage fixture failures from the temporary checkout, one optional emitted mode. The catalog-storage fixture passed when rerun from the required persistent workspace; the remaining CLI diagnostics fixture reached ENOSPC because that filesystem had no free space. Its guard was not weakened. The original exact-head GitHub run37391863945 subsequently passed all seven required jobs, including validate, so that environment-blocked gate was completed in CI. The optional emitted Turf mode passed separately. GitHub CI remains the merge acceptance gate. The additional emitted test is separately run with:

`INKWAVE_INPUT_POLICY_SITE=/path/to/build node --experimental-vm-modules --test patches/reliability/tests/input-policy-emitted.test.mjs`

Source-lane negative controls, detailed counts and source references remain in the corresponding appended behavior-report sections. Source/VM/emitted checks do not establish real restricted-iframe, physical mobile sensor, dual-gamepad hardware, or Switch parity. Identical replacement devices without changed metadata or a disconnect notification remain observationally indistinguishable. No numerical S3 tuning was introduced.

## PR762 composition checks

The stacked tree passes 54 focused source tests across gyro dropout, gyro policy, pointer lock, touch gyro ownership, pad handoff and Gamepad policy. Eight additional actual-sensor/input boundary traces cover keyboard/pad takeover at all four screen angles: pending attitudes retire, non-touch samples do not move the camera, returning touch starts with a seed, and the next observed delta is consumed once. The emitted input-policy test additionally combines touch gyro return with asynchronous pointer-lock release, queued mouse motion and duplicate unlock notifications. The new gyro delta is applied once, queued mouse motion is ignored, and touch release produces no Escape/pause callback. No full aggregate was repeated for this composition; the prior useful CI run completed successfully without cancellation and exact stacked CI remains required.

The final PR763 composition applied cleanly with the same 15-file five-Issue delta. Because it is a different combined runtime, its focused54 source cases and the emitted gyro/pointer/pad/policy boundaries were checked once on the new build; all passed. Earlier #738/#741 partial timing candidates remain excluded.

Original standalone CI receipt: [run37391863945](https://github.com/rhgrive3/actions/actions/runs/37391863945), head7bb3cd1c, validate and all six browser shards succeeded before updating this branch. This receipt does not substitute for the new combined head's CI.
