# INKWAVE Charger reference-audio investigation (2026-10-22 JST)

## Scope and evidence barrier
Goal: identify which original `Wp_Charger_HoldNoise*` recording(s) and ready cue(s) are audible in real, independently recorded Splatoon 3 Charger gameplay, recover measured audible pitch and timing wherever possible, and compare to the code in Draft PR #1740. **Do not claim parity until original gameplay audio has been acquired, checked for a sound track, and measured.**

The user's Drive contains original 2022-extracted MP3 clips and S1 public "thick" resource snapshots, but **no S3 Nintendo SLINK event graph** and no video media in the accessible Drive search. User has no Switch hardware. Video sources identified from independent public postings:

1. [Splat Charger no-commentary gameplay, Aug. 28, 2022](https://www.youtube.com/watch?v=FR10kogkwY8)
2. [Splat Charger online gameplay, Sept. 11, 2022](https://www.youtube.com/watch?v=Q0gbI1D4hEs)
3. [Goo Tuber charge demonstration, S3 Ver.10.0.0](https://splatoonwiki.org/wiki/File:S3_Goo_Tuber_charge_10.0.0.mp4) (audio track **not verified**)
4. [Nintendo/Squid Research Lab 2022 Charger promo](https://x.com/SplatoonNA/status/1523648989144489986)
5. [Official first-generation Splat Charger clip](https://www.youtube.com/watch?v=5i25MOeRny8)

YouTube game footage is often mixed with soundtrack, other players' weapon effects, editing and compression. **Unmodified gameplay audio ≠ isolated sound event**, and a waveform graph of game footage alone cannot prove a precise internal pitch parameter.

## Actual measurement of archived original samples (no video)
An independent local decoder read the Drive MP3s:
- `Wp_Charger_HoldNoise_00.mp3`: 6,313 encoded bytes, 0.235s MP3 nominal, about **0.200s decoded PCM**, SHA256 `a0fad6aa3d67f6e0a0ec7a27490f2de273c95c733575f57432d5d746c8a0c6f0`.
- `Wp_Charger_HoldNoise_Heavy_00.mp3`: 10,702 encoded bytes, 0.418s MP3 nominal, about 0.375s decoded PCM, SHA256 `bf195dee1f2ef39e02a2c5f6ae179258008e81157059e10521d1c3bc96f5d655`.
- `Wp_ChargeKeepReady_00.mp3`: 5,805 bytes, 0.216s nominal MP3, 0.183s decoded PCM, SHA256 `cd0d4c7f699c7d43b770413ceac84db1a5070d7d1b8cc521c2dfc78e751605e6`.

In an intentionally *synthetic* local test recording with the original `HoldNoise` source embedded at exactly **1.370 seconds** under noise, the high-pass filtered cross-correlation routine recovered **1.370 seconds** with normalized correlation **0.7967**. This test establishes signal matcher behavior **only**, not any Nintendo recording, original pitch curve, or gameplay clip.

Tested INKWAVE recorded MP3 audio previews on 20ms RMS windows, defining an abrupt rise as current-window RMS > 2.5 × previous-window RMS:
- 1x repeated source preview: **12** abrupt rises in the rendered preview.
- Prior abandoned 0.01→1× Source/GMod-based proxy: **10**.
- Derived continuous source preview: **0**.

These values depend on the preview durations and clip processing; they are **not an independent gameplay measurement** and cannot be called a Nintendo reference. Earlier comments claiming original recording pitch sweeps are *not verified*.

## Implementation and limitations
- `.github/workflows/inkwave-charger-video-waveform.yml`: temporary PR-only workflow uses an isolated Python venv for `yt-dlp` plus optional direct Inkipedia media fetch, FFmpeg real-waveform/spectrogram production, and per-20ms RMS. Avoids committing or uploading third-party raw audio and video. Results/diagnostics are uploaded as 2-day GitHub Actions artifacts.
- `tools/audio/compare-charger-video-waveform.py`: 8kHz 450–3,400Hz audio conditioning, 20ms RMS CSV, FFT normalized template matching for four archived Charger HoldNoise families and one original ready clip. Tests fixed pitch factors 0.8, 0.9, 1.0, 1.1, 1.2; these are *measurement candidates*, not assumed Nintendo curves. `comparison.json` labels >0.55 only `candidate_requires_listening`, never `verified_sound_event`.
- Perceptual fix Draft [#1740](https://github.com/rhgrive3/actions/pull/1740) uses a source-derived ~560ms overlap-added loop and a **provisional authored 0.86–1.12× rate**. It is not a recovered original sound design. **Keep Draft** pending audio capture, scene isolation, and A/B review.
- Research Draft [#1752](https://github.com/rhgrive3/actions/pull/1752) is the only PR containing these tool scripts and workflows. Do not merge the research workflow into main.
- Initial Actions capture run [#39631622355](https://github.com/rhgrive3/actions/actions/runs/39631622355) failed before video download due Python-managed system package installation error (no derived video waveform).
- An intermediate workflow revision contained a YAML indentation error; fixed. Updated venv-based workflow now syntactically recognized by GitHub. **Last-known latest capture run** [#39657179185](https://github.com/rhgrive3/actions/actions/runs/39657179185) was queued with no artifacts at report creation. This state must be rechecked; it is not permanent evidence of failure.

## Research acceptance gates

1. Confirm media source matches Nintendo Splatoon 3 and actual Charger family, plus exact meaningful chart segment and audio track.
2. Confirm source signal can be reasonably attributed to charge, not non-charge noise/BGM/shots; compare an isolated or quiet period and off-event negatives.
3. Record source/video file provenance, analyzed time bounds, 20ms RMS, time-frequency plot, at least two consecutive charges where possible.
4. Find candidate original source correlation with realistic resampling/no invented SLINK curve; show uncertainty, confounders and negative controls. Do not extrapolate a precise pitch function from a single mixed recording.
5. Compare this verified evidence to Draft #1740 and adjust only demonstrably wrong parts; tests + CI green + human listening validation required before main merge.

Copyright: no third-party gameplay footage, audio files or new Nintendo assets are included or redistributed by this research branch.


## 2026-10-22: captured GitHub artifact readback, not just job status

[Latest inspected capture run #39658586775](https://github.com/rhgrive3/actions/actions/runs/39658586775) completed with `conclusion=success`, **but had zero extracted game audio**. I downloaded artifact `charger-reference-video-waveforms` (id 12377015002; 1,656 bytes) and read all files. Its ZIP contained **only** `setup.log`, `fetch.log` and `sources.tsv`, with **zero WAV, waveform PNG, spectrum PNG, correlation JSON or RMS CSV**. Python venv installations of yt-dlp 2026.08.19 and numpy 2.5.4 were successful. Source-by-source diagnostic log:

| Source | Observed result | Evidence classification |
| --- | --- | --- |
| Inkipedia S3 Goo Tuber source `Special:Redirect/file/...` | `curl: (22) HTTP 403` | CDN access rejected; video audio track not checked |
| S3 gameplay YouTube `Q0gbI1D4hEs` | `Sign in to confirm you’re not a bot` | Download blocked before decoding |
| S3 no-commentary YouTube `FR10kogkwY8` | Same anti-bot rejection | Download blocked before decoding |
| X SplatoonNA tweet `1523648989144489986` | `No video could be found in this tweet` | Incorrect/unusable video referent |
| S1 YouTube `5i25MOeRny8` | Same anti-bot rejection | Download blocked before decoding |

**Do not cite `success` as proof of actual source waveforms.** Corrected the research workflow to require BOTH at least one decoded waveform PNG and a source-comparison JSON before reporting success. When no video can be fetched, mark the run failure, preserve diagnostic artifacts via `if: always()`, and avoid guessing game-pitch parameters or trying to evade site protection.

### Stronger official historical reference identified (not analyzed)

Independent [Nintendo/KADOKAWA soundtrack tracklists](https://store.kadokawa.co.jp/shop/g/g4541993024681/) establish that original **Splatune (2015) Disc 2 Track 25** includes the pre-rendered **`SE：スプラチャージャー` / `SFX: Splat Charger`**, 7 seconds according to [MusicBrainz's official release catalog](https://musicbrainz.org/release/a381a36f-a55d-46a0-9715-7b0283f433da). [Splatune 2 (2017)](https://splatoonwiki.org/wiki/Splatune_2_(Splatoon_2_Original_Soundtrack)) also contains an SFX: Splat Charger entry. They can supply **historical source-composed demonstration references** if legitimately obtained and actually decoded, not proof that S3 11.3.0 uses identical sound event graphs. The [Splatune 3 tracklist](https://splatoonwiki.org/wiki/Splatune_3_(Splatoon_3_Original_Soundtrack)) includes a Splattershot and other sound effect showcases but no named Splat Charger sound-effect track in that release.

The video-vs-INKWAVE waveform parity assessment remains blocked by **no decoded actual gameplay recording**. The original MP3 vs generated INKWAVE analysis remains valid but is not first-party in-game audio.
