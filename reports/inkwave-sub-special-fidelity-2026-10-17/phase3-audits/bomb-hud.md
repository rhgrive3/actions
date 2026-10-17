> 担当別の調査・再現・局所検証の記録。途中の失敗・後続修正も残している。最終配布物の成功件数・hash・確認範囲は[第3弾の統合記録](../../inkwave-sub-special-fidelity-phase3-2026-10-17.md)を参照。

# Phase 3 — bomb kits / spent SP HUD / offline Beakon identity

- Repository: `/workspace/actions`, branch `fix/sub-special-deep-fidelity-20261017`, baseline main `e6a2700`.
- Reference version: Splatoon 3 11.3.0 ordinary versus. GP/AP0 unless otherwise stated; relevant tests include AP57 and Tower.
- This is a source-runtime comparison and deterministic native-input/VM verification. It is not a retail capture, browser visual approval, or proof of complete hardware equivalence. The public `inkwave-public/` tree was not edited. Parent owns final build/browser/commits/report integration.

## Confirmed differences fixed

### Spent gauge display was disconnected from deployed locks

Reproduction: activate Tenta/Chump, or throw Wave/Screen, or operate Bubbler/Cooler; wait for the short body animation to end. The previous HUD read only native `specialFrac()`, which was already zero, even while the sourced post-use window remained. Death/reset did not restore the missing display. Touch transport inherited the same zero value.

Changed `runtime/tacticooler-gauge.mjs`, `runtime/storm-effects.mjs`, and `patches/local-quality/hud-snapshots.mjs`:

- The existing deployed lock owns its captured `startedAt` and `displayDuration`. HUD reads a clamped elapsed fraction; it does not write `actor.special`, `specialFrac`, `specialReady`, network samples, or earned-point receipts.
- Tenta600F and Chump635F start at activation; Wave and Screen start at throw. Remote actors retain their ordinary replicated charge rather than receiving an invented local clock.
- Wave display/lock duration is now **approximately390F**, from the individual Wiki's measured approximately6.5s. This supersedes the overview's rounded6s/previous360F. Neither raw ShockSonar's omitted SpecialReduce nor `WaveEmitFrameArray` establishes that value. This source conflict remains explicitly recorded as a community approximation.
- Cooler keeps the fixed600F depletion denominator even on a Tower, where the physical stand disappears at450F. The display drains at the original rate until disappearance, then ends immediately; it does not speed up to fit450F.
- Bubbler display drains at its **undamaged natural lifespan**, captured at deployment including15F ignition + the AP/Tower-adjusted natural HP/TimeDamage lifespan. Its gameplay lock remains device-owned/Infinity. Incoming damage changes actual HP and may end the device early; it does not accelerate this display curve. The initial suggestion to display `damageProgress` was rejected after reading the individual Wiki.
- Holding Wave/Screen/Cooler shows full spent gauge while alive, with no new gameplay lock. Storm's original held display remains intact.
- Death/reset preserve already deployed clocks. Match teardown, Rainmaker cancellation, actual destruction/retirement and source invalidation end the appropriate projection. Ordinary points earned after unlock are not repayment for points blocked before unlock.

Exact public references:

- `https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン#pcd898a4`: lines102–117, constant automatic depletion, immediate zero on a normal early finish, death stops normal depletion, and every refill route is blocked during depletion. The general table contains stale values for some specials and was not used to override current individual values.
- `https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン#a6ebc309`: lines119–131, seven locks, operation versus throw origin, continuation after death, early destruction, fixed Tenta/Chump exceptions, Rainmaker cancellation.
- `https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/グレートバリア#j13c5da0`: lines208–214, starts during startup motion, drains at undamaged natural lifetime rate, SPU affects duration, early break immediately clears remaining gauge. This is not an HP display specification.
- `https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ホップソナー#hd247088`: lines143–150, approximately6.5s from throw; early destruction; footnote that Screen also begins depletion at throw; held device can be retained indefinitely.
- `https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/エナジースタンド`: installation starts depletion, Tower stand lifetime450F. Official `https://support.nintendo.com/jp/switch/software_support/av5ja/500.html` lines87–88 confirms Nintendo5.0.0 changed refill delay after placement7.5→10s; reopened directly this phase (old www.nintendo.co.jp address redirects). Current version reference also reopened: `https://support.nintendo.com/jp/switch/software_support/av5ja/1130.html`.
- `https://raw.githubusercontent.com/Leanny/splat3/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpEnergyStand.game__GameParameterTable.json`: SpecialReduceFrame600, kept separate from stand lifetime and drink lifetime.

