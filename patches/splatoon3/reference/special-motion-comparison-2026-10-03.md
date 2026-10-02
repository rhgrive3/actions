# Special motion comparison — 2026-10-03

Scope: the **public** `inkwave-public/` Character/Actor, foundation
`5cdc815c923e2e6e0a9860bcfec6a4734a089657`. This additive patch changes special
presentation only. Ordinary jump and Super Jump poses, main/sub weapon poses,
gameplay phase durations, velocities, world positions, damage, armor, ink,
projectile release and cloud logic are outside its scope.

## Mapping checked before implementation

| Public action | Closest Splatoon 3 comparison | Mapping limit |
| --- | --- | --- |
| `special_leap` / `_poseLeap` | Airborne portion of Triple Splashdown | This trigger belongs to **Tidal Slam**, not Inkjet. There is no native hovering/shooting Inkjet special in the public inventory. |
| `slam` / `_poseSlam` | Triple Splashdown's rise → descent → ground impact | Tidal Slam is a unique somersault and main-weapon strike with one area attack. Nintendo's special creates two additional ink fists and three explosions. No exact gameplay parity is claimed. |
| `storm` / `throw` | Ink Storm | Native name is Ink Tempest. A thrown device creates a moving rain cloud, but aim/activation/deployment, visuals and gameplay parameters are not established as exact original equivalents. |

Sources were freshly retrieved and inspected for this task. No material from
the separate `game/` INKGORGE prototype was treated as public implementation.

## Primary references and observation conditions

