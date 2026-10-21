# Charger hold audio: failed S1 proxy and click-free recorded-sample sustain (2026-10-21)

## Problem reproduced
The old Charger charge-loop maps a very short 2022 S3 recording `Wp_Charger_HoldNoise_00.mp3` (decoded **0.200 seconds**, 44.1 kHz, encoded **0.235 seconds**) to a continuously looped `charge` event. The recorded onset is very strong in its first ~30ms (10ms RMS 0.019–0.031); the late tail fades almost to zero (last 10ms RMS 0.00022). Replaying that onset every 200ms produces an audible **click/reload-like repeated transient**, not a smooth charging tone. A second recording, `Wp_Charger_HoldNoise_Heavy_00.mp3`, is ~0.375 seconds decoded, with a similar heavily decaying envelope.

PR #1740 initially tried scaling Source/GMod's S1 community pitch equation `max(1,99*charge+1)` literally to the entirely different short S3 HoldNoise. **That was a poor audio-engineering choice and is now removed**. At 1% playback rate an original 200ms sample would last ~20 seconds before looping and its transient would be shifted into extremely low frequencies. The user reported a click, and **no Nintendo SLINK evidence** validated this translation.

## Direct recording and reference provenance
- Current `S3` PCM is decoded from user-provided 2022 audio archive in Drive: [Splatoon 3 SFX and Music](https://drive.google.com/drive/folders/1D7So33YcZJaU_W5eC_H8OMFnUxGA8lYJ). The current audio pack includes Normal, Heavy, Bamboo and Pump `HoldNoise` variants plus `Wp_ChargeKeepReady_00.mp3` for ready; the SHA-pinned original MP3 files are unchanged by this PR.
- The user's S1 decomp/public resources only confirm aal and SLink2 as sound systems, **not** a Nintendo Charger pitch or event graph.
- [SplatoonSWEPs `shared.lua`](https://github.com/zerokizo/splatoonsweps/blob/a74592726f38f26fd1d3a15ed315701068283847/lua/weapons/weapon_splatoonsweps_charger/shared.lua) describes an independent *fan reproduction*, using **10.894s** `aim.wav` as its continuous Charger source. That sample and its pitch curve are not interchangeable with 0.2-second S3 HoldNoise. We retain its qualitative idea of continuous progression, not its arbitrary extreme audio rates.
- **No true S1/S2/S3 SLINK retail pitch curve or layered source-event graph is available**. Statements of retail fidelity would be premature. The user's claim of related series sound design is a helpful hypothesis but does not supply missing parameter values.

## PR implementation
- New `charger-hold-sustain.mjs` deterministically creates one **~560ms** seamless `AudioBuffer` from overlap-added **50ms grains taken only from the softer interior** of the actual decoded recording. The loud onset and end silence are not retriggered. The output is a finite, cacheable sound design transformation, never a new oscillator or downloaded asset.
- Source boundary is made sample-continuous with a 5ms join. A global capped gain multiplier compensates for extracting the quieter interior without exceeding 3.2x. Audio remains in the original sample family.
- The existing soft Charger hold event gain (0.23) left the ready cue (0.68) up to ~18dB louder in the game mixer. Adjust **only** the Charger `charge` bed to 0.54 so the continuous charging motion remains audible beneath the short ready cue (approximately ~11dB contrast for the measured Normal source). This is a perceptual mix fix, **not** a claimed Nintendo level.
- Charge progress is read only from finite `actor.weaponRunner.charge`, clamped to 0..1. The playback rate stays near its natural recording rate and evolves monotonically from **0.86x to 1.12x** across one hold, with 35ms de-zipper smoothing. These two rate endpoints are **not Nintendo values**; they are an explicit *perceptual correction* to the invalid 0.01x..1x proxy.
- Missing actor charge uses 1x; every hold gets a fresh envelope. Existing `ready` and `fire_full` MP3 selection, Spinner motor playback, source hash checks, and real-only/no-synthetic-oscillator policy are preserved.
- CPU/memory: 1 short deterministic buffer derivation per decoded original source, WeakMap cached and reused by any simultaneous local/remote voices; one 50ms-granular precompute; no per-frame grain allocation or new voice on update. The decoded original asset and its cache remain intact.

## Quantitative local preview check
One-second hold segment with the same original source:
- Prior literal 0.01..1 S1 proxy playback: **6** RMS increases above 2.5x between consecutive 20ms windows; window-level coefficient of variation **1.08**.
- Original full-source 1x repetition: **4** such jumps; coefficient of variation **1.06**.
- Proposed sustained sample texture: **0** such jumps; coefficient of variation **0.36**.

These are *signal-level* discontinuity indicators, **not** claims that the actual ear or original game comparison is perfect. The simulation rendered a 1.5s charge with a 100ms fade-in, 40ms fade-out and original ready sound after completion.

## Tests and acceptance boundaries
`audio-v11-real-only.test.mjs` covers cache reuse, loop seam continuity, absence of original onset repetition, unmodified source samples, actual charge 0/0.5/1, no inferred charge from synthetic oscillator hints, monotone changes, unknown/NaN actor, hold restart, unchanged Spinner, unchanged catalog source manifests. Existing audio CI workflow runs all adjacent sound tests. Main cannot claim exact original Charger without first-party source event graph or an independently validated in-game sound recording.

### Copyright and publishing
This PR adds **no** source recordings to GitHub. User-provided source MP3s and independent sample packs retain their existing rights restrictions.
