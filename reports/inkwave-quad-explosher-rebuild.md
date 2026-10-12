# Quad and Explosher procedural reconstruction

Current comparison base: `3165f4f26a1a4b30aec228939dd92adf6fdbfd06`. The 205d review below used `bca45e7cb55f3331a58459ea0219e42b44762712`. Earlier measurements below used `b078c37907351f1bbc13d0e7d4b5cbeb0a330009`. Scope is only `s3-maneuver-stepper` (Dark Tetra Dualies / クアッドホッパーブラック) and `s3-slosher-washtub` (Explosher / エクスプロッシャー).

## Source and design

Both the stored 3D render and the twelve-view rotation sheet were opened and visually inspected before rebuilding:
- `reports/inkwave-weapon-model-workspace/refs/s3-maneuver-stepper.3d.png`
- `reports/inkwave-weapon-model-workspace/rotsheets/s3-maneuver-stepper.rot.jpg`
- `reports/inkwave-weapon-model-workspace/refs/s3-slosher-washtub.3d.png`
- `reports/inkwave-weapon-model-workspace/rotsheets/s3-slosher-washtub.rot.jpg`

**Variant correction:** the Quad turntable is Light Tetra Dualies, used only for corroborated geometry. The Dark target render controls its fixed palette and team-colour partition; see the audited source ledger below.

The same `Pieces`, lathe, box, cylinder and pipe pipeline as the accepted Splatling is used. No imported retail mesh or Blender asset is introduced. The Quad is one pistol used in both hands. Its distinguishing elements are the vertically stacked front discs, open pull loop, thin receiver, wide swept shoe and separate rebound pods. The Explosher has a pressed jerrycan with X ribs, rear electrical box, separate protective rails and shocks, and a large open bronze burner with horizontal grille bars and recessed ink.

## Preserved contracts

No changes to kit, registry, hold profiles, motion, gameplay, projectile origin or runtime integration. Main hand transforms, muzzle coordinates, dual flag and part pivots are pinned for all twelve Dualie and Slosher models. Geometry hashes additionally pin the ten untouched models. The native slosh surface pivot is preserved.

## Initial local verification

- Exact production composition build: `0b2c47214301b8ee2ebbcca1bcde8e6056cca10d16dc7280c5197389b05b010e`.
- Six emitted-runtime tests pass, including real Actor carry/fire at 30/60/120 Hz and preservation of eleven registered models' gameplay frames (the legacy-model omission is corrected below).
- Static body + ink triangles: Quad 2,477 → 5,123; Explosher 5,541 → 9,585.
- Static body + ink geometry bytes: Quad 65,102 → 131,098; Explosher 142,886 → 248,910.
- Being inside the geometry budget is not a performance verdict. CI captures exact before/after viewpoints, real Actors, and same-runner eight-Actor game/far ABBA render and animation measurements. Visual review and measured performance remain pending until that evidence has been inspected.

## Limitations

Reference images have their original cameras; candidate and baseline use identical fixed cameras. The comparison is visual design evidence, not a pixel-matching or retail gameplay-parity claim. Retail physical sizes are not documented, so native hand and muzzle frames constrain the reconstruction.

## Review iteration and deterministic validation

A CPU-only geometry diagnostic exposed small gaps between the Quad's receiver, grip and heel. Those junctions are now continuous geometry, and the pull-loop return joins its front plate. The Explosher throat was moved forward within the burner so the intact can wall cannot obscure the recessed ink. This diagnostic is explicitly not the emitted-shader/Actor proof; CI images remain required.

Refined static body + ink: Quad 5,279 triangles / 135,314 bytes; Explosher 9,729 triangles / 251,774 bytes. Four focused source tests pass after the revision, including exact same-runtime unchanged geometry and real Actor checks at 30/60/120 Hz. An additional 31 existing Dualie/Slosher motion and timing regressions pass.

The first CI run (`38216994596`) reproduced the production hash and passed Actor/shape checks but rejected the precomputed unchanged Tri-Slosher binary geometry hash. The precomputed snapshot came from local Node 24.19.0, while CI uses Node 22. No model-builder, kit or geometry primitive in this path reads random, date or performance values. At the first validation-fix stage, local forward/reverse construction order produced identical hashes for eleven registered models. The workflow now creates the immutable before build's geometry twice, in forward/reverse order on the same runner, and compares the ten untouched models byte-for-byte against that actual baseline. It also prints both hashes so the old mismatch can be diagnosed rather than hidden. On Node 22, the unchanged before build reproduced the original precomputed hash discrepancies; forward/reverse order was stable and the same-runner before/after geometry matched. The precise cross-environment math cause was not isolated.

