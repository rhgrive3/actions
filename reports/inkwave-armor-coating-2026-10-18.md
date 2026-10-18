# Armor Helmet Replica coating correction — 2026-10-18

## Scope and reference
User clarified that the outstanding request means a coating finish. Preserve the accepted geometry, flat purple ear print, rear face winding, base colors and all other headgear.
Reference: Splatoon 3 worn image https://gamewith.jp/splatoon3/362845 and https://img.gamewith.jp/img/caaf01105814adc92b1347dc03c36b84.png . This is third-party game imagery, not published Nintendo material parameters. It shows localized surface reflections over the woven base; numerical material parity is not claimed.

## Implementation
Base: main 60cc6bf569561113b263e39cb094a05d45e491f9.
Only the shell material changes from MeshStandardMaterial to MeshPhysicalMaterial, adding clearcoat 0.55 and clearcoatRoughness 0.18. Existing color 0x363b3e, roughness 0.58 and metalness 0.13 are unchanged. No geometry, light, camera, texture, character or hair modifications. The printed ear material stays unchanged.

## Verification stages
- Independent source readback and main snapshot validation completed: 4,681 tracked blobs match the GitHub main tree.
- All geometry arrays match the original across LODs; triangle/draw counts unchanged (far 1100/3, game 3090/4, hero 4722/4).
- Normal production build, startup budget and existing 27 lifecycle tests passed in the local candidate.
- Same-camera/light/exposure five-view Blender material emulations are diagnostic previews only. They do not prove Three.js appearance or GPU performance.
- Exact published-head native browser shader compilation, fitted multi-angle appearance, hurt/flash, LOD, resource disposal and required CI remain pending at PR creation. The existing headgear workflow runs these on the exact PR head. Adoption requires its evidence and independent visual review.

## Load and limitations
No extra meshes, textures or render passes. Physical clearcoat adds fragment BRDF arithmetic; unchanged geometry/draw counts do not establish unchanged GPU cost. GPU timing remains unmeasured. No extra detail modeling or broad quality changes are included.
