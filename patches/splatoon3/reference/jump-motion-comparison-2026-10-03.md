# Ordinary kid jump comparison — 2026-10-03

The additive [jump module](../runtime/jump-motion.mjs) selects an ordinary
airborne leg-pose profile for each of the seven weapon kinds in the current
public profile. Five kinds select a named family candidate from a public
resource-name index; Charger and Blaster use its shared Normal candidate. The
poses are distinct **local INKWAVE calibration** on the actual public
Character. Public names do not prove which retail clip plays or reveal its
joint curves. Native takeoff extension, descent reach, landing, weapon hold,
squid actions, specials and dodge retain their existing owners.

The original shooter-pose comparison was based on
`5cdc815c923e2e6e0a9860bcfec6a4734a089657`; this #1116 continuation updates
the runtime, focused native-source test, this comparison, README and shared
behavior report. `inkwave-public/` is the comparison target and remains
unchanged; `game/` is not used.

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
| J01 | Frames 222–246 above: both shoes behind the knees in an aimed shooter hop | `inkwave-public/src/game/character.js::_poseAir`, standing tuck assigns ankles forward (`z` to .07/.04). Keep shooter firing, trigger ordinary jump, inspect apex from the side. | Native silhouette reads as a forward knee tuck. The additive hook now selects an INKWAVE-local profile by current weapon kind and adjusts only the six foot position/rotation components per leg. The shooter clip supports that observed silhouette only; it is not evidence for other families' curves. Native two-bone IK and skinned geometry apply the local poses. | Shooter silhouette observed; all local family values are INKWAVE calibration; S3 family curves and hardware parity unverified. |
| J02 | Same stationary aimed hop supplies the common shooter silhouette; it does not show a running takeoff | Native `trigger('jump')` captures `jumpRun`/`jumpLead`; `_poseAir` drives a long opposing leg split and swaps the legs as vertical speed falls. Run, jump and inspect rising/apex/falling poses. | Each selected local family profile uses the existing launch, rise, apex, descent and ground-reach envelopes. No new family timing or physics is introduced. | Local CPU presentation tested; original per-family running variants and parity remain **unverified**. |
| J03 | Frames 210 and 258 visibly differ from the apex pose; unpublished launch/landing curves are unknown | Native launch envelope and ground-distance descent reach in `_poseAir` already distinguish these phases. | Reuse these envelopes; correction weight is zero in the initial extended push-off and yields as ground reach/long fall take over. `land` and grounded updates cancel the private jump state. No landing hook is replaced. | Existing timing retained, original exact timing unknown. |
| J04 | Public resource names do not establish runtime selection, family curves, carry, long-fall, ledge, slope or transform variants | `jump-motion.mjs` snapshots the weapon kind at `trigger('jump')` and selects its local ordinary-jump profile from the presentation layer. Reproduce with no-fire jumps for each current profile kind. | All seven current weapon kinds now select a pose: Shooter, Roller, Dualies, Slosher, Splatling, or a shared local Normal fallback for Charger/Blaster. Firing/charge weapon holds remain under `_poseWeapon`; action, form, death, hide, weapon-change, landing and special interruptions cancel the ordinary profile. | Local selector, pose-channel isolation, action cancellation and representative local/remote timeline parity are tested. Retail clip selection and joint curves remain unverified. |

## Implementation and verification boundaries

`installJumpMotion(api, profile)` wraps `_poseAir` after the native method. It
also observes `trigger`, `update`, `setWeapon`, `dispose` and `Actor.reset` to
maintain/cancel private WeakMap state. The captured family selects one local
foot calibration; its catalog candidate is diagnostic metadata and never a
loaded Nintendo resource. It reads `Character.t` for age and never
writes native clocks, world/root position, inputs, physics, resource counters,
weapon runner or native springs. A `Symbol.for` prototype guard makes a
duplicate install from another module realm harmless. It creates no meshes,
materials, listeners or timers; disposal releases its private state.

The runtime uses the already exported `FOOTL/FOOTR/FOOTLR/FOOTRR` and action
timer indices. No new adapter export is needed, and no private timer order is
guessed. `jumpMotionSnapshot(character)` exposes active/age/phase/weight,
selected family/profile, candidate name, local calibration source and an
always-false `referenceCurveVerified` marker; `s3JumpMotionEnabled=false`
provides the native comparison path. Install after existing motion hooks.

Run the focused suite:

