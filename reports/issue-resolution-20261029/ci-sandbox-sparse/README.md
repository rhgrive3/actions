# CI sandbox and sparse-audit repair

The composed CPU workflow failed before recording browser frames because Ubuntu's Chromium sandbox launch had no usable user namespace. A+ independently failed because sparse checkout omitted JavaScript required by the unchanged global Git metadata audit. These are two separate causes.

Code commit `0c486d2e6296a723bdbe305c5d24f61e1bc5b438` pins the composed CPU job and the active/catalog browser lanes to the existing supported Ubuntu22.04 runner. Chromium remains sandboxed; all30 CPU frames, seven browser families, eight source shards, original assertions and final Validate remain. The other five browser lanes and CPU-only jobs retain their runners.

A+, build_site and validate_core now materialize tracked JS/MJS/CJS files required by the global audit, while large authoring binaries remain excluded. The regression derives the complete tracked JavaScript inventory at execution time, exercises each of the three actual sparse selections in a synthetic Git repository, and demonstrates that the former selection omits required code. The global AST inventory,18 literal-call checks,16 actual >1MiB caller evaluations, late tamper/missing-input controls and capture limits are unchanged.

Five code files changed:

- `.github/workflows/ci-quality-gate.yml`
- `.github/workflows/inkwave-composed-cpu.yml`
- `.github/workflows/validate-inkwave-update.yml`
- `scripts/tests/inkwave-ci-sparse-checkout.test.mjs`
- `scripts/tests/inkwave-sandbox-runner-route.test.mjs`

Node22.23.4: **111/111 pass**, no fail/skip/cancellation, across the ten exact contract modules listed in [summary.json](summary.json). Ruby YAML integrity: **81 workflows**, no duplicate keys. [Full contract TAP](contracts-node22.tap.gz), [YAML output](yaml-integrity.txt), [bounded hosted failure excerpts](hosted-failure-excerpts.log.gz), and their byte counts/SHA-256 are retained. The local initial sparse setup failure is separately preserved in [setup-incomplete-node22.tap.gz](setup-incomplete-node22.tap.gz); it does not count as a successful gate. It lacked only committed apt helper/lockfile dependencies, which were materialized before the final run.

Hosted evidence:

- [#1909 composed CPU, run40819723966/job123269103894](https://github.com/rhgrive3/actions/actions/runs/40819723966/job/123269103894): `Chromium sandboxing failed!`, `No usable sandbox!`, SIGTRAP at `launchSandboxBrowser`; source/emitted parity and component benchmark had passed.
- [#1908 A+, run40819709783/job123269060674](https://github.com/rhgrive3/actions/actions/runs/40819709783/job/123269060674): missing `reports/brush-downhill-contact-20261027/audit-build.mjs` and `tools/swim-entry-qa/reference.mjs`.
- [#1909 A+, run40819723766/job123269103303](https://github.com/rhgrive3/actions/actions/runs/40819723766/job/123269103303): independently confirmed identical sparse omissions.

The corrected head still requires hosted CI. No production build input changed. This receipt does not resolve historical unrelated WebKit crashes, runner shutdowns or native-menu timeouts. #401, the PR1907 MOV-08b hold and isolated Character QA scope remain preserved; no manual rerun/dispatch or main merge was performed.
