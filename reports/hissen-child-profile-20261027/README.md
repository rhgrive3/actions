# Hissen floor-child analytic profile candidate

Base: `9b2b8f70cc35f630c87bcd80e728654cc7102dd8`. This separate candidate answers the explicit complaint that floor-paint children look like balls unrelated to the main ink. **It is a visual-coherence change, not a measured retail silhouette/size match.** No candidate browser run, publication or frozen-head edit was performed here.

## Actual before pixels and bounded change

The preserved automatic catalog artifact `12732101436` (ZIP SHA-256 `4d27f9d7175a6a45bb6c920f9436b1e25c0e196810ea3a7024d9b1adfd357879`) contains the original `hissen-main/main-birth-f05.png`, `main-birth-f07.png`, `main-birth-f09.png` and `native-browser.json`. The raw F9 PNG was viewed locally. Its two children are small round balls beside the main sheets: sourced draw radius `.3`, unchanged uniform instance scale `.15`, ages 1/0F. Independent inspection found 17/17 positive-source main submissions correctly use their source radius/tail matrices. These main lobes are not rescaled by this candidate.

`appendSourcedSplashVisuals` previously gave every Hissen child the Shooter falling-bead rim/thinness `[.12,4,.9]`. Only `WeaponSlosherDiffusion` now selects the **already shipped analytic Slosher profile** `INK_LOOK.slosh`, `[.3,4,.32]`. The existing shader uses these values for a ragged liquid rim and world-up-thin cross-section, so the child becomes a small ink flake rather than a near-sphere. The `.32` is an existing INKWAVE calibration, not an extracted Nintendo child parameter. This does not reproduce the perforated main contour.

The child keeps its exact source draw radius, `.5` Bucket uniform scale, captured horizontal paint heading, physical position, speed-dependent short tail, wobble/phase, team color and shared material/lighting. Position, velocity, RNG, lifetime, count, pool, paint, collision, damage, network and source tables are unchanged. Other weapons retain their existing bead/strand profile. No child is hidden and no main, character, hair, model or palette is edited.

## Cost and resource ownership

The actual composed renderer uses the existing indexed `SphereGeometry(1,40,18)`: **1,360 triangles per child**, within the same instanced blob draw and 700-slot pool. Thus F9's two children remain 2,720 triangles; the existing 48-child cap remains at most 65,280 child triangles. The delta adds zero draws, triangles, geometry, materials, shader variants, buffer capacity, asset requests or per-child allocation. The same shader branches already consume both old and new positive rim/thinness values. Hardware frame time and overdraw are not measured.

Reusing the main contour would cost up to 5,852 triangles/body and require a different submission owner, so it is not used. The `.5` matrix scale is intentionally unchanged: shader-deformed visible bounds change, not the source radius or physical footprint.

## Local checks

`local-tests.txt` contains the exact commands/output, Node v24.22.1:

- Source: **62/62**, zero skips (5 floor-child, 15 observer/driver, 42 surrounding renderer/shape/budget checks).
- Newly built optimized emitted site: **20/20**, zero skips (5 floor-child + 15 catalog/mixed-pool checks).
- The old `d88c0455…` emitted site **fails** the new all-three-kit profile regression with `[.12,4,.9]` instead of `[.3,4,.32]`. It is a negative control, not a candidate failure or fresh browser result.
- All three Hissen kits, source radii `.2/.3`, ages 0/1/4/12F, nonconstant counted RNG, exact positions/scales/headings, unchanged resources, other source actors and existing culls/caps are checked in the actual production-composed/emitted draw. The real firing/CPU-paint test remains identical with/without drawing at 30/60/120Hz.
- Build and startup dependency/byte gates pass. All 2,199 emitted-file hashes were checked; mismatch zero. `build-identity.json` records the manifest, builder and changed module hashes. There are 1,492 `manifest.files` entries plus the separately recorded builder = **1,493 inputs**.

This **changes shipping runtime bytes**: content hash `d88c045597751993ae7fa4047046eadab15e09a6440e5ab6f8ac10913a7ebeb5` becomes `4ec03d518cef7c5385a97c533fad0b24b6cfa883dbe883c169c11ba1bc60d630`. The sole source-input delta is `projectile-presentation.mjs`; version namespace/index/worker/asset-manifest references are regenerated. CPU tests do not establish actual after pixels.

## Executable after-pixel gate

The existing automatic catalog step remains the route; no new workflow or manual dispatch is added:

```sh
node scripts/check-inkwave-trislosher-native-matched.mjs <immutable-site> <new-evidence-directory> --measure-main
```

The same controlled native replay captures first-observed-birth-relative F5/F7/F9, with the same actor/camera/seed/palette/gear/lighting protocol as the preserved before artifact. It is **not ordinary-input firing or retail timing**. Measurement-only child rows now passively copy their position-correlated native slot, full instance matrix, source actor/seed, actual shape/ink-look attributes and triangle count. They are explicitly shader/profile metadata, **not alpha/depth-tested visible pixels**; default historical18F rows remain unchanged.

After independent review and a parent-coordinated normal push, require the automatic `inkwave-browser-catalog-H` artifact's `hissen-main/` receipt to bind the exact new checkout/input/content/manifest/harness/observer identities. Compare before/after camera/projection, first birth, seeds, style/palette/gear, main/drop physical traces, paint count and matrices, allowing only the intended shader profile and expected build identity differences. Read the actual raw F5/F7/F9 PNGs: the F9 children must still be visible ink fragments, not disappear through thinning or occlusion. Do not use hidden-object differences, recoloring or a changed camera to obtain that result. A future failed, skipped or missing capture is not acceptance.

The private reference has no established individual child identity, matched phase/depth/camera/version/gear. No private/Nintendo media or URL is copied here. Main-size agreement, precise retail child morphology, ordinary-input/browser performance and candidate after-pixel acceptance remain open.
