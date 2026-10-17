# Exact-head CI archive

Captured 2026-10-17T18:22:01.092990+00:00 from read-only GitHub REST queries. No workflows were rerun or cancelled.

| PR | Exact head | Validation run | Commit check conclusions |
|---|---|---|---|
| [#1566](https://github.com/rhgrive3/actions/pull/1566) | `602774b9caf8a5cbb12290096a09d4d17cc756b0` | [SUCCESS](https://github.com/rhgrive3/actions/actions/runs/39053646849) | 29 success, 5 conditional skips |
| [#1568](https://github.com/rhgrive3/actions/pull/1568) | `fb33e4530b1419b5762ac180ef829360035aff4d` | [SUCCESS](https://github.com/rhgrive3/actions/actions/runs/39053444492) | 23 success, 4 conditional skips |

Both exact heads passed all eight `patch_tests (0)` through `patch_tests (7)` shards, `validate_core`, aggregate `validate`, `seven_claims`, `resource_paint_continuation`, and all seven browser families: active, catalog, UI, responsive, network, range, and startup. There are no failing or incomplete check runs. The independent parity and feature checks are included by name and URL in the check-run archives. CodeRabbit's separate status context records success because review was skipped for a draft PR; it is not a completed review.

These results confirm regressions only. Both PRs remain **UNQUALIFIED / do not merge** under the separate performance gate. Skipped `paired-game`, `single-change-comparison`, `live-ray-equivalence`, `render-diagnostic`, and #1566 `compare` checks are not performance evidence. All skips and their exact URLs are retained in `summary.json` and the check-run archives.

Files are grouped by PR number: `check-runs.json` contains every check's name, conclusion, head SHA, and job/log URL; `workflow-runs.json` contains matching exact-head workflow metadata; `validation-jobs.json` contains all validation job and step statuses/timestamps/log URLs; `commit-status.json` contains the separate status contexts. Each REST archive records its endpoint, capture time, and pagination count. `summary.json` is the compact readback.

Browser job timeout is 120 minutes at [.github/workflows/validate-inkwave-update.yml:502 on #1566](https://github.com/rhgrive3/actions/blob/602774b9caf8a5cbb12290096a09d4d17cc756b0/.github/workflows/validate-inkwave-update.yml#L502) and [the same line on #1568](https://github.com/rhgrive3/actions/blob/fb33e4530b1419b5762ac180ef829360035aff4d/.github/workflows/validate-inkwave-update.yml#L502). The responsive jobs passed in 27m41s and 28m07s respectively.

`pr-head-and-requirements.json` records final current-head and GraphQL rollup readback: both exact heads are draft PRs with `SUCCESS` rollups. No current context is marked required by `isRequired(pullRequestNumber)`; the administrative protection endpoint was inaccessible (403), so this archive does not infer administrative protection settings.
