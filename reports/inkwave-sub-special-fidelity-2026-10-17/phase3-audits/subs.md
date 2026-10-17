> 担当別の調査・再現・局所検証の記録。途中の失敗・後続修正も残している。最終配布物の成功件数・hash・確認範囲は[第3弾の統合記録](../../inkwave-sub-special-fidelity-phase3-2026-10-17.md)を参照。

# Phase 3 sub audit — research_subs

2026-10-17, base `main e6a2700`, working branch `fix/sub-special-deep-fidelity-20261017`.
Reference: Splatoon 3 versus Ver.11.3.0, GP0 unless a test explicitly uses GP57. Public documentation was read, not a Switch recording. Native/source VM checks below are separate from the parent's build/emitted/browser checks. No Crab tuning or frozen upstream file was edited.

## Changed runtime files

- `patches/splatoon3/runtime/all-subs.mjs`
- `patches/splatoon3/runtime/torpedo-splashes.mjs` (new)
- `patches/splatoon3/runtime/sub-surface-attachment.mjs` (new)
- `patches/splatoon3/runtime/kit-sprinkler.mjs`
- `patches/splatoon3/runtime/kit-subs.mjs`: only our one-line `beginSprinkler(b,n,spec,hit)` call-site change; other hunks belong to audit_bomb_kits.
- Shared `catalogue.mjs` offline Beakon destination identity is owned/checked by audit_bomb_kits. Shared Mine Tower causal-paint helper and ranked snapshot hooks are owned/checked by research_specials.

## Corrections, exact sources, and reproduction

### 1. Angle Shooter ground rebound

Raw <https://leanny.github.io/splat3/data/parameter/1130/weapon/WeaponLineMarker.game__GameParameterTable.json> — `GameParameters.MoveParam.ReboundGroundReflectAngleRate=.1`, `ReboundWallReflectAngleRate=1`, both `*BoundRate=1`.
Wiki <https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/ラインマーカー#i393784f> corroborates near-parallel departure from sloping floors.
Before: ordinary mirror reflection on every surface. After: ground departure angle is incoming angle ×.1; walls retain ordinary reflection and both retain speed. Actual native OBB segments at flat/tilted/vertical planes are tested at 30/60/120 Hz, with ghost reflection/line expiry/clear and zero ghost paint/events.

### 2. Fizzy queue admission and owner-hop replay

Raw <https://leanny.github.io/splat3/data/parameter/1130/weapon/WeaponBombFizzy.game__GameParameterTable.json> — `MoveParam.ChargeFrameArray=[40,80]`, `BurstWaitFrameArray=[15,1,1]`, `BurstWarnFrameArray=[15,7,7]`, `HopPitchL/H=48/58`, `HopVelL/H=.24/.32`.
Wiki <https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/タンサンボム#characteristic> gives the B-button 8F queue contribution, drain cap2.5 per source frame starting on the pressed frame, and airborne input support. Previous runtime waited an extra source frame; it now drains new credit on the admitted input frame without double-spending the existing queue's frame allowance.
The owner already emitted `fizzyHop` after a ground pop, but ghost handling did not resume its next visible hop correctly. Replay now requires the exact next pop count and extracted one-frame subphase fuse; repeated/skipped/malformed hops cannot revive or mutate an attack. Input and real grounded-source → JSON hop replay tests cover owner reset and no ghost paint/damage/events.

The raw `MoveParam.BlastParamArray[*].SplashAroundParam` is also now connected: each stage emits6 separate harmless drops, radius.7, Y offset.3, pitch10–25° /10–20° /10–20°, velocity .35–.40 / .36–.42 / .39–.43 DU/frame. Each paints only at its own terrain contact. The shared detached pool retains children after parent retirement/death and clears them with the world. Its calibrated gravity and deterministic azimuth are explicitly not extracted defaults. JSON checks prove18 ordinary radius.7 rows plus exactly3 unchanged bounded causal cores; no .7 child receives a core receipt or expands the grant. Ghost burst stage counters prevent duplicate child creation.

### 3. Torpedo capture, straight launch, ground fuse, and separate droplets

Raw <https://leanny.github.io/splat3/data/parameter/1130/weapon/WeaponBombTorpedo.game__GameParameterTable.json>:

