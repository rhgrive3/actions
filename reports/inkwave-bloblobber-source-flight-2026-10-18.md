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

1. Preserve the sourced **true-birth** 5F spacing and ground/air speed choice. The community [Slosher sweeping explanation](https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%82%B9%E3%83%AD%E3%83%83%E3%82%B7%E3%83%A3%E3%83%BC%E5%B1%9E) says fan angles derive from aim movement in the frame just before **release**, not independent post-release retargeting. Thus the initially proposed live camera re-aim at each subsequent bubble was **retracted**: retain the admitted volley direction for deferred bubbles. An exact commercial angular-sweep formula is still unverified.
2. For every delayed bubble, select the source ground/air speed, including the -0.01 per-index change, while retaining the admitted angle and its `AddSpawnSpeedYRateByXZ` factor. Apply owner velocity once, without extra randomness, duplicate network packet or turf event.
3. **Downward-angle cause:** the large `EndRadiusForField` (0.75 on the first bubble) grows over 4F. INKWAVE erroneously treated an early tangential contact of that **expanded shell** with the floor as a complete ground rebound. Moderate downward pitches spent two rebounds almost under the player and ended at the third contact, far short of a normal S3 arc. The existing `weapons-fidelity.mjs` Slosher `GLOB_GRAZE` collision rule already distinguishes the source's small initial terrain core from the growing outer field. Apply its **sourced `InitRadiusForField` core (0.075 for the large bubble)** to Bloblobber ground contacts and the post-bounce clearance too. Keep enlarged field radius for wall hits and player radius for player damage. The bubble graze does not create an extra paint event. This is a source-informed INKWAVE interpretation, not a recovered proprietary collision routine.
4. **Small-bubble reflection speed:** a source record declares `BounceAfterMaxSpeed=0.35` on group 1 only. Before this fix INKWAVE clipped the **entire 3D velocity magnitude** to 0.35 after each contact, including wall contacts. That made the small bubbles lose 30%+ of their forward travel early on downward shots and broke the documented exact wall-speed factor of 0.8. Treat 0.35 as a cap on the outward **contact-normal** component of a **floor** bounce, preserving the tangent speed and leaving walls governed by the sourced 0.8 factor. The original engine's unpublished implementation of `BounceAfterMaxSpeed` remains unverified; the chosen interpretation is constrained by the wall factor and the community's first-to-fourth bubble reach comparison, not merely an arbitrary multiplier. Source defaults named `DnHillBounceAfterAddSpeed` also exist, but their precise application is marked unknown and is **not invented** here.
5. Relax the **non-retail void-safety cleanup guard** to 480 F (8 sec). Ordinary stages still end bubbles on the third physical ground contact. A raised origin can take more than 240F to complete its bounce arc. No finite lifetime was recovered from the pinned game parameters, so 480F remains an INKWAVE fallback rather than a Nintendo constant.

Previously merged PR #1578 already corrects short-range ground-reticle steering and other source-backed bounce physics. This PR extends that fix rather than reverting it.

## Executable coverage

- `catalog-slosher-birth-speed.test.mjs`: all catalog Sloshers' 30/60/120 fixed time, speed selection, packet timing, RNG; plus Bloblobber admitted angle preservation across a subsequent view change and ghost replay with verbatim owner velocity.
- `catalog-projectile-vfx-range.test.mjs`: physical Actor→WeaponRunner→Projectiles emission, source flight integrator and swept OBB ground contacts; horizontal, -10/-20/-30/-40/-60°, 5/20/40/60/75/90°, plus elevated vertical fire; verify down-angled first contact is not prematurely consumed by the grown outer collider, then 2 actual floor bounces and a 3rd-contact end. Check the small bubble keeps tangent velocity when rebound normal is capped, and the wall speed remains exactly 0.8. Preserve native muzzle offset when comparing reach.
- Rendering, damage, ink authority and web deployment are separate integration checks. A model-only numeric test does **not** establish hardware or Nintendo pixel parity.

## Explicitly unverified retail details

- Exact maximum time or bounds of a bubble in a stage with no reachable floor, infinite wall rebounds or unusual moving collision objects.
- Precise camera-pitch-to-release conversion, original animation-dependent muzzle rise during the 6-frame windup, and the formula for one-frame pre-release sweeping.
- Console actor hurtbox dimensions and simultaneous four-bubble *hit range*, as opposed to the last floor impact of one bubble.
- Pixel/VFX/frame-by-frame equality to captured S3 11.3.0.

Do not claim a perfect retail clone based on these partial source records and web reports.