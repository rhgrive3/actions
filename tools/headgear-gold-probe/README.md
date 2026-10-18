# Goldfish material probe (QA only)

12 PNGs: gear 8, hero; current / neutral-hook-disabled / measured-gold-f0; default-front, default-oblique, sun-facing-front, sun-facing-oblique. Actual emitted production Environment, unchanged exposure/tone mapping/cameras/geometry. This does not update or endorse the production asset.

Physical hypothesis: Epic's measured gold base-color/reflectance example is linear RGB (1.000, 0.766, 0.336): https://dev.epicgames.com/documentation/unreal-engine/physically-based-materials-in-unreal-engine?lang=en-US . A physical candidate only, not evidence Nintendo uses pure gold. In the conductor candidate, set gold reflectance to these values and gold metalness to 1. Keep roughness, clearcoat, white lacquer, ink, lighting and geometry unchanged. Color-map values encode linear reflectance into sRGB; linear packed PBR map remains unconverted. Fractional coverage preserved via all 15 original 2x2 coverage classes, including ink/gold borders. Quantization remains 8-bit like baseline.

Neutral-hook-disabled changes only gear materials' compile hook and cache key, retaining baseline values/maps. Full framebuffer exact pixel parity is recorded per view; failure is diagnostic evidence and does not discard screenshots. The candidate retains native hooks. All variants use fresh fitted native characters, with geometry SHA-256 equality checked. Cloned candidate maps are restored and disposed before original character disposal. Original maps and module are untouched.

Run `node --test variants.test.mjs` for coverage/immutability/restore/disposal tests; `node run.mjs --site _site --out .qa-evidence/gold-probe` for native evidence. The runner verifies emitted manifest hashes, records loaded artifacts and helper/harness hashes, checks 12 cases/12 PNGs and resource return. It does not claim visual acceptance automatically.

Read sun-facing and backlit front/oblique together. Compare view-dependent gold response, visible inlay/rim versus ivory, preservation of white coat/AA/nose seam. Brighter average gold alone is insufficient. No static highlights, geometry changes, additional lights, exposure changes or runtime palette edits.