- `MoveParam.BetweenRotEndAndStartChaseFrame=20` is a wait AFTER rotation, not a delay from projectile birth.
- `BurstFrame=30`, both ground position air resistances `.3`, `HitVerticalWallReboundMaxRate=.7`.
- `FindSpawnSplashAroundParam`:6 harmless paint drops, radius.7, pitch30–45°, velocity.15–.23/frame.
- `BlastParamChase.SplashAroundParam`:8 scattered12-damage drops, pitch65°, velocity.42–.48/frame; each has its own terrain-contact small blast/paint.

Wiki <https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/トーピード#r2c63076> documents stopped transformation then straight movement, no continued steering behind a moving target, loss of search after touching terrain, ground-only ~30F fuse, and a provisional `45F?` transformation table. The search table gives approximate horizontal1.8 / above1 / below.5 trial lines.
Before: moving steering began20F after birth, terrain could be ignored after transformation, fuse could elapse during airborne return, and an immediate extra12/radius2 center stamp replaced separate droplets. After: bounded asymmetric capture → stopped rotation25F (CALIBRATED from tentative45 total minus raw20 wait) → stopped raw20F wait → fixed launch direction; same-life target sampled only before launch, no re-target to respawn. Touch before capture disables search; side-wall rebound uses raw cap; floor fuse pauses off a ledge and does not reset on re-landing. Chase timeout counts launched motion age. Owner main contact does60/35 only;8 children independently contact terrain for12 and radius2. Six capture children paint harmless radius.7.
Detached children survive parent retirement/owner death, clear with the world, use existing hit/object/LOS/paint authority, and have presentation-only ghost counterparts from actual lock/burst replay. Main+drop damage and ordered JSON paint replay produce identical source/receiver CPU grids; duplicate packets do not hit/repaint again.

### 4. Sprinkler second-stage duration

Raw <https://leanny.github.io/splat3/data/parameter/1130/weapon/WeaponSprinkler.game__GameParameterTable.json> — `MoveParam.PeriodFirst={Low480,Mid630,High780}`, `PeriodSecond={Low900,Mid960,High1020}`.
The interpretation is documented at <https://wikiwiki.jp/splatoon3mix/検証/パラメータ情報/サブ>, and current community confirmation explicitly totals8+15=23 seconds: <https://z.wikiwiki.jp/spla3/topic/149/1394> (also <https://altema.jp/splatoon3/subseinoup>).
Before: `PeriodSecond` was treated as an absolute age, weakening at15s GP0. After: it is the middle-stage duration, weakening at23s GP0 /30s GP57. Actual native input-created Sprinkler and helper shot schedules test the exact cumulative boundary; native owner-death retirement remains.

### 5. Beakon simultaneous usage, placement, and offline identity

Raw <https://leanny.github.io/splat3/data/parameter/1130/weapon/WeaponBeacon.game__GameParameterTable.json>. Uses and interaction sequence are public gameplay observations rather than extracted from that file.
Wiki <https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/ジャンプビーコン#x08ca573> documents landing-time use consumption and concurrent jumpers being able to complete, including when one Beakon-equipped jumper consumes the whole device. Before: reservation count pre-capped selection by remaining uses. After: independent same-life reservations are accepted until actual landing exhausts the device. Device retirement clears consumption records while already selected native flights retain their committed destination and finish. New selections reject dead/uses0 devices. Same actor cannot flood reservation IDs; duplicate landings cannot spend twice.
Ground-only/feet placement is corroborated by current S3 <https://gamewith.jp/splatoon3/362475>, <https://gamewith.jp/splatoon3/362076>, and the explicit comparison on <https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ホップソナー>. Airborne use is denied before native payment; grounded release uses actual feet and zero velocity, not hand-height flight. This also removes the obsolete +.02 gameplay-origin bias for Beakon/Mine.
Offline Actors have no native nid; actor-specific WeakMap keys prevent two owners' first same-life/seq devices collapsing into one map identity. Our helper is shared by audit_bomb_kits' local catalogue identity correction. Four actual superjump/update tests cover concurrency, use exhaustion, first jumper carrying Beakon, remote proposals, and offline identities; one additional native input test checks the ground gate.

