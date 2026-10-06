# Qualitative teammate status on both Turf Map paths (#718)

Base: main37ab02fcb7314eee8a6b3e6e8e6b0593610e7bff. Claim: https://github.com/rhgrive3/actions/issues/718#issuecomment-6005268580 . Current open PRs/claims were inspected first: #561/#631 were independently owned, #300/#117 already occur in PR751, #710 in PR752. This batch contains only #718; #720/#715 are separate completed candidates.

## Root and implementation

The native HUD serialized `Math.ceil(ally.respawnTimer)` into `_beaconTargets()`, then exposed it in both the beacon name and legend. The separate full-scene `DioramaOverlay.update()` read the same timer directly into each ally pin. Changing only the HUD would leave the actual diorama disclosure alive.

One build-time adapter changes only `src/ui/hud.js` and `src/ui/diorama.js`:

- HUD beacon transport carries a `dead` boolean instead of remaining seconds.
- Beacon and legend labels/dirty keys consume qualitative dead/ready/busy state. A dead ally uses a cross (×), an alive in-flight/busy ally remains unavailable, and an eligible live ally becomes READY. Even an old lab payload that still includes `respawn` cannot render the numeric value.
- Diorama's splatted teammate badge uses the same cross, preserving existing `is-dead`/`is-ok` and all projection/input behavior.
- Actor timers, network replication, local player's own countdown, top squad status, enemy visibility, `_jumpTo` and Diorama `_jump` remain unchanged. This does not implement a signal system or modify actual respawn/jump timing.

Reference expectation and limits are in https://github.com/rhgrive3/actions/issues/718 . This is the issue's teammate-map information boundary; no new Nintendo timing or exact-pixel claim is made.

## Evidence

- Actual composed HUD, native UI helpers and Diorama execute under Node VM with DOM surfaces and camera/input fixtures.
- Negative control reproduces both original numeric paths (`Ally · 6`, `6s`, and Diorama `6`).
- Source8/8; minified8/8; actual emitted8/8.
- 30/60/120Hz, local-team0/1, and local/remote-flagged teammate data all preserve qualitative state. The ally timer getter throws if read, proving neither corrected map path even consumes that clock.
- Dead→alive but Super Jump busy→eligible transitions preserve the existing jump rejection and acceptance. The test calls both actual jump methods.
- Old lab data with changing numeric respawn values leaves both labels and dirty keys unchanged. If it has no new `dead` flag, unavailable entries fall back to BUSY/… without reading the legacy seconds.
- The local player's actual numeric countdown still advances5→3→GO.
- AST-based function-byte comparison preserves own show/hideSplatted, top-squad update and jump methods. Missing/duplicate/reapplied anchors fail closed and the adapter enters build identity.
- Authentic build:9123b9f50ea5aad6597ac9a99e6b88568b1e879b148f86f54c31b6c686112bf2,145preloads. No runtime module or asset import added.

## Remaining verification

These are actual-code/DOM-state results, not screenshot inspection. Real browser/device rendering and online end-to-end receipt remain for the next integration acceptance. The known local Chromium socket/sandbox restriction was not bypassed. Remote-flagged Actor controls do not by themselves establish multiplayer transport correctness; no transport change was made here.

Independent integration read-only review found no blocker. Broader local-quality + idle-resource gates:117 tests,116 passed,0 failed,1 pre-existing Tenacity emitted-only skip (optional site not set).
