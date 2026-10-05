# UI Actor lifetime: #616 / #672 / #685

Baseline main: b4d5c31e33258a0b6f874e42234448e404eec2d4. The latest issue comments and open PRs were checked before claiming these three roots; #697's menu/gyro/sight/rematch work, #701's finish/reflection/Map-look work, and #664/#665/#669's existing HUD/resource work are not reimplemented.

Only build-time quality adaptation changes. Raw inkwave-public, gameplay/input rules, jump eligibility, networking, and other workstreams remain unchanged.

## Corrections

- #616: HUD marker/kill bookkeeping is bound to the current Match identity. Native Match.dispose releases that matching UI state before tearing down Character resources. Departed Actors are released even if the retiring roster has become empty. A delayed old disposal cannot clear a newer HUD owner.
- #685: closing a Diorama clears pin Actor references and selection/arc state. Missing current camera/player clears them too. Native Match.dispose releases pins from its matching owner without requiring another render. Reopening populates the current roster; a removed, retired or cross-match teammate cannot be invoked from a stale pin. Native jump eligibility and the native jump call remain authoritative.
- #672: the persistent Minimap jump FX list stores a scalar Actor correlation token instead of the Actor. A WeakMap owns the Actor-to-token association. Native landing still shortens all matching Actor effects, and menu-paused FX cannot retain the old Actor graph. No additional timer, per-frame expiry owner, or new module is introduced.

Match disposal calls optional UI methods directly; this batch does not add a second match:dispose event producer or copy #536's lifecycle infrastructure.

## Validation

- New complete-target-module source tests: 11/11, including explicit GC.
- Same tests with esbuild minification: 11/11.
- Actual production-build target modules: 11/11, including explicit GC. Test-only AST instrumentation exposes the native Minimap transient list; production has no debug API.
- Full local-quality plus existing idle-resource gates: 100/100 with --expose-gc; no skips.
- Native unchanged baseline reproduces the HUD, Diorama and Minimap strong references.
- Coverage includes 25 disposal/menu cycles, stale disposal/new owner, empty/departed roster, current kill bookkeeping, map close/reopen and online leave, native jump invocation, matching/nonmatching landing markers and a collectable Actor while the Minimap module/FX remain alive.
- Syntax and whitespace checks pass. Production build succeeds: d9fee487c11346e6c0a785a19e59b73dd5c6e27880a4d87135b854f90db8f1f4.

## Existing startup gate failure

The startup-budget checker fails at core preload request budget on both this candidate and a separately built, untouched baseline main. Both contain 146 total preloads: 132 core plus 14 Range; the existing limit is131 core. Candidate build d9fee487c113 and baseline480c04bf6ec0 use the same request list. This batch adds no runtime module or preload and does not raise, skip or weaken that gate. Exact PR CI must report its own outcome; local build success is not a passing startup gate.

The broader gameplay/reliability aggregate is tracked separately from the focused evidence. Physical browser/device heap snapshots, GPU memory/FPS and long-soak were not run here. Node explicit GC establishes the targeted JavaScript reachability property, not freedom from unrelated known Actor retainers or measured process-memory savings. No main merge or issue closure was performed.
