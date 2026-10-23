# Projectile capture routing repair — protected PR heads unchanged

The failure is a QA route mismatch, not a runtime footprint change. PR1857 run39979905986/job120518917745 and PR1860 run39988920467/job120544061038 both fell through to the old Roller/paint replay command without declared source commits or an explicit source epoch. The historical manifest requires footprint blob `8ddbf0c56af50c68a645701c94a11fa81e6a2666`; **both the actual base and candidate already contain the same modern blob `cdcc9e94cfe5b754a0b1f99fbd204b28ff24d91c`**. GitHub file readback confirms it. Birth and pool planners propose zero changes; `planMainInkBaseline` then rejects the footprint before any write. The modern runtime must not be reverted to satisfy the old oracle.

## Actual failed source pairs

| PR | Event | Actual event base | Candidate | Result |
|---|---|---|---|---|
|1857|pull_request|`726e338ac256ba9609086ce65e25a68ddd99df85`|`d7fbb583de6a0bfbd7aa2b60bf77b2f631d24d7c`|before fails; hosted after120518917828 succeeds; comparison skipped because before failed|
|1860|pull_request|`7e027ac2ff7eea31c04155e0ee1e0d3e5604ed51`|`d278a495a90ff0b6067d3dd26aa4d9ce40af53d4`|before fails; hosted after120544061105 was still running when diagnosed|

The original downloaded job log bodies are preserved unchanged under `originals/`; connector-body equality and SHA256/byte counts are recorded. Both failures were reproduced locally using the original command and separate protected actual Git worktrees. Neither reproduction wrote a receipt or source. See `diagnosis.json`, `official-diagnosis.json` and `*-legacy-reproduction.log`.

## Minimal transferable repair

Final code commit: `4fa8848e3c1437522b1d85c882115b70133abeb8`, based on official main7e. It changes exactly six QA files: the projectile workflow, a standalone verifier, its helper and compressed source-inventory fixture, its tests, and the existing workflow-selector test evaluator. There is **no production/runtime/build-composition change**, and the historical planners, pin assertions and fixtures are untouched.

The new before-source admission is restricted to PR1857/1860, their exact owned branches, same repository and main target. It requires the event's actual immutable base and head to match the real Git worktree HEADs. The original base is never silently replaced with newer main. PR1857 supports the observed726e event base and the separately verified prospective7e base; PR1860 supports7e only. Unreviewed bases, branches, forks, events, PRs and source leaves reject.

The closed fixture pins complete production supersets at726e/7e (1458 leaves),1857 (1461) and1860 (1460), including file modes, Git blobs, SHA256 and the builder/helpers. It covers every canonical build input plus unused production leaves. Actual tree entries and filesystem bytes are checked twice, with no symlinks or untracked extra production files. New QA-only actual heads may retain the pinned production epoch; the receipt distinguishes actual candidate commit from that source epoch. This is not a generic equal-source permission.

Only successful full admission and negative controls emit the workflow output that replaces the obsolete Roller/paint/pose replay. A rejected admission stops the job without fallback. Both native captures, desktop/mobile workloads, complete48-image comparison, physical/paint assertions and synthetic negative gates remain unchanged. Receipts cannot overwrite production, verifier, workflow, fixture, event or Git metadata inputs.

Production differences are explicit receipt data. PR1857 against the actual726e event base retains the independent menu delta plus the four approved firing paths; against7e only those four firing paths differ. PR1860 retains its five reviewed transport/spawn/composition leaves. Source admission does not claim that these production pairs are wholly identical, or establish gameplay/image equivalence.

## Verification and preserved failures

- Final source suites: **94/94**, zero failure/skip; final standalone CLI/receipt suite10/10 after the driver correction. This includes the existing historical source, pose, birth, immutable dispatch and production-epoch rejection tests.
- All three admitted actual-checkout preparations pass: observed1857/726e,1860/7e and explicitly prospective1857/7e. `changes` and `writtenPaths` are empty. All-leaf rejection controls count2925/2924/2925 respectively.
- Six real CLI negatives in a separate disposable1857 worktree reject: dirty paint source, dirty native birth source, missing cosmetic module, unknown extra module, source symlink and declared-head mismatch. Every prior receipt survives. The scratch source was restored and all protected worktrees remain clean.
- The first wider regression run found a test-harness limitation: its bounded workflow-expression evaluator lacked `steps`. The original64-pass/1-fail log remains `legacy-admission-tests.log`. The narrow evaluator extension and success/absent/false-output selector regression resolve it; no assertion or source pin was removed.
- A later real composed-head positive caught a driver regression introduced after the first93-case run: cleanup removed the `route` binding still used by negative controls. First candidate `a95c6168a9f45cd888ee9a2ee1f349dad8ff0cdc`, local audit/composition refs and original failure/event remain protected; its two changed bodies are also copied under `originals/` and all six blob identities are in `intermediate-preservation.json`; fix `7f8fa715e8872700ca139a6490992a483994ecee` restores it and adds a positive CLI orchestration test. Final clean code commit4fa includes both changes. This test is explicitly stubbed driver coverage; actual complete-checkout positive receipts are independent. No failing first candidate is offered for adoption.
- Fresh regular minified726e build succeeds (1420 inputs/2110 artifacts). Fresh QA-candidate build succeeds and has exactly the same input/content hashes as the existing main7e build: contentHash `ac27ae5f27169f2267a85d4bed904677d26f5e0aab10910c7181e4459f453f30`. Every canonical source input and emitted body is rehashed; all source hashes are covered by the closed fixture. The existing exact1857 build is separately rehashed, not presented as a new browser run. See `build-verification.json`.

Only the six-file code commit is needed on the two reviewed PRs; report commits are independent evidence. Local clean application and real new-head admission receipts are recorded in `composition-verification.json`. Other PRs receive no admission from this repair and require their own reviewed source pair. No main/PR1857/PR1860 reference is moved here.

## Remaining gates

The repaired workflow has not yet run on hosted CI at an updated PR head; parent review precedes that update. Full before/after capture and comparison therefore remain unverified for this repair. Existing exact1857 after success is not substituted for a complete comparison. No browser performance or retail acceptance claim is added. The previous retail-reference CONNECT403 denial and unverified phone/tablet hardware performance remain unchanged; no denied source was retried.
