# Added main weapons: player velocity inheritance

Baseline: INKWAVE main `bf9a8a9270b349a3b20c9550ff6ed78a61c9e729`.
Reference: Splatoon 3 Ver.11.3.0, extracted parameter tables at
[`Leanny/splat3@7280ff9cde8bb1c5dcef46c700c326471584d2e6`](https://github.com/Leanny/splat3/tree/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon).
Scope: explicit `spl__SpawnBulletAdditionMovePlayerParam` fields in the additional
main-weapon catalog. This is a missing runtime dependency correction; exact retail
ballistics, hidden defaults and Switch world-unit calibration remain unverified.

## Confirmed difference and player impact

The catalog registered added weapons with `kind: 'catalog'`. Native Shooter,
Blaster, Slosher, Dualies and Roller motion helpers filtered their native kinds,
so they did not run for those added records. The catalog emitter constructed a
base velocity from direction, source speed and source lift, then immediately
queued/recorded it. Its explicit player-motion parameters were never consumed.
Consequently, moving forward/backward or falling did not change these catalog
rounds' launch velocities as their admitted source fields require.

There are **40** nonlegacy records with at least one explicit finite X/Z/up/down
rate. Screw Slosher must be counted: it has an explicit falling Y rate even
though its sparse row has no Z rate.

| Family | Affected base records |
| --- | ---: |
| Shooter | 13 |
| Blaster | 6 |
| Roller | 4 |
| Brush | 3 |
| Slosher | 5 |
| Dualies | 5 |
| Brella | 4 |

The kit registry resolves variants to their existing base catalog record, so
the same owner serves those variants without independent coefficient copies.
Native legacy owners keep their existing launch contributions.

## Source values and implementation decision

The generated catalog retains the source commit, source file path and SHA-256
for each row. Representative pinned source blocks are:

| Source row | XRate | ZRate | YPlusRate | YMinusRate | GuideYMinusZero |
| --- | ---: | ---: | ---: | ---: | --- |
| [Prime Shooter](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponShooterExpert.game__GameParameterTable.json) | absent | 2 | absent | absent | absent |
| [Tri-Slosher](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSlosherDiffusion.game__GameParameterTable.json) | absent | 2 | absent | 1 | true |
| [Screw Slosher](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSlosherLauncher.game__GameParameterTable.json) | absent | absent | absent | 1 | true |
| [Bloblobber](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSlosherBathtub.game__GameParameterTable.json) | absent | 0.5 | 0 | 0 | true |
| [Explosher](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSlosherWashtub.game__GameParameterTable.json) | 0.3 | 1 | 0.5 | 0.5 | true |
| [Dread Wringer](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSlosherDouble.game__GameParameterTable.json) | absent | 2 | absent | 1 | true |

`applyCatalogPlayerVelocity` in
[`main-weapon-catalog.mjs`](../patches/splatoon3/runtime/main-weapon-catalog.mjs)
uses the same horizontal body-yaw basis as the established native owners:

```text
right   = (cos(yaw), 0, -sin(yaw))
forward = (sin(yaw), 0,  cos(yaw))
deltaXZ = right * dot(playerVelocity, right) * XRate
        + forward * dot(playerVelocity, forward) * ZRate
deltaY  = playerVelocity.y * (falling ? YMinusRate : YPlusRate)
```

Only explicit finite rates are admitted. Missing fields contribute nothing;
an explicit zero remains zero. Rates are dimensionless and multiply the actual
actor velocity in the engine's existing units per second, without an extra
60 Hz conversion. The body basis is independent of aim pitch, spread and
Dualies hand. This is the established local mapping, not a claim that Nintendo's
exact coordinate transform or unpublished clamps have been recovered. The
unversioned investigator table's omitted defaults are not imported here.

The optional `guide: true` dry-run path suppresses the falling Y term when
`GuideYMinusZero` is true, retaining X/Z and rising Y. The catalog has no dedicated
shot-trajectory HUD owner wired to this path; this change does not claim that
its trajectory guide is implemented. Existing native Slosher HUD guide behavior
is separately regression-tested and preserved.

## Birth, cancellation and networking

Immediate catalog rounds add motion after their base launch velocity is final
and before `_push` records them. A per-projectile catalog flag prevents a second
addition. New pooled objects receive a fresh catalog state. Ghosts, remote
owners and legacy records are excluded; replay uses the transmitted velocity.

Catalog unit delays can admit globs before their true birth. `queueCatalogBirth`
captures their owner/life and local muzzle offset, while `releaseCatalogBirth`
samples current player velocity and the current muzzle when the native delay
expires. It preserves the already-sampled base launch velocity and RNG. The
final packet has zero remaining source delay and is published once, so peers
do not wait that delay a second time. Death, zero HP, weapon/state reset, sub or
special cancellation, owner identity changes and match removal reject pending
births before they can deal damage, paint or publish a projectile packet.

The native `_push` guard is inserted by
[`patches/splatoon3/adapter.mjs`](../patches/splatoon3/adapter.mjs); the subsequent
[`network-replication/adapter.mjs`](../patches/network-replication/adapter.mjs)
preserves both catalog pending births and the existing native Slosher pending
birth guard. Frozen `inkwave-public/` bytes and its upstream hash lock are
unchanged. Helpers live in the existing catalog module, adding **zero static
module requests** to the startup graph.

## Reproduction and verification

Gear: fixture defaults; no equipped gear multiplier is introduced by this
change. State: kid form, alive, full ink, body yaw zero unless a rotation case
is selected, a collision-free headless scene, deterministic shot RNG. Compare
stationary `(0, 0, 0)` with moving `(3, -4, 5)` in engine units per second.
For Prime the launch delta is `(0, 0, 10)`; for Explosher it is
`(0.9, -2, 5)`; for Screw it is `(0, -4, 0)`. A backward velocity reverses the
admitted forward contribution. Rotate the body by 90 degrees while aiming
elsewhere to verify that horizontal inheritance follows the body basis.

`catalog-player-inertia-native.test.mjs` invokes the actually installed
`WeaponRunner.update`, native `Projectiles.update`, production source adapter
composition and native `NetMatch.recProj`. Every one of the 40 records is fired
at **30, 60 and 120 Hz**. Delayed Slosher globs sample movement changed after the
volley was queued, publish only at birth, and disappear when cancelled. Actual
ghost replay keeps the recorded velocity without another local contribution.
The fixture retains simplified character sockets and stubs world collision and
rendering; this is execution of production game logic, not a rendered browser
or real Switch observation.

Focused regression command:

```sh
node --experimental-vm-modules --test --test-isolation=none --test-reporter=spec \
  patches/splatoon3/tests/catalog-player-inertia.test.mjs \
  patches/splatoon3/tests/catalog-player-inertia-native.test.mjs \
  patches/splatoon3/tests/main-weapon-catalog.test.mjs \
  patches/splatoon3/tests/issue-297-slosher-inertia.test.mjs \
  patches/splatoon3/tests/weapon-paint-inertia.test.mjs
```

The focused run passed **57/57** checks: 14 new catalog checks, 30 existing
catalog checks and 13 existing native Slosher/Dualies/Roller/Shooter/Charger
checks. Upstream hash compatibility also passed. Integrated production build, startup budget and
remote CI results belong to the final merge report. Switch trajectory parity,
rendered muzzle geometry and catalog HUD guide presentation remain unverified.
