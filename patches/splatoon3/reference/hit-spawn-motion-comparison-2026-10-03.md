# Hit, splat and spawn motion comparison — 2026-10-03

This additive lane changes only `runtime/hit-spawn-motion.mjs`. The foundation is `5cdc815c923e2e6e0a9860bcfec6a4734a089657`. Public native source is `inkwave-public/`; the separate `game/` prototype is not evidence. The gameplay profile remains 11.3.0; **the Nintendo footage does not disclose its game build or gear**. It is July 2022 promotional material, not a verified current-console capture.

## Fresh Nintendo sources and observations

Fetched again during this lane, with certificate and hostname verification enabled:

- [Nintendo Splatoon 3 gameplay page](https://splatoon.nintendo.com/en/gameplay/) and its embedded [Squid Spawn clip](https://assets.nintendo.com/video/upload/v1657880121/Microsites/splatoon-3/videos/s3_howtoplay_move04.mp4).
- The same page's embedded [splat demonstration](https://assets.nintendo.com/video/upload/v1657880121/Microsites/splatoon-3/videos/s3_howtoplay_move03.mp4).

The page identifies launcher entry and ink-burst disappearance. The opening spawn clip shows players presenting on launchers, then entering with a coating of team ink and continuing into normal weapon use. Selected full-resolution frames 300, 320 and 340 have decoded presentation times **5.000000, 5.333333 and 5.666667 s**. `spawn-detail.png` crops actual player geometry, rather than interpreting the coarse contact sheet. The close view supports a body coating; a separate spherical shield is **not established**. Its relationship to protection is a visual inference. The clip does not establish original armor hit points, cancellation rules, exact entry/exit times, respawn input, or joint angles.

The splat clip shows an opponent vanishing in an ink burst during shooting. It does not provide controlled nonlethal hit amplitudes, attacker bearing, gear, or damage frame values. It cannot calibrate an exact hit recoil or accumulated stagger curve. The weapon class in the clips is visible; exact model identity and gear are not treated as verified.

Evidence directory: `/mnt/workspace/.dev-state/agent-work/evidence/inkwave-motion-detail-20261002/terminal-hit-spawn/`. `source-observations.json` binds fresh URLs, byte counts, SHA-256 hashes and source PTS. Files are retained there. The gameplay server's omitted public DigiCert intermediate was supplied alongside system CAs; TLS verification was never disabled. The fresh page and reduced spawn clip match previously recorded hashes, verified against bytes rather than assumed from an old receipt.

## Differences, reproduction and correction

| Motion / reproduction | Nintendo basis | Public implementation and effect | Result / verification |
| --- | --- | --- | --- |
| Respawn descent; start shooting after contact | Spawn footage enters and resumes normal weapon motion without the public superhero recovery ceremony | `Character._poseSpawn`, `character.js:2164`, sets an upraised left arm in descent; after landing it adds a three-point crouch, ground hand target and flourish. `_buildPose`, `character.js:1706`, applies it after weapon/sub construction for the native 1.4 s branch. The weapon can fire while the support hand visually reaches the floor. | Suppress only this legacy `_poseSpawn` override. Native air pose, posed body, weapon grips and IK remain authoritative. A real-rig regression records the old floor-hand target and actual before/after skinned indexed vertices, hand bones, weapon matrices, muzzle and solver error. No replacement original joint curve is claimed. |
| Protected spawn: watch body through entry and existing timer expiry | Team-ink body coating is visible at the selected PTS; mapping to protection is an inference | `_updateMaterials`, `character.js:3647`, previously supplies only an untimed global white pulse while `s.invuln` is true. It does not identify a freshly spawned body visually. | Add a team-ink blend to the native physical material fragment programs for skin, cloth, hair and squid. Keep their existing vertex deformation, geometry, skeleton, lighting and LOD discard. Bind the blend to native `Actor.invuln`; no gameplay duration, damage rule or armor is introduced. Entry 0.08 s, final 0.12 s fade, blend 0.90 and roughness 0.18 are **rig/shader calibration**. |
| Nonlethal hit from left/front; shooting while hurt | Splat clip has no controlled, isolatable nonlethal hit curves | `Actor.damage`, `actor.js:159`, sends a directional native hit; `Character.trigger`, `character.js:1017`, supplies torso/head/hair/grip impulses and optional stagger. `_buildPose` and native IK draw the result. | Preserve the existing directional response. Regression compares actual full pose, skinned geometry and gameplay for the enabled/disabled layer. Exact original recoil/stagger parity remains **unverified**. |
| Lethal hit, dead interval and return | Nintendo page and splat footage support ink-burst disappearance | `Actor.splat`, `actor.js:186`, creates native burst, hides the real root immediately, starts native respawn logic; dead updates decrement the existing timer. | Preserve native burst and hiding; clear only the coating on hide/reset/death. Existing health, damage, stats, special loss, death timer and respawn path are untouched. Loose equipment/ghost and original camera timing are not claimed to match. |
| Form/sub/weapon/action interruption during spawn protection | Source does not prove those combination curves | Native actions and poses are separate owners. A native special can also set generic invulnerability. | Coating follows native geometry through form changes and weapon/sub use. Special/dance/hide/reset cancels this lane's state. Generic invulnerability keeps the native flash. No form, landing or Flow logic is changed. |

The normal landing one-shot has a native `T_SPAWN > 1.4` exclusion at `character.js:1710`; this lane leaves it intact because landing is owned elsewhere. Removing the ceremony does not establish an original landing curve. The parent integration handoff calls out that gate for the landing owner to consider.

## Native-source validation and limits

Run `node --experimental-vm-modules --test patches/splatoon3/tests/hit-spawn-motion.test.mjs`.

The focused fixture invokes the **unmodified production installer once in one VM realm**, then adds this module and the real Flow motion installer. All existing Character hooks, actual Actor, WeaponRunner, indexed Character meshes, bones and native two-bone IK execute. World collision integration, audio and projectile impacts are stubbed; this is CPU scene/pose evidence, not a browser render or console measurement.

Checks include cross-realm `Symbol.for` idempotence; native before/after floor-hand reproduction; actual drawn skinned vertex deformation; native weapon grip and solver error; base and dither shader composition; nullable preview; reset/death/hide/form/sub/weapon/special interruptions; no new geometry/material resources; native disposal once; generic protection isolation; Flow composition; zero-dt pause; and identical 60 Hz gameplay/pose traces under 30/60/120 Hz render clocks. Full build, active browser, combined-lane and exact-SHA CI validation remain parent-owned.

The runtime creates no meshes, copied rigs, targets or standalone shield proxy. Coating uniforms attach to existing native material programs and reset immediately on cancellation. Per-prototype symbols make repeated installation from another module realm harmless. `s3HitSpawnMotionEnabled = false` on a Character provides the native visual counterfactual; `hitSpawnMotionSnapshot(character)` reports only this lane's visual state.

Remaining unknowns: current-console hit and protection joint/shader curves; actual respawn launcher versus opening animation; original armor cancellation/break sequence; precise original protection/camera/respawn durations; loose equipment and ghost transitions; and hit spring residuals across native hidden death intervals. No unsupported original equality or exact joint curve is asserted. This patch does not change the existing native hurt springs to resolve that last item without an isolated exported spring contract and original evidence.

Parent must add the installer import/call and link this comparison into `reports/inkwave-splatoon3-behavior-2026-10-02.md`; those shared files are outside this lane's allowlist. No adapter export or profile change is required.
