> 担当別の調査・再現・局所検証の記録。途中の失敗・後続修正も残している。最終配布物の成功件数・hash・確認範囲は[第3弾の統合記録](../../inkwave-sub-special-fidelity-phase3-2026-10-17.md)を参照。

# Phase 3 retained specials — implementation handoff

Reference: Splatoon 3 11.3.0; raw Leanny snapshot `7280ff9cde8bb1c5dcef46c700c326471584d2e6`. `inkwave-public/` remains frozen. No git/report mutations by this lane. Parent owns final emitted build, browser validation, reporting and merge.

## Sources rechecked

- Official version baseline: https://support.nintendo.com/jp/switch/software_support/av5ja/1130.html
- Ink Vac raw: https://raw.githubusercontent.com/Leanny/splat3/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpBlower.game__GameParameterTable.json
- Bubbler raw: https://raw.githubusercontent.com/Leanny/splat3/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpGreatBarrier.game__GameParameterTable.json
- Cooler raw: https://raw.githubusercontent.com/Leanny/splat3/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpEnergyStand.game__GameParameterTable.json
- Trizooka raw: https://raw.githubusercontent.com/Leanny/splat3/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpUltraShot.game__GameParameterTable.json
- Screen raw (cross-lane absorption ceiling): https://raw.githubusercontent.com/Leanny/splat3/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpChimney.game__GameParameterTable.json
- Vac Wiki: https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/キューインキ
- Bubbler Wiki: https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/グレートバリア
- Cooler Wiki: https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/エナジースタンド
- Trizooka Wiki: https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ウルトラショット

## Ink Vac corrected

- `ExhaleParam.SpawnSpeedY` / `SpawnSpeedYMaxCharge` explicitly .08: native return shot now adds 4.8 world units/s upward at birth. SpawnSpeedZ .55–.7 remains independent, unchanged gravity/drag/lifetime and packet velocity own subsequent movement.
- `ExhaleCollisionParam.RadiusForPlayerMinCharge` explicitly .4: zero-charge native `size` (physical actor sphere) is .4, draw `vis` remains .2. `radius`6–11 is still the separate blast/paint and existing ghost charge discriminator. Charged collider defaults are omitted: their prior .2 fallback is retained and explicitly marked unverified; no invented maximum/interpolation.
- Removed the old velocity-dot-only rejection. Wiki says wind can defend a fully covered teammate from attacks on all sides: lateral/outgoing segments crossing the actual intake now absorb; back/outside, team, liveness, phase and LOS boundaries remain.
- `InhaleParam.MuzzleCollisionOffset`1 / `MuzzleCollisionRadius`1.2 now supply an independent exact swept sphere, in addition to the existing growing wind frustum. Only projectile absorption uses this sphere; actor poison/object tests retain their existing geometry. Release removes both defenses.
- `PaintSplashSpanFrame`20, `PaintSplashSpawnOffset`(-.3,-.7,-.7), `PaintSplashParam.WidthHalf/WidthHalfNearest`1.5 and `DepthScaleMin/Max`2 now author native foot paint while sucking. Native raycast/paint/one `addTurfNoSpecial` credit; no ghost/replica painting or special gain. Ground projection and actor-yaw/chest origin remain declared engineering calibration rather than retail droplet simulation.
- Canonical native reserve now follows the same confirmed constant depletion: capture activation cost, then set `actor.special = cost * clamp(1-state.t/6)` during inhale, zero in exhale. HUD `specialActive.gaugeFraction` reads the same fraction. Death synchronizes the remaining native points before delegating to the existing death penalty/Special Saver; this lane adds no duplicate penalty arithmetic.
- A separate canonical `startSpecialGauge(actor,G,'inkVac',Infinity,state)` claim blocks paint/Tenacity/admission while native Actor.update temporarily masks the presentation token. Release/dispose/reset/clear retire only that claim. Ordinary completion spends the remainder; death preserves it for Saver. Owner, remote, maximum life counter and match boundaries invalidate the old state without overwriting a replacement authority's points. Clear tracks active states even after their owner leaves `G.actors`; newer remote activations retire superseded state records.
- Screen generator absorption has its own explicit 400HP-equivalent tag (`MoveParam.DamageValueForDamageTag`4000/10); default 220 proposal ceiling stays for other objects. Sender binding, equipped special id, registry, serial/team/liveness and duplicate checks still gate remote proposals.
- A suspected charged-main leak was disproved with a paid native Charger negative control: normal release emits one shot, activation's existing shared cancel emits zero. Added regression; no redundant runner reset/mask.

## Bubbler corrected