### 6. Splash Wall throw, delayed activation, and replacement

Raw <https://leanny.github.io/splat3/data/parameter/1130/weapon/WeaponShield.game__GameParameterTable.json> — fixed throw speed/inheritance, HP tiers,400F active decay and30F contact-damage span retained.
Wiki <https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/スプラッシュシールド#Explanation> documents floor deployment, fixed local trajectory, approximately1s throw-to-active even on early uphill contact, old curtain disappearing when the new curtain opens, and decay from active deployment.
Before: aim pitch changed velocity, wall/actor could place it, early ground contact immediately created a barrier and removed the old one. After: fixed pitch velocity, side-wall reflection/floor placement, separate landed `wallPending` phase, and old-device retirement/HP decay only at active deployment. The1s value is explicitly a community approximation, not an extracted exact frame. Raw400F remains separate. Actual source input/contact/barrier checks cover30/60/120 Hz and old/new activation removal without a double update when the object list shrinks.

### 7. Ink Mine omitted explicit placement/area/blast fields

Raw <https://leanny.github.io/splat3/data/parameter/1130/weapon/WeaponTrap.game__GameParameterTable.json> — `MoveParam.PlacePaintRadius=1`, `AreaParam.AreaOffsetY=.45`, `BlastParam.DamageOffsetY=.45`, `BlastParam.PaintOffsetY=.45`.
These explicit fields were stored incompletely or unconnected. Placement now paints its radius1 footprint once; marking uses raised Area center, damage/LOS/object damage uses the separate raised Damage center, and core paint uses raised Paint center. Mine gameplay origin is feet, avoiding remote deploy adding a second origin bias. SensorRadius remains a distinct MoveParam field; no unproven AreaOffsetY is imposed on its trigger sphere. Real placement input and raised center near/far/mark boundaries are tested with native floor/LOS geometry.

Current <https://wikiwiki.jp/splatoon3mix/バンカラマッチ指南/ガチヤグラ指南> explicitly states that Mine cannot be placed on grates. The actual native ground block's `grate` property now denies both admitted input and direct throw before ink payment; changing that same actual support to solid admits one feet placement. Its ordinary radius1 placement paint is accounted separately from the later causal radius5 core in the old-life receive regression.

### 8. Moving stage support for placed subs

Nintendo official update history <https://www.nintendo.com/en-gb/Support/Nintendo-Switch/Game-Updates/Splatoon-3-Update-History-2358763.html> (4.0.0, independently indexed at <https://splatoonwiki.org/wiki/Version_4.0.0_(Splatoon_3)>) explicitly describes Sprinklers attached to Tower sides/bottom.
Current mode guidance <https://wikiwiki.jp/splatoon3mix/バンカラマッチ指南/ガチヤグラ指南> documents Sprinkler/Beakon/Shield uses on the moving Tower; Mine placement is also described by current Trap/Tower pages. Only existing INKWAVE Tower geometry is used, with no claimed retail dimensions.
Native Sprinkler binds the actual contacted block ID and retains local position/normal/tangent/bitangent. Custom Mine/Beakon/Shield bind only the canonical ranked Tower block. Every source/ghost placed pose follows its existing OBB transform; current shield collision/yaw, Mine sensor/blast/paint centers, and new Beakon map selection positions agree. Actual native Sprinkler side/bottom contacts also retain their local surface normal after Tower translation/rotation, with no repeated placement paint. Already detached droplets stay world-space. Existing native superjump destination commitment is preserved: following a moving Beakon throughout an already committed flight needs a direct retail/public observation and is NOT added.
Mine core paint uses research_specials' bounded trusted-host-revision support reference. No revision proof means no special remote paint permit; it does not fall back to a six-field static receipt or an expanded spatial grant.
Third-Mine placement can detonate the oldest synchronously before the projectile update. The gate/throw and detonation entry points also synchronize its support, and an actual third-placement test verifies its core uses the moved Tower position rather than last frame's position. research_specials additionally verified real `Projectiles.throwBomb` spawn-before-host-pose-publication/core7meta/JSON grid parity in `patches/network-replication/tests/tower-mine-paint-admission.test.mjs` (4/4; `/workspace/scratch/tower-mine-paint-native.log`).

