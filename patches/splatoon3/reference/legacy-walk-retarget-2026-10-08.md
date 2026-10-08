# Splatoon 1 gait-reference retarget — INKWAVE #1083

**Source:** User-provided original Splatoon (Wii U) `Player00_anim.szs` (5,125,804 bytes; matching public Git blob `bc1e93b58eeeab3b12606df1d492bf07ac208ef7`), decoded Yaz0 → SARC → BFRES FSKA. This is **not Splatoon 3 motion data**, and the in-game animation playback-rate function has **not** been identified. No original game assets are shipped in this change.

## Source-supported facts

| Human-form source clip | Frames | Loop |
| --- | ---: | --- |
| `Walk`, `WalkHold_Nrml`, `WalkBackHold_Nrml` | 40 | yes |
| `WalkLeftHold_Nrml`, `WalkRightHold_Nrml`, `WalkShoot_Nrml` | 40 | yes |
| `Run`, `RunHold_Nrml`, `RunShoot_Nrml` | 32 | yes |

The left/right thigh rotation-X curves for `Walk` are displaced by approximately 20 of the 40 source frames (and 16 of 32 for `Run`). A source loop's stored number of frames is **not** a measured cadence at any particular gameplay speed.

`legacy-walk-curves.mjs` stores **relative**, per-clip-mean-centered Euler channels, resampled at every second source frame and quantized to signed milliradians. Channels are hip XYZ, root XYZ, thigh L/R X, shin L/R X, foot L/R X, upper-arm L/R Y. This is a compact, retargeted *numeric reference* and does not contain the Nintendo meshes or the original SZS/BFRES assets.

## What the runtime does

1. Samples the 40F directional forward/back/left/right legacy references against **one existing Character gait phase**, blending at arbitrary walking directions. A source 40F shooting clip contributes for aimed forward movement. The 32F weapon-held run and shooting-run clips blend in at higher speed without resetting that clock. The 32F generic run remains in the reference corpus for analysis.
2. **Removes the weak-diagonal over-cadence:** footfall cadence no longer divides by the lateral walk-stride-cut multiplier. The existing physically meaningful travel-speed/stride relation remains; the gait no longer cycles faster simply because the stick points sideways.
3. Adds bounded, mean-centered reference torso pitch/yaw/roll and small free-arm/shoulder counter-swing without taking over the weapon-hand IK or any action pose.
4. Adjusts a **swinging** foot's lift, forward travel and toe pitch by small bounded reference signals. Both offsets taper to zero at lift-off and touchdown; the existing planted-foot world lock, raycast, anti-crossing and analytic IK remain responsible for contacts.
5. Leaves Actor acceleration, gear, shot delays, movement input, fall damage, action ownership, projectiles and special timings **unchanged**.

The source rotation channels are never directly assigned as the INKWAVE model's rest-pose angles. Such an assignment would distort joint poses because the game rig and bind-pose definitions differ.

## Regression and visual verification

`patches/splatoon3/tests/legacy-walk-reference.test.mjs` covers:

- source provenance and exactly 40F/32F stored-cycle lengths;
- periodic continuity, direction-dependent clips, 45° blending, firing/run blends and separate held/shooting run;
- runtime weak-diagonal cadence matching same-speed forward walking;
- planted foot XZ stability and alternating swing of the real Character rig;
- backward, shooter and 30/60/120Hz finite simulation.

**Manual parity gate still required:** capture a normal humanoid in Splatoon 3 v11.3.0 on flat ground using an unmoving camera and compare forward/backward, 30°/45°/60° weak diagonal, sideways, firing, reverse, transitions between walk/run, and different weapons. Include the original game clip playback multiplier and actual 3D bind skeleton before calling the curves Nintendo-identical. #997 remains **open** until that end-to-end S3 comparison is available; this change is a source-guided improvement, not proof of full S3 parity.
