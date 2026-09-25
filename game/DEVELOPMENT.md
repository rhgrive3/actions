# DEVELOPMENT.md — hand-off state (read this first)

## What this is
A browser-playable 3D Turf War (4 v 4, 1 human + 7 bots, 3:00) reconstructing Splatoon 3 Ver. 11.3.0 mechanics on Scorch Gorge with Splattershot / Splat Roller / Splat Charger. Landscape mobile first, desktop fallback. All assets/code original.

## Current implementation state
- **Complete & building** (`npm run build` → `dist/index.html`, single file, 243 KB gz): full match flow, movement controller, camera rig, GPU ink + scoring, 3 weapons, 7 bots with nav + utility AI, procedural characters/weapons/animation, VFX, synthesized audio, HUD/touch/gyro, quality tiers, debug panel, bench logging.
- **Not yet done in this session**: running it in a real browser (the agent had no browser/GPU). Everything after "build" in the pipeline (RUN → INSPECT → PLAYTEST → BENCHMARK → COMPARE) is the first job of the next session.

## Architecture
See docs/ARCHITECTURE.md. Entry `src/App.tsx` → `src/game/Game.ts`. Sim is fixed 60 Hz, render interpolated.

## How to run
```
npm install
npm run dev      # open on phone in landscape (same LAN) or desktop
npm run build && npm run preview
```
Desktop: WASD, mouse (click canvas to lock), LMB fire, Shift/E swim, Space jump, Q/RMB vertical flick, `` ` `` or F3 debug. Touch: left half stick, right drag aim, INK/SQUID/JUMP/(V-FLICK) buttons, GYRO + RECENTER top-left. Console: `__game` (Game instance), `__game.benchmarkSummary()`.

## Done (high level)
See TODO.md `[done]` items (≈ 330 of 510). Key: Player.ts state machine, InkSystem.ts, WeaponSystem.ts, CameraRig.ts, Input.ts, Bot.ts/NavGrid.ts, ScorchGorge.ts, CharacterModel.ts, Effects.ts, Sfx.ts, HUD.tsx.

## Not done / known gaps
docs/KNOWN_DIFFERENCES.md (20 items). Biggest: no on-device verification, stage art pass, skinned characters, Squid Surge, subs/specials, WebGPU path, lightmaps.

## Known bugs / risks (desk-check only — verify first)
1. Ramps are micro-steps (0.22 m): possible slight vertical jitter while walking on slopes; camera vertical spring should hide it.
2. Gyro axis signs for landscape-left vs landscape-right were reasoned, not tested.
3. Camera may clip when the pivot itself is inside geometry (origin-inside-box rays are ignored).
4. `finalScore()` allocates a temporary RT once per match (fine) — if WebGL context is lost mid-readback the result falls back to CPU score? (No — add try/catch fallback to `ink.liveScore`.)
5. Roller tap detection is 160 ms: very slow taps on touch become rolls (tune if players complain).
6. Bot climb behaviour relies on painting the wall from the base; chargers may be slow at it.
7. Character meshes are ~40 draw calls each (8 chars ≈ 320 draws worst case if all visible) — merge or reduce if draw calls exceed budget on device.

## Current biggest problem
No runtime verification yet. Second: stage is a blockout (biggest fidelity gap after verification).

## Fixes made during systems review passes (this session)
- Shared collision result leaked between players (`_res.groundBox`) → per-player `groundBox`.
- Character/squid model faced +Z (eyes/tank backwards) → corrected to −Z convention.
- Two ramps were built in the wrong direction (left-lane descent, right-ledge inner ramp).
- Final turf readback used the canvas clear colour (would count sand as yellow) → clear to transparent black.
- Nav goals at y=0 could not resolve to nodes → `nearest(ignoreY)` for goals; paint points get real heights.
- Touch buttons were overwritten by keyboard polling → buttons OR keyboard.
- Pointer lock requested without gesture (promise rejection) → request on click during battle.
- Wall tile atlas overflow (>256 faces) → buried faces culled.
- Per-particle colour allocation removed; NaN quaternion from a stray placeholder removed.
- Shooter first-shot delay logic simplified to a deterministic 3 f raise.

## Last executed tests
- `npm run build` (Vite 7 / TS strict): PASS, 47 modules, no warnings besides bundle size inline.
- Runtime tests (TEST_PLAN.md A–C): **NOT RUN** (no browser available to the agent).

## Benchmark
Not measured. Design estimates in docs/AI_SPEC.md → PERFORMANCE section. First measurement: open debug panel on device, play 60 s at mid, run `__game.benchmarkSummary()`; paste result here.

## Next items to fix (ordered)
1. Run in browser; capture console; fix any exception. Check the stamp shader compiles (WebGL2 GLSL) and ink appears on first shot.
2. Playtest all 3 weapons through a full match (TEST_PLAN C4–C9). Confirm `[TurfCalc]` parity < 1 %.
3. Bench on a mid-range phone; if draw calls > 200 merge mesas (`ST-047`) and character meshes (`MD-024`).
4. Tune movement/camera against footage (CH-038/039/040, CA-033), then update REFERENCE_MATRIX confidence.
5. Stage art & landmark pass (ST-032/033), then re-score SCORECARD.md.
6. Add Vitest harness for pure sim tests (TS-038) using `Player.update` with a mock world.

## Update discipline
After each major change: update this file's state/bugs/tests/benchmark sections, tick TODO.md items, re-score SCORECARD.md with evidence.