### 9. Cooler first-contact integration

Shared `coolerSegmentContact` is owned by audit_special_kits. Our custom sub sweep chooses its nearest contact versus stage geometry with the projectile's own physical radius, leaving no duplicate generic defense consumption. Marker/Fizzy/untransformed Torpedo replica world reflections remain visual-only; deployments and bursts still wait for owner events. Confirmed Cooler non-stick Sprinkler behavior is handled by the native owner.
Independent audit_special_kits actual `throwBomb → update` tests pass for Fizzy/untransformed Torpedo ×30/60/120 Hz; log `/workspace/scratch/retained-special-vac-final.log`. Generic Wiki 'bombs bounce' is insufficient to invent a specific exception to Burst/Toxic/Torpedo ordinary contact-trigger behavior, so those uncertain Cooler cases retain their ordinary solid-contact behavior and are recorded below.

## Source verification

Command prefix for all our processes: `node --max-old-space-size=2048 --experimental-vm-modules --test --test-concurrency=1`.

- `/workspace/scratch/phase3-subs-regression.log`:64/64 early8-file integration pass (before final attachment additions).
- `/workspace/scratch/phase3-subs-attachment-tests.log`:6/6 final dedicated native moving-surface, Beakon ground and Fizzy ghost-hop tests.
- `/workspace/scratch/splash-wall-deployment-tests.log`:5/5.
- `/workspace/scratch/torpedo-detached-splashes-tests.log`:4/4 including actual two-client JSON hit/paint-grid replay.
- `/workspace/scratch/sub-deep-stages-tests.log`:11/11 early stage/charge boundaries.
- `/workspace/scratch/phase3-subs-last-deltas.log`:7/7 (Fizzy raw stage tuples,18 real harmless contacts/death/clear/JSON ordinary-vs-core authority, Mine offsets/realgrate admission).
- First16-file final integration was112/114. Both failures were stale Mine fixtures (old +.02 gameplay bias; expecting legal prior-life radius1 placement to disappear alongside an invalid old-life radius5 core). Both are corrected to verify the actual feet origin and separate normal placement from core permission. No runtime permission was loosened to satisfy those tests.
- `/workspace/scratch/phase3-subs-final-source.log`:121 tests /120 pass /1 fixture-order failure,229.4s. All runtime changes were already frozen. This includes the later side/bottom Sprinkler contact cases and third-Mine same-frame burst.
- `/workspace/scratch/phase3-mine-life-fixture-final.log`:the one remaining old-life fixture passed1/1 after preserving production order for its positive case (`birth → ordinary placement → death → core`). Its negative case still rejects unreceived old-life births while preserving legal prior-life placement.3.74s. This was a test-order correction; no runtime or receive permission changed. Thus all121 distinct targeted cases have successful results on the frozen production source, with the full-run versus targeted-rerun distinction retained here.
- `node --check` for changed runtime modules and `git diff --check` passed before final integration run.

Exact17-file current final source/emitted targets (base `patches/splatoon3/tests/`):

1. `all-subs.test.mjs`
2. `sub-community-behavior.test.mjs`
3. `torpedo-flight-stages.test.mjs`
4. `torpedo-detached-splashes.test.mjs`
5. `sub-ground-reflection.test.mjs`
6. `sprinkler-stage-duration.test.mjs`
7. `fizzy-input-queue.test.mjs`
8. `beakon-concurrent-jumps.test.mjs`
9. `splash-wall-deployment.test.mjs`
10. `ink-mine-source-offsets.test.mjs`
11. `sub-moving-surface.test.mjs`
12. `beakon-ground-admission.test.mjs`
13. `fizzy-ghost-hops.test.mjs`
14. `catalogue-sub-paint-authority.test.mjs`
15. `sub-mark-lifecycle.test.mjs`
16. `burst-contact-phases.test.mjs`
17. `fizzy-detached-splashes.test.mjs`

## Remaining uncertainty / calibration / separate ownership

