# Five circled shooters: measurement-led rebuild

Work in progress. All five measured geometry candidates are present. Nova upper-mouth versus legacy shot-outlet discrepancy remains unresolved and blocks final acceptance. Splattershot Pro and Jet Squelcher are outside the user's circles and untouched. Do not merge before individual multi-view review and final integration.

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

## Second candidate: three further measured shapes

The next candidate includes L-3, H-3 and Squeezer, plus .96 purifier granule and muzzle-depth corrections. Nova remains unchanged while its upper outlet/lower pump relationship is checked against firing footage. No shot or aim data has changed. Exact muzzle and both hand frames remain the previous values for all four candidates.

| Weapon / frame | Image-plane roll | Corrected principal measurements (pixels) | Dimensionless checks |
|---|---:|---|---|
| Nova standard / 7.50 s / 1280×720 | 8.5308° | total 719; rear bottle L426/D182; upper bulb D130; upper axis310, lower axis424 | rear bottle L/total .593; upper/lower axis separation .159 total |
| L-3 D / 11.50 s / 1280×720 | 14.0362° | total626; reel L247/D224; reel axis354, outlet axis310; front collar779→976 | reel L/total .395; D/total .358; axis offset .070 total |
| H-3 VIP-R / 1.50 s / 1920×1080 | 8.6065° | total1140; reel L290/D266; reel axis575, outlet axis519; union996→1194; front cap1270→1510 | reel L/total .254; D/total .233; axis offset .049 total |
| Squeezer Foil / 0.00 s / 1920×1080 | 16.7954° | total1130; bottle608→1519 L911; maximum D372; straps771→803 and951→989 | bottle L/total .806; D/total .329; strap spacing .159 total |

Axis corrections use the barrel/plumbing centre line, not the weapon's bounding box. Grids and selected axes are in `*-measurement.jpg` and `measurement-inputs.json`. Estimates retain ±3 px hard-edge and ±6 px curved/occluded uncertainty. Images still have residual perspective; these are measured authoring constraints, not calibrated scan dimensions. The Squeezer's foil-specific long cap is excluded from the standard candidate even though it is visible in the measured source. The .96 standard render shows both an exterior yellow band and an interior pink muzzle lip; those are separate surfaces.

L-3 and H-3 now have four thick hose turns, distinct reel flange/axle/frame, offset plumbing, broad nozzle heads, recessed face detail and model-specific valve/lever. H-3 uses the standard blue lever and silver hex-union assembly. Squeezer has a rounded bottle with a tapering long neck, broad metal straps, thin wire cage, wood-coloured grip, red/white body finish and short standard cap. Grip fitting uses the existing attachment frame and does not assert that retail hand positions are reproduced.

### First exact-head browser result

