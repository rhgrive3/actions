# Rainmaker interrupted-return presentation candidate

Status: source-reviewed candidate for a separate exact-head emitted/native comparison. Native appearance and performance adoption are pending. This does not claim Nintendo-exact poses or correct the existing projectile-origin/displayed-muzzle mismatch.

## Exact comparison and scope

The comparison reference is land head `00968835349cb8afac3803c412a48475e40bcae8` (PR1639). Its handoff source is Git blob `2ed9effc454bcee89bccd5d8ff08652aace63e6a`, SHA256 `75cbd69c38f4aa8e2ccb8c18b309fecbea80f662ce497cb8b0fb5eb4a3199dc2`. The adapter before source is Git blob `4eddd92cd2ae86bbb6e93fb2fd1b3bc39572957a`. The five changed existing files were checked against the complete official009 tree. This package does not update PR1639, PR1627, or the separate sphere-model stage.

Only two production files change: the existing final weapon-handoff owner and one guarded pre-dive capture call in the existing squid-form composition adapter. No geometry, hair, face geometry, root/form curve, hips, local position/scale, weapon numerical setting, damage, aim, charge, recovery, or physics origin changes.

The ownership conflict is specific: sourceUpper=false selects native weapon holding, but interrupted ToHuman interpolation subsequently rewrites upper-body bones. We retain that original source evaluation and original support solve as the canonical history, then present the saved native upper-body quaternions during the admitted return interval.

## Transaction and restoration

The exact12 quaternion owners are spine, chest, neck, head, left/right clavicle, upper arm, forearm, and hand. The head/neck change is a bounded return-pose change; facial/hair local transforms and geometry are not edited. A lazy per-character cache holds12 bone references and24 reused quaternions. There is no new full-rig pose copy or second whole-pose evaluation.

On an actual living/visible Rainmaker holder with active Player00 source, interrupted ToHuman, positive pose dt and formTime<formDuration:

1. Capture those native12 quaternions immediately before the existing source interpolation.
2. Run the original source interpolation and original support solve, retaining the original canonical bone/source history.
3. Save the canonical12 quaternions, restore the captured native12 display quaternions, and run one additional left display solve. Do not write that display result into the source bank. Add no right solve.
4. Restore the canonical quaternions before the next existing state/source entry. Existing pending restoration also covers weapon replacement/disposal. Ordinary primary/secondary getters temporarily sample canonical state, then restore displayed state.

Nested getter sampling uses a busy guard. A fault in muzzle.updateWorldMatrix exposed a v1 finally-order bug: the guard stayed true if re-synchronization threw. v2 clears busy before matrix synchronization. Independent fault injection now confirms the displayed quaternions restore, busy=false, and the next getter's canonical difference is0. This is fault handling, not a normally observed gameplay failure.

The air/landing .2rad/.03world-unit caps and .001world-unit final grip gate are unchanged. They are not loosened to hide source-return failures.

## Evidence and limitations

The runtime-identical v2 local source run passed23/23 (form8 plus existing land15), skip0, and shared contracts28/28. v3 adds only strict QA negatives and native RNG comparisons: repeated form8/8 and shared28/28 passed, skip0. A renderer-free capture stub exercised browser run() with the real Actor driver: five same-input pairs pass count/value hashes and one extra after-capture RNG call fails closed. This validates the comparison gate, not native renderer cache behavior. Exact emitted/native20 have not run for this candidate.