- Marker raw `TailFrame90` versus current Wiki105F remains unresolved (flight/line/render-relative interpretation). No invented105F retime. Exact line width and world hurtbox geometry remain calibrated.
- Fizzy exact warn/wait/SE phase connection is not fully established: first ground total~30F and later re-landing behavior are retained; raw15/1/1 wait and15/7/7 warning are not proof for an arbitrary new scheduling formula. Slope drag fields exist (.19 horizontal/.28 at50°), but native intermediate-slope interpolation and full rolling orientation remain unverified.
- Fizzy explicit stage-specific6-drop tuples are wired and tested; omitted default gravity, exact azimuth/spread distribution, collision shell and resulting Nintendo paint shape remain calibrated rather than proof of trajectory identity.
- Torpedo rotation25F is a calibration from provisional Wiki45F?, not an extracted or exact measured frame; capture startup6F uses an old5–6F community estimate. Search dimensions are community approximations. Raw `FindCollisionStartRadiusRate=.55555` is retained but dynamic capture-volume expansion semantics are unverified. Lost-target last-location behavior, exact movement speed6.2, gravity24, timeout, azimuth distribution and actual world mapping need footage. Hand/foot-release paint has no identified exact radius; not invented.
- Sprinkler droplet default physics, spread, draw cadence/orientation, exact initial paint footprint/world scale and age-dependent ink footprint remain calibrated. Native placement/ghost support follows actual contact physics; default world geometry is INKWAVE's stage, not retail geometry.
- Shield fixed velocity is sourced; exact hand origin changing with aim, precise activation frame, curtain dimensions, reflection coefficient, invalid-placement handling and pushback remain unverified.
- Mine `PlaneDamage`, native cross-paint shape/check length, exact arming/ink trigger timing and separate trigger-center default are not fully mapped; explicit Area/Damage/Paint centers are mapped independently.
- Moving Beakon existing-flight retarget, platform crush/obstruction destruction, and any non-Tower custom moving support remain unverified. New selections use current destination; already committed flights keep existing native commitment.
- Poison Mist exact unpublished jump magnitude/defaults and full cylinder geometry remain calibrated; no new unsupported tuning. Point Sensor remains retained support owner and existing accepted behavior. Native Splat/Suction/Burst/Curling/Autobomb implementation refinements are owned by audit_bomb_kits, not omitted from the overall14-sub audit.
- Cooler retail dimensions and individual contact-trigger bomb exceptions need direct observation; generic text does not settle Burst/Toxic cases.
- Source tests, emitted tests, browser rendering and retail Switch matching remain separate evidence levels. Parent owns builds/browser and final report/main reflection.

## Freeze / handoff

Production source is frozen after the harmless Fizzy children, grate prepayment gate, and third-Mine attachment synchronization. The last changes after the freeze only corrected/extended tests. All121 distinct targeted source cases have successful verification as documented above; no known remaining source regression. `git diff --check` passed after the final fixture correction. No source test process remains running in this lane.

The remaining explicit but unconnected fields are either SE/audio identifiers/timing without the corresponding retail state mapping, native slope interpolation/default physics, or paint geometry not representable by the circular current paint API. No new exact retail frame/velocity/shape was inferred to close those gaps. Source URLs/conditions and the tentative Torpedo25+20 interpretation remain explicit in this note and runtime calibration labels.

## Release fixture follow-up

Parent requested only the stale deployment-clock fixture in `sub-models.test.mjs`. It now checks released/early-contact folded state, absent curtain throughout `wallPending`, visible gradual growth/opening before activation, and full arms/curtain at actual deployment within a bounded120 native ticks. Existing Mist cloud size, post-unfold stability and shared-geometry disposal checks remain. The animation's body may reach full scale before its arms finish opening, so no unsupported `scale<1 for every pending tick` assumption is imposed.

Release artifact `11e83aa370160918a6cfbf88e047afb344fa735236315c4c6a8ad7fc494ca0d2`, path `/workspace/scratch/subspecial-phase3-release-site`:full `sub-models.test.mjs` passed8/8,16.69s. Log `/workspace/scratch/phase3-sub-models-release-final.log`. The Character test still prints its caught VM dynamic-import callback warning; no test failure. `git diff --check` passed. No runtime file changed in this follow-up; fixture and runtime are frozen again.