- Source `BarrierParam.TimeDamage`921 / `TimeDamageOnVLift`1842 (weak budget), multiplied by existing shell/weak budget ratio2. Existing normalization and AP HP control points remain. Passive burn now occurs each source1/60 second, amount rate×interval, rather than once per second.
- Burn elapsed time starts at ignition; startup time is not counted in a later large `dt`. Exact final natural-life frame is covered for AP0/AP57, ordinary/Tower and30/60/120Hz.
- Remote replicas advance only `presentationBurnProgress`, not authoritative hp/fieldHp/damageProgress/expiry or network events. Shader health uses shared destruction progress plus the remote display-only term, so weak-point damage is visible too.
- Wiki gauge paragraph says depletion starts in startup motion before ignition, is linear over unattacked natural lifetime, and destruction immediately clears the remainder. Start lock at deploy; keep `Infinity` destruction lock and pass separate natural display frame count (`IgnitionFrame` + ceil(AP-scaled HP/source burn ×60)) to HUD lane's optional sixth argument. Never map incoming damageProgress directly to gauge depletion.

## Cooler corrected

- `FridgeParam.VanishDistance`1.8 now retires overlapped prior stands on deployment, either team, through local and validated replay shared path. Existing same-owner replacement remains. Retiring the old stand ends only its matching gauge lock and leaves acquired drinks intact; duplicate placement serials remain inert.
- Added `support-cooler-collision.mjs`: solid cover uses bounds of the existing model; lower face comes from glass body to preserve the visible pedestal gap. Retail dimensions are not exposed. This is explicitly calibrated geometry, not reuse of throw `GuideRadius`1.35 or pickup `ServeAreaRadius`7.
- Both teams' projectiles/normal beams meet an exact rounded-OBB native first-contact candidate, via existing `kitBarrierCandidate`; terrain/actor/boss ordering remains the native owner's decision. Normal blast hits trigger one terrain-impact burst; ghosts still have no damage/paint authority. Type-less blast shielding probes are excluded, so the new stand does not become a blanket explosion shield.
- Native actor integration captures its start pose and queries a horizontal side constraint before native `_resolve`. Humanoids collide; squid, active Dualies dodge/glide, remote replicas and Crab actor mode pass. No top support surface is created. Native movement integration is not run twice.
- Native timed/attachable bombs select stand as a normal contact, rebound with existing native calibrated response, and avoid artificial detonation, sticking, search or fuse creation. The reusable Hit flag is explicitly cleared on each bomb query.
- Custom `type:'sub'` attacks are excluded from generic cooler defense consumption. The all-subs owner imports `coolerSegmentContact(system,start,end,physicalRadius)` and routes it through its existing nearest-world/contact mode. This avoids dual contact owners/removing Fizzy or Torpedo as if absorbed. This lane added actual throwBomb/update Fizzy and untransformed Torpedo side-contact regressions at30/60/120Hz; research_subs owns that connection and intrinsic contact-mode decisions.
- HUD lane owns held/thrown Cooler canonical full reserve, pending cleanup and deployed display; this lane did not rewrite those gauge hooks.

## Shared native head gap fixed

`InkFlightRuntime.stepHead` previously compared only stage/actor/boss, bypassing retained Vac/Bubbler and new Cooler defenses for real inkProfile heads (including Splatling). It now compares the existing kit-defense candidate in the same native loop and settles exactly the selected contact. Current-frame source damage is used for absorption. Downstream Ranked adapter's world+first and impact anchors remain intact; a closer Ranked shield stays selected, and a closer kit defense clears `barrierHit`. No second integration/packet is introduced.

## Verification

Use `node --max-old-space-size=2048 --experimental-vm-modules --test --test-concurrency=1 ...`.

- Initial related four legacy suites:129/129 pass, `/workspace/scratch/retained-special-existing-tests.log` (before final cover wiring).
- Production-composition deep suite15/15 pass through cover/typed bounce/real InkFlight/Screen cases: `/workspace/scratch/retained-special-deep-cover.log` (16th foot-paint cadence case added afterward).
- Five-file run (legacy four + deep16):145/145 pass, `/workspace/scratch/retained-special-final-tests.log`, before the final native Vac reserve patch. Final Vac+deep21 resource/lifecycle rerun: `/workspace/scratch/retained-special-vac-final.log`; result to append after completion.
- New file: `patches/splatoon3/tests/retained-special-deep-fidelity.test.mjs`. Real Actor/Physics/Projectiles/InkFlight/NetMatch replay modules, controlled scene/audio/paint sinks. Has either-team native shot blocking, real inkProfile, gap/wall chronology, human/squid/slide movement, native bomb response/nonarming, real terrain-vs-air burst/ghost negative control, local/remote400 limits, passive lifespan/frame-rate boundaries and foot-paint resource accounting.
- Legacy Vac spawn-speed assertion now separates source Y launch addition from the Z speed component instead of treating vector magnitude as SpawnSpeedZ. Activation accounting assertions now use constant remaining points and a single activation count, rather than the obsolete immediate-zero gauge expectation.
- Independent read-only reviewer is `research_splashdown`. Its custom-sub dual-owner finding was fixed by the type split; custom sub owner asked to run Fizzy/Torpedo/Mist real-path controls.
- New21-case deep suite passed21/21 after native reserve integration. The combined legacyVac55+deep21 run initially passed75/76: one old test manufactured a remote actor's special via local `_startSpecial`, now correctly rejected. That fixture was replaced with real activation/release replay and a negative control proving replicas cannot activate locally; no runtime weakening was made.
- The next combined rerun passed all55 legacyVac and20/21 deep cases; the custom throw case detected a new parallel-lane `towerAttachmentFields` undefined===undefined guard bug (`sub-surface-attachment.mjs:26`). Research_subs was notified and owns that helper repair. All native Vac resource/Saver/lifecycle cases passed; only the21-case deep suite needs rerun after that unrelated helper repair.
- FINAL after the research_subs guard repair: deep21/21 pass,0 failed/skipped, `/workspace/scratch/retained-special-deep-final.log` (3042ms). Latest legacyVac55/55 remain passed in `/workspace/scratch/retained-special-vac-final.log`; its sole combined-run failure was that now-repaired cross-lane helper, not a Vac case. Earlier four-legacy+deep16 run145/145 also passed. Frozen upstream diff and targeted diff whitespace checks are clean.

