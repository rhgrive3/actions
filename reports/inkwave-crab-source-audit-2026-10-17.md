# Crab Tank source audit — 2026-10-17

## Immediate implementation findings

Ordinary-versus Splatoon 3 **11.3.0**, pinned `Leanny/splat3@7280ff9cde8bb1c5dcef46c700c326471584d2e6`, explicitly supplies distinct shooter impact/splash/wall-drop paint, cannon trail paint, collision radii, damage and some motion/timing fields. INKWAVE's baseline `all-specials.mjs` consumes only part of these. Its damage numbers generally match; paint/collision and incomplete motion are the most actionable discrepancies.

**The missing defaults remain unverified for PvP.** The same commit's **Mission** table explicitly supplies cannon `SpawnSpeed=2.0`, shooter terminal repeat `4F`, body paint radius `.8`, body damage interval `.4s`, and shooter braking/free defaults. These are useful cross-mode corroboration, not proven PvP inheritance. Mission also has different direct damage, blast radius, duration and recovery fields. Do not silently promote its omitted-in-PvP values to certified PvP defaults.

The raw PvP table downloaded by the parent at `work/crab-gyro/WeaponSpChariot.json` is byte-identical to the independent download. Raw PvP, Mission and Coop copies plus digest/pointer metadata are preserved in `reports/inkwave-crab-source-audit-2026-10-17/`. No production files were edited by this audit.

## Source identity and scope