Draft head `28cc4b9006060e2af8a3d5397fabd9041aa4641f`: [dedicated build/browser workflow](https://github.com/rhgrive3/actions/actions/runs/38246761291) passed. It built baseline and candidate production sites and rendered eight isolated directions plus idle/walk/fire/after poses under both supported studio PMREM and native day Environment. Actual .96 Actor emission at 30/60/120 Hz passed, maximum support-hand distance 0.000466 m. Inspection found a coplanar muzzle-backplate artifact and overly rectangular purifier grains; these were corrected in the second candidate and require its own browser evidence. No acceptance is claimed for the pending tank label or full game poststack.

### Updated integration base

The second candidate composes main `80555b8cf12e3a9529c0f461bd2acc3ee17f1764`, including the merged far-LOD material-boundary fix. The review baseline is updated to the same main so geometry comparisons do not confound the shared LOD change. The seven original family definitions remain the socket baseline; outside-circle Pro/Jet and still-pending Nova are byte-identical geometry in this pass. The per-model files do not alter the shared LOD implementation.

## Third candidate: all five shapes and residual review

- .96 tank centre is y349 in the side frame, 23px below the purifier axis y326. The second candidate had incorrectly shared their axes; the next candidate corrects the bottle/cap centre while retaining the gameplay muzzle. The broad black top straps are not the bottle's coloured top boundary. White maker-mark linework is now a curved surface mesh in a `canLabel` body-material part, with the same pivot as `can`. The already-existing per-model `animate` callback copies its three transforms after native can animation. There is no new common attachment contract, shader or runtime hook. Both side labels are authored linework approximations, not an extracted game texture.
- Two actual .96 Actor instances share immutable label geometry/material but retain independent transforms. Peak/rest pulses, far-to-near visibility, geometry immutability and instance disposal/recreation are tested. The label is merged into the existing far body and hidden with the other near parts. Small planar printed strokes replace excessive round tubing, keeping the existing 16,000 triangle catalogue limit unchanged (.96:15,769).
- Squeezer's first browser candidate exposed a visible grip-to-saddle gap caused by fitting measured bottle geometry around the old sockets. A continuous metal connection now joins the wood handle to the saddle. White bottle bands now follow explicit continuous curved boundaries rather than assigning white to rectangular mesh cells. Bottle straps and retaining wires share the existing bottle pulse so they cannot cut through the expanding skin.
- Nova now has its measured lobed rear/front bottles, open sculpted chassis, lower pump shoe, upper yellow/purple mouth, raised sight handle and standard white/violet grip cladding. Team colour follows the coloured bottle visible in its S3 turntable. Its old gameplay muzzle remains `[0,.0466667,.4433333]`. The rendered upper opening is around `[0,.1396154,.4450769]`, so the existing firing outlet discrepancy remains explicitly UNRESOLVED. No change to shot origin, aim, speed, spread or networking is included here. Nintendo's official trailer was opened for firing verification, but video delivery stayed black/loading in the cloud browser; rotating-model evidence alone is not reported as firing proof. Nova is not ready for final acceptance until that discrepancy is resolved.

The 4afb production-built browser evidence passed at [run38248973849](https://github.com/rhgrive3/actions/actions/runs/38248973849). The updated pass adds actual native Renderer postprocessing with a separately generated native Environment on the same WebGL context, two team colours, far isolated views and a held far-to-near check. Post evidence remains an isolated real Actor scene with native day lighting and floor, not a full live stage.

Local full public+patches tests on the third candidate: all65 geometry/native Actor checks plus five-weapon preserved socket/30,60,120Hz emission/label ownership checks,7 tests passed. All65 far-boundary checks,3 passed: original cached far bytes1,211,086 to material-preserving far bytes1,448,886 (+237,800;19.635%). Triangle positions/normals/tint/caches are unchanged by the shared LOD comparison; no threshold was loosened. These local results do not replace exact-head emitted/browser CI.

## Fourth review iteration

The all-five candidate c23fa7c passed its exact-head full production build, emitted real-Actor contracts, multiview/two-team/near-far/native-post browser review at https://github.com/rhgrive3/actions/actions/runs/38251487529 . Browser errors:0. Maximum support-hand residuals: Gal0, Nova.0038m, L3 0, H3 .0001m, Squeezer.0044m. No outlet correctness is inferred from these tests.

Enlarged inspection found two Nova presentation defects: its planar chassis cheek could intersect the curved rear bottle, leaving the white maker marks apparently floating; and the yellow collar's closed cap occluded the recessed purple upper opening. This iteration conforms the cheek and mark vertices to the existing rear profile and opens the collar behind the purple lip. An axial ray test requires the first visible upper-centre surface to be the recessed dark backplate. The existing gameplay muzzle remains unchanged.

Retail firing observation: Game8's [standard Nova article](https://game8.jp/splatoon3/494975) supplies its own before/after shooting clips for the April2024 adjustment. The 768×432 clips were viewed frame-by-frame, but their rear camera and muzzle flashes obscure the upper/lower distinction; these clips do not yet establish outlet correctness. Geometry, pose and shot-origin evidence remain separate.

The next CI adds two independent browser profiles using real Transport, production RoomDurableObject/NetSession/NetMatch, real Actors, WeaponRunner and Projectiles. Five fixed equip cases exercise both owners and remote replay. Native replication preserves per-owner event ordering, so shot traces are compared by owner and ordered event sequence; no nonexistent network projectile identifier is invented. The controlled arena omits the full stage/UI/audio. A separate eight-Actor near/far/near restored run records both team colours, grip/finite-pose/label-transform checks, geometry bytes, draw calls and software-render completion times. These timing samples are not presented as real-device frame rates.

Integration base for this iteration: main b4dc80800c0788d2a098ec7fba92b14ad445dc3f, which adds the merged pressed-button-centre fix to80555. Those four unchanged main files are composed by their verified Git blob SHAs; no pending sibling PR is included. The main reviewer controls merging.


## Origin diagnosis and next integration base

The143705 native two-browser five-weapon owner/remote test passed. Its visual job stopped in a newly added test because the optimized Three bundle correctly omits unused Raycaster; the test now directly intersects the emitted triangles numerically, without expanding runtime exports or skipping the check. Source all65/realActor and emitted remaining7 checks passed at that head.

A real Actor/Runner/Projectiles probe confirms an INKWAVE-specific connection defect independently of retail evidence: after aim settles, Nova's projectile and native muzzle FX both use the existing lower socket,3.92mm from the closed lower pump,92.97mm from the visible upper opening. The first shot additionally uses the existing aim-ready interpolation. A review-only candidate changes only d.muzzle to the upper opening (local Y+92.949mm,Z+1.744mm); the real physics origin, FX, aiming and native wire events all take this same existing path. No visual-only offset is proposed. Paired Node simulations retain all weapon configuration values, launch speed, and20 shots/19.2 ink across30/60/120Hz. They also show expected changes to trajectories near close targets; this is not claimed to be a zero-gameplay-impact change.

The diagnostic browser job renders actual native Projectiles(scene), native FX and ready source motions for first and steady fire,30/60/120Hz, up/down aim and close walls. It compares the unchanged production origin with an explicitly labelled review-only upper-mouth candidate on the same build. The candidate is then exercised in the same real owner/remote network test. No shared rendering/physics API or production muzzle change is included. Adoption awaits visual, near-cover/aim/network review and the original-game outlet evidence.

The next composition includes main ed3a046574208471c5db5309e2469d263cacfdfd (52 Git-blob-verified files after b4dc), including the native-stage build/composition additions. All standard weapon images were rechecked: L3/H3 have blue reels; H3 has its blue lever, silver unions and black front; standard Squeezer has red/white finish, black neck and short cream cap. D silver frame/logo, VIP-R snake/spikes/green livery and Foil green/gold extended cap are not transferred. Current hose surface and printed marks remain procedural approximations.

## Exact f7be4ee review and separate origin evidence

The main-ed3-composed head `f7be4ee248df60206ca590564b42e93a80e5e256` passed source/emitted geometry, all-65 model integration, two supported lighting paths, held/post views, and the ordinary two-browser five-shooter run. The native ordered-wire replay paired 84 real births, maximum spawn-coordinate quantization distance 0.007965 m and zero launch-velocity difference. These are controlled real-Actor arena results, not a full live-stage match claim.

Eight-Actor visible-geometry comparison with the original model definitions on the same main-ed3 composition:

| Tier | Original | f7 candidate | Draws original → candidate |
|---|---:|---:|---:|
| Near | 2,140,558 B | 4,645,850 B | 96 → 98 |
| Far | 638,800 B | 660,202 B | 56 → 56 |

The two extra near draws are the white moving .96 label on the two .96 instances. The +2.39 MiB near increase is unapproved model cost, not validated merely by passing functional CI. An eight-Actor original-main browser A/B and component-level accounting are being added. L3/H3 still lack the reference hose's fine braided pattern; the current plain hose is a recorded visual residual.

The native Projectiles + FX origin diagnostic completed all 18 first/steady/30–60–120 Hz/pitch/wall cases. In the actual loaded source-motion first-shot pose, the old Nova socket-to-birth distance is 0.710601 m; the upper opening-to-birth distance is 0.641169 m. In steady fire, birth and native FX exactly use the old lower socket, 0.092965 m from the visible upper opening. Changing only the definition's muzzle to the upper opening fixes steady contact but leaves a 0.706452 m first-shot pose/prediction discrepancy. These two issues must not be conflated. No production origin or shared pose change is made here.

The origin diagnostic's first camera clipped Nova's tip. Its numerical traces are retained, but those images are not sufficient visual contact evidence. The next capture widens the camera and asserts whole-weapon screen bounds. The opt-in upper-origin network run failed on the page compositor's far screenshot timeout, not a numerical assertion; it is not reported as passed. The retry is scoped to Nova and captures the native rendered canvas directly. First-shot prediction remains a separate open issue. Source retail firing clips inspected so far are obscured/rear-view and do not establish the retail outlet or bottle deformation.

## Limited Squeezer stripe allocation refinement

The f7 Squeezer stripe generator allocated four vertices for every clipped cell even when no triangle referenced the cell. The refinement rejects the empty cell before appending vertices. This removes exactly 9,480 unused vertices / 379,200 bytes from the can geometry; every surviving indexed attribute bit and triangle order, near bounds and triangle count remain unchanged. No shared LOD or material change is included.

The old far clustering algorithm counted these unused vertices in its centroids. Removing them therefore also changes the resulting far mesh: 697 triangles and identical corner colour/material remain, while 126 position corners (maximum component delta 30.4 mm) and 106 normal corners differ. The far geometry itself is 120 B smaller. This is explicitly not a claim of bit-identical far appearance. A/A repeated native-day browser renders, full-size near/far views and 8 m/16 m projections are compared before acceptance. The change remains a candidate until that visual review and online retry are complete.
