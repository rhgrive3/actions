# Recorded Charger sound: exact first Splatune 2 phrase and corrected event ownership

## Scope and observed gameplay requirement (2026-10-22)

The user identified four separate sound states: **charge-start click**, a distinct **ascending キュイーン**, **legal full or weapon-specific partial charge-keep emergence**, and **shot/ready sounds**. The prior #1740 used the short 2022 S3 `Wp_Charger_HoldNoise` click as an indefinitely repeated pseudo-charge loop. That misrouted a 0.2s transient, created a new 0.56s grain-sustain, and applied invented 0.86–1.12x rates.

This corrective PR **removes the grain generator and synth rise**. It installs the **actual user-supplied Splatune 2 Charger reference MP3** for the selected first charge phrase. The difference between Splatune 2 soundtrack and the unverified Splatoon 3 Ver.11.3.0 retail sound graph must remain explicit.

## Exact recorded source (no new synth)

- Source: user's connected-Drive copy of *Splatune 2*, Disc 2 Track 31, `SE：スプラチャージャー / SFX: Splat Charger`.
- New binary asset: `inkwave-public/assets/audio/charger-first-splatune2-reference.mp3` on PR #1821. It is **70 consecutive original MPEG-1 Layer III frames**, 44,100Hz, MPEG audio 160kb/s, ~1.82857 seconds, with ID3 tag/album art and remainder of the CD demonstration omitted. **36,571 bytes**, SHA256 `4ccd52136e6240c788b68c4def7b7f46642b8b9cfc70b97772b1dce4c10e6a1d`, Git blob SHA `26c2b73e6ef206ab51e20c2cd2a50b29a0c09e2b`.
- The actual playback reads **offset 0.4591 seconds** and lasts **1.215 seconds**, natural recorded speed 1×. The offset accounts for 24.104ms MP3/FLAC codec alignment; previous standalone user-preview snippet begins at **0.435s** in the FLAC. The first phrase ends at the first substantial silence, before the later dive/surface/shot events.
- Measured raw MP3 first-phrase vs the earlier user-facing 1.215s preview: normalized waveform correlation **0.9964** after one-sample alignment. This is actual recorded signal reproduction, **not** a spectral approximation, oscillator, signal model or generated imitation.

## Game integration

- `patches/splatoon3/runtime/audio/charger-charge-rise.mjs` is now a same-origin original-MP3 **fetch → decodeAudioData → AudioBufferSourceNode** implementation. The file is preloaded once at first audio context activation and reused across charge attempts. One 6ms fade-in and 25ms fade-out prevent cut-edge clicks; cancellation fades within 40ms.
- A fresh valid Charger charge plays exactly one instance of that recording, including its existing click. **Do not also play `Wp_Charger_HoldNoise` at this edge.** If the recording has not decoded or is absent, gracefully play the usual 2022 S3 HoldNoise as a short one-shot, never a loop or invented rising layer.
- Legal squid→kid **stored charge emergence** (including Goo Tuber partial keep where the gameplay owner permits it) plays one **independent** HoldNoise click, not the whole first-charge-up. No scope phantom-keep; no duplicate click on a repeated form event.
- Release, cancellation, dive, death/weapon reset, match state change and remote actor disposal stop currently playing full-phrase sound. Online owners use a 3D audio panner and the same original phrase; only one voice per observed charge edge. Splatling and Roller real motor loops are unaffected.
- `AudioEngine` uses the normal SFX bus, master and limiter. Cache is per AudioContext; a missing audio file fails closed without throwing into the gameplay update. Both source assets are packaged by the existing production build; there is **no device-specific file chooser**.

## Verification

- Direct MP3 source SHA256 and Git blob SHA agreed with the local frame extraction. `ffmpeg` successfully decoded the cropped MP3. The aligned, stereo 1.215s playback was compared at waveform level with the previously emitted reference.
- Source-module direct execution confirmed decode cache reuse, a **single source voice**, recorded offset `0.4591`, duration `1.215`, playbackRate=1, loop=false, HRTF routing, stop() idempotence, and completed native/remote source adapters.
- `patches/splatoon3/tests/charger-charge-rise.test.mjs` pins byte size, SHA256, source offsets, cache, recorded playback timing, absence of oscillators, release, 3D playback and graceful fallback. `weapon-audio.test.mjs` checks the first recorded clip suppresses a duplicate onset and that stored-charge emergence still has one source click. Dedicated `validate-inkwave-audio-v11.yml` includes the new test file.
- **GitHub Actions latest HEAD CI must complete before merge**. S3 Ver.11.3.0 first-party SLink pitch/event graph remains unverified, so this demonstrates exact playback of **Splatune 2's actual published audio**, not version parity.

## Rights and public-repository history

The user requested temporary publication of the recording on their **currently public** GitHub repository, acknowledging the warning that switching private later does not retract clones/forks/Git history. This file is from a copyrighted Nintendo-published soundtrack. Neither this research nor this PR verifies that redistribution rights exist. No Nintendo affiliation or endorsement is claimed.
