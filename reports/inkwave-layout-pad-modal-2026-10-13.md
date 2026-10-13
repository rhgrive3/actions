# Touch-layout modal controller ownership (#1400)

Issue: https://github.com/rhgrive3/actions/issues/1400

Baseline: main `14f9f913a8438353d0e462a0e74e17d8af876230`.

## Reproduced defect

The existing layout editor declares a modal dialog and captures keyboard navigation, but `Game._padMenus()` continued sending controller input to the menu underneath. With the actual composed Input, fixed clock and Game/Menus navigation methods, an offline pause → settings → editor-active setup followed by B, release, B changed settings → pause → no menu and resumed the match while `mobile.editing` remained true. Source-composed and emitted Game routing independently reproduced the underlying navigation.

The lifecycle fixture sets the editor-active flag rather than opening native DOM through a real controller. Its subsequent Input polling, menu routing, back/resume methods and match state are real composed code with fixture surfaces. This is not physical-controller or full native-browser evidence.

## Narrow correction

- Ownership is rechecked at every menu dispatch and before stick/Start processing, then latched for the rest of the poll. The native Menus accept-binding tests explicitly set the editor state as their DOM abstraction, including immediate open/close.
- The touch-layout adapter makes the active editor own all gamepad edges and current held buttons before the ordinary Game menu router can act. It uses the existing menu-button consumption/masking contract.
- Successful native Save or Cancel sets a one-poll close fence. This also covers an editor opened and closed between gamepad polls. A failed storage save retains the dialog without issuing a close fence.
- A left stick held through editing must return to its existing dead-zone-neutral state before it can navigate the newly exposed menu. A fresh button press after release remains usable independently.
- Existing touch/keyboard editing, save/cancel behavior and ordinary menu B/Start behavior remain. This does not add a new controller-operated editor UI.

No movement/weapon/paint/network tuning, source-stage geometry or character work changes. Comparison target remains Splatoon 3 11.3.0; this browser-only modal-input contract has no Nintendo retail numerical or hardware-parity claim.

## Verification

- New source route suite: **33/33 passed**, no skips.
- Emitted route mode: **33/33 passed**, no skips. Thirty cases execute the actual minified Game `_padMenus` with its context import alias resolved from the emitted module, using the composed Input/Menus lifecycle fixture. The three editor-close cases separately execute the actual source editor implementation with minimal DOM/storage surfaces. They are not claimed as minified/native-browser close tests.
- Unchanged main emitted Game negative: **29 new isolation/lifetime failures**, one ordinary-menu positive, and three explicitly source-only editor-close positives. The initial diagnostic had a missing minified G alias in one case; that harness defect was corrected before the preserved final negative and candidate runs.
- Existing mobile/pause suites: **85/85 passed**, no skips.
- Existing workflow contracts: **15/15 passed**. Validate gains only one source and one emitted-route step; existing checks are retained.
- Default production build and deterministic startup budget pass. esbuild 0.28.2; content `0247f1f4bd38df01eb9cc6ae045fb99bcb95454c35341fb70344b42c37cd35cc`, input `4338f8c123e88e8578eb7b36cb22c79077b28f6f3970ce668aeee328d172e80f`.

Commands:

```sh
node --experimental-vm-modules --test patches/touch-layout/tests/pad-modal.test.mjs
INKWAVE_LAYOUT_PAD_SITE="$PWD/.built-site" node --experimental-vm-modules --test patches/touch-layout/tests/pad-modal.test.mjs
node --experimental-vm-modules --test patches/reliability/tests/mobile.test.mjs patches/reliability/tests/pause.test.mjs
```

## Independent-review correction

The first private candidate `4b567516` passed the already-open modal tests but independent review found a missing same-poll boundary: A could open the editor, then B/Start or a shoulder from the same edge set still operated the underlying menu. That candidate was not accepted or published. The corrected dispatcher rechecks/latches ownership after callbacks; twelve permanent simultaneous-edge/stick cases cover opening and immediate open/close. All source/emitted-route and adjacent counts above refer to the corrected candidate.

## Final independent review

Exact runtime/test commit `3a56460501ddda9678d64eb4e9d19c93adc3e843` (tree `0050836e171efd3292482716523fc7bac7ca4c54`) passed independent review with no remaining high/medium finding. The reviewer reran 33/33 source and 33/33 emitted-route cases and verified no runtime/build drift. A separate read-only native Input/MobileInput lifecycle probe passed five source and five emitted cases: actual editor open, Cancel, Save, failed Save, and Cancel→reopen through the native menu binding during the same A/B/Start poll. Save wrote once, callbacks ran exactly once, the settings screen remained paused, and held buttons stayed masked. The emitted probe loaded 124 actual emitted modules, including Input, MobileInput, PlayerController and their dependency graph. Menus, clock, Actor, config and Three remained shared source fixture surfaces; DOM/layout drawing were mocked. This is stronger dependency/lifecycle evidence, not rendered DOM or controller hardware validation. Final exact-commit packaging passed 9/9 and the startup budget passed.

## Integration and limits

This is an independent main-based fix. The two shared files (Validate and the canonical behavior report) have narrow additions that must be reconciled with #1396 without dropping either set. The frozen #1396 runtime and branch were not edited or included.

Local native-browser testing remains unavailable: the installed system Chromium was already attempted in this same environment for the adjacent #1396 task and exited before creating a page because its process-singleton socket operation was denied. No native browser scheduling, controller hardware or complete repository CI pass is claimed. Hosted exact-head browser/CI and central composition remain adoption gates.
