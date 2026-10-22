# Additional queue: UI and motion

Scope: 13 exact records from the added Library queue snapshot, evaluated against production composition at base `8de71b09`. Ten records required changes; three were already implemented by the base composition. Reference version remains Splatoon 3 11.3.0. These are local fixes for the published INKWAVE target, with no retail/device performance claim.

## Changes

- Share the first follow-camera yaw trigonometry while retaining the late super-jump direction refresh. An overridden `forward` retains the original call and yaw mutation semantics.
- Integrate raw gyro quaternion rates with scalar operands and one freshly owned result quaternion. Keep arithmetic order, timestamp and attitude filtering semantics.
- Cache unchanged crosshair cone/FOV/viewport calculations; quantized timer/turf formatting; squad/map display keys. Caches retain scalar presentation data and DOM ownership, and reset when the existing display-key owner resets.
- Use complete marker metadata directly. Incomplete and Lab markers lazily retain the original Actor lookup. Existing match disposal releases cached Actor references.
- Reveal results badges with a monotonic cursor, advancing through the same due items in the same order. Skip/finish still materializes all badges and retires the cursor.
- Precompute audio preview spectra. Once muted bars are provably at the existing clamp floor, stop repeat trigonometry/style writes while continuing the clock and smoothing. Nonfinite time retains the original evaluation path.
- Hoist the unchanged frozen seven-entry showcase bomb schedule. Strict time boundaries, missing slots, RNG draw order and drop arguments are unchanged.
- Initialize only six gait and two upper-leg balance targets. Keep array lengths, independent mutable vectors/quaternions and original dense storage for invalid bone indices. Dense source poses/world rotations are unchanged.

## Already covered

- Settings scroll edge fades already use dirty invalidation, ResizeObserver, scroll/resize events, fallback reads and disposal in `settings-ui-adapter.mjs`.
- Hair child/rest direction topology already lives in the per-bank `_hairMeta` cache in the composed locomotion profile.
- Bimanual projections already break when no constraint moved, in the composed source controller.

## Validation

- `node --test patches/local-quality/tests/added-ui-motion.test.mjs`: 13 passed, 0 failed/skipped. Real production-composed before/after methods and blocks compare every displayed DOM state/event and numeric result. Covers timer thresholds, turf interpolation, squad death/ready/respawn, map canvas/resize/safe-area/reset, direct/fallback marker metadata and match release, cone/FOV/height changes, 18 preview bars at 30/60/120 Hz through mute/unmute and nonfinite time, badge frames/order, bomb RNG/drop arguments for 1–4 slots, and 20,000 raw gyro samples with component-exact quaternion results and fresh ownership. Confirms existing settings invalidation and hair/grip composition.
- `flock .../added-heavy-tests.lock node --experimental-vm-modules --test patches/local-quality/tests/added-ui-motion-source.test.mjs`: 1 passed, 0 failed/skipped. Loads actual Player00 packs and production Actor/Character. At 30/60/120 Hz, verifies full bone TRS/world matrices, source pose, contacts, skeleton and muzzle parity; full camera follow including late flight yaw and overridden-forward mutation; sparse target counts and independent instances; invalid-index dense fallback. The test took about 42 seconds on this host.
- `node --experimental-vm-modules --test patches/local-quality/tests/gyro-handoff.test.mjs patches/local-quality/tests/gyro-stationary-bias.test.mjs patches/local-quality/tests/settings-ui.test.mjs`: 21 passed, 0 failed/skipped.
- Source migration audit: 109 source files examined, no failures. Strict immutable-source anchors and admission remain intact.
- `node scripts/check-inkwave-patches.mjs --quick`: passed, reference 11.3.0.
- `git diff --check`: passed.

Heavy tests were serialized. Root owns the combined build/browser check, shared behavior report and publication. No CI polling, push, merge, Library mutation or cold-start clock changes were performed by this domain.
