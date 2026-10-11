# Controller motion ownership review — 2026-10-10

Baseline: `6f5b2850bd18e2d0b2ff1639e0637deaf9f35e1d`, on the separate
PR1202-derived integration branch. Refs #71; no PR1202/main branch write.

## Evidence and calibration boundary

Nintendo's current Splatoon 3 help explicitly describes the Motion Controls
ON/OFF option: OFF switches aiming to the right stick.

https://www.nintendo.com/jp/games/feature/splatoonqa/other/gyro/index.html

The provided Drive bundle's S1 NTSC assets and pinned S3 11.3.0 parameter
records remain generation-specific references. The directly inspected
`SplPlayer.game__GameParameterTable.json` establishes the existing wall-charge
parameters; it does not establish this browser's WebHID/map/setting ownership
rules. This review therefore uses Nintendo's explicit setting description and
the existing INKWAVE input owners, rather than inventing a control rule from
animation lengths or adopting unverified gyro coefficients.

No gyro sensitivity, HID calibration constants, mounting orientation, deadzone,
sample-age timeout, jump/slide distance or movement speed is changed. Joy-Con L
support and physical-controller axis/S3 parity remain unverified.

## Reproducible defects

1. **The native shared Turf Map latch was bypassed by HID aim.** The HID wrapper
   ran before `updateMapInput()` and interpreted old raw held buttons instead of
   `mapHeld`. Standard X could open the map after gyro had already added yaw
   .03 / pitch .015 radians for a 1 / .5 rad/s test packet at 60 Hz and the
   existing 1.8 gain. A latched map without a camera transition was ignored;
   standard View or an inactive mobile map flag could instead suppress valid
   controller motion. The wrapper now calls the same map-input owner first and
   observes its latch. Edges are consumed once, so the native update's second
   call cannot toggle twice. The camera's existing map-transition gate remains.

2. **Motion Controls OFF did not disable HID aiming.** The wrapper used gyro
   sensitivity but ignored the resolved `settings.gyro` preference. Explicit OFF
   now prevents reading/applying motion while leaving native right-stick pitch
   usable. Connecting a device does not silently turn that user preference ON.

3. **Fresh pre-boundary angular rates could be replayed after a short takeover.**
   The reader's arrival-age expiry alone could not distinguish rates sampled
   before a map/menu/device/platform boundary. A short transition below the
   timeout reused that previous rate. The native reader now has a `discard()`
   operation that drops only its held sample. Map/menu cancellation invokes it
   even when open/close happens between ticks or the menu freezes simulation;
   inactive aiming and platform reset also invoke it. New packets restore
   aiming without reconnecting or recalibrating the controller.

## Verification

`controller-motion-ownership.test.mjs` uses the real composed Input and
PlayerController via `pause-fixture.mjs`, plus the real decoder/reader. New
coverage includes X open/close, latched map, standard/nonstandard View, inactive
touch state, OFF with right-stick control, disabled/keyboard/map/OFF transitions,
between-tick cancellation, platform reset and equal fixed-step camera traces
under 30/60/120 Hz rendering.

The 13 new tests and the 14 existing decoder/SPI/lifecycle/controller tests pass:
**27 passed, 0 failed, 0 skipped**. The existing tests preserve report parsing,
SPI user/factory/nominal fallback, disconnection races, recentering and sensor
range behavior. Negative-control results against the baseline are retained in
the review handoff.

These are logic/composition tests and synthetic faithful HID packets. No real
Joy-Con/Pro Controller, Switch capture or browser permission flow was exercised.
