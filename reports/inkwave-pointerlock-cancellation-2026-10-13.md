# Pointer Lock request lifetime (#1396)

## Baseline and scope

Issue: https://github.com/rhgrive3/actions/issues/1396

Baseline main: `14f9f913a8438353d0e462a0e74e17d8af876230`.
Only browser input request lifetime changes. The untouched upstream input is composed with the current gameplay, reliability, quality and native-stage build. No movement, weapon, paint, network authority, numerical S3 tuning, touch layout or character changes are included.

The target comparison baseline remains Splatoon 3 11.3.0, but this is an INKWAVE browser-only cancellation contract. Nintendo Switch does not use the browser Pointer Lock API; no numerical, visual or hardware retail-parity conclusion is claimed.

## Reproduction and impact

`Game.quitToMenu()` calls `input.exitLock()`, hides its menu and then awaits a fade. If a preceding Pointer Lock request is still pending, the old `exitLock()` has no browser lock to exit and leaves no cancellation marker. A later successful browser notification sees the still-current playing match and null menu and admits the obsolete capture. The cursor can be recaptured during the quit transition. A late rejection can similarly begin the plain-lock fallback after the explicit exit.

Independently, touch-to-mouse reacquisition already checks playing admission synchronously, but a pending success could previously survive match completion, attract mode or replacement. Existing pause/menu checks did not close those contexts.

Tests execute the actual composed Input and installed browser-event handlers with deterministic platform objects. The quit test mirrors the production entry ordering and suspended fade conditions; it does not execute an entire browser Game quit animation.

## Correction

- Every genuine explicit request has an identity; an old rejected request cannot fallback after cancellation or supersession.
- Explicit `exitLock()` records cancellation even when no lock has been acquired yet.
- The completion handler retires cancelled or disabled acquisition without a second pause.
- A request initiated during playing belongs to that exact match and must still be playing in the same mode when acquisition completes.
- Initial-start/menu and init/intro capture retain their previous intentional admission. Fresh explicit retries re-establish admission.
- Reusing a browser lock after an exit failure also establishes fresh identity rather than retaining cancellation state.

Pointer-lock-change events identify a locked element, not the originating promise. When a newer explicit request legitimately admits the same canvas, its current admission governs completion. No claim of distinguishing browser notifications that lack request identity is made.

## Verification

- Baseline actual minified build content `bbb2d5efa3e1e9726fef85a241fa7ac00f02eda09b92ae83df0d3bcd5397d6fa`, input `5002a74b9893b88cc8dbded872b47b3824be570d6d6e134ee35a400526b51454`: all ten new cancellation/context regressions fail; the initial/menu/intro positive passes (11 tests). Earlier source-composed cancellation and finish negatives independently failed.
- Candidate source-composed pointer-lock suite: **31/31 passed**, no skips.
- Candidate actual emitted/minified pointer-lock suite: **31/31 passed**, no skips.
- Adjacent existing mobile, pen and held-action cancellation suites: **82/82 passed**, no skips.
- Default production build with esbuild 0.28.2 passed. Candidate content `6afcec8d0a97a45d3b33768b904b5aaaf974c42e42a33e2cdfe0913239873427`, input `8018968366b25aecc758f051076c3a0cb804b4273e4526fe83b6ee85ba7dc83e`.
- Existing workflow contract tests: **15/15 passed**. Two narrow steps run the source and actual emitted pointer-lock suite in the existing Validate job; all previous gates, including Flow, remain intact.
- `git diff --check` passed.

Commands:

```sh
node --experimental-vm-modules --test patches/reliability/tests/touch-pointerlock.test.mjs
INKWAVE_POINTER_LOCK_SITE="$PWD/.built-site" node --experimental-vm-modules --test patches/reliability/tests/touch-pointerlock.test.mjs
node --experimental-vm-modules --test patches/reliability/tests/pen-input*.test.mjs patches/reliability/tests/hold-cancel.test.mjs patches/reliability/tests/mobile.test.mjs
```

## Limits

The installed system Chromium was actually attempted, but exited before page creation with `process_singleton_posix.cc: socket() failed: Operation not permitted`. The Playwright-managed executable was absent. No local native-browser pass is claimed. Existing exact-head hosted browser/CI gates and independent review remain necessary before integration. A deterministic delayed notification is not physical-device/browser scheduling evidence. Full repository CI was not run locally.