## Fidelity rejection and second reconstruction

The owner rejected the fidelity of `bdda231` on 2026-10-12. Its successful CI and performance measurements are retained as intermediate evidence; they do not approve that visual result for integration.

The second reconstruction changes the Quad's narrow straight parts into layered curved rear and front frames, a short receiver with visible twin chambers, broad ankle housings, a swept shoe with varying three-dimensional width/pitch, three thick rebound cushions and broad paired front faces. The Explosher gets a long can with a real sloped shoulder, lower cast handle slots, a proportioned rear electronics box, a larger carry aperture, an open machined burner yoke and rectangular-section silver cage with diagonal shocks. These changes are derived from separate front, side, rear and oblique inspections of the stored turntable and official render.

Reference camera settings and cropped source windows are now recorded per view. The comparison outputs contain four explicit reference/baseline/candidate pairs per weapon; the Quad's official two-pistol oblique render is compared to two instances of the same definition. The Explosher display tilt is matched in the review camera basis and is not baked into its native held geometry. Source camera calibration remains approximate, so no pixel-parity claim is made.

The native rear hand grip on Explosher has no clearly visible counterpart in the standalone reference. It remains as a subdued black attachment behind the electrical box to honor the unchanged native hand frame. Its placement is a gameplay-interface adaptation, not a claimed retail detail. Tiny dial marks, warning-panel print and hidden inner fastening details are approximate; the visible can, frame, burner and cushion construction are the primary reference targets.

Correction to the first snapshot inventory: `sloshers.MODELS` excludes the legacy native Slosher. `bdda231` actually tested eleven registered models and nine untouched geometry hashes, not the previously stated twelve/ten. The second reconstruction adds legacy Slosher explicitly so the executed inventory is now twelve models and ten unchanged geometry comparisons.

Second reconstruction source metrics: Quad 11,715 static body+ink triangles / 303,290 bytes; Explosher 11,989 / 306,614. Draw groups remain merged and no cache, LOD, animation, hold or emission code changes. New emitted images and eight-Actor performance evidence must be reviewed before judging this candidate.

## Latest-main composition

The second reconstruction includes main `1fca80b32c98455924afbbffeccd952fd0122b71` (camera, collision, paint and networking updates). The model family files are unchanged on that main. Both baseline and candidate builds in the new review use this same main composition; old bdda performance values are not reused as evidence for this version. The 43-file shared main delta was independently checked against each Git blob SHA before local composition.

An additional static review corrected the new Quad swept deck's inward face winding before candidate visual acceptance. Triangle count and positions are unchanged. A top-face normal witness now requires outward winding so back-face culling cannot hide its upper skin.

## Four-view review of 4d5e7f0 and targeted refinement

The browser reference pairs exposed remaining visible gaps: Quad's white outer rear cheek and under-mounted front discs, and Explosher's exposed gold outer cone, underspecified black housing/base, smooth pale cage and missing pale side mark. This version is retained as an intermediate, not an accepted result.

Reference camera roll, pair offsets and framing are corrected before judging body proportions. Source crop windows are now enlarged uniformly to the review tile; no source image is warped. The model side/front/rear/oblique cameras remain exactly shared by baseline and candidate. Quad's side source depicts the pair, so that view now compares two instances as well.

The next local refinement makes Quad's outer rear face black with a higher kidney pad and moves the two front rebound faces into the end of a shortened deck, instead of below an overlapping nose. Explosher now has a dark outer burner housing over the gold inner throat, a layered angular mount, four hand-authored pale glyph silhouettes and hard-faced rectangular cage rails. The source glyphs are coarse visual approximations, not a decoded alphabet or an imported texture. Flat rail faces distinguish brushed metal from the black rubber grips; the cross-section change also reduces rail tessellation rather than adding runtime work. All edits remain static geometry/material data in the two builders.

The refined candidate also includes main `bca45e7` (the two-file saturated network-paint FIFO correction). Its review baseline is pinned to the same commit. Refined static totals are Quad 11,731 triangles / 303,786 bytes and Explosher 10,757 / 274,262; no budget was raised.

## Calibration correction after b9a0360

The b9a0360 reference-pair render exposed a cropped Quad pair and an incorrect below-target Explosher front camera after the display-tilt transform. The revised reference cameras use longer stand-off distances with an 18-degree field of view; the front view now looks down at the can without that side-view-only tilt. This diagnostic-camera correction does not change gameplay cameras or model transforms.

