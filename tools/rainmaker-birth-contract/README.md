# Rainmaker birth contract experiment

Status: UNFINISHED. Based on main f31238a48b9d1a4af2d4f5f5f9182af777a79c83; read-only source audit updated against main dded21250da1f5dc4a5bfc171b13672fe2279d72 on 2026-10-21. NOT connected to runtime, build, network or deployment. No PR or merge.

20 assertions previously ran in the tool V8 isolate. Node test runner, real Three/Actor/model comparison, emitted build, browser and multiplayer are NOT run. Shell failed before execution because its synthetic .git mount reported No space left on device. Existing files and candidates were not removed. This documentation update does not rerun or expand those assertions.

## Exact production call order at dded2125

- scripts/inkwave-source-composition.mjs composes the production adapters. The upstream main.js frame loop alone is not the emitted call order.
- patches/splatoon3/runtime/clock.mjs runs fixed 1/60-second simulation through turf-finish.mjs simulateMatchInterval.
- turf-finish.mjs lines 119-126: controller update / computeAim, Match.update, ordinary Projectiles.update, then Match.advanceRanked.
- inkwave-public/src/game/match.js lines 194-211: local Actor.update or NetMatch.applyRemote, then soft actor push. Actor._finishFrame (actor.js lines 904-948) sets the visual root and evaluates Character before that soft push.
- ranked/install.mjs lines 45-64: buildFrame, rule.update, playRankedEvents, host wire send, then rankedWorld.update and rankedEffects.update.
- ranked/world.mjs lines 672-695 positions the objective and calls rainmakerPresentation.update. This happens AFTER the shot event has created its projectile.

Thus moving only world.update before the event is not a complete same-tick authoritative-pose solution.

## Existing transform and missing provider

ranked/rainmaker-model.mjs (blob b87f82c5103d580cf6d3497df6097dab1d3d7f53) revision 3 declares local muzzle [0, -.056, .899]. createRainmakerPresentation.update obtains the right-hand weapon pivot in world coordinates, applies kidScale, and combines aimDir with the existing _rainmakerPitch using rainmakerAimQuaternion. This is a presentation consumer, not a canonical host pose provider.

ranked/rainmaker-motion.mjs (blob 9d9e6ef1bdee60e5fc3cf8d86275ef40e81a06e9) computes the anchor channels, including charge/recovery-dependent damped ready history, aim-dependent reach and spine/chest offsets. weapon-handoff-motion.mjs applies these through the native pose/IK owner. The resulting pivot also depends on source pose, body hierarchy and form state. Character.getMuzzle samples the equipped main weapon, not this objective socket.

The aim rotation and local socket transform could be shared as pure mathematics without changing geometry. The grip translation CANNOT currently be reconstructed from accepted position/yaw/pitch alone: the canonical evaluated anchor and its pose-history inputs are missing. The socket matrix helper proves affine math only, not input authority. Do not invent a fixed actor-to-grip offset or trust a guest matrix.

Additional stale-pose paths:
- intermediate-tick-budget.mjs explicitly defers bot/remote Character.update on nonfinal rendered ticks. Its existing accepted trade-off permits old arm transforms. This is not a same-tick shot-origin guarantee.
- offscreen-visual-budget.mjs can skip remote pose work.
- ranked/install.mjs buildFrame uses session/owner/life-bound admitted host positions for remote objectives, whereas the visible Actor is interpolated.
- Character root position precedes Match soft push; charge/recovery presentation precedes this tick's rule update.

A future authoritative sampler must be independent of those display shortcuts and expose explicit shot identity, session/life, pose epoch, accepted position/aim and sampled anchor provenance. It must share actual canonical formula/state with rendering, not force Character updates, override visual budgets or edit the stopped model. No such sampler is implemented here. Keep the provider unconnected.

## Release, delayed birth and range semantics

ranked/rainmaker.mjs lines 529-537 stores pending pos/aim at RELEASE, then delays one frame. Lines 473-477 emit that frozen event later. Actor movement and aim can change during this interval. These two epochs must be explicit; changing e.pos to emit-time position is a separate behavior change, not a harmless muzzle fix.

ranked/combat.mjs (blob 1ff7830643bb7aa7b09d17816397f9d6ef55a391) creates birth and origin from e.pos + [0,1,0]. Preserve this old release-event anchor as the range reference independently of any future muzzle birth. Never reset origin to the forward-shifted socket and silently add range. Existing helper eventTick/poseTick expresses equality but does not yet encode release versus emission identity.

## Birth obstruction contract

resolveBirth requires explicit same-tick evidence and a callback covering the entire body-to-socket bridge. Null explicitly means clear; absent/malformed evidence is rejected. No production collision query is implemented.

A future bridge must be resolved BEFORE normal flight, through the same nearest-contact ordering as combat: physics.segment with the ink/grate mask true, defense wins a tie with terrain, actor must be strictly nearer. Preserve visualOnly damage/paint suppression and ownsDefense callback ownership. Do not skip thin walls by starting both previous and pos at the socket. Do not double-count bridge distance, trajectory time or trail paint. A blocking bridge must resolve contact rather than simply place the projectile at the surface and advance past it.

Finite-radius clearance and start-inside recovery are unproven. Surface birth can recontact immediately and requires real Physics tests, not an invented epsilon. Aim, launch velocity, recovery, projectile damage and existing range anchors remain unchanged in this experiment.

Run when shell works: node --test tools/rainmaker-birth-contract/pure.test.mjs

Before production integration: real canonical same-tick sampling across both teams, native/source poses, aim limits, carry/charge, jumping/landing and interrupted return; wall/ceiling/thin wall/grate/defense and start-inside negatives; full/partial range and paint/damage parity; host/follower delayed/duplicate/invalid events; normal weapon/bomb source-history regression; original native images and actual gameplay review. No claim of retail-exact physical origin, completed visual alignment or completed Rainmaker birth repair.
