# Explosher flight-glitter candidate, 2026-10-21

## Scope and evidence
- User asked for Explosher attack splashes closer to Splatoon 3.
- Initial official main inspected: 95c25af145418691991a1452d4d10589754a0f1c.
- Publication base: 7581ca9be8cf87d253918b8abb3b8ebe728c2093. The owned s3-projectile-shapes.mjs is byte-identical between those heads (blob 83a76f51f56cffdf66bca6e16c56dd18b2c06f93).
- Actual flight owner: s3-projectile-shapes.mjs -> appendS3ShapeBlobs (ink core) and drawS3Shapes (white points). projectile-visuals.mjs yields this native owner; its generic explosive mesh is not the rendered production flight.
- Launch currently uses catalog notify/muzzle. PR 1738 owns its pose/birth connection; this change does not touch that route.
- Impact currently routes through catalog finishContact/explosion -> FX.explosion. It is unchanged. Existing shell arguments .09 and .34 are expansion/lifetime seconds, not alpha; alpha is 1.

## Reference boundary
The independently viewed isolated range image shows a dense, uneven yellow ink core, unequal white/pale highlights nearby, and spaced flecks extending below it:
https://assets.st-note.com/production/uploads/images/131613256/f7f65af054c4a2c63e8891f00c61123c.jpeg

This is a static third-party gameplay image, not an extracted effect or a frame-timing measurement. The 35.0 hit display does not make the airborne glob an explosion. The large sheet near the player cannot be assigned to launch versus an earlier impact from this frame alone. The retail patch version is unverified.
The previous repository comparison records Bilibili BV1zW4y1e7de at 34–37 seconds; that video has not been replayed for this candidate. No timing/alpha value is asserted to be a Nintendo parameter.

## Proposed flight-only adjustment
Replace the large rotating spherical glitter envelope with a compact uneven neighborhood and short backward/downward shedding. Existing core geometry, 28-point cap, point material, shared draw submission and 60-unit cull stay unchanged. Flecks shrink as they shed, without adding transparent passes, particles, histories, vectors, arrays or buffers. New numeric values are explicitly INKWAVE presentation calibration, pending visual review.
No damage, paint, projectile position/velocity/age/lifetime, RNG, network packet, muzzle or impact code is edited. Wiper edits in the same file own only horizontal-sweep helper/fireInk/slash branches and were coordinated separately.

## Completed narrow checks
The actual drawS3Shapes function was evaluated in a minimal in-memory renderer stub for 50 seeds x 120 ages (6000 draws, 168000 points per side):
- 28 points per visible Explosher, finite coordinates/sizes, no physical object mutation.
- Maximum point size: 0.15982 -> 0.10880.
- Mean squared point size: 0.008988 -> 0.001951.
- Highest point relative to the core: +1.0644 -> +0.3945.
These are arithmetic/render-function checks, NOT real GPU, full production gameplay or retail measurements. Lower squared size does not prove GPU milliseconds.
The native capture wrapper was exercised against stub file/process inputs; all replacement anchors matched and its generated ES-module driver parsed.

## Pending acceptance
Local full native capture was blocked by executor disk exhaustion and Chromium socket restrictions. A permitted loopback read-only server started, but the separate cloud browser received connection refused. No alternate host, tunnel, new public preview or protected-path workaround was attempted.
The dedicated PR workflow checks out immutable PR base and exact head separately, builds both without source/character/history rewriting, reuses the existing native Explosher range driver, and records:
- source identity, build manifest, emitted module hash and bytes actually served;
- 18 native screenshots at 0/3/8/14/22/30 ticks, behind/tele-side/tele-oblique;
- same scenario seed, clock, camera, light, viewport and physical states;
- draw/triangle/point counts, resource counts, reused buffers and CPU draw/submit timing.
GPU elapsed time and exact JS allocation counts remain explicitly unmeasured. Visual similarity and CPU timing require review; gates do not auto-approve those. No merge or deployment until images and load evidence have been reviewed. Muzzle and impact fidelity remain separate unfinished phases.