With projection separated from form, the rear view identifies the Quad's missing flared heel volume; it is added below the kidney pad, while the forward black rebound faces are thinner and integrated into the shoe end. The Explosher's outer burner sleeve is shortened and its pitch reduced to match the side view. The pale hand-authored mark is moved above the shock/frame occluders. Cage, exposed alloy mount, bronze throat and brass bars use the existing brushed-metal surface class rather than satin plastic; rubber, painted can and printed marks retain separate existing classes. No shared material implementation is edited.

These are still candidate changes pending actual shader images and the final same-runner ABBA. Static totals: Quad 11,903 triangles / 307,618 bytes; Explosher 10,757 / 274,262. Earlier b9a/4d metrics remain historical and are not a performance pass for this revision.

## Reference variant audit and palette correction

The shared filename `s3-maneuver-stepper.rot.jpg` is an ID lookup, not proof that the sheet depicts the Dark kit. The provenance files resolve the exact variants:

| Image | Exact variant | Permitted reference use | Git blob SHA |
| --- | --- | --- | --- |
| `refs/s3-maneuver-stepper.3d.png` | Dark Tetra Dualies, Splatoon 3 | Target shape and palette | `f8c10492e9a6c9dfc4fbb8a662e09619e2a90e3f` |
| `rotsheets/s3-maneuver-stepper.rot.jpg` | Light Tetra Dualies, Splatoon 3 | Corroborated shared visible geometry only; not target colours | `674dbc64fb7e8d3e0a1ad5f241404717eabc3720` |
| `refs/s3-slosher-washtub.3d.png` | Explosher, Splatoon 3 base kit | Target shape and palette | `b25b744f71a0a3bdf42d1c504a816ac86a80f668` |
| `rotsheets/s3-slosher-washtub.rot.jpg` | Explosher, Splatoon 3 base kit | Target multiview shape and palette | `e087026509211d158e9161a39b321d180da046ff` |

All four paths are under `reports/inkwave-weapon-model-workspace/`. Identity evidence in that same directory: `alt-kits.json` (blob `9a45b00964d4b31afdf013fd3a5b05ee4e046c1a`) explicitly maps stepper to Light Tetra Dualies; `rot-variants.json` (blob `67db2bcf7a1b64b1cab16a9c4a9b85eabb2c8895`) names `File:S3 Light Tetra Dualies model rotating.mp4` and `File:S3 Explosher model rotating.mp4`; `BRIEF.md` (blob `e3427cfe0f7b73682c3acf54e1a059432491abe5`) identifies the per-weapon render as the colour authority when an alternate-kit turntable is used. Explosher has no alternate-kit override.

The previous white rear cheek was an incorrect left/right inference from comparing different kits. Both Dark rear cheeks are now black with grey kidney pads. The Dark official render's chambers and rebound cushions are pale rather than the magenta seen in the Light turntable. Those volumes now use fixed body colour; only the visible sole triangle and paired forward circles retain team ink. A geometry-colour test guards this partition. Studio references use the target render's green/purple ink; actual gameplay Actors still exercise the native orange/blue teams.

The Dark render and Light sheet visibly correspond in the two curved frame members, stacked twin muzzle discs, raised open pull tab, shoe profile, ankle covers and three rebound-cushion arrangement. No different large accessory, opening or additional mechanical assembly is visible in the supplied pair. That is a limited visual corroboration, not proof that unseen surfaces or every printed/embossed detail are identical. The hidden opposite pad detailing and chamber microprint are not resolved by the Dark image; fine ribs are authored only on the verified visible side. The chamber ribs, loop thickness and small fasteners remain procedural approximations. For Explosher both sources agree on the sloped can shoulder, X panels, filler cap, rectangular cage, shocks, dark burner housing, brass throat and rear electronics box. Its tiny warning print and self-authored side glyphs remain approximate.

Every paired comparison labels the reference's exact variant and use. The Light rows explicitly say GEOMETRY ONLY and do not present its palette as a completed Dark target. `gallery.json` includes source paths, blob SHAs and source movie identities; the comparison script verifies image bytes against those blobs before producing a sheet.

## Historical b9a0360 performance (not this revision's approval)

