# Independent selected-Brella guard-facing candidate

Baseline: PR #1272 at `317e4230267c6281785f1d241690da88b20361ea`.
Only Splat, Tenta and Recycled Brella receive additional facing admission. The
uncircled Undercover and the other 62 catalogue weapons are not admitted.

## Why the open-only alternative was rejected

The model-only candidate corrected the visual shield plane but native Actor facing
still turned toward reverse travel once the shot pose expired. Tenta's full-IK left
hand could separate by 4.47 cm. A pure open/unlaunched aim-facing predicate fixes the
wrist but begins Tenta's turn too late; its native turn sway can reach 15.8° / 20.5 cm.
Removing the ±90° visual torso clamp gives an unnatural twist and was not adopted.
The failed open-only evidence is retained separately, not called a pass.

## Smallest state-based alternative

The existing paid Brella shot admission already resets canopy.age to -startup and
opens it on held input at the existing measure.open boundary. A `preparing` flag now
exposes that admitted interval. It is not a new timer or a duplicate threshold.
Release/cancel cannot revive it from input alone. At the existing opening boundary
it becomes false, even if opening payment fails. Death, form change, sub preparation,
special, superjump, reset, canopy removal and weapon changes end eligibility.

A pure helper adds only selected preparing/open, healthy, unlaunched, owner-local
kid canopies to the native Actor._face aim branch. It keeps native angular spring,
rate/acceleration limits, special/superjump/roller priority and remote replicated yaw.
It does not change firingPose, fireFacing, wAim/aimReady, shot cadence, ink payment,
moveSpeed, aimDir, collision, canopy timing, Character sway or torso rotation limits.

Integration: two lines in adapter.mjs, a dedicated build adapter and helper, and the
preparing flag only in main-weapon-catalog.mjs. Upstream actor.js and the shared
movement-physics adapter are unedited. Latest main actor source matched the baseline
byte-for-byte. Open PR #1259/#1263 touch the movement adapter; this candidate does not.

## Verification

- Source-level 65 weapon/closed-state and 62 non-target facing traces: 1,356 cases,
  exact before/after equality. The first enumeration used only 58 `s3-` additions;
  it failed and was corrected to the actual 65-entry WEAPON_ORDER, not weakened.
- Preparation input/admission/payment/cooldown/release/weapon/death/reset tests pass.
- Repeated close/reopen, shot state unchanged and launch-release tests pass at
  30/60/120 Hz; yaw-wrap/native aim spring and remote isolation tests pass.
- 243 live holds: 3 weapons × 3 rates × 3 pitch values × idle/eight directions.
  Preparing alternative passes all: worst 0.477°, 6.57 mm shield-centre error and
  0.474 mm left-hand separation. This is INKWAVE live-Actor evidence, not retail footage.
- Exact emitted-runtime build hash:
  `51890ca281e46bcf6715b75a214d37f8c816461a32564ebc2e4c51320b5a4f05`.

Exact emitted-runtime aggregate completed 41/42 tests, including the full 243-case
matrix, all 65 facing traces, catalogue emission/resource checks and Brella geometry/
shield contracts. The one failure is the existing #857 remote harness calling the
fully adapted NetMatch with `{}` instead of its required `_peer` owner; the same
error reproduces against the unchanged model-only emitted baseline. It is not
silently classified as passing. #857 and #973 are also run through their supported
source fixture. No unrelated network code or old test is changed for this candidate.

Real-browser anatomy/reverse comparison is pending. No merge/adoption or exact Splatoon 3 animation parity is claimed.

## Behavior comparison record

The PR #1272 model review exposed native body-facing toward reverse travel after the
single-shot pose ends while the live shield still follows aim. The separate candidate
uses existing paid-shot canopy preparation and open state for only Splat/Tenta/Recycled
Brella facing admission. It preserves shot/resource/collision/movement-speed owners,
roller and special priority, and remote yaw; Undercover is excluded. Reproduce by
holding a selected Brella while backpedalling, then closing/reopening or launching it.
Source reference remains the pinned Splatoon 3 Ver.11.3.0 weapon data and multi-angle
weapon references; these do not establish retail body-turn timing. INKWAVE's 30/60/120
Hz tests and pending real-browser proof are separate from unmeasured retail motion.
The candidate evidence and limits are recorded above.
