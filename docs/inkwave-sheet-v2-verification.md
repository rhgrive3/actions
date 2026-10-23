# Exact sheet-birth successor verification

This verifier admits only main `7e027ac2ff7eea31c04155e0ee1e0d3e5604ed51`
and candidate `c55cdcb4dc607e5fe26fbf703001ba4c94083402`. It is a separate
checkout based on main7e. The candidate is unchanged; it does not contain this
verifier. Historical four-leaf and frozen-v1 admission remain unchanged.
The complete old/new identities, twenty production rows, nineteen unchanged
rows, build pins and new test row are in `inkwave-sheet-v2-pin-delta.json`.

The immutable inventory is SHA256
`477c44922eef210612f9502649336d8b33a95d6cc5940a54aa07112667a77ac9`.
It fences every committed repository leaf (base 6254, candidate 7246), modes,
Git blobs, SHA256, complete index and actual HEAD/tree, then the physical
materialization. No tests-named path, extension, Markdown or gitignore exception
exists. The only literal development-output exclusions remain `.git`,
`node_modules`, `_site`, `.ci-scratch`, `.browser-evidence`,
`.browser-profile-onboarding`, `tools/backup/__pycache__`, and
`tools/backup/tests/__pycache__`. All emitted files and the manifest are checked;
no development exclusion applies to the site. The Git wrapper strips inherited
`GIT_*` redirection/config variables. Five external builder environment inputs
remain forbidden. Symlinks reject physically and inventory modes are regular
100644/100755; parsing a 120000 tree row does not admit its mode.

All thirteen CLI options are mandatory. An external verifier SHA is required;
the verifier checks its actual HEAD, seven execution input blobs, physical
files/parents and stage-zero index against that SHA before and after validation.
There is no internally embedded own-commit SHA. Receipt writers use
`O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW`, mode 0600. An existing successful receipt
or a competing writer is preserved.

## Local invocation

Create three disjoint clean checkouts: this verifier at the externally reviewed
`$VERIFIER_SHA`, base at main7e, candidate at c55. Output parents must already
exist and both output directories must be new and outside all three checkouts.

```sh
npm ci --ignore-scripts --prefix "$VERIFIER/tools/inkwave-sheet-v2"
node "$VERIFIER/scripts/run-inkwave-sheet-v2-verification.mjs" \
  --baseline "$BASE" --candidate "$CANDIDATE" \
  --site "$NEW_SITE" --evidence "$NEW_EVIDENCE" \
  --verifier-sha "$VERIFIER_SHA" \
  --tools "$VERIFIER/tools/inkwave-sheet-v2/node_modules"
```

Install Playwright Chromium in the environment beforehand, or set CHROMIUM_PATH
to an installed compatible Chromium. This runs the actual candidate builder,
53 source plus 53 emitted tests, startup budget, original red pool browser
cases, and ten nonzero-barrier Room cases using two full Games and real local
WebSockets/Room Worker. It checks exact response body hashes. The original
browser harnesses are copied to evidence with only documented fixed build pins,
absolute helper imports, and one additional Shapes body observer changed.
No candidate or verifier source is edited. Two local identity receipts bracket
acceptance. Local receipts explicitly do not authenticate hosted provenance.

The source closure and preserved normal build must also be available for the
actual CLI negative suite (the verifier Git database needs the fixed base/head
objects). Use a new report filename; the suite saves successful/racing receipts
before removing only its disposable worktrees/site:

```sh
SHEET_V2_TEST_SITE="$NEW_SITE" SHEET_V2_TEST_REPORT="$NEW_REPORT" \
  node --test --test-concurrency=1 \
  "$VERIFIER/scripts/tests/inkwave-sheet-v2-epoch-cli.test.mjs"
```

## Hosted controller, prepared separately

The controller commit is created after this verifier commit and pins its literal
SHA. A push workflow on the dedicated controller branch can be registered
without first merging it into main. A workflow_dispatch-only bootstrap would
require the workflow on the default branch. The controller checks out the
candidate by its published branch and the verifier by literal SHA, then rejects
any candidate HEAD other than c55, even a later QA commit with the same tree.

After review, publish exactly these three refs in order: candidate branch
`inkwave/integration-sheet-birth-v2-20261023` at c55; an independently fetchable
verifier ref at the reviewed verifier SHA; controller branch
`inkwave/sheet-v2-verification-controller-20261023` at the reviewed controller
commit. This document authorizes no publication. No source commit depends on
the controller hash, and no verifier commit pins its own hash.

The controller reads exact `heads/main` and candidate refs through the GitHub
API before and after execution, binds both observations to GITHUB_RUN_ID,
GITHUB_SHA and the real push event, then runs the final identity CLI in
`controller-push` mode. Main must still be main7e and candidate must still be
c55. The final receipt records the verifier commit and controller commit.
An API observation/event fixture only tests field validation locally; hosted
provenance remains unverified until that real workflow runs.

The default workflow status belongs to the controller. A separate Checks API
check run explicitly targets `head_sha: c55...`; success requires the final
receipt and combined acceptance, not independent PR checks. The prepared
controller uses only read contents and write checks permissions, passes no
token to candidate processes, disables checkout credential persistence, and
uploads evidence with unique run/attempt names. It closes the candidate check
as failure/cancelled if execution fails. Existing PR/main refs and other runs
are untouched. Remaining mandatory hosted CI/WebKit and independent review are
separate gates; local identity success is not merge approval.

References: GitHub's [push workflow event](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#push),
[workflow_dispatch registration](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch),
[exact reference API](https://docs.github.com/en/rest/git/refs#get-a-reference), and
[check runs with head_sha](https://docs.github.com/en/rest/checks/runs#create-a-check-run).