Run `38229788022` completed successfully against main `bca45e7` using CI Node 22 and the production browser. All twelve contracts, ten unchanged byte comparisons, actual Actors and ABBA ran. Normal eight-Actor triangles were 295,572 -> 343,020 (+16.1%), visible geometry bytes 2,122,312 -> 2,492,372 (+17.4%), draws 112 unchanged. Far triangles were 82,438 -> 83,206 (+0.93%), bytes 607,886 -> 602,952 (-0.81%), draws 64 unchanged.

In ABBA order, normal animation p50/p95 (ms) were old 6.6/13.7, new 6.7/15.3, new 6.4/17.0, old 6.4/12.9; historical finish-call render p95 was 8.7, 8.5, 9.4, 9.0. Far animation p50/p95 was old 4.0/4.8, new 4.1/9.2, new 4.2/8.1, old 4.0/4.7; render-complete p95 was 3.0, 4.9, 3.7, 2.9. The repeated far-tail increase is a real concern, not a performance pass. SwiftShader timings are not physical-device FPS. The candidate still changes only static builder data, not cache generation or animation loops; the exact cause of that CPU tail is not isolated. The next exact head must be measured and reviewed independently.

The original animation timer surrounds only eight `_finishFrame(1/60)` calls; renderer submission and `gl.finish()` are separate. Source inspection finds no per-frame vertex loop added by this candidate: `_animWeapon` uses the `farDec` transition guard before cached far-geometry selection, then animates existing transforms. To investigate rather than assume the cause, the next review preserves the original ABBA and adds separate no-render CPU phases, inclusive method timings by weapon (including untouched controls), visible/LOD/geometry identity snapshots, raw frame samples, heap snapshots and host load. These diagnostics are test-script-only and must not be confused with uninstrumented gameplay frame times.

## 205d four-view review and narrow follow-up

Actual browser images for `205d4e4e` have been inspected and delivered as an explicitly unaccepted draft. Corrected Dark colours and full pair framing are visible, but its chamber area still reads as exposed bars rather than the broad planar pale cheek seen in the Dark target. The follow-up replaces the two exposed round chamber surfaces with a pair of straight-edged side plates with two real narrow slots, retaining the recessed dark rails. Purple side edging is exposed beside the white muzzle plate. This is a local contour correction, not a claim that the Light sheet alone establishes the Dark surface construction. Quad static triangles decrease from 11,903 to 11,807 while total body/ink bytes become 306,562; the budgets are unchanged.

Explosher's same-geometry metal frame is too dark in the emitted shader. A direct normal audit of its straight front bumper found all 40 witnessed faces and averaged vertex normals outward, with the expected silver linear RGB values (0.5395, 0.5972, 0.6240). The next gallery isolates the identical authored metal triangles and renders native brushed-metal, standard physical metal and a nonmetal control under the unchanged cameras and lights, with pixel counts/mean brightness. Material-class changes are deferred until this distinguishes the shared shader from ordinary metal/reflection behaviour. The side motif is arranged down the front shoulder as in the reference rather than horizontally along its top edge. Its glyph shapes remain authored approximations.

Main `3165f4f` adds ink-volume runtime/build assets. Its 37 text blobs were verified against the shared manifest; both runtime packs are verified read-only shared inputs, not duplicated worktree copies. Seven report-only images/source textures are omitted locally with their remote blob identities preserved. The next official Git tree starts from the complete latest-main tree, so omitted local report assets are not deleted remotely. Both CI comparison builds will use this same latest main; the 205d results remain a separate historical composition.

## 205d completed CPU isolation and performance

Run `38233506236` completed the model review successfully on 2026-10-12. Eight-Actor game triangles were 295,572 -> 343,708 (+16.3%), visible geometry bytes 2,122,312 -> 2,496,204 (+17.6%), draws 112 unchanged. Far triangles were 82,438 -> 83,810 (+1.66%), bytes 607,886 -> 603,588 (-0.71%), draws 64 unchanged. The geometry cost is therefore material at normal range even though draw calls are unchanged.

For the unchanged original ABBA render-coupled phase, game animation p50/p95 (ms) in ABBA order was 6.1/11.9, 5.7/11.6, 5.7/14.0, 5.8/14.2. Far was 4.0/7.1, 3.8/7.0, 4.0/7.7, 3.9/5.0. Far render-complete p95 was 4.8, 2.7, 4.9, 3.6. The prior b9a one-direction far-tail increase was not consistently reproduced in this run; it is retained, not discarded.

