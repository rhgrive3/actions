# Continuous arm widening and ink surface candidate

Scope follows the user's remaining request: the way the two arms thicken into clubs, and the surface finish. Head, eye field, pupil centers, arm count, arm roots, source clips and lighting are preserved.

## Evidence and bounded geometry change

The supplied frontal purple figure has a progressively widening stem-to-club silhouette. Approximate left-arm image widths at y650/700/750/800 are 100/135/170/190 pixels (purple-color threshold R/G>1.13 and B/G>1.13 in x90–320; boundary-sensitive); these are two-dimensional photo observations, not game mesh dimensions. Nintendo ikahito_pc.mp4 at2.9–3.4s and the feature ika.mp4 jump sequence likewise show rounded continuous widening. Pose, foreshortening, resolution and the yellow background prevent exact common 3D radius recovery from those frames.

The current authored radius narrows until approximately30% of the arm before swelling rapidly. A localized smooth addition, 0.006*sin(pi*smoothstep(0.10,0.65,t))², starts and ends with zero slope. The root and the entire distal65–100% radius profile are unchanged. Radius at t=.30 rises0.02129→0.02522m; t=.40 rises0.02579→0.03152m. The peak stays0.05866918m at t=.6876. Maximum positive radius slope decreases0.15611→0.13872m per normalized arm parameter. These are authored function measurements, not direct screen widths. Actual generated rings and posed geometry are independently checked before native acceptance.

No additional segments, textures or materials are introduced. Hero underside cup samples are spaced by radius, so widening changes their sampling and removes98 triangles; distal shell preservation does not imply byte-identical underside cup buffers. Game/far topology remains unchanged. Existing short supports and semantic chain IDs remain intact.

## Surface reasoning

The official clip has localized neutral/white reflective highlights on both yellow ink and purple clubs. The old squid material enables sheen1, whose Three.js model is intended for cloth/fabric, and multiplies dielectric specular color by ink color. The candidate removes the cloth sheen and that tint multiplier only within makeSquidMaterial, lowers base roughness0.30→0.22, and retains clearcoat, team albedo, spot colors, lighting, opacity and ghost behavior. The roughness value is a visual candidate, not a measured Nintendo material parameter. No static painted highlight is added. Actual identical-light browser images must establish whether this improves the requested finish.

Three.js primary documentation: https://threejs.org/docs/pages/MeshPhysicalMaterial.html (sheen, clearcoat and specularColor).

Nintendo sources:
- https://www.nintendo.com/jp/switch/av5ja/assets/images/index/movie/ikahito_pc.mp4 SHA256 ae44ee55e679ca2b17a6c6d10552c61364076c77c56ddfda6797130bb9914e99
- https://www.nintendo.com/jp/games/feature/splatoon/assets/mov/ika.mp4 SHA256 b800628c57f15edf5e250d95d3b3337418ad40bb3644237ae9a38be01467c038
- User-supplied1000001384.png is used for structural shape only, not its toy lighting/material.

## Pre-publication checks

All12 combined source tests pass, including actual source-loaded Actor tests, mirrored eye ownership, compact support retargeting and a numerical continuity/unchanged-peak guard. Independent semantic-shell comparison across3LODs confirms only long-arm shell vertices with0.10<t<0.65 move. Roots, distal shell, all short supports, cap, dark and eyes remain exact. Hero transition width at t=.3605 changes46.1→57.9mm while peak width stays114.754mm. Game peak112.689mm is unchanged; far differs only0.000026mm from numerical tail sampling. All10 sampled actual Wait/Walk/Jump bone transforms match baseline. Zero degenerate triangles. Native material/appearance acceptance remains pending.

Repeated3-equipment/36-LOD-switch disposal audit passes. Non-cup triangle connectivity and winding are exact after semantic remapping. Hero including ghost drops25,034→24,838 triangles and643,110→637,650 geometry bytes; game11,976/far3,504 triangles are unchanged. Four materials, zero textures and23 bones remain unchanged.
