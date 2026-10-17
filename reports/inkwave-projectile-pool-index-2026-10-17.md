# Native projectile pool: Slosher index lifetime

Scope: public INKWAVE, 2026-10-17. The runtime correction is already present
in integration commit `01b2163b729daef3bd67f3386d661ad2109ef331`. This follow-up
adds execution-level regression coverage and documentation; it changes no
runtime, weapon parameter or renderer code.

## Confirmed defect and correction

The native projectile allocator in
[`inkwave-public/src/game/weapons.js`](../inkwave-public/src/game/weapons.js)
reuses objects from `Projectiles.pool` and retains their vector storage. The
fidelity wrapper in
[`weapons-fidelity.mjs`](../patches/splatoon3/runtime/weapons-fidelity.mjs)
clears family-specific state in `_new` before the next emitter initializes it.
Its earlier initializer cleared `fidelitySloshUnit` and neighboring fields,
but omitted `fidelitySloshIndex`.

A native Bucket Slosher volley assigns unit-local indices, including nonzero
values, to nine projectile objects. After those objects retire, a Roller can
reuse them. Its own initialization selects `fidelityRollerUnitIndex`, but the
old Slosher index had no corresponding reset. An unrelated, stale family
index could consequently survive into the Roller record and its diagnostic
receipt. This was a real allocator-lifetime inconsistency, not a Nintendo
parameter difference or evidence that the Roller should own a Slosher index.

The existing correction adds only `p.fidelitySloshIndex=null` beside the
other Slosher resets. A subsequent Slosher emission still assigns its own
source unit-local index after allocation. The allocator continues to reuse
the same object and vector storage. No velocity, damage, source unit,
collision radius, random draw or retirement expression was changed by this
correction.

## Regression conditions and actual execution

[`projectile-pool-slosher-index.test.mjs`](../patches/splatoon3/tests/projectile-pool-slosher-index.test.mjs)
extends the initial native reuse witness with complete flight, retirement
and return-to-Slosher controls. It uses the production source composition,
installed native `Projectiles` emitters, actual `Physics` against a flat
walkable floor, the native delayed-birth queue and ordinary `update`-owned
retirement. It never manufactures a projectile or calls the allocator to
simulate reuse, and never forces a `clear` to end a flight.

The actor has full ink, kid form, zero motion and horizontal aim. The test
prescribes the native emitter's admitted Roller mode: a horizontal release
is grounded at the floor, and a vertical release is airborne at height 1.8.
Actor motion and input admission use the shared fixture's controlled state;
this is not an additional proof of jump, startup or ink-consumption timing.
RNG is fixed at 0.5 to isolate pool history. Rendering and paint credit are
outside this allocator check; the world collision and projectile steppers
remain active.

Each mode is exercised at 30, 60 and 120 display Hz through the production
fixed clock. The sequence is:

1. Emit the native Slosher's nine globs and verify the unit-local indices
   against `profile.weaponsFidelityCompletion.weapons.slosher.UnitGroupParam`.
2. Observe nine actual zero-delay births, with every packet index 0 through 8
   present exactly once, then fly all records until they naturally return to
   the native pool.
3. Emit the native Roller's complete horizontal or vertical volley. All nine
   available objects are reused by the 13-record horizontal volley; five are
   reused by the five-record vertical volley. Their vector identities stay
   unchanged, Slosher metadata is empty, and Roller unit metadata is valid.
4. Compare every birth and subsequent fixed-step snapshot with an independent
   cold-start Roller world, through complete natural retirement.
5. Return to Slosher, reuse the retired Roller objects, and verify its own
   indices at preparation and actual birth. Its entire flight and retirement
   trace must match the first Slosher volley.

The full three-phase signatures also agree between the three display rates.
The checks cover type-specific metadata, position, start position, velocity,
age, seed, delay, live-list membership and return of every emitted record to
the native pool.

## Counterfactual and verification result

The source counterfactual removes exactly the one reviewed initializer
expression in memory. A unique-anchor assertion ensures no other code is
substituted. Both Roller modes then receive an actually reused record with a
nonzero Slosher index. The same `assertFreshRoller` assertion used by the
positive cases must throw. Thus removing the reset demonstrably breaks the
positive contract; the test does not merely assert that a source token exists.

Source command:

```sh
node --experimental-vm-modules --test --test-isolation=none --test-reporter=spec \
  patches/splatoon3/tests/projectile-pool-slosher-index.test.mjs
```

Result: **3/3 passed**, including the failing counterfactual witnessed through
`assert.throws`. The shared fixture's `INKWAVE_BUILT_SITE` switch also ran the
two positive cases against the emitted, minified integration build:

```text
contentHash a1141213de1df26eaffa74d49e0e38982758514fa86d49c1afee79dbce051189
2 positive tests passed; 1 source-only counterfactual skipped; 0 failures
```

The skipped built case explicitly edits a raw runtime-source anchor, which
does not exist in that form in the minified artifact. The source gate owns
that negative control; both built positive cases still execute all three
frame intervals and the complete reuse cycle. `git diff --check` passed.
The parent integration owns the final complete CI and main publication gate.

These are INKWAVE execution and regression results. No Switch capture or
recovered Nintendo allocator implementation is claimed, and the existing
source-scale, trajectory and parameter-verification limits remain unchanged.
