# INKWAVE: Charger charging timbre, S1-derived community proxy (2026-10-21)

## Evidence hierarchy and hard limits

1. **Recorded 2022 S3 sources**: `Wp_Charger_HoldNoise_00.mp3` (encoded 0.235102s), `Wp_Charger_HoldNoise_Heavy_00.mp3` (0.417959s), `Wp_Charger_HoldNoise_Bamboo_00.mp3` and `Wp_Charger_HoldNoise_Pump_00.mp3` (0.33959s each); `Wp_ChargeKeepReady_00.mp3` (0.216s). Recorded MP3s come from the source-declared `Splatoon 3 SFX and Music` Google Drive archive and use installed SHA256-verified source data. **These are short sample components, NOT an isolated full charging-ramp recording.**
2. **Actual S1 resource evidence**: the user's Drive `Splatoon-Decomp-NTSC-thick-plus-Splatoon3-resources` contains public `Dexx-io/Splatoon-Decomp` thick resource snapshots with `GameConfigSetting`'s reference to **aal and SLink2**. The user's 19-part research ZIP explicitly lacks game RomFS/SLink graph data and playable source-code decompilation of the charger sound control.
3. **Independent S1-style fan implementation, explicitly NOT original Nintendo code**: `zerokizo/splatoonsweps` `lua/weapons/weapon_splatoonsweps_charger/shared.lua` has `PlayChargeSound()` playing `sound/splatoonsweps/weapons/charger/aim.wav` and requesting pitch `max(previousPitch, progress * 99 + 1)`. Its accompanying `charger.lua` declares the `aim.wav` recording and independent `beep.mp3` for completion. GitHub blob `aim.wav` is PCM mono 44,100 Hz / 16-bit, length **10.89415 seconds**, with a decreasing RMS envelope (roughly 0.070 at start, 0.041 at 5 seconds, 0.006 at 10 seconds). **This is not the same waveform as the short S3 HoldNoise MP3.** Source pitch units use **100 as nominal 1x playback**.
4. **Missing first-party evidence**: no actual `SLink2DB.bslnk` / `SLink2DB.szs` plus live gameplay parameter dispatch has been provided. Retail S1/S2/S3 pitch automation, layering, filters, and timing have **not** been recovered. The user states that sound design is shared across series; the exact pitch/volume controls nevertheless remain unverified.

## Concrete improvement on this branch

The INKWAVE v11 mixer is left in its **recorded-sample-only** playback mode. For an already-declared Charger `charge` recording with a live, finite gameplay `actor.weaponRunner.charge`:

- Source-unit pitch from the S1 *community implementation* is mapped to Web Audio sample playback rate `(1 + 99 * clamp(charge, 0, 1)) / 100`. This gives **0.01x (charge 0), 0.505x (charge 0.5), 1x (full)**. These are **community implementation values, not confirmed Nintendo values**.
- The requested rate is monotone while the loop remains alive, matching `max(previousPitch, requestedPitch)` in the community source. Each fresh loop restarts from the then-current gameplay progress. `setTargetAtTime` smoothing uses one nominal 60Hz frame, which is an **implementation de-zippering choice**, not a recovered retail smoothing constant.
- The old INKWAVE **`1 + charge * 1.5`** sound-parameter hint and catalogue **`0.66 + charge * 0.78`** are *not* treated as meaningful native Charger pitch values: only actual gameplay charge is read.
- Without a usable charge value, the verified source plays at its **natural 1x speed**. Other sound events, recorded Spinner motor pitch, full-charge ready cue, full-shot MP3, restart/cancel, remote, and original source hashes remain unchanged.
- Uses exactly one existing `AudioBufferSourceNode` and no new sample files or oscillators; per-frame parameter automation is skipped when progress has not increased.

**Caveat:** Applying a fan project's pitch mapping to a different short S3 recording can still produce audible artifacts or the wrong retail timbre. This is a **testable proxy**, not a verified perfect reproduction. Neither pitch/loop mode should be mislabeled "Nintendo SLINK-correct" until matched against a real source event graph or independent unmodified gameplay capture.

## Verification / acceptance

- Run `node --experimental-vm-modules --test patches/splatoon3/tests/audio-v11-real-only.test.mjs`.
- Confirm the same decoded Charger MP3 buffer is used at low/middle/full charge, and the old oscillator hint alone cannot change it.
- Confirm stale/invalid charge is ignored, pitch does not fall during a hold, stop/restart resets it, Spinner source remains at original pitch, original `charger_full` behavior is intact, and no synthesized samples are created.
- Run the existing Audio v11 workflow and production build. Once actual SLink2 `Pitch Curve` and its game parameter mapping can be verified, **replace this proxy with the recovered curve**. Use listening/A-B and device performance tests before claiming final parity.

## Direct source URLs

- [Original 2022 S3 research archive](https://drive.google.com/drive/folders/1D7So33YcZJaU_W5eC_H8OMFnUxGA8lYJ)
- [S1 source resource snapshot Drive](https://drive.google.com/drive/folders/1iAhs_iWB0jfPkAB3lgUT9le95T-B323b)
- [S1-style community charging implementation](https://github.com/zerokizo/splatoonsweps/blob/a74592726f38f26fd1d3a15ed315701068283847/lua/weapons/weapon_splatoonsweps_charger/shared.lua)
- [Community sound source assignment](https://github.com/zerokizo/splatoonsweps/blob/a74592726f38f26fd1d3a15ed315701068283847/lua/splatoonsweps/sounds/charger.lua)
- [Community `aim.wav` source, research only](https://github.com/zerokizo/splatoonsweps/blob/a74592726f38f26fd1d3a15ed315701068283847/sound/splatoonsweps/weapons/charger/aim.wav)
- [Nintendo XLink2/SLink format documentation](https://github.com/dt-12345/xlink2)
- [Existing INKWAVE unverified charge source audit](reports/inkwave-charge-hit-splatter-audio-audit-20261019.md)

**Rights:** No new third-party sound recording is added to or bundled by this change. Prior source-bank rights must be evaluated independently of a code change.
