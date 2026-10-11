# INKWAVE alpha volume engine — local original-asset verification

Work began from latest main `bf38901475fa857016cf06bcc98cd764898795d0` on 2026-10-11. PR #401 was not inspected or changed. The upstream `inkwave-public/` source remains intact; the existing production source composition adds the renderer.

## Architecture and integration

`patches/local-quality/ink-volume/` separates VTF decoding, alpha/distance analysis and mesh construction, pack reading, GPU batches and the first weapon recipe. `ink-volume-adapter.mjs` connects FX-owned registration/disposal/lighting/telemetry to the actual Projectiles `_draw()` pass. The firing, flight, collision, damage, paint and network packet logic retain their existing owners and values. Only horizontal Roller `drop` heads registered to the new renderer are drawn through it. Vertical flicks and other weapons retain their current presentation.

Both local and replicated projectile births snapshot the shot's weapon identity and world direction. The existing projectile generation guards pooling; a WeakMap holds each rendering orientation without keeping dead rounds alive. A source is submitted at its actual `p.pos` and `p.age`; camera changes and gravity do not rotate the sheet toward the viewer. Visibility culling, triangle and instance caps only limit presentation. Over-budget heads keep the existing game renderer rather than affecting scoring or collision.

The engine exposes `FX.registerInkVolume(name, decodedPack)` and `FX.loadInkVolume(name, manifestURL)`. Additional weapons can add a small recipe calling `engine.submit(name, source, worldSize, pattern)` in their existing render pass. Pack dimensions, frame count and FPS are independent of weapon physics. Gameplay does not run VTF decoding, contour analysis, simplification or mesh construction.

## Geometry and original pixels

The decoder supports VTF 7.0–7.2 RGBA8888/BGRA8888 and DXT1/3/5 with explicit rejection of unsupported environment-map/depth layouts. It reads every original high-resolution frame, after the thumbnail and lower mip levels, without changing source bytes. Both Roller textures are DXT3. An independent Pillow DDS decode compared **all RGBA channels of all 32 frames: zero differences**.

A padded source-resolution alpha lattice clips triangles at half an alpha byte. Empty areas, internal holes and isolated low-alpha components remain separate. Covered interior tiles share edge cuts; adaptive triangulation has no T junctions. The front and reversed back share UVs/XY; every open front edge generates two side triangles, including hole edges. Chamfer distance from the original support mask controls local width and thickness. Only this derived field is smoothed to round medial-axis ridges; the original image/alpha is never blurred, redrawn, normalized or replaced. An upper-position bias and asymmetric back ratio distinguish broad lobes and thin membranes. All thickness/shape settings are INKWAVE art parameters, not official values.

The offline simplifier locks every source contour and its first interior ring. It works on the front 2D triangulation with height as an attribute; the back reuses that topology. Folded/zero-area candidates protect the implicated original neighborhood and retry; unsafe candidates retain the original geometry. It never prunes disconnected components. Both LODs retain all original boundaries, holes, source pixels and 16 animation frames. Normal vectors are evaluated from the same height field before simplification, normalized, and stored in the pack. The material uses world orientation, real geometry normals, environment light and restrained specular; source alpha remains separate from light/gloss.

Registration assembles source pixels into separate per-pattern atlases with no mipmap resampling. It creates all 32 shared frame geometries × 2 LODs before shooting. Each pattern shares one material/texture; each frame/LOD shares an instanced batch and preallocated update ranges. The default cap is 128 instances and 400k volume triangles, scaled by the existing FX quality multiplier. Distance LOD is 22 game units; culling is 65 units. These are tunable rendering settings. The engine has no new WebGL extension requirement beyond the game's current Three/WebGL renderer.

## Rights and original-source findings

Local checkout: `https://github.com/zerokizo/splatoonsweps`, commit `a74592726f38f26fd1d3a15ed315701068283847`. Its README describes Wii U/first-generation Splatoon and requires Team Fortress 2 and Enhanced Inklings. No repository LICENSE or redistribution permission for the VTF/VMT/PCF/models was found. Neither original nor derived assets/screenshots are committed or published by this PR. The locally generated pack contains original pixels and must remain private until redistribution rights are established.

Inspected files:

