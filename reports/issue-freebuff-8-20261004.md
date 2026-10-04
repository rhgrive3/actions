# INKWAVE vs Splatoon 3 — public issue group freebuff-8 (2026-10-04)

Scope: public INKWAVE composed runtime (`inkwave-public` + `patches/splatoon3` adapter/runtime/profile).
Prototype `game/` is out of scope (removed in PR #185). Reference: Splatoon 3 Ver. 11.3.0.

## Status by issue

| Issue | Behavior | Status | Evidence |
| --- | --- | --- | --- |
| #168 | Charger dedicated nearest/feet paint | fixed | `feetSplash` in `patches/splatoon3/runtime/weapons.mjs`; `feetPaintRadius` in profile; tests in `patches/splatoon3/tests/weapons-collision-feet-refill.test.mjs` |
| #119 | Projectile hits terrain vs actor by nearest distance | fixed | adapter rewrite of `Projectiles._step` collision chronology; same test file |
| #105 | Projectile picks nearest actor, not `G.actors` order | fixed | adapter rewrite of `Projectiles._step`; same test file |
| #87 | Full-charge Charger pierces opponents | already resolved by composed patch | runtime `fireCharger` override + `patches/splatoon3/tests/integration.test.mjs`; order-independence regression added |
| #95 | Splattershot 20f post-fire ink cooldown in every form | already resolved by composed resource patch | `patches/splatoon3/runtime/resources.mjs` gates all refill on `weapon.inkRecoverStop`; composed regressions added |

## #168 — Charger feet paint

- Reference: Splatoon 2 v3.0.0 update history guarantees the player's feet are inked when firing the Splat Charger; Splatoon 3 Charger parameter data keeps a dedicated nearest-splash group (`RadiusSpawnNearest`). The exact conversion of `RadiusSpawnNearest = 1.2` into INKWAVE metres is **not** claimed.
- INKWAVE before: `fireCharger()` only produced stochastic stretched line splats sampled from `muzzle + dir * 1.2`; nothing was centred under the shooter.
- Fix: a dedicated, fixed-seed `G.paint.splat` at the ground beneath `a.pos`, applied exactly once per shot for both partial and full charge. `feetPaintRadius` is a new profile value (inferred from the player footprint, not a Nintendo copy; see `calibration.unverified`).
- Acceptance checked by composed test: presence for min/partial/full charge, yaw independence, seed independence, single application under the full-charge piercing wrapper.

## #105 / #119 — projectile collision chronology

- Reference: Splattershot rounds collide with players (`0.285`) and environment (`0.2`); a target behind an intervening stage surface is not reachable. Ordinary shooters (unlike a fully charged Charger) do not pierce.
- INKWAVE before: `Projectiles._step()` scanned the whole swept segment for actors first and marked the projectile dead on the first intersecting actor, skipping the world query entirely; among several actors it took the first in `G.actors` order.
- Fix: the adapter now resolves candidates in one distance domain (nearest actor `t · stepLength`, boss `segHit.dist`, world `segment().dist`) and resolves only the nearest.
- Acceptance checked by composed tests: near actor wins in both roster orders; three aligned actors select minimum `t`; nearer wall suppresses a farther actor and vice versa.

## #87 / #95 — already resolved; proven on composed modules

- #87: the runtime `fireCharger` override already collects all victims, sorts by distance and calls the original with `G.actors` emptied (so paint/visuals run full length), then applies `damageMax` to each. Verified through the composed `Projectiles` instance; order-independence added.
- #95: the adapter replaces the native `actor.js` ink/hp block with `updateResources()`, which gates refill on `weapon.inkRecoverStop` (Splattershot 20f) for swim, dry-squid, humanoid and stored-charge paths. Verified through the actual `Actor`/`WeaponRunner`; humanoid 1–19f no refill, refill at 20f; own-ink swim does not bypass; empty click does not reset `lastFire`.

## Verification

- Focused composed test: `node --experimental-vm-modules --test patches/splatoon3/tests/weapons-collision-feet-refill.test.mjs` → 11/11 pass.
- Before fix (stashed shared files): 6/11 fail (#105 ×2, #119 cover, #168 ×2, chronology guard); #87/#95 already pass.
- Directly affected existing suites (adapter, weapons, integration, core): 37/37 pass.
- Full composition (`splatoon3 → touch-layout → reliability → local-quality`) accepts the rewritten `weapons.js`.

## Limitations

- `feetPaintRadius` magnitude and the feet-patch area are inferred, not a verified Nintendo value; Switch/real-device parity is not claimed.
- The collision-chronology rewrite was validated at the logic/composed level; no physical-device or browser capture was performed.
- Full exact-source CI, browser gates and integration remain parent-owned.
