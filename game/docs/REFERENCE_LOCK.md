# REFERENCE_LOCK

| Field | Value |
|---|---|
| TARGET_GAME | Splatoon 3 (Nintendo Switch / Switch 2) |
| REFERENCE_VERSION | **Ver. 11.3.0** (released 2026-08-19) |
| Verified via | Nintendo Support "How to Update Splatoon 3" (update history) + gonintendo / miketendo64 patch-note mirrors, checked 2026-09 during this session. Ver. 11.3.0 is the newest listed; no 11.4.0 found. |
| TARGET_MODE | Turf War / ナワバリバトル, 4 vs 4, 3:00 |
| TARGET_STAGE | Scorch Gorge / ユノハナ大渓谷 (default – no prior stage lock existed) |
| TARGET_WEAPONS | Splattershot, Splat Roller, Splat Charger |
| PLAYER_COUNT | 1 human + 7 AI (network-ready simulation split, see ARCHITECTURE.md) |

## Version-relevant systems checked
- **Flow Aura** (Ver. 11.0.0): gained by consecutive splats within a short period; short duration. Implemented as a visual ring + HUD glow (2 splats within 8 s → 10 s aura). Exact trigger window / buff effects are not published → confidence LOW, see KNOWN_DIFFERENCES.md.
- **Health indication**: a small marker appears when damaged (implemented as a thin bar below the reticle only while damaged).
- Ver. 11.0.x / 11.1.0 / 11.2.0 balance notes affect blasters, stamp special and matchmaking — none change Splattershot / Splat Roller / Splat Charger base kits, so Ver. 9.x–10.x published frame data for these three still applies.

Do not change REFERENCE_VERSION without re-checking the update history and updating REFERENCE_MATRIX.md.
