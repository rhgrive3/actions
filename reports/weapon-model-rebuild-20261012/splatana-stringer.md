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
