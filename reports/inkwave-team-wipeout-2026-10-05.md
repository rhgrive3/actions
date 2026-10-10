# Team WIPEOUT notifications (#540)

Scope: ordinary 4v4 Turf, own and enemy team transitions. Non-closing while physical-device audiovisual and real peer/network timing evidence remain pending. Flow score issue #505 is not implemented here.

## Evidence and ownership

Nintendo's SplatoonJP announcement (2022-08-26), https://twitter.com/SplatoonJP/status/1563089872310931458, describes WIPEOUT when all members of a team are splatted, including the user's own team. The announcement is embedded at https://gamepedia.jp/splatoon3/archives/14591, which illustrates own-team black and enemy-team white text. No exact Nintendo sound clip or display-duration equivalence is claimed.

The native HUD previously checked all enemies only inside the local final-killer branch. Teammate/remote/environment final deaths and own-team wipes therefore had no independent notification. The new producer samples current admitted actor life states after native Match actor updates, independent of kill/assist credit. It emits team:wipeout with match identity, team and a primitive sequence. It is a client Match-state transition, not a new server-authoritative network protocol.

Only two armed booleans and a sequence are retained per Match; no mutable HudFrame/teamSummary references are saved. Exact four-member rosters are required on both teams. Live members rearm; local respawn subscriptions and accepted NetMatch remote respawn also rearm when a respawn and subsequent death occur between samples. Persistent all-dead frames do not repeat. Start/dispose, pause, finish, attract, Boss and partial rosters are guarded.

HUD queues events to its next update so local kill callouts cannot overwrite the team notice during the same simulation tick. Duplicate/stale identities are rejected. Simultaneous team wipes emit both producer events, with own-team danger prioritized on the single HUD callout surface. Own/enemy text classes and existing defeat_jingle/special_ready sounds differ. Existing kill, assist, multi-splat, revenge and shutdown bookkeeping remains. New-match/dispose clear pending messages. No new global state, score mutation, or menu/save/result ownership is introduced.

## Verification

The test imports full native Match, HUD, NetMatch, ctx, Three and production adapters through a VM module loader. It executes real Match.start/update, event bus, HUD._bindBus/update/_onSplatted/_callout/_startMatchHud and NetMatch._remoteRespawn. Actor combat integration, unrelated HUD subrenderers and DOM/GPU rendering are explicit fixture boundaries. The same cases run against full production-minified modules, not copied functions.

Cases: teammate-finished/enemy/own wipes, 120 persistent-dead updates, rapid accepted remote respawn/redeath, local final kill and assist bookkeeping, simultaneous wipe priority, pause/end/Boss/attract/partial guards, duplicate and stale events, new-match queue clearing, old non-wipe sound behavior, and mutable transport inputs. Missing anchors fail closed. This is deterministic logic/DOM evidence; not a screenshot, physical device, audio listening, latency/packet-loss or long-soak acceptance test.

Local results: native8/8 and full emitted8/8; build6aff96edc890; aggregate815/815; quality plus idle-resource gates80/80. A separate throwaway merge with weapon #510 head ad675b6ae8e844e10ff8cda8b23913f436850a59 preserved both adapter registrations and report sections. Its production build91ce06354efb passed both WIPEOUT and HUD snapshot tests15/15, including #510 full emitted Game/Match transport (no skip). This verifies coexistence with mutable reusable transport; primitive wipe state does not retain its references. These are local tests, not a new CI run.
