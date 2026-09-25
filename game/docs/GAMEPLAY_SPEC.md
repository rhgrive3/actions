# GAMEPLAY_SPEC (Turf War, Ver. 11.3.0 basis)

Flow: BOOT → MAIN MENU → WEAPON SELECT → MATCH INTRO (3 s count) → SPAWN → 3:00 BATTLE → TIME UP ("GAME!", 2.5 s) → TURF CALCULATION (GPU readback) → RESULT (rematch / change weapon).

- 4 v 4. Team 0 (human + 3 bots, yellow) spawns at −Z, team 1 (blue) at +Z. Each team always has all three archetypes.
- Score = percentage of **score-eligible floor texels** owned by each team (walls excluded, grates/spawn excluded). Winner = larger share.
- Splat: HP ≤ 0 → SPLATTED (1.2 s anim) → respawn 8.5 s after splat, 2 s invulnerability. Kill credit: direct killer, else last damager within 4 s (assist tracking via `lastHitBy`).
- Falling below y = −3 → splat (void).
- Damage: 100 HP, recovery starts 60 f after last hit; slow standing, fast submerged in own ink.
- Enemy ink: 0.25× move speed, jump height 0.55×, 18 dmg/s capped at 40 per contact.
- Ink tank: 100 %; refills 3 s submerged in own ink, 10 s otherwise; refill delayed 20–45 f after firing depending on weapon.
- Health indication: thin bar below reticle appears only when damaged (< 99 HP).
- 1-minute warning with whistle; final 10 s tick.

See WEAPON_SPEC.md, CHARACTER_SPEC.md, CAMERA_SPEC.md, INK_SYSTEM.md, AI_SPEC.md for subsystems.

# CHARACTER_SPEC (movement)
States: HUMANOID_IDLE / MOVE / AIR, JUMP, FALL, LAND, SWIM_ENTER, SWIM, SWIM_FAST, SWIM_WALL, SQUID_ROLL, SPLATTED, RESPAWN (+ weapon phases in `WeaponRuntime`).
Parameters (tuning.ts): run 4.8 m/s (accel 32, decel 40), swim 9.6 (46/52), squid on unpainted 1.8, enemy ink 1.2, jump v 6.9 (squid 7.6), gravity 22 (×1.15 falling), step 0.55 m, air control 0.55, wall swim 5.2 m/s, detach push 1.6, swim enter 8 f / exit 6 f, squid roll 20 f (armour 12 f), body-yaw follow 14/s (18 while moving/firing, fast turn-in-place > 69°). Jump buffer 120 ms, coyote 90 ms.
Transformation: `squidBlend` morph — humanoid compresses (scale y→0.05, xz→1.35) while squid grows from compressed with overshoot; splash VFX + SFX on toggle; separate collision profile (h 0.35, r 0.28) with headroom check before standing.

# CAMERA_SPEC
Chain Player → AimRig (yaw/pitch, instant) → BodyFollow (second-order dynamics f=6 Hz horizontal, 3.2 Hz vertical; rising jump lags further) → CameraTarget (height 1.35 / swim 1.2, shoulder +0.55 right) → CollisionRig (ray pull-in, radius 0.25, min 0.9, snap-in / slow restore) → PresentationRig (recoil kick, shake, FOV 60°, −8° charger zoom, +3° swim fast) → Camera. Pitch −55°..+65°. Touch 0.32°/px, mouse 0.12°/px, gyro pipeline in Input.ts with recenter button.

# UI_SPEC
Landscape-first, safe-area aware. Top: timer (skewed black plate, red pulse in final minute) flanked by team pips (blob shapes, respawn countdown). Centre reticle w/ hit-confirm flash, charger charge bar. Right-bottom: INK (fire, team colour, 124 px), SQUID (hold), JUMP, V-FLICK (roller only), ink tank gauge. Left-bottom: floating stick + weapon label. Bottom centre: live turf meter. Right: killfeed. Overlays: damage vignette, enemy-ink pulse, Flow Aura glow, SPLAT!, SPLATTED + respawn timer, GO!, 1 MINUTE, GAME!. Result: VICTORY/DEFEAT, turf bar, turf/splats/deaths, REMATCH / CHANGE WEAPON. Debug panel toggle: `dbg` corner button or `` ` `` / F3. Portrait → rotate prompt.
