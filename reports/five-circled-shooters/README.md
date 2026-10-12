# Five circled shooters: measurement-led rebuild

Work in progress. This first candidate changes only the standard .96 Gal. The other four circled weapons (Splattershot Nova, L-3 Nozzlenose, H-3 Nozzlenose and Squeezer) are being measured. Splattershot Pro and Jet Squelcher are outside the user's circles and untouched. Do not merge before individual multi-view review and final integration.

## Reference identity and measurement

User supplied two actual screenshots, visually inspected: a five-weapon green-circle selection and a procedure requiring an axis-corrected side frame with a grid before modelling. References are Nintendo/game visual material hosted by Inkipedia, used for inspection, not embedded as runtime textures or retail meshes. Runtime geometry is authored in code.

| Weapon | S3 rotation source | Standard finish source | Reuse boundary |
|---|---|---|---|
| .96 Gal | [standard rotation](https://cdn.wikimg.net/en/splatoonwiki/images/b/b7/S3_.96_Gal_model_rotating.mp4) | [standard render](https://cdn.wikimg.net/en/splatoonwiki/images/5/55/S3_Weapon_Main_.96_Gal.png) | Exact standard variant |
| Splattershot Nova | [standard rotation](https://cdn.wikimg.net/en/splatoonwiki/images/9/9a/S3_Splattershot_Nova_model_rotating.mp4) | [standard render](https://cdn.wikimg.net/en/splatoonwiki/images/1/10/S3_Weapon_Main_Splattershot_Nova.png) | Exact standard variant; firing outlet under investigation |
| L-3 Nozzlenose | [D rotation](https://cdn.wikimg.net/en/splatoonwiki/images/e/e3/S3_L-3_Nozzlenose_D_model_rotating.mp4) | [standard render](https://cdn.wikimg.net/en/splatoonwiki/images/2/2c/S3_Weapon_Main_L-3_Nozzlenose.png) | Shared reel/frame only after visual comparison; silver D frame/logo not transferred |
| H-3 Nozzlenose | [VIP-R rotation](https://cdn.wikimg.net/en/splatoonwiki/images/a/af/S3_H-3_Nozzlenose_VIP-R_model_rotating.mp4) | [standard render](https://cdn.wikimg.net/en/splatoonwiki/images/5/5a/S3_Weapon_Main_H-3_Nozzlenose.png) | Shared reel, central fitting and valve only; snake livery/cable/spikes not transferred |
| Squeezer | [Foil rotation](https://cdn.wikimg.net/en/splatoonwiki/images/9/96/S3_Foil_Squeezer_model_rotating.mp4) | [standard render](https://cdn.wikimg.net/en/splatoonwiki/images/c/cb/S3_Weapon_Main_Squeezer.png) | Shared bottle/cage/grip; foil cap and green livery not transferred |

S2 36×3-view sprites were inspected as a secondary structural cross-check, not treated as S3 identity or used as the primary measurement source.

### .96 Gal, first measured candidate

Frame: standard video, 1280×720, 7.50 seconds. Side frame selected by disappearance of rear-cap perspective area and nearly collapsed front muzzle ellipse. Remaining perspective is not claimed to be a calibrated orthographic view. Barrel centre-line (786,326) → (1061,326) needs 0° roll correction. Approximate hand-picked edges have ±3 px uncertainty for hard edges and ±6 px for curved/occluded edges. The 50 px grid is retained in `gal-measurement.jpg`.

| Component | Reference pixels | Relative to total 820 px | Runtime visual target |
|---|---:|---:|---:|
| Total stock to muzzle | x≈241→1061: 820 | 1.000 | ~0.492 m visual scale |
| Water bottle length | x≈494→762: 268 | .327 | ~.164 m including rounded ends |
| Bottle diameter | y≈242→456: 214 | .261 | .1296 m |
| Purifier assembly length | x≈781→1061: 280 | .341 | .168 m |
| Purifier outer diameter | y≈271→381: 110 | .134 | .066 m at clamp |
| Butt vertical span | y≈234→456: 222 | .271 | .133 m |
| Front bracket lowest point | y≈514, relative to axis326:188 | .229 | .113 m below axis |

Absolute metres are INKWAVE visual fitting units, not retail measurements. The existing muzzle `[0,.065,.38625]`, right-hand attachment, left support socket, trigger pivot, hold override and weapon/gameplay data are preserved. This deliberately constrains the grip fit; it does not establish original-game pose or projectile parity.

Changes: ribbed/waisted water bottle rather than a smooth cylinder; open stock brace and vent lines; continuous long wire guard; separate purifier neck and front clamp; deterministic multicolour aggregate surface and recessed muzzle; thin sight loop; bolts. The opaque shared material path approximates the packed purifier; true transparent glazing is not claimed and this candidate does not depend on the separate pending glass PR. No lighting/material-shader or shared LOD code is changed.

## Verification

- Baseline pinned to main `5ed08c6376696dd67391afed7c36463106959de8`, shooters-b blob `fe1224a20c70fa0fae461e8347b15b8d8bfdd77b`.
- Local thin source composition is Git-blob-verified main, with all source/runtime tests through real public + patches composition. No model overlay from another open PR is used.
- All-65 baseline tests passed. .96 candidate basic geometry/Actor/hold/attack tests passed. Dedicated exact-frame, unrequested-model, 30/60/120Hz emission checks and CI evidence are reported per head, not inferred from the basic pass.
- Browser renders use supported 1024×512 equirectangular PMREM (cube256) and a second native Environment day IBL/sun/hemisphere + Neutral tone-map. They are direct-render pre-postprocessing evidence, not a full game poststack claim.
- The former 32×16 gallery's cube8 PMREM is invalid for material acceptance; its dark reflections are not used to infer black paint.
- Multi-angle, held views, source-motion, exact-head full CI and final online/LOD integration remain pending before acceptance.