### Held / in-flight native remaining gauge and ordinary death carryover

Reproduction: throw Storm/Cooler upward or from a height. The body animation ends while the native projectile remains airborne; gameplay lock correctly has not begun yet, but the HUD formerly showed0 and jumped back to1 on operation.

- The initial display-only pending claim exposed a second confirmed logic difference: native activation zeroed points immediately, so a death before operation could not preserve the documented full remainder through normal death/Special Saver.
- `startHeldSpecialGauge` now captures **canonical pre-operation state**: actual activation token, full cost, current game/match, owner and network life. Wave/Screen calls are coordinated in all-specials `makeState`; Storm/Cooler calls use their actual native activation success paths.
- `startPendingSpecialGauge` transfers that existing ownership to the **actual native Storm/Cooler projectile and its owning array**. It cannot fabricate a new reserve from a later stray throw. List membership, match, actor life/owner, local authority and Rainmaker exception validate the same canonical state.
- Native remaining points stay full until operation. `activationCost` retains provenance; `cost` follows the current native gear denomination so a temporary Special Charge change cannot restore obsolete point units at death. Full points are not a second activation: `specialReady` and `_startSpecial` reject a still-owned pre-operation reserve, without mislabeling this period as an already deployed `specialGaugeLocked` window. Turf scores still count, with no point repayment or readiness announcement.
- Native `splat` supplies the captured full amount to the **existing gear death/Saver wrapper**, then discards the pre-operation state. GP0 retains50%; GP57 Saver retains100%. HUD reads ordinary saved charge after death, rather than preserving a held display. This is gameplay state ownership, not charge obtained by reading back a HUD projection.
- Actual operation consumes native remaining points and starts the already established deployed lock. Reset clears pre-operation ownership; a surviving thrown source can still operate after owner death/reset and consume the new life's saved remainder, preserving the previous phase's explicit late-operation contract. Already deployed clocks survive reset.
- `storm-power.mjs` wraps existing `throwStorm`; `kit-support.mjs` adds native hold initialization/flight transfer, and its clear owner set includes actors represented only by a flying Cooler, covering departure before teardown. Same-life match invalidation/clear consumes the old reserve; foreign owners, new lives and remote actors receive no unauthorized charge mutation.
- The operation origin and pre-operation ordinary-death behavior are sourced by the same individual/general references above. No artificial airborne countdown or new post-operation duration was introduced.

### Other body specials also displayed zero throughout use

Parent requested the same audit beyond the seven locks. `storm-effects.mjs` now reads existing native/adapter action state, without editing all-specials or changing action duration:

| Special | Display source | Public evidence |
| --- | --- | --- |
| Inkjet | `1 - state.t / state.duration`, captured AP-adjusted450/480/510F | individual450F + general constant-depletion rule |
| Booyah | same action clock,600F maximum, normal throw ends immediately | individual600F + general early-end rule; Booyah charging level is separate |
| Ultra Stamp | same action clock,450/570/660F AP curve, throw ends immediately | current individual450F + pinned SPU duration tiers |
| Triple Inkstrike | same action clock,360F, third native marker release ends immediately | individual360F, native real release path |
| Kraken | same480/540/600F action clock, includes60F startup and excludes60F recovery | individual expressly defines480F as activation→gauge0, including startup |
| Zipcaster | **`state.inkFuel / 150`**, not `state.t / 9` | individual expressly identifies special ink reserve with top-right special gauge |
| Ink Vac | owner's `specialActive.gaugeFraction`,1 at activation, inhale `1-t/6`, exhale0 | source owner `inkVacState` phase clock; audit_special_kits added display-only synchronization without broad import-graph expansion |

Exact references:

