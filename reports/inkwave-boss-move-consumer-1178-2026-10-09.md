# Boss move consumer admission — #1178

Baseline: PR #1182 `46e12a85329ee04576ae26ab31bac1d0f730a0c0`.
This is an INKWAVE HULLBREAKER network/geometry repair, not a Splatoon numerical retune. It preserves earlier #1178 actor rows, signed pending-lethal HP, timestamps, event envelope, replay, and current-host guards.

## Actual remaining defects

The previous `validBossMove` required finite scalars and nonnegative durations, but did not enforce the numerical/structural conditions required by its native consumers:

1. A barrage with finite `sx=1e308` and target `x=-1e308` passed both host-event and Boss-snapshot admission. Native `barrelPos` overflowed during coordinate subtraction and arc construction. Actual `BossHazards` / `HazardFX.draw` produced a barrel position containing `-Infinity` and `Infinity`.
2. `barrage.p.b=[]` passed `every()`, then actual `Boss.update → _modelUpdate → _moveAim` threw when it dereferenced the missing final barrel target.
3. `sweep.d[1]=0` passed admission. At the active-phase boundary, native `beamAngle` divided zero by zero, producing NaN in both model aim and the drawn beam scale.
4. A zero telegraph duration likewise reached a native division by zero: the charge lane's progress uniform became NaN at its start. The independent audit also observed the same problem in Slam mark progress.

Positive tests receive real JSON through composed NetMatch, then run native Boss sampling/update and real hazard geometry. Model rendering, navigation and the scene environment are bounded fixture boundaries; this is not a GPU/browser or live WebSocket measurement.

## Existing producer contracts used

- [BossBrain._start at the baseline](https://github.com/rhgrive3/actions/blob/46e12a85329ee04576ae26ab31bac1d0f730a0c0/inkwave-public/src/boss/bossBrain.js) rounds move coordinates and phase times with `r3`, stops rather than emits an empty barrage, and uses a strictly positive telegraph duration for all six moves. Sweep's active duration is positive in every phase.
- [BossHazards native geometry](https://github.com/rhgrive3/actions/blob/46e12a85329ee04576ae26ab31bac1d0f730a0c0/inkwave-public/src/boss/bossHazards.js) owns the phase divisions, barrel interpolation and Float32-backed geometry. [Boss._moveAim](https://github.com/rhgrive3/actions/blob/46e12a85329ee04576ae26ab31bac1d0f730a0c0/inkwave-public/src/boss/boss.js) requires a nonempty barrage.

The validator now requires safely representable rounded `value * 1000` integer units for move scalars/phase times. Signed coordinates remain valid. This follows the existing wire representation rather than inventing a stage-distance or Nintendo limit. The resulting coordinate envelope keeps barrage differences, hypot/arc intermediates and Float32 positions finite. It also requires `tele > 0`, `sweep act > 0`, and nonempty barrage targets. There is no new wire field or gameplay coefficient.

## Verification

- Selected source validation: 51/51 passed, including the six new cases, existing Boss snapshot/timeline, actor snapshot/timestamp, event-time and Boss volley/blocked-feedback tests.
- Emitted build `8e981842339a`: 5/5 applicable cases passed; the source-only counterfactual was deliberately skipped. Quick/reference and startup/cache gates passed (141 initial JS requests, 140 module preloads, 3,355,278 initial JS bytes).
- Independent read-only review reran new/adjacent Boss suites: 17/17 passed, no blocking findings. It also checked 512 signed boundary barrel-interpolation samples through Float32 conversion.
- The two positive native suites failed on the previous guard before editing it.
- New cases cover event rejection before its replay sequence is reserved; valid same-sequence recovery; snapshot last-good-state preservation; duplicate and non-host controls; all six move schemas; actual 30/60/120Hz hazard traces; and signed representability boundaries through real barrel geometry and Float32 matrices.
- A source-only counterfactual restores only the previous guards and reproduces Infinity geometry, the empty-target throw, and both zero-duration NaN cases.
- Existing native generation coverage exercises six move types across all three Boss phases, preserving all 18 legitimate outputs.

## Remaining scope

This does not assert complete adversarial resource-exhaustion protection. In particular, a finite but enormous sweep angular span can demand excessive fan subdivisions or angle-loop work; array-count/work-budget admission is a separate residual. No deliberately unbounded loop was executed in this validation. No Nintendo Boss equivalence, browser/GPU validation, live multiplayer or whole-branch CI result is claimed.
