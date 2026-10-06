# Issue #595: continuous low-speed raw-gyro trust

At effectively zero attitude-derived speed, the previous special branch demanded raw speed at or below `1e-8 rad/s`. Immediately above that boundary, the same function allowed disagreement up to its existing `max(0.025 rad/s, speed * 0.3)` floor. Thus a calibrated raw source could be discarded by a finite 0.01 degrees/s residual solely because attitude quantization produced zero.

The correction removes that special equality branch. The existing disagreement formula now applies continuously through zero. Axis mapping, scale conversion, the 75 ms freshness bound, Android's attitude-only policy, fallback on meaningful disagreement and #524's handoff timestamp owner are unchanged. No new threshold, hysteresis, deadband or sensor calibration is introduced.

The [W3C Device Orientation and Motion specification](https://www.w3.org/TR/orientation-event/) defines the raw rotation-rate API; the local comparison remains in radians/s after the existing mapping/conversion. This is continuity of INKWAVE's own trust rule, not a claimed Nintendo sensor calibration.

## Verification

- Final patch aggregate: 1,110 passed, 0 failed, 5 existing optional emitted-mode skips.

- Initial suite: 11 failures and one Android control pass before the correction.
- Native source trust/handoff: 16/16, including the existing handoff phase/frequency matrix.
- Full quality suite: 241 passed, 0 failed, 5 existing optional emitted-mode skips.
- Build: `5d2df4a7782f`.
- Actual emitted trust and sensor-viability modules: 21/21, no skips.
- Exact private composition with #588's gyro/permission/lifecycle path: 19/19 focus and trust cases.
- Independent review found no blocker: 552 boundary assertions covered mappings, axes, signs, calibration unit scales, finite values, freshness and tolerance edges; eight additional native 60-second residual traces preserved the calibrated source.
- Actual native calibration selects rrA/rrB, decelerates smoothly and retains that source through finite stationary residuals at 30/60/90/120Hz. Subsequent turns still produce finite motion; large mismatch still falls back.

Small accepted residuals continue through native smoothing/integration. This patch does not eliminate physical stationary bias or establish a hardware noise model. The test's smooth deceleration also does not prove immunity to every abrupt, asynchronous sensor disagreement. Physical iOS/iPadOS/Android browser traces remain unverified.
