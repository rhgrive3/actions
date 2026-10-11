# #1184: recover the visible offline start attempt after a loader failure

## Target and evidence

- Issue/ownership: [#1184](https://github.com/rhgrive3/actions/issues/1184), E, submitted for the existing PR #1182.
- Base inspected: PR #1182 local `4c90da98`; this commit follows independent fixes `3099b51e` (#287) and `18699746` (#384).
- Source is the production six-adapter composition of the locked public tree. `inkwave-public/` is unchanged.
- Native owners: `Game._menuApi`, `startMatch`, `_loadBoss`, `quitToMenu`, `Menus._startMatch`, `ui-util.safeCall`; build owner `patches/reliability/start-adapter.mjs`.
- This concerns an offline UI attempt whose Boss import, world build or character warmup rejects after menu hiding / fade-in. It is independent of #1157's abandoned online warmup and #950's title-navigation callback.
- Splatoon 3 comparison: no Nintendo gameplay rule, timing constant or implementation is inferred. A browser loader failure must leave usable navigation; this is an INKWAVE recovery defect, not a measured Switch difference.

## Failure

The menu API formerly returned `startMatch` directly. Native menu `safeCall` catches synchronous exceptions only. An active asynchronous loader error therefore rejected without a UI consumer after the menu was hidden and the opaque fade requested. The existing operation guards correctly prevented stale continuation but deliberately preserved active exception propagation. No owner restored a menu or requested fade-out.

`_loadBoss` also kept its failed import Promise in `_bossMod`, so every later application attempt reused that rejection.

## Implementation

- Let the public core `startMatch` accept an optional explicit operation flow; ordinary core callers reserve their own flow and retain the existing Promise rejection contract. The complete body stays in the original method so final loading-cache startup instrumentation still runs.
- Route the visible menu API through `_startMenuMatch`, which reserves its own explicit flow before calling the existing core method. Only its still-current failure invokes the existing `quitToMenu` recovery.
- Return the completed attract-match identity from `quitToMenu` so a delayed recovery toast cannot attach to a newer operation/screen. Ordinary callers may ignore this return value.
- Clear a failed `_bossMod` cache only if it still belongs to the rejected acquisition. Pending/successful acquisitions remain shared.
- The online startup and Session recovery path are unchanged. No error is converted into a fake successful match, and stale failures cannot cancel a newer startup.

## Validation

`node --experimental-vm-modules --test --test-concurrency=1 --test-timeout=5000 patches/reliability/tests/start.test.mjs`

Result: **139 passed, 0 failed, 0 skipped**, including 10 new cases. New UI cases execute the actual production-composed menu API entry, flow/start/return/attract methods. The established fixture supplies inert rendering resources, fake asset acquisition gates and match/level stand-ins; this is a flow test, not a gameplay or WebGL run.

Covered:

- Current Boss, world and warmup rejection returns to main, exits pointer lock, requests fade-out, creates an undisposed attract match and shows one error; a subsequent attempt succeeds.
- Negative control using the previous exact menu API entry still rejects, leaves the menu null and requests no fade-out after retiring the old attract match.
- Rejection after a newer retry or quit is inert; synchronous re-entry plus throw cannot transfer recovery ownership.
- Five consecutive failures each recover once; core offline/online errors still propagate in the existing tests.
- Actual native `_loadBoss` body coalesces concurrent/successful loads and retries application acquisition after rejection. Its raw-source negative control keeps replaying the rejection.
- The actual final loading-cache AST transform records each UI attempt and records battle-ready only after successful completion. An initial local refactor bypassed these hooks; it was corrected before handoff was finalized.
- Syntax checks and `git diff --check` pass.

Browser download/module-cache behavior, live WebGL shader rejection, fade pixels, physical devices and Switch were not exercised. Clearing the application Promise cannot repair a permanently invalid JavaScript module; the UI still returns to a usable menu after another failed attempt. Browser access remains limited as documented under #1039. Keep the issue open / Refs only pending broader acceptance.
