# TEST_PLAN

Runtime is browser-only in this environment (no headless GPU available to the agent), so verification is split into (A) static/type checks done by the build, (B) console-observable checks the game emits, and (C) manual golden procedures with expected values. `window.__game` exposes the Game instance for console-driven tests.

## A. Build / typecheck
`npm run build` — Vite + TS strict; passes (see DEVELOPMENT.md).

## B. Automatic / console
- `[TurfCalc] GPU readback vs CPU mirror` printed at TIME UP — parity check, expect |Δ| < 1 %.
- `__game.benchmarkSummary()` — avg fps, 1 % low, sim/ai/ink/render ms, draw calls, tris, heap (sampled 2×/s during BATTLE).
- Debug panel (`dbg` / `` ` ``): FPS, frame ms, draw calls, triangles, physics/AI/ink ms, backend, render scale, player velocity, state, yaw/pitch, weapon, ink, score, bot states; quality switch.

## C. Golden procedures
1. **Shooter fire rate**: hold fire 10 s from full tank → `__game.human.wr.shotCount` ≈ 97 before ink runs out (ink 0.92 %/shot → 100 % lasts 108 shots); interval 6 f.
2. **Movement**: `__game.human.moveSpeedNow` → 4.80 running on unpainted, 9.60 swimming on own ink, 1.20 on enemy ink, 1.80 squid on unpainted.
3. **Jump**: airtime ≈ 0.5 s (v0 6.9 / g 22 up, ×1.15 down) — count via `state` transitions JUMP→FALL→LAND.
4. **Wall climb**: paint plaza front wall from gorge floor, hold SQUID + forward → state SWIM_WALL → pops over at top.
5. **Charger**: tap → 40 dmg on bot (check bot `health`), full (1 s) → splat from 100; range ≥ 14 m; stored charge after diving ≤ 1.5 s.
6. **Roller**: tap → hflick 8 f later; airborne tap → vflick; hold 0.16 s → roll; roll over bot after 10 f → 125 dmg.
7. **Turf scoring**: paint only walls → score unchanged; paint floor → score rises; grate/spawn → unchanged.
8. **Match flow**: INTRO 3 s → BATTLE 180 s → TIMEUP → RESULT with winner; REMATCH restarts with cleared ink; CHANGE WEAPON returns to select.
9. **Respawn**: splat → 8.5 s → spawn, 2 s blink invulnerability.
10. **Camera golden**: input script (0–1 s W, 1–1.5 s yaw right, 1.5 s fire, 2.0 jump, 2.4 pitch down, 3.0 swim, 4.0 turn, 5.0 stop) — log `__game.rig.camera.position` per frame; compare against baseline JSON (to be captured on first run of the reference machine).
11. **Ink golden**: on the plaza, 20 shooter shots / 1 roller flick / 5 m roll / 1 full charger shot → screenshot floor; compare visually with baseline PNGs (to be captured).
12. **Stress**: 60 s at mid with all 8 fighting → heap stable (pooled), particles ≤ tier cap, projectiles ≤ 512, no console errors.
13. **Mobile**: landscape only prompt in portrait; stick + aim + buttons simultaneous (3 touches); gyro permission on iOS; resume from background clamps dt to 0.25 s; resize re-projects.

Status of each item is tracked in DEVELOPMENT.md → "Last executed tests".
