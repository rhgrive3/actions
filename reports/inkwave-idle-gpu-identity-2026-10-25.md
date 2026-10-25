# Idle GPU identity investigation (2026-10-25)

Base: PR #1869, `b57ccf044c42ffb7016664ee45599942c19e74c4`.
Dedicated branch: `fix/inkwave-idle-gpu-probe-20261025`.

## Evidence and interpretation

GitHub connector reads confirmed the PR head and downloaded both original logs:
- https://github.com/rhgrive3/actions/actions/runs/40156014124/job/121068760847
- https://github.com/rhgrive3/actions/actions/runs/40156014124/job/121084286575

Both logs show sample exit at 240 completed frames and cleanup exit (critical
sequence 15226), followed by failure while awaiting the GPU-identity evaluation
at line 421. Runner shutdown precedes `Target page, context or browser has been
closed`. Neither log establishes an assertion failure or the 120-minute job
deadline. First sample elapsed 355742.7 ms; second 261624.1 ms at cleanup exit.
The results-state renderer wall time in attempt two is 135785.6 ms, of which
9722.3 ms is inside observed draw calls, and console emission is 1072.3 ms.
These are CPU/driver submission observations, not GPU execution measurements.
Buffered browser console messages are printed again during shutdown; their log
prefix timestamp is not their execution timestamp.

Synchronous identity queries after a large rendering workload are a plausible
avoidable synchronization point. Logs alone do not prove a driver deadlock,
memory exhaustion, console backpressure, or the cause of runner shutdown.

## Minimal candidate

Capture the actual desktop renderer's VERSION and renderer string just after
boot/freeze, before audio/cloud/stage/frame workload. After all 240 frames, retain
a running checkpoint then verify the exact same WebGL context, its loss-event
history and current `isContextLost()` status without querying driver identity
again. A lost-and-restored or replaced context fails. Listener cleanup is explicit.
The final existing WebGL 2.0 / nonempty renderer acceptance gate remains.

No production runtime, workload, frame count, render settings, draw order,
diagnostic stream, acceptance thresholds, timeouts or exact-source checks change.
The existing base already has a 480000-ms results-work deadline; this candidate
does not extend it. No gameplay behavior changes, so the Splatoon 3 behavioral
comparison ledger is unaffected. No model editing/comparison or Discord work.

## Validation and remaining work

- Repository `AGENTS.md` read; neither the tracked repository nor its exposed
  parent `.agents` directory supplies additional skills or AGENTS files.
- Node 24.19.0: `node --test scripts/tests/inkwave-idle-resources-gates.test.mjs`:
  163 passed, zero failures/skips (155 existing + 8 new tests).
- New tests simulate identity queries that would fail after draws are queued,
  cover masked/unmasked renderer paths, loss without a dispatched event,
  loss-and-restoration, context replacement, missing/consumed probe and ordering.
  Existing tests compare all 240 calls/order/dt/state and counters against an
  independently hashed baseline and exercise assertion/deadline negative controls.
- Normal production build at exact b57 succeeded, contentHash
  `88f5ee899779516d21d02b8a033bc722a684bdeb515d44b95f2077259afde209`, matching CI.
- CI-pinned Playwright 1.62.1 is present but its Chromium 151 binary is absent.
  Official download returned HTTP 403 `Domain forbidden`; no download bypass.
  A separate diagnostic uses existing system Chromium 154.0.8037.57 through
  the supported PLAYWRIGHT_MODULE hook (only executablePath differs). It is
  not equivalent to CI-pinned browser acceptance. Browser runs are recorded
  separately below once complete.
- No remote branch, PR-head/main update, workflow dispatch or rerun performed.
  Parent owns publication/integration. Official final-head CI remains required.

Full local evidence: `/workspace/inkwave-idle-evidence/` (original logs, build log,
test output, browser install failure, browser receipts and adapter).
