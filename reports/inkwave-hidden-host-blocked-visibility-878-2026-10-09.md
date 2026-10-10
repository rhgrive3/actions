# #878: visibility inside an existing suspension

Base: PR #1182 aggregate `12be2542`. Locked `inkwave-public/` is unchanged.
Claim: https://github.com/rhgrive3/actions/issues/878#issuecomment-6084093519

## Confirmed residual

The existing hidden deadline and resume correction run from lifecycle
`suspend`/`prepareResume`. A prior WebGL, freeze or pagehide blocker already
leaves the lifecycle suspended. Hiding then does not produce another `suspend`,
so no hidden clock record or deadline is created.

Using actual Match, NetSession, NetMatch and relay modules, a host with ten
seconds remaining was suspended by a separate blocker and then hidden. After
eleven simulated seconds it and the guest were still `playing`, the host still
had ten seconds, and there was no hidden deadline timer. Showing and removing
the blocker did not recover elapsed time. With the reverse order (hide, add
blocker, show), the hidden interval was not settled until that blocker cleared.

## Change

The existing page lifecycle owner now notifies subscribers of document
visibility independently of aggregate suspended-state transitions. The game
captures a missing hidden host deadline, or settles and retires a completed
hidden interval even if another blocker remains. Duplicate visibility events
preserve the original interval. Existing match, session, owner, mode and pause
fences remain the authority for clock mutations.

No extra render/simulation loop, physics catch-up, disconnect policy, global
gameplay time advance, or timing constant is introduced.

## Verification

- Before: new blocked-visibility suite **1 passed / 5 failed**.
- After: new six cases and existing ten hidden-host cases
  **16 passed / 0 failed / 0 skipped**.
- Adjacent lifecycle/input/clock/gyro/settings tests
  **63 passed / 0 failed / 0 skipped**.
- `git diff --check` passes.

New cases cover WebGL/freeze/pagehide-before-hide, repeated/duplicate visibility,
show while another blocker remains, blocker acquisition during hidden,
match/owner replacement, shared host/guest finish, and unchanged physics and
`G.time`. Existing cases retain reversal, early timer delivery, pause/offline/
Boss/attract/guest exclusion, genuine disconnect and disposal.

```sh
node --experimental-vm-modules --test \
  patches/reliability/tests/hidden-host-blocked-visibility.test.mjs \
  patches/reliability/tests/hidden-host-clock.test.mjs

node --experimental-vm-modules --test \
  patches/reliability/tests/platform-composition.test.mjs \
  patches/reliability/tests/platform-pending-input.test.mjs \
  patches/reliability/tests/gamepad-focus.test.mjs \
  patches/reliability/tests/initial-gamepad-focus.test.mjs \
  patches/splatoon3/tests/clock.test.mjs \
  patches/splatoon3/tests/issue-1032-background-guest.test.mjs \
  patches/local-quality/tests/platform-60-cap.test.mjs \
  patches/local-quality/tests/gyro-focus.test.mjs \
  patches/local-quality/tests/gyro-stale.test.mjs \
  patches/splatoon3/tests/pad-sensitivity.test.mjs \
  patches/splatoon3/tests/issue-287-settings-reset.test.mjs
```

## Splatoon 3 comparison and limits

The issue's baseline remains Splatoon 3 Ver. 11.3.0 online Turf War. This restores
the already-selected INKWAVE hidden-host deadline policy; it does not assert
that browser suspension matches Nintendo disconnect/no-contest adjudication.
No Nintendo frame, speed or timeout value is inferred. These are INKWAVE source
and in-process transport tests with controlled time. Real browser background
timer throttling, OS sleep, live relay and physical Switch/device behavior
remain unverified.

The input audit also found existing implementations for #655 (analog-trigger
rebase), #426 (mobile-controls stop/restart), #921 (raw-minus-attitude bias), #187
(fresh exact-zero Android guard), and #287 (S3 setting migration/reset). They
are not counted as five new fixes. Their hardware/calibration limits remain
open; no speculative numeric change was added.
