# Catalogue sub-weapon paint admission

## Confirmed defect and bounded correction

The final composed network receiver already supports typed Suction/Curling and Slosher paint grants plus catalogue-main radius limits. Its effective rule is not merely the old 3.744 world-unit constant.

However, catalogue-only Burst Bomb (radius 4), fully charged Fizzy Bomb's third core (3.8), and Ink Mine (5) emitted untyped core paint. A sender using a small-radius main could paint these locally while a peer rejected the core. This change ties those cores to the existing authenticated `ac/sub/spawn` event. It does not increase the generic radius limit or change local footprints.

Each grant checks match epoch, sender membership and actor ownership, actor life at accepted birth, equipped sub, source sequence, source seed, core index, exact current runtime radius, allowed footprint shape, and a conservative reachable envelope from the birth position/velocity, fixed-step flight limit, gravity and Fizzy hops. Fizzy's existing resolved hold controls the available one/two/three cores. Each index can be consumed once. Existing pending-birth, sequence, epoch and bounded-ledger rules are reused.

These are current INKWAVE runtime radii. Their admission correctness does not establish that every radius or footprint equals retail Splatoon 3. No new claim of retail visual equivalence is made.

## Real input and replication results

The test boots full production-composed modules, actual Actor / WeaponRunner / Projectiles / NetMatch, and the actual CPU PaintSystem. Display submission alone is stubbed. The throw is positioned at a controlled floor contact to isolate wire equivalence.

- Burst: sender and receiver 888 occupied cells.
- Fully charged Fizzy: sender and receiver 906 occupied cells, three separately authenticated cores.
- Mine: sender and receiver 1392 occupied cells after proximity detonation.
- Autobomb control: 530 / 530 cells, existing native path, no wider grant needed.

An early investigation falsely implicated Autobomb because a manually changed fixture loadout had not reset its WeaponRunner. Correct reset and full causal birth replay resolve that discrepancy; no Autobomb change is included.

## Tests and limitations

`catalogue-sub-paint-authority.test.mjs` covers actual input, all Fizzy charge stages, native Autobomb, duplicate replay, malformed radius/seed/team/life, missing and later birth, reversed event arrays, older birth envelopes, accepted Mine after owner death, rejected unreceived old-life birth, match/owner/loadout mismatch.

Additional regression gates are the existing kit paint admission and capacity/lifecycle suites. Source tests passed 13/13 for the new cases, including natural flight, more than 30 seconds of holding, remote teleport cores, and malformed birth payloads. The separate network robustness fixtures passed 22/22 using their source composition; they do not support the built-site selector. CI remains pending.

No real browser or GPU-render result is claimed by these CPU/VM tests. Existing GitHub browser/WebGL gates remain required before adoption. The change adds small per-core receipt checks and one bounded birth-ledger entry per throwable; dedicated CPU timing and many-player load measurements remain unverified.

The reachable envelope is deliberately conservative around dynamic contacts. It is not a complete server simulation or validation of the claimed launch velocity. The existing client-authoritative game still has broader trust limitations. The payload sanitizer is shared with ordinary catalogue replay rather than duplicated.

Final production build: contentHash `95e7e448d0dbbeb6916427fe8dc70a274c305012e4a86b04b3233a085b1798f4`. Actual built-site new authority plus all-sub regression suites passed 27/27. This is module execution with CPU paint, not an image comparison or browser GPU validation.
