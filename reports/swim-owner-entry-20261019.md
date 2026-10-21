# Swim presentation owner initialization, 2026-10-19

## Status and exact scope

Candidate, not merged or visually accepted. Base main `b75bc56e2e3fa970357b3bc92f63395c7c397353`. Only the initial `yaw` inside `swim-motion.mjs:makeState` changes. The already allocated world quaternion is reused to obtain the current native/source pivot's local +Y mantle axis in world space. Its horizontal heading initializes the new presentation state; a nearly vertical axis retains the previous fallback. No new per-frame object, solver, geometry, source animation or movement parameter is added.

The earlier bank-axis experiments are excluded. They demonstrate that Euler Z under YXZ pitch 90 degrees changes heading, but moving its full amplitude to a longitudinal roll could introduce approximately 35 degrees of new banking. There is no primary measurement supporting that change. Source-heading PR1674 and Rainmaker PR1668 are separate candidates; neither runtime is included here.

## Reference and limits

Nintendo's [Japanese introduction](https://www.nintendo.com/jp/switch/av5ja/index.html), its [human/squid demonstration](https://www.nintendo.com/jp/switch/av5ja/assets/images/index/movie/ikahito_pc.mp4), and the [English gameplay introduction](https://splatoon.nintendo.com/en/gameplay/) support the ordinary submerged/surface-swim distinction. The saved 2026-10-03 research did not measure a retail bank curve, joint angles, or turn smoothing. Weapon: Shooter host fixture, default gear, flat own ink, no firing. The update fixes an INKWAVE presentation-owner discontinuity; the numeric gates are internal continuity checks, not claims of Nintendo-exact animation.

## Reproduction and cause

After 60 stationary warmup ticks, hold squid plus normalized mobile moveX=-0.02 through the actual PlayerController, Actor.update and Physics at 1/60 second per simulation tick. At tick28 the ordinary swim owner becomes eligible after the preserved 0.45-second form gesture. On tick29 its old `ch.yaw + ch.sqYaw` initialization targets a stale native accumulator even though the source owner had already drawn a different heading. A one-tick `s3SwimMotionEnabled=false` at tick71 reproduces the same mismatch at reentry72→73. The forced invalidation is diagnostic; the first-entry sequence uses normal input only.

Base b75's actual skinned mantle steps are -0.5538055412 and -0.5507639154 radians. Candidate steps are -0.0018386376 and +0.0016154081. Entry yaw agrees with the actual source bone chord and CPU-skinned mantle heading within 2.22e-16 radians in the sampled entry conditions. This measures skinning and source bones, not rendered pixels or the GPU-only native tentacle shader.

## Side effects and denominators

- b75 normal mobile consumer: the full 73-tick canonical source/physics trace SHA256 is unchanged (`ec2f5dcf305aa4ec0381fd5abe9c1f7b661fc2690c2837909652d3ced14e0294`). Global LCG calls=4544 and full value-stream SHA256 `618caff7d09cac95d4b68acf864021c861b1ae9c2dc93d4ad56ef599a53a9047` are identical.
- On fixed main00b, main/source-heading-v3 each run local296 + remote dry301 + remote submerged301 ticks, 1796 old/new paired ticks total. Physics, source bone local matrices (matrixAutoUpdate=false), squidPose p/q/s/world/wp, renderedPose, source state and global call counts are identical. The earlier local-TRS-only hash was insufficient to establish source deformation preservation; these matrix/buffer comparisons replace that limited evidence.
- Local stop, reverse, one-tick invalidation, hidden/show, dt0 and two-tick human→resubmerge are covered. Next-frame reentry skin steps fall from approximately .542/.552/.325 radians to .00313/.000322/.00209. Remote flags23 (alive+squid+submerged+grounded) uses real NetMatch.applyRemote without sending packets; micro-correction reentry .457147 becomes approximately .000005 radians. Flags19 dry-squid stays ineligible. Remote applyRemote makes a hidden living actor visible again, so the hidden-control assertion is local-only.
- Existing swim suite: 13/13, including duplicate installation, dt0, fixed-clock 30/60/120 render cadence, preview cadence, gameplay and lifecycle. The additional steady/turn/reverse probe has 2160 fixed simulation ticks per variant across source on/off and 30/60/120 render rates; physics is unchanged. This is not 2160 ticks at each rate.
- Direct Actor dt1/30 is a separate preview-style diagnostic, not the production 30fps path (production uses 1/60 FixedClock ticks). With source-heading-v3 and full input, its first skinned step changes from -.10121786 to -.11456969 radians. Thus the correction is not claimed to reduce every full-speed turn step. Remote initial full-speed step .39278086→.02286303 also retains a normal smoothed-turn residual.
- Independent review reproduced first/reentry improvement with source-heading v3 present and absent, with physics and source-buffer parity. No native/emitted success is claimed from these CPU results.

## Native acceptance plan

Separate workflow `inkwave-swim-entry-qa.yml`, fixed baseline b75 and the new exact candidate, two shallow checkouts. Both production builds use the same candidate harness. Twelve original900×900 PNGs per side, 24 total: first-entry28, first-follow29, reentry72, reentry-follow73, each front/oblique/top. Same input, camera, light, source phase, geometry/material owners and canonical source/physics SHA are required. Baseline follow steps must exceed .5rad; candidate must stay below .01rad. Source flags are strict booleans. RNG count and full value hash are compared. All artifact/build hashes and loaded-module allowlists are verified. No live match, native images or continuous-motion acceptance yet.

The native images must show that the measured correction corresponds to the drawn mantle without new clipping or body discontinuity. The source main/v3 CPU comparisons are separate from this main-only native comparison. Full-speed turning, bank-axis fidelity, retail calibration and unmeasured slopes remain unaccepted by this small24-image suite.