- `https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ジェットパック#c31f521c` lines24–32:450F.
- `https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ナイスダマ#spec` lines31–43:600F maximum/13F throw; `#pcd898a4` on general page supplies uniform depletion and immediate normal-finish zero. NiceBall's charge progress is not the spent special gauge.
- `https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ウルトラハンコ#q8c8d855` lines26–30: current450F.
- `https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/トリプルトルネード#a2e0a022` lines52–65:360F; three marker throw timing; normal third-release finish.
- `https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/テイオウイカ#fc6f8a77` lines86–87:480F is spent-gauge window, including60F startup, excluding60F recovery.
- `https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ショクワンダー#q14bf52c` lines97–106: ink reserve = special gauge = remaining duration; main/hook/other drain affects this reserve; death stops normal depletion.
- Current captured raw duration fields are already owned by `all-specials.mjs` and verified by its prior source suites; this HUD change reads those states instead of introducing duplicate parameter constants. Raw source base: `https://raw.githubusercontent.com/Leanny/splat3/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/` with `WeaponSpJetpack`, `WeaponSpNiceBall`, `WeaponSpUltraStamp`, `WeaponSpTripleTornado`, `WeaponSpCastle`, `WeaponSpSuperHook` `.game__GameParameterTable.json` files.

Trizooka already has `trizookaGaugeFraction→syncTrizookaGauge` updating native remaining charge; Slam already has its separate tidal-slam action-clock adapter. Combat agent has added canonical native remaining charge/death/Saver synchronization for the six body specials and Wail; retained-special agent has added it for Vac. The display test now compares HUD with the next real native step's remaining fraction. Crab values, action behavior and HUD were excluded.

### Autobomb raw launch/air support and live approach threshold

Reproduction: throw native Autobomb while running sideways/up/down, let it hit a wall before the floor, or chase an enemy past a ledge. Previous behavior omitted raw drag/inherited launch terms, generic wall handling could arm fuse before a floor search, and supported movement disabled gravity permanently, so the Robot hovered after a ledge. Live-target arrival also reused a raw field explicitly named for a **dead** target.

`runtime/kit-autobomb.mjs` and local selectors in `runtime/kit-subs.mjs` now:

- Use raw MoveParam flight air resistance.05866, launch Y.24, min worldY-.4, Z low/mid/high1.12/1.4/1.68 (source units; repository conversions×60).
- Use raw inherited motion X1.6/Z2/YPlus4/YMax.32 through the shared throw-velocity helper's actor-local X/Z basis. No world-axis interpretation is introduced.
- Preserve wall/ceiling reflected flight without a fuse/search until native floor contact. Existing native restitution/geometry remains a declared calibration.
- Follow floor only at existing native bomb clearance.21. Loss of support restores raw gravity.016×3600 and explicitly sourced airborne XZ acceleration.012/cap.09, so the Robot falls after a ledge and does not gain Curling's step/slope climbing behavior. Landing again preserves the original search/chase age.
- Raw FindRotate10F / BeforeRotate30F / Chase150F use a small floating-point comparison epsilon so the real30th source frame is not delayed by binary29.999999999.
- Keep **`DeathTargetApprouchDistance=.65` as raw provenance**. The live stop threshold is separately **community-measured approximately.3 trial lines =1.5 runtime units**, replacing.65 incorrectly applied to a living target. This is an approximation, not a raw default.

Exact sources verified this phase:

- `https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/ロボットボム`: lines22–30 cost55/ink stop85F, live approach approximately.3 lines, acquisition2.5 lines,150F chase/60F warning; lines41–49 nearest scan, floor requirement, wall/ceiling bounce, straight pursuit without route planning, cannot climb steps, can fall from ledges.
- `https://splatoonwiki.org/wiki/Autobomb`: independent qualitative confirmation of nearest search/ink-hidden targets/ground pursuit; not used to invent dead-target or turning timing.
- `https://raw.githubusercontent.com/Leanny/splat3/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponBombRobot.game__GameParameterTable.json` (downloaded again to `/workspace/scratch/WeaponBombRobot-deep-pinned.json`): MoveParam `FlyPositionAirResist`, `FlyGravity`, `SpawnSpeedY`, `SpawnSpeedYWorldMin`, `SpawnSpeedZSpecUp.Low/Mid/High`, `FindRotateFrame`, `BeforeRotateFrame`, `ChaseFrame`, `ChaseGroundAddSpeedPerFrame`, `ChaseGroundMaxSpeed`, `ChaseAirAddSpeedXZPerFrame`, `ChaseAirMaxSpeedXZ`, `DeathTargetApprouchDistance`; `spl__SpawnBulletAdditionMovePlayerParam` XRate1.6/ZRate2/YPlusRate4/YMax.32.

### Offline Beakon selection identity collided across owners

