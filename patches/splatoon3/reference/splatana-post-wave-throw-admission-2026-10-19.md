# Splatana post-wave throw admission (2026-10-19)

## Reference and bounded interpretation

Nintendo's [Splatoon 3 version 10.0.0 notes](https://support.nintendo.com/jp/switch/software_support/av5ja/1000.html) (2025-06-12, player controls) state that the short interval after a Splatana swing in which a sub weapon is unavailable also prevents throwing a Clam, Power Clam, Fizzbang, or Golden Egg. The reported retail fix concerns the misleading trajectory guide during that unavailable interval. It does not publish the interval's start frame or a duration.

This candidate repairs the existing Clam/Sub input consumers after an actual catalogue Splatana wave. It does not establish retail-perfect timing. The catalogue already starts `stop` when it creates the pending swing, before the wave appears. A broader prototype that rejected throughout that timer was retained separately and not adopted: it also changed pre-wave cancellation without source support.

The bounded predicate is Splatana family, existing `stop > EPS`, and no pending wave. The existing pending consumer clears `pending` and synchronously invokes its paid swing callback, which calls `emitSingle`; the Splatana projectile has no additional deferred spawn. Main cancellation clears both `pending` and `stop`. These existing transitions provide the boundary without adding a clock, duration, or marker. A Sub press while the wave is still pending, including the tick on which it would otherwise emit, retains its old cancellation. A Clam edge in that pre-wave tick also retains its old admission. Those preserved behaviors are not claimed to be measured retail rules.

## Production changes

- `main-weapon-catalog.mjs` exposes the shared read-only predicate. After a wave, held/released Sub input cannot hard-cancel the existing recovery or enter native Sub preparation. Recovery still receives its one original decrement per update. Holding Sub may prepare it after natural expiry; a rejected short tap does not queue a delayed release.
- `ranked/install.mjs` rejects a new Clam edge at the same pre-update boundary, before `_rankedInput` and the follower `_rankedThrowPending` latch. No Clam rule, launch velocity, inventory/score calculation, packet schema, or rendering owner is changed.
- The source-loaded test fixture accepts optional extra exports so the actual `RankedWorld` is loaded from the same source/emitted namespace as the rest of the fixture.

The existing timer can already reach zero before the wave for a stepped full swing of `s3-saber-normal`. This patch protects only the existing positive post-wave `stop` interval; it does not extend that timer or claim to reproduce the unavailable window for every retail attack type. That stepped-swing timing remains a separate unresolved issue.

The earlier broad prototype's change to the existing melee-cancellation test is not carried forward. The original test file is byte-identical to the main baseline: pre-wave live-slash cancellation by Sub remains covered.

## Verification

The dedicated `catalog-splatana-throw-admission.test.mjs` drives real raw Controller input, production-composed source-loaded Actor, actual catalogue wave emission, installed ranked Match/rule, and actual Sub objects. Its fixtures isolate a flat floor and do not claim a rendered retail comparison.

- After-wave coverage: three source weapons, weak/full swings, Clam hold, short Sub tap, and held Sub (18 scenes).
- Before-wave coverage: the same three weapons and two swing modes, early pending and wave-due ticks, Sub and Clam edges (24 scenes). Pre-wave Sub cancellation and Clam admission remain unchanged.
- Follower coverage: actual native actor packets reject the blocked edge, do not invent a later edge from the hold, send one fresh unlocked press, and consume it once. The follower does not spend its inventory locally.
- Related existing tests cover Splatana step/melee lifetimes, charge keep, Charger Sub interruption, and ranked keyboard/pad/touch lifecycle.
- An external main-only comparison uses the official `b07bf92be2a977f705e4cefdb35194d8c016148e` source as the control: three weapons × ordinary weak fire, full-charge hold, post-wave squid input, and charge-stage Sub cancellation, each for 180 actual input ticks. It compares weapon/player state, every Character bone quaternion, and actual wave origins/velocities. Receipts are retained with the candidate review; they are not Nintendo assets.

Local final result: the dedicated suite passed 5/5 tests (43 scenes), the unchanged related suite passed 82/82, and the 2,160-tick main comparison was byte-identical with 15 actual wave emissions.

The dedicated suite supports exact emitted testing with `INKWAVE_BUILT_SITE`. A final emitted build and CI on an approved publication head remain required; this local candidate has not been published. No local browser run or retail input-frame measurement is claimed.

## Integration

The overlapping PR1636 charge-keep edits are separate hunks in `main-weapon-catalog.mjs`; use a three-way/hunk union, not an older whole-file replacement. Likewise retain existing source-fixture exports from other approved work. No model, arm-motion, or central report file is part of this candidate.

## Stack validation and browser gate

The publication candidate is based on PR1636 head `b14b7bbda12fd8c46f21b3d07fd10d6738f1fd0d`. Its six charge-keep changes and the three preceding reticle changes were checked against the official Git tree before this patch was applied. Both existing keep hunks remain in the combined catalogue runtime.

The existing catalogue browser script gains six small Actor-input scenes after its `CANONICAL_KITS` helper boundary and charge-keep probe: each of the three Splatana source weapons cancels a pending weak swing with Sub, then independently rejects held Sub after an actual wave until natural recovery expiry. It reuses the script's `DisplayCharacter` and flat-floor fixture, so this is a browser gameplay-admission check, not an arm animation or rendered-geometry comparison. The receipt exposes `splatanaThrowChecks`. Its exact extracted block passes locally, restores all five saved global fields, and clears its projectiles. The 12 prior helper-extraction fixtures plus the new contract test pass 22/22. Negative controls fail on both old Sub hard-cancellation and the rejected broader pre-wave lock.

The existing seven-claims CI job explicitly runs the five-test actual Controller/Clam/follower suite and the browser-contract test in both source and exact emitted namespaces. The unchanged subsequent catalogue-browser command runs Chromium and WebKit on that same emitted site. Existing 15-minute job limits remain unchanged: the earlier a9ea job took about 188 seconds before these added suites. Actual browser and exact-emitted acceptance remains pending the new immutable publication head.
