# Reuse synchronous HUD transport (#510)

Baseline integration536: `9f1d794f79f3f78d0d2a4920fe16667b8a2e1b06` (main83d6b088). Published raw source stays unchanged. This independent local-quality adapter/runtime is collected for the integration owner's combined push/CI.

## Root and implementation

Native `Match.teamSummary()` rebuilt two team/player-array trees every HUD draw, and `Game._updateHud()` constructed a frame, crosshair, minimap descriptor and mobile wrapper. The consumers read fields synchronously; existing marker/player map buffers were already reused.

`teamHudSnapshot` owns stable team objects, two team player arrays, two preordered outer views, and a WeakMap from actor identity to scalar-only player snapshots. Every call still refreshes colors and mutable fields. Membership is iterated without filter/map intermediates; shorter rosters truncate active arrays. Actor identity, not slot index or player name, controls reuse. Snapshot values do not retain actor references, and WeakMap keys do not pin disconnected actors.

`hudFrameSnapshot` owns stable Game frame/crosshair/map/mobile objects and overwrites every original scalar field per draw. The native `_updateHud` still computes live spread, map players, markers and prompts at its prior cadence. A hidden minimap sets both frame.map and the cached canvas reference to null. The cache retains no Match or actor references. Main uses `teamSummary(a.team)` rather than reversing the shared canonical array; calls for different viewers cannot corrupt each other's outer ordering.

These snapshots are explicitly mutable, synchronous transport. They are not persistent historical records. The only current teamSummary call site is updated together. Raw HUD squad dirty checks are based on scalar-string keys, not snapshot object identity, so respawn/special changes still reach the UI.

## Verification

Actual complete `teamSummary` and `_updateHud` methods run both unmodified and through the production S3→touch→reliability→quality adapter chain. Across20 changing frames, serialized baseline/candidate transport values match for viewer-team flips, renamed/swapped weapons, deaths/respawn timers, special readiness, minimap visibility, FPS display, target/range and ink. Reorder/team-change/remove/replace preserves correct membership and drops stale rows. Separate matches own separate caches. Normal and Boss-mode transport values remain unchanged; this is not a claim of new boss-renderer visual acceptance.

A deterministic3600-update4v4 probe records unique identities of17 caller-visible transport objects per frame. Baseline produces61,200 identities, candidate reuses17. Intermediate filter/map arrays discarded before the callback are not included in that measurement. This establishes removal of the targeted source-level object churn; it is not a physical mobile heap-allocation/GC or FPS measurement. The existing arrays for minimap players/ally markers are retained independently.

The entire actual minified Game and Match modules are also evaluated. Only the test's automatic boot tail is replaced with a Game export so no real UI is booted. Their real methods are invoked for3600 updates and retain frame/mobile identities while updating time and special readiness. This is emitted-code validation with fixture DOM/scene inputs, not a browser allocation profile.

Focused native plus emitted:7/7. Production build passed. Full quality/regression and combined-CI receipts are attached at handoff.60-second/3-minute physical-browser allocation timelines, minor-GC counts and95th/99th frame-time effects remain unmeasured; no numerical device performance gain is claimed.

## Integration boundaries

The adapter replaces only the original teamSummary method, Game HUD-frame literal and mobile wrapper. New runtime/adapter files participate in qualityIdentity. Missing or duplicate anchors fail closed. It does not change rendering cadence, quality, gameplay parameters, object pools for paint/projectiles, network protocol or Menus continuation. Later PRs changing those three source anchors must preserve the scalar transport contract when composing.

Final local receipts: full patch/reliability913pass/0fail/1skip(total914); quality/gates123pass/0fail/3skip(total126). All existing skips are built-site-only; emitted HUD/Match and Alpha-tie checks were explicitly run together:17/17pass. The Alpha-tie fixture's end-of-method marker is generalized from `teamSummary() {` to `teamSummary(` because the real method now accepts optional viewerTeam; judge assertions are unchanged. Production build/identity and diff/compatibility checks passed. No individual source CI/push was triggered.
