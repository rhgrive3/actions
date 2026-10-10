# #1186: same-name ally marker ownership

## Evidence and scope

- Main `5d0be6b7` and aggregate base `78ace706` allow duplicate player names in native `Session._newPlayer`; display names are not player ids.
- Game's existing ally projection produced only name, geometry and color. `HUD._updMarkers` subsequently used a name-keyed Map over all actors, including enemies, for Special readiness and weapon icons.
- Two allies named `Player`, Charger ready and Roller not ready, followed by an enemy `Player` with a ready Blaster, rendered both ally markers as ready Blasters. The pre-fix producer→consumer cases failed twice; a retained negative control reproduces the same wrong result when new metadata is omitted.
- This is separate from closed #616's disposal retention fix. No claim is made that a same-count roster replacement occurs in production. Normal death/respawn is enough to reuse a marker slot for another same-name ally.

## Change

`hud-snapshots-adapter.mjs` adds each projected ally's scalar `weapon` and `specialReady` to its existing pooled marker object. HUD prefers those snapshot values, including explicit false readiness, and includes weapon in both render and icon invalidation. Legacy/Lab inputs without the metadata retain their previous name fallback. No Actor reference, extra lifetime owner, timer, packet or gameplay value is added. Locked `inkwave-public/` remains unchanged.

## Verification

- Five focused regressions: removed-metadata negative control, duplicate ally/enemy names, death/respawn slot reuse at identical position/name/readiness, unique-name legacy fallback, and native Session acceptance of duplicate names.
- Source tests execute the exact ally projection block and HUD method after all six production build transforms, with real THREE projection and bounded Actor/DOM stand-ins. They are not an entire Game/browser/online relay simulation or a complete gameplay bootstrap test.
- Focused and adjacent HUD snapshot/sub/authority tests: 41 passed, 2 emitted-site checks skipped, no failures, concurrency 1. Both complete composed main/HUD modules parse; quick source/reference and whitespace checks pass.
- Existing scalar/geometry baseline comparison explicitly excludes only the two newly covered marker fields; unchanged transport still compares exactly. Existing pooling checks remain active.

Splatoon 3 reference remains 11.3.0. This fixes the ownership of INKWAVE's existing ally weapon/readiness presentation, without asserting exact Nintendo visual parity or new measured constants. Browser rendering, live relay and Switch hardware were not tested.