- Committed form regression covers five actual pickup/2-tick dive/10-frame return scenarios, including the first fully restored frame, and12 weapon/lifecycle cases. Canonical primary/secondary getters, source-entry and source-bank digests, root/kid/Actor state, all non12 quaternions, and every local position/scale remain exact. Actual ordinary bomb pos/vel after drop/return and same-frame release are compared. Identical warmup and seeded global RNG count/value sequences are checked, rather than a constant random function.
- Shooter lower normal-history control reproduces a .04674194045world-unit support gap, reduced below .001. Some upper/event controls already have valid support; those cases are ownership/side-effect comparisons and are not mislabeled grip improvements.
- Independent historical009 / historical009+new-adapter / integrated comparisons cover3lanes,18conditions in each, and3,402frames per lane (10,206 total). Historical handoff plus new adapter produces no capture hooks and is exact. Canonical/source/non12/position-scale/actual-shot checks pass. The display path adds162 left solves over the nine-frame intervals represented in those cases.
- Normal local release cannot shoot during the measured return0–8frames; the separate admission probe has negative0–8/25 and positive26frames. However, a legitimate delayed host event can create a shot in that interval. Real NetMatch delivery, wrong-host and duplicate-sequence negatives are therefore retained.
- Actual shot origin/parameters and trajectory remain unchanged. Existing combat launches from Actor position plus its fixed vertical offset, not the model muzzle. The pre-existing displayed-muzzle/origin separation is around1.2world units in some tested conditions and remains unresolved.
- The earlier no-prior-form18-condition maximum distance increase was +.00091679446world units. Independent tests with a normal15-frame dive/15-frame return before charging found a larger +.00348576768world-unit increase at Dualies upper aim return3 (.927946 before, .931432 after). These are maxima within two different input-history sets, not a global bound. Native comparisons explicitly include both upper3 and upper6.
- Source and numerical checks do not establish that head/chest intersections look correct. Previous approximate surface checks are not treated as definitive visible triangle intersections. The named native frames require visual acceptance.

## Processing cost

An integrated8-character source-pose benchmark at30/60/120Hz used equal warmups and alternating control/candidate orders. Exactly one extra left solve occurs per admitted display frame (80/144/288 measured eligible actor-frames respectively); nonholders add0solves. Mean8Actor-frame differences range from−.288 to+.483ms across holder trials; the largest positive result is the first30Hz order. Shared CPU noise prevents a zero-cost or speedup claim.

Separate getMuzzleHand microbenchmarks measured ordinary inactive differences of+.000017 to+.000041ms/call, while active canonical swap costs about+.0252ms/call. These are not multiplied into an assumed game-frame budget.

A separate actual8Actor.update probe uses one legitimate holder and seven nonholders. In its interrupted-return/event input, gameplay invokes0primary/secondary getters in both versions. Receipt sampling invokes each once. Object3D.updateWorldMatrix call counts, including recursive ancestor visits, increase by20 at return0,48/frame at1–8, and28 at the restoration frame9. Direct weapon-muzzle update calls increase by at most2/frame during the consumer phase. These are invocation counts, not multiplication counts. The seven nonholders' complete local bones and physics remain exact. Native receipts record consumer, measurement, and capture phases separately so diagnostic sampling cannot be confused with game cost. Native before/after also compare each sampled global RNG call index and the complete measured LCG count/value-column SHA after the same full warmup; rendering/cache consumption differences fail the gate rather than being hidden. Strict source-active and Clam-inactive booleans reject missing flags and truthy strings.

## Native20 originals /10 pairs

Use the same production build, real Player00 source, production renderer/post stack, actual pickup and input ordering, fixed camera/light, and seeded RNG:

- Shooter lower aim−1.05 return3: rear/side, before/after (4PNG).
- Dualies upper aim+1.15 return0side,6rear/side,9side: before/after (8PNG).
- Actual delayed event at Shooter lower3 and Dualies upper6: side, before/after (4PNG).
- Additional normal15-frame dive/15-frame return history before charging, then Dualies upper return3 with delayed event: rear/side, before/after (4PNG).

All20 files are original900×900 PNGs. The separate `rainmaker-form` suite uses beforeBase009 and overlays only its historical handoff. The same new source adapter is inert in that before namespace, independently demonstrated. Existing spawner24, Rainmaker128, air/land20, Clam80, and two Clam sheets remain unchanged: totals272 originals+2sheets with this suite. Build once; keep form under the existing bounded Rainmaker artifact with its own receipt. The adapter is a build-only source included by the existing local-quality identity and official manifest verification; it is not falsely listed as a directly emitted runtime module.

Each form receipt records exact source/build/input/content/harness and historical-module provenance; source bank SHA; geometry SHA/counts; root/kid/modelTRS; visible scale/opacity; aim; canonical and displayed muzzle; actual shot origin; final world grip;12q/non12/position-scale/source-bank digests; solve/getter/matrix counts and transaction state; camera/light. Human review must evaluate shoulders/arms/head-chest placement and the sampled entry/exit boundaries. Continuous motion, all weapons/faces, and complete correct-shot appearance are not established by these20 stills.
