# INKWAVE projectile / range / VFX verification (Splatoon 3 Ver. 11.3.0)

Base: rhgrive3/actions main `ed3a046574208471c5db5309e2469d263cacfdfd`.
Owner: projectile motion, world/player collision, finite reach, and visual effects only.
**The scoring/footprint functions and paint ownership are not modified; lane ③ remains authoritative.**

## Provenance

- Raw source: Leanny/splat3 commit `7280ff9cde8bb1c5dcef46c700c326471584d2e6`,
  `data/parameter/1130/weapon/WeaponSlosherDiffusion.game__GameParameterTable.json` and
  `WeaponSlosherBathtub.game__GameParameterTable.json`. Native `UnitGroupParam.Unit[*].DrawSizeParam`
  supplies per-bullet radii and `TailLengthMin/Max/TailSolidFrame`.
- Bloblobber bounce semantics and visual shrink: Inkipedia
  https://splatoonwiki.org/wiki/Bloblobber (Splatoon 3 > Data).
  Two *floor* bounces, unbounded *wall* bounces (within finite projectile
  lifetime), x0.8 wall speed, x0.75 radius per bounce.
- E-liter source reach: `WeaponChargerLong`: 9.045 min, 29.05 fully charged.
  Scoped Splat Charger: `WeaponChargerNormalScope`: 9.033 min, 24.037
  max partial, 26.037 fully charged. Keep the source's full-charge discontinuity
  where present instead of forcing every variant through a guessed multiplier.
- Shooter and long-range shooter visual dimensions: sparse `CollisionParam`
  values do **not** define a mesh radius. Cross-section cap 0.045-0.08 and
  compact smooth rod silhouette are INKWAVE presentation calibration.
  Hit radii, velocity, damage, lifetime, paint footprint and detached paint
  droplet count remain independent.
- Reference context: Google Drive's `Splatoon-Decomp-NTSC-thick-plus-Splatoon3-resources` folder
  (Splatoon 1 disassembly and Spr3 resources), plus the Ver.11.3.0
  Leanny-derived profile. Initial source hierarchy prioritizes 11.3.0.
- Related Drive reference: `SplatoonSWEPs-Roller-VTF-20261011` folder
  includes v6 roller splash/muzzle-ring previews and original VTF sprite
  research packages. Original game/SWEPs VTF image data are **not copied**
  into this public PR (licensing/provenance not established); they are visual
  references, not exact S3 engine parameters.
  https://drive.google.com/drive/folders/1vL03H7ZXjKWp-cZ3cw9vwdqW5-keSKSJ
  Do not present extracted source values as a recovered Nintendo animation mesh.

## Changes

1. Catalog Sloshers no longer render as generic Shooter heads: native per-unit
   draw radii/tails drive the instanced **sheet** look; Bloblobber stays spherical.
   A sourced zero-radius unit is invisible, but retains normal collision/damage.
2. Bloblobber rebounds reposition its centre outside the swept field collider.
   Walls can rebound throughout finite life, at 80% velocity. Two floor
   rebounds then termination on the next floor. Collision and drawn radii
   reduce by 25% each rebound. Remote ghost projectiles replay bounce visually
   without an extra paint owner.
3. Catalog Shooter/Splatling/Dualies rounds use source-independent compact
   draw radii with the existing two-frame rod geometry rather than huge balls.
4. The Roller landing keeps a visible ephemeral ink crown, **paint:false**;
   catalog flicks also get a dedicated visible impact sheet. No extra turf
   splats, ownership modifications or emitted paint-impact events are added.
5. Charger finite trajectory, minimum/partial/full source ranges are protected
   with executable flight-endpoint tests; no unjustified stage-scale change.

## Limitations and verification

- Absolute renderer pixels, authored textures and console-perfect fidelity
  remain unverified; numerical source pin does not prove Nintendo mesh shape.
- Original ground-impact paint geometry and bubble bounce-paint falloff belong
  to lane ③ and deliberately remain unmodified.
- Confirm build-patch adapter and the targeted Node tests in CI. Browser GPU
  pixel/video A/B parity needs a comparable 11.3.0 reference capture.

## Source-simulated in-flight Shooter drops

Existing catalog `_s3SplashDrops` objects are the authoritative fixed-60Hz
falling droplets for touchdown/paint but previously had no airborne visual.
The instanced renderer now reads the **same** positions and velocities, capped
at 48 display-only instances per frame and 30 world units from the camera.
It never spawns additional paint drops, modifies the landing event, changes
collision/damage or claims territory. Sprite width remains a labelled local
visual calibration because Nintendo's sprite-mesh size is not in these tables.
