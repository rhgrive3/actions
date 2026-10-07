# Death-time Turf Map navigation (#409)

## Scope and baseline

Stacked on integration Draft #536 at `9f1d794f79f3f78d0d2a4920fe16667b8a2e1b06`, reusing #325 controls and #490 map confirmation. Only the build-only reliability path and its acceptance probes change. Raw public source, gameplay timing, gear, physics, Flow and network authority remain unchanged.

## Reference and bounds

The issue's Splatoon 3 Ver. 11.3.0 requirement separates post-splat Turf Map navigation from dead-body control. Nintendo's [online beginner guide](https://splatoon.nintendo.com/en/news/beginner-basics-for-splatoon-3-the-ins-and-outs-of-playing-online/) explains X opening the live turf map. The issue cites [Spawner drone](https://splatoonwiki.org/wiki/Spawner_drone) and [Super Jump](https://splatoonwiki.org/wiki/Super_Jump) for post-splat selection; direct opening returned 403, but search-index extracts recovered Judd's post-splat map tutorial and the respawn-animation selection description. These are documented gameplay references, not new hardware measurements. Nintendo's [update history](https://en-americas-support.nintendo.com/app/answers/detail/a_id/61257/~/splatoon-3-update-history) separately documents Super Jump immediately after Squid Spawn. Exact Switch spawn-animation/input windows remain unmeasured.

The implementation honors the currently requested navigation behavior while retaining INKWAVE's existing respawn/drop and jump timing. It does not implement the separate player-aimed Squid Spawn feature (#273), and it does not claim #546's committed-jump target semantics are part of this stack.

## Before / after

Before: Match disabled the entire controller on death; mapHeld was either false or stale, and native HUD/diorama clicks required immediate Actor.canSuperJump. The user could neither open a fresh map nor prepare a return choice.

After: Match exposes navigation permission independently of body permission. While dead, the controller samples map controls and target selections, zeroes all body intents and discards look/gyro/reset actions, without changing the camera heading or invoking Actor.superJump. Standard pad retains X toggle, D-pad selection and A confirmation; raw/keyboard/touch paths retain their established controls. HUD and diorama use one shared request method. A pre-existing diorama standard-pad bottom-face bypass is masked so it cannot bypass #490's A-confirmation owner.

A confirmed dead-time choice is held by actor identity (or a cloned spawn point), stays cancellable with the map open, and is revalidated after the actual respawn reaches grounded state. Thus the existing falling spawn does not freeze in airborne charge. Closing the map, menu/pause/finish/attract, owner change, target death/removal, or a newer unconfirmed D-pad choice cancels the old pending request. Same-tick map-close wins over landing admission. Successful admission clears the pending state once and uses the normal Actor jump path; subsequent moving-target behavior remains independently scoped.

## Verification contract

The native source tests exercise Actor.splat/respawn, Input and PlayerController plus the extracted actual composed Match/HUD/diorama methods. Emitted mode executes the actual minified controller/Actor; canonical Chromium/WebKit acceptance additionally imports the emitted Match/HUD/DioramaOverlay classes and routes a touch PointerEvent through the native pin listener. This is not a physical controller/sensor or rendered-stage parity claim.

Tests cover four input modes, body/aim isolation, delayed landing admission, cancellation and identity, 30/60/120/144Hz fixed-clock equivalence and existing #391/#421 controls. Baseline negative control uses the unchanged #536 tree. Full aggregate/build and remote CI results are recorded on the PR only after completion.

## Follow-up: held-axis polling is not a fresh navigation choice

The integration audit reproduced a native HUD/Diorama touch-pin request being
cancelled by the next unchanged gamepad-axis poll (no Mobile control contact).
The source regression fails on db233550 with a null pending target.

Input now exposes navigationDevice separately from lastDevice. The latter and
all native acquisition/filtering remain unchanged. During pollPad, a same-pad,
same signed threshold-region axis sample does not acquire navigation ownership.
New button edges, key/touch events, per-axis neutral/sign crossings, disconnect
and replacement-pad samples still acquire ownership and cancel a prior request.
The threshold is the existing native acquisition value 0.3, not a new tuning
coefficient. Changes inside the same threshold region deliberately count as a
held input; raw analog samples alone cannot distinguish deliberate motion from
noise. Explicit map close/menu/lifecycle/target invalidation remain unchanged.

Validation: source and emitted navigation 31/31 each; full gameplay 960 pass,
0 fail, 1 optional emitted-only skip; build ce285cae5be3. The native browser
acceptance probe now holds axes across 120 polls after the real Diorama touch
listener and separately verifies that a new pad button still cancels. That new
probe awaits the next combined CI; it is not claimed as locally browser-tested.
