# Hidden-host relay fixture clock alignment

## Scope and cause

Test-only repair against integration commit `24dfb8adc282b2ed9df0e1089bdae77081bc4b5e`. No game, relay, transport or quota runtime is changed. The terminal recovery work in PR #1693 exposed six existing hidden-host test failures while its unrelated consumers passed.

The hidden-host harness advanced client/platform time through its synthetic `ms`, but the real relay's new admission quotas observed wall-clock `Date.now()`. A diagnostic preserving the original assertion recorded the guest's 162 incoming frames (13,728 bytes) over 8.067 simulated seconds but only 17 milliseconds from first to last send. The unchanged server closed that socket with code 1008, `Relay traffic limit`, at 0.36 remaining frame permits. The guest consequently never received the expected result. Replacing the terminal clock with its official baseline reproduced all six failures with identical assertions.

## Minimal repair

The harness evaluates the unchanged `server/src/index.js` in a separate VM context. Only that context's `Date.now()` reads the already-existing fixture clock. Node's global Date is preserved. The original pair construction, bridge send/receive callbacks and callback ordering remain verbatim. Socket closure retains its code/reason for diagnostics.

This does not bypass admission. The new regression file checks:

- 20 Hz relay traffic over 120 simulated seconds remains connected;
- the 161st same-instant frame is rejected;
- one elapsed second replenishes exactly 80 frame permits;
- byte-burst and maximum-frame rejection still use the real server.

## Evidence

On the fixed integration source plus the separately reviewed terminal package:

- Original related suite: 229/235, six hidden-host failures; the previous idle URL fixture failure was already resolved.
- Clock-aligned fixture: 235/235; 542 distinct consumed files were bound to official Git blobs or explicit candidate hashes, with no mismatches. The server remained blob `797cbf79e3696a3c8a4779ac420c17588066f118`.
- New quota regressions: 4/4. Restoring wall-clock timing causes two quota-clock assertions and the original hidden-result assertion to fail again.
- Workflow/callback contracts: 3/3. The existing Validate workflow triggers on reliability changes and discovers this `.test.mjs` through its required eight-shard suite. No workflow change is needed.

These are source CPU results. This fixture-only change adds no browser scenario; exact published-head CI is still required. It does not claim to resolve a game or network-runtime defect.