A separate no-render phase measured 200 frames after 60 warm-up frames. Game no-render p95 was old 3.0/3.5ms vs new 2.9/2.9ms; far was old 2.6/2.6ms vs new 2.6/2.7ms. Inclusive method timing put target and untouched-control `_applyPose`/`_finishFrame` at similar costs; `_animWeapon` p95 for each two-actor weapon group was at most 0.1ms. Every visible geometry identity, vertex count, forced LOD and visibility snapshot was stable across those phases. Character seeds derive from fixed names and are unchanged between A/B. This evidence does not support new per-frame model generation or geometry-dependent pose traversal as the reason for the earlier tail.

The runner had four CPUs and observed host load about 3.97–5.04. Render-coupled animation timing is substantially higher and noisier than the no-render control, making renderer/SwiftShader CPU contention or scheduling a plausible contributor, not a proven root cause. Method instrumentation and no-render phases are separate controls, not substitutes for gameplay timings or a physical-device FPS claim. Latest-main follow-up is still required.


## Sixth-draft local reference measurements (after corrected lighting)

Fixed7d8 images under valid studio PMREM and native day IBL/Neutral confirm that the earlier black metal was a diagnostic-environment defect. Do not replace production metal with satin. The shape itself remains unaccepted.

Local reference landmarks are measured separately from camera calibration. Dark Tetra near chamber projected length/height is approximately0.98 (±0.10); the7d8 paired-side near chamber is1.67 (±0.08). The Light far chamber shows0.84 but is partly occluded, so that figure is a lower bound used only for structure. Whole-pistol elongation is not supported by these measurements. The next candidate shortens the pale cheek span0.118→0.092 while increasing its maximum outer half-thickness0.0195→0.0235 and dark rear housing length0.054→0.076. Its two ladder-like slots become one central mechanical recess, matching the official Dark render. Front green faces acquire connected tapered black sole blades.

Explosher official annular base/mouth projected diameter is about1.09 (±0.10); side axial projection/mouth about0.585 (±0.10). The next candidate changes the mounting plate width/mouth1.216→1.034, height/mouth1.069→0.94 and physical axial thickness/mouth0.068→0.031. A separate annulus has outer diameter/mouth1.052. Tall dark side blocks are removed in favour of the round burner sleeve and four silver supports. The lower front bumper overhang relative to the tank centre changes0.157→0.139. These are construction targets pending same-camera real renderer review, not claims of retail parity. Manual coordinates and uncertainty are retained with diagnostic evidence.


Manual pixel landmarks retained for review (source images unwarped, coordinates in original pixels): Dark official receiver length(141,176)–(205,164), height(143,175)–(150,241); Light far receiver visible length(1155,109)–(1193,109), height(1183,103)–(1183,148), with foreground occlusion. The7d8 native paired-side image is500px: near receiver length(169,207)–(304,210), height(247,189)–(247,270). Explosher official mouth major axis(281,54)–(354,150), annular base(202,143)–(302,228); side turntable mouth(1210,115)–(1216,180), base-to-lip(1188,152)–(1226,148). These approximate landmarks deliberately carry projection/selection uncertainty and do not prove camera parity.

Current local candidate metrics: Quad11,603tri/314,458bytes, Explosher10,989tri/281,014bytes. All12 family contracts and the10 untouched geometry byte signatures passed on one Node24 runner, plus real Actor30/60/120Hz tests. The native CI Node22 baseline/order test, paired valid-PMREM and day-Neutral images, and8-Actor near/far ABBA must still pass on the new head. A temporary CPU geometry preview was used only to reject disconnected/poorly-oriented blades; it is not material or gameplay rendering evidence.


## Seventh-draft bent-plate correction and merged LOD composition

Sixth-draft `fe242d9b` remains unaccepted. Actual paired browser images exposed pale surfaces crossing the newly bent black front blade. A geometry audit reproduced the cause: extending the cap centreline turned its tangent past the old extrusion normal, while a single cap triangulation bridged the bend. The seventh draft uses explicit closed cross-section strips and transports their thickness normals along the bend. It removes the crossing backing cap and keeps the observed black blade continuous with the sole. Neither green face orientation nor the native grip/muzzle is moved.

A lower-blade thickness and outward-winding witness fails on the retained `fe242d9b` negative control and passes on the corrected geometry. The existing sole top-winding, connected-foot, receiver-thickness, palette, twelve-family contracts and ten unchanged-model signatures remain required. Current local totals are Quad 11,499 triangles / 311,594 bytes and Explosher 10,989 / 281,014. This revision does not raise a geometry budget.

