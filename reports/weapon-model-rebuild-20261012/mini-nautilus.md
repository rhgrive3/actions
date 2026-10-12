# Mini Splatling and Nautilus 47 reconstruction

Targets: `s3-spinner-quick` and `s3-spinner-serein`. Production composition is `inkwave-public` plus `patches/splatoon3`. Geometry is authored in JavaScript using the established Pieces/lathe/box/tube construction, without Blender or imported retail meshes.

## Current composition and scope

The final candidate is composed with main `bca45e7cb55f3331a58459ea0219e42b44762712` (tree `cc437da59713b09808cd5b5b8c8aae4a9e862c03`). The dedicated workflow compares that immutable main with this branch using the same cameras, lighting, actor states and runner. Earlier results against b078 or frozen425 are historical evidence, not current-main performance measurements. Exact final-head artifacts and status are linked in PR1276.

Only Mini and Nautilus builders change, plus the slab import. Heavy, Hydra, Ballpoint and Heavy Edit keep every geometry attribute/index byte, including their moving channels. The separate Ballpoint glass work needs an explicit combined integration baseline and must not be overwritten by copying this complete file over it.

- Mini: open purple side saddle and black motor, raised handle, rear pump lever, low offset egg tank and broad straps, six-barrel cage and midpoint clamp, thick yellow muzzle plate and six recessed blue outlets.
- Nautilus: asymmetric shell contour, smooth black-disc face, opposite shallow convex hub face with stamped shoulders, rolled silver lip, exposed ribbed neck, angular metal shroud, bearing gap, rotor and three hollow tips.
- No common kit, registry, character motion, gameplay, upstream source, paint or network implementation changes are introduced by this model work.

## Reference provenance and uncertainty

The four source images in PR1246 at `2555b20cb7757209b776ed48edf4c63e8c9f8329` were opened and inspected:

- `reports/inkwave-weapon-model-workspace/refs/s3-spinner-quick.3d.png`
- `reports/inkwave-weapon-model-workspace/rotsheets/s3-spinner-quick.rot.jpg`
- `reports/inkwave-weapon-model-workspace/refs/s3-spinner-serein.3d.png`
- `reports/inkwave-weapon-model-workspace/rotsheets/s3-spinner-serein.rot.jpg`

Important correction: `alt-kits.json` identifies the rotation sheets as alternate finishes, including **Nautilus 79**, not Nautilus 47. The sheets are used for shared geometry only. The verified Nautilus 47 still supplies the neutral metal/dark component boundaries. The earlier decision to retain black/gold was based on conflating finishes and has been withdrawn. The Mini still supplies purple/yellow hardware; its reservoir retains the established team-ink channel.

For Nautilus 47, the shell plate, rolled rim, sleeve, shroud edging, rotor and nozzle sleeves use neutral metal surfaces. The central black disc, hub inset, grips, rib gaps, exposed bearing and recessed nozzle throats remain dark. This is a per-component split, not a single silver override. The small team-ink cap/ring and native charge tell are retained as gameplay conventions. Exact retail material parameters and manufacturing dimensions are not known.

The gallery renders twelve fixed headings at 30-degree steps and 10.2-degree elevation, five additional views and real held states. Six distinct source directions are paired by muzzle axis, black-disc/silver-hub identity and neck attachment. The retail camera is unknown; nearest-direction comparisons explicitly retain yaw/pitch uncertainty. Both versions share one framing and one union crop. There is no pixel-parity score or claim of exact retail reproduction.

## Face-depth review

A diagnostic candidate `d13ad18276ca215946809fd397fac7870a6e8d41` made the lip visible but added excessive grooves to the black-disc face, while leaving the opposite hub face as a deep bowl. It passed functional/performance checks but was rejected on visual fidelity. Landmark pairing established the same face in reference and candidate, so changing camera yaw could not resolve that depth mismatch.

