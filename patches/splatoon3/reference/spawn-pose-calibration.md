# #879 — INKWAVE original spawn-presentation calibration

## Scope and evidence boundary

This implements weapon-family selection and a dedicated respawn presentation. It does **not** claim recovered Nintendo joint angles or measured Switch frame curves. Issue #879 explicitly permits a measured S3 timeline **or clearly documented calibration provenance**. We use that latter route. The original trajectory/landing-target issue #273 is unchanged.

The [Spawner screenshot gallery](https://splatoonwiki.org/wiki/Spawner#Gallery) documents distinct equipped-family presentations. On 2026-10-07 we inspected the Roller, Charger, Slosher, Splatling, Dualies and Blaster thumbnails. The Shooter gallery entry exists, but the Shooter thumbnail did not load. Shooter targets below are therefore an original pose based on this repository's native compact two-hand carry, not a visually measured Nintendo Shooter target.

Direct inspected screenshots (reference only, not redistributed):

- Roller: https://cdn.wikimg.net/en/splatoonwiki/images/thumb/d/d7/RollerSpawnPose.jpg/94px-RollerSpawnPose.jpg
- Charger: https://cdn.wikimg.net/en/splatoonwiki/images/thumb/6/66/ChargerSpawnPose.jpg/91px-ChargerSpawnPose.jpg
- Slosher: https://cdn.wikimg.net/en/splatoonwiki/images/thumb/7/72/SlosherSpawnPose.jpg/85px-SlosherSpawnPose.jpg
- Splatling: https://cdn.wikimg.net/en/splatoonwiki/images/thumb/8/81/SplatlingSpawnPose.jpg/95px-SplatlingSpawnPose.jpg
- Dualies: https://cdn.wikimg.net/en/splatoonwiki/images/thumb/d/df/DualiesSpawnPose.jpg/74px-DualiesSpawnPose.jpg
- Blaster: https://cdn.wikimg.net/en/splatoonwiki/images/thumb/6/66/BlasterShooterSpawnPose.jpg/81px-BlasterShooterSpawnPose.jpg

Static pictures do not establish a continuous timeline, recording version, camera-corrected joint positions, or an armor duration. No such facts are inferred.

## Rig-space choices and timeline provenance

Native carry already owns each weapon, elbow pole and hand-to-anchor IK. Offsets in `runtime/spawn-pose-motion.mjs::SPAWN_POSE_CALIBRATION` adjust that carry **before** the one native IK solve. `ANC/ANL` translations are native rig units; `ANCR/ANLR/SPINE` angles are radians. Foot offsets are rig units. The left target is not dragged to the floor (`LTW=0`). The Slosher has an optional handle target but native `wTwo` disables that supporting grip; its free-arm ownership is preserved and tested rather than forcing it into two-hand carry.

All numbers below are original design choices, not extracted S3 values. They use the existing 60-Hz `T_SPAWN` clock, a smoothstep entry, and smoothstep return. Entry takes 4–7 simulation frames; asymmetric heavier-weapon poses have longer holds/returns. Offsets are deliberately small because the underlying carry provides the family silhouette and weapon grip; maximum individual anchor displacement is 0.05 rig units. Offsets were bounded by actual native IK regression throughout the complete timeline: required hands stay within 0.035 rig units of their native grip anchors. They are not fitted to unseen video frames.

| Family | Visual cue / original-rig adaptation | Start | Peak | Recovery starts | Released |
|---|---|---:|---:|---:|---:|
| Shooter | Original compact native two-hand carry; small raised/retracted anchor and left-foot lift | spawn event | 5F | 13F | 29F |
| Roller | Gallery-inspired chest/shoulder support, mild torso counter-turn and right-foot lift | spawn event | 6F | 16F | 32F |
| Charger | Gallery-inspired long-weapon chest hold, opposing torso/weapon yaw and staggered left foot | spawn event | 5F | 14F | 30F |
| Slosher | Gallery-inspired low forward container, torso lean and right-foot asymmetry | spawn event | 5F | 13F | 28F |
| Splatling | Gallery-inspired braced heavy-weapon pose with higher left knee and longer hold | spawn event | 7F | 17F | 34F |
| Dualies | Gallery-inspired independent raised/spread pistols; mirrored native left/right anchors | spawn event | 4F | 12F | 28F |
| Blaster | Gallery-inspired lowered/retracted front-heavy carry, opposite torso counter-turn | spawn event | 6F | 14F | 30F |

Exact numerical channel offsets are the frozen runtime table, avoiding a second independently editable copy. Peak states differ from ordinary airborne carry in actual indexed skinned body vertices, not just a diagnostic state token.

## Authoritative ownership and integration

The state starts only on `Character.trigger('spawn')`, already emitted by actual `Actor.respawn()` and transmitted through NetMatch's timestamped `tr` events. An ordinary jump or airborne actor cannot synthesize a spawn. The captured native `weaponKind` selects the family; ordinary weapon changes cancel rather than restarting a different class halfway through.

The clock is necessary for interpolation, but not sufficient to own the pose: grounded, dead, hidden, squid, reset, weapon change, firing, charging, sub aim, rolling, dodge, special and superjump transitions release it. Landing hands control straight back to ordinary stance/locomotion. A finite calibrated end is a failsafe for a missing landing event. Losing/breaking armor does not cancel an otherwise live spawn. The prior hit/spawn material/coating layer is unchanged.

Remote and local actors use the same hooks, native weapon identity and native timer. No new packet field or per-render local timer is added. Existing fixed-clock 30/60/120-Hz render tests compare all 60 authoritative samples, not just final times.

## Validation and remaining fidelity limits

Tests use the real composed S3 installer, Actor, Character, indexed native meshes, native skinned vertices and IK. They verify distinct family states and pose data, both required hand grips throughout the timeline, lifecycle cancellation/restart, unchanged gameplay/root/velocity/armor state, remote event delivery and fixed-clock boundaries. Physics integration is fixture-controlled to isolate the pose; these tests do not validate #273's real launch trajectory.

The public full WebGL game and Switch footage comparison are not claimed. A Chromium preview was attempted locally: HTTP navigation was blocked by the environment, and an entirely in-memory module-load attempt reached WebGL creation but the available GPU/context could not initialize. CPU mesh checks are separate from GPU image validation. Exact per-joint/pixel and Nintendo start/peak/recovery matching remains unmeasured.