Main `80555b8cf12e3a9529c0f461bd2acc3ee17f1764` is included in the next comparison, with its merged material-boundary LOD implementation unchanged. Both baseline and candidate gallery/Actor builds use that same main. A further all-65 regression compares its LOD with the pre-boundary implementation on these exact candidate models: local cached geometry is 1,214,416 -> 1,429,336 bytes (+17.70%), while triangle positions, normals, other attributes, source geometry and cache identity are unchanged and authored material/RGBA boundaries survive. This is whole-catalog cached allocation, not eight simultaneous visible Actors. The existing below-20% aggregate guard remains unchanged. Native Node22 emitted-model results and new same-camera images are still required before this local candidate can be assessed.

Historical `renderCompleteMs` labels denote the measured CPU interval surrounding renderer submission and `gl.finish()`. Chromium can implement `finish()` as a command flush; these values do not guarantee actual GPU completion. No hardware-FPS claim follows from SwiftShader timings. Near/far ABBA frame/update distributions and visible geometry allocations are reported separately.


The sixth-draft side comparison raised a concern about the Explosher burner axis, subject to the camera correction below. Enlarged source landmarks in the same normal-kit turntable give tank depth angles about 9–10 degrees upward (upper edge `(1049,109)`–`(1149,91)`, lower runner `(1068,223)`–`(1170,207)`) and burner axis about 6 degrees upward (`(1188,152)`–`(1226,148)`), with roughly ±4 degrees manual uncertainty. The existing +0.18-radian camera-basis correction has the right sign and is retained. The previous mounting rotation is -0.48 radians; it cannot be equated directly with an image-space angle. An experimental candidate uses +0.08 radians relative to the can, lowers its seat from `cy+.061` to `cy+.025`, moves the seat forward from `cz+.091` to `cz+.115` to keep the annular rear face connected to the shoulder, and scales its cross-section to 94% to approach the front-view mouth/body width ratio. The attached gauge moves with the seat. These are static shape corrections; muzzle and hand frames remain the native contracts. This addition does not change source triangle/byte totals. All earlier seventh-draft LOD measurements precede this final burner-position correction and must be rerun.


The final local rerun including that burner correction passes all eight model/Actor tests and all three LOD boundary tests. Whole-catalog cached bytes are now 1,216,236 -> 1,432,636 (+17.79%); this supersedes the pre-correction seventh-draft value above. Source budgets stay unchanged at Quad 11,499 triangles / 311,594 bytes and Explosher 10,989 / 281,014.

Sixth-draft `fe242d9b` model-review run `38247485898` finished successfully, retaining its known visual defects as evidence. Its old-LOD, main-5ed eight-Actor ABBA had game triangles 295,572 -> 342,972 (+16.0%), visible geometry 2,122,312 -> 2,509,796 bytes (+18.3%), draws 112 unchanged; far 82,438 -> 83,320 triangles (+1.07%), 607,886 -> 601,276 bytes (-1.09%), draws 64 unchanged. Animation p95 in ABBA order was game 11.6 / 12.7 / 9.9 / 12.4 ms and far 6.9 / 7.3 / 6.7 / 7.0 ms. The previously concerning repeated far-tail regression did not reproduce here. These measurements are not a pass for the seventh draft or the merged main-80555 LOD; both must be measured together on the next exact head.


The normal Explosher turntable is a repeated six-direction sequence. Its chosen side crop is rear-oblique, with a visible rear-panel face, rather than a front-oblique near-profile. The earlier `[-3,.35,.30]` camera had the wrong sign of the depth component (about 84 degrees from the muzzle). Both baseline and candidate side cameras now use `[-2.6,.35,-1.5]` (about 120 degrees), retaining the same display-tilt basis, 18-degree field of view and stand-off. This is a diagnostic-camera correction, not a game camera or geometry transform. It must be checked in native images before interpreting the remaining silhouette discrepancies.


The burner-angle/location proposal is explicitly provisional. A roughly 36-degree side-camera azimuth error means that even relative projected axes can change through perspective and non-coplanar landmarks; the measured image angles do not prove a unique 3D mounting angle. The review therefore adds a third composition: current main-80555 plus current candidate data, with only the Explosher family source restored to exact sixth-draft blob `a56f3427b12f4048ec226b126dd014977d954209`. The candidate source is restored and hash-checked immediately after this control build. Both render with the same corrected camera set and unchanged production material parameters. Four reference/control/candidate views are retained under valid studio PMREM and native day IBL/Neutral. That control is distinct from the normal main-before/candidate comparison, and angle/seat changes must be judged across front, side, rear and oblique views before visual acceptance. No shape in this report is accepted solely on the side-angle estimate.
