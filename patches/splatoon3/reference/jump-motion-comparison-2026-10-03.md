# Ordinary kid jump comparison — 2026-10-03

The additive [jump module](../runtime/jump-motion.mjs) corrects the aimed shooter
jump's leg silhouette on the actual public Character. Both ankles now curl
rearward under flexed knees instead of adopting the native forward ankle tuck
or wide running split. Native takeoff extension, descent reach, landing,
carry jumps, other weapons, squid actions, specials and dodge remain with their
existing owners. All new dimensions and blending values are **visual
calibration**, not published Nintendo joint curves.

This lane is based on `5cdc815c923e2e6e0a9860bcfec6a4734a089657` and changes
only this comparison, the runtime module and its focused native-source test.
`inkwave-public/` is the comparison target; `game/` is not used.

## Fresh primary-source evidence

Retrieved and viewed Nintendo sources again on 2026-10-03 Asia/Shanghai
(2026-10-02 UTC). Evidence directory:
`/mnt/workspace/.dev-state/agent-work/evidence/inkwave-motion-detail-20261002/terminal-jump/`.

- [Nintendo Splatoon Base, shooter demonstrations](https://www.nintendo.com/jp/character/splatoon/fashion/index.html):
  fresh page identifies `js-media-shooter-3`, media ID `8zdjpAolrAy`.
  Its public [1080p HLS playlist](https://media-assets.apps-jp.nintendo.com/media/splatoonbase/0000856_955eca19961a8f26c06d9e4721ddd906_1080.m3u8)
  and [video segment](https://media-assets.apps-jp.nintendo.com/media/splatoonbase/0000856_955eca19961a8f26c06d9e4721ddd906_1080_00001.ts)
  were fetched freshly. The video is 1920×1080, 60 fps; its exact SHA-256
  is in `fresh-source-receipts.json` and `official-frame-pts.json`.
  Fresh embed access returned HTTP 403; no bypass was attempted. The retained
  previous embed was byte-verified, links that media ID to this stream, and is
  explicitly recorded as retained evidence in `prior-embed-verification.json`.
- [Nintendo Splatoon 3 product page](https://www.nintendo.com/jp/switch/av5ja/index.html):
  fresh `human-squid.mp4`, `top.mp4`, `turf.mp4` and overview sheets were
  inspected. They do not establish exact ordinary jump joint curves. The
  transform/swimming clip is not used to infer ordinary kid takeoff timing.

The shooter clip's side view shows a kid firing during a short ordinary hop:
initially extended legs, then both knees flexed with the shoes swept rearward,
then extension toward ground contact while the weapon stays aimed. The camera
pitch changes; these are silhouette observations, not recovered joint angles.
The original weapon is a long-barrel shooter; the exact variant is not named
in the clip and is not asserted here. Gear abilities, button/stick sequence,
game build and capture conditions are undisclosed. The comparison profile is
11.3.0, but the footage's build cannot be verified as 11.3.0.

`official-selected-frames.png` uses these exact decoded frame indices. PTS is
the stream presentation timestamp; relative time is measured from the first
video frame (PTS 2.069833), not from a presumed button press.

| Zero-based frame | PTS seconds | Relative seconds | Visible condition |
| --- | --- | --- | --- |
| 198 | 5.369833 | 3.300 | Before upward motion in the side view |
| 210 | 5.569833 | 3.500 | Rising, legs still comparatively extended |
| 222 | 5.769833 | 3.700 | Rising with both shoes behind flexed knees |
| 234 | 5.969833 | 3.900 | Near apex, both shoes rearward |
| 246 | 6.169833 | 4.100 | Descending, still bent with rearward shoes |
| 258 | 6.369833 | 4.300 | Returning toward the ground |

## Differences and correction

| ID | Original evidence | Public INKWAVE implementation and reproduction | Play effect and correction | Status |
| --- | --- | --- | --- | --- |
| J01 | Frames 222–246 above: both shoes behind the knees in an aimed kid hop | `inkwave-public/src/game/character.js::_poseAir`, standing tuck assigns ankles forward (`z` to .07/.04). Keep shooter firing, trigger ordinary jump, inspect apex from the side. | Native silhouette reads as a forward knee tuck. The additive hook adjusts only the six foot position/rotation components per leg, blending toward a rearward, softly asymmetric flexed pose while aiming. Native two-bone IK and skinned geometry apply it. | Original silhouette observed; new dimensions/curves visually calibrated; hardware parity unverified. |
| J02 | Same stationary aimed hop supplies the common flexed-leg silhouette; it does not show a running takeoff | Native `trigger('jump')` captures `jumpRun`/`jumpLead`; `_poseAir` drives a long opposing leg split and swaps the legs as vertical speed falls, including aimed shooter jumps. Run while firing, jump, inspect rising/apex/falling poses. | The aimed correction blends away from the wide split so both knees flex and shoes stay rearward through the apex. Capture of takeoff speed/lead and un-aimed running leap remain native. | Running application is visual extrapolation from the stationary aimed hop, **not verified original running-jump parity**. |
| J03 | Frames 210 and 258 visibly differ from the apex pose; unpublished launch/landing curves are unknown | Native launch envelope and ground-distance descent reach in `_poseAir` already distinguish these phases. | Reuse these envelopes; correction weight is zero in the initial extended push-off and yields as ground reach/long fall take over. `land` and grounded updates cancel the private jump state. No landing hook is replaced. | Existing timing retained, original exact timing unknown. |
| J04 | Fresh clips do not establish all carry, weapon-specific, long-fall, ledge, slope or transform variants | Ordinary carry jump, off-ledge falling, other weapon kinds and form/action layers have native behavior. | Gate correction to a fresh ordinary `jump` event, kid form and aimed shooter. Cancel on reset/death/form/sub aim/weapon change/special/Super Jump/dodge/throw/spawn/landing, including hidden-character interruptions. No inferred feature mapping is added. | Native gates regression-tested; original variants remain unverified. |

## Implementation and verification boundaries

`installJumpMotion(api, profile)` wraps `_poseAir` after the native method. It
also observes `trigger`, `update`, `setWeapon`, `dispose` and `Actor.reset` to
maintain/cancel private WeakMap state. It reads `Character.t` for age and never
writes native clocks, world/root position, inputs, physics, resource counters,
weapon runner or native springs. A `Symbol.for` prototype guard makes a
duplicate install from another module realm harmless. It creates no meshes,
materials, listeners or timers; disposal releases its private state.

The runtime uses the already exported `FOOTL/FOOTR/FOOTLR/FOOTRR` and action
timer indices. No new adapter export is needed, and no private timer order is
guessed. `jumpMotionSnapshot(character)` exposes active/age/phase/weight for
diagnostics; `s3JumpMotionEnabled=false` provides the native comparison path.
Install after existing motion hooks. Parent integration owns the production
import/call, combined build/browser checks and shared report updates.

Run the focused suite:

```sh
node --experimental-vm-modules --test patches/splatoon3/tests/jump-motion.test.mjs
```

The suite loads the unmodified production installer, then this additive module,
in one VM realm with actual Actor, Runner, Character, THREE and native IK.
It verifies indexed skinned leg vertices, posed ankle/knee bones, all other pose
channels, native clock preservation, actual weapon grip/reach, interruption,
nullable preview and cleanup. 30/60/120 Hz render intervals use the production
60 Hz fixed clock and produce identical complete pose/bone traces. This proves
production fixed-tick composition; it does **not** claim native variable-dt
numerical equality or Nintendo hardware comparison. Direct 30/60/120 Hz native
preview updates also verify the rearward apex silhouette and reachable IK
qualitatively.

`native-jump-trace.json` records before/after takeoff/rise/apex/fall/long-fall
samples, real bone quaternions/positions, indexed vertex coordinates, all pose
channels, native IK, body/root and weapon/muzzle transforms. `before-apex-*.svg`
and `after-apex-*.svg` project the actual posed indexed body/weapon triangles
on the CPU; colors/shading are diagnostic. They are not GPU screenshots.
Changing leg targets can change the native pelvis reach solver's small
settling offset and its consequent head/tank spring feedback. Tests check that
the hook itself never writes those states, preserve all non-leg pose channels,
and retain actual weapon grip and aim stability through native application.
The sampled before/after traces have zero native IK residual and a maximum
world muzzle displacement of `0.0000468134` native units. These are engine
measurements, not Nintendo values.

The original's exact joint curves, blend timings, running/strafing/backward
variants, gear effects, weapon variants and 11.3.0 hardware equivalence remain
unknown. Parent should link this comparison from
`reports/inkwave-splatoon3-behavior-2026-10-02.md` without closing P04 or other
unverified gameplay differences on the strength of CPU pose tests.
