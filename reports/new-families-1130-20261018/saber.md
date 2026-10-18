# Splatana 11.3.0 audit / 2026-10-18

Baseline: `9ef63350385bffee71b3afa0a09290a92e9c862b` (latest main at task start). Source: Leanny/splat3 `7280ff9cde8bb1c5dcef46c700c326471584d2e6`, `data/parameter/1130/weapon/WeaponSaber{Lite,Normal,Heavy}.game__GameParameterTable.json`. Live retained records are identical base main records inherited by alternate kits. No claim of Switch engine or sensory equivalence.

## Changes and numerical evidence

| Discrepancy | Before | After | Evidence class |
| --- | --- | --- | --- |
| F02: slash offset | Ignored all ShotSlashOffset fields; body-yaw box tested against terrain envelope | Attack-admission side selects L/R; actual slash birth uses feet-relative source offset and aim yaw; independent humanoid/swim receiving capsule; Euclidean corners; explicit finite capped cylinder where HasCylinderShape | Exported shape/offset facts; placement/compound-union semantics reconstructed |
| F03: lifetime | One sample at delay expiry | Samples source ages0/1/2/3; expires at4; one shared per-attack actor/device ledger | AliveFrame4 is explicit; frame clock tests establish interpreter boundary |
| F02: obstacles/devices | Feet-to-feet LOS; actor-only melee | Contact-height terrain LOS; real deployed sub/special/native-sprinkler HP and peer-authority routes; exact finite Splash Wall rectangle, existing sphere colliders for other devices | Existing INKWAVE receiving collider conventions, not Nintendo device dimensions |
| F09: input | Current vector normalized before threshold; `.01` forward incorrectly qualified | Raw magnitude compared with threshold.9;5 source frames of history | Threshold/window explicit; recent maximum interpretation reconstructed |
| F09: motion | Immediate constant speed for3/8/15F | Startup4/3/10F, then3/8/15F of normalized geometric Kd travel; total2/3/5.5 unchanged | Startup/distance/duration/Kd explicit; recurrence and startup meaning reconstructed |
| Added: Wiper low-ink tap | Charge-release guard demanded3.5% even though exported weak cost is3% | Exactly3% funds one weak wave, leaving0%; ordinary charge power remains bounded by fundedChargeFrames | New live regression fails0waves before, passes1wave after |
| Added: stale step input | Last humanoid forward samples could persist while swimming | Non-humanoid frames clear the cached source-frame history | Actual ring-state and later neutral release regression |
| Added: post-swing lock | Busy ended at delayed slash/wave event | Exported WeakSwingPostDelayFrame15/22/27F and charged22/14/30F applied to action lock; explicit Dental step addition23F included | Post-delay anchor at release is interpreter semantics |
| Added: pose alternation | `m.side` toggled but never used | Actual horizontal ordinal mirrors yaw/translation; actual admitted mode determines full/tap without prior charged render | Deterministic INKWAVE pose improvement; joint curves remain reconstructed |
| Added: Dental charged pose | All charged attacks used vertical chop | Dental keeps horizontal charged sweep; gameplay `saber-vertical` descriptor remains structural source name | Nintendo Dental introduction referenced by audio/s3-articulation.mjs |
| Added: opponent pose | Generic shoot trigger consumed, no remote catalogue swing | Valid ghost descriptor sets presentation-only swing serial/mode/ordinal; duplicate/old timestamps cannot rewind; ordinary source shot delay compensates bullet-birth start | Remote step/no-step and transit age absent from wire metadata; those timing residuals remain |

Wiper/Stamper/Dental source slash damage remains15/20/30 weak and120/140/160 charged. Source wave damage remains30/35/40 weak and60/70/80 charged. Shape/lifetime improvements do not replace these separate damage channels with invented combined values.

