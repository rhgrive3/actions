# INKWAVE CircleCI parallel regression runner

CircleCI runs the **existing complete patch regression suite**, not a shortened or substituted smoke test. The `.circleci/config.yml` pipeline invokes `scripts/check-inkwave-patches.mjs` exactly as the GitHub Actions 8-shard matrix does.

## What is enabled

- 8 independent, index-based shards, using `CIRCLE_NODE_INDEX` as `INKWAVE_TEST_SHARD_INDEX` and `CIRCLE_NODE_TOTAL=8` as the configured count.
- 2 concurrent test processes per shard, as in GitHub Actions.
- Node.js 22.23.3 and the existing pinned esbuild 0.28.2 install.
- An immutable checkout assertion comparing HEAD with `CIRCLE_SHA1`.
- Compressed, per-shard test logs and manifests retained as CircleCI artifacts, including on failure.
- No GitHub Actions validation gates are disabled or bypassed.

## Complete the CircleCI project setup

CircleCI GitHub linking and CircleCI **project/pipeline trigger** setup are distinct.

1. In CircleCI, open the `rhgrive3/actions` project under **Projects**. If it is not present yet, select **Create Project** and choose this repository.
2. In **Project Settings → Project Setup**, use `rhgrive3/actions` as both the **config source** and **checkout source**. Set the config path to `.circleci/config.yml`.
3. For a **GitHub App** pipeline, add a GitHub trigger for push/PR events as desired. For an existing **GitHub OAuth** project, CircleCI normally sets up the default GitHub trigger automatically.
4. Check **Pipelines** for the branch `ci/circleci-parallel-patches-20261025`. Only call the migration successful after all eight shards actually complete.

Current GitHub PR branches do not automatically acquire a CircleCI config merely because this separate PR exists. Merge the config to main after review, then determine how to trigger CircleCI on the existing PR heads without gratuitously resetting their GitHub Actions checks. Existing GitHub-required checks remain authoritative until equivalent CircleCI evidence and branch-protection requirements are configured.

## Resource use and next phase

`large` (Docker Gen1) provides 4 vCPU/8 GB per shard, for up to 8 simultaneous CircleCI executors. CircleCI's published rate is 20 credits/min per large executor; the eight fully active shards therefore consume approximately 160 credits per minute of wall-clock time, plus any other billable resources. Availability depends on the connected CircleCI organization's plan and credit balance. Public open-source Free-plan eligibility is determined by CircleCI, not by this config.

Playwright/WebGL/browser checks and the separate `validate_core` job are **not yet migrated**. They have more environment and artifact dependencies. Keep the GitHub workflow enabled during this initial rollout; expand to browser shards only after verifying their build identity, actual rendering, and failure conditions on CircleCI. Never treat an unrelated SHA's green result as proof that a newer PR head passed.
