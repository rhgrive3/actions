# Hex parallel worker lanes

This repository is the controller/fallback runtime for three independent measurement lanes targeting `rhgrive3/hex-ida`.

## Lanes

- **perf** — FAST tail latency, profiling, GC/allocation, peak RSS, Hex-vs-IDA measurements.
- **realgames** — OpenTTD, OpenMW, C++ projection and debug/unstripped real-game holdouts.
- **quality** — goto/CFG/unknown semantics, locals/types/globals, TU compilation and pseudocode quality.

Each lane has a dedicated `workflow_dispatch` entrypoint and a separate concurrency namespace, so the three lanes can run in parallel against the same exact target SHA.

## Required inputs

- `target_sha`: full 40-hex commit SHA from `rhgrive3/hex-ida`.
- `command`: bounded lane-specific command to run inside that exact checkout.
- `timeout_minutes`: finite hard watchdog, 1..110 minutes.

The worker itself has a 120-minute outer job limit and the command is wrapped in GNU `timeout` with a 30-second kill-after period.

## Evidence contract

Commands may write structured results to the path in `$HEX_LANE_RESULT`. When omitted, the worker synthesizes a minimal result from the exit status.

Expected JSON shape:

```json
{
  "schema_version": 1,
  "lane": "perf",
  "target_sha": "0123456789abcdef0123456789abcdef01234567",
  "status": "pass",
  "first_failure": null,
  "metrics": {}
}
```

Allowed statuses: `pass`, `fail`, `blocked`, `timed_out`.

Artifacts are deliberately bounded:

- `metadata.json`
- `lane-result.json`
- `run-exit-code.txt`
- last 200 command lines only

The full command log is deleted before artifact upload.

## Exact-target rule

Every run checks out the requested SHA detached and verifies that `HEAD == target_sha`. Reports without the exact target SHA are not acceptance evidence.

## Repository split

Desired permanent workers:

- `rhgrive3/hex-actions-perf`
- `rhgrive3/hex-actions-realgames`
- `rhgrive3/hex-actions-quality`

`bootstrap/worker-repos.json` and `.github/workflows/bootstrap-hex-worker-repos.yml` are prepared to create those repositories if `GH_PAT` is available. Until then, the three dedicated workflows in this repository provide the same isolated lane behavior.
