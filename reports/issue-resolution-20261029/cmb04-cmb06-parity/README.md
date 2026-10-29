# CMB04 / CMB06 native scan parity

Audited optimized source `e3f19ab9913824b15dfc56330ec731408890d6a3`.
Both adapter prefilters change observable native combat behavior. The bounded
fix restores only those two native scans and keeps exact unique source guards.
Other optimizations, including the separate MOV08b hold, are outside this change.

## Demonstrated failures

**CMB04:** the additional InkFlight actor AABB uses terrain `PLAYER.radius + .25`
(`.63`) rather than the actual bullet-receiving shape. The installed squid
hurt radius is `.675`. A standard shooter head (player radius `.285`) travelling
from `(0,.675,-1)` to `(0,.675,1)` hits a stationary squid at `(.94,0,0)` in the
native capsule sweep. The extra prefilter rejects it: its lateral bound is
`.915`, while the native combined radius is `.96`. The actual composed method
therefore changes one 36-damage hit into no hit. Custom enlarged hurtboxes also
exceed the assumed bound. Moving actors with a coherent snapshot bypass the
prefilter, but static actors and discontinuity fallback do not.

`capsuleEntry` already has an XZ AABB using the actual actor and projectile
radii, followed by the native continuous capsule calculation. Restoring its
caller preserves that existing shape-aware rejection and actor traversal.

**CMB06:** normal difficulty has awareness `21`. Real Three.js vectors at
`(21,2^-22,0)` and `(0,0,0)` produce squared distance
`441.00000000000006`, while `distanceTo` rounds the square root to exactly `21`.
The native `d > awareness` condition admits the candidate. The extra squared
comparison rejects it before the native condition. This removes the LOS call,
target acquisition and four RNG draws, altering later decisions as well.
It also bypasses a custom vector's `distanceTo` method. Restoring the original
distance call preserves its floating-point and dispatch semantics.

## Reference and controls

The control starts with the full production-composed methods at the audited
base and reverses only the exact CMB04 or CMB06 prefix. All other adapters and
gameplay changes remain present. The committed fixture contains the exact
before/after prefixes from that immutable adapter. Negative controls reinsert
each original unsafe prefix into the actual method and reproduce the failures.
The fixed candidate is composed through the real `adaptBuildSource` pipeline.

The original-main reference `e67c636b81762df56b346a09ef570964d43084df` also uses
the direct `distanceTo` awareness condition and the shape-radius capsule AABB.
Its older raw actor shape/eligibility code is not substituted for the current
composed gameplay. The reference is the existing native decision rule, with
current profile, ownership and coherent-motion behavior retained.

The tests execute the entire composed `stepHead` / `_perceive` methods with
actual Three.js vectors, native flight integration, capsule collision, hurtbox
helpers and actor-motion records. External world/LOS, damage and presentation
boundaries are controlled and recorded. They cover:

- The two demonstrated failures, with negative controls that still fail parity.
- Installed squid/human boundaries, custom enlarged shapes, zero/NaN projectile
  radius, NaN/Infinity actor positions and awareness values.
- 30/60/120 Hz updates, coherent motion and discontinuity fallback, world ties,
  owner/friendly/dead/ghost filters and actor order.
- Target bias/ties, swim/team/death filters, occlusion, custom distance methods,
  live-roster mutation and synchronous perception reentry with real scratch.

## Validation and limits

48 focused tests pass, including the existing native-stage/combat, bot LOS,
independent hurtbox and time-coherent projectile suites. Eight adapter tests
pass, including all 24 target compositions/idempotence and direct-owner source
checks. Quick compatibility checks pass. Raw stdout and hashes are in
[`summary.json`](summary.json), [`focused.txt`](focused.txt),
[`adapter.txt`](adapter.txt) and [`quick.txt`](quick.txt).

Run the focused group with:

```sh
node --experimental-vm-modules --test \
  patches/local-quality/tests/combat-native-scan-parity.test.mjs \
  patches/local-quality/tests/native-stage-and-combat-firefight.test.mjs \
  patches/local-quality/tests/bot-target-los-pruning.test.mjs \
  patches/splatoon3/tests/issue-430-humanoid-hurtbox.test.mjs \
  patches/splatoon3/tests/issue-1040-time-coherent-projectiles.test.mjs
```

These are CPU tests of composed source. No browser/GPU, full site build or
timing measurement was used. The tests establish INKWAVE native parity; they
do not establish retail geometry, device performance or FPS improvement.
The existing Splatoon 3 reference epoch remains 11.3.0, with the previously
documented calibration limits. No acceptance limit, frozen receipt, source
archive or held QA workflow is changed.
