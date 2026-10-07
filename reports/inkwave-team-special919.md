# Teammate special activation signal (#919)

Claim: https://github.com/rhgrive3/actions/issues/919#issuecomment-6028643668

The current main is f31f5da439134fe49bb89018dad5557671a49c67. This private candidate uses the production files of PR868 head 04d862c4886e8b9642cbb929755be8b8377aee31. Later 773e/5998 changes concern the separately owned weapon/test dispute and are not part of this patch. The changed quality registration file has an exact base blob in the handoff manifest.

Fresh issue comments had no owner. PR919 search had no match. Actual diffs for the newer open batches #892 and #897–#902/#942 did not add this consumer. #851 is separately claimed and covered by #902; it is excluded.

## Root and correction

The existing local and remote accepted `special:use` events have no teammate HUD subscriber. Contrary to one premise in the Issue, the current `NetMatch._playEvent` already calls `emit(name,e)` after its event-specific switch. No extra network forwarding is needed or added.

The HUD now consumes that event only for a non-self actor in the current live roster on the local player's team. Hidden, paused, attract, menu and non-playing contexts reject new signals. The existing native feed receives the event's actual special id and displays its registered icon/name, including the installed Kit metadata. Ordinary feed calls and the local-player banner keep their existing paths.

Signals retain only scalar data in the feed nodes. Current Match exit/disposal, HUD hiding and HUD disposal clear their timers and rows. Old Match disposal cannot remove the current Match's signal. Three simultaneous allied activations retain distinct icons; a special-only mobile selector overrides the native rule that hides feed rows after the second row.

This reuses INKWAVE's five-item native feed and its 4.2-second expiry. Those placement/animation/expiry choices are existing application conventions, not newly measured Nintendo timing or pixel calibration. Map visibility remains owned by the existing feed layout.

## Focused evidence

Command: `node --experimental-vm-modules --test patches/local-quality/tests/team-special-signal.test.mjs`

Final source result: 6 passed, 0 failed, 0 skipped.

- Complete production install graph, actual Actor/Character and HUD methods; removing only the new event subscription reproduces the missing cue while an actual Actor activates Storm.
- Both team viewers; enemy/self/retired-Actor/unknown-id/non-live exclusions.
- Three different registered Kit icons; native expiry and signal-only mobile CSS.
- Current/stale Match retirement, HUD hiding/disposal, timer cleanup and unsubscribed callbacks.
- Two independent production module realms: actual NetMatch recorder and snapshot writer, JSON transfer, `onMessage` and timeline playback. Correct owner produces one cue; forged sender, repeated packet and a newer packet repeating the event sequence produce no additional cue.
- Adapter identity and missing/duplicate/already-applied HUD connection failures.

DOM, audio, storage and clocks are bounded source fixtures. This is not a physical device, WebGL screenshot, relay-latency or exact Splatoon animation measurement. No full build or new CI was started by this lane; the integration owner receives this four-file patch for the next agreed batch. Main remains held.
