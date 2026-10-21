# Ink micro-surface experimental candidate — 2026-10-21

Base: c72dd6da46f53f3ea931e0263885685172bb12e9.

Hypothesis only: reduce existing gel micro-normal amplitude by 25%, consistently in actual texlib and fallback. This may reduce fragmented highlights. No claim of retail fidelity until reference image review. Film height, paint mask, coverage/ownership, colors, coat/roughness, lights, wake/ripple behavior, geometry and texture count remain unchanged. No projectile or character changes. Protected input files are unchanged.

The current INKWAVE range uses outdoor daylight and sky PMREM. The currently observed Splatoon 3 reference https://www.bilibili.com/video/BV1zW4y1e7de/ at 00:55 and 01:11 is an indoor practice range. Its elongated ceiling-light reflections cannot be recreated by adjusting material color or roughness under an outdoor sky. This candidate is NOT judged against those mismatched light conditions.

CI captures real successive frames of emitted production material + actual texlib under the existing production Environment daylight. Left original, right candidate; floor and wall, fresh and settled, two team colors. Fallback is separately rendered. Fixture atlas is synthetic and fixed, not a recorded Nintendo paint mask. It is a shader diagnostic, not a full gameplay scene. Source tests assert the entire shader is unchanged except the two amplitude constants; composed output must retain 4 mm film correction.

Performance: separate image and timing passes; 8 ABBA blocks record CPU render submission and synchronous GL queue completion. These are software-browser diagnostics, NOT physical GPU or frame pacing. GPU time, per-frame allocation and full game CPU/GPU/frame overhead are currently unmeasured. Equal draw/resource counts are necessary but do not establish the user's few-percent budget. Adoption remains pending retail reference review and suitable workload performance evidence. CI failure is not a passing acceptance.

Before merge: inspect same-head receipt and actual frames; compare with an appropriate outdoor retail reference, or explicitly calibrate a separate indoor diagnostic fixture without modifying production lighting. Reject or revise if the candidate loses relevant wet-film detail. Do not mark the request complete solely because CI passes.
