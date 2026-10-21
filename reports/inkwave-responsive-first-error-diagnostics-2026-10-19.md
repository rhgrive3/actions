# Responsive first-error diagnostics (2026-10-19)

## Observed failure

[PR 1656 responsive job 118025852352](https://github.com/rhgrive3/actions/actions/runs/39242322009/job/118025852352), exact source `5bfba2bbecde6bd73789db79835c6fa83af04f47`, failed in WebKit 26.5 phone-landscape after a complete setup-menu screenshot. The other 13 viewport cases passed. Official artifact `12185250750` is 276110879 bytes, SHA-256 `39108bf8de1a82f4abea079ebbcd19fff9889db96dc389a52ccb550549782e22`.

The case receipt reports a closed target, while the outer receipt reports `Target crashed`. The catch block's additional unguarded evaluation can replace the original error with a secondary diagnostic failure. A direct execution of the original catch reproduces that overwrite. Cleanup could also replace the original error.

The artifact's empty `pageerror` list does not rule out browser-process failure, HTTP errors, or memory pressure. There is no memory/process-stderr/trace evidence proving OOM or an image-decoding cause. This workflow already uses one separate Node/browser process per viewport. It tests production menu DOM with an offline network fixture, not physical-phone performance or gameplay.

## QA-only change

- Preserve the first caught error, last completed screenshot/stage-selection checkpoint, and a bounded 32-event close/crash/disconnect/console-warning/error history.
- Guard extra page evaluations and failure screenshots after a closed/crashed target. Diagnostic and cleanup failures cannot replace a recorded primary error. A cleanup-only failure still fails the run.
- Retain the last 65536 characters of already-captured child Node stderr with length/truncation metadata. Browser-process stderr is included only if actually present in that captured stream.
- Hash the diagnostic helper with the existing runner provenance. Add its unit test to the existing required unit-test command, without another build or job.

All 87 original assertion lines are unchanged. All 14 cases, layout bounds, screenshot conditions, zero retries, 20-minute child timeout and 16-MiB maxBuffer remain intact. No gameplay, runtime, model or ranked boot-diagnostic code changes.

## Validation and limits

```sh
node --test scripts/tests/inkwave-responsive-diagnostics.test.mjs scripts/tests/inkwave-responsive-fixture.test.mjs
```

Local and independent review: 16/16 passed. Coverage includes success; original error plus secondary evaluation/screenshot/guard failures; closed/crashed targets; cleanup precedence; bounded event/stderr receipts; successful-capture checkpoints; existing menu-fixture checks; and required-CI wiring. The original catch fails the first-error-preservation negative control as expected. All six QA file hashes were independently verified.

Base: main `2584f1999a20927c48eb1dac6517b3fcca69c9b9`. The workflow change is one added test filename in the existing explicit list. It composes with PR 1661's separate trigger and emitted-launch steps; neither PR's head is changed by this work.

No local browser was run. This fixes diagnostic evidence loss; it does not establish the cause or resolution of the WebKit crash. All exact-head required CI and the unchanged responsive browser matrix must pass before acceptance. No Splatoon frame value or gameplay behavior changes, so this QA record does not claim a new gameplay-fidelity result.
