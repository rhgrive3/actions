# Weapon-class hit reaction comparison — 2026-10-09

Issue [#1097](https://github.com/rhgrive3/actions/issues/1097). Baseline `5d0be6b7fdebfd07e696e75497aaa97aa5ff5648` (branch `inkwave/c-1097-cl7-handoff5-20261009`), acceptance baseline **Splatoon 3 Ver. 11.3.0** ([Nintendo update history](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/)). The comparison target is the published `inkwave-public/` composed with the active `patches/splatoon3/` adapters; the separate `game/` prototype is not evidence.

This lane changes presentation only: `patches/splatoon3/runtime/weapon-hit-reaction.mjs` (new), one import/call in `runtime/install.mjs`, one adapter export (`T_HIT` added to `CHARACTER_TIMERS` in `patches/splatoon3/adapter.mjs`), the focused test and this record. `inkwave-public/` bytes are untouched.

## Sources and receipts

Retrieved over verified TLS during this lane and retained under `/mnt/workspace/.dev-state/agent-work/evidence/inkwave-c-resume-20261009/cl7-1097-handoff5/sources/`:

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
- Class-suffix ownership (`Spnr` = Splatling, `Mnvr` = Dualies, `Blower` = Blaster, …) is an inference from set completeness over the ten `WaitDamage_`/`WalkDamage_` class suffixes and the ten S3 weapon classes (`Brsh` carries locomotion only). It is naming evidence, not a ROMFS skeleton inspection, and is labelled that way in `S3_CLASS_SUFFIX_INFERENCE`.

## Difference, reproduction and verification

| Motion / reproduction | Nintendo basis | Public implementation and effect | Result / verification |
| --- | --- | --- | --- |
| Same nonlethal hit on Shooter, Charger and Roller from one root-space direction | S3 exposes a separate damage motion family per weapon class | Before: `Character.trigger('hit')` injected one universal torso/head/pelvis/clavicle spring set for every class, and only the ordinary hold differed afterwards. After: the hit records class, locomotion context and hit vector, then `weapon-hit-reaction.mjs` adds class-shaped pose on top of the untouched native window inside `_buildPose` | Focused regression builds the production graph for the three classes and compares hit-minus-idle core traces: layer disabled the cross-class spread stays under 0.01 rad, layer enabled it exceeds 0.02 rad and every class differs from its own disabled trace |
| Idle and moving damage | `WaitDamage_*` and `WalkDamage_*` families both exist | Selection reads `gaitW > 0.25` at the hit and stores `WaitDamage_<family>` or `WalkDamage_<family>` | Test drives a real walking fixture (root advance → native gait) and asserts `WalkDamage_Shtr`; the idle fixture asserts `WaitDamage_Shtr` |
| Weapon trajectory during the reaction | Issue direction 6: the damage pose should own the body/weapon trajectory instead of shaking the normal hold | The `_poseWeapon` hold/aim output on anchor and pole channels is scaled back by a per-family factor while the envelope runs; the class carriage is then added on top | Test keeps the right-hand grip error below 0.1 world units through a 1.6-amplitude reaction and asserts a non-zero hold relinquish in the snapshot |
| Opposite hit directions | the directional response must survive | Directional terms multiply the hit vector; carriage terms do not | Test: front/back pitch deltas have opposite signs, a pure side hit adds less pitch than a frontal one and rolls the torso more |
| Local vs remote actor, 30/60/120 Hz render | the same replicated state must present the same reaction | Selection derives only from replicated state (class, gait, hit vector, amplitude) and the envelope from the native `T_HIT` simulation clock | Test: local and remote snapshots match; at 30/60/120 Hz age and envelope agree within 1e-5 s (the native timers are a `Float32Array`) |
| Damage, HP, knockback, collision, weapon timers, movement | must not change | The module writes pose channels and its own `WeakMap` only; native springs, timers and the `Actor.damage` path are untouched | Test applies real `Actor.damage(20, …)` with the layer on and off and asserts the whole `gameplay()` snapshot is deep-equal, and that native `hitAcc` still accumulates |
| Lethal splat | separate lifecycle | Only `trigger('hit')` is hooked; hide/dispose retire the reaction state | Structural assertion on the module source (no splat/death/collision/network references) plus the hide/dispose test |

## What did not change

Native hit springs, `T_HIT` and every other timer, `Actor.damage`/knockback/invulnerability, HP and ink, collision and hitboxes, weapon fire/charge/cadence parameters, projectile and paint authority, networking and the death/splat path. The `sp[…]` spring impulses written by `trigger('hit')` are byte-identical: this lane only adds pose-channel output after the native `_buildPose` body. `inkwave-public/` is unmodified, so the upstream lock is intact.

## Acceptance status (issue #1097 checkboxes)

| Acceptance | Status |
| --- | --- |
| A current 11.3.0 ROMFS/capture identifies the actual damage animation selection for Shooter, Charger, Roller, Dualies, Slosher and Splatling before final tuning | **Open** — no legal ROMFS inspection or console capture exists in this lane. The selection rests on public animation-name data only |
| The same nonlethal hit on Shooter vs Charger vs Roller no longer produces an identical universal core pose | **Met** — focused regression with the layer on/off comparison |
| Idle damage and moving damage select/reference the correct current-S3 state family | **Partial** — `WaitDamage_*`/`WalkDamage_*` are selected from the public names; the real chooser/blend law (including the airborne and squid contexts, where INKWAVE falls back to `WaitDamage_*`) is unverified |
| Onset, visible peak and recovery per family measured from synchronized current-S3 60 fps capture and matched within tolerance | **Open** — the envelope is an INKWAVE visual value inside the native hit window; per-family timing is not claimed |
| Weapon and both hands remain attached with trajectories consistent with the selected damage pose | **Partial** — grip attachment is asserted in the fixture; consistency with the *retail* pose cannot be judged without the retail curves |
| Opposite hit directions still produce the correct directional response | **Met** |
| Lethal splat/death motion remains separate | **Met** (only `trigger('hit')` is hooked) |
| Damage amount, HP, knockback, collision, weapon gameplay timers and authoritative movement unchanged | **Met** (real `Actor.damage` A/B with a deep-equal `gameplay()` snapshot) |
| Local and remote actors present the same selected reaction for the same replicated state | **Met at fixture level** — no full two-device/network run in this lane |
| 30/60/120 Hz rendering does not alter fixed-simulation reaction timing | **Met at logic level** — envelope age agrees within 1e-5 s across cadences; no browser or device run |

## Tests and verification

- `node --experimental-vm-modules --test patches/splatoon3/tests/issue-1097-hit-reaction.test.mjs` → 7/7 pass (log: `.../cl7-1097-handoff5/test-hit-reaction.log`).
- Neighbours: `patches/splatoon3/tests/adapter.test.mjs` + `patches/splatoon3/tests/hit-spawn-motion.test.mjs` → 23/23 pass (log: `.../cl7-1097-handoff5/test-neighbors.log`), covering the adapter export change and the shared hit/spawn composition.
- No broad local suite, no browser run, no build, no CI submission in this lane.

## Remaining unknowns (explicit)

1. Retail 11.3.0 damage skeletal curves, joint angles and per-family frame counts — unknown; catalogue names never prove a pose.
2. The runtime chooser among base `Damage_*`, `WaitDamage_*`, `WalkDamage_*` (and any airborne/squid variant) — unknown; the current rule is an INKWAVE convention.
3. Per-family onset/peak/recovery timing against synchronized 60 fps console capture — unmeasured.
4. Base damage clip for the Blaster family — absent from the pinned corpus; recorded as `base: null`.
5. Whether the `Blower`/`Spnr`/`Mnvr` suffix-to-class ownership holds in the retail skeleton — inferred by set completeness, not inspected.
6. Network-level remote presentation parity and rendered-pixel parity — not exercised here.
