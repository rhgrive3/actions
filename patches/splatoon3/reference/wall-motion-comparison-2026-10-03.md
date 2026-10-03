# Wall and Squid Surge comparison — 2026-10-03

Scope: the public `inkwave-public/` Character/Actor, ordinary inked-wall movement and Squid Surge charge, launch and crest. Foundation `5cdc815c923e2e6e0a9860bcfec6a4734a089657`. Ordinary swimming, Squid Roll, Super Jump and form conversion belong to other modules. This additive module changes presentation only; it does not rewrite movement, collision, ink, HP, defense clocks, input, weapons or the camera-followed world root.

## Fresh official evidence and its limits

On 2026-10-03 the following Nintendo sources were fetched again with TLS verification enabled. The previous receipt's bytes were verified before reuse; the newly fetched HTML and movie hashes match those previous bytes. Receipts and decoded frames are retained in `/mnt/workspace/.dev-state/agent-work/evidence/inkwave-motion-detail-20261002/terminal-wall/`.

- [How to play](https://splatoon.nintendo.com/en/gameplay/) describes charging in ink and blasting upward along a wall. Its `move05` video is explicitly Squid Surge.
- [Original move05 movie](https://assets.nintendo.com/video/upload/v1657880121/Microsites/splatoon-3/videos/s3_howtoplay_move05.mp4): 1920×1080, 60 decoded frames/s, 7 seconds; SHA-256 `3fd3fd8f12f71cbe93fb28c04fc3763c110fbd813473259d7f08fe57e4b0b450`.
- [Squid Research Lab report](https://www.nintendo.com/jp/switch/av5ja/report/index.html) states that Intensify Action shortens the charge required for Surge. It provides no exact joint curves or default charge-frame measurement.
- [Version 11.3.0 support notice](https://support.nintendo.com/jp/switch/software_support/av5ja/1130.html) fixes excessive horizontal movement after specific inputs immediately after a wall departure with Surge. The older demonstration is not proof of 11.3.0 horizontal distance.

Reference conditions: yellow own ink on a vertical wall; weapon and gear/AP inventory not shown; exact game version, controller input, charge start/release ticks and playback-speed editing unknown. The movie timestamp is playback PTS, not measured game-input time. Nintendo's current 11.3.0 notice is the gameplay reference version; the public demonstration is older.

| Decoded frames / PTS | Original observed behavior | What is not established |
| --- | --- | --- |
| 270–278 / 4.500–4.633 s | Attached mantle remains near the same wall point, small tentacle movement | Exact attachment offset, charge compression, joint curve, stick input |
| 280–286 / 4.667–4.767 s | Short bright white readiness glint; it fades while the squid remains attached | Exact threshold/input tick, glint geometry and radiance |
| 290–296 / 4.833–4.933 s | Attached pose continues after the flash | Full-charge hold duration or hold/neutral logic |
| 298–308 / 4.967–5.133 s | Mantle moves upward along the wall, followed by ink/tentacles | World speed, acceleration and partially charged launch behavior |
| 310–312 / 5.167–5.200 s | Wall crest departure into the air | Full axial revolution, rotation axis/count or joint-angle values |
| 314 onward / 5.233 s onward | Kid body becomes visible | Whether the change is automatic or input-driven; conversion belongs to another lane |

The contact sheet `official-surge-sequence.png` samples frames 270–328 at intervals of two. `official-surge-frame-pts.json` preserves FFprobe PTS records and `move05-probe.json` preserves media metadata.

## Differences, reproduction and correction

| Item | INKWAVE source and reproduction | Player-visible impact | Status |
| --- | --- | --- | --- |
| Ordinary wall attachment/rise/sideways movement | Native `src/game/actor.js` `_updateClimb`: own-ink wall ray test; into-wall stick drives rise; tangent drives side movement; native Character `_updateSquid` uses wall basis and velocity-driven wiggle. Approach own ink in squid form, then neutral/low/up/side input | Existing normal wall pose remains owned by native code | Source-audited; exact speed, low-input threshold, neutral drift, lateral distance and contact offset need input-aligned Switch capture |
| Charge hold | Existing patch `runtime/movement.mjs` `beforeActions` sets `climbV` and velocity to zero while increasing the live charge. Hold jump on an attached wall | Existing charge compression is visible, but no readiness cue exists | Qualitative attached-charge sequence supported; profile `.75 s` is existing pinned data, not a new official video measurement |
| Readiness | Native `Character._updateMaterials` has invulnerability/special/weapon glow, but no Surge-ready material or geometry branch. Fully charge while holding jump | Player cannot see the short readiness flash seen in official frames 280–286 | Corrected: one short squid-only emissive cue plus indexed four-point glint at the live full-charge endpoint. Radiance, size and `.14 s` decay are explicitly visual calibration |
| Charge-to-launch shape | Legacy `movement-motion.mjs` switches Y scale from `.78` at full charge to `1.16` in one update, a roughly 49% jump in the action multiplier. Release a fully charged Surge | Abrupt size pop instead of connected preparation/rise motion | Corrected: continuous, charge-weighted release blend and transient stretch returning to native scale. `.14` compression/stretch and `.08 s` blend are calibration, not Nintendo measurements |
| Crest orientation | Legacy wall top uses the same full axial turn as the roll branch. Charge, release, reach `_ledgePop` | An additional full turn has no established support in the freshly inspected crest sequence | Corrected: remove only the legacy wall-top turn, retain actual last wall world orientation and blend onto native airborne orientation. No new rotation-axis/count parity claim |
| Charge loss / reset / death / sub / weapon / other action | Native form changes and existing action objects/triggers own gameplay. Lose wall, die hidden, reset, switch weapon, aim sub or begin another action | A stale cue/shape must not reappear | Wall-owned presentation cancels and restores its offsets/materials; interrupted live action is blocked until replaced. Gameplay clocks/actions remain untouched |
| Partial release and wall departure distance | Existing gameplay launches partial charge with charge-dependent duration/velocity, grants armor only for a full charge, and `_ledgePop` raises vertical velocity | Qualitative launch works; exact distance and 11.3.0 lateral constraints are not proven | Retained, unverified against original measured values; no invented gameplay correction |

## Composition and ownership

`runtime/wall-motion.mjs` exports `installWallMotion(api, profile)`, `wallMotionSnapshot(ch)` and `WALL_MOTION_CALIBRATION`. Install it after `installMovementMotion` and the existing Character hooks. The existing `movement-motion.mjs` export/snapshot is a public dependency used to remove only its legacy wall action scale/turn; no other layer's channels are cleared. Live `movementMotion.actions` or the real Character owner supplies authoritative actions. Preview calls may send existing `squidsurge`/`squidsurge_top` triggers; nullable input is preserved.

The module delegates the real Character update, native squid pose, native trigger, weapon swap and disposal, and the real Actor lifecycle methods. It leaves squid position, native springs, bone pose channels, geometry attributes/indices, weapon transforms, IK and gameplay state untouched. Offsets and per-character squid emissive values are restored before the next native update. `Symbol.for` on the actual Character prototype makes duplicate installers from another module realm harmless. The glint's geometry/material are allocated only when readiness is visible, reused across charges, detached and disposed with the Character. The local player's cue follows the native self-display convention (the inked-wall squid already has a GreaterDepth ghost): its glint remains readable through the inked wall. Submerged remote characters receive no overlay that could reveal them through other geometry. Preview characters can also display the cue. Remote readiness visibility and remote action transport remain unverified. No shared adapter hook is needed.

Parent integration owns installer/import wiring, the shared comparison report `reports/inkwave-splatoon3-behavior-2026-10-02.md`, generated build, browser proof and complete exact-SHA CI. This lane owns only its new runtime module, focused test and this comparison. `integration-handoff.json` identifies the exact call/order and unresolved checks.

## Verification boundaries

Focused command: `node --experimental-vm-modules --test patches/splatoon3/tests/wall-motion.test.mjs`.

The focused test loads the unmodified production installer and adapted public source in one VM realm, with the wall layer and all fourteen detail installers already present. `s3WallMotionEnabled = false` provides the legacy counterfactual without changing the installer. It measures the actual Character, native indexed squid vertices including the native vertex-shader wiggle calculation, native skinned geometry, posed bones, weapon muzzle and native IK. Before/after runs also use real Physics, wall raycasts, collision and ledge resolution: their complete 120-tick gameplay/resources/input/runner/native-timer sequences must be identical, and pre-Surge ordinary-climb vertices must be identical. The production FixedClock produces identical indexed-vertex and action traces for 30/60/120 Hz rendering. Direct action/pose tests additionally vary their actual dt at those rates. Tests record proof when `INKWAVE_WALL_EVIDENCE` points at a verified persistent evidence directory and verify dt0/pause, duplicate module installation, nullable preview, action interruption, local/remote visibility and resource cleanup. `native-before-ready.svg` and `native-after-ready.svg` project the complete nondegenerate native indexed triangles, including native shader wiggle. These are game-engine regressions and explicitly labelled CPU pose visualizations, not real-console or GPU captures. GPU/browser rendering remains parent-owned.

Exact original contact offsets, vertical/lateral speeds, acceleration, turn response, partial-charge rules, defense timing/capacity, creep at neutral stick, crest angles, form-switch control and input-aligned timings remain unknown. A 11.3.0 Switch recording with weapon, gear AP, stage, fixed wall/camera and frame-aligned inputs is required to resolve them.


## Independent integrated review, 2026-10-03

Base `d846b5b8fadd6cef86e7d02699cf9b3b7356b80e` already installs this layer. Its old test's supposed unpatched baseline was therefore patched, and a later FixedClock test depended on that earlier test setting a baseline variable. The corrected suite uses an explicit per-character wall opt-out and computes each fixed-clock comparison independently. Actor, Runner, native Physics, indexed geometry and native IK remain the production implementations.

A new indexed-vertex test exposed a readiness billboard defect: quaternion-only compensation inherited mantle squash, producing half-axes 0.2345362817 and 0.1893262659 in the native full-charge fixture. The glint now cancels the complete parent basis through its local affine matrix and faces the actual render camera. Reproduction is full charge with an oblique camera; all glint triangle vertices must lie in that camera's plane and the two axes retain equal lengths. This repairs projection geometry; glint size/radiance/decay and exact Nintendo shape remain visual calibration/unknown.

The cue also follows the native projectile geometry gate during scene material overrides, so a transparent readiness overlay is excluded from GTAO's opaque normal/depth draw. The CPU test calls the real cue hook with a real THREE scene, two cameras, normal material and indexed geometry, and confirms native squid/skinned vertices and IK remain unchanged. This is a CPU renderer-hook contract, not actual GPU proof. The parent must capture beauty and GTAO output at the final integrated SHA.

Hide, dance and native attack events now restore readiness emission and retire the glint immediately, without waiting for another Character tick. Disposal is terminal, detaches/disposes the owned glint once and cannot reacquire wall state. Existing reset/death/sub/form/weapon/action and local/remote ghost tests remain. Resource ownership is one reused private geometry/material pair; native shared geometry is retained.

Retained Surge source bytes/sheet/PTS were rehashed and freshly inspected after current official source lookup. No undocumented Nintendo timing or 11.3.0 distance was inferred. Review receipts are in `/mnt/workspace/.dev-state/agent-work/evidence/inkwave-motion-detail-20261002/review-squid/`. The shared movement module's cross-realm guard/state defect, the shared report update, GPU rendering and exact-SHA Actions are explicit parent followups.