```sh
node --experimental-vm-modules --test --test-name-pattern='#1116|ordinary input-driven jump' patches/splatoon3/tests/jump-motion.test.mjs
```

The suite loads the production installer in one VM realm with actual Actor,
Runner, Character, THREE and native IK. It verifies all seven currently
playable kinds on non-firing airborne jumps, six distinct local profiles,
Charger/Blaster shared fallback, weapon hold/charge channel isolation, action
cancellation, and exact local/remote profile playback for Roller and Charger.
The earlier 30/60/120 Hz fixed-clock and real-physics checks still cover the
shooter calibration and gameplay-state equality; they do not claim cross-rate
equality for every family. The suite also checks indexed skinned leg vertices,
posed ankle/knee bones, native clock preservation, weapon grip/reach, nullable
preview and cleanup. No test is a Nintendo hardware comparison.

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
variants, gear effects, weapon variants, actual clip selection and 11.3.0
hardware equivalence remain unknown. The comparison is linked from the shared
behavior report without closing any unverified S3 difference on CPU pose tests.


## Independent complete-installation review — 2026-10-03

Reviewed the frozen complete production candidate `d846b5b8fadd6cef86e7d02699cf9b3b7356b80e`. All fourteen new
motion installers are present in `runtime/install.mjs`; the tests load that
installer once in one VM realm. Repeated owned installer calls test idempotence
only. Earlier author receipts and measurements above describe their earlier
foundation composition and are historical evidence, not proof of this candidate.

Current primary pages and retained primary bytes were checked again before
correction. `/mnt/workspace/.dev-state/agent-work/evidence/inkwave-motion-detail-20261002/review-air/primary-source-review.json` records
current lookup URLs and verified retained byte hashes. The freshly decoded
`official-jump-reinspect.png` and `official-landing-reinspect.png` retain the
visible aimed hop, rearward bent legs and aimed knee absorption. Their source
frames and PTS are recorded in `primary-frame-reinspection.json`. Clip build,
gear abilities and controller input remain unknown; `11.3.0` is the profile
target, not a proven clip version. No numeric motion calibration changed in
this review. No original hardware, GPU shader/render, browser build or
exact-SHA Actions result is claimed by these focused CPU checks.

Current results, exact source/test hashes, commands and outstanding shared
work are in `/mnt/workspace/.dev-state/agent-work/evidence/inkwave-motion-detail-20261002/review-air/done.json`, `findings.json` and
`integration-handoff.json`. The parent owns the aggregate behavior report,
shared-file integration, complete build and browser/Actions verification.

Brief root/ancestor hiding now cancels the ordinary jump without requiring a
form change; successful native `Actor.splat` clears its private state immediately.
The old hidden regression also changed form, so it did not isolate hiding.
Fresh jumps after cancelled mapped Slam consult the public special lifetime
hook instead of inheriting orphaned leap/slam timer locks. Those timers are
never reset by this module.

A new input-driven test advances the production Actor, WeaponRunner and actual
Physics floor at direct 30/60/120 Hz. It observes real takeoff, apex and landing,
compares paired gameplay trajectories and native clocks, and checks drawn
indexed leg vertices and native limb IK. The earlier supplied parabola remains
a pose-envelope fixture only. Derived native head/tank spring feedback may
change with the drawn pose; tests preserve gameplay state and verify that the
air hook itself never writes spring/clock state. FixedClock tests still prove
identical output per 60 Hz tick, not variable-dt trajectory equality.


## Weapon-family presentation selection — 2026-10-09 (#1116)

**Comparison conditions.** Splatoon 3 Ver. 11.3.0 is the parameter-profile
target, not a verified build for every animation-name source. Weapon kinds are
Shooter, Roller, Dualies, Slosher, Splatling, Charger and Blaster from the
current `patches/splatoon3/profile.json`. The intended state is an ordinary
humanoid jump with no special, sub-aim, throw, flick, slosh or dodge active;
separate focused checks also hold fire/charge presentation during the jump.
Nintendo's public shooter demonstration above establishes only a shooter
silhouette. Local test actors use the default style with no configured gear
modifier. The reference clip's gear setup, button trace, Switch capture and
family joint curves are unavailable for this continuation.

