# Isolated QA diagnostics — execution pending

This QA-only candidate is based on main `5b722cba888cb86a7a21f29596bd54eaf16b01fd`. It changes no product code and does not replace any required CI, release or browser gate.

## Input separation
- Rainmaker Actor comparison product: `af588fb0f3f74eefa681a3a4f776154999085814`.
- Native-shot counter product: `7d5446fafc42cf0a58bbaddc220884c5f3dceff1`.
- QA code: the PR's exact head SHA, checked out separately from product code.
- Actor old test: `c656d8d0b36fdb1193e402fc11b6aaae2407a4d7`; new: `47e67868068d69686e9211eae36db57d217b276f`. Only the strict `d > union` early bound differs.
- Original private work remains preserved at `wip/rainmaker-actor-ab-20261030` commit `7b5e440bc9750a59046592d6d44ecc86b224cb6a` and earlier v3/early-bound save branches.

## Workflow
The registered swim-film workflow's existing triggers, permissions, concurrency and logic job are preserved. Its paths filter adds only the two dedicated QA directories. Added diagnostic jobs only run for the same-repository branch `qa/rainmaker-native-shot-diagnostics-20261030`, on pull_request or explicit workflow_dispatch. Credentials are not persisted in the added checkouts.
The two dedicated QA path additions trigger reruns after changes to the QA bundle. Every result must record the exact PR head. Do not reuse another head's result or count a skipped job as acceptance. These fixed older product inputs isolate the experiment and are not evidence of performance on newer main.

Actor source and emitted jobs each retain a 60-minute cap, running all normal old → new and extremes new → old cases, with all ticks, teams, 608-face SAT checks and complete ordered JSON receipt comparison. GNU time records wall/user/system CPU per full child command. Both variants use the same product checkout and, for emitted, the same built bytes verified by complete directory digest. Single pairs are first measurements, not proof of stable speedup or gameplay FPS.
The native-shot job retains a 20-minute cap. It runs the complete source/emitted observer-on/off pair, checks product/build identities and input hashes, and writes counters and behavior-parity receipts. Synthetic fixtures and observer overhead are not device, native-map or FPS measurements.
Timeouts, cancelled runs, missing receipts, or failed assertions are incomplete/failing evidence, not passes. No cases or source/emitted paths are waived.

## Verification status before publication
Actor contract callbacks and negative controls passed functions V8 adapters and independent review. This is not Node, actual Actor, browser or YAML execution. Official Node and actual source/emitted work is the purpose of this Draft. No historical failed or partial actor benchmark is used as evidence for this candidate. Current runtime-counter peer status must be recorded in the PR before publication.
