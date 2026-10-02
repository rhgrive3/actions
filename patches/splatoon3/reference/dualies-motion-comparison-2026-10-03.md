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

`tests/dualies-motion.test.mjs` loads the unmodified production installer once in one VM realm, with actual Three.js, Actor, WeaponRunner, Character, all existing motion installers, native IK and native meshes. All fourteen new motion installers are activated by the actual production installer; subsequent calls test idempotence only. World raycasts and projectile collision/paint effects are bounded fixtures; they are not Switch, GPU, network or native physics comparison evidence.

The focused suite checks real roll/plant/shot sequencing, both grip errors and native solver errors, deformed vertices fetched from actual drawn indexed skinned geometry, 90° aim turn, frozen runner, reset/death/form/sub/weapon/spawn/special interruption, nullable preview, zero dt, 30/60/120 Hz render scheduling over the authoritative 60 Hz runner, repeated/chained directions, disposal and other weapons. Gameplay fingerprint comparison includes positions, velocity, yaw, ink, HP, input, native timers and runner fields; visual correction must not alter them. Per-prototype `Symbol.for` guards duplicate installation from another module realm.

Saved before/after evidence is a CPU scene/pose trace, not a browser render. Build, actual browser GPU proof and complete exact-SHA CI belong to the parent. Fixed 60 Hz runner scheduling is not a claim that arbitrary direct variable-dt native springs match each other.

## Still unknown

- Exact original hip/head/ankle trajectories, tuck fraction, tumble angular velocity, direction-specific shoulder choice, landing blend and per-hand recoil envelope.
- Original clip weapon selection, game version, gear, input history and camera projection; exact joint parity cannot be derived from the partially occluded commercial clip.
- Roll on slopes, step edges, enemy ink and airborne gap traversal require original controlled captures and parent browser/physics comparisons. This patch does not change their gameplay.
- Whether recoil timing/alternation in the existing generic runner precisely matches the original variant. No new shot clocks, impulses or variant mapping are invented; recoil is only protected from the obsolete overlay.

The correction addresses actual public-source divergence. It does not close any original-device or unpublished-data unknown in the shared comparison report.

## Independent integrated review — 2026-10-03

Reviewed the complete production installer at frozen candidate `d846b5b8fadd6cef86e7d02699cf9b3b7356b80e`, including all fourteen new motion modules. The current Nintendo Fashion page and dualies master playlist were fetched with verified TLS; retained `dualies-3.ts` SHA256 `23c839f37e3225726af8bd9b85b96201274a00767c9a380db188b421e1d1ecb9` was verified before inspecting the selected n90–240 frames / PTS 3.569833–6.069833. No calibration coefficient was changed during this review.

A reproduced lifecycle bug left the roll phase and tumble active on `setVisible(false)`. Hidden characters can stop rendering, so an update-only gate could not retire the pose. The module now clears its own roll/lock channels immediately, retains the interrupted runner token, and excludes hidden roots from admission. Showing the same paused live runner cannot replay that roll; no runner field, input, world transform or gameplay clock is changed. A regression reads actual native output geometry and IK after the return.

The old dance interruption test assumed victory could override a live gameplay dodge. The integrated emotes layer cancels supported presentation before dualies arbitration. The test now proves that production precedence, and separately proves an unsupported future dance still blocks the roll. Fixtures rely on production `install(profile)` for activation; later installer calls verify duplicate installation only. The bomb layer's existing hide cleanup writes its visual `T_THROW` timer to 99; this is explicitly accounted for when comparing hide state, while all actual Actor/Runner fields and all other native timers remain equal. Parent must audit that shared timer policy; this module does not write the timer.

Evidence: `review-body/findings.json`, reproduction logs, source verification, focused native traces and the exact-head test receipt in `/mnt/workspace/.dev-state/agent-work/evidence/inkwave-motion-detail-20261002/`. GPU output, integrated Actions and original-console comparison remain parent-owned and unverified here.

A second reproduced composition bug occurred when the native dodge call site expired while the Runner remained active: the fallback appended `_poseDodge` after the entire native `_buildPose`. That placed it after head look, face, dance and life, changing the actual head pose and delaying native effort to the next frame. The fallback now runs at the native boundary immediately before `_poseLook`. The regression executes two actual rigs with the same authoritative runner progress; only the obsolete Character trigger age differs, with both above the native foot-plant threshold. It compares complete posed output, real mouth uniforms, actual indexed geometry, grips and native IK. No native timer or Nintendo curve is introduced.

The independent final tests also check cross-realm snapshots and direct frame-rate boundaries where relevant. Fixed 60 Hz production scheduling and direct 30/60/120 Hz native integration are recorded as separate CPU evidence; no equality of arbitrary native spring trajectories or Nintendo timings is inferred.

Shared integration still needs a separate parent audit: native `_updateStates` computes its transient lock from `T_DODGE` before the owned wrapper replaces final `lockW`; native aim/stance can already have consumed that value. Native foot `plantOK` and parent `walk.mjs` eligibility also use the old Character timer. The order regression matches their admission conditions to isolate this module's fallback; it does **not** prove complete runner-authoritative arbitration across differently aged Character clocks. Parent owns any adapter/walk correction at these exact boundaries and must verify actual frozen/remote/chained roll output without rewriting clocks. See `review-body/integration-handoff.json`.

## Shared admission follow-up — 2026-10-03

The exact shared gap identified above is reproduced at complete production base `f125ed9`: correcting final `lockW` after native state hooks did not correct the already-consumed aim/stance or native/Walk foot admission. The installed Dualies registry now publishes Runner phase/progress **before** earlier/native `_updateStates` and exposes read-only cross-realm lock/foot decisions. Parent alone must connect the exact lock RHS and two foot conjunctions through `action-admission.mjs`; native damp rates, clocks and the pre-look Dodge pose order stay unchanged. The new dedicated test exercises those exact prospective substitutions over the actual production adapter/installer and labels their production activation as pending parent work.

The owned legacy Special/throw admission gates now read managed presentation ownership: a fresh real dodge can start after Slam or Bomb cancellation while their event ages remain young. Mapped active Storm remains excluded from competing actions while the existing Storm foot policy stays permissive. Disabled/detached/incomplete states preserve native fallback. Hidden ancestors retire the live token; disposal cannot recreate owned state. The prior hide-test mask that ignored `T_THROW` was removed: all timers now compare exactly, while native Actor/Runner/setWeapon reset events are retained.

Tests use actual native Physics; body geometry samples respect effective hierarchy visibility and actual indexed draw ranges. They compare native aim, stance, planted/displayed feet, bones, skinning, both authored pistol grips and solver diagnostics under paused/remote-style and chained rolls, dt0 and direct 30/60/120 Hz partitions. These are CPU engine regressions; actual network packets/GPU/console input timings remain unknown. Fresh official source/PTS/hash review, red/green receipts, exact source connections and remaining adjacent gates are in persistent `review-admission/` evidence and `action-admission-comparison-2026-10-03.md`.
