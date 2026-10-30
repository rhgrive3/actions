# Private Rainmaker Actor paired acceptance — NOT EXECUTED

Product base: `af588fb0f3f74eefa681a3a4f776154999085814`.
Old acceptance test: Git blob `c656d8d0b36fdb1193e402fc11b6aaae2407a4d7` (saved v3).
New acceptance test: Git blob `47e67868068d69686e9211eae36db57d217b276f` (same v3 + strict early-bound).
Product rainmaker-model at this base is byte-identical to saved v3's 10,458-character model. This is not the old main model.

## Scope and execution status
This bundle changes no production file, required workflow, active PR head or model.
The workflow file is a **non-active proposal**. No PR or dispatch has been performed.
The four contract callbacks, including missing/duplicate and failure/skip/cancel/unknown receipt controls, passed in functions V8 with small assert/test adapters. Runner syntax parsed there. Node, YAML parsing, real Actor, subprocess resource accounting, and actual source/emitted runs remain **unexecuted** due current local ENOSPC setup blocker.

## Execution
After independent review and parent authorization, install the proposal as a dispatch-only workflow or run its commands in the existing authorized executor. The QA bundle must be checked out at an exact commit. The product checkout must be pristine at the pinned base above.
Each source/emitted job is capped at **60 minutes** with no timeout extension and no skipped cases. A timeout/failure is incomplete evidence, never an optimization pass.
Each job runs normal old → normal new → extremes new → extremes old in fresh Node children. Both modes require the real source-loaded Actor fixture and ready/active source motion. Emitted mode points that same fixture to the one production build; its complete file digest is verified before every child and after all children.
The source and emitted jobs must **both** finish successfully. There is no claim of required-CI replacement, browser acceptance, main-readback, or gameplay rendering completion.

## Evidence and decision
GNU time records elapsed/user/system CPU and maximum RSS for each full Node child command; parent wall milliseconds are separately recorded. Full TAP/stdout, stderr, raw time output and ordered JSON receipts are retained. Every 3-normal/2-extreme test, every team, 90/6 tick receipt and 608-face SAT receipt is required; zero skipped/cancelled/todo/fail totals are required. Old/new full receipt arrays must match, not just PASS or selected metrics.
Source checkout HEAD/tree, QA commit, QA code SHA256, candidate Git blob identities, emitted byte digest and build content hash are recorded.
This is **one pair per suite**, not repeated ABBA timing within each suite. It can establish a first same-machine comparison but cannot by itself prove stable speedup; no FPS claim follows from this QA optimization. A subsequent repeated experiment requires separate approval/scheduling that preserves all cases and the 60-minute cap.
No historical benchmark or old failed child run is reused as acceptance for this bundle.
