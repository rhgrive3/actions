# Flow render verifier response lifetime and final failure status

## Scope and observed defect

Issue #1370 concerns the verifier, not Flow or GTAO rendering behavior. The
production modules, all 11 native render scenarios, pixel comparisons, immutable
asset hashes and required-module checks are unchanged. This work makes no retail
Splatoon 3, physical iPad or rendering-performance claim.

Two hosted artifacts retain `apiResponse.body: Response has been disposed` in
`errors` while publishing `status: passed`:

- PR #1341, head `612b91cb277a232d213bf11d3f7c02ec67191bef`, run
  [38361693920](https://github.com/rhgrive3/actions/actions/runs/38361693920),
  artifact 11798475040, archive SHA256
  `7ee07fda9fe3af8ba6c4a3cda0e76496665187f01092b22becb25a70055b5361`.
- PR #1365, head `cec302d44fe6df31cd09d9ced5763c9eadca85aa`, run
  [38372190538](https://github.com/rhgrive3/actions/actions/runs/38372190538),
  artifact 11800936376, archive SHA256
  `5dd0c0549776aaddcb7201160cb3950eb4b5aa98cf57fe0b0d0599b508cec1be`.

Both verifier hashes are
`9753ad7def6db300e03290b10bdeb9f46a7dc30155ff2f0d818b26cedaa8c18a`.
The archives and receipts were independently read and their SHA256 values checked.
They establish that errors arrived after the earlier error check and before final
publication; they do not establish the exact disposal instant in those CI runs.

## Reproduction and correction

The original verifier checks `errors` before teardown, closes the response-owning
context without draining its asynchronous route callbacks, then computes final
status only from `failure`. Its receipt reads the later, mutable error array.

A baseline probe executes the actual route callback and finalization code using
Playwright 1.62.1's real APIRequestContext/APIResponse and a loopback HTTP server.
Holding `body()` pending until context disposal reproduces the same disposed-body
error, passed receipt and exit code 0. No browser renderer is mocked as a pass;
this isolates the request lifetime and receipt logic.

The correction:

1. Calls `page.unrouteAll({ behavior: 'wait' })` before closing the context, with a
   10-second drain budget. Timeout/rejection is a recorded failure and does not
   skip the remaining cleanup or receipt path.
2. Preserves route body/hash errors and any failure to abort that route. Browser
   or server cleanup errors are retained too, without replacing an earlier
   rendering failure.
3. Checks the complete observed error list after cleanup before determining final
   status and exit code. The receipt owns a copied error list and records the
   route-drain outcome.

The 10-second bound applies to route draining. Browser and server closure retain
their existing waits; this does not establish a universal teardown deadline.

This follows the documented [route-handler drain contract](https://playwright.dev/docs/api/class-page#page-unroute-all)
and [request-context response lifetime](https://playwright.dev/docs/api/class-apirequestcontext#api-request-context-dispose).
It does not use `ignoreErrors`, suppress disposed responses, retry fetches, relax
pixel thresholds or remove scenarios.

## Regression evidence

The focused suite executes the current verifier's actual route callback and
finalization path. Nine tests cover:

- the old false-green ordering as a negative control with a real APIResponse;
- successful late response hashing/fulfillment before context disposal;
- deliberate early response disposal, retained as failed status and exit 1;
- removing only the drain, which still cannot produce a green receipt;
- a late immutable-byte mismatch plus a secondary abort error;
- a late browser/console error and an immutable final error list;
- a hung drain with a 5ms test budget, failed receipt and observed late rejection;
- failed drain/cleanup while retaining the original pixel failure;
- a pre-launch failure with no page or browser.

The existing active browser shard runs the nine-test suite explicitly after
pinned Playwright installation and immediately before its Flow WebGL gate.
No extra CI jobs or browser scenarios are introduced. Neighbor input-identity
and loading/quality checks pass 21 tests, with 4 optional baseline tests skipped.
All 925 built output files are byte-identical to clean main `ee9fbbab`; contentHash
`656f2be5ffdb259bc89825a8370fe46d66ba1a76d2f76d51146ef542ed6539c8`
and inputHash `0f9fde77025ecca02ac9058364b3fef7ce4485034c01fcdb7638d39f99da9e20`.

Local browser execution is unavailable because Chromium launch is denied at its
socket operation. These passing API/lifecycle tests do not substitute for the
existing hosted Flow/GTAO WebGL gate. Exact-head browser receipt and artifacts are
required before adoption; the historical contradictory receipts stay recorded.
