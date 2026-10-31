# Native Scorch display culling study (2026-10-31)

Neither proposal was installed: both increased CPU selection time in the measured workload. The frozen patches here are experiments, not production changes.

The baseline was integration PR commit `2f3acacdb5296605cdc675e4feb564dc1a491d51`. The Scorch prebuilt was regenerated from the pinned native source, then admitted by the current converter and stage identity with every payload SHA-256 verified. Its source SHA-256 was `c8d0e21345ff9f4eb528e699de2ad9c478af78d7284f347399cc59ab94eb4cd8` and converter identity was `85c9d0a04cb261a9638a846203e286c9dc76d104a6b30fd3eae4b9dc9dfba8c7`. The source model has 100 active objects. Measurements used Linux Chromium 154 / SwiftShader and Node 24 on a four-CPU cgroup, not a target device.

## Conservative tile boxes

The `aabb-experiment.patch` first applies the existing tile-sphere frustum test and adds a padded axis-aligned bounding-box test only for boundary planes. It uses the shortcut only for an identity stage world matrix and finite, bounded rigid cameras; unusual transforms, projections, Three.js methods or callbacks use the old sphere selection. The original triangle order, positions, indices, materials, collision and paint data are retained. Tests cover 216 camera/transform combinations, near/far/side boundaries, negative and nonuniform scale, alternating color/shadow cameras with pending index uploads, custom Three.js methods and cache invalidation.

In a CPU-only test with actual Scorch geometry, 65 eligible display objects and 120 sequential moving camera views produced 7,475 visible-object selections. Across the views, submitted native opaque source triangles fell from 11,137,826 to 10,971,550 (−1.49%). In 16 ABBA/BAAB windows per side, median selection time for all 120 views **increased from 587.6 to 745.2 ms** (+26.8%, approximately +1.31 ms/view). This measures only culling CPU, not full rendering or frame time. Raw windows: [stage-tight-cpu-v2.json](stage-tight-cpu-v2.json).

A separate WebGL fixture directly constructed both real Scorch source displays in one deterministic scene from the admitted prebuilt, using material metadata, fixed cameras/lights and shadow maps. It intentionally did not load source textures and did not run gameplay or post-processing. Across 12 views, both repeat renders on each side and the A/B framebuffer RGBA hashes matched, with no GL error. Native opaque source triangles were 1,076,732→1,054,229 (−2.09%); the matching index buffers' `bufferSubData` API-specified bytes were 6,780,308→6,639,092 (−2.08%). The cold first render and small, varied timing sample do not establish a full-game speedup. Raw: [stage-tight-prebuilt-v2.json](stage-tight-prebuilt-v2.json); independent rerun: [stage-tight-prebuilt-repro.json](stage-tight-prebuilt-repro.json).

A synthetic WebGL test also compared 36 camera/transform views with a directional shadow map; the A/A, B/B and A/B pixels matched. It verified that disabling shadows changed pixels; negative-scale and rotated objects deliberately used the old fallback. Raw: [stage-tight-synthetic-v2.json](stage-tight-synthetic-v2.json).

The full production-game baseline attempt against the current admitted Scorch site failed to reach the menu within 300 seconds, before loading the candidate. It supplies no full-game A/B result: [stage-tight-scorch-final.json](stage-tight-scorch-final.json). The cause of that timeout is not established here.

## Identity matrix shortcut

The `identity-experiment.patch` leaves the existing sphere selection unchanged. It skips multiplying the projection/view product by the stage world matrix only when the world matrix is exactly identity (including positive-zero components), the intermediate matrix is finite and contains no negative zero, and known Three.js multiplication implementations remain unmodified. Other inputs fall back to the original multiplication. Separate tests cover random finite matrices, signed zero, NaN/infinity, custom methods before and after import, and native moving cameras.

For the same 65 objects and 120 moving views, the fast condition held for all 7,475 selections; 33,413,478 selected indices, draw ranges, index versions and pending update ranges matched the baseline. However, median CPU selection time over 16 windows per side increased **577.4→666.0 ms** (+15.3%). An isolated repeat produced **545.9→633.8 ms** (+16.1%). Raw: [stage-identity-cpu.json](stage-identity-cpu.json) and [stage-identity-cpu-repeat.json](stage-identity-cpu-repeat.json). The checks needed to establish the shortcut outweighed the saved multiplication in this workload.

## Reproduction

Prepare a current build site and an admitted Scorch prebuilt root. Starting from the pinned commit, generate either candidate independently; do not apply the patches to the production tree:

```sh
git show 2f3acacdb5296605cdc675e4feb564dc1a491d51:patches/native-stages/runtime/native-render.mjs > /tmp/native-render-baseline.mjs
patch -o /tmp/native-render-aabb.mjs /tmp/native-render-baseline.mjs < reports/native-stage-culling-study-20261031/aabb-experiment.patch
patch -o /tmp/native-render-identity.mjs /tmp/native-render-baseline.mjs < reports/native-stage-culling-study-20261031/identity-experiment.patch
INKWAVE_NATIVE_DISPLAY_EXPERIMENT=/tmp/native-render-aabb.mjs node --experimental-vm-modules --test reports/native-stage-culling-study-20261031/aabb-experiment-check.mjs
INKWAVE_NATIVE_DISPLAY_EXPERIMENT=/tmp/native-render-identity.mjs node --experimental-vm-modules --test reports/native-stage-culling-study-20261031/identity-experiment-check.mjs
INKWAVE_NATIVE_DISPLAY_EXPERIMENT=/tmp/native-render-aabb.mjs node --experimental-vm-modules scripts/benchmark-native-stage-tight-cpu.mjs <prebuilt-root>/scorch /tmp/scorch-aabb-cpu.json
INKWAVE_NATIVE_DISPLAY_EXPERIMENT=/tmp/native-render-identity.mjs INKWAVE_NATIVE_IDENTITY_EXACT=1 node --experimental-vm-modules scripts/benchmark-native-stage-tight-cpu.mjs <prebuilt-root>/scorch /tmp/scorch-identity-cpu.json
INKWAVE_NATIVE_DISPLAY_EXPERIMENT=/tmp/native-render-aabb.mjs node scripts/check-native-stage-tight-prebuilt.mjs <site> <prebuilt-root> /tmp/scorch-aabb-webgl.json
INKWAVE_NATIVE_DISPLAY_EXPERIMENT=/tmp/native-render-aabb.mjs node scripts/check-native-stage-tight-synthetic.mjs <site> /tmp/scorch-aabb-shadow.json
# Optional full-game attempt; the original run timed out before loading a match.
INKWAVE_NATIVE_DISPLAY_EXPERIMENT=/tmp/native-render-aabb.mjs node scripts/build-native-stage-tight-candidate.mjs <site> /tmp/native-stage-tight-engine.mjs
INKWAVE_NATIVE_TIGHT_ENGINE=/tmp/native-stage-tight-engine.mjs node scripts/benchmark-native-stage-tight-culling.mjs <site> /tmp/scorch-game.json
```

The prebuilt fixture fails closed unless source, converter, stage and payload hashes are admitted. The CPU benchmark expects the same admitted input; it verifies typed-array sizes but does not independently re-run admission. Playwright and Chromium are required for the browser fixtures. The full-game attempt uses an independently bundled native engine. Its five-minute menu timeout must not be interpreted as a match result.
