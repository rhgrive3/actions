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
The browser's own cleanup timestamps are 05:16:26.692746 and 05:53:02.747404;
runner shutdown is at 05:16:52.5455566 and 05:53:47.8464414. Thus the remaining
intervals are about 25.85 and 45.10 seconds, not an expired 120-second GPU-query
deadline. This candidate removes an unnecessary synchronization hazard, but is
not proof that the original run would never have completed without shutdown.
Machine-readable excerpts and full-log SHA256s accompany this report.
The stack identifies a pending `page.evaluate`, not a browser-side instruction
pointer: there are no entry/exit markers distinguishing evaluate dispatch,
getExtension, VERSION, and renderer-string retrieval. A delayed renderer task
or command queue cannot be distinguished from a blocked getParameter here.

General rationale (not incident proof):
[MDN WebGL best practices](https://github.com/mdn/content/blob/main/files/en-us/web/api/webgl_api/webgl_best_practices/index.md)
describes possible flush/round-trip synchronization in getParameter;
[Emscripten Optimizing WebGL](https://emscripten.org/docs/optimizing/Optimizing-WebGL)
recommends obtaining and caching static GL state during startup/loading.
The inspected [Chromium implementation](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/modules/webgl/webgl_rendering_context_base.cc)
implements isContextLost as a local context-loss-mode comparison, whereas the
identity queries reach GetString. This is supporting source-level rationale,
not a profile of the pinned CI binary or a universal driver guarantee.

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
- Real WebGL helper smoke on system Chromium 154 passed all four cases: healthy,
  lost, lost-and-restored, replaced. This uses a minimal canvas and actual
  WEBGL_lose_context; it is separate from game workload acceptance.
- Candidate commit `6890cd67a8fc6287ab986bfca4595371013fbbd7` passed exact-source
  validation of all 1444 build inputs against the same production artifact.
- Normal production build at exact b57 succeeded, contentHash
  `88f5ee899779516d21d02b8a033bc722a684bdeb515d44b95f2077259afde209`, matching CI.
- CI-pinned Playwright 1.62.1 is present but its Chromium 151 binary is absent.
  Official download returned HTTP 403 `Domain forbidden`; no download bypass.
  A separate diagnostic uses existing system Chromium 154.0.8037.57 through
  the supported PLAYWRIGHT_MODULE hook (only executablePath differs). It is
  not equivalent to CI-pinned browser acceptance. Browser runs are recorded
  separately below once complete.
- At the parent's explicit follow-up request, pushed dedicated candidate branch
  `fix/inkwave-idle-gpu-probe-20261025` and read it back through GitHub connector
  at `7ae14508f746828ef7def6ebb95600ccd8cff1fc` (code commit 6890cd67 plus evidence).
  **Candidate full browser verification is in progress**, on that committed
  verifier in a fresh profile. No PR-head/main update, PR creation, workflow
  dispatch or rerun performed. Parent owns integration. Official CI is required.

Full local evidence: `/workspace/inkwave-idle-evidence/` (original logs, build log,
test output, browser install failure, browser receipts and adapter).

## Full browser baseline

The unmodified b57 verifier passed the full exact-source probe on system
Chromium 154.0.8037.57. All cloud, far-stage, pause, audio, 240-frame results,
GPU identity, desktop retirement and fresh cold-mobile checks completed.
Thus the CI failure is **not reproduced locally**. There is no measured proof
that this candidate fixes the runner shutdown or improves wall time.

Baseline playing/results: 120 frames each; world renders 120/120; actor updates
960/0; projectile, paint and FX work 120/0 each; GPU submissions 15579/12290.
CPU submission times: 76437.9 / 81495.5 ms. Results-state console emission wall
time: 1147.6 ms; renderer wall: 79767.9 ms; observed draw calls: 4964.8 ms.
These numbers are not GPU execution time or device FPS. All 15226 critical
diagnostics were accepted, zero rejected/invalid, no truncation (the intentionally
bounded retained ring contains the final 256 events). Container memory.events
showed zero OOM/OOM-kill; sampled memory.peak was 2840821760 bytes. This does not
rule out memory pressure on the independent GitHub runner.

Reproduce using Playwright 1.62.1 and the supported `PLAYWRIGHT_MODULE` adapter
in the evidence package (which only supplies `/usr/bin/chromium` as executable):

```sh
PLAYWRIGHT_MODULE=/workspace/inkwave-idle-evidence/system-playwright.mjs \
node scripts/check-inkwave-idle-resources.mjs \
  --site /workspace/inkwave-idle-site \
  --evidence-dir /workspace/inkwave-idle-evidence/b57-system \
  --profile-dir /workspace/inkwave-idle-evidence/profile-b57-system --exact-source
```

An attempted shell timing invocation for the candidate initially failed because
`/usr/bin/time` is absent (no verifier execution). It was replaced with Bash's
`time`; this changes no browser or verifier options. The candidate then runs
sequentially after baseline, using a fresh profile and the same artifact.
