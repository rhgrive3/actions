# ScreenFX pending-damage attacker release — #772

## Fixed scope

Primary claim: https://github.com/rhgrive3/actions/issues/772#issuecomment-6008203145 . Public main was `3d8a48d37ea5d6206e4f4185fa4a8229ae1c6977`, tree `b5a419cbb70bc34f76751eed5649c4a06af814c9`, when the root was checked. Local base `470a3fd4100c5c9fc6e118a5fefecdde8e197200` is tree-identical. All 28 then-open PR file diffs and the Issue comments were read; none contained the ScreenFX damage-reset correction. This is one root, separate from the existing HUD/FxHooks/projectile/camera/ShadowCache retainers and composer precision proposals.

## Reproduction and change

The actual native reset zeros `dmgT` and `dmgAcc` but retains `dmgAtk`. A pending hit followed by pause leaves the 60 ms timer frozen; menu transition then zeros that timer, so the ordinary `_sim` release branch never executes. The old attacker remains reachable through the page-lifetime ScreenFX object.

One build-only adapter adds `dmgAtk: null` and `dmgAng: null` to the existing reset assignment. No new runtime module, listener, timer, owner, event, draw path or numerical timing is introduced. The native upstream is unchanged. Reset clears the pointer when it already runs at intro or at the next normal ScreenFX update after leaving the match; this does not claim a new synchronous Match.dispose hook.

The normal 60 ms coalescing path still retains the current attacker until it produces its directional splat. Paused frames still freeze visual time. Menu/intro reset cancels the old burst and allows a later fresh attacker to provide the direction normally.

## Evidence and limits

- Source: 9/9, including the executable baseline defect and isolated forced-GC comparison.
- esbuild minified actual modules: 9/9, including forced GC.
- Main-base local-quality tests and idle-resource gates: 162 total, 159 passed, zero failures, three optional skips. Two were preexisting (Tenacity built target / Actor-lifetime forced GC); the new GC check only runs when Node exposes `gc`, and passed in the focused runs above.
- Cases include real ScreenFX construction/event binding/update/reset/lens state; composed Game pause/quit methods; 30/60/120 Hz paused bursts; menu, intro and results boundaries; thirty repeated reset cycles; fresh left/right attacker direction; and exact old/new live lens-state equality under controlled random input.
- The baseline still retains the attacker after cancelling its timer. With the fix and all unrelated fixture references released, Node forced GC collects the attacker while the ScreenFX instance remains alive. This isolates this one retention path; it is not a full-game mobile heap snapshot, a physical browser/GPU memory measurement or proof that other owners release their graphs.
- Renderer draw calls and menu/attract construction are fixtures. Actor-shaped objects represent the local/attacker identities; the actual ScreenFX module and composed Game pause/quit/operation methods execute. Existing native lens geometry/math executes without GPU rendering.
- Normal gameplay lens parts are compared exactly before and after the change; no new visual design is introduced. Local Chromium's known EPERM restriction is not bypassed.
- Authentic emitted verification on the final fixed PR789 stack: 9/9, including the forced-GC comparison. One combined build was generated; content `b338f03ef6a2b8b2d9156e6b4bbf0d19b3e7d979f6569e5dde8ccb88b4852c93`, 145 preloads.

Movement independently read the two-field reset, timer cancellation, pause/coalescing and GC-retainer fixtures and found no confirmed blocker. No additional root was introduced by review.


## Publication base and current validation

After both other lanes confirmed no additional related completed root, this single-root batch is stacked on fixed PR789 head `42432af2fc246d44327a0450f6d815ea0b1f0ec6`, tree `7fd29bd8713948dd8f2e7e544c254ccffd0c0519` (local equivalent `184f332631c6baa32d47f927dc4d926ee9d94307`). PR789's input/Flow fixes and inherited PR783 UI fixes are base dependencies; no changes to their production bytes or fixture corrections are added here. The difference against this base is five files, with the only emitted behavior change being the two damage-reset fields.

Final-stack source and actual emitted checks are 9/9 each. The complete local-quality group plus idle-resource gates passes 183/186 with zero failures and three described optional skips. CI for this exact published stack remains pending at publication. Neither the prior PR783 image-access block nor an earlier CI run is reused as this root's final CI result.
