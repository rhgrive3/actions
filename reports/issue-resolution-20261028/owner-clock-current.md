# #1767 current-source native clock acceptance, 2026-10-28

**Passed all three phases in both directions (six receiver cases), process exit 0.**
Keep #1767 open until the full required CI passes. This adds fresh local native
acceptance; it imposes no deployment requirement.

Source: `8c7f27a23513b1fc650a5465a3eef8a2b1645823`.
Build inputs: `bdb851a80a79a984f15dc002c4fb0b997a8931c4d7b51caefc24f64cbd34210e`.
Build content: `fcec6e8db8e58c0ff5bd0c27da583e6a105b2949c27c1a8d0970152904c2429c`.
All 1,522 source inputs and every emitted artifact verified against that source
before and after execution. Production relay and harness hashes are in the JSON.

The existing `scripts/check-inkwave-native-online.mjs --owner-clock` and exported
`runOwnerClockBrowser` run the full production Game/Match/Tidewater/Actor/Character
through real browser WebSockets and the production Worker/RoomDurableObject.
No repository source, game guard, clock, peer state or acceptance-harness source
was edited. A scratch Node preload only selects provisioned Chromium 151.0.7922.34,
sets `chromiumSandbox:true` and removes the old CLI's explicit `--no-sandbox`.
The actual browser command line contained no `--no-sandbox`. Launcher source,
options and SHA-256 are preserved alongside the unchanged harness hashes.

The relay holds the original first/latest tick for at least seven real seconds,
explicitly dropping superseded intermediate ticks without rewriting messages.
Each actual native received pair below fails the unchanged old arrival-origin
guard; each fixed receiver accepts catch-up, retains its exact original freshness
origin, reaches Match `playing`, and advances ordinary owner snapshots >0.5 seconds
further. Native `performance.now` remains present. Remote Actor buffers contain
6–10 snapshots. Eight nonce queries and six replies cross the real relay. No page
or console error occurred. Final native draws are 69/71 calls and 337,640/340,682
triangles, with no context loss. Owned Node/Chromium processes were absent after
normal cleanup.

All times below are actual seconds from the corresponding native performance
clocks. Receiver index is local to each phase; source raw retains original IDs.

| Phase | Receiver | First sender ts | First local receive | Catch-up sender ts | Catch-up local receive | Old guard accepts |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| cold-start | 0 | 42.265 | 85.040600 | 49.287 | 85.089800 | False |
| cold-start | 1 | 78.019 | 49.282700 | 85.045 | 49.331800 | False |
| same-room-rematch | 0 | 61.699 | 104.497900 | 68.714 | 104.537200 | False |
| same-room-rematch | 1 | 97.475 | 68.740000 | 104.473 | 68.779300 | False |
| socket-reconnect | 0 | 73.615 | 116.409500 | 80.674 | 116.500700 | False |
| socket-reconnect | 1 | 109.386 | 80.664400 | 116.431 | 80.741500 | False |

Evidence and exact command: [`owner-clock-current.json`](owner-clock-current.json) (compact audited
receipt), `agent1-owner-clock-8c7/owner-clock-browser.json`, `online.json`, two PNGs,
`agent1-owner-clock-8c7.log`, `agent1-owner-clock-8c7-launch.json`, and
`agent1-owner-clock-sandbox.mjs`, all under `/workspace/scratch`.

Constraints: two isolated contexts share one Chromium process; SwiftShader,
low-quality rendering, manually scheduled native frames, and the existing local
Cloudflare upgrade shim. The normal click-to-launch spawn prompt remains visible;
this does not prove completed human spawning/combat, deployed-service latency,
physical-device performance or Switch retail parity. The helper's historical
foundation-scope description is stale for this run: this evidence explicitly uses
the full current 8c7 artifact and does not claim later weapon changes were excluded.
Splatoon 3 reference remains Ver.11.3.0; no unpublished retail network value is inferred.

The exact launcher is preserved as [`owner-clock-launcher.mjs`](owner-clock-launcher.mjs). The original raw archive remains in the execution workspace as `agent1-owner-clock-8c7-raw.tar.gz` (1,102,495 bytes; SHA-256 `a170784a2f25aa606c6576397ffe88d1a5ce5df816e75b8f91fc6f9d24d78c90`). Subsequent common reconciliation changed only CI/tests/reports; all current declared game inputs and emitted artifacts match the verified 8c7 build byte for byte.