- `materials/splatoonsweps/effects/rollerink1.vtf`: 256×256, 16 DXT3 frames, one mip. `rollerink2.vtf`: 128×128, otherwise same animation layout. Both corresponding VMTs use UnlitGeneric, translucent, no culling, vertex color/alpha.
- `lua/effects/SplatoonSWEPsShooterInk.lua`: selects one of the two patterns; `RenderSplash` uses `min(floor(lifetime*30),15)`, holds the last frame and draws a quad at five times DrawRadius. Init captures `-LocalPlayer view forward` plus perturbation **once**, not every render. INKWAVE uses shot-world direction instead of copying that spectator-dependent initialization.
- `SplatoonSWEPsRollerSplash.lua`: PCF muzzle effect follows the `roll` attachment (`tip` for brushes, `spout` for the alternate flag). It is distinct from the flying Roller VTF sheet.
- `SplatoonSWEPsMuzzleRing.lua`, `inkring.vtf`, `inkringn.vtf`, and both ring VMTs: ring is a separate procedural curved strip with lifetime/angle/width changes, not the Roller sprite. Ring textures are 128×256, one DXT5 frame, nine mip levels. No muzzle-ring or original projectile physics was transplanted.
- `particles/splatoonsweps.pcf`: parsed as binary DMX 2 / PCF 1 using srctools. Roller splash is a particle-system definition with maximum 1000 and `particle/particle_glow_01.vmt`; rolling references `particle/antlion_goop3/antlion_goop3.vmt`, plus `particle_glow_05_additive`. These are external Source-game particle materials, not this engine's mesh specification.
- Splat Roller Source MDL v48 view/world models: viewmodel has 43 bones with `root_1 → neck_1 → roll_root_1 → roll_1`; `roll` attachment is on bone 41 (`roll_root_1`). Left/right world models have 5 bones, with `roll` on bone 3. Model coordinates/attachments were inspected locally, but none replaces INKWAVE's current rig or muzzle.

The supplied `splatoonsweps_RollerSplash_MuzzleRing_v6_ATTACHMENT_FIX.html` (SHA-256 `6300b626d3efd3e3a28f07071507a2ce7ee8e9be487cccb4065bd9f699ac9e7f`) was fully separated into its five scripts and inspected locally. Its embedded two 4×4 PNG sheets match all 32 original alpha frames and all visible RGB bytes; RGB in fully transparent pixels differs, so this engine decodes the VTF directly. The prototype draws six vertices per flying quad without depth testing or geometry normals; its enhanced mode bakes RGB highlights into a Canvas image. Neither technique is used for the volume. Its default OSS mode captures a camera-derived normal once, while its optional velocity mode changes orientation during flight. This engine snapshots world shot direction once.

The prototype's 12-shot first-generation physics, `UNIT=.045`, approximate birth-to-muzzle interpolation and demonstration hand root `[0,.62,-1.11]` are not INKWAVE gameplay parameters. Its model-rest `roll` attachment metadata and separate 672-triangle MuzzleRing/16 PCF particles were cross-checked; the original/ enhanced front, side, oblique and top views were rendered locally. The optional external Valve glow dependency was unavailable in this comparison and remained hidden, with no substitute. The HTML and its embedded images are local-only. Splatoon 3 Ver.11.3.0 exact visual/physical-device footage is not available here; this work does not claim a retail-perfect match or official thickness, shine, FPS, physics or geometry values.

## Reproduce with legitimately available assets

```sh
npm install --no-save --no-package-lock esbuild@0.28.2 playwright@1.62.1 meshoptimizer@1.3.0
node scripts/bake-inkwave-volumes.mjs .reference-data/roller-volume \
  /path/to/SplatoonSWEPs/materials/splatoonsweps/effects/rollerink1.vtf \
  /path/to/SplatoonSWEPs/materials/splatoonsweps/effects/rollerink2.vtf
node scripts/verify-inkwave-volume-pack.mjs .reference-data/roller-volume \
  /path/to/rollerink1.vtf /path/to/rollerink2.vtf
node scripts/build-inkwave.mjs inkwave-public .built-site/volume
node scripts/check-inkwave-volumes.mjs .built-site/volume \
  .reference-data/roller-volume .browser-evidence/ink-volume
```

The verification server serves the pack only under its private `/local-ink/` route. To use an authorized pack in an actual deployment, set `globalThis.INKWAVE_INK_VOLUME_URL` before the game's module boot, or call `await window.__G.fx.loadInkVolume('roller', '/authorized-pack/manifest.json')` after boot. Registration completes before the new renderer is used; a failed/missing pack retains the existing renderer. FX exposes `inkVolumeReady` and `inkVolumeError` for deployment diagnostics. Manifest and binary must share an origin and SHA-256 must match. There is no automatic public download of third-party assets.

CI generates explicitly authored structural test data using `create-inkwave-volume-fixture.mjs`; it is not a replacement artwork or evidence of matching Splatoon. The exact emitted-game connection is exercised in both local original-asset runs and CI fixture runs. CI uploads fixture images and metrics only. Original-source images remain in the ignored local evidence directory.

## Verification and limits

Results and measurements are recorded in `results.md` / `measurements.json`. Front comparison uses orthographic rendered alpha at 512×512 for all 32 original frames. Byte-for-byte source preservation, mesh validity and rendered raster agreement are separate checks; rasterization at clipped/bilinear edge cells need not be byte-identical to a full plane. Six camera directions and an oblique 16-frame image sequence are saved locally. The native game run fires through real input in the Practice Range, follows flight/landing, compares its existing renderer against the registered volume renderer, and checks repeated match resets.

No arbitrary new physics, damage, paint or muzzle constants enter gameplay. Physical iPhone/Android/iPad measurements, retail Ver.11.3.0 equivalence, unrestricted overlap order for translucent instancing, licensed public asset delivery and original prototype comparison remain explicit limitations. This renderer does not implement order-independent transparency; the existing opaque-ish ink alpha and depth test/write are used. Offline asset-cache policy is unchanged; external volume packs are not automatically added to the 10 MiB PWA snapshot.
