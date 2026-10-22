# Charger HoldNoise: onset/charge-keep emergence, not a charge-up loop

## Correction, 2026-10-22

The player reported an **audible short click only when beginning a Charger charge**, plus **one click after returning from squid form with a stored fully charged shot**. They explicitly rejected using that same short sound as the continuously rising charging layer. This observation takes priority over the previous inferred `HoldNoise` semantics; it has **not** yet been independently corroborated by S3 11.3.0 SLINK data or isolated game-video audio.

Historical defect on main, after PR #1740 merged: `patches/splatoon3/runtime/audio/bank.mjs` transformed the short archived `Wp_Charger_HoldNoise_*.mp3` into a ~560ms seamless grain-stretched `charge` **loop**, then applied an invented 0.86–1.12x pitch rise. In both native and catalog branches the charge state started the loop and repeated it during the hold. `inkwave-public/src/net/netmatch.js` also created a remote Charger charge loop. **All three interpretations are unsupported by the observed event lifetime.**

## What the correction changes

- **Playback:** retain the unchanged, already SHA-pinned original MP3. The recorded Charger `charge` event is built as a finite **one-shot**, not a loop. `AudioBufferSourceNode.loop=false`, pitch at natural `1x`, no JS synthesis and no buffer stretching or repeated onset. The generated `charger-hold-sustain.mjs` is deleted. The 0.54 boosted sustain gain is removed.
- **Native fresh-charge edge:** shared `WeaponRunner.update` audio-runtime wrapper fires the short recorded `charge` event only at `charging: false -> true`. The base native `charger_charge` looping call is suppressed in the build adapter, with `chargeLoop=null` and no effect on native charge-time, release, ink or flight behavior.
- **S3 charge-keep emergence:** the existing game owner `WeaponRunner.s3Stored`, established only when a stored charge legally survives submersion (including the Goo Tuber's partial-charge keep), is checked at the actual `actor:form` squid->kid event. This fires one short `charge` cue on emergence, even though `s3Stored.resurfaced` is not populated until a **later** charge update after the native emerge admission delay. Duplicated kid events, expired keep, partial/no stored charge and scoped models are silent. A kept-charge emergence must not falsely emit a second full-ready cue or a fresh-start sound.
- **Remote network:** netmatch's charging loop is replaced with a source one-shot on the observed remote `wr.charging` rising edge, with remote actor identity/position and once-per-hold dedup. Spinner and roller loop code remains intact. Network protocol and message shape are not changed.
- **Other sounds:** original `ready` / full-shot MP3 remain separate and intact, and all non-Charger true loops are untouched.
- **What is NOT fixed:** the **distinct, characteristic rising Charger charge tone**. The existing S2 official soundtrack shows a strong spectral rise from ~1.0 to ~7.0 kHz during ~0.91s; the archived 2022 S3 sound pack does not establish the separate recorded layer or Nintendo SLINK parameter graph. Do not replace it with a guessed oscillator and claim S3 parity. This patch deliberately removes the incorrect pseudo-charge sustain rather than pretending the full original sound has been recovered.

## Sources / tests

- Actual user-reported S3 sound timing; comparison measurements from [research PR #1752](https://github.com/rhgrive3/actions/pull/1752), using Splatune 2 official SFX track and original 2022 S3 `HoldNoise`.
- [S3 Charger charge keep rules](https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%83%81%E3%83%A3%E3%83%BC%E3%82%B8%E3%83%A3%E3%83%BC%E5%B1%9E): full-charge retention on normal Chargers, not scopes; some types like Bamboo/R-PEN not eligible. Existing game source `patches/splatoon3/runtime/weapons.mjs` creates and expires `s3Stored` based on actual full charge, submersion and time. Its existence and progress are stronger evidence than assumed elapsed time.
- Updated `audio-v11-real-only.test.mjs`: original sample identity, finite source duration, fixed natural pitch, Spinner motor unaffected; source adapters do not create native/remote Charger loops.
- Updated `weapon-audio.test.mjs`: exactly one charge-start click, once per genuine keep emerge, no duplicate on repeated event, silence on expired keep, scoped guard, and sound routing after weapon switch.

## Acceptance boundaries

Run relevant audio + weapon tests, composed startup/build, CI browser and real audio routes. Verify no extra Charger `loopWeapon('charge')` call survives build composition; test 60/30/120fps hold and native/catalog cases, local/remote form changes, and charge-keep expiry. Confirm output in a device/browser and compare with a legitimate independently recorded S3 source before any **full-parity** claim. No additional copyrighted audio file is committed.


## 2026-10-22 follow-up: rise reproduced directly in repository source

After the S2 soundtrack's first sound interval was measured (~1.18 seconds from short mechanical attack through the end of the ascending chirp), the user requested that normal INKWAVE operation **not** require them to import a file from a phone/tablet.

**Implementation in this PR**:

1. `patches/splatoon3/runtime/audio/charger-charge-rise.mjs` generates new, deterministic 1-channel PCM through the existing Web Audio SFX bus. Its dominant pitched component follows the separately measured Splatune 2 spectral **ridge** from ~1017Hz to ~6967Hz over a near-linear ~0.91-second interval, with soft onset/fade and a low-noise overtone texture. This is an independently synthesized approximation, **not the original Nintendo soundtrack bytes**, and is not a recovered S3 SLINK parameter curve.
2. The pre-existing, short, recorded 2022 S3 `HoldNoise` clip remains an independent **one-shot start click**. The new rise starts on the same charge admission edge and is stopped by release, squid conversion, damage/reset, match disposal and weapon switch. Charge-keep emergence fires only the short click, **not the first-charge-up again**.
3. The generated clip duration is capped by the actual equipped weapon's `chargeTime` parameter (bounded 0.4–2.4 seconds); a WeakMap caches a maximum of six per-AudioContext output buffers to avoid per-frame allocations. Under low ink/airborne slowing the fixed clip duration is still an approximation, not a source-verified frame-perfect match.
4. Nearby remote Charger owners start the same unique rise on their admitted network charge edge, with original clicks and HRTF panning, stop on observed release/cancel, and clean up on remote removal. Real Spinner and Roller loops remain intact.
5. `patches/splatoon3/tests/charger-charge-rise.test.mjs` tests increasing dominant spectral frequency, bounded finite PCM, no clipping/seam pops, bus hookup, spatialized voice, release cancellation and absence of an obsolete local importer. The dedicated v11 audio CI now explicitly executes it.

The earlier on-device song import UI, IndexedDB code, copyrighted audio file transfer and local manual selection were removed entirely. **The reproduced sound is included as source code in the GitHub PR and requires no user setup.** The copyrighted Splatune 2 FLAC/MP3/1.215-second excerpt was used only as a *measurement reference* outside GitHub. No Nintendo waveform is embedded, uploaded or vendored. Do not claim this generated sound is bit-identical to the official soundtrack or S3 retail gameplay without a separate legally supplied source sample and validation.


## 2026-10-22 later revision: ACTUAL source recording, not synthesized tone

At the user's explicit direction, the in-repo procedural `charger-charge-rise.mjs` tone was **fully replaced** with playback of the supplied Splatune 2 MP3 recorded sound. The new asset is at `inkwave-public/assets/audio/charger-first-splatune2-reference.mp3`, a bit-exact run of **70 MPEG-1 Layer III 44.1kHz 160kbps frames** from the earlier user-provided original Splatune 2 MP3, with the unrelated **213,057-byte ID3 tag/album art** removed and the remaining ~5.6 seconds of the soundtrack omitted. Size **36,571 bytes**; SHA256 `4ccd52136e6240c788b68c4def7b7f46642b8b9cfc70b97772b1dce4c10e6a1d`, Git blob `26c2b73e6ef206ab51e20c2cd2a50b29a0c09e2b`.

In native WebAudio the MP3 is decoded **once per AudioContext**, then the only played portion begins at **.4591 seconds** (this corrects the measured 24.104ms encoder lag relative to FLAC), lasts **1.215 seconds** and runs at **1× speed**. Start/end fade guards are 6ms/25ms. Source FLAC cross-correlation with the previously extracted source demonstration was .99926; the same segment decoded from this MP3 aligned to within one sample correlates **.9964** with the former user-heard comparison MP3. Unlike the previous approach, this is the *recording itself*, not recreated harmonics.

The original mixed-source recorded phrase **includes the start click**. The runtime now triggers exactly **one** `playChargerChargeRise` in the relevant charger start state and **does not play a second `Wp_Charger_HoldNoise` click** while the recording is ready; a load failure uses the old short HoldNoise one-shot as a safe fallback. Returning from genuine stored-charge squid form still plays only the independent recorded HoldNoise click. No custom UI or per-device file loading is required, and the production source builder ships the MP3 from `inkwave-public/assets/audio/`. The remote audio owner follows the same principle.

**IMPORTANT rights/provenance:** This excerpt is from a commercial Nintendo-published soundtrack; the linked user copy's original copyright/licensing status for republication is not independently verified. The repository is currently **public**. The user explicitly chose temporary public publication even after being warned that forks, Git object history, and copies cannot be retracted simply by setting the repo private later. This PR does not imply that publication is permitted by copyright law, and the completed artifact requires the user's rights assessment. The audio matches the *S2 soundtrack*, **not independently confirmed S3 11.3.0 retail audio identity**. Do not claim Nintendo endorses it.
