# INKWAVE ordinary-jump legacy-source calibration — 2026-10-08

## Direct source, not inferred from clip names

The user's Drive folder `Splatoon-Decomp-NTSC-thick-plus-Splatoon3-resources` contains
`Splatoon-public-sources-part-01-of-19.zip`; path within the ZIP:
`thick/model/Player00_anim.szs` (Wii U original `Dexx-io/Splatoon-Decomp` snapshot).

- Archive's embedded `SOURCE_INFO.txt`: `Dexx-io/Splatoon-Decomp` revision
  `9ef403d96f1a370bdd70434ce158a0c29879bfcf`.
- File SHA-256: `809ccb73b110953230e5611567f635cf487d53e1536e990d0c85fba136c71938`.
- Verified Yaz0 decompression, SARC container, BFRES FSKA animation entries
  (FSKA name offset +4, big-endian frame count at +0x10).

| Actual FSKA resource | FrameCount |
|---|---:|
| `Jump_Nrml00_St` / `Jump_Rllr00_St` | 5 |
| `Jump_Nrml00` / `Jump_Rllr00` | 21 |
| `Jump_Nrml00_Ed` / `Jump_Rllr00_Ed` | 15 |
| `JumpShoot_Nrml00_St` / `JumpShoot_Rllr00_St` | 5 |
| `JumpShoot_Nrml00` / `JumpShoot_Rllr00` | 21 |
| `JumpShoot_Nrml00_Ed` / `JumpShoot_Rllr00_Ed` | 15 |

These values prove **clip asset lengths and distinct weapon/action resources** for Splatoon 1.
They do not prove Nintendo's hold-button threshold, physics impulse, jump height,
gravity, whether clips play at 60 FPS, or Splatoon 3's curve.

## What is changed for Issue #890

The user explicitly allows Splatoon 1/2 reference data in lieu of Splatoon 3.
Accordingly `runtime/normal-jump-hold.mjs` now defaults to an explicitly
marked **S1-informed INKWAVE playability approximation**:

- Normal non-special humanoid jump accepts held B; releasing during early ascent
  reduces the current upward speed once, giving a short-hop trajectory distinct
  from a sustained hold.
- Editable `holdFrames=5`, `releaseRate=0.7` were **chosen as an INKWAVE
  calibration**, **NOT extracted Nintendo jump-physics coefficients**.
  In particular the `Jump_Nrml00_St` clip's 5F asset length does **not**
  establish the input-release cutoff.
- `profile.normalJumpHold` can explicitly disable or override the approximation.
  Verified-calibration profiles remain supported and require finite bounded inputs.
- Fixed-step accounting, jump serial, reset and activity gates prevent applying
  this to Super Jump, specials, wall climbs or already falling trajectories.

## Verification boundary

Added deterministic tests for short tap versus sustained input, explicit disable,
invalid parameter rejection and S1 clip provenance. **No executed tests,
Switch hardware results, exact S1 jump physics, S2 or S3 motion comparison
are claimed here.** Keep #890 open pending source-validated height/threshold
and multiple-surface/weapon regression.

This commit is stacked on Draft PR #1147 (base #1083) and does not modify
Nintendo animation binaries, main or PR #401.
