# Squid gaze ownership and frontal shoulder relationship

This candidate follows the user's specific report of left/right pupil asymmetry. It is not accepted from source tests alone; exact-head native captures must confirm it.

## Reproduced pupil cause

The source-loaded Actor carries human `uLook = [-0.22, 0.1572543176]` into squid form. The previous squid shader clamps this to `[-0.16, 0.1572543176]`, translating both paired pupil ellipses upward and leftward. Because the white field has curved boundaries, the translated pupils clip differently. Neutral rest-front native imagery is symmetric; the geometry mirror error is 19.3 micrometres and UV error 0.0000113. Actual Sqd_Jump frame 11 has nearly symmetric geometry but retains the same stale human gaze.

The squid-only painted pupil shader now has neutral authored centers, without reading or changing human `uLook`. It retains the existing paired size, position, white field and outline. Source head animation remains active, including legitimate whole-head tilt. Tests compile the actual material under three human gaze values, require identical squid shader code with no gaze binding, preserve the human uniform values, and check mirrored paired signed distances.

## Separate frontal shoulder measurement

The supplied purple figure is a frontal structural reference, not a gameplay capture or lighting target. Measured figure shoulder-to-white-field-center displacement is approximately 0.0295–0.0881 of full cap width. The prior unposed model measured 0.2566. The candidate lowers lateral shoulders while preserving cap width: 0.0659, with apex-to-shoulder height / width 0.5839. Frontal and side CPU construction checks precede native acceptance. No exact 3D dimension is inferred from the oblique Nintendo footage.

The cap update does not change the authored arm roots or eye field/pupil parameters. The 564-frame CPU camera sweep covers all 100 native cases with a minimum 22.66% normalized screen margin. Existing 11 source tests passed before the gaze-only change; the final combined source and emitted tests must pass again.

References: user-provided 1000001384.png; Nintendo https://www.nintendo.com/jp/switch/av5ja/assets/images/index/movie/ikahito_pc.mp4 (SHA256 ae44ee55e679ca2b17a6c6d10552c61364076c77c56ddfda6797130bb9914e99), especially 2.9–3.4 seconds; Nintendo https://www.nintendo.com/jp/games/feature/splatoon/assets/mov/ika.mp4 (SHA256 b800628c57f15edf5e250d95d3b3337418ad40bb3644237ae9a38be01467c038).
