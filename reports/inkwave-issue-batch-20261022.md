# INKWAVE issue batch — 2026-10-22

Base: `a350b6b89e4cb86abe37273db6315c74085f8ac5` (`origin/main`).

This branch combines seven bounded fixes from six open PRs. It does not merge
those PRs, close their reviews, or include the separate material/Wiper/runtime
acceptance branches. Hardware frame-time and retail parity remain unmeasured.

| Problem | Result | Source proposal |
| --- | --- | --- |
| Zero-drag live sprites evaluate an exponential every update | Finite-dt zero drag uses exactly 1; nonfinite arithmetic retains its original behavior | #1779 |
| Source OBJ classification recompiles identical stage patterns per object | Each conversion lazily caches only patterns actually reached by short-circuit evaluation | #1780 |
| Combat/Boss BOT aim creates the same stateless closure each tick | Both paths share the unchanged module-level expression | #1781 |
| Shadow-only toggles rebuild and dispose the HDR post stack | Toggle shadow state and recompile materials while retaining composer, ScreenFX and dynamic scale | #1782 |
| LOW lobby quality retains the reflection render target | Clear sampler and dispose the target; restore the same HDR format on later higher quality | #1784 |
| Nested lobby render failure strands visibility and renderer flags | Restore state in finally; enable reflection only after successful completion | #1784 |
| Disposed Input remains retained by window/document listeners | Remove only the owning instance's ten listeners, destroy mobile controls once, cancel pending pointer-lock fallback | #1788 |

The reflection integration additionally preserves the outer target's cube face
and mip level. A secondary failure restoring a lost context must not replace the
original render error. New negative controls reproduced both omissions before
the integration fix (4 passed / 2 failed), then passed after correction.

PR #1783 was inspected but excluded: production already routes viewport events
through `createTouchRelayout`, which coalesces layout, preserves held input on
same-orientation resize and cancels its RAF on abort. Applying the raw-source
proposal breaks the source lock and the gyro/layout adapters. Neither the lock
nor these guards is weakened by this batch.

## Verification scope

Node is 22.23.3, matching the CI major. Tests distinguish source composition,
actual runtime methods with controlled surroundings, emitted modules, and
browser rendering. Focused tests exercise exact sprite Float32 state, RegExp
allocation and exception ordering, BOT arithmetic, quality/resource lifecycle,
and repeated Input replacement. Full-suite/browser receipts are recorded in the
PR after execution; focused success alone is not a full-CI claim.

Splatoon 3 reference remains Ver. 11.3.0. BOT aim arithmetic, stage classification,
projectile/paint/damage state, and input mappings are unchanged. No Nintendo
frame constant, movement curve, weapon tuning, render precision or resolution is
introduced. The new behavior concerns INKWAVE resource and listener lifetimes.
Real Switch controls and physical iPad memory/FPS were not measured.

Issues #1757/#1671 (physical iPad performance), #642 (composer precision),
#1767 (startup snapshot clocks), and all source-calibration issues remain open;
these local optimizations are not evidence that those acceptance criteria pass.
