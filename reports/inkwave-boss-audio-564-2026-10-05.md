# Boss audio ownership — Issue 564

Baseline: integration candidate e92269e (main fc057af and separately pending network repairs). This isolated delta follows HUD #560 locally; it does not publish or change the pending network files.

The boot-installed boss audio director retained its active Boss reference after judge/results, and Match.dispose had no notification to release it on a quit. The code proves a persistent strong-reference path; no hardware heap quantity is claimed.

The quality adapter now emits match:dispose before BossMode teardown. The audio listener retires only when the disposed match's Boss is exactly its current Boss. Judge/results use the same identity condition. End clears timers, stops loops, cancels the positional follow interval immediately, clears the Boss/track references and removes its music remap. The singleton installation remains idempotent. Existing intro, phase, defeat, positional audio and fresh-session begin behavior remain the owners of live audio.

Validation:
- Three source tests and three actual minified tests pass, including judge/results; direct rematch after phase3/defeat; native Match.dispose without results; immediate interval/timer/loop cleanup; menu re-entry; stale old-Boss/Turf disposal not ending a new Boss.
- The previous emitted build fails all three tests because the old Boss remains retained at termination/model teardown.
- Runtime-lifetime and team-WIPEOUT composition regressions: 10/10.
- Combined #560 + #564 build: 3f8f4328dcc1. No new runtime module/preload count; 131 core +14 range retained.
- Test-only AST instrumentation observes the actual audio state object in source and minified code; production exposes no debug state. Actual Match.dispose body is executed with its real clearTeamWipes dependency. Audio device and timer services are deterministic fixtures.

Browser forced-GC heap snapshots, physical audio playback and mobile long-soak remain unverified. The evidence establishes reference release and lifecycle behavior, not measured memory/FPS improvement or Nintendo boss parity. HULLBREAKER is an INKWAVE-specific mode; no S3 numerical behavior is invented.
