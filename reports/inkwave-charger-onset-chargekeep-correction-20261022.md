# Charger HoldNoise: onset/charge-keep emergence, not a charge-up loop

## Correction, 2026-10-22

The player reported an **audible short click only when beginning a Charger charge**, plus **one click after returning from squid form with a stored fully charged shot**. They explicitly rejected using that same short sound as the continuously rising charging layer. This observation takes priority over the previous inferred `HoldNoise` semantics; it has **not** yet been independently corroborated by S3 11.3.0 SLINK data or isolated game-video audio.

Historical defect on main, after PR #1740 merged: `patches/splatoon3/runtime/audio/bank.mjs` transformed the short archived `Wp_Charger_HoldNoise_*.mp3` into a ~560ms seamless grain-stretched `charge` **loop**, then applied an invented 0.86–1.12x pitch rise. In both native and catalog branches the charge state started the loop and repeated it during the hold. `inkwave-public/src/net/netmatch.js` also created a remote Charger charge loop. **All three interpretations are unsupported by the observed event lifetime.**

## What the correction changes

- **Playback:** retain the unchanged, already SHA-pinned original MP3. The recorded Charger `charge` event is built as a finite **one-shot**, not a loop. `AudioBufferSourceNode.loop=false`, pitch at natural `1x`, no JS synthesis and no buffer stretching or repeated onset. The generated `charger-hold-sustain.mjs` is deleted. The 0.54 boosted sustain gain is removed.
- **Native fresh-charge edge:** shared `WeaponRunner.update` audio-runtime wrapper fires the short recorded `charge` event only at `charging: false -> true`. The base native `charger_charge` looping call is suppressed in the build adapter, with `chargeLoop=null` and no effect on native charge-time, release, ink or flight behavior.
- **S3 charge-keep emergence:** the existing game owner `WeaponRunner.s3Stored`, established only for a full charge that legally survives submersion, is checked at the actual `actor:form` squid->kid event. This fires one short `charge` cue on emergence, even though `s3Stored.resurfaced` is not populated until a **later** charge update after the native emerge admission delay. Duplicated kid events, expired keep, partial/no stored charge and scoped models are silent. A kept-charge emergence must not falsely emit a second full-ready cue or a fresh-start sound.
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
