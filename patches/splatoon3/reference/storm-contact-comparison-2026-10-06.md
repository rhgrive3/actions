# Ink Storm device deployment: elapsed air time vs. first contact (issue #246)

Focused comparison record for lane `fb3`. This is lane-local evidence; the shared
aggregate `reports/inkwave-splatoon3-behavior-2026-10-02.md` is owned by the parent
integration lane and is not edited here to avoid cross-lane conflicts.

## Reference (Splatoon 3)

- Splatoon 3 Ver. 11.3.0, normal battle, Ink Storm (アメフラシ) after the device is thrown.
- S3 deploys the rain cloud at the point where the thrown device first contacts
  terrain or an object. Dropping it into water wastes it (no cloud).
  - スプラトゥーン3攻略＆検証Wiki — アメフラシ「仕様」: 地形・オブジェクト接触で発生、水没は不発
    (本文確認 2026-10-04, issue #246 の根拠).
  - Inkipedia — Ink Storm (Splatoon 3): lands and creates the cloud (補助確認).
- No unpublished frame value is asserted. The separation being compared is
  *contact-required* vs. *elapsed-time-deploy*, not a specific native timing.

## Current INKWAVE (before this change)

- `inkwave-public/src/game/weapons.js` `Projectiles._updateBombs()` had, in addition
  to the real contact branch, `if (b.kind === 'storm' && b.age > 1.1) { this._spawnCloud(b); ... }`.
- A device that had not hit anything was converted into a rain cloud purely because
  1.1 s of air time had elapsed; the device was consumed at that point.
- A lob that should land after ~1.3 s therefore deployed mid-air, and the visible
  effect position no longer depended on the contact point.

## Implementation

- `patches/splatoon3/adapter.mjs` (build-only source connection for
  `src/game/weapons.js`): the `age > 1.1` airborne deploy is replaced by a
  non-gameplay memory guard (`age > 30`) that releases a never-contacting device
  **without** spawning a cloud. The existing contact branch
  (`if (b.kind === 'storm') { this._spawnCloud(b); ... }`) and the water/void
  discard are unchanged, so the cloud still comes only from the first contact
  point, once per device, and ghost devices keep their flag.
- `inkwave-public/` itself is not modified (upstream lock preserved); the change
  is a disposable-build-tree connection, matching the existing bomb connections
  in the same adapter branch.

## Reproduction / verification

- Focused test: `patches/splatoon3/tests/storm-airborne-contact.test.mjs`
  (production `adaptSource`, real native `Projectiles`).
  - Un-contacted device past 67 fixed 60 Hz ticks (>1.1 s) while still airborne:
    0 clouds, device retained (failed before the adapter change).
  - First terrain contact: exactly one cloud, device consumed, no duplicate on
    later ticks.
  - Remote ghost device: contact deployment preserves `cloud.ghost`.
  - Water/void discard: no cloud, device released.
  - Never-contacting device: memory-guard discard, still 0 clouds.
- Command: `node --experimental-vm-modules --test patches/splatoon3/tests/storm-airborne-contact.test.mjs`
  → 5 passed / 0 failed (after change); the first and last cases fail on unpatched main.
- Related focused regression: `sub-special-fidelity`, `weapon-edgecases`,
  `network-replication/robustness-timing`, `network-replication/simulation-clock`
  → 36 passed / 0 failed (contact-based ghost storm cases still deploy).

## Confirmation status

- Confirmed at logic level on the actual built module (adapter connection +
  native `_updateBombs`), including 30/60/120-independent fixed-tick stepping.
- Not confirmed on physical Switch hardware or a full browser match; the native
  in-game device trajectory and cloud visuals are unchanged by this fix.
- The `30 s` guard is explicitly a memory guard, **not** an S3 timing value and
  not a deployment path; it is not used by any gameplay calculation.
