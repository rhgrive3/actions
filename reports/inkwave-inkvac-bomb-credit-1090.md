# Ink Vac bomb absorption preserves the sub attack (#1090)

## Scope and reproduction

- Integration base: PR #1182 at `b1626ee8`.
- Reference: Splatoon 3 11.3.0, stock Splat/Suction Bomb and Ink Vac, no gear.
- This repair preserves the existing damage-equivalent absorption contract; it does not change the sourced/declared damage, 1100-HP capacity, intake geometry or Nintendo calibration.

The existing source-side bomb contact probe already resolves the native bomb's 180 HP from its per-bomb sub descriptor. Its absorption proposal retained `damage: 180`, but the receiver capped every proposal against the main weapon. A Splattershot user's Suction Bomb therefore credited only 36 HP remotely, while the same locally absorbed bomb credited 180 HP. Both paths used the same active native runtime.

The regression composes all six production source adapters and installs the complete S3 bootstrap. It executes native `throwBomb` → `_updateBombs` → `kitBombDefenseCandidate` → absorption event → native `NetMatch._onLocalEvent` packing → JSON → `_play` → authenticated kit replay. The bomb's actual identity and descriptor remain intact; only its starting position/velocity are set to a deterministic crossing so aim/launch calibration cannot confound the contact test. Actor display and stage-query plumbing use the existing test fixture. The negative control restores only the prior receiver cap and reproduces 180 → 36.

## Implementation

`patches/splatoon3/runtime/kit-ink-vac.mjs` adds an optional scalar `sub` to bomb absorption proposals. It comes from the native bomb's stored sub descriptor. The receiver accepts only `bomb`/`suction`, requires that ID to match its independently resolved authenticated actor kit, and caps credit against the live SUB registry's finite positive damage ceiling. It rejects unknown/mismatched descriptors before spending the deduplication key.

Ordinary main proposals and legacy packets without the new field retain their previous main-weapon cap. Peer/actor binding, target ownership/liveness, exact Special serial, amount bound, duplicate guard and visual-only ghost behavior remain intact. No private Nintendo wire format is claimed; this is the game's own protocol. The sender is still responsible for attesting an absorbed projectile, as before. The descriptor is an equipped-attack upper bound, not a new cryptographic projectile receipt. Mixed old/new builds retain old main-only under-credit on old receivers.

## Evidence and remaining limits

The new native tests cover the removed-fix counterexample, real Splat and Suction Bombs, local/remote equal credit, malformed and mismatched sub descriptors, missing registry damage, valid retry with the same key, foreign peer, unknown actor/target, stale serial, bad damage, dead sender, duplicate replay, ghost exclusion, preserved legacy main cap, the registry cap and 30/60/120 Hz presentation schedules driving the same fixed 60 Hz simulation.

Focused source tests are implementation evidence, not browser/live relay/Switch validation. No visual parity, exact Nintendo suction/damage-equivalent law, projectile-spawn geometry or unmeasured timing is newly certified. #1090 remains a reference until its broader acceptance conditions are independently met.

Executed validation: `node --experimental-vm-modules --test --test-concurrency=1` over the new authority suite plus `kit-ink-vac`, `kit-network`, `kit-defense`, `issue-1090-ink-vac-damage-credit`, `issue-1149-vortex-contact`, and `issues-1109-1128-new8`: **84/84 passed**, no failures/skips. `check-inkwave-patches.mjs --quick`, runtime syntax and `git diff --check` passed. Full build/CI and emitted browser checks were not run in this lane.