* [Nintendo's Chill Season 2023 article](https://www.nintendo.com/jp/topics/article/fa3d0720-7dae-476d-badd-24a738ef8dac), dated 2023-11-29, describes Triple Splashdown's airborne rise, two ink fists and ground explosions. Its [official airborne render](https://assets.topics.apps-jp.nintendo.com/image/2023/11/21051811887902/1280/05.jpg) shows one knee drawn up in front and the other foot trailing lower. This is a **static promotional render**, not a timed gameplay sequence. The article identifies Enperry Splat Dualies and Custom Blaster kits; the underlying main weapon is not shown in this render. The exact executable version, gear abilities and controller input are undisclosed. PTS/frame timestamps: **not applicable to this image**.
* [Nintendo's Splatoon 3 weapon guide](https://www.nintendo.com/jp/topics/article/2e33bbea-9aec-4df5-a5bc-3d062051bce4), freshly fetched, places Ink Storm among specials used to disrupt opponents' formations. It does not publish its joint curves or throw timing.
* [Nintendo's Splatoon 3 Direct announcement](https://www.nintendo.com/us/whatsnew/splatoon-3-makes-a-big-splash-in-new-video-preview-filled-to-the-gills-with-fresh-gameplay-and-new-details/), dated 2022-08-10, confirms Inkjet and Ink Storm return in Splatoon 3. [Nintendo's original Ink Storm description](https://www.nintendo.com/en-za/News/2017/July/Update-from-the-Squid-Research-Lab-feast-your-eyes-on-the-sub-weapons-of-Splatoon-2-1242388.html), dated 2017-07, describes a thrown device producing a moving rain cloud. This older primary source establishes the action family, **not Splatoon 3 animation parity**.

The patch profile's reference is `11.3.0`; that does not identify the version in
older promotional assets. Splatoon 3 on-console frame measurement, startup,
deploy and recovery clips with known gear/input, and exact joint curves remain
**unconfirmed**. The US microsite failed certificate validation in local fetches
and timed out in browsing; unavailable pages were not used as motion evidence.

## Differences, implementation and reproduction

| Difference | Evidence / native implementation | Reproduction and play effect | Correction / status |
| --- | --- | --- | --- |
| A cancelled rise keeps rotating and raising the weapon | `Character._buildPose` calls `_poseLeap` while `T_LEAP < 1.9`, independently of `Actor.specialActive`. Native `_poseLeap` includes a full somersault. | Activate the shooter kit's Tidal Slam, then reset/cancel during rise. A subsequent visible kid frame can retain the old special pose. | Gate `_poseLeap` to the live rise/hang; suppress it during fall and after cancellation. Verified with actual production rig, bones and indexed skinned output. This is an engine lifetime correction, not a measured Nintendo cancellation curve. |
| Hang silhouette has two similarly tucked feet | Native `_poseLeap` hang targets are at 0.30 / 0.20 native units. Nintendo's static airborne render shows a more pronounced lead-knee / trailing-foot relationship. | Activate Tidal Slam and inspect its hang from front or side. The airborne body has a less readable lead/trail silhouette. | Calibrate foot targets to this rig's rest leg span: lead height 0.70, trail height 0.20, lead forward 0.30. Those ratios are **visual calibration**, not Nintendo measurements. Native two-bone leg IK, body, weapon transforms and somersault remain. Verified as actual output, original temporal parity unconfirmed. |
| Old slam pose overrides regained control through the 1.4-second visual window | `_poseSlam` remains callable by its Character timer after `Actor._updateSpecial` has completed. Native impact springs and normal weapon holds are separate from this timer. | Complete the slam, then resume movement/shooting/sub aim or change weapon. An old overhead/downward strike may reappear or mask the new action. | Keep native descent/impact and blend the grounded special overlay out over a calibrated 0.42 seconds; new actions cancel it immediately. The native event captures a fall that begins and lands within one physics tick. Verified native physics/phase/resource invariance. Original recovery duration unknown. |
| Storm cocks an empty hand after deployment | `Actor._startSpecial` calls `throwStorm` immediately; generic `_poseThrow` first cocks, then whips the arm. This is a public-engine sequencing mismatch. | Activate the charger kit's Ink Tempest. The device already exists in the world while the free hand enters windup. | Only Storm starts at the native throw curve's 0.10-second whip/follow-through. Projectile release, trajectory and fuse remain native. Ordinary sub throws retain their existing curve. This 0.10 offset is **engine calibration**, not an original release-frame claim. |
| Incomplete network state lacks local phase facts | Remote proxies can provide `{ id, net: true }`, without `phase` or `t`. | Receive a replicated special. Guessing a local phase could invent rise/fall timing. | Leave native replay presentation for incomplete state; do not synthesize physics phases. Verified fallback. Exact remote/on-console visual parity remains unknown. |

## Installation and boundaries

Import `installSpecialMotion(api, profile)` from
`patches/splatoon3/runtime/special-motion.mjs`. Install after weapon motion and
walk/movement motion, before any final Flow exterior hook. It delegates existing
hooks and uses `Symbol.for` guards on the actual Character and Actor prototypes,
so a second installer module realm cannot wrap them again. The required exact
Character channel exports already exist in the adapter. No profile change or
new source patch is required to install this module.

`specialMotionSnapshot(ch)` reports the presentation phase.
`specialMotionOwnsPose(ch)` is available for integration-owned gait eligibility.
That eligibility replacement must be restricted to snapshot kind `slam`, so
Storm does not acquire a new walking or foot-planting restriction.
Native foot planting and the existing walk installer still test the old visual
`T_LEAP` / `T_SLAM` windows; they may delay planting after this special overlay
ends. The integration handoff identifies those exact sites for the parent.
This lane does not modify other motion hooks or reset their clocks to hide that
limitation.

The module uses a WeakMap and at most one reusable pose buffer per recovering
Character. It allocates no mesh/material/listener resources. Disposal removes
its state before delegating native resource cleanup. Nullable detached previews
delegate the native poses.

## Verification and durable evidence

Command: `node --experimental-vm-modules --test patches/splatoon3/tests/special-motion.test.mjs`.
The test runs the **actual production installer once in one VM realm**, then this
additive installer; it uses the real Actor, Runner, Character, THREE, skinning,
indexed native geometry and two-bone IK. A baseline disables only this module's
visual hooks. It verifies cancellation/restart, grounded recovery, immediate
Storm deployment, ordinary sub throws, reset/death/form/weapon/action/sub
interruptions, hidden cancellation, nullable preview, state cleanup, duplicate
installation across realms, pause/dt=0 and 30/60/120 Hz schedules. A separate
case advances actual native special logic against actual native Physics and a
floor box at each of those time steps, comparing gameplay state every tick.

Persistent evidence root:
`/mnt/workspace/.dev-state/agent-work/evidence/inkwave-motion-detail-20261002/terminal-special/`.
`fresh-source-receipts.json` and `hang-calibration-source-recheck.json` record URL,
retrieval status and byte hashes. `native-posed-output.json` contains before/after
pose channels, posed bones, native IK errors, body/weapon transforms and sampled
indexed skinned vertices. These are **CPU scene-output measurements**, not a GPU
browser render and not a substitute for original on-console comparison.
`native-indexed-projection.svg` / `.png` show six before/after views of the
actual indexed body and weapon triangles after skinning; shader color decoding,
facial deformation and GPU lighting are unverified in that CPU projection.
Exact test receipt and evidence hashes are recorded in `done.json`; build/browser and
candidate integration checks remain parent-owned.

The canonical `reports/inkwave-splatoon3-behavior-2026-10-02.md` is outside this
lane's allowlist. The parent must link/reconcile this record when integrating;
none of the original unknowns above should be marked resolved without evidence.
