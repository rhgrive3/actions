# Weapon-class hit reaction comparison — 2026-10-09

Issue [#1097](https://github.com/rhgrive3/actions/issues/1097). This public-root integration starts from `88dfb415bd6b1b0c88578ea246df43776527da1c` on branch `inkwave/c-1097-codex3-public29-20261009`. The presentation module and focused regression are carried from the final candidate `6829f1a2`; its unpublished shelf baseline and network/protocol changes are not included. Acceptance baseline: **Splatoon 3 Ver. 11.3.0** ([Nintendo update history](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/)). The comparison target is the published `inkwave-public/` composed with the active `patches/splatoon3/` adapters; the separate `game/` prototype is not evidence.

This integration adds the module, focused test, install wiring, the `T_HIT` member of the existing public `CHARACTER_TIMERS` adapter export, and this comparison record. Installation follows the composed pose and muzzle adapters so native shot paths stay on the ordinary pose while the reaction is drawn. `inkwave-public/` and network/protocol sources are unchanged.

## Sources and receipts

Retrieved during the earlier source review and retained under `/mnt/workspace/.dev-state/agent-work/evidence/inkwave-c-resume-20261009/cl7-1097-handoff5/sources/`; this integration rechecked the stored hashes:

| Source | Pinned reference | Local receipt (sha256) | Establishes | Does not establish |
| --- | --- | --- | --- | --- |
| [Flexlion animation-name corpus](https://github.com/Flexlion/flexlion.github.io/blob/7740d29fdded2899a7633e50647736e3723c5e9a/assets/animations.txt) | `7740d29fdded2899a7633e50647736e3723c5e9a`, 1387 lines | `flexlion-animations.txt`, `8bfe978db2566e0a1f2ba2e2dfd49dfaa355a9560939865851e2e0095d29b52a` | the damage animation-name partition by weapon class and locomotion state | frame counts, blend rules, joint angles, clip contents |
| [ParameterIlliterate ParamDictionary](https://github.com/ashbinary/ParameterIlliterate/blob/1beaa8fa847f46fb014cfd42ed2bb9754ee8ce4e/ParameterIlliterate/ParamDictionary.txt) | `1beaa8fa847f46fb014cfd42ed2bb9754ee8ce4e`, 8127 lines | `paramdictionary.txt`, `fc6b2335ba2ab7e69c40423f4a2aa886503d35e42bb112300ec5ab8b5ff1e968` | independent presence of `Damage_Chrg`/`WaitDamage_Chrg`/`WalkDamage_Chrg` and the `Rllr` equivalents | any other class entry (absent from these dictionaries) |
| [tkgstrator ParamHash param.csv](https://github.com/tkgstrator/ParamHash/blob/6a274f560cfeb774b83498b153fb745ab443b453/splam/param.csv) | `6a274f560cfeb774b83498b153fb745ab443b453`, 7943 lines | `param.csv`, `ec413ce49c8543e1637fccc045cb479fa61939185601898481d1259e92ca0cba` | the same Chrg/Rllr corroboration as the dictionary | the remaining class entries |
| Existing in-repo reference | [hit/spawn comparison](hit-spawn-motion-comparison-2026-10-03.md) | — | the retained Nintendo splat clip cannot calibrate a controlled nonlethal hit | nonlethal hit amplitudes, attacker bearing, damage frames |

Catalogue facts taken from the pinned corpus:

- `Damage_*` base entries exist for `Chrg`, `Mnvr`, `Rllr`, `Sber`, `Shlt`, `Shtr`, `Slsh`, `Spnr`, `Strn` (plus `SpnrDownpour`) — lines 184–195 of the receipt.
- `WaitDamage_*` (lines 1030–1041) and `WalkDamage_*` (lines 1297–1308) exist for `Blower`, `Chrg`, `Mnvr`, `Rllr`, `Sber`, `Shlt`, `Shtr`, `Slsh`, `Spnr`, `Strn`.
- The pinned file has **no bare `Damage` entry**. Issue #1097's claim of a generic `Damage` entry is not confirmed by this revision, so no generic base clip is referenced at runtime.
- There is **no `Damage_Blower` / `Damage_Blst` base entry**, so the Blaster base family stays recorded as unknown instead of invented.
- Class-suffix ownership (`Spnr` = Splatling, `Mnvr` = Dualies, `Blower` = Blaster, …) is an inference from set completeness over the ten `WaitDamage_`/`WalkDamage_` class suffixes and the ten S3 weapon classes (`Brsh` carries locomotion only). This is naming evidence, not a ROMFS skeleton inspection.

## Difference, reproduction and verification

| Motion / reproduction | Nintendo basis | Public implementation and effect | Result / verification |
| --- | --- | --- | --- |
| Same nonlethal hit on Shooter, Charger and Roller from one root-space direction | The pinned public animation-name corpus lists damage names by weapon class, but does not establish the retail chooser or pose | Before: `Character.trigger('hit')` injected one universal torso/head/pelvis/clavicle spring set for every class, and only the ordinary hold differed afterwards. After: the hit records class, locomotion context and hit vector, then `weapon-hit-reaction.mjs` adds INKWAVE-local class shaping on top of the untouched native window inside `_buildPose` | Focused regression builds the production graph for the three classes and compares hit-minus-idle core traces: layer disabled the cross-class spread stays under 0.01 rad, layer enabled it exceeds 0.02 rad and every class differs from its own disabled trace; this is local fixture evidence, not S3 pose parity |
| Idle and moving damage | `WaitDamage_*` and `WalkDamage_*` names exist in the corpus, which does not identify the retail chooser | The hit stores an INKWAVE gait flag (`gaitW > 0.25`); test-only labels map that state to the corresponding corpus name | Focused test drives a real walking fixture (root advance → native gait) and checks idle/moving labels; actual S3 selection remains unknown |
| Weapon trajectory during the reaction | Issue direction 6: the damage pose should own the body/weapon trajectory instead of shaking the normal hold | The `_poseWeapon` hold/aim output on anchor and pole channels is scaled back by a per-family factor while the envelope runs; the class carriage is then added on top | Test keeps the right-hand grip error below 0.1 world units through a 1.6-amplitude reaction and asserts a non-zero hold relinquish in the snapshot |
| Gameplay muzzle and hitscan isolation | The public Projectiles path reads `Character.getMuzzle`, `getMuzzleHand`, and `getAimMuzzle`; Charger also derives its shot from muzzle/aim accessors | After production pose and muzzle adapters install, the module retains the ordinary composed pose, caches main/left gameplay muzzle data, draws the hit pose, and restores native solver feedback in place. Accessors continue to use the ordinary pose, including `getAimMuzzle` during first-shot raise | The exact-root Actor/Physics/WeaponRunner/Projectiles A/B harness covers Shooter, Dualies and Charger at 30/60/120 Hz. Gameplay traces, accessor paths, shot origins/directions, projectile state, Charger queries and RNG draws match with the layer on/off; both Dualies hands fire. The other four weapon kinds in the full composed matrix were not run in this integration. This is INKWAVE fixture evidence, not an S3 muzzle measurement |
| Opposite hit directions | Existing public code records the attacker direction; retail directional curves are unavailable | Directional terms multiply the hit vector; carriage terms do not | A regression is present in the focused file but was not selected in this integration. Retail response remains unverified |
| Local vs remote actor, 30/60/120 Hz update cadence | retail local/remote selection and render cadence are unknown | The module reads current weapon kind, hit vector/amplitude, gait context and native `T_HIT`; it adds no network fields | The moving/fire A/B covers local Shooter, Charger and Dualies at 30/60/120 Hz. Remote parity and browser render cadence were not tested in this integration |
| Damage, HP, knockback, collision, weapon timers, movement and random stream | must not change | Native hit springs/timers and `Actor.damage` are untouched. The render pass restores native pose-solver feedback before the next gameplay frame; accessors retain ordinary-pose muzzle while display bones show the hit layer | Existing real `Actor.damage(20, …)` A/B snapshots remain deep-equal. The composed firing regression also compares Actor/Runner state, the full pre-layer pose, output paths and seeded random draw count with the layer on/off |
| Lethal splat | separate lifecycle | Only `trigger('hit')` is hooked; hide/dispose retire the reaction state | Code scope stays separate; the hide/dispose regression exists but was not selected in this integration |

## What did not change

Native hit springs, `T_HIT` and every other timer, `Actor.damage`/knockback/invulnerability, HP and ink, collision and hitboxes, weapon fire/charge/cadence parameters, projectile and paint authority, networking and the death/splat path. The `sp[…]` spring impulses written by `trigger('hit')` are byte-identical. The render-only pass follows the completed production pose/muzzle adapters and restores solver feedback after drawing. Gameplay muzzle/aim origins, weapon tuning and projectile baselines are unchanged. `inkwave-public/` is unmodified, so the upstream lock is intact.

## Acceptance status (issue #1097 checkboxes)

These statuses describe INKWAVE code and fixture evidence. A local regression passing does not establish retail S3 pose parity.

| Acceptance | Status |
| --- | --- |
| A current 11.3.0 ROMFS/capture identifies the actual damage animation selection for Shooter, Charger, Roller, Dualies, Slosher and Splatling before final tuning | **Open** — no legal ROMFS inspection or console capture exists in this lane. The selection rests on public animation-name data only |
| The same nonlethal hit on Shooter vs Charger vs Roller no longer produces an identical universal core pose | **Met at fixture level** — class-shape differential is asserted locally; S3 curves and chooser remain unknown |
| Idle damage and moving damage select/reference the correct current-S3 state family | **Partial** — `WaitDamage_*`/`WalkDamage_*` are selected from the public names; the real chooser/blend law (including the airborne and squid contexts, where INKWAVE falls back to `WaitDamage_*`) is unverified |
| Onset, visible peak and recovery per family measured from synchronized current-S3 60 fps capture and matched within tolerance | **Open** — the envelope is an INKWAVE visual value inside the native hit window; per-family timing is not claimed |
| Weapon and both hands remain attached with trajectories consistent with the selected damage pose | **Partial** — grip attachment is asserted in the fixture; consistency with the *retail* pose cannot be judged without the retail curves |
| Opposite hit directions still produce the intended directional response | **Met at fixture level** — front/back and side terms are asserted locally; retail directional response is unknown |
| Lethal splat/death motion remains separate | **Partial** — only `trigger('hit')` is hooked and dead owners are ineligible; a death-transition test was not selected here |
| Damage amount, HP, knockback, collision, weapon gameplay timers, authoritative movement and shot baseline unchanged | **Met at production-composed logic-fixture level** — real Actor/Runner/Projectiles A/B traces match; no full match/browser/device run |
| Local and remote actors present the same selected reaction for the same replicated state | **Partial** — local selection and firing were exercised; remote parity was not run in this integration |
| 30/60/120 Hz update cadence does not alter fixed-simulation reaction timing or gameplay firing | **Met for the three local firing fixtures** — Shooter, Charger and Dualies pass the 30/60/120 Hz A/B; cross-rate envelope parity, other families and browser render cadence were not tested here |

## Tests and verification

- Public-root focused selection: `node --experimental-vm-modules --test --test-name-pattern='selection uses the public S3 class/state families|a hit selects the state family|the same nonlethal hit|real damage drives identical gameplay|native solver feedback objects' patches/splatoon3/tests/issue-1097-hit-reaction.test.mjs` → **5/5** (`/mnt/workspace/.dev-state/agent-work/evidence/inkwave-c-resume-20261009/codex3-1097-public29/focused.log`).
- Exact-root moving/fire harness adapted from `/mnt/workspace/.dev-state/agent-work/evidence/inkwave-c-resume-20261009/codex1-1097-budget25/native-motion-probe.mjs` → **9/9** real Actor/Physics/Character/WeaponRunner/Projectiles cases (Shooter, Dualies and Charger at 30/60/120 Hz); the adapted script and log are in `/mnt/workspace/.dev-state/agent-work/evidence/inkwave-c-resume-20261009/codex3-1097-public29/`. It compares layer-on/off gameplay, accessors, origins, Charger queries, Dualies hands and random draws.
- Canonical `scripts/build-inkwave.mjs` with the supplied esbuild module → **5,241,591 / 5,242,880 precache bytes**, 1,289 bytes remain; emitted hit module is 5,402 bytes (`canonical-build.log`, `precache-summary.json`).
- `node --check` on the runtime module, focused test and adapted harness, plus `git diff --check` → pass.
- The full eight-test file, broad local suites, browser rendering and retail-device capture were not run in this public-root integration.

## Remaining unknowns (explicit)

1. Retail 11.3.0 damage skeletal curves, joint angles and per-family frame counts — unknown; catalogue names never prove a pose.
2. The runtime chooser among base `Damage_*`, `WaitDamage_*`, `WalkDamage_*` (and any airborne/squid variant) — unknown; the current rule is an INKWAVE convention.
3. Per-family onset/peak/recovery timing against synchronized 60 fps console capture — unmeasured.
4. Base damage clip for the Blaster family — absent from the pinned corpus; recorded as `base: null`.
5. Whether the `Blower`/`Spnr`/`Mnvr` suffix-to-class ownership holds in the retail skeleton — inferred by set completeness, not inspected.
6. Network-level remote presentation and rendered-pixel parity — remote behavior is fixture-level; browser/console output and network latency are not exercised here.
