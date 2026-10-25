# Additional world and account CI optimizations — 2026-10-25

Base: PR #1870 at `8e539eac1e5fe4a6412d3e5852d7f5eaa5d0c1da`.

Nine queue rows implemented: bounded Lathe/Tube trigonometry tables; finite aligned-box AABB extrema; static face-axis scalar selection; two fewer temporary vectors per native hidden collider; removal of TriangleWorld's display-array aliases; Native minimap axis pruning; removal of the redundant OBJ final finite scan; PR-only account concurrency; and fail-closed account test-only build selection.

The collider change deliberately keeps independently owned axes/colors. AABB selection uses the already-computed alignment state instead of rereading a possibly accessor-backed definition. Nonfinite/inverted/rotated boxes retain the original corner traversal. TriangleWorld retains all other enumerable metadata, including symbols, through Object.assign. It drops only its unused render aliases; the original data and GPU geometry own their buffers normally. No material/texture quality, collision shape, paint mask or navigation seed changes.

PropKit is a migrated Direct-Source owner, so its bounded table change is authored in props-core.js. Level changes use the existing build composition contract. The table keeps at most 32 ordinary 3–96 tessellations and the original inclusive Lathe/exclusive Tube formulas; unusual counts retain their original loop semantics.

## Local verification

Seven source-loaded tests pass: actual vendored Three.js Lathe/Tube attributes/indices across open/closed seams and ordinary/unusual tessellations; all five Legacy layouts' geometry bytes; collision array identities and exact ray output; native center/half arithmetic; 10,004 actual Level AABB cases plus an accessor-backed rotated-definition negative control; 1,200 Native minimap ray traces; and 160 OBJ component variants including signed zero, Float32 overflow, NaN and infinities. The separate world-build suite passes eight cases covering all layouts and final-theme/reflection fallback. Native controller/paint contract passes two cases; 23 external-stage browser-source fixtures are unavailable and remain explicit skips.

Account CI has three local contract/negative-control tests. The classifier accepts only a nonempty, exact diff of direct account/tests/*.test.mjs paths; fixtures, production paths, missing/invalid history and Git failures require full build/budget/entry/Wrangler validation. Account tests always run. Main pushes use independent concurrency groups; only obsolete heads of the same PR supersede each other. No hosted run was manually cancelled.

## Conditional proposals

The [per-row record](queue-extra-world-dispositions-20261025.json) distinguishes eight mechanisms already present, nine additions, seventeen evidence-dependent proposals and the prepared native artifact path owned by PR #1868. In particular, GPU upload/closed-Bitmap/program invalidation, direct PNG resize, mask/attribute release, async cloud/cube publication, and cross-stage mutable cache transfers are not enabled without their lifetime or pixel/GPU proof. The current environment could not install a working Chromium archive; no new browser-rendered image comparison, iPad memory/FPS or retail-device equivalence is claimed.