| Base main | Full charge | Weak slash / wave birth after release | Charged slash / wave birth, no step | Step slash / wave birth | Step startup / travel / distance / Kd |
| --- | --- | --- | --- | --- | --- |
| ドライブワイパー |14F |3F /6F |3F /6F |14F /17F |4F /3F /2 /.3 |
| ジムワイパー |20F |6F /9F |3F /6F |15F /18F |3F /8F /3 /.75 |
| デンタルワイパー |20F |9F /12F |20F /23F |34F /37F |10F /15F /5.5 /.95 (air.98) |

## Every base/alternate kit and all seven domains

Verified alternate identity inheritance and live4F melee admission for ドライブワイパーデコ, ドライブワイパーRUST, ジムワイパー・ヒュー, ジムワイパー封, デンタルワイパースミ. Each retains exactly its base `catalogRecord` and therefore the repaired geometry, timing and state owner. Their procedural model/color fidelity is separate from shared gameplay inheritance.

| Domain | Wiper | Stamper | Dental |
| --- | --- | --- | --- |
| Shooting/ink | Source14F charge,16F weak cadence,3% weak /6% full; pending source6F emission retained | Source20F charge,26F weak cadence,5.2% weak /11.7% full;9F emission retained | Source20F charge,30F weak cadence,6.5% weak /13% full;12F emission retained |
| Trajectory | Source collision-array/burst fields and optical origin live; existing origin/wall/network tests retained | Same independent audit; no change to existing wave sweep/flight | Same; horizontal charged collision array retained despite descriptor name |
| Damage/collision | Source box plus inferred cylinder radius1.4;4F dedup/device route | Explicit cylinder radius1.4 plus box;4F dedup/device route | Explicit cylinder radius1.8 plus box;4F dedup/device route |
| Paint | Existing FootSplashPaintParam, addedFamilySplash, terminal drop and CPU paint routes retained; prior mask tests cover them | Same | Existing WallDropPaintParam retained; terminal/birth behavior unchanged |
| State transitions | Raw input history, phased lunge and post-swing lock; sub/special/death/forced squid cancel persistent attack | Same, source-specific timing | Same plus10F startup/15F lunge and23F step addition |
| Motion/VFX/SE | Side/mode/serial corrected; actual reference skeleton and SE envelopes not retuned | Same | Charged horizontal correction; separate drawn-blade mechanism/hand curves still unverified |
| Network | Validated ghost mode/side replay, old/duplicate timestamps do not reset pose; no ghost hitbox, lunge, ink or HP authority | Same | Same; step status missing from incoming packet remains important for37F timing |

Unresolved source-backed fields were independently identified rather than silently declared complete: `ReserveAcceptFrame` reservation semantics; `WeakSwingASFrame`/`ChargeSwingASFrame`; sparse `ChargeSwingFrameStepAdd` defaults for Wiper/Stamper; `MoveDistKd_OnSlideGnd`=.5 (Dental) because a retail-equivalent slide-ground state is not available; `SlipMoveDistAir/Gnd` with zero SlipMoveFrame; airborne step admission; movement plane/wall friction and source motion recurrence; aim pitch and whether the slash anchor follows the actor throughout lifetime. Native Actor collision still handles walls/slopes/ledges; exact Nintendo step response has not been recovered.

## What is established and what remains an interpretation

Explicit source facts:6 slash bullet records have AliveFrame4; all exported offsets/boxes; Stamper/Dental cylinder endpoints, radii and flags; source timing/ink/damage scalars; per-main history/threshold; distinct step distances/durations/Kd values.

Reconstructed and labelled in code: box OR capped-cylinder compound rule, yaw-only frozen slash birth, Wiper omitted CylinderRadius inferred from perpendicular box extent1.4, recent-input maximum, ChargeFrame startup meaning, normalized geometric displacement, post-delay anchor at release. These have mathematically checked behavior but are not recovered Nintendo functions. Their extension of the old rectangular reach must not be reported as measured retail reach. Device collider dimensions already used by INKWAVE are likewise not promoted to primary Nintendo facts.

