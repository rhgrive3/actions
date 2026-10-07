# Issue #571: retire the touch map latch on deliberate input takeover

A fresh keyboard/gamepad action could change the displayed input owner while leaving `MobileInput.mapOpen` latched. The controller continued treating that touch-only flag as an open map, suppressing camera and main/sub input even after the new device released its map controls.

The correction reuses the explicit `navigationDevice` metadata introduced for #409/#550. When that owner changes to a non-touch device, the native `setMap(false)` retires the touch map flag and UI classes. It runs before the native same-presentation-owner early return, so a fresh pad action can close the map even if a previous unchanged-axis poll already set `lastDevice='pad'`.

An unchanged held-axis poll deliberately does not count as takeover. Closing the map on every `lastDevice` change would regress #550 by revoking an intentional touch reservation. This patch adds no thresholds and changes neither axis filtering nor device acquisition. Same-touch pointer cleanup preserves the map; keyboard held-map and standard-pad map-toggle controls retain their own normal close actions.

The reference is the reproducible hybrid-input capability reported in [Issue #571](https://github.com/rhgrive3/actions/issues/571), rather than an original-game numeric calibration.

## Verification

- Final aggregate: 1,116 passed, 0 failed, 5 existing optional emitted-mode skips.

- Initial six-case suite: four failures and two controls passing before the correction.
- Focused source: 57/57 across #571, respawn navigation and input ownership.
- Build: `d927c13e4e29`.
- Actual emitted #571 and respawn-navigation modules: 37/37, no skips.
- Independent review found no blocker; 13 private probes covered acquisition thresholds, same-axis zones, fresh second-axis input, pending touch jumps and raw-pad held-map controls.
- New cases exercise native keyboard keydown, native pad polling, the real controller camera/fire/sub output, keyboard/pad map close controls, unchanged held axes followed by a fresh same-presentation-owner pad action, pointer cleanup, lifecycle reset and maps already closed.

These are native transformed/emitted module tests with display/collision fixtures. Physical Bluetooth devices, iPad Safari and Android Chrome were not verified in this local environment. Existing native pin/respawn reservation regressions remain included; a new map gesture acquisition policy is outside this change.
