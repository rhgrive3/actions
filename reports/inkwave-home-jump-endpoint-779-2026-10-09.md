# #779: every home selector uses the configured return point

## Existing contract and residual

The stage model already separates `homeSuperJumpPoints` from `spawnPads`. The
production HUD consumes the home datum. However, the remaining five source
connections still selected `spawnPads`: live keyboard/touch/nonstandard-pad,
standard-pad confirmation, deferred respawn navigation, the Diorama Base pin's
projection, and its jump request. Consequently the same Base action selected
different coordinates depending on the input surface.

This was confirmed in PR #1182 production composition, based on the local
`0899cd4d` continuation of aggregate `13d90d12`. The ten new input/display tests
failed before the fix at the wrong-target assertions. Both teams' existing
home/spawn metadata are intentionally distinct in the fixtures.

## Implementation

`patches/reliability/home-jump-adapter.mjs` runs after the navigation/chain
adapters. It connects all five owners to the existing team-specific home datum,
with the HUD's existing spawn fallback only when a home entry is absent.

The fixed target is cloned on selection as before. The actor's existing
admission, charge, flight, landing, marker and peer event semantics are reused.
No stage coordinate, respawn/spawner placement, Nintendo value, latency/timing
or input mapping is changed. The new adapter participates in build identity and
fails closed when expected source connections are missing or already applied.

## Verification

- Ten before-fix failures pass after the repair: live/dead keyboard, standard
  pad, raw pad and touch routes for both teams; Diorama pin projection and
  completed touch for both teams.
- Three full-runtime tests route HUD/Diorama selections through native Actor
  flight and landing at 30/60/120 Hz. Both the landing position and the existing
  flight event's destination equal the chosen home point; spawn metadata stays
  unchanged.
- Adapter source-drift/double-application and identity checks pass.
- Final focused validation: **96/96 passed, zero failures/skips**, using
  `node --experimental-vm-modules --test-concurrency=1 --test` for
  `home-jump-adapter.test.mjs`, `pin-tap.test.mjs`,
  `respawn-navigation.test.mjs`, `navigation.test.mjs` and
  `issue-1153-bubbler-superjump.test.mjs`. Existing missing-home fallback,
  teammate/Bubbler targeting, cancellation and delayed respawn controls pass.
  Syntax and whitespace checks pass. These are Node source/runtime checks with
  fixture DOM/inputs, not browser/WebGL/physical controller or live relay validation.

## Splatoon reference and limits

Project baseline remains Splatoon 3 11.3.0. The existing Issue #779 cites the
[Spawner](https://splatoonwiki.org/wiki/Spawner) and
[Turf Map](https://splatoonwiki.org/wiki/Map) descriptions distinguishing home
return from the spawner. A fresh fetch of both pages returned HTTP 403 during
this follow-up; no new source claim or numeric calibration is based on it.
The repair synchronizes the already accepted INKWAVE stage/UI contract.
Existing custom stage home coordinates are not asserted to be measured Nintendo
stage coordinates, and Switch comparison remains unperformed.
