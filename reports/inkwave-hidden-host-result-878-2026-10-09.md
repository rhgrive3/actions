# #878: deliver the result while the host remains hidden

Base: `903e34e`, following the independent nested-suspension fix. Claim/update:
https://github.com/rhgrive3/actions/issues/878#issuecomment-6084290590

## Reproduction and scope

The existing deadline timer changes the host from `playing` to `finish` and
broadcasts that state. However, the suspended RAF driver never calls
`Match.update` again. The native finish-to-judge transition and `sendResult`
therefore never run. In the real Match/NetSession/NetMatch/in-process-relay
fixture, hiding the host with ten seconds remaining and advancing 120 seconds
left both clients at `finish`, both results null, and no pending host timer.

This is a further unfinished part of the same issue, not another issue count.

## Implementation

- The build adapter exposes the native finish-delay expression through
  `Match.finishDelay()`. The ordinary update path calls that same accessor.
  The existing Turf 2.6-second presentation delay and Boss delay selection are
  unchanged; no Nintendo timing is inferred.
- A hidden authoritative Turf host schedules the remaining finish presentation
  against monotonic wall time. At the existing strict `>` boundary it calls the
  native `_judge`, which sends the already-frozen coverage/winner to guests.
- Only `stateT` advances. Actor, projectile, controller and `G.time` simulation
  are not stepped. A throttled callback can settle both elapsed phases without
  replaying gameplay or waiting a fresh complete presentation delay.
- Finish records are fenced by Match, NetMatch, session, host, state, mode,
  pause and existing result. Timer identity also rejects obsolete callbacks.
  A synchronous finish listener cannot give a replacement match an old deadline.
- Showing settles elapsed hidden presentation time and retires the timer;
  ordinary RAF resumes with the correct remaining wait. Disposal cancels it.

The timer's one-millisecond scheduling margin is solely to cross the existing
strict native `>` comparison without a zero-delay retry loop. It is not a new
gameplay delay or a claimed Nintendo constant.

## Verification

- Initial six result tests: **1 passed / 5 failed** before the fix.
- Final hidden-host set: **26 passed / 0 failed / 0 skipped**, including ten new
  result tests, the ten existing deadline cases and six nested-visibility cases.
- Adjacent native/composed checks: **260 passed / 0 failed / 0 skipped**.
- Quick compatibility, changed-module syntax and `git diff --check` pass.
- Production build `26fe659ae599` succeeds. The same 26 hidden-host cases also
  pass against its emitted/minified Match, NetMatch and platform runtime. The
  harness selects the emitted platform installer with `INKWAVE_CONTROLS_SITE`,
  rather than combining an emitted Match with the raw platform helper.

```sh
node --experimental-vm-modules --test \
  patches/reliability/tests/hidden-host-result-deadline.test.mjs \
  patches/reliability/tests/hidden-host-clock.test.mjs \
  patches/reliability/tests/hidden-host-blocked-visibility.test.mjs

INKWAVE_CONTROLS_SITE=/workspace/shared/hidden-host-878-site \
node --experimental-vm-modules --test \
  patches/reliability/tests/hidden-host-result-deadline.test.mjs \
  patches/reliability/tests/hidden-host-clock.test.mjs \
  patches/reliability/tests/hidden-host-blocked-visibility.test.mjs
```

The 260-case adjacent set combines the 63-case command from
[the earlier nested-suspension report](inkwave-hidden-host-blocked-visibility-878-2026-10-09.md)
with `guest-deadline-input`, `finish935-input`, `turf-finish`,
`menu-title-ownership`, `menu-navigation-timer`, and `start` test files.

Two existing hidden-clock expectations deliberately change: after 20/120 seconds
hidden, and after a deadline callback delayed beyond the native finish wait,
the expected state is now `judge` with a delivered result, rather than an
indefinite `finish`. Pre-deadline and short post-deadline expectations remain.

## Splatoon 3 comparison and unverified acceptance

The comparison remains Splatoon 3 Ver. 11.3.0 online Turf War. This completes the
selected INKWAVE finish-at-deadline policy through native result delivery; it
does not change it to Nintendo's disconnect/no-contest policy or claim those
policies match. Tests are source-level with controlled time and in-process
transport, not live browser/relay, OS sleep, physical controller or Switch
evidence. Browser background timer throttling can delay callback delivery;
once delivered, the elapsed result state is settled without game simulation
catch-up. Frozen coverage semantics are unchanged.

## Review follow-up: synchronous platform retirement

Independent review reproduced a lifecycle re-entry gap: a synchronous `finish`
listener could dispose the platform, after which the old deadline continuation
still scheduled or immediately sent a result. Disposing and recreating the
platform for the same Match left two result timers. The three added regressions
failed before the follow-up (10 passed / 3 failed).

Result advancement, scheduling, timer callbacks and resume continuation now
require the same live platform runtime. Disposal marks the runtime retired
before cleanup, so a synchronous Match state listener cannot retain its timer
ownership. The replacement runtime may continue independently. Test teardown
retains the lifecycle owner without assuming the platform remains installed.

- Hidden-host source suite: **29 passed / 0 failed / 0 skipped**.
- Adjacent suite: **260 passed / 0 failed / 0 skipped**.
- Production build `15a764e97cd3` succeeds; the same **29** hidden-host cases pass
  against the emitted/minified runtime.
- Independent reproduction confirms zero timers/results after disposal and one
  result timer/delivery after replacement. The prior hardware/browser limits
  remain unchanged.
