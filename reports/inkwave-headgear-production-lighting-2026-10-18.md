# Headgear illumination audit, 2026-10-18

## Finding
The historical headgear harnesses use a fixed hemisphere plus directional light and no scene environment. They exercise the real emitted Character and attachment lifecycle, but this lighting is not the normal game's reflection environment. Their 496 frames remain useful controlled geometry, normal, attachment, LOD, and regression evidence; they cannot alone settle whether highly metallic material matches its in-game appearance.

Actual boot in `inkwave-public/src/main.js` creates `Environment(renderer, scene, ...)`, assigns `G.env.envMap`, and uses tone-mapping exposure 0.94. `src/world/environment.js` creates a sky/cloud PMREM (256 capture size), assigns its texture to `scene.environment`, and applies theme lights plus `environmentIntensity`. The day theme has sun intensity 3.3, hemisphere intensity 0.45, and environment intensity 0.45. Showcase/lobby similarly assign reflection environments. The missing reflected fill in the diagnostic is a lighting mismatch, not evidence that asset gold must be recolored.

Samurai gold uses the normal Physical material lighting path without a custom gold shader override. Goldfish artwork correctly uses the green roughness and blue metalness channels of a linear-data PBR texture. Neither asset is changed to compensate for missing diagnostic IBL. High metalness suppresses diffuse contribution; the old hemisphere-only fill does not replace specular image-based lighting. This source finding is distinct from a final native visual acceptance.

## Additional production illumination suite
`tools/headgear-production-ibl` invokes the actual emitted `Environment` constructor with its day theme. It retains the production sky/cloud PMREM and actual theme lights/scenery, exposure 0.94, and explicitly records shadows disabled. It uses an isolated-character review camera without a playable stage, so it is not described as a complete gameplay screenshot or a fabricated metallic studio.

IDs 4–11 each receive front and oblique hero views with same-frame gear-hidden controls: 16 cases, 32 PNGs. The full prior 496-frame suite remains separate and unchanged in lighting. The aggregate requires all 528 images, not a substituted subset. Character and old gear are not modified.

Receipts identify emitted Environment source SHA256, harness/function hashes, configuration SHA256, theme values, environment texture dimensions/type/mapping, sun/hemisphere values, exposure, camera framing, material parameters, and per-item resource cleanup. Runtime checks fail when PMREM is absent or official theme intensity/exposure differs. Eight one-character build/dispose cycles must return geometry/texture counts exactly to the warmed baseline. Environment-owned render targets and textures are disposed at suite exit.

Native execution and visual review of this added suite are pending on the next PR head. No claim of corrected gold appearance is made until those captures are inspected. The historical no-IBL images and failures remain recorded; they are not silently relabeled as production illumination.
