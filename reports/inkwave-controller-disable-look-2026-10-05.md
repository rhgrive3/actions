# Neutralize disabled controller look state (#521)

Baseline integration536 `9f1d794f79f3f78d0d2a4920fe16667b8a2e1b06`; public raw source unchanged. This is an internal stale-input correctness repair, not Nintendo sensitivity/physics tuning. It will join the next integration batch without an independent push/CI.

## Root and implementation

`PlayerController.update` returned while disabled before clearing the filtered `padLook` and rim-boost `edgeT`. Re-enabling with a neutral current stick applied the decaying old filter to camera yaw/pitch. Existing PR485 only clears when the current input owner is no longer pad, which cannot cover a disabled pad-owned controller. Platform lifecycle clearing is separate from ordinary pause/respawn.

The build adapter adds one native controller neutralization method and makes `enabled` a class accessor backed by `_s3Enabled`. On a truthy→falsy transition, zero padLook x/y and edgeT and invalidate aim-assist carry once. This executes at assignment, even when no disabled update runs before re-enable. Repeated disabled assignments do not repeat it. Existing disabled intent clearing and gyro discard remain in the original update branch.

The public enabled value/assignment API is retained, but it is now a prototype accessor rather than an own data property; internal callers only read/write its value. No input button history, physical stick, device owner, mouse/touch delta, weapon cooldown, actor position or ink is changed. A still-held current stick starts a new filter normally on re-enable. This does not add a fresh button edge.

## Verification

Actual Input + PlayerController through the complete production adapter chain and actual emitted modules:
- Saturate X, Y and diagonal look; disable immediately clears filter/boost.300 disabled ticks and repeated disabled assignments call the neutralizer exactly once.30 neutral resumed ticks preserve yaw/pitch exactly.
- Disable and re-enable with zero intermediate updates still clears the stale filter. A deliberately held new stick rotates normally.
-30/60/120/144Hz all give zero residual neutral displacement, preserving actual padPrev held-button history and no new padPressed edge.
- Real composed Match.updateController predicates cover death/respawn, offline pause, online menuBlocked and finish/playing. Each boundary clears look and neutral restoration causes no kick.
- Unrelated actor ink/cooldown and current mouse/device input values are unchanged by assignment.

Focused native5/5; actual minified5/5. The earlier emitted build fails the new neutralization assertions. Full aggregate receipts are appended at handoff. No physical Bluetooth/iPad/Android sensor run, input-latency measurement or new browser screenshot is claimed.

Final local receipts: full918pass/0fail/1skip(total919); quality/gates117pass/0fail/2skip(total119). Actual emitted5/5; prior emitted baseline3fail/2pass controls. #510+#521 together on newer integration536 `db23355031e18a8efad89c72bf1a039902ad0833` also pass the HUD/disable/death-time navigation focused47pass/1skip(total48), production build, emitted12/12 and full957pass/0fail/1skip(total958). This retains the newer #550 controller navigation owner. Report-only merge conflict was resolved by keeping both entries; no production conflict. No independent source push/CI was started.
