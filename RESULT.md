# RESULT — INKWAVE issue #884 (lane cl2, reboot5)

- Issue: https://github.com/rhgrive3/actions/issues/884 — [INKWAVE][Perf] S3 gear wrappers allocate two scratch objects per actor every 60 Hz tick
- Base SHA: `5d0be6b7fdebfd07e696e75497aaa97aa5ff5648` (branch start, verified `rev-parse HEAD`)
- Result commit: `856c31968bba2d690fe67ea895f79ad943b83efc` (docs receipt, pushed nonforce to
  `origin/inkwave/c-884-cl2-reboot5-20261009`; final branch head after this docs edit is recorded
  in `claim.json` `completed_sha` and the issue comment below)
- Result comment: https://github.com/rhgrive3/actions/issues/884#issuecomment-6079493860
- Working Tree: `/mnt/workspace/.dev-state/agent-work/checkouts/inkwave-c-resume-20261009/cl2-884-reboot5`
- Branch: `inkwave/c-884-cl2-reboot5-20261009`
- Persistent Evidence: `/mnt/workspace/.dev-state/agent-work/evidence/inkwave-c-resume-20261009/cl2-884-reboot5`
- C claim: `/mnt/workspace/inkwave-issue-claims/884/claim.json` (owner=C, lane=cl2, status=REBOOT5_ASSIGNED; resume comment https://github.com/rhgrive3/actions/issues/884#issuecomment-6079207233 retained)
- Open/draft diffs checked: `pr-1180-diff-reboot5.patch`, `pr-1181-diff-reboot5.patch`, `pr-1182-diff-reboot5.patch`, `pr-401-diff-reboot5.patch`

## Status: Already solved on current main — no source change, no duplicate code

Both per-tick scratch allocations from the issue are absent at this base:

1. `Actor.prototype._horizontal` (`patches/splatoon3/runtime/gear.mjs:191-226`, scalar save at
   line 195, `finally` restore at 221-225): saves
   `const swimSpeed = api.PLAYER.swimSpeed, enemyInkSpeed = api.PLAYER.enemyInkSpeed;`
   and restores both scalars directly in `finally`. No object literal, no `Object.assign`.
2. `WeaponRunner.prototype.update` (`patches/splatoon3/runtime/gear.mjs:255-287`, scalar at
   line 263): computes `effectiveSubCost` as a local scalar and never mutates `api.SUB.bomb`;
   no `saved` object, no `Object.assign` restore.

`git log 59041049..5d0be6b7 -- patches/splatoon3/runtime/gear.mjs
patches/splatoon3/tests/gear-hot-path-allocation.test.mjs` is empty, so the prior lane's
verified state (main `59041049`, receipt `agy1-884-next/receipt.json`, 73/73) carries over
unchanged to this base. None of the four open/draft diffs touches these two sites
(pr-1182 only adds a `savedLaunching` boolean in `kit-subs.mjs::throwBomb`, a per-throw —
not per-tick — path, out of scope).

## Changed Paths

- `RESULT.md` (this audit receipt)
- `reports/inkwave-splatoon3-behavior-2026-10-02.md` (audit note, no gameplay behavior change)

No production source or test files changed: duplicating the fix would only churn main.

## Tests (this lane, base 5d0be6b7, `node --experimental-vm-modules --test`)

- `patches/splatoon3/tests/gear-hot-path-allocation.test.mjs` re-run fresh in this lane: 2/2 pass
  (static no-scratch-object assertion + exception-safe restore for local and remote actors).
- Fresh focused 5-file re-run this lane
  (`gear-hot-path-allocation` + `clothing-gear` + `conditional-gear` + `weapons-gear-flow`
  + `movement`, log `evidence/.../cl2-884-reboot5/focused-gear5-rerun.log`):
  **43/43 pass, 0 fail, 0 skipped/cancelled/todo** (33.9 s). Covers the acceptance items
  for run/swim speed, enemy-ink movement, gear ability application and exception-safe restore.
- Full 9-file focused set completed by this lane before the reboot kill
  (`evidence/.../cl2-884-reboot5/focused-tests-cl2.log`): **73/73 pass, 0 fail, 0 skipped**
  (170.1 s). Includes the allocation suite plus deterministic 30/60/120 Hz, network
  (NetMatch snapshot/RP), Kit/sub-cost, stealth-wake and weapon-flow tests — i.e. the
  issue's "existing movement, weapons, gear, deterministic 30/60/120 Hz and network tests
  remain green" criterion.
- Prior lane's receipts carry over unchanged (same source for these paths since verified
  main `59041049`, receipt `agy1-884-next/receipt.json`, 73/73); `git log
  59041049..5d0be6b7 -- patches/splatoon3/runtime/gear.mjs
  patches/splatoon3/tests/gear-hot-path-allocation.test.mjs` is empty.

## Remaining work

- None for #884. No reproducible residual: both allocation sites are scalar-only with
  exception-safe restore, guarded by `gear-hot-path-allocation.test.mjs`.
- Honesty labels: allocation absence is verified by static source assertion + Node logic tests
  only. No browser heap/GC profile, no mobile frame-time run, no Switch capture was performed;
  no S3 numeric calibration applies (perf-only, no Leanny/splat3 gameplay numbers involved).
