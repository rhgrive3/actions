# Title navigation lifetime (#950)

Issue: https://github.com/rhgrive3/actions/issues/950
Claim before production edits: https://github.com/rhgrive3/actions/issues/950#issuecomment-6031002327

The defect was reproduced on main `7ab20b44bbc00d497a50cbbbdb43b4da823b0a82` / former integration source `49f222e9`. The final small delta was then composed onto the current PR944 source (`15bfb4e4` production), preserving the existing teammate-special registration and wall-jump changes. Public changes are owned by the central PR944 integrator.

## Failure

The native `_titleGo()` stores no handle for its 200ms callback. The callback calls `show('main')` after a newer screen has taken ownership, or after `dispose()` removes the UI. The current quality wrapper prevents retired animation work but does not reject navigation.

A bounded source reproduction of the composed real `show`, `_titleGo`, and `dispose` methods plus `installMenuQuality` recorded:

- Normal confirmation: one transition to main.
- Confirmation followed by settings: callbacks `settings, main`; the stale callback overrides settings.
- Confirmation followed by disposal: the root is removed, then main is mounted and the screen-change API is called on the retired instance.

Rendering, DOM and timer delivery are fixtures in this reproduction, not a physical browser interaction or a new Nintendo behavior measurement.

## Correction

The existing quality adapter binds the title callback to a stored timer, a unique ticket and the existing screen generation. An actual new `show()` generation cancels that pending callback; a no-op `show('title')` leaves it intact. The callback rechecks its ticket before clearing any state, so an already-queued old callback cannot cancel a newer title confirmation.

Disposal cancels the timer and rejects subsequent navigation/title input using the existing retirement flag. The native 200ms delay, 350ms entrance-input guard, sounds, wipe midpoint and ordinary navigation remain unchanged. No new runtime module or helper dependency is introduced into extracted fixtures. Native `inkwave-public/` bytes are untouched.

## Evidence and limits

`node --experimental-vm-modules --test patches/local-quality/tests/title-transition-lifetime.test.mjs patches/local-quality/tests/menu-input-ownership.test.mjs`

Final PR944 composition: 13 passed, 0 failed, 0 skipped (8 new contracts and 5 existing input/screen contracts).

The tests retain a legacy callback/retired-navigation counterfactual and cover normal timing, duplicate confirmation, newer navigation, already-queued callbacks, title re-entry, no-op versus forced rebuild, disposal, native wipe invalidation, and 20 independent retired owners. Screen rendering itself is bounded, while state/transition methods and the quality wrapper are real.

Movement-lane independent read-only review found no owner/generation blocker. No full build, broad suite rerun or browser success is claimed by this patch. Existing PR/branch writes and CI tracking stay with the central integrator.