Reproduction: an ordinary offline native match creates actors without network `nid`. Two friendly owners place Beakons at the same per-owner sequence/sourceLife (normal first placement). The former map destination key fell back to literal `'local'`, producing identical keys and resolving a selected second owner's destination to the first owner's device. Pending-use cleanup could also confuse these owners.

- `runtime/catalogue.mjs` now uses `beakonActorKey(o.owner)` supplied by research_subs in `all-subs.mjs` rather than an ambiguous shared local fallback.
- Numeric nonnegative safe network IDs retain their previous representation. Unnumbered actors receive stable per-object WeakMap identities `local1`, `local2`, etc. The same helper is used for reservation identities and owner matching, and removal checks the actual Beacon owner reference, avoiding cross-owner cleanup.
- No new network authority, free use, use budget, or expiry rule was added. Existing authenticated wire paths remain life/sequence/owner checked.
- Actual offline native `_setup` calls `newActor(team,slot)` without assigning nid; `_setupRoster` assigns network nids. Thus this is a reachable native offline bug rather than a hypothetical malformed-ID scenario.

Specification: `https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/ジャンプビーコン#x08ca573` — use is consumed at landing; concurrent already selected jumpers may all finish. The identity design is repository compatibility plumbing, not a Nintendo parameter.

### Suction Bomb was fixed in world space after sticking to a moving Tower

Parent authorized the final confirmed attachment correction after peer moving-support review. Reproduction: native Suction hits Tower deck or pole, then Tower moves during its120F countdown. Previously the bomb/paint/damage remained at the old world coordinate.

- `kit-subs.mjs` captures the initial native `hit.block` only when it is the current Tower deck/pole, using the peer `sub-surface-attachment.mjs` transform helper. The existing per-bomb step copies that platform's current local contact point/normal back to the native bomb before fuse/visual/blast work. No new angular speed, collision velocity inheritance, route law, fuse clock or blast pass is added.
- An already stuck bomb never reattaches merely because another surface intersects it later. This preserves the individual Wiki's explicit counterexample: a fixed-floor Suction can remain inside a passing Tower and emerge without being pushed or destroyed. The test uses an actual fixed-floor collision, then verifies the moved Tower pole's OBB actually contains the unchanged bomb point.
- Native source and ghost share attachment presentation; `s3Resolved` remains absent on the ghost, so movement creates no damage/paint/point authority. Contact begins the original120F fuse; airborne age does not count. Source owner death does not cancel the deployed bomb. Real blast, native paint plane, mesh pose and cleanup use the moved contact position.
- Source: `https://wikiwiki.jp/splatoon3mix/ガチヤグラ` explicitly permits attaching Suction to the Tower pole; `https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/キューバンボム#Explanation` lines67–73 specifies surface attachment, approximately2s after contact, no airborne countdown and contact-plane paint. Individual page line122 describes placement on the Tower; line140 footnote expressly says an already placed bomb is not pushed/destroyed by intersecting moving obstacles. `https://gamewith.jp/splatoon3/362468` independently describes placement on Tower for area denial.
- The platform transform is repository geometry, not new raw Nintendo motion data. Suction's raw fuse is still omitted;120F remains the individually verified community value from prior phase.
- New formal test: `patches/splatoon3/tests/retained-suction-attachment.test.mjs`: three actual-native30/60/120Hz owner cases (120F exact boundary, moved damage/paint after owner death), one actual ghost pole case (no gameplay consequences), one fixed-floor overlap/clear/new-bomb countercontrol.

## Verification and logs

All source tests use `node --max-old-space-size=2048 --experimental-vm-modules --test --test-concurrency=1`; no large parallel node workers or full all-specials suite were started by this agent.