## File ownership / handoff

- This lane: `runtime/kit-ink-vac.mjs`, `runtime/kit-big-bubbler.mjs`, new `runtime/support-cooler-collision.mjs`, new `tests/retained-special-deep-fidelity.test.mjs`, `tests/kit-ink-vac.test.mjs`.
- Local shared hunks: `runtime/kit-support.mjs` (install collider and1.8 overlap only; held/flight reserve hooks owned by HUD lane); `runtime/kit-defense.mjs` (Cooler bomb classification/fallback; subsequent fixed-band edit owned by combat lane); `runtime/kit-subs.mjs` (Cooler Hit entry only; retained bomb work owned by HUD lane); `runtime/trizooka-collision.mjs` (pure sphere/OBB export); `runtime/weapons-fidelity.mjs` (world physical radius export); `adapter.mjs` (InkFlight defense arbitration and native bomb Cooler contact only; other hunks owned elsewhere).
- `runtime/all-subs.mjs` / `runtime/torpedo-splashes.mjs`: research_subs owns the custom world query and intrinsic response; this lane supplies the shared helper and real custom path regression.
- Runtime code frozen after native reserve/lifecycle corrections. Parent owns final emitted build/browser/global suite/CI list/report/commit. No upstream frozen file or Crab scalar changed.

## Final integration fixture repair (parent-assigned follow-up)

- `tests/all-specials.test.mjs` only: grounded Wave recipients now place their Actor feet at actual ground height rather than copying the device's elevated contact skin; the annulus hit/destruction/duration assertions remain intact.
- Wail object-row fixture now tracks an enemy on the intended +Z axis and puts the special device on the actual right upper-speaker beam. Retains exact16.8 device damage,4 wall callbacks and source3.5×2.4 assertions.
- Chump native ellipse no longer happens to overlap seed111 positions6/9. The paint-attribution oracle now deliberately gives those two native flying decoys the same target, retaining duplicate-expiry, missing/extra stamp, displacement and ownership negative controls and all exact counts.
- Remote Wave test exposed a real4F boundary error: `(age .4833333333333333 - landedAt .41666666666666663)*60` evaluated3.999999999999999. Research_specials added source-frame epsilon only to mark-radius comparison. Test now explicitly rejects detection at3F and requires it at4F; remote front identity/no authored damage assertions stay.
- Jet exhaust and Screen→Wall required no fixture edits: their earlier errors came from the independently repaired unassigned `towerAttachmentFields` guard.
- Targeted seven originally failing cases all pass7/7, fail0/skip0,15282ms: `/workspace/scratch/retained-all-specials-fixtures-final.log`. No huge whole-file rerun in this lane; parent owns final integration.

## Remaining uncertainty — not silently marked solved

- Trizooka's existing staged-flight interpretation still resets `BrakeToFreeVelocityXZ/Y` at brake entry and only exports `GoStraightStateEndMaxSpeed`. Names alone do not establish retail threshold/reset semantics. Same-family main engine treats these differently, but no independent public execution evidence was found. Aim/muzzle remains the previous per-action snapshot; no evidence-based per-glob resampling change.
- Vac charged player collider, exact PoisonMist speed/defaults, muzzle SP-up default, and far/near frustum interpretation remain sparse/unconfirmed. Foot-drop fall time and precise attachment/basis remain calibrated despite connected source cadence/footprint fields.
- Wiki Vac section explicitly cautions that object-rate tables do not establish collision targetability: damage values20–29.9 are inferred and Bubbler canopy/Booyah/Crab/Rainmaker do not appear to receive wind damage despite1× source rows. Current preexisting universal object/canopy damage interpretation was not changed without execution evidence; parent notified.
- Cooler model-derived collider size, rebound coefficients, slide/glide transition boundary and detailed moving-gimmick destruction are not retail measurements. Burst/Toxic/Torpedo intrinsic contact modes should remain their own source behavior; the generic “does not immediately explode timed bombs like Splash Wall” is not treated as evidence to suppress every intrinsic contact explosion.
- Bubbler placement distance/growth timing/overlap target roles and exact retail start-of-life convention remain declared prior calibrations; AP/Tower burn rates and display-vs-authority clocks are independently identified.
- No Switch hardware A/B, live two-client latency test or new renderer run from this lane; parent owns browser/build validation. These tests do not prove full retail parity.
