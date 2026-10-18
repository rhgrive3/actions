# QA-only roughness sensitivity

Original runtime module remains unchanged. Three variants: current, gold-roughness-012, gold-roughness-060. Each uses identical four production perspective views and original color/metalness/clearcoat/geometry/lights/exposure. Only gold roughness changes, including coverage-weighted AA map texels and the separate gold rim. Non-gold roughness is byte-identical. Original packed map is cloned then restored and clone disposed exactly once. Both PBR slots point to this clone so metalness bytes remain exact.

12 PNGs. Eight baseline comparison metrics (four views per roughness alternative) are recorded as `parity`, with variant labels; unlike the first probe these are sensitivity differences and are not expected to be equal. Geometry SHA-256 and resource-return checks stay active. Original physical-F0 diagnostic and evidence remain in earlier branch commit041f7b00be66abede06af6f1e1f5c504a89c0bc3.

Run node --test variants.test.mjs; native command unchanged. This is a response-path diagnostic, not an accepted material correction. Original Environment intentionally excludes the tiny sun disk from its PMREM (soft sun lobe, ×0.72), and day uses scene environmentIntensity0.45. Do not change that production illumination to force a highlight. If the response remains visually flat, retain runtime baseline and report the residual rather than retune color.
