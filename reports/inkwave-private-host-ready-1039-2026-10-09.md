# #1039 follow-up: make final host readiness reachable

- Baseline: PR #1182 integration `909a7014`, 2026-10-09 UTC.
- Scope: `patches/splatoon3/lobby-host-team-adapter.mjs`; locked `inkwave-public/` remains unchanged.
- Reference: [Nintendo's current Splatoon 3 multiplayer instructions](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59459/), checked 2026-10-09. The online Private Battle sequence makes the host assign/confirm teams and then requires each participant to ready again. No Nintendo frame, physics or pixel value is inferred.

## Reproduced residual

The installed session already requires `teamsConfirmed` and every Turf participant's final ready state, including the host. `confirmTeams()` resets every ready flag. However, the native menu hides the host Ready button, routes its Ready shortcut to `tryStart()`, and omits Ready from the host navigation graph. With two clients, confirmed teams and a ready guest, the host action therefore remains blocked forever. The Confirm Teams button was also outside the custom keyboard/controller binding and focus graph.

## Change

Turf hosts now see their own existing Ready button and its normal `setMe({ready})` action. The separate Start action retains its authoritative checks. Before team confirmation, both host and guest Ready actions are rejected before emitting a request or optimistic UI state. Confirm Teams uses the existing menu input binding; the host's focus row reaches Confirm, Ready and Start. The duplicate Start R/X hint is hidden in Turf because that shortcut now belongs to Ready. Boss mode keeps its previous host-Start behavior and guest readiness.

Guest team writes, per-player host assignment, session validation, roster construction, network payloads, two-human Turf admission, and readiness invalidation rules are unchanged.

## Verification

- New native logic tests: 6/6 pass. The real fully composed NetSession instances exchange cloned host/guest packets; real `start()`/`_begin()` produce the shared roster. Only stage loading/rendering and transport delivery are local stand-ins. The exact composed menu action, render and navigation sections execute rather than equivalent reimplementations.
- Includes two-client launch, host final readiness, confirmation-before-ready, unauthorized guest team change, reassignment, join/leave, mode changes, Boss separation, visible host controls and native Confirm binding.
- Existing related host-team/readiness composition tests: 10/10 pass. Combined: 16/16, no skips.
- Negative control using the unchanged baseline adapter with the new tests: 5 fail and 1 pass (Boss), including the unreachable-host-ready assertion. Restoring the change returns all tests to green.
- Syntax and whitespace checks pass. No CI polling or full-suite rerun was needed for this bounded edit.

This is CPU/module-level logic evidence, not a browser screenshot, live relay session, controller hardware test or Switch comparison. Exact full Nintendo lobby UX and pixel parity remain unverified; this follow-up does not close #1039.

## Follow-up: desktop roster and assignment input

A second production-UI residual remained in the same Issue: the only per-player A/B assignment buttons were inside the touch roster, whose default desktop CSS is `display:none`. Those buttons were also absent from the custom menu input bindings/focus graph.

The host's Turf roster is now explicitly displayed on desktop as well as touch. Each player/team action is registered with the existing menu binding and included in the focus route. Roster updates remove obsolete input bindings, rebuild the bounded controls, and preserve focus by player/action identity; role/mode changes move focus to the appropriate surviving control. The native scroll-to-focused-row path also recognizes the roster. Confirm Teams now lives in the bottom control dock rather than an unpositioned screen sibling. This layout is INKWAVE UI authoring, not measured Nintendo pixel geometry.

Verification after this follow-up: 23/23 native/source checks pass with no skips, including the existing menu input-ownership suite, repeated roster replacement, team change via bound action, retired-control removal, focus retention, guest/Boss removal and desktop CSS composition. Reverting only this follow-up to `2efc4ce3` makes both added residual tests fail.

An installed-Chromium localhost probe was prepared to load the real fully composed Menus/Session and styles, inspect desktop/touch visibility, click assignment/Ready, and exercise the native navigation path. Chromium did not launch: the sandbox rejected its process socket with EPERM; the escalated launch returned `CreateProcess: TurnAborted`. No browser result or screenshot is claimed. Desktop/touch rendered fit, live input delivery, live relay and hardware validation remain unverified. Source and fixture results are not substitutes for those checks.

Narrow viewports use a single roster column, so the added fixed-width team controls do not force two cramped rows side by side. A retry of the same escalated browser command was accepted by the tool but Chromium still terminated on its process-singleton socket EPERM. This is a verified execution limitation, not a claim of missing user approval. Browser acceptance remains pending.