1. Initial complete seven-lock HUD regression: **27/27 PASS**, `/workspace/scratch/deployed-gauge-deep-regressions.log`. Suites: deployed-special-gauge-display(then4), deployed-special-gauge-lock, issue-469-storm-gauge-display, issue-469-647-bootstrap-scope, local-quality low-ink-snapshots.
2. Expanded display tests: `/workspace/scratch/deployed-gauge-display-extended.log` initially6/7; one new Storm test incorrectly drove `_updateSpecial` instead of the real `Actor.update` hold-input path. Corrected the test to use native input update; targeted Storm/Cooler pending case **1/1 PASS**, `/workspace/scratch/deployed-gauge-pending.log`. This was a test setup correction, not a runtime workaround.
3. Final expanded gauge/related/Beakon run: **34/34 PASS**,50.74s, `/workspace/scratch/deployed-gauge-deep-final.log`. Same five suites as1 plus Beakon; display now7 tests covering body clocks/Zip reserve/Vac phases and real delayed flight/death operation. Offline test4 now completes the second jumper through the actual Actor landing controller and independently consumes its own remaining use.
4. New Autobomb native-path boundaries: **5/5 PASS**, `/workspace/scratch/autobomb-deep-final.log` (18.47s). Launch AP0/57 + local inherited axes/downward clamp; wall/ceiling no arm; real owner/ghost source drag and FixedClock30/60/120 traces; supported floor/ledge/fall/relanding without reset; living target1.3world arms at30F while raw dead-target.65 remains distinct.
5. Full retained bomb source regression: `/workspace/scratch/retained-bomb-deep-regressions.log`: **64 PASS/1 FAIL initially** (74.7s). The only failure was the new exact30F Autobomb case due to floating-point29.999999; corrected with epsilon, then all new5 Autobomb cases passed in4. Other64 cases already passed, including bomb-kit-fidelity, Curling, native kit-subs, sub-models. Do not describe the initial65 as an all-pass combined run.
6. Offline Beakon: **4/4 PASS** in `/workspace/scratch/beakon-offline-identity.log` before final native landing strengthening. Test4 uses actual native deployment, two no-nid owners same seq/life, distinct real map selection, distinct unnumbered reservations, independent landing cost/expiry/cleanup. Final run3 also drives the second offline jumper through the real Actor landing path to consume its own device's remaining use.
7. Final existing Autobomb/model regression after the epsilon fix: **6/6 PASS**,3.45s, `/workspace/scratch/autobomb-final-related.log` (`--test-name-pattern='[Aa]utobomb|[Rr]obot'` on kit-subs and sub-models). Earlier4/4 is in `/workspace/scratch/autobomb-deep-existing.log`; the full retained run5 also includes those cases with the separated1.5 live threshold.
8. `git diff --check` passed after implementation. Parent owns build request-count budget/emitted browser verification and main integration.

Test ownership / edited paths:

- New: `patches/splatoon3/tests/deployed-special-gauge-display.test.mjs`, `retained-autobomb-fidelity.test.mjs`, `preoperation-special-gauge.test.mjs`, `retained-suction-attachment.test.mjs` (formal CI/emitted test names sent to parent).
- Local updates: `deployed-special-gauge-lock.test.mjs` (Wave390, real floor, Bubbler ignition start), `issue-469-647-bootstrap-scope.test.mjs` and `patches/local-quality/tests/low-ink-snapshots.test.mjs` (historical negative loader updated to actual new HUD import/expression), `kit-subs.test.mjs` one Autobomb support fixture, `sub-models.test.mjs` native floor support, fourth test of shared new `beakon-concurrent-jumps.test.mjs`.
- `kit-subs.test.mjs` Sprinkler23s boundary is research_subs ownership; kit-subs Cooler-contact entry is audit_special_kits ownership. Preserve these peer hunks.
- `kit-support.mjs` here only canonical hold/flight gauge import/calls/clearowner inclusion; its flight, overlap and collision fixes belong to audit_special_kits. `kit-ink-vac.mjs` gaugeFraction and native remaining synchronization are theirs, coordinated with this HUD reader. `all-specials.mjs` here is one held-gauge import; combat agent added the two Wave/Screen activation calls and owns its other native gauge hunks.

## Residuals kept explicit

