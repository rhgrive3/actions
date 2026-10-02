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
| Storm throw ownership conflicts with Bomb's final build overlay | `Actor._startSpecial` immediately creates the cloud device. In the complete installer, Bomb already supplies the calibrated 0.10 release follow-through and suppresses the captured Special throw hook. | Activate Ink Tempest, then interrupt it before the 0.62 native throw window ends. The old Bomb overlay can outlive the cancelled special. | Special now owns mapped Storm follow-through once via the exported native curve and suppresses it after cancellation. The initial complete-installer geometry matches the existing calibration; no new original release-frame evidence is claimed. Ordinary sub throws retain the production Bomb path. |
| Incomplete network state lacks local phase facts | Remote proxies can provide `{ id, net: true }`, without `phase` or `t`. | Receive a replicated special. Guessing a local phase could invent rise/fall timing. | Leave native replay presentation for incomplete state; do not synthesize physics phases. Verified fallback. Exact remote/on-console visual parity remains unknown. |

## Installation and boundaries

Import `installSpecialMotion(api, profile)` from
`patches/splatoon3/runtime/special-motion.mjs`. Install after weapon motion and
walk/movement motion, before any final Flow exterior hook. It delegates existing
hooks and uses `Symbol.for` guards on the actual Character and Actor prototypes,
so a second installer module realm cannot wrap them again. The required exact
Character channel/timer and native throw method exports already exist in the adapter. No profile change or
new source patch is required to install this module.

`specialMotionSnapshot(ch)` reports the presentation phase.
`specialMotionOwnsPose(ch)` reports ownership. Use the explicit
`specialMotionAllowsFootPlant(ch, nativeTimerConjunction)` hook for gait
eligibility, preserving disabled/unmapped native fallback and Storm eligibility.
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
The test runs the **actual production installer once in one VM realm** with all integrated modules; it uses the real Actor, Runner, Character, THREE, skinning,
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


## Independent complete-installation review — 2026-10-03

Reviewed the frozen complete production candidate `d846b5b8fadd6cef86e7d02699cf9b3b7356b80e`. All fourteen new
motion installers are present in `runtime/install.mjs`; the tests load that
installer once in one VM realm. Repeated owned installer calls test idempotence
only. Earlier author receipts and measurements above describe their earlier
foundation composition and are historical evidence, not proof of this candidate.

Current primary pages and retained primary bytes were checked again before
correction. `/mnt/workspace/.dev-state/agent-work/evidence/inkwave-motion-detail-20261002/review-air/primary-source-review.json` records
current lookup URLs and verified retained byte hashes. The freshly decoded
`official-jump-reinspect.png` and `official-landing-reinspect.png` retain the
visible aimed hop, rearward bent legs and aimed knee absorption. Their source
frames and PTS are recorded in `primary-frame-reinspection.json`. Clip build,
gear abilities and controller input remain unknown; `11.3.0` is the profile
target, not a proven clip version. No numeric motion calibration changed in
this review. No original hardware, GPU shader/render, browser build or
exact-SHA Actions result is claimed by these focused CPU checks.

Current results, exact source/test hashes, commands and outstanding shared
work are in `/mnt/workspace/.dev-state/agent-work/evidence/inkwave-motion-detail-20261002/review-air/done.json`, `findings.json` and
`integration-handoff.json`. The parent owns the aggregate behavior report,
shared-file integration, complete build and browser/Actions verification.

The prototype's `Symbol.for` registry now exposes the installed state to
snapshot/ownership/eligibility helpers loaded in another realm. A special
interrupted before its first visual frame blocks the actual live token. Brief
root/ancestor hiding and ordinary throw/flick interruption cannot replay it.
The native incoming/outgoing sub-aim blend is retained rather than cleared to
force a grip assertion.

The complete installer exposed a false earlier Storm comparison: Bomb already
starts its final throw at the same 0.10 native curve offset, and the previous
Special `_poseThrow` delegated a suppressed Bomb hook. Storm's initial output
therefore already matched that calibration in the full candidate. The corrected
Special build owns mapped Storm follow-through exactly once using the existing
exported native `CHARACTER_BOMB_POSE.throw`. During that build only, it uses
Bomb's public opt-out to prevent its later overlay, then restores the exact
property descriptor in `finally`. Cancellation suppresses the orphaned Storm
throw; ordinary sub throws still delegate the production Bomb path. Tests compare
actual bones/indexed meshes, native right-hand IK/grip and opt-out descriptors,
not a claimed new visual difference at activation.

An actual low-ceiling Physics fixture found a missed native effect: contact can
occur at `T_SLAM = 1/60`, while `_poseSlam` waits until `st > .02` for its native
impact impulse. Immediate resumed firing cancelled that method before its
once-only hair/spring/impact-clock effect. The module now observes the actual
`Actor._slamImpact` and delegates a pending native effect once onto a reusable
scratch pose when a newer action owns the body. It restores the old strike's
pose channels. Reset/death discard pending work. The 30/60/120 Hz regression
compares the actual native impulse count against the disabled visual baseline.
No native impulse constants or core code were copied or edited.

`specialMotionAllowsFootPlant(ch, nativeTimerConjunction)` is the precise public
hook for the parent: mapped live/recovering Slam returns false; relinquished
mapped presentation and Storm return true. Uninstalled, opted-out, uncontrolled
preview and incomplete network phase return the supplied native conjunction.
This preserves fallback behavior missed by the earlier suggested bare
snapshot/owns-pose replacement. Both native `_updateFeet` and Walk `eligible`
need this hook, preserving every other criterion. They remain unedited and
changes-required in the shared handoff. Required API also includes native `THREE` and the already
exported `CHARACTER_TIMERS.T_THROW/T_SLAM` and native bomb throw method.

A stronger native grip regression also found a mapped shooter Slam hang
support-arm residual of 0.00904065 units. The previous test merely recorded
this error. Fully held special sockets are now projected into the actual
native arm reach spheres before delegating the native two-bone solver. The
limit `(a + b) * 0.9995` comes from native `_solveLimb`, not Nintendo motion
data. Two-handed holds constrain both sockets; dual pistols each use their
own arm sphere. Limb lengths, native error diagnostics, pole/orientation and
weapon attachment semantics are retained. The regression executes all four
actual public Slam kits through hang/strike and checks native arm residuals
and both applicable drawn grips, with real indexed body output.

The review also corrected mislabeled native arm IK assertions in the owned
Landing and Super Jump tests: `_applyPose` uses left slot 0, right slot 1 and
leg slots 2/3. A reported right-hand residual must now use the right slot.

The all-kit grip test samples explicitly stepped native special phases; it
is a rig/contact test, not a measured trajectory. Actual native Physics
trajectories are tested separately against floor and low-ceiling geometry.
Projectile calls outside the motion scope are instrumented in these fixtures;
these checks do not measure airborne device/cloud/fuse gameplay or GPU shader
deformation. Those remain parent/product or separate-lane evidence.
