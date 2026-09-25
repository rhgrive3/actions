# AI_SPEC — 7 bots

Layers (Bot.ts): **Perception → Strategic (utility) → Tactical (goal/path) → Movement (steering) → Aim → Weapon**.

- Perception: LOS ray from eye to enemy centre, range 34 m; submerged squids on own ink beyond 7 m and slower than 4 m/s are invisible. Target memory: last seen position, forgotten after 3 s. Reaction time = `seenSince` must exceed difficulty reaction before firing (normal 0.32 s).
- Strategic utility every 0.25–0.4 s: ATTACK (visibility, range, health, ink, role bonus), PAINT (unpainted/enemy coverage within 6 m via CPU grid, endgame +0.5 when < 35 s), RETREAT (health < 40 % or ink < 10 %), HOLD (charger perches). Roles: shooter prefers central paint points; roller prefers flank points (|x| > 12) and dives to 1.5 m; charger holds perch (0,6.5,±25), ledge (±21,5,±24) or mid, backs off under 5 m.
- Navigation: 2 m sampled grid (NavGrid.ts) with step/drop/climb rules; A* costs = distance × ink factor (own 0.5 / none 1 / enemy 2.6) + danger (decays, added where splats happen). Re-path every 0.9–1.4 s or on goal change; low-frequency planning + per-tick steering to the next node. Climb edges: bot paints the wall (fire) then swims into it.
- Aim: yaw tracked with gain 7/s (normal), pitch with the same gain; lead prediction 0.6 × distance-scaled; bounded random error (7.5 % rad) refreshed every 0.25–0.55 s, larger for the first second of tracking; shooter arc compensation with distance. Not an aimbot: error + reaction + limited turn rate.
- Weapon per role: shooter bursts (65 % long bursts) in range, paints the ground ahead while walking on non-own ink; roller taps flick < 3.2 m, vertical flick 3.2–8.5 m (5 %/tick), rolls on non-own ink or when chasing < 12 m; charger charges to full (0.45 if < 5 m), paints lines toward objectives occasionally, stores charge when diving.
- Swimming: swims on own ink when not engaging / low ink / retreating; refuses while flicking or charged.
- Stuck handling: 1.2 s without motion → jump, re-path, new random paint goal.
- Difficulty tables: easy / normal / hard (reaction, aim error, tracking gain, prediction, burst discipline).

# PERFORMANCE (design targets; measured numbers go to DEVELOPMENT.md)
Budgets: ≤ 16.7 ms/frame mid-range phone. Draw calls: stage 1, sky 1, mesas 40 (could be merged), props ~8, characters 8×~40 meshes (Lambert; candidate for merge), particles 1, projectiles 1, beams ≤ 4, lasers 2 → typically 120–200 (ok vs. 100–200 target). Textures: 24 MB ink RTs. JS heap: pooled projectiles/particles/stamps; no per-tick allocations in hot loops except AI path arrays (bounded).
Quality tiers: LOW (scale 0.6, 300 particles, DPR ≤ 1.5), MEDIUM (0.8, 600, DPR ≤ 2), HIGH (1.0, 900). Auto-detected from UA/deviceMemory/GPU string; dynamic resolution steps −0.1 when > 19 ms for 2 s, +0.1 when < 13 ms for 6 s (min 0.5). UI stays at CSS resolution.

# MOBILE_MATRIX
| Device class | Expected tier | Notes |
|---|---|---|
| iPhone 12+ / Safari 16+ | HIGH/MEDIUM | gyro needs permission tap (GYRO button); fullscreen unavailable → use Add-to-Home-Screen |
| Pixel 6+/ Galaxy S21+ Chrome | MEDIUM→HIGH | orientation lock works in fullscreen |
| Adreno 5xx / Mali-G5x / ≤ 3 GB | LOW | 0.6 scale, 300 particles |
| Desktop | HIGH | WASD + mouse (pointer lock on click) |
Required: WebGL2, Pointer Events, WebAudio. Not required: WebGPU, DeviceMotion (optional).
