# INKWAVE Point Sensor / Tacticooler support and CPU profiling — 2026-10-10

Draft PR #1195. Standard seven weapon choices and source-verified kits remain unchanged. An **optional** Recon Training Kit is selectable using `?supportKit=1`. It reuses the existing INKWAVE Shooter main and must NOT be claimed to reproduce an H-3 Nozzlenose.

## Point Sensor (#710)
Source thresholds: 45% ink, 150 frames (2.5s) field, 480 frames (8s) mark. The support sub traverses actual WeaponRunner release, Projectiles throw/flight/contact, and team-scoped `revealedUntil[team]` with local owner and timeout. Its position/throw-speed world-unit conversion is **provisional**; no authoritative S3 physical-range match is asserted. Packets are validated against sending owner, life, sequence, stage, target and declared weapon; ghost sensors cannot cause damage or turf paint.

## Tacticooler (#835)
Stand lasts 15s, drink 17s. One eligible local same-team human-form actor collects a drink per stand. Buffs are independent AP floors, not additive: Run/Swim 29; Quick Respawn, Special Saver, Quick Jump, Action Intensify and Ink Resistance 57. Actor-local gear refresh occurs immediately on pickup/expiry. In S3 Ver2.1.0 drink QR/Saver benefits remain effective under Respawn Punisher/Haunt, while those penalties are still charged. Source-engine physical range and final native S3 animation remain unverified; stand model is provisional.

## Real-device bot-paint CPU probe (#861)
Open the game with `?profileBotPaint=1` in a representative Turf/Boss session. In the browser console call `__inkwaveBotPaintProfile.reset()`, play a bot-heavy passage, then call `__inkwaveBotPaintProfile.snapshot()`. It returns calls, calls/s, CPU milliseconds, CPU-ms/s, by-mode breakdown and browser user agent. It does not invent GPU FPS, battery, or temperature readings; it never transmits collected data. Native deterministic baseline/cached comparisons are kept as separate evidence.

## Evidence and bounds
- Nintendo S3 Version 2.1.0 RP/Haunt/Tacticooler update: https://en-americas-support.nintendo.com/app/answers/detail/a_id/61257
- S3 Point Sensor: https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/ポイントセンサー
- Tacticooler mechanics: https://splatoonwiki.org/wiki/Tacticooler
- Explicitly unverified: Nintendo exact projectile physical scale, standard H-3 main behavior, real mobile thermal/FPS and jitter/loss-heavy two-peer online parity.

Keep #710, #835, #861 Open until those acceptance conditions have evidence. No change to #401, #1083, or direct main merges.
