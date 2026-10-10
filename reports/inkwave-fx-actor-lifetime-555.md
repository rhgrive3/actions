# FxHooks actor cache lifetime (#555)

The boot-long FxHooks singleton previously retained every Actor entered in `st` or `flickT` through strong Map keys. Neither native Match disposal nor native actor removal deleted these entries. The unchanged baseline failed all three new tests: disposal retained entries, individual removal retained entries, and a live FxHooks prevented an otherwise unreachable Actor from being collected.

The two Actor-indexed caches now use WeakMap. Existing `actor:removed` and #564's `match:dispose` event explicitly delete only the departed Actor or the disposed match's roster. Cleanup listeners run independently of rendering, effects enablement, and the optional VFX event wrapper. This does not introduce a second disposal producer. Projectile maps and their existing stamp-based collection remain unchanged.

The lifecycle fixture loads the actual Actor, Match, FxHooks and shared event bus through the production adapters. It exercises 25 native 4v4 Match disposals, removal of one actor while a teammate remains, delayed disposal of an old Match while a new cache remains, and continuing respawn/VFX events. Native Match.dispose itself still clears global G.actors; this change does not claim to fix that separate global-roster race.

A separate explicit-GC test keeps FxHooks alive, removes an Actor, then recreates weak cache entries through a late real bus event and Roller flick. After dropping all other Actor references, WeakRef confirms collection. This is a Node GC test, not a browser heap measurement or proof that unrelated systems retain no actors.

Validation:
- Baseline: 3/3 new tests failed for the expected retained-cache/Actor causes.
- Fixed source: 4/4, including explicit GC and native frame polling, no skips.
- Actual minified output: 4/4, including explicit GC and native frame polling, no skips.
- Existing #564 lifecycle tests: 3/3 source and 3/3 emitted.
- Quality suite: 235 passed, 0 failed, 5 optional emitted modes not selected by the general command.
- Optional quality emitted modes: 73/73 passed, no skips.
- Full gameplay/reliability suite: 1121 passed, 0 failed, 5 existing optional modes skipped.
- Build content prefix: 5aedbb6bb224.

Run the focused regression with `node --expose-gc --experimental-vm-modules --test patches/local-quality/tests/fx-actor-lifetime.test.mjs`; add `INKWAVE_CONTROLS_SITE=_site` to use emitted modules. Without --expose-gc, the GC-only test explicitly skips. No game balance constants or numerical reference claims change.

Dependency: #564's existing match:dispose producer must be present. This patch contains only the FxHooks consumer and cache changes; #564 is retained as a separate composition commit.
