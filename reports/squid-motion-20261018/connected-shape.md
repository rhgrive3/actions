# Connected squid face and integrated supports

Baseline runtime: 67a2720ccb95f7793c36bc4e3a2267cc38a21925; exact prior branch head (test diagnostics only): 7a973ff86aa00d3931d2bbcaa63e59b79f5783a2.

## Reference and scope

The user's supplied purple figure photograph (2026-10-18 15:11 UTC) is a structural reference, not a game capture or a lighting target. Its connected white field, dark outline, central pointed supports and rounded outer clubs inform this bounded revision. Public Nintendo clips remain the gameplay reference:

- https://www.nintendo.com/jp/switch/av5ja/assets/images/index/movie/ikahito_pc.mp4 (2.9–3.4 s; SHA256 ae44ee55e679ca2b17a6c6d10552c61364076c77c56ddfda6797130bb9914e99)
- https://www.nintendo.com/jp/games/feature/splatoon/assets/mov/ika.mp4 (jump/landing around 4–6.5 s; SHA256 b800628c57f15edf5e250d95d3b3337418ad40bb3644237ae9a38be01467c038)

## Changes

- One connected surface-following white eye field replaces the separate raised disks; a narrow separate outline replaces the broad uniform dark band. Its central upper dip and two analytic pupils are squid-specific. The human eye factory remains byte-identical.
- The connected eye geometry opts into the companion same-y mantle binding. The legacy eye-bone left/right split remains available for untagged geometry. No clip clocks or selection are changed.
- All four short support roots begin inside the mantle. The lateral pair is recessed and slightly shorter; the central pair reads more prominently. Their six semantic IDs and correct outer long-root ordering remain stable.
- The two outer clubs have broader smooth radius falloff, without the curled terminal centerline that produced diamond-like shoulders. Existing flat eye-facing spots remain; no texture or new material is added.

## Validation and limits

A CPU triangle projection of the actual generated geometry was independently reviewed before native publication. It is an unposed construction view, not a native material/animation render. Its corrected winding is checked numerically. Analytical coverage swept 564 actual source/fallback actor frames and all 100 screenshot cases: worst NDC extent 0.7733584563, minimum border margin 22.664%, same fixed camera as the preserved baseline.

Source tests cover connected topology, outward normals, six arm IDs, outer roots, bounded geometry cost, shared human eye preservation, idempotent disposal and tagged source deformation at all three LODs. Native source/emitted tests and the paired 200 PNG capture remain required after publication. The long lower-body proportion and inherited dry-idle arm splay remain fidelity caveats; this is not a claim of exact game reproduction.

Final local source suite: 7/7 pass. Independent all-LOD geometry checks find no degenerate triangles; all 2,124 sampled short-root ring points remain inside the mantle in 27 source poses. Including the local ghost, triangle cost is 25,034 / 11,976 / 3,504 (hero/game/far), reduced from the preserved baseline. Four materials, zero textures and 23 bones remain unchanged; repeated equips and 36 LOD switches clean up correctly.
