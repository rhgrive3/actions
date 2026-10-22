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

## Local receipts

- Final focused regressions: 29/29. Input/lifecycle/source identity: 52/52.
  Adjacent input: 30/30. Source-stage tests: 68/68 after installing the missing
  Python numba dependency. Emitted packaging/Three/actual BOT: 14/14.
  Workflow/admission contracts: 31/31.
- Production build, startup file budgets, source-migration audit and the quick
  compatibility/numeric gate passed. Runtime content hash:
  `0995c75b2b3efa4104a60782962b7d65dd6263277a38584cfc1ce1f61881cd09`.
- [Chromium lifecycle receipt](issue-batch-20261022/chromium-lifecycle.json):
  Chromium 154.0.8037.57 / SwiftShader, actual emitted modules, 20 shadow
  toggles, 20 HIGH/LOW/MEDIUM reflection cycles, 10 Input replacements,
  100 listener registrations and 100 matching removals. Each LOW transition
  returns renderer texture count from 3 to 2; these are resource counts,
  not VRAM bytes or an FPS measurement. Page and console errors: zero.
- Reproduce after a production build with
  `node scripts/check-inkwave-issue-batch-browser.mjs _site .browser-evidence/issue-batch.json`.
  Use `CHROMIUM_PATH` only when selecting an already installed Chromium.
  The source OBJ regression and this browser check are now required steps in
  `validate-inkwave-update.yml`; all existing acceptance gates remain.
- Full active-browser verification against code-identical input head
  `6f6f483614ae587ee4e9395c5287270120fbd929` verified 521 responses and booted,
  then timed out waiting for the loadout appearance picker (15 seconds).
  Page errors, console errors and request failures were empty. The untouched
  main control at `a350b6b89` passed that picker and the fourteen-default probe.
  The control was deliberately stopped after the relevant comparison (45
  canonical loadout rows had also completed); it is not a full-browser pass.
  [Comparison receipt](issue-batch-20261022/browser-comparison.json) retains
  both failures and explicitly records that interruption.
  This comparison does not establish whether the candidate timeout was a
  regression or an intermittent readiness failure. Full-browser acceptance
  remains pending; the deadline and original assertions were not relaxed.

GitHub Actions and physical-device acceptance remain separate from these local
receipts. This PR remains a draft until the remaining acceptance is reviewed.

The optional monolithic local-quality run was deliberately stopped before all
unchanged animation/geometry fixtures finished. Its [partial receipt](issue-batch-20261022/local-quality-partial.json)
retains the single obsolete LOW-reflection string assertion failure. The updated
real-method LOW fallback and all final focused regressions passed separately.
No green monolithic local-quality or full-CI result is claimed.
