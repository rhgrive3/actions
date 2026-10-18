# INKWAVE title → MAIN intermittent tab termination: focused mitigation

Date: 2026-10-18 JST. Baseline main: b4c17e8f79895dab5324ce96065bcd0e44f2b512.

## User-observed reproduction
The browser sometimes terminates as the title screen opens the PLAY / ONLINE main menu. This is **not** the in-battle PAUSED menu. No device crash dump, Chrome GPU log, or live reproduction was supplied, so an exact browser termination reason cannot be claimed.

## Identified deterministic pressure
The production-composed menu path invokes `Menus._scr_main()` on the title wipe midpoint. That method calls `_preloadStages()`. The original implementation creates `new Image()`, assigns each day/dusk stage art, calls `decode()`, and retains every Image in `this._stageImgs` until Menus disposal.

The public native-stage build enables 5 base source stages plus up to 20 independent definitions; along with 4 built-in stages, this can yield 29 map entries. For N maps the old main transition starts:
- Touch: N × 2 explicit image decode requests and retained Image owners (58 at N=29)
- Desktop: N × 4 requests and retained owners (116 at N=29)
- Each native stage SVG has a declared 800×450 viewport. Fifty independently decoded RGBA8 surfaces would represent about 68.7 MiB of nominal decoded pixels before the original stages, texture residency, memory fragmentation, the 3D renderer, and the first character portrait. Browser caching/deduplication and actual residency vary, so this is an upper-bound illustration, not a recorded measurement.

References:
- [Menus main factory and stage preloader](https://github.com/rhgrive3/actions/blob/b4c17e8f79895dab5324ce96065bcd0e44f2b512/inkwave-public/src/ui/menus.js)
- [Native stage source art generator](https://github.com/rhgrive3/actions/blob/b4c17e8f79895dab5324ce96065bcd0e44f2b512/patches/native-stages/runtime/source-menu.mjs)
- [Native-stage browser build recipe](https://github.com/rhgrive3/actions/blob/b4c17e8f79895dab5324ce96065bcd0e44f2b512/scripts/lib/inkwave-native-stages.mjs)

## Fix
1. Keep `_preloadStages()` as a compatibility no-op. It no longer creates, decodes, or pins offscreen stage artwork when PLAY / ONLINE first appears or when Setup opens.
2. Add native HTML `loading="lazy"` and `decoding="async"` for **both** variants of stage selector ticket art, so normal browser viewport-based loading is used.
3. Keep the selected stage hero and background demand-loaded immediately; retain existing art fallbacks, day/dusk toggles, transition timing, and the 160px player portrait.
4. Apply in the build-time local-quality source adapter; do not alter the frozen `inkwave-public` tree or weapon/physics data.

## Focused verification
`node --experimental-vm-modules --test patches/local-quality/tests/menu-stage-memory.test.mjs`
exercises the actual unmodified vs. source-composed preloader with 29 maps, on touch and desktop, checks 58/116 eager decodes vs. zero, verifies lazy ticket attributes and immediate hero art, and checks fail-closed source anchor drift.

Physical Android/iOS WebGL tests and heap/context-loss traces remain necessary to establish whether this completely resolves all browser terminations. The fix removes a reproducible, avoidable peak-allocation path; it is not a claim that all potential crash causes have been proven absent.
