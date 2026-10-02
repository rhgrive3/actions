# Dualies roll and planted firing comparison — 2026-10-03

Scope: public `inkwave-public/`, `Character._poseDodge` and dualies-only pose arbitration. Additive installer: `installDualiesMotion(api, profile)` in `runtime/dualies-motion.mjs`. The separate OSS core is unchanged. Install after `installWeaponMotion`, before `installWalkMotion`. Parent owns that shared wiring and the update to `reports/inkwave-splatoon3-behavior-2026-10-02.md`.

## Fresh primary evidence and conditions

[Nintendo Splatoon Base, Fashion](https://www.nintendo.com/jp/character/splatoon/en/fashion/index.html) was fetched again for this correction. Its `js-media-maneuver-3` element identifies movie `0PQkeAEk294`. The page explains two dodge rolls, a short immobile period afterward, and continued rapid fire while stationary. These general statements do not establish exact joint rotations or timing for every dualies variant. Tetra, Gloogga and Douser feature sections are not used to add a new variant to INKWAVE.

The current public [Nintendo movie master playlist](https://media-assets.apps-jp.nintendo.com/media/splatoonbase/0000865_ba6a42607f3ca8f021fb69084e6899b8.m3u8), 1080p playlist and transport-stream segment were fetched afresh. Segment SHA256: `23c839f37e3225726af8bd9b85b96201274a00767c9a380db188b421e1d1ecb9`. Decoded resolution is 1920×1080 at 60 fps; source PTS starts at 2.069833 s. This matches retained bytes, which were verified before reference. A fresh embed-page request returned HTTP 403; the already retained embed was verified and used only to corroborate the association. No restriction was bypassed.

Visible observations from the new decode (zero-based frame `n`, source PTS, relative clip time):

| Frames | PTS / relative time | Observation |
| --- | --- | --- |
| 90–94 | 3.569833–3.636500 / 1.500–1.567 s | Upright firing changes to a low preparation with bent legs. |
| 96–100 | 3.669833–3.736500 / 1.600–1.667 s | Compact body rotates while travelling sideways; ink obscures parts of the limbs. |
| 102–108 | 3.769833–3.869833 / 1.700–1.800 s | Body unfolds into a low landing with both pistols in front. |
| 132–240 | 4.269833–6.069833 / 2.200–4.000 s | Stationary low firing stance continues; recoil is visible alongside repeated shots. |

Weapon appearance is consistent with the Splat Dualies shown in the existing generic profile, but no weapon-selection screen is visible. Original game build, gear/AP, exact input edges and camera parameters are unreported. INKWAVE profile is Ver.11.3.0 with its existing dualies entry, rollTime .2 s, lockTime 32/60 s, lockInterval 4/60 s. This patch reads those existing runner states; it does not establish new Nintendo timings. Clip-relative observation times are not input-to-motion measurements.

Evidence directory: `/mnt/workspace/.dev-state/agent-work/evidence/inkwave-motion-detail-20261002/terminal-dualies/`. `source-receipts.json` records fresh URLs, retrieval time, status, size and SHA256. `official-frame-selections.json` binds decoded frames to PTS and image hashes. `official-dualies-sequence.png` provides visual context.

## Divergence, reproduction and correction

| Divergence in actual public source | Reproduction | Correction and play impact | Verification status |
| --- | --- | --- | --- |
| `_buildPose` calls `_poseDodge` using `tr[T_DODGE]` rather than runner progress; the call site expires at `dodgeDur+.3`. The roll can visually finish while a frozen/network runner is still rolling. | Start a real Runner dodge, stop advancing the runner, continue Character updates. | Uses actual `runner.dodge.t/dur`; invokes the existing native pose if the legacy timer-based call site has expired. Movement, clocks and ink remain owned by gameplay. | Native source reproduction and posed geometry regression; network/browser visual proof remains parent-owned. |
| `tryDodge` stores direction in root space once. `_poseDodge` rotates about that axis even if Actor aim/yaw rotates during the roll. | Start a diagonal world roll, turn root/aim 90° during active dodge. | Re-expresses runner `_dodgeDir` in the current root frame so the world tumble axis still follows physical travel. Both pistols and bones use native transforms. | Native world-axis and actual posed bones/geometry regression. Original exact direction-specific joint curves remain unknown. |
| Native `_poseDodge` continues layering recovery hip/foot offsets until `D+.28`, after `_poseWeapon` supplies the planted crouch and actual shot recoil. | Hold fire through a real roll, inspect first stationary ticks and shots. | Ends the roll overlay when runner dodge ends. Native planted stance and recoil are then drawn without the extra recovery overlay; existing crouch calibration from `weapon-motion.mjs` remains. | Before/after real Actor/Runner/Character traces, native IK and indexed geometry. Exact original landing blend is not verified. |
| `_updateStates` admits lock partly through stale `tr[T_DODGE]`; pose can survive sub/form/special interruptions. | Interrupt a roll with sub aim, squid form, spawn, special, super jump, death/reset or weapon change, then return. | Gates dualies channels by current action; same interrupted runner roll cannot replay. Uses existing blend rates without writing any runner state or native timers. | Focused native-source action/reset regression. Gameplay state is identical with the patch toggled. |
| Native rotation `1-(1-u)^2.4` turns the body before the tuck is established. | Observe push-off/middle-roll geometry beside the official frame sequence. | Calibrated turn begins after normalized progress .12, follows smoothstep, completes by .94. Native tucked foot targets, chest/neck bends, pistol tuck and IK remain in use. | **Visual rig calibration**, not Nintendo-extracted turn fractions, degrees, duration or joint curves. |

## Verification boundaries

`tests/dualies-motion.test.mjs` loads the unmodified production installer once in one VM realm, with actual Three.js, Actor, WeaponRunner, Character, all existing motion installers, native IK and native meshes. It installs only this additive module afterward. World raycasts and projectile collision/paint effects are bounded fixtures; they are not Switch, GPU, network or native physics comparison evidence.

The focused suite checks real roll/plant/shot sequencing, both grip errors and native solver errors, deformed vertices fetched from actual drawn indexed skinned geometry, 90° aim turn, frozen runner, reset/death/form/sub/weapon/spawn/special interruption, nullable preview, zero dt, 30/60/120 Hz render scheduling over the authoritative 60 Hz runner, repeated/chained directions, disposal and other weapons. Gameplay fingerprint comparison includes positions, velocity, yaw, ink, HP, input, native timers and runner fields; visual correction must not alter them. Per-prototype `Symbol.for` guards duplicate installation from another module realm.

Saved before/after evidence is a CPU scene/pose trace, not a browser render. Build, actual browser GPU proof and complete exact-SHA CI belong to the parent. Fixed 60 Hz runner scheduling is not a claim that arbitrary direct variable-dt native springs match each other.

## Still unknown

- Exact original hip/head/ankle trajectories, tuck fraction, tumble angular velocity, direction-specific shoulder choice, landing blend and per-hand recoil envelope.
- Original clip weapon selection, game version, gear, input history and camera projection; exact joint parity cannot be derived from the partially occluded commercial clip.
- Roll on slopes, step edges, enemy ink and airborne gap traversal require original controlled captures and parent browser/physics comparisons. This patch does not change their gameplay.
- Whether recoil timing/alternation in the existing generic runner precisely matches the original variant. No new shot clocks, impulses or variant mapping are invented; recoil is only protected from the obsolete overlay.

The correction addresses actual public-source divergence. It does not close any original-device or unpublished-data unknown in the shared comparison report.
