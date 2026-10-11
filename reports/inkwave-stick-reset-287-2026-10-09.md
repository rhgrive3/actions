# #287: resetting live settings must not reuse a legacy stick scalar

## Scope and evidence

- Target: `inkwave-public/` composed through the six production adapters, inspected at PR #1182 local base `4c90da98`. The frozen public tree is unchanged.
- Claim: https://github.com/rhgrive3/actions/issues/287#issuecomment-6080110021
- Reference condition retained from [#287](https://github.com/rhgrive3/actions/issues/287): Splatoon 3 Ver. 11.3.0, Standard Gamepad right stick, independently selected TV/Tabletop and Handheld profiles; the documented option domain is −5…+5. The exact Nintendo gain curve remains unmeasured. This patch does not change or validate the existing provisional curve.
- This is an INKWAVE consistency defect between its actual first-boot migration and its live Settings reset. It does not assert a new Nintendo reset constant or timing.

## Reproduction and impact

1. Fresh boot loads the legacy default `padSensitivity: 1.0`, creates both aim profiles, and performs the existing one-time migration to S3 setting `0`, recording `padSensitivityScale: 's3'`.
2. Open Settings and press RESET TO DEFAULTS twice through its normal armed-confirmation callback.
3. Before this fix, the callback passes `{ ...DEFAULT_SETTINGS }`. `applyAimSettingsChange` resets both profiles to `0`, then writes the flat legacy value `1.0` over the active TV profile.
4. The active control refreshes to `+1`. Storage still has the S3 scale marker, so a reload preserves `+1` rather than migrating it back to `0`. Handheld stays at `0`.
5. With INKWAVE's existing provisional transfer, the unintended active gain becomes `2 ** (1 / 5)` rather than `1`. This is a local mathematical consequence, not a measured Nintendo turn-rate difference.

## Fix

The pad-sensitivity adapter converts the legacy default with its existing `legacyPadToS3` helper at the live menu-reset boundary and explicitly includes the S3 marker. The locked/default config remains legacy-shaped so old saved multipliers migrate exactly once. The reset keeps the native two-press confirmation, both-profile reset, visible-control refresh and normal settings persistence. No response curve, dead zone, gyro mapping or gameplay numeric parameter changes.

## Verification

- Before fix: both new production-composed regressions fail at the unwanted `1 !== 0` result.
- After fix: 23 tests pass, 0 fail, 0 skip across `issue-287-settings-reset`, `pad-sensitivity` and `aim-profile` suites.
- New tests use actual composed config, complete native boot settings/migration span, native `Game._setSettings`, and the native armed menu-reset callback. Unrelated graphics/audio side effects are inert; browser layout is not executed.
- Cases cover fresh boot, both profile edits, first-click no-op/second-click commit, visible-control refresh, storage and reload, flat legacy saves, split legacy saves, already-S3 saves, repeated resets and unchanged legacy defaults. Existing aim-profile tests cover native camera/profile/gyro transition neighbors.
- `git diff --check` and adapter/test syntax checks pass.
- No browser or Switch run was performed. The earlier Chromium socket restriction remains recorded in the #1039 report. This test result is not visual/device validation and does not close #287's remaining Nintendo calibration acceptance.
