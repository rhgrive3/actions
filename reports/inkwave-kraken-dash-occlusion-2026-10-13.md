# Kraken dash wall occlusion: bounded follow-up to PR #1374

## Scope and reproduction

Parent: `05fd0f99f9fd17117e73df896c33255cabf56594`, the source-backed specials Draft [#1374](https://github.com/rhgrive3/actions/pull/1374). This follow-up changes only Kraken dash contact occlusion. It does not approve the aggregate Crab, Kraken or Triple Inkstrike feature work for adoption.

A legal Kraken activation, charge and release enters the native dash. With the actor at `(0,0,1)`, a solid wall spanning `z=1.5..2`, and an enemy at `(0,0,3.5)`, actual `Actor._resolve` stops the actor at approximately `z=1.1499`. The parent then shifts both attack-segment endpoints forward by 2.75, placing its contact capsule beyond the wall, and applies 120 damage. Native line of sight is blocked. The same concrete setup with main `18ce7b6c` leaves the victim at 100 HP; this is evidence against the proposed PR path, not a claim that this exact regression is deployed on main.

The observed lethal damage leaves HP at -20 until the existing deferred lethal-decision phase. These focused controls assert damage admission, not completion of the later splat phase.

## Correction

The original 3D swept-capsule test, radius 1.5, forward offset 2.75, dash movement, duration, damage and actor iteration order are unchanged. After capsule admission, the closest contact parameter is mapped back to the corresponding **unshifted, resolved body sweep point**. Native `Physics.los` must be clear from that point to the victim before damage is routed. Both visibility endpoints are lifted by 0.05 above the feet solely to avoid a coplanar floor ray. This does not alter the capsule's contact geometry.

Starting the visibility query at the shifted attack capsule would be insufficient because that point can already lie past the wall. A blocked contact is not added to `dashHits`, so a later unobstructed contact remains eligible. Multiple visible victims remain eligible; this is not a nearest-victim-only attack. Native LOS selects the nearest solid obstruction regardless of level-block order.

The existing `Projectiles.applyHit` and `NetMatch` authority, sequence and recipient-life checks remain untouched. The generic committed hit packet carries recipient life, not attacker life; an already-sent valid hit continuing after the attacker changes life is retained as the existing contract.

## Verification

- New permanent source suite: **30/30 pass** on the exact parent source composition with this runtime hunk.
- Identical final suite against unchanged parent runtime: **21 pass, 9 substantive failures**, all wall-damage or wall-packet admission cases; no skipped cases or harness errors.
- Geometry controls: actual body collision at 30/60/120 Hz, unobstructed reach, height/width exclusions, a wall beyond the victim, a side wall, nearest solid ordering, longer-sweep endpoints, visible/occluded wall-edge pair, both victim array orders, and blocked-then-clear contact.
- Authority controls: host and guest owner send one visible hit and no wall-obstructed hit; sender does not directly damage a remote victim. Actual receiver rejects wrong match, wrong sender, duplicate damage and new recipient life. Remote/dead owners do not locally advance the dash or emit contact.
- The same **30/30 pass against the actual minified production build**, whose emitted Actor, all-specials, Physics, Projectiles and NetMatch modules are loaded by the fixture. All 926 output artifact hashes verify. Build content hash `11bba48b8bf40f890f28697274f687750e279ee9b821bf5be84d6a2c1da96d63`; input hash `606616bc3f118096590af54412cde480fdbb7be3b8a32cf08c59e03821f18a21`. The manifest binds the all-specials input to the reviewed runtime hash below.
- A separate two-case geometry probe uses existing extracted Scorch source data (`c8d0e21345ff9f4eb528e699de2ad9c478af78d7284f347399cc59ab94eb4cd8`), face 13639 / triangle 47580 inside the stage bounds. Parent-runtime source control damages both the wall-blocked and unobstructed victim. Fixed source and emitted NativeLevel/NativePhysics/TriangleWorld preserve the unobstructed 120 damage and reject the blocked contact after real body collision. Actors are manually placed with explicit aim and equal victim-foot height; this is a bounded source-triangle geometry control, not a complete match or stage-calibration test. No extracted assets are added to the repository.
- Existing source-final special boundaries: **5/5 pass**.
- Adjacent catalogue suite: **45/45 pass across nine disjoint five-case shards**, covering every declared test once. The initial single-process attempt reached the explicitly configured local 768 MiB heap limit; that resource failure is retained, not called a successful aggregate run.
- Independent review checked the runtime hunk and executed a separate nine-case native sender/receiver/owner lane on exact parent composition. The incorporated permanent suite and final report/gate metadata receive a final no-drift review before publication.

The existing source-boundaries workflow gains only the new test path filter and one invocation in its current job. Existing Validate gains one emitted invocation after its existing build. No additional CI build, benchmark, diagnostic dispatch or new job is added.

The private parent mirror initially linked unchanged source files. Esbuild resolved those links outside the mirror and left weapon-family imports external, so that first generated output failed fixture loading and is not evidence. Materializing the identical parent patch-module bytes resolved that local preparation problem; the normal production build was rerun without changing repository build logic. The verified output and successful emitted controls refer only to this later build.

## Evidence limits

The permanent suite runs actual source and emitted Actor, ordinary Level/Physics, Projectiles and NetMatch implementations. The fixture replaces Character/rendering, paint and transport, and stubs ordinary `_integrate`, `_finishFrame` and `_spawnBarrier`. Kraken's own movement and native `_resolve`, hit routing and Actor.damage are exercised. Packets are copied through JSON into real `NetMatch.onMessage`, not sent over a browser connection.

The additional source-triangle pair executes native-stage geometry, but does not validate the complete stage, normal traversal or rendered gameplay. There is no rendered-browser, retail-fidelity or end-to-end network claim. This bounded follow-up leaves parent PR #1374 unchanged and targets its branch for review.

Runtime SHA-256: `12ff4d97a4fafc6e6865e389a35309a3ad51f9de3a0eaa0cb4100a0bbd9b9516`.

Test SHA-256: `6b919c3f254144aece4847ce7f9d6c153d5ba6d102c4cd971fd44d14dc944786`.
