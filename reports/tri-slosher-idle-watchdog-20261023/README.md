# PR1855: QA-only idle evaluation watchdog candidate

Base: `4d6166936eaa8058a8b936053992960b510eec88`. Candidate branch: `codex/tri-slosher-idle-watchdog-20261023`. This branch is for review before updating PR1855. All earlier commits, runtime corrections, captures and failure logs remain preserved. No main merge, force push or other PR edit.

## Observed interruption

[Official active browser job120614926508](https://github.com/rhgrive3/actions/actions/runs/40007622297/job/120614926508), source4d616693, reports runner shutdown at **2026-10-23 20:28:02.0262042 UTC**, then `page.evaluate: Target page, context or browser has been closed`, stack at `check-inkwave-idle-resources.mjs:168`, and cancellation. This is an interrupted run, not a Hissen assertion failure or pass. The log does not establish the shutdown cause. The watchdog below is not claimed to fix that unknown cause.

The complete official decoded log is preserved as lossless UTF-8 gzip in [logs/official-job-120614926508.log.gz](logs/official-job-120614926508.log.gz). Its decoded UTF-16 length is239416, UTF-8 bytes239420, SHA256 `2c32c43ce6783acad94f9df48f4f9a6c10d8283ac6fc91490d1e7f9efca69870`. BOM and newlines are preserved. See [hash receipt](official-log-hashes.json) and separate [exact excerpts](official-error-excerpts.txt). Earlier 18:35 interruption logs remain in the existing ci-tail report.

## Existing donor reused without runtime changes

[PR1859](https://github.com/rhgrive3/actions/pull/1859) pinned published donor `2d164d063050c15266febcb6af88109938f26701` was inspected. The three imported files match its official GitHub text blobs byte for byte:

| Path | Official donor blob |
| --- | --- |
| `scripts/check-inkwave-idle-resources.mjs` | `bc5ad497b0b2d3e5f21e792d9c0ced0608b822d9` |
| `scripts/tests/inkwave-idle-evaluate-deadline.test.mjs` | `0dcb6fe498086c81a2c5218347ca7cd8f451274f` |
| `scripts/tests/inkwave-idle-resources-gates.test.mjs` | `d384824f3ac170167db9ff5e3dd0a62ee77e7518` |

The last file only imports the dedicated tests into the existing gate. The workflow already runs that gate, so no workflow edit is needed. The checker carries the donor's final cold cleanup ordering fix: it writes available failure evidence before attempting cold browser close.

Each `page.evaluate` gets a host-side failure deadline of120000ms, the existing operation limit. Timers clear on settlement; the original callback, arguments and receiver are retained. Timeout records keep their original phase and cause, avoid another potentially stalled evaluate/screenshot, and precede cleanup. A successful receipt is written only after cleanup succeeds. This is a failure deadline, not browser cancellation, GPU completion or power evidence. Browser/cleanup or the outer job can still stall or be interrupted; outer supervision remains necessary.

The artifact-tail workflow and strict upload guard from4d remain byte-identical. So do the c68 reference QA and PR1853 nine-edge controls, and the Hissen runtime blob `54f90896181bd28feefbd0bdff2c9347db03265f`. No donor reticle runtime, firing adapter, unrelated special runtime or build inputs were imported. [Scope and identities](reuse-and-scope-proof.json).

## Local verification

Node **v24.19.0**; hosted CI selects Node22, which was not locally replayed.

- [idle/cold](logs/idle-cold.tap.gz): **50/50**, fail0, skip0. Fake clocks cover119999/120000ms, ordinary success/error, late resolve/reject, diagnostic and cleanup failures, actual desktop setup and cold route extraction, and cold evidence-before-close ordering. These are component tests, not browser/GPU acceptance.
- [workflow contracts](logs/workflow.tap.gz): **47/47**, fail0, skip0. Includes the unchanged artifact upload and original job-pin guards.
- [reference QA](logs/reference.tap.gz): **8/8**, fail0, skip0, including the existing nine migrated edge mutation controls within one test.
- [old setup negative](logs/old-setup-negative.tap.gz): **0pass/1fail**, expected exit1. The new helpers load normally while only the checker text read by the actual setup regression is supplied from4d. The old setup schedules no host deadline (`0 !== 1`). No real120-second wait, browser or source mutation is involved. [Replay preload](old-setup-preload.mjs).
- `node --check` and `git diff --check` pass.
- [AST preservation audit](source-preservation.json): all12 evaluate callbacks, six existing functions including the validator, and browser flags are byte-identical to4d. Existing readiness/sleep/diagnostic waits `[180000,200,400,180000,10000]` and screenshot timeout `[15000]` are unchanged. The120000ms default remains the same value. [Audit script](audit-source.cjs), adapted from the donor with base4d and an extra screenshot-timeout comparison.

The existing exact784 production output was reread, not freshly built: all **1420 canonical inputs** and **2110 emitted artifacts** match their manifest hashes; the builder hash also matches. These QA files are outside the canonical inputs. `contentHash=2042ffbbb14645c4f4a4db2188826b7988c4112dcebab1a14915fd2f72e77a07`, `inputHash=578137eac3693d92b6432d17ac9bc4d5e93c6c3a0c943a7a3ed8578625ea09e8`. [Readback script](verify-scope.cjs), [receipt](reuse-and-scope-proof.json). Prior real201 emitted test evidence is preserved in the ci-tail report; it is not counted as a new run here.

## Commands and remaining acceptance

```sh
node --check scripts/check-inkwave-idle-resources.mjs
node --test --test-reporter=tap scripts/tests/inkwave-idle-resources-gates.test.mjs scripts/tests/inkwave-cold-observer.test.mjs
node --test --test-reporter=tap scripts/tests/inkwave-wall-diagnostic-workflow.test.mjs scripts/tests/inkwave-integration-workflow.test.mjs scripts/tests/inkwave-added-ci-contracts.test.mjs scripts/tests/inkwave-projectile-ci-intro.test.mjs
node --test --test-reporter=tap scripts/tests/inkwave-local-references.test.mjs
node --import ./reports/tri-slosher-idle-watchdog-20261023/old-setup-preload.mjs --test --test-reporter=tap --test-name-pattern='actual desktop setup bounds its first evaluate' scripts/tests/inkwave-idle-evaluate-deadline.test.mjs
node --expose-internals reports/tri-slosher-idle-watchdog-20261023/audit-source.cjs
node reports/tri-slosher-idle-watchdog-20261023/verify-scope.cjs /tmp/tri-slosher-main7e-after
git diff --check
```

The negative command must exit1. Stored evidence must not be overwritten when replaying.

PR1855 is still published at4d. This successor needs review before that ref changes. Final-head hosted CI, actual artifact upload and a completed active browser run remain pending; no fresh browser/GPU acceptance is claimed. The Hissen `.5` display calibration remains UNSOURCED and provisional; exact retail resemblance remains unverified. This QA patch adds no Nintendo media and changes no gameplay or presentation behavior.
