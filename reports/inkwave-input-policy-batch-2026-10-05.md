# Input policy and controller ownership batch

Fixed scope: #633/#634 (one duplicate root), #721, #722, #746. Base: main `fdc2806c0464813baa5af1d9b2c16044ca03d0a9`. The four production corrections are composed in one draft to share CI. #738 and #741 are not included.

## Behavior

- Phone gyro contributes to the camera only while touch owns input. Device transitions discard and resync queued deltas while preserving saved intent, permission and sensor enable state. The optional older Controls adapter must precede this owner so a hidden phone gyro cannot suppress gamepad vertical look.
- A direct controller identity change owns new button and stick history. Held controls are blocked until neutral, controller filters retire, and the fixed clock cannot reinsert the old controller's render-pending edge. Explicit disconnect notification handles reused index/id; snapshot object identity is not used.
- Gyro capability checks both relative-sensor policy features. Explicit accelerometer or gyroscope denial blocks activation; each query is independent and an exception cannot hide the other feature's explicit denial. Magnetometer is not required.
- Optional getGamepads failures use the existing no-pad cleanup and advance the controller epoch. Touch/KBM/gyro and game frames continue; unrelated controller/game errors still propagate.

## Composition and duplicate audit

Local reviewed source changes: 1abd82c (633/634), bb35ae0 + 33aa331 (721), e3f91b1 (722), 4f02be1 (746, following 721). Existing main705 fixes remain present. Conflicts were only appended report text and the reliability adapter registration/identity lists; both owners are retained in source order.

Before publication, all comments on the five Issues and related open PR heads were read. Runtime adapter/permission/clock files were checked at PR536@3707abc, 697@a90d94f, 699@fec8e38, 751@51a9f34, 752@d933ced, 755@267395a and 758@a0eec54. None contains these new gyro-owner, direct-pad-identity, pending-epoch or capability corrections. PR762 contains the separate gyro-dropout/pointer-lock four-Issue batch; this draft does not copy it.

## Validation

Authentic production build: `7d1719dc0be5dd938c6668adafa2fb18477d2a735e28a573843599bb8dc656c6`.

Quality suite: 105 passed, zero failed, two optional modes then explicitly completed (GC lifetime and emitted Tenacity). The committed emitted input-policy test also passed against that build: keyboard/pad gyro takeover and fresh touch return, both sensor policy denials, held direct controller swap then fresh input, and 300 fixed ticks after Gamepad SecurityError with stale Special/filter removal and live keyboard movement. Its fixture reads the emitted modules without running build adapters again.

Full gameplay/reliability aggregate: 963 passed, two persistent-storage fixture failures from the temporary checkout, one optional emitted mode. The catalog-storage fixture passed when rerun from the required persistent workspace; the remaining CLI diagnostics fixture reached ENOSPC because that filesystem had no free space. Its guard was not weakened, and this one environment-blocked gate remains for exact-head CI. The optional emitted Turf mode passed separately. GitHub CI remains the merge acceptance gate. The additional emitted test is separately run with:

`INKWAVE_INPUT_POLICY_SITE=/path/to/build node --experimental-vm-modules --test patches/reliability/tests/input-policy-emitted.test.mjs`

Source-lane negative controls, detailed counts and source references remain in the corresponding appended behavior-report sections. Source/VM/emitted checks do not establish real restricted-iframe, physical mobile sensor, dual-gamepad hardware, or Switch parity. Identical replacement devices without changed metadata or a disconnect notification remain observationally indistinguishable. No numerical S3 tuning was introduced.