**Resource and class evidence.** The public pinned
[animation-name index at Flexlion/flexlion.github.io @7740d29](https://github.com/Flexlion/flexlion.github.io/blob/7740d29fdded2899a7633e50647736e3723c5e9a/assets/animations.txt)
contains ordinary-jump candidates `Jump_Shtr00`, `Jump_Rllr00`,
`Jump_Mnvr00`, `Jump_Slsh00`, `Jump_Spnr00` and `Jump_Nrml00`, plus separate
`JumpShoot_*` names and `_St`/`_Ed` name forms. These strings provide resource
organization/class-state evidence only; they do not prove that a named clip
plays in a specific input condition, nor do they reveal FSKA or bone curves.
The class labels are cross-checked against public 11.3.0
[WeaponInfoMain data at Leanny/splat3 @7280ff9](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/mush/1130/WeaponInfoMain.json).
That table is class metadata, not animation evidence. The animation index does
not list family-specific ordinary-jump names for Charger or Blaster; the
presentation chooser maps both to its `Jump_Nrml00` candidate. Stringer,
Brella and Splatana names remain catalogued but are not selected because those
kinds are not present in the current INKWAVE weapon profile.

**INKWAVE implementation and effect.** `runtime/jump-motion.mjs` now captures
the weapon kind at the ordinary `jump` event and dispatches to a real local
pose profile in `_poseAir`: Shooter, Roller, Dualies, Slosher, Splatling or a
shared Normal fallback. Each profile changes only the existing foot pose
channels; launch, rise, apex, descent and ground-reach envelopes stay common.
The profiles are explicitly local calibration in the INKWAVE kid rig, not
Nintendo joint curves inferred from their names. The native weapon hold/charge
layer remains later in `Character.update` and is untouched. Existing action
owners and timers cancel the jump state, and remote Character playback uses the
same captured family selection on the same timeline.

**Reproduction and status.** Run
`node --experimental-vm-modules --test --test-name-pattern='#1116|ordinary input-driven jump' patches/splatoon3/tests/jump-motion.test.mjs`
(5/5 passed on the final test source). Tests exercise non-firing class
selection, visible local profiles, hold/charge channel isolation, action
cancellation and local/remote parity while retaining native IK, weapon grip
and gameplay-state checks. CPU tests show selection and ownership behavior
only. Browser/GPU rendering, actual S3
resource selection, original per-family joint curves, gear variants and Switch
hardware parity remain **unverified**. No movement, collision, jump timing,
damage, ink, weapon admission/cooldown or packet behavior was changed.

## Action-state catalog selection — 2026-10-10 (#1116)

**Source.** The pinned Flexlion animation-name index at
[@7740d29](https://github.com/Flexlion/flexlion.github.io/blob/7740d29fdded2899a7633e50647736e3723c5e9a/assets/animations.txt)
was re-fetched on 2026-10-10 (28,748 bytes). It lists `JumpShoot_Shtr00`–`02`,
`JumpShoot_Rllr00`, `JumpShoot_Spnr00` and `JumpShoot_Chrg00`–`02`, each with
`_St`/`_Ed` forms. No `JumpShoot_*` name appears for Dualies (`Mnvr`), Slosher
(`Slsh`) or the Normal fallback. Names alone do not prove playback, FSKA tracks
or any shot/charge-level mapping.

**INKWAVE implementation.** `runtime/jump-motion.mjs` tracks `input.firing` on
each airborne ordinary jump. The snapshot reports `actionState` (`ordinary` or
`firing`) and `selectedCatalogCandidates`. The firing state names the
`JumpShoot_*` candidates above for Shooter, Roller, Splatling and Charger.
Dualies, Slosher and Blaster keep their ordinary candidate, and Charger's
ordinary candidate remains `Jump_Nrml00`. Both states use the same local foot
pose profile, so the pose output is unchanged and `referenceCurveVerified`
stays false.

**Tests.** `patches/splatoon3/tests/jump-motion.test.mjs` passes 12/12, including
the new candidate-table and action-state tests. Neighbouring
walk-special-contact, bomb-motion, superjump-motion and squidroll-motion tests
pass 62/62. These are CPU rig checks only.

**Unverified.** Which `Jump_*` or `JumpShoot_*` clip actually plays for each
input; the Shtr00/01/02 and Chrg00/01/02 variant mapping; whether Blaster has a
firing clip (the `JumpShoot_Blower00` correspondence is not established);
per-family joint curves; whether a firing jump's legs should differ from an
ordinary jump; and Switch, GPU and browser parity. No movement, collision, jump
timing, damage, ink, weapon admission/cooldown or packet behavior was changed.
