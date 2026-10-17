# INKWAVE open PR integration, 2026-10-17

## Scope

Integrate #1547 (profile/start/roster recovery), #1550 (remaining weapon variants and opponent palettes), #1556 (Crab Tank and simultaneous touch/gyro), #1561 (shared CI fixtures and volley rendering), and #1562 (body proportions and ready stance) in one branch based on main `85acc45d`.

PR #1563 is owned by the concurrent task and is not merged here; its shared ancestor #1562 is included. PR #401 is excluded. Source PR histories are retained with merge commits. No changes are made to `inkwave-public/`.

## Conflict resolution

- Keep main's ink footprint composition and add both opponent-palette adapters after it. Retain all production preview imports and the source-backed paint and collision changes.
- Preserve main's current special gauge ownership, Zipcaster impact, Wail tails and cleanup while adding Crab's fixed-source-tick firing, splash rendering and disposal.
- Use the existing Brella/Stringer volley identity WeakSet for firing sheets. Remove the duplicate Brella-only guard brought by #1561; individual physical pellets, RNG, paint and damage remain unchanged.
- Keep the stronger native async Toxic Mist VM test and current Trizooka 0/4/8F assertions. Preserve both branches' comparison records.
- Keep #1550's parallel projectile captures and main's immutable PR-base alignment, pinned birth/paint baseline preparation, full-roster controls and complete physical comparator. All prior regression gates remain enabled.

## Existing main CI regressions

The pre-integration #1547 run `39036249840` failed on stale or incomplete test conditions. These are repaired against the already merged behavior, without reverting sourced runtime logic:

- Bind the actual `splashdownProtected` import in the isolated `packActor` handoff fixture.
- Check Dualies maximum damage at birth and the 7F..15F sourced damage reduction at completed 8F (28.125).
- Distinguish an admitted jump clock from an airborne ledge fall in Splatling and Shooter/Blaster accuracy tests. Explicitly initialize jump clocks when testing the jump envelope.
- Sprinkler middle duration follows the first duration (8+15s at AP0, 13+17s at AP57). Run the cadence/paint and wire ownership checks beyond both transitions.
- Super Chump births follow the 13F throw wind-up. Require zero births before and twelve after the boundary.
- Keep the bomb defense gate's current Tacticooler fallback in the source assertion.
- Exercise replay Splash Wall pending/activation before checking sixty active frames of HP decay, including its transmitted activation delay.
- Update only the fixed-seed Splatling endpoint for the already audited multiplicative speed-rate correction. Preserve four RNG draws, exact same-composition A/B flight/paint equality, pinned paint source fields and independent cell enumeration. See `inkwave-spinner-kinematics-source-audit-2026-10-17.md` and `inkwave-weapons-golden-reconciliation-2026-10-17.md`.

## Verification and comparison limits

Production minification and the unchanged startup dependency/size gate passed locally (131 core preloads, 14 range preloads, 146 initial JS requests). Final committed-head CI, focused source/emitted tests and browser results are recorded on the integration PR.

The comparison reference remains Splatoon 3 Ver.11.3.0 under the weapon, gear and input conditions recorded by each source PR. These integration checks establish INKWAVE regression behavior, not Nintendo executable equivalence or Switch/iOS/Android hardware measurements. Existing unverified source defaults, paint masks, model pattern accuracy and real-device measurements remain explicitly unverified in the original reports.
