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
