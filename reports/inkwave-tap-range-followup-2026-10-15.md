# INKWAVE: tap continuity and practice-range feedback

Base: main `4bc51194dd45255fdd4a56931265e5d0369317ec`.

## Reproduced problems and corrections

| Reproduction | Prior behavior | Correction |
| --- | --- | --- |
| Move a MAP/PAUSE finger more than 24px away, return, release | The final distance alone accepted the gesture, opening the map or pausing | A move outside the existing slop cancels that pointer's tap permanently; a fresh tap still works |
| Repeat the out-and-back gesture on GYRO, including a 1s hold | The toggle/permission or diagnostic callback could run | Track gyro moves and cancel the gesture before either action |
| Hold GYRO while a gamepad stick is deflected | GYRO's separate tap record was invisible to the shared contact owner; pad polling could hide/cancel it | Register a non-gameplay gyro contact in the existing pointer map until release/reset |
| Start GYRO from the canvas when root pointer capture is unavailable | Canvas fallback could not identify the contact, losing move/up/cancel | The shared contact now admits the existing fallback router; up toggles once and cancel never toggles |
| A floating range damage number crosses the near plane, or its projection is nonfinite | Only the far plane was checked; near-plane/invalid CSS could leave a misplaced number | Hide outside either depth plane or on nonfinite projection; recover on a valid later frame |
| Hit a target and immediately reset targets | Old floating damage and combo card could remain after measurement state reset | Clear target feedback immediately with the reset; the same cleanup is used at disposal |

The change spans reliability input adaptation, the platform mobile wrapper and
the practice range. It preserves ordinary tap slop (24px inclusive), deliberate
long-press diagnostics (900ms), independent contacts, pending-shot cancellation,
gyro permission calculations and the range's authoritative damage/reset rules.

## Comparison boundary

Reference remains Splatoon 3 11.3.0 as pinned in the repository. The web-only
MAP/PAUSE/GYRO gesture admission and INKWAVE range telemetry are browser UI
corrections, not newly inferred Nintendo timings or game rules. The 24px/900ms
values are existing INKWAVE UI choices, not extracted retail measurements.
Weapon/gear-dependent movement and attack comparisons remain at their existing
verification status. No new Switch, mobile hardware, full-game FPS, or exact
training-room visual equivalence is claimed. Issues #1430/#1432 retain their
separate reproduction and acceptance requirements.

## Verification and reproduction

- Final focused source checks: `tap-gesture-continuity.test.mjs` (7 cases) and
  `target-feedback.test.mjs` (3 cases). On the unmodified base, 9 fail with
  assertions and the existing reset/dispose control passes.
- The same focused checks run against actual emitted/minified modules using
  `INKWAVE_CONTROLS_SITE` and `INKWAVE_BUILT_SITE`.
- Final broad run: 1,158 cases, 1,147 passed, 11 explicitly skipped, zero failures;
  270.4 seconds. An earlier run before the test cleanup also passed; final counts
  above refer to the committed runtime and final test selection.
- Final emitted focused checks, packaging and workflow validation: 35/35, no
  skips. The startup/offline budget passes. Runtime content hash:
  `90b1f2edad09586d6c7db87883c8816943dd6714d088e5b334d47f926b020eba`.
- Adjacent emitted editor-menu, page-focus, input-policy and alive/dead gyro-map
  boundaries: 45/45, no skips. This separately executes the 11 emitted-only
  cases intentionally skipped in the raw-source broad run.
- Broad regression command: `node --experimental-vm-modules --test
  --test-concurrency=2 patches/reliability/tests/*.test.mjs
  patches/local-quality/tests/gyro-*.test.mjs
  patches/local-quality/tests/touch-relayout.test.mjs
  patches/practice-range/tests/*.test.mjs
  tests/platform-lifecycle/platform-smoke.test.mjs`.
- Production build uses esbuild 0.28.2. Startup/offline limits are checked by
  `scripts/check-inkwave-startup-budget.mjs`; packaging includes commit-input
  identity and the offline module graph.
- `scripts/check-inkwave-tap-gestures-browser.mjs --site <built-site>
  --evidence-dir <evidence>` verifies artifact hashes, five browser scenarios and
  exactly nine trusted native pointer-downs. Local Chromium 153.0.8010.0 passed.
  The CI UI shard runs the same probe with its pinned Chromium installation.
  The focused receipt is [committed as JSON](inkwave-tap-range-browser-2026-10-15.json).

The browser probe uses real DOM listeners and touch/capture dispatch. Its pad
snapshot and final gyro callback are spies; it does not request real sensor
permission or boot a full match. Range projection/reset cases use the actual
runtime modules with fixture DOM/camera state. Broader headless tests retain
their documented optional source-motion limitations. The stock Playwright
browser download was truncated locally; a separate npm-packaged Chromium was
extracted without changing product dependencies to run the focused probe.
A rebuild into reused local staging hit the existing Scorch asset replacement
guard; building to a fresh output directory passed with that guard intact.
