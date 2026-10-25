# UI queue additions — 2026-10-25

Based on PR #1870 head `8e539eac1e5fe4a6412d3e5852d7f5eaa5d0c1da`.
The complete 513-row current queue inventory was scoped to 68 UI-owned rows.
Per-row decisions are in `queue-extra-ui-20261025.json`: **11 implemented or completed,
53 already effective in the existing PR/current source, 4 not adopted**.
Network lobby ping and CI trigger rows belong to their respective workstreams.

## Added behavior

- Reuse each minimap composite's jump pulse and immutable spawn-circle paths, preserving paint order, live colors and a no-Path2D fallback.
- Skip zero-turn/settled tank arithmetic and non-rendered remote heading dirty keys.
- Maintain the exact lowest free InkFX slot through all three retirement paths, clear and nested landing births.
- Avoid unchanged touch-stick base/class and FOV target-class writes. Preserve live DOM overrides and all input calculations.
- During a frozen UI animation, retain its first paint and repaint on settings changes or canvas/context changes. Keep RAF ownership, progression, callbacks and completion unchanged.
- Clear boss roster scratch at mode/disposal boundaries. Unsubscribe menu-owned network callbacks and dispose all News timers, RAF, tween closures and detached DOM references.

The existing news cleanup rewrite matched the engine-takeover RAF cancellation instead of the disposal path after source composition. Its anchor now identifies disposal unambiguously; first engine update preserves the live news owner. Erroring unsubscribe callbacks do not prevent the other subscriptions from retiring.

These are final build-only transformations. Immutable upstream snapshots and gameplay physics, damage, ink, movement, sensor projection and network admission are unchanged.

## Verification

`node --test patches/local-quality/tests/queue-ui-20261025.test.mjs`

**10 passed; zero failures/skips.** The tests load the actual final composed methods and compare them with retained pre-change source oracles. They cover:

- HUD ink states at 30/60/120Hz, including negative/nonfinite dt behavior.
- InkFX at 30/60/120Hz with real vendored Three.js, all typed state arrays, all instance matrices, RNG sequence, nested landing births, full pool, clear and zero-kind writes.
- 2,000 actual HUD map updates with remote yaw churn, self switches, missing/reappearing players, movement, deaths and expansion.
- 5,000 actual touch-stick renders with external layout writes and replaced elements.
- Every FOV wedge/caption/target state, frozen gyro/touch first paint, settings invalidation and resumed frames.
- Canvas paint-command equivalence with lazy jump effects, dynamic pad position/radius/flip/colors, expiry and Path2D absence.
- Frozen wipe progression, resize invalidation, midpoint/finish callbacks, menu engine takeover, repeated/erroring cleanup, all News timer/RAF ownership.

Existing focused suites:

```sh
node --experimental-vm-modules --experimental-global-webcrypto --test \
  patches/local-quality/tests/input-lens-queue.test.mjs \
  patches/local-quality/tests/added-ui-motion.test.mjs \
  patches/local-quality/tests/added-ui-motion-source.test.mjs \
  patches/local-quality/tests/settings-hud-queue.test.mjs \
  patches/local-quality/tests/settings-ui.test.mjs \
  patches/local-quality/tests/menu-music-queue358.test.mjs \
  patches/local-quality/tests/ui-actor-lifetime.test.mjs
```

**59 passed, zero failures; 2 existing skips** (optional browser harness and an already skipped live minimap ownership case). These overlapping scopes are not a global project test count.

No Actions run was requested for this workstream. Canvas command equivalence is not a rendered bitmap comparison. Browser/Safari/iPad, GC, power, device FPS and retail Splatoon 3 equivalence remain unmeasured. The existing Ver.11.3.0 gameplay comparison limitations remain unchanged.

## Decisions retained

The proposed gravity-vector hypot/division removal is not adopted: mathematical unit length does not preserve floating-point normalization or gyro sensor trust behavior. The attract-coverage proposal targets an old every-frame premise; final source already inspects only twice per second. Bypassing its virtual coverage API would add cross-owner coupling without demonstrated benefit. Prior decisions against releasing the lobby atlas CPU backing and bypassing gyro calibration/fallback are retained.
