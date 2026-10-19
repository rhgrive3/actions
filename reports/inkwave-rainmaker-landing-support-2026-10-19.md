# Rainmaker bounded support through the existing source landing clip

Base: Clam-deferred stage [8a9036623038f051fbdeef1f5057a5b3950ccee6](https://github.com/rhgrive3/actions/commit/8a9036623038f051fbdeef1f5057a5b3950ccee6). This is a separate landing-only candidate, not part of that stage's current CI/native acceptance.

## Scope and observed failure

The previous air-only correction restores its canonical source pose at landing. In exact789378 native20, Dualies carry113 had.01068185WU support separation and charge305 had.02121109WU, equally in before/after. Those frames were outside the168airframe gate. The correction's existing temporary shoulder/arm transaction already preserves source history; only its eligibility stopped too early.

The runtime diff adds `sourceMotion.state === 'land'` beside `air`. `land` already means the grounded Jump*_Ed source clip's finite interval; form events and air have higher priority. There is no unconditional source-pose overlay. The existing residual test still skips reachable poses. Caps stay.2rad and.03world units, final contact gate stays.001WU, and the old support solver still executes once. No face/hair/geometry, wrist/finger, bone-length, gameplay or projectile change is introduced.

The four deferred-Clam runtime changes and shared inactive-Clam receipt checks remain intact. The handoff no longer imports the removed Clam arm helper.

## Source evidence

Same real Actor.update -> Match.advanceRanked driver as native capture, normal pickup, source Player00 Dualies/team0, carry and charge each three jumps:

-168 airborne frames remain within.001WU.
-96 landing frames are now gated,16 per jump. Previous failures6carry+12charge become0.
-Carry landing maximum1.931806e-15WU; charge maximum1.332918e-15WU in the seeded paired probe.
-Maximum landing translation.003137976WU, beneath unchanged.03 cap. Carry needed rotation only.
-724holder trace rows preserve Actor/root/model/P/springs/right muzzle/RNG/events. All non-null source-entry all-bone and rendered/air/dive/from buffers match the old land path exactly.
-Drop at113/305, then two-tick dive/return and actual sub release, or same-frame real throwBomb: four cases preserve actual bomb kind/position/velocity and180post-drop frames. Existing12air-boundary bomb cases remain required.

Committed regressions use the existing full-jump driver, a post-legacy-solve control that suppresses only the new land branch, and real Projectiles.throwBomb callbacks. Character.rng calls are counted per Actor. Each new landing/bomb case now first warms the same complete control path, then resets the identical seeded global Math.random sequence for control/candidate. Both global call counts/value-sequence hashes and per-frame global/Character indices must match; global traffic is not excluded. See the bounded RNG investigation below. The unit negative still rejects targets beyond the unchanged cap, and covers nonuniform world scale, non-accumulation, setWeapon/dispose and idle/ToHuman/ToSquid exclusion.

## Bounded RNG investigation

The initial same-fixture cold-control/warm-candidate comparison was not equivalent initialization. Replacing its global counter with Character.rng alone was insufficient and is not the final evidence. An external stack probe repeated all four paths as warmup-control, control, candidate, resetting the same non-constant LCG before each lane.

For the first carry/quick-return case, cold control consumed5178 calls versus1038 after warmup. The net4140 extra calls were all Three.js generateUUID. Recorded stacks lead through nativeKidShared and the shared body/outfit geometry cache (`character-geo.js`, `_shared`), and heldGeometries/geometries (`bomb-models.mjs`, `heldShared`/`shared`), including native bomb material initialization. These caches allocate geometries/materials/objects once. No runtime cache policy was changed.

Global Math.random also supplies the actual ordinary bomb's two spin components (`Projectiles.throwBomb`); it must not be dismissed as cosmetic-only or independent of all gameplay. After identical warmup, control/candidate counts are1038,990,1062,1014 for carry quick-return, carry same-frame release, charge quick-return, charge same-frame release respectively. Each pair matches the complete generated-value sequence and the observed call-site/phase/value sequence. The two actual throwBomb values and their call indices match in every pair, as do real bomb kind/position/velocity, source-entry buffers and all post-drop snapshots. Thus global RNG parity is established for these four tested paths only, not for every possible game workload or a not-yet-run browser build.

The committed regression retains global Math.random counts/value hashes and per-frame indices in addition to Character.rng. The external diagnostic keeps full call stacks, including the original cold run, rather than dropping the unexplained traffic.

## CPU sample

Final8a903662 stage control and the staged landing candidate were measured in paired control->candidate and candidate->control order, with eight real source-loaded Dualies Characters,3second warmup and two3second measured windows,30/60/120Hz. The earlier789-base sample is retained separately:

-Additional left solves:0 in all holder/nonholder pairs;8pose calls and8left solves per simulated frame.
-Holder eight-Actor pose average candidate-minus-control deltas: 30Hz -0.139/-0.077ms; 60Hz -0.075/-0.060ms; 120Hz -0.145/-0.185ms.
-Nonholder deltas range -0.098 to+0.210ms. No pending correction in nonholders.

These are shared-CPU/JIT/order-noisy measurements, not a speedup or zero-cost claim. The controlled Actor._finishFrame carry/jump/land workload exercised landing rotation at every rate; it did not require landing translation. Actual charge landing translation is functionally tested separately. No GPU/full-match/FPS claim.

## Native contract, pending

Reuse the same20PNG plan, same camera/light, one production build and existing artifact budget. Carry109/112 and charge304 continue to show unchanged air behavior; carry113 and charge305 show the landing change. No extra images.

Before is the exact8a903662 handoff passed through the same production adapters and overlaid into that candidate build, not a complete old build. That module has no deferred-Clam helper import, so only handoff is overlaid. Original spawner/rainmaker/clam baseline choices stay unchanged.

Both lanes must pass all168air contacts; the before lane must reproduce a landing gap. The after lane must additionally pass all96land contacts, one pose/solve and unchanged caps. Shared contract tests reject missing/active Clam receipts, changed frame denominators, true.01WU residuals and excess translation/rotation/solve counts. Source and exact-emitted tests must run before the20images are accepted.

Source tests and external timing do not replace a future exact-head emitted/native run. New landing shoulder appearance and continuity are not yet visually accepted. The separate interrupted-ToHuman ownership issue, retail wrist/finger accuracy and broader weapon/team/aim combinations remain outside this candidate. Old789378 air20 only accepted the earlier air delta.
