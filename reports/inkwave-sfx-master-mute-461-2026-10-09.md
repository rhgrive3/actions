# #461: effective mute and deferred-loop composition

## Existing implementation and reproduced residuals

[Issue #461](https://github.com/rhgrive3/actions/issues/461) is already closed;
the original SFX=0 fix is present in main `5d0be6b7` and is retained. This scoped
follow-up does not reopen the issue or claim the original work was missing.

Two boundaries remain in the composed production audio path:

1. `AudioEngine._sfxSilent()` only checks the SFX bus. Master=0/SFX>0 still
   constructs new one-shot graphs and keeps harbor ambience alive despite an
   inaudible master output. Pre-init and live mute both reproduce this.
2. The #957 loop-parameter deduplication wrapper treats `playing === false` as
   terminal. A live deferred handle muted via either bus therefore drops
   parameter changes: requesting volume 0.3 while muted resumes the old 0.55.
   Conversely, a handle born muted bypasses deduplication forever after unmute.

The first four added native-composition tests initially have three failures.
After only the Master mute predicate correction, the latest-parameter case
still fails, exposing the second boundary rather than weakening the assertion.

## Changes

- `issue-461-sfx-mute.mjs`: the existing silent predicate includes Master=0.
- Deferred handles expose whether their request is still live but temporarily
  parked, distinct from an explicitly stopped request or dead native voice.
- `platform-audio.mjs`: the existing parameter-deduplication wrapper accepts
  live deferred requests at installation and update, retaining muted changes
  and deduplicating after resume. Stopped/dead native handles remain inert.

The existing loop queue/stopAll owner, music routing, SFX preference values,
AudioContext lifecycle and gameplay are unchanged. This follows the #366 music
master-mute change without conflating music and SFX ownership.

## Verification

Eight new tests execute real production-adapted `AudioEngine` and `MusicEngine`
with test Web Audio nodes/worker transport. They cover persisted Master=0,
inaudible one-shot/ambience construction, live mute, latest deferred parameters,
independent SFX=0, eight resume cycles, stop/stopAll non-resurrection, independent
music playback, and both master/SFX-muted births followed by 120 identical
live parameter updates with zero duplicate forwards.

```sh
node --experimental-vm-modules --test \
  patches/local-quality/tests/sfx-master-mute-461.test.mjs \
  patches/local-quality/tests/music-master-mute-366.test.mjs \
  patches/local-quality/tests/issue-461-sfx-mute.test.mjs \
  patches/local-quality/tests/idle-resources.test.mjs \
  patches/local-quality/tests/audio-loop-dedupe.test.mjs
```

**36 passed, 0 failed, 0 skipped**. Diff whitespace check passes. The existing
native-loop stopped/dead voice controls also pass. These are Node composition
checks, not browser audio, mobile power, or Nintendo retail measurements. The
Splatoon 3 11.3.0 gameplay comparison and all calibration limits remain unchanged.
No full build or CI wait was performed for this bounded correction.
