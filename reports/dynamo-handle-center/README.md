# Measured Dynamo handle alignment

Base: immutable main `5ed08c6376696dd67391afed7c36463106959de8`. Target: Splatoon 3 standard Dynamo Roller (`Wmn_Roller_Heavy`), not Gold/Starz. Procedural code geometry only, no imported model and no Blender.

## Measurement before modification

Source: [S3 Dynamo turntable](https://splatoonwiki.org/wiki/File:S3_Dynamo_Roller_model_rotating.mp4), [standard-kit render](https://cdn.wikimg.net/en/splatoonwiki/images/5/5e/S3_Weapon_Main_Dynamo_Roller.png). Video SHA-256 and manually digitized endpoints are in `measurements.json`. The 0s front and 6s rear frames were rotated to level the drum axis and overlaid with a 50px grid. Their handle-axis intersection lies at 54.03% and 48.14% of the projected drum width. These are projected pixel ratios, not camera-calibrated 3D dimensions: endpoint reading, perspective and non-coplanar parts remain. The 3.5s near-axis view checks depth ordering, not width. Image darkness is not used as a material estimate.

In the model, the physical handle centreline is X=0, whereas the 1.821-wide drum was centred at X=-0.37. The offset is exactly 20.3185% of width, independent of camera; the source opposite views support a near-midline shaft rather than this large displacement. The requested correction sets the visual drum centre to X=0: offset 0.37 → 0. The gear/bearing ends and top guard follow the same axle coordinate, while the cross rod extends from its unchanged clamp to the repositioned gear.

## Scope and invariants

- Only the Dynamo visual axle X placement changes; no palette, material or topology changes.
- Physical grips remain `[0,0,-0.022]` and `[0,0,0.14]`. Derived palm/IK frames remain byte-identical; they intentionally include a palm offset and are not the physical shaft centreline.
- Fold pivot `[0,0,0.88]`, drum radius 0.19, width 1.821 and spinning local drum/cap geometry remain unchanged.
- Logical muzzle `[-0.37,0,1.13]` is explicitly separated from the visual axle to avoid moving an existing gameplay/VFX socket.
- The central clamp still overlaps the cross rod at X=0.10…0.15; the rod reaches X=0.9405 and meets the translated gear link at X=0.9305. No hand frame is translated to compensate for the visual defect.

## Verification

Local source composition was assembled from immutable main blob hashes; upstream, patches and scripts all matched before applying the owned difference. Main's missing report images were not substituted with runtime code. Focused/all-65/hold/fold tests: 22 passed. A regression compares the old visual offset through the same source fixture to the candidate; all other 64 weapon geometry/attribute hashes and every weapon's sockets are identical. At 30/60/120Hz, real Actor/Runner projectile positions, velocities, damage, radius/lifetime, ink, cooldown, swing count and rolling states match the baseline. Grip closure, vertical fold and drum spin are exercised.

Dedicated exact-head CI additionally builds ordinary production compositions for pinned main and candidate, repeats emitted tests, and captures same-camera front/back/side/axle/oblique images under supported 1024×512 equirectangular PMREM (cube256) and the native day Environment. Real source-motion Actors are captured from front/back/both sides during carry, horizontal windup, roll, vertical fold/release and recovery. A native high Renderer/GTAO/bloom/grade screenshot is included in an isolated Actor scene; this is not a complete live stage or device-performance measurement. The known-invalid 32×16/cube8 gallery IBL is not used.

Local Chromium launch is blocked by socket EPERM, including the supported escalated retry; the cloud browser cannot reach this task's local HTTP server. Browser evidence and general CI therefore remain pending until the GitHub job results are inspected. This draft must not be treated as merged or deployed.

## First emitted evidence and harness correction

At source head `c8a7723`, the dedicated job passed both source and emitted tests and captured real source-motion Actors: before/after maximum grip error 0.000295856m, maximum fold 1.8326rad and accumulated spin 37.7410rad are identical. Static `d.body`/`d.ink` already include hinge/hingeInk via native finishParts; parts are not added twice. The studio/native direct-render captures are usable, but the first final post screenshot improperly reused a PMREM from a different WebGL renderer and is rejected as post-stack material evidence. The corrected harness creates a separate native Environment on the production Renderer itself. Both immutable sides also use a wider common orthographic frame (half-span 1.5) so the old off-centre end cap cannot be clipped.

The existing source model's cross rod is partly occluded by the drum at both revisions; the reference transmission housing is offset behind the source drum axis, whereas this procedural main model uses a coaxial housing. That pre-existing full-frame proportion/placement difference is outside the requested lateral centering correction. This patch does not claim complete original-model fidelity or invisibly retune those other dimensions.
