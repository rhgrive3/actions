# Issue #567: keyboard input preserves a physically held touch gesture

Native fresh `keydown` changed `lastDevice` before recording keyboard state. Leaving touch mode reset all mobile pointer ownership, so a still-down finger could not continue FIRE, stick or look input without lifting and touching again. The same simultaneous inputs worked in the keyboard-first order.

The correction uses the same live-contact predicate as #497's pad-axis arbitration. During such a touch contact, only the keydown's device claim is deferred; `onKey`, held keys and press edges retain their existing ordering and behavior. Touch input remains usable alongside keyboard movement. After the final contact ends or is cancelled, the next fresh keyboard event acquires the keyboard owner normally. There is no deferred owner queue or synthetic pointer redispatch.

This is scoped to fresh keyboard events. Explicit mouse/gamepad-button takeovers, physical pointer cleanup, lifecycle reset and existing menu action owners retain their current behavior. The [Issue #567 reproduction](https://github.com/rhgrive3/actions/issues/567) supplies the discrete input-order comparison; no movement coefficients or original-game numeric timing are introduced.

## Verification

- Final aggregate: 1,120 passed, 0 failed, 5 existing optional emitted-mode skips.

- Initial reproduction: all 10 new cases failed before the correction.
- Focused source: 16/16 across the new keyboard cases and existing #497 pad contact cases.
- Actual #571 and #567 adapter composition in a private VM dispatcher: 16/16. A contact deliberately retains touch/navigation ownership; once a new keyboard event can claim ownership, #571 closes the touch map normally.
- Build: `696172089458`.
- Actual emitted keyboard/pad/respawn-navigation cases: 47/47, no skips.
- Independent review found no blocker in 17 additional native-module probes covering action keys, Tab/M temporary map holds, mixed-contact cleanup, reset/hide/destroy and consumed/repeated keys.
- Coverage includes FIRE/stick/look, ordinary and unused keys, order symmetry, multi-contact cancellation/lost capture, native controller output, consumed menu keys and the existing platform reset helper.

These are transformed/emitted native modules with display/collision fixtures, not a physical Bluetooth keyboard or rendered iPad/Android browser verification. Those hardware cases remain pending.