- **No physical retail comparison has been performed.** Browser visual verification belongs to parent, and cannot establish original-console parity either.
- Wave390F is an approximate individual community observation competing with the overview's6s. No exported raw default has been found. Screen300F likewise is not inferred from its movement TargetSpeedFrame.
- Normal non-lock body specials' **death-time remaining charge and Saver carryover** were initially reported as a separate gameplay concern; parent assigned the confirmed difference to combat/Vac owners. They have now implemented canonical charge synchronization. This agent verifies consistency with the pure display but does not claim sole ownership of those fixes. Storm/Cooler/Wave/Screen pre-operation carryover is handled here as described above.
- Reefslider HUD: general overview has stale1.6s/60F-dash text, while current11.0 individual table/source use38F startup +54F powered dash +38F preburst, and old detailed mechanics say airborne startup does not consume. Exact gauge behavior during the braking/preburst interval is not established here. No invented158F total-action denominator was added. Requires a current direct observation/stronger individual reference.
- Autobomb live approach1.5 is approximate. Search vertical slab+/-3world, instantaneous chase direction versus possible visual ChaseYawDegree wiggle, exact near-warning residual speed, and death/lost-target turn/approach behavior remain calibration. `DeathTargetApprouchDistance=.65` alone is insufficient to invent a dead-target state machine. Existing near-warning fully stops; Wiki says substantially slowed but continuing, without a sourced residual speed. `ChaseAirMaxSpeedY=.18` is exported but its signed application/vertical pursuit contract was not established here and was not guessed; initial FlyPositionAirResist was connected to the native XZ selector, not claimed as a verified full-vector retail flight integrator. These are not called exact.
- Native collision radius.21, floor support, restitution and terrain shape remain repository geometry calibration. FixedClock checks verify consistent repository integration, not retail physics equivalence.
- Curling re-audit found no additional public-spec-determined correction beyond prior phase fixes. Sources: `https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/カーリングボム` lines23–31/58–64/73–74/86–95/103; pinned `WeaponBombCurling.game__GameParameterTable.json` downloaded to `/workspace/scratch/WeaponBombCurling-deep-pinned.json`. Endpoints, monotonic charge effects, base/warning stages and reflection angle are documented; intermediate charge speed/blast interpolation and terminal bias curve formula are not exported. Existing interpolations, omitted maximum raw default and ground/slope response remain declared calibrations rather than fabricated formulas.

## Independent source / native / remote / cleanup review of peer sub changes

- Reviewed all-subs source meaning, native WeaponRunner/Projectiles adapters, JSON catalogue event serialization, replay authority/life validation, and clear paths for Beakon/Torpedo/Angle changes. Did not edit peer all-subs runtime.
- Torpedo reference: `https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/トーピード#r2c63076` lines91–106 confirms stop/transform, nearest target, straight flight after transformed launch, collision splits into detached splash projectiles, terrain-contact inability to acquire, transformed-device targetability. The peer split25F calibrated stop + sourced20F wait avoids mislabeling20F as the full transformation time.
- `torpedo-splashes.mjs` raw8 children, pitch65°, velocity.42–.48,6 acquisition paint splashes, each terrain burst12 are separate from the parent60 burst. Real owner children persist after parent/death and clear on match teardown; ghost callbacks cannot paint/damage/own defense resolution. Gravity24 and uniform azimuth remain declared functional calibrations because raw formula/default is absent.
- Found a real presentation gap: replay torpedoLock/burst initially never invoked the helper's ghost mode. Sent it to research_subs; they added actual native JSON replay calls and report4/4 detached-splash tests including ghost8 children after parent expiry,200 ticks with no paint/HP side effects, duplicate stability, and CPU paint equality. They are reevaluating duplicate protection for direct low-level replaySub calls; native NetMatch already rejects duplicate eventSeq. Parent should retain their final test/result in the phase3 aggregate.
- Angle reference: `https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/ラインマーカー#i393784f` lines69–87 confirms1.75s line,40 direct ends line, terrain reflections, grates pass and near-parallel slope behavior. Peer tangent-plane/GroundAngleRate handling matches the documented direction and explicit ratios; exact undocumented interpolation stays calibration.
- Found offline Beakon identity collision described above; fixed jointly using one helper for catalogue and reservation keys. Confirmed native offline actors actually lack nid.
- Received independent initial HUD read-only review from research_specials: no concrete P1 found; projection has no write-back to native charge/readiness/network, Bubbler Infinity/natural duration distinguished, Tower600/450 preserved, Wave/Screen throw ownership and initial pending match/list/alive/reset boundaries checked. The subsequent canonical native pre-operation expansion was sent for additional review, but that reviewer was reassigned to Mine history; **do not count the expanded pre-operation logic as independently reviewed by them**.
- Final presentation reviewer independently reproduced the held Storm/Cooler native-squid versus forced-human-animation mismatch; parent owns that visual fix. Direct S3 Cooler held-squid/full-gauge evidence was found here at `https://gamepedia.jp/splatoon3/archives/2306` (hold permits walking/squid and does not decrease gauge). Its Storm mention is a Splatoon2 analogy, not direct S3 Storm proof; that source limitation is explicitly retained.

