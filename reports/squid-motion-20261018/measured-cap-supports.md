# Measured cap, pupils and compact-support retarget

Preserved baseline: 7b440133ba1e775713ceb7e9c31e79eb04a46860 (native run39140648053, all200 PNG digests verified). The connected eye field was confirmed, but raised short-support protrusions and the long lower mantle were rejected in visual review. User feedback also required measured pupil and cap correction.

## Reference measurement

Whole-model images were kept at one scale per image, normalized by cap width, without independently resizing eyes or arms. Manual pixel landmarks have uncertainty: approximately10px in the supplied figure photograph and3–5px in the gameplay frames. The photograph is a structural reference, not gameplay or a lighting reference.

| Projected ratio | User figure | Nintendo3.2s (3.3s confirmation) | Previous unposed actual geometry |
|---|---:|---:|---:|
| cap width / white-field width | approximately2.3 | approximately2.1 |1.873|
| pupil-center spacing / cap width | approximately0.18 | approximately0.19 |approximately0.27|
| pupil width / height | approximately0.9 | not inferred due occlusion and pitch |approximately0.62|

Sources: https://www.nintendo.com/jp/switch/av5ja/assets/images/index/movie/ikahito_pc.mp4 (3.2/3.3s), plus https://www.nintendo.com/jp/games/feature/splatoon/assets/mov/ika.mp4 for independent movement/club references. Original video hashes are in connected-shape.md. The figure was supplied by the user on2026-10-18 at15:11 UTC. The Nintendo view is oblique gameplay, not overhead. Pose and projection differ, so these ratios are not asserted as exact3D dimensions. The new frontal geometry ratio is a bounded candidate informed by the frontal figure and directional agreement across gameplay frames, not an exact fit to the oblique2.1 projection.

## Bounded shape correction

- The actual cap width grows from0.40747 to0.46675m; unchanged white-field width0.21759m gives ratio2.145. Upper profile rises from0.375 to0.455m with rounded shoulder interpolation. The lower face and arm semantic IDs remain intact.
- Squid-only pupil centers move inward from±0.45 to±0.34 in field coordinates; radii change from(0.24,0.72) to(0.25,0.46), with vertical center0.35. A common authored y coordinate replaces per-column stretched UV height, preventing an analytic oval from turning pear-shaped on the curved field. This reduces excessive tall/outer ovals. Human material remains unchanged.
- The lower mantle closure rises from−0.034 to+0.006m, reducing the block below the eye field. Long attachments rise0.025m and short supports0.035m; all remain actual geometry changes, not camera compensation.
- Compact short supports opt into source-chain rest-frame retargeting. Exact Jump5 tracing showed upper-middle rings, not roots, escaping the mantle; delaying the waist/leg blend alone failed idle because the original leg pivots were far from the shortened authored supports. The final tagged path maps source rest/pose frames to the actual authored centerlines, preserving source angles, clip clocks and long-arm behavior.

## Gates

Actual posed CPU triangle views reproduce the rejected old spike and show its removal in the combined candidate. These are structural diagnostics, not native rendering evidence. The visible-support audit checks upper-ring occlusion plus visible central tips across three LODs and13 poses, including idle. A missing-retarget negative control fails on real Wait15 support length, rather than a source-string assertion.

Analytical camera coverage swept564 actual actor frames and100 cases; worst NDC extent remains0.7733584563, minimum margin22.664%. Native exact-head source/emitted tests and paired100+100 images are still required. Broad source fidelity, inherited long-arm idle spread and reference camera differences remain limits; no exact S3 reproduction claim.
