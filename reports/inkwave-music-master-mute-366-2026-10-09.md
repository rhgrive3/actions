# #366: effective music mute includes Master=0

## Existing fix and residual

[Issue #366](https://github.com/rhgrive3/actions/issues/366) already has the
Music=0 scheduler fix from #399. Latest main `5d0be6b7` and the integrated PR
#1182 code retain that fix. It correctly stops music players and their worker or
interval without suspending the shared SFX AudioContext.

The remaining boundary is **Master=0, Music>0**. Native `AudioEngine` routes the
music bus through the master bus, so the output is inaudible, but the two
`setMusicEnabled` injections check only Music. Consequently persisted Master=0
can start a player at audio unlock, and changing Master to zero during playback
leaves a scheduler alive. The existing scheduler interval is 25ms; no
real-device CPU/power saving estimate is asserted.

## Minimal correction

`patches/local-quality/idle-adapter.mjs` now requires both existing master and
music volume settings to be positive before enabling music, at initialization
and in `setVolumes`. This reuses the same scheduler ownership and latest-track
resume behavior already used by Music=0. It preserves `opts.music === false`
isolation, SFX preferences, audio routing, gameplay and all volume/gain values.

This is resource lifecycle work. Splatoon 3 11.3.0 remains the comparison
baseline; no retail audio or gameplay equivalence claim is changed.

## Reproduction and verification

The new native AudioEngine/MusicEngine tests use stubbed Web Audio nodes and
worker/interval transports, not a replacement audio engine. Before the fix,
four of five new tests fail: both worker and interval cases retain one
scheduler/player for persisted or live Master=0. The isolated music:false
preview-engine contract passes before and after.

After the fix, the new 5/5 pass. They cover pre-init master mute, 400 muted
scheduler calls with no new music notes, latest-track resume, independent
Music=0, eight repeated mute/unmute cycles, stopped-track non-resurrection,
shared-context non-suspension, SFX use after unmute, and preview isolation.

```sh
node --experimental-vm-modules --test \
  patches/local-quality/tests/music-master-mute-366.test.mjs \
  patches/local-quality/tests/idle-resources.test.mjs \
  patches/local-quality/tests/issue-461-sfx-mute.test.mjs \
  patches/local-quality/tests/final-minute-music.test.mjs
```

Result: **34 passed, 0 failed, 0 skipped**. Diff whitespace check passes. No
full build, CI wait, browser/audio-device trace, or Switch measurement was run.
