# PR1175 independent source-coverage audit

Audit date: 2026-10-09. Repository: [rhgrive3/actions](https://github.com/rhgrive3/actions).

## Scope and result

This audit independently compared PR1148, PR1169, PR1170 and the stacked PR1171–1174 changes with PR1175, beginning at `20d49d2d807a8d1d595b5278b039f33e005f2281`. PR1168's remaining shared-file reconciliation was handled separately. The audit checked Git blobs, exact common-base three-way composition, conflicting hunks, selected composed-native regressions, ancestry and the PR401 exclusion. It did not treat changed-file counts as proof of runtime correctness.

No missing functional source path or cleanly omitted functional hunk was found in the non-1168 sources. Four real integration/verification gaps were identified: lost source evidence appendices, incompatible room-test fragments, suppressed Super Jump sub staging, and a test's undeclared bare Three.js dependency. Corrections are recorded below. Final combined native/build/browser/CI acceptance remains required; this report is not a full-CI or retail-console parity claim.

The latest source refs were rechecked through GitHub metadata and `git ls-remote` at approximately 03:23 UTC. All eight source heads below and main were unchanged from the initial check. These source PRs remained open at the metadata check.

## Source-head mapping

| Source PR | Verified head | Audited source delta |
| --- | --- | --- |
| [1148](https://github.com/rhgrive3/actions/pull/1148) | `b347211b146568a9b27ba575a6f09f67f6042d52` | 22 paths from common base `4a3cc8118a472eb79f72f333ea54084999286ecf` |
| [1168](https://github.com/rhgrive3/actions/pull/1168) | `eadc3fdf5a063bd492587ac8f7cfb9ba2cd083d9` | 87 paths; shared-file reconciliation and its full acceptance are separately owned |
| [1169](https://github.com/rhgrive3/actions/pull/1169) | `8ce499a4cf47997745a51f486eb291409a001cf8` | 30 paths from common base `69add0203d127b790f009e3502f7110212262066` |
| [1170](https://github.com/rhgrive3/actions/pull/1170) | `2fa7ba3633754ad8ad79fefd24f53004b0e77f5f` | 6 paths from common base `4a3cc8118a472eb79f72f333ea54084999286ecf` |
| [1171](https://github.com/rhgrive3/actions/pull/1171) | `04e4547c053f99ed9db0019c4bc98003d19b108e` | 27 paths from `69add0203d127b790f009e3502f7110212262066` |
| [1172](https://github.com/rhgrive3/actions/pull/1172) | `5e0af85cec522de53b128587a2fd7d2e961cf748` | 23 incremental paths after PR1171 |
| [1173](https://github.com/rhgrive3/actions/pull/1173) | `e20bc772e4257c94401bd83543e9a6454b89b696` | 25 incremental paths after PR1172 |
| [1174](https://github.com/rhgrive3/actions/pull/1174) | `3cab2202274cd3624df590fd69d79c7daa04e255` | 28 incremental paths after PR1173; 85 paths for the complete PR1171–1174 stack against `69add0203` |

PR1174's advertised base was retargeted to PR1175; the actual common base of its head and that integration ancestry remained `69add0203`. The audit therefore checks both its own 28-path increment and the combined 85-path stack. Stack path counts must not be added together as distinct coverage.

PR1175 initially imported trees rather than merging every source head as a parent. Source SHA ancestry alone is consequently not a completeness test. The actual initial integration mapping is:

- PR1171–1174: `b7179419`, `73dd624b`, `8dba5fff`, `3e9e91dd`, `dbe9ece3`, `0ce0dac6`, `caf98bef`
- PR1170: `834fd22d`, `9776f495`
- PR1148: `f90ab1a6`, `53bb4462`, `5d5463cf`, `04d8e70a`
- PR1169: `f7321c94`, `5cc7095a`, `79203182`, `cb157290`
- PR1168's initially imported subset: `fc7db325`, followed by shared CI/build reconciliation in `3b622619`; the later separate reconciliation supersedes this incomplete stage
- Main reconciliation: `20d49d2d`, with main `2195d5244408a9632bfbbb3b106f2cfdf1fa6d77` as a parent

## Hunk-level evidence

At the initial `20d49d2d` snapshot, the changed paths classified as exact source blobs / three-way-contained source changes / shared conflicts were respectively:

- PR1148: 15 / 3 / 4
- PR1169: 22 / 4 / 4
- PR1170: 5 / 0 / 1
- PR1171: 18 / 4 / 5
- PR1172: 16 / 4 / 3
- PR1173: 11 / 10 / 4
- PR1171–1174 combined: 66 / 14 / 5

The conflicts were inspected rather than assumed resolved. The integrated tree retained both Shooter accuracy/movement tracking and PR1170's emitted-shot nearest-footprint cycle; the stronger native-method-scoped room adapters; PR1169's Slam extension and PR1173's separate protection payload; shared Slosher unit/reset fields; exact-phase gait controls; and the expanded visible-rig diagnostics. The Charger-wall test's ground-only change is accompanied by PR1174's separate wall-drop coverage rather than silently retaining the retired wall-paint contract.

Composed-native verification passed all 13 Slam adoption cases, all four protection-adoption cases and all five composed hit-unit packet cases in the independent selection. Shooter accuracy/movement/nearest-paint, pad sensitivity, combat range, gait and workflow contracts also passed. These checks exercise shared composition but do not establish all gameplay or network acceptance.

## Findings and corrections

1. **Source evidence was lost in the main merge.** `20d49d2d` replaced the behavior record with the exact main blob `267e31d61019c845fe463268f242258f59466852`, deleting 344 source-appendix lines from `92fb642e`. PR1169 and PR1171–1174 acceptance limitations were missing even though the code had been imported. The separate reconciliation restored those appendices while retaining the latest main evidence. Their section headings were verified in parent integration `28a3fc3b63c6045e1669486b043541b26ca19860`.

2. **Four imported room-fixture cases did not match the retained adapters.** They supplied method fragments without the native `_applyMe`, `setSettings` or `start` boundaries. Local correction `ca51d8d6ef5bf634f629701552538e63830b1b5a` uses the complete locked native session source and real host-team transform. All six cases pass, executing admission, native roster/broadcast creation, readiness invalidation, unchanged-input retention and malformed/duplicate rejection. Production adapters were unchanged.

3. **PR1170's Super Jump sub staging was functionally suppressed.** The later sub-ready owner cancelled every Super Jump state in both the Actor prepass and runner wrapper. Corrections `8beb21f6da094b684541f82590a5a1441de85b64` and `b398bdcc720de479c8e9dbc0cab0a01abcca8924` admit only the existing humanoid descent window. Midair releases cancel; landing release retains the existing 5F preparation plus independent 1F use-startup; landing-tick squid cancellation stays cancellation. No airborne bomb, duplicate debit or persistent stale hold is permitted. The shared 0.82 progress boundary is explicitly native INKWAVE behavior, not a newly measured Nintendo constant. All 12 final handoff cases pass, including 30/60/120 Hz fixed-clock schedules, short holds, input priority, early release, death/reset/input cancellation and landing ZL cancellation.

   The adjacent 98-case selection initially passed 96 cases. Its two old main-shot tests held ZR+R simultaneously while expecting flight-wide R suppression. Main/windup/ink/special assertions were retained with main-only input, and explicit Shooter/Blaster R-over-ZR controls were added. Both corrected main cases separately passed. This is not represented as a fresh complete 98-case run after the final landing-ZL adjustment.

4. **The Charger field test required an undeclared npm package.** The workflow does not install `three`. The test now imports the repository's pinned vendored Three.js, matching the native collision implementation and other source fixtures. All three existing collision/profile/anchor tests pass; no dependency or collision threshold was changed.

The initial PR1175 description also contained stale claims that PR1083 was still open and latest main had not been reconciled. Publication must update those statements and describe remaining acceptance from the exact final head.

## Main ancestry, exclusion and remaining limits

Fresh remote main is `2195d5244408a9632bfbbb3b106f2cfdf1fa6d77`, which is an ancestor of the initial integration and its audited descendants. PR1083 is therefore already represented through main.

Excluded [PR401](https://github.com/rhgrive3/actions/pull/401) is at `387b87d36b4ed389db2a7e9b00241f3c57719a8b`. Its head is not an integration ancestor. Its 43 changed modeler paths have zero overlap with main-to-integration changes. The locked `inkwave-public/` tree has no integration diff. The path exclusions were rechecked at parent integration `28a3fc3b`.

Partial source acceptance stays partial, including PR1148's provisional stick/inner-angle calibration, PR1169's Roller interior paint-age law, and PR1168's explicitly partial items. Native automated tests do not replace emitted-browser, actual GPU-pixel, mobile-device or Nintendo hardware evidence. Before publication/merge, the exact combined head still needs the canonical suite, built source identity and budget checks, required browser/network jobs, and final CI confirmation.
