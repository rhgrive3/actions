# Issue #588: visible-window focus gates gyro input

The existing visible blur path reset gyro state once, but subsequent orientation/motion events could immediately accumulate camera input while the document remained visible. The [W3C Device Orientation and Motion draft](https://www.w3.org/TR/orientation-event/) gates event delivery by document visibility; that does not supply the game's separate focus policy.

Both gyro sample paths now require the existing lifecycle to be active and focused. Blur clears accumulated motion and pauses an incomplete sensor-viability probe. Focus restoration resynchronizes the baseline, advances the sample timestamp cutoff and restarts an incomplete viability interval. A permission result arriving during blur retains the requested preference without timing out solely because samples are being deliberately rejected. Duplicate focus notifications do not discard a legitimate pending turn.

This does not add a whole-game blur pause or alter permission requests, Android source selection, motion calibration, gyro sensitivity, hidden/freeze suspension, or the existing non-sensor input reset owner. The next accepted sample establishes a baseline; later real turns produce camera deltas normally. Queued pre-focus timestamps are rejected using the existing clock-origin compatibility rule.

## Validation

- Final patch aggregate: 1,110 passed, 0 failed, 5 existing optional emitted checks skipped.

- Initial reproduction: all five original cases failed before the production correction.
- Focus/startup/handoff source cases: 20/20; full quality suite: 236 passed, 0 failed, 5 existing optional emitted checks skipped.
- Build: `884ae17f7771`.
- Actual emitted focus/startup/handoff: 20/20, no skips. The handoff fixture was corrected to resolve its entire emitted dependency graph, rather than combining emitted native Gyro with source overlays.
- Additional actual emitted portrait/map checks: 14/14. Independent review found no blocker across eight extra permission/hidden/pagehide/restart/watchdog probes. The pre-existing initial focused=true default is outside this post-blur correction.
- Seven new focus cases cover Android and non-Android orientation, actually calibrated raw rotation-rate input, post-focus queued samples, deferred permission, viability timeout preservation, 25 repeated cycles without listener growth, hidden suspension and duplicate focus.

These are native module/VM and emitted module tests with controlled event/timer services. Browser-chrome focus transfer and physical iPad/Android hardware behavior remain unverified. The local Chromium binary cannot start because the environment denies its socket operation; no browser success is inferred from module tests.
