# Residual queue reconciliation — 2026-10-25

Ten remaining rows were read and checked against actual final source/composition: **4 implemented or corrected, 2 already effective, 4 pending with explicit proof gaps**. The per-row record is `queue-extra-residual-ui-20261025.json`.

Added same-invocation horizontal exponential reuse in `moveActor`/`dampForSpecial`; scalar remote-object-hit distance with the original Vector3 arithmetic and constructor defaults; and an indexed InkMine first-match scan. The Mine scan captures the original array length and visits removed/hole indices exactly like `Array.find`. It retains per-candidate radius evaluation across LOS callbacks, preserving mutation/reentry behavior instead of assuming an immutable radius.

Final review also found and corrected the existing Decor far-axis prune's mixed-NaN fallback: `dx=NaN` with a far finite `dz` used to skip distance computation and yield alpha 0.12, although the original hypot propagates NaN. Two narrow `Number.isNaN` guards restore that original outcome while preserving the finite far-actor optimization.

Local validation:

- `node --test patches/local-quality/tests/residual-ui-hoists-20261025.test.mjs`: **5 pass**, 0 fail/skip. Actual source functions compare 30/60/120Hz movement states/callbacks; invalid dt/signed zero; remote hit boundaries, replay registration, HP, retirement and getter order; and Mine LOS callbacks that append, shrink, delete holes, reverse candidates and mutate radius.
- `node --experimental-vm-modules --experimental-global-webcrypto --test --test-name-pattern='remote ghost deployable hits|mine|Mine' patches/splatoon3/tests/all-subs.test.mjs`: **3 pass**, 0 fail/skip. Existing complete-runtime owner replay, enemy-ink Mine trigger and oldest-Mine detonation cases.
- `queue-extra-decor.test.mjs`: **7 pass**, 0 fail/skip, including 64 coordinate combinations against the original Decor update.
- Syntax and diff checks pass.

Pending proposals are the Tenta HUD persistent Actor-row pool, burst-lifetime Shooter coefficient cache, public Blaster offset-norm reuse across observable reads, and shot-bias record pooling across launch hooks. Their concrete ownership/alias/visibility gaps are retained in the JSON. No browser bitmap, Safari/iPad, GPU, device-FPS or retail-game equivalence is claimed.
