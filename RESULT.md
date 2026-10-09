# RESULT — INKWAVE issue #884 (lane agy1, main 59041049)

- Issue: https://github.com/rhgrive3/actions/issues/884 — [INKWAVE][Perf] S3 gear wrappers allocate two scratch objects per actor every 60 Hz tick
- Base SHA: `590410494a3e041a403398e191b7d95183912ea2` (origin/main, verified exact match)
- Working Tree: `/mnt/workspace/.dev-state/agent-work/checkouts/inkwave-c-resume-20261009/agy1`
- Branch: `inkwave/c-884-agy1-next-20261009`
- Persistent Evidence: `/mnt/workspace/.dev-state/agent-work/evidence/inkwave-c-resume-20261009/agy1-884-next`
- Public Duty Claim: https://github.com/rhgrive3/actions/issues/884#issuecomment-6075755010
- Atomic Claim File: `/mnt/workspace/inkwave-issue-claims/884/claim.json` (owner=C, lane=agy1, status=completed-covered-no-residual)
- HEAD after work: `f10dcaddc91cbd47c01ba25135c0f54d667a6df6` (branch `inkwave/c-884-agy1-next-20261009`)

## Status: Covered in Main / No Reproducible Residual

Issue #884 is completely covered on current `main` (`590410494a3e041a403398e191b7d95183912ea2`). No reproducible residual exists.

## Exact Source Exclusion & Root Cause Audit

Issue #884 documented two fixed-step allocation hot paths in `patches/splatoon3/runtime/gear.mjs`:

1. **`Actor.prototype._horizontal` scratch object allocation**:
   - *Reported Issue*: Every ordinary 60 Hz tick per actor, `Actor._horizontal` allocated a fresh plain object `const original = { swimSpeed: api.PLAYER.swimSpeed, enemyInkSpeed: api.PLAYER.enemyInkSpeed };` and restored it via `finally { Object.assign(api.PLAYER, original); }`, generating young-generation GC churn (~480 allocations/sec in an 8-actor match).
   - *Resolution on `main`*: Addressed by PR #897 and integrated via commit `16f700896be7ba25bc0a263ebaa7676191792f16` (PR #985 "INKWAVE integration C30–C34") and `b8ec755743b17c1bf19cebeee31ec221b27242ba`. In current `patches/splatoon3/runtime/gear.mjs` (lines 195, 223–225), scalar locals are captured and directly restored in `finally`:
     ```javascript
     const swimSpeed = api.PLAYER.swimSpeed, enemyInkSpeed = api.PLAYER.enemyInkSpeed;
     ...
     try { return horizontal.call(this, dt, squid, enemy); }
     finally {
       api.PLAYER.swimSpeed = swimSpeed;
       api.PLAYER.enemyInkSpeed = enemyInkSpeed;
     }
     ```
   - Zero plain objects are allocated, and `Object.assign` is eliminated.

2. **`WeaponRunner.prototype.update` scratch object allocation**:
   - *Reported Issue*: Allocated `const saved = { inkCost: api.SUB.bomb.inkCost, throwSpeed: api.SUB.bomb.throwSpeed };` every tick, mutated `api.SUB.bomb`, and ran `Object.assign(api.SUB.bomb, saved)` in `finally`.
   - *Resolution on `main`*: Addressed by PR #758 (merged prior to `f31f5da439134fe49bb89018dad5557671a49c67`). In current `patches/splatoon3/runtime/gear.mjs` (lines 254–287), `WeaponRunner.update` no longer mutates `api.SUB.bomb` or allocates any `saved` scratch object. `effectiveSubCost` is computed as a local scalar `(sub.inkCost ?? sub.inkCostFallback) * (m.inkSaverSub ?? 1)` only for the spent-ink check.
   - Zero plain objects are allocated on ordinary/idle simulation ticks.

## Exact Test Exclusion & Regression Verification

- Dedicated regression test `patches/splatoon3/tests/gear-hot-path-allocation.test.mjs` (added in commit `16f700896be7ba25bc0a263ebaa7676191792f16`) explicitly enforces:
  1. Static syntax check: `Actor._horizontal` contains no object literals saving `swimSpeed` or `enemyInkSpeed`, contains direct scalar assignment in `finally`, and does not call `Object.assign`.
  2. Dynamic runtime check: local and remote actor wrappers correctly restore shared `PLAYER.swimSpeed`, `PLAYER.enemyInkSpeed`, `SUB.bomb.inkCost`, and `SUB.bomb.throwSpeed` even when wrapped methods throw exceptions.
- Formally executed focused regression suite via `scripts/run-inkwave-focused-tests.mjs`:
  - Receipt: `/mnt/workspace/.dev-state/agent-work/evidence/inkwave-c-resume-20261009/agy1-884-next/receipt.json`
  - Log: `/mnt/workspace/.dev-state/agent-work/evidence/inkwave-c-resume-20261009/agy1-884-next/focused-tests.log`
  - Tested 9 focused test files:
    1. `patches/splatoon3/tests/gear-hot-path-allocation.test.mjs`
    2. `patches/splatoon3/tests/movement-acceleration.test.mjs`
    3. `patches/splatoon3/tests/clothing-gear.test.mjs`
    4. `patches/splatoon3/tests/conditional-gear.test.mjs`
    5. `patches/splatoon3/tests/flow-effects.test.mjs`
    6. `patches/splatoon3/tests/stealth-respawn-batch.test.mjs`
    7. `patches/splatoon3/tests/sub-gear-isolation.test.mjs`
    8. `patches/splatoon3/tests/weapons-gear-flow.test.mjs`
    9. `patches/splatoon3/tests/movement.test.mjs`
  - Summary: 73 tests, 73 passed, 0 failed, 0 cancelled, 0 skipped, accepted: true.

## Changed Paths

- `RESULT.md` (audit receipt; production code and test files in `main` are already complete and verified).

## Remaining Items

- None for #884. Both allocation sites identified in the issue are fully resolved on `main`.
