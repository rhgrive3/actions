# Ballpoint transparent shell and hypothesis checks

Base: adopted main b078c37907351f1bbc13d0e7d4b5cbeb0a330009. Procedural geometry only; no retail meshes/textures. This change does not merge or deploy. Mini/Nautilus and Quad/Explosher model work is independent and its functions are untouched.

## Findings against references and actual source

- Dapple Dualies (`s3-maneuver-short`) and Glooga Dualies (`s3-maneuver-gallon`): the alleged left-only reversal is not reproduced in the current main model. The toothbrush and hose are authored on X=0, so an X mirror would not change their central position. Actual Actor/Runner firing measurements put the toothbrush at right (-.086,.853,.176) and left (.093,.855,.183), and the Glooga hose at right (-.084,.927,.242), left (.091,.928,.246). Both muzzles point forward. No speculative mirroring mechanism is added. Idle/walk/fire and both side-view images are required for the final visual conclusion; source checks alone are not retail parity.
- Ballpoint (`s3-spinner-downpour`): main has no transparent shell at any distance. It approximates one with opaque longitudinal struts/rings, and an oversized opaque ink cylinder covers the six internal barrels. This is not specifically a far-LOD material failure. Replace these with one transparent sleeve and six animated ink tubes, preserving the grip, muzzle and part pivots.
- Standard Sloshing Machine (`s3-slosher-launcher`): current front frame/bezel already uses neutral body vertex colours. Keep it unchanged. PR1246's standard `refs/s3-slosher-launcher.3d.png` is graphite/silver/cream; its `rotsheets/s3-slosher-launcher.rot.jpg` is the blue Neo variant. Do not transfer that variant's paint onto the standard model.

Reference bank: https://github.com/rhgrive3/actions/tree/b078c37907351f1bbc13d0e7d4b5cbeb0a330009/reports/inkwave-weapon-model-workspace

The normal Ballpoint 3D image supplies colour; its rotating sheet is Nouveau, useful only for shared shell form and internal visibility. Dapple/Glooga rotating sheets were inspected from multiple angles. The images are derived from retail references, not measured retail gameplay or exact physical dimensions.

## Rendering contract and cost

The shared optional `glass` geometry is never merged into opaque body/ink channels. It stays the same 64-triangle mesh at near and far LOD. One singleton physical material uses opacity .22, FrontSide, depth test on, depth write off, ordinary transparent sorting and no shadow casting. Transmission is zero: no screen-space refraction pass. One additional draw per visible Ballpoint is expected, with fewer total model triangles after deleting the pseudo-shell bars/rings and oversized fill. Shared material and geometry survive Actor disposal and are reused after switching weapons; no per-frame geometry/material allocation is added.

## Verification

Source regression covers stable glass/material identity, near/far/hero transitions, recolouring and disposal, bilateral Dapple/Glooga appendages and forward muzzle/socket agreement through idle/walk/fire, and the standard silver Sloshing Machine bezel. Initial source checks pass 3/3; existing 4-weapon geometry/actual Actor checks pass 3/3. Production build succeeds. Final exact-head built checks, actual browser shader pixels, images, and ABBA costs are recorded below when available.

CI uses immutable main and candidate production builds on one runner. It renders identical cameras and fully loaded source animation, dark/light backgrounds, orange/blue ink, actual Actor near/far, and a shell-only background pixel test with the production material. Eight mixed actors contain two Ballpoints, two Dapples, two Gloogas and two Sloshing Machines; game/far ABBA records animation, CPU submit, GPU-complete time, draw calls, triangles and geometry bytes. This controlled Chromium SwiftShader Actor workload is not a measured phone/desktop FPS result or a full live multiplayer match.
