# INKWAVE Point Sensor / Tacticooler support and CPU profiling — 2026-10-10

Draft PR #1195. Standard seven weapon choices and source-verified kits remain unchanged. An **optional** Recon Training Kit is selectable using `?supportKit=1`. It reuses the existing INKWAVE Shooter main and must NOT be claimed to reproduce an H-3 Nozzlenose.

## Point Sensor (#710)
Direct 11.3.0 extracted table: `WeaponPointSensor.game__GameParameterTable.json` SHA256 `57d0ab596ccdc9cd2e8da079ba4a169fc87aee36aeba079aafd81894d78bac03`. InkConsume .45 (45 tank points), InkRecoverStop 75F, AreaParam.Distance low/mid/high 6/6/6; MarkingFrameSubSpec 480/720/960F (8/12/16s), and SpawnSpeedZSpecUp 1.38/1.64/1.87 per 60Hz frame (82.8/98.4/112.2 world-unit/s under the existing conversion). The field remains 150F (2.5s) pending corroboration from the omitted table. The support sub traverses actual WeaponRunner release, Projectiles throw/flight/contact, and team-scoped `revealedUntil[team]` with local owner and timeout. Its position/throw-speed world-unit conversion is **provisional**; no authoritative S3 physical-range match is asserted. Packets are validated against sending owner, life, sequence, stage, target and declared weapon; ghost sensors cannot cause damage or turf paint.

## Tacticooler (#835)
Direct 11.3.0 extracted table: `WeaponSpEnergyStand.game__GameParameterTable.json` SHA256 `4222305b40620e1d269ce9119299419c4141e496ebf9e0cba069534932306c7d`. PutFrame=900F (15s), Yagura=450F, PowerUpFrame low/mid/high 1020/1290/1500F (17/21.5/25s) with the repository's validated gear-AP curve; ServeAreaRadius=7, ServeAreaHeightDown=0, ServeAreaHeightUp=3, VanishDistance=1.8, SpecialReduceFrame=600F. The implementation uses the source vertical cylinder rather than a fabricated symmetric under-floor pickup. One eligible local same-team human-form actor collects a drink per stand. Buffs are independent AP floors, not additive: Run/Swim 29; Quick Respawn, Special Saver, Quick Jump, Action Intensify and Ink Resistance 57. Actor-local gear refresh occurs immediately on pickup/expiry. In S3 Ver2.1.0 drink QR/Saver benefits remain effective under Respawn Punisher/Haunt, while those penalties are still charged. Source-engine physical range and final native S3 animation remain unverified; stand model is provisional.

## Real-device bot-paint CPU probe (#861)
Open the game with `?profileBotPaint=1` in a representative Turf/Boss session. In the browser console call `__inkwaveBotPaintProfile.reset()`, play a bot-heavy passage, then call `__inkwaveBotPaintProfile.snapshot()`. It returns calls, calls/s, CPU milliseconds, CPU-ms/s, by-mode breakdown and browser user agent. It does not invent GPU FPS, battery, or temperature readings; it never transmits collected data. Native deterministic baseline/cached comparisons are kept as separate evidence.

## Evidence and bounds
- Nintendo S3 Version 2.1.0 RP/Haunt/Tacticooler update: https://en-americas-support.nintendo.com/app/answers/detail/a_id/61257
- S3 Point Sensor: https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/ポイントセンサー
- Tacticooler mechanics: https://splatoonwiki.org/wiki/Tacticooler
- Explicitly unverified: Nintendo exact projectile physical scale, standard H-3 main behavior, real mobile thermal/FPS and jitter/loss-heavy two-peer online parity.

Keep #710, #835, #861 Open until those acceptance conditions have evidence. No change to #401, #1083, or direct main merges.

## Reproducible checks

Focused PR test: `.github/workflows/inkwave-reopened-six.yml` (the native composed Actor/WeaponRunner/Projectiles, map, 2-peer event replay, gear/death interactions, source low/mid/high tiers, roller wall and CPU-scanning paths). Separate full `validate` and browser matrix must also pass before marking complete.
