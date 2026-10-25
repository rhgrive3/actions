# Additional CI queue changes, 2026-10-25

Base: PR #1870 head `8e539eac1e5fe4a6412d3e5852d7f5eaa5d0c1da`. Eighteen new workflow queue reports were read against the current checkout. Sixteen rows implemented; two remain conditional below.

## Changes

Thirteen precise trigger rows cover the audited production sources, composed adapters, fixtures and browser driver helpers for ink volumes, Explosher flight glitter, health recovery/rain, defense selection, native lobby CSSOM, crab/gyro, main weapons, relay security, terminal recovery, object presentation, squid visuals, pause GPU and headgear visual QA. Exact input matrices are in `queue-extra-ci-paths-20261025.json`. Pushes without a path restriction retain that unrestricted behavior; PR/push lists only gain the demonstrated inputs. Main-weapons' inner Roller selector now also includes the six audited adapters that can affect Roller/pose behavior, while charger-only sight and sub-kit UI adapters avoid that additional two-build comparison; missing diff history still conservatively runs comparisons.

Paint-hotpath, touch-frame-pacing, composed-CPU and small-tank checkouts omit only `tools/inkwave-modeler/blender/` and `tools/inkwave-modeler/docs/`, preserving every other source/tool/test/report path. These are two queue rows across four workflows (small-tank keeps both browsers). The existing checkout sparse mechanism is used without an explicit `filter` because checkout@v4's explicit filter overrides sparse checkout. The queue's suggested simultaneous filter/sparse settings were therefore not copied blindly.

Six Validate npm-tarball keys now depend on package manifests plus explicit esbuild 0.28.2 / Playwright 1.62.1 / ws 8 versions, Node22 and OS/architecture. YAML-only test/path changes no longer invalidate the tarball cache. Node modules are not shared; original npm install commands and integrity validation remain.

No tests, browser cases, builds, baseline conditions, artifact uploads, required checks, permissions, concurrency or publication steps were removed. No Actions run was dispatched by this workstream. Trigger corrections intentionally add coverage for relevant changes and do not claim fewer future runs.

## Local validation

`node --test scripts/tests/inkwave-extra-ci-queue.test.mjs scripts/tests/inkwave-ci-sparse-checkout.test.mjs scripts/tests/inkwave-added-ci-contracts.test.mjs`: 18 passes, zero failure/skip. The new suite checks all 13 dependency matrices, unrelated-document negative cases, installed-tool/key agreement and Roller inner selection. Existing temporary Git sparse-materialization tests now cover all four added workflows; their exact validated synthetic fixture declaration includes one additional docs PNG, while the authoring-dependency guard and negative import/read controls remain enforced. It uses only Node built-ins plus existing Git; no new npm/Python package dependency. A separate available PyYAML BaseLoader parse verified edited workflow syntax and path coverage. `git diff --check` passed.

No hosted Actions transfer/time/runner-minute measurements were performed. Blob-size estimates from proposals are not presented as actual network or runtime savings. Runtime source/build output is unaffected by workflow filters/cache keys; integration owner validates the combined runtime change separately.

## Conditional proposals retained

- `headgear-qa-six-identical-builds-and-seven-full-checkouts`: unchanged. Build-once artifact migration requires SHA/payload identity, negative artifact tests and all six shard receipts; no change to #1874's separate CI architecture.
- `pages-test-only-patch-changes-redeploy-identical-site`: unchanged. Removing publication triggers without first proving independent coverage of every Pages-only QA step would lose validation. Publication and deployed health remain fail-closed.
