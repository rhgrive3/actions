# INKWAVE sound-effect audit: charging, direct hit, splat, and two-stage Spinner
Date: 2026-10-19 JST
Reference source: `rhgrive3/actions` main `d9a44d6cd3a243c69faf44daabfabdfd7ec62c84`, S3 11.3.0 GameParameterTable, and third-party clips retained in Actions run #39155915495.

## Confirmed INKWAVE discrepancies (not guesses about native Nintendo sound mapping)
1. Charging: the decoded `Wp_Charger_HoldNoise_00.mp3` (~0.235 s) is looped as the generic `charge` event. The project has a `Wp_ChargeKeepReady_00.mp3` clip (~0.216 s). The correct original charge-rise transition/SLINK sequencing/pitch and per-frame trigger mapping remain **unverified**; merely looping the hold file does not demonstrate fidelity.
2. Body hit: `inkwave-public/src/main.js` listens to `hit` and plays the synthesized global `hit_marker` sound. The installed audio adapter changes its pitch for Blaster hit classification; it does **not** assign source-verified Charger direct-hit sound data.
3. Splatted target: the same main.js listens to `splatted` and plays synthesized `splat_enemy`. No separate recorded Nintendo kill-confirm sound was established in the 268-event `real-s3-installed.json` manifest. A Shooter or Charger `fire_full` MP3 does not include a proven unique splat notification.
4. Recorded shooter audio: Safari `Window.fetch` bug was separately fixed by PR #1611, and first-shot preflight was handled by #1602. Do not undo them or introduce author-made replacement sounds for recorded S3 weapons.

## Two unverified public comparison recordings
| Source clip | Public reference page | Size | Duration | SHA256 |
|---|---|---:|---:|---|
| direct-hit-upload.mp3 | https://tuna.voicemod.net/sound/7b1057ff-4a65-4125-9c9e-dc09df1ca87c | 11,136 B | 0.696s | `3001fbea582cc2c5b5b00f752d852eb36a637eaab185fd11b6107c3657a6e3d2` |
| charger-hit-upload.mp3 | https://tuna.voicemod.net/sound/7efadaf2-a44f-4e3b-9588-653c21aa7440 | 17,599 B | 1.097s | `fd75c4c64a9153e4f3801299af9c1aae970c0c1818b5d4763a3a2b858e3b0487` |

These clips were fetched into the private Actions `audio-reference-candidates` artifact and verified as MP3 files. They have **not** been established to be unaltered Splatoon 3 Ver.11.3.0 game assets, and distribution rights are unknown. Do not silently install them as verified Nintendo raw files or push them into the public shipped `s3-real` bank.

## Spinner source charge stages (60 Hz frames)
| Source Actor | Japanese weapon | First | Second | Recharge during stream |
|---|---|---:|---:|---|
| WeaponSpinnerQuick | スプラスピナー | 18F | 27F | not declared |
| WeaponSpinnerStandard | バレルスピナー | 48F | 72F | not declared |
| WeaponSpinnerHyper | ハイドラント | 120F | 150F | not declared |
| WeaponSpinnerDownpour | クーゲルシュライバー | 1F | 100F | true |
| WeaponSpinnerSerein | ノーチラス47 | 38F | 76F | true |
| WeaponSpinnerHyperShort | イグザミナー | 60F | 120F | false |

Locally ran actual fixture of six current-source spinners (native+catalog). All hit first and second stages, reached charge=1 with ZR held, entered streaming on release, and allowed midstream recharge **only** where source `EnableRecharge=true`. Added `patches/splatoon3/tests/spinner-six-two-stage-source.test.mjs` to prevent regressions. This does **not** prove HUD art, alternate kit dispatch, unusual control paths or actual hardware response.

## Pending, release-blocking work
- Identify the legitimate source event data for the **charger charge-rise**, full charge completion, direct-hit confirm, and splat-confirm distinct from generic hit and target death. Nintendo's XLink/SLINK event timing and verified MP3 hashes must distinguish independent clips.
- Obtain the needed authentic/authorized sounds with provenance; map only events whose actual source is verified. Do not invent pitches/timing or import random third-party clips without verification.
- Drive binary upload of the downloaded comparisons is currently blocked by a connector type mismatch (a connector file-reference object is rejected as a string); an empty research folder was created at https://drive.google.com/drive/folders/13DK-NwVCXJVtB9JHcO2WGJ-9uG1o24JV. The existing public S3 folder contains the known original `Wp_*` recordings but cannot be comprehensively searched via the connector's 1,000-item folder page.
- Reproduce specific Spinner's alleged missing second-stage effect *on device*. Underlying six-source charge progression currently passes.
- Review, exact-head CI, source permissions, and integration to current main+Pages.

## 2026-10-19 source inventory follow-up
- The locally available original 2022 381-MP3 four-part archive was inspected file-by-file. Its "Charger" matches: 14 names. All generic "Hit" matches are only `Wp_Explosion_Blaster_HitGround_00.mp3` and `Wp_BombCurling_WallHit_00.mp3`; generic "Kill" matches: **zero**. Therefore these 381 files **cannot** substantiate a claimed `charger_direct_hit` or `enemy_splatted` original recording. `Sp_SuperHook_Splat*` describes a special, not global splat confirmation. Do not mislabel it.
- `Wp_Charger_HoldNoise_Heavy_00.mp3` **does** exist in the 2022 private four-part research ZIP, with SHA-256 `bf195dee1f2ef39e02a2c5f6ae179258008e81157059e10521d1c3bc96f5d655` and 10,702 bytes. It is **not** in the shipped `s3-real` or `real-s3-installed.json`. Its exact SoundActor/SLink event relationship to `WeaponChargerLong` still requires authoritative confirmation. Do not claim the current generic `HoldNoise_00` is appropriate for all 5+ Chargers.
- Existing source MP3s `Wp_Charger_HoldNoise_00.mp3`, `Wp_ChargeKeepReady_00.mp3`, and `Wp_ChargerNormal_Shot_Full_01.mp3` were copied for source-to-game comparison into the **research-only private Drive folder**: https://drive.google.com/drive/folders/13DK-NwVCXJVtB9JHcO2WGJ-9uG1o24JV. None of these are verified to include the separate hit or splat-confirm event.
- The actual Spinner missing two-stage display cause is in `patches/local-quality/splatling-reticle.mjs` reading legacy Barrel `firstChargeTime` and `burstFirst` instead of catalogue `WeaponParam.ChargeFrame_First` and its `catalogState.streamTime`. This is independently fixed/merged in **PR #1623**. Its first attempt touching raw HUD was reverted; the existing two-ring native/quality adapter is preserved.
- Community sources corroborate that Chargers/Blasters have a separate high-pitched direct-hit sound (Inkipedia Damage), and a charger full-charge direct can chime without splatting, whereas partial lethal shots need not chime. This confirms direct-hit-vs-splat separation as a design requirement, but supplies **no canonical source filename or Nintendo SLINK parameters**. Reference: https://splatoonwiki.org/wiki/Damage ; https://splatoon-torikara.com/archives/29861