- Primary [PvP JSON](https://raw.githubusercontent.com/Leanny/splat3/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpChariot.game__GameParameterTable.json): Git blob `806e78fb51ae2db60479385b4316c689cce55345`; SHA-256 `6cd8048512e030276bf7bc889490838a4346f1108505dbb70eb6e424dbcdf252`; 5,268 bytes.
- [Mission JSON](https://raw.githubusercontent.com/Leanny/splat3/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpChariot_Mission.game__GameParameterTable.json): blob `73418af1928dcc0b09e8d6fa7cea4b0de3afbb1c`; SHA-256 `575d132236134067de25f1ce391740e773fd922f012f0b176ec32296b65759bb`; 8,065 bytes.
- [Coop JSON](https://raw.githubusercontent.com/Leanny/splat3/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpChariot_Coop.game__GameParameterTable.json): blob `5e3e6664569a69e3eb1ba9022822424a60bfe73e`; SHA-256 `b11277d4b33de30b3e1f410c1843623d15156d83ac66a3ca84474669af38dcb7`; 949 bytes.
- INKWAVE comparison baseline: repository commit `e6a27000dfd36c2d8ddb24bd3a167ac984d9623b`, `patches/splatoon3/runtime/all-specials.mjs`, blob `0e4824d3bd6196304fbd61d7469d2b985dcc3159`, SHA-256 `94cd67bee71da2ec739c9137a0e849bd0d722efdc9d5d9fefacf193df2564520`. Findings below describe that baseline, before the parent's concurrent implementation.

These are community-extracted game data, not Nintendo-published engine documentation. Extraction proves explicit values and keys, not complete runtime semantics. Length scale `1 raw unit = 1 INKWAVE world unit` is the existing provisional bridge; it is not a measured metre, wiki DU, or training-line conversion. The project's 60 Hz bridge multiplies speeds by 60 and accelerations by 3,600; raw damage/armor is divided by 10. Preserve these distinctions when consuming fields.

## PvP fields and baseline discrepancies

All pointers in the tables below are JSON Pointers relative to the PvP JSON root. Several rows name a parameter object and enumerate its child keys; `evidence.json` additionally records every scalar/empty-array value with its complete leaf pointer.

### Shooter paint and collisions

| JSON pointer | Explicit value(s) | INKWAVE baseline and implication |
| --- | --- | --- |
| `/GameParameters/ShooterPaintParam` | `DistanceMiddle=1.1`; `WidthHalfNear=1.6`, `WidthHalfMiddle=1.6`, `WidthHalfFar=1.5` | Shot launch uses `radius=.22`; direct descriptor also uses `.22`. No Crab mapping consumes these widths. Paint width is being collapsed into a much smaller generic impact radius. Exact near/far distance endpoints and depth coefficients are absent in PvP, so a complete footprint cannot be recovered from this table alone. |
| `/GameParameters/ShooterSplashSpawnParam` | `SpawnNum=2.5`, `SplitNum=8`, `SpawnNearestLength=1`, `SpawnBetweenLength=10`, `ForceSpawnNearestAddNumArray=[]` | `launch()` sets `trailEvery=0` by default; Crab has no splash planner. Preserve fractional count rather than rounding every round to 2 or 3; exact split permutation is not defined by these numeric fields. |
| `/GameParameters/ShooterSplashPaintParam` | `WidthHalf=1`, `WidthHalfNearest=2.016`, `DepthMaxDropHeight=3`, `DepthMinDropHeight=10` | No Crab consumer. Do not confuse splash width with shooter head impact width. Depth scale endpoints are absent in PvP. |
| `/GameParameters/ShooterWallDropCollisionPaintParam` | `PaintRadiusFall=.65`, `PaintRadiusGround=.6`, `PaintRadiusShock=1.3` | No Crab-specific wall-drop consumer. Generic hit stamps do not implement the separate shock/fall/ground paint states. |
| `/GameParameters/ShooterWallDropMoveParam` | first duration min/max `20/40F`, first target speed `.06/F`, second duration `10F`, second target speed `.06/F`, last duration min/max `15/35F`, `FreeGravityType="value_0_008"` | Source provides more wall-run behavior than baseline consumes. Enum text alone does not fully establish engine integration. |
| `/GameParameters/ShooterCollisionParam` | field/player initial/end radii all `.2`; `ChangeFrameForField=0`; `FriendThroughFrameForPlayer=0` | Baseline shot `size=.13` and generic native collision are distinct from paint radius `.22`. Neither value is a source `.2` collision mapping. `ChangeFrameForPlayer` is absent; do not invent its value. |

Baseline trace: `all-specials.mjs:193` (`specialPaintParams`, no Crab branch), `:279` (`launch`), `:1658` (shot launch), `:2015` (direct descriptor). The direct shot's `s3AllSpecialPaintRadius` happens to inherit cannon `4.5`, but its terrain hit follows native `_impact`, not `_blastBurst`: **this is not evidence that shooter terrain hits paint a 4.5-radius disk**. Native `_impact` in `inkwave-public/src/game/weapons.js:1271` uses `p.radius` with generic jitter/stretch; blast-only disk expansion is at baseline `all-specials.mjs:1991`.

Reproduction target for the implementation owner: fire single Crab rounds into close/far floor and wall surfaces, then continuous fire over a ledge; inspect impact width separately from detached splash count/landing and wall-drop behavior. Missing channels affect turf coverage and wall painting. Status: confirmed source/config omission; resulting retail footprint remains unmeasured.

### Cannon paint, collision and damage

| JSON pointer | Explicit value(s) | INKWAVE baseline and implication |
| --- | --- | --- |
| `/GameParameters/CannonParam/BlastParam/PaintRadius` | `4.5` | Matches cannon nominal radius. Descriptor clamps a native stamp to `3.74`; special disk tiling attempts to recover nominal `4.5`. Source radius does not certify the reconstructed texture/tiling. |
| `/GameParameters/CannonParam/BlastParam/PaintOffsetY` | `.2` | Generic ground projection/offset is used instead; source offset is not independently consumed. |
| `/GameParameters/CannonParam/BlastParam/CrossPaintRadius` and `/GameParameters/CannonParam/BlastParam/CrossPaintCheckLength` | both `0` | Absence of a cross channel in Crab mapping agrees with explicit zero; do not add a cross from another bomb's defaults. |
| `/GameParameters/CannonParam/SplashParam/SpawnParam` | `SpawnBetweenLength=3.1`, `SpawnNum=10` | Baseline cannon `trailEvery=0`; no distinct cannon trail splash spawning. |
| `/GameParameters/CannonParam/SplashParam/DrawSizeCollisionPaintParam` | `PaintWidthHalf=1.12`, `PaintDepthScale=2`, `DrawRadius=.1`; field collision initial/end `.15`, player collision initial/end `0` | Distinct paint-only trail splashes are not implemented. Do not apply shooter splash size/count or infer a full trail width from draw radius. The first-splash placement ratio is absent in PvP. |
| `/GameParameters/CannonParam/CollisionParam` | field `.1→.25` at `4F`; player `.04→.4` at `5F`; friend-through `1000F` | Baseline cannon has `size=.28`, `radius=4.5`, generic collision. Neither fixed size nor blast-paint radius represents the source's separate evolving collision radii. |
| `/GameParameters/CannonParam/DirectDamage` | `500` → `50 HP` | Matches baseline `damage=50`. |
| `/GameParameters/CannonParam/BlastParam/DistanceDamage/0` | `Damage=300` → `30 HP`, `Distance=4.8` | Matches the single constant baseline band `[[4.8,30]]`. Native burst excludes the direct-hit actor, so do not infer an 80-HP direct hit by adding both channels. |
| `/GameParameters/CannonParam/BlastParam/DamageOffsetY` | `.2` | Not separately consumed in Crab's nominal band descriptor; blast centre/vertical geometry still requires comparison. |

Baseline cannon launch is `all-specials.mjs:1648`; descriptor is `:68`; special disk expansion is `:1991`. Reproduction target: fire cannon across flat ground and over an edge, inspect falling trail splashes separately from the final disk, then test direct/near-edge hits. Missing trails affect turf before impact; collision differences affect hit admission. Status: explicit missing/mismatched parameter consumers, no retail shape or collision parity claim.

### Projectile trajectory and damage falloff

| JSON pointer | Explicit PvP values | Baseline comparison |
| --- | --- | --- |
| `/GameParameters/ShooterMoveParam` | `SpawnSpeed=3.36/F`, `GoStraightToBrakeStateFrame=7F`, `GoStraightStateEndMaxSpeed=2.232/F`, `FreeGravity=.016/F²` | `sourceFlight()` consumes these four numbers. It immediately uses free gravity after straight flight and has no shooter braking stage/free resistance. PvP omits their numeric values; omission does not mean zero or that no stage exists. |
| `/GameParameters/ShooterDamageParam` | `ValueMax=320`, `ValueMin=160`, `ReduceStartFrame=9`, `ReduceEndFrame=25` | Launch and `s3DamageReduce` match `32→16 HP` over `9→25F`. Baseline recomputes damage once per outer projectile update, while motion can substep; impact-age parity across outer update sizes is not established by transcription. |
| `/GameParameters/CannonParam/MoveParam` | straight `8F`, brake duration `1F`, brake gravity `.04`, brake resistance `.1`, free gravity `.05`, free resistance `.12`, brake-to-free velocity thresholds XZ `20`, Y `10` | Baseline consumes durations/gravity/resistance but not velocity thresholds. Exact transition-condition logic is not established by JSON. |
| `/GameParameters/AdditionMovePlayerParam/ZRate` | `2` | Launch uses aim direction plus optional fixed arc, without a separate source player-velocity inheritance mapping. The parameter's engine coordinate semantics are not proved here. |

Baseline `sourceFlight()` is at `all-specials.mjs:218`, source stepper `:231`, and damage falloff update `:1960`. Shooter launch option `speed:24` is overwritten by the source launch speed `3.36*60=201.6`; it is therefore **not** the effective shooter speed. Cannon has no source spawn speed in `sourceFlight`, so its calibrated `speed:18` and `arc:2.4` remain effective. Lifetime `1.25s` shooter / `1.7s` cannon and fixed muzzle height `.95` are also not supplied by the PvP table.

Reproduction target: compare flat and elevated aimed trajectories and damage at fixed projectile ages at 30/60/120 Hz. Baseline source stepping alone cannot certify a complete force/transition model. Status: matching explicit partial coefficients, incomplete dynamics, unspecified defaults retained as unknown.

### Cadence, movement, rolling paint and steering

| JSON pointer | Explicit PvP value(s) | Baseline comparison / uncertainty |
| --- | --- | --- |
| `/GameParameters/WeaponSpChariotParam/StartDelayFrame_Shooter` and `/GameParameters/WeaponSpChariotParam/StartDelayFrame_Cannon` | both `20F` | State initializes first shooter/cannon availability to `20F`; explicit numbers match. Trigger-relative details need behavioral verification. |
| `/GameParameters/WeaponSpChariotParam/ShooterRepeatFrame_First`, `/GameParameters/WeaponSpChariotParam/ShooterRepeatFrame_Term`, `/GameParameters/WeaponSpChariotParam/ShooterRepeatFrame_Bias` | `12F`, `90F`, `.2` | Baseline computes `12-8*pow(progress,.2)` and schedules from current elapsed time. Terminal `4F` is omitted in PvP; exponent interpretation and exact discrete round timing are not encoded by these fields. |
| `/GameParameters/WeaponSpChariotParam/CannonNoShotFrame` | `32F` | Baseline suppresses shooter for `32F` after cannon; number matches. Cannon repeat `75F` is omitted in PvP. |
| `/GameParameters/WeaponSpChariotParam/PreDelayFrm_Squid_ShotBomb` | `20F` | Baseline delays shooter on leaving ball, but does not similarly move `nextCannon` on that transition. The source name covers shot/bomb; exact triggering rules need retail confirmation. |
| `/GameParameters/WeaponSpChariotParam/NoShotBombReqFrm_FinishSpecial` | `25F` | Baseline blocks cannon requests in the last `25F` and adds a `25F` finish phase. A single named request-limit field does not prove both behaviors or establish a universal recovery lock. |
| `/GameParameters/WeaponSpChariotParam/SpecialTotalFrame` | Low/Mid/High `480/570/660F` | Matches duration tiers `8/9.5/11s`. Interpolation uses the existing gear curve; extraction does not verify that curve. |
| `/GameParameters/WeaponSpChariotParam/ArmorHP` and `/GameParameters/WeaponSpChariotParam/ArmorHP_BreakScissors` | `5000`, `2500` → `500`, `250 HP` | Baseline has total armor `500`; a separate broken-scissors stage is not established by that scalar alone. |
| `/GameParameters/WeaponSpChariotParam/MoveSpeedX` and `/GameParameters/WeaponSpChariotParam/MoveSpeedZ` | `.075/F`, `.015/F` | Attack target velocity consumes these as lateral `4.5` and forward `.9` world units/s, rotated by aim yaw. Source axis/retail steering behavior is still unmeasured. |
| `/GameParameters/WeaponSpChariotParam/MoveSpeedX_SpongeEnemy` and `/GameParameters/WeaponSpChariotParam/MoveSpeedZ_SpongeEnemy` | `.024/F`, `.0048/F` | Enemy-sponge variants not consumed. These names do not prove behavior on ordinary enemy ink. |
| `/GameParameters/WeaponSpChariotParam/MoveSpeedCoef_Squid` | `.6` | Baseline rolling target speed `8.5` is hardcoded; the `.6` coefficient is not consumed. Its baseline movement speed and gear/context application are absent; `.6` alone does not yield an absolute rolling speed. |
| `/GameParameters/BodyParam/CollisionRadiusForField` and `/GameParameters/BodyParam/CollisionRadiusForPlayer` | `1.15`, `1.45` | Baseline rolling damage uses `1.45`; generic actor movement does not establish source field collision `1.15`. Body paint radius/damage/interval are absent in PvP. |
| `/GameParameters/WeaponSpChariotParam/RotDegLmt_ToHumanFrm` | `20` | A frame parameter, **not a 20-degree steering-angle limit**. No corresponding Crab steering interpolation is implemented in this baseline. |
| `/GameParameters/WeaponSpChariotParam/ShotPitVelLmt` | `.015` | No separate consumer found; do not interpret as a yaw cap or degrees/frame without semantics evidence. |

Baseline movement helpers are at `all-specials.mjs:529` and `:536`; Crab state machine is `:1635`; state initialization `:1826`. Attack/ball velocity interpolation uses `1-exp(-8*dt)`; idle ball braking uses `exp(-5*dt)`; jumps use generic player values. Those acceleration/braking/jump choices are not explicit PvP Crab fields.

Rolling damage/paint at baseline `:1663` is coupled to a `.45s` body tick, stamps radius `.9`, and can repaint while stationary. At settled `8.5 world units/s`, `.45s` corresponds to `3.825` units between centres versus nominal stamp diameter `1.8`; this explains a likely discontinuous trail without claiming retail spacing. A distance trace can fix that local continuity, but its chosen spacing/radius must retain their evidence labels.

Reproduction target: rolling while moving/stationary, exiting ball with held shooter/cannon, lateral versus forward movement, small input, accelerate/release, 90° turn, reverse, shoot during yaw change, slopes/edges, and 30/60/120 Hz schedules. Status: raw supported coefficients and missing consumers identified; retail steering, ball speed/paint and input timing unresolved. Input/presentation workers own their implementation.

## Missing defaults: bounded ancestry result

The complete pinned repository Git tree was fetched with `truncated=false`. It contains five distinct ordinary-versus Crab blobs across version folders; each distinct blob was downloaded and checked (representatives `099`, `210`, `310`, `1000`, `1120`; `1130` is byte-identical to `1120`). **None supplies cannon spawn speed, final shooter repeat, cannon repeat, body paint/damage interval, or horizontal steering-angle limits.** Historical snapshots are not a parent relationship and did not fill the gaps.

PvP and Mission have no root `$parent`. Coop explicitly has:

```text
/$parent = Work/Component/GameParameterTable/WeaponSpChariot.game__GameParameterTable.gyml
```

Thus Coop inherits the sparse PvP file; there is no discovered relation making Mission the parent/default provider for PvP. The same-version `misc/SplPlayer.game__GameParameterTable.json` and `misc/params.json` were also inspected; they did not supply an absolute Crab rolling speed or schema declaration. A bounded authenticated GitHub code search outside `Leanny/splat3` for the body type, terminal-repeat and steering field names found other extracted-data copies, not a constructor/schema default definition. Search results/queries are in the metadata; this is a bounded search result, not proof that no declaration exists publicly.

### Explicit Mission-only corroboration

Pointers below resolve against **Mission**, not PvP. These values must not be described as absent-field values directly extracted from ordinary-versus 11.3.0.

| Mission JSON pointer | Value | What remains unknown for PvP |
| --- | --- | --- |
| `/GameParameters/CannonParam/MoveParam/SpawnSpeed` | `2/F` (`120/s` at provisional scale 1) | PvP spawn speed. Do not silently replace `18/s` with `120/s` as a verified PvP fix. |
| `/GameParameters/WeaponSpChariotParam/ShooterRepeatFrame_Last` | `4F` | PvP terminal repeat/default provenance; intermediate bias curve. |
| `/GameParameters/WeaponSpChariotParam/CannonRepeatFrame` | `75F` | PvP repeat/default provenance. |
| `/GameParameters/BodyParam/PaintRadius` | `.8` | PvP ball paint radius, sampling cadence and continuous-trace semantics. |
| `/GameParameters/BodyParam/Damage` and `/GameParameters/BodyParam/DamageSpanSecond` | `400` raw (`40 HP`), `.4s` | PvP body damage and per-target/shared hit-timer behavior. |
| `/GameParameters/BodyParam/CollisionOffset` | `1` | PvP body offset/default. |
| `/GameParameters/WeaponSpChariotParam/MoveAcc_Gnd`, `/GameParameters/WeaponSpChariotParam/MoveAcc_Air`, `/GameParameters/WeaponSpChariotParam/MoveBrk`, `/GameParameters/WeaponSpChariotParam/MoveTrn` | `.008`, `.006`, `.004`, `.8` | PvP movement default values and application; these do not provide an absolute rolling top speed. |
| `/GameParameters/WeaponSpChariotParam/RotDegLmt_ShotDirXZ_H` and `/GameParameters/WeaponSpChariotParam/RotDegLmt_ShotDirXZ_L` | `1`, `18` | PvP yaw limits and the interpretation/application of H/L, frame dependence and interpolation. |
| `/GameParameters/ShooterMoveParam` | brake resistance `.36`, brake gravity `.07`, brake frame `4`, transition XZ `.2355`, transition Y `-.15`, free resistance `.02` | PvP omitted defaults and exact active transition conditions. The matching explicit PvP free gravity is `.016`. |
| `/GameParameters/ShooterPaintParam` | near/far distances `1.1/20`, depth max/min `2.4/1.4`, break-free depth max/min `2.4/1.2`, angles `10/35`, heights `1.5/10` | PvP omitted depth/distance defaults and exact surface-geometry mapping. |
| `/GameParameters/ShooterSplashPaintParam/DepthScaleMax` and `/GameParameters/ShooterSplashPaintParam/DepthScaleMin` | `1.2`, `1` | PvP omitted splash-depth defaults. |
| `/GameParameters/ShooterSplashSpawnParam` | random velocity X max `.055`, Y max `.015`, Z min/max `.01/.02` | PvP omitted scatter defaults and whether detached splash velocity inherits any head/player motion. |
| `/GameParameters/CannonParam/SplashParam/SpawnParam/FirstSplashRateForLengthMin` and `/GameParameters/CannonParam/SplashParam/SpawnParam/FirstSplashRateForLengthMax` | both `1` | PvP omitted first trail-splash location/default. |

Mission's cannon direct `600` and blast distance `5.6`, versus PvP `500` and `4.8`, demonstrate why blindly overlaying Mission would be wrong. Mission also has Low/Mid duration `540/600F` and zero finish/ball-exit request delays where PvP differs.

### Shared helper provenance

`inkwave-public/src/game/inkFlight.js:17` explicitly identifies motion fallbacks as investigator defaults; `patches/splatoon3/reference/weapons-fidelity-reference.json` records them under `analystDefaults` as **"source-guided model assumption; NOT an extracted 11.3.0 override"**. `projectile-visual-profiles.json` cites the community [Shooter data S3 template](https://splatoonwiki.org/wiki/Template:Shooter_data_S3) and explicitly says these are not executable default recovery. This audit did not newly certify that community page against game code.

`splashPlan()` (`inkFlight.js:77`) supports fractional counts and split scheduling, but its descending uniform phase/permutation is expressly a local reconstruction. `INK_MODEL` identifies independent seeded scatter, lifetime and particle dimensions as modeling choices. `spawnSplashDrop()` in `patches/splatoon3/runtime/blaster-flight-paint.mjs` documents its shared scatter/depth/resistance fallbacks and detached landing model; the helper's existence does not prove Crab-specific defaults. Reuse can preserve known explicit Crab count/split/width fields while keeping all inherited assumptions labeled.

The existing ordinary-shooter integrator also says Y-only brake exit is based on investigator experiments and does **not** assume frame/XZ exit conditions are active. Therefore merely finding those fields in Mission is insufficient evidence to switch to a timer-only or threshold-only retail claim.

## Reproduce and validate the evidence

`reports/inkwave-crab-source-audit-2026-10-17/evidence.json` stores source URLs, commits, raw-byte sizes, SHA-256, Git blob hashes, complete explicit leaf pointers, checked absent pointers, historical-blob identities, code baseline digest, and bounded-search results. Nine downloaded JSON sources were checked against the pinned Git tree's blob SHA. Three principal raw files are vendored unchanged; ancillary/historical sources can be retrieved from the metadata URLs and verified against both hashes.

From the repository root, validate the three vendored raw files without network:

```bash
python - <<'PY'
import hashlib, json
from pathlib import Path
p = Path('reports/inkwave-crab-source-audit-2026-10-17/evidence.json')
meta = json.loads(p.read_text())
for s in meta['sources']:
    if 'savedFile' not in s:
        continue
    raw = Path(s['savedFile']).read_bytes()
    assert len(raw) == s['bytes']
    assert hashlib.sha256(raw).hexdigest() == s['sha256']
    assert hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest() == s['gitBlobSha1']
    doc = json.loads(raw)
    for field in s['explicitFields']:
        v = doc
        for token in field['pointer'].split('/')[1:]:
            token = token.replace('~1', '/').replace('~0', '~')
            v = v[int(token)] if isinstance(v, list) else v[token]
        assert v == field['value'], field['pointer']
    print(s['id'], 'verified')
PY
```

Re-fetch a source with inherited proxy settings, preserving raw bytes, for example:

```bash
curl --fail --silent --show-error --location --max-time 40 \
  'https://raw.githubusercontent.com/Leanny/splat3/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpChariot.game__GameParameterTable.json' \
  -o work/crab-source-audit-2026-10-17/refetched-pvp.json
sha256sum work/crab-source-audit-2026-10-17/refetched-pvp.json
git hash-object work/crab-source-audit-2026-10-17/refetched-pvp.json
```

Validation completed: all three vendored files passed raw-byte length, SHA-256 and Git blob checks; **347 explicit leaf values** resolved correctly through their JSON Pointers. Nine downloaded JSON sources matched the pinned Git tree. The parent's raw PvP file matched byte-for-byte.

Assessment is source retrieval, pointer/digest verification and static implementation tracing. It is not a new browser/gameplay test or a controlled Switch comparison. The parent's implementation should retain unknown labels for omitted defaults, and separately verify deterministic behavior at different update intervals. This report does not mark retail parity complete.
