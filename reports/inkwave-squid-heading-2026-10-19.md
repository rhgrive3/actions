# Squid travel heading: stable scene-frame presentation

## Scope and fixed input

This is a limited follow-up to the report that the squid body looks diagonal. No user screenshot was supplied, so identifying that reported appearance with this particular reproduced defect remains unverified.

Baseline: [`00b8994711809ba6d0469723c858ddef6805e2ae`](https://github.com/rhgrive3/actions/tree/00b8994711809ba6d0469723c858ddef6805e2ae). The existing source controller, source banks, ground admission, and the full production composition were read at that head. The four relevant adapters/runtime files have the same official blobs as the earlier integrated squid work. Missing deployment or a later direct revert was not the source of this reproduction.

The sole runtime change is `patches/local-quality/squid-motion-binding-adapter.mjs`. It adapts only source-controller squid heading. Human animation, model/mesh geometry, materials, source clip timing, existing dry pitch, ink rules, velocities, collision, and native fallback remain with their existing owners. `squid-form-ease-adapter.mjs` is unchanged; a separate Rainmaker form-capture proposal is not included.

This report concerns INKWAVE's scene coordinates and presentation consistency. It supplies no new Nintendo timing or unit-conversion claim. Existing source motion assets and their provenance remain unchanged. The approximately 29.8-degree dry-squid lift is an existing authored pose and is deliberately retained.

## Reproduction and cause

The actual normal-input path is `PlayerController.update` → `Actor.update` → `Level`/`Physics` → Character/source presentation. On flat ground, the Actor root independently turns toward new input while inertia can still keep velocity near the previous direction. The original source tracker filtered travel in the current root-local frame, then squid heading filtered that local result again. Applying the turning root to the previously filtered local direction counted part of the turn twice.

For example, in the full source/Actor composition, a fresh +X dive produced a mantle heading beyond its 90-degree destination. The original 54-scene regression fails already at dry forward-right, fourth entered simulation frame: heading 0.79308799 radians exceeds the 0.78539816-radian destination. A separate steady-travel right-turn control with the swim overlay disabled measured 94.94 degrees at frame 12 on main; the earlier single-frame-filter candidate measured 81.05 degrees and converged to 89.93 degrees at frame 30. Those latter numbers belong to that explicitly isolated control, not to the native screenshots or to a Nintendo animation.

Bone axes and CPU-skinned mantle landmarks after complete parent transforms agree in heading in the diagnostic turn trace. Their pitch must not be assumed identical during a curved transform clip: at Sqd_ToSquid frame 11 the baseline surface differs from the straight head-bone chord by 0.001311924 radians. The initial added equality assertion was a measurement-model error, and its failure is retained; the correction compares the same surface and clip between main and candidate instead. Sqd_Wait also curves laterally, so idle surface and bone-chord headings are not asserted equal. Every sampled skinned axis is recorded and checked for finite values and cadence consistency; the fresh-dive window has its own drawn-heading overshoot gate. Flat-ground root/model pitch and roll remain zero. Own-ink stopped mantle pitch and roll return to zero. This is a heading-overshoot defect, not evidence that every intentional dry lift or small idle motion should be removed.

## Minimal repair

The source-only squid heading is filtered once in the Actor simulation/scene frame. Current root yaw is subtracted once to return it to the local frame used by the existing squid-rig transform. The implementation uses the engine's existing scene/root-yaw contract; it does not claim to support an arbitrarily externally rotated Actor parent.

- Initialize on a newly entered dive and after the existing teleport detection, then retain the preceding scene heading across following ticks.
- Wrap differences across ±π and preserve heading while stopped.
- Keep the existing source tracker's noise-confidence limits: no new direction below speed 0.06, with the existing 0.30 confidence ramp. This preserves suppression of tiny replicated-position corrections.
- Keep the original manual source-preview heading expression and all human local-direction filtering.
- Keep the source-rig dry pitch, wall-normal handling, aerial pitch, bones, and deforming mesh code unchanged.

Two discarded intermediate candidates are retained in review evidence. The first could initialize on two early dive ticks; a one-frame emerge/redive negative control caught it. The second accepted sub-threshold remote corrections; an actual isolated `NetMatch.applyRemote` trace alternating 0.0001 position units caught it. Neither intermediate is the final proposal.

## Regression contracts

The new portable contracts are:

- `patches/local-quality/tests/squid-heading-frame.test.mjs`: 54 scenes, 5,832 simulation ticks, actual raw Shift/WASD through controller/Actor/Physics, dry and own-ink stop plus eight directions at 30/60/120 render Hz with the same fixed 60 Hz simulation traces. Ground normal, world mantle direction, source readiness, and stopped velocity are checked. A separate real remote-consumer fixture checks suppression of sub-threshold position corrections; it sends no network traffic.
- `patches/local-quality/tests/squid-heading-boundary.test.mjs`: fail-closed adaptation/manual-expression preservation and normal-input wrap, reversal, stationary camera yaw, single redive initialization, and existing teleport admission. This owner-isolation test turns off the optional swim overlay; the 54-scene test keeps the full overlay enabled.
- `tools/squid-heading-qa/probe.test.mjs`: the exact shared native input driver and both normal/fault cleanup of globals and scene ownership.
- `tools/squid-heading-qa/workflow.test.mjs`: two depth-1 exact-SHA checkouts, seven workflow mutation negatives, and real fixture emitted-namespace/missing-path checks. The gameplay tests poison authored-source adaptation when `INKWAVE_BUILT_SITE` is set, so emitted validation cannot silently fall back.
- `tools/squid-heading-qa/compare.test.mjs`: a valid paired receipt and 15 injected mismatches rejected for camera, position, velocity, normal, clip phase, input, geometry, form adapter, lighting, image count/name, candidate identity, or skinned pitch/roll/landmarks.

Additional read-only main/candidate consumer comparison covers 58 sampled states: normal human movement/fire, dive/stop, jump/air/emerge, actual wall-climb admission, and isolated `NetMatch.applyRemote` presentation. Physics, all human pose/bone values, source local-bone matrices/clip state, and all body/ghost/outline/eye geometry attributes and indices are compared independently of the intended presentation-heading change. Actual wall admission is required; remote fixtures are not live-network validation.

The existing eight source/fallback form-ease and source-presentation tests remain unchanged. Their coverage includes 30/60/120 Hz, three LODs, 2,625 source-presentation frames / 1,260 checks, authored dry/air axes, spawn-return boundaries, and native fallback deformation ownership.

Final exact-input CPU results are recorded in the review manifest. Emitted/native results are separate and remain pending until the new head's workflow finishes.

## Native comparison, still awaiting execution and visual review

The separate `.github/workflows/inkwave-squid-heading-qa.yml` leaves the existing 928-image squid QA untouched. It checks out the fixed baseline SHA and exact pull-request head separately at depth 1, verifies both Git identities, builds each, verifies emitted manifest/artifact hashes, and uses one shared driver and lighting setup on both builds. The source banks must be ready. There are four sampled states and three fixed views per state, twelve images per side:

1. Dry +X dive, frame 12.
2. Own-ink +X dive, frame 12.
3. Own-ink +X movement, frame 60.
4. Own-ink stop after 120 stopped ticks.

Front, oblique, and top cameras use the same scene seed, light, render size, and timing. A diagnostic grid and +X arrow are scene guides, not model changes. Drawn vertices must stay inside the camera bounds. The receipt records the full-composition axes, physical inputs/state, source clip phase, camera/light settings, source SHA, authored input hashes, loaded emitted paths, and each PNG hash.

For these four exact source-driver states, same-clip CPU-skinned pitch changes by at most 2.756e-10 radians and roll by at most 6.972e-10 radians. The paired gate requires less than 1e-8 radians, retains the same landmark IDs, and does not equate bone and curved-surface pitch. At frame 12 the drawn dry/own-ink headings move from 123.18/120.73 degrees on main to 85.87 degrees on the candidate; both approach the +X destination from inside the turn. This is a CPU source measurement, not a rendered-image claim.

The paired comparison rejects mismatched non-heading state and checks geometry/material/form owners stay exact. Twelve images do not constitute the eight-direction/Hz matrix; that broader input coverage belongs to the CPU contract above. A successful render receipt is labelled `rendered-awaiting-visual-review`, not visual acceptance. No local browser was launched for this proposal; the existing restriction is preserved and normal GitHub native QA is the intended image path.

## Remaining limits

The existing optional swim overlay writes Euler-Z bank under a roughly 90-degree pitch, which can also appear as a heading oscillation rather than world roll. Its axis composition is a separate confirmed mathematical observation and is not changed by this source-heading patch. Straight-swim oscillation may therefore remain.

The full user-visible symptom, arbitrary external parent rotations, live remote transport behavior, and Nintendo-exact banking aesthetics are not certified here. The proposal is limited to the reproduced double-turn defect and preserving the surrounding game/animation contracts. No merge or final visual acceptance follows from CPU results alone.

## Native QA export compatibility repair

Exact head `473f18ce7fee52d3fae2681d548d717875ba64eb` completed its eight
source tests and fixed-baseline build, then stopped before the first image:
production Three intentionally omits `GridHelper` (and `ArrowHelper`).
[Failed native run](https://github.com/rhgrive3/actions/actions/runs/39253333391)
produced no heading screenshots; candidate capture and paired review did not run.
The original failure artifact remains preserved.

The QA-only repair builds the same grid and arrow from existing emitted
primitives. Tests compare all geometry attributes, indices, matrices and material
settings against the authored helpers. Neither production Three exports nor any
runtime, source clip, model geometry, camera, lighting or input was changed.
Before launching Chromium, an AST-based gate checks browser/probe/axis/lighting
references and constructors against the exact manifest-bound emitted Three
namespace. Missing exports, aliases, computed/dynamic access and nonconstructors
have portable negative controls. All QA modules also undergo a syntax check;
source and emitted CI run the guide contracts, and paired receipts compare the
export contract and harness hashes.

The failed run's Three SHA-256
`941d498aa2f84e571501b2a9de90bed8736307511a877d3f260132d82b38e677`
was reproduced locally: seven export/guide/syntax tests passed against its 149
exports, and ten source/workflow/paired contracts passed. An independent repeat
also passed seven tests. These are CPU contract results; replacement-head native
images and visual review are still required.
