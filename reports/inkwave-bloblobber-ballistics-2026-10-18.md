# Bloblobber flight, horizontal aim and premature midair retirement (2026-10-18)

## Target and direct evidence

- Game: INKWAVE, shipped `inkwave-public/` composed with `patches/splatoon3/runtime/main-weapon-catalog.mjs` at build time.
- Comparison target: **Splatoon 3 Ver. 11.3.0**, `WeaponSlosherBathtub` (`s3-slosher-bathtub`).
- Primary numeric source: pinned Leanny/splat3 revision `7280ff9cde8bb1c5dcef46c700c326471584d2e6`, `data/parameter/1130/weapon/WeaponSlosherBathtub.game__GameParameterTable.json`, included in `main-weapon-catalog-data.mjs`.
- Cross-check: [Inkipedia S3 Bloblobber > Data](https://splatoonwiki.org/wiki/Bloblobber) and [Japanese ballistic explanation](https://macarongamemo.com/entry/splatoon3-weapon-bullets).

## Repro and root causes in main 57de1208

1. `mode(...,'slosh')` gave **every** catalog glob an assumed **1.2 second** life, with no separate Bloblobber exception. The `P._step` lifecycle unconditionally terminated bubbles when `p.age >= p.life`, including at heights where they had not yet completed the source's terrain bounces. High shots thus visibly vanished midair. This is a code-confirmed artificial cutoff; no numeric lifetime is exposed in the pinned Bloblobber unit record.
2. `emitUnits` called the generic `G.projectiles._aimFrom()`, which aims from the muzzle **at the current reticle world intersection** rather than following the player's view direction. Where the camera ray sees a nearby patch of ground, this tilts a nominally horizontal Bloblobber launch steeply downward. This is particularly wrong for a freely lobbed bubble whose source unit already defines a separate `AddSpawnSpeedYRateByXZ = 0.2` lift.
3. The previous generic Slosher lift `speed * AddSpawnSpeedYRateByXZ` was based on full 3D speed, although the named source field applies an **XZ-speed** factor. At steep pitch that over-adds vertical speed and exacerbates the unnatural high arc.

Previous PR #1305 correctly added two floor bounces, wall reflection/damping, hitbox shrink and separate paint ownership. Those repairs alone do not protect a long ballistic arc from the generic life cutoff, or a horizontal shot from a reticle-ground depression.

## Fix in this PR

- Use the player's actual admitted `aimDir` for **Bloblobber only**, while still taking the collision-safe muzzle position and retaining the originally sampled/deferred birth direction. Other Sloshers and Shooters keep their reticle convergence.
- Interpret Bloblobber `AddSpawnSpeedYRateByXZ` against horizontal launch velocity; reuse the resolved factor when a delayed bubble changes its ground/airborne launch speed.
- Raise **Bloblobber only** from the generic 72-frame expiry to a **240-frame (4 s) fallback cleanup**. The third physical floor contact remains the standard retirement; wall rebounds still apply source 0.8 speed, two floor rebounds are allowed, and the existing 0.75 collision/draw and 0.85 paint-radius scales remain.
- **Important provenance:** the 240F upper bound is **INKWAVE's finite safety margin**, not a recovered Nintendo lifetime. It was selected to exceed the modeled ~200F near-vertical, ground-to-third-floor cycle under the pinned 11.3.0 launch/gravity/drag data. Exact retail high-arc cleanup duration remains unverified.
- Damage, turf ownership, weapon delay/spawn cadence, remote replay and other weapon families are deliberately left intact.

## Executable regression

`patches/splatoon3/tests/catalog-projectile-vfx-range.test.mjs` uses the real production-composed Actor → WeaponRunner → Projectiles volley and a flat oriented-box floor with the actual rounded-box sweep. It checks:

- All four physical bubbles emit from an accepted input.
- Horizontal camera input remains horizontal even when the world crosshair intersects nearby ground.
- The main bubble inherits its pinned 11.3.0 ground launch speed and XZ-derived lift.
- The flat trajectory travels beyond the previous short-reticle case and ends only at its third terrain contact.
- A 60-degree launch survives beyond frame 72 and ends after two real floor rebounds, before the 240F safety deadline.

CI test results should be reported separately; the existence of this test is not evidence of an executing browser or an actual Switch A/B capture. No pixel-perfect or console-perfect equivalence is claimed.
