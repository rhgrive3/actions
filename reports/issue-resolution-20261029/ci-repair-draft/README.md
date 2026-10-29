# INKWAVE CI repair ledger, 2026-10-29

Target base: `085dc852fbed282204b84b63a47ee56a7d95a7f1`. Draft PR only; no main write, no full CI dispatch.

Review the latest failed main/PR workflows, fix source and CI-contract regressions, preserve required checks, and record exact evidence per failure family.

Do not include #401, stopped MOV-08b, or held isolated Character QA scope.

## Initially observed failed lanes (previous main e67c636b)

- Validate core: scoped workflow contracts
- Patch shards 3/4/5/6
- Browser network neutral combat QA contract
- Browser catalog Wiper native capture
- A+ YAML and adapter recurrence guards
- Previous Pages ranked public verification (Pages artifact itself deployed)

Note: these were observed on the previous main, not yet confirmed failed on the new base. Dedicated Pages publication for the new base already succeeded independently.

## Confirmed focused reproduction

- Draft run 40891956919: CI contracts PASS, Wiper/audio/roller PASS, historical-source group FAIL on one strict walk-owner snapshot; this is already addressed by upstream PR #1914 incorporated via second-parent merge.
- The original main's 2026-10-28 failures cannot be counted as failures on the current head without reproduction. Original Pages had deployment success and post-deploy Ranked boot timeout; the separately released current Pages build passed publication identity checks.

## Newly observed failing CI on stacked draft

- Composed CPU run 40892495401 and swim owner entry run 40892495187 failed before runtime tests: npm's ad-hoc install resolved unavailable rolldown@1.2.16 (HTTP 404). Replace floating npm install with npm ci pinned to package-lock.json. Preserve the full required checks when PR is Ready, skip heavy capture only while Draft.
- Terminal recovery native run 40892495225 and upstream #1914 run 40891219806 reached the actual browser game but failed strict request accounting for aborting in-flight sound assets during intentional WebGL context loss. Preserve request-failure enforcement, observe actual pending audio fetches, and require bounded network quiet before forcing GL loss.

## Acceptance limits

- The source/contract tests can establish syntax, intended ownership, and guard behavior, not real-browser success without new exact-head hosted results.
- Full 8-way Validate, seven-browser matrix, and native device testing are not claimed green; no weakening of original fail-closed acceptance or source identity.
- Do not merge draft automatically. Do not touch main/Pages. #401 excluded. MOV-08b and isolated Character QA hold preserved.
