# Squid-only surface candidate (not yet visually accepted)

## Observed reference
Nintendo public gameplay clip: https://www.nintendo.com/jp/switch/av5ja/assets/images/index/movie/ikahito_pc.mp4 . SHA256 ae44ee55e679ca2b17a6c6d10552c61364076c77c56ddfda6797130bb9914e99. Reviewed 2.9, 3.0, 3.1, 3.2, 3.3 and 3.4 seconds. These show large white eye patches with dark pupils, dark violet long feeler clubs with pale spots, and a shiny ink coating. Lighting, view, animation phase and game version are not matched; exact RGB and geometry equivalence are not claimed. Other ink palettes are not established by this yellow-squid clip.

## Bounded changes
- Dedicated squid-eye physical material retains existing geometry, gaze input and CPU-deformed source eyes. Removes the inherited human coloured iris spokes, replacing them with analytic antialiased white/dark pupils. No baked catchlights or texture maps. Human eye factory remains byte-for-byte unchanged.
- Existing negative tint marker on two long feeler clubs selects a dark violet coating; modelled cup tint markers use the same transition so spots are pale violet. All short arms and mantle preserve their current team-colour shader. Ghost presentation remains governed by its existing later shader override.
- The band binding repair is separately described in reports/squid-motion-20261018/README.md. Geometry positions and triangle counts remain unchanged.

## Cost and verification
No texture allocation or additional draw calls; one dedicated shader/material instance per character, explicitly disposed. Existing body attribute layouts retained. Source-loaded tests cover material identity, all LODs, disposal once and human factory byte preservation. Source and emitted browser compile/render remain required before acceptance. No claim of perfect Splatoon 3 reproduction.

## Posture and matched-reference evidence
The source-loaded Sqd_Wait path previously skipped the existing native flat-dry coordinate frame. The separate binding adapter now restores that authored coordinate frame, retaining source clip bones and existing flight-direction rules. See the motion report and tests. Native QA includes a fresh, explicitly source-enabled actor after human and dry-squid settling; driven airborne samples at16.7/50/100/200ms require existing Sqd_Jump and capture all four directions. Vertical input4m/s and9.8m/s² is a labeled diagnostic, not measured S3 jump physics. No manual mesh rotation is applied to match a reference image.

This candidate compares against exact e2e72e5283609e621ac3f27679edb9fa898425a1, with the same analytical common-sphere camera and production lighting. CPU96-case projection including the new dry frame and jump is bounded at max|NDC|0.773358. Native shader compilation and visual review remain acceptance gates.
