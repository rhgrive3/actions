# INKWAVE Bloblobber source-backed trajectory follow-up (2026-10-18)

## Scope and baseline

- Source: pinned Splatoon 3 11.3.0 `WeaponSlosherBathtub.game__GameParameterTable.json` at [Leanny/splat3 `7280ff9`](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSlosherBathtub.game__GameParameterTable.json).
- Published empirical checks: [Inkipedia Splatoon 3 Bloblobber data](https://splatoonwiki.org/wiki/Bloblobber), [Splatoon3 攻略＆検証 Wiki](https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%82%AA%E3%83%BC%E3%83%90%E3%83%BC%E3%83%95%E3%83%AD%E3%83%83%E3%82%B7%E3%83%A3%E3%83%BC), [まかろんのゲームメモ](https://macarongamemo.com/entry/splatoon3-weapon-bullets), [オバフロちょこっとリファレンス](https://sites.google.com/view/spl3bloblobber/%E3%82%AA%E3%83%90%E3%83%95%E3%83%AD%E3%83%86%E3%82%AF%E3%83%8B%E3%83%83%E3%82%AF/%E3%82%AA%E3%83%90%E3%83%95%E3%83%AD%E3%81%A1%E3%82%87%E3%81%93%E3%81%A3%E3%81%A8%E3%83%AA%E3%83%95%E3%82%A1%E3%83%AC%E3%83%B3%E3%82%B9).
- User-provided `splatoon3_research_v3_audited.pdf` and its source ZIP: focuses on shooter dispersion, probabilistic hit rates and projectile simulations. It does **not** measure Bloblobber's actual engine lifetime or per-frame bubble camera aim. Do not extrapolate its shooter models into these unknown values.
- Code baseline: `rhgrive3/actions` main `0136cc8aadef23a92680f80486439a6fbd590541`, building `inkwave-public/` plus `patches/splatoon3/`.

## Extracted source parameters and their meanings

| Property | Group 0 large bubble | Group 1 small bubbles |
| --- | --- | --- |
| Shot count | 1 | 3 |
| Delay after throw | 0 F | 5 F, then +5 F per later bubble |
| SpawnSpeedGround | 0.53982 world/F | 0.53, then -0.01 world/F per later bubble |
| SpawnSpeedAir | 0.51 world/F | 0.50, then -0.01 world/F |
| AddSpawnSpeedYRateByXZ | 0.2 | 0.2 |
| GoStraightToBrakeStateFrame | 3 F | 3 F |
| Brake / FreeAirResist | 0.01 / 0.01 per frame | same |
| Brake / FreeGravity | 0.01 / 0.015 world/F² | same |
| BrakeToFreeStateFrame | 1 F | 1 F |
| EndRadiusForField | 0.75 world | 0.5 world, then -0.03 per later bubble |
| EndRadiusForPlayer | 0.85 world | 0.57 world, then -0.03 per later bubble |
| Damage | 32 | 32 |
| Bounce paint radius | 1.65 world | 1.32 world, then -0.05 per later bubble |

S3 community sources also establish two ground bounces, then termination at the third ground contact; unlimited wall bounces with 0.8 speed multiplier; after each bounce player/field radius ×0.75, bounce paint radius ×0.85 after the first.

These are units in the source coordinate system interpreted by INKWAVE's existing 1:1 world bridge. They are not claimed to be measured console pixel distances.

## Research observations versus physics endpoints

The Japanese verification wiki (listed as Ver.11.1.0 at the time read) reports *effective* range 5.3 test lines without a lob / 5.4 with a lob, guaranteed four-hit range 4.7/4.9 lines, and one-bounce range 2.6 lines. A test line is 50 DU or five game world units. These are different metrics: actor-hit reachable distance, guaranteed four-hit distance, and one-bounce range, **not** a universal lifetime distance or a direct 3rd-bounce endpoint. The specialized guide calls a roughly 40-degree elevated cast particularly long-ranged, but supplies no exact angle-to-distance table.

The current source table has **no verified lifetime/expiry key**. A fixed value of 240 frames in INKWAVE was a defensive approximation, not the retail value. It is insufficient for valid high-origin near-vertical arcs even in INKWAVE's sourced integrator, where the third floor contact can occur after 240 F.

## Fixes

1. Preserve the sourced **true-birth** 5F spacing. For *Bloblobber only*, delay-queued bubbles now acquire the actor's **current camera aim at their own birth**, not an aim vector frozen at the initial release. Real players can rotate their view while the four bubbles emerge, which changes their directions and fan-out. This interpretation is corroborated by community technique descriptions, but not proven at the level of a Nintendo engine code trace. Other Slosher families preserve their existing admission-time aim.
2. When the camera changes during delayed birth, reconstruct the velocity with the same sourced ground/air speed (including the -0.01 index offset) and recalculated `AddSpawnSpeedYRateByXZ` against the *current horizontal* velocity. Apply owner movement contribution once at true birth. No additional RNG rolls, duplicate packets or turf writes.
3. Relax the **non-retail void-safety cleanup guard** to 480 F (8 sec). Ordinary level-ground bubbles still terminate from the source-backed third ground impact, often much earlier. The longer guard prevents high-origin arcs disappearing midair before that impact. No finite lifetime was recovered from the S3 source record; **480 F remains an INKWAVE value**, not a Nintendo one.

Previously merged PR #1578 already corrects short-range ground-reticle steering and other source-backed bounce physics. This PR extends that fix rather than reverting it.

## Executable coverage

- `catalog-slosher-birth-speed.test.mjs`: all catalog Sloshers' 30/60/120 fixed time, speed selection, packet timing, RNG; plus Bloblobber view rotation during the volley and ghost replay with verbatim owner velocity.
- `catalog-projectile-vfx-range.test.mjs`: physical Actor→WeaponRunner→Projectiles emission, source flight integrator and true swept OBB ground contacts; horizontal, 5°, 20°, 40°, 60°, 75°, 90°, plus 20m elevated vertical fire; 2 floor bounces then 3rd-contact end without arbitrary midair retirement.
- Rendering, damage, ink authority and web deployment are separate integration checks. A model-only numeric test does **not** establish hardware or Nintendo pixel parity.

## Explicitly unverified retail details

- Exact maximum time or bounds of a bubble in a stage with no reachable floor, infinite wall rebounds or unusual moving collision objects.
- Precise camera-pitch-to-release conversion, including any original animation-dependent muzzle rise during the 6-frame windup.
- Console actor hurtbox dimensions and simultaneous four-bubble *hit range*, as opposed to the last floor impact of one bubble.
- Pixel/VFX/frame-by-frame equality to captured S3 11.3.0.

Do not claim a perfect retail clone based on these partial source records and web reports.