## Latest final status

Expanded34-case display/related run passed before native carryover expansion. The next combined run `/workspace/scratch/preoperation-gauge-regressions.log` passed **all41 gauge/display/legacy/bootstrap/lowink cases**, with4 Beacon failures solely because that child loaded the peer feet-placement implementation before its .02-offset correction. Final actual-source canonical pre-operation **4/4** plus corrected Beakon **4/4**, total **8/8 PASS**,15.17s: `/workspace/scratch/preoperation-gauge-beakon-final.log`. This also covers temporary gear point-denomination changes and rejects reserve resurrection from a stray throw after cancellation. Final display canonical-owner helper reuse plus stale authority/life/match test: **24/24 PASS**,18.73s, `/workspace/scratch/gauge-display-canonical-final.log`. `git diff --check` also passed. No git commit or historical report replacement is performed by this agent.

Final Suction Tower/native pre-operation run after the last runtime edits: **9/9 PASS**,12.92s, `/workspace/scratch/retained-suction-preoperation-final.log` (Suction5 plus pre-operation4). Earlier initial Suction5/5 is `/workspace/scratch/retained-suction-attachment.log`; the final run strengthens the fixed-floor control to a verified actual Tower-pole OBB overlap. Existing Suction/Autobomb/model regressions: **12/12 PASS**,4.47s, `/workspace/scratch/retained-bomb-final-related.log`. Runtime frozen and parent notified; no further public-source-determined correction remains within this reviewed scope, with the explicit interpretation/retail-capture gaps above retained.

Pre-release obsolete-oracle adjustment (no runtime edits): `tenacity-special-lock.test.mjs` first test now captures activation cost and asserts its unchanged held reserve plus `specialReady===false`, then explicitly asserts0 when the real cloud begins. Existing post-operation zero/30–60–120Hz exact unlock awards and owner negative controls are unchanged. Supported emitted first-test selection **1/1 PASS**,3.24s, `/workspace/scratch/tenacity-held-reserve-emitted-final.log`, using `INKWAVE_BUILT_SITE=/workspace/scratch/subspecial-phase3-release-site`, verified contentHash `11e83aa370160918a6cfbf88e047afb344fa735236315c4c6a8ad7fc494ca0d2`. `git diff --check` passed; source-only lateOwner fault injection was not mixed into this emitted selection.

Final CI fixture cleanup (no runtime edits, main pre-release HEAD `d197cc5`):

- Actual failing wrapper cases were in `kit-install.test.mjs`, not the static `kit-composition.test.mjs`. Updated activation oracle to native Trizooka/Vac full remaining points versus Bubbler0. The Bubbler turf case now asserts score+4/charge0/readinessfalse during its actual deployed lock, retires the real device through `clearBigBubblers`, then verifies newly earned turf adds4 without a second activation/refill. The loader now explicitly honors `INKWAVE_BUILT_SITE`, skips source adapters for emitted code, and loads the emitted runtime/profile in that mode.
- `local-quality/tests/team-special-signal.test.mjs` retains the actual native producer, missing-consumer negative, self/enemy/life filtering and icon assertions. Its held Storm assertion now captures actual activation cost and checks full remaining points plus readinessfalse instead of stale0. Its custom source-mutation loader remains a source test; no emitted pass is claimed for it.
- Source: **14/14 PASS**,128.22s, `/workspace/scratch/phase3-gauge-fixture-cleanup-source.log` (team-special-signal6 + static kit-composition5 + real kit-install3). Emitted exact release11e83: **kit-install3/3 PASS**,9.83s, `/workspace/scratch/phase3-kit-install-emitted-final.log`.
- `scripts/check-inkwave-hud-authority.mjs` no longer nulls the original live actor's body token to manufacture readiness while its canonical gauge owner survives. It constructs a fresh actual Actor, temporarily binds `match.local` and `G.local`, establishes real Wave-held and Tenta-fixed-lock negative controls, and neutralizes only that fixture via public native reset and targeted `clearSpecialGaugeLocks`. Desktop/touch23-segment checks then use real neutral points. Finally it resets/disposes the fixture, restores both original local references and verifies original actor special/active/stats are unchanged. Private canonical fields and guards are not deleted or bypassed. `node --check` and `git diff --check` pass. Parent owns the full patched-browser rerun; the old-probe negative was observed at `Special state 1: 23/23/false` on11e83.
