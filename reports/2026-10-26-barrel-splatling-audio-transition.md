# Barrel Splatling: remove legacy oscillator and isolate source Motor phases

## Observation and source evidence

User-reported symptom: an unwanted pulsing “won-won” motor seems to overlap
the Barrel Splatling's normal recorded shots during the charge-to-fire transition.

In PR #1882 before this fix, `patches/splatoon3/runtime/splatling.mjs` had
the still-active call `G.audio.loop('splatling_spin')` on initial charge,
retained and retuned this one legacy synthesized loop during the firing
stream, then played `G.audio.play('splatling_wind')` on natural stop.
`splatling_spin` is the older `src/audio/audio.js` oscillator/noise recipe,
not a decoded Splatoon 3 recording.

The old audio adapter in `patches/splatoon3/audio-adapter.mjs` converted
legacy `src/game/weapons.js` calls to recorded Motor/MotorFire, but that
file's Splatling implementation is superseded by
`runtime/splatling.mjs`, so the actual owner still emitted the oscillator.

The authorized 2022 S3 installed manifest declares these recordings for the
native Barrel Splatling:

- `splatling:charge` = `Wp_SpinnerStandard_Motor_00.mp3` (alternate 01)
- `splatling:spin` = `Wp_SpinnerStandard_MotorFire_00.mp3`
- `splatling:fire` = `Wp_SpinnerStandard_Shot_00.mp3`

The manifest has **no source-confirmed `splatling:ready` or
`splatling:release` recording**. We do not route arbitrary other weapon
MP3s or synthesize an unverified replacement for those two cues.

## Changes

1. Native Barrel owner now starts exactly one `loopWeapon(id, 'charge')`
   and stops it on trigger release, followed by `loopWeapon(id, 'spin')`
   only if a stream was admitted. Normal completion, squid/sub cancel,
   death and reset continue to stop the handle.
2. The formerly per-frame synthesized motor pitch sweep and 31Hz sinusoidal
   modulation no longer run; recorded Motor/MotorFire are played at the
   bank's existing `playbackRate = 1`. Position is still updated.
3. The old generated `splatling_wind` and `splatling_ready` are no longer
   emitted from the active native owner. A source-only `ready` request is
   issued at full charge, and naturally remains silent when the corresponding
   verified MP3 is absent. Visual full-charge state and rumble are unchanged.
4. Owner-local/bot presentation explicitly excludes `actor.remote`; remote
   sounds belong exclusively to `NetMatch._voices`.
5. Remote native **and catalog** Spinners now use independent
   `spinnerCharge`/ `spin` loop handles for `charge`/ `spin`
   recordings. These never reuse MotorFire for the charging phase or
   sustain charge Motor during firing.
6. The main `weapon:fire` event and its source-recorded shots remain
   unchanged. Projectile clocks, gameplay, ink, damage and packet ABI
   are unmodified.

## Verification

- Verified original and replacement string anchors with the production
  `audio-adapter.mjs` rewrite model. Charger adapter and network Motor
  phase anchors match the locked upstream exactly once each.
- Added `patches/splatoon3/tests/splatling-recorded-motor-transition.test.mjs`:
  native full charge -> firing -> stream end, 3 native/catalog remote
  spinner identities, double-play exclusion and recording-manifest checks.
- Reviewed the exact source playback-rate branch for recorded Spinner
  motors in `audio/bank.mjs`: fixed 1x, no pitch sweep.
- Full Node project test suite, browser audio capture, real device listening
  and source MP3 waveform comparisons were **not executed in this session**.
  The reported “won-won” audible cause is strongly supported by an actual
  overlapping oscillator code path, but still needs an A/B listening check.

Targeted command (in a checkout with normal dependencies):
```sh
node --experimental-vm-modules --test patches/splatoon3/tests/splatling-recorded-motor-transition.test.mjs
```

PR #1882 stays Draft; no merge, extra workflow dispatch, or
scheduled monitoring is requested.