No Switch footage capture, controller latency measurement, Nintendo skeleton/joint data comparison, exact source audio envelope, GPU ownership area comparison or real internet latency/rollback equivalence was performed in this worktree. Root integration performs broader production/browser/network checks separately.

## Tests and performance

Commands and results:

- Baseline reproduction: new persistent-window regressions fail on a victim entering the fourth frame; elevated contact-height target fails. These reproduce F02/F03 through production-composed WeaponRunner, not source-string assertions.
- `node --experimental-vm-modules --test --test-concurrency=2 patches/splatoon3/tests/catalog-saber-{melee,motion,step,origin}.test.mjs`:29 passed,0 failed in the complete pre-final allocation cleanup run.
- Focused melee/motion/step plus native-sprinkler-damage and object-damage-network:37 passed,0 failed. Device HP test exercises actual installed radius/HP routes for Splash Wall, Wave Breaker and Super Chump; damage ledger spans all4F.
- Boundary sampling:140,056 grid points per vertical primitive at0.1-unit spacing for all3 bases, independent analytic primitive membership; horizontal Euclidean capsule-corner grids; source L/R placement and yaw through the live owner; finite-cylinder flat-cap counterexample just0.2 beyond axial cap, receiving sphere radius.1.
- Step integration at30/60/120Hz gives identical total2/3/5.5 with exact source startup; production still owns a fixed60Hz simulation. These are scalar helper-rate tests, not evidence that arbitrary variable-dt WeaponRunner updates reproduce every game event.
- Latest implementation collision/motion/step rerun:23 passed,0 failed. Low-ink failing-before/passing-after and alternate-kit filter:2 passed. Follow-up step-history/post-delay suite:9 passed.
- Existing `weapon-models-stringers-splatanas.test.mjs`:2 passed,0 failed; optional source-motion VM dynamic-import warnings also occur on baseline. An earlier combined run was cancelled by Node unresolved-promise exit and is not counted as successful.
- Existing main-weapon-catalog+origin tests:43 passed/1 initially incorrect high-target test fixture; corrected target then passes. Existing30 main tests were all successful in that run.
- Production build completed with normal minification/esbuild. Intermediate content hashes39d1f4bb52ce and3a90f8c21869 predate final code/readback; root will build the integrated final commits. They are not claimed as exact final-source browser evidence.

Reproducible before/after microbenchmark: `node scripts/measure-inkwave-saber-1130.mjs reports/new-families-1130-20261018/saber-benchmark.json`.1,000,000 contact calls ×6 modes; median of5 samples after warmup. It compares the actual old rectangle arithmetic with the new collision helper, excluding actor broadphase/LOS/HP and renderer. Concurrent agents shared the host; values are indicative, not a performance budget guarantee.

| Main/mode | Old rectangle ms/million | New compound/capsule ms/million |
| --- | --- | --- |
| Stamper weak |11.21 |52.86 |
| Stamper charged |10.79 |115.09 |
| Wiper weak |11.49 |59.18 |
| Wiper charged |9.56 |115.71 |
| Dental weak |11.94 |56.08 |
| Dental charged |10.49 |139.87 |

New math costs roughly0.053–0.140 microseconds/contact on this host and now runs for4 collision frames instead of one. No speedup is claimed. Capsule/box/cylinder tests allocate no per-contact vectors/arrays; the wall clip range, vectors, device callbacks and target ledger are reused for a swing. Only actual actor HP delivery allocates a transient callback. Actor broadphase excludes teams/dead/previously hit/far targets before detailed geometry. GPU draws/effects/pools are unchanged. Whole-match browser CPU/GPU/memory/GC comparison remains root integration work; this microbenchmark cannot certify it.

## Integration

Implementation commits: `f36f9a8fe5ae45955b4da95a4ab721895d79cbc5` plus low-ink/history follow-up `84e3aa6` on `fix/inkwave-saber-1130`; report/benchmark and any follow-up commits recorded by root. No push/PR/merge performed from this family worktree. Global behavior ledger and Issue/PR state are coordinated by root to avoid conflicting family edits.
