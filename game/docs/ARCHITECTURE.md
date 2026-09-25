# ARCHITECTURE

```
src/
  App.tsx                  React shell: BOOT → MAIN MENU → WEAPON SELECT → GAME (HUD/RESULT)
  ui/HUD.tsx               HUD, touch controls, result screen, debug panel
  game/Game.ts             Orchestrator: fixed-step loop (60 Hz sim, accumulator, render interpolation alpha),
                           match flow (INTRO→BATTLE→TIMEUP→RESULT), events wiring, quality tiers, dynamic resolution, bench stats
  game/data/tuning.ts      All movement/camera/health/ink/match constants (frame data → seconds)
  game/data/weapons.ts     Data-driven WeaponDefinition (fire/projectile/damage/paint/spread/movement + roller/charger profiles)
  game/physics/World.ts    AABB collision world: per-axis sweep + step-up, slab raycast, LOS, micro-step ramps
  game/ink/InkSystem.ts    GPU ink: floor RT (world-XZ projection 1024x2048) + wall tile atlas (16x16x128px);
                           batched instanced stamp pass w/ procedural splat shader; CPU mirror grid (128x256) for gameplay;
                           incremental live score; exact GPU readback at TIME UP; score-eligible mask
  game/stage/ScorchGorge.ts Blockout (point-symmetric), merged single-draw-call stage mesh with paint attributes,
                           ink-aware stylised shader, environment (sky, mesas, landmarks)
  game/entities/Player.ts  Character controller state machine (humanoid/swim/wall-swim/squid roll/jump/land/splat/respawn),
                           ink speed rules, enemy-ink damage, health/ink tank, body-yaw lag, jump buffer/coyote
  game/weapons/WeaponSystem.ts Pooled projectiles, camera-ray→muzzle aim resolution, Splattershot/Roller/Charger logic
  game/camera/CameraRig.ts Second-order-dynamics follow (separate horizontal/vertical), shoulder offset, collision pull-in, FOV/recoil/shake
  game/input/Input.ts      Floating stick / drag aim / gyro pipeline (permission, normalisation, bias, deadzone, smoothing) / keyboard+mouse
  game/ai/NavGrid.ts       Sampled 2 m nav grid w/ climb edges; A* with dynamic ink & danger costs
  game/ai/Bot.ts           Layered bot: perception (LOS, memory) → utility objective → path → steering → aim (reaction/error/lead) → weapon role
  game/render/CharacterModel.ts Procedural Inkling (head/eyes/tentacles/tank/weapon/squid) + procedural animation & morph
  game/vfx/Effects.ts      Instanced particle pool, projectile instancing, charger beams, laser sights
  game/audio/Sfx.ts        Synthesised WebAudio SFX
```

## Simulation / rendering split
`Game.simulate(dt)` mutates only Player/Weapon/Ink-CPU/AI state and is frame-rate independent. `Game.render()` reads state (prev/pos interpolation with alpha), flushes ink stamps to the GPU, drives camera & VFX. A future authoritative server can run `Player.update`, `WeaponSystem.update`, `Bot.update` and the CPU ink mirror headless; ink stamps are already compact events (`StampParams`).

## Renderer backend
Three.js `WebGLRenderer` (WebGL2). The ink system is written as a render-target pass (the WebGL2 path of the backend split). A WebGPU compute path was **not** implemented in this session (see KNOWN_DIFFERENCES.md); the `InkSystem` public API (`stampFloor/stampWall/flush/finalScore`) is the interface a `WebGPUInkBackend` would implement.

## Deviation from the prescribed stack
Three.js was used instead of PlayCanvas and custom AABB physics instead of Rapier to guarantee a fully working vertical slice within one session (no WASM loading risk, deterministic fixed-step collision). Everything is TypeScript + Vite as required.
