# Splatana / Stringer reconstruction review

Base: adopted main `b078c37907351f1bbc13d0e7d4b5cbeb0a330009` (local text-only mirror `c230d34`). User selected these six models from a marked comparison image. Three selected Brellas have an independent owner; Undercover Brella and all unselected models are untouched. PR401/1220 are untouched.

## Evidence and construction

The input image and all six original `refs/<id>.3d.png` plus `rotsheets/<id>.rot.jpg` were downloaded and visually inspected before implementation. These are in [merged PR1246](https://github.com/rhgrive3/actions/pull/1246), under `reports/inkwave-weapon-model-workspace`. `splatling.rot.jpg`, its 3D image and the current `splatlings.mjs` Heavy Splatling implementation provided the construction-quality reference. The same procedural `Pieces`/lathe/pipe/shell toolkit and cached merged materials are used, with no Blender or imported meshes/textures.

- Stamper: open D-shaped blue grip, two separate metallic plates, depth-bearing wheel and belt, rubber teeth on both edges, metal rims and hex fasteners. Replaces a white solid blade with one short comb.
- Wiper: offset handle and a distinct return spring, twin blade rails, hollow truss, several pivots and a wire bail over the separate squeegee strip.
- Decavitator: flared recessed grip, grooved collar, raised open finger ring, pale cylinder with inset mint windows and side rails, scalloped underside, thin fictional print strokes and a ridged cap. The shared opaque material represents the clear sleeve approximately; optical transmission is not claimed.
- Tri-Stringer: rectangular tapered wood laminations with metal sockets, three separate cartridge/nozzle bodies, rear cage, clamps and support grip. Ink is on exposed cartridge surfaces rather than hidden inside a metal cylinder.
- REEF-LUX: broad curved flat limbs, grooved cam wheels, offset cables, cast central can with rear vent and threaded nozzle, label and window.
- Wellstring: thick open hydraulic C-clamps with joint bosses, piston shafts/collars, open eyelets, cast pump cylinder, plaque, blue hose, plunger and five open brass outlets.

## Preservation boundary

No gameplay runtime, weapon parameters, hand anchors, muzzle sockets, hold overrides, existing motion functions, shared kit, registry, collision, paint, network or projectile clocks are changed. The six old muzzle coordinates are explicitly asserted. Geometry stays cached in the existing model definition. No new per-frame geometry allocation or draw surface is introduced.

The reconstructed surfaces are image-based approximations. Absolute scale, source animation, hold parity and Switch-side performance remain unverified. There is no new retail-parity or official-dimension claim.

## Validation so far

- Unchanged baseline: all five selected model / hold / bow / slash tests pass.
- Rebuilt Splatana source: the five model / real Actor hold-and-attack / bow / slash tests pass.
- Rebuilt Stringer source: the three model / real Actor hold-and-attack tests pass.
- New dedicated regressions: 3/3 pass. Cached geometry, existing sockets, material batching, bounded triangle/byte counts, a true Stamper grip opening and raised Decavitator finger ring, all three bow channels and 30/60/120 Hz input-state immutability are checked.
- Current source geometry triangles: Stamper 5,384; Wiper 3,880; Decavitator 5,824; Tri-Stringer 7,140; REEF-LUX 8,224; Wellstring 9,804. Each remains below the existing 16,000 cap. These are cached whole-weapon geometry counts, not an FPS result.
- Local production build succeeds, content hash `6c466f43da83`; diff whitespace check succeeds.
- Existing optional source-motion dynamic-import warnings also occur on the unchanged Node baseline. The browser test loads the actual production motion assets.

## Required before acceptance

The dedicated exact-head CI builds baseline and candidate on the same runner and captures side, top, front, three-quarter, rear and actual Actor-held views for all six. It checks finite poses, grip error, unchanged muzzle position and draw calls. It measures fixed-pose rendering with an explicit GPU completion boundary (20 warmups / 80 measurements, 500 px canvas). This controlled SwiftShader component comparison is not whole-game/mobile FPS. Multi-angle visual review and exact-head full CI are pending; this is a Draft, no merge requested.


## First exact-head visual review (c1a3c98a)

[Both Chromium review jobs succeeded](https://github.com/rhgrive3/actions/actions/runs/38205025215). Actual downloaded comparison sheets were inspected, with fixed cameras and projection scales shared across before/after. The official photos have unknown camera parameters; their orientation is not mislabeled as an exact matched projection. All six after models show their side/three-quarter/front/rear geometry and actual production Actor hold. The dedicated artifacts retain 500px originals, top views and additional held states.

Observed improvements: Stamper now has an open grip and a genuine depth-bearing framed belt; Wiper has a separated return spring and open truss instead of a thin black bar; Decavitator gains a collar/ring/windowed body; Tri-Stringer has rectangular laminations and rear supports; REEF-LUX has flat curved limbs and actual pulley depth; Wellstring gains its characteristic open cast C-clamps and pistons. The front view makes the former thin-plate approximation especially clear on Wellstring and REEF-LUX.

Remaining visual differences, not claimed resolved: Stamper teeth and tapered stamped side plates are still stylized; Wiper's frontal thickness and spring winding are approximations; Decavitator uses an opaque pale sleeve and fictional thin glyphs, with no transmitted internal optics; Tri-Stringer barrel spacing and wood section profile are image-derived; REEF-LUX side profile/pulley routing is simplified; Wellstring cast-arm facets and plaque are approximate. The rear/oblique views are the strictest remaining test for cartridge depth and the Decavitator shell. Physical Nintendo units and animation are not measured.

First review costs (model definitions include merged whole-model plus static/channel geometries): before→after geometryKB = Stamper76→254, Wiper60→191, Decavitator51→287, Tri228→330, REEF287→395, Well216→461. Actual Actor draw calls remain12 for each Splatana and18 for each Stringer. Fixed-pose single-Actor p50 completion-boundary time is0.2–0.4ms and p95 is0.3–0.7ms. This very short single sample does not establish equivalent GPU or whole-game performance, and is not an adoption gate by itself.

## Refinement and expanded verification

The inspection identified an overly dark metallic Decavitator grip/ring, now changed to the shared satin surface. The Stamper finger aperture was moved above the unchanged grip axis, and the Wiper handle was centered on that same unchanged hand anchor. The changes keep all muzzle/hand socket values intact. Printed flat labels no longer use needless rounded-box rings: geometry counts become5096/3990/5824/7068/7864/9012 for Stamper/Wiper/Decavitator/Tri/REEF/Well. The reference-bearing silhouette and volumetric frames remain.

The whole source suite completed4914 tests,4895 pass/19 skip/0 fail during this development pass. Because later geometry refinements followed the initial commit, exact final-head CI remains required. The refined actual emitted build has passed6/6 model/Actor/structural/animation checks. The dedicated structural ray test uses emitted scalar triangles; it does not require a Raycaster export removed by production tree-shaking.

A separate same-runner ABBA protocol now measures8 real Actors with all6 revised weapons simultaneously, in bothgame andfar LOD. It reports animation CPU, render submission CPU, time through GPU completion, draw calls, triangle count and visible geometry buffer bytes. These are controlled component timings; GPU completion wait is not reported as isolated GPU time. Exact-head images, complete CI and these eight-Actor results are pending for the refined revision.

Parent review of the first sheets requested a fuller Tri-Stringer central cartridge and a less dominant Decavitator cap. The turntable confirms that Tri cartridge colour is team ink (green there, orange in this gallery); the neutral official static render is grey. Its central visible cartridge is enlarged from diameter0.10/length0.23 to roughlydiameter0.126/length0.28, with three dark clamp bands; the outer nozzle and grip coordinates do not move. The Decavitator cap is reduced from about1.33× to1.24× the sleeve diameter and receives its shallow lid step/mark. These refinements require the next fixed-camera review rather than inheriting the initial image acceptance.
