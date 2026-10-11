# #685: pending map contacts must release retired match owners

## Scope and evidence

- Repository: `rhgrive3/actions`; native production composition based on PR #1182 aggregate `13d90d12`.
- Existing `pins[].target` cleanup stays in place. The residual is `DioramaOverlay._pinTaps`: a touch/pen down stores the targeted Actor, and the current same-frame input guard additionally stores its viewer, Match and PlayerController.
- `Match.dispose()` invokes `releaseMatchActors()` before disposing Characters, but that method cleared only visible pin targets. If there is no subsequent Diorama update or pointer termination callback, the page-lifetime overlay retains the old match graph.
- A stale Match disposal can also occur after the overlay has displayed another Match: input records and visible pins therefore require independent owner checks.

## Repair

`patches/local-quality/ui-actor-lifetime-adapter.mjs` now retires pending contacts by exact Match identity before the visible-pin ownership guard. Explicit actor-only release removes only contacts referencing those actors. The existing no-argument close/missing-viewer cleanup clears all pending contacts.

No pointer event is synthesized, jump is requested, timer is added or gameplay value is changed. Current newer-match contacts and pins survive stale old-match cleanup. No immutable `inkwave-public/` source is edited.

## Validation

The composed native Diorama constructor/event handlers and native Match disposal are exercised with a fixture DOM. Before the repair, four new cases failed at the expected retained-record assertions, including inside Character disposal. Tests cover touch and pen, empty retired roster, old/new match overlap, targeted Actor release, absent viewer, and 25 repeated cycles with no pointer completion or post-disposal map frame.

Bounded validation passed **19/19**, with no skips, using `node --experimental-vm-modules --expose-gc --test-concurrency=1 --test` on `ui-actor-lifetime.test.mjs` and `ui-composed-jump-lifetime.test.mjs`. This includes five new regressions, the existing native teardown/navigation checks, and the existing forced-GC minimap lifetime check. Syntax and whitespace checks pass. No browser heap snapshot, WebGL run, physical-device or Switch measurement is implied by reference-reachability assertions.

## Splatoon comparison

The project comparison baseline remains Splatoon 3 11.3.0. This is application UI resource ownership and cancellation around the already-supported Turf Map/Super Jump input. Nintendo does not publish a browser DOM or JavaScript object-lifetime contract. No Nintendo physics, timing, gear or memory-size value is inferred, and existing calibration gaps remain open.
