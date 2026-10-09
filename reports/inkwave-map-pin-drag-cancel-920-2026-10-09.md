# #920: an out-and-back drag must not commit a map-pin tap

## Preserved fix and residual

[Issue #920](https://github.com/rhgrive3/actions/issues/920) is closed because the
original pointerdown commit has been fixed. Current main and PR #1182 defer
Super Jump until pointerup, preserve pointer-specific cancellation, and reject
an endpoint more than the existing 24px slop from pointerdown.

The remaining problem is that no pointermove is observed. A touch or pen can
move 60px off the pin, return to its starting point, then release and still
commit Super Jump. This violates the issue's explicit acceptance criterion that
dragging outside permitted slop before release must not jump. The failure is
input classification, not a new Nintendo timing or movement-value difference.

## Correction

The existing pin-tap adapter now observes pointermove and removes only that
pointer's pending tap once movement exceeds 24px. Returning within slop does not
resurrect the request. The existing pointerup validation, valid boundary tap,
cancel/lost-capture rules, target validation, mouse/pad path, and gameplay jump
owner remain unchanged. The slop is an existing INKWAVE UI constant, not a
Splatoon 3 physical-device calibration.

## Evidence

Three new native-composition tests fail before the correction and pass after:
- touch out-and-back drag cannot jump;
- pen out-and-back drag cannot jump;
- cancellation is pointer-local, exactly 24px remains legal, and a later fresh
  tap is unaffected.

```sh
node --experimental-vm-modules --test \
  patches/reliability/tests/pin-tap.test.mjs \
  patches/reliability/tests/touch-edges.test.mjs \
  patches/reliability/tests/touch-gyro-owner.test.mjs \
  patches/reliability/tests/input-ownership.test.mjs \
  patches/reliability/tests/touch-map-takeover.test.mjs \
  patches/splatoon3/tests/issue-412-superjump-chain.test.mjs
```

**81 passed, 0 failed, 0 skipped**; diff whitespace check passes. The actual
composed DioramaOverlay executes against synthetic DOM/pointer events, while the
chain regressions use native actors. These are Node logic checks, not hardware
touch/pen, browser capture, or Switch comparison. No full build or CI wait ran.

## Follow-up: map lifetime wins before the next rendered frame

The next composition check found another explicit #920 lifecycle boundary:
`PlayerController.setTurfMap(false)` changes authoritative UI state immediately,
but `DioramaOverlay.on/k` and its pending taps survive until the next presentation
update. Closing, or closing then reopening, between pointerdown and pointerup
therefore still committed an old contact. Replacing the match, viewer or
controller while retaining the old pin had the same stale-intent effect.

The native latch now advances an internal map-lifetime epoch on actual open/close
transitions. A pin tap captures that epoch plus its match, local actor and
controller; pointerup requires all to remain current and the latch not to be
closed. New contacts during the closing animation are not recorded. There is
no gameplay timing, input mapping, wire field or new calibration constant.

Five additional tests execute the actual composed `setTurfMap` method without
an intervening Diorama render: all five fail before and pass after. The preceding
six-suite command now gives **86 passed, 0 failed, 0 skipped**. Additional native
map-toggle/pause/map-gyro/control regressions give **48 passed, 0 failed, 2
skipped**; the two emitted-site checks require a built-site fixture and were not
run. Together: 134 executed passes, two explicitly unrun emitted checks.
