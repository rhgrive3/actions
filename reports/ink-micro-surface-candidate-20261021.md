# Ink micro-surface experimental candidate — 2026-10-21

Base: c72dd6da46f53f3ea931e0263885685172bb12e9.

Hypothesis only: reduce existing gel micro-normal amplitude by 25%, consistently in actual texlib and fallback. This may reduce fragmented highlights. No claim of retail fidelity until reference image review. Film height, paint mask, coverage/ownership, colors, coat/roughness, lights, wake/ripple behavior, geometry and texture count remain unchanged. No projectile or character changes. Protected input files are unchanged.

The current INKWAVE range uses outdoor daylight and sky PMREM. The currently observed Splatoon 3 reference https://www.bilibili.com/video/BV1zW4y1e7de/ at 00:55 and 01:11 is an indoor practice range. Its elongated ceiling-light reflections cannot be recreated by adjusting material color or roughness under an outdoor sky. This candidate is NOT judged against those mismatched light conditions.

CI captures real successive frames of emitted production material + actual texlib under the existing production Environment daylight. Left original, right candidate; floor and wall, fresh and settled, two team colors. Fallback is separately rendered. Fixture atlas is synthetic and fixed, not a recorded Nintendo paint mask. It is a shader diagnostic, not a full gameplay scene. Source tests assert the entire shader is unchanged except the two amplitude constants; composed output must retain 4 mm film correction.

Performance: separate image and timing passes; 8 ABBA blocks record CPU render submission and synchronous GL queue completion. These are software-browser diagnostics, NOT physical GPU or frame pacing. GPU time, per-frame allocation and full game CPU/GPU/frame overhead are currently unmeasured. Equal draw/resource counts are necessary but do not establish the user's few-percent budget. Adoption remains pending retail reference review and suitable workload performance evidence. CI failure is not a passing acceptance.

Before merge: inspect same-head receipt and actual frames; compare with an appropriate outdoor retail reference, or explicitly calibrate a separate indoor diagnostic fixture without modifying production lighting. Reject or revise if the candidate loses relevant wet-film detail. Do not mark the request complete solely because CI passes.

## Expanded diagnostic acceptance
The final capture separates floor views near the actual production sun-reflection direction from an off-highlight view, and lit wall (-Z) from unlit wall (+Z). Actual world normals, sun/view directions and angles are recorded. Shadow-side lack of highlights is not evidence of low gloss. Sixteen cases cover texlib/fallback, floor/wall, these two viewing conditions and fresh/settled atlas values.

Positive controls require visible surface and paint signals, nonzero candidate sensitivity for texlib, and a single two-triangle surface draw. Actual invisible-mesh and disabled-gel controls must be rejected as insensitive. A nonzero difference proves only that the experiment is active, not improvement.

Eight ABBA blocks (32 individual samples per case) produce paired CPU submit, GL queue drain and combined diagnostic medians, MAD, minimum and maximum. Quantized zero baseline times are recorded and excluded from percentage summaries rather than divided by zero. This is not physical GPU/FPS or a whole-game 3% acceptance.

Eight videos each contain exactly 24 successive rendered frames at 30 fps (0.8 s, 960x360). All PNG names, signatures, dimensions and hashes plus ffprobe-decoded frame count/rate/duration/dimensions and video SHA-256 are verified and bound to the render receipt/source SHA. These are actual sequential material/camera frames, not interpolated images or gameplay recordings.

Outdoor retail reference supplied and viewed by the parent: https://assets.nintendo.eu/image/upload/c_scale%2Cf_auto%2Cq_auto/v1660177274/NAL/Migration/Splatoon3/Aug-10-Update/Splatoon3_Overview_Splatted_Carousel_Scr_03.jpg (official Nintendo Australia page). Parent observed broad smooth ink fields and localized elongated white highlights. This still image has no known fresh/settled timing. The historical 2026-10-17 no-PMREM fixture does not establish excess bumpiness. No candidate adoption has been inferred from either observation.
