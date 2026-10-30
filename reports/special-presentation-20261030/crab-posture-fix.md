# Crab Tank: correct the seated bend direction

The previous Crab pose was wrong. Its knees were behind the anatomical hips,
and its ankles were above the hips. Checking only that a knee was ahead of its
foot allowed a backwards kneeling silhouette to pass. This correction
supersedes the Crab acceptance in [motion.md](motion.md).

The reference is Nintendo's S3 Crab Tank promotional screenshot, retained at
`/workspace/scratch/special-references/s3-crab-official.jpg` and cited by
[`special-models.md`](../../patches/splatoon3/reference/special-models.md).
It shows the rider leaning toward the controls with bent legs descending beside
the cockpit. The image does not establish original joint angles, dimensions,
animation timing or its precise executable version/gear/input.

The change keeps the pilot's pelvis at the same cockpit position, lowers the
ankles, moves them nearer the pelvis, and increases forward hip/spine flexion.
Native two-bone leg and arm IK still solve the pose. Reefslider and all gameplay
code are unchanged.

## Actual skeleton measurements

The table uses real loaded Player00 bones, with forward measured by projection
onto `(sin(actor.yaw), 0, cos(actor.yaw))`; these are not pose-channel signs.
Values are INKWAVE world units at the settled half-second sample. Both legs
have the same values here.

| Measurement | Previous | Corrected |
| --- | ---: | ---: |
| Chest ahead of pelvis | 0.03275 | 0.07783 |
| Head ahead of pelvis | 0.09686 | 0.17244 |
| Knee ahead of anatomical hip | -0.00992 | 0.12601 |
| Ankle below anatomical hip | -0.07700 | 0.29371 |
| Ankle below knee | 0.00093 | 0.10713 |

Corrected anatomical hip `(y=.943706,z=-.105040)`, knee
`(y=.757130,z=.020974)` and ankle `(y=.650000,z=-.200000)` establish a
forward/downward thigh and a descending calf. The native knee bend is 1.662
radians. These measurements describe this rig; they are not Nintendo values.

## Regression and rendering

`crab-rider-direction-20261030.test.mjs` uses the loaded production source
controller and actual Actor update. It checks signed chest/head/hip/knee/ankle
relationships while moving and turning at 30/60/120 Hz, keeps both hands at the
device grips, and checks pause. A negative control runs the previous
calibration through the same actual skeleton and confirms that it fails the
new directional criteria. The earlier rider suite now also checks knee versus
hip and ankle height, replacing the inadequate knee-versus-foot assertion.

```sh
node --experimental-vm-modules --test --test-name-pattern='Crab|previous high' patches/splatoon3/tests/crab-rider-direction-20261030.test.mjs patches/splatoon3/tests/special-rider-motion-20261030.test.mjs
```

Result: **7/7 passed** (the new four cases and the updated three existing Crab
cases). Maximum actual hand-hole-to-grip residual during movement was
6.81e-16 world units. The old calibration failed both signed knee and ankle
height criteria in the negative control.

The normal and chassis-hidden front/side views were rendered from candidate
build `62b4b3dc8d2a`, and inspected by both the motion and verification lanes:

- `/workspace/actions-verify-evidence/crab-direction-candidate/crabTank-60-0500-front.png`
- `/workspace/actions-verify-evidence/crab-direction-candidate/crabTank-60-0500-side.png`
- `/workspace/actions-verify-evidence/crab-direction-candidate/crabTank-60-0500-front-chassis-hidden.png`
- `/workspace/actions-verify-evidence/crab-direction-candidate/crabTank-60-0500-side-chassis-hidden.png`

They show the torso and thighs bending forward, with ankles below the hips and
knees. The hull obscures the feet in the normal view, so contact with a specific
internal footrest is not established. Browser images are a visual check of the
procedural asset, not an on-console parity measurement.
