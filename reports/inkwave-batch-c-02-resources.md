# INKWAVE C batch 02: demand-loaded resources and enemy-ink recovery

Baseline main: `17602ab094da6efb663d872934458e818ae3c93e`.

## Issues and root causes

- #433: boot schedules LobbySet preload in any idle menu after 2.5s. The preload marker pins an Online scene and four Canvas2D atlases even during offline-only play. Remove only that unsolicited boot request; native showHub/showLobby demand-loading, reuse and disposal remain intact. First Online visit uses the existing native loading/crossfade path.
- #419: disabled Minimap leaves `_built=false`, but both native match starters call setViewerTeam, forcing raster allocation. Disabled constructors now hold four 1x1 placeholder canvases, no ImageData or raster arrays. Team orientation/version remains logical; deferred work rechecks current preference and layout. Explicit update/ensure lazily creates native full-sized layers; a team change invalidates stale raster. This does not free an already initialized map when OFF is selected. TAB's native 3D map is unaffected.
- #415: enemy-ink ground contact clamps elapsed recovery time to 0.4s, crediting that interval after exit. The gameplay build transform resets elapsed time to zero inside the native contact branch. Preserve configured global delay/rates, damage cap/grace, CPU paint and weapon tuning. The numerical delay tracked separately by #195 is not changed.

## Coordination and overlap

Each issue was live-checked for Open/Draft PR root coverage and remote assignment comments before atomic C claim and GitHub assignment comment. PR326 portrait cache, PR399 cloud/cubemap/pause policy, PR61/457 loading caches, and PR184/339 menu/range work do not supply these roots. PR315 retains the 0.4s clamp; PR322's storm recovery gate is distinct. Assignment/comment receipts and actual diff snapshots persist under the dedicated task root. Linked timeline #433 -> #472 is a separate newly reported lobby-quality issue, not a fixing PR.

#438 was excluded after proving native main already sorts normal finite result rows by turf. Optional NaN hardening was rejected and its assignment released; it is not counted as a fix.

## Verification

- Combined focused source regressions: 24/24 (8 existing quality, 4 lobby, 10 minimap, 2 recovery).
- Lobby tests execute the native boot tail and hub/room entry methods, with original main as a negative control.
- Minimap tests execute the native class/raster with mocked Canvas2D transport, cover OFF/ON, both teams, stale idle callbacks, explicit demand, logical timing and original allocation negative controls.
- Recovery test executes actual Actor/resources ticks with the real production runtime transform; original main shows early recovery. No helper is manually appended after a tick. The test's 1.0s delay is an in-memory fixture override only; production tuning stays unchanged.
- Existing active browser gate now starts with Minimap OFF, checks native idle menu has no LobbySet after 2.8s, checks native match-start buffers stay deferred, reenables the map and validates full native dimensions/ImageData before continuing existing gameplay/input/render scenarios.
- Exact pushed SHA existing CI, combined production build and one batch adversarial review are recorded in the PR. No Switch timing calibration or physical mobile memory/wattage measurement is claimed.

All upstream `inkwave-public/` bytes remain unchanged. No merge or deployment.
