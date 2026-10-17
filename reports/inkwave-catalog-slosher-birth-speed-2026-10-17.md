# Delayed catalog Slosher ground/air speed at actual birth

Baseline: integrated INKWAVE `c9183da7` (2026-10-17). Comparison source:
Splatoon 3 Ver.11.3.0 parameter tables pinned at
[`Leanny/splat3@7280ff9cde8bb1c5dcef46c700c326471584d2e6`](https://github.com/Leanny/splat3/tree/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon).
This follow-up was found during independent review of the added-main motion
inheritance change. It corrects a remaining runtime inconsistency; it does not
establish exact Nintendo scheduling or Switch trajectory parity.

## Confirmed difference and source evidence

The pinned `UnitGroupParam.Unit` records contain separate `SpawnSpeedGround`
and `SpawnSpeedAir` values, alongside `UnitDelayFrame`,
`AfterOffsetDelayFrame`, `AfterOffsetSpawnSpeed` and launch-lift parameters.
The generated catalog retains each source path and SHA-256. All four added
Sloshers with delayed globs have different ground/air speeds:

| Main / source actor | Representative delayed unit | Ground base, DU/F | Air base, DU/F | Scheduled unit delays |
| --- | ---: | ---: | ---: | --- |
| Tri-Slosher / `WeaponSlosherDiffusion` | 1 | 0.896 | 0.808 | 2, 4, 6 F |
| Sloshing Machine / `WeaponSlosherLauncher` | 1 | 1.4737 | 1.4563 | 1, 3, 5, 7 F |
| Bloblobber / `WeaponSlosherBathtub` | 1 | 0.53 | 0.5 | 5, 10, 15 F |
| Dread Wringer / `WeaponSlosherDouble` | 1 | 1.85 | 1.79 | 8–15 F |

The source paths are `data/parameter/1130/weapon/<source actor>.game__GameParameterTable.json`.
Values above are the unit's base before its per-bullet `AfterOffsetSpawnSpeed`.
The actual native delay queue advances a projectile on the simulation tick
after its delay expires; this follow-up preserves that existing ordering.

The existing native Bucket Slosher owner in
[`weapons-fidelity.mjs`](../patches/splatoon3/runtime/weapons-fidelity.mjs)
already validates a pending glob, samples the live muzzle, reselects its unit's
ground/air speed from `owner.grounded`, constructs the launch velocity and then
records the actual birth. The existing
[`slosher-birth-sampling.test.mjs`](../patches/network-replication/tests/slosher-birth-sampling.test.mjs)
covers both ground-to-air and air-to-ground transitions for that owner.

The added catalog's `emitUnits` selected the base speed when it admitted the
entire volley. Its later `releaseCatalogBirth` refreshed the muzzle and player
motion but retained that earlier base. A glob could therefore start at an
airborne muzzle with the ground launch speed, or begin after landing with the
air launch speed. This was present before the player-inertia repair and was
not an intended source restriction.

An actual production-composed Bloblobber reproduction, with zero owner
velocity and horizontal aim, admitted a volley while grounded and changed to
airborne before delayed births. The later unit's recorded forward velocities
were **31.8, 31.2, 30.6** world units/s; the same unit admitted airborne produced
**30, 29.4, 28.8** despite identical airborne state at birth. The source
ground/air difference is 0.03 DU/F, or 1.8 units/s in the existing scale. Its
0.2 lift coefficient also left a 0.36 units/s vertical difference. Landing
between admission and birth produced the converse error. It changes a late
glob's trajectory when firing across a ledge or landing during the volley.

## Implementation

[`main-weapon-catalog.mjs`](../patches/splatoon3/runtime/main-weapon-catalog.mjs)
retains the admitted direction, source base, actual sampled speed and lift
coefficient in an already pending Slosher glob's birth record. After the
existing life/owner/cancellation checks, actual birth reads that unit's
current ground/air base. If the base changed, its delta replaces the old base
while retaining the accepted direction, speed sample and per-index offset.
The lift follows the resulting speed. Player motion is then added once and
the final zero-delay velocity is recorded once.

If the selected base is unchanged, the emitted velocity is kept byte for byte.
The admitted aim and random seed are retained, including when the owner turns
before birth. Receiver ghosts keep the transmitted velocity and do not rerun
source selection or motion inheritance. The change lives in the existing
catalog module and adds no startup module request.

This supersedes the statement in the earlier
[`catalog inertia report`](inkwave-catalog-player-inertia-2026-10-17.md)
that delayed globs preserve their already sampled *base* launch velocity:
the random draw/offset remain fixed, while the ground/air base now belongs to
the actual birth, consistently with the existing native owner.

## Reproduction and verification

The new
[`catalog-slosher-birth-speed.test.mjs`](../patches/splatoon3/tests/catalog-slosher-birth-speed.test.mjs)
uses the installed public `WeaponRunner`, production source composition,
native `Projectiles.update` delay queue and native `NetMatch.recProj`.
The controlled owner is alive in kid form with full ink, default gear,
horizontal aim unless the pitched control is selected, and fixed shot RNG.
World collision and rendering are stubbed; the muzzle is the fixture's simple
socket. This isolates the state selection from collision and rendering.

The four added delayed Sloshers are exercised across ground-to-air and
air-to-ground transitions at 30/60/120 render Hz feeding the production fixed
clock. The independent assertions read source unit values, check the actual
birth velocity after removing explicit owner inertia, verify lift, queue
cadence, packet velocity and one packet per glob, and compare complete
birth signatures between display rates. Additional controls check exact
unchanged-state velocity, admitted pitched aim during later turning, no
birth-time RNG draw, and actual ghost replay with a different remote movement
and ground state.

Before the runtime fix, **5 of 6** new tests failed on the stale base speed;
the unchanged-state control passed. After the fix, **6 of 6** passed. The
focused regression command additionally exercises existing catalog motion
inheritance and the native Bucket birth/replication owner:

```sh
node --experimental-vm-modules --test --test-isolation=none --test-reporter=spec \
  patches/splatoon3/tests/catalog-slosher-birth-speed.test.mjs \
  patches/splatoon3/tests/catalog-player-inertia.test.mjs \
  patches/splatoon3/tests/catalog-player-inertia-native.test.mjs \
  patches/network-replication/tests/slosher-birth-sampling.test.mjs
```

The combined focused run passed **27/27** tests, including all 40 explicit
catalog motion records at three frame intervals and native Bucket two/three
client birth checks. `git diff --check` also passed. The parent integration
owns the final production build, complete CI and main-branch verification.

These are execution-level source/composition checks. The parameter tables
identify the two explicit speeds; they do not reveal Nintendo's complete
sampling order. The existing INKWAVE true-birth scheduling, lift projection,
source-to-world scale, omitted physics defaults, and exact Switch trajectories
remain subject to their existing verification limits. No new Nintendo binary
asset or guessed source value is introduced.
