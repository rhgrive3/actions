# INKWAVE dual-CI: CircleCI offload rollout

The original GitHub CI stays authoritative until the CircleCI integration is
verified and deliberately enabled. This proposal preserves every native check.

## Allocation

CircleCI starts with a small path-filtering setup workflow. Only relevant source,
patch, test or CI-config changes continue into .circleci/continue.yml.
Documentation-only changes do not allocate 15 heavy workers. A regression test
proves the CircleCI selectors cover every GitHub Validate PR input path.

The continuation runs exactly 8 patch-test shards (parallelism 8),
one immutable production game build, and 7 named browser suites:
browser-active, browser-catalog, browser-ui, browser-responsive,
browser-network, browser-range, browser-startup.

These 15 expensive lanes come from the 8 patch and 7 browser jobs of the
existing 22-job GitHub Validate workflow. The GitHub site build, source and
network core validation, final verification, diagnostic workflows, and other
independent PR checks are retained. This lane count does NOT guarantee exactly
50% of the overall repository runner-minutes, which must be measured.

The browser driver at scripts/ci/run-circleci-browser-lane.mjs reads the
ORIGINAL .github/workflows/validate-inkwave-update.yml and executes its
native suite commands unmodified. New/unknown conditions fail closed.
One produced site is shared across CircleCI browser lanes; source SHA, build
content hash and the original native CI receipt are checked for every suite.

## Activation (after CircleCI login)

1. Once normal GitHub checks pass, merge PR #1874 so the CircleCI config
   exists on main. Other open PR branches need not be rewritten.
2. CircleCI > Projects > rhgrive3/actions > Project Settings > Project Setup:
   ensure GitHub checkout/config source is rhgrive3/actions and the
   config path is .circleci/config.yml. Enable an appropriate push/PR trigger.
   Under Project Settings > Advanced, enable Dynamic Configuration if this
   CircleCI project was created before the feature became enabled by default.
   GitHub authorization alone does not confirm project/pipeline setup.
3. In CircleCI > Pipelines, confirm the detect-inkwave-changes setup
   workflow continues into the named ink-wave-ci-offload workflow
   actually runs 8 patch executors, build-native-site and all seven browser
   jobs for the same intended PR HEAD SHA. Require full green evidence.
4. ONLY AFTER step 3, open rhgrive3/actions GitHub Settings > Secrets and
   variables > Actions > Variables, and create this repository variable:
     Name: INKWAVE_CIRCLECI_OFFLOAD
     Value: enabled
   The switch is intentionally OFF by default.
5. Verify one new test PR. In normal PR mode, GitHub now skips 8 patches
   and 7 browser lanes and instead runs a fail-closed CircleCI check gate.
   That gate requires CircleCI's exact-SHA offload-complete job (which
   depends on all eight patch shards, the shared build, and seven browsers)
   or the trusted full-workflow GitHub Check on the EXACT PR SHA;
   incomplete, stale, failed, or unrelated results cannot pass.
   GitHub still runs the immutable core and its final Validate gate.

Rollback: remove the variable or set a value other than enabled. New PR
runs then restore the complete original GitHub matrix automatically.

Specialized runtime-performance comparison branches deliberately keep their
original GitHub tests, since their baseline mode is not part of the
ordinary PR CircleCI transfer.

## Operational cautions

- Current CircleCI pipeline execution has NOT been independently observed.
- The browser Linux and WebGL environment needs at least one actual green run.
- Do not activate until the CircleCI final DAG receipt / workflow Check appears
  for the tested commit. The initial dynamic-filter setup passing is not proof.
- The path-filtering orb uses version 2 to avoid outdated Python package
  installation issues on current build images.
- The GitHub gate uses at most one verifier job, waiting up to 75 minutes;
  it replaces 15 heavy duplicated GitHub compute lanes while enabled.
- CircleCI Free advertises 30 concurrent jobs, but large workers burn more
  credits than the small-Docker minutes shown in marketing. Eligible public
  OSS may receive 400,000 credits/month, subject to CircleCI qualification.
- Existing GitHub action runs are not cancelled or reset by the config change.
- Other independent INKWAVE workflows remain. Removing them needs evidence
  that their unique tests are covered, not merely similar filenames.

Native-source parity and failure-control unit tests are executed in the
GitHub validate_core job and the CircleCI immutable build job.

Resources:
https://circleci.com/docs/guides/optimize/parallelism-faster-jobs/
https://circleci.com/docs/reference/configuration-reference/
https://circleci.com/docs/guides/plans-pricing/credits/
