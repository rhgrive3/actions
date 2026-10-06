# Final-minute BGM request timing (#742)

Public baseline: mainfdc2806c0464813baa5af1d9b2c16044ca03d0a9. The local starting commit64e9b48e9c6c86a1b29bf9b12d0cb7552672c6a1 has exactly the same treeaaa41c560610ef3e654c3cc9451c9b0ef1f1533b; no older-tree substitution was made. Claim: https://github.com/rhgrive3/actions/issues/742#issuecomment-6005682638 . Latest claims/open-PR actual diffs contained no competing one-minute transition implementation.

## Cause and minimal correction

The native Match already emits its one-minute event when its authoritative remaining time crosses60 seconds. Main requested `battle_final` with the same1.2-second fade as generic transitions. The existing MusicEngine interprets a nonzero fade between equal-BPM songs as permission to wait for the next bar, so the incoming song can start more than a second after the event.

Only two Main source anchors change:

1. `_playMusic` accepts an optional fade argument, keeping1.2 as the existing default.
2. The non-Boss `match:oneminute` callback passes0 for that one fixed milestone.

MusicEngine already has a click-safe zero-fade path: incoming Player starts at request-time+60ms, outgoing gain reaches zero after30ms and its scheduling stop is50ms after the request. This reuses that path without changing MusicEngine, its waveform/track content, timer/worker ownership, Match/NetMatch, the event/banner/SFX or Boss guard. Generic same-BPM requests keep bar alignment.

## Evidence

- Source9/9, minified9/9, actual emitted9/9.
- Negative control runs the actual native Main callback with its old fade and the actual MusicEngine/Player. At a representative bar phase, the incoming song waits more than1 second for `nextBarTime`.
- Eight outgoing bar phases use the existing60ms scheduling lead after correction. Outgoing fade/stop timestamps are inspected directly; the existing same-track guard avoids duplicate Players.
- Native unchanged Match.update and the actual FixedClock deliver the milestone once at30/60/90/120Hz for offline and follower-flagged fixtures. HUD, SFX and music request share the event's AudioContext time; no match timer is changed.
- Generic same-BPM requests still align to the next bar; Boss event retains its original music exclusion.
- Muted and pre-init requests retain the final track/deadline option and restart one scheduler only when permitted by existing lifecycle owners.
- Missing/duplicate/reapplied anchors fail closed; adapter is in quality identity. MusicEngine, Match and NetMatch source bytes are unchanged by this adapter.

The audio clock is advanced in25ms steps with real MusicEngine ticks. An early test-only clock jump accidentally activated the existing250ms platform-rebase path and invalidated the ordinary-transition control; correcting the fixture cadence removed that false comparison. All final runs use continuous scheduler ticks.

## Limits

This does not promise zero audible latency. Native60ms look-ahead, normal frame delivery, AudioContext/output-device latency and existing reverb tails remain. Tests use real procedural scheduling with fake WebAudio nodes, not waveform listening or physical speakers. Follower-flag testing preserves the existing native timer path but is not a real two-client network/audio alignment measurement. If audio is muted, uninitialized or browser-suspended at the milestone, existing user-gesture/lifecycle availability still controls audible playback; past sound is not reconstructed.

The issue's Splatoon3 comparison concerns the final-minute milestone, not reproduction of Nintendo music or a measured Switch latency. See https://github.com/rhgrive3/actions/issues/742 . The code correction only removes the extra bar wait and retains the existing scheduling tolerance.

Authentic build:86125be5cb831b0e92fe619c46664dd69778c1fd407b757443646a901a8c2bf6,145preloads. Broader local-quality/idle gates:131 tests,129 passed,0 failed,2 existing skips (optional emitted Tenacity site and forced-GC minimap observation). Dedicated new9 tests have no skips.
