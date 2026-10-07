# #187: suppress Android attitude drift contradicted by exact-zero rate

The Device Orientation specification distinguishes an implementation-defined
attitude reference from instantaneous rotation rate:
https://www.w3.org/TR/orientation-event/ . The working group's drift discussion
also documents the absolute-reference head-tracking issue:
https://github.com/w3c/deviceorientation/issues/21 . This patch addresses the
issue's deterministic zero-rate/reference-drift case, not every sensor bias or
Android calibration problem.

For Android only, a valid admitted DeviceMotion sample with all three rates
exactly zero is retained for the existing75ms trust interval. During that period
native orientation/quaternion bookkeeping still advances, but new look deltas
from attitude correction are removed and its smoothing tail is neutralized.
Previously queued legitimate turn deltas are retained. Zero is unchanged under
any axis/sign/unit mapping, so no new raw-axis calibration or aiming deadzone is
introduced. Nonzero samples, absent/stale/denied rate data, and iOS retain the
existing path. Resume/resync invalidates the observation.

Validation:
- Native new tests9/9 and emitted9/9; combined native gyro/startup/lifecycle/
  relayout/quality58/58, and full gameplay742/742.
- Existing combined emitted gyro/startup/relayout suite37/37 plus the final
 9-case stationary suite. Real native Gyro consumes synthetic data; no physical-device claim.
-10 seconds of1°/s attitude-reference drift plus zero rate at30/60/90/120 Hz
  produces no accumulated look. The old runtime negative accumulates about
  0.47352 radians on this fixture instead of0.
- Nonzero turn samples work with screen angles90/270; queued legitimate deltas
  survive stationary samples; the next turn does not replay the corrected
  reference. Tests cover iOS, absent/expired evidence,75/76ms boundary, denied
  motion permission and resync.
- Build355eee7f6875. No changes to permission prompts, gyro gain, axis calibration,
  Android raw-source selection, or #524 handoff math are intended.

Physical Android sensor noise/quantization, broken always-zero implementations,
nonzero stationary bias, and full platform axis calibration remain unverified.
This narrow guard must not be presented as complete hardware acceptance for all
of #187. Browser/device acceptance awaits the composed gyro branch's validation.

Separate #524 composition used its exact four handoff edits and its PR60 fixture:
source38/38 and emitted38/38 pass, including64 phase/frequency/order/axis traces.
The composed build iscdf3fb2628fd. Android remainsori and the iOS handoff retains
its own rawStart lifetime. That temporary composition is validation only; the
#187 source commit does not take ownership of or silently duplicate #524.
