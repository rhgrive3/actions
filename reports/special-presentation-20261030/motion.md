# Rider motion comparison — 2026-10-30

Scope: `runtime/special-motion.mjs`, based on `fd6435a` in the isolated
`improve/special-motion-20261030` worktree. The paired device geometry and
hand fitting change belongs to the holds lane. No `inkwave-public` source or
gameplay module is edited here.

## Reference and observed difference

- Nintendo's Splatoon 3 Direct (2022-08-10),
  <https://www.youtube.com/watch?v=aiuIZN0KDFQ&t=385>, establishes Reefslider's
  low, forward-leaning rider with a bent leg trailing behind the saddle.
  The inspected Direct still is retained at
  `/workspace/scratch/special-references/s3-reefslider-direct.png` (also hosted
  at <https://cdn.wikimg.net/en/splatoonwiki/images/c/c8/Reefslider_promo-image.png>).
  It is prerelease footage; exact executable version, gear and controller
  input are unknown. A still does not establish transition duration or joints.
- [`special-models.md`](../../patches/splatoon3/reference/special-models.md)
  identifies Crab Tank's pilot above its cockpit and records the old standing
  pilot as a known difference. The cited S3 Model.png and promo screenshots
  establish the seated family of pose; dimensions and exact joint curves
  remain unverified.
- The existing public Character retains its ordinary walk/jump body beneath
  these two vehicles. Its source locomotion retarget runs after native leg IK,
  so adding foot targets alone is overwritten by the loaded source bank.
  Reefslider's old whole-character lean still left near-vertical walking legs.

Reproduction: activate Crab Tank or Reefslider, move while looking at the pilot
from the side, then let the special finish and walk. The old pilot's feet can
continue walking through the device and floor. This is a visible attachment
and pose ownership defect, not a change to special movement or damage.

## Change and limits

The live presentation token now selects a calibrated pilot pose before native
IK. Crab Tank raises the hips to the cockpit with knees bent and feet at the
rear steps. Reefslider lowers and leans the torso over the saddle, with bent
legs and trailing feet. The holds lane replaces its old whole-kid tilt with an
independent root-mounted shark and solves the hands against its actual handles.
The final Reefslider pelvis is 0.06 native units farther forward than the first
candidate, with another 0.1 radian of chest lean. A loaded-source trace found
the first candidate 0.0098 units short of a grip in startup; the first correction
still left 0.0065 units during braking. The final position fits both hands
through the shark's existing bob, roll and braking motion.

Only the native pose application temporarily yields the source controller's
`active` flag. Its update, form and action clocks still run, and the flag is
restored in `finally`. Floor-plant weights are zero during riding. On exit the
source retarget's contact cache is reset so its old ground anchors cannot drag
the first walking pose back toward the activation position. Hidden parents,
death, cancellation, weapon changes, opt-outs and the Crab ball form release
the pose owner. The next normal build supplies the ordinary pose.

All coordinates and the 0.18-second visual settling window are INKWAVE rig
calibration. They are not extracted Nintendo frame values. Actor transforms,
movement, attack scheduling, projectiles, damage, paint and network state are
unchanged. On-console timing, exact joint curves and hardware feel remain
unconfirmed.

## Verification

Command:

```sh
node --experimental-vm-modules --test patches/splatoon3/tests/special-rider-motion-20261030.test.mjs
```

The new regression uses the actual production-composed Actor, Character and
loaded Player00 source animation bank. At 30/60/120 Hz it measures raised or
crouched hips, bent/trailing legs, stable feet during actual movement, pause,
and identical native gameplay traces with the rider layer enabled/disabled.
It also covers cancellation, hidden parents, opt-outs, weapon changes, Crab
ball mode, death and the return to ordinary source locomotion and main weapon.

Final targeted command (2026-10-30, after the holds integration):

```sh
node --experimental-vm-modules --test --test-name-pattern='Crab rider|Reefslider lower' patches/splatoon3/tests/special-rider-motion-20261030.test.mjs
```

Result: **6/6 passed** at 30/60/120 Hz, including settled hips/ankles equal
within 0.00001 native units, continuously moving pilots, and both real hand
holes tracking the authored device grips. Maximum grip residual was
6.49e-16 for Crab Tank and 7.12e-15 for Reefslider across sampled
startup/dash/brake poses. This is a socket measurement, not a distance to a
mesh bounding-box center. The four gameplay/cleanup/source-return/exception
cases passed before the final coordinate-only reach correction. The existing
`special-motion.test.mjs` and `special-presentation.test.mjs` also passed
**22/22**. The integration owner runs the final combined suite.

The verifier's initial 480px browser side views showed the raised Crab pilot
with feet on the rear steps and the low Reefslider pilot with bent trailing
legs; no major mesh penetration was apparent in those views. They predate the
small final reach correction above. Final browser comparison is verifier-owned.
CPU scene measurements and browser images are not an on-console comparison.

The aggregate behavior record is parent-owned; link this scope there without
marking Nintendo joint/timing unknowns resolved.