The shape-only correction `7e8e32606460c1deedd110be308c7f082f0c6c0a` restores the smooth black-disc side and makes only the opposite backing shallowly convex, with two shoulders. The maximum envelope, both hubs, neck, grips and muzzle remain fixed. The following material correction retains those position/index buffers and assigns the 47 finish independently. This avoids confusing shape, finish and lighting changes.

## Preserved contracts and local checks

- Firing origins: Mini `[0,.07,.334]`, Nautilus `[0,.07,.298]`.
- Both left grips `[0,0,.1515]`, right grips `[0,0,0]`, trigger pivot `[0,.0315,.0282]`, barrel pivot `[0,.07,.3]`.
- Actual Actor/Runner/Character checks at 30, 60 and 120 Hz require finite transforms, real projectile emission and support-hand error below .008m.
- Scalar triangle-ray tests require six/three recessed dark nozzle mouths, a visible neutral lip on both shell sides, smooth black-disc-side profile and raised hub-side shoulders.
- Metal/dark vertex classes are checked independently; alternate-kit gold is rejected.
- Current-main source checks: four target contracts plus three shell/material contracts pass. All-model registry/finite-geometry/actual-Actor checks narrowed to Heavy and both targets: 3/3 pass.
- Mini full definition triangles: 4584 → 6624. Nautilus: 4124 → 7396. No extra draw groups/channels. Triangle count alone is not performance acceptance.

## Historical measured evidence

Frozen PR1276 head `42505752ceb5a5e8480c6e8882563c58ba1cf189` completed dedicated visual/crowd and all general CI checks. See [exact-head run](https://github.com/rhgrive3/actions/actions/runs/38218353746). Its baseline was b078, Mini was 6624 triangles and Nautilus was 6604.

Eight recovered mixed Actors (four of each weapon) under controlled ABBA:

- game: 88 draw calls unchanged; triangles 293568 → 311648; visible geometry 1989116 → 2109716 bytes.
- far: 64 draw calls unchanged; triangles 84476 → 83892; visible geometry 605218 → 596862 bytes.
- game update p50 before 7.8/5.9ms, after 6.0/7.4ms; p95 before 12.6/15.2ms, after 12.0/12.3ms.
- far update p50 before 4.2/4.5ms, after 4.1/4.3ms; p95 before 8.6/8.4ms, after 8.1/7.5ms.

Shape-only 7e8e326 completed [its visual and crowd run](https://github.com/rhgrive3/actions/actions/runs/38224550926) against frozen425. The black-disc-side extra grooves are removed; the hub-face backing is shallowly convex with two visible shoulders. Real held views preserve weapon visibility and attachment. Game triangles 311648 → 314816 (+1.02%), far 83892 → 83608, draw calls 88/64 unchanged. Game update p95 before 11.9/13.0ms, after 11.3/13.8ms; far before 4.3/9.9ms, after 4.4/8.1ms. These mixed, variable samples do not show a consistent regression or a speedup.

Rejected d13ad182 completed [its own run](https://github.com/rhgrive3/actions/actions/runs/38221605291) against frozen425. Game triangles 311648 → 314528; far 83892 → 83700; draw calls 88/64 unchanged. It is not the accepted final geometry.

The first local aggregate had 4865 passes, 4 sparse-input import/report failures and 19 skips. Restored baseline inputs passed the affected 29 server and 1 report tests; the frozen-head remote full-checkout CI subsequently passed. Final current-main CI remains separately required.

## Browser measurement limits

The renderer composes the emitted production runtime and uses real Actor, Runner, Character and projectile emission. Charging is captured at frame110, actual streaming with four emitted shots at215, rear streaming at260 and recovery at430. The crowd benchmark begins only after every actor's recovery. Software rendering measures Actor-update wall time and render submission/completion with gl.finish; it is not GPU-only or mobile-hardware FPS. Timing variation does not establish a speedup. The isolated scene excludes stages, paint/network traffic and rendered projectiles, so full-match performance is not claimed.

No merge or deployment is performed by this task.
