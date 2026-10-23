# Current-pair input closure correction

**Review candidate code: `3b85b8aaa656e53db3863e18d469bfbc12193f7d`. Do not adopt the earlier4fa/eeb candidate.** The previous94 passing tests and canonical-input hash equality did not establish closure under new files. Those commits/reports remain protected. This candidate contains the six QA files only, with no production/runtime changes; its scanner delta from4fa is separately protected as `5e37938b863fcc84a1faf4dc682e260e151b19a2`.

## Confirmed bypass, including real build

The old `included()` applied `tests` and `.md` exclusions at every depth under every root; the filesystem reader also skipped every directory named `tests`. The builder's public loop copies/transforms these names, overlay loops exclude only root-level`tests/`, and `prepareLoading()` copies every file below its runtime directory.

In a separate disposable1857 worktree, the old **actual CLI accepted both untracked and tracked additions**, while its inventory remained1461 rows. Seven added inputs were built by the normal minifying production builder:

- Public: `tests/unreviewed.js`, `unreviewed.md`, `nested/tests/deep/unreviewed.mjs`, `nested/unreviewed.md`.
- Overlay: `patches/splatoon3/runtime/tests/unreviewed.mjs`.
- Startup: `patches/loading-cache/runtime/tests/unreviewed.md`, `patches/loading-cache/runtime/unreviewed.md`.

The real emitted artifact count increased **2116 → 2130**; contentHash changed from `f740110d0f27536f46725d2299710bf4e01a08c0e7ddc6efba75dbe27a61c965` to `4139cc843b89cf446bc758a063192503bbf3bd82d02ea6d862be18b753a6d86a`. The canonical input map/hash stayed exactly equal. Its own builder identity excludes these names, so that map cannot serve as closure proof. See `old-bypass.json`, both original successful old receipts/logs, `real-build-bypass.json`, compressed build manifests and the actual emitted text in `emitted-probes.json`. The invalid audit head is a local negative fixture, never an adoption candidate.

## Narrow repair

- Pin the complete public subtree, including tests and Markdown. This deliberately retains a conservative superset of the builder's small explicit public skips already represented in the pinned fixture.
- Pin every file below `patches/loading-cache/runtime/`, matching its unfiltered copy loop.
- Keep ordinary overlay Markdown/root-level QA-directory exclusions; nested`runtime/tests/` is inventoried. A regular file named exactly`tests` is inventoried, because the builder's `tests/` directory-prefix exclusion does not exclude that file.
- Use the same path predicate for immutable Git entries and filesystem rows. Reject Git symlink modes explicitly; filesystem leaf/directory/ancestor links reject before body reads or traversal.

The fixture pin remains `adf375e9e5a53d3f7ea0724d296a4b201c68edbfc6aea44291617a7d9de20ad9`. None of the four legitimate historical epochs had a previously omitted tracked leaf, so their counts remain1458/1458/1461/1460. `fixture-recheck.json` and the updated read-only generator verify this against the actual four Git trees. **Static fixture agreement alone is not the evidence for new-file closure**: the dynamic reader and real CLI probes below exercise new names outside the fixture.

The route is still restricted to the two reviewed owned PRs, exact branch/repository/event/base contracts and actual Git HEADs. No historical assertion/pin was removed, no runtime was changed to fit a fixture, and no generic equal-source route was added. Both captures, physical/paint checks and complete48-image/synthetic comparison gates remain unchanged.

## Verification

- Source suites: **97/97**, no fail/skip. The13-case current-pair suite includes tracked/untracked public/Markdown/nested overlay paths, existing QA exclusions, Markdown-named directories, the file named`tests`, and five tracked/untracked symlink/escape reader cases. Read/traversal counters stay zero for the link targets.
- Real full CLI: each of the seven copied-input additions independently rejects when untracked and tracked. File and directory links under public tests reject in both states. **18/18 negative CLI cases reject and preserve the previous receipt.** A restored clean checkout with a new actual audit HEAD then succeeds, so this is not an always-reject guard.
- Original valid1857/726e,1860/7e and explicitly prospective1857/7e pairs pass with zero source writes. Fresh local cherry-picks of this final six-file code onto both protected PR heads are conflict-free; both composed actual new heads execute their own verifier successfully. See `composition-verification.json`.
- A fresh normal build of the clean QA candidate has1420 canonical inputs/2110 artifacts and exactly matches the existing main7e input/content hashes. All emitted bodies were reread and rehashed; production source rows also match main7e. The separate invalid-addition build is never described as a valid candidate. See `clean-build-verification.json`.

The first CLI-probe harness stopped while preparing its last directory-link case because earlier probes left empty nested directories. Its original run/script/failure is preserved under `initial-probe-fixture-run/`. Cleanup was limited to disposable paths absent from the original tracked tree, then the bounded18-case probe set completed. No failed run was erased or reported as passing.

## Handoff and limits

Apply only the final six-file code commit after independent review; evidence commits are separate. Earlier4fa/eeb remain unchanged and unadopted. Main, PR1857 and PR1860 are not moved by this task. Full hosted before/after capture/comparison at updated PR heads remains unverified pending parent review. This source/build QA work adds no new browser, retail or hardware acceptance claim. Retail CONNECT403 remains denied and physical phone/tablet performance remains unverified; neither was retried or relabelled.
